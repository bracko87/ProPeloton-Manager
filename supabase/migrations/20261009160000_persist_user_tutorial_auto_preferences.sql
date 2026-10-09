-- Persistent, user-owned preference for tutorial auto-prompts.
-- Manual tutorial restarts remain available while automatic prompts are off.
create table if not exists public.user_tutorial_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  auto_tutorials_disabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.user_tutorial_preferences enable row level security;
drop policy if exists "Owners read tutorial preferences" on public.user_tutorial_preferences;
create policy "Owners read tutorial preferences" on public.user_tutorial_preferences
  for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists "Owners insert tutorial preferences" on public.user_tutorial_preferences;
create policy "Owners insert tutorial preferences" on public.user_tutorial_preferences
  for insert to authenticated with check (user_id=(select auth.uid()));
drop policy if exists "Owners update tutorial preferences" on public.user_tutorial_preferences;
create policy "Owners update tutorial preferences" on public.user_tutorial_preferences
  for update to authenticated using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()));
revoke all on public.user_tutorial_preferences from anon;
grant select, insert, update on public.user_tutorial_preferences to authenticated;
