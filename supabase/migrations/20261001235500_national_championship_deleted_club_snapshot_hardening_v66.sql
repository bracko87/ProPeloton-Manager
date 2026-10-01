-- Harden National Championship migration/runtime against riders whose latest
-- club was soft-deleted after historical club_riders rows were written.
-- Such riders remain eligible and are treated as clubless/free-agent for the
-- National Championship instead of blocking Race Preparation.

CREATE OR REPLACE FUNCTION public.preview_national_ranking_v1(
  p_country_code text,
  p_snapshot_date date
)
RETURNS TABLE(
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
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  with cfg as (
    select *
    from public.national_championship_config
    where id = true
  ),
  award_events as (
    select
      a.rider_id,
      a.rider_points::integer as rider_points,
      coalesce(rs.stage_date, rr.end_date) as performance_date
    from public.race_ranking_point_awards a
    join public.races rr on rr.id = a.race_id
    left join public.race_stages rs on rs.id = a.stage_id
    where a.rider_id is not null
      and a.rider_points > 0

    union all

    select
      b.rider_id,
      b.points::integer,
      b.award_date
    from public.national_championship_ranking_bonus_awards b
    where b.points > 0
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
      select
        case
          when current_club.id is not null and current_club.deleted_at is null
            then cr.club_id
          else null
        end as club_id
      from public.club_riders cr
      left join public.clubs current_club on current_club.id=cr.club_id
      where cr.rider_id = r.id
      order by cr.created_at desc, cr.id desc
      limit 1
    ) club on true
    where upper(r.country_code) = upper(trim(p_country_code))
      and not exists (
        select 1
        from public.national_association_race_team_identities nti
        where nti.technical_club_id=club.club_id
      )
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
$function$;


CREATE OR REPLACE FUNCTION public.process_national_championship_runtime_v2()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
declare
  v_season integer;
  v_game_date date;
  v_created integer := 0;
  v_frozen integer := 0;
  v_races_ready integer := 0;
  v_auto_approved integer := 0;
  v_final_auto_approved integer := 0;
  v_world_final_auto_approved integer := 0;
  v_expected_editions integer:=0;
  v_existing_editions integer:=0;
  v_normalized_deleted_club_snapshots integer:=0;
  v_normalized_now integer:=0;
  r record;
  q jsonb;
  f jsonb;
  d jsonb;
  nf jsonb;
  wf jsonb;
begin
  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_game_date
  from public.game_state gs
  where gs.id=true;

  select count(distinct upper(country_code))::int
  into v_expected_editions
  from public.riders
  where nullif(trim(country_code),'') is not null;

  select count(*)::int
  into v_existing_editions
  from public.national_championship_editions
  where season_number=v_season
    and discipline='road';

  if v_existing_editions<v_expected_editions then
    v_created:=public.ensure_national_championship_editions_for_season_v1(v_season);
  else
    v_created:=0;
  end if;

  d:=public.process_championship_calendar_draw_v1();

  v_auto_approved:=public.national_championship_auto_approve_pending_v1();
  v_final_auto_approved:=public.national_championship_auto_approve_final_pending_v1();
  v_world_final_auto_approved:=0;

  for r in
    select id
    from public.national_championship_editions
    where season_number=v_season
      and discipline='road'
      and status='planned'
      and schedule_draw_status='locked'
      and climate_status='ready'
      and route_status='ready'
      and ranking_snapshot_date<=v_game_date
    order by ranking_snapshot_date,country_code
  loop
    perform public.freeze_national_championship_ranking_v1(r.id);

    -- A club may have been deleted between the rider-history snapshot source
    -- and this Championship freeze. Preserve the rider but treat that stale
    -- club reference exactly like a free-agent entry.
    update public.national_championship_entries en
    set club_id_snapshot=null,
        updated_at=now()
    where en.edition_id=r.id
      and en.club_id_snapshot is not null
      and not exists(
        select 1
        from public.clubs c
        where c.id=en.club_id_snapshot
          and c.deleted_at is null
      );
    get diagnostics v_normalized_now=row_count;
    v_normalized_deleted_club_snapshots:=
      v_normalized_deleted_club_snapshots+v_normalized_now;

    perform public.national_championship_ensure_races_v1(r.id);
    perform public.national_championship_notify_selection_v1(r.id);
    v_frozen:=v_frozen+1;
    v_races_ready:=v_races_ready+1;
  end loop;

  for r in
    select id
    from public.national_championship_editions
    where season_number=v_season
      and discipline='road'
      and schedule_draw_status='locked'
      and climate_status='ready'
      and route_status='ready'
      and status in ('ranking_frozen','qualification_pending','final_ready')
      and (
        final_race_id is null
        or exists(
          select 1
          from public.national_championship_heats h
          where h.edition_id=national_championship_editions.id
            and h.race_id is null
        )
      )
    order by country_code
  loop
    -- Re-check before materializing preparations because clubs can disappear
    -- after the ranking was frozen but before the actual event.
    update public.national_championship_entries en
    set club_id_snapshot=null,
        updated_at=now()
    where en.edition_id=r.id
      and en.club_id_snapshot is not null
      and not exists(
        select 1
        from public.clubs c
        where c.id=en.club_id_snapshot
          and c.deleted_at is null
      );
    get diagnostics v_normalized_now=row_count;
    v_normalized_deleted_club_snapshots:=
      v_normalized_deleted_club_snapshots+v_normalized_now;

    perform public.national_championship_ensure_races_v1(r.id);
    v_races_ready:=v_races_ready+1;
  end loop;

  q:=public.national_championship_process_qualification_results_v1();
  perform public.national_championship_refresh_final_participants_v1();

  nf:=public.national_championship_open_final_confirmations_v1();
  v_final_auto_approved:=v_final_auto_approved
    +public.national_championship_auto_approve_final_pending_v1();

  f:=public.national_championship_process_final_results_v1();

  perform public.world_road_championship_refresh_availability_v1();
  perform public.world_road_championship_auto_approve_pending_v1();

  wf:=jsonb_build_object(
    'status','not_required',
    'reason','World Road Championship uses one invitation/acceptance decision only'
  );

  perform public.world_road_championship_process_results_v1();

  return jsonb_build_object(
    'status','ok',
    'season_number',v_season,
    'game_date',v_game_date,
    'calendar_draw',d,
    'editions_created',v_created,
    'pending_entries_auto_approved',v_auto_approved,
    'national_final_pending_auto_approved',v_final_auto_approved,
    'world_final_pending_auto_approved',v_world_final_auto_approved,
    'rankings_frozen',v_frozen,
    'race_sets_ensured',v_races_ready,
    'deleted_club_snapshots_normalized',v_normalized_deleted_club_snapshots,
    'qualification_processing',q,
    'national_final_confirmation_processing',nf,
    'final_processing',f,
    'world_final_confirmation_processing',wf
  );
end;
$function$;
