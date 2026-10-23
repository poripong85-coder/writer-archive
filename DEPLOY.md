# 실제 주소로 배포하기

귤껍질 출판사를 **GitHub Pages**(호스팅) + **Supabase**(로그인·저장)로 띄우는 순서입니다.
다 하고 나면 로그인 없이 누구나 기록을 보고, 카카오·구글·메일로 로그인해 '나도 기록해보기'를 쓸 수 있습니다.

> 주소: `https://poripong85-coder.github.io/writer-archive/`
> (도메인을 사면 바꿀 수 있어요 — 맨 아래 참고)

---

## 1. Supabase에 표와 권한 규칙 만들기 (1분)

1. Supabase 대시보드 → 왼쪽 **SQL Editor** → **New query**
2. 저장소의 [`supabase/schema.sql`](supabase/schema.sql) 내용을 통째로 붙여넣기 → **Run**
3. `Success. No rows returned` 가 나오면 끝. 여러 번 실행해도 안전해요.

만들어지는 것

| 이름 | 내용 | 누가 |
|---|---|---|
| `fragments` | 귤껍질 기록장 | 누구나 읽기 · 편집장만 쓰기 |
| `pages` | 소개·책공장·북스테이 글 | 누구나 읽기 · 편집장만 쓰기 |
| `my_fragments` | 나의 기록장 | 본인만 읽고 쓰기 (편집장도 못 봄) |
| `admins` | 편집장 목록 | SQL Editor에서만 추가 |
| `photos` 저장소 | 사진 | 편집장은 `public/`, 각자는 `users/<내 id>/`에만 올림 |
| `guestbook` | 와글와글 방명록 | 누구나 읽기 · 로그인하면 쓰기 · 본인/편집장 지우기 |

> 이미 `schema.sql`을 실행한 뒤 방명록이 추가됐다면 [`supabase/guestbook.sql`](supabase/guestbook.sql)만 실행하면 됩니다.

## 2. 사이트 주소 알려주기 (1분)

**Authentication → URL Configuration**

- **Site URL**: `https://poripong85-coder.github.io/writer-archive/`
- **Redirect URLs** → Add URL: `https://poripong85-coder.github.io/writer-archive/**`

이걸 안 하면 로그인 후 엉뚱한 주소로 돌아가요.

## 3. 로그인 방식 켜기

**메일 링크**는 처음부터 켜져 있어서 바로 쓸 수 있어요. 다만 Supabase 기본 메일은 시간당 보낼 수 있는 양이 아주 적어서, 방문자용으로는 카카오·구글을 권해요.

### 카카오 (선택)

1. [Kakao Developers](https://developers.kakao.com) → 내 애플리케이션 → **애플리케이션 추가하기**
2. **앱 설정 → 플랫폼 → Web** → 사이트 도메인에 `https://poripong85-coder.github.io` 등록
3. **카카오 로그인** → 활성화 **ON** → Redirect URI에
   `https://<프로젝트ID>.supabase.co/auth/v1/callback` 등록
4. **카카오 로그인 → 동의항목**: 닉네임, 프로필 사진, 카카오계정(이메일) 설정
   - 이메일 항목은 앱 상태에 따라 '비즈 앱' 전환을 요구할 수 있어요. 막히면 구글·메일부터 쓰고 나중에 켜도 됩니다.
5. **보안 → Client Secret** 코드 생성 → 활성화
6. Supabase **Authentication → Sign In / Providers → Kakao** 켜기
   - Client ID = 앱 키의 **REST API 키**
   - Client Secret = 5번에서 만든 코드

### 구글 (선택)

1. [Google Cloud Console](https://console.cloud.google.com) → API 및 서비스 → **OAuth 동의 화면** 만들기(외부)
2. **사용자 인증 정보 → OAuth 클라이언트 ID**(웹 애플리케이션)
   - 승인된 리디렉션 URI: `https://<프로젝트ID>.supabase.co/auth/v1/callback`
3. 나온 클라이언트 ID·보안 비밀을 Supabase **Providers → Google**에 붙여넣고 켜기

켠 방식은 [`app/config.js`](app/config.js)의 `LOGIN_PROVIDERS`에 적어야 버튼이 나와요.

```js
export const LOGIN_PROVIDERS = ['kakao', 'google', 'email'];
```

## 4. GitHub Pages 켜기 (1분)

1. GitHub 저장소 → **Settings → Pages**
2. **Source**: Deploy from a branch
3. **Branch**: 기록이 올라가 있는 브랜치 / `/ (root)` → **Save**
4. 1~2분 뒤 위 주소로 열려요. 이후 푸시할 때마다 자동으로 갱신됩니다.

## 5. 편집장 등록 (1분)

권한은 서버가 판단해요. 사이트에서 **한 번 로그인한 뒤** SQL Editor에서:

```sql
insert into public.admins (user_id)
select id from auth.users where email = '내 로그인 메일 주소';
```

새로고침하면 '오늘 쓰기' 탭과 소개 글 '글 고치기' 버튼이 생깁니다.

## 6. 그동안 쓴 기록 옮기기

1. claude.ai 링크에서 **설정 → 귤껍질 기록장 백업 → 내보내기**로 JSON 파일 받기
2. 새 사이트에서 편집장으로 로그인 → **설정 → 귤껍질 기록장 백업 → 되돌리기** → 그 파일 선택

사진까지 그대로 들어가고, 같은 조각은 덮어써서 두 번 해도 중복되지 않아요.

---

## 알아둘 것

- `app/config.js`의 키는 **원래 공개되는 값**이에요. 누가 무엇을 할 수 있는지는 1번의 권한 규칙이 서버에서 막습니다. **secret / service_role 키는 어디에도 넣지 마세요.**
- Supabase 무료 프로젝트는 일주일 동안 아무 요청이 없으면 일시정지돼요. 대시보드에서 다시 켜면 데이터는 그대로입니다.
- 나의 기록장 사진은 `users/<내 id>/<무작위 이름>` 경로라 남이 찾아낼 수 없지만, 파일 주소를 직접 공유하면 그 주소로는 열려요.
- claude.ai 버전은 그대로 둬도 됩니다. 같은 코드가 어디서 열렸는지 스스로 판단해요.

## 도메인 연결 (선택)

도메인을 산 뒤 GitHub **Settings → Pages → Custom domain**에 입력하고, 도메인 업체 DNS에
`CNAME → poripong85-coder.github.io` (루트 도메인이면 GitHub 안내의 A 레코드 4개)를 추가합니다.
그다음 2번의 Supabase Site URL·Redirect URLs도 새 주소로 바꿔주세요.
