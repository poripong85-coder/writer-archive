// 로그인·로그아웃 화면 — 웹 모드(Supabase)에서만 쓴다.
// 방문자는 로그인하지 않는다. 편집장만 숨은 입구(#editor, 설정의 '편집장 로그인')로 들어온다.
//   이메일 아이디 + 비밀번호: 로그인 / 비밀번호 찾기 / 새 비밀번호 정하기
//   소셜(카카오·네이버)과 회원가입은 config.js 의 LOGIN_PROVIDERS 와 signup 옵션으로 다시 켤 수 있다

import { el, clear, toast, openSheet } from './ui.js';
import {
  loginOptions, signInWith, signOut, signInWithPassword, signUpWithPassword,
  sendPasswordReset, updatePassword, startNaverLogin,
} from './supa.js';

const KAKAO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.5c-5.2 0-9.4 3.3-9.4 7.4 0 2.6 1.7 4.9 4.3 6.2l-1 3.7c-.1.3.3.6.6.4l4.4-2.9c.4 0 .7.1 1.1.1 5.2 0 9.4-3.3 9.4-7.4S17.2 3.5 12 3.5z"/></svg>';
const NAVER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.6 12.8 8.1 2H2v20h6.4V11.2L15.9 22H22V2h-6.4z"/></svg>';
const GOOGLE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0012 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 000 9.2L6.4 14z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 003.1 7.4L6.4 10C7.2 7.7 9.4 5.9 12 5.9z"/></svg>';

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
let seq = 0;

async function run(btn, fn) {
  btn.disabled = true;
  try {
    await fn();
  } catch (err) {
    toast(err?.message || '잠시 뒤 다시 시도해 주세요');
    btn.disabled = false;
  }
}

function field(id, label, attrs) {
  const input = el('input', { id, class: 'field', ...attrs });
  return { input, row: el('div', { class: 'login-field' }, el('label', { class: 'field-label', for: id, text: label }), input) };
}

/** 켜진 로그인 방식만큼 버튼과 이메일 아이디 상자를 만든다 */
export function loginButtons(env, { signup = true } = {}) {
  const n = ++seq;
  const wrap = el('div', { class: 'login-box' }, el('p', { class: 'muted', text: '로그인 방법을 불러오는 중…' }));
  loginOptions().then(({ list, autoconfirm, signupOpen }) => {
    clear(wrap);
    const social = el('div', { class: 'login-social' });
    for (const p of list) {
      if (p === 'kakao') {
        const b = el('button', { class: 'login-btn kakao', type: 'button', html: `${KAKAO_ICON}<span>카카오로 시작하기</span>` });
        b.addEventListener('click', () => run(b, () => signInWith(env.sb, 'kakao')));
        social.append(b);
      } else if (p === 'naver') {
        const b = el('button', { class: 'login-btn naver', type: 'button', html: `${NAVER_ICON}<span>네이버로 시작하기</span>` });
        b.addEventListener('click', () => { b.disabled = true; startNaverLogin(); });
        social.append(b);
      } else if (p === 'google') {
        const b = el('button', { class: 'login-btn google', type: 'button', html: `${GOOGLE_ICON}<span>Google로 시작하기</span>` });
        b.addEventListener('click', () => run(b, () => signInWith(env.sb, 'google')));
        social.append(b);
      }
    }
    if (social.children.length) wrap.append(social);
    if (list.includes('password')) {
      if (social.children.length) wrap.append(el('div', { class: 'login-or', text: '또는 이메일 아이디로' }));
      wrap.append(passwordBox(env, n, { autoconfirm, signupOpen: signup && signupOpen }));
    }
    if (!wrap.children.length) wrap.append(el('p', { class: 'muted', text: '아직 켜진 로그인 방식이 없어요.' }));
  });
  return wrap;
}

