import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppConfigService } from '../../config/app-config.service';
import {
  CallbackStatus,
  InvoiceEntity,
  InvoiceProvider,
  InvoiceStatus,
} from '../database/entities/invoice.entity';
import { type InvoiceView, toInvoiceView } from '../invoices/invoice-view';

export type CallbackEvent = 'invoice.paid' | 'invoice.canceled';

export type CallbackPayload = {
  event: CallbackEvent;
  invoice: InvoiceView;
};

/** Задержки между повторными попытками доставки (мс). Последняя повторяется. */
const RETRY_DELAYS_MS = [
  30_000,
  60_000,
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
  2 * 3600_000,
  4 * 3600_000,
  8 * 3600_000,
  12 * 3600_000,
  24 * 3600_000,
];

/** На сколько «бронируем» инвойс за текущим отправителем, чтобы cron не отправил его параллельно. */
const LEASE_MS = 2 * 60_000;
const BATCH_SIZE = 20;

export const SIGNATURE_HEADER = 'x-payments-signature';
export const TIMESTAMP_HEADER = 'x-payments-timestamp';

/** HMAC-SHA256(key, `${timestamp}.${body}`) в hex */
export function signCallback(key: string, timestamp: string, body: string): string {
  return createHmac('sha256', key).update(`${timestamp}.${body}`).digest('hex');
}

@Injectable()
export class CallbacksService {
  private readonly logger = new Logger(CallbacksService.name);

  constructor(
    @InjectRepository(InvoiceEntity) private readonly invoices: Repository<InvoiceEntity>,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Переводит pending-инвойс в paid и отправляет уведомление.
   * Идемпотентно: повторные вебхуки провайдера ничего не меняют.
   */
  async markPaid(provider: InvoiceProvider, externalId: string): Promise<boolean> {
    return this.transition(provider, externalId, InvoiceStatus.PAID);
  }

  async markCanceled(provider: InvoiceProvider, externalId: string): Promise<boolean> {
    return this.transition(provider, externalId, InvoiceStatus.CANCELED);
  }

  /** Периодически дошлёт уведомления, которые не удалось доставить сразу. */
  @Interval('callbacks-retry', 30_000)
  async processDue(): Promise<void> {
    try {
      // Атомарно «забираем» пачку: сдвигаем next_callback_at на LEASE_MS,
      // SKIP LOCKED — чтобы несколько инстансов не взяли одни и те же строки.
      const rows: { id: string }[] = await this.invoices.query(
        `WITH claimed AS (
           UPDATE invoices
              SET next_callback_at = now() + make_interval(secs => $1)
            WHERE id IN (
              SELECT id FROM invoices
               WHERE callback_status = $2 AND next_callback_at <= now()
               ORDER BY next_callback_at
               LIMIT $3
               FOR UPDATE SKIP LOCKED)
          RETURNING id)
         SELECT id FROM claimed`,
        [LEASE_MS / 1000, CallbackStatus.PENDING, BATCH_SIZE],
      );
      if (!rows.length) return;

      const due = await this.invoices.findBy({ id: In(rows.map((r) => r.id)) });
      await Promise.all(due.map((invoice) => this.deliver(invoice)));
    } catch (error) {
      this.logger.error('Failed to process pending callbacks', error);
    }
  }

  async deliver(invoice: InvoiceEntity): Promise<boolean> {
    const event: CallbackEvent =
      invoice.status === InvoiceStatus.PAID ? 'invoice.paid' : 'invoice.canceled';
    const attempt = invoice.callbackAttempts + 1;
    const key = this.config.get('API_KEYS').get(invoice.project);

    let error: string | undefined;
    if (!key) {
      error = `project "${invoice.project}" is not configured in API_KEYS`;
    } else {
      error = await this.send(invoice.callbackUrl, key, {
        event,
        invoice: toInvoiceView(invoice),
      });
    }

    if (!error) {
      await this.invoices.update(invoice.id, {
        callbackStatus: CallbackStatus.DELIVERED,
        callbackAttempts: attempt,
        callbackDeliveredAt: new Date(),
        nextCallbackAt: null,
        callbackLastError: null,
      });
      this.logger.log(`Callback ${event} delivered for invoice ${invoice.id}`);
      return true;
    }

    const exhausted = !key || attempt >= this.config.get('CALLBACK_MAX_ATTEMPTS');
    const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
    await this.invoices.update(invoice.id, {
      callbackStatus: exhausted ? CallbackStatus.FAILED : CallbackStatus.PENDING,
      callbackAttempts: attempt,
      nextCallbackAt: exhausted ? null : new Date(Date.now() + delay),
      callbackLastError: error.slice(0, 1000),
    });
    this.logger.warn(
      `Callback ${event} for invoice ${invoice.id} failed (attempt ${attempt}${exhausted ? ', giving up' : ''}): ${error}`,
    );
    return false;
  }

  private async transition(
    provider: InvoiceProvider,
    externalId: string,
    status: InvoiceStatus.PAID | InvoiceStatus.CANCELED,
  ): Promise<boolean> {
    const now = new Date();
    const result = await this.invoices.update(
      { provider, externalId, status: InvoiceStatus.PENDING },
      {
        status,
        ...(status === InvoiceStatus.PAID ? { paidAt: now } : { canceledAt: now }),
        callbackStatus: CallbackStatus.PENDING,
        callbackAttempts: 0,
        // лиз на немедленную отправку; если процесс упадёт — cron подхватит
        nextCallbackAt: new Date(now.getTime() + LEASE_MS),
      },
    );
    if (!result.affected) return false;

    const invoice = await this.invoices.findOneByOrFail({ provider, externalId });
    this.logger.log(`Invoice ${invoice.id} (${provider}) -> ${status}`);
    // не блокируем ответ провайдеру
    void this.deliver(invoice).catch((e: unknown) =>
      this.logger.error(`Callback delivery crashed for invoice ${invoice.id}`, e),
    );
    return true;
  }

  /** @returns текст ошибки или undefined при успехе */
  private async send(
    url: string,
    key: string,
    payload: CallbackPayload,
  ): Promise<string | undefined> {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    try {
      const res = await fetch(url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(this.config.get('CALLBACK_TIMEOUT_MS')),
        headers: {
          'content-type': 'application/json',
          'user-agent': 'payments-service',
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signCallback(key, timestamp, body),
        },
        body,
      });
      if (res.ok) return undefined;
      const text = await res.text().catch(() => '');
      return `HTTP ${res.status} ${text.slice(0, 300)}`.trim();
    } catch (e) {
      return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
  }
}
