// 실제 주소(GitHub Pages 등)로 배포할 때 채우는 곳.
// 여기 넣는 값은 원래 브라우저에 공개되는 값이다. secret / service_role 키는 절대 넣지 않는다.
// 비워 두면 claude.ai 밖에서는 이 브라우저에만 저장하는 단독 모드로 동작한다.

export const SUPABASE_URL = 'https://lveqqwwlymapqffdtzlg.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_sli5hycvcPCyD2zn9vlyGQ_EU2QXpp1'; // 공개용 키 (권한은 서버 규칙이 판단)

// 로그인 방식 (보여줄 순서대로)
//   'password' 이메일 아이디 + 비밀번호 (회원가입·비밀번호 찾기 포함)
//   'kakao'    카카오로 시작하기 — Supabase에서 Kakao 제공자를 켜면 버튼이 저절로 나타난다
//   'naver'    네이버로 시작하기 — 아래 NAVER_CLIENT_ID 를 넣고 naver-login 함수를 올리면 나타난다
//   'google'   Google로 시작하기 — Supabase에서 켜면 저절로 나타난다
export const LOGIN_PROVIDERS = ['kakao', 'naver', 'password'];

// 네이버 개발자센터 애플리케이션의 Client ID (공개값). Client Secret 은 여기 넣지 않는다 — 함수 비밀값으로.
export const NAVER_CLIENT_ID = '';
