import { describe, expect, it } from 'vitest';
import { buildEntries } from './ops';

const base = { type: 'expense' as const, amountCents: 1000, description: 'x', category: 'Outros', date: '2026-01-15', times: 3, mode: 'installment' as const };

describe('buildEntries', () => {
  it('splits 10,00 in 3 with the leftover on the first row', () => {
    const rows = buildEntries(base, 'g', 'now');
    expect(rows.map((r) => r.amountCents)).toEqual([334, 333, 333]);
    expect(rows.reduce((s, r) => s + r.amountCents, 0)).toBe(1000);
  });
  it('with paidCount creates only the remaining rows', () => {
    const rows = buildEntries({ ...base, paidCount: 1 }, 'g', 'now');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.installment?.n)).toEqual([2, 3]);
    expect(rows.map((r) => r.amountCents)).toEqual([333, 333]);
  });
});
