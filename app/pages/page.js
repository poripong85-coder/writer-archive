// 소개 · 사부작 책공장 · 시안북스테이 — 관리자가 화면에서 바로 쓰고 고치는 글 페이지.

import { el, clear, toast } from '../ui.js';
import * as store from '../store.js';
import { sprite } from '../pixel.js';
import { richTextHtml } from '../util.js';

const META = {
  intro: {
    title: '귤껍질 소개', icon: 'gyul',
    // 관리자가 아직 쓰지 않았을 때 보이는 초안. 관리자에게는 '초안' 표시가 붙는다.
    draft: {
      lead: '하루의 생각을 껍질째 모으는 작은 출판사',
      body: '귤을 까면 껍질이 남듯, 하루를 살면 생각의 껍질이 남아요.\n귤껍질 출판사는 그 조각들을 버리지 않고 모아 엮습니다.\n\n· 일상 조각 모음 — 편집장이 매일 모으는 인사이트 조각. 자정이 되면 하루치가 조각으로 정리돼요.\n· 사부작 책공장 — 사부작사부작 책을 만드는 곳.\n· 시안북스테이 — 책과 함께 머무는 집.',
    },
  },
  factory: { title: '사부작 책공장', icon: 'pencil', soon: '사부작사부작, 책을 만드는 곳이 문을 여는 중이에요.' },
  stay: { title: '시안북스테이', icon: 'house', soon: '책과 함께 머무는 집이 손님 맞을 준비를 하고 있어요.' },
};

function renderBody(text) {
  const wrap = el('div', { class: 'prose' });
  for (const block of String(text).split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*[·\-•*]\s+/.test(l))) {
      const ul = el('ul');
      for (const l of lines) ul.append(el('li', { html: richTextHtml(l.replace(/^\s*[·\-•*]\s+/, '')) }));
      wrap.append(ul);
    } else {
      wrap.append(el('p', { html: lines.map((l) => richTextHtml(l)).join('<br>') }));
    }
  }
  return wrap;
}

export function createTextPage(key) {
  const meta = META[key];
  let editing = false;

  const lead = el('p', { class: 'page-lead' });
  const badge = el('span', { class: 'draft-badge', hidden: true, text: '초안' });
  const body = el('div', { class: 'page-body' });
  const tools = el('div', { class: 'page-tools' });

  const root = el('section', { class: `page text-page tp-${key}`, 'aria-labelledby': `tp-${key}-title` },
    el('header', { class: 'tp-head' },
      sprite(meta.icon, { scale: 3, className: 'tp-sprite' }),
      el('div', { class: 'tp-title' },
        el('h1', { class: 'px', id: `tp-${key}-title` }, meta.title, badge),
        lead,
      ),
    ),
    body,
    tools,
  );

  function current() {
    return store.state.pages?.get(key) || null;
  }

  function renderRead() {
    const pages = store.state.pages;
    const doc = current();
    const canEdit = !!pages?.canEdit;
    clear(body);
    clear(tools);

    if (!pages || !pages.loaded(key)) {
      lead.textContent = '';
      badge.hidden = true;
      body.append(el('p', { class: 'muted', text: '불러오는 중이에요…' }));
      return;
    }

    const shown = doc && (doc.lead || doc.body) ? doc : meta.draft || null;
    badge.hidden = !(canEdit && !doc && meta.draft);
    lead.textContent = shown?.lead || '';

    if (shown?.body) {
      body.append(renderBody(shown.body));
    } else {
      body.append(el('div', { class: 'soon' },
        el('p', { class: 'px soon-title', text: '준비 중이에요' }),
        el('p', { text: meta.soon }),
        canEdit ? el('p', { class: 'muted', text: '편집장에게만 보이는 안내: 아래 버튼으로 소개 글을 채우면 방문자에게 바로 보여요.' }) : null,
      ));
    }

    if (canEdit) {
      tools.append(el('button', {
        class: 'btn', type: 'button', text: shown?.body ? '글 고치기' : '소개 글 쓰기',
        onclick: () => { editing = true; render(); },
      }));
      if (doc?.updatedAt) {
        tools.append(el('span', { class: 'muted', text: `마지막 수정 ${new Date(doc.updatedAt).toLocaleString('ko-KR')}` }));
      }
    }
  }

  function renderEdit() {
    const doc = current() || meta.draft || { lead: '', body: '' };
    clear(body);
    clear(tools);
    const leadInput = el('input', {
      id: `tp-${key}-lead`, type: 'text', class: 'field', maxlength: '120',
      placeholder: '한 줄 소개', 'aria-label': '한 줄 소개',
    });
    leadInput.value = doc.lead || '';
    const bodyInput = el('textarea', {
      id: `tp-${key}-body`, class: 'field', rows: '12',
      placeholder: '본문. 빈 줄로 문단을 나누고, "· "로 시작하면 목록이 돼요.',
      'aria-label': '본문',
    });
    bodyInput.value = doc.body || '';
    const save = el('button', { class: 'btn primary', type: 'button', text: '저장' });
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await store.state.pages.save(key, { lead: leadInput.value, body: bodyInput.value });
        editing = false;
        toast('저장했어요');
        render();
      } catch (err) {
        toast(err?.message || '저장하지 못했어요');
        save.disabled = false;
      }
    });
    body.append(el('label', { class: 'field-label', for: leadInput.id, text: '한 줄 소개' }), leadInput,
      el('label', { class: 'field-label', for: bodyInput.id, text: '본문' }), bodyInput);
    tools.append(save, el('button', { class: 'btn', type: 'button', text: '취소', onclick: () => { editing = false; render(); } }));
    leadInput.focus();
  }

  function render() {
    if (editing && store.state.pages?.canEdit) renderEdit();
    else renderRead();
  }

  return {
    root,
    update(reason) {
      // 편집 중에는 다른 갱신이 입력을 덮지 않게 한다
      if (editing && reason !== 'route') return;
      render();
    },
    activate() {},
    deactivate() { editing = false; },
  };
}
