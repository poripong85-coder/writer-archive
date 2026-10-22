// 귤껍질 마을 — 다마고치처럼 작은 도트 세상. 캔버스는 그림만 그리고,
// 클릭할 수 있는 간판은 HTML 버튼이 위에 얹혀서 담당한다(키보드·스크린리더용).

import { drawSprite, spriteSize, NIGHT_SWAP } from './pixel.js';

export const PLACES = [
  { key: 'intro', sprite: 'gyul', label: '귤껍질 소개', sub: '출판사 이야기', door: [14, 22] },
  { key: 'fragments', sprite: 'star', label: '일상 조각 모음', sub: '매일의 인사이트', door: [13, 20] },
  { key: 'factory', sprite: 'pencil', label: '사부작 책공장', sub: '책 만드는 곳', door: [7, 36] },
  { key: 'stay', sprite: 'house', label: '시안북스테이', sub: '책과 머무는 집', door: [15, 24] },
];

// 논리 해상도별 배치. 좌표는 스프라이트 왼쪽 위.
const LAYOUTS = {
  wide: {
    W: 208, H: 112, horizon: 38,
    plaza: { x: 102, y: 90, rx: 24, ry: 7 },
    spots: { fragments: [60, 38], factory: [126, 28], intro: [34, 70], stay: [136, 66] },
    trees: [[8, 52], [186, 48], [96, 30], [168, 40], [14, 88], [182, 90]],
    flowers: [[30, 100, 'flower'], [78, 96, 'flower2'], [124, 102, 'flower'], [196, 104, 'flower2'], [104, 64, 'flower'], [172, 102, 'flower2']],
    clouds: [[20, 6], [120, 12]],
    moon: [186, 6],
  },
  tall: {
    W: 128, H: 168, horizon: 30,
    plaza: { x: 64, y: 112, rx: 22, ry: 7 },
    spots: { intro: [10, 56], fragments: [88, 50], factory: [26, 96], stay: [84, 106] },
    trees: [[50, 36], [2, 128], [108, 148], [64, 64]],
    flowers: [[44, 150, 'flower'], [8, 92, 'flower2'], [118, 96, 'flower'], [60, 158, 'flower2'], [100, 158, 'flower']],
    clouds: [[6, 6], [76, 14]],
    moon: [108, 5],
  },
};

const SKY = {
  day: ['#bfe3f2', '#d3ecf2', '#e8f4ee', '#fdf3dd'],
  dusk: ['#f2a07b', '#f7b989', '#fbd3a0', '#ffe8c2'],
  night: ['#1d2748', '#253259', '#2f3d68', '#3b4a77'],
};
const LAND = {
  day: { hill: '#b7dca2', hillDark: '#9fcd8a', grass: '#a6d681', tuft: '#88c463', path: '#efd7a2', pathEdge: '#dcbc80' },
  dusk: { hill: '#c9c58e', hillDark: '#b3b37a', grass: '#b4c977', tuft: '#98b25e', path: '#edcd98', pathEdge: '#d4ac72' },
  night: { hill: '#3e5a55', hillDark: '#344e4a', grass: '#4e6f4e', tuft: '#405f42', path: '#8a7d63', pathEdge: '#6f644f' },
};

export function timeOfDay(date = new Date()) {
  const h = date.getHours();
  if (h >= 19 || h < 6) return 'night';
  if (h >= 17) return 'dusk';
  return 'day';
}

/** 시드 고정 난수 — 풀 무늬·별 위치가 프레임마다 바뀌지 않게 */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function spriteCanvas(name, { swap = null, flip = false } = {}) {
  const { w, h } = spriteSize(name);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  drawSprite(c.getContext('2d'), name, 0, 0, { swap, flip });
  return c;
}

