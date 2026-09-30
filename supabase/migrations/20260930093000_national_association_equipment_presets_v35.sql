-- National Association equipment UX:
-- - one default Flat setup in slot 1
-- - slots 2 and 3 start empty and are coach-customizable
-- - Association members can read the three setup slots; only the active National Coach can save them.

create or replace function private.ensure_national_team_standard_presets_v1(
  p_club_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_flat_frame uuid;
  v_flat_wheelset uuid;
  v_flat_tires uuid;
  v_flat_groupset uuid;
  v_flat_helmet uuid;
  v_flat_shoes uuid;
  v_count integer:=0;
  v_rows integer:=0;
begin
  if p_club_id is null then
    raise exception 'Technical National Team club ID is required.';
  end if;

  select
    max(o.catalog_item_id::text) filter(where o.equipment_category='frame')::uuid,
    max(o.catalog_item_id::text) filter(where o.equipment_category='wheelset')::uuid,
    max(o.catalog_item_id::text) filter(where o.equipment_category='tires')::uuid,
    max(o.catalog_item_id::text) filter(where o.equipment_category='groupset')::uuid,
    max(o.catalog_item_id::text) filter(where o.equipment_category='helmet')::uuid,
    max(o.catalog_item_id::text) filter(where o.equipment_category='shoes')::uuid
  into
    v_flat_frame,
    v_flat_wheelset,
    v_flat_tires,
    v_flat_groupset,
    v_flat_helmet,
    v_flat_shoes
  from public.national_team_equipment_options o
  where o.is_active=true
    and o.specialization='flat'
    and o.choice_rank=1;

  insert into public.club_equipment_setup_presets(
    club_id,setup_slot,setup_name,
    frame_catalog_item_id,wheelset_catalog_item_id,tires_catalog_item_id,
    groupset_catalog_item_id,helmet_catalog_item_id,shoes_catalog_item_id,
    metadata
  )
  values(
    p_club_id,1,'National Team · Flat',
    v_flat_frame,v_flat_wheelset,v_flat_tires,
    v_flat_groupset,v_flat_helmet,v_flat_shoes,
    jsonb_build_object(
      'national_team_standard',true,
      'system_provided',true,
      'default_generated',true,
      'coach_customizable',true,
      'selection_pool','national_team_equipment_options',
      'condition_locked_percent',100,
      'cost_model','system_covered',
      'slot_purpose','flat',
      'empty_slot',false
    )
  )
  on conflict(club_id,setup_slot) do update
  set
    setup_name='National Team · Flat',
    frame_catalog_item_id=excluded.frame_catalog_item_id,
    wheelset_catalog_item_id=excluded.wheelset_catalog_item_id,
    tires_catalog_item_id=excluded.tires_catalog_item_id,
    groupset_catalog_item_id=excluded.groupset_catalog_item_id,
    helmet_catalog_item_id=excluded.helmet_catalog_item_id,
    shoes_catalog_item_id=excluded.shoes_catalog_item_id,
    metadata=coalesce(public.club_equipment_setup_presets.metadata,'{}'::jsonb)
      || jsonb_build_object(
        'national_team_standard',true,
        'system_provided',true,
        'default_generated',true,
        'coach_customizable',true,
        'selection_pool','national_team_equipment_options',
        'condition_locked_percent',100,
        'cost_model','system_covered',
        'slot_purpose','flat',
        'empty_slot',false
      ),
    updated_at=now()
  where coalesce((public.club_equipment_setup_presets.metadata->>'coach_customized')::boolean,false)=false;

  get diagnostics v_count=row_count;

  insert into public.club_equipment_setup_presets(
    club_id,setup_slot,setup_name,
    frame_catalog_item_id,wheelset_catalog_item_id,tires_catalog_item_id,
    groupset_catalog_item_id,helmet_catalog_item_id,shoes_catalog_item_id,
    metadata
  )
  select
    p_club_id,
    slot_no,
    'Setup '||slot_no,
    null,null,null,null,null,null,
    jsonb_build_object(
      'national_team_standard',true,
      'system_provided',true,
      'default_generated',true,
      'coach_customizable',true,
      'selection_pool','national_team_equipment_options',
      'condition_locked_percent',100,
      'cost_model','system_covered',
      'slot_purpose','custom',
      'empty_slot',true
    )
  from (values (2::smallint),(3::smallint)) slots(slot_no)
  on conflict(club_id,setup_slot) do update
  set
    setup_name='Setup '||excluded.setup_slot,
    frame_catalog_item_id=null,
    wheelset_catalog_item_id=null,
    tires_catalog_item_id=null,
    groupset_catalog_item_id=null,
    helmet_catalog_item_id=null,
    shoes_catalog_item_id=null,
    metadata=coalesce(public.club_equipment_setup_presets.metadata,'{}'::jsonb)
      || jsonb_build_object(
        'national_team_standard',true,
        'system_provided',true,
        'default_generated',true,
        'coach_customizable',true,
        'selection_pool','national_team_equipment_options',
        'condition_locked_percent',100,
        'cost_model','system_covered',
        'slot_purpose','custom',
        'empty_slot',true
      ),
    updated_at=now()
  where coalesce((public.club_equipment_setup_presets.metadata->>'coach_customized')::boolean,false)=false;

  get diagnostics v_rows=row_count;
  v_count:=v_count+v_rows;

  return jsonb_build_object(
    'club_id',p_club_id,
    'preset_count',v_count,
    'slots',jsonb_build_array(1,2,3),
    'default_slot',1,
    'coach_customizable',true
  );
end;
$function$;

revoke all on function private.ensure_national_team_standard_presets_v1(uuid)
from public,anon,authenticated;

create or replace function public.get_my_national_team_equipment_presets_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_club record;
  v_assoc public.national_associations%rowtype;
  v_team_id uuid;
  v_can_edit boolean:=false;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_club
  from private.national_association_eligible_main_club_v1(v_uid);

  if v_club.club_id is null then
    return jsonb_build_object(
      'allowed',false,
      'can_edit',false,
      'reason','no_active_human_main_club',
      'presets','[]'::jsonb
    );
  end if;

  select * into v_assoc
  from public.national_associations a
  where upper(a.country_code)=upper(v_club.country_code)
  limit 1;

  if v_assoc.id is null then
    return jsonb_build_object(
      'allowed',false,
      'can_edit',false,
      'reason','association_not_created',
      'presets','[]'::jsonb
    );
  end if;

  v_team_id:=private.ensure_national_association_race_team_v1(v_assoc.id);
  perform private.ensure_national_team_standard_presets_v1(v_team_id);

  select exists(
    select 1
    from private.current_national_coach_context_v1(v_uid) c
    where c.association_id=v_assoc.id
  )
  into v_can_edit;

  return jsonb_build_object(
    'allowed',true,
    'can_edit',v_can_edit,
    'association_id',v_assoc.id,
    'technical_club_id',v_team_id,
    'default_slot',1,
    'presets',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'preset_id',p.id,
          'setup_slot',p.setup_slot,
          'setup_name',p.setup_name,
          'slot_purpose',coalesce(p.metadata->>'slot_purpose','custom'),
          'is_empty',
            p.frame_catalog_item_id is null
            or p.wheelset_catalog_item_id is null
            or p.tires_catalog_item_id is null
            or p.groupset_catalog_item_id is null
            or p.helmet_catalog_item_id is null
            or p.shoes_catalog_item_id is null,
          'frame_catalog_item_id',p.frame_catalog_item_id,
          'wheelset_catalog_item_id',p.wheelset_catalog_item_id,
          'tires_catalog_item_id',p.tires_catalog_item_id,
          'groupset_catalog_item_id',p.groupset_catalog_item_id,
          'helmet_catalog_item_id',p.helmet_catalog_item_id,
          'shoes_catalog_item_id',p.shoes_catalog_item_id
        )
        order by p.setup_slot
      )
      from public.club_equipment_setup_presets p
      where p.club_id=v_team_id
        and p.setup_slot between 1 and 3
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_my_national_team_equipment_presets_v1()
from public,anon;
grant execute on function public.get_my_national_team_equipment_presets_v1()
to authenticated;

