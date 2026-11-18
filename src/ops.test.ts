import { describe, expect, it } from 'vitest';
import { buildEntries } from './ops';

const base = { type: 'expense' as const, amountCents: 1000, description: 'x', category: 'Outros', date: '2026-01-15', times: 3, mode: 'installment' as const };

describe('buildEntries', () => {
  it('creates one row per installment, each with the informed value', () => {
    const rows = buildEntries({ ...base, amountCents: 1000 }, 'g', 'now');
    expect(rows.map((r) => r.amountCents)).toEqual([1000, 1000, 1000]);
    expect(rows.reduce((s, r) => s + r.amountCents, 0)).toBe(3000);
  });
  it('with paidCount creates only the remaining rows, numbered from the next one', () => {
    const rows = buildEntries({ ...base, paidCount: 1 }, 'g', 'now');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.installment?.n)).toEqual([2, 3]);
    expect(rows.map((r) => r.amountCents)).toEqual([1000, 1000]);
  });
  it('a single entry (times 1) has no installment and keeps the value', () => {
    const rows = buildEntries({ ...base, times: 1 }, 'g', 'now');
    expect(rows).toHaveLength(1);
    expect(rows[0].amountCents).toBe(1000);
    expect(rows[0].installment).toBeUndefined();
  });
});
