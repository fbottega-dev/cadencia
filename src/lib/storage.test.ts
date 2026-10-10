import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { createDemoState, validateState, type State } from './domain';

let storage: typeof import('./storage');

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
  storage = await import('./storage');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function rename(state: State, name: string): State {
  return { ...state, decks: state.decks.map((deck, index) => index === 0 ? { ...deck, name } : deck) };
}

async function rawDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('cadencia', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeRaw(value: unknown): Promise<void> {
  const database = await rawDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('workspace', 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.objectStore('workspace').put(value, 'current');
    });
  } finally {
    database.close();
  }
}

async function readRaw(): Promise<{ exists: boolean; value: unknown }> {
  const database = await rawDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('workspace', 'readonly');
      const request = transaction.objectStore('workspace').openCursor('current');
      let value: unknown;
      let exists = false;
      request.onsuccess = () => {
        exists = request.result !== null;
        value = request.result?.value;
      };
      transaction.oncomplete = () => resolve({ exists, value });
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

/** A schema-valid workspace at an exact UTF-8 size, without exceeding field limits. */
function sizedState(bytes: number): State {
  const demo = createDemoState('2026-10-09');
  const state = validateState({
    ...demo,
    decks: [demo.decks[0]],
    cards: Array.from({ length: 1_100 }, (_, index) => ({
      ...demo.cards[0], id: `large-${index}`, front: 'q', back: 'a',
    })),
  });
  let remaining = bytes - new TextEncoder().encode(JSON.stringify(state)).byteLength;
  if (remaining < 0) throw new Error('Fixture requested below its base size.');
  for (const card of state.cards) {
    const padding = Math.min(1_999, remaining);
    card.back += 'a'.repeat(padding);
    remaining -= padding;
  }
  if (remaining !== 0) throw new Error('Fixture does not have enough padding capacity.');
  return state;
}

describe('IndexedDB persistence', () => {
  it('initializes one demo and reloads committed changes through a new module', async () => {
    const initial = await storage.loadState();
    expect(initial.cards.length).toBeGreaterThan(0);
    const saved = await storage.saveState(rename(initial, 'Minha coleção'), initial.revision);
    expect(saved.revision).toBe(initial.revision + 1);
    expect((await readRaw()).value).toEqual(saved);

    vi.resetModules();
    const reloaded = await import('./storage');
    expect(await reloaded.loadState()).toEqual(saved);
  });

  it('initializes concurrent first loads atomically', async () => {
    const states = await Promise.all([storage.loadState(), storage.loadState(), storage.loadState()]);
    expect(states[1]).toEqual(states[0]);
    expect(states[2]).toEqual(states[0]);
    expect((await readRaw()).value).toEqual(states[0]);
  });

  it('rejects a stale tab without replacing a newer edit', async () => {
    const stale = await storage.loadState();
    const latest = await storage.saveState(rename(stale, 'Edição mais recente'), stale.revision);
    await expect(storage.saveState(rename(stale, 'Edição antiga'), stale.revision)).rejects.toThrow(/outra aba.*Recarregue/);
    expect(await storage.loadState()).toEqual(latest);
  });

  it('allows only one of two competing saves at the same revision', async () => {
    const initial = await storage.loadState();
    const results = await Promise.allSettled([
      storage.saveState(rename(initial, 'Aba A'), initial.revision),
      storage.saveState(rename(initial, 'Aba B'), initial.revision),
    ]);
    const winners = results.filter((result) => result.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    if (winners[0].status !== 'fulfilled') throw new Error('Expected one committed save.');
    expect(await storage.loadState()).toEqual(winners[0].value);
    expect(winners[0].value.revision).toBe(initial.revision + 1);
  });

  it('snapshots the caller data before awaiting IndexedDB', async () => {
    const initial = await storage.loadState();
    const candidate = rename(initial, 'Nome escolhido');
    const saving = storage.saveState(candidate, initial.revision);
    candidate.decks[0].name = 'Alteração após salvar';
    await saving;
    expect((await storage.loadState()).decks[0].name).toBe('Nome escolhido');
    expect(candidate.revision).toBe(initial.revision);
  });

  it('uses the local revision when replacing data from a backup', async () => {
    const initial = await storage.loadState();
    const imported = { ...rename(initial, 'Importada'), revision: 99 };
    const saved = await storage.saveState(imported, initial.revision);
    expect(saved.revision).toBe(initial.revision + 1);
    expect(saved.decks[0].name).toBe('Importada');
  });

  it.each([null, undefined, { schemaVersion: 99 }, { unexpected: 'data' }])(
    'preserves a corrupt record (%j), including stored undefined', async (corrupt) => {
      const initial = await storage.loadState();
      await writeRaw(corrupt);
      await expect(storage.loadState()).rejects.toThrow(/corrompidos.*preservado/);
      await expect(storage.saveState(initial, initial.revision)).rejects.toThrow(/corrompidos.*preservado/);
      expect(await readRaw()).toEqual({ exists: true, value: corrupt });
    },
  );

  it('keeps the original data when the browser refuses a write for lack of space', async () => {
    const initial = await storage.loadState();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Quota exhausted', 'QuotaExceededError');
    });
    await expect(storage.saveState(rename(initial, 'Sem espaço'), initial.revision)).rejects.toThrow(/sem espaço/);
    expect(await storage.loadState()).toEqual(initial);
  });

  it('retries opening after a temporary storage denial', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new DOMException('Storage denied', 'SecurityError');
    });
    await expect(storage.loadState()).rejects.toThrow(/bloqueou o armazenamento/);
    expect((await storage.loadState()).schemaVersion).toBe(1);
  });

  it('rejects invalid saves without changing the persisted workspace', async () => {
    const initial = await storage.loadState();
    await expect(storage.saveState({ ...initial, revision: -1 }, initial.revision)).rejects.toThrow();
    await expect(storage.saveState(initial, Number.MAX_SAFE_INTEGER)).rejects.toThrow(/revisão.*inválida/);
    expect(await storage.loadState()).toEqual(initial);
  });
});

