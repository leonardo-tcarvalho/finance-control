import { PayKind, payKind } from './status';
import { Method, Transaction, TxType } from './types';
import { addMonths } from './utils';

export interface EntryInput {
  type: TxType;
  amountCents: number;
  description: string;
  category: string;
  /** ISO date of the first row that gets created: the purchase, or the next installment when some are already paid */
  date: string;
  cardId?: string;
  method?: Method;
  /** vencimento of the first row (expenses without a card); it moves one month per row in a series */
  due?: string;
  /** how many months the entry covers; 1 = a single entry */
  times: number;
  /** installment: the amount is the total and is split; recurring: the amount repeats every month */
  mode: 'installment' | 'recurring';
  /** installments of a purchase already paid before it was registered; only the remaining ones are created */
  paidCount?: number;
}

/** Id shared by every row of an installment purchase or a recurring series. */
export const groupOf = (t: Transaction) => t.installment?.groupId ?? t.recurring?.groupId;

/**
 * Makes paid and due consistent with how the row is paid. Income and card purchases carry no status of
 * their own (a card purchase follows its invoice); any other expense, Pix included, is pending, except when it stays
 * an expense paid outside a card (`prev`) and already has a status, which is kept (an old row without one counts as paid).
 */
function settle(x: Transaction, prev: PayKind | null): Transaction {
  const kind = payKind(x);
  if (kind === 'none' || kind === 'card') return { ...x, paid: undefined, due: undefined };
  return { ...x, paid: prev === 'other' ? (x.paid ?? true) : false };
}

/**
 * One row for a single entry, or one row per month for an installment purchase.
 * The total is divided in cents and the leftover goes to the first row, so the rows always add up exactly.
 * When some installments were already paid, only the rest are created, numbered from the next one (4/12, 5/12...),
 * starting at `date`; the leftover cent belonged to the first installment, which was already paid, so it is dropped.
 */
export function buildEntries(i: EntryInput, groupId: string, createdAt: string): Transaction[] {
  const n = Math.max(1, i.times);
  const paid = i.mode === 'installment' ? Math.min(Math.max(0, Math.floor(i.paidCount ?? 0)), n - 1) : 0;
  const split = i.mode === 'installment' ? n : 1;
  const base = Math.floor(i.amountCents / split);
  const rest = i.amountCents - base * split;
  return Array.from({ length: n - paid }, (_, j) => {
    const k = paid + j; // position in the whole purchase
    return settle(
      {
        id: `${groupId}-${k + 1}`,
        type: i.type,
        amountCents: i.mode === 'installment' ? base + (k === 0 ? rest : 0) : i.amountCents,
        category: i.category,
        description: i.description,
        date: addMonths(i.date, j),
        cardId: i.type === 'expense' ? i.cardId : undefined,
        method: i.type === 'expense' && !i.cardId ? i.method : undefined,
        due: i.due ? addMonths(i.due, j) : undefined,
        installment: n > 1 && i.mode === 'installment' ? { n: k + 1, of: n, groupId } : undefined,
        recurring: n > 1 && i.mode === 'recurring' ? { n: k + 1, of: n, groupId } : undefined,
        createdAt,
      },
      null,
    );
  });
}

export interface EditInput {
  type: TxType;
  amountCents: number;
  description: string;
  category: string;
  date: string;
  cardId?: string;
  method?: Method;
  /** vencimento of the edited row */
  due?: string;
}

/**
 * Applies an edit to one row. Rows of an installment purchase or a recurring series belong together: description,
 * category, card and method change on every row of the group, while amount, date and vencimento change only on the
 * row being edited. The type of a row that belongs to a group cannot be changed. Moving a row onto or off a card, or
 * turning income into an expense, resets its status (pending); otherwise the status is kept.
 */
export function applyEdit(list: Transaction[], original: Transaction, e: EditInput): Transaction[] {
  const gid = groupOf(original);
  return list.map((x) => {
    if (x.id === original.id) {
      const type = gid ? x.type : e.type;
      return settle(
        {
          ...x,
          type,
          amountCents: e.amountCents,
          date: e.date,
          description: e.description,
          category: e.category,
          cardId: type === 'expense' ? e.cardId : undefined,
          method: type === 'expense' && !e.cardId ? e.method : undefined,
          due: e.due,
        },
        payKind(x),
      );
    }
    if (gid && groupOf(x) === gid) {
      return settle({ ...x, description: e.description, category: e.category, cardId: e.cardId, method: e.cardId ? undefined : e.method }, payKind(x));
    }
    return x;
  });
}
