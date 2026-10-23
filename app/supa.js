// Supabase 연결 — 실제 주소로 배포했을 때만 쓰인다 (claude.ai 안이나 단독 모드에서는 불러오지 않음).

import { SUPABASE_URL, SUPABASE_KEY, LOGIN_PROVIDERS } from './config.js';

const VENDOR = new URL('../vendor/supabase-2.117.3.js', import.meta.url).href;
const AFTER_LOGIN = 'gyul.afterLogin';

export function supabaseConfigured() {
  return /^https:\/\/.+/.test(SUPABASE_URL) && SUPABASE_KEY.length > 20;
}

export function loginProviders() {
  return LOGIN_PROVIDERS.filter((p) => ['kakao', 'google', 'email'].includes(p));
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

export function getClient() {
  if (!clientPromise) {
    clientPromise = loadScript(VENDOR).then(() => window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        // PKCE: 로그인 결과가 ?code= 로 돌아온다. #해시는 화면 이동용으로 쓰므로 건드리지 않게.
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }));
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

export async function sendMagicLink(sb, email) {
  rememberRoute();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: returnUrl() } });
  if (error) throw new Error(friendlyAuthError(error));
}

export async function signOut(sb) {
  await sb.auth.signOut();
}

function friendlyAuthError(error) {
  const msg = String(error?.message || '');
  if (/rate limit|too many/i.test(msg)) return '잠시 뒤에 다시 시도해 주세요. 메일 보내기 횟수가 많았어요.';
  if (/provider is not enabled|Unsupported provider/i.test(msg)) return '이 로그인 방식이 아직 켜져 있지 않아요. 관리자에게 알려주세요.';
  if (/invalid.*email/i.test(msg)) return '메일 주소를 다시 확인해 주세요.';
  return '로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
}
