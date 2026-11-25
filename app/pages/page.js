// 소개 · 사부작 책공장 · 시안북스테이 · 모임 소개 — 관리자가 화면에서 바로 쓰고 고치는 글 페이지.

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
      body: '귤을 까면 껍질이 남듯, 하루를 살면 생각의 껍질이 남아요.\n귤껍질 출판사는 그 조각들을 버리지 않고 모아 엮습니다.\n\n· 일상 모임 조각 — 함께하는 모임 소식과 편집장이 매일 모으는 인사이트 조각.\n· 사부작 책공장 — 사부작사부작 책을 만드는 곳.\n· 시안북스테이 — 책과 함께 머무는 집.',
    },
  },
  factory: {
    title: '사부작 책공장', icon: 'pencil', soon: '사부작사부작, 책을 만드는 곳이 문을 여는 중이에요.',
    // 본문 아래에 늘 붙는 책·글 목록 (편집장이 쓴 소개 글과 따로). title 을 누르면 url 로 간다, desc 는 한 줄 소개
    links: {
      title: '책공장에서 나온 글',
      items: [
        { kind: '브런치북', url: 'https://brunch.co.kr/brunchbook/citruspeel' },
        { kind: '브런치북', url: 'https://brunch.co.kr/brunchbook/cyan' },
        { kind: '브런치북', url: 'https://brunch.co.kr/brunchbook/tokyowithmom' },
        { kind: '문화일보', url: 'https://www.munhwa.com/article/11523996' },
      ],
    },
  },
  stay: { title: '시안북스테이', icon: 'house', soon: '책과 함께 머무는 집이 손님 맞을 준비를 하고 있어요.' },
  // 모임 소개 — 일시·장소 같은 자세한 내용은 편집장이 사이트에서 '글 고치기'로 채운다
  'meet-snowman': {
    title: '눈사람 모빌 + 겨울 간식 모임', icon: 'i-snowman', back: 'fragments', status: '오픈 준비중',
    actions: [{ route: 'buy-snowman', text: '눈사람 모빌 구매하기' }],
    draft: {
      lead: '눈사람 모빌을 만들고, 겨울 간식을 나눠 먹는 모임',
      body: '지금 모임 오픈을 준비하고 있어요.\n일정과 신청 방법은 준비가 끝나는 대로 이곳에 알려드릴게요.',
    },
  },
  'meet-persimmon': {
    title: '겨울 감 먹으며 새해 모임 나누기', icon: 'i-persimmon', back: 'fragments', status: '오픈 준비중',
    draft: {
      lead: '겨울 감을 먹으며 새해를 함께 나누는 모임',
      body: '지금 모임 오픈을 준비하고 있어요.\n일정과 신청 방법은 준비가 끝나는 대로 이곳에 알려드릴게요.',
    },
  },
};

/** 일상 모임 조각에 카드로 거는 모임 소개 페이지 */
export const MEETINGS = ['meet-snowman', 'meet-persimmon'];

export function pageMeta(key) {
  return META[key];
}

/** '오픈 준비중' 같은 상태 표시 (없으면 '') */
export function pageStatus(key) {
  return META[key]?.status || '';
}

/** 편집장이 쓴 한 줄 소개, 없으면 초안 */
export function pageLead(key) {
  const doc = store.state.pages?.get(key);
  return (doc && doc.lead) || META[key]?.draft?.lead || '';
}

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

/** 바깥 글 목록 — 제목을 누르면 새 탭으로 연다. 제목이 아직 없으면 주소를 대신 보여준다 */
function linkList({ title, items }) {
  return el('section', { class: 'link-list', 'aria-label': title },
    el('h2', { class: 'px link-list-title', text: title }),
    el('ul', {}, ...items.map((it) => {
      const u = new URL(it.url);
      const label = it.title || `${u.host.replace(/^www\./, '')}${u.pathname}`;
      return el('li', {}, el('a', { class: `link-card${it.title ? '' : ' untitled'}`, href: it.url, target: '_blank', rel: 'noopener noreferrer' },
        el('span', { class: 'link-kind', text: it.kind }),
        el('span', { class: 'link-text' },
          el('strong', { class: 'link-title', text: label }),
          it.desc ? el('span', { class: 'link-desc', text: it.desc }) : null,
        ),
        el('span', { class: 'link-go', 'aria-hidden': 'true', text: '↗' }),
      ));
    })),
  );
}

export function createTextPage(key) {
  const meta = META[key];
  let editing = false;

  const lead = el('p', { class: 'page-lead' });
  const badge = el('span', { class: 'draft-badge', hidden: true, text: '초안' });
  const body = el('div', { class: 'page-body' });
  const tools = el('div', { class: 'page-tools' });
  const status = meta.status ? el('span', { class: 'status-pill', text: meta.status }) : null;

  const root = el('section', { class: `page text-page tp-${key}`, 'aria-labelledby': `tp-${key}-title` },
    el('header', { class: 'tp-head' },
      sprite(meta.icon, { scale: 3, className: 'tp-sprite' }),
      el('div', { class: 'tp-title' },
        el('h1', { class: 'px', id: `tp-${key}-title` }, meta.title, badge),
        status,
        lead,
      ),
    ),
    body,
    meta.actions ? el('div', { class: 'page-actions' }, ...meta.actions.map((a) => el('a', {
      class: 'btn primary', href: `#${a.route}`, text: `${a.text} →`,
      onclick: (e) => { e.preventDefault(); store.go(a.route); },
    }))) : null,
    meta.links ? linkList(meta.links) : null,
    tools,
    meta.back ? el('a', {
      class: 'back-link tp-back', href: `#${meta.back}`, text: '← 일상 모임 조각으로',
      onclick: (e) => { e.preventDefault(); store.go(meta.back); },
    }) : null,
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
    } else if (meta.links) {
      // 글 목록이 아래에 있으니 '준비 중' 대신 비워 둔다
      if (canEdit) body.append(el('p', { class: 'muted', text: '편집장에게만 보이는 안내: 아래 버튼으로 소개 글을 쓰면 글 목록 위에 보여요.' }));
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
