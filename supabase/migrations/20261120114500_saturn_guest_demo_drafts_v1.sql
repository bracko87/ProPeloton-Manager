-- SAT-01: isolated demonstration drafts for anonymous guest identities.
-- Schema only. Does not enable anonymous Auth, Guest Mode, or game-clock jobs.
-- No data from this table is used for official clubs, results, rewards or balances.

create table if not exists public.saturn_guest_drafts_v1 (
  user_id uuid primary key references auth.users(id) on delete cascade,
  draft jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saturn_guest_draft_object_v1
    check (jsonb_typeof(draft) = 'object'),
  constraint saturn_guest_draft_size_v1
    check (octet_length(draft::text) <= 16384)
);

alter table public.saturn_guest_drafts_v1 enable row level security;
alter table public.saturn_guest_drafts_v1 force row level security;

revoke all on table public.saturn_guest_drafts_v1 from public, anon, authenticated;
grant select, insert (user_id, draft), update (draft) on table public.saturn_guest_drafts_v1 to authenticated;

-- A converted account can still read its original demo draft, allowing a
-- future explicit migration. Only a currently anonymous owner can mutate it.
-- auth.users is not directly readable by authenticated app clients in Supabase.
-- Use a dedicated, narrowly scoped helper to avoid client-visible auth access.
create or replace function public.saturn_is_current_guest_v1()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users au
    where au.id = (select auth.uid()) and au.is_anonymous is true
  );
$$;
revoke all on function public.saturn_is_current_guest_v1() from public, anon;
grant execute on function public.saturn_is_current_guest_v1() to authenticated;

drop policy if exists saturn_guest_drafts_select_own_v1 on public.saturn_guest_drafts_v1;
create policy saturn_guest_drafts_select_own_v1
on public.saturn_guest_drafts_v1 for select to authenticated
using (
  user_id = (select auth.uid())
  and (
    not (select public.saturn_is_current_guest_v1())
    or created_at > now() - interval '7 days'
  )
);

-- Guest-only write policies use the narrow helper, not client auth.users access.
drop policy if exists saturn_guest_drafts_insert_own_anonymous_v1 on public.saturn_guest_drafts_v1;
create policy saturn_guest_drafts_insert_own_anonymous_v1
on public.saturn_guest_drafts_v1 for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select public.saturn_is_current_guest_v1())
  and created_at > now() - interval '7 days'
);
drop policy if exists saturn_guest_drafts_update_own_anonymous_v1 on public.saturn_guest_drafts_v1;
create policy saturn_guest_drafts_update_own_anonymous_v1
on public.saturn_guest_drafts_v1 for update to authenticated
using (user_id = (select auth.uid()) and (select public.saturn_is_current_guest_v1()) and created_at > now() - interval '7 days')
with check (user_id = (select auth.uid()) and (select public.saturn_is_current_guest_v1()) and created_at > now() - interval '7 days');

-- No DELETE privileges for players. Retention and verified conversion cleanup
-- require a separate privileged, audited migration.
