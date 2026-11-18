import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory fake of the parts of expo-file-system that storage.ts uses.
const fs = vi.hoisted(() => ({ files: new Map<string, string>(), dirs: new Set<string>() }));
vi.mock('expo-file-system', () => {
  const join = (parent: unknown, name: string) => `${String((parent as { uri?: string })?.uri ?? parent)}/${name}`;
  class Entry {
    uri: string;
    name: string;
    constructor(parent: unknown, name: string) {
      this.uri = join(parent, name);
      this.name = name;
    }
  }
  class File extends Entry {
    get exists() { return fs.files.has(this.uri); }
    get size() { return fs.files.get(this.uri)?.length ?? null; }
    create() { fs.files.set(this.uri, ''); }
    delete() { fs.files.delete(this.uri); }
    async text() { return fs.files.get(this.uri) ?? ''; }
    async write(s: string) { fs.files.set(this.uri, s); }
    async copy(to: File) { fs.files.set(to.uri, fs.files.get(this.uri) ?? ''); }
    async move(to: File) { fs.files.set(to.uri, fs.files.get(this.uri) ?? ''); fs.files.delete(this.uri); }
  }
  class Directory extends Entry {
    get exists() { return fs.dirs.has(this.uri); }
    create() { fs.dirs.add(this.uri); }
    list() {
      return [...fs.files.keys()].filter((k) => k.startsWith(this.uri + '/')).map((k) => new File(this.uri, k.slice(this.uri.length + 1)));
    }
  }
  return { File, Directory, Paths: { document: { uri: 'doc' } } };
});
import { loadData, saveRestorePoint } from './storage';

const D = 'doc/finance-control';
const good = (id: string) => JSON.stringify({ transactions: [{ id, date: '2026-01-15', createdAt: 'c', type: 'expense', amountCents: 100 }] });

beforeEach(() => {
  fs.files.clear();
  fs.dirs.clear();
});

describe('loadData', () => {
  it('uses prev when main is corrupt', async () => {
    fs.files.set(`${D}/data.json`, '{ nope');
    fs.files.set(`${D}/data.prev.json`, good('prev'));
    expect((await loadData()).transactions[0].id).toBe('prev');
  });
  it('throws when files exist but none is readable', async () => {
    fs.files.set(`${D}/data.json`, '{ nope');
    await expect(loadData()).rejects.toThrow();
  });
  it('starts empty when there is no data file', async () => {
    expect((await loadData()).transactions).toEqual([]);
  });
  it('starts empty when only an empty tmp exists', async () => {
    fs.files.set(`${D}/data.json.tmp`, '');
    expect((await loadData()).transactions).toEqual([]);
  });
});

describe('saveRestorePoint', () => {
  it('writes the given state to a restore file that loadData can fall back to', async () => {
    await saveRestorePoint({ schemaVersion: 2, cards: [], transactions: [], updatedAt: 'u' });
    const names = [...fs.files.keys()].filter((k) => k.startsWith(`${D}/backups/antes-de-restaurar-`));
    expect(names).toHaveLength(1);
    expect(await loadData()).toMatchObject({ transactions: [] });
  });
});