describe('JSON backups', () => {
  it('exports and reimports a validated workspace without losing data', () => {
    const initial = createDemoState('2026-10-09');
    expect(storage.parseBackup(storage.serializeBackup(initial))).toEqual(initial);
  });

  it.each(['not json', '{}', '{"schemaVersion":99}'])(
    'rejects an invalid import (%s) without touching IndexedDB', async (text) => {
      const initial = await storage.loadState();
      expect(() => storage.parseBackup(text)).toThrow();
      expect(await storage.loadState()).toEqual(initial);
    },
  );

  it('measures UTF-8 bytes rather than JavaScript string length', () => {
    const oversized = 'é'.repeat(storage.MAX_BACKUP_BYTES / 2 + 1);
    expect(oversized.length).toBeLessThan(storage.MAX_BACKUP_BYTES);
    expect(() => storage.parseBackup(oversized)).toThrow(/2 MiB/);
  });

  it('roundtrips and persists a workspace exactly at the accepted byte limit', async () => {
    const initial = await storage.loadState();
    const boundary = sizedState(storage.MAX_BACKUP_BYTES);
    const saved = await storage.saveState(boundary, initial.revision);
    const backup = storage.serializeBackup(saved);
    expect(new TextEncoder().encode(backup).byteLength).toBe(storage.MAX_BACKUP_BYTES);
    expect(storage.parseBackup(backup)).toEqual(saved);
    expect(await storage.loadState()).toEqual(saved);
  });

  it('rejects an oversized save before changing data, and prevents an unusable export', async () => {
    const initial = await storage.loadState();
    const oversized = sizedState(storage.MAX_BACKUP_BYTES + 1);
    await expect(storage.saveState(oversized, initial.revision)).rejects.toThrow(/limite local.*2 MiB/);
    expect(() => storage.serializeBackup(oversized)).toThrow(/2 MiB/);
    expect(() => storage.parseBackup(JSON.stringify(oversized))).toThrow(/2 MiB/);
    expect(await storage.loadState()).toEqual(initial);
  });
});
