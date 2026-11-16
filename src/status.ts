import { dueDate, invoiceKey, isPaid, incomeOf, monthOf, spendOf } from './calc';
import { Card, Transaction } from './types';

/** What decides whether an entry is paid: nothing (income), its card's invoice, or its own flag. */
export type PayKind = 'none' | 'card' | 'other';

export const payKind = (t: Pick<Transaction, 'type' | 'cardId' | 'method'>): PayKind =>
  t.type !== 'expense' ? 'none' : t.cardId ? 'card' : 'other';

const cardOf = (cards: Card[], id?: string) => cards.find((c) => c.id === id);

/**
 * An expense that is still to be paid. A card purchase is pending until its whole invoice is marked paid; any other
 * other expense (Pix included) carries its own flag. Income is never pending.
 */
export function isPending(t: Transaction, cards: Card[]): boolean {
  const kind = payKind(t);
  if (kind === 'other') return t.paid === false;
  if (kind === 'card') {
    const card = cardOf(cards, t.cardId);
    return card ? !isPaid(card, invoiceKey(card, t.date)) : false;
  }
  return false;
}

/** When the expense must be paid: the card's invoice due date, or the vencimento chosen for it (the entry date when none was). */
export function dueOf(t: Transaction, cards: Card[]): string | null {
  const kind = payKind(t);
  if (kind === 'other') return t.due ?? t.date;
  if (kind === 'card') {
    const card = cardOf(cards, t.cardId);
    return card ? dueDate(card, invoiceKey(card, t.date)) : null;
  }
  return null; // income
}

/** Pending and past its due date. A card without a due day never becomes overdue. */
export function isOverdue(t: Transaction, cards: Card[], todayIso: string): boolean {
  if (!isPending(t, cards)) return false;
  const due = dueOf(t, cards);
  return !!due && due < todayIso;
}

/** Overdue expenses of every month, oldest due date first, with their sum and the month of the oldest one. */
export function overdueSummary(list: Transaction[], cards: Card[], todayIso: string) {
  const rows = list
    .filter((t) => isOverdue(t, cards, todayIso))
    .sort((a, b) => (dueOf(a, cards) as string).localeCompare(dueOf(b, cards) as string));
  return { count: rows.length, cents: rows.reduce((sum, t) => sum + spendOf(t), 0), oldestMonth: rows.length ? monthOf(rows[0], cards) : null };
}

/**
 * Receitas, Gastos, the part of Gastos still pending, and Saldo (receitas minus the gastos that are not pending).
 */
export function monthTotals(rows: Transaction[], cards: Card[]) {
  let income = 0;
  let expense = 0;
  let pending = 0;
  for (const t of rows) {
    income += incomeOf(t);
    const v = spendOf(t);
    expense += v;
    if (v > 0 && isPending(t, cards)) pending += v;
  }
  return { income, expense, pending, balance: income - (expense - pending) };
}

/**
 * The first card purchase in `after` that was created or moved into an invoice already marked as paid, or null.
 * Editing the text of a purchase that already sits in a paid invoice is fine; moving it into one is not.
 */
export function movedIntoPaidInvoice(before: Transaction[], after: Transaction[], cards: Card[]): { card: Card; month: string } | null {
  const was = new Map(before.map((t) => [t.id, t]));
  for (const t of after) {
    if (t.type !== 'expense' || !t.cardId) continue;
    const card = cardOf(cards, t.cardId);
    if (!card) continue;
    const month = invoiceKey(card, t.date);
    const prev = was.get(t.id);
    const prevMonth = prev && prev.cardId === t.cardId ? invoiceKey(card, prev.date) : null;
    if (month !== prevMonth && isPaid(card, month)) return { card, month };
  }
  return null;
}
