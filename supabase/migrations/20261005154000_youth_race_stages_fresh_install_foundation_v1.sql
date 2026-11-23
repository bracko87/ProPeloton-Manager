-- Fresh-install foundation for the Youth race stage runtime.
-- Derived from the existing ensure_youth_race_runtime_v1(), detail, and
-- stage-health contracts.  No historical rows are changed or dropped.
-- This must precede 20261005154856, which ALTERs the relation.
create table if not exists public.youth_race_stages (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.youth_races(id) on delete cascade,
  stage_number integer not null check (stage_number >= 1),
  stage_date date not null,
  stage_type text not null,
  distance_km integer not null check (distance_km > 0),
  start_time_region_code text,
  planned_start_hour_number smallint,
  planned_start_minute smallint,
  planned_start_time_label text,
  sprint_points_total integer not null default 0,
  mountain_points_total integer not null default 0,
  time_trial_points_total integer not null default 0,
  status text not null default 'scheduled'
    check (status in ('scheduled','in_progress','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, stage_number)
);

create index if not exists youth_race_stages_race_date_idx
  on public.youth_race_stages(race_id,stage_date);

-- Youth race stages are exposed through owner-scoped SECURITY DEFINER RPCs;
-- do not make the underlying relation directly available to game clients.
alter table public.youth_race_stages enable row level security;
revoke all on public.youth_race_stages from anon, authenticated;
