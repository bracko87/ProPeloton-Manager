
create table if not exists public.national_championship_config (
  id boolean primary key default true check (id),
  final_field_size integer not null default 120 check (final_field_size >= 20),
  direct_qualifier_count integer not null default 80 check (direct_qualifier_count >= 0),
  qualification_heat_max_size integer not null default 110 check (qualification_heat_max_size >= 20),
  qualification_lead_days integer not null default 21 check (qualification_lead_days between 14 and 28),
  ranking_freeze_lead_days integer not null default 35 check (ranking_freeze_lead_days > qualification_lead_days),
  ranking_window_days integer not null default 180 check (ranking_window_days >= 30),
  recency_weight_days_0_30 numeric(5,4) not null default 1.0000,
  recency_weight_days_31_60 numeric(5,4) not null default 0.8500,
  recency_weight_days_61_90 numeric(5,4) not null default 0.7000,
  recency_weight_days_91_120 numeric(5,4) not null default 0.5500,
  recency_weight_days_121_180 numeric(5,4) not null default 0.4000,
  updated_at timestamptz not null default now()
);

insert into public.national_championship_config (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.national_championship_editions (
  id uuid primary key default gen_random_uuid(),
  season_number integer not null,
  country_code text not null,
  discipline text not null default 'road' check (discipline = 'road'),
  ranking_snapshot_date date not null,
  qualification_date date not null,
  final_date date not null,
  status text not null default 'planned'
    check (status in ('planned','ranking_frozen','qualification_pending','qualification_completed','final_ready','completed','cancelled')),
  eligible_count integer,
  final_field_size integer not null,
  direct_qualifier_count integer,
  qualification_places integer,
  qualification_heat_count integer,
  final_race_id uuid references public.races(id) on delete set null,
  champion_rider_id uuid references public.riders(id) on delete set null,
  champion_name_snapshot text,
  champion_club_id uuid,
  champion_club_name_snapshot text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_number, country_code, discipline),
  check (ranking_snapshot_date < qualification_date),
  check (qualification_date < final_date)
);

create index if not exists national_championship_editions_due_idx
  on public.national_championship_editions(status, ranking_snapshot_date, qualification_date, final_date);
create index if not exists national_championship_editions_country_idx
  on public.national_championship_editions(country_code, season_number desc);

create table if not exists public.national_championship_ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.national_championship_editions(id) on delete cascade,
  rider_id uuid not null references public.riders(id) on delete cascade,
  club_id uuid,
  national_rank integer not null,
  raw_points integer not null default 0,
  weighted_points numeric(14,3) not null default 0,
  best_weighted_result numeric(14,3) not null default 0,
  latest_result_date date,
  overall_snapshot integer,
  rider_name_snapshot text not null,
  country_code_snapshot text not null,
  created_at timestamptz not null default now(),
  unique (edition_id, rider_id),
  unique (edition_id, national_rank)
);

create index if not exists national_championship_ranking_lookup_idx
  on public.national_championship_ranking_snapshots(edition_id, national_rank);
create index if not exists national_championship_ranking_rider_idx
  on public.national_championship_ranking_snapshots(rider_id, edition_id);

create table if not exists public.national_championship_heats (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.national_championship_editions(id) on delete cascade,
  heat_number integer not null check (heat_number >= 1),
  qualification_date date not null,
  qualifying_places integer not null check (qualifying_places >= 0),
  assigned_count integer not null default 0 check (assigned_count >= 0),
  race_id uuid references public.races(id) on delete set null,
  status text not null default 'planned'
    check (status in ('planned','ready','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, heat_number)
);

create table if not exists public.national_championship_entries (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.national_championship_editions(id) on delete cascade,
  rider_id uuid not null references public.riders(id) on delete cascade,
  club_id_snapshot uuid,
  national_rank integer not null,
  entry_path text not null check (entry_path in ('direct','qualification')),
  entry_status text not null
    check (entry_status in ('direct_qualified','qualification_assigned','qualified','eliminated','withdrawn','finalist')),
  heat_id uuid references public.national_championship_heats(id) on delete set null,
  heat_number integer,
  seed_number integer,
  final_start_number integer,
  rider_name_snapshot text not null,
  country_code_snapshot text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, rider_id)
);

create index if not exists national_championship_entries_edition_status_idx
  on public.national_championship_entries(edition_id, entry_status, national_rank);
create index if not exists national_championship_entries_rider_idx
  on public.national_championship_entries(rider_id, edition_id);

create table if not exists public.national_championship_duties (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.national_championship_editions(id) on delete cascade,
  rider_id uuid not null references public.riders(id) on delete cascade,
  duty_type text not null check (duty_type in ('qualification','final')),
  duty_date date not null,
  heat_id uuid references public.national_championship_heats(id) on delete set null,
  status text not null default 'confirmed' check (status in ('confirmed','completed','cancelled')),
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, rider_id, duty_type)
);

