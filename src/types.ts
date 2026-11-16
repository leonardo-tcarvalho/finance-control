export type TxType = 'expense' | 'income';

export interface Card {
  id: string;
  name: string;
}

export interface Transaction {
  id: string;
  type: TxType;
  amountCents: number; // integer cents, avoids float errors
  category: string;
  description: string;
  date: string; // ISO yyyy-mm-dd
  cardId?: string; // expenses only; missing = no card (cash, pix...)
  createdAt: string;
}

export interface AppData {
  schemaVersion: number;
  cards: Card[];
  transactions: Transaction[];
  updatedAt: string;
}

export const SCHEMA_VERSION = 2;
export const CATEGORIES = ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Educação', 'Salário', 'Outros'];
export const emptyData = (): AppData => ({ schemaVersion: SCHEMA_VERSION, cards: [], transactions: [], updatedAt: new Date().toISOString() });
