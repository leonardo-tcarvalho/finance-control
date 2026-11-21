import { describe, expect, it } from 'vitest';
import { MonthPoint, annualTotals, emergencyReserveMonths, reserveLevel, savingsRate, portfolioByBank, portfolioTotals, splitPercents, totalsOf, availableYears, spendByOrigin, spendOf, topExpenses, yearRows } from './calc';
import { Card, Transaction } from './domain/types';

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
  it('does not reorder the input list', () => {
    const own = [tx({ amountCents: 100 }), tx({ amountCents: 900 }), tx({ type: 'income', amountCents: 5000 }), tx({ amountCents: 500 })]; // not in value order, and not shared with the other tests
    const before = [...own];
    topExpenses(own);
    expect(own).toEqual(before);
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

describe('splitPercents', () => {
  it('splits 1/1/1 as 34/33/33', () => {
    expect(splitPercents([1, 1, 1])).toEqual([34, 33, 33]);
  });
  it('always adds up to 100', () => {
    const p = splitPercents([100, 100, 400]);
    expect(p).toEqual([17, 17, 66]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(100);
    expect(splitPercents([1, 6, 1, 6, 4].map((x) => x * 7)).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('is all zeros when nothing was spent', () => {
    expect(splitPercents([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('totalsOf with investments', () => {
  it('keeps investments out of income and expense, sums them in invested and takes them from the balance', () => {
    const r = totalsOf([tx({ type: 'income', amountCents: 1000 }), tx({ amountCents: 300 }), tx({ type: 'investment', amountCents: 200, bank: 'Nubank' })]);
    expect(r).toEqual({ income: 1000, expense: 300, invested: 200, balance: 500 });
  });
});

describe('portfolio', () => {
  const inv = (bank: string, amountCents: number, currentValueCents?: number) => tx({ type: 'investment', bank, amountCents, currentValueCents });
  const list = [inv('Nubank', 1000, 1100), inv('Nubank', 500), inv('Inter', 4000, 3600), tx({ amountCents: 9999 })];
  it('groups by bank, counting the applied amount when no current value was informed, biggest first', () => {
    expect(portfolioByBank(list)).toEqual([
      { bank: 'Inter', applied: 4000, current: 3600, gain: -400, gainPct: -10 },
      { bank: 'Nubank', applied: 1500, current: 1600, gain: 100, gainPct: 7 },
    ]);
  });
  it('totals every investment and ignores other types', () => {
    expect(portfolioTotals(list)).toMatchObject({ applied: 5500, current: 5200, gain: -300, gainPct: -5 });
  });
  it('groups a bank ignoring case and surrounding spaces, showing the first spelling', () => {
    const r = portfolioByBank([inv('Nubank', 100), inv('nubank', 200), inv(' NUBANK ', 300)]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ bank: 'Nubank', applied: 600, current: 600 });
    expect(portfolioByBank([inv(' nubank', 100), inv('Nubank', 100)])[0].bank).toBe('nubank');
  });
  it('banks with the same current value are ordered by name', () => {
    expect(portfolioByBank([inv('Rico', 500), inv('Inter', 500), inv('C6 Bank', 500)]).map((h) => h.bank)).toEqual(['C6 Bank', 'Inter', 'Rico']);
  });
  it('a current value of zero is respected, and an empty portfolio is all zeros', () => {
    expect(portfolioTotals([inv('Nubank', 1000, 0)])).toMatchObject({ current: 0, gain: -1000, gainPct: -100 });
    expect(portfolioByBank([])).toEqual([]);
    expect(portfolioTotals([])).toMatchObject({ applied: 0, current: 0, gain: 0, gainPct: 0 });
  });
});

describe('savingsRate', () => {
  it('is the rounded percent of the income left over', () => {
    expect(savingsRate(1000, 750)).toBe(25);
    expect(savingsRate(3, 1)).toBe(67);
  });
  it('is negative when spending passed the income, and null without income', () => {
    expect(savingsRate(1000, 1500)).toBe(-50);
    expect(savingsRate(0, 500)).toBeNull();
  });
});

describe('emergencyReserveMonths', () => {
  const spend = (month: string, amountCents: number) => tx({ amountCents, date: `${month}-10` });
  const invest = (amountCents: number, currentValueCents?: number) => tx({ type: 'investment', bank: 'Nubank', amountCents, currentValueCents, date: '2026-01-05' });
  it('divides the portfolio value by the average spending of the last 6 months', () => {
    const list = [spend('2026-05', 1000), spend('2026-06', 3000), invest(5000, 9000)];
    expect(emergencyReserveMonths(list, [], '2026-06')).toBe(4.5); // 9000 / 2000
  });
  it('counts the applied amount when no current value was informed', () => {
    expect(emergencyReserveMonths([spend('2026-06', 1000), invest(2500)], [], '2026-06')).toBe(2.5);
  });
  it('ignores months with no spending and months outside the window', () => {
    const list = [spend('2025-12', 99999), spend('2026-03', 1000), invest(1000)];
    expect(emergencyReserveMonths(list, [], '2026-06')).toBe(1);
  });
  it('is 0 with spending but no investments, and null without spending', () => {
    expect(emergencyReserveMonths([spend('2026-06', 1000)], [], '2026-06')).toBe(0);
    expect(emergencyReserveMonths([invest(1000)], [], '2026-06')).toBeNull();
    expect(emergencyReserveMonths([], [], '2026-06')).toBeNull();
  });
  it('rounds to one decimal', () => {
    expect(emergencyReserveMonths([spend('2026-06', 3000), invest(1000)], [], '2026-06')).toBe(0.3); // 0.333
    expect(emergencyReserveMonths([spend('2026-06', 3000), invest(2000)], [], '2026-06')).toBe(0.7); // 0.667
  });
});

describe('reserveLevel', () => {
  it('changes level exactly at 3 and 6 months', () => {
    expect(reserveLevel(0).level).toBe('baixa');
    expect(reserveLevel(2.9).level).toBe('baixa');
    expect(reserveLevel(3).level).toBe('boa');
    expect(reserveLevel(5.9).level).toBe('boa');
    expect(reserveLevel(6).level).toBe('ótima');
    expect(reserveLevel(24).level).toBe('ótima');
  });
  it('has a short text for each level', () => {
    expect(new Set(['baixa', 'boa', 'ótima'].map((_, i) => reserveLevel([1, 4, 8][i]).text)).size).toBe(3);
  });
});
