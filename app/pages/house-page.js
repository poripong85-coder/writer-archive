// 귤 하우스 — 온라인 집들이.
// 중문을 똑똑(두 번) 두드리면 유리 너머로 귤 그림자가 다가오고, 문이 미끄러지며 열린 뒤 귤이 나와서 방을 하나씩 구경시켜 준다.
// 중문 모양·방 소개 글은 app/house.js 에서 고친다. 그림은 전부 이 파일 안의 픽토그램 SVG.

import { el, clear } from '../ui.js';
import * as store from '../store.js';
import { sprite } from '../pixel.js';
import { HOUSE } from '../house.js';

const SVGNS = 'http://www.w3.org/2000/svg';

/* ---------- 귤 픽토그램 ---------- */

// 발끝이 (0,0). 키는 약 92.
function gyul({ pose = 'stand', wave = true } = {}) {
  const armR = pose === 'wave'
    ? `<g transform="translate(29,-50)"><g class="${wave ? 'gy-wave' : ''}"><path d="M0,0 L13,-22" /></g></g>`
    : '<path d="M29,-46 L40,-28" />';
  return `
    <ellipse class="gy-shadow" cx="0" cy="0" rx="26" ry="4.5" />
    <g class="gy-limb">
      <path d="M-11,-20 V-3" /><path d="M11,-20 V-3" />
      <path d="M-29,-46 L-40,-28" />
      ${armR}
    </g>
    <circle cx="0" cy="-50" r="32" fill="#F97F1C" />
    <path d="M-30,-40 A32,32 0 0 0 30,-40 A40,40 0 0 1 -30,-40Z" fill="#DE6408" opacity=".35" />
    <ellipse cx="13" cy="-66" rx="8" ry="4.6" fill="#FFC98A" transform="rotate(-28 13 -66)" />
    <path d="M0,-81 V-90" stroke="#6E4123" stroke-width="4" stroke-linecap="round" />
    <path d="M2,-88 C10,-100 24,-98 28,-90 C20,-82 10,-82 2,-88Z" fill="#3F8F52" />
    <circle cx="-11" cy="-51" r="3.4" fill="#2A1A10" />
    <circle cx="11" cy="-51" r="3.4" fill="#2A1A10" />
    <ellipse cx="-19" cy="-42" rx="5" ry="3" fill="#FF7B7B" opacity=".6" />
    <ellipse cx="19" cy="-42" rx="5" ry="3" fill="#FF7B7B" opacity=".6" />
    <path d="M-5,-42 Q0,-37 5,-42" stroke="#2A1A10" stroke-width="2.2" fill="none" stroke-linecap="round" />`;
}

const at = (x, y, s, inner, cls = '') =>
  `<g transform="translate(${x},${y}) scale(${s})"${cls ? ` class="${cls}"` : ''}>${inner}</g>`;

/* ---------- 중문 장면 ---------- */

const OX = 46, OY = 36, OW = 208, OH = 264, FLOOR = OY + OH; // 문 안쪽 구멍

