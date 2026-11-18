import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: {} }));
import { parseData } from './storage';

const tx = { id: 'a', date: '2026-01-15', createdAt: 'c', type: 'expense', amountCents: 100 };
const raw = (over: object) => JSON.stringify({ transactions: [{ ...tx, ...over }] });

describe('parseData', () => {
  it('accepts a valid file', () => {
    expect(parseData(raw({})).transactions).toHaveLength(1);
  });
  it('rejects invalid dates', () => {
    for (const date of ['2026-02-31', '2026-13-01', '15/01/2026', '2026-1-5']) {
      expect(() => parseData(raw({ date }))).toThrow('Formato inválido');
    }
  });
  it('rejects negative amounts', () => {
    expect(() => parseData(raw({ amountCents: -1 }))).toThrow('Formato inválido');
  });
});
