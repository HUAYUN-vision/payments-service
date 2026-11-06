import {
  type InvoiceEntity,
  InvoiceProvider,
  InvoiceStatus,
  type InvoiceMetadata,
} from '../database/entities/invoice.entity';

/** Публичное представление инвойса — отдаётся в API и в уведомлениях. */
export class InvoiceView {
  id: string;
  /** ID заказа, переданный при создании */
  orderId: string | null;
  provider: InvoiceProvider;
  status: InvoiceStatus;
  /** Сумма в основных единицах валюты (рубли / юани) */
  amount: number;
  /** RUB для yookassa, CNY для wechat */
  currency: string;
  description: string | null;
  /**
   * Ссылка на оплату.
   * yookassa — страница оплаты (redirect), wechat — `weixin://wxpay/...` для QR-кода.
   */
  paymentUrl: string | null;
  metadata: InvoiceMetadata | null;
  createdAt: Date;
  paidAt: Date | null;
  canceledAt: Date | null;
}

export function toInvoiceView(invoice: InvoiceEntity): InvoiceView {
  return {
    id: invoice.id,
    orderId: invoice.orderId,
    provider: invoice.provider,
    status: invoice.status,
    amount: invoice.amount,
    currency: invoice.currency,
    description: invoice.description,
    paymentUrl: invoice.paymentUrl,
    metadata: invoice.metadata,
    createdAt: invoice.createdAt,
    paidAt: invoice.paidAt,
    canceledAt: invoice.canceledAt,
  };
}
