// 실제 주소(GitHub Pages 등)로 배포할 때 채우는 곳.
// 여기 넣는 값은 원래 브라우저에 공개되는 값이다. secret / service_role 키는 절대 넣지 않는다.
// 비워 두면 claude.ai 밖에서는 이 브라우저에만 저장하는 단독 모드로 동작한다.

export const SUPABASE_URL = '';   // 예: https://abcdefgh.supabase.co
export const SUPABASE_KEY = '';   // Publishable key(sb_publishable_…) 또는 anon public 키

// 로그인 버튼으로 보여줄 방식. Supabase 대시보드 Authentication → Sign In / Providers 에서 켠 것만 남긴다.
//   'kakao'  카카오로 시작하기
//   'google' Google로 시작하기
//   'email'  메일로 받은 링크를 눌러 로그인 (설정 없이 바로 되지만 기본 메일 발송량이 적다)
export const LOGIN_PROVIDERS = ['email'];
