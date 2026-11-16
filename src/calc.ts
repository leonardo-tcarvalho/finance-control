import { Transaction } from './types';
import { shiftMonth } from './utils';

/** How much a row adds to spending: an expense adds, a refund subtracts, income is not spending. */
export const spendOf = (t: Transaction) => (t.type === 'expense' ? t.amountCents : t.type === 'refund' ? -t.amountCents : 0);

export const incomeOf = (t: Transaction) => (t.type === 'income' ? t.amountCents : 0);

/** Entradas, Saidas (net of refunds) and Saldo for a set of rows. */
export function totalsOf(rows: Transaction[]) {
  let income = 0;
  let expense = 0;
  for (const t of rows) {
    income += incomeOf(t);
    expense += spendOf(t);
  }
  return { income, expense, balance: income - expense };
}

/**
 * Limit used by a card. Installments count in full (the whole purchase is already committed); other rows,
 * including a recurring series, count only once their date has come. Months before the current one are
 * assumed paid.
 */
export function committedOnCard(list: Transaction[], cardId: string, todayIso: string) {
  const from = todayIso.slice(0, 7);
  return list.reduce(
    (sum, x) => (x.cardId === cardId && x.date.slice(0, 7) >= from && (x.installment || x.date <= todayIso) ? sum + spendOf(x) : sum),
    0,
  );
}

/** Lowercase and strip accents so "cafe" finds "Café". */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export interface RowFilter {
  query: string;
  /** exact category name, or null for all */
  category: string | null;
}

/**
 * Keeps the rows that match the typed text (description, category, card name, payment method label)
 * and the chosen category. Every word typed must match somewhere, so "mercado pix" narrows down.
 */
export function filterRows(rows: Transaction[], f: RowFilter, cardName: (id?: string) => string, methodName: (m?: string) => string): Transaction[] {
  const words = fold(f.query).split(/\s+/).filter(Boolean);
  if (!words.length && !f.category) return rows;
  return rows.filter((t) => {
    if (f.category && t.category !== f.category) return false;
    if (!words.length) return true;
    const hay = fold([t.description, t.category, cardName(t.cardId), methodName(t.method)].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

export interface Slice {
  label: string;
  cents: number;
}

/** Net spending per category (refunds subtract), biggest first; categories that net to zero or less are left out. */
export function spendByCategory(rows: Transaction[]): Slice[] {
  const m = new Map<string, number>();
  for (const t of rows) {
    const v = spendOf(t);
    if (v !== 0) m.set(t.category, (m.get(t.category) ?? 0) + v);
  }
  return Array.from(m, ([label, cents]) => ({ label, cents })).filter((s) => s.cents > 0).sort((a, b) => b.cents - a.cents);
}

/** Net spending per way of paying: the card name, the method label, or "Não informado". */
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

/** Income and net spending for the `count` months ending at `endMonth` (oldest first). */
export function monthlySeries(list: Transaction[], endMonth: string, count: number): MonthPoint[] {
  const months = Array.from({ length: count }, (_, i) => shiftMonth(endMonth, i - (count - 1)));
  return months.map((month) => {
    const { income, expense } = totalsOf(list.filter((t) => t.date.startsWith(month)));
    return { month, income, expense };
  });
}
