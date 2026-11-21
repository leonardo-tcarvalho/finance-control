import { describe, expect, it } from 'vitest';
import { dueOf, isOverdue, isPending, monthTotals, overdueSummary, payKind } from './status';
import { Card, Transaction } from './types';

const base = { id: 'a', description: 'x', category: 'x', date: '2026-01-10', createdAt: 'c' };
const inv: Transaction = { ...base, type: 'investment', amountCents: 500, bank: 'Nubank' };
const cards: Card[] = [];

describe('investments in status rules', () => {
  it('have no payment status, due date or overdue state', () => {
    expect(payKind(inv)).toBe('none');
    expect(isPending(inv, cards)).toBe(false);
    expect(dueOf(inv, cards)).toBeNull();
    expect(isOverdue(inv, cards, '2030-01-01')).toBe(false);
    expect(overdueSummary([inv], cards, '2030-01-01').count).toBe(0);
  });
});

describe('monthTotals', () => {
  const income: Transaction = { ...base, type: 'income', amountCents: 1000 };
  const paid: Transaction = { ...base, type: 'expense', amountCents: 200, paid: true };
  const pending: Transaction = { ...base, type: 'expense', amountCents: 100, paid: false };
  it('reports the invested amount apart from income and expense', () => {
    expect(monthTotals([income, paid, inv], cards)).toMatchObject({ income: 1000, expense: 200, invested: 500, pending: 0 });
  });
  it('balance is income minus paid expenses minus invested', () => {
    expect(monthTotals([income, paid, pending, inv], cards).balance).toBe(1000 - 200 - 500);
  });
});
