// 기록장(Book) — 하루의 조각을 쌓는 단위.
//  public : 귤껍질 기록장. 모두 읽고, 관리자만 쓴다.
//  mine   : 나만 보는 기록장. 로그인한 사람마다 따로 있다.
// 뷰는 이 인터페이스만 본다. 실제 저장 위치(공유 저장소/IndexedDB)는 하위 클래스가 숨긴다.

import * as local from './db.js';
import { releaseImages } from './media.js';
import { uid, dayKeyOf } from './util.js';

const LIVE_LIMIT = 1000; // 한 번에 실시간으로 받아보는 최근 조각 수

export class WriteDeniedError extends Error {
  constructor() {
    super('아직 이 기록장에 쓸 권한이 없어요.');
    this.code = 'denied';
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function newEntry({ text = '', images = [] }) {
  const now = Date.now();
  return {
    id: uid(),
    dayKey: dayKeyOf(new Date(now)),
    createdAt: now,
    updatedAt: now,
    text: String(text).trim(),
    images,
    starred: false,
  };
}

/** 저장소에서 읽은 값을 화면이 믿고 쓸 모양으로 다듬는다 (공유 데이터는 신뢰하지 않음). */
export function normalizeEntry(raw) {
  const createdAt = Number(raw.createdAt) || Date.now();
  return {
    id: String(raw.id),
    dayKey: typeof raw.dayKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.dayKey)
      ? raw.dayKey : dayKeyOf(new Date(createdAt)),
    createdAt,
    updatedAt: Number(raw.updatedAt) || createdAt,
    text: typeof raw.text === 'string' ? raw.text : '',
    images: Array.isArray(raw.images) ? raw.images.filter((i) => i && (i.asset || i.blob)) : [],
    starred: !!raw.starred,
  };
}

export class Book {
  constructor(key, { title, subtitle }) {
    this.key = key;
    this.title = title;
    this.subtitle = subtitle;
    this.entries = [];
    this.status = 'idle';     // idle | loading | ready | signin | error
    this.canWrite = false;    // 입력창을 보여줄지
    this.canUpload = false;   // 사진 버튼을 보여줄지
    this.denied = false;      // 써보려 했으나 권한이 없다고 거절됨
    this.error = null;
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(reason) {
    for (const fn of this.listeners) fn(reason, this);
  }

  get(id) {
    return this.entries.find((e) => e.id === id) || null;
  }

  byDay() {
    const map = new Map();
    for (const e of this.entries) {
      if (!map.has(e.dayKey)) map.set(e.dayKey, []);
      map.get(e.dayKey).push(e);
    }
    return map;
  }

  entriesOf(dayKey) {
    return this.entries.filter((e) => e.dayKey === dayKey);
  }

  /** 최신 날짜가 먼저 */
  dayKeys() {
    return [...new Set(this.entries.map((e) => e.dayKey))].sort().reverse();
  }

  start() {}
  stop() {}
}

/* ---------- 공유 저장소 (claude.ai db) ---------- */

export class CloudBook extends Book {
  /**
   * @param {object} o
   * @param {object} o.db      claude.use('db')
   * @param {object|null} o.assets  claude.use('assets') — null이면 사진 불가
   * @param {string} o.path    컬렉션 경로
   * @param {boolean|null} o.canWrite  true/false, null = 써봐야 안다
   */
  constructor(key, meta, { db, assets, path, canWrite }) {
    super(key, meta);
    this.db = db;
    this.assets = assets;
    this.path = path;
    this.canWrite = canWrite !== false;
    this.writeConfirmed = canWrite === true;
    this.canUpload = this.canWrite && !!assets;
    this.unsub = null;
  }

  ref() {
    return this.db.collection(this.path);
  }

  start() {
    if (this.unsub) return;
    this.status = 'loading';
    this.emit('status');
    const q = this.ref().orderBy('createdAt', 'desc').limit(LIVE_LIMIT);
    this.unsub = q.onSnapshot(
      (snap) => {
        this.entries = snap.docs
          .map((d) => normalizeEntry({ ...d.data(), id: d.id }))
          .sort((a, b) => a.createdAt - b.createdAt);
        this.status = 'ready';
        this.emit('data');
      },
      (err) => {
        this.status = 'error';
        this.error = err;
        this.emit('error');
      },
    );
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
  }

  async write(fn) {
    try {
      const out = await fn();
      if (!this.writeConfirmed) this.writeConfirmed = true;
      return out;
    } catch (err) {
      if (err?.code === 'unavailable') {
        await sleep(300 + Math.random() * 500);
        return fn();
      }
      // 규칙에 막힌 쓰기는 invalid_argument 로 온다. 한 번도 성공한 적 없으면 권한 없음으로 본다.
      if (err?.code === 'invalid_argument' && !this.writeConfirmed) {
        this.denied = true;
        this.canWrite = false;
        this.canUpload = false;
        this.emit('denied');
        throw new WriteDeniedError();
      }
      throw err;
    }
  }

  async uploadPhotos(prepared = []) {
    if (!prepared.length) return [];
    if (!this.assets) throw new Error('여기서는 사진을 올릴 수 없어요.');
    const out = [];
    for (const p of prepared) {
      const res = await this.assets.upload(p.blob, { type: p.type });
      out.push({ id: p.id, asset: res.id, width: p.width, height: p.height, type: res.contentType, name: p.name });
    }
    return out;
  }

