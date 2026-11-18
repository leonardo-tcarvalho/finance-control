import { Card, Transaction, Method } from './types';
import { brl, shiftMonth } from './utils';

/** How much a row adds to spending: only an expense does. */
export const spendOf = (t: Transaction) => (t.type === 'expense' ? t.amountCents : 0);

export const incomeOf = (t: Transaction) => (t.type === 'income' ? t.amountCents : 0);

/** How much a row puts into investments: only an investment does. It is neither spending nor income. */
export const investedOf = (t: Transaction) => (t.type === 'investment' ? t.amountCents : 0);

/** Receitas, Gastos, Investido and Saldo (receitas minus gastos minus investido) for a set of rows. */
export function totalsOf(rows: Transaction[]) {
  let income = 0;
  let expense = 0;
  let invested = 0;
  for (const t of rows) {
    income += incomeOf(t);
    expense += spendOf(t);
    invested += investedOf(t);
  }
  return { income, expense, invested, balance: income - expense - invested };
}

const daysIn = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();

/**
 * The invoice a purchase lands on, named by the month the invoice closes in (yyyy-mm). Without a closing day the
 * invoice is simply the purchase's own month. A purchase made after the closing day goes to the next invoice;
 * a closing day past the end of a short month (31 in February) means the last day of that month.
 */
export function invoiceKey(card: Pick<Card, 'closingDay'>, dateIso: string): string {
  const month = dateIso.slice(0, 7);
  const closing = card.closingDay;
  if (!closing) return month;
  return Number(dateIso.slice(8, 10)) > Math.min(closing, daysIn(month)) ? shiftMonth(month, 1) : month;
}

/**
 * The month an entry is listed and counted in. A card purchase belongs to the month of its invoice, so when it was
 * registered, or bought, does not decide it: an installment bought on Nov 16 after the closing day starts in December.
 * Everything else belongs to the month of its date.
 */
export function monthOf(t: Pick<Transaction, 'date' | 'cardId'>, cards: Card[]): string {
  const card = t.cardId ? cards.find((c) => c.id === t.cardId) : undefined;
  return card ? invoiceKey(card, t.date) : t.date.slice(0, 7);
}

/** Due date (yyyy-mm-dd) of the invoice that closes in `month`, or null when the card has no due day. */
export function dueDate(card: Pick<Card, 'closingDay' | 'dueDay'>, month: string): string | null {
  if (!card.dueDay) return null;
  // a due day before the closing day means it falls in the month after the closing
  const dueMonth = card.closingDay && card.dueDay <= card.closingDay ? shiftMonth(month, 1) : month;
  return `${dueMonth}-${String(Math.min(card.dueDay, daysIn(dueMonth))).padStart(2, '0')}`;
}

export const isPaid = (card: Pick<Card, 'paid'>, month: string) => !!card.paid?.includes(month);

/** Rows of one invoice of a card. */
export function invoiceRows(list: Transaction[], card: Card, month: string) {
  return list.filter((t) => t.cardId === card.id && invoiceKey(card, t.date) === month);
}

/**
 * Limit used by a card: everything on invoices not marked as paid. An installment purchase counts in full (the
 * whole purchase is already committed); any other row, including a recurring series, counts once its date has
 * come.
 */
export function committedOnCard(list: Transaction[], card: Card, todayIso: string) {
  return list.reduce(
    (sum, x) => (x.cardId === card.id && !isPaid(card, invoiceKey(card, x.date)) && (x.installment || x.date <= todayIso) ? sum + spendOf(x) : sum),
    0,
  );
}

/** Lowercase and strip accents so "cafe" finds "Café". */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export interface RowFilter {
  query: string;
}

/**
 * Keeps the rows that match the typed text (description, category, card name, payment method label)
 * Every word typed must match somewhere, so "mercado pix" narrows down.
 */
