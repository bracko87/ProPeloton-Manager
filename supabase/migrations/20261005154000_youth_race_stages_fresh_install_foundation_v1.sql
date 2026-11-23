-- Fresh-install foundation for the Youth race stage runtime.
-- Restored using a READ-ONLY comparison with the production table's columns
-- and constraints, plus the existing stage runtime contracts.  No historical rows are changed or dropped.
-- This must precede 20261005154856, which ALTERs the relation.
create table if not exists public.youth_race_stages (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.youth_races(id) on delete cascade,
  stage_number integer not null check (stage_number >= 1),
  stage_date date not null,
  stage_type text not null
    check (stage_type in ('flat','hilly','mountain','mixed','time_trial')),
  distance_km integer not null check (distance_km between 10 and 160),
  start_time_region_code text,
  planned_start_hour_number smallint check (planned_start_hour_number between 0 and 23),
  planned_start_minute smallint check (planned_start_minute between 0 and 59),
  planned_start_time_label text,
  sprint_points_total integer not null default 0 check (sprint_points_total >= 0),
  mountain_points_total integer not null default 0 check (mountain_points_total >= 0),
  time_trial_points_total integer not null default 0 check (time_trial_points_total >= 0),
  status text not null default 'scheduled'
    check (status in ('scheduled','completed','cancelled')),
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

-- The same stage-runtime contract also reads/writes race-level start-time
-- assignment fields.  Earlier Youth race foundations lack these columns.
alter table public.youth_races
  add column if not exists start_time_region_code text,
  add column if not exists planned_start_hour_number smallint,
  add column if not exists planned_start_minute smallint,
  add column if not exists planned_start_time_label text,
  add column if not exists planned_start_assigned_at timestamptz;
