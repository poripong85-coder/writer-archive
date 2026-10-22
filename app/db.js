// IndexedDB 저장소 — 단독 실행(로컬 모드)용, 그리고 예전 버전에서 이 기기에 쌓인 조각을 읽어오는 용도.
// claude.ai 안에서 열리면 기록은 공유 저장소(db 기능)에 남고, 이 파일은 이전·백업에만 쓰인다.

const DB_NAME = 'gyulggeopjil';
const DB_VERSION = 2;

export const STORE_PUBLIC = 'entries';       // v1부터 쓰던 저장소 = 공개 기록장
export const STORE_MINE = 'mine_entries';    // v2: 내 기록장 (로컬 모드)
export const STORE_ARCHIVES = 'archives';    // v1 잔재 — 더는 쓰지 않지만 지우지 않는다
export const STORE_META = 'meta';

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [STORE_PUBLIC, STORE_MINE]) {
        if (!db.objectStoreNames.contains(name)) {
          const s = db.createObjectStore(name, { keyPath: 'id' });
          s.createIndex('dayKey', 'dayKey', { unique: false });
          s.createIndex('createdAt', 'createdAt', { unique: false });
        }
      }
      if (!db.objectStoreNames.contains(STORE_ARCHIVES)) {
        db.createObjectStore(STORE_ARCHIVES, { keyPath: 'dayKey' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('다른 탭에서 귤껍질이 열려 있어 저장소를 열 수 없어요.'));
  });
  return dbPromise;
}

function tx(db, stores, mode) {
  const t = db.transaction(stores, mode);
  const done = new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction aborted'));
  });
  return { t, done };
}

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/* ---------- entries ---------- */

export async function putEntry(store, entry) {
  const db = await openDb();
  const { t, done } = tx(db, [store], 'readwrite');
  t.objectStore(store).put(entry);
  await done;
  return entry;
}

export async function deleteEntry(store, id) {
  const db = await openDb();
  const { t, done } = tx(db, [store], 'readwrite');
  t.objectStore(store).delete(id);
  await done;
}

export async function getEntry(store, id) {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).get(id));
}

export async function allEntries(store) {
  const db = await openDb();
  const rows = await wrap(db.transaction(store).objectStore(store).getAll());
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function clearStore(store) {
  const db = await openDb();
  const { t, done } = tx(db, [store], 'readwrite');
  t.objectStore(store).clear();
  await done;
}

export async function bulkPut(store, entries = []) {
  const db = await openDb();
  const { t, done } = tx(db, [store], 'readwrite');
  const s = t.objectStore(store);
  for (const e of entries) s.put(e);
  await done;
}

/* ---------- meta ---------- */

export async function getMeta(key, fallback = null) {
  const db = await openDb();
  const row = await wrap(db.transaction(STORE_META).objectStore(STORE_META).get(key));
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  const db = await openDb();
  const { t, done } = tx(db, [STORE_META], 'readwrite');
  t.objectStore(STORE_META).put({ key, value });
  await done;
  return value;
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}
