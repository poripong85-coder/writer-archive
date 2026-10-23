// 와글와글 방명록 — 누구나 읽고, 로그인한 사람이 남기고, 내 글은 내가·모든 글은 편집장이 지운다.
// 저장 위치는 환경마다 다르다.
//   web   : Supabase guestbook 표 (글쓴이·편집장 배지·시각은 서버 트리거가 채움)
//   cloud : claude.ai db — guestbook/<내 id> 문서에 내 글 목록, 편집장 글은 guestbook/_owner
//   local : 이 브라우저 IndexedDB (meta 'guestbook')

import { getMeta, setMeta } from './db.js';
import { uid } from './util.js';

export const STAMPS = ['gyul', 'star', 'pencil', 'house', 'heart'];
export const MAX_MESSAGE = 300;
export const MAX_NAME = 20;
const OWNER_DOC = '_owner';
const PER_PERSON_KEEP = 50;   // claude.ai 모드에서 한 사람 문서에 남겨 두는 글 수
const LIST_LIMIT = 200;

function clean(raw) {
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.parse(raw.createdAt) || Date.now();
  return {
    id: String(raw.id),
    docId: raw.docId || null,
    userId: raw.userId || null,
    name: String(raw.name || '').slice(0, MAX_NAME) || '손님',
    byAdmin: !!raw.byAdmin,
    stamp: STAMPS.includes(raw.stamp) ? raw.stamp : 'gyul',
    message: String(raw.message || '').slice(0, MAX_MESSAGE),
    createdAt,
  };
}

export function validate({ name, message, stamp }) {
  const n = String(name || '').trim();
  const m = String(message || '').trim();
  if (!n) return '이름을 적어주세요.';
  if (n.length > MAX_NAME) return `이름은 ${MAX_NAME}자까지 쓸 수 있어요.`;
  if (!m) return '남길 말을 적어주세요.';
  if (m.length > MAX_MESSAGE) return `한마디는 ${MAX_MESSAGE}자까지 쓸 수 있어요.`;
  if (!STAMPS.includes(stamp)) return '스탬프를 골라주세요.';
  return null;
}

/** 브라우저 쪽 도배 방지 (서버에서도 막는다) */
const recent = [];
function tooFast() {
  const now = Date.now();
  while (recent.length && now - recent[0] > 60000) recent.shift();
  return recent.length >= 3;
}