export function filterRows(rows: Transaction[], f: RowFilter, cardName: (id?: string) => string, methodName: (m?: Method) => string): Transaction[] {
  const words = fold(f.query).split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((t) => {
    const hay = fold([t.description, t.category, t.bank ?? '', cardName(t.cardId), methodName(t.method)].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

export interface Slice {
  label: string;
  cents: number;
}

/** Spending per category, biggest first. */
export function spendByCategory(rows: Transaction[]): Slice[] {
  const m = new Map<string, number>();
  for (const t of rows) {
    const v = spendOf(t);
    if (v !== 0) m.set(t.category, (m.get(t.category) ?? 0) + v);
  }
  return Array.from(m, ([label, cents]) => ({ label, cents })).filter((s) => s.cents > 0).sort((a, b) => b.cents - a.cents);
}

/** Spending per way of paying: the card name, the method label, or "Não informado". */
export function spendByPayment(rows: Transaction[], cardName: (id?: string) => string, methodName: (m?: Method) => string): Slice[] {
  const m = new Map<string, number>();
  for (const t of rows) {
    const v = spendOf(t);
    if (v === 0) continue;
    const label = (t.cardId && cardName(t.cardId)) || (t.method && methodName(t.method)) || 'Não informado';
    m.set(label, (m.get(label) ?? 0) + v);
  }
  return Array.from(m, ([label, cents]) => ({ label, cents })).filter((s) => s.cents > 0).sort((a, b) => b.cents - a.cents);
}

export interface MonthPoint {
  month: string; // yyyy-mm
  income: number;
  expense: number;
}

/** Income and spending for the `count` months ending at `endMonth` (oldest first). */
export function monthlySeries(list: Transaction[], cards: Card[], endMonth: string, count: number): MonthPoint[] {
  const months = Array.from({ length: count }, (_, i) => shiftMonth(endMonth, i - (count - 1)));
  return months.map((month) => {
    const { income, expense } = totalsOf(list.filter((t) => monthOf(t, cards) === month));
    return { month, income, expense };
  });
}

/** Cards from the highest limit to the lowest; equal limits (and cards still without one) fall back to name order. */
export function sortCardsByLimit(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => (b.limitCents ?? 0) - (a.limitCents ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Rows whose reference month (monthOf) falls in `year` ('yyyy'). */
export const yearRows = (list: Transaction[], cards: Card[], year: string) => list.filter((t) => monthOf(t, cards).slice(0, 4) === year);

/** Distinct years that have entries (by monthOf), newest first. */
export const availableYears = (list: Transaction[], cards: Card[]): string[] =>
  Array.from(new Set(list.map((t) => monthOf(t, cards).slice(0, 4)))).sort().reverse();

/**
 * Year totals plus the average and extremes of monthly spending. Only months with spending count for the average
 * and for topMonth/lowMonth; a tie keeps the earliest month. Average is rounded to whole cents, 0 when nothing was spent.
 */
export function annualTotals(rows: Transaction[], months: MonthPoint[]) {
  const spent = months.filter((m) => m.expense > 0);
  const total = spent.reduce((sum, m) => sum + m.expense, 0);
  let topMonth: MonthPoint | null = null;
  let lowMonth: MonthPoint | null = null;
  for (const m of spent) {
    if (!topMonth || m.expense > topMonth.expense) topMonth = m;
    if (!lowMonth || m.expense < lowMonth.expense) lowMonth = m;
  }
  return { ...totalsOf(rows), monthlyAverage: spent.length ? Math.round(total / spent.length) : 0, topMonth, lowMonth };
}

/** The `n` biggest expenses, biggest first; equal amounts show the most recent date first. */
export const topExpenses = (rows: Transaction[], n = 5) =>
  rows
    .filter((t) => t.type === 'expense')
    .sort((a, b) => b.amountCents - a.amountCents || b.date.localeCompare(a.date))
    .slice(0, n);

/** Spending split by where it came from: installment purchases, monthly recurring series, or single purchases. */
export function spendByOrigin(rows: Transaction[]) {
  const out = { installment: 0, recurring: 0, single: 0 };
  for (const t of rows) {
    const v = spendOf(t);
    if (t.installment) out.installment += v;
    else if (t.recurring) out.recurring += v;
    else out.single += v;
  }
  return out;
}

/** Whole percentages of each value in their sum, adding up to exactly 100 (largest remainder; ties go to the earlier item). All zeros when the sum is 0. */
export function splitPercents(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const pct = values.map((v) => Math.floor((v * 100) / total));
  const order = values.map((v, i) => ({ i, rest: (v * 100) % total })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  const left = 100 - pct.reduce((a, b) => a + b, 0);
  for (let k = 0; k < left; k++) pct[order[k].i]++;
  return pct;
}

export interface Holding {
  /** the bank, or "Total" in portfolioTotals */
  bank: string;
  applied: number;
  current: number;
  gain: number;
  /** gain over applied, whole percent (0 when nothing was applied) */
  gainPct: number;
}

const holding = (bank: string, applied: number, current: number): Holding => ({
  bank,
  applied,
  current,
  gain: current - applied,
  gainPct: applied > 0 ? Math.round(((current - applied) / applied) * 100) : 0,
});

/** What an investment is worth: the informed current value, or what was applied when none was informed. */
const worthOf = (t: Transaction) => t.currentValueCents ?? t.amountCents;

/** Investments grouped by bank, the one worth the most first (equal values in name order). */
export function portfolioByBank(list: Transaction[]): Holding[] {
  // "nubank", "Nubank " and " NUBANK" are one bank: group by the trimmed lowercase name and show the first spelling found
  const m = new Map<string, { bank: string; applied: number; current: number }>();
  for (const t of list) {
    if (t.type !== 'investment') continue;
    const bank = (t.bank ?? '').trim();
    const key = bank.toLowerCase();
    const h = m.get(key) ?? { bank, applied: 0, current: 0 };
    h.applied += t.amountCents;
    h.current += worthOf(t);
    m.set(key, h);
  }
  return Array.from(m.values(), (h) => holding(h.bank, h.applied, h.current)).sort((a, b) => b.current - a.current || a.bank.localeCompare(b.bank, 'pt-BR'));
}

/** Applied, current value and gain over every investment. */
export function portfolioTotals(list: Transaction[]): Holding {
  const banks = portfolioByBank(list);
  return holding('Total', banks.reduce((n, h) => n + h.applied, 0), banks.reduce((n, h) => n + h.current, 0));
}

/** Yield of one investment row: the informed current value minus what was applied; 0 when no current value was informed. */
export const gainOf = (t: Transaction) => (t.type === 'investment' && t.currentValueCents !== undefined ? t.currentValueCents - t.amountCents : 0);

/** The yield as a whole percent of what was applied (0 when nothing was applied). */
export const gainPctOf = (t: Transaction) => (t.amountCents > 0 ? Math.round((gainOf(t) / t.amountCents) * 100) : 0);

/** "+ R$ 10,00 (+10%)", "− R$ 5,00 (−5%)"; no sign when the yield is zero, and no percent when it rounds to 0 but the yield is not. */
export function gainText(gain: number, pct: number): string {
  const sign = gain > 0 ? '+' : gain < 0 ? '−' : '';
  const value = `${sign ? sign + ' ' : ''}${brl(Math.abs(gain))}`;
  return gain !== 0 && pct === 0 ? value : `${value} (${sign}${Math.abs(pct)}%)`; // a tiny yield would read as "(+0%)"
}

export const gainLabel = (t: Transaction) => gainText(gainOf(t), gainPctOf(t));

/** What to call a row in lists and sheets: its description, else the bank for an investment, else the category. */
export const titleOf = (t: Transaction) => t.description || (t.type === 'investment' ? `Investimento · ${t.bank ?? ''}` : t.category);

/** Whole percent of the income that was invested, or null when there was no income to compare with. */
export const investedShare = (invested: number, income: number): number | null => (income > 0 ? Math.round((invested / income) * 100) : null);

/** Whole percent of the income left after spending ((income - expense) / income); negative when spending passed the income, null without income. */
export const savingsRate = (income: number, expense: number): number | null => (income > 0 ? Math.round(((income - expense) / income) * 100) : null);

/**
 * How many months of spending the investments cover: what the whole portfolio is worth now divided by the average monthly
 * spending of the 6 months ending at `endMonth` (only months with spending), to one decimal. null when nothing was spent
 * in those months; 0 when there is spending but no investments.
 */
export function emergencyReserveMonths(list: Transaction[], cards: Card[], endMonth: string): number | null {
  const spent = monthlySeries(list, cards, endMonth, 6).filter((m) => m.expense > 0);
  if (spent.length === 0) return null;
  const average = spent.reduce((sum, m) => sum + m.expense, 0) / spent.length;
  return Math.round((portfolioTotals(list).current / average) * 10) / 10;
}

export type ReserveLevel = 'baixa' | 'boa' | 'ótima';

/** Level of the emergency reserve: under 3 months is low, 3 up to 6 is good, 6 or more is great. */
export function reserveLevel(months: number): { level: ReserveLevel; text: string } {
  if (months < 3) return { level: 'baixa', text: 'Menos de 3 meses de gastos cobertos.' };
  if (months < 6) return { level: 'boa', text: 'Entre 3 e 6 meses de gastos cobertos.' };
  return { level: 'ótima', text: '6 meses ou mais de gastos cobertos.' };
}

export type GoalLevel = 'abaixo' | 'perto' | 'passou';

/**
 * Progress of the month's spending toward the goal: whole percent (spent / goal, rounded) and its level, judged on that
 * rounded percent so it matches what is shown: under 80 'abaixo', 80 up to 100 'perto', above 100 'passou'.
 * `spent` is every expense of the month, paid or pending. null when there is no goal.
 */
export function goalProgress(spent: number, goalCents?: number): { pct: number; level: GoalLevel } | null {
  if (!goalCents || goalCents <= 0) return null;
  const pct = Math.round((spent / goalCents) * 100);
  return { pct, level: pct > 100 ? 'passou' : pct >= 80 ? 'perto' : 'abaixo' };
}

/**
 * Share of the month's income committed to installments, over `rows` already limited to the month (by monthOf, so a card
 * purchase counts in the month of its invoice). An installment is any expense carrying `installment`, the same mark the
 * app uses for installment purchases, paid or pending; recurring series and single purchases do not count.
 * pct is whole and rounded; `over` is true only when that pct is strictly above `limitPct`. null when the month has no income.
 */
export function installmentCommitment(rows: Transaction[], limitPct?: number): { installments: number; income: number; pct: number; over: boolean } | null {
  const { income } = totalsOf(rows);
  if (income <= 0) return null;
  const { installment: installments } = spendByOrigin(rows);
  const pct = Math.round((installments / income) * 100);
  return { installments, income, pct, over: limitPct !== undefined && pct > limitPct };
}
