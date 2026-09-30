CREATE OR REPLACE FUNCTION public.create_nations_competition_edition_v1(p_season_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current_season integer;
  v_season integer;
  v_count integer;
  v_plan jsonb;
  v_edition_id uuid;
  v_round_json jsonb;
  v_round_id uuid;
  v_group_plan jsonb;
  v_group_json jsonb;
begin
  select season_number into v_current_season
  from public.game_state
  where id=true;

  v_season:=coalesce(p_season_number,v_current_season);

  if v_season is null or v_season<>v_current_season then
    raise exception 'World Nations edition can only be generated for the current season.';
  end if;

  if exists(
    select 1
    from public.nations_competition_editions e
    where e.season_number=v_season
  ) then
    select id into v_edition_id
    from public.nations_competition_editions
    where season_number=v_season;

    return jsonb_build_object(
      'status','existing',
      'edition_id',v_edition_id,
      'season_number',v_season
    );
  end if;

  select count(*)::integer
  into v_count
  from public.national_associations a
  where a.status='active'
    and private.national_association_active_member_count_v1(a.id)>=(
      select minimum_active_members
      from public.national_association_config
      where id=true
    );

  if v_count=0 then
    return jsonb_build_object(
      'status','not_created',
      'reason','no_active_associations',
      'season_number',v_season
    );
  end if;

  v_plan:=public.nations_qualification_plan_v1(v_count);

  insert into public.nations_competition_editions(
    season_number,status,active_association_count,finalist_target,points_curve_version
  )
  values(
    v_season,'planned',v_count,least(16,v_count),1
  )
  returning id into v_edition_id;

  insert into public.nations_competition_entries(
    edition_id,association_id,country_code,seed_score,status
  )
  select
    v_edition_id,
    a.id,
    a.country_code,
    case
      when v_season<=1 then 0
      when h.final_rank is not null then
        greatest(
          1,
          1000000
          - (h.final_rank::integer * 10000)
          + least(coalesce(h.total_points,0),9999)
        )
      else 0
    end,
    'entered'
  from public.national_associations a
  left join lateral (
    select nh.final_rank,nh.total_points
    from public.nations_competition_history nh
    where nh.association_id=a.id
      and nh.season_number<v_season
    order by nh.season_number desc,nh.created_at desc
    limit 1
  ) h on true
  where a.status='active'
    and private.national_association_active_member_count_v1(a.id)>=(
      select minimum_active_members
      from public.national_association_config
      where id=true
    )
  order by
    case when h.final_rank is null then 1 else 0 end,
    h.final_rank nulls last,
    a.country_code;

  for v_round_json in
    select value
    from jsonb_array_elements(v_plan->'rounds')
  loop
    insert into public.nations_competition_rounds(
      edition_id,round_index,round_type,round_label,
      entrants_target,advance_target,group_count,
      group_size_min,group_size_max,status
    )
    values(
      v_edition_id,
      (v_round_json->>'round_index')::integer,
      v_round_json->>'round_type',
      v_round_json->>'round_label',
      (v_round_json->>'entrants_target')::integer,
      (v_round_json->>'advance_target')::integer,
      (v_round_json->>'group_count')::integer,
      (v_round_json->>'group_size_min')::integer,
      (v_round_json->>'group_size_max')::integer,
      'planned'
    )
    returning id into v_round_id;

    v_group_plan:=private.nations_distribute_group_counts_v1(
      (v_round_json->>'entrants_target')::integer,
      (v_round_json->>'group_count')::integer,
      case
        when v_round_json->>'round_type'='world_final'
          then (v_round_json->>'entrants_target')::integer
        else (v_round_json->>'advance_target')::integer
      end
    );

    for v_group_json in
      select value
      from jsonb_array_elements(v_group_plan)
    loop
      insert into public.nations_competition_groups(
        round_id,group_number,group_label,
        planned_entrant_count,planned_advance_count,status
      )
      values(
        v_round_id,
        (v_group_json->>'group_number')::integer,
        case
          when v_round_json->>'round_type'='world_final'
            then 'World Nations Final'
          else 'Group '||chr(64+(v_group_json->>'group_number')::integer)
        end,
        (v_group_json->>'entrant_count')::integer,
        case
          when v_round_json->>'round_type'='world_final' then 1
          else (v_group_json->>'advance_count')::integer
        end,
        'planned'
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'status','created',
    'edition_id',v_edition_id,
    'season_number',v_season,
    'active_associations',v_count,
    'plan',v_plan
  );
end;
$function$

