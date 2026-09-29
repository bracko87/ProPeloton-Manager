CREATE OR REPLACE FUNCTION public.get_national_ranking_page_v1(p_country_code text DEFAULT NULL::text, p_season_number integer DEFAULT NULL::integer, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_season integer;
  v_game_date date;
  v_country text;
  v_country_name text;
  v_limit integer;
  v_ranking_count integer := 0;
  v_projection jsonb := '{}'::jsonb;
  e public.national_championship_editions%rowtype;
  v_has_snapshot boolean := false;
begin
  v_user_id:=auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_game_date
  from public.game_state gs
  where gs.id=true;

  v_season:=coalesce(p_season_number,v_season);
  v_limit:=greatest(1,least(coalesce(p_limit,200),500));

  /*
   * Manager view is intentionally locked to the manager's own main-club nation.
   * p_country_code remains in the signature for backward API compatibility only.
   */
  select upper(c.country_code)
  into v_country
  from public.clubs c
  where c.owner_user_id=v_user_id
    and c.parent_club_id is null
  order by c.created_at,c.id
  limit 1;

  if v_country is null then
    raise exception 'Your main club does not have a country assigned';
  end if;

  select coalesce(c.name,v_country)
  into v_country_name
  from public.countries c
  where upper(c.code)=v_country
  limit 1;

  v_country_name:=coalesce(v_country_name,v_country);

  select * into e
  from public.national_championship_editions
  where season_number=v_season
    and country_code=v_country
    and discipline='road'
  limit 1;

  if e.id is not null then
    select exists(
      select 1
      from public.national_championship_ranking_snapshots s
      where s.edition_id=e.id
    ) into v_has_snapshot;
  end if;

  if v_has_snapshot then
    select count(*)::int
    into v_ranking_count
    from public.national_championship_ranking_snapshots s
    where s.edition_id=e.id;
  else
    select count(*)::int
    into v_ranking_count
    from public.preview_national_ranking_v1(
      v_country,
      case
        when e.id is null then v_game_date
        else least(v_game_date,e.ranking_snapshot_date)
      end
    );
  end if;

  v_projection:=public.national_championship_population_plan_v1(v_ranking_count);

  return jsonb_build_object(
    'season_number',v_season,
    'current_game_date',v_game_date,
    'country_code',v_country,
    'country_name',v_country_name,
    'my_club_ids',coalesce((
      select jsonb_agg(c.id order by c.created_at,c.id)
      from public.clubs c
      where c.owner_user_id=v_user_id
         or exists (
           select 1
           from public.clubs root
           where root.id=c.parent_club_id
             and root.owner_user_id=v_user_id
         )
    ),'[]'::jsonb),
    'countries',jsonb_build_array(
      jsonb_build_object(
        'code',v_country,
        'name',v_country_name,
        'status',coalesce(e.status,'planned'),
        'final_date',e.final_date
      )
    ),
    'edition',case when e.id is null then null else to_jsonb(e) end,
    'organizer_supplies',(
      select c.organizer_supplies
      from public.national_championship_config c
      where c.id=true
    ),
    'preparation_mode',jsonb_build_object(
      'automatic_entry',true,
      'staff_locked',true,
      'assets_locked',true,
      'club_supplies_locked',true,
      'individual_only',true,
      'team_commands_enabled',false,
      'rider_equipment_editable',true,
      'individual_tactics_editable',true
    ),
    'ranking_is_frozen',v_has_snapshot,
    'ranking_total',v_ranking_count,
    'qualification_projection',v_projection,

    'qualification_host',case
      when e.id is null or e.qualification_source_stage_id is null then null
      else (
        select jsonb_build_object(
          'stage_id',s.id,
          'source_race_id',s.race_id,
          'start_city',coalesce(nullif(s.start_city_name,''),nullif(s.start_city,''),'Start'),
          'finish_city',coalesce(nullif(s.finish_city_name,''),nullif(s.finish_city,''),'Finish'),
          'route_label',
            coalesce(nullif(s.start_city_name,''),nullif(s.start_city,''),'Start')
            ||' → '||
            coalesce(nullif(s.finish_city_name,''),nullif(s.finish_city,''),'Finish'),
          'distance_km',s.distance_km,
          'terrain_type',s.terrain_type,
          'elevation_gain_m',s.elevation_gain_m,
          'profile_type',s.profile_type
        )
        from public.race_stages s
        where s.id=e.qualification_source_stage_id
      )
    end,

    'final_host',case
      when e.id is null or e.final_source_stage_id is null then null
      else (
        select jsonb_build_object(
          'stage_id',s.id,
          'source_race_id',s.race_id,
          'start_city',coalesce(nullif(s.start_city_name,''),nullif(s.start_city,''),'Start'),
          'finish_city',coalesce(nullif(s.finish_city_name,''),nullif(s.finish_city,''),'Finish'),
          'route_label',
            coalesce(nullif(s.start_city_name,''),nullif(s.start_city,''),'Start')
            ||' → '||
            coalesce(nullif(s.finish_city_name,''),nullif(s.finish_city,''),'Finish'),
          'distance_km',s.distance_km,
          'terrain_type',s.terrain_type,
          'elevation_gain_m',s.elevation_gain_m,
          'profile_type',s.profile_type
        )
        from public.race_stages s
        where s.id=e.final_source_stage_id
      )
    end,

    'ranking',coalesce((
      select jsonb_agg(to_jsonb(r) order by r.national_rank)
      from (
        select
          s.national_rank,
          s.rider_id,
          current_club.club_id,
          current_club.club_name,
          s.rider_name_snapshot as rider_name,
          s.country_code_snapshot as country_code,
          s.raw_points,
          s.weighted_points,
          s.best_weighted_result,
          s.latest_result_date,
          s.overall_snapshot as overall,
          en.entry_path,
          en.entry_status,
          en.heat_number
        from public.national_championship_ranking_snapshots s
        left join lateral (
          select cr.club_id,c.name as club_name
          from public.club_riders cr
          join public.clubs c on c.id=cr.club_id
          where cr.rider_id=s.rider_id
          order by cr.created_at desc,cr.id desc
          limit 1
        ) current_club on true
        left join public.national_championship_entries en
          on en.edition_id=s.edition_id
         and en.rider_id=s.rider_id
        where v_has_snapshot
          and s.edition_id=e.id
        order by s.national_rank
        limit v_limit
      ) r
    ),case
      when e.id is null then coalesce((
        select jsonb_agg(to_jsonb(r) order by r.national_rank)
        from (
          select
            p.national_rank,
            p.rider_id,
            p.club_id,
            c.name as club_name,
            p.rider_name,
            p.country_code,
            p.raw_points,
            p.weighted_points,
            p.best_weighted_result,
            p.latest_result_date,
            p.overall,
            null::text as entry_path,
            null::text as entry_status,
            null::integer as heat_number
          from public.preview_national_ranking_v1(v_country,v_game_date) p
          left join public.clubs c on c.id=p.club_id
          order by p.national_rank
          limit v_limit
        ) r
      ),'[]'::jsonb)
      else coalesce((
        select jsonb_agg(to_jsonb(r) order by r.national_rank)
        from (
          select
            p.national_rank,
            p.rider_id,
            p.club_id,
            c.name as club_name,
            p.rider_name,
            p.country_code,
            p.raw_points,
            p.weighted_points,
            p.best_weighted_result,
            p.latest_result_date,
            p.overall,
            null::text as entry_path,
            null::text as entry_status,
            null::integer as heat_number
          from public.preview_national_ranking_v1(
            v_country,
            least(v_game_date,e.ranking_snapshot_date)
          ) p
          left join public.clubs c on c.id=p.club_id
          order by p.national_rank
          limit v_limit
        ) r
      ),'[]'::jsonb)
    end),

    'heats',case when e.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',h.id,
          'heat_number',h.heat_number,
          'qualification_date',h.qualification_date,
          'qualifying_places',h.qualifying_places,
          'assigned_count',h.assigned_count,
          'race_id',h.race_id,
          'status',h.status
        )
        order by h.heat_number
      )
      from public.national_championship_heats h
      where h.edition_id=e.id
    ),'[]'::jsonb) end,

    'my_entries',case when e.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'entry_id',en.id,
          'rider_id',en.rider_id,
          'rider_name',en.rider_name_snapshot,
          'national_rank',en.national_rank,
          'entry_path',en.entry_path,
          'entry_status',en.entry_status,
          'participation_decision',en.participation_decision,
          'participation_decision_at',en.participation_decision_at,
          'refusal_morale_delta',en.refusal_morale_delta,
          'participation_decision_deadline',e.participation_decision_deadline,
          'duty_window_start_date',
            case when en.entry_path='qualification'
              then h.qualification_date
              else e.final_date
            end,
          'duty_window_end_date',
            case when en.entry_path='qualification'
              then h.qualification_date
              else e.final_date
            end,
          'can_decide_participation',
            en.participation_decision='pending'
            and e.participation_decision_deadline is not null
            and v_game_date<=e.participation_decision_deadline,
          'heat_id',en.heat_id,
          'heat_number',en.heat_number,
          'qualification_race_id',h.race_id,
          'final_race_id',e.final_race_id,
          'qualification_plan',to_jsonb(qp),
          'final_plan',to_jsonb(fp),
          'club_id',en.club_id_snapshot,
          'club_name',rider_club.name
        )
        order by en.national_rank
      )
      from public.national_championship_entries en
      join public.clubs rider_club on rider_club.id=en.club_id_snapshot
      join public.clubs owner_club
        on owner_club.id=case
          when rider_club.club_type='developing'
               and rider_club.parent_club_id is not null
            then rider_club.parent_club_id
          else rider_club.id
        end
      left join public.national_championship_heats h on h.id=en.heat_id
      left join public.national_championship_rider_plans qp
        on qp.edition_id=en.edition_id
       and qp.rider_id=en.rider_id
       and qp.event_type='qualification'
      left join public.national_championship_rider_plans fp
        on fp.edition_id=en.edition_id
       and fp.rider_id=en.rider_id
       and fp.event_type='final'
      where en.edition_id=e.id
        and owner_club.owner_user_id=v_user_id
    ),'[]'::jsonb) end,

    'equipment_presets',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',p.id,
          'club_id',p.club_id,
          'setup_name',p.setup_name,
          'setup_slot',p.setup_slot
        )
        order by p.club_id,p.setup_slot
      )
      from public.club_equipment_setup_presets p
      join public.clubs c on c.id=p.club_id
      left join public.clubs parent on parent.id=c.parent_club_id
      where c.owner_user_id=v_user_id
         or parent.owner_user_id=v_user_id
    ),'[]'::jsonb),

    'results',case when e.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'event_type',rh.event_type,
          'heat_id',rh.heat_id,
          'rider_id',rh.rider_id,
          'rider_name',rh.rider_name_snapshot,
          'club_id',rh.club_id_snapshot,
          'club_name',rh.club_name_snapshot,
          'rank',rh.rank,
          'status',rh.status,
          'race_id',rh.race_id
        )
        order by
          case when rh.event_type='final' then 0 else 1 end,
          coalesce(h.heat_number,0),
          rh.rank
      )
      from public.national_championship_result_history rh
      left join public.national_championship_heats h on h.id=rh.heat_id
      where rh.edition_id=e.id
    ),'[]'::jsonb) end,

    'past_champions',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.season_number desc)
      from (
        select
          pe.season_number,
          pe.country_code,
          pe.champion_rider_id,
          pe.champion_name_snapshot,
          pe.champion_club_id,
          pe.champion_club_name_snapshot,
          pe.final_race_id
        from public.national_championship_editions pe
        where pe.country_code=v_country
          and pe.discipline='road'
          and pe.status='completed'
          and pe.champion_rider_id is not null
        order by pe.season_number desc
        limit 10
      ) x
    ),'[]'::jsonb)
  );
