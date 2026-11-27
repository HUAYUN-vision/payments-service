import { USDT_TON_MASTER } from './contracts';

/** ton:// с jetton, суммой в micro-USDT и комментарием = id инвойса. */
export function tonPaymentUrl(address: string, micro: bigint, invoiceId: string): string {
  return `ton://transfer/${address}?jetton=${USDT_TON_MASTER}&amount=${micro.toString()}&text=${invoiceId}`;
}
