import { Directory, File, Paths } from 'expo-file-system';
import { AppData, SCHEMA_VERSION, emptyData } from './types';

/**
 * Persistence strategy (local only, no network):
 *  - main file `data.json` in the app's document dir (not cleared by the OS like cache)
 *  - atomic write: write `data.json.tmp`, validate, then replace `data.json`
 *  - before each overwrite the previous good file is kept as `data.prev.json`
 *  - one dated snapshot per day in `backups/`, last MAX_BACKUPS are kept
 *  - on load, if main file is missing/corrupt we fall back to prev, then newest backup
 *  - export/import lets the user keep a copy outside the app (see backup.ts)
 */
const MAX_BACKUPS = 30;
const dir = () => new Directory(Paths.document, 'finance-control');
const backupsDir = () => new Directory(dir(), 'backups');
const mainFile = () => new File(dir(), 'data.json');
const tmpFile = () => new File(dir(), 'data.json.tmp');
const prevFile = () => new File(dir(), 'data.prev.json');

function ensureDirs() {
  if (!dir().exists) dir().create({ intermediates: true });
  if (!backupsDir().exists) backupsDir().create({ intermediates: true });
}

export function parseData(raw: string): AppData {
  const obj = JSON.parse(raw);
  if (!obj || !Array.isArray(obj.transactions)) throw new Error('Formato inválido');
  // v1 -> v2: `cards` did not exist, old transactions simply have no cardId
  return {
    schemaVersion: SCHEMA_VERSION,
    cards: Array.isArray(obj.cards) ? obj.cards : [],
    settings: obj.settings && typeof obj.settings === 'object' ? obj.settings : undefined,
    transactions: obj.transactions,
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
  const candidates: File[] = [mainFile(), prevFile(), ...listBackups()];
  for (const f of candidates) {
    const data = await tryRead(f);
    if (data) return data;
  }
  return emptyData();
}

function listBackups(): File[] {
  if (!backupsDir().exists) return [];
  return (backupsDir().list().filter((e) => e instanceof File) as File[])
    .sort((a, b) => b.name.localeCompare(a.name)); // newest first (name = ISO date)
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
  if (main.exists && (await tryRead(main))) {
    const prev = prevFile();
    if (prev.exists) prev.delete();
    await main.copy(prev);
  }
  if (main.exists) main.delete();
  await tmp.move(main);

  await snapshotDaily(json);
  return next;
}

async function snapshotDaily(json: string) {
  const name = `${new Date().toISOString().slice(0, 10)}.json`;
  const snap = new File(backupsDir(), name);
  if (!snap.exists) snap.create();
  await snap.write(json); // one per day, latest state of that day
  listBackups().slice(MAX_BACKUPS).forEach((f) => f.delete());
}

export function getMainFile(): File {
  return mainFile();
}
