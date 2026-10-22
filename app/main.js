// 귤껍질 부팅 — 탭 전환, 자정 아카이브 연결, 설정.

import * as store from './store.js';
import { scheduleMidnight, lastSealedAt } from './archive.js';
import { el, clear, toast, openSheet, emptyState, fragmentCard, confirmDialog } from './ui.js';
import { createTodayView } from './views/today.js';
import { createCalendarView } from './views/calendar.js';
import { createFragmentsView } from './views/fragments.js';
import { downloadBackup, restoreBackup, canDownload, backupJson, backupFilename } from './backup.js';
import { storageEstimate, clearAll } from './db.js';
import { formatBytes, formatDayShort, relativeDayLabel, untilMidnightLabel } from './util.js';

const main = document.getElementById('main');
const brandSub = document.getElementById('brand-sub');
const tabs = [...document.querySelectorAll('.tab')];

const views = {
  today: createTodayView(),
  calendar: createCalendarView(),
  fragments: createFragmentsView(),
};

let mounted = null;

function renderView(reason) {
  const name = store.state.view;
  const view = views[name];
  if (mounted !== name) {
    views[mounted]?.deactivate?.();
    clear(main);
    main.append(view.root);
    mounted = name;
    view.update(reason);
    view.activate?.();
  } else {
    view.update(reason);
  }

  document.getElementById('app').dataset.view = name;
  for (const tab of tabs) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  brandSub.textContent = subtitleFor(name);
}

function subtitleFor(name) {
  if (name === 'today') {
    const n = store.todayEntries().length;
    return n ? `오늘 조각 ${n}개 · 자정까지 ${untilMidnightLabel()}` : '오늘의 조각';
  }
  if (name === 'calendar') {
    const { year, month } = store.state.calendarMonth;
    return `${year}년 ${month + 1}월`;
  }
  const days = store.state.archives.size;
  return days ? `아카이브된 하루 ${days}일` : '아카이브';
}

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    if (store.state.view === tab.dataset.tab) {
      if (tab.dataset.tab === 'today') views.today.focusComposer();
      return;
    }
    store.setView(tab.dataset.tab);
  });
}

document.getElementById('btn-search').addEventListener('click', () => {
  store.setView('fragments');
  setTimeout(() => views.fragments.focusSearch(), 30);
});

document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    store.setView('fragments');
    setTimeout(() => views.fragments.focusSearch(), 30);
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  const map = { 1: 'today', 2: 'calendar', 3: 'fragments' };
  if (map[e.key]) store.setView(map[e.key]);
});

/* ---------- 설정 ---------- */

document.getElementById('btn-settings').addEventListener('click', openSettings);

function openSettings() {
  openSheet('설정', async (body) => {
    const themeRow = el('div', { class: 'setting-row' },
      el('div', {},
        el('div', { class: 'label', text: '화면 테마' }),
        el('div', { class: 'desc', text: '기기 설정을 따르거나 직접 고를 수 있어요' }),
      ),
      el('div', { class: 'seg' },
        ...[['auto', '자동'], ['light', '밝게'], ['dark', '어둡게']].map(([v, label]) =>
          el('button', {
            type: 'button', class: store.state.theme === v ? 'on' : '', text: label,
            onclick: (e) => {
              store.setTheme(v);
              [...e.target.parentElement.children].forEach((b) => b.classList.toggle('on', b === e.target));
            },
          })),
      ),
    );

    const sealed = await lastSealedAt();
    const archiveRow = el('div', { class: 'setting-row' },
      el('div', {},
        el('div', { class: 'label', text: '자정 아카이브' }),
        el('div', {
          class: 'desc',
          text: sealed
            ? `마지막 봉인 ${new Date(sealed).toLocaleString('ko-KR')} · 다음 봉인까지 ${untilMidnightLabel()}`
            : `자정이 지나면 하루치가 조각으로 정리돼요 · 남은 시간 ${untilMidnightLabel()}`,
        }),
      ),
    );

    const est = await storageEstimate();
    const storageRow = el('div', { class: 'setting-row' },
      el('div', {},
        el('div', { class: 'label', text: '저장 공간' }),
        el('div', {
          class: 'desc',
          text: est
            ? `이 기기에 ${formatBytes(est.usage || 0)} 사용 중 (여유 ${formatBytes(est.quota || 0)})`
            : '모든 기록은 이 브라우저 안에만 저장됩니다',
        }),
      ),
    );

    const fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      try {
        const n = await restoreBackup(file);
        await store.reload();
        store.emit('restore');
        toast(`${n}개 조각을 되돌렸어요`, { peel: true });
      } catch (err) {
        toast(err.message || '되돌리지 못했어요');
      }
    });

    const backupRow = el('div', { class: 'setting-row' },
      el('div', {},
        el('div', { class: 'label', text: '백업' }),
        el('div', {
          class: 'desc',
          text: canDownload()
            ? '사진까지 포함해 JSON 한 파일로 내보내고 되돌립니다'
            : '사진까지 포함한 JSON을 복사해 두세요. 파일에서 되돌리는 건 그대로 됩니다',
        }),
      ),
      el('div', { style: 'display:flex;gap:6px' },
        el('button', {
          class: 'btn', type: 'button', text: '내보내기',
          onclick: async () => {
            if (canDownload()) {
              const n = await downloadBackup();
              toast(`${n}개 조각을 내보냈어요`);
            } else {
              showCopyBackup();
            }
          },
        }),
        el('button', { class: 'btn', type: 'button', text: '되돌리기', onclick: () => fileInput.click() }),
      ),
      fileInput,
    );

    const dangerRow = el('div', { class: 'setting-row' },
      el('div', {},
        el('div', { class: 'label', text: '전체 삭제' }),
        el('div', { class: 'desc', text: '되돌릴 수 없어요. 먼저 백업을 권합니다' }),
      ),
      el('button', {
        class: 'btn danger', type: 'button', text: '모두 지우기',
        onclick: async () => {
          if (!await confirmDialog('모든 조각을 지울까요? 되돌릴 수 없어요.', { confirmText: '모두 지우기' })) return;
          await clearAll();
          await store.reload();
          store.emit('clear');
          toast('모두 지웠어요');
        },
      }),
    );

    body.append(themeRow, archiveRow, storageRow, backupRow, dangerRow);
  });
}

