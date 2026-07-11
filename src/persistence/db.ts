import type { WorldSnapshot } from '../sim/types.ts';

// In-browser persistence via IndexedDB. No external server: snapshots live in
// the visitor's browser and survive across sessions. Everything the simulation
// needs is inside `snapshot`, so a record fully recreates a moment in time.
export interface SnapshotRecord {
  id: string;
  name: string;
  createdAt: number;
  day: number;
  auto?: boolean;
  snapshot: WorldSnapshot;
}

const DB_NAME = 'simulacra';
const STORE = 'snapshots';
const VERSION = 1;
export const AUTOSAVE_ID = 'auto:last';

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function putSnapshot(rec: SnapshotRecord): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const r = tx(db, 'readwrite').put(rec);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

export async function getSnapshot(id: string): Promise<SnapshotRecord | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = tx(db, 'readonly').get(id);
    r.onsuccess = () => resolve(r.result as SnapshotRecord | undefined);
    r.onerror = () => reject(r.error);
  });
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const r = tx(db, 'readwrite').delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

// Named (non-auto) snapshots, newest first.
export async function listSnapshots(): Promise<SnapshotRecord[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = tx(db, 'readonly').getAll();
    r.onsuccess = () => {
      const all = (r.result as SnapshotRecord[]).filter((s) => !s.auto);
      all.sort((a, b) => b.createdAt - a.createdAt);
      resolve(all);
    };
    r.onerror = () => reject(r.error);
  });
}
