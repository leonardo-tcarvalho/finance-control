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
  /** number of installments; 1 = a single entry */
  times: number;
}

/**
 * One row for a single entry, or one row per month for an installment purchase.
 * The total is divided in cents and the leftover goes to the first row, so the rows always add up exactly.
 */
export function buildEntries(i: EntryInput, groupId: string, createdAt: string): Transaction[] {
  const n = Math.max(1, i.times);
  const base = Math.floor(i.amountCents / n);
  const rest = i.amountCents - base * n;
  return Array.from({ length: n }, (_, k) => ({
    id: `${groupId}-${k + 1}`,
    type: i.type,
    amountCents: base + (k === 0 ? rest : 0),
    category: i.category,
    description: i.description,
    date: addMonths(i.date, k),
    cardId: i.type === 'expense' ? i.cardId : undefined,
    method: i.type === 'expense' && !i.cardId ? i.method : undefined,
    installment: n > 1 ? { n: k + 1, of: n, groupId } : undefined,
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
 * Applies an edit to one row. Rows of an installment purchase are one purchase: description, category
 * and card change on every row of the group, while amount and date change only on the row being edited.
 * The type of an installment row cannot be changed.
 */
export function applyEdit(list: Transaction[], original: Transaction, e: EditInput): Transaction[] {
  const gid = original.installment?.groupId;
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
        cardId: type === 'expense' ? e.cardId : undefined,
        method: type === 'expense' && !e.cardId ? e.method : undefined,
      };
    }
    if (gid && x.installment?.groupId === gid) return { ...x, description: e.description, category: e.category, cardId: e.cardId, method: e.cardId ? undefined : e.method };
    return x;
  });
}
