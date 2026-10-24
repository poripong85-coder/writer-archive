// 와글와글 방명록 — 마을에 다녀간 흔적. 말풍선 벽처럼 쌓인다.

import { el, clear, toast, confirmDialog } from '../ui.js';
import { timeOfDay } from '../village.js';
import * as store from '../store.js';
import { sprite } from '../pixel.js';
import { STAMPS, MAX_MESSAGE, MAX_NAME } from '../guestbook.js';
import { loginButtons } from '../auth.js';
import { timeAgo } from '../util.js';

const STAMP_SPRITE = { gyul: 'i-gyul', star: 'i-star', pencil: 'i-pencil', house: 'i-house', heart: 'heart' };
const STAMP_LABEL = { gyul: '귤', star: '별', pencil: '연필', house: '집', heart: '하트' };
const NAME_KEY = 'gyul.guestName';
const STAMP_KEY = 'gyul.guestStamp';

/** 지금 귤에게 줄 수 있는 선물 — 낮(아침·저녁)엔 햇살 조각, 밤엔 별 조각 */
export function giftNow(date = new Date()) {
  return timeOfDay(date) === 'night'
    ? { kind: 'star', sprite: 'mini-star', title: '귤에게 별빛 주기', piece: '별빛 조각', when: '밤' }
    : { kind: 'sun', sprite: 'mini-sun', title: '귤에게 햇살 주기', piece: '햇살 조각', when: '낮' };
}

/** 같은 글은 늘 같은 색·기울기 (id 해시) */
function tone(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { color: h % 4, tilt: (h >> 3) % 3 };
}

