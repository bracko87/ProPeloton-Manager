alter table public.national_championship_config
  add column if not exists duty_window_days integer not null default 3,
  add column if not exists participation_decision_lead_days integer not null default 7,
  add column if not exists refusal_morale_penalty integer not null default 2,
  add column if not exists participation_morale_bonus integer not null default 1,
  add column if not exists climate_target_temp_c numeric not null default 20.0,
  add column if not exists preferred_route_mountain_pct_max numeric not null default 35,
  add column if not exists preferred_route_elevation_gain_max integer not null default 3000,
  add column if not exists preferred_route_elevation_per_km_max numeric not null default 20;

alter table public.national_championship_config
  drop constraint if exists national_championship_config_duty_window_days_check;
alter table public.national_championship_config
  add constraint national_championship_config_duty_window_days_check
  check (duty_window_days = 3);

alter table public.national_championship_config
  drop constraint if exists national_championship_config_participation_decision_lead_days_check;
alter table public.national_championship_config
  add constraint national_championship_config_participation_decision_lead_days_check
  check (participation_decision_lead_days between 1 and 30);

alter table public.national_championship_editions
  add column if not exists duty_window_start_date date,
  add column if not exists duty_window_end_date date,
  add column if not exists participation_decision_deadline date,
  add column if not exists climate_source_country_code text,
  add column if not exists climate_week_of_year integer,
  add column if not exists climate_expected_max_temp_c numeric,
  add column if not exists climate_status text not null default 'pending',
  add column if not exists route_status text not null default 'pending',
  add column if not exists qualification_source_stage_id uuid references public.race_stages(id) on delete set null,
  add column if not exists final_source_stage_id uuid references public.race_stages(id) on delete set null;

alter table public.national_championship_editions
  drop constraint if exists national_championship_editions_climate_status_check;
alter table public.national_championship_editions
  add constraint national_championship_editions_climate_status_check
  check (climate_status in ('pending','ready','temperature_target_unavailable','weather_data_unavailable'));

alter table public.national_championship_editions
  drop constraint if exists national_championship_editions_route_status_check;
alter table public.national_championship_editions
  add constraint national_championship_editions_route_status_check
  check (route_status in ('pending','ready','single_route_only','missing_route'));

alter table public.national_championship_entries
  add column if not exists participation_decision text not null default 'pending',
  add column if not exists participation_decision_at timestamptz,
  add column if not exists participation_decision_user_id uuid,
  add column if not exists refusal_morale_delta integer not null default 0;

alter table public.national_championship_entries
  drop constraint if exists national_championship_entries_participation_decision_check;
alter table public.national_championship_entries
  add constraint national_championship_entries_participation_decision_check
  check (participation_decision in ('pending','approved','auto_approved','rejected'));

alter table public.national_championship_duties
  add column if not exists duty_start_date date,
  add column if not exists duty_end_date date;

create index if not exists national_championship_editions_schedule_idx
  on public.national_championship_editions(season_number,climate_status,route_status,ranking_snapshot_date);

create index if not exists national_championship_entries_decision_idx
  on public.national_championship_entries(edition_id,participation_decision,entry_status);

create index if not exists national_championship_duties_window_idx
  on public.national_championship_duties(rider_id,duty_start_date,duty_end_date,status);
