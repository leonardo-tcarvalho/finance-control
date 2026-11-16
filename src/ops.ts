import { Method, Transaction, TxType } from './types';
import { addMonths } from './utils';

export interface EntryInput {
  type: TxType;
  amountCents: number;
  description: string;
  category: string;
  /** ISO date of the purchase (first installment) */
  date: string;
  cardId?: string;
  method?: Method;
  /** how many months the entry covers; 1 = a single entry */
  times: number;
  /** installment: the amount is the total and is split; recurring: the amount repeats every month */
  mode: 'installment' | 'recurring';
}

/** Id shared by every row of an installment purchase or a recurring series. */
export const groupOf = (t: Transaction) => t.installment?.groupId ?? t.recurring?.groupId;

/**
 * One row for a single entry, or one row per month for an installment purchase.
 * The total is divided in cents and the leftover goes to the first row, so the rows always add up exactly.
 */
export function buildEntries(i: EntryInput, groupId: string, createdAt: string): Transaction[] {
  const n = Math.max(1, i.times);
  const split = i.mode === 'installment' ? n : 1;
  const base = Math.floor(i.amountCents / split);
  const rest = i.amountCents - base * split;
  return Array.from({ length: n }, (_, k) => ({
    id: `${groupId}-${k + 1}`,
    type: i.type,
    amountCents: i.mode === 'installment' ? base + (k === 0 ? rest : 0) : i.amountCents,
    category: i.category,
    description: i.description,
    date: addMonths(i.date, k),
    cardId: i.type !== 'income' ? i.cardId : undefined,
    method: i.type !== 'income' && !i.cardId ? i.method : undefined,
    installment: n > 1 && i.mode === 'installment' ? { n: k + 1, of: n, groupId } : undefined,
    recurring: n > 1 && i.mode === 'recurring' ? { n: k + 1, of: n, groupId } : undefined,
    createdAt,
  }));
}

export interface EditInput {
  type: TxType;
  amountCents: number;
  description: string;
  category: string;
  date: string;
  cardId?: string;
  method?: Method;
}

/**
 * Applies an edit to one row. Rows of an installment purchase or a recurring series belong together: description,
 * category, card and method change on every row of the group, while amount and date change only on the row being
 * edited. The type of a row that belongs to a group cannot be changed.
 */
export function applyEdit(list: Transaction[], original: Transaction, e: EditInput): Transaction[] {
  const gid = groupOf(original);
  return list.map((x) => {
    if (x.id === original.id) {
      const type = gid ? x.type : e.type;
      return {
        ...x,
        type,
        amountCents: e.amountCents,
        date: e.date,
        description: e.description,
        category: e.category,
        cardId: type !== 'income' ? e.cardId : undefined,
        method: type !== 'income' && !e.cardId ? e.method : undefined,
      };
    }
    if (gid && groupOf(x) === gid) return { ...x, description: e.description, category: e.category, cardId: e.cardId, method: e.cardId ? undefined : e.method };
    return x;
  });
}