export function createGuestbookPage() {
  const giftNote = el('p', { class: 'gb-gift' });
  const compose = el('div', { class: 'gb-compose' });
  const count = el('p', { class: 'gb-count' });
  const wall = el('div', { class: 'gb-wall', 'aria-live': 'polite' });
  let composeKey = '';
  let busy = false;
  let pickedStamp = store.storage.get(STAMP_KEY, 'gyul');
  if (!STAMPS.includes(pickedStamp)) pickedStamp = 'gyul';

  const root = el('section', { class: 'page gb', 'aria-labelledby': 'gb-title' },
    el('header', { class: 'tp-head gb-head' },
      sprite('chat', { scale: 3, className: 'tp-sprite' }),
      el('div', { class: 'tp-title' },
        el('h1', { class: 'px', id: 'gb-title', text: '와글와글 방명록' }),
        el('p', { class: 'page-lead', text: '귤껍질 마을에 다녀간 흔적을 남겨주세요. 한마디면 충분해요.' }),
      ),
    ),
    giftNote,
    compose,
    count,
    wall,
    el('a', { class: 'back-link gb-home', href: '#', text: '← 귤껍질 마을로', onclick: (e) => { e.preventDefault(); store.go('home'); } }),
  );

  const gb = () => store.state.guestbook;

  function buildForm() {
    const me = store.state.env?.me || {};
    const nameInput = el('input', {
      id: 'gb-name', class: 'field', type: 'text', maxlength: String(MAX_NAME), autocomplete: 'nickname',
      placeholder: '이름 (예: 귤 좋아하는 하루)',
    });
    nameInput.value = store.storage.get(NAME_KEY, '') || me.name || '';
    const msg = el('textarea', {
      id: 'gb-message', class: 'field', rows: '3', maxlength: String(MAX_MESSAGE),
      placeholder: '마을에 남길 한마디',
    });
    const counter = el('span', { class: 'gb-counter', text: `0/${MAX_MESSAGE}` });
    const send = el('button', { class: 'btn primary', type: 'submit', text: '남기기' });

    const stamps = el('div', { class: 'gb-stamps', role: 'radiogroup', 'aria-label': '스탬프 고르기' });
    for (const s of STAMPS) {
      const b = el('button', {
        type: 'button', class: `gb-stamp${s === pickedStamp ? ' on' : ''}`, role: 'radio',
        'aria-checked': s === pickedStamp ? 'true' : 'false', 'aria-label': STAMP_LABEL[s], title: STAMP_LABEL[s],
        dataset: { stamp: s },
        onclick: () => {
          pickedStamp = s;
          store.storage.set(STAMP_KEY, s);
          for (const x of stamps.children) {
            const on = x.dataset.stamp === s;
            x.classList.toggle('on', on);
            x.setAttribute('aria-checked', on ? 'true' : 'false');
          }
        },
      }, sprite(STAMP_SPRITE[s], { scale: 2 }));
      stamps.append(b);
    }

    const sync = () => {
      counter.textContent = `${msg.value.length}/${MAX_MESSAGE}`;
      send.disabled = busy || !msg.value.trim() || !nameInput.value.trim();
    };
    msg.addEventListener('input', sync);
    nameInput.addEventListener('input', sync);
    msg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.requestSubmit(); }
    });

    const form = el('form', { class: 'gb-form' },
      el('div', { class: 'gb-row' },
        el('label', { class: 'field-label', for: 'gb-name', text: '이름' }),
        nameInput,
      ),
      el('div', { class: 'gb-row' },
        el('span', { class: 'field-label', text: '스탬프' }),
        stamps,
      ),
      el('div', { class: 'gb-row' },
        el('label', { class: 'field-label', for: 'gb-message', text: '한마디' }),
        msg,
      ),
      el('div', { class: 'gb-actions' }, counter, send),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      sync();
      try {
        await gb().add({ name: nameInput.value, stamp: pickedStamp, message: msg.value });
        store.storage.set(NAME_KEY, nameInput.value.trim());
        msg.value = '';
        await offerGift();
      } catch (err) {
        toast(err?.message || '남기지 못했어요');
      } finally {
        busy = false;
        sync();
      }
    });
    sync();
    return form;
  }

  /** 남긴 뒤: "귤에게 햇살(별빛) 주기" YES → 마을로 가서 조각이 귤 머리 위로 떨어진다 */
  async function offerGift() {
    const gift = giftNow();
    const yes = await confirmDialog(`방명록 고마워요! 마을의 귤에게 ${gift.piece}을 선물할까요?`, {
      title: gift.title,
      icon: sprite(gift.sprite, { scale: 5 }),
      confirmText: 'YES',
      cancelText: 'NO',
      danger: false,
      className: 'gift',
    });
    if (yes) {
      store.queueStarDrop(gift.kind);
      store.go('home');
    } else {
      toast('방명록에 남겼어요', { peel: true });
    }
  }

  function renderGiftNote() {
    const gift = giftNow();
    clear(giftNote);
    giftNote.append(
      sprite(gift.sprite, { scale: 3, className: 'gb-gift-icon' }),
      el('span', {},
        '한마디를 남기면 마을의 귤에게 ',
        el('strong', { text: gift.piece }),
        `을 선물할 수 있어요. 낮에는 해에서 햇살 조각이, 밤에는 별 사이에서 별 조각이 귤 머리 위로 떨어져요.`,
      ),
    );
  }

  function renderCompose() {
    const book = gb();
    const env = store.state.env;
    clear(compose);
    if (!book || !env) {
      compose.append(el('p', { class: 'muted', text: '불러오는 중이에요…' }));
      return;
    }
    if (book.status === 'notready') {
      compose.hidden = true;
      return;
    }
    compose.hidden = false;
    if (book.canWrite) {
      compose.append(buildForm());
      return;
    }
    if (env.mode === 'web') {
      compose.append(el('div', { class: 'gb-login' },
        el('p', { text: '로그인하면 방명록에 한마디를 남길 수 있어요.' }),
        loginButtons(env),
      ));
    } else if (env.mode === 'cloud' && book.denied) {
      compose.append(el('p', { class: 'muted', text: '아직 방명록을 남길 수 있는 권한이 없어요. 관리자에게 요청해 주세요.' }));
    } else if (env.mode === 'guest' || env.mode === 'cloud') {
      compose.append(el('p', { class: 'muted', text: 'claude.ai에 로그인하면 방명록을 보고 남길 수 있어요.' }));
    } else {
      compose.append(el('p', { class: 'muted', text: '지금은 방명록을 불러올 수 없어요. 새로고침해 주세요.' }));
    }
  }

  function note(item, book) {
    const { color, tilt } = tone(item.id);
    const del = book.canDelete(item)
      ? el('button', {
          class: 'gb-del', type: 'button', 'aria-label': '이 글 지우기', title: '지우기', text: '✕',
          onclick: async () => {
            const mine = book.isMine(item);
            if (!await confirmDialog(mine ? '내가 남긴 이 글을 지울까요?' : '이 방문자의 글을 지울까요?')) return;
            try {
              await book.remove(item);
              toast('지웠어요');
            } catch (err) {
              toast(err?.message || '지우지 못했어요');
            }
          },
        })
      : null;
    return el('article', { class: `gb-note c${color} t${tilt}`, dataset: { id: item.id } },
      el('header', { class: 'gb-note-head' },
        sprite(STAMP_SPRITE[item.stamp], { scale: 2, className: 'gb-note-stamp', label: STAMP_LABEL[item.stamp] }),
        el('strong', { class: 'gb-name', text: item.name }),
        item.byAdmin ? el('span', { class: 'gb-badge', text: '편집장' }) : null,
        el('time', { class: 'gb-time', datetime: new Date(item.createdAt).toISOString(), text: timeAgo(item.createdAt) }),
        del,
      ),
      el('p', { class: 'gb-msg', text: item.message }),
    );
  }

  function renderWall() {
    const book = gb();
    clear(wall);
    if (!book || book.status === 'loading' || book.status === 'idle') {
      count.textContent = '';
      wall.append(el('p', { class: 'muted', text: '말풍선을 모으는 중이에요…' }));
      return;
    }
    if (book.status === 'unavailable') {
      count.textContent = '';
      return;
    }
    if (book.status === 'notready') {
      count.textContent = '';
      wall.append(el('div', { class: 'soon' },
        el('p', { class: 'px soon-title', text: '와글와글 방명록이 곧 문을 열어요' }),
        el('p', { text: '말풍선을 모을 준비를 하고 있어요. 조금만 기다려 주세요!' }),
        store.state.env?.me?.isOwner
          ? el('p', { class: 'muted', text: '편집장에게만 보이는 안내: Supabase SQL Editor에서 supabase/guestbook.sql 을 실행하면 바로 열려요.' })
          : null,
      ));
      return;
    }
    if (book.status === 'error') {
      count.textContent = '';
      wall.append(el('p', { class: 'muted', text: '방명록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.' }));
      return;
    }
    count.textContent = book.items.length ? `와글와글 ${book.items.length}개` : '';
    if (!book.items.length) {
      wall.append(el('div', { class: 'soon' },
        el('p', { class: 'px soon-title', text: '아직 아무도 다녀가지 않았어요' }),
        el('p', { text: '첫 번째 발자국을 남겨주세요!' }),
      ));
      return;
    }
    for (const item of book.items) wall.append(note(item, book));
  }

  return {
    root,
    update() {
      // 쓰는 칸은 '쓸 수 있는 상태'가 바뀔 때만 다시 그린다 — 입력하던 글이 날아가지 않게
      const book = gb();
      const env = store.state.env;
      const key = `${env?.mode}|${env?.me?.id}|${!!book}|${book?.canWrite}|${book?.denied}|${book?.status === 'notready'}`;
      if (key !== composeKey) { composeKey = key; renderCompose(); }
      renderGiftNote();
      renderWall();
    },
    activate() {},
    deactivate() {},
  };
}
