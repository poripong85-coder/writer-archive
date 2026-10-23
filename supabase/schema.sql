-- 귤껍질 출판사 — Supabase 스키마와 접근 규칙
-- Supabase 대시보드 → SQL Editor → New query 에 통째로 붙여넣고 Run.
-- 여러 번 실행해도 안전하게 짰다(이미 있으면 건너뜀).
--
-- 규칙 요약
--   fragments  (귤껍질 기록장) : 누구나 읽기, 편집장만 쓰기
--   pages      (소개·책공장·북스테이 글) : 누구나 읽기, 편집장만 쓰기
--   my_fragments (나의 기록장) : 로그인한 본인만 읽고 쓰기 (편집장도 못 봄)
--   admins     (편집장 목록)   : 본인 행만 읽기, 추가는 SQL Editor에서만
--   photos 저장소 : 누구나 주소로 열람, 편집장은 public/ 에, 각자는 users/<내 id>/ 에만 올리고 지움

-- ---------- 테이블 ----------

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.fragments (
  id          text primary key,
  day_key     text not null check (day_key ~ '^\d{4}-\d{2}-\d{2}$'),
  created_at  bigint not null,
  updated_at  bigint not null,
  text        text not null default '' check (char_length(text) <= 20000),
  images      jsonb not null default '[]'::jsonb,
  starred     boolean not null default false
);
create index if not exists fragments_created_at_idx on public.fragments (created_at desc);

create table if not exists public.my_fragments (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day_key     text not null check (day_key ~ '^\d{4}-\d{2}-\d{2}$'),
  created_at  bigint not null,
  updated_at  bigint not null,
  text        text not null default '' check (char_length(text) <= 20000),
  images      jsonb not null default '[]'::jsonb,
  starred     boolean not null default false
);
create index if not exists my_fragments_user_created_idx on public.my_fragments (user_id, created_at desc);

create table if not exists public.pages (
  key         text primary key check (key in ('intro', 'factory', 'stay')),
  lead        text not null default '' check (char_length(lead) <= 300),
  body        text not null default '' check (char_length(body) <= 20000),
  updated_at  bigint not null default 0
);

-- ---------- 편집장 판별 ----------
-- security definer: admins 표를 읽을 권한이 없는 사람도 "내가 편집장인가"만은 물을 수 있게.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- 행 단위 접근 규칙 ----------

alter table public.admins       enable row level security;
alter table public.fragments    enable row level security;
alter table public.my_fragments enable row level security;
alter table public.pages        enable row level security;

drop policy if exists "admins: 본인 행 읽기" on public.admins;
create policy "admins: 본인 행 읽기" on public.admins
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "fragments: 누구나 읽기" on public.fragments;
create policy "fragments: 누구나 읽기" on public.fragments
  for select to anon, authenticated using (true);
drop policy if exists "fragments: 편집장 쓰기" on public.fragments;
create policy "fragments: 편집장 쓰기" on public.fragments
  for insert to authenticated with check (public.is_admin());
drop policy if exists "fragments: 편집장 고치기" on public.fragments;
create policy "fragments: 편집장 고치기" on public.fragments
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "fragments: 편집장 지우기" on public.fragments;
create policy "fragments: 편집장 지우기" on public.fragments
  for delete to authenticated using (public.is_admin());

drop policy if exists "pages: 누구나 읽기" on public.pages;
create policy "pages: 누구나 읽기" on public.pages
  for select to anon, authenticated using (true);
drop policy if exists "pages: 편집장 쓰기" on public.pages;
create policy "pages: 편집장 쓰기" on public.pages
  for insert to authenticated with check (public.is_admin());
drop policy if exists "pages: 편집장 고치기" on public.pages;
create policy "pages: 편집장 고치기" on public.pages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "my_fragments: 본인만" on public.my_fragments;
create policy "my_fragments: 본인만" on public.my_fragments
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 표 권한 (RLS가 그 위에서 행을 거른다)
grant select on public.fragments, public.pages to anon, authenticated;
grant insert, update, delete on public.fragments to authenticated;
grant insert, update on public.pages to authenticated;
grant select, insert, update, delete on public.my_fragments to authenticated;
grant select on public.admins to authenticated;

-- ---------- 실시간: 편집장이 쓰면 방문자 화면에 바로 뜨게 ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'fragments') then
    alter publication supabase_realtime add table public.fragments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pages') then
    alter publication supabase_realtime add table public.pages;
  end if;
end $$;

-- ---------- 사진 저장소 ----------
-- 공개 버킷: 파일 주소를 아는 사람은 열람 가능. 목록 조회 규칙은 두지 않는다.
-- 나의 기록장 사진은 users/<내 id>/<무작위 이름> 이라 주소가 기록장 밖으로 나가지 않는 한 남이 찾을 수 없다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "photos: 편집장 공개 사진 올리기" on storage.objects;
create policy "photos: 편집장 공개 사진 올리기" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = 'public' and public.is_admin());

-- 지우기(remove)는 select 권한도 함께 있어야 동작한다.
drop policy if exists "photos: 편집장 공개 사진 보기" on storage.objects;
create policy "photos: 편집장 공개 사진 보기" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'public' and public.is_admin());

drop policy if exists "photos: 편집장 공개 사진 지우기" on storage.objects;
create policy "photos: 편집장 공개 사진 지우기" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'public' and public.is_admin());

drop policy if exists "photos: 내 사진 올리기" on storage.objects;
create policy "photos: 내 사진 올리기" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = 'users'
              and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "photos: 내 사진 보기" on storage.objects;
create policy "photos: 내 사진 보기" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'users'
         and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "photos: 내 사진 지우기" on storage.objects;
create policy "photos: 내 사진 지우기" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'users'
         and (storage.foldername(name))[2] = auth.uid()::text);

-- ========== 와글와글 방명록 (supabase/guestbook.sql 과 같은 내용) ==========

create table if not exists public.guestbook (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 20),
  by_admin    boolean not null default false,
  stamp       text not null default 'gyul' check (stamp in ('gyul', 'star', 'pencil', 'house', 'heart')),
  message     text not null check (char_length(btrim(message)) between 1 and 300),
  created_at  timestamptz not null default now()
);
create index if not exists guestbook_created_at_idx on public.guestbook (created_at desc);

create or replace function public.guestbook_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  if new.user_id is null then
    raise exception '로그인이 필요해요' using errcode = '42501';
  end if;
  if (select count(*) from public.guestbook
        where user_id = new.user_id and created_at > now() - interval '1 minute') >= 3 then
    raise exception '조금 천천히 남겨주세요' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  new.by_admin    := public.is_admin();
  new.created_at  := now();
  new.author_name := btrim(new.author_name);
  new.message     := btrim(new.message);
  return new;
end $$;

drop trigger if exists guestbook_before_insert on public.guestbook;
create trigger guestbook_before_insert
  before insert on public.guestbook
  for each row execute function public.guestbook_before_insert();

alter table public.guestbook enable row level security;

drop policy if exists "guestbook: 누구나 읽기" on public.guestbook;
create policy "guestbook: 누구나 읽기" on public.guestbook
  for select to anon, authenticated using (true);

drop policy if exists "guestbook: 로그인하면 쓰기" on public.guestbook;
create policy "guestbook: 로그인하면 쓰기" on public.guestbook
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "guestbook: 본인이나 편집장이 지우기" on public.guestbook;
create policy "guestbook: 본인이나 편집장이 지우기" on public.guestbook
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

grant select on public.guestbook to anon, authenticated;
grant insert, delete on public.guestbook to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'guestbook') then
    alter publication supabase_realtime add table public.guestbook;
  end if;
end $$;
