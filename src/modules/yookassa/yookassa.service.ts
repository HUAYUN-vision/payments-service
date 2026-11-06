import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { InvoiceProvider } from '../database/entities/invoice.entity';
import { CallbacksService } from '../callbacks/callbacks.service';
import type {
  CreatedPayment,
  CreatePaymentParams,
  PaymentProvider,
} from '../invoices/payment-provider';
import type { YookassaPayment, YookassaWebhookPayload } from './types/yookassa.types';

const API_URL = 'https://api.yookassa.ru/v3';

@Injectable()
export class YookassaService implements PaymentProvider {
  readonly currency = 'RUB';
  private readonly logger = new Logger(YookassaService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly callbacks: CallbacksService,
  ) {}

  isConfigured(): boolean {
    return !!(this.config.get('YOOKASSA_SHOP_ID') && this.config.get('YOOKASSA_SECRET_KEY'));
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatedPayment> {
    const returnUrl = params.returnUrl ?? this.config.get('YOOKASSA_RETURN_URL');
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

    const payment = await this.getPayment(paymentId);

    if (payment.status === 'succeeded') {
      await this.callbacks.markPaid(InvoiceProvider.YOOKASSA, payment.id);
    } else if (payment.status === 'canceled') {
      await this.callbacks.markCanceled(InvoiceProvider.YOOKASSA, payment.id);
    }
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
