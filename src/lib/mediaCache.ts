const DB_NAME = 'zeno_media_cache_v1';
const STORE_NAME = 'media_blobs';
const DB_VERSION = 1;
const MAX_CACHE_ENTRIES = 25;
const MAX_CACHE_TOTAL_BYTES = 120 * 1024 * 1024;
const MAX_ENTRY_AGE_MS = 48 * 60 * 60 * 1000;

interface CachedMediaRecord {
  key: string;
  blob: Blob;
  size: number;
  accessedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openMediaCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('accessedAt', 'accessedAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

export async function getCachedMediaBlob(key: string): Promise<Blob | null> {
  const db = await openMediaCacheDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const record = getReq.result as CachedMediaRecord | undefined;
        if (!record || !(record.blob instanceof Blob)) {
          resolve(null);
          return;
        }
        if (Date.now() - record.accessedAt > MAX_ENTRY_AGE_MS) {
          try {
            store.delete(key);
          } catch {
            // Ignore cleanup failure
          }
          resolve(null);
          return;
        }
        // Refresh LRU timestamp
        try {
          store.put({ ...record, accessedAt: Date.now() });
        } catch {
          // Ignore LRU touch error
        }
        resolve(record.blob);
      };
      getReq.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function pruneMediaCache(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const allReq = store.getAll();
      allReq.onsuccess = () => {
        const records = (allReq.result as CachedMediaRecord[]) || [];
        const now = Date.now();
        const valid: CachedMediaRecord[] = [];
        for (const rec of records) {
          if (now - rec.accessedAt > MAX_ENTRY_AGE_MS) {
            store.delete(rec.key);
          } else {
            valid.push(rec);
          }
        }
        valid.sort((a, b) => b.accessedAt - a.accessedAt);
        let totalSize = 0;
        for (let i = 0; i < valid.length; i += 1) {
          const rec = valid[i];
          totalSize += rec.size || rec.blob?.size || 0;
          if (i >= MAX_CACHE_ENTRIES || totalSize > MAX_CACHE_TOTAL_BYTES) {
            store.delete(rec.key);
          }
        }
        resolve();
      };
      allReq.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function setCachedMediaBlob(key: string, blob: Blob): Promise<void> {
  if (!(blob instanceof Blob) || blob.size === 0 || blob.size > 95 * 1024 * 1024) return;
  const db = await openMediaCacheDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        key,
        blob,
        size: blob.size,
        accessedAt: Date.now(),
      } satisfies CachedMediaRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });

  await pruneMediaCache(db);
}

export async function deleteCachedMediaBlob(key: string): Promise<void> {
  const db = await openMediaCacheDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
