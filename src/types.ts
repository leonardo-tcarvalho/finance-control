export type TxType = 'expense' | 'income';

export interface Transaction {
  id: string;
  type: TxType;
  amountCents: number; // integer cents, avoids float errors
  category: string;
  description: string;
  date: string; // ISO yyyy-mm-dd
  createdAt: string;
}

export interface AppData {
  schemaVersion: number;
  transactions: Transaction[];
  updatedAt: string;
}

export const SCHEMA_VERSION = 1;
export const CATEGORIES = ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Educação', 'Salário', 'Outros'];
export const emptyData = (): AppData => ({ schemaVersion: SCHEMA_VERSION, transactions: [], updatedAt: new Date().toISOString() });
