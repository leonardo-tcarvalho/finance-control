import { describe, expect, it } from 'vitest';
import { applyEdit, buildEntries } from './ops';

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

describe('investments', () => {
  const invBase = { ...base, type: 'investment' as const, bank: 'Nubank', cardId: 'c1', method: 'pix' as const, due: '2026-02-01', times: 5, paidCount: 2 };
  it('creates a single row without card, method, vencimento, status or series, even if asked for them', () => {
    const rows = buildEntries({ ...invBase, currentValueCents: 1100, ratePct: ' 100% do CDI ' }, 'g', 'now');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'investment', amountCents: 1000, bank: 'Nubank', currentValueCents: 1100, ratePct: '100% do CDI' });
    for (const k of ['cardId', 'method', 'due', 'paid', 'installment', 'recurring']) expect(rows[0][k as keyof typeof rows[0]]).toBeUndefined();
  });
  it('requires a bank', () => {
    expect(() => buildEntries({ ...invBase, bank: ' ' }, 'g', 'now')).toThrow();
    expect(() => buildEntries({ ...invBase, bank: undefined }, 'g', 'now')).toThrow();
  });
  const edit = { type: 'investment' as const, amountCents: 2000, description: 'y', category: 'x', date: '2026-03-01', bank: 'Inter', currentValueCents: 2500 };
  it('edits an investment in place', () => {
    const [row] = buildEntries(invBase, 'g', 'now');
    const [out] = applyEdit([row], row, edit);
    expect(out).toMatchObject({ amountCents: 2000, bank: 'Inter', currentValueCents: 2500, date: '2026-03-01' });
    expect(out.cardId).toBeUndefined();
    expect(out.paid).toBeUndefined();
  });
  it('turning an expense into an investment drops card and status; the other way drops the investment fields', () => {
    const [exp] = buildEntries({ ...base, times: 1, cardId: 'c1' }, 'g', 'now');
    const [asInv] = applyEdit([exp], exp, edit);
    expect(asInv).toMatchObject({ type: 'investment', bank: 'Inter' });
    expect(asInv.cardId).toBeUndefined();
    const [back] = applyEdit([asInv], asInv, { ...edit, type: 'expense' });
    expect(back.type).toBe('expense');
    expect(back.bank).toBeUndefined();
    expect(back.currentValueCents).toBeUndefined();
  });
  it('an investment edit without a bank is refused', () => {
    const [row] = buildEntries(invBase, 'g', 'now');
    expect(() => applyEdit([row], row, { ...edit, bank: '' })).toThrow();
  });
  it('a row of an installment group cannot become an investment', () => {
    const rows = buildEntries(base, 'g', 'now');
    const out = applyEdit(rows, rows[0], edit);
    expect(out[0].type).toBe('expense');
    expect(out[0].bank).toBeUndefined();
  });
});
