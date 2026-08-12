-- Friends feature. Run once in the Supabase SQL editor (after schema.sql).

-- Public identity: a username per user (emails are never exposed).
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles readable by signed-in users" on public.profiles
  for select to authenticated using (true);

create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = user_id);

create policy "update own profile" on public.profiles
  for update using (auth.uid() = user_id);

-- One-directional friend list ("I follow them").
create table public.friendships (
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

alter table public.friendships enable row level security;

create policy "read own friendships" on public.friendships
  for select using (auth.uid() = user_id);

create policy "add own friendships" on public.friendships
  for insert with check (auth.uid() = user_id);

create policy "remove own friendships" on public.friendships
  for delete using (auth.uid() = user_id);

-- Having added someone lets you read their travel doc (view/compare maps).
create policy "friends can read travels" on public.travels
  for select using (
    exists (
      select 1 from public.friendships f
      where f.user_id = auth.uid() and f.friend_id = travels.user_id
    )
  );
