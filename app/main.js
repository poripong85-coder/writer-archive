// 귤껍질 출판사 — 부팅, 메뉴와 라우팅, 설정, 자정 알림, 예전 기록 옮기기.

import * as store from './store.js';
import { detectEnv, isFramedRuntime } from './env.js';
import { createBooks } from './books.js';
import { createPages } from './pages.js';
import { watchMidnight, daysSealedSince } from './clock.js';
import { el, clear, toast, openSheet, confirmDialog, fragmentCard } from './ui.js';
import { sprite } from './pixel.js';
import { createHomePage } from './pages/home.js';
import { createFragmentsPage } from './pages/fragments-page.js';
import { createTextPage } from './pages/page.js';
import { exportBackup, parseBackup } from './backup.js';
import * as local from './db.js';
import { formatBytes, relativeDayLabel, formatDayShort } from './util.js';

const framed = isFramedRuntime();
const main = document.getElementById('main');
const navLinks = [...document.querySelectorAll('[data-route]')];
const menuBtn = document.getElementById('btn-menu');
const nav = document.getElementById('site-nav');

const pages = {
  home: createHomePage(),
  intro: createTextPage('intro'),
  fragments: createFragmentsPage(),
  factory: createTextPage('factory'),
  stay: createTextPage('stay'),
};

let mounted = null;
const pendingSeal = { public: [], mine: [] };

/* ---------- 화면 그리기 ---------- */

function render(reason) {
  const name = store.state.route;
  const page = pages[name];
  if (mounted !== name) {
    pages[mounted]?.deactivate?.();
    clear(main);
    main.append(page.root);
    main.dataset.route = name;
    mounted = name;
    page.activate?.();
    page.update('route');
    main.scrollTop = 0;
    closeMenu();
  } else {
    page.update(reason);
  }
  for (const a of navLinks) {
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  maybeShowSeal();
}

/* ---------- 메뉴 ---------- */

for (const a of navLinks) {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    store.go(a.dataset.route);
  });
}

function closeMenu() {
  nav.classList.remove('open');
  menuBtn?.setAttribute('aria-expanded', 'false');
}

menuBtn?.addEventListener('click', () => {
  const open = !nav.classList.contains('open');
  nav.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
});

document.addEventListener('click', (e) => {
  if (!nav.classList.contains('open')) return;
  if (nav.contains(e.target) || menuBtn.contains(e.target)) return;
  closeMenu();
});

window.addEventListener('popstate', () => {
  const r = store.routeFromHash();
  if (r !== store.state.route) { store.state.route = r; store.emit('route'); }
});
window.addEventListener('hashchange', () => {
  const r = store.routeFromHash();
  if (r !== store.state.route) { store.state.route = r; store.emit('route'); }
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    store.go('fragments');
    pages.fragments.focusSearch();
  }
  if (e.key === 'Escape') closeMenu();
});

const logoMark = document.querySelector('.logo-mark');
if (logoMark) logoMark.replaceWith(sprite('i-gyul', { scale: 2, className: 'logo-mark' }));

/* ---------- 봉인 알림 (자정 / 오랜만에 열었을 때) ---------- */

const seenKey = (key) => `gyul.seen.${key}`;

function queueReopenNotice(book) {
  if (!book.canWrite) return;
  const last = store.storage.get(seenKey(book.key), null);
  const days = daysSealedSince(last, store.state.todayKey, book.dayKeys());
  if (!last) store.storage.set(seenKey(book.key), store.state.todayKey);
  if (days.length) pendingSeal[book.key] = days;
}

function maybeShowSeal() {
  if (store.state.route !== 'fragments') return;
  const key = store.state.activeBook;
  const book = store.book(key);
  if (!book?.canWrite || book.status !== 'ready') return;
  const days = pendingSeal[key];
  store.storage.set(seenKey(key), store.state.todayKey);
  if (!days?.length || document.querySelector('.sheet-backdrop')) return;
  pendingSeal[key] = [];
  showSealSheet(book, days);
}

function showSealSheet(book, days) {
  const total = days.reduce((n, d) => n + book.entriesOf(d).length, 0);
  if (!total) return;
  const title = days.length === 1 ? `${relativeDayLabel(days[0])}의 하루가 조각으로 정리됐어요` : `지난번 이후 ${days.length}일치가 조각으로 정리됐어요`;
  openSheet(title, (body, close) => {
    body.append(el('p', {
      class: 'sheet-note',
      text: `${book.title} · 조각 ${total}개가 봉인됐어요. 달력과 조각 모음에서 언제든 다시 볼 수 있어요.`,
    }));
    for (const d of days.slice(-3).reverse()) {
      body.append(el('div', { class: 'sheet-card' }, fragmentCard(d, book.entriesOf(d), { sealed: true, limit: 3 })));
    }
    body.append(el('button', {
      class: 'btn primary wide', type: 'button', text: '조각 모음 보기',
      onclick: () => { close(); store.setBookTab(book.key, 'fragments'); },
    }));
  });
}

