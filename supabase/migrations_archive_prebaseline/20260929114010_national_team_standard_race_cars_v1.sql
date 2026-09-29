create or replace function private.ensure_national_team_standard_cars_v1(
  p_club_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_cfg public.infrastructure_asset_config%rowtype;
  v_slot integer;
  v_count integer:=0;
begin
  if p_club_id is null then
    raise exception 'Technical National Team club ID is required.';
  end if;

  select * into v_cfg
  from public.infrastructure_asset_config
  where asset_key='team_car'
  order by asset_level desc
  limit 1;

  if v_cfg.asset_level is null then
    raise exception 'Team car asset configuration is missing.';
  end if;

  for v_slot in 1..coalesce(v_cfg.max_total_quantity,10)
  loop
    insert into public.club_team_cars(
      club_id,garage_slot,asset_key,asset_level,display_name,
      purchase_cost_cash,support_value,condition_percent,status,
      total_race_days,total_distance_km,acquired_game_date,
      current_assignment_type,current_assignment_id,current_assignment_label,
      assignment_locked,assignment_start_game_date,assignment_end_game_date,
      metadata
    )
    values(
      p_club_id,v_slot,'team_car',v_cfg.asset_level,
      'National Team Car #'||v_slot,0,v_cfg.support_value,100,'available',
      0,0,public.get_current_game_date_date(),
      null,null,null,false,null,null,
      jsonb_build_object(
        'national_team_standard',true,
        'system_provided',true,
        'cost_model','system_covered',
        'asset_config_level',v_cfg.asset_level
      )
    )
    on conflict(club_id,garage_slot) where status<>'sold'
    do update
    set asset_level=excluded.asset_level,
        display_name=excluded.display_name,
        purchase_cost_cash=0,
        support_value=excluded.support_value,
        condition_percent=100,
        status='available',
        current_assignment_type=null,
        current_assignment_id=null,
        current_assignment_label=null,
        assignment_locked=false,
        assignment_start_game_date=null,
        assignment_end_game_date=null,
        metadata=public.club_team_cars.metadata||excluded.metadata,
        updated_at=now();

    v_count:=v_count+1;
  end loop;

  return jsonb_build_object(
    'club_id',p_club_id,
    'asset_key','team_car',
    'asset_level',v_cfg.asset_level,
    'fleet_quantity',v_count,
    'max_assigned_per_event',v_cfg.max_assigned_per_event,
    'support_value',v_cfg.support_value
  );
end;
$function$;

revoke all on function private.ensure_national_team_standard_cars_v1(uuid)
from public,anon,authenticated;

create or replace function private.ensure_national_association_race_team_v1(
  p_association_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assoc public.national_associations%rowtype;
  v_existing public.national_association_race_team_identities%rowtype;
  v_club_id uuid;
  v_division text;
  v_name text;
  v_generated boolean:=false;
begin
  if p_association_id is null then
    raise exception 'Association ID is required.';
  end if;

  select * into v_existing
  from public.national_association_race_team_identities
  where association_id=p_association_id;

  if v_existing.technical_club_id is not null then
    perform private.ensure_national_team_standard_presets_v1(v_existing.technical_club_id);
    perform private.ensure_national_team_standard_cars_v1(v_existing.technical_club_id);
    return v_existing.technical_club_id;
  end if;

  select * into v_assoc
  from public.national_associations
  where id=p_association_id;

  if v_assoc.id is null then
    raise exception 'National Association not found.';
  end if;

  select c.id into v_club_id
  from public.clubs c
  where upper(c.country_code)=upper(v_assoc.country_code)
    and c.is_ai=true
    and c.deleted_at is null
    and public.is_national_team_club_v1(c.id)
  order by
    case
      when lower(c.name)=lower(v_assoc.country_code||' National Team') then 0
      when lower(c.name) like '%national team%' then 1
      else 2
    end,
    c.is_active desc,
    c.created_at
  limit 1;

  if v_club_id is null then
    v_division:=coalesce(
      public.safe_get_amateur_division_for_country(v_assoc.country_code),
      'INTERNATIONAL'
    );
    v_name:=upper(v_assoc.country_code)||' National Team';

    insert into public.clubs(
      owner_user_id,name,country_code,primary_color,secondary_color,logo_path,
      motto,crest_style,world_tier,reputation,cash_balance,club_tier,
      amateur_division,season_points,is_ai,is_active,club_type,
      created_game_date,inactivity_status,inactive_ai_controlled
    )
    values(
      null,v_name,upper(v_assoc.country_code),'#1D4ED8','#FACC15',
      'https://flagcdn.com/w160/'||lower(v_assoc.country_code)||'.png',
      'National Team',null,3,0,0,'amateur'::public.club_tier,
      v_division,0,true,false,'main',public.get_current_game_date_date(),
      'active',false
    )
    returning id into v_club_id;

    v_generated:=true;
  end if;

  insert into public.national_association_race_team_identities(
    association_id,country_code,technical_club_id,identity_source
  )
  values(
    v_assoc.id,upper(v_assoc.country_code),v_club_id,
    case when v_generated
      then 'generated_hidden_national_team'
      else 'existing_national_team_pool'
    end
  )
  on conflict(association_id) do update
  set country_code=excluded.country_code,
      technical_club_id=excluded.technical_club_id,
      identity_source=excluded.identity_source,
      updated_at=now();

  perform private.ensure_national_team_standard_presets_v1(v_club_id);
  perform private.ensure_national_team_standard_cars_v1(v_club_id);

  return v_club_id;
end;
$function$;
