// 귤껍질 출판사 — 네이버 로그인 (Supabase Edge Function: naver-login)
//
// 흐름: 사이트 → 네이버 로그인 → (이 함수) 코드로 토큰 받기 → 네이버 프로필 →
//       Supabase 계정 찾기/만들기 → 한 번만 쓰는 로그인 토큰 → 사이트로 돌려보냄(#naver_token=…)
//       사이트는 그 토큰을 supabase.auth.verifyOtp 로 바꿔 로그인한다.
//
// 필요한 비밀값 (Edge Functions → Secrets):
//   NAVER_CLIENT_ID      네이버 애플리케이션 Client ID
//   NAVER_CLIENT_SECRET  네이버 애플리케이션 Client Secret
//   SITE_URL             https://poripong85-coder.github.io/writer-archive/
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase가 자동으로 넣어준다.
// 네이버가 바로 부르는 주소라 'JWT 확인(Verify JWT)'은 꺼야 한다.

const NAVER_TOKEN = 'https://nid.naver.com/oauth2.0/token';
const NAVER_ME = 'https://openapi.naver.com/v1/nid/me';

/**
 * 테스트할 수 있게 바깥 의존성을 받는다.
 * deps: { fetch, admin (service role supabase client), env: { NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, SITE_URL } }
 */
export async function handleNaverLogin(req, deps) {
  const { fetch: http, admin, env } = deps;
  const url = new URL(req.url);
  const state = (url.searchParams.get('state') || '').slice(0, 128);
  const site = String(env.SITE_URL || '').replace(/#.*$/, '');

  // 돌려보낼 곳은 비밀값에 적힌 사이트로만 (요청 주소에서 받지 않는다)
  const back = (params) => {
    const hash = new URLSearchParams({ ...params, state });
    return new Response(null, { status: 302, headers: { Location: `${site}#${hash}`, 'Cache-Control': 'no-store' } });
  };

  if (!site || !env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
    return new Response('naver-login: 비밀값(NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, SITE_URL)이 비어 있어요.', { status: 500 });
  }
  if (url.searchParams.get('error')) return back({ naver_error: 'cancelled' });
  const code = url.searchParams.get('code');
  if (!code || !state) return back({ naver_error: 'bad_request' });

  try {
    // 1) 코드 → 네이버 접근 토큰
    const tokenRes = await http(`${NAVER_TOKEN}?${new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.NAVER_CLIENT_ID,
      client_secret: env.NAVER_CLIENT_SECRET,
      code,
      state,
    })}`, { method: 'POST' });
    const token = await tokenRes.json().catch(() => ({}));
    if (!token.access_token) return back({ naver_error: 'token' });

    // 2) 네이버 프로필 (정보는 response 안쪽에 들어 있다)
    const meRes = await http(NAVER_ME, { headers: { Authorization: `Bearer ${token.access_token}` } });
    const me = await meRes.json().catch(() => ({}));
    const p = me && me.response;
    if (me.resultcode !== '00' || !p || !p.id) return back({ naver_error: 'profile' });
    if (!p.email) return back({ naver_error: 'email_required' });

    // 3) Supabase 계정 — 없으면 만든다 (네이버가 확인한 메일이라 바로 확인 처리)
    const meta = {
      name: String(p.nickname || p.name || '').slice(0, 40),
      avatar_url: String(p.profile_image || ''),
      naver_id: String(p.id),
    };
    const created = await admin.auth.admin.createUser({ email: p.email, email_confirm: true, user_metadata: meta });
    if (created.error && !/already|exists|registered/i.test(String(created.error.message || created.error.code || ''))) {
      return back({ naver_error: 'account' });
    }

    // 4) 한 번만 쓰는 로그인 토큰
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: p.email });
    const hashed = link.data && link.data.properties && link.data.properties.hashed_token;
    if (link.error || !hashed) return back({ naver_error: 'link' });
    return back({ naver_token: hashed });
  } catch (_err) {
    return back({ naver_error: 'server' });
  }
}

// Supabase(Deno)에서 실행될 때만 서버를 띄운다. Node 테스트에서는 위 함수만 가져다 쓴다.
if (typeof Deno !== 'undefined') {
  const { createClient } = await import('npm:@supabase/supabase-js@2.117.3');
  const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const env = {
    NAVER_CLIENT_ID: Deno.env.get('NAVER_CLIENT_ID'),
    NAVER_CLIENT_SECRET: Deno.env.get('NAVER_CLIENT_SECRET'),
    SITE_URL: Deno.env.get('SITE_URL'),
  };
  Deno.serve((req) => handleNaverLogin(req, { fetch, admin, env }));
}
