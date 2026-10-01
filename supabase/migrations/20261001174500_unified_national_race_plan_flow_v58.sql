create table if not exists public.national_special_race_plans (
  id uuid primary key default gen_random_uuid(),
  plan_kind text not null check (plan_kind in ('national_team','national_ranking')),
  event_key text not null,
  owner_scope_key text not null,
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  status text not null default 'draft' check (status in ('draft','submitted','locked','completed','cancelled')),
  rider_ids uuid[] not null default '{}'::uuid[],
  team_car_ids uuid[] not null default '{}'::uuid[],
  metadata jsonb not null default '{}'::jsonb,
  submitted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_kind,event_key,owner_scope_key)
);

alter table public.national_special_race_plans enable row level security;;

CREATE OR REPLACE FUNCTION public.get_my_national_team_race_plan_workspace_v2(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_event public.nations_group_events%rowtype;
  v_group public.nations_competition_groups%rowtype;
  v_round public.nations_competition_rounds%rowtype;
  v_edition public.nations_competition_editions%rowtype;
  v_squad public.national_team_squads%rowtype;
  v_team_id uuid;
  v_plan public.national_special_race_plans%rowtype;
  v_lineup public.national_team_lineups%rowtype;
  v_prep_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can manage National Team Race Plans.';
  end if;

  select * into v_event from public.nations_group_events where id=p_event_id;
  if v_event.id is null then raise exception 'National Team event not found.'; end if;

  select * into v_group from public.nations_competition_groups where id=v_event.group_id;
  select * into v_round from public.nations_competition_rounds where id=v_group.round_id;
  select * into v_edition from public.nations_competition_editions where id=v_round.edition_id;

  if not exists(
    select 1
    from public.nations_group_entries nge
    join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
    where nge.group_id=v_group.id
      and ce.association_id=v_ctx.association_id
      and nge.status<>'withdrawn'
      and ce.status<>'withdrawn'
  ) then
    raise exception 'Your National Association is not entered in this event.';
  end if;

  select * into v_squad
  from public.national_team_squads s
  where s.association_id=v_ctx.association_id
    and s.season_number=v_edition.season_number
    and s.cycle_key=v_event.cycle_key
    and s.status in ('confirmed','on_duty','completed')
  order by s.updated_at desc
  limit 1;

  if v_squad.id is null then
    raise exception 'Confirm the 10-rider National Team squad first.';
  end if;

  v_team_id:=private.ensure_national_association_race_team_v1(v_ctx.association_id);

  select * into v_plan
  from public.national_special_race_plans p
  where p.plan_kind='national_team'
    and p.event_key=v_event.id::text
    and p.owner_scope_key='association:'||v_ctx.association_id::text
  limit 1;

  select * into v_lineup
  from public.national_team_lineups l
  where l.squad_id=v_squad.id
    and l.race_day=v_event.race_day
    and l.status<>'cancelled'
  limit 1;

  if v_event.race_id is not null then
    select rp.id into v_prep_id
    from public.race_preparations rp
    where rp.race_id=v_event.race_id
      and rp.club_id=v_team_id
    limit 1;
  end if;

  return jsonb_build_object(
    'kind','national_team',
    'event_id',v_event.id,
    'season_number',v_edition.season_number,
    'round_label',v_round.round_label,
    'group_label',v_group.group_label,
    'race_day',v_event.race_day,
    'race_type',v_event.race_type,
    'event_date',v_event.event_date,
    'host_country_code',v_event.host_country_code,
    'setup_window_opens_on',v_event.event_date-15,
    'lineup_deadline_on',v_event.event_date-3,
    'test_override',private.national_race_preparation_test_override_enabled_v1(v_event.id,v_ctx.association_id),
    'squad_id',v_squad.id,
    'technical_team_id',v_team_id,
    'race_id',v_event.race_id,
    'stage_id',v_event.stage_id,
    'race_preparation_id',v_prep_id,
    'plan_status',coalesce(v_plan.status,case when v_lineup.status in ('confirmed','locked','completed') then 'submitted' else 'not_created' end),
    'selected_rider_ids',coalesce(
      to_jsonb(v_plan.rider_ids),
      (
        select coalesce(jsonb_agg(lm.rider_id order by sm.rider_name_snapshot),'[]'::jsonb)
        from public.national_team_lineup_members lm
        join public.national_team_squad_members sm on sm.id=lm.squad_member_id
        where lm.lineup_id=v_lineup.id
      ),
      '[]'::jsonb
    ),
    'selected_team_car_ids',coalesce(to_jsonb(v_plan.team_car_ids),'[]'::jsonb),
    'riders',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'rider_id',sm.rider_id,
          'rider_name',coalesce(
            nullif(concat_ws(' ',nullif(btrim(r.first_name),''),nullif(btrim(r.last_name),'')),''),
            sm.rider_name_snapshot
          ),
          'club_name',sm.club_name_snapshot,
          'role',r.role::text,
          'fatigue',coalesce(r.fatigue,0),
          'availability_status',r.availability_status,
          'race_sharpness',rc.race_sharpness,
          'race_sharpness_percent',rc.race_sharpness
        )
        order by coalesce(r.overall,0) desc,sm.rider_name_snapshot
      )
      from public.national_team_squad_members sm
      join public.riders r on r.id=sm.rider_id
      left join public.rider_race_condition rc on rc.rider_id=sm.rider_id
      where sm.squad_id=v_squad.id
    ),'[]'::jsonb),
    'team_cars',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',c.id,
          'display_name',c.display_name,
          'asset_level',c.asset_level,
          'condition_percent',c.condition_percent,
          'support_value',c.support_value,
          'status',c.status
        )
        order by c.garage_slot,c.id
      )
      from public.club_team_cars c
      where c.club_id=v_team_id
        and c.status='available'
    ),'[]'::jsonb),
    'staff_locked',true,
    'allowed_asset_keys',jsonb_build_array('team_car_1','team_car_2','team_car_3'),
    'cost_total',0
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_my_national_team_race_plan_v2(p_event_id uuid, p_rider_ids uuid[], p_team_car_ids uuid[] DEFAULT '{}'::uuid[], p_submit boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_event public.nations_group_events%rowtype;
  v_group public.nations_competition_groups%rowtype;
  v_round public.nations_competition_rounds%rowtype;
  v_edition public.nations_competition_editions%rowtype;
  v_squad public.national_team_squads%rowtype;
  v_team_id uuid;
  v_plan_id uuid;
  v_rider_count int;
  v_car_count int;
  v_result jsonb;
  v_prep_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;

  select * into v_ctx from private.current_national_coach_context_v1(v_uid) limit 1;
  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can save this Race Plan.';
  end if;

  select * into v_event from public.nations_group_events where id=p_event_id;
  if v_event.id is null then raise exception 'National Team event not found.'; end if;

  select * into v_group from public.nations_competition_groups where id=v_event.group_id;
  select * into v_round from public.nations_competition_rounds where id=v_group.round_id;
  select * into v_edition from public.nations_competition_editions where id=v_round.edition_id;

  if not exists(
    select 1
    from public.nations_group_entries nge
    join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
    where nge.group_id=v_group.id and ce.association_id=v_ctx.association_id
      and nge.status<>'withdrawn' and ce.status<>'withdrawn'
  ) then
    raise exception 'Your National Association is not entered in this event.';
  end if;

  if public.get_current_game_date_date()<v_event.event_date-15
     and not private.national_race_preparation_test_override_enabled_v1(v_event.id,v_ctx.association_id) then
    raise exception 'Race Plan opens on %.',v_event.event_date-15;
  end if;
  if public.get_current_game_date_date()>v_event.event_date-3 then
    raise exception 'Race Plan deadline was %.',v_event.event_date-3;
  end if;

  select * into v_squad
  from public.national_team_squads s
  where s.association_id=v_ctx.association_id
    and s.season_number=v_edition.season_number
    and s.cycle_key=v_event.cycle_key
    and s.status in ('confirmed','on_duty')
  order by s.updated_at desc limit 1;

  if v_squad.id is null then raise exception 'Confirmed National Team squad not found.'; end if;

  select count(distinct x)::int into v_rider_count
  from unnest(coalesce(p_rider_ids,'{}'::uuid[])) x;
  if v_rider_count<>7 then raise exception 'Select exactly 7 riders.'; end if;

  if (
    select count(*) from public.national_team_squad_members sm
    where sm.squad_id=v_squad.id and sm.rider_id=any(p_rider_ids)
  )<>7 then
    raise exception 'Every selected rider must belong to the confirmed 10-rider squad.';
  end if;

  select count(distinct x)::int into v_car_count
  from unnest(coalesce(p_team_car_ids,'{}'::uuid[])) x;
  if v_car_count>3 then raise exception 'A maximum of 3 team cars can be selected.'; end if;

  v_team_id:=private.ensure_national_association_race_team_v1(v_ctx.association_id);

  if v_car_count>0 and (
    select count(*)
    from public.club_team_cars c
    where c.club_id=v_team_id
      and c.id=any(p_team_car_ids)
      and c.status='available'
  )<>v_car_count then
    raise exception 'One or more selected team cars are unavailable.';
  end if;

  insert into public.national_special_race_plans(
    plan_kind,event_key,owner_scope_key,created_by_user_id,updated_by_user_id,
    status,rider_ids,team_car_ids,metadata,submitted_at
  )
  values(
    'national_team',v_event.id::text,'association:'||v_ctx.association_id::text,
    v_uid,v_uid,case when p_submit then 'submitted' else 'draft' end,
    p_rider_ids,coalesce(p_team_car_ids,'{}'::uuid[]),
    jsonb_build_object(
      'association_id',v_ctx.association_id,
      'race_day',v_event.race_day,
      'race_type',v_event.race_type,
      'staff_locked',true,
      'allowed_assets',jsonb_build_array('team_car_1','team_car_2','team_car_3'),
      'system_covered',true
    ),
    case when p_submit then now() else null end
  )
  on conflict(plan_kind,event_key,owner_scope_key) do update
  set updated_by_user_id=excluded.updated_by_user_id,
      status=excluded.status,
      rider_ids=excluded.rider_ids,
      team_car_ids=excluded.team_car_ids,
      metadata=public.national_special_race_plans.metadata||excluded.metadata,
      submitted_at=case when p_submit then now() else public.national_special_race_plans.submitted_at end,
      updated_at=now()
  returning id into v_plan_id;

  if p_submit then
    v_result:=public.submit_national_team_lineup_v1(v_squad.id,v_event.race_day,p_rider_ids);

    select rp.id into v_prep_id
    from public.race_preparations rp
    join public.nations_group_events e on e.race_id=rp.race_id
    where e.id=v_event.id and rp.club_id=v_team_id
    limit 1;

    if v_prep_id is null then raise exception 'National Team Race Plan shell was not created.'; end if;

    delete from public.race_preparation_assets
    where race_preparation_id=v_prep_id and asset_key='team_car';

    insert into public.race_preparation_assets(
      race_preparation_id,asset_key,asset_id,display_name,assignment_scope,
      asset_snapshot_json,effect_snapshot_json,metadata,asset_slot_key
    )
    select
      v_prep_id,
      'team_car',
      c.id,
      c.display_name,
      'race',
      to_jsonb(c),
      jsonb_build_object('support_value',c.support_value,'condition_percent',c.condition_percent),
      jsonb_build_object('nations_competition',true,'selected_by_national_coach',true,'system_covered',true),
      'team_car_'||row_number() over(order by array_position(p_team_car_ids,c.id))::text
    from public.club_team_cars c
    where c.id=any(coalesce(p_team_car_ids,'{}'::uuid[]))
      and c.club_id=v_team_id;

    update public.race_preparations
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'national_race_plan_id',v_plan_id,
          'staff_locked',true,
          'team_car_count',v_car_count
        ),
        updated_at=now()
    where id=v_prep_id;
  end if;

  return jsonb_build_object(
    'success',true,
    'plan_id',v_plan_id,
    'status',case when p_submit then 'submitted' else 'draft' end,
    'rider_count',v_rider_count,
    'team_car_count',v_car_count,
    'event_id',v_event.id,
    'race_id',(select race_id from public.nations_group_events where id=v_event.id),
    'stage_id',(select stage_id from public.nations_group_events where id=v_event.id),
    'race_preparation_id',v_prep_id,
    'submit_result',v_result
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_my_national_team_stage_plan_v2(p_event_id uuid, p_team_plan text, p_rider_roles jsonb DEFAULT '{}'::jsonb, p_rider_commands jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_event public.nations_group_events%rowtype;
  v_team_id uuid;
  v_prep_id uuid;
  v_stage_plan_id uuid;
  v_lineup_id uuid;
  v_role record;
  v_cmd record;
  v_allowed_commands text[]:=array[
    'ride_naturally','conserve_energy','stay_near_front','join_breakaway',
    'attack','chase_breakaway','climb_hard','sprint','avoid_risks'
  ];
  v_strategy jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_ctx from private.current_national_coach_context_v1(v_uid) limit 1;
  if v_ctx.association_id is null then raise exception 'Only the active National Coach can save Stage Plans.'; end if;

  select * into v_event from public.nations_group_events where id=p_event_id;
  if v_event.id is null then raise exception 'National Team event not found.'; end if;

  v_strategy:=public.save_my_national_team_race_strategy_v1(
    p_event_id,p_team_plan,coalesce(p_rider_roles,'{}'::jsonb)
  );

  v_team_id:=private.ensure_national_association_race_team_v1(v_ctx.association_id);

  select rp.id,sp.id
  into v_prep_id,v_stage_plan_id
  from public.race_preparations rp
  join public.race_stage_plans sp on sp.race_preparation_id=rp.id and sp.stage_number=1
  where rp.race_id=v_event.race_id and rp.club_id=v_team_id
  limit 1;

  if v_stage_plan_id is null then raise exception 'Submit the Race Plan first.'; end if;

  select l.id into v_lineup_id
  from public.national_team_squads s
  join public.national_team_lineups l on l.squad_id=s.id and l.race_day=v_event.race_day
  where s.association_id=v_ctx.association_id
    and s.cycle_key=v_event.cycle_key
    and l.status in ('confirmed','locked')
  order by s.updated_at desc limit 1;

  for v_cmd in
    select key,value
    from jsonb_each(coalesce(p_rider_commands,'{}'::jsonb))
  loop
    if not exists(
      select 1 from public.national_team_lineup_members lm
      where lm.lineup_id=v_lineup_id and lm.rider_id::text=v_cmd.key
    ) then
      raise exception 'Rider % is not in this race lineup.',v_cmd.key;
    end if;

    if not (
      coalesce(v_cmd.value#>>'{phase_1,command}','ride_naturally')=any(v_allowed_commands)
      and coalesce(v_cmd.value#>>'{phase_2,command}','ride_naturally')=any(v_allowed_commands)
      and coalesce(v_cmd.value#>>'{phase_3,command}','ride_naturally')=any(v_allowed_commands)
      and coalesce(v_cmd.value#>>'{phase_4,command}','ride_naturally')=any(v_allowed_commands)
    ) then
      raise exception 'Unsupported rider command.';
    end if;
  end loop;

  update public.race_stage_plans sp
  set rider_individual_tactics_json=(
        select coalesce(jsonb_object_agg(
          lm.rider_id::text,
          coalesce(
            p_rider_commands->lm.rider_id::text,
            jsonb_build_object(
              'phase_1',jsonb_build_object('command','ride_naturally'),
              'phase_2',jsonb_build_object('command','ride_naturally'),
              'phase_3',jsonb_build_object('command','ride_naturally'),
              'phase_4',jsonb_build_object('command','ride_naturally')
            )
          )
        ),'{}'::jsonb)
        from public.national_team_lineup_members lm
        where lm.lineup_id=v_lineup_id
      ),
      metadata=coalesce(sp.metadata,'{}'::jsonb)||jsonb_build_object(
        'national_team_stage_plan_v2',true,
        'individual_commands_enabled',true
      ),
      last_saved_at=now(),
      last_saved_game_ts=public.get_current_game_ts_local(),
      updated_at=now()
  where sp.id=v_stage_plan_id;

  return jsonb_build_object(
    'success',true,
    'event_id',v_event.id,
    'race_preparation_id',v_prep_id,
    'race_stage_plan_id',v_stage_plan_id,
    'strategy',v_strategy,
    'rider_commands',coalesce(p_rider_commands,'{}'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_national_championship_race_plan_workspace_v2(p_edition_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid, p_preview_rider_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_club_id uuid;
  v_edition public.national_championship_editions%rowtype;
  v_heat public.national_championship_heats%rowtype;
  v_event_date date;
  v_event_key text;
  v_plan public.national_special_race_plans%rowtype;
  v_real_riders jsonb:='[]'::jsonb;
  v_preview_riders jsonb:='[]'::jsonb;
  v_race_id uuid;
  v_stage_id uuid;
  v_prep_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_event_type not in ('qualification','final') then raise exception 'Invalid event type.'; end if;

  select c.id into v_club_id
  from public.clubs c
  where c.owner_user_id=v_uid
    and c.parent_club_id is null
    and (c.club_type='main' or c.club_type is null)
  order by c.created_at limit 1;
  if v_club_id is null then raise exception 'Main club not found.'; end if;

  select * into v_edition from public.national_championship_editions where id=p_edition_id;
  if v_edition.id is null then raise exception 'National Championship edition not found.'; end if;

  if p_event_type='qualification' then
    select * into v_heat from public.national_championship_heats
    where id=p_heat_id and edition_id=v_edition.id;
    if v_heat.id is null then raise exception 'Qualification heat not found.'; end if;
    v_event_date:=v_heat.heat_date;
    v_race_id:=v_heat.race_id;
    v_event_key:=v_edition.id::text||':qualification:'||v_heat.id::text;
  else
    v_event_date:=v_edition.final_date;
    v_race_id:=v_edition.final_race_id;
    v_event_key:=v_edition.id::text||':final';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'rider_id',en.rider_id,
    'rider_name',coalesce(
      nullif(concat_ws(' ',nullif(btrim(r.first_name),''),nullif(btrim(r.last_name),'')),''),
      en.rider_name_snapshot
    ),
    'club_name',c.name,
    'role',r.role::text,
    'fatigue',coalesce(r.fatigue,0),
    'race_sharpness',rc.race_sharpness,
    'national_rank',en.national_rank
  ) order by en.national_rank),'[]'::jsonb)
  into v_real_riders
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  left join public.rider_race_condition rc on rc.rider_id=r.id
  left join public.clubs c on c.id=en.club_id_snapshot
  where en.edition_id=v_edition.id
    and public.universal_race_resource_owner_club_v1(en.club_id_snapshot)=v_club_id
    and (
      (p_event_type='qualification' and en.heat_id=p_heat_id and en.entry_status in ('qualification_assigned','qualified','finalist'))
      or
      (p_event_type='final' and en.entry_status in ('direct_qualified','qualified','finalist'))
    );

  if jsonb_array_length(v_real_riders)=0 and cardinality(coalesce(p_preview_rider_ids,'{}'::uuid[]))>0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'rider_id',r.id,
      'rider_name',coalesce(nullif(concat_ws(' ',nullif(btrim(r.first_name),''),nullif(btrim(r.last_name),'')),''),r.display_name),
      'club_name',c.name,
      'role',r.role::text,
      'fatigue',coalesce(r.fatigue,0),
      'race_sharpness',rc.race_sharpness,
      'national_rank',pr.national_rank
    ) order by pr.national_rank),'[]'::jsonb)
    into v_preview_riders
    from public.riders r
    join public.club_riders cr on cr.rider_id=r.id
    join public.clubs c on c.id=cr.club_id
    left join public.rider_race_condition rc on rc.rider_id=r.id
    left join lateral (
      select p.national_rank
      from public.preview_national_ranking_v1(v_edition.country_code,least(public.get_current_game_date_date(),v_edition.ranking_snapshot_date)) p
      where p.rider_id=r.id limit 1
    ) pr on true
    where r.id=any(p_preview_rider_ids)
      and public.universal_race_resource_owner_club_v1(cr.club_id)=v_club_id
      and upper(r.country_code)=upper(v_edition.country_code);
  end if;

  if jsonb_array_length(v_real_riders)=0 and jsonb_array_length(v_preview_riders)=0 then
    raise exception 'No managed riders are assigned to this National Championship event.';
  end if;

  select * into v_plan
  from public.national_special_race_plans p
  where p.plan_kind='national_ranking'
    and p.event_key=v_event_key
    and p.owner_scope_key='club:'||v_club_id::text
  limit 1;

  if v_race_id is not null then
    select s.id into v_stage_id from public.race_stages s where s.race_id=v_race_id order by s.stage_number limit 1;
    select rp.id into v_prep_id
    from public.race_preparations rp
    where rp.race_id=v_race_id
      and public.universal_race_resource_owner_club_v1(rp.club_id)=v_club_id
    order by rp.updated_at desc limit 1;
  end if;

  return jsonb_build_object(
    'kind','national_ranking',
    'edition_id',v_edition.id,
    'event_type',p_event_type,
    'heat_id',case when p_event_type='qualification' then v_heat.id else null end,
    'event_key',v_event_key,
    'event_date',v_event_date,
    'country_code',v_edition.country_code,
    'race_id',v_race_id,
    'stage_id',v_stage_id,
    'race_preparation_id',v_prep_id,
    'plan_status',coalesce(v_plan.status,'not_created'),
    'preview_only',jsonb_array_length(v_real_riders)=0,
    'riders',case when jsonb_array_length(v_real_riders)>0 then v_real_riders else v_preview_riders end,
    'staff_locked',true,
    'assets_locked',true,
    'cost_total',0,
    'setup_window_opens_on',v_event_date-15,
    'rider_submission_deadline_on',v_event_date
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_my_national_championship_race_plan_v2(p_edition_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid, p_preview_rider_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_club_id uuid;
  v_ws jsonb;
  v_event_key text;
  v_rider_ids uuid[];
  v_preview_only boolean;
  v_race_id uuid;
  v_prep_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select c.id into v_club_id
  from public.clubs c
  where c.owner_user_id=v_uid and c.parent_club_id is null
    and (c.club_type='main' or c.club_type is null)
  order by c.created_at limit 1;
  if v_club_id is null then raise exception 'Main club not found.'; end if;

  v_ws:=public.get_my_national_championship_race_plan_workspace_v2(
    p_edition_id,p_event_type,p_heat_id,p_preview_rider_ids
  );

  v_event_key:=v_ws->>'event_key';
  v_preview_only:=coalesce((v_ws->>'preview_only')::boolean,false);

  select coalesce(array_agg((x->>'rider_id')::uuid),'{}'::uuid[])
  into v_rider_ids
  from jsonb_array_elements(v_ws->'riders') x;

  insert into public.national_special_race_plans(
    plan_kind,event_key,owner_scope_key,created_by_user_id,updated_by_user_id,
    status,rider_ids,team_car_ids,metadata,submitted_at
  )
  values(
    'national_ranking',v_event_key,'club:'||v_club_id::text,v_uid,v_uid,
    'submitted',v_rider_ids,'{}'::uuid[],
    jsonb_build_object(
      'edition_id',p_edition_id,
      'event_type',p_event_type,
      'heat_id',p_heat_id,
      'preview_only',v_preview_only,
      'riders_fixed',true,
      'staff_locked',true,
      'assets_locked',true,
      'organizer_paid',true
    ),
    now()
  )
  on conflict(plan_kind,event_key,owner_scope_key) do update
  set updated_by_user_id=excluded.updated_by_user_id,
      status='submitted',
      rider_ids=excluded.rider_ids,
      metadata=public.national_special_race_plans.metadata||excluded.metadata,
      submitted_at=now(),
      updated_at=now();

  if not v_preview_only then
    v_race_id:=public.national_championship_ensure_event_race_v1(
      p_edition_id,p_event_type,p_heat_id
    );
    perform public.national_championship_sync_race_participants_v1(
      p_edition_id,p_event_type,p_heat_id
    );

    select rp.id into v_prep_id
    from public.race_preparations rp
    where rp.race_id=v_race_id
      and public.universal_race_resource_owner_club_v1(rp.club_id)=v_club_id
    order by rp.updated_at desc limit 1;
  end if;

  return jsonb_build_object(
    'success',true,
    'status','submitted',
    'preview_only',v_preview_only,
    'event_key',v_event_key,
    'rider_ids',to_jsonb(v_rider_ids),
    'race_id',v_race_id,
    'race_preparation_id',v_prep_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_my_national_championship_stage_plan_v2(p_edition_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid, p_rider_id uuid DEFAULT NULL::uuid, p_phase_1_command text DEFAULT 'ride_naturally'::text, p_phase_2_command text DEFAULT 'ride_naturally'::text, p_phase_3_command text DEFAULT 'ride_naturally'::text, p_phase_4_command text DEFAULT 'ride_naturally'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_club_id uuid;
  v_event_key text;
  v_plan public.national_special_race_plans%rowtype;
  v_real_entry boolean:=false;
  v_result jsonb;
  v_commands jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_rider_id is null then raise exception 'Rider is required.'; end if;

  select c.id into v_club_id
  from public.clubs c
  where c.owner_user_id=v_uid and c.parent_club_id is null
    and (c.club_type='main' or c.club_type is null)
  order by c.created_at limit 1;
  if v_club_id is null then raise exception 'Main club not found.'; end if;

  v_event_key:=case when p_event_type='qualification'
    then p_edition_id::text||':qualification:'||p_heat_id::text
    else p_edition_id::text||':final' end;

  select * into v_plan
  from public.national_special_race_plans p
  where p.plan_kind='national_ranking'
    and p.event_key=v_event_key
    and p.owner_scope_key='club:'||v_club_id::text
    and p.status='submitted'
  limit 1;

  if v_plan.id is null or not (p_rider_id=any(v_plan.rider_ids)) then
    raise exception 'Submit the National Ranking Race Plan first.';
  end if;

  select exists(
    select 1
    from public.national_championship_entries en
    where en.edition_id=p_edition_id
      and en.rider_id=p_rider_id
      and public.universal_race_resource_owner_club_v1(en.club_id_snapshot)=v_club_id
  ) into v_real_entry;

  if v_real_entry then
    v_result:=public.save_my_national_championship_rider_plan_v1(
      p_edition_id,p_event_type,p_rider_id,null,
      p_phase_1_command,p_phase_2_command,p_phase_3_command,p_phase_4_command
    );
  else
    v_commands:=jsonb_build_object(
      'phase_1',jsonb_build_object('command',p_phase_1_command),
      'phase_2',jsonb_build_object('command',p_phase_2_command),
      'phase_3',jsonb_build_object('command',p_phase_3_command),
      'phase_4',jsonb_build_object('command',p_phase_4_command)
    );

    update public.national_special_race_plans
    set metadata=jsonb_set(
          coalesce(metadata,'{}'::jsonb),
          array['preview_stage_plans',p_rider_id::text],
          v_commands,
          true
        ),
        updated_at=now(),
        updated_by_user_id=v_uid
    where id=v_plan.id;

    v_result:=jsonb_build_object(
      'success',true,
      'preview_only',true,
      'rider_id',p_rider_id,
      'commands',v_commands
    );
  end if;

  return v_result;
end;
$function$;
