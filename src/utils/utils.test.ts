import { describe, expect, it } from 'vitest';
import { MAX_MONEY_CENTS, addMonths, parseMoneyToCents, signedPct } from './index';

describe('parseMoneyToCents', () => {
  it('reads Brazilian and thousands formats', () => {
    expect(parseMoneyToCents('1.234,56')).toBe(123456);
    expect(parseMoneyToCents('12.500')).toBe(1250000);
    expect(parseMoneyToCents('25,90')).toBe(2590);
  });
  it('rejects negatives and extra decimals', () => {
    expect(parseMoneyToCents('-50')).toBeNaN();
    expect(parseMoneyToCents('1,500')).toBeNaN();
  });
});

describe('parseMoneyToCents limit', () => {
  it('accepts up to the cap and rejects beyond it', () => {
    expect(parseMoneyToCents('100.000.000.000,00')).toBe(MAX_MONEY_CENTS);
    expect(Number.isNaN(parseMoneyToCents('100.000.000.000,01'))).toBe(true);
    expect(Number.isNaN(parseMoneyToCents('99999999999999999999'))).toBe(true);
  });
});

describe('addMonths', () => {
  it('clamps to the last day of the month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
  });
});

describe('signedPct', () => {
  it('uses the typographic minus for negatives', () => {
    expect(signedPct(25)).toBe('25%');
    expect(signedPct(0)).toBe('0%');
    expect(signedPct(-50)).toBe('−50%');
  });
});
