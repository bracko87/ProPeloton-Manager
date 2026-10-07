-- Tutorial V2 rollout safety.
--
-- The updated onboarding auto-starts the core beginner tutorial only when an
-- authenticated manager has no Overview tutorial progress yet. Mark accounts
-- that already exist at migration time as skipped so established managers are
-- never forced back through beginner onboarding after this release.
--
-- Users created after this migration receive no row here and therefore get the
-- first-session tutorial automatically.

insert into public.user_tutorial_progress (
  user_id,
  tutorial_key,
  status,
  last_step_key,
  skipped_at
)
select
  u.id,
  'overview',
  'skipped',
  null,
  now()
from auth.users u
where not exists (
  select 1
  from public.user_tutorial_progress p
  where p.user_id = u.id
    and p.tutorial_key = 'overview'
)
on conflict (user_id, tutorial_key) do nothing;

-- Treat any legacy explicit not_started Overview rows as existing-account
-- onboarding state as well. Completed, skipped and actively started tutorials
-- are preserved unchanged.
update public.user_tutorial_progress
set
  status = 'skipped',
  skipped_at = coalesce(skipped_at, now()),
  completed_at = null,
  updated_at = now()
where tutorial_key = 'overview'
  and status = 'not_started';
