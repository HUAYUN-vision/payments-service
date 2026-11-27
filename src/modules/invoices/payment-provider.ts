import type { UsdtNetwork } from '../database/entities/invoice.entity';

export type CreatePaymentParams = {
  invoiceId: string;
  /** В основных единицах (рубли / юани / USDT) */
  amount: number;
  description: string | null;
  returnUrl?: string;
  /** Обязательна для USDT. */
  network?: UsdtNetwork;
};

export type CreatedPayment = {
  externalId: string;
  paymentUrl: string;
  network?: UsdtNetwork | null;
  /** Сколько отправить. Для USDT может отличаться от суммы заказа. */
  payAmount?: number | null;
  payAddress?: string | null;
  memo?: string | null;
  expiresAt?: Date | null;
};

/** Общий контракт для yookassa / wechat. */
export interface PaymentProvider {
  readonly currency: string;
  isConfigured(): boolean;
  createPayment(params: CreatePaymentParams): Promise<CreatedPayment>;
  /**
   * Сверить платёж у провайдера и обновить инвойс, если он уже оплачен или отменён.
   * Вебхук может не дойти — тогда статус подтягивается отсюда.
   */
  refreshStatus?(externalId: string): Promise<void>;
}
