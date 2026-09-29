
create index if not exists national_championship_editions_final_race_idx
  on public.national_championship_editions(final_race_id)
  where final_race_id is not null;

create index if not exists national_championship_editions_champion_rider_idx
  on public.national_championship_editions(champion_rider_id)
  where champion_rider_id is not null;

create index if not exists national_championship_ranking_club_idx
  on public.national_championship_ranking_snapshots(club_id)
  where club_id is not null;

create index if not exists national_championship_heats_race_idx
  on public.national_championship_heats(race_id)
  where race_id is not null;

create index if not exists national_championship_entries_heat_idx
  on public.national_championship_entries(heat_id)
  where heat_id is not null;

create index if not exists national_championship_duties_heat_idx
  on public.national_championship_duties(heat_id)
  where heat_id is not null;

create index if not exists national_championship_result_history_heat_idx
  on public.national_championship_result_history(heat_id)
  where heat_id is not null;

create index if not exists national_championship_result_history_rider_idx
  on public.national_championship_result_history(rider_id)
  where rider_id is not null;

create index if not exists national_championship_result_history_race_idx
  on public.national_championship_result_history(race_id)
  where race_id is not null;

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
  award_events as (
    select
      a.rider_id,
      a.rider_points,
      coalesce(rs.stage_date, rr.end_date) as performance_date
    from public.race_ranking_point_awards a
    join public.races rr on rr.id = a.race_id
    left join public.race_stages rs on rs.id = a.stage_id
    where a.rider_id is not null
      and a.rider_points > 0
  ),
  perf as (
    select
      ae.rider_id,
      coalesce(sum(ae.rider_points),0)::int as raw_points,
      coalesce(sum(
        ae.rider_points::numeric *
        case
          when (p_snapshot_date - ae.performance_date) between 0 and 30 then cfg.recency_weight_days_0_30
          when (p_snapshot_date - ae.performance_date) between 31 and 60 then cfg.recency_weight_days_31_60
          when (p_snapshot_date - ae.performance_date) between 61 and 90 then cfg.recency_weight_days_61_90
          when (p_snapshot_date - ae.performance_date) between 91 and 120 then cfg.recency_weight_days_91_120
          when (p_snapshot_date - ae.performance_date) between 121 and 180 then cfg.recency_weight_days_121_180
          else 0
        end
      ),0)::numeric(14,3) as weighted_points,
      coalesce(max(
        ae.rider_points::numeric *
        case
          when (p_snapshot_date - ae.performance_date) between 0 and 30 then cfg.recency_weight_days_0_30
          when (p_snapshot_date - ae.performance_date) between 31 and 60 then cfg.recency_weight_days_31_60
          when (p_snapshot_date - ae.performance_date) between 61 and 90 then cfg.recency_weight_days_61_90
          when (p_snapshot_date - ae.performance_date) between 91 and 120 then cfg.recency_weight_days_91_120
          when (p_snapshot_date - ae.performance_date) between 121 and 180 then cfg.recency_weight_days_121_180
          else 0
        end
      ),0)::numeric(14,3) as best_weighted_result,
      max(ae.performance_date) as latest_result_date
    from award_events ae
    cross join cfg
    where ae.performance_date <= p_snapshot_date
      and ae.performance_date > p_snapshot_date - cfg.ranking_window_days
    group by ae.rider_id
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

revoke execute on function public.preview_national_ranking_v1(text,date)
  from public, anon, authenticated;
grant execute on function public.preview_national_ranking_v1(text,date)
  to service_role;
