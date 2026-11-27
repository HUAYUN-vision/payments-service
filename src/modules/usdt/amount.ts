const MICRO = 1_000_000n;
/** Хвост 0.000000 … 0.009999, чтобы заказы на одну сумму не совпали. */
export const PAY_AMOUNT_TAIL_COUNT = 10_000;
const DECIMAL = /^(\d+)(?:\.(\d{1,6}))?$/;

/** Строка numeric из Postgres или toFixed(6) → минимальные единицы USDT. */
export function decimalToMicro(value: string): bigint {
  const match = DECIMAL.exec(value);
  if (!match) throw new Error(`invalid USDT amount "${value}"`);
  const frac = (match[2] ?? '').padEnd(6, '0');
  return BigInt(match[1]) * MICRO + BigInt(frac);
}

/** Сумма заказа (до 2 знаков) → минимальные единицы, без хвоста. */
export function toMicroUsdt(amount: number): bigint {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('invalid USDT amount');
  return decimalToMicro(amount.toFixed(6));
}

export function fromMicroUsdt(units: bigint): number {
  const whole = units / MICRO;
  const frac = (units % MICRO).toString().padStart(6, '0');
  return Number(`${whole}.${frac}`);
}

/**
 * Наименьшая свободная сумма: amount + хвост.
 * `used` — payAmount других pending-инвойсов этой сети, в минимальных единицах.
 * null — свободных хвостов нет.
 */
export function allocatePayAmount(amount: number, used: ReadonlySet<bigint>): bigint | null {
  const base = toMicroUsdt(amount);
  for (let tail = 0n; tail < BigInt(PAY_AMOUNT_TAIL_COUNT); tail++) {
    const candidate = base + tail;
    if (!used.has(candidate)) return candidate;
  }
  return null;
}
