// 앱 상태 + 액션. 뷰는 이 곳만 바라보고, 변경되면 'change' 이벤트로 다시 그린다.

import * as db from './db.js';
import { runRollover } from './archive.js';
import { dayKeyOf, uid } from './util.js';
import { releaseImages } from './media.js';

const listeners = new Set();

export const state = {
  ready: false,
  view: 'today',            // today | calendar | fragments
  todayKey: dayKeyOf(),
  entriesByDay: new Map(),  // dayKey -> entries[]
  archives: new Map(),      // dayKey -> archive record
  calendarMonth: (() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; })(),
  selectedDay: null,
  query: '',
  activeTag: null,
  editingId: null,
  theme: localStorage.getItem('gyul.theme') || 'auto',
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(reason = 'change') {
  for (const fn of listeners) fn(reason);
}

export function entriesOf(dayKey) {
  return state.entriesByDay.get(dayKey) || [];
}

export function todayEntries() {
  return entriesOf(state.todayKey);
}

export function isSealed(dayKey) {
  return state.archives.has(dayKey);
}

export function allDayKeys() {
  return [...state.entriesByDay.keys()].sort().reverse();
}

export async function reload() {
  const [byDay, archives] = await Promise.all([db.entriesByDay(), db.allArchives()]);
  state.entriesByDay = byDay;
  state.archives = new Map(archives.map((a) => [a.dayKey, a]));
  state.todayKey = dayKeyOf();
}

export async function init() {
  await db.openDb();
  await runRollover();
  await reload();
  state.ready = true;
  emit('init');
}

/* ---------- 액션 ---------- */

export async function addEntry({ text = '', images = [] }) {
  const trimmed = text.trim();
  if (!trimmed && !images.length) return null;
  const now = Date.now();
  const entry = {
    id: uid(),
    dayKey: dayKeyOf(new Date(now)),
    createdAt: now,
    updatedAt: now,
    text: trimmed,
    images,
    starred: false,
  };
  await db.putEntry(entry);
  await reload();
  emit('entry:add');
  return entry;
}

export async function updateEntry(id, patch) {
  const entry = await db.getEntry(id);
  if (!entry) return null;
  const next = { ...entry, ...patch, updatedAt: Date.now() };
  if (typeof next.text === 'string') next.text = next.text.trim();
  await db.putEntry(next);
  await reload();
  emit('entry:update');
  return next;
}

export async function toggleStar(id) {
  const entry = await db.getEntry(id);
  if (!entry) return;
  await updateEntry(id, { starred: !entry.starred });
}

export async function removeEntry(id) {
  const entry = await db.getEntry(id);
  if (entry?.images?.length) releaseImages(entry.images);
  await db.deleteEntry(id);
  await reload();
  emit('entry:remove');
}

export function setView(view) {
  if (state.view === view) return;
  state.view = view;
  emit('view');
}

export function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem('gyul.theme', theme);
  applyTheme();
  emit('theme');
}

export function applyTheme() {
  const root = document.documentElement;
  if (state.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', state.theme);
}

export function setQuery(q) {
  state.query = q;
  emit('query');
}

export function setActiveTag(tag) {
  state.activeTag = state.activeTag === tag ? null : tag;
  emit('tag');
}

export function openDay(dayKey) {
  state.selectedDay = dayKey;
  emit('day');
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
