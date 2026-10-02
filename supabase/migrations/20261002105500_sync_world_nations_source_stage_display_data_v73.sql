
create or replace function public.sync_nations_event_source_display_data_v1(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_event public.nations_group_events%rowtype;
  v_source public.race_stages%rowtype;
  v_source_race public.races%rowtype;
  v_official_location text;
  v_official_city text;
  v_route_label text;
  v_start_city text;
  v_finish_city text;
  v_host_city text;
begin
  select * into v_event
  from public.nations_group_events
  where id=p_event_id;

  if v_event.id is null
     or v_event.race_id is null
     or v_event.stage_id is null
     or v_event.source_stage_id is null then
    return jsonb_build_object('updated',false,'reason','event_not_ready');
  end if;

  select * into v_source
  from public.race_stages
  where id=v_event.source_stage_id;

  if v_source.id is null then
    return jsonb_build_object('updated',false,'reason','source_stage_missing');
  end if;

  select * into v_source_race
  from public.races
  where id=v_source.race_id;

  v_official_location:=nullif(btrim(v_source.metadata->>'official_start_finish_location'),'');
  v_official_city:=case
    when v_official_location is null then null
    when position(',' in v_official_location)>0
      then nullif(btrim(split_part(v_official_location,',',2)),'')
    else v_official_location
  end;
  v_route_label:=coalesce(
    nullif(btrim(v_source.metadata->>'route_label'),''),
    nullif(btrim(v_source.metadata->>'official_route_label'),''),
    v_official_location
  );

  v_start_city:=coalesce(
    case
      when nullif(btrim(v_source.start_city_name),'') is not null
       and lower(btrim(v_source.start_city_name)) not like '% tour'
       and lower(btrim(v_source.start_city_name)) <> lower(btrim(coalesce(v_source_race.name,'')))
        then btrim(v_source.start_city_name)
    end,
    case
      when nullif(btrim(v_source.start_city),'') is not null
       and lower(btrim(v_source.start_city)) not like '% tour'
       and lower(btrim(v_source.start_city)) <> lower(btrim(coalesce(v_source_race.name,'')))
        then btrim(v_source.start_city)
    end,
    v_official_city,
    nullif(btrim(v_source.start_city_name),''),
    nullif(btrim(v_source.start_city),'')
  );

  v_finish_city:=coalesce(
    case
      when nullif(btrim(v_source.finish_city_name),'') is not null
       and lower(btrim(v_source.finish_city_name)) not like '% tour'
       and lower(btrim(v_source.finish_city_name)) <> lower(btrim(coalesce(v_source_race.name,'')))
        then btrim(v_source.finish_city_name)
    end,
    case
      when nullif(btrim(v_source.finish_city),'') is not null
       and lower(btrim(v_source.finish_city)) not like '% tour'
       and lower(btrim(v_source.finish_city)) <> lower(btrim(coalesce(v_source_race.name,'')))
        then btrim(v_source.finish_city)
    end,
    v_official_city,
    nullif(btrim(v_source.finish_city_name),''),
    nullif(btrim(v_source.finish_city),'')
  );

  v_host_city:=coalesce(
    case
      when nullif(btrim(v_source.host_city),'') is not null
       and lower(btrim(v_source.host_city)) not like '% tour'
       and lower(btrim(v_source.host_city)) <> lower(btrim(coalesce(v_source_race.name,'')))
        then btrim(v_source.host_city)
    end,
    v_official_city,
    v_start_city
  );

  update public.races r
  set host_city=coalesce(v_host_city,r.host_city),
      metadata=coalesce(r.metadata,'{}'::jsonb) || jsonb_build_object(
        'source_stage_id',v_source.id,
        'source_route_label',v_route_label,
        'source_official_location',v_official_location
      ),
      updated_at=now()
  where r.id=v_event.race_id;

  update public.race_stages rs
  set start_city=coalesce(v_start_city,rs.start_city),
      start_city_name=coalesce(v_start_city,rs.start_city_name),
      finish_city=coalesce(v_finish_city,rs.finish_city),
      finish_city_name=coalesce(v_finish_city,rs.finish_city_name),
      host_city=coalesce(v_host_city,rs.host_city),
      metadata=coalesce(rs.metadata,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'route_label',v_route_label,
        'official_start_finish_location',v_official_location,
        'source_stage_id',v_source.id,
        'source_display_data_synced',true
      )),
      updated_at=now()
  where rs.id=v_event.stage_id;

  update public.race_stage_profile_details d
  set route_label=coalesce(v_route_label,d.route_label),
      metadata=coalesce(d.metadata,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'route_label',v_route_label,
        'official_start_finish_location',v_official_location,
        'source_stage_id',v_source.id,
        'source_display_data_synced',true
      )),
      updated_at=now()
  where d.stage_id=v_event.stage_id;

  return jsonb_build_object(
    'updated',true,
    'event_id',v_event.id,
    'race_id',v_event.race_id,
    'stage_id',v_event.stage_id,
    'source_stage_id',v_source.id,
    'host_city',v_host_city,
    'start_city',v_start_city,
    'finish_city',v_finish_city,
    'route_label',v_route_label
  );
end;
$function$;

create or replace function public.trg_sync_nations_event_source_display_data_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.race_id is not null and new.stage_id is not null and new.source_stage_id is not null then
    perform public.sync_nations_event_source_display_data_v1(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_sync_nations_event_source_display_data_v1
  on public.nations_group_events;

create trigger trg_sync_nations_event_source_display_data_v1
after insert or update of race_id,stage_id,source_stage_id
on public.nations_group_events
for each row
execute function public.trg_sync_nations_event_source_display_data_v1();

do $block$
declare
  v_event record;
begin
  for v_event in
    select id
    from public.nations_group_events
    where race_id is not null
      and stage_id is not null
      and source_stage_id is not null
  loop
    perform public.sync_nations_event_source_display_data_v1(v_event.id);
  end loop;
end;
$block$;
