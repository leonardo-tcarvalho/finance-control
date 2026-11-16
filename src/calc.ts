import { Transaction } from './types';

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
