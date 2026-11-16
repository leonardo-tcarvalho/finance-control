export const MAX_INSTALLMENTS = 48;
export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const pad = (n: number) => String(n).padStart(2, '0');

// local date (toISOString would be UTC and flip to "tomorrow" after 21h in Brazil)
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// same day `k` months later, clamped to the month's last day (31/01 + 1 -> 28/02)
export const addMonths = (iso: string, k: number) => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1 + k;
  const d = Number(iso.slice(8, 10));
  const ty = y + Math.floor(m / 12);
  const tm = ((m % 12) + 12) % 12;
  const last = new Date(ty, tm + 1, 0).getDate();
  return `${ty}-${pad(tm + 1)}-${pad(Math.min(d, last))}`;
};

export const shortDate = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
export const monthYear = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
export const shiftMonth = (key: string, delta: number) => {
  const d = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

/**
 * Turns what a person types as money into cents, or NaN when it is not a number.
 * Accepts "25,90", "25.90", "1.234,56", "1,234.56", "12.500" (thousands) and "R$ 10".
 * With both separators the last one is the decimal. A lone dot followed by exactly three
 * digits is read as a thousands separator, so "12.500" is 12500 and "25.5" is 25.5.
 */
export const parseMoneyToCents = (raw: string): number => {
  let s = raw.replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.';
    const thousands = dec === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    s = s.split(',').length > 2 ? s.split(',').join('') : s.replace(',', '.');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) s = parts.join('');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
