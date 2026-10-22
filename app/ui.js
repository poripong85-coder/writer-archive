// 공용 UI 조각: DOM 헬퍼, 토스트, 시트, 라이트박스, 엔트리/조각 카드.

import {
  formatTime, formatDayLabel, relativeDayLabel, richTextHtml,
  extractUrls, domainOf, pathOf, summarize, escapeHtml,
} from './util.js';
import { photoSrc } from './media.js';
import * as store from './store.js';

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* ---------- 토스트 ---------- */

export function toast(message, { peel = false, ms = 2600 } = {}) {
  const host = document.getElementById('toasts');
  const node = el('div', { class: `toast${peel ? ' peel' : ''}` }, peel ? '🍊' : null, message);
  host.append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .2s, transform .2s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 220);
  }, ms);
}

/* ---------- 시트(모달) ---------- */

export function openSheet(title, buildBody, { onClose } = {}) {
  const overlays = document.getElementById('overlays');
  const body = el('div', { class: 'sheet-body' });
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('div', { class: 'sheet-head' },
      el('h2', { text: title }),
      el('button', {
        class: 'icon-btn', type: 'button', 'aria-label': '닫기', onclick: close,
        html: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
      }),
    ),
    body,
  );
  const backdrop = el('div', {
    class: 'sheet-backdrop',
    onclick: (e) => { if (e.target === backdrop) close(); },
  }, sheet);
  overlays.append(backdrop);
  document.addEventListener('keydown', onKey);
  buildBody(body, close);
  return close;
}

/* ---------- 확인 다이얼로그 ---------- */

/**
 * 브라우저 confirm() 대신 쓰는 확인창.
 * 임베드된 환경에서는 네이티브 confirm()이 즉시 false를 돌려주기 때문에
 * 삭제 같은 동작이 조용히 무시된다. 그래서 확인 단계를 페이지 안에 둔다.
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, { confirmText = '삭제', cancelText = '취소', danger = true } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (answer) => {
      if (settled) return;
      settled = true;
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(answer);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') finish(false);
      if (e.key === 'Enter') finish(true);
    };
    const okBtn = el('button', {
      class: `btn${danger ? ' danger' : ' primary'}`, type: 'button', text: confirmText,
      onclick: () => finish(true),
    });
    const dialog = el('div', { class: 'confirm', role: 'alertdialog', 'aria-modal': 'true' },
      el('p', { class: 'confirm-text', text: message }),
      el('div', { class: 'confirm-actions' },
        el('button', { class: 'btn', type: 'button', text: cancelText, onclick: () => finish(false) }),
        okBtn,
      ),
    );
    const backdrop = el('div', {
      class: 'sheet-backdrop confirm-backdrop',
      onclick: (e) => { if (e.target === backdrop) finish(false); },
    }, dialog);
    document.getElementById('overlays').append(backdrop);
    document.addEventListener('keydown', onKey);
    okBtn.focus();
  });
}

/* ---------- 라이트박스 ---------- */

export function openLightbox(images, index = 0) {
  const overlays = document.getElementById('overlays');
  let i = index;
  const img = el('img', { src: photoSrc(images[i]), alt: images[i].name || '사진' });
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const step = (d) => {
    i = (i + d + images.length) % images.length;
    img.src = photoSrc(images[i]);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  };
  const box = el('div', { class: 'lightbox', onclick: (e) => { if (e.target === box) close(); } },
    img,
    el('button', { class: 'close', type: 'button', 'aria-label': '닫기', text: '✕', onclick: close }),
  );
  overlays.append(box);
  document.addEventListener('keydown', onKey);
}

/* ---------- 링크 / 사진 ---------- */

export function linkCard(url) {
  const host = domainOf(url);
  const favicon = el('span', { class: 'link-favicon', text: host.slice(0, 1) });
  const icon = el('img', { src: `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`, alt: '', loading: 'lazy' });
  icon.addEventListener('error', () => icon.remove());
  icon.addEventListener('load', () => { favicon.textContent = ''; favicon.append(icon); });
  return el('a', { class: 'link-card', href: url, target: '_blank', rel: 'noopener noreferrer' },
    favicon,
    el('span', { class: 'link-body' },
      el('span', { class: 'link-host', text: host }),
      el('span', { class: 'link-path', text: pathOf(url) }),
    ),
  );
}

function photoImg(image) {
  const img = el('img', { src: photoSrc(image), alt: image.name || '사진', loading: 'lazy' });
  img.addEventListener('error', () => {
    img.replaceWith(el('span', { class: 'photo-missing', text: '사진을 불러올 수 없어요' }));
  }, { once: true });
  return img;
}

export function photoGrid(images) {
  const shown = images.slice(0, 4);
  const grid = el('div', { class: `photos n${Math.min(shown.length, 4)}` });
  shown.forEach((image, idx) => {
    const isLast = idx === 3 && images.length > 4;
    const btn = el('button', {
      type: 'button',
      class: isLast ? 'photo-more' : null,
      dataset: isLast ? { more: `+${images.length - 3}` } : {},
      'aria-label': '사진 크게 보기',
      onclick: () => openLightbox(images, idx),
    }, photoImg(image));
    grid.append(btn);
  });
  return grid;
}

function onTagClick(node) {
  node.addEventListener('click', (e) => {
    const tag = e.target?.dataset?.tag;
    if (!tag) return;
    store.setActiveTag(tag);
  });
  return node;
}

