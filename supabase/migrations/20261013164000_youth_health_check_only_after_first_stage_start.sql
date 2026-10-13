-- Avoid false race-day lineup incidents before the scheduled start.
-- Uses the same first-stage due condition as process_due_youth_race_runtime_v2.
CREATE OR REPLACE FUNCTION public.monitor_youth_competition_health_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  gd date:=public.get_current_game_date_date();
  below_target integer:=0;
  missing_runtime integer:=0;
  cold_races integer:=0;
  pending_past_deadline integer:=0;
  accepted_without_entry integer:=0;
  due_today_without_lineup integer:=0;
  world_count integer:=0;
  west_count integer:=0;
  east_count integer:=0;
  issues integer:=0;
  details jsonb;
begin
  select count(*) into below_target
  from public.youth_races r
  where r.status='scheduled'
    and r.race_date>gd and r.race_date<=gd+7
    and (
      select count(*) from public.youth_race_entries e
      where e.race_id=r.id and e.status in ('entered','completed')
    )<coalesce(r.target_teams,6);

  select count(*) into missing_runtime
  from public.youth_races r
  where r.status='scheduled'
    and r.race_date>=gd and r.race_date<=gd+14
    and (
      not exists(select 1 from public.youth_race_stages s where s.race_id=r.id)
      or exists(
        select 1 from public.youth_race_stages s
        where s.race_id=r.id and (
          s.planned_start_hour_number is null
          or s.start_city is null
          or s.finish_city is null
        )
      )
    );

  select count(*) into cold_races
  from public.youth_races r
  where r.status='scheduled' and r.race_date>gd
    and not private.youth_race_city_weather_eligible_v9(
      r.host_country_code,r.host_city,r.race_date,coalesce(r.race_end_date,r.race_date)
    );

  select count(*) into pending_past_deadline
  from public.youth_race_invitations i
  join public.youth_races r on r.id=i.race_id
  join public.youth_academies a on a.id=i.academy_id
  where not a.is_ai
    and r.status='scheduled'
    and i.status='pending'
    and i.response_deadline<gd
    and (
      coalesce((i.metadata->>'manual_manager_application')::boolean,false)
      or coalesce((i.metadata->>'staff_application')::boolean,false)
    );

  select count(*) into accepted_without_entry
  from public.youth_race_invitations i
  join public.youth_races r on r.id=i.race_id
  where r.status='scheduled'
    and i.status='accepted'
    and not exists(
      select 1 from public.youth_race_entries e
      where e.race_id=i.race_id and e.academy_id=i.academy_id
        and e.status in ('entered','completed')
    );

  select count(*) into due_today_without_lineup
  from public.youth_race_entries e
  join public.youth_races r on r.id=e.race_id
  where e.status='entered' and r.status='scheduled' and r.race_date<=gd
    -- Evaluate missing lineups only once the stage-one start is actually due.
    -- This must mirror process_due_youth_race_runtime_v2; otherwise the
    -- health watchdog raises false incidents on the morning of a race.
    and exists (
      select 1 from public.youth_race_stages first_stage
      where first_stage.race_id=r.id and first_stage.stage_number=1
        and first_stage.status='scheduled'
        and first_stage.stage_date::timestamp
          + make_interval(
              hours=>coalesce(first_stage.planned_start_hour_number,12),
              mins=>coalesce(first_stage.planned_start_minute,0)
            ) <= public.get_current_game_timestamp()::timestamp
    )
    -- Once a multi-day event has started, missing lineups for non-participating
    -- entrants are historical eligibility, not an unprepared future start.
    and not exists (
      select 1 from public.youth_race_stages s
      where s.race_id=r.id and s.status='completed'
    )
    and (select count(*) from public.youth_race_lineups l where l.entry_id=e.id)<3;

  select count(*) into world_count
  from public.youth_academy_competition_memberships
  where season_number=public.get_current_season_number() and competition_class='world';

  select count(*) into west_count
  from public.youth_academy_competition_memberships
  where season_number=public.get_current_season_number() and division_code='CONTINENTAL_WEST';

  select count(*) into east_count
  from public.youth_academy_competition_memberships
  where season_number=public.get_current_season_number() and division_code='CONTINENTAL_EAST';

  -- Below-target races are informational until the first-stage cutoff;
  -- the runtime safely cancels them if the minimum is still unmet.
  issues:=missing_runtime+cold_races+pending_past_deadline+
          accepted_without_entry+due_today_without_lineup+
          (case when world_count<>16 then 1 else 0 end)+
          (case when west_count<>20 then 1 else 0 end)+
          (case when east_count<>20 then 1 else 0 end);

  details:=jsonb_build_object(
    'below_target_within_7_days',below_target,
    'missing_runtime_within_14_days',missing_runtime,
    'races_below_city_climate_rule',cold_races,
    'human_applications_past_decision_deadline',pending_past_deadline,
    'accepted_invitations_without_entry',accepted_without_entry,
    'race_day_entries_without_minimum_lineup',due_today_without_lineup,
    'world_teams',world_count,
    'continental_west_teams',west_count,
    'continental_east_teams',east_count,
    'game_date',gd
  );

  return private.youth_watchdog_finish_v1(
    'check:youth_competition',
    issues,
    'high',
    'Youth Academy competition requires attention',
    format('Youth competition integrity found %s problem record(s).',issues),
    'Youth Academy competition, applications, climate, race runtime and hierarchy are healthy.',
    details
  );
end;
$function$