end;
$function$;


create or replace function public.get_national_championship_event_page_v1(
  p_edition_id uuid,
  p_event_type text,
  p_heat_number integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_user_country text;
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  s public.race_stages%rowtype;
  v_source_stage_id uuid;
  v_race_id uuid;
  v_event_date date;
  v_country_name text;
  v_field_count integer:=0;
  v_qualifying_places integer:=0;
  v_profile_points jsonb:='[]'::jsonb;
  v_route_label text;
  v_summary text;
  v_start_time text;
  v_expected_temp numeric;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select upper(c.country_code)
  into v_user_country
  from public.clubs c
  where c.owner_user_id=v_user
    and c.parent_club_id is null
  order by c.created_at,c.id
  limit 1;

  select * into e
  from public.national_championship_editions
  where id=p_edition_id
    and country_code=v_user_country
    and discipline='road'
  limit 1;

  if e.id is null then
    raise exception 'National Championship event is not available for your club country';
  end if;

  select coalesce(c.name,e.country_code)
  into v_country_name
  from public.countries c
  where upper(c.code)=e.country_code
  limit 1;
  v_country_name:=coalesce(v_country_name,e.country_code);

  if p_event_type='qualification' then
    if p_heat_number is null or p_heat_number<1 then
      raise exception 'Qualification group number is required';
    end if;

    select * into h
    from public.national_championship_heats
    where edition_id=e.id and heat_number=p_heat_number
    limit 1;

    v_source_stage_id:=e.qualification_source_stage_id;
    v_event_date:=coalesce(h.qualification_date,e.qualification_date+(p_heat_number-1));
    v_race_id:=h.race_id;
    v_qualifying_places:=case
      when h.id is not null then h.qualifying_places
      when coalesce(e.qualification_heat_count,0)>0
        then floor(e.final_field_size::numeric/e.qualification_heat_count)::int
          +case
            when p_heat_number<=mod(e.final_field_size,e.qualification_heat_count) then 1
            else 0
          end
      else 0
    end;
    v_field_count:=case
      when h.id is not null and h.assigned_count>0 then h.assigned_count
      when coalesce(e.qualification_heat_count,0)>0
        then ceil(coalesce(e.eligible_count,0)::numeric/e.qualification_heat_count)::int
      else 0
    end;
  elsif p_event_type='final' then
    v_source_stage_id:=e.final_source_stage_id;
    v_event_date:=e.final_date;
    v_race_id:=e.final_race_id;
    v_qualifying_places:=0;

    select count(*)::int into v_field_count
    from public.national_championship_entries en
    where en.edition_id=e.id
      and en.entry_status in ('direct_qualified','qualified','finalist')
      and en.participation_decision<>'rejected';

    if v_field_count=0 then
      v_field_count:=least(coalesce(e.eligible_count,0),e.final_field_size);
    end if;
  else
    raise exception 'Invalid National Championship event type';
  end if;

  if v_source_stage_id is null then
    raise exception 'National Championship host route is not ready';
  end if;

  select * into s
  from public.race_stages
  where id=v_source_stage_id;

  if s.id is null then
    raise exception 'National Championship host stage not found';
  end if;

  select
    coalesce(spd.profile_points,'[]'::jsonb),
    coalesce(
      nullif(spd.route_label,''),
      coalesce(nullif(s.start_city_name,''),nullif(s.start_city,''),'Start')
        ||' → '||
      coalesce(nullif(s.finish_city_name,''),nullif(s.finish_city,''),'Finish')
    ),
    spd.stage_summary
  into v_profile_points,v_route_label,v_summary
  from public.race_stage_profile_details spd
  where spd.stage_id=s.id
  limit 1;

  v_profile_points:=coalesce(
    v_profile_points,
    s.metadata #> '{route_profile_v1,profile_points}',
    s.metadata->'profile_points',
    '[]'::jsonb
  );

  v_route_label:=coalesce(
    v_route_label,
    coalesce(nullif(s.start_city_name,''),nullif(s.start_city,''),'Start')
      ||' → '||
    coalesce(nullif(s.finish_city_name,''),nullif(s.finish_city,''),'Finish')
  );

  if v_race_id is not null then
    select r.planned_start_time_label
    into v_start_time
    from public.races r
    where r.id=v_race_id;
  end if;

  select w.avg_max_temp_c
  into v_expected_temp
  from public.country_weather_weekly_normals w
  where upper(w.country_code)=coalesce(e.climate_source_country_code,e.country_code)
    and w.week_of_year=extract(week from v_event_date)::int
  limit 1;

  return jsonb_build_object(
    'edition_id',e.id,
    'season_number',e.season_number,
    'country_code',e.country_code,
    'country_name',v_country_name,
    'flag_url','https://flagcdn.com/w320/'||lower(e.country_code)||'.png',
    'event_type',p_event_type,
    'heat_number',case when p_event_type='qualification' then p_heat_number else null end,
    'event_title',case
      when p_event_type='qualification'
        then v_country_name||' National Qualification Group '||p_heat_number
      else v_country_name||' National Championship Final'
    end,
    'event_date',v_event_date,
    'race_id',v_race_id,
    'status',case
      when p_event_type='qualification' then coalesce(h.status,'planned')
      else e.status
    end,
    'field_count',v_field_count,
    'qualifying_places',v_qualifying_places,
    'final_field_size',e.final_field_size,
    'qualification_window_start_date',e.qualification_window_start_date,
    'qualification_window_end_date',e.qualification_window_end_date,
    'final_date',e.final_date,
    'start_time_label',v_start_time,
    'expected_max_temp_c',v_expected_temp,
    'route',jsonb_build_object(
      'stage_id',s.id,
      'route_label',v_route_label,
      'start_city',coalesce(nullif(s.start_city_name,''),nullif(s.start_city,''),'Start'),
      'finish_city',coalesce(nullif(s.finish_city_name,''),nullif(s.finish_city,''),'Finish'),
      'distance_km',s.distance_km,
      'terrain_type',s.terrain_type,
      'profile_type',s.profile_type,
      'elevation_gain_m',s.elevation_gain_m,
      'flat_pct',s.flat_pct,
      'hilly_pct',s.hilly_pct,
      'mountain_pct',s.mountain_pct,
      'cobbled_pct',s.cobbled_pct,
      'summary',coalesce(v_summary,'National Championship host-country terrain profile.'),
      'profile_points',v_profile_points,
      'route_markers',jsonb_build_array(
        jsonb_build_object('type','start','km',0,'label','Start'),
        jsonb_build_object('type','finish','km',s.distance_km,'label','Finish')
      )
    )
  );
end;
$$;

revoke all on function public.get_national_championship_event_page_v1(uuid,text,integer)
from public,anon;
grant execute on function public.get_national_championship_event_page_v1(uuid,text,integer)
to authenticated,service_role;