/* ---------- 엔트리 버블 (오늘 화면) ---------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text || '');
    toast('복사했어요');
  } catch {
    toast('복사할 수 없어요');
  }
}

/**
 * @param {object} entry
 * @param {object} o
 * @param {import('./books.js').Book} o.book
 * @param {(entry) => void} [o.onEdit]
 */
export function entryBubble(entry, { book, onEdit } = {}) {
  const urls = extractUrls(entry.text);
  const editable = !!book?.canWrite;
  const bubble = el('div', { class: 'bubble' });

  if (entry.text) {
    bubble.append(onTagClick(el('div', { class: 'bubble-text', html: richTextHtml(entry.text) })));
  }
  if (entry.images?.length) bubble.append(photoGrid(entry.images));
  for (const url of urls.slice(0, 3)) bubble.append(linkCard(url));

  bubble.append(el('div', { class: 'entry-actions' },
    editable ? el('button', { type: 'button', text: '수정', onclick: () => onEdit?.(entry) }) : null,
    el('button', { type: 'button', text: '복사', onclick: () => copyText(entry.text) }),
    editable ? el('button', {
      type: 'button', text: '삭제',
      onclick: async () => {
        if (!await confirmDialog('이 조각을 지울까요?')) return;
        try {
          await book.remove(entry.id);
          toast('삭제했어요');
        } catch (err) {
          toast(err.message || '지우지 못했어요');
        }
      },
    }) : null,
  ));

  const star = editable
    ? el('button', {
        class: `entry-star${entry.starred ? ' on' : ''}`, type: 'button',
        title: '핵심 인사이트로 표시', 'aria-label': '핵심 인사이트로 표시',
        'aria-pressed': entry.starred ? 'true' : 'false',
        text: entry.starred ? '★' : '☆',
        onclick: () => book.update(entry.id, { starred: !entry.starred }).catch((err) => toast(err.message)),
      })
    : (entry.starred ? el('span', { class: 'entry-star on', title: '핵심 인사이트', text: '★' }) : null);

  return el('div', { class: `entry${entry.starred ? ' starred' : ''}`, dataset: { id: entry.id } },
    el('div', { class: 'entry-meta' }, star, el('span', { text: formatTime(entry.createdAt) })),
    bubble,
  );
}

/* ---------- 인사이트 조각 카드 (달력 / 조각 화면) ---------- */

export function fragmentCard(dayKey, entries, { sealed, limit = 4, onOpenDay } = {}) {
  const stats = summarize(entries);
  const card = el('div', { class: 'frag' });

  card.append(el('div', { class: 'frag-head' },
    el('div', { class: 'frag-date' },
      relativeDayLabel(dayKey),
      el('small', { text: formatDayLabel(dayKey) }),
    ),
    el('span', {
      class: `frag-seal${sealed ? '' : ' live'}`,
      text: sealed ? '봉인됨' : '오늘 진행 중',
    }),
  ));

  const statRow = el('div', { class: 'frag-stats' },
    el('span', { class: 'pill', text: `조각 ${stats.count}` }),
    stats.links ? el('span', { class: 'pill', text: `링크 ${stats.links}` }) : null,
    stats.photos ? el('span', { class: 'pill', text: `사진 ${stats.photos}` }) : null,
    stats.starred ? el('span', { class: 'pill', text: `★ ${stats.starred}` }) : null,
    stats.chars ? el('span', { class: 'pill', text: `${stats.chars}자` }) : null,
  );
  for (const t of stats.tags.slice(0, 6)) {
    statRow.append(el('span', {
      class: 'pill tag-pill', text: `#${t.tag}${t.count > 1 ? ` ${t.count}` : ''}`,
      onclick: () => store.setActiveTag(t.tag),
    }));
  }
  card.append(statRow);

  const body = el('div', { class: 'frag-body' });
  let expanded = false;

  const renderBody = () => {
    clear(body);
    const list = expanded ? entries : entries.slice(0, limit);
    for (const e of list) body.append(fragmentEntry(e));
  };
  renderBody();
  card.append(body);

  if (entries.length > limit) {
    const more = el('button', {
      class: 'frag-more', type: 'button',
      text: `조각 ${entries.length - limit}개 더 보기`,
      onclick: () => {
        expanded = !expanded;
        renderBody();
        more.textContent = expanded ? '접기' : `조각 ${entries.length - limit}개 더 보기`;
      },
    });
    card.append(more);
  } else if (onOpenDay) {
    card.append(el('button', { class: 'frag-more', type: 'button', text: '이 날 열기', onclick: () => onOpenDay(dayKey) }));
  }

  return card;
}

export function fragmentEntry(entry) {
  const urls = extractUrls(entry.text);
  const body = el('div', { class: 'frag-entry-body' });
  if (entry.text) body.append(onTagClick(el('div', { class: 'frag-entry-text', html: richTextHtml(entry.text) })));
  if (entry.images?.length) body.append(photoGrid(entry.images));
  for (const url of urls.slice(0, 2)) body.append(linkCard(url));

  return el('div', { class: `frag-entry${entry.starred ? ' star' : ''}` },
    el('div', { class: 'frag-entry-time', text: formatTime(entry.createdAt) }),
    body,
  );
}

export function emptyState(icon, title, desc) {
  return el('div', { class: 'empty' },
    el('div', { class: 'big', text: icon }),
    el('h3', { text: title }),
    el('p', { html: escapeHtml(desc).replace(/\n/g, '<br>') }),
  );
}