function doorScene(d) {
  const n = Math.min(4, Math.max(1, Math.round(d.panels) || 1));
  const toRight = d.openTo !== 'left';
  const pw = OW / n;
  const cx = n === 1 ? 150 : toRight ? OX + ((n - 1) * pw) / 2 : OX + OW - ((n - 1) * pw) / 2;
  const R = OW / 2;
  const hole = d.arch
    ? `M${OX},${FLOOR} V${OY + R} A${R},${R} 0 0 1 ${OX + OW},${OY + R} V${FLOOR} Z`
    : `M${OX},${FLOOR} V${OY} H${OX + OW} V${FLOOR} Z`;
  const T = 9; // 문틀 두께
  const outer = d.arch
    ? `M${OX - T},${FLOOR} V${OY + R} A${R + T},${R + T} 0 0 1 ${OX + OW + T},${OY + R} V${FLOOR} Z`
    : `M${OX - T},${FLOOR} V${OY - T} H${OX + OW + T} V${FLOOR} Z`;

  const glassFill = d.glass === 'clear' ? 'gh-glass-clear' : d.glass === 'frosted' ? 'gh-glass-frost' : 'url(#gh-flute)';
  const bars = (Array.isArray(d.bars) ? d.bars : []).filter((b) => b > 0 && b < 1);

  const panels = [];
  for (let i = 0; i < n; i++) {
    const x = OX + i * pw;
    const shift = n === 1 ? (toRight ? pw : -pw) : toRight ? (n - 1 - i) * pw : -i * pw;
    const lead = toRight ? i === 0 : i === n - 1;
    const hx = toRight ? x + 10 : x + pw - 10;
    panels.push(`
      <g class="gh-panel" style="--shift:${shift}px">
        <rect x="${x}" y="${OY - 60}" width="${pw}" height="${OH + 60}" class="${glassFill.startsWith('url') ? '' : glassFill}" ${glassFill.startsWith('url') ? `fill="${glassFill}"` : ''} />
        ${d.glass === 'clear' ? `<path d="M${x + pw * 0.2},${OY + 40} l${pw * 0.35},-34 M${x + pw * 0.2},${OY + 62} l${pw * 0.55},-52" class="gh-shine" />` : ''}
        ${bars.map((b) => `<line x1="${x}" x2="${x + pw}" y1="${OY + b * OH}" y2="${OY + b * OH}" stroke="${d.frame}" stroke-width="4" />`).join('')}
        <rect x="${x + 2.5}" y="${OY - 60}" width="${pw - 5}" height="${OH + 57.5}" fill="none" stroke="${d.frame}" stroke-width="5" />
        ${lead ? `<line x1="${hx}" x2="${hx}" y1="${OY + OH * 0.5}" y2="${OY + OH * 0.66}" stroke="${d.handle}" stroke-width="5" stroke-linecap="round" />` : ''}
      </g>`);
  }

  return {
    cx,
    svg: `
<svg class="gh-door-svg" viewBox="0 0 300 330" xmlns="${SVGNS}" aria-hidden="true">
  <defs>
    <clipPath id="gh-hole"><path d="${hole}" /></clipPath>
    <pattern id="gh-flute" width="7" height="10" patternUnits="userSpaceOnUse">
      <rect width="7" height="10" class="gh-flute-a" /><rect width="2.4" height="10" class="gh-flute-b" />
    </pattern>
    <filter id="gh-frost" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${d.glass === 'clear' ? 0 : 4.5}" /></filter>
  </defs>

  <rect width="300" height="330" class="gh-wall" />
  <rect y="${FLOOR}" width="300" height="${330 - FLOOR}" class="gh-floor" />
  <rect y="${FLOOR - 4}" width="300" height="4" class="gh-base" />

  <!-- 벽 소품 -->
  <g class="gh-prop">
    <rect x="14" y="${FLOOR - 26}" width="18" height="22" rx="3" class="gh-pot" />
    <path d="M23,${FLOOR - 26} C10,${FLOOR - 44} 12,${FLOOR - 58} 18,${FLOOR - 64} C22,${FLOOR - 50} 24,${FLOOR - 40} 23,${FLOOR - 26}Z M23,${FLOOR - 26} C34,${FLOOR - 46} 34,${FLOOR - 60} 30,${FLOOR - 70} C24,${FLOOR - 56} 22,${FLOOR - 42} 23,${FLOOR - 26}Z" class="gh-leaf" />
    <rect x="272" y="96" width="16" height="22" rx="3" class="gh-plate" />
    <circle cx="280" cy="104" r="4" fill="#F97F1C" />
  </g>

  <!-- 문 너머 -->
  <g clip-path="url(#gh-hole)">
    <rect x="${OX}" y="${OY - 2}" width="${OW}" height="${OH + 2}" class="gh-in" />
    <rect x="${OX}" y="${FLOOR - 34}" width="${OW}" height="34" class="gh-in-floor" />
    <path d="M${cx},${OY} V${OY + 34}" class="gh-cord" />
    <path d="M${cx - 16},${OY + 50} A16,16 0 0 1 ${cx + 16},${OY + 50} Z" class="gh-lamp" />
    <g class="gh-in-gyul" filter="url(#gh-frost)">${at(cx, FLOOR - 10, 0.78, gyul())}</g>
    <g class="gh-panels">${panels.join('')}</g>
  </g>
  <path d="${outer} ${hole}" fill="${d.frame}" fill-rule="evenodd" />

  <rect x="96" y="${FLOOR + 8}" width="108" height="14" rx="5" class="gh-mat" />
  <g class="gh-out-gyul">${at(cx, FLOOR + 22, 1, gyul({ pose: 'wave' }))}</g>
</svg>`,
  };
}