/** 이메일 아이디: 로그인 ↔ 회원가입 ↔ 비밀번호 찾기 */
function passwordBox(env, n, { autoconfirm, signupOpen }) {
  const box = el('div', { class: 'login-pw' });
  const show = (mode) => { clear(box); box.append(views[mode]()); box.querySelector('input')?.focus(); };

  const links = (...items) => el('div', { class: 'login-links' }, ...items.map(([text, mode]) =>
    el('button', { type: 'button', class: 'link-btn', text, onclick: () => show(mode) })));

  const views = {
    login() {
      const email = field(`login-email-${n}`, '이메일 아이디', { type: 'email', inputmode: 'email', autocomplete: 'username', placeholder: 'name@example.com' });
      const pw = field(`login-pw-${n}`, '비밀번호', { type: 'password', autocomplete: 'current-password' });
      const submit = el('button', { class: 'btn primary wide', type: 'submit', text: '로그인' });
      const form = el('form', { class: 'login-form' }, email.row, pw.row, submit,
        links(...[signupOpen ? ['회원가입', 'signup'] : null, ['비밀번호 찾기', 'reset']].filter(Boolean)));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!EMAIL_RE.test(email.input.value.trim())) { toast('이메일 아이디를 다시 확인해 주세요.'); email.input.focus(); return; }
        if (!pw.input.value) { toast('비밀번호를 입력해 주세요.'); pw.input.focus(); return; }
        run(submit, async () => {
          await signInWithPassword(env.sb, email.input.value, pw.input.value);
          location.reload();
        });
      });
      return form;
    },
    signup() {
      const name = field(`su-name-${n}`, '닉네임', { type: 'text', maxlength: '20', autocomplete: 'nickname', placeholder: '마을에서 불릴 이름' });
      const email = field(`su-email-${n}`, '이메일 아이디', { type: 'email', inputmode: 'email', autocomplete: 'username', placeholder: 'name@example.com' });
      const pw = field(`su-pw-${n}`, '비밀번호', { type: 'password', autocomplete: 'new-password', placeholder: `${MIN_PASSWORD}자 이상` });
      const pw2 = field(`su-pw2-${n}`, '비밀번호 확인', { type: 'password', autocomplete: 'new-password' });
      const submit = el('button', { class: 'btn primary wide', type: 'submit', text: '가입하고 시작하기' });
      const form = el('form', { class: 'login-form' }, name.row, email.row, pw.row, pw2.row, submit,
        links(['이미 계정이 있어요', 'login']));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const problem = !name.input.value.trim() ? ['닉네임을 정해주세요.', name]
          : !EMAIL_RE.test(email.input.value.trim()) ? ['이메일 아이디를 다시 확인해 주세요.', email]
          : pw.input.value.length < MIN_PASSWORD ? [`비밀번호는 ${MIN_PASSWORD}자 이상으로 정해주세요.`, pw]
          : pw.input.value !== pw2.input.value ? ['비밀번호 확인이 달라요.', pw2]
          : null;
        if (problem) { toast(problem[0]); problem[1].input.focus(); return; }
        run(submit, async () => {
          const { signedIn } = await signUpWithPassword(env.sb, { email: email.input.value, password: pw.input.value, name: name.input.value });
          if (signedIn) { toast('가입했어요! 귤껍질 마을에 오신 걸 환영해요', { peel: true }); setTimeout(() => location.reload(), 700); return; }
          clear(box);
          box.append(el('div', { class: 'login-done' },
            el('p', { class: 'px', text: '메일함을 확인해 주세요' }),
            el('p', { text: `${email.input.value.trim()} 로 가입 확인 메일을 보냈어요. 링크를 누르면 바로 시작할 수 있어요.` }),
            links(['로그인으로', 'login']),
          ));
        });
      });
      if (!autoconfirm) form.insertBefore(el('p', { class: 'muted', text: '가입하면 확인 메일이 가요. 링크를 누르면 시작할 수 있어요.' }), submit);
      return form;
    },
    reset() {
      const email = field(`rs-email-${n}`, '가입한 이메일 아이디', { type: 'email', inputmode: 'email', autocomplete: 'username', placeholder: 'name@example.com' });
      const submit = el('button', { class: 'btn primary wide', type: 'submit', text: '비밀번호 재설정 메일 받기' });
      const form = el('form', { class: 'login-form' }, email.row, submit, links(['로그인으로', 'login']));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!EMAIL_RE.test(email.input.value.trim())) { toast('이메일 아이디를 다시 확인해 주세요.'); email.input.focus(); return; }
        run(submit, async () => {
          await sendPasswordReset(env.sb, email.input.value);
          submit.textContent = '메일을 보냈어요';
          toast('메일함에서 재설정 링크를 눌러주세요', { peel: true, ms: 4200 });
        });
      });
      return form;
    },
  };
  show('login');
  return box;
}

/** 편집장 입구 — 방문자는 로그인 없이 모든 걸 볼 수 있다 */
export function openLoginSheet(env) {
  openSheet('편집장 로그인', (body) => {
    body.append(
      el('p', { class: 'sheet-note', text: '편집장이 기록과 소개 글을 쓰는 입구예요. 방문자는 로그인 없이 모든 글을 보고 방명록을 남길 수 있어요.' }),
      loginButtons(env, { signup: false }),
    );
  });
}

/** 비밀번호 재설정 메일의 링크로 들어왔을 때 */
export function openNewPasswordSheet(env) {
  openSheet('새 비밀번호 정하기', (body, close) => {
    const pw = field('np-pw', '새 비밀번호', { type: 'password', autocomplete: 'new-password', placeholder: `${MIN_PASSWORD}자 이상` });
    const pw2 = field('np-pw2', '새 비밀번호 확인', { type: 'password', autocomplete: 'new-password' });
    const submit = el('button', { class: 'btn primary wide', type: 'submit', text: '비밀번호 바꾸기' });
    const form = el('form', { class: 'login-form' }, pw.row, pw2.row, submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (pw.input.value.length < MIN_PASSWORD) { toast(`비밀번호는 ${MIN_PASSWORD}자 이상으로 정해주세요.`); pw.input.focus(); return; }
      if (pw.input.value !== pw2.input.value) { toast('비밀번호 확인이 달라요.'); pw2.input.focus(); return; }
      run(submit, async () => {
        await updatePassword(env.sb, pw.input.value);
        close();
        toast('비밀번호를 바꿨어요', { peel: true });
        setTimeout(() => location.reload(), 700);
      });
    });
    body.append(el('p', { class: 'sheet-note', text: '앞으로 쓸 새 비밀번호를 정해주세요.' }), form);
    pw.input.focus();
  });
}

export function openAccountSheet(env) {
  const me = env.me;
  openSheet('내 계정', (body, close) => {
    body.append(el('div', { class: 'account-row' },
      me.avatarUrl ? el('img', { class: 'account-avatar', src: me.avatarUrl, alt: '' }) : null,
      el('div', {},
        el('strong', { text: me.name || '이름 없음' }),
        el('div', { class: 'desc', text: [me.isOwner ? '편집장(관리자)' : '방문자', me.email].filter(Boolean).join(' · ') }),
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
