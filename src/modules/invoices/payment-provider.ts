export type CreatePaymentParams = {
  invoiceId: string;
  /** В основных единицах (рубли / юани) */
  amount: number;
  description: string | null;
  returnUrl?: string;
};

export type CreatedPayment = {
  externalId: string;
  paymentUrl: string;
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
