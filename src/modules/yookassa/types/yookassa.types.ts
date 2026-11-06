export type YookassaPaymentStatus = 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';

export type YookassaPayment = {
  id: string;
  status: YookassaPaymentStatus;
  paid: boolean;
  amount: { value: string; currency: string };
  confirmation?: { type?: string; confirmation_url?: string };
  metadata?: Record<string, string>;
};

export type YookassaWebhookPayload = {
  type?: 'notification';
  event?: string;
  object?: { id?: string; status?: string };
};
