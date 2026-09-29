create or replace function private.ensure_national_team_standard_presets_v1(
  p_club_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_count integer;
begin
  if p_club_id is null then
    raise exception 'Technical National Team club ID is required.';
  end if;

  with specs(slot_no,specialization,setup_name) as (
    values
      (1::smallint,'flat'::text,'National Team · Flat'),
      (2::smallint,'mountain'::text,'National Team · Mountain'),
      (3::smallint,'time_trial'::text,'National Team · Time Trial')
  ),
  pivoted as (
    select
      s.slot_no,s.specialization,s.setup_name,
      max(e.catalog_item_id::text) filter(where e.equipment_category='frame')::uuid as frame_id,
      max(e.catalog_item_id::text) filter(where e.equipment_category='wheelset')::uuid as wheelset_id,
      max(e.catalog_item_id::text) filter(where e.equipment_category='tires')::uuid as tires_id,
      max(e.catalog_item_id::text) filter(where e.equipment_category='groupset')::uuid as groupset_id,
      max(e.catalog_item_id::text) filter(where e.equipment_category='helmet')::uuid as helmet_id,
      max(e.catalog_item_id::text) filter(where e.equipment_category='shoes')::uuid as shoes_id
    from specs s
    left join public.national_team_standard_equipment e
      on e.specialization=s.specialization and e.is_active=true
    group by s.slot_no,s.specialization,s.setup_name
  )
  insert into public.club_equipment_setup_presets(
    club_id,setup_slot,setup_name,
    frame_catalog_item_id,wheelset_catalog_item_id,tires_catalog_item_id,
    groupset_catalog_item_id,helmet_catalog_item_id,shoes_catalog_item_id,
    metadata
  )
  select
    p_club_id,p.slot_no,p.setup_name,
    p.frame_id,p.wheelset_id,p.tires_id,p.groupset_id,p.helmet_id,p.shoes_id,
    jsonb_build_object(
      'national_team_standard',true,
      'system_provided',true,
      'specialization',p.specialization,
      'cost_model','system_covered'
    )
  from pivoted p
  on conflict(club_id,setup_slot) do update
  set setup_name=excluded.setup_name,
      frame_catalog_item_id=excluded.frame_catalog_item_id,
      wheelset_catalog_item_id=excluded.wheelset_catalog_item_id,
      tires_catalog_item_id=excluded.tires_catalog_item_id,
      groupset_catalog_item_id=excluded.groupset_catalog_item_id,
      helmet_catalog_item_id=excluded.helmet_catalog_item_id,
      shoes_catalog_item_id=excluded.shoes_catalog_item_id,
      metadata=public.club_equipment_setup_presets.metadata||excluded.metadata,
      updated_at=now();

  get diagnostics v_count=row_count;

  return jsonb_build_object(
    'club_id',p_club_id,
    'preset_count',v_count,
    'slots',jsonb_build_array(1,2,3)
  );
end;
$function$;

revoke all on function private.ensure_national_team_standard_presets_v1(uuid)
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
    v_assoc.id,
    upper(v_assoc.country_code),
    v_club_id,
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

  return v_club_id;
end;
$function$;
