import { USDT_ETHEREUM_CONTRACT } from './contracts';

/** EIP-681: перевод USDT в сети Ethereum (chain id 1). */
export function ethereumPaymentUrl(address: string, micro: bigint): string {
  return `ethereum:${USDT_ETHEREUM_CONTRACT}@1/transfer?address=${address}&uint256=${micro.toString()}`;
}