function onDayChange(prev, next) {
  store.setToday(next);
  for (const key of ['public', 'mine']) {
    const b = store.book(key);
    if (b?.canWrite && b.entriesOf(prev).length) pendingSeal[key] = [prev];
  }
  const writer = ['public', 'mine'].map(store.book).find((b) => b?.canWrite && b.entriesOf(prev).length);
  if (writer && store.state.route !== 'fragments') toast(`${formatDayShort(prev)}의 조각이 정리됐어요`, { peel: true, ms: 4200 });
  maybeShowSeal();
}

/* ---------- 설정 ---------- */

document.getElementById('btn-settings').addEventListener('click', openSettings);

function row(label, desc, ...controls) {
  return el('div', { class: 'setting-row' },
    el('div', { class: 'setting-text' }, el('div', { class: 'label', text: label }), desc ? el('div', { class: 'desc', text: desc }) : null),
    controls.length ? el('div', { class: 'setting-controls' }, ...controls) : null,
  );
}

function whoText(env) {
  if (!env) return ['확인하는 중', '접속 정보를 불러오고 있어요'];
  if (env.mode === 'local') return ['이 브라우저에서 단독 실행 중', '기록은 이 기기에만 저장돼요. claude.ai에 올리면 로그인·공유 기능이 켜져요.'];
  if (env.mode === 'guest') return ['로그인하지 않은 상태', 'claude.ai에 로그인하면 기록을 보고 나만의 기록장을 쓸 수 있어요.'];
  if (env.me.isOwner) return ['편집장(관리자)으로 접속 중', '귤껍질 기록장과 소개 페이지를 쓰고 고칠 수 있어요.'];
  return ['방문자로 접속 중', '귤껍질 기록장은 읽기만 할 수 있고, 나의 기록장은 나만 볼 수 있어요.'];
}

function openSettings() {
  openSheet('설정', async (body, close) => {
    const env = store.state.env;
    const [who, whoDesc] = whoText(env);
    body.append(row(who, whoDesc));

    if (!framed) {
      body.append(row('화면 테마', '기기 설정을 따르거나 직접 고를 수 있어요',
        el('div', { class: 'seg' },
          ...[['auto', '자동'], ['light', '밝게'], ['dark', '어둡게']].map(([v, label]) =>
            el('button', {
              type: 'button', class: store.state.theme === v ? 'on' : '', text: label,
              onclick: (e) => {
                store.setTheme(v);
                [...e.target.parentElement.children].forEach((b) => b.classList.toggle('on', b === e.target));
              },
            })),
        )));
    }

    const books = ['public', 'mine'].map(store.book).filter((b) => b && b.status === 'ready');
    for (const b of books) {
      const mayExport = b.canWrite || (b.key === 'public' && env?.me?.isOwner);
      if (!mayExport) continue;
      const fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) return;
        try {
          const entries = await parseBackup(await file.text());
          toast(`${entries.length}개 조각을 되돌리는 중…`);
          const n = await b.importEntries(entries);
          toast(`${b.title}에 ${n}개 조각을 되돌렸어요`, { peel: true });
        } catch (err) {
          toast(err?.message || '되돌리지 못했어요');
        }
      });
      body.append(row(`${b.title} 백업`, `조각 ${b.entries.length}개 · 사진까지 JSON 한 파일로 내보내고 되돌려요`,
        el('button', {
          class: 'btn', type: 'button', text: '내보내기',
          onclick: async () => {
            try {
              const res = await exportBackup(b, env);
              if (res.status === 'saved') toast(`${res.count}개 조각을 내보냈어요`);
              else if (res.status === 'copy') showCopyBackup(res);
            } catch (err) {
              toast(err?.message || '내보내지 못했어요');
            }
          },
        }),
        b.canWrite ? el('button', { class: 'btn', type: 'button', text: '되돌리기', onclick: () => fileInput.click() }) : null,
        fileInput,
      ));
    }

    const legacy = await legacyEntries();
    if (env?.mode === 'cloud' && legacy.length) {
      body.append(row('예전 기록 옮기기', `이 기기에 예전 귤껍질에서 쓴 조각 ${legacy.length}개가 있어요`,
        el('button', { class: 'btn', type: 'button', text: '옮기기', onclick: () => { close(); offerMigration(legacy, true); } })));
    }

    if (env?.mode === 'local') {
      const est = await local.storageEstimate();
      if (est) body.append(row('저장 공간', `이 기기에 ${formatBytes(est.usage || 0)} 사용 중`));
    }

    for (const b of books.filter((x) => x.canWrite)) {
      body.append(row(`${b.title} 전체 삭제`, '되돌릴 수 없어요. 먼저 백업을 권해요',
        el('button', {
          class: 'btn danger', type: 'button', text: '모두 지우기',
          onclick: async () => {
            if (!await confirmDialog(`${b.title}의 조각 ${b.entries.length}개를 모두 지울까요? 되돌릴 수 없어요.`, { confirmText: '모두 지우기' })) return;
            try {
              await b.clearAll();
              toast('모두 지웠어요');
            } catch (err) {
              toast(err?.message || '지우지 못했어요');
            }
          },
        })));
    }
  });
}

