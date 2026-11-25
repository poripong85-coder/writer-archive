// 상품 구매 페이지 — app/shop.js 의 상품 정보로 그린다. 아직 없는 정보는 '준비 중'으로 보여준다.

import { el } from '../ui.js';
import * as store from '../store.js';
import { sprite } from '../pixel.js';
import { PRODUCTS } from '../shop.js';

export function createShopPage(key) {
  const p = PRODUCTS[key];
  const ready = !!p.buyUrl;

  const gallery = p.photos.length
    ? el('div', { class: 'shop-photos' }, ...p.photos.map((ph, i) =>
        el('img', { src: ph.src, alt: ph.alt || `${p.name} 사진 ${i + 1}`, loading: i ? 'lazy' : 'eager' })))
    : el('div', { class: 'shop-photo-empty' },
        sprite(p.icon, { scale: 6 }),
        el('p', { class: 'px', text: '상세 사진 준비 중' }));

  const fact = (label, value, empty) => el('div', { class: 'shop-fact' },
    el('dt', { text: label }),
    el('dd', { class: value ? '' : 'muted', text: value || empty }));

  const root = el('section', { class: `page text-page shop shop-${key}`, 'aria-labelledby': `shop-${key}-title` },
    el('header', { class: 'tp-head' },
      sprite(p.icon, { scale: 3, className: 'tp-sprite' }),
      el('div', { class: 'tp-title' },
        el('h1', { class: 'px', id: `shop-${key}-title`, text: `${p.name} 구매하기` }),
        ready ? null : el('span', { class: 'status-pill', text: p.status }),
        el('p', { class: 'page-lead', text: p.lead }),
      ),
    ),
    gallery,
    el('section', { class: 'shop-section', 'aria-labelledby': `shop-${key}-items` },
      el('h2', { class: 'px', id: `shop-${key}-items`, text: '구성품' }),
      p.items.length
        ? el('ul', { class: 'shop-items' }, ...p.items.map((t) => el('li', { text: t })))
        : el('p', { class: 'muted', text: '구성품을 정리하고 있어요. 곧 채워 둘게요.' }),
    ),
    el('dl', { class: 'shop-facts' },
      fact('가격', p.price, '곧 알려드려요'),
      fact('구매 방법', p.howToBuy, '곧 알려드려요'),
    ),
    ready
      ? el('a', { class: 'btn primary wide shop-buy', href: p.buyUrl, target: '_blank', rel: 'noopener noreferrer', text: '구매하기' })
      : el('button', { class: 'btn wide shop-buy', type: 'button', disabled: true, text: '판매 준비중이에요' }),
    p.back ? el('a', {
      class: 'back-link tp-back', href: `#${p.back.route}`, text: p.back.text,
      onclick: (e) => { e.preventDefault(); store.go(p.back.route); },
    }) : null,
  );

  return { root, update() {}, activate() {}, deactivate() {} };
}
