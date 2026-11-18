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

describe('parseData with investments', () => {
  const inv = (over: object) => raw({ type: 'investment', bank: 'Nubank', ...over });
  it('accepts a valid investment, with or without current value and rate', () => {
    expect(parseData(inv({})).transactions[0].type).toBe('investment');
    const full = parseData(inv({ currentValueCents: 120, ratePct: '100% do CDI' })).transactions[0];
    expect(full).toMatchObject({ currentValueCents: 120, ratePct: '100% do CDI' });
  });
  it('rejects a missing or blank bank', () => {
    expect(() => parseData(raw({ type: 'investment' }))).toThrow('Formato inválido');
    expect(() => parseData(inv({ bank: '  ' }))).toThrow('Formato inválido');
  });
  it('rejects a negative or non-integer current value and a non-string rate', () => {
    for (const over of [{ currentValueCents: -1 }, { currentValueCents: 1.5 }, { currentValueCents: '10' }, { ratePct: 11 }]) {
      expect(() => parseData(inv(over))).toThrow('Formato inválido');
    }
  });
  it('drops card, method, status, vencimento and series fields', () => {
    const t = parseData(inv({ cardId: 'c', method: 'pix', paid: false, due: '2026-02-01', installment: { n: 1, of: 2, groupId: 'g' } })).transactions[0];
    for (const k of ['cardId', 'method', 'paid', 'due', 'installment']) expect(t).not.toHaveProperty(k);
  });
  it('an old file without investments stays valid', () => {
    expect(parseData(raw({ type: 'income' })).transactions).toHaveLength(1);
  });
});