function showCopyBackup({ json, filename }) {
  openSheet('백업 복사', (body) => {
    body.append(el('p', { class: 'sheet-note', text: '여기서는 파일로 내려받을 수 없어요. 아래 내용을 통째로 복사해 텍스트 파일로 저장해두면, 나중에 되돌리기로 그대로 불러올 수 있어요.' }));
    const area = el('textarea', { readonly: true, rows: '8', class: 'field mono', 'aria-label': '백업 JSON' });
    area.value = json;
    body.append(area, el('div', { class: 'desc', text: `${filename} · ${formatBytes(new Blob([json]).size)}` }));
    body.append(el('button', {
      class: 'btn primary wide', type: 'button', text: '전체 복사',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(json);
          toast('복사했어요');
        } catch {
          area.focus();
          area.select();
          toast('길게 눌러 직접 복사해주세요');
        }
      },
    }));
  });
}

/* ---------- 예전 기록(이 기기에만 저장하던 시절) 옮기기 ---------- */

async function legacyEntries() {
  if (store.state.env?.mode !== 'cloud') return [];
  try {
    return await local.allEntries(local.STORE_PUBLIC);
  } catch {
    return [];
  }
}

async function offerMigration(legacy, force = false) {
  const env = store.state.env;
  const pub = store.book('public');
  const mine = store.book('mine');
  const targets = [pub, mine].filter((b) => b?.canWrite && b.status === 'ready');
  if (!targets.length) return;
  if (!force) {
    const done = await local.getMeta('migratedAt', null).catch(() => null);
    if (done || store.storage.get('gyul.migrate.later', null) === store.state.todayKey) return;
  }

  openSheet('예전 기록을 옮길까요?', (body, close) => {
    body.append(el('p', {
      class: 'sheet-note',
      text: `이 기기에는 예전 귤껍질(이 기기에만 저장하던 버전)에서 쓴 조각 ${legacy.length}개가 있어요. 이제 기록은 로그인한 계정에 저장되니, 옮겨두면 다른 기기에서도 볼 수 있어요. 이 기기의 원본은 지우지 않아요.`,
    }));
    const go = async (book) => {
      close();
      toast(`${legacy.length}개 조각을 옮기는 중…`);
      try {
        const n = await book.importEntries(legacy);
        await local.setMeta('migratedAt', Date.now());
        toast(`${book.title}로 ${n}개 조각을 옮겼어요`, { peel: true, ms: 4200 });
      } catch (err) {
        toast(err?.message || '옮기지 못했어요. 설정에서 다시 시도할 수 있어요.');
      }
    };
    const actions = el('div', { class: 'sheet-actions' });
    if (pub?.canWrite) actions.append(el('button', { class: 'btn primary', type: 'button', text: '귤껍질 기록장으로 (공개)', onclick: () => go(pub) }));
    if (mine?.canWrite) actions.append(el('button', { class: `btn${pub?.canWrite ? '' : ' primary'}`, type: 'button', text: '나의 기록장으로 (나만 보기)', onclick: () => go(mine) }));
    actions.append(el('button', {
      class: 'btn', type: 'button', text: '나중에',
      onclick: () => { store.storage.set('gyul.migrate.later', store.state.todayKey); close(); },
    }));
    body.append(actions);
    if (env?.me?.isOwner) {
      body.append(el('p', { class: 'desc', text: '귤껍질 기록장으로 옮기면 방문자 모두가 볼 수 있어요. 개인적인 기록이 섞여 있다면 나의 기록장을 고르세요.' }));
    }
  });
}

/* ---------- 시작 ---------- */

if (!framed) store.applyTheme(); // claude.ai 안에서는 뷰어의 테마 설정을 따른다

store.state.route = store.routeFromHash();
store.subscribe((reason) => render(reason));
render('init');

(async () => {
  const env = await detectEnv();
  store.state.env = env;
  document.documentElement.dataset.mode = env.mode;

  const books = createBooks(env);
  store.state.books = books;
  store.state.bookTab.public = books.public.canWrite ? 'today' : 'calendar';
  store.state.bookTab.mine = 'today';

  const pagesStore = createPages(env);
  store.state.pages = pagesStore;
  pagesStore.onChange(() => store.emit('pages'));
  pagesStore.start();

  let legacyChecked = false;
  for (const b of Object.values(books)) {
    let first = true;
    b.onChange((reason) => {
      if (reason === 'data' && first) {
        first = false;
        queueReopenNotice(b);
        if (!legacyChecked && books.public.status !== 'loading' && books.mine.status !== 'loading') {
          legacyChecked = true;
          legacyEntries().then((rows) => { if (rows.length) offerMigration(rows); });
        }
      }
      store.emit(reason === 'data' ? 'entries' : reason);
    });
    b.start();
  }

  watchMidnight(onDayChange);
  store.emit('env');

  if (!framed && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (env.mode === 'local' && navigator.storage?.persist) {
    navigator.storage.persisted?.().then((p) => { if (!p) navigator.storage.persist().catch(() => {}); });
  }
})();
