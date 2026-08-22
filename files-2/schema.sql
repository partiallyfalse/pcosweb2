-- =====================================================================
--  BUNNY'S CORNER — database schema
--  Paste this whole file into Supabase → SQL Editor → Run.
--  Safe to re-run; it drops and recreates policies.
-- =====================================================================

-- ---------- NOTES (shared board) ----------
create table if not exists notes (
  id          bigserial primary key,
  author_id   uuid references auth.users(id) on delete set null,
  author_name text,
  text        text not null,
  color       text default '#FFF0BF',
  pin         text default '📌',
  rot         real default 0,
  created_at  timestamptz default now()
);

-- ---------- GIFTS (shared wishlist) ----------
create table if not exists gifts (
  id          bigserial primary key,
  created_by  uuid references auth.users(id) on delete set null,
  name        text not null,
  link        text,
  note        text,
  got         boolean default false,
  created_at  timestamptz default now()
);

-- ---------- TRACKER (private per user) ----------
create table if not exists entries (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  mood        int  not null check (mood between 1 and 5),
  symptoms    text,
  note        text,
  created_at  timestamptz default now()
);

-- ---------- PHOTOS (shared gallery + hero) ----------
create table if not exists photos (
  id          bigserial primary key,
  uploaded_by uuid references auth.users(id) on delete set null,
  path        text not null,          -- storage object path
  kind        text default 'gallery', -- 'gallery' | 'hero'
  caption     text,
  created_at  timestamptz default now()
);

-- ---------- MEMORIES (what the assistant knows) ----------
create table if not exists memories (
  id          bigserial primary key,
  fact        text not null unique,
  created_at  timestamptz default now()
);

-- ---------- CHAT (shared conversation with the assistant) ----------
create table if not exists chat (
  id          bigserial primary key,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  author_name text,
  created_at  timestamptz default now()
);

-- =====================================================================
--  ROW LEVEL SECURITY
--  This is a two-person site. Signups are disabled in the dashboard,
--  so "any authenticated user" means only the accounts you created.
--  Tracker entries stay private to whoever wrote them.
-- =====================================================================

alter table notes    enable row level security;
alter table gifts    enable row level security;
alter table entries  enable row level security;
alter table photos   enable row level security;
alter table memories enable row level security;
alter table chat     enable row level security;

-- shared tables: any logged-in user can do anything
do $$
declare t text;
begin
  foreach t in array array['notes','gifts','photos','memories','chat'] loop
    execute format('drop policy if exists "shared_all" on %I', t);
    execute format(
      'create policy "shared_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- tracker: private to the author
drop policy if exists "own_entries" on entries;
create policy "own_entries" on entries
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================================
--  STORAGE BUCKET for photos
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "photos_read"   on storage.objects;
drop policy if exists "photos_write"  on storage.objects;
drop policy if exists "photos_delete" on storage.objects;

create policy "photos_read" on storage.objects
  for select to authenticated using (bucket_id = 'photos');

create policy "photos_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');

create policy "photos_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'photos');

-- =====================================================================
--  REALTIME (so notes/gifts appear on the other person's screen live)
-- =====================================================================
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table gifts;
alter publication supabase_realtime add table photos;
alter publication supabase_realtime add table chat;
