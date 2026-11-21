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

describe('parseData with limits', () => {
  const lim = (limits: unknown) => parseData(JSON.stringify({ transactions: [], limits })).limits;
  it('an old file without limits stays valid, with no limits', () => {
    expect(parseData(raw({})).limits).toBeUndefined();
  });
  it('keeps valid limits', () => {
    expect(lim({ spendingGoalCents: 300000, installmentPct: 30 })).toEqual({ spendingGoalCents: 300000, installmentPct: 30 });
    expect(lim({ installmentPct: 100 })).toEqual({ installmentPct: 100 });
    expect(lim({ installmentPct: 1 })).toEqual({ installmentPct: 1 });
  });
  it('drops zero, negative, fractional, non-numeric and out-of-range values without failing', () => {
    expect(lim({ spendingGoalCents: 0, installmentPct: 0 })).toBeUndefined();
    expect(lim({ spendingGoalCents: -5, installmentPct: -1 })).toBeUndefined();
    expect(lim({ spendingGoalCents: 10.5, installmentPct: 30.5 })).toBeUndefined();
    expect(lim({ spendingGoalCents: '3000', installmentPct: 101 })).toBeUndefined();
    expect(lim('x')).toBeUndefined();
  });
  it('drops only the invalid one', () => {
    expect(lim({ spendingGoalCents: 'a', installmentPct: 20 })).toEqual({ installmentPct: 20 });
  });
});

describe('parseData transaction ids', () => {
  it('rejects two transactions with the same id', () => {
    const t = { id: 'x', date: '2026-01-15', createdAt: 'c', type: 'expense', amountCents: 100 };
    expect(() => parseData(JSON.stringify({ transactions: [t, { ...t }] }))).toThrow('Formato inválido');
  });
});

describe('parseData settings', () => {
  const parseWith = (settings: unknown) => parseData(JSON.stringify({ transactions: [], settings }));
  it('keeps a known theme', () => expect(parseWith({ theme: 'dark' })?.settings).toEqual({ theme: 'dark' }));
  it('drops an unknown theme and non-object settings', () => {
    expect(parseWith({ theme: 'sepia' }).settings).toBeUndefined();
    expect(parseWith('dark').settings).toBeUndefined();
  });
});

describe('parseData cards', () => {
  const tx = { id: 't', date: '2026-01-15', createdAt: 'c', type: 'expense', amountCents: 100 };
  const parse = (cards: unknown[]) => parseData(JSON.stringify({ transactions: [tx], cards }));

  it('drops an out-of-range closing/due day and an invalid limit instead of keeping them', () => {
    const [c] = parse([{ id: 'a', name: 'A', limitCents: -5, closingDay: 45, dueDay: 0 }]).cards;
    expect(c.limitCents).toBeUndefined();
    expect(c.closingDay).toBeUndefined();
    expect(c.dueDay).toBeUndefined();
  });

  it('keeps valid values', () => {
    const [c] = parse([{ id: 'a', name: 'A', limitCents: 500000, closingDay: 10, dueDay: 17 }]).cards;
    expect(c).toMatchObject({ limitCents: 500000, closingDay: 10, dueDay: 17 });
  });

  it('rejects two cards with the same id', () => {
    expect(() => parse([{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }])).toThrow('Formato inválido');
  });
});