create index if not exists national_championship_duties_rider_date_idx
  on public.national_championship_duties(rider_id, duty_date)
  where status = 'confirmed';

create table if not exists public.national_championship_result_history (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.national_championship_editions(id) on delete cascade,
  event_type text not null check (event_type in ('qualification','final')),
  heat_id uuid references public.national_championship_heats(id) on delete cascade,
  rider_id uuid references public.riders(id) on delete set null,
  club_id_snapshot uuid,
  rank integer not null check (rank >= 1),
  status text not null default 'finished',
  rider_name_snapshot text not null,
  club_name_snapshot text,
  country_code_snapshot text not null,
  race_id uuid references public.races(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists national_championship_result_history_lookup_idx
  on public.national_championship_result_history(edition_id, event_type, heat_id, rank);

alter table public.national_championship_config enable row level security;
alter table public.national_championship_editions enable row level security;
alter table public.national_championship_ranking_snapshots enable row level security;
alter table public.national_championship_heats enable row level security;
alter table public.national_championship_entries enable row level security;
alter table public.national_championship_duties enable row level security;
alter table public.national_championship_result_history enable row level security;

revoke all on public.national_championship_config from anon, authenticated;
revoke all on public.national_championship_editions from anon, authenticated;
revoke all on public.national_championship_ranking_snapshots from anon, authenticated;
revoke all on public.national_championship_heats from anon, authenticated;
revoke all on public.national_championship_entries from anon, authenticated;
revoke all on public.national_championship_duties from anon, authenticated;
revoke all on public.national_championship_result_history from anon, authenticated;

grant select on public.national_championship_config to authenticated;
grant select on public.national_championship_editions to authenticated;
grant select on public.national_championship_ranking_snapshots to authenticated;
grant select on public.national_championship_heats to authenticated;
grant select on public.national_championship_entries to authenticated;
grant select on public.national_championship_duties to authenticated;
grant select on public.national_championship_result_history to authenticated;

drop policy if exists national_championship_config_read on public.national_championship_config;
create policy national_championship_config_read
  on public.national_championship_config for select
  to authenticated using (true);

drop policy if exists national_championship_editions_read on public.national_championship_editions;
create policy national_championship_editions_read
  on public.national_championship_editions for select
  to authenticated using (true);

drop policy if exists national_championship_ranking_read on public.national_championship_ranking_snapshots;
create policy national_championship_ranking_read
  on public.national_championship_ranking_snapshots for select
  to authenticated using (true);

drop policy if exists national_championship_heats_read on public.national_championship_heats;
create policy national_championship_heats_read
  on public.national_championship_heats for select
  to authenticated using (true);

drop policy if exists national_championship_entries_read on public.national_championship_entries;
create policy national_championship_entries_read
  on public.national_championship_entries for select
  to authenticated using (true);

drop policy if exists national_championship_duties_read on public.national_championship_duties;
create policy national_championship_duties_read
  on public.national_championship_duties for select
  to authenticated using (true);

drop policy if exists national_championship_results_read on public.national_championship_result_history;
create policy national_championship_results_read
  on public.national_championship_result_history for select
  to authenticated using (true);

create or replace function public.national_championship_final_date_v1(
  p_country_code text,
  p_season_number integer
)
returns date
language sql
immutable
set search_path = ''
as $$
  with base as (
    select make_date(1999 + p_season_number, 6, 18) as d
  ),
  first_sunday as (
    select d + ((7 - extract(dow from d)::int) % 7) as d
    from base
  )
  select (
    d + (
      (abs(hashtextextended(upper(trim(coalesce(p_country_code,''))), 0)) % 5)::int * 7
    )
  )::date
  from first_sunday;
$$;

create or replace function public.national_championship_population_plan_v1(
  p_eligible_count integer
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with cfg as (
    select *
    from public.national_championship_config
    where id = true
  ),
  calc as (
    select
      greatest(coalesce(p_eligible_count,0),0)::int as eligible_count,
      cfg.final_field_size,
      cfg.direct_qualifier_count,
      cfg.qualification_heat_max_size,
      case
        when greatest(coalesce(p_eligible_count,0),0) <= cfg.final_field_size
          then greatest(coalesce(p_eligible_count,0),0)
        else least(cfg.direct_qualifier_count, cfg.final_field_size)
      end::int as direct_count
    from cfg
  ),
  final_calc as (
    select *,
      case when eligible_count <= final_field_size then 0 else final_field_size - direct_count end::int as qualification_places,
      case when eligible_count <= final_field_size then 0 else eligible_count - direct_count end::int as qualification_population
    from calc
  )
  select jsonb_build_object(
    'eligible_count', eligible_count,
    'final_field_size', least(eligible_count, final_field_size),
    'direct_qualifiers', direct_count,
    'qualification_population', qualification_population,
    'qualification_places', qualification_places,
    'heat_count',
      case
        when qualification_population = 0 then 0
        else ceil(qualification_population::numeric / qualification_heat_max_size)::int
      end
  )
  from final_calc;
$$;

create or replace function public.preview_national_ranking_v1(
  p_country_code text,
  p_snapshot_date date
)
returns table (
  national_rank integer,
  rider_id uuid,
  club_id uuid,
  rider_name text,
  country_code text,
  raw_points integer,
  weighted_points numeric,
  best_weighted_result numeric,
  latest_result_date date,
  overall integer
)
language sql
stable
set search_path = ''
as $$
  with cfg as (
    select *
    from public.national_championship_config
    where id = true
  ),
  perf as (
    select
      a.rider_id,
      coalesce(sum(a.rider_points),0)::int as raw_points,
      coalesce(sum(
        a.rider_points::numeric *
        case
          when (p_snapshot_date - rr.end_date) between 0 and 30 then cfg.recency_weight_days_0_30
          when (p_snapshot_date - rr.end_date) between 31 and 60 then cfg.recency_weight_days_31_60
          when (p_snapshot_date - rr.end_date) between 61 and 90 then cfg.recency_weight_days_61_90
          when (p_snapshot_date - rr.end_date) between 91 and 120 then cfg.recency_weight_days_91_120
          when (p_snapshot_date - rr.end_date) between 121 and 180 then cfg.recency_weight_days_121_180
          else 0
        end
      ),0)::numeric(14,3) as weighted_points,
      coalesce(max(
        a.rider_points::numeric *
        case
          when (p_snapshot_date - rr.end_date) between 0 and 30 then cfg.recency_weight_days_0_30
          when (p_snapshot_date - rr.end_date) between 31 and 60 then cfg.recency_weight_days_31_60
          when (p_snapshot_date - rr.end_date) between 61 and 90 then cfg.recency_weight_days_61_90
          when (p_snapshot_date - rr.end_date) between 91 and 120 then cfg.recency_weight_days_91_120
          when (p_snapshot_date - rr.end_date) between 121 and 180 then cfg.recency_weight_days_121_180
          else 0
        end
      ),0)::numeric(14,3) as best_weighted_result,
      max(rr.end_date) as latest_result_date
    from public.race_ranking_point_awards a
    join public.races rr on rr.id = a.race_id
    cross join cfg
    where a.rider_id is not null
      and a.rider_points > 0
      and rr.end_date <= p_snapshot_date
      and rr.end_date > p_snapshot_date - cfg.ranking_window_days
    group by a.rider_id
  ),
  base as (
    select
      r.id as rider_id,
      club.club_id,
      coalesce(nullif(trim(r.first_name || ' ' || r.last_name),''), r.display_name, r.id::text) as rider_name,
      upper(r.country_code) as country_code,
      coalesce(perf.raw_points,0)::int as raw_points,
      coalesce(perf.weighted_points,0)::numeric(14,3) as weighted_points,
      coalesce(perf.best_weighted_result,0)::numeric(14,3) as best_weighted_result,
      perf.latest_result_date,
      coalesce(r.overall,0)::int as overall
    from public.riders r
    left join perf on perf.rider_id = r.id
    left join lateral (
      select cr.club_id
      from public.club_riders cr
      where cr.rider_id = r.id
      order by cr.created_at desc, cr.id desc
      limit 1
    ) club on true
    where upper(r.country_code) = upper(trim(p_country_code))
  )
  select
    row_number() over (
      order by
        weighted_points desc,
        best_weighted_result desc,
        latest_result_date desc nulls last,
        overall desc,
        rider_id
    )::int as national_rank,
    rider_id,
    club_id,
    rider_name,
    country_code,
    raw_points,
    weighted_points,
    best_weighted_result,
    latest_result_date,
    overall
  from base
  order by national_rank;
$$;

create or replace function public.ensure_national_championship_editions_for_season_v1(
  p_season_number integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cfg record;
  inserted_count integer := 0;
begin
  select * into cfg
  from public.national_championship_config
  where id = true;

  insert into public.national_championship_editions (
    season_number,
    country_code,
    discipline,
    ranking_snapshot_date,
    qualification_date,
    final_date,
    final_field_size
  )
  select
    p_season_number,
    x.country_code,
    'road',
    public.national_championship_final_date_v1(x.country_code,p_season_number) - cfg.ranking_freeze_lead_days,
    public.national_championship_final_date_v1(x.country_code,p_season_number) - cfg.qualification_lead_days,
    public.national_championship_final_date_v1(x.country_code,p_season_number),
    cfg.final_field_size
  from (
    select distinct upper(country_code) as country_code
    from public.riders
    where nullif(trim(country_code),'') is not null
  ) x
  on conflict (season_number,country_code,discipline) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.freeze_national_championship_ranking_v1(
  p_edition_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  e public.national_championship_editions%rowtype;
  cfg public.national_championship_config%rowtype;
  v_eligible integer;
  v_direct integer;
  v_qualification_places integer;
  v_qualification_population integer;
  v_heat_count integer;
  v_heat integer;
  v_base_places integer;
  v_remainder integer;
begin
  select * into e
  from public.national_championship_editions
  where id = p_edition_id
  for update;

  if e.id is null then
    raise exception 'National championship edition not found: %', p_edition_id;
  end if;

  if e.status <> 'planned' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status',e.status,
      'already_processed',true
    );
  end if;

  select * into cfg
  from public.national_championship_config
  where id = true;

  insert into public.national_championship_ranking_snapshots (
    edition_id,rider_id,club_id,national_rank,raw_points,weighted_points,
    best_weighted_result,latest_result_date,overall_snapshot,
    rider_name_snapshot,country_code_snapshot
  )
  select
    e.id,
    p.rider_id,
    p.club_id,
    p.national_rank,
    p.raw_points,
    p.weighted_points,
    p.best_weighted_result,
    p.latest_result_date,
    p.overall,
    p.rider_name,
    p.country_code
  from public.preview_national_ranking_v1(e.country_code,e.ranking_snapshot_date) p;

  select count(*)::int into v_eligible
  from public.national_championship_ranking_snapshots
  where edition_id = e.id;

  if v_eligible <= cfg.final_field_size then
    v_direct := v_eligible;
    v_qualification_places := 0;
    v_qualification_population := 0;
    v_heat_count := 0;
  else
    v_direct := least(cfg.direct_qualifier_count,cfg.final_field_size);
    v_qualification_places := cfg.final_field_size - v_direct;
    v_qualification_population := v_eligible - v_direct;
    v_heat_count := ceil(v_qualification_population::numeric / cfg.qualification_heat_max_size)::int;
  end if;

  if v_heat_count > 0 then
    v_base_places := floor(v_qualification_places::numeric / v_heat_count)::int;
    v_remainder := mod(v_qualification_places,v_heat_count);

    for v_heat in 1..v_heat_count loop
      insert into public.national_championship_heats (
        edition_id,heat_number,qualification_date,qualifying_places
      )
      values (
        e.id,
        v_heat,
        e.qualification_date,
        v_base_places + case when v_heat <= v_remainder then 1 else 0 end
      );
    end loop;
  end if;

  if v_eligible <= cfg.final_field_size then
    insert into public.national_championship_entries (
      edition_id,rider_id,club_id_snapshot,national_rank,entry_path,entry_status,
      seed_number,rider_name_snapshot,country_code_snapshot
    )
    select
      e.id,s.rider_id,s.club_id,s.national_rank,'direct','direct_qualified',
      s.national_rank,s.rider_name_snapshot,s.country_code_snapshot
    from public.national_championship_ranking_snapshots s
    where s.edition_id = e.id
    order by s.national_rank;
  else
    insert into public.national_championship_entries (
      edition_id,rider_id,club_id_snapshot,national_rank,entry_path,entry_status,
      heat_id,heat_number,seed_number,rider_name_snapshot,country_code_snapshot
    )
    select
      e.id,
      s.rider_id,
      s.club_id,
      s.national_rank,
      case when s.national_rank <= v_direct then 'direct' else 'qualification' end,
      case when s.national_rank <= v_direct then 'direct_qualified' else 'qualification_assigned' end,
      h.id,
      case when s.national_rank <= v_direct then null else q.heat_number end,
      s.national_rank,
      s.rider_name_snapshot,
      s.country_code_snapshot
    from public.national_championship_ranking_snapshots s
    left join lateral (
      select
        case
          when s.national_rank <= v_direct then null::integer
          else
            case
              when (floor(((s.national_rank - v_direct - 1)::numeric) / v_heat_count)::int % 2) = 0
                then ((s.national_rank - v_direct - 1) % v_heat_count) + 1
              else v_heat_count - ((s.national_rank - v_direct - 1) % v_heat_count)
            end
        end as heat_number
    ) q on true
    left join public.national_championship_heats h
      on h.edition_id = e.id
     and h.heat_number = q.heat_number
    where s.edition_id = e.id
    order by s.national_rank;
  end if;

  update public.national_championship_heats h
  set assigned_count = x.assigned_count,
      updated_at = now()
  from (
    select heat_id,count(*)::int assigned_count
    from public.national_championship_entries
    where edition_id = e.id and heat_id is not null
    group by heat_id
  ) x
  where h.id = x.heat_id;

  insert into public.national_championship_duties (
    edition_id,rider_id,duty_type,duty_date,heat_id,label
  )
  select
    e.id,
    en.rider_id,
    case when en.entry_path = 'direct' then 'final' else 'qualification' end,
    case when en.entry_path = 'direct' then e.final_date else e.qualification_date end,
    en.heat_id,
    case
      when en.entry_path = 'direct'
        then 'National Duty — ' || e.country_code || ' National Road Championship'
      else 'National Duty — ' || e.country_code || ' National Championship Qualification'
    end
  from public.national_championship_entries en
  where en.edition_id = e.id
  on conflict (edition_id,rider_id,duty_type) do update
    set duty_date = excluded.duty_date,
        heat_id = excluded.heat_id,
        label = excluded.label,
        status = 'confirmed',
        updated_at = now();

  update public.national_championship_editions
  set status = 'ranking_frozen',
      eligible_count = v_eligible,
      direct_qualifier_count = v_direct,
      qualification_places = v_qualification_places,
      qualification_heat_count = v_heat_count,
      updated_at = now()
  where id = e.id;

  return jsonb_build_object(
    'edition_id',e.id,
    'country_code',e.country_code,
    'eligible_count',v_eligible,
    'direct_qualifiers',v_direct,
    'qualification_population',v_qualification_population,
    'qualification_places',v_qualification_places,
    'heat_count',v_heat_count,
    'status','ranking_frozen'
  );
end;
$$;

create or replace function public.process_national_championship_planning_v1()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_season integer;
  v_game_date date;
  v_inserted integer := 0;
  v_frozen integer := 0;
  r record;
begin
  select gs.season_number,
         public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_game_date
  from public.game_state gs
  where gs.id = true;

  v_inserted := public.ensure_national_championship_editions_for_season_v1(v_season);

  for r in
    select id
    from public.national_championship_editions
    where season_number = v_season
      and discipline = 'road'
      and status = 'planned'
      and ranking_snapshot_date <= v_game_date
    order by ranking_snapshot_date,country_code
  loop
    perform public.freeze_national_championship_ranking_v1(r.id);
    v_frozen := v_frozen + 1;
  end loop;

  return jsonb_build_object(
    'season_number',v_season,
    'game_date',v_game_date,
    'editions_created',v_inserted,
    'rankings_frozen',v_frozen
  );
end;
$$;

create or replace function public.get_national_championship_overview_v1(
  p_country_code text,
  p_season_number integer default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with target as (
    select e.*
    from public.national_championship_editions e
    where e.country_code = upper(trim(p_country_code))
      and e.discipline = 'road'
      and e.season_number = coalesce(
        p_season_number,
        (select gs.season_number from public.game_state gs where gs.id = true)
      )
    limit 1
  )
  select jsonb_build_object(
    'edition',to_jsonb(t),
    'heats',coalesce((
      select jsonb_agg(to_jsonb(h) order by h.heat_number)
      from public.national_championship_heats h
      where h.edition_id = t.id
    ),'[]'::jsonb),
    'ranking_top_20',coalesce((
      select jsonb_agg(to_jsonb(r) order by r.national_rank)
      from (
        select
          s.national_rank,s.rider_id,s.club_id,s.rider_name_snapshot,
          s.weighted_points,s.raw_points,s.latest_result_date,s.overall_snapshot
        from public.national_championship_ranking_snapshots s
        where s.edition_id = t.id
        order by s.national_rank
        limit 20
      ) r
    ),'[]'::jsonb)
  )
  from target t;
$$;

create or replace function public.get_overlapping_committed_riders(
  p_rider_ids uuid[],
  p_start_date date,
  p_days integer
)
returns table(
  rider_id uuid,
  source_type text,
  source_id uuid,
  blocked_from date,
  blocked_until date,
  status_code text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with req as (
    select
      (p_start_date - 1) as requested_from_with_buffer,
      ((p_start_date + (p_days - 1)) + 1) as requested_until_with_buffer,
      p_start_date as requested_from_exact,
      (p_start_date + (p_days - 1)) as requested_until_exact
  )
  select
    rcw.rider_id,
    rcw.source_type,
    rcw.source_id,
    rcw.blocked_from,
    rcw.blocked_until,
    'already_in_overlapping_activity'::text as status_code
  from public.rider_commitment_windows rcw
  cross join req
  where rcw.rider_id = any(coalesce(p_rider_ids,'{}'::uuid[]))
    and not (
      rcw.blocked_until < req.requested_from_with_buffer
      or rcw.blocked_from > req.requested_until_with_buffer
    )

  union all

  select
    nd.rider_id,
    'national_duty'::text,
    nd.id,
    nd.duty_date,
    nd.duty_date,
    'national_duty'::text as status_code
  from public.national_championship_duties nd
  cross join req
  where nd.rider_id = any(coalesce(p_rider_ids,'{}'::uuid[]))
    and nd.status = 'confirmed'
    and nd.duty_date between req.requested_from_exact and req.requested_until_exact;
$$;

revoke execute on function public.ensure_national_championship_editions_for_season_v1(integer) from public, anon, authenticated;
revoke execute on function public.freeze_national_championship_ranking_v1(uuid) from public, anon, authenticated;
revoke execute on function public.process_national_championship_planning_v1() from public, anon, authenticated;
revoke execute on function public.preview_national_ranking_v1(text,date) from public, anon, authenticated;

grant execute on function public.ensure_national_championship_editions_for_season_v1(integer) to service_role;
grant execute on function public.freeze_national_championship_ranking_v1(uuid) to service_role;
grant execute on function public.process_national_championship_planning_v1() to service_role;
grant execute on function public.preview_national_ranking_v1(text,date) to service_role;
grant execute on function public.national_championship_population_plan_v1(integer) to authenticated;
grant execute on function public.get_national_championship_overview_v1(text,integer) to authenticated;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'national-championship-planner-v1'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'national-championship-planner-v1',
    '*/15 * * * *',
    'select public.process_national_championship_planning_v1();'
  );
end;
$$;

select public.ensure_national_championship_editions_for_season_v1(
  (select gs.season_number from public.game_state gs where gs.id = true)
);
