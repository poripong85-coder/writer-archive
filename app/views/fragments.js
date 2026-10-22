// 조각 — 지난 하루들을 검색하고 태그로 골라 보는 화면.

import { el, clear, fragmentCard, emptyState } from '../ui.js';
import * as store from '../store.js';
import { entryMatches, extractTags, normalize, summarize } from '../util.js';

export function createFragmentsView(bookKey) {
  const book = () => store.book(bookKey);
  const searchInput = el('input', {
    id: `search-${bookKey}`, type: 'search', placeholder: '내용이나 태그로 찾기', 'aria-label': '조각 검색',
  });
  const tagRow = el('div', { class: 'tag-row' });
  const toolbar = el('div', { class: 'frag-toolbar' },
    el('div', { class: 'search-box' },
      el('span', { html: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" fill="none"/><path d="M16 16l4.5 4.5"/></svg>' }),
      searchInput,
    ),
    tagRow,
  );
  const list = el('div', { class: 'frag-list' });
  const scroll = el('div', { class: 'scroll' }, toolbar, list);
  const root = el('div', { class: 'view' }, scroll);

  let syncing = false;
  searchInput.addEventListener('input', () => {
    if (!syncing) store.setQuery(searchInput.value);
  });

  function topTags() {
    const counts = new Map();
    for (const e of book()?.entries || []) {
      for (const t of extractTags(e.text)) {
        const k = t.toLowerCase();
        const prev = counts.get(k);
        counts.set(k, { tag: prev?.tag || t, count: (prev?.count || 0) + 1 });
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 14);
  }

  function renderTags() {
    clear(tagRow);
    const tags = topTags();
    if (!tags.length) return;
    tagRow.append(el('button', {
      class: `chip${store.state.activeTag ? '' : ' on'}`, type: 'button', text: '전체',
      onclick: () => { if (store.state.activeTag) store.setActiveTag(store.state.activeTag); },
    }));
    for (const t of tags) {
      const on = normalize(store.state.activeTag) === normalize(t.tag);
      tagRow.append(el('button', {
        class: `chip${on ? ' on' : ''}`, type: 'button', text: `#${t.tag} ${t.count}`,
        onclick: () => store.setActiveTag(t.tag),
      }));
    }
  }

  function filtered() {
    const { query, activeTag } = store.state;
    const b = book();
    if (!b) return [];
    const byDay = b.byDay();
    const out = [];
    for (const dayKey of b.dayKeys()) {
      let entries = byDay.get(dayKey) || [];
      if (activeTag) {
        const want = normalize(activeTag);
        entries = entries.filter((e) => extractTags(e.text).some((t) => normalize(t) === want));
      }
      if (query.trim()) entries = entries.filter((e) => entryMatches(e, query));
      if (entries.length) out.push([dayKey, entries]);
    }
    return out;
  }

  function renderList() {
    clear(list);
    const days = filtered();
    const filtering = store.state.query.trim() || store.state.activeTag;

    if (!days.length) {
      list.append(filtering
        ? emptyState('🔍', '찾는 조각이 없어요', '다른 말이나 태그로 다시 찾아보세요.')
        : emptyState('🍊', '아직 모인 조각이 없어요',
            '오늘 남긴 기록은 자정이 지나면 하루치 인사이트 조각으로 정리됩니다.'));
      return;
    }

    if (filtering) {
      const total = days.reduce((n, [, e]) => n + e.length, 0);
      list.append(el('div', { class: 'section-label', text: `${days.length}일 · 조각 ${total}개` }));
    } else {
      const s = summarize(days.flatMap(([, e]) => e));
      list.append(el('div', {
        class: 'section-label',
        text: `${days.length}일 동안 조각 ${s.count}개 · 링크 ${s.links} · 사진 ${s.photos}`,
      }));
    }

    for (const [dayKey, entries] of days) {
      list.append(fragmentCard(dayKey, entries, { sealed: dayKey < store.state.todayKey }));
    }
  }

  function update() {
    syncing = true;
    if (searchInput.value !== store.state.query) searchInput.value = store.state.query;
    syncing = false;
    renderTags();
    renderList();
  }

  return { root, update, activate() {}, deactivate() {}, focus: () => searchInput.focus() };
}
