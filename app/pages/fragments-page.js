// 일상 조각 모음 — 귤껍질 기록장(모두 읽기, 관리자만 쓰기)과 나도 기록해보기(각자의 기록장).

import { el, clear } from '../ui.js';
import * as store from '../store.js';
import { createTodayView } from '../views/today.js';
import { createCalendarView } from '../views/calendar.js';
import { createFragmentsView } from '../views/fragments.js';
import { sprite } from '../pixel.js';

const TAB_LABEL = { today: '오늘 쓰기', calendar: '달력', fragments: '조각 모음' };
const FACTORY = { today: createTodayView, calendar: createCalendarView, fragments: createFragmentsView };

export function tabsFor(book) {
  if (!book) return ['calendar', 'fragments'];
  const tabs = [];
  if (book.canWrite || book.denied) tabs.push('today');
  tabs.push('calendar', 'fragments');
  return tabs;
}

export function createFragmentsPage() {
  const views = { public: {}, mine: {} };
  let mounted = null; // { key, tab, view }

  const switcher = el('div', { class: 'book-switch', role: 'tablist', 'aria-label': '기록장 고르기' });
  const who = el('p', { class: 'book-sub' });
  const tabs = el('div', { class: 'book-tabs', role: 'tablist', 'aria-label': '보기 방식' });
  const body = el('div', { class: 'book-body' });
  const footer = el('div', { class: 'book-footer' });

  const root = el('section', { class: 'page fp', 'aria-labelledby': 'fp-title' },
    el('header', { class: 'fp-head' },
      el('div', { class: 'fp-title-row' },
        sprite('i-star', { scale: 3, className: 'fp-icon' }),
        el('h1', { class: 'px fp-title', id: 'fp-title', text: '일상 조각 모음' }),
      ),
      switcher,
      who,
    ),
    tabs,
    body,
  );

  function renderSwitcher() {
    clear(switcher);
    for (const key of ['public', 'mine']) {
      const b = store.book(key);
      const on = store.state.activeBook === key;
      switcher.append(el('button', {
        class: `book-pill${on ? ' on' : ''}`, type: 'button', role: 'tab',
        'aria-selected': on ? 'true' : 'false',
        text: key === 'public' ? '귤껍질 기록장' : '나의 기록장',
        onclick: () => store.setActiveBook(key),
        title: b?.subtitle || '',
      }));
    }
  }

  function renderWho(b) {
    clear(who);
    const me = store.state.env?.me;
    if (b.key === 'public') {
      who.append(b.canWrite
        ? '편집장 모드 · 여기 남긴 조각은 모두에게 공개돼요'
        : '귤껍질 편집장이 매일 모으는 인사이트 조각이에요. 날짜를 눌러 그날의 조각을 열어보세요.');
    } else if (b.status === 'signin') {
      who.append('로그인하면 나만의 기록장이 생겨요');
    } else {
      if (me?.avatarUrl) {
        const img = el('img', { class: 'who-avatar', src: me.avatarUrl, alt: '' });
        img.addEventListener('error', () => img.remove(), { once: true });
        who.append(img);
      }
      who.append(`${me?.name ? `${me.name}님의` : '나의'} 기록장 · 나만 볼 수 있어요`);
    }
  }

  function renderTabs(b) {
    clear(tabs);
    const list = tabsFor(b);
    tabs.hidden = b.status === 'signin';
    for (const t of list) {
      const on = store.state.bookTab[b.key] === t;
      tabs.append(el('button', {
        class: `book-tab${on ? ' on' : ''}`, type: 'button', role: 'tab',
        'aria-selected': on ? 'true' : 'false', text: TAB_LABEL[t],
        onclick: () => store.setBookTab(b.key, t),
      }));
    }
  }

  function renderFooter(b) {
    clear(footer);
    if (b.key === 'public') {
      footer.append(el('div', { class: 'join-card' },
        sprite('pencil', { scale: 3, className: 'join-icon' }),
        el('div', { class: 'join-text' },
          el('h2', { class: 'px', text: '나도 기록해보기' }),
          el('p', { text: '하루 동안 떠오른 생각과 링크, 사진을 나만의 기록장에 모아보세요. 자정이 되면 하루치가 조각으로 정리돼요.' }),
        ),
        el('button', {
          class: 'btn primary', type: 'button', text: '내 기록장 열기',
          onclick: () => { store.setActiveBook('mine'); root.scrollIntoView?.({ block: 'start' }); },
        }),
      ));
    } else {
      footer.append(el('button', {
        class: 'back-link', type: 'button', text: '← 귤껍질 기록장 구경하기',
        onclick: () => store.setActiveBook('public'),
      }));
    }
  }

  function signinCard(b) {
    const guest = store.state.env?.mode === 'guest';
    return el('div', { class: 'signin-card' },
      sprite('house', { scale: 3 }),
      el('h2', { class: 'px', text: b.key === 'public' ? '로그인하면 조각을 볼 수 있어요' : '로그인하면 기록장이 생겨요' }),
      el('p', {
        text: guest
          ? 'claude.ai에 로그인한 뒤 이 페이지를 다시 열어주세요. 기록은 로그인한 계정마다 따로 쌓여요.'
          : '로그인 정보를 확인하지 못했어요. 로그인 상태를 확인하고 페이지를 새로고침해 주세요.',
      }),
    );
  }

  function errorCard() {
    return el('div', { class: 'signin-card' },
      el('h2', { class: 'px', text: '조각을 불러오지 못했어요' }),
      el('p', { text: '잠시 뒤 페이지를 새로고침해 주세요. 계속되면 접근 권한이 바뀌었을 수 있어요.' }),
    );
  }

  function mount(b, tab) {
    if (mounted && mounted.key === b.key && mounted.tab === tab) return { view: mounted.view, fresh: false };
    mounted?.view?.deactivate?.();
    const cache = views[b.key];
    if (!cache[tab]) cache[tab] = FACTORY[tab](b.key);
    const view = cache[tab];
    clear(body);
    body.append(view.root);
    body.dataset.tab = tab;
    // 달력·조각 모음 아래에 '나도 기록해보기'를 붙인다. 오늘 쓰기는 입력창이 바닥에 있으니 붙이지 않는다.
    if (tab !== 'today') view.root.querySelector('.scroll')?.append(footer);
    mounted = { key: b.key, tab, view };
    view.update('mount');
    view.activate?.();
    return { view, fresh: true };
  }

  function update(reason) {
    const b = store.book();
    if (!b) {
      clear(body);
      body.dataset.tab = 'none';
      body.append(el('div', { class: 'signin-card' }, el('p', { class: 'px', text: '조각을 불러오는 중이에요…' })));
      return;
    }
    renderSwitcher();
    renderWho(b);

    if (b.status === 'signin' || b.status === 'error') {
      mounted?.view?.deactivate?.();
      mounted = null;
      tabs.hidden = true;
      clear(body);
      body.dataset.tab = 'none';
      body.append(b.status === 'signin' ? signinCard(b) : errorCard());
      renderFooter(b);
      body.append(footer);
      return;
    }

    const list = tabsFor(b);
    if (!list.includes(store.state.bookTab[b.key])) store.state.bookTab[b.key] = list[0];
    renderTabs(b);
    renderFooter(b);
    const { view, fresh } = mount(b, store.state.bookTab[b.key]);
    if (!fresh) view.update(reason);
  }

  return {
    root,
    update,
    activate() { mounted?.view?.activate?.(); },
    deactivate() { mounted?.view?.deactivate?.(); },
    focusSearch() {
      store.setBookTab(store.state.activeBook, 'fragments');
      setTimeout(() => mounted?.view?.focus?.(), 30);
    },
  };
}
