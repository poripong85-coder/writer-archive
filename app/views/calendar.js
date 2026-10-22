// 달력 — 날짜별로 조각을 훑어보는 화면. 날짜를 누르면 그날 조각이 열린다.

import { el, clear, fragmentCard, openSheet, emptyState } from '../ui.js';
import * as store from '../store.js';
import {
  WEEKDAYS, monthMatrix, densityLevel, formatDayLabel,
  summarize, highlightOf, extractUrls,
} from '../util.js';

export function createCalendarView(bookKey) {
  const book = () => store.book(bookKey);
  let selected = null;

  const head = el('div', { class: 'cal-head' });
  const stats = el('div', { class: 'month-stats' });
  const weekdays = el('div', { class: 'cal-weekdays' });
  const grid = el('div', { class: 'cal-grid' });
  const legend = el('div', { class: 'cal-legend' },
    el('span', {}, el('i', { class: 'cal-dot note' }), ' 메모'),
    el('span', {}, el('i', { class: 'cal-dot link' }), ' 링크'),
    el('span', {}, el('i', { class: 'cal-dot photo' }), ' 사진'),
    el('span', { text: '칸이 진할수록 그날 조각이 많아요' }),
  );
  const scroll = el('div', { class: 'scroll' }, head, stats, weekdays, grid, legend);
  const root = el('div', { class: 'view' }, scroll);

  for (const [i, w] of WEEKDAYS.entries()) {
    weekdays.append(el('div', { class: i === 0 ? 'sun' : i === 6 ? 'sat' : '', text: w }));
  }

  function openDaySheet(dayKey) {
    const entries = book()?.entriesOf(dayKey) || [];
    selected = dayKey;
    renderGrid();
    openSheet(formatDayLabel(dayKey), (body) => {
      if (!entries.length) {
        body.append(emptyState('🌙', '이 날은 기록이 없어요', '조각이 없는 날도 하루의 일부예요.'));
        return;
      }
      body.append(fragmentCard(dayKey, entries, { sealed: dayKey < store.state.todayKey, limit: 999 }));
    });
  }

  function renderHead() {
    const { year, month } = store.state.calendarMonth;
    const now = new Date();
    const isThisMonth = year === now.getFullYear() && month === now.getMonth();
    clear(head);
    head.append(
      el('div', { class: 'cal-title' }, `${year}년 ${month + 1}월`,
        isThisMonth ? el('span', { text: '이번 달' }) : null),
      el('div', { class: 'cal-nav' },
        el('button', { class: 'chip', type: 'button', 'aria-label': '이전 달', text: '‹', onclick: () => store.moveMonth(-1) }),
        el('button', { class: 'chip', type: 'button', text: '오늘', onclick: () => store.goToMonthOfToday() }),
        el('button', { class: 'chip', type: 'button', 'aria-label': '다음 달', text: '›', onclick: () => store.moveMonth(1) }),
      ),
    );
  }

  function renderStats() {
    const { year, month } = store.state.calendarMonth;
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    let days = 0, count = 0, links = 0, photos = 0;
    for (const [dayKey, entries] of book()?.byDay() || []) {
      if (!dayKey.startsWith(prefix) || !entries.length) continue;
      const s = summarize(entries);
      days += 1; count += s.count; links += s.links; photos += s.photos;
    }
    clear(stats);
    for (const [n, label] of [[days, '기록한 날'], [count, '조각'], [links, '링크'], [photos, '사진']]) {
      stats.append(el('div', { class: 'stat-tile' }, el('b', { text: String(n) }), el('span', { text: label })));
    }
  }

  function renderGrid() {
    const { year, month } = store.state.calendarMonth;
    const todayKey = store.state.todayKey;
    const byDay = book()?.byDay() || new Map();
    clear(grid);
    for (const week of monthMatrix(year, month)) {
      for (const cell of week) {
        const entries = byDay.get(cell.dayKey) || [];
        const s = summarize(entries);
        const hasNote = entries.some((e) => {
          let t = e.text || '';
          for (const u of extractUrls(t)) t = t.replace(u, '');
          return t.trim().length > 0;
        });

        const classes = ['cal-cell'];
        if (!cell.inMonth) classes.push('other');
        if (cell.dayKey === todayKey) classes.push('today');
        if (cell.weekday === 0) classes.push('sun');
        if (cell.weekday === 6) classes.push('sat');
        if (selected === cell.dayKey) classes.push('selected');

        const node = el('button', {
          class: classes.join(' '),
          type: 'button',
          dataset: { level: String(densityLevel(s.count)), day: cell.dayKey },
          'aria-label': `${cell.dayKey} 조각 ${s.count}개`,
          onclick: () => openDaySheet(cell.dayKey),
        },
          el('span', { class: 'cal-peel' }),
          el('span', { class: 'cal-daynum', text: String(cell.day) }),
        );

        if (s.count) {
          const preview = highlightOf(entries);
          if (preview) node.append(el('span', { class: 'cal-preview', text: preview }));
          node.append(el('span', { class: 'cal-badges' },
            hasNote ? el('i', { class: 'cal-dot note' }) : null,
            s.links ? el('i', { class: 'cal-dot link' }) : null,
            s.photos ? el('i', { class: 'cal-dot photo' }) : null,
            el('span', { class: 'cal-count', text: String(s.count) }),
          ));
        }
        grid.append(node);
      }
    }
  }

  function update() {
    renderHead();
    renderStats();
    renderGrid();
  }

  return { root, update, activate() {}, deactivate() {}, openDaySheet };
}