/** 다운로드가 막힌 환경에서 백업 JSON을 복사해 가져가는 창 */
function showCopyBackup() {
  openSheet('백업 복사', async (body) => {
    body.append(el('p', {
      style: 'margin:0 0 10px;color:var(--text-dim);font-size:13px',
      text: '여기서는 파일로 내려받을 수 없어요. 아래 내용을 통째로 복사해 텍스트 파일로 저장해두면, 나중에 되돌리기로 그대로 불러올 수 있어요.',
    }));
    const area = el('textarea', {
      readonly: true, rows: '8', 'aria-label': '백업 JSON',
      style: 'width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;'
           + 'border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--surface-2);'
           + 'color:var(--text);resize:vertical',
    });
    area.value = '백업을 만드는 중…';
    body.append(area);

    const name = el('div', { class: 'desc', style: 'margin-top:8px', text: '' });
    const copyBtn = el('button', {
      class: 'btn primary', type: 'button', style: 'width:100%;margin-top:10px', text: '전체 복사',
      disabled: true,
    });
    body.append(copyBtn, name);

    const json = await backupJson();
    area.value = json;
    name.textContent = `${backupFilename()} · ${formatBytes(new Blob([json]).size)}`;
    copyBtn.disabled = false;
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(json);
        toast('복사했어요');
      } catch {
        area.focus();
        area.select();
        toast('길게 눌러 직접 복사해주세요');
      }
    });
  });
}

/* ---------- 자정 아카이브 알림 ---------- */

function showSealSheet(sealed) {
  openSheet('하루가 조각으로 정리됐어요', (body, close) => {
    body.append(el('p', {
      style: 'margin:0 0 14px;color:var(--text-dim);font-size:13px',
      text: `${sealed.length}일치 기록이 인사이트 조각으로 봉인됐어요.`,
    }));
    for (const { dayKey } of sealed.slice(0, 5)) {
      const entries = store.entriesOf(dayKey);
      if (!entries.length) continue;
      body.append(el('div', { style: 'margin-bottom:12px' },
        fragmentCard(dayKey, entries, { sealed: true, limit: 3 })));
    }
    body.append(el('button', {
      class: 'btn primary', type: 'button', style: 'width:100%', text: '조각 보러 가기',
      onclick: () => { close(); store.setView('fragments'); },
    }));
  });
}

async function onRollover(sealed) {
  await store.reload();
  store.emit('rollover');
  const total = sealed.reduce((n, s) => n + s.count, 0);
  const label = `${relativeDayLabel(sealed[sealed.length - 1].dayKey)}의 조각 ${total}개를 아카이브했어요`;
  // 화면을 보고 있으면 조각 카드를 바로 보여주고, 아니면 다음에 열었을 때 토스트로 알린다.
  if (document.visibilityState === 'visible' && total > 0) showSealSheet(sealed);
  else toast(label, { peel: true, ms: 4200 });
}

/* ---------- 시작 ---------- */

store.applyTheme();
store.subscribe((reason) => renderView(reason));

// PWA 바로가기(?tab=calendar 등) 지원
const wantedTab = new URLSearchParams(location.search).get('tab');
if (views[wantedTab]) store.state.view = wantedTab;

(async () => {
  try {
    await store.init();
  } catch (err) {
    clear(main);
    main.append(emptyState('⚠️', '저장소를 열지 못했어요', String(err.message || err)));
    return;
  }
  renderView('init');
  scheduleMidnight(onRollover);

  if (navigator.storage?.persist && !(await navigator.storage.persisted?.())) {
    navigator.storage.persist().catch(() => {});
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && canDownload()) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
