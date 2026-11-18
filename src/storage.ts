import { Directory, File, Paths } from 'expo-file-system';
import { AppData, SCHEMA_VERSION, emptyData } from './types';
import { today } from './utils';

/**
 * Persistence strategy (local only, no network):
 *  - main file `data.json` in the app's document dir (not cleared by the OS like cache)
 *  - atomic write: write `data.json.tmp`, validate, then replace `data.json`
 *  - before each overwrite the previous good file is kept as `data.prev.json`
 *  - one dated snapshot per day in `backups/`, last MAX_BACKUPS are kept
 *  - before a manual restore, the in-memory state is written to `backups/antes-de-restaurar-<time>.json` (never cleaned up)
 *  - on load, if main file is missing/corrupt we fall back to prev, then newest backup
 *  - export/import lets the user keep a copy outside the app (see backup.ts)
 */
const MAX_BACKUPS = 30;
const dir = () => new Directory(Paths.document, 'finance-control');
const backupsDir = () => new Directory(dir(), 'backups');
const mainFile = () => new File(dir(), 'data.json');
const tmpFile = () => new File(dir(), 'data.json.tmp');
const prevFile = () => new File(dir(), 'data.prev.json');
const corruptFile = () => new File(dir(), 'data.corrupt.json');

function ensureDirs() {
  if (!dir().exists) dir().create({ intermediates: true });
  if (!backupsDir().exists) backupsDir().create({ intermediates: true });
}

function parseCategories(raw: unknown) {
  const r = raw as { expense?: unknown; income?: unknown } | null | undefined;
  const clean = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : null);
  const expense = clean(r?.expense);
  const income = clean(r?.income);
  return expense && income ? { expense, income } : undefined;
}

/** The refund type was removed. An old refund is kept as income (money that came back), without card or method. */
function dropRefund(t: any) {
  if (t?.type !== 'refund') return t;
  const { cardId, method, paid, due, ...rest } = t;
  return { ...rest, type: 'income' };
}

/** yyyy-mm-dd that exists on the calendar (rejects 2026-02-31 and 2026-13-01). */
const isRealDate = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return false;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3];
};

/** An investment needs a bank; the current value, when informed, is a whole number of cents >= 0, and the rate is only a note. */
const validInvestment = (t: any) =>
  typeof t.bank === 'string' && !!t.bank.trim() && (t.currentValueCents === undefined || (Number.isInteger(t.currentValueCents) && t.currentValueCents >= 0)) && (t.ratePct === undefined || typeof t.ratePct === 'string');

/** An investment has no card, method, status, vencimento or series: whatever a file carries for them is dropped. */
function dropInvestmentExpenseFields(t: any) {
  if (t?.type !== 'investment') return t;
  const { cardId, method, paid, due, installment, recurring, ...rest } = t;
  return rest;
}

export function parseData(raw: string): AppData {
  const obj = JSON.parse(raw);
  if (!obj || !Array.isArray(obj.transactions)) throw new Error('Formato inválido');
  // v1 -> v2: `cards` did not exist, old transactions simply have no cardId
  const cards = Array.isArray(obj.cards) ? obj.cards : [];
  // a card without id/name or with a non-array `paid` would crash the screens that sort and read it
  if (!cards.every((c: any) => typeof c?.id === 'string' && typeof c?.name === 'string' && (c.paid === undefined || Array.isArray(c.paid)))) {
    throw new Error('Formato inválido');
  }
  const transactions = obj.transactions.map(dropRefund).map(dropInvestmentExpenseFields);
  // a transaction without these fields passes the loader but crashes the sort and the totals on every launch
  const valid = (t: any) =>
    typeof t?.id === 'string' && typeof t.date === 'string' && typeof t.createdAt === 'string' && (t.type === 'expense' || t.type === 'income' || t.type === 'investment') && Number.isInteger(t.amountCents) && t.amountCents >= 0 && isRealDate(t.date) && (t.type !== 'investment' || validInvestment(t));
  if (!transactions.every(valid)) throw new Error('Formato inválido');
  return {
    schemaVersion: SCHEMA_VERSION,
    cards,
    settings: obj.settings && typeof obj.settings === 'object' ? obj.settings : undefined,
    categories: parseCategories(obj.categories),
    transactions,
    updatedAt: obj.updatedAt ?? new Date().toISOString(),
  };
}

