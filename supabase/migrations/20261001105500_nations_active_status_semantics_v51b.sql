-- Once a National Association has been activated, current eligibility/member-count changes do not remove it from World Nations. Initial activation still requires the configured minimum members.

CREATE OR REPLACE FUNCTION private.auto_enroll_national_association_in_nations_v1(p_association_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_assoc public.national_associations%rowtype;
  v_season integer;
  v_edition public.nations_competition_editions%rowtype;
  v_inserted integer:=0;
  v_today date:=public.get_current_game_date_date();
  v_lock date;
  v_rebuild jsonb:=null;
  v_schedule jsonb:=null;
  v_hosts jsonb:=null;
  v_draw jsonb:=null;
begin
  select * into v_assoc
  from public.national_associations
  where id=p_association_id;

  if v_assoc.id is null or v_assoc.status<>'active' then
    return jsonb_build_object('status','not_active');
  end if;

  select season_number into v_season
  from public.game_state where id=true;

  v_lock:=public.nations_field_lock_gate_v1(v_season);

  select * into v_edition
  from public.nations_competition_editions
  where season_number=v_season
  limit 1;

  if v_edition.id is null then
    return jsonb_build_object('status','queued_for_automatic_generation','season_number',v_season);
  end if;

  if v_today>=v_lock or v_edition.status<>'planned' then
    return jsonb_build_object(
      'status','current_draw_locked_next_season_automatic',
      'edition_id',v_edition.id,
      'season_number',v_season,
      'field_lock_gate',v_lock
    );
  end if;

  insert into public.nations_competition_entries(
    edition_id,association_id,country_code,seed_score,status
  )
  values(v_edition.id,v_assoc.id,v_assoc.country_code,0,'entered')
  on conflict(edition_id,association_id) do nothing;

  get diagnostics v_inserted=row_count;

  if v_inserted>0 then
    v_rebuild:=private.rebuild_planned_nations_structure_v1(v_edition.id);
  end if;

  v_schedule:=public.schedule_nations_edition_v1(v_edition.id);
  v_hosts:=public.assign_nations_event_hosts_v1(v_edition.id);
  v_draw:=private.sync_nations_open_field_draw_v1(v_edition.id);

  return jsonb_build_object(
    'status',case when v_inserted>0 then 'automatically_entered' else 'already_entered' end,
    'edition_id',v_edition.id,
    'season_number',v_season,
    'structure',v_rebuild,
    'schedule',v_schedule,
    'hosts',v_hosts,
    'provisional_draw',v_draw
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_nations_competition_edition_v1(p_season_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current_season integer;
  v_season integer;
  v_count integer;
  v_plan jsonb;
  v_edition_id uuid;
  v_round_json jsonb;
  v_round_id uuid;
  v_group_plan jsonb;
  v_group_json jsonb;
begin
  select season_number into v_current_season
  from public.game_state
  where id=true;

  v_season:=coalesce(p_season_number,v_current_season);

  if v_season is null or v_season<>v_current_season then
    raise exception 'World Nations edition can only be generated for the current season.';
  end if;

  if exists(
    select 1
    from public.nations_competition_editions e
    where e.season_number=v_season
  ) then
    select id into v_edition_id
    from public.nations_competition_editions
    where season_number=v_season;

    return jsonb_build_object(
      'status','existing',
      'edition_id',v_edition_id,
      'season_number',v_season
    );
  end if;

  select count(*)::integer
  into v_count
  from public.national_associations a
  where a.status='active'
;

  if v_count=0 then
    return jsonb_build_object(
      'status','not_created',
      'reason','no_active_associations',
      'season_number',v_season
    );
  end if;

  v_plan:=public.nations_qualification_plan_v1(v_count);

  insert into public.nations_competition_editions(
    season_number,status,active_association_count,finalist_target,points_curve_version
  )
  values(
    v_season,'planned',v_count,least(16,v_count),1
  )
  returning id into v_edition_id;

  insert into public.nations_competition_entries(
    edition_id,association_id,country_code,seed_score,status
  )
  select
    v_edition_id,
    a.id,
    a.country_code,
    case
      when v_season<=1 then 0
      else coalesce(
        (
          select sum(rp.points)::numeric
          from public.nations_team_ranking_points rp
          where rp.association_id=a.id
            and rp.season_number<v_season
        ),
        0
      )
    end,
    'entered'
  from public.national_associations a
  where a.status='active'

  order by
    case when v_season<=1 then 0 else coalesce((
      select sum(rp.points)
      from public.nations_team_ranking_points rp
      where rp.association_id=a.id
        and rp.season_number<v_season
    ),0) end desc,
    a.country_code;

  for v_round_json in
    select value
    from jsonb_array_elements(v_plan->'rounds')
  loop
    insert into public.nations_competition_rounds(
      edition_id,round_index,round_type,round_label,
      entrants_target,advance_target,group_count,
      group_size_min,group_size_max,status
    )
    values(
      v_edition_id,
      (v_round_json->>'round_index')::integer,
      v_round_json->>'round_type',
      v_round_json->>'round_label',
      (v_round_json->>'entrants_target')::integer,
      (v_round_json->>'advance_target')::integer,
      (v_round_json->>'group_count')::integer,
      (v_round_json->>'group_size_min')::integer,
      (v_round_json->>'group_size_max')::integer,
      'planned'
    )
    returning id into v_round_id;

    v_group_plan:=private.nations_distribute_group_counts_v1(
      (v_round_json->>'entrants_target')::integer,
      (v_round_json->>'group_count')::integer,
      case
        when v_round_json->>'round_type'='world_final'
          then (v_round_json->>'entrants_target')::integer
        else (v_round_json->>'advance_target')::integer
      end
    );

    for v_group_json in
      select value
      from jsonb_array_elements(v_group_plan)
    loop
      insert into public.nations_competition_groups(
        round_id,group_number,group_label,
        planned_entrant_count,planned_advance_count,status
      )
      values(
        v_round_id,
        (v_group_json->>'group_number')::integer,
        case
          when v_round_json->>'round_type'='world_final'
            then 'World Nations Final'
          else 'Group '||chr(64+(v_group_json->>'group_number')::integer)
        end,
        (v_group_json->>'entrant_count')::integer,
        case
          when v_round_json->>'round_type'='world_final' then 1
          else (v_group_json->>'advance_count')::integer
        end,
        'planned'
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'status','created',
    'edition_id',v_edition_id,
    'season_number',v_season,
    'active_associations',v_count,
    'plan',v_plan
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.process_nations_competition_planning_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_season integer;
  v_today date;
  v_generation_gate date;
  v_field_lock_gate date;
  v_active_count integer;
  v_create jsonb;
  v_edition_id uuid;
  v_round_id uuid;
  v_round_status text;
  v_draw jsonb:=null;
begin
  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_today
  from public.game_state gs
  where gs.id=true;

  v_generation_gate:=public.nations_generation_gate_v1(v_season);
  v_field_lock_gate:=public.nations_field_lock_gate_v1(v_season);

  if v_today<v_generation_gate then
    return jsonb_build_object(
      'status','waiting_for_january_planning',
      'season_number',v_season,
      'generation_gate',v_generation_gate,
      'field_lock_gate',v_field_lock_gate
    );
  end if;

  select count(*)::integer
  into v_active_count
  from public.national_associations a
  where a.status='active';

  if v_active_count=0 then
    return jsonb_build_object(
      'status','waiting_for_active_associations',
      'season_number',v_season,
      'generation_gate',v_generation_gate,
      'field_lock_gate',v_field_lock_gate,
      'active_associations',0
    );
  end if;

  v_create:=public.create_nations_competition_edition_v1(v_season);
  v_edition_id:=nullif(v_create->>'edition_id','')::uuid;

  if v_edition_id is null then
    select id into v_edition_id
    from public.nations_competition_editions
    where season_number=v_season
    limit 1;
  end if;

  if v_edition_id is null then
    return coalesce(v_create,'{}'::jsonb)
      || jsonb_build_object('status','edition_not_available');
  end if;

  -- Race structure, schedule and host routes can be prepared from January.
  -- The participant draw waits for the field-lock date, so Season 1 can still
  -- accept Associations until 1 June.
  if v_today>=v_field_lock_gate then
    select id,status
    into v_round_id,v_round_status
    from public.nations_competition_rounds
    where edition_id=v_edition_id
      and round_index=1
    limit 1;

    if v_round_id is not null
       and v_round_status='planned'
       and not exists(
         select 1
         from public.nations_group_entries nge
         join public.nations_competition_groups g on g.id=nge.group_id
         where g.round_id=v_round_id
       )
    then
      v_draw:=public.draw_nations_round_v1(v_round_id);

      update public.nations_competition_editions
      set status='qualification',
          updated_at=now()
      where id=v_edition_id
        and status='planned';
    end if;
  end if;

  return jsonb_build_object(
    'status',case when v_today>=v_field_lock_gate then 'ready' else 'planning_ready_field_open' end,
    'season_number',v_season,
    'generation_gate',v_generation_gate,
    'field_lock_gate',v_field_lock_gate,
    'edition_id',v_edition_id,
    'active_associations',v_active_count,
    'edition_creation',v_create,
    'first_round_draw',v_draw
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.check_nations_operations_health_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date := public.get_current_game_date_date();
  v_season integer;
  v_generation_gate date;
  v_active_associations integer := 0;
  v_edition_id uuid;
  v_unscheduled integer := 0;
  v_drawn_empty integer := 0;
  v_overdue_events integer := 0;
  v_bad_squads integer := 0;
  v_bad_lineups integer := 0;
  v_lineup_blocked integer := 0;
  v_unsafe_races integer := 0;
  v_issue_count integer := 0;
  v_details jsonb;
  v_summary text;
begin
  select season_number into v_season
  from public.game_state
  where id = true;

  v_generation_gate := public.nations_generation_gate_v1(v_season);

  select count(*)::integer
  into v_active_associations
  from public.national_associations a
  where a.status = 'active';

  select id into v_edition_id
  from public.nations_competition_editions
  where season_number = v_season
  limit 1;

  if v_edition_id is not null then
    select count(*)::integer
    into v_unscheduled
    from public.nations_competition_groups g
    join public.nations_competition_rounds r on r.id = g.round_id
    where r.edition_id = v_edition_id
      and (
        r.starts_on_game_date is null
        or r.ends_on_game_date is null
        or (
          select count(*)
          from public.nations_group_events e
          where e.group_id = g.id
            and e.event_date is not null
        ) <> 3
      );

    select count(*)::integer
    into v_drawn_empty
    from public.nations_competition_groups g
    join public.nations_competition_rounds r on r.id = g.round_id
    where r.edition_id = v_edition_id
      and r.status in ('drawn', 'active', 'in_progress')
      and g.status in ('drawn', 'active', 'in_progress')
      and not exists (
        select 1
        from public.nations_group_entries nge
        where nge.group_id = g.id
      );

    select count(*)::integer
    into v_overdue_events
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id = e.group_id
    join public.nations_competition_rounds r on r.id = g.round_id
    where r.edition_id = v_edition_id
      and e.event_date < v_today
      and e.status in ('planned', 'scheduled', 'ready', 'waiting_for_lineups');

    select count(*)::integer
    into v_lineup_blocked
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id = e.group_id
    join public.nations_competition_rounds r on r.id = g.round_id
    where r.edition_id = v_edition_id
      and e.event_date between v_today and v_today + 3
      and e.status not in ('completed', 'cancelled', 'running')
      and (
        e.race_id is null
        or (
          select count(*)
          from (
            select rpr.team_id
            from public.race_participant_riders rpr
            where rpr.race_id = e.race_id
              and rpr.team_id is not null
            group by rpr.team_id
            having count(*) = 7
          ) ready_teams
        ) < (
          select count(*)
          from public.nations_group_entries nge
          where nge.group_id = e.group_id
            and nge.status <> 'withdrawn'
        )
      );

    select count(*)::integer
    into v_unsafe_races
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id = e.group_id
    join public.nations_competition_rounds r on r.id = g.round_id
    join public.races rr on rr.id = e.race_id
    where r.edition_id = v_edition_id
      and rr.status in ('scheduled', 'active')
      and e.status not in ('completed', 'cancelled', 'running')
      and (
        select count(*)
        from (
          select rpr.team_id
          from public.race_participant_riders rpr
          where rpr.race_id = e.race_id
            and rpr.team_id is not null
          group by rpr.team_id
          having count(*) = 7
        ) ready_teams
      ) < (
        select count(*)
        from public.nations_group_entries nge
        where nge.group_id = e.group_id
          and nge.status <> 'withdrawn'
      );
  end if;

  select count(*)::integer
  into v_bad_squads
  from public.national_team_squads s
  where s.season_number = v_season
    and s.cycle_key like 'nations:%'
    and s.status in ('confirmed', 'on_duty')
    and (
      select count(*)
      from public.national_team_squad_members sm
      where sm.squad_id = s.id
    ) <> 10;

  select count(*)::integer
  into v_bad_lineups
  from public.national_team_lineups l
  join public.national_team_squads s on s.id = l.squad_id
  where s.season_number = v_season
    and s.cycle_key like 'nations:%'
    and l.status in ('confirmed', 'locked', 'completed')
    and (
      select count(*)
      from public.national_team_lineup_members lm
      where lm.lineup_id = l.id
    ) <> 7;

  v_issue_count :=
    case
      when v_today >= v_generation_gate
       and v_active_associations > 0
       and v_edition_id is null
      then 1
      else 0
    end
    + v_unscheduled
    + v_drawn_empty
    + v_overdue_events
    + v_bad_squads
    + v_bad_lineups
    + v_lineup_blocked
    + v_unsafe_races;

  v_details := jsonb_build_object(
    'game_date', v_today,
    'season_number', v_season,
    'generation_gate', v_generation_gate,
    'season1_delayed_launch', v_season = 1,
    'active_associations', v_active_associations,
    'edition_id', v_edition_id,
    'edition_missing_after_gate',
      v_today >= v_generation_gate
      and v_active_associations > 0
      and v_edition_id is null,
    'unscheduled_groups', v_unscheduled,
    'drawn_groups_without_entries', v_drawn_empty,
    'overdue_events', v_overdue_events,
    'invalid_confirmed_squads', v_bad_squads,
    'invalid_lineups', v_bad_lineups,
    'lineup_blocked_events_next_3_days', v_lineup_blocked,
    'unsafe_scheduled_events', v_unsafe_races
  );

  v_summary := case
    when v_issue_count = 0 then
      case
        when v_today < v_generation_gate and v_season = 1
          then 'World Nations operations are healthy; Season 1 generation is intentionally waiting for the June launch window.'
        when v_today < v_generation_gate
          then 'World Nations operations are healthy; seasonal generation is waiting for the January election window.'
        when v_active_associations = 0
          then 'World Nations operations are healthy; no active National Associations currently exist.'
        else 'World Nations operations are healthy.'
      end
    else format('%s World Nations operational issue(s) detected.', v_issue_count)
  end;

  perform public.log_system_business_check_v1(
    'check:nations_operations',
    case when v_issue_count > 0 then 'error' else 'success' end,
    v_summary,
    v_details
  );

  if v_issue_count > 0 then
    perform public.raise_system_incident_v1(
      'check:nations_operations',
      'critical',
      'World Nations operations require attention',
      v_summary,
      'business:nations-operations',
      v_details
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      'business:nations-operations',
      'World Nations operations are healthy.'
    );
  end if;

  return jsonb_build_object(
    'status', case when v_issue_count > 0 then 'error' else 'success' end,
    'issues', v_issue_count,
    'summary', v_summary,
    'details', v_details
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_nations_competition_overview_v1(p_season_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_current_season integer;
  v_season integer;
  v_today date;
  v_edition public.nations_competition_editions%rowtype;
  v_active_count integer := 0;
  v_my_association_id uuid;
  v_my_membership_id uuid;
  v_is_coach boolean := false;
  v_my_host_application jsonb := null;
  v_plan jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number, gs.month_number, gs.day_number)
  into v_current_season, v_today
  from public.game_state gs
  where gs.id = true;

  v_season := coalesce(p_season_number, v_current_season);

  select count(*)::integer
  into v_active_count
  from public.national_associations a
  where a.status = 'active';

  select m.association_id, m.id
  into v_my_association_id, v_my_membership_id
  from public.national_association_memberships m
  join public.national_associations a on a.id = m.association_id
  where m.user_id = v_uid
    and m.status = 'active'
    and a.status = 'active'
    and private.national_association_member_is_eligible_v1(m.association_id, v_uid)
  order by m.created_at desc
  limit 1;

  select exists(
    select 1
    from public.national_coach_terms t
    where t.association_id = v_my_association_id
      and t.membership_id = v_my_membership_id
      and t.user_id = v_uid
      and t.status = 'active'
      and t.season_number = v_current_season
  )
  into v_is_coach;

  select *
  into v_edition
  from public.nations_competition_editions e
  where e.season_number = v_season
  limit 1;

  v_plan := public.nations_qualification_plan_v1(
    case
      when v_edition.id is not null then v_edition.active_association_count
      when v_season = v_current_season then v_active_count
      else 0
    end
  );

  if v_edition.id is not null
     and v_my_association_id is not null then
    select jsonb_build_object(
      'id', h.id,
      'status', h.status,
      'statement', h.statement,
      'submitted_on', h.submitted_on_game_date
    )
    into v_my_host_application
    from public.nations_host_applications h
    where h.edition_id = v_edition.id
      and h.association_id = v_my_association_id
    limit 1;
  end if;

  return jsonb_build_object(
    'season_number', v_season,
    'current_season_number', v_current_season,
    'current_game_date', v_today,
    'active_association_count', v_active_count,
    'qualification_plan', v_plan,
    'viewer', jsonb_build_object(
      'association_id', v_my_association_id,
      'is_member', v_my_association_id is not null,
      'is_national_coach', v_is_coach,
      'can_apply_to_host',
        v_is_coach
        and v_edition.id is not null
        and v_edition.season_number = v_current_season
        and v_edition.status in ('planned','qualification'),
      'host_application', v_my_host_application
    ),
    'edition',
      case
        when v_edition.id is null then null
        else jsonb_build_object(
          'id', v_edition.id,
          'competition_name', v_edition.competition_name,
          'status', v_edition.status,
          'active_association_count', v_edition.active_association_count,
          'finalist_target', v_edition.finalist_target,
          'points_curve_version', v_edition.points_curve_version,
          'host_association_id', v_edition.host_association_id,
          'host_country_code', v_edition.host_country_code,
          'champion_association_id', v_edition.champion_association_id,
          'champion_country_code', v_edition.champion_country_code,
          'created_on_game_date', v_edition.created_on_game_date,
          'completed_on_game_date', v_edition.completed_on_game_date
        )
      end,
    'rounds',
      case
        when v_edition.id is null then '[]'::jsonb
        else coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', r.id,
              'round_index', r.round_index,
              'round_type', r.round_type,
              'round_label', r.round_label,
              'entrants_target', r.entrants_target,
              'advance_target', r.advance_target,
              'group_count', r.group_count,
              'group_size_min', r.group_size_min,
              'group_size_max', r.group_size_max,
              'status', r.status,
              'starts_on_game_date', r.starts_on_game_date,
              'ends_on_game_date', r.ends_on_game_date,
              'groups', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'id', g.id,
                    'group_number', g.group_number,
                    'group_label', g.group_label,
                    'planned_entrant_count', g.planned_entrant_count,
                    'planned_advance_count', g.planned_advance_count,
                    'status', g.status,
                    'entries', coalesce((
                      select jsonb_agg(
                        jsonb_build_object(
                          'group_entry_id', nge.id,
                          'competition_entry_id', ce.id,
                          'association_id', ce.association_id,
                          'association_name', a.name,
                          'country_code', ce.country_code,
                          'seed_position', nge.seed_position,
                          'final_group_rank', nge.final_group_rank,
                          'total_points', nge.total_points,
                          'ttt_points', nge.ttt_points,
                          'flat_points', nge.flat_points,
                          'mountain_points', nge.mountain_points,
                          'race_wins', nge.race_wins,
                          'podium_finishes', nge.podium_finishes,
                          'ttt_rank', nge.ttt_rank,
                          'best_day3_rider_rank', nge.best_day3_rider_rank,
                          'status', nge.status
                        )
                        order by
                          nge.final_group_rank nulls last,
                          nge.total_points desc,
                          ce.country_code
                      )
                      from public.nations_group_entries nge
                      join public.nations_competition_entries ce
                        on ce.id = nge.competition_entry_id
                      join public.national_associations a
                        on a.id = ce.association_id
                      where nge.group_id = g.id
                    ), '[]'::jsonb)
                  )
                  order by g.group_number
                )
                from public.nations_competition_groups g
                where g.round_id = r.id
              ), '[]'::jsonb)
            )
            order by r.round_index
          )
          from public.nations_competition_rounds r
          where r.edition_id = v_edition.id
        ), '[]'::jsonb)
      end,
    'entries',
      case
        when v_edition.id is null then '[]'::jsonb
        else coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'entry_id', e.id,
              'association_id', e.association_id,
              'association_name', a.name,
              'country_code', e.country_code,
              'seed_score', e.seed_score,
              'status', e.status
            )
            order by e.country_code
          )
          from public.nations_competition_entries e
          join public.national_associations a on a.id = e.association_id
          where e.edition_id = v_edition.id
        ), '[]'::jsonb)
      end,
    'points_curve', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'race_type', p.race_type,
          'finishing_position', p.finishing_position,
          'points', p.points,
          'version', p.version
        )
        order by p.race_type, p.finishing_position
      )
      from public.nations_points_curve p
      where p.is_active = true
        and p.version = coalesce(v_edition.points_curve_version, 1)
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'season_number', h.season_number,
          'association_id', h.association_id,
          'association_name', a.name,
          'country_code', h.country_code,
          'final_rank', h.final_rank,
          'total_points', h.total_points,
          'was_host', h.was_host
        )
        order by h.season_number desc, h.final_rank asc
      )
      from public.nations_competition_history h
      left join public.national_associations a on a.id = h.association_id
      where h.season_number <= v_season
    ), '[]'::jsonb)
  );
end;
$function$;