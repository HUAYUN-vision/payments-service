/**
 * У TronLink нет устойчивой ссылки, которая подставляет и токен, и сумму.
 * paymentUrl — адрес T…. Сумма и сеть остаются в ответе API.
 */
export function tronPaymentUrl(address: string): string {
  return address;
}
