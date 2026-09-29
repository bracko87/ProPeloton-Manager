-- Repair National Team standard equipment preset aggregation on PostgreSQL.
-- UUID does not support max(uuid), so aggregate text and cast the single configured item back to uuid.

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
