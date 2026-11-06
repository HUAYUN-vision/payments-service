export type WechatCallbackPayload = {
  id: string;
  create_time: string;
  resource_type: string;
  event_type: string;
  summary: string;
  resource?: {
    original_type: string;
    algorithm: string;
    ciphertext: string;
    associated_data: string;
    nonce: string;
  };
};

export type WechatTradeState =
  'SUCCESS' | 'REFUND' | 'NOTPAY' | 'CLOSED' | 'REVOKED' | 'USERPAYING' | 'PAYERROR';

export type WechatTransaction = {
  mchid: string;
  appid: string;
  out_trade_no: string;
  transaction_id: string;
  trade_type: string;
  trade_state: WechatTradeState;
  trade_state_desc: string;
  attach?: string;
  success_time?: string;
  amount: { total: number; payer_total?: number; currency: string };
};
