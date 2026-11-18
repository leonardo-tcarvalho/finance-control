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
  /** installment: the amount is the value of each installment; recurring: the amount repeats every month; either way every row gets it as is */
  mode: 'installment' | 'recurring';
  /** installments of a purchase already paid before it was registered; only the remaining ones are created */
  paidCount?: number;
  /** investments only (required for them): institution, current value and a free-text rate note */
  bank?: string;
  currentValueCents?: number;
  ratePct?: string;
}

const investmentFields = (i: { bank?: string; currentValueCents?: number; ratePct?: string }) => {
  if (!i.bank?.trim()) throw new Error('Informe o banco do investimento');
  const v = i.currentValueCents;
  if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw new Error('Valor atual inválido');
  return { bank: i.bank.trim(), currentValueCents: i.currentValueCents, ratePct: i.ratePct?.trim() || undefined };
};

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
 * One row for a single entry, or one row per month for an installment purchase. An investment is always a single row
 * with no card, method, vencimento or series, and needs a bank.
 * The person gives the value of the installment, so every row has that value and the total is value x times.
 * When some installments were already paid, only the rest are created, numbered from the next one (4/12, 5/12...),
 * starting at `date`.
 */
export function buildEntries(i: EntryInput, groupId: string, createdAt: string): Transaction[] {
  const isInvestment = i.type === 'investment';
  const n = isInvestment ? 1 : Math.max(1, i.times);
  const paid = i.mode === 'installment' ? Math.min(Math.max(0, Math.floor(i.paidCount ?? 0)), n - 1) : 0;
  return Array.from({ length: n - paid }, (_, j) => {
    const k = paid + j; // position in the whole purchase
    return settle(
      {
        id: `${groupId}-${k + 1}`,
        type: i.type,
        amountCents: i.amountCents,
        category: i.category,
        description: i.description,
        date: addMonths(i.date, j),
        cardId: i.type === 'expense' ? i.cardId : undefined,
        method: i.type === 'expense' && !i.cardId ? i.method : undefined,
        due: i.due && !isInvestment ? addMonths(i.due, j) : undefined,
        ...(isInvestment ? investmentFields(i) : {}),
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
  /** investments only (required for them) */
  bank?: string;
  currentValueCents?: number;
  ratePct?: string;
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
          bank: undefined,
          currentValueCents: undefined,
          ratePct: undefined,
          ...(type === 'investment' ? investmentFields(e) : {}),
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
