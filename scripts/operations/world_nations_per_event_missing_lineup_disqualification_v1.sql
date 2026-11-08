-- World Nations: after each race's submission deadline, disqualify a nation
-- that did not submit a valid seven-rider lineup for that particular event.
-- Disqualifications are immutable per event, never synthesize riders, and do
-- not prevent teams with confirmed lineups from starting.
-- This migration intentionally does not modify any game race results.
CREATE OR REPLACE FUNCTION public.sync_nations_group_event_participants_v1(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event public.nations_group_events%rowtype;
  v_group public.nations_competition_groups%rowtype;
  v_round public.nations_competition_rounds%rowtype;
  v_edition public.nations_competition_editions%rowtype;
  v_entry record;
  v_team_id uuid;
  v_squad public.national_team_squads%rowtype;
  v_lineup public.national_team_lineups%rowtype;
  v_setup_id uuid;
  v_prep_id uuid;
  v_stage_plan_id uuid;
  v_setup_slot integer;
  v_valid_teams integer:=0;
  v_missing_teams integer:=0;
  v_rider_count integer:=0;
begin
  select * into v_event
  from public.nations_group_events
  where id=p_event_id;

  if v_event.id is null then
    raise exception 'World Nations event not found.';
  end if;

  if v_event.race_id is null or v_event.stage_id is null then
    return jsonb_build_object(
      'status','waiting_for_race',
      'event_id',v_event.id
    );
  end if;

  if exists(
    select 1
    from public.race_stage_simulation_runs sr
    where sr.stage_id=v_event.stage_id
      and sr.status in ('running','completed')
  ) then
    return jsonb_build_object(
      'status','participants_locked',
      'event_id',v_event.id,
      'race_id',v_event.race_id,
      'stage_id',v_event.stage_id
    );
  end if;


  -- A completed historical race may have used riders who were later moved
  -- into another qualification group. Do not keep attempting invalid
  -- overlapping submissions for unrun stages whose game date has passed.
  -- The stage remains overdue in Race Operations and requires an explicit
  -- sporting recovery, rather than falsely entering the calculation queue.
  if v_event.event_date < public.get_current_game_date_date() then
    return jsonb_build_object(
      'status','overdue_requires_competition_recovery',
      'event_id',v_event.id,
      'race_id',v_event.race_id,
      'stage_id',v_event.stage_id,
      'original_event_date',v_event.event_date,
      'game_date',public.get_current_game_date_date()
    );
  end if;

  select * into v_group
  from public.nations_competition_groups
  where id=v_event.group_id;

  select * into v_round
  from public.nations_competition_rounds
  where id=v_group.round_id;

  select * into v_edition
  from public.nations_competition_editions
  where id=v_round.edition_id;

  -- Preflight future confirmed lineups before any participant writes.
  -- Riders who are injured today may recover before their scheduled race.
  -- Preserve the coach's selected seven and the existing injury restriction.
  if exists (
    select 1
    from public.nations_group_entries nge
    join public.nations_competition_entries ce
      on ce.id=nge.competition_entry_id
    join public.national_team_squads sq
      on sq.association_id=ce.association_id
      and sq.season_number=v_edition.season_number
      and sq.cycle_key=v_event.cycle_key
      and sq.status in ('confirmed','on_duty','completed')
    join public.national_team_lineups nl
      on nl.squad_id=sq.id
      and nl.race_day=v_event.race_day
      and nl.status in ('confirmed','locked','completed')
    join public.national_team_lineup_members lm
      on lm.lineup_id=nl.id
    join public.riders r
      on r.id=lm.rider_id
    where nge.group_id=v_group.id
      and nge.status<>'withdrawn'
      -- Riders of an already disqualified nation must not block another team's field.
      and not (coalesce(v_event.metadata->'disqualified_country_codes','[]'::jsonb) ? ce.country_code)
      and r.availability_status='injured'
  ) then
    return jsonb_build_object(
      'status','waiting_for_available_riders',
      'event_id',v_event.id,
      'race_id',v_event.race_id,
      'stage_id',v_event.stage_id,
      'event_date',v_event.event_date,
      'game_date',public.get_current_game_date_date()
    );
  end if;

  v_setup_slot:=case v_event.race_type
    when 'team_time_trial' then 3
    when 'flat_road_race' then 1
    else 2
  end;

  for v_entry in
    select
      nge.id as group_entry_id,
      ce.association_id,
      ce.country_code,
      a.name as association_name
    from public.nations_group_entries nge
    join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
    join public.national_associations a on a.id=ce.association_id
    where nge.group_id=v_group.id
      and nge.status<>'withdrawn'
      -- The deadline decision is frozen per event; late submissions cannot re-enter.
      and not (coalesce(v_event.metadata->'disqualified_country_codes','[]'::jsonb) ? ce.country_code)
    order by ce.country_code
  loop
    v_team_id:=private.ensure_national_association_race_team_v1(v_entry.association_id);

    select * into v_squad
    from public.national_team_squads s
    where s.association_id=v_entry.association_id
      and s.season_number=v_edition.season_number
      and s.cycle_key=v_event.cycle_key
      and s.status in ('confirmed','on_duty','completed')
    limit 1;

    if v_squad.id is null then
      v_missing_teams:=v_missing_teams+1;
      continue;
    end if;

    select * into v_lineup
    from public.national_team_lineups l
    where l.squad_id=v_squad.id
      and l.race_day=v_event.race_day
      and l.status in ('confirmed','locked','completed')
    limit 1;

    if v_lineup.id is null
       or (
         select count(*)
         from public.national_team_lineup_members lm
         where lm.lineup_id=v_lineup.id
       )<>7 then
      v_missing_teams:=v_missing_teams+1;
      continue;
    end if;

    select p.id
    into v_setup_id
    from public.club_equipment_setup_presets p
    where p.club_id=v_team_id
      and p.setup_slot=v_setup_slot
    limit 1;

    insert into public.race_participant_teams(
      race_id,team_id,status,team_name_snapshot,logo_url_snapshot,
      country_code_snapshot,ranking_snapshot,submitted_at,accepted_at
    )
    values(
      v_event.race_id,v_team_id,'accepted',
      v_entry.association_name,
      'https://flagcdn.com/w160/'||lower(v_entry.country_code)||'.png',
      upper(v_entry.country_code),null,now(),now()
    )
    on conflict(race_id,team_id) do update
    set status='accepted',
        team_name_snapshot=excluded.team_name_snapshot,
        logo_url_snapshot=excluded.logo_url_snapshot,
        country_code_snapshot=excluded.country_code_snapshot,
        accepted_at=excluded.accepted_at;

    delete from public.race_participant_riders
    where race_id=v_event.race_id
      and team_id=v_team_id;

    insert into public.race_participant_riders(
      race_id,team_id,rider_id,rider_name_snapshot,team_name_snapshot,
      country_code_snapshot,age_snapshot,is_young_rider,start_number,
      role_snapshot,overall_snapshot,can_view_exact_overall,overall_range_label
    )
    select
      v_event.race_id,
      v_team_id,
      lm.rider_id,
      coalesce(r.display_name,lm.rider_id::text),
      v_entry.association_name,
      upper(v_entry.country_code),
      greatest(0,extract(year from age(v_event.event_date,r.birth_date))::integer),
      extract(year from age(v_event.event_date,r.birth_date))::integer<=21,
      100*v_group.group_number + row_number() over(order by coalesce(r.display_name,lm.rider_id::text)),
      r.role::text,
      r.overall,
      true,
      null
    from public.national_team_lineup_members lm
    join public.riders r on r.id=lm.rider_id
    where lm.lineup_id=v_lineup.id
    order by coalesce(r.display_name,lm.rider_id::text);

    insert into public.race_preparations(
      race_id,club_id,status,startlist_status,setup_window_opens_on,
      rider_submission_deadline_on,submitted_at,default_equipment_setup_id,
      rider_count,staff_count,participation_cost_cash,travel_cost_cash,
      staff_travel_cost_cash,asset_transport_cost_cash,supplies_cost_cash,
      operations_cost_cash,total_cost_cash,cost_breakdown_json,
      team_policies_snapshot_json,validation_snapshot_json,engine_payload_json,
      metadata,participating_club_id
    )
    values(
      v_event.race_id,v_team_id,'submitted','submitted',
      v_event.event_date-14,v_event.event_date,now(),v_setup_id,
      7,0,0,0,0,0,0,0,0,
      jsonb_build_object('nations_competition',true,'system_covered',true),
      '{}'::jsonb,
      jsonb_build_object(
        'nations_competition',true,
        'standard_package',true,
        'expected_riders',7
      ),
      jsonb_build_object(
        'nations_competition',true,
        'association_id',v_entry.association_id,
        'group_id',v_group.id,
        'event_id',v_event.id,
        'race_day',v_event.race_day,
        'race_type',v_event.race_type
      ),
      jsonb_build_object(
        'nations_competition',true,
        'standard_package',true,
        'system_covered',true,
        'association_id',v_entry.association_id,
        'group_id',v_group.id,
        'event_id',v_event.id
      ),
      v_team_id
    )
    on conflict(race_id,club_id) do update
    set status='submitted',
        startlist_status='submitted',
        default_equipment_setup_id=excluded.default_equipment_setup_id,
        rider_count=7,
        staff_count=0,
        total_cost_cash=0,
        cost_breakdown_json=excluded.cost_breakdown_json,
        validation_snapshot_json=excluded.validation_snapshot_json,
        engine_payload_json=excluded.engine_payload_json,
        metadata=public.race_preparations.metadata||excluded.metadata,
        participating_club_id=excluded.participating_club_id,
        updated_at=now()
    returning id into v_prep_id;

    delete from public.race_preparation_riders
    where race_preparation_id=v_prep_id;

    insert into public.race_preparation_riders(
      race_preparation_id,rider_id,start_number,race_role,
      default_equipment_setup_id,availability_snapshot_json,
      rider_snapshot_json,bonus_snapshot_json,metadata
    )
    select
      v_prep_id,
      lm.rider_id,
      100*v_group.group_number + row_number() over(order by coalesce(r.display_name,lm.rider_id::text)),
      'selected',
      v_setup_id,
      jsonb_build_object(
        'availability_status',r.availability_status,
        'unavailable_until',r.unavailable_until,
        'unavailable_reason',r.unavailable_reason
      ),
      jsonb_build_object(
        'nations_competition',true,
        'association_id',v_entry.association_id,
        'country_code',v_entry.country_code,
        'overall',r.overall,
        'role',r.role
      ),
      jsonb_build_object('standard_package',true),
      jsonb_build_object(
        'nations_competition',true,
        'standard_package',true,
        'national_team',true
      )
    from public.national_team_lineup_members lm
    join public.riders r on r.id=lm.rider_id
    where lm.lineup_id=v_lineup.id;

    insert into public.race_stage_plans(
      race_preparation_id,race_id,stage_id,stage_number,stage_date,status,
      opens_on_game_date,locks_on_game_date,submitted_at,
      stage_objective,team_strategy,risk_level,
      stage_profile_snapshot_json,bonus_snapshot_json,engine_stage_payload_json,
      metadata,rider_equipment_json,rider_roles_json,team_tactic_json,
      rider_supplies_json,rider_individual_tactics_json,last_saved_at,last_saved_game_ts
    )
    select
      v_prep_id,v_event.race_id,v_event.stage_id,1,v_event.event_date,'submitted',
      v_event.event_date-14,v_event.event_date,now(),
      'balanced','balanced','normal',
      to_jsonb(s),
      jsonb_build_object('standard_package',true),
      jsonb_build_object(
        'nations_competition',true,
        'association_id',v_entry.association_id,
        'race_type',v_event.race_type
      ),
      jsonb_build_object(
        'nations_competition',true,
        'standard_package',true,
        'national_team',true
      ),
      '{}'::jsonb,
      '{}'::jsonb,
      jsonb_build_object(
        'plan','balanced',
        'national_team',true,
        'race_type',v_event.race_type
      ),
      '{}'::jsonb,
      '{}'::jsonb,
      now(),
      public.get_current_game_ts_local()
    from public.race_stages s
    where s.id=v_event.stage_id
    on conflict(race_preparation_id,stage_number) do update
    set stage_id=excluded.stage_id,
        stage_date=excluded.stage_date,
        status='submitted',
        team_strategy='balanced',
        stage_profile_snapshot_json=excluded.stage_profile_snapshot_json,
        bonus_snapshot_json=excluded.bonus_snapshot_json,
        engine_stage_payload_json=excluded.engine_stage_payload_json,
        metadata=public.race_stage_plans.metadata||excluded.metadata,
        updated_at=now()
    returning id into v_stage_plan_id;

    delete from public.race_stage_plan_riders
    where race_stage_plan_id=v_stage_plan_id;

    insert into public.race_stage_plan_riders(
      race_stage_plan_id,rider_id,stage_role,tactic,risk_level,effort_level,
      equipment_setup_id,rider_stage_snapshot_json,equipment_bonus_snapshot_json,
      final_bonus_snapshot_json,metadata
    )
    select
      v_stage_plan_id,
      lm.rider_id,
      case when v_event.race_type='team_time_trial' then 'domestique' else 'free_role' end,
      'balanced','normal','normal',v_setup_id,
      jsonb_build_object(
        'nations_competition',true,
        'association_id',v_entry.association_id,
        'race_day',v_event.race_day
      ),
      jsonb_build_object('standard_package',true),
      jsonb_build_object('standard_package',true),
      jsonb_build_object('nations_competition',true,'national_team',true)
    from public.national_team_lineup_members lm
    where lm.lineup_id=v_lineup.id;

    update public.race_stage_plans sp
    set rider_equipment_json=coalesce((
          select jsonb_object_agg(lm.rider_id::text,to_jsonb(v_setup_id::text))
          from public.national_team_lineup_members lm
          where lm.lineup_id=v_lineup.id
        ),'{}'::jsonb),
        rider_roles_json=coalesce((
          select jsonb_object_agg(
            lm.rider_id::text,
            to_jsonb(case when v_event.race_type='team_time_trial' then 'domestique' else 'free_role' end)
          )
          from public.national_team_lineup_members lm
          where lm.lineup_id=v_lineup.id
        ),'{}'::jsonb),
        rider_supplies_json=coalesce((
          select jsonb_object_agg(
            lm.rider_id::text,
            jsonb_build_object(
              'source','national_team_standard_package',
              'standardized',true,
              'system_covered',true
            )
          )
          from public.national_team_lineup_members lm
          where lm.lineup_id=v_lineup.id
        ),'{}'::jsonb),
        rider_individual_tactics_json=coalesce((
          select jsonb_object_agg(
            lm.rider_id::text,
            jsonb_build_object(
              'phase_1',jsonb_build_object('command','ride_naturally'),
              'phase_2',jsonb_build_object('command','ride_naturally'),
              'phase_3',jsonb_build_object('command','ride_naturally'),
              'phase_4',jsonb_build_object('command','ride_naturally')
            )
          )
          from public.national_team_lineup_members lm
          where lm.lineup_id=v_lineup.id
        ),'{}'::jsonb),
        team_tactic_json=jsonb_build_object(
          'plan','balanced',
          'national_team',true,
          'race_type',v_event.race_type
        ),
        updated_at=now()
    where sp.id=v_stage_plan_id;

    delete from public.race_preparation_assets
    where race_preparation_id=v_prep_id
      and asset_key='team_car';

    insert into public.race_preparation_assets(
      race_preparation_id,asset_key,asset_id,display_name,assignment_scope,
      asset_snapshot_json,effect_snapshot_json,metadata,asset_slot_key
    )
    select
      v_prep_id,
      'team_car',
      x.id,
      x.display_name,
      'race',
      to_jsonb(x),
      jsonb_build_object(
        'support_value',x.support_value,
        'condition_percent',x.condition_percent
      ),
      jsonb_build_object(
        'nations_competition',true,
        'standard_package',true,
        'system_covered',true
      ),
      'team_car_'||x.slot_no::text
    from (
      select
        c.*,
        row_number() over(order by c.garage_slot,c.id)::integer as slot_no
      from public.club_team_cars c
      where c.club_id=v_team_id
        and c.status='available'
      order by c.garage_slot,c.id
      limit 3
    ) x;

    v_valid_teams:=v_valid_teams+1;
  end loop;

  select count(*)::integer
  into v_rider_count
  from public.race_participant_riders
  where race_id=v_event.race_id;

  update public.nations_group_events
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'participants_synced',v_valid_teams>0,
        'synced_team_count',v_valid_teams,
        'missing_team_lineups',v_missing_teams,
        'synced_rider_count',v_rider_count
      ),
      updated_at=now()
  where id=v_event.id;

  return jsonb_build_object(
    'status',case when v_missing_teams=0 then 'ready' else 'waiting_for_lineups' end,
    'event_id',v_event.id,
    'race_id',v_event.race_id,
    'stage_id',v_event.stage_id,
    'team_count',v_valid_teams,
    'missing_team_lineups',v_missing_teams,
    'rider_count',v_rider_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.process_nations_race_runtime_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_core jsonb;
  v_season integer;
  v_edition_id uuid;
  v_event record;
  v_expected integer;
  v_eligible integer;
  v_valid_teams integer;
  v_actual_teams integer;
  v_sim_started boolean;
  v_deadline timestamptz;
  v_now timestamptz := public.get_current_game_timestamp();
  v_disqualified jsonb := '[]'::jsonb;
  v_ready integer:=0;
  v_blocked integer:=0;
  v_disqualified_count integer:=0;
begin
  v_core:=public.process_nations_race_runtime_v1();

  select season_number into v_season
  from public.game_state where id=true;

  select id into v_edition_id
  from public.nations_competition_editions
  where season_number=v_season and status<>'completed'
  limit 1;

  if v_edition_id is null then
    return coalesce(v_core,'{}'::jsonb)
      || jsonb_build_object('race_gates_ready',0,'race_gates_blocked',0,'teams_disqualified_after_deadline',0);
  end if;

  for v_event in
    select e.id,e.group_id,e.race_id,e.stage_id,e.status,e.race_day,e.cycle_key,
           e.event_date,e.metadata
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id=e.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition_id
      and e.race_id is not null and e.stage_id is not null
      and e.status not in ('completed','cancelled')
  loop
    select exists(
      select 1 from public.race_stage_simulation_runs sr
      where sr.stage_id=v_event.stage_id
        and sr.status in ('running','completed')
    ) into v_sim_started;

    -- Never change a frozen field after the simulation has started.
    if v_sim_started then continue; end if;

    select count(*)::integer into v_expected
    from public.nations_group_entries nge
    where nge.group_id=v_event.group_id and nge.status<>'withdrawn';

    select coalesce(
      re.rider_submission_deadline_game_at at time zone 'UTC',
      (re.rider_submission_deadline::timestamp + interval '1 day') at time zone 'UTC',
      v_event.event_date::timestamp at time zone 'UTC'
    ) into v_deadline
    from public.race_entry_rules re
    where re.race_id=v_event.race_id;

    if v_deadline is null then
      -- No established deadline means the race cannot silently disqualify anybody.
      v_disqualified:='[]'::jsonb;
    elsif v_now >= v_deadline then
      if coalesce(v_event.metadata,'{}'::jsonb) ? 'disqualified_country_codes' then
        v_disqualified:=coalesce(v_event.metadata->'disqualified_country_codes','[]'::jsonb);
      else
        -- Only a confirmed 7-rider lineup for THIS event counts.
        -- No AI riders, no fictional teams, and no retroactive lineup reuse.
        select coalesce(jsonb_agg(ce.country_code order by ce.country_code),'[]'::jsonb)
        into v_disqualified
        from public.nations_group_entries nge
        join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
        where nge.group_id=v_event.group_id
          and nge.status<>'withdrawn'
          and not exists(
            select 1
            from public.national_team_squads sq
            join public.national_team_lineups nl on nl.squad_id=sq.id
            where sq.association_id=ce.association_id
              and sq.season_number=v_season
              and sq.cycle_key=v_event.cycle_key
              and sq.status in ('confirmed','on_duty','completed')
              and nl.race_day=v_event.race_day
              and nl.status in ('confirmed','locked','completed')
              and (
                nl.submitted_on_game_date is null
                or nl.submitted_on_game_date < (v_deadline at time zone 'UTC')::date
              )
              and (select count(distinct lm.rider_id)
                   from public.national_team_lineup_members lm
                   where lm.lineup_id=nl.id)=7
          );

        update public.nations_group_events e
        set metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object(
          'disqualified_country_codes',v_disqualified,
          'disqualification_policy','missing_seven_rider_lineup_after_submission_deadline_v1',
          'disqualification_deadline_game_at',v_deadline,
          'disqualification_decided_at_real',now()
        ),updated_at=now()
        where e.id=v_event.id;

        v_disqualified_count:=v_disqualified_count+jsonb_array_length(v_disqualified);
      end if;
    else
      v_disqualified:='[]'::jsonb;
    end if;

    -- A disqualification belongs to this race, not automatically to every
    -- race in the three-day group or the whole championship.
    v_eligible:=greatest(v_expected-jsonb_array_length(v_disqualified),0);

    select count(*)::integer into v_valid_teams
    from (
      select rpr.team_id
      from public.race_participant_riders rpr
      join public.national_association_race_team_identities ti
        on ti.technical_club_id=rpr.team_id
      join public.nations_competition_entries ce
        on ce.association_id=ti.association_id
      join public.nations_group_entries nge
        on nge.competition_entry_id=ce.id
       and nge.group_id=v_event.group_id and nge.status<>'withdrawn'
      where rpr.race_id=v_event.race_id
        and not (v_disqualified ? ce.country_code)
      group by rpr.team_id
      having count(*)=7 and count(distinct rpr.rider_id)=7
    ) x;

    select count(distinct team_id)::integer into v_actual_teams
    from public.race_participant_riders
    where race_id=v_event.race_id;

    update public.race_entry_rules
    set target_teams=greatest(v_eligible,1),
        min_teams=greatest(v_eligible,1),
        max_teams=greatest(v_eligible,1),
        min_riders_per_team=7,
        max_riders_per_team=7,
        applications_status='closed',updated_at=now()
    where race_id=v_event.race_id;

    if v_eligible>0 and v_valid_teams=v_eligible
       and v_actual_teams=v_eligible then
      update public.races
      set status='scheduled',updated_at=now()
      where id=v_event.race_id and status in ('draft','scheduled');

      update public.nations_group_events
      set status='ready',
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
            'race_gate_ready',true,
            'original_expected_teams',v_expected,
            'expected_teams',v_eligible,
            'valid_7_rider_teams',v_valid_teams,
            'disqualified_teams',jsonb_array_length(v_disqualified)
          ),updated_at=now()
      where id=v_event.id and status not in ('running','completed','cancelled');
      v_ready:=v_ready+1;
    else
      update public.races
      set status='draft',updated_at=now()
      where id=v_event.race_id and status in ('draft','scheduled');

      update public.nations_group_events
      set status='waiting_for_lineups',
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
            'race_gate_ready',false,
            'original_expected_teams',v_expected,
            'expected_teams',v_eligible,
            'valid_7_rider_teams',v_valid_teams,
            'disqualified_teams',jsonb_array_length(v_disqualified),
            'actual_teams_with_riders',v_actual_teams
          ),updated_at=now()
      where id=v_event.id and status not in ('running','completed','cancelled');
      v_blocked:=v_blocked+1;
    end if;
  end loop;

  return coalesce(v_core,'{}'::jsonb)||jsonb_build_object(
    'race_gates_ready',v_ready,
    'race_gates_blocked',v_blocked,
    'teams_disqualified_after_deadline',v_disqualified_count
  );
end;
$function$;
