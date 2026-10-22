// 오늘 — 카톡 '내게 쓰기'처럼 자유롭게 쌓는 화면. 쓸 수 있는 사람에게만 보인다.

import { el, clear, toast, entryBubble, emptyState } from '../ui.js';
import * as store from '../store.js';
import { prepareImages, filesFromEvent, imageUrl } from '../media.js';
import { WriteDeniedError } from '../books.js';
import {
  formatDayLabel, untilMidnightLabel, groupByTimeGap, formatTime, summarize,
} from '../util.js';

const ICON_PHOTO = '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.8" width="17" height="14.4" rx="2.4"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 17l4.2-4.2a1.8 1.8 0 012.5 0l3 3M14 14.5l1.6-1.6a1.8 1.8 0 012.5 0l1.9 1.9"/></svg>';
const ICON_SEND = '<svg viewBox="0 0 24 24"><path d="M4.4 12.2l14.9-6.6-6.4 14.8-2.2-6-6.3-2.2z"/></svg>';

export function createTodayView(bookKey) {
  const book = () => store.book(bookKey);
  let pending = [];
  let editingId = null;
  let sending = false;
  let tickTimer = null;

  const banner = el('div', { class: 'day-banner' });
  const stream = el('div', { class: 'stream' });
  const scroll = el('div', { class: 'scroll' }, stream);

  const textarea = el('textarea', {
    id: `composer-${bookKey}`,
    rows: '1',
    placeholder: bookKey === 'public'
      ? '오늘 떠오른 생각, 링크, 사진을 남겨보세요 (모두에게 공개돼요)'
      : '오늘 떠오른 생각을 남겨보세요 (나만 볼 수 있어요)',
    'aria-label': '오늘의 조각 입력',
  });
  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const pendingRow = el('div', { class: 'pending' });
  const photoBtn = el('button', {
    class: 'round-btn', type: 'button', 'aria-label': '사진 첨부', title: '사진 첨부',
    html: ICON_PHOTO, onclick: () => fileInput.click(),
  });
  const sendBtn = el('button', {
    class: 'round-btn send-btn', type: 'button', 'aria-label': '남기기',
    html: ICON_SEND, disabled: true,
  });
  const editNote = el('div', { class: 'editing-note', hidden: true });
  const deniedNote = el('div', { class: 'denied-note', hidden: true });
  const hint = el('div', { class: 'composer-hint' });

  const composer = el('div', { class: 'composer' },
    editNote,
    pendingRow,
    el('div', { class: 'composer-row' }, photoBtn, textarea, sendBtn),
    hint,
    fileInput,
  );

  const root = el('div', { class: 'view today-view' }, banner, scroll, deniedNote, composer);

  /* ---------- 입력 ---------- */

  const syncSendState = () => {
    sendBtn.disabled = sending || !!book()?.denied || (!textarea.value.trim() && !pending.length);
  };

  const autoGrow = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 168)}px`;
  };

  const renderPending = () => {
    clear(pendingRow);
    pending.forEach((image, idx) => {
      pendingRow.append(el('div', { class: 'pending-item' },
        el('img', { src: imageUrl(image), alt: image.name || '첨부 사진' }),
        el('button', {
          type: 'button', 'aria-label': '첨부 취소', text: '✕',
          onclick: () => { pending.splice(idx, 1); renderPending(); },
        }),
      ));
    });
    syncSendState();
  };

  const addFiles = async (files) => {
    if (!files.length || !book()?.canUpload) return;
    const prepared = await prepareImages(files);
    if (!prepared.length) return;
    pending = pending.concat(prepared).slice(0, 10);
    renderPending();
    textarea.focus();
  };

  const startEdit = (entry) => {
    editingId = entry.id;
    textarea.value = entry.text || '';
    clear(editNote);
    editNote.hidden = false;
    editNote.append(
      el('span', { text: `${formatTime(entry.createdAt)} 조각 수정 중` }),
      el('button', { type: 'button', text: '취소', onclick: cancelEdit }),
    );
    sendBtn.setAttribute('aria-label', '수정 저장');
    autoGrow();
    syncSendState();
    textarea.focus();
  };

  function cancelEdit() {
    editingId = null;
    textarea.value = '';
    editNote.hidden = true;
    clear(editNote);
    sendBtn.setAttribute('aria-label', '남기기');
    autoGrow();
    syncSendState();
  }

  const setSending = (on) => {
    sending = on;
    composer.classList.toggle('busy', on);
    syncSendState();
  };

  const submit = async () => {
    const b = book();
    const text = textarea.value;
    if (sending || !b?.canWrite || (!text.trim() && !pending.length)) return;
    setSending(true);
    try {
      if (editingId) {
        const id = editingId;
        await b.update(id, { text });
        cancelEdit();
        toast('수정했어요');
      } else {
        // 저장이 끝난 뒤에 입력창을 비운다 — 실패하면 쓴 글이 그대로 남는다.
        await b.add({ text, images: pending });
        pending = [];
        textarea.value = '';
        renderPending();
        autoGrow();
        scrollToBottom(true);
      }
    } catch (err) {
      if (err instanceof WriteDeniedError) renderDenied();
      else toast(err?.message || '남기지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setSending(false);
    }
  };

  textarea.addEventListener('input', () => { autoGrow(); syncSendState(); });
  textarea.addEventListener('keydown', (e) => {
    // 한글 조합 중 Enter는 글자 확정이므로 전송하지 않는다.
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape' && editingId) cancelEdit();
  });
  textarea.addEventListener('paste', (e) => {
    const files = filesFromEvent(e);
    if (files.length && book()?.canUpload) { e.preventDefault(); addFiles(files); }
  });
  sendBtn.addEventListener('click', submit);
  fileInput.addEventListener('change', () => { addFiles([...fileInput.files]); fileInput.value = ''; });

  for (const type of ['dragenter', 'dragover']) {
    root.addEventListener(type, (e) => {
      if (!book()?.canUpload) return;
      e.preventDefault();
      composer.classList.add('dragover');
    });
  }
  root.addEventListener('dragleave', (e) => {
    if (e.relatedTarget && root.contains(e.relatedTarget)) return;
    composer.classList.remove('dragover');
  });
  root.addEventListener('drop', (e) => {
    if (!book()?.canUpload) return;
    e.preventDefault();
    composer.classList.remove('dragover');
    addFiles(filesFromEvent(e));
  });

  /* ---------- 렌더 ---------- */

  function scrollToBottom(smooth = false) {
    scroll.scrollTo({ top: scroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  function renderDenied() {
    clear(deniedNote);
    deniedNote.hidden = false;
    deniedNote.append(
      el('strong', { text: '아직 기록할 수 있는 권한이 없어요' }),
      el('span', { text: '귤껍질 출판사 관리자에게 이 페이지의 기록 권한(참여자 이상)을 요청해 주세요. 권한을 받으면 바로 쓸 수 있어요.' }),
    );
    // 입력창은 남겨 둔다 — 쓰던 글을 복사해 갈 수 있게. 전송과 사진만 막는다.
    composer.hidden = false;
    photoBtn.hidden = true;
    syncSendState();
  }

  function renderBanner() {
    const entries = book()?.entriesOf(store.state.todayKey) || [];
    const stats = summarize(entries);
    clear(banner);
    banner.append(
      el('div', { class: 'day-banner-main' },
        el('div', { class: 'day-banner-title', text: formatDayLabel(store.state.todayKey) }),
        el('div', {
          class: 'day-banner-sub',
          text: entries.length
            ? `자정까지 ${untilMidnightLabel()} · 링크 ${stats.links} · 사진 ${stats.photos}`
            : `자정까지 ${untilMidnightLabel()} · 자정이 지나면 하루치가 조각으로 정리돼요`,
        }),
      ),
      el('div', { class: 'day-banner-count' },
        el('b', { text: String(entries.length) }),
        el('span', { text: '오늘의 조각' }),
      ),
    );
  }

  function renderStream() {
    const b = book();
    const entries = b?.entriesOf(store.state.todayKey) || [];
    clear(stream);
    if (b?.status === 'loading') {
      stream.append(emptyState('🍊', '조각을 불러오는 중이에요', ''));
      return;
    }
    if (!entries.length) {
      stream.append(emptyState('🍊', '아직 오늘의 조각이 없어요',
        '떠오른 생각을 그냥 던져두세요.\n링크도, 사진도, 한 줄 메모도 전부 조각이 됩니다.'));
      return;
    }
    for (const group of groupByTimeGap(entries)) {
      stream.append(el('div', { class: 'time-divider', text: formatTime(group.startedAt) }));
      for (const entry of group.entries) stream.append(entryBubble(entry, { book: b, onEdit: startEdit }));
    }
  }

  function renderComposer() {
    const b = book();
    photoBtn.hidden = !b?.canUpload;
    hint.textContent = b?.canUpload
      ? 'Enter 남기기 · Shift+Enter 줄바꿈 · 사진은 붙여넣기(Ctrl+V)도 돼요'
      : 'Enter 남기기 · Shift+Enter 줄바꿈';
    if (b?.denied) renderDenied();
    else { deniedNote.hidden = true; composer.hidden = !b?.canWrite; }
  }

  function update(reason) {
    const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120;
    renderBanner();
    renderStream();
    renderComposer();
    if (reason === 'entry:add' || reason === 'mount' || atBottom) scrollToBottom();
  }

  return {
    root,
    update,
    activate() {
      clearInterval(tickTimer);
      tickTimer = setInterval(renderBanner, 30000);
      setTimeout(() => scrollToBottom(), 0);
    },
    deactivate() { clearInterval(tickTimer); tickTimer = null; },
    focus: () => textarea.focus(),
  };
}