  async add({ text, images = [] }) {
    const uploaded = await this.uploadPhotos(images);
    const entry = newEntry({ text, images: uploaded });
    const { id, ...body } = entry;
    await this.write(() => this.ref().doc(id).set(body));
    return entry;
  }

  async update(id, patch) {
    const body = { ...patch, updatedAt: Date.now() };
    if (typeof body.text === 'string') body.text = body.text.trim();
    await this.write(() => this.ref().doc(id).update(body));
  }

  async remove(id) {
    const entry = this.get(id);
    await this.write(() => this.ref().doc(id).delete());
    // 조각을 지우면 그 조각에만 붙어 있던 사진 파일도 정리한다.
    if (this.assets && entry?.images?.length) {
      for (const img of entry.images) {
        if (img.asset) await this.assets.delete(img.asset).catch(() => {});
      }
    }
  }

  async clearAll() {
    for (const e of [...this.entries]) await this.remove(e.id);
  }

  /** 백업/이전: 사진은 Blob을 올리고 asset id로 바꿔 저장한다. id가 같으면 덮어쓴다. */
  async importEntries(list = []) {
    let n = 0;
    for (const raw of list) {
      const e = normalizeEntry({ ...raw, images: [] });
      const blobs = (raw.images || []).filter((i) => i?.blob);
      const images = blobs.length ? await this.uploadPhotos(blobs.map((b) => ({
        id: b.id || uid('img'), blob: b.blob, type: b.type || b.blob.type || 'image/jpeg',
        width: b.width || 0, height: b.height || 0, name: b.name || '사진',
      }))) : (raw.images || []).filter((i) => i?.asset);
      const { id, ...body } = { ...e, images };
      await this.write(() => this.ref().doc(id).set(body));
      n += 1;
    }
    return n;
  }
}

/* ---------- 이 브라우저 (IndexedDB) ---------- */

export class LocalBook extends Book {
  constructor(key, meta, { store }) {
    super(key, meta);
    this.store = store;
    this.canWrite = true;
    this.canUpload = true;
  }

  async start() {
    this.status = 'loading';
    this.emit('status');
    try {
      await this.refresh('data');
    } catch (err) {
      this.status = 'error';
      this.error = err;
      this.emit('error');
    }
  }

  async refresh(reason = 'data') {
    const rows = await local.allEntries(this.store);
    this.entries = rows.map((r) => ({ ...normalizeEntry(r), images: r.images || [] }));
    this.status = 'ready';
    this.emit(reason);
  }

  async add({ text, images = [] }) {
    const entry = newEntry({ text, images });
    await local.putEntry(this.store, entry);
    await this.refresh('entry:add');
    return entry;
  }

  async update(id, patch) {
    const entry = await local.getEntry(this.store, id);
    if (!entry) return;
    const next = { ...entry, ...patch, updatedAt: Date.now() };
    if (typeof next.text === 'string') next.text = next.text.trim();
    await local.putEntry(this.store, next);
    await this.refresh('entry:update');
  }

  async remove(id) {
    const entry = await local.getEntry(this.store, id);
    if (entry?.images?.length) releaseImages(entry.images);
    await local.deleteEntry(this.store, id);
    await this.refresh('entry:remove');
  }

  async clearAll() {
    await local.clearStore(this.store);
    await this.refresh('clear');
  }

  async importEntries(list = []) {
    const rows = list.map((raw) => ({
      ...normalizeEntry({ ...raw, images: [] }),
      images: (raw.images || []).filter((i) => i?.blob),
    }));
    await local.bulkPut(this.store, rows);
    await this.refresh('import');
    return rows.length;
  }
}

/* ---------- 로그인이 필요한 자리 ---------- */

export class SigninBook extends Book {
  constructor(key, meta) {
    super(key, meta);
    this.status = 'signin';
  }
}

/* ---------- 환경에 맞는 기록장 만들기 ---------- */

export const BOOK_META = {
  public: { title: '귤껍질 기록장', subtitle: '편집장이 매일 모으는 인사이트 조각' },
  mine: { title: '나의 기록장', subtitle: '나만 볼 수 있는 하루의 조각' },
};

export function createBooks(env) {
  if (env.mode === 'local') {
    return {
      public: new LocalBook('public', BOOK_META.public, { store: local.STORE_PUBLIC }),
      mine: new LocalBook('mine', BOOK_META.mine, { store: local.STORE_MINE }),
    };
  }
  if (env.mode === 'cloud') {
    const isOwner = env.me.isOwner;
    const pub = new CloudBook('public', BOOK_META.public, {
      db: env.db, assets: isOwner ? env.assets : null, path: 'fragments', canWrite: isOwner,
    });
    const mine = env.me.id
      ? new CloudBook('mine', BOOK_META.mine, {
          db: env.db,
          assets: env.assets,
          path: `data/users/${env.me.id}`,
          // 관리자·편집자는 확실히 쓸 수 있다. 그 밖에는 써봐야 안다(규칙이 결정).
          canWrite: env.me.isOwner || env.me.canEdit ? true : null,
        })
      : new SigninBook('mine', BOOK_META.mine);
    return { public: pub, mine };
  }
  // guest: 저장소 자체가 없다
  return {
    public: new SigninBook('public', BOOK_META.public),
    mine: new SigninBook('mine', BOOK_META.mine),
  };
}
