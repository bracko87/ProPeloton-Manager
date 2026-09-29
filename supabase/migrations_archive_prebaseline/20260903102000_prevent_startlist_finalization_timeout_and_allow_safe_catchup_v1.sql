CREATE OR REPLACE FUNCTION public.race_assign_team_start_numbers_v1(p_race_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_updated_count integer := 0;
begin
  if p_race_id is null then
    raise exception 'p_race_id is required';
  end if;

  if to_regclass('public.race_participant_riders') is null then
    raise exception 'race_participant_riders table not found';
  end if;

  /*
   * Start numbers are presentation metadata. During startlist finalization we
   * must not recalculate the full live international ranking stack for every
   * participant-team insert. Use the ranking snapshot already persisted on
   * race_participant_teams instead. This keeps ordering deterministic for the
   * race and prevents the startlist-finalizer statement timeout.
   */
  with accepted_teams as (
    select distinct
      coalesce(t.club_id, t.owner_club_id, t.participating_club_id) as team_key,
      t.club_id,
      t.owner_club_id,
      t.participating_club_id,
      t.race_team_entry_id,
      coalesce(t.club_name, 'Team') as team_name,
      lower(coalesce(t.club_tier::text, '')) as club_tier_text,
      case lower(coalesce(t.club_tier::text, ''))
        when 'worldteam' then 1
        when 'proteam' then 2
        when 'continental' then 3
        when 'amateur' then 4
        else 99
      end as club_tier_order,
      case
        when nullif(regexp_replace(coalesce(t.world_tier::text, ''), '[^0-9]', '', 'g'), '') is null then null
        else nullif(regexp_replace(coalesce(t.world_tier::text, ''), '[^0-9]', '', 'g'), '')::integer
      end as world_tier_number,
      coalesce(rpt.ranking_snapshot, 999999) as current_team_rank,
      case
        when nullif(regexp_replace(coalesce(t.reputation::text, ''), '[^0-9.-]', '', 'g'), '') is null then 0
        else nullif(regexp_replace(coalesce(t.reputation::text, ''), '[^0-9.-]', '', 'g'), '')::numeric
      end as race_reputation_value
    from public.race_participant_teams_v1 t
    left join public.race_participant_teams rpt
      on rpt.race_id = t.race_id
     and rpt.team_id = coalesce(t.club_id, t.owner_club_id, t.participating_club_id)
    where t.race_id = p_race_id
      and coalesce(t.status, 'accepted') = 'accepted'
      and coalesce(t.club_id, t.owner_club_id, t.participating_club_id) is not null
  ),
  ordered_teams as (
    select at.*,
      row_number() over (
        order by
          at.club_tier_order asc,
          coalesce(at.current_team_rank, 999999) asc,
          coalesce(at.race_reputation_value, 0) desc,
          coalesce(at.world_tier_number, 999999) asc,
          lower(at.team_name) asc,
          at.team_key asc
      )::integer as team_order
    from accepted_teams at
  ),
  ranked_riders as (
    select rpr.id as participant_rider_id,
      ot.team_order,
      row_number() over (
        partition by ot.team_key
        order by
          case
            when lower(coalesce(rpr.role_snapshot, '')) in (
              'leader','team leader','team_leader','gc leader','gc_leader','captain','race captain'
            ) then 0
            when lower(coalesce(rpr.role_snapshot, '')) like '%leader%' then 0
            when lower(coalesce(rpr.role_snapshot, '')) like '%captain%' then 0
            else 1
          end asc,
          coalesce(rpr.overall_snapshot, 0) desc,
          lower(coalesce(rpr.rider_name_snapshot, '')) asc,
          rpr.rider_id asc
      )::integer as rider_order
    from public.race_participant_riders rpr
    join ordered_teams ot
      on rpr.race_id = p_race_id
     and rpr.team_id = ot.team_key
  ),
  updated as (
    update public.race_participant_riders rpr
    set start_number = ((rr.team_order - 1) * 10) + rr.rider_order
    from ranked_riders rr
    where rpr.id = rr.participant_rider_id
      and rpr.start_number is distinct from (((rr.team_order - 1) * 10) + rr.rider_order)
    returning rpr.id
  )
  select count(*)::integer into v_updated_count from updated;

  return coalesce(v_updated_count, 0);
end;
$function$;

CREATE OR REPLACE FUNCTION public.process_due_race_startlist_captain_finalizations_v1(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_game_at timestamp without time zone;
  v_race record;
  v_result jsonb;
  v_checked integer := 0;
  v_finalized integer := 0;
  v_failed integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  v_current_game_at := public.get_current_game_timestamp()::timestamp without time zone;

  for v_race in
    select race.id as race_id,
           race.name as race_name,
           coalesce(
             rules.rider_submission_deadline_game_at,
             coalesce(
               rules.rider_submission_deadline::date,
               make_date(
                 1999 + rules.rider_submission_deadline_season_number::integer,
                 rules.rider_submission_deadline_month_number::integer,
                 rules.rider_submission_deadline_day_number::integer
               ),
               race.start_date::date - 3
             )::timestamp
           ) as rider_deadline_game_at,
           coalesce(
             (select rs.stage_date::timestamp + make_interval(
                hours => coalesce(rs.planned_start_hour_number, race.planned_start_hour_number, 12),
                mins => coalesce(rs.planned_start_minute, race.planned_start_minute, 0)
              )
              from public.race_stages rs
              where rs.race_id = race.id
              order by rs.stage_number
              limit 1),
             race.start_date::timestamp + make_interval(
               hours => coalesce(race.planned_start_hour_number, 12),
               mins => coalesce(race.planned_start_minute, 0)
             )
           ) as stage1_start_game_at
    from public.races race
    join public.race_entry_rules rules on rules.race_id = race.id
    where race.status in ('scheduled','active')
      and lower(coalesce(race.metadata->>'team_list_announcement_finalized','false')) in ('true','1','yes')
      and v_current_game_at >= coalesce(
        rules.rider_submission_deadline_game_at,
        coalesce(
          rules.rider_submission_deadline::date,
          make_date(
            1999 + rules.rider_submission_deadline_season_number::integer,
            rules.rider_submission_deadline_month_number::integer,
            rules.rider_submission_deadline_day_number::integer
          ),
          race.start_date::date - 3
        )::timestamp
      )
      and lower(coalesce(race.metadata->>'race_startlist_captains_finalized','false')) not in ('true','1','yes')
      and (
        v_current_game_at < coalesce(
          (select rs.stage_date::timestamp + make_interval(
             hours => coalesce(rs.planned_start_hour_number, race.planned_start_hour_number, 12),
             mins => coalesce(rs.planned_start_minute, race.planned_start_minute, 0)
           )
           from public.race_stages rs
           where rs.race_id = race.id
           order by rs.stage_number
           limit 1),
          race.start_date::timestamp + make_interval(
            hours => coalesce(race.planned_start_hour_number, 12),
            mins => coalesce(race.planned_start_minute, 0)
          )
        )
        or (
          not exists (
            select 1
            from public.race_stages rs
            join public.race_stage_authoritative_runs ar on ar.stage_id = rs.id
            where rs.race_id = race.id
          )
          and not exists (
            select 1
            from public.race_stages rs
            join public.race_stage_results rr on rr.stage_id = rs.id
            where rs.race_id = race.id
          )
          and not exists (
            select 1
            from public.race_stages rs
            join public.race_stage_simulation_runs sr on sr.stage_id = rs.id
            where rs.race_id = race.id
              and sr.status in ('running','completed')
          )
        )
      )
    order by race.start_date, race.name
    limit greatest(coalesce(p_limit,20),1)
  loop
    v_checked := v_checked + 1;
    begin
      select public.finalize_race_startlist_captains_v1(v_race.race_id) into v_result;
      v_finalized := v_finalized + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'race_id', v_race.race_id,
        'race_name', v_race.race_name,
        'rider_deadline_game_at', v_race.rider_deadline_game_at,
        'stage1_start_game_at', v_race.stage1_start_game_at,
        'status', 'finalized',
        'result', v_result
      ));
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'race_id', v_race.race_id,
        'race_name', v_race.race_name,
        'rider_deadline_game_at', v_race.rider_deadline_game_at,
        'stage1_start_game_at', v_race.stage1_start_game_at,
        'status', 'failed',
        'error', sqlerrm,
        'will_retry', true
      ));
    end;
  end loop;

  return jsonb_build_object(
    'success', v_failed = 0,
    'current_game_at', v_current_game_at,
    'checked_races', v_checked,
    'finalized_races', v_finalized,
    'failed_races', v_failed,
    'results', v_results
  );
end;
$function$;
