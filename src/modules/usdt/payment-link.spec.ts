import { USDT_ETHEREUM_CONTRACT, USDT_TON_MASTER } from './contracts';
import { ethereumPaymentUrl } from './ethereum';
import { toMicroUsdt } from './amount';
import { tonPaymentUrl } from './ton';
import { tronPaymentUrl } from './tron';

const MICRO = toMicroUsdt(10.5);
const INVOICE_ID = '6f1c8c2a-3b4d-4e5f-8a6b-7c8d9e0f1a2b';

describe('USDT payment links', () => {
  it('builds a TON transfer link with the jetton, micro amount and invoice comment', () => {
    expect(MICRO).toBe(10_500_000n);
    expect(tonPaymentUrl('UQ_wallet', MICRO, INVOICE_ID)).toBe(
      `ton://transfer/UQ_wallet?jetton=${USDT_TON_MASTER}&amount=10500000&text=${INVOICE_ID}`,
    );
  });

  it('builds an EIP-681 Ethereum transfer link', () => {
    expect(ethereumPaymentUrl('0xAbC', MICRO)).toBe(
      `ethereum:${USDT_ETHEREUM_CONTRACT}@1/transfer?address=0xAbC&uint256=10500000`,
    );
  });

  it('uses the TRON address itself as the payment url', () => {
    expect(tronPaymentUrl('TAddress')).toBe('TAddress');
  });
});
