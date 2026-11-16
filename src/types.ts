/** refund = money given back (estorno/reembolso); it offsets spending. */
export type TxType = 'expense' | 'income' | 'refund';

/** How a non-card entry was paid. Card entries use cardId instead. */
export type Method = 'pix' | 'debit' | 'cash' | 'boleto' | 'other';

export interface Card {
  id: string;
  name: string;
  /** credit limit in cents; absent when the user did not set one */
  limitCents?: number;
}

export interface Transaction {
  id: string;
  type: TxType;
  amountCents: number; // integer cents, avoids float errors
  category: string;
  description: string;
  date: string; // ISO yyyy-mm-dd
  cardId?: string; // expenses only; missing = no card
  method?: Method; // expenses only, when paid without a card
  /** Set on every row of an installment purchase; `groupId` ties the rows together. */
  installment?: { n: number; of: number; groupId: string };
  /** Set on every row of a monthly series that repeats the same amount (boleto, rent, subscription). */
  recurring?: { n: number; of: number; groupId: string };
  createdAt: string;
}

export interface AppData {
  schemaVersion: number;
  cards: Card[];
  /** Category lists the user can edit; absent in files saved before this existed (defaults apply). */
  categories?: Categories;
  /** UI preferences; absent in files saved before themes existed */
  settings?: { theme?: 'light' | 'dark' };
  transactions: Transaction[];
  updatedAt: string;
}

export const SCHEMA_VERSION = 2;
export interface Categories {
  /** used by expenses and refunds */
  expense: string[];
  income: string[];
}

export const DEFAULT_CATEGORIES: Categories = {
  expense: ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Educação', 'Outros'],
  income: ['Salário', 'Freelance', 'Investimentos', 'Outros'],
};

/** The list to offer for an entry type, plus the entry's current category when it is no longer in the list. */
export function categoriesFor(cats: Categories | undefined, type: TxType, current?: string): string[] {
  const list = (cats ?? DEFAULT_CATEGORIES)[type === 'income' ? 'income' : 'expense'];
  return current && !list.includes(current) ? [...list, current] : list;
}
export const emptyData = (): AppData => ({ schemaVersion: SCHEMA_VERSION, cards: [], transactions: [], updatedAt: new Date().toISOString() });

export const METHODS: { id: Method; label: string }[] = [
  { id: 'pix', label: 'Pix' },
  { id: 'debit', label: 'Débito' },
  { id: 'cash', label: 'Dinheiro' },
  { id: 'boleto', label: 'Boleto' },
  { id: 'other', label: 'Outro' },
];
export const methodLabel = (m: Method) => METHODS.find((x) => x.id === m)?.label ?? m;