export function createGuestbook(env) {
  const listeners = new Set();
  const me = env.me || {};
  const book = {
    items: [],
    status: 'idle',          // idle | loading | ready | error | unavailable
    canRead: ['web', 'cloud', 'local'].includes(env.mode),
    canWrite: env.mode === 'local' || ((env.mode === 'web' || env.mode === 'cloud') && !!me.id),
    canModerate: env.mode === 'local' || !!me.isOwner,
    denied: false,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    isMine(item) {
      if (env.mode === 'local') return true;
      if (env.mode === 'cloud') return me.isOwner ? item.docId === OWNER_DOC : item.docId === me.id;
      return !!me.id && item.userId === me.id;
    },
    canDelete(item) { return book.canModerate || book.isMine(item); },
    start, add, remove,
  };
  const emit = (reason) => { for (const fn of listeners) fn(reason); };
  const setItems = (list) => {
    book.items = list.map(clean).sort((a, b) => b.createdAt - a.createdAt).slice(0, LIST_LIMIT);
    book.status = 'ready';
    emit('data');
  };

  /* ---------- web (Supabase) ---------- */
  async function webLoad() {
    const { data, error } = await env.sb.from('guestbook')
      .select('id, user_id, author_name, by_admin, stamp, message, created_at')
      .order('created_at', { ascending: false }).limit(LIST_LIMIT);
    if (error) { book.status = 'error'; emit('error'); return; }
    setItems(data.map((r) => ({
      id: r.id, userId: r.user_id, name: r.author_name, byAdmin: r.by_admin,
      stamp: r.stamp, message: r.message, createdAt: r.created_at,
    })));
  }
  function webError(error) {
    const msg = String(error?.message || '');
    if (error?.code === 'P0001' || /천천히|rate/i.test(msg) || error?.hint === 'rate_limited') return '조금 천천히 남겨주세요. 1분에 3개까지 쓸 수 있어요.';
    if (error?.code === '42501' || /row-level security|permission/i.test(msg)) return '로그인한 뒤에 남길 수 있어요.';
    if (error?.code === '23514') return '이름이나 글 길이를 확인해 주세요.';
    return '남기지 못했어요. 잠시 뒤 다시 시도해 주세요.';
  }

  /* ---------- cloud (claude.ai db) ---------- */
  let cloudDocs = new Map(); // docId -> items[]
  function cloudFlatten() {
    const out = [];
    for (const [docId, items] of cloudDocs) {
      for (const it of items) {
        out.push({ ...it, docId, userId: docId === OWNER_DOC ? null : docId, byAdmin: docId === OWNER_DOC });
      }
    }
    setItems(out);
  }
  async function cloudWrite(docId, mutate) {
    const ref = env.db.doc(`guestbook/${docId}`);
    const snap = await ref.get();
    const items = Array.isArray(snap.data()?.items) ? snap.data().items : [];
    const next = mutate(items);
    try {
      await ref.set({ items: next });
    } catch (err) {
      if (err?.code === 'invalid_argument') {
        book.denied = true;
        book.canWrite = false;
        emit('denied');
        throw new Error('아직 방명록을 남길 수 있는 권한이 없어요.');
      }
      throw new Error('남기지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    }
  }

  /* ---------- 공통 ---------- */
  function start() {
    if (!book.canRead) { book.status = 'unavailable'; emit('status'); return; }
    book.status = 'loading';
    emit('status');
    if (env.mode === 'web') {
      webLoad();
      env.sb.channel('live-guestbook')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'guestbook' }, () => webLoad())
        .subscribe();
    } else if (env.mode === 'cloud') {
      env.db.collection('guestbook').onSnapshot((snap) => {
        cloudDocs = new Map(snap.docs.map((d) => [d.id, Array.isArray(d.data()?.items) ? d.data().items : []]));
        cloudFlatten();
      }, () => { book.status = 'error'; emit('error'); });
    } else {
      getMeta('guestbook', []).then((rows) => setItems(rows || [])).catch(() => setItems([]));
    }
  }

  async function add({ name, stamp, message }) {
    const problem = validate({ name, message, stamp });
    if (problem) throw new Error(problem);
    if (!book.canWrite) throw new Error('로그인한 뒤에 남길 수 있어요.');
    if (tooFast()) throw new Error('조금 천천히 남겨주세요. 1분에 3개까지 쓸 수 있어요.');
    const item = { name: name.trim(), stamp, message: message.trim() };

    if (env.mode === 'web') {
      const { error } = await env.sb.from('guestbook').insert({ author_name: item.name, stamp: item.stamp, message: item.message });
      if (error) throw new Error(webError(error));
      recent.push(Date.now());
      await webLoad();
    } else if (env.mode === 'cloud') {
      const docId = me.isOwner ? OWNER_DOC : me.id;
      const entry = { id: uid('gb'), ...item, createdAt: Date.now() };
      await cloudWrite(docId, (items) => [entry, ...items].slice(0, PER_PERSON_KEEP));
      recent.push(Date.now());
    } else {
      const rows = (await getMeta('guestbook', [])) || [];
      rows.unshift({ id: uid('gb'), ...item, byAdmin: true, createdAt: Date.now() });
      await setMeta('guestbook', rows.slice(0, LIST_LIMIT));
      recent.push(Date.now());
      setItems(rows);
    }
  }

  async function remove(item) {
    if (!book.canDelete(item)) throw new Error('지울 수 없는 글이에요.');
    if (env.mode === 'web') {
      const { error } = await env.sb.from('guestbook').delete().eq('id', item.id);
      if (error) throw new Error('지우지 못했어요.');
      await webLoad();
    } else if (env.mode === 'cloud') {
      await cloudWrite(item.docId, (items) => items.filter((it) => it.id !== item.id));
    } else {
      const rows = ((await getMeta('guestbook', [])) || []).filter((r) => r.id !== item.id);
      await setMeta('guestbook', rows);
      setItems(rows);
    }
  }

  return book;
}