create or replace function public.save_my_national_team_equipment_preset_v1(
  p_setup_slot smallint,
  p_setup_name text,
  p_frame_catalog_item_id uuid,
  p_wheelset_catalog_item_id uuid,
  p_tires_catalog_item_id uuid,
  p_groupset_catalog_item_id uuid,
  p_helmet_catalog_item_id uuid,
  p_shoes_catalog_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_team_id uuid;
  v_name text:=btrim(coalesce(p_setup_name,''));
  v_valid_count integer:=0;
  v_preset_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if p_setup_slot not between 1 and 3 then
    raise exception 'National Team equipment set slot must be 1, 2 or 3.';
  end if;

  if v_name='' then
    v_name:='Setup '||p_setup_slot;
  end if;

  if char_length(v_name)>60 then
    raise exception 'Equipment set name cannot exceed 60 characters.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can edit National Team equipment sets.';
  end if;

  with requested(category,catalog_item_id) as (
    values
      ('frame'::text,p_frame_catalog_item_id),
      ('wheelset'::text,p_wheelset_catalog_item_id),
      ('tires'::text,p_tires_catalog_item_id),
      ('groupset'::text,p_groupset_catalog_item_id),
      ('helmet'::text,p_helmet_catalog_item_id),
      ('shoes'::text,p_shoes_catalog_item_id)
  )
  select count(*)::integer
  into v_valid_count
  from requested r
  where r.catalog_item_id is not null
    and exists(
      select 1
      from public.national_team_equipment_options o
      where o.equipment_category=r.category
        and o.catalog_item_id=r.catalog_item_id
        and o.is_active=true
    );

  if v_valid_count<>6 then
    raise exception 'Every equipment category must use an item from the National Team package.';
  end if;

  v_team_id:=private.ensure_national_association_race_team_v1(v_ctx.association_id);
  perform private.ensure_national_team_standard_presets_v1(v_team_id);

  update public.club_equipment_setup_presets p
  set
    setup_name=v_name,
    frame_catalog_item_id=p_frame_catalog_item_id,
    wheelset_catalog_item_id=p_wheelset_catalog_item_id,
    tires_catalog_item_id=p_tires_catalog_item_id,
    groupset_catalog_item_id=p_groupset_catalog_item_id,
    helmet_catalog_item_id=p_helmet_catalog_item_id,
    shoes_catalog_item_id=p_shoes_catalog_item_id,
    metadata=coalesce(p.metadata,'{}'::jsonb)||jsonb_build_object(
      'national_team_standard',true,
      'system_provided',true,
      'coach_customized',true,
      'default_generated',false,
      'saved_by_user_id',v_uid,
      'saved_at',now(),
      'slot_purpose','custom',
      'empty_slot',false,
      'selection_pool','national_team_equipment_options',
      'condition_locked_percent',100,
      'cost_model','system_covered'
    ),
    updated_at=now()
  where p.club_id=v_team_id
    and p.setup_slot=p_setup_slot
  returning p.id into v_preset_id;

  if v_preset_id is null then
    raise exception 'National Team equipment set could not be resolved.';
  end if;

  return jsonb_build_object(
    'saved',true,
    'preset_id',v_preset_id,
    'setup_slot',p_setup_slot,
    'setup_name',v_name,
    'technical_club_id',v_team_id
  );
end;
$function$;

revoke all on function public.save_my_national_team_equipment_preset_v1(
  smallint,text,uuid,uuid,uuid,uuid,uuid,uuid
) from public,anon;
grant execute on function public.save_my_national_team_equipment_preset_v1(
  smallint,text,uuid,uuid,uuid,uuid,uuid,uuid
) to authenticated;

do $$
declare
  r record;
begin
  for r in
    select distinct technical_club_id
    from public.national_association_race_team_identities
    where technical_club_id is not null
  loop
    perform private.ensure_national_team_standard_presets_v1(r.technical_club_id);
  end loop;
end;
$$;
