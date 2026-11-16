export type TxType = 'expense' | 'income';

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
  cardId?: string; // expenses only; missing = no card (cash, pix...)
  /** Set on every row of an installment purchase; `groupId` ties the rows together. */
  installment?: { n: number; of: number; groupId: string };
  createdAt: string;
}

export interface AppData {
  schemaVersion: number;
  cards: Card[];
  /** UI preferences; absent in files saved before themes existed */
  settings?: { theme?: 'light' | 'dark' };
  transactions: Transaction[];
  updatedAt: string;
}

export const SCHEMA_VERSION = 2;
export const CATEGORIES = ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Educação', 'Salário', 'Outros'];
export const emptyData = (): AppData => ({ schemaVersion: SCHEMA_VERSION, cards: [], transactions: [], updatedAt: new Date().toISOString() });
