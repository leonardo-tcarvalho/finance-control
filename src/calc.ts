import { Card, Transaction } from './types';
import { shiftMonth } from './utils';

/** How much a row adds to spending: only an expense does. */
export const spendOf = (t: Transaction) => (t.type === 'expense' ? t.amountCents : 0);

export const incomeOf = (t: Transaction) => (t.type === 'income' ? t.amountCents : 0);

/** Receitas, Gastos and Saldo for a set of rows. */
export function totalsOf(rows: Transaction[]) {
  let income = 0;
  let expense = 0;
  for (const t of rows) {
    income += incomeOf(t);
    expense += spendOf(t);
  }
  return { income, expense, balance: income - expense };
}

const daysIn = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();

/**
 * The invoice a purchase lands on, named by the month the invoice closes in (yyyy-mm). Without a closing day the
 * invoice is simply the purchase's own month. A purchase made after the closing day goes to the next invoice;
 * a closing day past the end of a short month (31 in February) means the last day of that month.
 */
export function invoiceKey(card: Pick<Card, 'closingDay'>, dateIso: string): string {
  const month = dateIso.slice(0, 7);
  const closing = card.closingDay;
  if (!closing) return month;
  return Number(dateIso.slice(8, 10)) > Math.min(closing, daysIn(month)) ? shiftMonth(month, 1) : month;
}

/**
 * The month an entry is listed and counted in. A card purchase belongs to the month of its invoice, so when it was
 * registered, or bought, does not decide it: an installment bought on Nov 16 after the closing day starts in December.
 * Everything else belongs to the month of its date.
 */
export function monthOf(t: Pick<Transaction, 'date' | 'cardId'>, cards: Card[]): string {
  const card = t.cardId ? cards.find((c) => c.id === t.cardId) : undefined;
  return card ? invoiceKey(card, t.date) : t.date.slice(0, 7);
}

/** Due date (yyyy-mm-dd) of the invoice that closes in `month`, or null when the card has no due day. */
export function dueDate(card: Pick<Card, 'closingDay' | 'dueDay'>, month: string): string | null {
  if (!card.dueDay) return null;
  // a due day before the closing day means it falls in the month after the closing
  const dueMonth = card.closingDay && card.dueDay <= card.closingDay ? shiftMonth(month, 1) : month;
  return `${dueMonth}-${String(Math.min(card.dueDay, daysIn(dueMonth))).padStart(2, '0')}`;
}

export const isPaid = (card: Pick<Card, 'paid'>, month: string) => !!card.paid?.includes(month);

/** Rows of one invoice of a card. */
export function invoiceRows(list: Transaction[], card: Card, month: string) {
  return list.filter((t) => t.cardId === card.id && invoiceKey(card, t.date) === month);
}

/**
 * Limit used by a card: everything on invoices not marked as paid. An installment purchase counts in full (the
 * whole purchase is already committed); any other row, including a recurring series, counts once its date has
 * come.
 */
export function committedOnCard(list: Transaction[], card: Card, todayIso: string) {
  return list.reduce(
    (sum, x) => (x.cardId === card.id && !isPaid(card, invoiceKey(card, x.date)) && (x.installment || x.date <= todayIso) ? sum + spendOf(x) : sum),
    0,
  );
}

/** Lowercase and strip accents so "cafe" finds "Café". */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export interface RowFilter {
  query: string;
}

/**
 * Keeps the rows that match the typed text (description, category, card name, payment method label)
 * Every word typed must match somewhere, so "mercado pix" narrows down.
 */
export function filterRows(rows: Transaction[], f: RowFilter, cardName: (id?: string) => string, methodName: (m?: string) => string): Transaction[] {
  const words = fold(f.query).split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((t) => {
    const hay = fold([t.description, t.category, cardName(t.cardId), methodName(t.method)].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

export interface Slice {
  label: string;
  cents: number;
}

/** Spending per category, biggest first. */
export function spendByCategory(rows: Transaction[]): Slice[] {
  const m = new Map<string, number>();
  for (const t of rows) {
    const v = spendOf(t);
    if (v !== 0) m.set(t.category, (m.get(t.category) ?? 0) + v);
  }
  return Array.from(m, ([label, cents]) => ({ label, cents })).filter((s) => s.cents > 0).sort((a, b) => b.cents - a.cents);
}

/** Spending per way of paying: the card name, the method label, or "Não informado". */
export function spendByPayment(rows: Transaction[], cardName: (id?: string) => string, methodName: (m?: string) => string): Slice[] {
  const m = new Map<string, number>();
  for (const t of rows) {
    const v = spendOf(t);
    if (v === 0) continue;
    const label = (t.cardId && cardName(t.cardId)) || (t.method && methodName(t.method)) || 'Não informado';
    m.set(label, (m.get(label) ?? 0) + v);
  }
  return Array.from(m, ([label, cents]) => ({ label, cents })).filter((s) => s.cents > 0).sort((a, b) => b.cents - a.cents);
}

export interface MonthPoint {
  month: string; // yyyy-mm
  income: number;
  expense: number;
}

/** Income and spending for the `count` months ending at `endMonth` (oldest first). */
export function monthlySeries(list: Transaction[], cards: Card[], endMonth: string, count: number): MonthPoint[] {
  const months = Array.from({ length: count }, (_, i) => shiftMonth(endMonth, i - (count - 1)));
  return months.map((month) => {
    const { income, expense } = totalsOf(list.filter((t) => monthOf(t, cards) === month));
    return { month, income, expense };
  });
}

/** Cards from the highest limit to the lowest; equal limits (and cards still without one) fall back to name order. */
export function sortCardsByLimit(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => (b.limitCents ?? 0) - (a.limitCents ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));
}
