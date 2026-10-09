-- Individual-only National Championship races deliberately model each rider
-- as one participant unit (team_id = rider_id) and have no race_team_entries.
-- Make the generic race-engine readiness contract understand that representation
-- while preserving the existing team-race path unchanged.

create or replace function public.race_startlist_engine_readiness_v1(
  p_race_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_current_game_at timestamp without time zone;
  v_team_list_finalized boolean := false;
  v_rider_deadline timestamp without time zone;
  v_min_teams integer := 0;
  v_min_riders integer := 0;
  v_max_riders integer := 999;
  v_eligible_teams integer := 0;
  v_missing_team_snapshots integer := 0;
  v_invalid_rider_sizes integer := 0;
  v_missing_start_numbers integer := 0;
  v_invalid_captains integer := 0;
  v_unexpected_rider_teams integer := 0;
  v_individual_only boolean := false;
  v_ready boolean := false;
  v_reason text := 'unknown';
begin
  if p_race_id is null then
    return jsonb_build_object('ready',false,'reason','race_id_required');
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  select
    lower(coalesce(r.metadata->>'team_list_announcement_finalized','false')) in ('true','1','yes'),
    coalesce(
      rules.rider_submission_deadline_game_at,
      coalesce(
        rules.rider_submission_deadline::date,
        make_date(
          1999 + rules.rider_submission_deadline_season_number::integer,
          rules.rider_submission_deadline_month_number::integer,
          rules.rider_submission_deadline_day_number::integer
        ),
        r.start_date::date - 3
      )::timestamp
    ),
    coalesce(rules.min_teams,0),
    coalesce(rules.min_riders_per_team,0),
    coalesce(rules.max_riders_per_team,999),
    lower(coalesce(r.metadata->>'individual_only','false')) in ('true','1','yes')
  into
    v_team_list_finalized,
    v_rider_deadline,
    v_min_teams,
    v_min_riders,
    v_max_riders,
    v_individual_only
  from public.races r
  join public.race_entry_rules rules on rules.race_id=r.id
  where r.id=p_race_id;

  if not found then
    return jsonb_build_object(
      'ready',false,
      'reason','race_or_entry_rules_not_found',
      'race_id',p_race_id
    );
  end if;

  if v_individual_only then
    with per_participant_unit as (
      select
        coalesce(r.team_id,r.rider_id) as team_id,
        count(r.rider_id)::integer as rider_count,
        count(r.rider_id) filter (
          where public.race_role_is_captain_v1(r.role_snapshot)
        )::integer as captain_count,
        min(r.start_number) as first_team_start_number,
        min(r.start_number) filter (
          where public.race_role_is_captain_v1(r.role_snapshot)
        ) as captain_start_number,
        count(r.rider_id) filter (
          where r.start_number is null
        )::integer as missing_numbers
      from public.race_participant_riders r
      where r.race_id=p_race_id
      group by coalesce(r.team_id,r.rider_id)
    )
    select
      count(*)::integer,
      0::integer,
      count(*) filter (
        where rider_count < v_min_riders
           or rider_count > v_max_riders
      )::integer,
      coalesce(sum(missing_numbers),0)::integer,
      count(*) filter (
        where captain_count <> 1
           or captain_start_number is distinct from first_team_start_number
      )::integer,
      0::integer
    into
      v_eligible_teams,
      v_missing_team_snapshots,
      v_invalid_rider_sizes,
      v_missing_start_numbers,
      v_invalid_captains,
      v_unexpected_rider_teams
    from per_participant_unit;
  else
    with eligible as (
      select distinct coalesce(e.participating_club_id,e.club_id) as team_id
      from public.race_team_entries e
      left join lateral (
        select p.status,p.startlist_status
        from public.race_preparations p
        where p.race_id=e.race_id
          and p.club_id=e.club_id
        order by p.updated_at desc nulls last,p.id desc
        limit 1
      ) latest_preparation on true
      where e.race_id=p_race_id
        and e.status in ('accepted','confirmed')
        and e.missed_startlist_at is null
        and coalesce(latest_preparation.status,'') <> 'missed_startlist'
        and coalesce(latest_preparation.startlist_status,'') <> 'missed_startlist'
        and coalesce(e.participating_club_id,e.club_id) is not null
    ),
    per_team as (
      select
        e.team_id,
        count(r.rider_id)::integer as rider_count,
        count(r.rider_id) filter (
          where public.race_role_is_captain_v1(r.role_snapshot)
        )::integer as captain_count,
        min(r.start_number) as first_team_start_number,
        min(r.start_number) filter (
          where public.race_role_is_captain_v1(r.role_snapshot)
        ) as captain_start_number,
        count(r.rider_id) filter (
          where r.start_number is null
        )::integer as missing_numbers
      from eligible e
      left join public.race_participant_riders r
        on r.race_id=p_race_id
       and r.team_id=e.team_id
      group by e.team_id
    ),
    counts as (
      select
        (select count(*)::integer from eligible) as eligible_teams,
        (
          select count(*)::integer
          from eligible e
          where not exists (
            select 1
            from public.race_participant_teams_v1 t
            where t.race_id=p_race_id
              and lower(coalesce(t.status,'accepted'))='accepted'
              and t.club_id=e.team_id
          )
        ) as missing_team_snapshots,
        (
          select count(*)::integer
          from per_team
          where rider_count < v_min_riders
             or rider_count > v_max_riders
        ) as invalid_rider_sizes,
        (
          select coalesce(sum(missing_numbers),0)::integer
          from per_team
        ) as missing_start_numbers,
        (
          select count(*)::integer
          from per_team
          where captain_count <> 1
             or captain_start_number is distinct from first_team_start_number
        ) as invalid_captains,
        (
          select count(distinct r.team_id)::integer
          from public.race_participant_riders r
          where r.race_id=p_race_id
            and not exists (
              select 1
              from eligible e
              where e.team_id=r.team_id
            )
        ) as unexpected_rider_teams
    )
    select
      eligible_teams,
      missing_team_snapshots,
      invalid_rider_sizes,
      missing_start_numbers,
      invalid_captains,
      unexpected_rider_teams
    into
      v_eligible_teams,
      v_missing_team_snapshots,
      v_invalid_rider_sizes,
      v_missing_start_numbers,
      v_invalid_captains,
      v_unexpected_rider_teams
    from counts;
  end if;

  v_ready :=
    v_team_list_finalized
    and v_current_game_at >= v_rider_deadline
    and v_eligible_teams >= v_min_teams
    and v_missing_team_snapshots = 0
    and v_invalid_rider_sizes = 0
    and v_missing_start_numbers = 0
    and v_invalid_captains = 0
    and v_unexpected_rider_teams = 0;

  v_reason := case
    when not v_team_list_finalized then 'team_list_not_finalized'
    when v_current_game_at < v_rider_deadline then 'rider_deadline_not_reached'
    when v_eligible_teams < v_min_teams then 'insufficient_eligible_teams'
    when v_missing_team_snapshots > 0 then 'missing_participant_team_snapshots'
    when v_invalid_rider_sizes > 0 then 'invalid_team_rider_counts'
    when v_missing_start_numbers > 0 then 'missing_start_numbers'
    when v_invalid_captains > 0 then 'invalid_team_captains'
    when v_unexpected_rider_teams > 0 then 'unexpected_participant_rider_teams'
    else 'ready'
  end;

  return jsonb_build_object(
    'ready',v_ready,
    'reason',v_reason,
    'race_id',p_race_id,
    'individual_only',v_individual_only,
    'current_game_at',v_current_game_at,
    'rider_deadline_game_at',v_rider_deadline,
    'team_list_finalized',v_team_list_finalized,
    'minimum_teams',v_min_teams,
    'eligible_teams',v_eligible_teams,
    'minimum_riders_per_team',v_min_riders,
    'maximum_riders_per_team',v_max_riders,
    'missing_participant_team_snapshots',v_missing_team_snapshots,
    'invalid_team_rider_counts',v_invalid_rider_sizes,
    'missing_start_numbers',v_missing_start_numbers,
    'invalid_team_captains',v_invalid_captains,
    'unexpected_participant_rider_teams',v_unexpected_rider_teams
  );
end;
$function$;
