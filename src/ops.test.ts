import { describe, expect, it } from 'vitest';
import { MAX_GOAL_CENTS, applyEdit, buildEntries, parseLimitText, setLimit, updateCurrentValue } from './ops';

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
  it('refuses an invalid current value, accepts absent and explicit zero', () => {
    for (const v of [NaN, -1, 1.5]) {
      expect(() => buildEntries({ ...invBase, currentValueCents: v }, 'g', 'now')).toThrow('Valor atual inválido');
    }
    expect(buildEntries({ ...invBase, currentValueCents: undefined }, 'g', 'now')[0].currentValueCents).toBeUndefined();
    expect(buildEntries({ ...invBase, currentValueCents: 0 }, 'g', 'now')[0].currentValueCents).toBe(0);
    const [row] = buildEntries(invBase, 'g', 'now');
    expect(() => applyEdit([row], row, { type: 'investment', amountCents: 1, description: '', category: 'x', date: '2026-03-01', bank: 'Inter', currentValueCents: -5 })).toThrow('Valor atual inválido');
  });
  it('requires a bank', () => {
    expect(() => buildEntries({ ...invBase, bank: ' ' }, 'g', 'now')).toThrow();
    expect(() => buildEntries({ ...invBase, bank: undefined }, 'g', 'now')).toThrow();
  });
  const edit = { type: 'investment' as const, amountCents: 2000, description: 'y', category: 'x', date: '2026-03-01', bank: 'Inter', currentValueCents: 2500, ratePct: '10% ao ano' };
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
    expect(back.ratePct).toBeUndefined();
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

describe('updateCurrentValue', () => {
  const [inv] = buildEntries({ ...base, type: 'investment', bank: 'Nubank', currentValueCents: 1000, ratePct: '10%', times: 1 }, 'i', 'now');
  const [exp] = buildEntries({ ...base, times: 1 }, 'e', 'now');
  it('changes only the current value of that investment', () => {
    const out = updateCurrentValue([exp, inv], inv.id, 1500);
    expect(out[1]).toEqual({ ...inv, currentValueCents: 1500 });
    expect(out[0]).toBe(exp);
  });
  it('accepts an explicit zero', () => {
    expect(updateCurrentValue([inv], inv.id, 0)[0].currentValueCents).toBe(0);
  });
  it('leaves an unknown id and a row that is not an investment alone', () => {
    expect(updateCurrentValue([exp, inv], 'nope', 5)).toEqual([exp, inv]);
    expect(updateCurrentValue([exp, inv], exp.id, 5)[0]).toBe(exp);
  });
  it('refuses a negative, decimal or NaN value', () => {
    for (const v of [-1, 1.5, NaN]) expect(() => updateCurrentValue([inv], inv.id, v)).toThrow('Valor atual inválido');
  });
});

describe('parseLimitText', () => {
  it('empty clears either limit', () => {
    expect(parseLimitText('spendingGoalCents', '  ')).toBeUndefined();
    expect(parseLimitText('installmentPct', '')).toBeUndefined();
  });
  it('the goal is typed in reais and kept in cents; 0 clears it', () => {
    expect(parseLimitText('spendingGoalCents', '3.500,50')).toBe(350050);
    expect(parseLimitText('spendingGoalCents', '0')).toBeUndefined();
  });
  it('the goal accepts exactly R$ 1 bilhão and rejects more, negative or text', () => {
    expect(parseLimitText('spendingGoalCents', '1.000.000.000,00')).toBe(MAX_GOAL_CENTS);
    expect(() => parseLimitText('spendingGoalCents', '1.000.000.000,01')).toThrow();
    expect(() => parseLimitText('spendingGoalCents', '-5')).toThrow();
    expect(() => parseLimitText('spendingGoalCents', 'abc')).toThrow();
  });
  it('the percent is a whole number from 1 to 100', () => {
    expect(parseLimitText('installmentPct', '1')).toBe(1);
    expect(parseLimitText('installmentPct', '100')).toBe(100);
    for (const bad of ['0', '101', '-1', '30,5', '30.5', 'abc']) expect(() => parseLimitText('installmentPct', bad)).toThrow();
  });
});

describe('setLimit', () => {
  it('keeps the other limit when one changes', () => {
    expect(setLimit({ installmentPct: 30 }, 'spendingGoalCents', 5000)).toEqual({ installmentPct: 30, spendingGoalCents: 5000 });
    expect(setLimit(undefined, 'installmentPct', 20)).toEqual({ installmentPct: 20 });
  });
  it('clearing one keeps the other; clearing both leaves limits undefined', () => {
    expect(setLimit({ installmentPct: 30, spendingGoalCents: 5000 }, 'spendingGoalCents', undefined)).toEqual({ installmentPct: 30 });
    expect(setLimit({ installmentPct: 30 }, 'installmentPct', undefined)).toBeUndefined();
    expect(setLimit(undefined, 'installmentPct', undefined)).toBeUndefined();
  });
});
