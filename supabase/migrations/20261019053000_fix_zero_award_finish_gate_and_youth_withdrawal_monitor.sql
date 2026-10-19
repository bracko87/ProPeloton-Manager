-- Repair National Championship publication while preserving the winner-integrity gate.
-- Qualification/final FINISH gates may intentionally award zero points and zero bonuses.
-- Always persist the rank-one winner's FINISH record with zero awards when necessary.
-- No previously published race results, stage outcomes or payments are updated.
CREATE OR REPLACE FUNCTION private.reconcile_stage_after_attrition_v1(p_stage_id uuid, p_french_tour_repair boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'public'
AS $function$
DECLARE
  v_race_id uuid;
  v_race_start date;
  v_cancelled boolean;
  v_first_before uuid;
  v_first_after uuid;
  v_results integer;
  v_gate_winners integer;
  v_changed integer := 0;
  v_mode text;
BEGIN
  SELECT s.race_id, r.start_date, coalesce(s.weather_cancelled,false)
  INTO v_race_id, v_race_start, v_cancelled
  FROM public.race_stages s JOIN public.races r ON r.id=s.race_id
  WHERE s.id=p_stage_id;
  IF v_race_id IS NULL THEN
    RAISE EXCEPTION 'stage winner reconciliation: unknown stage %',p_stage_id;
  END IF;
  IF p_french_tour_repair THEN
    IF v_race_id <> '2e00ce94-a6bc-4b85-b77c-78758b5b7d68'::uuid THEN
      RAISE EXCEPTION 'Historic repair allowed only for French Tour 2000';
    END IF;
    v_mode := 'french_tour_historical';
  ELSE
    -- Race-start cutoff, not stage-date cutoff. Other already-started tours stay untouched.
    IF v_race_start < date '2000-08-03' THEN
      RETURN jsonb_build_object('status','out_of_scope','stage_id',p_stage_id);
    END IF;
    IF EXISTS (SELECT 1 FROM public.race_stage_authoritative_runs
               WHERE stage_id=p_stage_id) THEN
      RAISE EXCEPTION 'Refusing to rewrite a previously published future stage %',p_stage_id;
    END IF;
    v_mode := 'new_races_only';
  END IF;
  IF v_cancelled THEN
    RETURN jsonb_build_object('status','weather_cancelled','stage_id',p_stage_id);
  END IF;
  SELECT count(*) INTO v_results
  FROM public.race_stage_results
  WHERE stage_id=p_stage_id AND status='finished';
  IF v_results=0 THEN
    RAISE EXCEPTION 'Stage % cannot publish: no eligible finishers',p_stage_id;
  END IF;

  -- The original simulation may have ranked a DNS/DNF rider first.
  -- Work exclusively from persisted, attrition-guarded official result rows.
  SELECT rider_id INTO v_first_before
  FROM public.race_stage_point_results point
  JOIN public.race_stage_points gate ON gate.id=point.point_id
  WHERE point.stage_id=p_stage_id AND gate.point_type='FINISH'
    AND point.rank=1 LIMIT 1;

  PERFORM set_config('app.race_engine_writer_family','typescript',true);
  WITH eligible AS (
    SELECT sr.id,
           row_number() OVER (ORDER BY sr.rank NULLS LAST,
                 sr.elapsed_seconds NULLS LAST,sr.rider_id)::integer AS new_rank,
           min(sr.elapsed_seconds) OVER () AS best_seconds
    FROM public.race_stage_results sr
    WHERE sr.stage_id=p_stage_id AND sr.status='finished'
  )
  UPDATE public.race_stage_results sr
  SET rank=e.new_rank,
      gap_seconds=CASE WHEN p_french_tour_repair THEN sr.gap_seconds
                  ELSE greatest(0,coalesce(sr.elapsed_seconds, e.best_seconds)-e.best_seconds) END
  FROM eligible e
  WHERE sr.id=e.id
    AND (sr.rank IS DISTINCT FROM e.new_rank
      OR (NOT p_french_tour_repair AND sr.gap_seconds IS DISTINCT FROM
           greatest(0,coalesce(sr.elapsed_seconds,e.best_seconds)-e.best_seconds)));
  GET DIAGNOSTICS v_changed=ROW_COUNT;

  -- Official finish gates are entirely rebuilt from eligible finishers.
  -- Do not rely on the raw simulation's pre-attrition winner.
  DELETE FROM public.race_stage_point_results pr
  USING public.race_stage_points gate
  WHERE pr.point_id=gate.id AND pr.stage_id=p_stage_id
    AND gate.point_type='FINISH';

  INSERT INTO public.race_stage_point_results
    (race_id,stage_id,point_id,rider_id,team_id,rank,
     points_awarded,bonus_seconds_awarded,rider_name_snapshot,team_name_snapshot)
  SELECT sr.race_id,sr.stage_id,gate.id,sr.rider_id,sr.team_id,sr.rank,
    coalesce((gate.points_scheme ->> (sr.rank-1))::integer,0),
    coalesce((gate.time_bonus_seconds ->> (sr.rank-1))::integer,0),
    sr.rider_name_snapshot,sr.team_name_snapshot
  FROM public.race_stage_results sr
  JOIN public.race_stage_points gate ON gate.stage_id=sr.stage_id
     AND gate.point_type='FINISH'
  WHERE sr.stage_id=p_stage_id AND sr.status='finished'
    AND (sr.rank=1
      OR coalesce((gate.points_scheme ->> (sr.rank-1))::integer,0)<>0
      OR coalesce((gate.time_bonus_seconds ->> (sr.rank-1))::integer,0)<>0)
  ON CONFLICT (point_id,rider_id) DO UPDATE SET
     rank=excluded.rank,
     points_awarded=excluded.points_awarded,
     bonus_seconds_awarded=excluded.bonus_seconds_awarded,
     rider_name_snapshot=excluded.rider_name_snapshot,
     team_name_snapshot=excluded.team_name_snapshot;

  IF NOT p_french_tour_repair THEN
    -- DNS riders cannot earn intermediate points on a stage they did not start.
    DELETE FROM public.race_stage_point_results pr
    USING public.race_stage_results sr, public.race_stage_points gate
    WHERE pr.stage_id=p_stage_id AND pr.rider_id=sr.rider_id
      AND sr.stage_id=p_stage_id AND sr.status='dns'
      AND gate.id=pr.point_id AND gate.point_type<>'FINISH';

    -- Preserve intermediate sporting order among riders who actually started.
    WITH eligible_gates AS (
      SELECT pr.id,gate.points_scheme,gate.time_bonus_seconds,
        row_number() OVER (PARTITION BY pr.point_id ORDER BY pr.rank,pr.rider_id)::integer AS new_rank
      FROM public.race_stage_point_results pr
      JOIN public.race_stage_points gate ON gate.id=pr.point_id
      WHERE pr.stage_id=p_stage_id AND gate.point_type<>'FINISH'
    )
    UPDATE public.race_stage_point_results pr
    SET rank=e.new_rank,
        points_awarded=coalesce((e.points_scheme ->> (e.new_rank-1))::integer,0),
        bonus_seconds_awarded=coalesce((e.time_bonus_seconds ->> (e.new_rank-1))::integer,0)
    FROM eligible_gates e WHERE e.id=pr.id;

    -- Classifications and awards run after this trigger in the same transaction.
    WITH scores AS (
      SELECT sr.id,
        coalesce(sum(pr.points_awarded) FILTER (WHERE gate.point_type='FINISH'),0)::integer AS finish_pts,
        coalesce(sum(pr.points_awarded) FILTER (WHERE gate.point_type IN ('INTERMEDIATE_SPRINT','BONUS_SPRINT','SPRINT')),0)::integer AS sprint_pts,
        coalesce(sum(pr.points_awarded) FILTER (WHERE gate.point_type='KOM'),0)::integer AS kom_pts,
        coalesce(sum(pr.bonus_seconds_awarded),0)::integer AS bonus_s
      FROM public.race_stage_results sr
      LEFT JOIN public.race_stage_point_results pr
        ON pr.stage_id=sr.stage_id AND pr.rider_id=sr.rider_id
      LEFT JOIN public.race_stage_points gate ON gate.id=pr.point_id
      WHERE sr.stage_id=p_stage_id AND sr.status='finished'
      GROUP BY sr.id
    )
    UPDATE public.race_stage_results sr
    SET finish_points=score.finish_pts,
        sprint_points=score.sprint_pts,
        mountain_points=score.kom_pts,
        bonus_seconds=score.bonus_s
    FROM scores score WHERE sr.id=score.id
      AND (sr.finish_points,sr.sprint_points,sr.mountain_points,sr.bonus_seconds)
        IS DISTINCT FROM
        (score.finish_pts,score.sprint_pts,score.kom_pts,score.bonus_s);
  END IF;

  SELECT rider_id INTO v_first_after FROM public.race_stage_results
  WHERE stage_id=p_stage_id AND status='finished' AND rank=1;
  IF v_first_after IS NULL THEN
    RAISE EXCEPTION 'Stage % has no eligible official winner',p_stage_id;
  END IF;
  SELECT count(*) INTO v_gate_winners
  FROM public.race_stage_point_results pr
  JOIN public.race_stage_points gate ON gate.id=pr.point_id
  WHERE pr.stage_id=p_stage_id AND gate.point_type='FINISH'
    AND pr.rank=1 AND pr.rider_id=v_first_after;
  IF v_gate_winners<>1 OR
    (SELECT count(*) FROM public.race_stage_results
     WHERE stage_id=p_stage_id AND status='finished' AND rank=1)<>1
  THEN
    RAISE EXCEPTION 'Stage % inconsistent winner/finish gate; publication blocked',p_stage_id;
  END IF;

  -- Stage-finish report must not continue announcing an eliminated rider.
  UPDATE public.race_stage_report_events evt
  SET rider_id=winner.rider_id,team_id=winner.team_id,
      rider_name_snapshot=winner.rider_name_snapshot,
      team_name_snapshot=winner.team_name_snapshot,
      title='Stage finished',
      description=winner.rider_name_snapshot || ' wins the stage.',
      metadata=coalesce(evt.metadata,'{}'::jsonb)
        || jsonb_build_object('stage_winner_reconciled','attrition_v1'),
      updated_at=clock_timestamp()
  FROM public.race_stage_results winner
  WHERE evt.stage_id=p_stage_id AND evt.event_type='finish'
    AND winner.stage_id=p_stage_id AND winner.status='finished' AND winner.rank=1
    AND (evt.rider_id IS DISTINCT FROM winner.rider_id
       OR evt.rider_name_snapshot IS DISTINCT FROM winner.rider_name_snapshot);

  IF v_first_before IS DISTINCT FROM v_first_after OR v_changed>0 THEN
    INSERT INTO private.race_winner_reconciliation_audit_v1
      (race_id,stage_id,scope,old_rank_one_rider_id,repaired_rank_one_rider_id)
    VALUES (v_race_id,p_stage_id,v_mode,v_first_before,v_first_after);
  END IF;
  RETURN jsonb_build_object('status','reconciled','mode',v_mode,'stage_id',p_stage_id,
    'winner_rider_id',v_first_after,'old_winner_rider_id',v_first_before,
    'renumbered_finishers',v_changed,'finish_gate_winners',v_gate_winners);
END;
$function$;
-- Keep the accepted invitation history when a youth team's race entry was
-- subsequently withdrawn. Withdrawals are not missing active race entries.
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
    )
    -- A manager/AI team can legitimately accept an invitation and later withdraw.
    -- The withdrawal remains historical and must not be reported as an orphaned acceptance.
    and not exists(
      select 1 from public.youth_race_entries e
      where e.race_id=i.race_id and e.academy_id=i.academy_id
        and e.status='withdrawn'
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
$function$;
