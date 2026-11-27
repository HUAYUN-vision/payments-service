import {
  type InvoiceEntity,
  InvoiceProvider,
  InvoiceStatus,
  UsdtNetwork,
  type InvoiceMetadata,
} from '../database/entities/invoice.entity';

/** Публичное представление инвойса — отдаётся в API и в уведомлениях. */
export class InvoiceView {
  id: string;
  /** ID заказа, переданный при создании */
  orderId: string | null;
  provider: InvoiceProvider;
  status: InvoiceStatus;
  /** Сумма заказа в основных единицах валюты (рубли / юани / USDT) */
  amount: number;
  /** RUB для yookassa, CNY для wechat, USDT для usdt */
  currency: string;
  /** Сеть USDT. У остальных провайдеров null. */
  network: UsdtNetwork | null;
  /** Сколько отправить. У Ethereum и TRON может быть больше amount на хвост. */
  payAmount: number | null;
  /** Адрес приёма USDT. */
  payAddress: string | null;
  /** Комментарий TON, равен id инвойса. У остальных сетей null. */
  memo: string | null;
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
  /** До этого момента USDT-инвойс pending, потом canceled. */
  expiresAt: Date | null;
}

export function toInvoiceView(invoice: InvoiceEntity): InvoiceView {
  return {
    id: invoice.id,
    orderId: invoice.orderId,
    provider: invoice.provider,
    status: invoice.status,
    amount: invoice.amount,
    currency: invoice.currency,
    network: invoice.network ?? null,
    payAmount: invoice.payAmount ?? null,
    payAddress: invoice.payAddress ?? null,
    memo: invoice.memo ?? null,
    description: invoice.description,
    paymentUrl: invoice.paymentUrl,
    metadata: invoice.metadata,
    createdAt: invoice.createdAt,
    paidAt: invoice.paidAt,
    canceledAt: invoice.canceledAt,
    expiresAt: invoice.expiresAt ?? null,
  };
}