async function tryRead(f: File): Promise<AppData | null> {
  try {
    if (!f.exists) return null;
    return parseData(await f.text());
  } catch {
    return null;
  }
}

export async function loadData(): Promise<AppData> {
  ensureDirs();
  // the validated tmp file is newer than main when a save died between deleting main and moving tmp over it
  for (const f of [mainFile(), tmpFile(), prevFile()]) {
    const data = await tryRead(f);
    if (data) return data;
  }
  // listing backups can throw: only do it when the main files are no good
  // pre-restore copies come last: they are only a safety net, daily snapshots are the normal fallback
  const files = [...listBackups(), ...listRestorePoints()];
  for (const f of files) {
    const data = await tryRead(f);
    if (data) return data;
  }
  // data files exist but none is readable: starting empty would let the next save overwrite what may still be recoverable
  // (an empty tmp is a first install that died between create and write: nothing to protect)
  if (mainFile().exists || prevFile().exists || (tmpFile().exists && (tmpFile().size ?? 0) > 0) || files.length > 0) throw new Error('Dados ilegíveis');
  return emptyData(); // first launch: nothing was ever saved
}

/** The file most likely to still hold the user's data, as-is (even if unreadable), so it can be shared for rescue. */
export const rescueFile = (): File | undefined =>
  [mainFile(), prevFile(), ...listBackups(), ...listRestorePoints()].find((f) => f.exists && (f.size ?? 0) > 0);

const listIn = (re: RegExp): File[] =>
  backupsDir().exists
    ? (backupsDir().list().filter((e) => e instanceof File && re.test(e.name)) as File[]).sort((a, b) => b.name.localeCompare(a.name)) // newest first (name = ISO date)
    : [];

/** Daily snapshots only (yyyy-mm-dd.json): the only files the MAX_BACKUPS cleanup may delete. */
const listBackups = () => listIn(/^\d{4}-\d{2}-\d{2}\.json$/);
const listRestorePoints = () => listIn(/^antes-de-restaurar-.*\.json$/);

/** Writes the in-memory state to a file that is never reused or cleaned up, before a restore replaces it. */
export async function saveRestorePoint(data: AppData): Promise<void> {
  ensureDirs();
  const f = new File(backupsDir(), `antes-de-restaurar-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  f.create();
  await f.write(JSON.stringify(data, null, 2));
}

export async function saveData(data: AppData): Promise<AppData> {
  ensureDirs();
  const next: AppData = { ...data, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() };
  const json = JSON.stringify(next, null, 2);
  parseData(json); // sanity check before touching anything

  const tmp = tmpFile();
  if (tmp.exists) tmp.delete();
  tmp.create();
  // write/copy/move are async in expo-file-system: every one must be awaited,
  // otherwise we would validate/delete while the previous step is still running.
  await tmp.write(json);
  if (!(await tryRead(tmp))) throw new Error('Falha ao validar gravação');

  const main = mainFile();
  const mainOk = main.exists && !!(await tryRead(main));
  if (mainOk) {
    const prev = prevFile();
    if (prev.exists) prev.delete();
    await main.copy(prev);
  }
  if (main.exists) {
    if (!mainOk) {
      // an unreadable main may still hold something recoverable: keep a copy instead of losing it
      const bad = corruptFile();
      if (bad.exists) bad.delete();
      await main.copy(bad);
    }
    main.delete();
  }
  await tmp.move(main);

  // data.json is already saved: a failed daily snapshot (e.g. full disk) must not look like a failed save
  await snapshotDaily(json).catch(() => {});
  return next;
}

async function snapshotDaily(json: string) {
  const name = `${today()}.json`;
  const snap = new File(backupsDir(), name);
  if (!snap.exists) snap.create();
  await snap.write(json); // one per day, latest state of that day
  listBackups().slice(MAX_BACKUPS).forEach((f) => f.delete());
}
