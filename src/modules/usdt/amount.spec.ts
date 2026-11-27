import { allocatePayAmount, decimalToMicro, fromMicroUsdt, toMicroUsdt } from './amount';

describe('USDT amount', () => {
  it('converts 10.50 to 10500000 micro-USDT', () => {
    expect(toMicroUsdt(10.5)).toBe(10_500_000n);
    expect(decimalToMicro('10.50')).toBe(10_500_000n);
    expect(decimalToMicro('10.500000')).toBe(10_500_000n);
    expect(fromMicroUsdt(10_500_000n)).toBe(10.5);
  });

  it('round-trips every tail of 10.50', () => {
    const base = toMicroUsdt(10.5);
    for (let tail = 0n; tail < 10_000n; tail++) {
      const micro = base + tail;
      expect(toMicroUsdt(fromMicroUsdt(micro))).toBe(micro);
    }
  });

  it('picks the smallest free tail and skips amounts of other orders', () => {
    const base = toMicroUsdt(10.5);
    const used = new Set([base, base + 1n, base + 3n, toMicroUsdt(11)]);
    expect(allocatePayAmount(10.5, used)).toBe(base + 2n);
  });

  it('returns null when every tail of this amount is taken', () => {
    const base = toMicroUsdt(10.5);
    const used = new Set<bigint>();
    for (let tail = 0n; tail < 10_000n; tail++) used.add(base + tail);
    expect(allocatePayAmount(10.5, used)).toBeNull();
  });
});
