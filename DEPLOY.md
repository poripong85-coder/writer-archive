# 실제 주소로 배포하기

귤껍질 출판사를 **GitHub Pages**(호스팅) + **Supabase**(로그인·저장)로 띄우는 순서입니다.
다 하고 나면 방문자는 로그인 없이 모든 글을 보고 방명록을 남기고, 편집장만 이메일 아이디+비밀번호로 로그인해 기록합니다.

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
| `pages` | 소개·책공장·북스테이·모임 소개 글 | 누구나 읽기 · 편집장만 쓰기 |
| `my_fragments` | (예전) 나의 기록장 | 지금 화면에서는 쓰지 않음 · 본인만 읽고 쓰기 |
| `admins` | 편집장 목록 | SQL Editor에서만 추가 |
| `photos` 저장소 | 사진 | 편집장은 `public/`, 각자는 `users/<내 id>/`에만 올림 |
| `guestbook` | 와글와글 방명록 | 누구나 읽기 · 로그인 없이 쓰기 · 편집장 지우기 |

> **이미 `schema.sql`을 실행한 프로젝트라면** [`supabase/visitors.sql`](supabase/visitors.sql) 하나만 실행하세요.
> 방명록을 로그인 없이 쓰게 바꾸고, 모임 소개 페이지 2개를 편집장이 고칠 수 있게 합니다. 여러 번 실행해도 안전해요.
> 이 파일을 실행하기 전에는 방문자가 방명록에 남기려 하면 "방명록 쓰기를 여는 중이에요"라고 나옵니다.

## 2. 사이트 주소 알려주기 (1분)

**Authentication → URL Configuration**

- **Site URL**: `https://poripong85-coder.github.io/writer-archive/`
- **Redirect URLs** → Add URL: `https://poripong85-coder.github.io/writer-archive/**`

이걸 안 하면 로그인 후 엉뚱한 주소로 돌아가요.

## 3. 편집장 로그인 설정 (1분)

방문자는 로그인하지 않아요. 메뉴에도 로그인 버튼이 없고, 편집장만 숨은 입구로 들어옵니다.

- 주소 끝에 `#editor` 를 붙여 열기: `https://poripong85-coder.github.io/writer-archive/#editor`
- 또는 사이트 오른쪽 위 설정(☀) → 맨 위 **편집장 로그인**

로그인은 **이메일 아이디 + 비밀번호**이고, 비밀번호를 잊으면 같은 창의 **비밀번호 찾기**로 메일을 받아 다시 정해요.

Supabase에서 두 가지를 바꿔 두세요.

1. **Authentication → Sign In / Providers** 맨 위 **User Signups → Allow new users to sign up** 을 **OFF**
   — 방문자 계정이 필요 없으니 아무나 가입하지 못하게 닫아 둡니다. 이미 있는 편집장 계정은 그대로 로그인돼요.
2. 편집장 계정이 아직 없다면 **Authentication → Users → Add user → Create new user** 로 이메일과 비밀번호를 정해 만들고, 5번처럼 편집장으로 등록하세요.

> 카카오·네이버 로그인 코드(`supabase/functions/naver-login`, `app/auth.js`)는 남겨 두었어요.
> 나중에 다시 쓰려면 `app/config.js` 의 `LOGIN_PROVIDERS` 에 `'kakao'`, `'naver'` 를 넣고 git 기록의 이전 DEPLOY.md 설정 순서를 따르면 됩니다.

## 4. GitHub Pages 켜기 (1분)

1. GitHub 저장소 → **Settings → Pages**
2. **Source**: Deploy from a branch
3. **Branch**: 기록이 올라가 있는 브랜치 / `/ (root)` → **Save**
4. 1~2분 뒤 위 주소로 열려요. 이후 푸시할 때마다 자동으로 갱신됩니다.

## 5. 편집장 등록 (1분)

권한은 서버가 판단해요. 편집장 계정을 만든 뒤 SQL Editor에서:

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
- claude.ai 버전은 그대로 둬도 됩니다. 같은 코드가 어디서 열렸는지 스스로 판단해요.

## 도메인 연결 (선택)

도메인을 산 뒤 GitHub **Settings → Pages → Custom domain**에 입력하고, 도메인 업체 DNS에
`CNAME → poripong85-coder.github.io` (루트 도메인이면 GitHub 안내의 A 레코드 4개)를 추가합니다.
그다음 2번의 Supabase Site URL·Redirect URLs도 새 주소로 바꿔주세요.
