import { fineness } from './fineness';

describe('fineness()', () => {
  it('parses karat labels', () => {
    expect(fineness('24K')).toBe(1);
    expect(fineness('22K')).toBeCloseTo(22 / 24, 6);
    expect(fineness('18k')).toBeCloseTo(0.75, 6);
    expect(fineness(' 14 KT ')).toBeCloseTo(14 / 24, 6);
  });

  it('parses millesimal / percentage labels', () => {
    expect(fineness('916')).toBeCloseTo(0.916, 6);
    expect(fineness('999')).toBeCloseTo(0.999, 6);
    expect(fineness('750')).toBeCloseTo(0.75, 6);
    expect(fineness('92.5')).toBeCloseTo(0.925, 6);
    expect(fineness('0.995')).toBeCloseTo(0.995, 6);
  });

  it('returns 0 for unknown or invalid purity so gold is never over-counted', () => {
    expect(fineness('')).toBe(0);
    expect(fineness(null)).toBe(0);
    expect(fineness(undefined)).toBe(0);
    expect(fineness('abc')).toBe(0);
    expect(fineness('30K')).toBe(0);
    expect(fineness('5000')).toBe(0);
  });
});
