-- Travel tracker schema. Run this once in the Supabase SQL editor
-- (dashboard -> SQL Editor -> paste -> Run).

-- One row per user holding their whole travel document.
create table public.travels (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row-level security: everyone can only read/write their own row.
alter table public.travels enable row level security;

create policy "read own travels" on public.travels
  for select using (auth.uid() = user_id);

create policy "insert own travels" on public.travels
  for insert with check (auth.uid() = user_id);

create policy "update own travels" on public.travels
  for update using (auth.uid() = user_id);
