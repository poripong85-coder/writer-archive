// 일상 모임 조각 — 위에는 모임 소개 카드, 아래는 귤껍질 기록장(모두 읽기, 편집장만 쓰기).
// 방문자는 로그인하지 않으므로 '나의 기록장'은 보여주지 않는다.

import { el, clear } from '../ui.js';
import * as store from '../store.js';
import { createTodayView } from '../views/today.js';
import { createCalendarView } from '../views/calendar.js';
import { createFragmentsView } from '../views/fragments.js';
import { sprite } from '../pixel.js';
import { MEETINGS, pageMeta, pageLead, pageStatus } from './page.js';
import { PRODUCTS } from '../shop.js';

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
  const views = { public: {} };
  let mounted = null; // { key, tab, view }

  const meetings = el('div', { class: 'meet-list' });
  const who = el('p', { class: 'book-sub' });
  const tabs = el('div', { class: 'book-tabs', role: 'tablist', 'aria-label': '보기 방식' });
  const body = el('div', { class: 'book-body' });

  const root = el('section', { class: 'page fp', 'aria-labelledby': 'fp-title' },
    el('header', { class: 'fp-head' },
      el('div', { class: 'fp-title-row' },
        sprite('i-star', { scale: 3, className: 'fp-icon' }),
        el('h1', { class: 'px fp-title', id: 'fp-title', text: '일상 모임 조각' }),
      ),
    ),
    el('section', { class: 'meet', 'aria-labelledby': 'meet-title' },
      el('h2', { class: 'px meet-title', id: 'meet-title', text: '모임 소개' }),
      meetings,
    ),
    el('div', { class: 'fp-book-head' },
      el('h2', { class: 'px meet-title', text: '귤껍질 기록장' }),
      who,
    ),
    tabs,
    body,
  );

  function renderMeetings() {
    clear(meetings);
    for (const key of MEETINGS) {
      const meta = pageMeta(key);
      meetings.append(el('a', {
        class: 'meet-card', href: `#${key}`,
        onclick: (e) => { e.preventDefault(); store.go(key); },
      },
        sprite(meta.icon, { scale: 3, className: 'meet-icon' }),
        el('span', { class: 'meet-text' },
          el('strong', { class: 'meet-name', text: meta.title }),
          pageStatus(key) ? el('span', { class: 'status-pill', text: pageStatus(key) }) : null,
          el('span', { class: 'meet-lead', text: pageLead(key) }),
        ),
        el('span', { class: 'meet-go', 'aria-hidden': 'true', text: '→' }),
      ));
    }
    const shop = PRODUCTS['buy-snowman'];
    meetings.append(el('a', {
      class: 'meet-card shop-card', href: '#buy-snowman',
      onclick: (e) => { e.preventDefault(); store.go('buy-snowman'); },
    },
      sprite(shop.icon, { scale: 3, className: 'meet-icon' }),
      el('span', { class: 'meet-text' },
        el('strong', { class: 'meet-name', text: `${shop.name} 구매하기` }),
        shop.buyUrl ? null : el('span', { class: 'status-pill', text: shop.status }),
      ),
      el('span', { class: 'meet-go', 'aria-hidden': 'true', text: '→' }),
    ));
  }

  function renderWho(b) {
    clear(who);
    who.append(b.canWrite
      ? '편집장 모드 · 여기 남긴 조각은 모두에게 공개돼요'
      : '귤껍질 편집장이 매일 모으는 인사이트 조각이에요. 날짜를 눌러 그날의 조각을 열어보세요.');
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

  function signinCard(b) {
    const env = store.state.env;
    if (env?.mode === 'offline') {
      return el('div', { class: 'signin-card' },
        el('h2', { class: 'px', text: '연결하지 못했어요' }),
        el('p', { text: '인터넷 연결을 확인하고 페이지를 새로고침해 주세요.' }),
      );
    }
    const guest = env?.mode === 'guest';
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
    root.dataset.tab = tab;
    mounted = { key: b.key, tab, view };
    view.update('mount');
    view.activate?.();
    return { view, fresh: true };
  }

  function update(reason) {
    renderMeetings();
    const b = store.book('public');
    if (!b) {
      clear(body);
      body.dataset.tab = 'none';
      root.dataset.tab = 'none';
      body.append(el('div', { class: 'signin-card' }, el('p', { class: 'px', text: '조각을 불러오는 중이에요…' })));
      return;
    }
    renderWho(b);

    if (b.status === 'signin' || b.status === 'error') {
      mounted?.view?.deactivate?.();
      mounted = null;
      tabs.hidden = true;
      clear(body);
      body.dataset.tab = 'none';
      root.dataset.tab = 'none';
      body.append(b.status === 'signin' ? signinCard(b) : errorCard());
      return;
    }

    const list = tabsFor(b);
    if (!list.includes(store.state.bookTab[b.key])) store.state.bookTab[b.key] = list[0];
    renderTabs(b);
    const { view, fresh } = mount(b, store.state.bookTab[b.key]);
    if (!fresh) view.update(reason);
  }

  return {
    root,
    update,
    activate() { mounted?.view?.activate?.(); },
    deactivate() { mounted?.view?.deactivate?.(); },
    focusSearch() {
      store.setBookTab('public', 'fragments');
      setTimeout(() => mounted?.view?.focus?.(), 30);
    },
  };
}
