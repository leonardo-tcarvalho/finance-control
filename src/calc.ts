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
