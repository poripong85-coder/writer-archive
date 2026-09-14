// IndexedDB 저장소. 모든 데이터는 이 기기 안에만 남습니다.

const DB_NAME = 'gyulggeopjil';
const DB_VERSION = 1;

export const STORE_ENTRIES = 'entries';
export const STORE_ARCHIVES = 'archives';
export const STORE_META = 'meta';

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const s = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
        s.createIndex('dayKey', 'dayKey', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
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

export async function putEntry(entry) {
  const db = await openDb();
  const { t, done } = tx(db, [STORE_ENTRIES], 'readwrite');
  t.objectStore(STORE_ENTRIES).put(entry);
  await done;
  return entry;
}

export async function deleteEntry(id) {
  const db = await openDb();
  const { t, done } = tx(db, [STORE_ENTRIES], 'readwrite');
  t.objectStore(STORE_ENTRIES).delete(id);
  await done;
}

export async function getEntry(id) {
  const db = await openDb();
  return wrap(db.transaction(STORE_ENTRIES).objectStore(STORE_ENTRIES).get(id));
}

export async function entriesOfDay(dayKey) {
  const db = await openDb();
  const idx = db.transaction(STORE_ENTRIES).objectStore(STORE_ENTRIES).index('dayKey');
  const rows = await wrap(idx.getAll(IDBKeyRange.only(dayKey)));
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function allEntries() {
  const db = await openDb();
  const rows = await wrap(db.transaction(STORE_ENTRIES).objectStore(STORE_ENTRIES).getAll());
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

/** dayKey → 엔트리 배열 (시간순) */
export async function entriesByDay() {
  const rows = await allEntries();
  const map = new Map();
  for (const e of rows) {
    if (!map.has(e.dayKey)) map.set(e.dayKey, []);
    map.get(e.dayKey).push(e);
  }
  return map;
}

/* ---------- archives ---------- */

export async function putArchive(archive) {
  const db = await openDb();
  const { t, done } = tx(db, [STORE_ARCHIVES], 'readwrite');
  t.objectStore(STORE_ARCHIVES).put(archive);
  await done;
  return archive;
}

export async function allArchives() {
  const db = await openDb();
  const rows = await wrap(db.transaction(STORE_ARCHIVES).objectStore(STORE_ARCHIVES).getAll());
  return rows.sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
}

export async function sealedDayKeys() {
  return new Set((await allArchives()).map((a) => a.dayKey));
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

/* ---------- 전체 삭제 / 복원 ---------- */

export async function clearAll() {
  const db = await openDb();
  const { t, done } = tx(db, [STORE_ENTRIES, STORE_ARCHIVES, STORE_META], 'readwrite');
  t.objectStore(STORE_ENTRIES).clear();
  t.objectStore(STORE_ARCHIVES).clear();
  t.objectStore(STORE_META).clear();
  await done;
}

export async function bulkPut({ entries = [], archives = [] }) {
  const db = await openDb();
  const { t, done } = tx(db, [STORE_ENTRIES, STORE_ARCHIVES], 'readwrite');
  const es = t.objectStore(STORE_ENTRIES);
  const as = t.objectStore(STORE_ARCHIVES);
  for (const e of entries) es.put(e);
  for (const a of archives) as.put(a);
  await done;
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}
