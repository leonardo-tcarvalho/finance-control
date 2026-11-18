import { describe, expect, it } from 'vitest';
import { dueDate, gainLabel, gainOf, gainPctOf, invoiceKey, titleOf } from './calc';
import { Transaction } from './types';

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

const inv = (o: Partial<Transaction>): Transaction => ({ id: 'i', type: 'investment', amountCents: 1000, category: 'Investimento', description: '', date: '2026-01-10', createdAt: 'c', bank: 'Nubank', ...o });

describe('investment yield per row', () => {
  it('is current minus applied, with its percent', () => {
    expect(gainOf(inv({ currentValueCents: 1100 }))).toBe(100);
    expect(gainPctOf(inv({ currentValueCents: 1100 }))).toBe(10);
    expect(gainOf(inv({ currentValueCents: 900 }))).toBe(-100);
    expect(gainPctOf(inv({ currentValueCents: 900 }))).toBe(-10);
  });
  it('is zero without a current value, and an explicit 0 is a total loss', () => {
    expect(gainOf(inv({}))).toBe(0);
    expect(gainOf(inv({ currentValueCents: 0 }))).toBe(-1000);
    expect(gainPctOf(inv({ currentValueCents: 0 }))).toBe(-100);
  });
  it('percent is 0 when nothing was applied; other types have no yield', () => {
    expect(gainPctOf(inv({ amountCents: 0, currentValueCents: 50 }))).toBe(0);
    expect(gainOf(inv({ type: 'expense', currentValueCents: 5000 }))).toBe(0);
  });
  it('labels with the same sign on value and percent, none for zero', () => {
    expect(gainLabel(inv({ currentValueCents: 1100 }))).toMatch(/^\+ .*1,00 \(\+10%\)$/);
    expect(gainLabel(inv({ currentValueCents: 900 }))).toMatch(/^− .*1,00 \(−10%\)$/);
    expect(gainLabel(inv({}))).toMatch(/^[^+−]*0,00 \(0%\)$/);
  });
});

describe('titleOf', () => {
  it('uses the description, else the bank for an investment, else the category', () => {
    expect(titleOf(inv({ description: 'CDB' }))).toBe('CDB');
    expect(titleOf(inv({}))).toBe('Investimento · Nubank');
    expect(titleOf(inv({ type: 'expense', category: 'Lazer' }))).toBe('Lazer');
  });
});