/* ---------- 방 픽토그램 ---------- */

const ROOM = {
  living: `
    <rect x="26" y="26" width="76" height="64" rx="4" class="r-frame" />
    <rect x="31" y="31" width="66" height="54" class="r-sky" />
    <circle cx="80" cy="47" r="8" fill="#FFD23F" />
    <path d="M64,31 V85 M31,58 H97" class="r-mullion" />
    <path d="M160,0 V40" class="r-cord" /><path d="M146,52 A14,14 0 0 1 174,52 Z" fill="#FFD23F" />
    <ellipse cx="150" cy="178" rx="92" ry="10" class="r-rug" />
    <rect x="96" y="98" width="112" height="34" rx="12" fill="#7FA7C9" />
    <rect x="86" y="118" width="132" height="34" rx="10" fill="#6A92B6" />
    <rect x="80" y="112" width="18" height="40" rx="8" fill="#7FA7C9" />
    <rect x="206" y="112" width="18" height="40" rx="8" fill="#7FA7C9" />
    <rect x="112" y="104" width="26" height="22" rx="6" fill="#FFB973" />
    <path d="M94,152 v10 M210,152 v10" class="r-leg" />
    <rect x="230" y="138" width="20" height="24" rx="3" class="r-pot" />
    <path d="M240,138 C226,118 228,102 234,94 C240,110 242,124 240,138Z M240,138 C252,118 252,102 248,90 C240,106 238,122 240,138Z" class="r-leaf" />`,
  kitchen: `
    <rect x="18" y="20" width="176" height="38" rx="4" class="r-cab" />
    <path d="M62,20 V58 M106,20 V58 M150,20 V58" class="r-line" />
    <rect x="18" y="108" width="176" height="54" rx="4" class="r-cab" />
    <rect x="14" y="100" width="184" height="10" rx="3" class="r-top" />
    <path d="M62,114 V156 M106,114 V156 M150,114 V156" class="r-line" />
    <rect x="34" y="84" width="28" height="16" rx="4" fill="#E2523D" /><path d="M30,86 H66" stroke="#A8352A" stroke-width="3" stroke-linecap="round" />
    <path d="M42,78 q-4,-6 0,-12 M52,78 q-4,-6 0,-12" class="r-steam" />
    <rect x="120" y="86" width="16" height="14" rx="3" fill="#FFF8EC" stroke="#E6C99A" stroke-width="2" />
    <path d="M136,90 q6,3 0,7" stroke="#E6C99A" stroke-width="2" fill="none" />
    <circle cx="128" cy="92" r="3.5" fill="#F97F1C" />
    <rect x="206" y="40" width="48" height="122" rx="6" class="r-fridge" />
    <path d="M206,82 H254 M244,56 v14 M244,94 v22" class="r-line" />`,
  study: `
    <rect x="16" y="24" width="94" height="138" rx="4" class="r-shelf" />
    <path d="M16,60 H110 M16,96 H110 M16,130 H110" class="r-board" />
    ${[[22, 34, '#E2523D'], [32, 30, '#7FA7C9'], [42, 36, '#FFD23F'], [52, 32, '#5AA65A'], [64, 38, '#F49AC1'],
      [22, 68, '#F97F1C'], [34, 72, '#7FA7C9'], [46, 66, '#E2523D'], [72, 70, '#FFD23F'],
      [24, 104, '#5AA65A'], [36, 100, '#F97F1C'], [48, 106, '#F49AC1'], [60, 102, '#7FA7C9'], [84, 104, '#E2523D']]
      .map(([x, y, c]) => `<rect x="${x}" y="${y}" width="9" height="${(y < 60 ? 60 : y < 96 ? 96 : 130) - y}" rx="1.5" fill="${c}" />`).join('')}
    <rect x="130" y="34" width="44" height="34" rx="3" class="r-poster" /><circle cx="152" cy="52" r="9" fill="#F97F1C" /><path d="M152,43 l5,-5" stroke="#3F8F52" stroke-width="3" stroke-linecap="round" />
    <rect x="128" y="106" width="118" height="8" rx="3" class="r-desk" />
    <path d="M136,114 V162 M238,114 V162" class="r-leg-w" />
    <path d="M206,106 V82 L220,72" class="r-arm" /><path d="M214,66 L232,78 L222,86 Z" fill="#FFD23F" />
    <rect x="148" y="94" width="40" height="12" rx="2" fill="#FFF8EC" stroke="#E6C99A" stroke-width="2" /><path d="M168,94 V106" stroke="#E6C99A" stroke-width="2" />`,
  bedroom: `
    <rect x="200" y="22" width="70" height="58" rx="4" class="r-frame" />
    <rect x="205" y="27" width="60" height="48" fill="#2F3A5C" />
    <path d="M246,40 a10,10 0 1 0 6,16 a8,8 0 1 1 -6,-16Z" fill="#FFE680" />
    <circle cx="216" cy="38" r="1.8" fill="#FFF3B0" /><circle cx="228" cy="62" r="1.5" fill="#FFF3B0" />
    <rect x="22" y="78" width="16" height="84" rx="4" class="r-wood" />
    <rect x="38" y="118" width="150" height="26" rx="6" fill="#FFF8EC" />
    <path d="M70,112 H188 V150 H70 Z" fill="#F49AC1" />
    <path d="M70,124 q20,-8 40,0 t40,0 t38,0" stroke="#D16B98" stroke-width="3" fill="none" />
    <rect x="42" y="102" width="34" height="18" rx="8" fill="#FFF8EC" stroke="#E6C99A" stroke-width="2" />
    <path d="M40,150 v12 M186,150 v12" class="r-leg" />
    <rect x="200" y="128" width="32" height="34" rx="3" class="r-wood" />
    <path d="M216,128 V112" class="r-line" /><path d="M206,112 L226,112 L222,100 L210,100Z" fill="#FFD23F" />`,
  veranda: `
    <rect x="14" y="16" width="292" height="122" rx="4" class="r-frame" />
    <rect x="19" y="21" width="282" height="112" class="r-sky" />
    <path d="M110,21 V133 M206,21 V133" class="r-mullion" />
    <circle cx="66" cy="54" r="14" fill="#FFD23F" />
    <path d="M140,60 q8,-10 18,-4 q8,-8 16,2 q10,0 8,8 h-44 q-6,-4 2,-6Z" fill="#FFF8EC" />
    ${[[36, 26], [82, 20], [130, 30], [176, 22]].map(([x, h]) => `
      <rect x="${x}" y="${162 - h}" width="${h + 2}" height="${h}" rx="3" class="r-pot" />
      <path d="M${x + h / 2 + 1},${162 - h} C${x - 6},${130 - h} ${x},${118 - h} ${x + 6},${110 - h} C${x + 12},${126 - h} ${x + h / 2},${146 - h} ${x + h / 2 + 1},${162 - h}Z
               M${x + h / 2 + 1},${162 - h} C${x + h + 10},${132 - h} ${x + h + 6},${116 - h} ${x + h},${106 - h} C${x + h - 8},${124 - h} ${x + h / 2},${144 - h} ${x + h / 2 + 1},${162 - h}Z" class="r-leaf" />`).join('')}
    <path d="M214,116 H246 L242,134 H218Z M220,134 L216,162 M240,134 L244,162 M214,116 V96" class="r-chair" />`,
};

function roomScene(room) {
  const inner = ROOM[room.scene] || ROOM.living;
  return `
<svg class="gh-room-svg" viewBox="0 0 320 200" xmlns="${SVGNS}" role="img" aria-label="${room.name} 픽토그램">
  <rect width="320" height="162" class="gh-wall" />
  <rect y="162" width="320" height="38" class="gh-floor" />
  <rect y="158" width="320" height="4" class="gh-base" />
  ${inner}
  ${at(284, 188, 0.62, gyul({ pose: 'wave' }), 'gy-room')}
</svg>`;
}

/* ---------- 똑똑 소리 ---------- */

let audio = null;
function knockSound() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + 0.15);
  } catch { /* 소리가 안 나도 문은 열린다 */ }
}

/* ---------- 페이지 ---------- */

export function createHousePage() {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const H = HOUSE;
  const rooms = H.rooms;
  let soundOn = store.storage.get('gyul.house.sound', 'on') !== 'off';

  const say = el('p', { class: 'gh-say px', 'aria-live': 'polite' });
  const knocks = el('div', { class: 'gh-knocks', 'aria-hidden': 'true' });
  const door = doorScene(H.door);
  const doorBtn = el('button', {
    class: 'gh-door', type: 'button', 'aria-label': '중문 똑똑 두드리기', html: door.svg,
  });
  const startBtn = el('button', { class: 'btn primary gh-start', type: 'button', hidden: true, text: '집 구경 시작 →' });
  const knockBtn = el('button', { class: 'btn gh-knock-btn', type: 'button', text: '✊ 똑똑 두드리기' });
  const soundBtn = el('button', { class: 'btn gh-sound', type: 'button' });
  const renderSound = () => {
    soundBtn.textContent = soundOn ? '🔈 소리 켬' : '🔇 소리 끔';
    soundBtn.setAttribute('aria-pressed', String(soundOn));
  };
  renderSound();

  const doorView = el('div', { class: 'gh-view gh-door-view' },
    el('div', { class: 'gh-stage' }, doorBtn, knocks, say),
    el('div', { class: 'gh-actions' }, knockBtn, startBtn),
  );

  const scene = el('div', { class: 'gh-scene' });
  const roomTitle = el('h2', { class: 'gh-room-name px', tabindex: '-1' });
  const roomLine = el('p', { class: 'gh-bubble' });
  const photo = el('div', { class: 'gh-photo' });
  const dots = el('div', { class: 'gh-dots', role: 'tablist', 'aria-label': '방 고르기' });
  const prevBtn = el('button', { class: 'btn', type: 'button', text: '← 이전' });
  const nextBtn = el('button', { class: 'btn primary', type: 'button' });
  const tourView = el('div', { class: 'gh-view gh-tour', hidden: true },
    el('div', { class: 'gh-card' }, scene, el('div', { class: 'gh-card-body' }, roomTitle, roomLine, photo)),
    dots,
    el('div', { class: 'gh-actions' }, prevBtn, nextBtn),
  );

  const outroView = el('div', { class: 'gh-view gh-outro', hidden: true },
    el('div', { class: 'gh-outro-art', html: `<svg viewBox="-60 -110 120 120" aria-hidden="true">${gyul({ pose: 'wave', wave: !reduced })}</svg>` }),
    el('p', { class: 'gh-bubble', text: H.outro.line }),
    el('div', { class: 'gh-actions' },
      el('a', { class: 'btn primary', href: '#guestbook', text: H.outro.guestbook,
        onclick: (e) => { e.preventDefault(); store.go('guestbook'); } }),
      el('button', { class: 'btn', type: 'button', text: H.outro.again, onclick: () => reset(true) }),
    ),
  );

  const root = el('section', { class: `page text-page gyul-house${reduced ? ' still' : ''}`, 'aria-labelledby': 'gh-title' },
    el('header', { class: 'tp-head' },
      sprite('i-door', { scale: 3, className: 'tp-sprite' }),
      el('div', { class: 'tp-title' },
        el('h1', { class: 'px', id: 'gh-title', text: H.title }),
        el('p', { class: 'page-lead', text: H.lead }),
      ),
    ),
    doorView, tourView, outroView,
    el('div', { class: 'gh-foot' }, soundBtn),
  );

  /* ---- 문 ---- */
  let phase = 'closed';      // closed → answering → open → tour → outro
  let count = 0;
  let idx = 0;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, reduced ? Math.min(ms, 200) : ms); timers.add(t); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
  let countReset = 0;

  function speak(text) {
    say.textContent = text;
    say.classList.remove('pop');
    void say.offsetWidth;
    say.classList.add('pop');
    say.hidden = !text;
  }

  function knock(evt) {
    if (phase === 'open') { startTour(); return; }
    if (phase !== 'closed') return;
    if (soundOn) knockSound();
    count++;
    const r = doorBtn.getBoundingClientRect();
    const x = evt && evt.clientX ? ((evt.clientX - r.left) / r.width) * 100 : 40 + count * 16;
    const y = evt && evt.clientY ? ((evt.clientY - r.top) / r.height) * 100 : 44;
    const b = el('span', { class: 'gh-tok px', style: `left:${x}%;top:${y}%`, text: H.greet.knock });
    knocks.append(b);
    setTimeout(() => b.remove(), 900);
    doorBtn.classList.remove('shake');
    void doorBtn.offsetWidth;
    doorBtn.classList.add('shake');
    clearTimeout(countReset);
    if (count >= 2) { count = 0; answer(); }
    else {
      speak('한 번 더 똑!');
      countReset = setTimeout(() => { count = 0; if (phase === 'closed') speak('중문을 똑똑 두드려 보세요'); }, 2200);
    }
  }

  function answer() {
    phase = 'answering';
    knockBtn.disabled = true;
    root.classList.add('answering');
    later(() => speak(H.greet.who), 500);
    later(() => {
      phase = 'open';
      root.classList.add('opened');
      doorBtn.setAttribute('aria-label', '귤 따라 집 구경 시작하기');
      speak(H.greet.hello);
    }, 1900);
    later(() => {
      speak(H.greet.start);
      knockBtn.hidden = true;
      startBtn.hidden = false;
      startBtn.focus({ preventScroll: true });
    }, 3600);
  }

  function knockTwice() {
    if (phase !== 'closed') return;
    knock();
    later(() => knock(), 320);
  }

  /* ---- 투어 ---- */
  for (let i = 0; i < rooms.length; i++) {
    dots.append(el('button', {
      class: 'gh-dot', type: 'button', role: 'tab', 'aria-label': `${i + 1}. ${rooms[i].name}`,
      onclick: () => showRoom(i),
    }));
  }

  function showRoom(i, focus = true) {
    idx = Math.max(0, Math.min(rooms.length - 1, i));
    const room = rooms[idx];
    scene.innerHTML = roomScene(room);
    scene.classList.remove('enter');
    void scene.offsetWidth;
    scene.classList.add('enter');
    roomTitle.textContent = `${idx + 1}/${rooms.length} · ${room.name}`;
    roomLine.textContent = room.line;
    clear(photo);
    if (room.photo) photo.append(el('img', { src: room.photo, alt: `${room.name} 사진`, loading: 'lazy' }));
    photo.hidden = !room.photo;
    [...dots.children].forEach((d, j) => {
      d.classList.toggle('on', j === idx);
      d.setAttribute('aria-selected', String(j === idx));
    });
    prevBtn.disabled = idx === 0;
    nextBtn.textContent = idx === rooms.length - 1 ? '구경 끝! →' : '다음 방 →';
    if (focus) roomTitle.focus({ preventScroll: true });
  }

  function startTour() {
    clearTimers();
    phase = 'tour';
    doorView.hidden = true;
    outroView.hidden = true;
    tourView.hidden = false;
    showRoom(0);
  }

  function finish() {
    phase = 'outro';
    tourView.hidden = true;
    outroView.hidden = false;
  }

  function reset(scrollUp = false) {
    clearTimers();
    clearTimeout(countReset);
    phase = 'closed';
    count = 0;
    root.classList.remove('answering', 'opened');
    doorBtn.setAttribute('aria-label', '중문 똑똑 두드리기');
    doorView.hidden = false;
    tourView.hidden = true;
    outroView.hidden = true;
    knockBtn.hidden = false;
    knockBtn.disabled = false;
    startBtn.hidden = true;
    speak('중문을 똑똑 두드려 보세요');
    if (scrollUp) root.scrollIntoView?.({ block: 'start' });
  }

  doorBtn.addEventListener('click', (e) => knock(e.detail ? e : null));
  knockBtn.addEventListener('click', knockTwice);
  startBtn.addEventListener('click', startTour);
  prevBtn.addEventListener('click', () => showRoom(idx - 1));
  nextBtn.addEventListener('click', () => (idx === rooms.length - 1 ? finish() : showRoom(idx + 1)));
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    store.storage.set('gyul.house.sound', soundOn ? 'on' : 'off');
    renderSound();
  });

  // 방 사진을 옆으로 밀어서 넘기기
  let sx = null;
  scene.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  scene.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) (idx === rooms.length - 1 ? finish() : showRoom(idx + 1));
    else showRoom(idx - 1);
  });

  const onKey = (e) => {
    if (store.state.route !== 'gyul-house' || phase !== 'tour') return;
    if (document.querySelector('.sheet-backdrop')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); showRoom(idx - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); idx === rooms.length - 1 ? finish() : showRoom(idx + 1); }
  };

  return {
    root,
    update() {},
    activate() { reset(); document.addEventListener('keydown', onKey); },
    deactivate() { clearTimers(); document.removeEventListener('keydown', onKey); },
  };
}
