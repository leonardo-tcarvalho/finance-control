import { describe, expect, it } from 'vitest';
import { MonthPoint, annualTotals, availableYears, spendByOrigin, spendOf, topExpenses, yearRows } from './calc';
import { Card, Transaction } from './types';

let n = 0;
const tx = (o: Partial<Transaction>): Transaction => ({ id: `t${n++}`, type: 'expense', amountCents: 100, category: 'x', description: 'x', date: '2026-01-10', createdAt: 'c', ...o });
const mp = (month: string, expense: number, income = 0): MonthPoint => ({ month, income, expense });

describe('yearRows / availableYears', () => {
  const cards: Card[] = [{ id: 'c1', name: 'Card', closingDay: 10 }];
  // bought on Dec 20 after the closing day: the invoice is January of the next year
  const dec = tx({ id: 'dec', date: '2026-12-20', cardId: 'c1' });
  const plain = tx({ id: 'plain', date: '2026-12-20' });
  it('a card purchase after the closing day in December counts in the next year', () => {
    expect(yearRows([dec, plain], cards, '2026').map((t) => t.id)).toEqual(['plain']);
    expect(yearRows([dec, plain], cards, '2027').map((t) => t.id)).toEqual(['dec']);
  });
  it('lists years newest first, by reference month', () => {
    expect(availableYears([dec, plain, tx({ date: '2024-03-01' })], cards)).toEqual(['2027', '2026', '2024']);
  });
  it('a year without entries has no rows', () => {
    expect(yearRows([plain], cards, '2025')).toEqual([]);
    expect(availableYears([], cards)).toEqual([]);
  });
});

describe('annualTotals', () => {
  it('averages only months with spending, rounded to cents', () => {
    const months = [mp('2026-01', 1000), mp('2026-02', 0), mp('2026-03', 1001)];
    expect(annualTotals([], months).monthlyAverage).toBe(1001); // 2001 / 2 = 1000.5 -> 1001
  });
  it('totals income, spending and balance', () => {
    const r = annualTotals([tx({ amountCents: 300 }), tx({ type: 'income', amountCents: 1000 })], []);
    expect(r).toMatchObject({ income: 1000, expense: 300, balance: 700 });
  });
  it('picks highest and lowest spending month, the earliest on a tie', () => {
    const months = [mp('2026-01', 500), mp('2026-02', 900), mp('2026-03', 500), mp('2026-04', 900), mp('2026-05', 0, 7000)];
    const r = annualTotals([], months);
    expect(r.topMonth?.month).toBe('2026-02');
    expect(r.lowMonth?.month).toBe('2026-01');
  });
  it('without spending there is no extreme month and the average is 0', () => {
    const r = annualTotals([], [mp('2026-01', 0, 500), mp('2026-02', 0)]);
    expect(r).toMatchObject({ monthlyAverage: 0, topMonth: null, lowMonth: null });
  });
});

describe('topExpenses', () => {
  const rows = [
    tx({ id: 'a', amountCents: 500, date: '2026-01-01' }),
    tx({ id: 'b', amountCents: 900, date: '2026-02-01' }),
    tx({ id: 'c', amountCents: 500, date: '2026-03-01' }),
    tx({ id: 'inc', type: 'income', amountCents: 99999 }),
  ];
  it('ignores income, biggest first, ties by most recent date', () => {
    expect(topExpenses(rows).map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });
  it('respects n', () => {
    expect(topExpenses(rows, 2).map((t) => t.id)).toEqual(['b', 'c']);
  });
});

describe('spendByOrigin', () => {
  it('splits spending by origin and adds up to the total', () => {
    const rows = [
      tx({ amountCents: 100, installment: { n: 1, of: 2, groupId: 'g' } }),
      tx({ amountCents: 200, recurring: { n: 1, of: 2, groupId: 'h' } }),
      tx({ amountCents: 400 }),
      tx({ type: 'income', amountCents: 5000 }),
    ];
    const r = spendByOrigin(rows);
    expect(r).toEqual({ installment: 100, recurring: 200, single: 400 });
    expect(r.installment + r.recurring + r.single).toBe(rows.reduce((s, t) => s + spendOf(t), 0));
  });
});
