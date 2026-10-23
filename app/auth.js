// 로그인·로그아웃 화면 — 웹 모드(Supabase)에서만 쓴다.

import { el, toast, openSheet } from './ui.js';
import { loginProviders, signInWith, sendMagicLink, signOut } from './supa.js';

const KAKAO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.5c-5.2 0-9.4 3.3-9.4 7.4 0 2.6 1.7 4.9 4.3 6.2l-1 3.7c-.1.3.3.6.6.4l4.4-2.9c.4 0 .7.1 1.1.1 5.2 0 9.4-3.3 9.4-7.4S17.2 3.5 12 3.5z"/></svg>';
const GOOGLE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0012 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 000 9.2L6.4 14z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 003.1 7.4L6.4 10C7.2 7.7 9.4 5.9 12 5.9z"/></svg>';

/** 켜 둔 로그인 방식만큼 버튼을 만든다 */
export function loginButtons(env) {
  const wrap = el('div', { class: 'login-box' });
  const providers = loginProviders();

  const run = async (btn, fn) => {
    btn.disabled = true;
    try {
      await fn();
    } catch (err) {
      toast(err?.message || '로그인하지 못했어요');
      btn.disabled = false;
    }
  };

  if (providers.includes('kakao')) {
    const b = el('button', { class: 'login-btn kakao', type: 'button', html: `${KAKAO_ICON}<span>카카오로 시작하기</span>` });
    b.addEventListener('click', () => run(b, () => signInWith(env.sb, 'kakao')));
    wrap.append(b);
  }
  if (providers.includes('google')) {
    const b = el('button', { class: 'login-btn google', type: 'button', html: `${GOOGLE_ICON}<span>Google로 시작하기</span>` });
    b.addEventListener('click', () => run(b, () => signInWith(env.sb, 'google')));
    wrap.append(b);
  }
  if (providers.includes('email')) {
    const input = el('input', {
      id: 'login-email', class: 'field', type: 'email', inputmode: 'email', autocomplete: 'email',
      placeholder: 'name@example.com', 'aria-label': '메일 주소',
    });
    const send = el('button', { class: 'btn', type: 'submit', text: '로그인 링크 받기' });
    const form = el('form', { class: 'login-email' }, input, send);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = input.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('메일 주소를 다시 확인해 주세요.'); input.focus(); return; }
      run(send, async () => {
        await sendMagicLink(env.sb, email);
        send.textContent = '메일을 보냈어요';
        toast('메일함에서 로그인 링크를 눌러 주세요', { peel: true, ms: 4200 });
      });
    });
    if (providers.length > 1) wrap.append(el('div', { class: 'login-or', text: '또는 메일로' }));
    wrap.append(form);
  }
  if (!providers.length) wrap.append(el('p', { class: 'muted', text: '아직 켜진 로그인 방식이 없어요.' }));
  return wrap;
}

export function openLoginSheet(env) {
  openSheet('귤껍질 출판사 로그인', (body) => {
    body.append(
      el('p', { class: 'sheet-note', text: '로그인하면 나만의 기록장이 생겨요. 내 기록장의 글은 나만 볼 수 있어요.' }),
      loginButtons(env),
    );
  });
}

export function openAccountSheet(env) {
  const me = env.me;
  openSheet('내 계정', (body, close) => {
    body.append(el('div', { class: 'account-row' },
      me.avatarUrl ? el('img', { class: 'account-avatar', src: me.avatarUrl, alt: '' }) : null,
      el('div', {},
        el('strong', { text: me.name || '이름 없음' }),
        el('div', { class: 'desc', text: me.isOwner ? '편집장(관리자)' : '방문자' }),
      ),
    ));
    body.append(el('button', {
      class: 'btn wide', type: 'button', text: '로그아웃',
      onclick: async () => {
        close();
        await signOut(env.sb);
        location.reload();
      },
    }));
  });
}
