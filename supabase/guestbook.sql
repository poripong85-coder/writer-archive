-- 와글와글 방명록 — schema.sql 을 이미 실행한 뒤에 이 파일만 실행하면 된다. (여러 번 실행해도 안전)
--   누구나 읽기 · 로그인한 사람만 쓰기 · 내 글은 내가, 모든 글은 편집장이 지우기
--   글쓴이 id·편집장 배지·시각은 서버가 채운다 (화면에서 보낸 값은 무시) → 사칭 불가
--   같은 사람이 1분에 3개 넘게 쓰면 막는다 (도배 방지)

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
