// 소개 · 책공장 · 북스테이 — 관리자가 화면에서 바로 고치는 글.
// 공유 저장소에서는 pages/<key> 문서, 로컬에서는 IndexedDB meta에 둔다.

import { getMeta, setMeta } from './db.js';

export const PAGE_KEYS = ['intro', 'factory', 'stay'];

function clean(raw) {
  if (!raw) return null;
  return {
    lead: typeof raw.lead === 'string' ? raw.lead : '',
    body: typeof raw.body === 'string' ? raw.body : '',
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

export function createPages(env) {
  const docs = new Map();         // key -> {lead, body, updatedAt} | null
  const listeners = new Set();
  const unsubs = [];
  const canEdit = env.mode === 'local' || env.me.isOwner;

  const emit = (key) => { for (const fn of listeners) fn(key); };

  function start() {
    if (env.mode === 'cloud') {
      for (const key of PAGE_KEYS) {
        unsubs.push(env.db.doc(`pages/${key}`).onSnapshot(
          (snap) => { docs.set(key, snap.exists ? clean(snap.data()) : null); emit(key); },
          () => { docs.set(key, null); emit(key); },
        ));
      }
    } else if (env.mode === 'local') {
      Promise.all(PAGE_KEYS.map(async (key) => {
        docs.set(key, clean(await getMeta(`page:${key}`, null)));
        emit(key);
      })).catch(() => {});
    } else {
      for (const key of PAGE_KEYS) docs.set(key, null);
    }
  }

  async function save(key, { lead, body }) {
    const doc = { lead: lead.trim(), body: body.trim(), updatedAt: Date.now() };
    if (env.mode === 'cloud') await env.db.doc(`pages/${key}`).set(doc);
    else if (env.mode === 'local') { await setMeta(`page:${key}`, doc); docs.set(key, doc); emit(key); }
    else throw new Error('여기서는 저장할 수 없어요.');
  }

  return {
    canEdit,
    start,
    stop: () => unsubs.forEach((u) => u()),
    get: (key) => docs.get(key),
    loaded: (key) => docs.has(key),
    save,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
