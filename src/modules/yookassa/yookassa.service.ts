import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Not, Repository } from 'typeorm';
import { AppConfigService } from '../../config/app-config.service';
import { InvoiceEntity, InvoiceProvider, InvoiceStatus } from '../database/entities/invoice.entity';
import { CallbacksService } from '../callbacks/callbacks.service';
import type {
  CreatedPayment,
  CreatePaymentParams,
  PaymentProvider,
} from '../invoices/payment-provider';
import type { YookassaPayment, YookassaWebhookPayload } from './types/yookassa.types';

const API_URL = 'https://api.yookassa.ru/v3';

/** Как часто сверять pending-инвойсы, если вебхук не пришёл. */
const RECONCILE_INTERVAL_MS = 15_000;
/** Холд waiting_for_capture у ЮKassa живёт до 7 дней — дольше не опрашиваем. */
const RECONCILE_WINDOW_MS = 7 * 24 * 60 * 60_000;
const RECONCILE_BATCH = 30;

@Injectable()
export class YookassaService implements PaymentProvider {
  readonly currency = 'RUB';
  private readonly logger = new Logger(YookassaService.name);
  private reconciling = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly callbacks: CallbacksService,
    @InjectRepository(InvoiceEntity) private readonly invoices: Repository<InvoiceEntity>,
  ) {}

  isConfigured(): boolean {
    return !!(this.config.get('YOOKASSA_SHOP_ID') && this.config.get('YOOKASSA_SECRET_KEY'));
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatedPayment> {
    const { returnUrl } = params;
    if (!returnUrl) {
      throw new BadRequestException('returnUrl is required for yookassa');
    }

    const res = await this.request('POST', '/payments', {
      // ключ идемпотентности = id инвойса: повтор запроса не создаст второй платёж
      idempotenceKey: params.invoiceId,
      body: {
        amount: { value: params.amount.toFixed(2), currency: this.currency },
        capture: true,
        description: params.description ?? undefined,
        confirmation: { type: 'redirect', return_url: returnUrl },
        metadata: { invoiceId: params.invoiceId },
      },
    });

    const payment = (await res.json()) as YookassaPayment;
    const paymentUrl = payment.confirmation?.confirmation_url;
    if (!payment.id || !paymentUrl) {
      this.logger.error(`Unexpected YooKassa response: ${JSON.stringify(payment)}`);
      throw new BadGatewayException('yookassa: no confirmation_url in response');
    }
    return { externalId: payment.id, paymentUrl };
  }

  async getPayment(paymentId: string): Promise<YookassaPayment> {
    const res = await this.request('GET', `/payments/${encodeURIComponent(paymentId)}`);
    return (await res.json()) as YookassaPayment;
  }

  /**
   * Тело вебхука не подписано, поэтому ему не доверяем:
   * берём только id и запрашиваем актуальный статус платежа у API YooKassa.
   */
  async handleWebhook(payload: YookassaWebhookPayload): Promise<void> {
    const paymentId = payload?.object?.id;
    if (!paymentId || !payload.event?.startsWith('payment.')) return;
    if (!this.isConfigured()) return;

    this.logger.log(`YooKassa webhook ${payload.event} for ${paymentId}`);
    await this.refreshStatus(paymentId);
  }

  /** Подтянуть статус одного платежа и перевести инвойс, если он уже финальный. */
  async refreshStatus(externalId: string): Promise<void> {
    if (!this.isConfigured()) return;
    const payment = await this.getPayment(externalId);
    await this.applyPayment(payment);
  }

  /**
   * Вебхук — не единственный путь: ЮKassa его не повторяет, если мы ответили 200,
   * а статус ещё не успел смениться, и магазин может быть без HTTP-уведомлений.
   * Пока инвойс pending, сами спрашиваем API.
   */
  @Interval('yookassa-reconcile', RECONCILE_INTERVAL_MS)
  async reconcilePending(): Promise<void> {
    if (this.reconciling || !this.isConfigured()) return;
    this.reconciling = true;
    try {
      const since = new Date(Date.now() - RECONCILE_WINDOW_MS);
      const pending = await this.invoices.find({
        where: {
          provider: InvoiceProvider.YOOKASSA,
          status: InvoiceStatus.PENDING,
          externalId: Not(IsNull()),
          createdAt: MoreThan(since),
        },
        order: { createdAt: 'DESC' },
        take: RECONCILE_BATCH,
      });
      for (const invoice of pending) {
        if (!invoice.externalId) continue;
        try {
          await this.refreshStatus(invoice.externalId);
        } catch (error) {
          this.logger.warn(`YooKassa reconcile failed for invoice ${invoice.id}`, error);
        }
      }
    } catch (error) {
      this.logger.error('YooKassa reconcile failed', error);
    } finally {
      this.reconciling = false;
    }
  }

  /**
   * `capture: true` при создании — одностадийный платёж. Если магазин всё же
   * вернул `waiting_for_capture`, списываем сумму сами, иначе инвойс останется pending,
   * а холд протухнет.
   */
  private async applyPayment(payment: YookassaPayment): Promise<void> {
    if (!payment.id) return;

    let current = payment;
    if (current.status === 'waiting_for_capture') {
      this.logger.log(`YooKassa payment ${current.id} is waiting_for_capture, capturing`);
      current = await this.capture(current.id);
    }

    if (current.status === 'succeeded') {
      await this.callbacks.markPaid(InvoiceProvider.YOOKASSA, current.id);
    } else if (current.status === 'canceled') {
      await this.callbacks.markCanceled(InvoiceProvider.YOOKASSA, current.id);
    }
  }

  private async capture(paymentId: string): Promise<YookassaPayment> {
    const res = await this.request('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, {
      // стабильный ключ: повтор сверки не создаст второй capture
      idempotenceKey: `capture-${paymentId}`,
      body: {},
    });
    return (await res.json()) as YookassaPayment;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    opts: { body?: unknown; idempotenceKey?: string } = {},
  ): Promise<Response> {
    const shopId = this.config.get('YOOKASSA_SHOP_ID');
    const secretKey = this.config.get('YOOKASSA_SECRET_KEY');
    if (!shopId || !secretKey) throw new BadRequestException('yookassa is not configured');

    const headers: Record<string, string> = {
      Authorization: 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64'),
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.idempotenceKey) headers['Idempotence-Key'] = opts.idempotenceKey;

    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      this.logger.error(`YooKassa ${method} ${path} network error`, e);
      throw new BadGatewayException('yookassa is unavailable');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`YooKassa ${method} ${path} -> ${res.status}: ${text}`);
      throw new BadGatewayException(`yookassa error: HTTP ${res.status}`);
    }
    return res;
  }
}
