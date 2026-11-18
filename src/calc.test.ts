import { describe, expect, it } from 'vitest';
import { dueDate, invoiceKey } from './calc';

describe('invoiceKey', () => {
  it('closing day 31 in February means the last day of the month', () => {
    expect(invoiceKey({ closingDay: 31 }, '2026-02-28')).toBe('2026-02');
  });
  it('closing day past the end of the month keeps the purchase in that month', () => {
    expect(invoiceKey({ closingDay: 31 }, '2026-04-30')).toBe('2026-04');
    expect(invoiceKey({ closingDay: 30 }, '2026-02-28')).toBe('2026-02');
  });
  it('a purchase after the closing day goes to the next month', () => {
    expect(invoiceKey({ closingDay: 10 }, '2026-11-11')).toBe('2026-12');
    expect(invoiceKey({ closingDay: 10 }, '2026-11-10')).toBe('2026-11');
  });
});

describe('dueDate', () => {
  it('a due day <= closing day falls in the following month', () => {
    expect(dueDate({ closingDay: 20, dueDay: 5 }, '2026-11')).toBe('2026-12-05');
    expect(dueDate({ closingDay: 5, dueDay: 20 }, '2026-11')).toBe('2026-11-20');
  });
  it('a due day past the end of the month is clamped', () => {
    expect(dueDate({ dueDay: 31 }, '2026-02')).toBe('2026-02-28');
  });
});
