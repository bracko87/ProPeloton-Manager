CREATE OR REPLACE FUNCTION public.get_my_unified_race_preparation_special_events_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_today date:=public.get_current_game_date_date();
  v_season integer;
  v_club_id uuid;
  v_ctx record;
  v_team_events jsonb:='[]'::jsonb;
  v_individual_events jsonb:='[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select gs.season_number
  into v_season
  from public.game_state gs
  where gs.id=true;

  select c.id
  into v_club_id
  from public.clubs c
  where c.owner_user_id=v_uid
    and c.parent_club_id is null
    and (c.club_type='main' or c.club_type is null)
  order by c.created_at
  limit 1;

  select *
  into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is not null then
    select coalesce(jsonb_agg(x.payload order by x.event_date,x.race_day),'[]'::jsonb)
    into v_team_events
    from (
      select
        e.event_date,
        e.race_day,
        jsonb_build_object(
          'kind','national_team',
          'event_id',e.id,
          'season_number',ed.season_number,
          'round_label',r.round_label,
          'round_type',r.round_type,
          'group_label',g.group_label,
          'race_day',e.race_day,
          'race_type',e.race_type,
          'event_date',e.event_date,
          'event_status',e.status,
          'race_id',e.race_id,
          'stage_id',e.stage_id,
          'host_country_code',e.host_country_code,
          'setup_window_opens_on',e.event_date-15,
          'lineup_deadline_on',e.event_date-3,
          'can_manage',true,
          'association_id',v_ctx.association_id,
          'country_code',v_ctx.country_code,
          'selection_cycle',(
            select jsonb_build_object(
              'status',sc.status,
              'selected_count',cardinality(sc.selected_rider_ids),
              'locked_on',sc.locked_on_game_date,
              'response_deadline',sc.response_deadline,
              'final_squad_deadline',sc.final_squad_deadline
            )
            from public.national_team_selection_cycles sc
            where sc.association_id=v_ctx.association_id
              and sc.season_number=ed.season_number
              and sc.cycle_key=e.cycle_key
            order by sc.updated_at desc
            limit 1
          ),
          'squad',(
            select jsonb_build_object(
              'squad_id',s.id,
              'status',s.status,
              'squad_size',s.squad_size,
              'confirmed_on',s.confirmed_on_game_date,
              'members',coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'rider_id',sm.rider_id,
                    'rider_name',sm.rider_name_snapshot,
                    'club_name',sm.club_name_snapshot,
                    'squad_role',sm.squad_role
                  )
                  order by sm.rider_name_snapshot
                )
                from public.national_team_squad_members sm
                where sm.squad_id=s.id
              ),'[]'::jsonb)
            )
            from public.national_team_squads s
            where s.association_id=v_ctx.association_id
              and s.season_number=ed.season_number
              and s.cycle_key=e.cycle_key
              and s.status in ('confirmed','on_duty','completed')
            order by s.updated_at desc
            limit 1
          ),
          'lineup',(
            select jsonb_build_object(
              'lineup_id',l.id,
              'status',l.status,
              'submitted_on',l.submitted_on_game_date,
              'rider_ids',coalesce((
                select jsonb_agg(lm.rider_id order by sm.rider_name_snapshot)
                from public.national_team_lineup_members lm
                join public.national_team_squad_members sm
                  on sm.id=lm.squad_member_id
                where lm.lineup_id=l.id
              ),'[]'::jsonb),
              'riders',coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'rider_id',lm.rider_id,
                    'rider_name',sm.rider_name_snapshot,
                    'club_name',sm.club_name_snapshot
                  )
                  order by sm.rider_name_snapshot
                )
                from public.national_team_lineup_members lm
                join public.national_team_squad_members sm
                  on sm.id=lm.squad_member_id
                where lm.lineup_id=l.id
              ),'[]'::jsonb)
            )
            from public.national_team_squads s
            join public.national_team_lineups l
              on l.squad_id=s.id
             and l.race_day=e.race_day
             and l.status<>'cancelled'
            where s.association_id=v_ctx.association_id
              and s.season_number=ed.season_number
              and s.cycle_key=e.cycle_key
            order by l.updated_at desc
            limit 1
          ),
          'race_preparation',(
            select jsonb_build_object(
              'race_preparation_id',rp.id,
              'status',rp.status,
              'startlist_status',rp.startlist_status,
              'stage_plan_id',sp.id,
              'team_strategy',sp.team_strategy,
              'team_tactic_json',sp.team_tactic_json,
              'rider_roles_json',sp.rider_roles_json,
              'last_saved_at',sp.last_saved_at
            )
            from public.race_preparations rp
            left join public.race_stage_plans sp
              on sp.race_preparation_id=rp.id
             and sp.stage_number=1
            where rp.race_id=e.race_id
              and rp.metadata->>'association_id'=v_ctx.association_id::text
            order by rp.updated_at desc
            limit 1
          ),
          'route',(
            select jsonb_build_object(
              'stage_name',rs.name,
              'start_city',coalesce(rs.start_city_name,rs.start_city),
              'finish_city',coalesce(rs.finish_city_name,rs.finish_city),
              'distance_km',rs.distance_km,
              'terrain_type',rs.terrain_type,
              'profile_type',rs.profile_type
            )
            from public.race_stages rs
            where rs.id=e.stage_id
          )
        ) payload
      from public.nations_competition_entries ce
      join public.nations_competition_editions ed on ed.id=ce.edition_id
      join public.nations_group_entries nge on nge.competition_entry_id=ce.id
      join public.nations_competition_groups g on g.id=nge.group_id
      join public.nations_competition_rounds r on r.id=g.round_id
      join public.nations_group_events e on e.group_id=g.id
      where ce.association_id=v_ctx.association_id
        and ed.season_number=v_season
        and ce.status<>'withdrawn'
        and nge.status<>'withdrawn'
        and e.status<>'cancelled'
        and e.event_date is not null
        and e.event_date>=v_today-3
    ) x;
  end if;

  if v_club_id is not null then
    select coalesce(jsonb_agg(x.payload order by x.event_date,x.heat_number nulls last),'[]'::jsonb)
    into v_individual_events
    from (
      select
        d.edition_id,
        d.duty_type,
        d.heat_id,
        d.duty_date as event_date,
        h.heat_number,
        jsonb_build_object(
          'kind','national_individual',
          'event_key',
            d.edition_id::text||':'||d.duty_type||':'||coalesce(d.heat_id::text,'final'),
          'edition_id',d.edition_id,
          'season_number',ed.season_number,
          'country_code',ed.country_code,
          'event_type',d.duty_type,
          'event_date',d.duty_date,
          'status',d.status,
          'heat_id',d.heat_id,
          'heat_number',h.heat_number,
          'race_id',case when d.duty_type='final' then ed.final_race_id else h.race_id end,
          'setup_window_opens_on',d.duty_date-15,
          'can_manage',false,
          'riders',jsonb_agg(
            jsonb_build_object(
              'rider_id',d.rider_id,
              'rider_name',coalesce(ne.rider_name_snapshot,ri.display_name),
              'entry_status',ne.entry_status,
              'participation_decision',ne.participation_decision,
              'final_participation_decision',ne.final_participation_decision
            )
            order by coalesce(ne.rider_name_snapshot,ri.display_name)
          )
        ) payload
      from public.national_championship_duties d
      join public.national_championship_editions ed on ed.id=d.edition_id
      left join public.national_championship_heats h on h.id=d.heat_id
      join public.national_championship_entries ne
        on ne.edition_id=d.edition_id
       and ne.rider_id=d.rider_id
      join public.riders ri on ri.id=d.rider_id
      join public.club_riders cr
        on cr.rider_id=d.rider_id
       and cr.club_id=v_club_id
      where ed.season_number=v_season
        and d.status not in ('cancelled','withdrawn')
        and d.duty_date>=v_today-3
      group by
        d.edition_id,d.duty_type,d.heat_id,d.duty_date,h.heat_number,
        ed.season_number,ed.country_code,ed.final_race_id,h.race_id,d.status
    ) x;
  end if;

  return jsonb_build_object(
    'current_game_date',v_today,
    'season_number',v_season,
    'is_national_coach',v_ctx.association_id is not null,
    'national_team_events',v_team_events,
    'national_individual_events',v_individual_events
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.submit_national_team_lineup_v1(p_squad_id uuid, p_race_day integer, p_rider_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_squad public.national_team_squads%rowtype;
  v_event public.nations_group_events%rowtype;
  v_required integer;
  v_max_changes integer;
  v_distinct_count integer;
  v_valid_count integer;
  v_previous_lineup_id uuid;
  v_previous_count integer;
  v_shared_count integer;
  v_changes integer:=0;
  v_lineup_id uuid;
  v_race_type text;
  v_today date:=public.get_current_game_date_date();
  v_open_date date;
  v_deadline date;
  v_race_result jsonb;
  v_sync_result jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if p_race_day not between 1 and 3 then
    raise exception 'National-team race day must be between 1 and 3.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can submit national-team lineups.';
  end if;

  select * into v_squad
  from public.national_team_squads
  where id=p_squad_id
  for update;

  if v_squad.id is null
     or v_squad.association_id<>v_ctx.association_id
     or v_squad.season_number<>v_ctx.season_number then
    raise exception 'National squad not found for your Association.';
  end if;

  if v_squad.status not in ('confirmed','on_duty') then
    raise exception 'The national squad must be confirmed before race lineups can be submitted.';
  end if;

  select e.*
  into v_event
  from public.nations_group_events e
  join public.nations_competition_groups g on g.id=e.group_id
  join public.nations_competition_rounds r on r.id=g.round_id
  join public.nations_competition_editions ed on ed.id=r.edition_id
  join public.nations_group_entries nge on nge.group_id=g.id
  join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
  where ed.season_number=v_squad.season_number
    and ce.association_id=v_squad.association_id
    and e.cycle_key=v_squad.cycle_key
    and e.race_day=p_race_day
    and nge.status<>'withdrawn'
  limit 1;

  if v_event.id is null or v_event.event_date is null then
    raise exception 'World Nations race day was not found for this squad.';
  end if;

  v_open_date:=v_event.event_date-15;
  v_deadline:=v_event.event_date-3;

  if v_today<v_open_date then
    raise exception 'Race preparation opens on %.',v_open_date;
  end if;

  if v_today>v_deadline then
    raise exception 'The 7-rider lineup deadline was %.',v_deadline;
  end if;

  select national_lineup_size::integer,max_lineup_changes::integer
  into v_required,v_max_changes
  from public.national_association_config
  where id=true;

  select count(distinct x)::integer
  into v_distinct_count
  from unnest(coalesce(p_rider_ids,array[]::uuid[])) x;

  if v_distinct_count<>coalesce(v_required,7) then
    raise exception 'A national-team race lineup must contain exactly % distinct riders.',coalesce(v_required,7);
  end if;

  select count(*)::integer
  into v_valid_count
  from public.national_team_squad_members m
  where m.squad_id=v_squad.id
    and m.rider_id=any(p_rider_ids);

  if v_valid_count<>coalesce(v_required,7) then
    raise exception 'Every lineup rider must belong to the confirmed 10-rider squad.';
  end if;

  if p_race_day>1 then
    select l.id
    into v_previous_lineup_id
    from public.national_team_lineups l
    where l.squad_id=v_squad.id
      and l.race_day=p_race_day-1
      and l.status in ('confirmed','locked','completed')
    limit 1;

    if v_previous_lineup_id is null then
      raise exception 'The previous race-day lineup must be confirmed first.';
    end if;

    select count(*)::integer
    into v_previous_count
    from public.national_team_lineup_members m
    where m.lineup_id=v_previous_lineup_id;

    select count(*)::integer
    into v_shared_count
    from public.national_team_lineup_members m
    where m.lineup_id=v_previous_lineup_id
      and m.rider_id=any(p_rider_ids);

    v_changes:=coalesce(v_previous_count,coalesce(v_required,7))-coalesce(v_shared_count,0);

    if v_changes>coalesce(v_max_changes,3) then
      raise exception 'A maximum of % lineup changes is allowed between consecutive race days.',coalesce(v_max_changes,3);
    end if;
  end if;

  v_race_type:=private.national_team_race_type_for_day_v1(p_race_day);

  insert into public.national_team_lineups(
    squad_id,race_day,race_type,status,
    submitted_by_user_id,submitted_on_game_date
  )
  values(
    v_squad.id,p_race_day,v_race_type,'confirmed',v_uid,v_today
  )
  on conflict(squad_id,race_day)
  do update
  set race_type=excluded.race_type,
      status='confirmed',
      submitted_by_user_id=excluded.submitted_by_user_id,
      submitted_on_game_date=excluded.submitted_on_game_date,
      updated_at=now()
  where public.national_team_lineups.status in ('draft','confirmed')
  returning id into v_lineup_id;

  if v_lineup_id is null then
    raise exception 'This race-day lineup is locked and can no longer be changed.';
  end if;

  delete from public.national_team_lineup_members
  where lineup_id=v_lineup_id;

  insert into public.national_team_lineup_members(
    lineup_id,squad_member_id,rider_id
  )
  select
    v_lineup_id,m.id,m.rider_id
  from public.national_team_squad_members m
  where m.squad_id=v_squad.id
    and m.rider_id=any(p_rider_ids);

  v_race_result:=public.ensure_nations_group_event_race_v1(v_event.id);
  v_sync_result:=public.sync_nations_group_event_participants_v1(v_event.id);

  return jsonb_build_object(
    'lineup_id',v_lineup_id,
    'squad_id',v_squad.id,
    'race_day',p_race_day,
    'race_type',v_race_type,
    'lineup_size',coalesce(v_required,7),
    'changes_from_previous_day',v_changes,
    'status','confirmed',
    'setup_window_opens_on',v_open_date,
    'lineup_deadline_on',v_deadline,
    'race',v_race_result,
    'participant_sync',v_sync_result
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.save_my_national_team_race_strategy_v1(p_event_id uuid, p_team_plan text, p_rider_roles jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_event public.nations_group_events%rowtype;
  v_squad public.national_team_squads%rowtype;
  v_lineup public.national_team_lineups%rowtype;
  v_prep_id uuid;
  v_stage_plan_id uuid;
  v_team_id uuid;
  v_today date:=public.get_current_game_date_date();
  v_allowed_plans text[];
  v_role record;
  v_rider_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can save National Team race strategy.';
  end if;

  select e.*
  into v_event
  from public.nations_group_events e
  join public.nations_competition_groups g on g.id=e.group_id
  join public.nations_competition_rounds r on r.id=g.round_id
  join public.nations_competition_editions ed on ed.id=r.edition_id
  join public.nations_group_entries nge on nge.group_id=g.id
  join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
  where e.id=p_event_id
    and ed.season_number=v_ctx.season_number
    and ce.association_id=v_ctx.association_id
    and nge.status<>'withdrawn'
  limit 1;

  if v_event.id is null then
    raise exception 'World Nations event not found for your Association.';
  end if;

  if v_today<v_event.event_date-15 then
    raise exception 'Race preparation opens on %.',v_event.event_date-15;
  end if;

  if v_today>v_event.event_date-3 then
    raise exception 'Race strategy is locked after the lineup deadline on %.',v_event.event_date-3;
  end if;

  select *
  into v_squad
  from public.national_team_squads s
  where s.association_id=v_ctx.association_id
    and s.season_number=v_ctx.season_number
    and s.cycle_key=v_event.cycle_key
    and s.status in ('confirmed','on_duty')
  order by s.updated_at desc
  limit 1;

  if v_squad.id is null then
    raise exception 'Confirm the 10-rider National Team squad first.';
  end if;

  select *
  into v_lineup
  from public.national_team_lineups l
  where l.squad_id=v_squad.id
    and l.race_day=v_event.race_day
    and l.status in ('confirmed','locked')
  limit 1;

  if v_lineup.id is null then
    raise exception 'Confirm the 7-rider lineup before saving race strategy.';
  end if;

  if v_event.race_type='team_time_trial' then
    v_allowed_plans:=array['tt_balanced_pace','tt_fast_start','tt_negative_split','tt_all_out'];
  else
    v_allowed_plans:=array['balanced','aggressive','sprint_control','breakaway','gc_protection'];
  end if;

  if not (coalesce(p_team_plan,'')=any(v_allowed_plans)) then
    raise exception 'Invalid National Team race strategy.';
  end if;

  select count(*)::integer
  into v_rider_count
  from public.national_team_lineup_members lm
  where lm.lineup_id=v_lineup.id;

  if v_rider_count<>7 then
    raise exception 'The National Team lineup must contain exactly 7 riders.';
  end if;

  if jsonb_typeof(coalesce(p_rider_roles,'{}'::jsonb))<>'object' then
    raise exception 'Rider roles must be a JSON object.';
  end if;

  for v_role in
    select key,value#>>'{}' as role
    from jsonb_each(coalesce(p_rider_roles,'{}'::jsonb))
  loop
    if not exists(
      select 1
      from public.national_team_lineup_members lm
      where lm.lineup_id=v_lineup.id
        and lm.rider_id::text=v_role.key
    ) then
      raise exception 'Rider % is not in this 7-rider lineup.',v_role.key;
    end if;

    if v_role.role not in (
      'team_leader_gc','sprinter','lead_out_rider','sprint_train_rider',
      'climber','mountain_domestique','helper_domestique','breakaway_rider',
      'breakaway_chaser','rouleur','protected_rider','free_role',
      'team_time_trial_rider'
    ) then
      raise exception 'Invalid National Team rider role: %.',v_role.role;
    end if;
  end loop;

  perform public.ensure_nations_group_event_race_v1(v_event.id);
  perform public.sync_nations_group_event_participants_v1(v_event.id);

  v_team_id:=private.ensure_national_association_race_team_v1(v_ctx.association_id);

  select rp.id
  into v_prep_id
  from public.race_preparations rp
  where rp.race_id=(select race_id from public.nations_group_events where id=v_event.id)
    and rp.club_id=v_team_id
  limit 1;

  if v_prep_id is null then
    raise exception 'National Team race preparation could not be initialized.';
  end if;

  select sp.id
  into v_stage_plan_id
  from public.race_stage_plans sp
  where sp.race_preparation_id=v_prep_id
    and sp.stage_number=1
  limit 1;

  if v_stage_plan_id is null then
    raise exception 'National Team stage plan could not be initialized.';
  end if;

  update public.race_stage_plans sp
  set team_strategy=p_team_plan,
      team_tactic_json=jsonb_build_object(
        'plan',p_team_plan,
        'national_team',true,
        'race_type',v_event.race_type
      ),
      rider_roles_json=(
        select jsonb_object_agg(
          lm.rider_id::text,
          to_jsonb(coalesce(
            p_rider_roles->>lm.rider_id::text,
            case
              when v_event.race_type='team_time_trial' then 'team_time_trial_rider'
              else 'free_role'
            end
          ))
        )
        from public.national_team_lineup_members lm
        where lm.lineup_id=v_lineup.id
      ),
      engine_stage_payload_json=coalesce(sp.engine_stage_payload_json,'{}'::jsonb)
        || jsonb_build_object(
          'national_team',true,
          'team_strategy',p_team_plan,
          'rider_roles',coalesce(p_rider_roles,'{}'::jsonb)
        ),
      last_saved_at=now(),
      last_saved_game_ts=public.get_current_game_ts_local(),
      updated_at=now()
  where sp.id=v_stage_plan_id;

  update public.race_stage_plan_riders spr
  set stage_role=coalesce(
        p_rider_roles->>spr.rider_id::text,
        case
          when v_event.race_type='team_time_trial' then 'team_time_trial_rider'
          else 'free_role'
        end
      ),
      updated_at=now()
  where spr.race_stage_plan_id=v_stage_plan_id;

  return jsonb_build_object(
    'status','saved',
    'event_id',v_event.id,
    'race_id',(select race_id from public.nations_group_events where id=v_event.id),
    'race_preparation_id',v_prep_id,
    'stage_plan_id',v_stage_plan_id,
    'team_plan',p_team_plan,
    'rider_roles',coalesce(p_rider_roles,'{}'::jsonb),
    'standard_package',true,
    'system_covered',true
  );
end;
$function$


grant execute on function public.get_my_unified_race_preparation_special_events_v1() to authenticated;
grant execute on function public.submit_national_team_lineup_v1(uuid,integer,uuid[]) to authenticated;
grant execute on function public.save_my_national_team_race_strategy_v1(uuid,text,jsonb) to authenticated;
