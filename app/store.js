// 앱 상태. 화면은 여기만 바라보고, 바뀌면 'change' 이벤트로 다시 그린다.

import { dayKeyOf } from './util.js';

export const ROUTES = ['home', 'intro', 'fragments', 'factory', 'stay', 'guestbook'];

const listeners = new Set();

function lsGet(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 저장 못 해도 동작은 한다 */ }
}

export const state = {
  route: 'home',
  env: null,          // detectEnv() 결과
  books: null,        // { public, mine }
  pages: null,        // createPages()
  guestbook: null,    // createGuestbook()
  activeBook: 'public',
  bookTab: { public: 'calendar', mine: 'today' },
  todayKey: dayKeyOf(),
  calendarMonth: (() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; })(),
  query: '',
  activeTag: null,
  theme: lsGet('gyul.theme', 'auto'),
};

export const storage = { get: lsGet, set: lsSet };

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(reason = 'change', detail) {
  for (const fn of listeners) fn(reason, detail);
}

export function book(key = state.activeBook) {
  return state.books?.[key] || null;
}

/* ---------- 라우팅 ---------- */

export function go(route, { replace = false } = {}) {
  if (!ROUTES.includes(route)) route = 'home';
  if (state.route === route) return;
  state.route = route;
  const hash = route === 'home' ? '' : `#${route}`;
  try {
    if (replace) history.replaceState(null, '', hash || location.pathname + location.search);
    else history.pushState(null, '', hash || location.pathname + location.search);
  } catch { /* 액자 안에서 막혀도 화면 전환은 된다 */ }
  emit('route');
}

export function routeFromHash() {
  const h = (location.hash || '').replace(/^#/, '');
  return ROUTES.includes(h) ? h : 'home';
}

/* ---------- 기록장 ---------- */

export function setActiveBook(key) {
  if (state.activeBook === key) return;
  state.activeBook = key;
  state.query = '';
  state.activeTag = null;
  emit('book');
}

export function setBookTab(key, tab) {
  state.bookTab[key] = tab;
  emit('tab');
}

export function setQuery(q) {
  state.query = q;
  emit('query');
}

export function setActiveTag(tag) {
  state.activeTag = state.activeTag === tag ? null : tag;
  if (state.activeTag) state.bookTab[state.activeBook] = 'fragments';
  emit('tag');
}

export function moveMonth(delta) {
  const { year, month } = state.calendarMonth;
  const d = new Date(year, month + delta, 1);
  state.calendarMonth = { year: d.getFullYear(), month: d.getMonth() };
  emit('month');
}

export function goToMonthOfToday() {
  const d = new Date();
  state.calendarMonth = { year: d.getFullYear(), month: d.getMonth() };
  emit('month');
}

export function setToday(key) {
  state.todayKey = key;
  emit('day');
}

/* ---------- 테마 ---------- */

export function setTheme(theme) {
  state.theme = theme;
  lsSet('gyul.theme', theme);
  applyTheme();
  emit('theme');
}

export function applyTheme() {
  const root = document.documentElement;
  if (state.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', state.theme);
}

/* ---------- 방명록을 남기면 홈에서 별 하나가 떨어진다 ---------- */

const STAR_KEY = 'gyul.starDrop';

export function queueStarDrop() {
  state.starDrop = true;
  try { sessionStorage.setItem(STAR_KEY, '1'); } catch { /* 메모리 표시만으로도 충분 */ }
}

/** 예약된 별이 있으면 true를 돌려주고 예약을 지운다 (한 번만) */
export function takeStarDrop() {
  let queued = !!state.starDrop;
  try {
    queued = queued || sessionStorage.getItem(STAR_KEY) === '1';
    sessionStorage.removeItem(STAR_KEY);
  } catch { /* 무시 */ }
  state.starDrop = false;
  return queued;
}
