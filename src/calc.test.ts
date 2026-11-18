import { describe, expect, it } from 'vitest';
import { dueDate, filterRows, goalMessage, goalProgress, installmentCommitment, gainLabel, investedShare, gainOf, gainPctOf, invoiceKey, titleOf } from './calc';
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
  it('rounds the percent to the nearest whole number', () => {
    expect(gainPctOf(inv({ currentValueCents: 1067 }))).toBe(7);
    expect(gainPctOf(inv({ currentValueCents: 933 }))).toBe(-7);
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
    expect(gainLabel(inv({ currentValueCents: 1001 }))).not.toContain('%'); // +0,1% rounds to 0
    expect(gainLabel(inv({ currentValueCents: 999 }))).toMatch(/^− /);
    expect(gainLabel(inv({ currentValueCents: 999 }))).not.toContain('%');
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

describe('filterRows with investments', () => {
  const rows = [inv({ id: 'a', bank: 'Itaú' }), inv({ id: 'b', bank: 'Nubank' }), inv({ id: 'c', type: 'expense', bank: undefined, description: 'mercado' })];
  const find = (query: string) => filterRows(rows, { query }, () => '', () => '').map((r) => r.id);
  it('finds an investment by its bank, ignoring case and accents', () => {
    expect(find('itau')).toEqual(['a']);
    expect(find('NUBANK')).toEqual(['b']);
  });
  it('does not match a bank on rows that have none', () => {
    expect(find('mercado')).toEqual(['c']);
  });
});

describe('investedShare', () => {
  it('is the rounded percent of the income that was invested', () => {
    expect(investedShare(250, 1000)).toBe(25);
    expect(investedShare(1, 3)).toBe(33);
    expect(investedShare(2, 3)).toBe(67);
    expect(investedShare(2000, 1000)).toBe(200);
  });
  it('is null without income', () => {
    expect(investedShare(500, 0)).toBeNull();
  });
});

describe('goalProgress', () => {
  const lvl = (spent: number) => goalProgress(spent, 10000);
  it('is null without a goal', () => {
    expect(goalProgress(5000)).toBeNull();
    expect(goalProgress(5000, 0)).toBeNull();
    expect(goalProgress(5000, -1)).toBeNull();
  });
  it('levels change exactly at 80% and above 100%', () => {
    expect(lvl(7900)).toEqual({ pct: 79, level: 'abaixo' });
    expect(lvl(8000)).toEqual({ pct: 80, level: 'perto' });
    expect(lvl(10000)).toEqual({ pct: 100, level: 'perto' });
    expect(lvl(10100)).toEqual({ pct: 101, level: 'passou' });
  });
  it('passing the goal by one cent is passou, even though the percent still reads 100', () => {
    expect(goalProgress(10001, 10000)).toEqual({ pct: 100, level: 'passou' });
    expect(goalProgress(10000, 10000)?.level).toBe('perto');
  });
  it('rounds to the nearest percent, not down', () => {
    expect(goalProgress(2, 3)?.pct).toBe(67);
    expect(goalProgress(7950, 10000)).toEqual({ pct: 80, level: 'perto' });
  });
  it('zero spending is 0% below', () => {
    expect(lvl(0)).toEqual({ pct: 0, level: 'abaixo' });
  });
});

describe('installmentCommitment', () => {
  const mk = (type: 'income' | 'expense', amountCents: number, extra: Partial<Transaction> = {}): Transaction => ({ id: Math.random().toString(), type, amountCents, category: 'x', description: '', date: '2026-11-10', createdAt: 'c', ...extra });
  const parc = (cents: number) => mk('expense', cents, { installment: { n: 1, of: 3, groupId: 'g' } });
  it('is null without income, including zero income', () => {
    expect(installmentCommitment([parc(1000)])).toBeNull();
    expect(installmentCommitment([mk('income', 0), parc(1000)])).toBeNull();
  });
  it('counts only installment expenses, paid or pending', () => {
    const rows = [mk('income', 10000), parc(1000), { ...parc(500), paid: false }, mk('expense', 3000), mk('expense', 700, { recurring: { n: 1, of: 2, groupId: 'r' } })];
    expect(installmentCommitment(rows)).toMatchObject({ installments: 1500, income: 10000, pct: 15 });
  });
  it('zero installments is 0%, not over', () => {
    expect(installmentCommitment([mk('income', 10000), mk('expense', 500)], 10)).toMatchObject({ pct: 0, over: false });
  });
  it('is over only when strictly above the limit', () => {
    const at = (cents: number) => installmentCommitment([mk('income', 10000), parc(cents)], 30);
    expect(at(2900)?.over).toBe(false);
    expect(at(3000)?.over).toBe(false);
    expect(at(3100)?.over).toBe(true);
    expect(installmentCommitment([mk('income', 10000), parc(9000)])?.over).toBe(false); // no limit
  });
  it('rounds to the nearest percent, not down', () => {
    expect(installmentCommitment([mk('income', 3), parc(2)])?.pct).toBe(67);
  });
});

describe('goalMessage', () => {
  const msg = (spent: number) => goalMessage(spent, 10000, goalProgress(spent, 10000)!).replace(/\s/g, ' ');
  it('says what is left below 80%', () => {
    expect(msg(7900)).toBe('Faltam R$ 21,00 para a meta.');
  });
  it('says how close it is from 80% up to the goal', () => {
    expect(msg(8000)).toBe('Chegando perto da meta: 80% usado.');
    expect(msg(10000)).toBe('Chegando perto da meta: 100% usado.');
  });
  it('says by how much it was passed above 100%', () => {
    expect(msg(10100)).toBe('Passou da meta em R$ 1,00.');
    expect(msg(10001)).toBe('Passou da meta em R$ 0,01.');
  });
});
