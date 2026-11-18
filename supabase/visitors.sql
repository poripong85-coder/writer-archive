-- 2026-11 방문자는 로그인 없이 — 이미 schema.sql 을 실행한 프로젝트는 이 파일 하나만 실행하면 된다.
-- Supabase 대시보드 → SQL Editor → New query → 통째로 붙여넣고 Run. (여러 번 실행해도 안전)
--   1) 와글와글 방명록: 로그인 없이 이름만 적고 남기기 (편집장 배지·도배 방지는 서버가 지킨다)
--   2) 일상 모임 조각의 모임 소개 페이지 2개를 편집장이 사이트에서 쓰고 고치기

-- 모임 소개 페이지 2개(눈사람 모빌 · 겨울 감)도 편집장이 사이트에서 쓰고 고칠 수 있게
alter table public.pages drop constraint if exists pages_key_check;
alter table public.pages add constraint pages_key_check
  check (key in ('intro', 'factory', 'stay', 'meet-snowman', 'meet-persimmon'));

-- ---------- 와글와글 방명록 ----------

create table if not exists public.guestbook (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 20),
  by_admin    boolean not null default false,
  stamp       text not null default 'gyul' check (stamp in ('gyul', 'star', 'pencil', 'house', 'heart')),
  message     text not null check (char_length(btrim(message)) between 1 and 300),
  created_at  timestamptz not null default now()
);
-- 예전 버전(로그인한 사람만 쓰기)에서 만든 표도 손님 글을 받을 수 있게
alter table public.guestbook alter column user_id drop not null;
create index if not exists guestbook_created_at_idx on public.guestbook (created_at desc);

create or replace function public.guestbook_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id     := auth.uid();          -- 손님이면 비어 있다
  new.by_admin    := public.is_admin();
  new.created_at  := now();
  new.author_name := btrim(new.author_name);
  new.message     := btrim(new.message);
  if not new.by_admin and new.author_name like '%편집장%' then
    raise exception '편집장이라는 이름은 쓸 수 없어요' using errcode = 'P0001', hint = 'reserved_name';
  end if;
  if new.user_id is null then
    -- 손님 글은 누가 썼는지 알 수 없으니 손님 전체를 합쳐서 센다
    if (select count(*) from public.guestbook
          where user_id is null and created_at > now() - interval '1 minute') >= 6
       or (select count(*) from public.guestbook
          where user_id is null and created_at > now() - interval '1 day') >= 300 then
      raise exception '조금 천천히 남겨주세요' using errcode = 'P0001', hint = 'rate_limited';
    end if;
  elsif (select count(*) from public.guestbook
           where user_id = new.user_id and created_at > now() - interval '1 minute') >= 3 then
    raise exception '조금 천천히 남겨주세요' using errcode = 'P0001', hint = 'rate_limited';
  end if;
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
drop policy if exists "guestbook: 누구나 쓰기" on public.guestbook;
create policy "guestbook: 누구나 쓰기" on public.guestbook
  for insert to anon, authenticated with check (user_id is not distinct from auth.uid());

drop policy if exists "guestbook: 본인이나 편집장이 지우기" on public.guestbook;
create policy "guestbook: 본인이나 편집장이 지우기" on public.guestbook
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

grant select, insert on public.guestbook to anon, authenticated;
grant delete on public.guestbook to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'guestbook') then
    alter publication supabase_realtime add table public.guestbook;
  end if;
end $$;
