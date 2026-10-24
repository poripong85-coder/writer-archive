// 홈 — 귤껍질 마을. 간판을 누르거나 ◀ ● ▶ 버튼으로 집을 고르면 펫이 그 집 앞으로 걸어간다.

import { el, clear } from '../ui.js';
import * as store from '../store.js';
import { createVillage, ALL_PLACES } from '../village.js';
import { sprite } from '../pixel.js';
import { untilMidnightLabel } from '../util.js';

const ICON = { intro: 'i-gyul', fragments: 'i-star', factory: 'i-pencil', stay: 'i-house', guestbook: 'i-chat' };

export function createHomePage() {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const canvas = el('canvas', { class: 'village', role: 'img', 'aria-label': '귤, 별, 연필, 집 모양 건물이 옹기종기 모인 귤껍질 마을과 하늘에 뜬 방명록 말풍선' });
  const signs = el('div', { class: 'signs' });
  const stage = el('div', { class: 'stage' }, canvas, signs);
  const status = el('div', { class: 'lcd px', 'aria-live': 'polite' });
  const picked = el('div', { class: 'lcd-pick px' });

  const village = createVillage(canvas, {
    reducedMotion: reduced,
    onEnter: (key) => store.go(key),
    onSelect: () => { markSigns(); renderPick(); },
    onStarLand: (kind) => showLcdMessage(kind === 'sun' ? '☀️ 햇살 조각 고마워요!' : '⭐ 별빛 조각 고마워요!'),
  });

  const cycle = (d) => {
    const i = ALL_PLACES.findIndex((p) => p.key === village.selected());
    const next = ALL_PLACES[(i + d + ALL_PLACES.length) % ALL_PLACES.length];
    village.select(next.key);
  };
  const enter = () => {
    const key = village.selected();
    if (key) store.go(key);
    else village.select(ALL_PLACES[0].key);
  };

  const buttons = el('div', { class: 'device-buttons' },
    el('button', { class: 'dev-btn', type: 'button', 'aria-label': '이전 집', text: '◀', onclick: () => cycle(-1) }),
    el('button', { class: 'dev-btn main', type: 'button', 'aria-label': '고른 집으로 들어가기', text: '●', onclick: enter }),
    el('button', { class: 'dev-btn', type: 'button', 'aria-label': '다음 집', text: '▶', onclick: () => cycle(1) }),
  );

  const list = el('ul', { class: 'place-list' });
  for (const p of ALL_PLACES) {
    list.append(el('li', { class: p.key === 'guestbook' ? 'wide' : null },
      el('button', { class: 'place-card', type: 'button', onclick: () => store.go(p.key) },
        sprite(ICON[p.key], { scale: 3, className: 'place-icon' }),
        el('span', { class: 'place-text' },
          el('strong', { class: 'px', text: p.label }),
          el('span', { text: p.sub }),
        ),
        el('span', { class: 'place-go', 'aria-hidden': 'true', text: '→' }),
      ),
    ));
  }

  const root = el('section', { class: 'page home', 'aria-labelledby': 'welcome' },
    el('h1', { class: 'welcome px', id: 'welcome' },
      el('span', { text: '귤껍질 출판사에 오신 걸 환영합니다' }),
      el('span', { class: 'cursor', 'aria-hidden': 'true' }),
    ),
    el('div', { class: 'device' },
      el('div', { class: 'screen' }, stage),
      el('div', { class: 'lcd-row' }, status, picked),
      buttons,
    ),
    el('p', { class: 'home-hint', text: '간판이나 건물을 누르면 들어가요. 귤을 톡 건드려 보고, 하늘의 말풍선도 눌러보세요.' }),
    list,
  );

  // 간판은 배치가 바뀔 때만 새로 만든다. 고를 때마다 다시 만들면 누르는 도중에 버튼이 사라져 클릭이 먹지 않는다.
  function renderSigns() {
    clear(signs);
    for (const s of village.signPositions()) {
      signs.append(el('button', {
        class: 'sign px',
        type: 'button',
        dataset: { key: s.key, left: String(s.left) },
        style: `left:${s.left}%;top:${s.top}%`,
        onclick: () => store.go(s.key),
        onmouseenter: () => village.setHover(s.key),
        onmouseleave: () => village.setHover(null),
        onfocus: () => { if (village.selected() !== s.key) village.select(s.key); },
        text: s.label,
      }));
    }
    markSigns();
    requestAnimationFrame(clampSigns);
  }

  // 가장자리 간판이 화면 밖으로 나가 잘리지 않게 안쪽으로 당긴다
  function clampSigns() {
    const W = stage.clientWidth;
    if (!W) return;
    for (const b of signs.children) {
      const pct = parseFloat(b.dataset.left);
      const half = b.offsetWidth / 2;
      const px = Math.min(Math.max((pct / 100) * W, half + 4), W - half - 4);
      b.style.left = `${px}px`;
    }
  }

  function markSigns() {
    for (const b of signs.children) b.classList.toggle('on', b.dataset.key === village.selected());
  }

  function renderPick() {
    const p = ALL_PLACES.find((q) => q.key === village.selected());
    picked.textContent = p ? `▶ ${p.label}` : '';
  }

  let lcdHold = 0;
  function showLcdMessage(text) {
    status.textContent = text;
    status.classList.add('flash');
    clearTimeout(lcdHold);
    lcdHold = setTimeout(() => { status.classList.remove('flash'); lcdHold = 0; renderStatus(); }, 4200);
  }

  function renderStatus() {
    if (lcdHold) return;
    const pub = store.book('public');
    const n = pub?.status === 'ready' ? pub.entriesOf(store.state.todayKey).length : null;
    status.textContent = n == null
      ? `자정까지 ${untilMidnightLabel()}`
      : `오늘의 조각 ${n}개 · 자정까지 ${untilMidnightLabel()}`;
  }

  // 화면 폭에 맞춰 가로형/세로형 마을을 고른다
  const fit = (force = false) => {
    const w = stage.parentElement?.clientWidth || root.clientWidth || 360;
    const key = w < 520 ? 'tall' : 'wide';
    if (force || village.layout() !== key) {
      village.setLayout(key);
      const { W, H } = village.size();
      stage.style.aspectRatio = `${W} / ${H}`;
      renderSigns();
    }
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { fit(); clampSigns(); }) : null;
  document.fonts?.ready?.then(() => clampSigns());

  const onKey = (e) => {
    if (store.state.route !== 'home') return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (document.querySelector('.sheet-backdrop')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); cycle(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); cycle(1); }
  };

  let tick = null;
  return {
    root,
    update() { renderStatus(); },
    activate() {
      fit(true);
      ro?.observe(root);
      village.start();
      renderStatus();
      clearInterval(tick);
      tick = setInterval(renderStatus, 30000);
      document.addEventListener('keydown', onKey);
      const gift = store.takeStarDrop();
      if (gift) setTimeout(() => village.dropPiece(gift), 700);
    },
    deactivate() {
      village.stop();
      ro?.disconnect();
      clearInterval(tick);
      document.removeEventListener('keydown', onKey);
    },
  };
}