export function createVillage(canvas, { onEnter, onSelect, reducedMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  let layoutKey = 'wide';
  let L = LAYOUTS.wide;
  let tod = timeOfDay();
  let bg = null;
  const cache = new Map();
  let selected = null;
  let hover = null;
  let raf = 0;
  let last = 0;
  let tick = 0;
  let running = false;

  const pet = { x: 0, y: 0, dir: 1, frame: 0, pause: 20, target: null, hop: 0, hearts: [] };
  const smoke = [];
  let clouds = [];
  let stars = [];

  const get = (name, opts = {}) => {
    const key = `${name}|${opts.swap ? 'n' : 'd'}|${opts.flip ? 'f' : ''}`;
    if (!cache.has(key)) cache.set(key, spriteCanvas(name, opts));
    return cache.get(key);
  };

  function placeRect(p) {
    const [x, y] = L.spots[p.key];
    const { w, h } = spriteSize(p.sprite);
    return { x, y, w, h };
  }

  function doorPoint(p) {
    const r = placeRect(p);
    return { x: r.x + p.door[0], y: Math.min(L.H - 4, r.y + p.door[1] + 2) };
  }

  /* ---------- 고정 배경 (하늘·언덕·땅·길·나무) ---------- */

  function paintBackground() {
    const c = document.createElement('canvas');
    c.width = L.W;
    c.height = L.H;
    const g = c.getContext('2d');
    const land = LAND[tod];
    const sky = SKY[tod];
    const rand = rng(layoutKey === 'wide' ? 7 : 11);

    // 하늘 — 띠 사이를 체크무늬로 섞어 도트 그라데이션을 만든다
    const band = Math.ceil(L.horizon / sky.length);
    for (let y = 0; y < L.horizon + 6; y++) {
      const i = Math.min(sky.length - 1, Math.floor(y / band));
      const edge = y % band === band - 1 && i < sky.length - 1;
      for (let x = 0; x < L.W; x++) {
        g.fillStyle = edge && (x + y) % 2 ? sky[i + 1] : sky[i];
        g.fillRect(x, y, 1, 1);
      }
    }

    // 먼 언덕
    for (let x = 0; x < L.W; x++) {
      const top = L.horizon - 4 + Math.round(Math.sin(x / 13) * 2.5 + Math.sin(x / 5.3) * 1.2);
      g.fillStyle = land.hillDark;
      g.fillRect(x, top, 1, L.horizon - top + 4);
      g.fillStyle = land.hill;
      g.fillRect(x, top + 2, 1, L.horizon - top + 2);
    }

    // 땅
    g.fillStyle = land.grass;
    g.fillRect(0, L.horizon + 2, L.W, L.H - L.horizon - 2);
    for (let i = 0; i < L.W * L.H / 40; i++) {
      const x = Math.floor(rand() * L.W);
      const y = L.horizon + 4 + Math.floor(rand() * (L.H - L.horizon - 4));
      g.fillStyle = land.tuft;
      g.fillRect(x, y, 1, 1);
      if (rand() > 0.6) g.fillRect(x + 1, y - 1, 1, 1);
    }

    // 길: 광장 + 각 집 문에서 광장까지
    const brush = (x, y, r, color) => {
      g.fillStyle = color;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy <= r * r + 1) g.fillRect(Math.round(x + dx), Math.round(y + dy), 1, 1);
        }
      }
    };
    const stroke = (a, b, r, color) => {
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
      for (let i = 0; i <= n; i++) brush(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n, r, color);
    };
    const { plaza } = L;
    const center = { x: plaza.x, y: plaza.y };
    for (const pass of [[3, land.pathEdge], [2, land.path]]) {
      for (const p of PLACES) {
        const d = doorPoint(p);
        const mid = { x: d.x, y: d.y + 2 };
        stroke(d, mid, pass[0], pass[1]);
        stroke(mid, center, pass[0], pass[1]);
      }
      for (let y = -plaza.ry - 1; y <= plaza.ry + 1; y++) {
        for (let x = -plaza.rx - 2; x <= plaza.rx + 2; x++) {
          const k = (x * x) / ((plaza.rx + (pass[0] === 3 ? 1 : 0)) ** 2) + (y * y) / ((plaza.ry + (pass[0] === 3 ? 1 : 0)) ** 2);
          if (k <= 1) { g.fillStyle = pass[1]; g.fillRect(plaza.x + x, plaza.y + y, 1, 1); }
        }
      }
    }

    // 나무·꽃 (건물 뒤에 있어도 되는 것들)
    for (const [x, y] of L.trees) g.drawImage(get('tree'), x, y);
    for (const [x, y, name] of L.flowers) g.drawImage(get(name), x, y);
    return c;
  }

  function resetScene() {
    bg = paintBackground();
    const rand = rng(3);
    stars = tod === 'night'
      ? Array.from({ length: Math.round(L.W / 6) }, () => ({
          x: Math.floor(rand() * L.W), y: Math.floor(rand() * (L.horizon - 8)), p: Math.floor(rand() * 40),
        }))
      : [];
    clouds = tod === 'night' ? [] : L.clouds.map(([x, y], i) => ({ x, y, speed: 0.04 + i * 0.025 }));
    pet.x = L.plaza.x;
    pet.y = L.plaza.y;
    pet.target = null;
    smoke.length = 0;
  }

  /* ---------- 움직임 ---------- */

  function pickWanderTarget() {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    return { x: L.plaza.x + Math.cos(a) * r * (L.plaza.rx - 4), y: L.plaza.y + Math.sin(a) * r * (L.plaza.ry - 1) };
  }

  function step() {
    tick += 1;

    // 펫: 고른 집이 있으면 그 문 앞으로, 아니면 광장을 어슬렁
    if (pet.hop > 0) pet.hop -= 1;
    if (pet.pause > 0) {
      pet.pause -= 1;
    } else {
      if (!pet.target) pet.target = pickWanderTarget();
      const dx = pet.target.x - pet.x;
      const dy = pet.target.y - pet.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.8) {
        pet.target = null;
        pet.pause = selected ? 9999 : 18 + Math.floor(Math.random() * 30);
      } else {
        const speed = selected ? 1.1 : 0.55;
        pet.x += (dx / dist) * Math.min(speed, dist);
        pet.y += (dy / dist) * Math.min(speed, dist);
        if (Math.abs(dx) > 0.3) pet.dir = dx > 0 ? 1 : -1;
        if (tick % 3 === 0) pet.frame ^= 1;
      }
    }
    pet.hearts = pet.hearts.filter((h) => (h.t -= 1) > 0);

    // 굴뚝 연기
    const house = PLACES.find((p) => p.key === 'stay');
    const hr = placeRect(house);
    if (tick % 14 === 0) smoke.push({ x: hr.x + 22, y: hr.y + 2, t: 30 });
    for (const s of smoke) { s.y -= 0.35; s.x += 0.12; s.t -= 1; }
    while (smoke.length && smoke[0].t <= 0) smoke.shift();

    for (const c of clouds) {
      c.x += c.speed;
      if (c.x > L.W + 2) c.x = -20;
    }
  }

  /* ---------- 그리기 ---------- */

  function draw() {
    if (!bg) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0);
    const night = tod === 'night';

    for (const s of stars) {
      if ((tick + s.p) % 40 < 34) { ctx.fillStyle = (s.p % 3) ? '#fff3b0' : '#ffffff'; ctx.fillRect(s.x, s.y, 1, 1); }
    }
    if (night) ctx.drawImage(get('moon'), L.moon[0], L.moon[1]);
    for (const c of clouds) ctx.drawImage(get('cloud'), Math.round(c.x), c.y);

    // 건물 — 뒤(위)에 있는 것부터
    const order = [...PLACES].sort((a, b) => (placeRect(a).y + placeRect(a).h) - (placeRect(b).y + placeRect(b).h));
    const petBase = pet.y;
    let petDrawn = false;
    const drawPet = () => {
      const name = pet.frame && !pet.pause ? 'pet_b' : (tick % 60 < 3 ? 'pet_blink' : 'pet_a');
      const hopY = pet.hop ? Math.round(Math.sin((pet.hop / 8) * Math.PI) * 4) : 0;
      ctx.drawImage(get(name, { flip: pet.dir < 0 }), Math.round(pet.x - 5), Math.round(pet.y - 10 - hopY));
      for (const h of pet.hearts) ctx.drawImage(get('heart'), Math.round(pet.x - 3), Math.round(pet.y - 18 - (24 - h.t) * 0.6));
      petDrawn = true;
    };
    for (const p of order) {
      const r = placeRect(p);
      if (!petDrawn && petBase < r.y + r.h) drawPet();
      const lift = (hover === p.key || selected === p.key) && !reducedMotion ? (tick % 16 < 8 ? 1 : 0) : 0;
      ctx.drawImage(get(p.sprite, { swap: night ? NIGHT_SWAP : null }), r.x, r.y - lift);
      if (p.key === 'fragments' && tick % 24 < 12) ctx.drawImage(get('sparkle'), r.x + 19, r.y - 2);
    }
    if (!petDrawn) drawPet();

    for (const s of smoke) {
      ctx.globalAlpha = Math.max(0, s.t / 30) * 0.8;
      ctx.fillStyle = night ? '#9aa3b8' : '#ffffff';
      const size = s.t > 18 ? 2 : 3;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), size, size);
      ctx.globalAlpha = 1;
    }

    // 선택 커서 ▼ (다마고치 메뉴처럼)
    if (selected) {
      const p = PLACES.find((q) => q.key === selected);
      const r = placeRect(p);
      const bob = tick % 12 < 6 ? 0 : 1;
      const cx = r.x + Math.floor(r.w / 2);
      const cy = Math.max(1, r.y - 7 + bob);
      ctx.fillStyle = '#3b2416';
      ctx.fillRect(cx - 3, cy, 7, 1);
      ctx.fillRect(cx - 2, cy + 1, 5, 1);
      ctx.fillRect(cx - 1, cy + 2, 3, 1);
      ctx.fillRect(cx, cy + 3, 1, 1);
      ctx.fillStyle = '#fff8ec';
      ctx.fillRect(cx - 2, cy, 5, 1);
      ctx.fillRect(cx - 1, cy + 1, 3, 1);
      ctx.fillRect(cx, cy + 2, 1, 1);
    }
  }

  function loop(ts) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (ts - last < 83) return; // 약 12fps — 도트 애니메이션 느낌
    last = ts;
    const now = timeOfDay();
    if (now !== tod) { tod = now; resetScene(); }
    step();
    draw();
  }

  /* ---------- 바깥에서 쓰는 것 ---------- */

  function setLayout(key) {
    if (!LAYOUTS[key]) return;
    const changed = key !== layoutKey || !bg;
    layoutKey = key;
    L = LAYOUTS[key];
    canvas.width = L.W;
    canvas.height = L.H;
    if (changed) resetScene();
    draw();
  }

  function hitTest(lx, ly) {
    const pr = { x: pet.x - 6, y: pet.y - 11, w: 12, h: 12 };
    if (lx >= pr.x && lx <= pr.x + pr.w && ly >= pr.y && ly <= pr.y + pr.h) return 'pet';
    for (const p of [...PLACES].reverse()) {
      const r = placeRect(p);
      if (lx >= r.x && lx < r.x + r.w && ly >= r.y && ly < r.y + r.h) return p.key;
    }
    return null;
  }

  function toLogical(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((evt.clientX - rect.left) / rect.width) * L.W,
      y: ((evt.clientY - rect.top) / rect.height) * L.H,
    };
  }

  canvas.addEventListener('pointermove', (e) => {
    const { x, y } = toLogical(e);
    const hit = hitTest(x, y);
    hover = hit && hit !== 'pet' ? hit : null;
    canvas.style.cursor = hit ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('click', (e) => {
    const { x, y } = toLogical(e);
    const hit = hitTest(x, y);
    if (hit === 'pet') petTap();
    else if (hit) onEnter?.(hit);
  });

  function petTap() {
    pet.hop = 8;
    pet.hearts.push({ t: 24 });
    if (reducedMotion) draw();
  }

  return {
    setLayout,
    layout: () => layoutKey,
    size: () => ({ W: L.W, H: L.H }),
    /** 간판 위치 (장면 대비 %) */
    signPositions() {
      return PLACES.map((p) => {
        const r = placeRect(p);
        return { ...p, left: ((r.x + r.w / 2) / L.W) * 100, top: ((r.y + r.h + 1) / L.H) * 100 };
      });
    },
    select(key) {
      selected = key;
      const p = PLACES.find((q) => q.key === key);
      if (p) { pet.target = doorPoint(p); pet.pause = 0; }
      else { pet.target = null; pet.pause = 10; }
      onSelect?.(key);
      if (reducedMotion) { if (p) { const d = doorPoint(p); pet.x = d.x; pet.y = d.y; } draw(); }
    },
    selected: () => selected,
    setHover(key) { hover = key; if (reducedMotion) draw(); },
    petTap,
    start() {
      if (running) return;
      if (reducedMotion) { draw(); return; }
      running = true;
      raf = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    redraw: draw,
  };
}
