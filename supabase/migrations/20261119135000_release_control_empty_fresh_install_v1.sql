-- Fresh-install dependency for Game Control Center's release-hold reporting.
-- Structure verified READ-ONLY against existing ProPeloton Manager schema.
-- Deliberately NO row, cron schedule or launch side effects: a blank database
-- must never be interpreted as a verified/approved launch hold.
create table if not exists private.ppm_december_2026_release_control_v1(
  id boolean primary key default true check(id),
  reset_run_id uuid not null references public.game_world_reset_runs(id),
  release_at timestamptz not null,
  launched_at timestamptz,
  status text not null default 'scheduled',
  updated_at timestamptz not null default now()
);
alter table private.ppm_december_2026_release_control_v1 enable row level security;
revoke all on private.ppm_december_2026_release_control_v1 from public,anon,authenticated;
