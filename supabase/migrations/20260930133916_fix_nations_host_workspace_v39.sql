-- Runtime correction for v38 host workspace missing-types JSON.

create or replace function public.get_nations_host_application_workspace_v1(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_edition public.nations_competition_editions%rowtype;
  v_country_code text;
  v_association_id uuid;
  v_can_apply boolean:=false;
  v_ttt jsonb:='[]'::jsonb;
  v_flat jsonb:='[]'::jsonb;
  v_mountain jsonb:='[]'::jsonb;
  v_applications jsonb:='[]'::jsonb;
  v_my_apps jsonb:='[]'::jsonb;
  v_final_host text;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id;

  if v_edition.id is null then
    raise exception 'World Nations edition not found.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is not null
     and v_ctx.season_number=v_edition.season_number then
    v_association_id:=v_ctx.association_id;
    v_country_code:=upper(v_ctx.country_code);
    v_can_apply:=true;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'application_id',h.id,
      'association_id',h.association_id,
      'association_name',a.name,
      'country_code',a.country_code,
      'host_scope',h.host_scope,
      'status',h.status,
      'submitted_on',h.submitted_on_game_date
    )
    order by h.host_scope,a.country_code
  ),'[]'::jsonb)
  into v_applications
  from public.nations_host_applications h
  join public.national_associations a on a.id=h.association_id
  where h.edition_id=v_edition.id
    and h.status<>'withdrawn';

  if v_association_id is not null then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'application_id',h.id,
        'host_scope',h.host_scope,
        'status',h.status,
        'ttt_stage_id',h.ttt_stage_id,
        'flat_stage_id',h.flat_stage_id,
        'mountain_stage_id',h.mountain_stage_id,
        'statement',h.statement,
        'submitted_on',h.submitted_on_game_date
      )
      order by h.host_scope
    ),'[]'::jsonb)
    into v_my_apps
    from public.nations_host_applications h
    where h.edition_id=v_edition.id
      and h.association_id=v_association_id
      and h.status<>'withdrawn';

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'stage_id',s.id,
        'stage_name',s.name,
        'race_name',r.name,
        'route_label',concat_ws(' → ',
          nullif(coalesce(s.start_city_name,s.start_city),''),
          nullif(coalesce(s.finish_city_name,s.finish_city),'')
        ),
        'distance_km',s.distance_km,
        'terrain_type',s.terrain_type,
        'stage_format',s.stage_format
      )
      order by r.name,s.stage_number
    ),'[]'::jsonb)
    into v_ttt
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_country_code
      and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
      and coalesce((r.metadata->>'national_championship')::boolean,false)=false
      and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
      and s.stage_format='team_time_trial'
      and s.distance_km between 18 and 48;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'stage_id',s.id,
        'stage_name',s.name,
        'race_name',r.name,
        'route_label',concat_ws(' → ',
          nullif(coalesce(s.start_city_name,s.start_city),''),
          nullif(coalesce(s.finish_city_name,s.finish_city),'')
        ),
        'distance_km',s.distance_km,
        'terrain_type',s.terrain_type,
        'stage_format',s.stage_format
      )
      order by r.name,s.stage_number
    ),'[]'::jsonb)
    into v_flat
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_country_code
      and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
      and coalesce((r.metadata->>'national_championship')::boolean,false)=false
      and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
      and s.stage_format='road_race'
      and s.terrain_type='flat'
      and s.distance_km between 140 and 220;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'stage_id',s.id,
        'stage_name',s.name,
        'race_name',r.name,
        'route_label',concat_ws(' → ',
          nullif(coalesce(s.start_city_name,s.start_city),''),
          nullif(coalesce(s.finish_city_name,s.finish_city),'')
        ),
        'distance_km',s.distance_km,
        'terrain_type',s.terrain_type,
        'stage_format',s.stage_format
      )
      order by r.name,s.stage_number
    ),'[]'::jsonb)
    into v_mountain
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_country_code
      and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
      and coalesce((r.metadata->>'national_championship')::boolean,false)=false
      and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
      and s.stage_format='road_race'
      and s.terrain_type in ('hilly','mountain')
      and s.distance_km between 135 and 220;
  end if;

  select g.host_country_code
  into v_final_host
  from public.nations_competition_groups g
  join public.nations_competition_rounds r on r.id=g.round_id
  where r.edition_id=v_edition.id
    and r.round_type='world_final'
  order by g.group_number
  limit 1;

  return jsonb_build_object(
    'edition_id',v_edition.id,
    'season_number',v_edition.season_number,
    'viewer_can_apply',v_can_apply,
    'viewer_association_id',v_association_id,
    'viewer_country_code',v_country_code,
    'country_has_complete_bundle',
      jsonb_array_length(v_ttt)>0
      and jsonb_array_length(v_flat)>0
      and jsonb_array_length(v_mountain)>0,
    'missing_types',to_jsonb(array_remove(ARRAY[
      case when jsonb_array_length(v_ttt)=0 then 'team_time_trial' end,
      case when jsonb_array_length(v_flat)=0 then 'flat' end,
      case when jsonb_array_length(v_mountain)=0 then 'hilly_mountain' end
    ]::text[],null)),
    'stage_options',jsonb_build_object(
      'team_time_trial',v_ttt,
      'flat',v_flat,
      'hilly_mountain',v_mountain
    ),
    'applications',v_applications,
    'my_applications',v_my_apps,
    'world_final_host_country_code',v_final_host
  );
end;
$function$;

revoke all on function public.get_nations_host_application_workspace_v1(uuid)
from public,anon;
grant execute on function public.get_nations_host_application_workspace_v1(uuid)
to authenticated;

