// Supabase 연결 — 실제 주소로 배포했을 때만 쓰인다 (claude.ai 안이나 단독 모드에서는 불러오지 않음).

import * as config from './config.js';

// 예전 config.js 에 새 항목이 없어도 앱 전체가 멈추지 않게 기본값을 둔다
const SUPABASE_URL = config.SUPABASE_URL || '';
const SUPABASE_KEY = config.SUPABASE_KEY || '';
const LOGIN_PROVIDERS = config.LOGIN_PROVIDERS || ['kakao', 'naver', 'password'];
const NAVER_CLIENT_ID = config.NAVER_CLIENT_ID || '';

const VENDOR = new URL('../vendor/supabase-2.117.3.js', import.meta.url).href;
const AFTER_LOGIN = 'gyul.afterLogin';

export function supabaseConfigured() {
  return /^https:\/\/.+/.test(SUPABASE_URL) && SUPABASE_KEY.length > 20;
}

const BASE = () => SUPABASE_URL.replace(/\/$/, '');

/* ---------- 어떤 로그인 방식이 켜져 있나 ---------- */

let settingsPromise = null;

/** Supabase가 공개하는 로그인 설정 (켜진 제공자, 메일 확인 여부). 못 읽으면 {} */
export function authSettings() {
  if (!settingsPromise) {
    settingsPromise = fetch(`${BASE()}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return settingsPromise;
}

/**
 * 화면에 보여줄 로그인 방식.
 *  - 카카오·구글: Supabase에서 켜져 있을 때만 (설정을 못 읽으면 숨김)
 *  - 네이버: NAVER_CLIENT_ID 가 있을 때
 *  - 이메일+비밀번호: 메일 제공자가 꺼져 있지 않으면
 * @returns {Promise<{list: string[], autoconfirm: boolean, signupOpen: boolean}>}
 */
export async function loginOptions() {
  const s = await authSettings();
  const ext = s.external || {};
  const known = Object.keys(ext).length > 0;
  const list = LOGIN_PROVIDERS.filter((p) => {
    if (p === 'password') return !known || ext.email !== false;
    if (p === 'naver') return !!NAVER_CLIENT_ID;
    if (p === 'kakao' || p === 'google') return known && ext[p] === true;
    return false;
  });
  return { list, autoconfirm: s.mailer_autoconfirm === true, signupOpen: s.disable_signup !== true };
}

/** (예전 이름 호환) */
export function loginProviders() {
  return LOGIN_PROVIDERS.slice();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.supabase?.createClient) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('로그인 도구를 불러오지 못했어요. 새로고침해 주세요.'));
    document.head.append(s);
  });
}

let clientPromise = null;
let recoveryHandler = null;
let recoveryPending = false;

/** 비밀번호 재설정 링크로 들어왔을 때 부를 함수를 등록한다 */
export function onPasswordRecovery(fn) {
  recoveryHandler = fn;
  if (recoveryPending) { recoveryPending = false; fn(); }
}

export function getClient() {
  if (!clientPromise) {
    clientPromise = loadScript(VENDOR).then(() => {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          // PKCE: 로그인 결과가 ?code= 로 돌아온다. #해시는 화면 이동용으로 쓰므로 건드리지 않게.
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      // 비밀번호 재설정 메일의 링크로 들어오면 PASSWORD_RECOVERY 가 온다 (초기화 직후 한 번)
      client.auth.onAuthStateChange((event) => {
        if (event !== 'PASSWORD_RECOVERY') return;
        if (recoveryHandler) recoveryHandler();
        else recoveryPending = true;
      });
      return client;
    });
  }
  return clientPromise;
}

/** 공개 저장소 사진 주소의 앞부분 */
export function photoBaseUrl() {
  return `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/photos`;
}

/** 지금 로그인한 사람 (없으면 id null) */
export async function currentViewer(sb) {
  const { data } = await sb.auth.getSession();
  const user = data?.session?.user || null;
  if (!user) return { id: null, name: '', avatarUrl: '', isOwner: false, canEdit: false, email: null };
  const meta = user.user_metadata || {};
  let isAdmin = false;
  try {
    const { data: flag, error } = await sb.rpc('is_admin');
    isAdmin = !error && flag === true;
  } catch { /* 판별 실패 = 편집장 아님 */ }
  return {
    id: user.id,
    name: meta.name || meta.full_name || meta.nickname || meta.preferred_username || (user.email ? user.email.split('@')[0] : ''),
    avatarUrl: meta.avatar_url || meta.picture || '',
    isOwner: isAdmin,
    canEdit: isAdmin,
    email: user.email || null,
  };
}

function returnUrl() {
  // ?code= 가 붙어 돌아올 곳. 해시가 섞이면 code가 해시 뒤로 밀려 인식이 안 되므로 경로만 쓴다.
  return `${location.origin}${location.pathname}`;
}

function rememberRoute() {
  try { sessionStorage.setItem(AFTER_LOGIN, location.hash || ''); } catch { /* 없어도 홈으로 돌아올 뿐 */ }
}

/** 로그인 후 돌아왔을 때 원래 보던 화면 해시 (한 번만) */
export function takeRememberedRoute() {
  try {
    const h = sessionStorage.getItem(AFTER_LOGIN);
    sessionStorage.removeItem(AFTER_LOGIN);
    return h || '';
  } catch {
    return '';
  }
}

export async function signInWith(sb, provider) {
  rememberRoute();
  const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: returnUrl() } });
  if (error) throw new Error(friendlyAuthError(error));
}

/* ---------- 이메일 아이디 + 비밀번호 ---------- */

export async function signInWithPassword(sb, email, password) {
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendlyAuthError(error));
}

/**
 * 회원가입. Supabase에서 '메일 확인'을 꺼 두면 바로 로그인되고, 켜 두면 확인 메일이 간다.
 * @returns {Promise<{signedIn: boolean}>}
 */
export async function signUpWithPassword(sb, { email, password, name }) {
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { name: name.trim() }, emailRedirectTo: returnUrl() },
  });
  if (error) throw new Error(friendlyAuthError(error));
  // 메일 확인이 켜진 상태에서 이미 있는 메일이면, 에러 대신 identities 가 빈 사용자가 온다
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('이미 가입한 이메일이에요. 로그인하거나 비밀번호 찾기를 해주세요.');
  }
  return { signedIn: !!data?.session };
}

export async function sendPasswordReset(sb, email) {
  rememberRoute();
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: returnUrl() });
  if (error) throw new Error(friendlyAuthError(error));
}

export async function updatePassword(sb, password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(friendlyAuthError(error));
}

/* ---------- 네이버 (Supabase Edge Function: naver-login) ---------- */

const NAVER_STATE = 'gyul.naverState';

export function naverEnabled() {
  return !!NAVER_CLIENT_ID;
}

export function naverCallbackUrl() {
  return `${BASE()}/functions/v1/naver-login`;
}

export function startNaverLogin() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const state = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  try { sessionStorage.setItem(NAVER_STATE, state); } catch { /* 없으면 돌아왔을 때 확인 실패로 끝난다 */ }
  rememberRoute();
  const q = new URLSearchParams({
    response_type: 'code', client_id: NAVER_CLIENT_ID, redirect_uri: naverCallbackUrl(), state,
  });
  location.href = `https://nid.naver.com/oauth2.0/authorize?${q}`;
}

const NAVER_ERRORS = {
  email_required: '네이버 로그인에서 이메일 제공에 동의해야 가입할 수 있어요.',
  cancelled: '네이버 로그인을 취소했어요.',
};

/**
 * 네이버 로그인 함수에서 돌아왔으면(#naver_token=… 또는 #naver_error=…) 마무리한다.
 * @returns {Promise<null | {ok: true} | {error: string}>} 돌아온 게 아니면 null
 */
export async function completeNaverLogin(sb) {
  const raw = (location.hash || '').replace(/^#/, '');
  if (!/(^|&)naver_(token|error)=/.test(raw)) return null;
  const params = new URLSearchParams(raw);
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* 무시 */ }
  let expected = null;
  try { expected = sessionStorage.getItem(NAVER_STATE); sessionStorage.removeItem(NAVER_STATE); } catch { /* 무시 */ }
  if (!expected || params.get('state') !== expected) {
    return { error: '로그인 요청이 맞지 않아요. 네이버 로그인을 다시 시도해 주세요.' };
  }
  const err = params.get('naver_error');
  if (err) return { error: NAVER_ERRORS[err] || '네이버 로그인을 마치지 못했어요. 다시 시도해 주세요.' };
  const { error } = await sb.auth.verifyOtp({ token_hash: params.get('naver_token'), type: 'magiclink' });
  if (error) return { error: '네이버 로그인을 마치지 못했어요. 다시 시도해 주세요.' };
  return { ok: true };
}

export async function signOut(sb) {
  await sb.auth.signOut();
}

function friendlyAuthError(error) {
  const msg = String(error?.message || '');
  const code = String(error?.code || '');
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return '이메일 또는 비밀번호가 맞지 않아요.';
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) return '가입 확인 메일의 링크를 먼저 눌러주세요.';
  if (code === 'user_already_exists' || /already registered|already been registered/i.test(msg)) return '이미 가입한 이메일이에요. 로그인해 주세요.';
  if (code === 'weak_password' || /password should be|weak password/i.test(msg)) return '비밀번호가 너무 짧거나 쉬워요. 8자 이상으로 정해주세요.';
  if (code === 'same_password' || /different from the old/i.test(msg)) return '지금 비밀번호와 다른 비밀번호로 정해주세요.';
  if (code === 'signup_disabled' || /signups not allowed/i.test(msg)) return '지금은 새로 가입할 수 없어요.';
  if (/rate limit|too many/i.test(msg)) return '잠시 뒤에 다시 시도해 주세요. 요청이 너무 많았어요.';
  if (/provider is not enabled|Unsupported provider/i.test(msg)) return '이 로그인 방식이 아직 켜져 있지 않아요. 관리자에게 알려주세요.';
  if (/invalid.*email/i.test(msg)) return '메일 주소를 다시 확인해 주세요.';
  return '로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
}
