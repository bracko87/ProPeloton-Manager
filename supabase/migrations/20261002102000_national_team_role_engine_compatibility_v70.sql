create or replace function public.save_my_national_team_race_strategy_v1(
  p_event_id uuid,
  p_team_plan text,
  p_rider_roles jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
  v_test_override boolean:=false;
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

  v_test_override:=private.national_race_preparation_test_override_enabled_v1(
    v_event.id,v_ctx.association_id
  );

  if v_today<v_event.event_date-15 and not v_test_override then
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
    v_allowed_plans:=array[
      'tt_balanced_pace','tt_fast_start','tt_negative_split','tt_all_out'
    ];
  else
    v_allowed_plans:=array[
      'balanced','aggressive','sprint_control','breakaway','gc_protection'
    ];
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

  -- race_stage_plan_riders.stage_role still uses the legacy engine-role
  -- vocabulary. Keep the coach-facing rich role in rider_roles_json above,
  -- but translate it here so the existing race engine remains compatible.
  update public.race_stage_plan_riders spr
  set stage_role=case coalesce(
        p_rider_roles->>spr.rider_id::text,
        case
          when v_event.race_type='team_time_trial' then 'team_time_trial_rider'
          else 'free_role'
        end
      )
        when 'team_leader_gc' then 'team_leader'
        when 'sprinter' then 'sprinter'
        when 'lead_out_rider' then 'leadout'
        when 'sprint_train_rider' then 'leadout'
        when 'climber' then 'climber'
        when 'mountain_domestique' then 'domestique'
        when 'helper_domestique' then 'domestique'
        when 'breakaway_rider' then 'breakaway'
        when 'breakaway_chaser' then 'breakaway'
        when 'rouleur' then 'road_captain'
        when 'protected_rider' then 'protected_rider'
        when 'team_time_trial_rider' then 'free_role'
        else 'free_role'
      end,
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
    'system_covered',true,
    'test_override',v_test_override
  );
end;
$function$;
