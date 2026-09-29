CREATE OR REPLACE FUNCTION public.national_championship_ensure_races_v1(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  h record;
  v_final uuid;
  v_heat_count integer := 0;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then
    raise exception 'National championship edition not found: %',p_edition_id;
  end if;

  if e.status='planned' then
    return jsonb_build_object('status','waiting_for_ranking_freeze','edition_id',e.id);
  end if;

  if e.climate_status<>'ready' then
    return jsonb_build_object(
      'status','waiting_for_climate',
      'edition_id',e.id,
      'climate_status',e.climate_status
    );
  end if;

  if e.route_status<>'ready' then
    return jsonb_build_object(
      'status','waiting_for_two_routes',
      'edition_id',e.id,
      'route_status',e.route_status
    );
  end if;

  for h in
    select id
    from public.national_championship_heats
    where edition_id=e.id
    order by heat_number
  loop
    perform public.national_championship_ensure_event_race_v1(
      e.id,'qualification',h.id
    );
    v_heat_count:=v_heat_count+1;
  end loop;

  v_final:=public.national_championship_ensure_event_race_v1(
    e.id,'final',null
  );

  update public.national_championship_editions
  set status=case
        when qualification_heat_count>0 then 'qualification_pending'
        else 'final_ready'
      end,
      updated_at=now()
  where id=e.id
    and status='ranking_frozen';

  return jsonb_build_object(
    'status','races_ready',
    'edition_id',e.id,
    'qualification_races',v_heat_count,
    'final_race_id',v_final,
    'qualification_source_stage_id',e.qualification_source_stage_id,
    'final_source_stage_id',e.final_source_stage_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_my_national_championship_rider_plan_v1(p_edition_id uuid, p_event_type text, p_rider_id uuid, p_equipment_setup_id uuid DEFAULT NULL::uuid, p_phase_1_command text DEFAULT 'ride_naturally'::text, p_phase_2_command text DEFAULT 'ride_naturally'::text, p_phase_3_command text DEFAULT 'ride_naturally'::text, p_phase_4_command text DEFAULT 'ride_naturally'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  e public.national_championship_editions%rowtype;
  en public.national_championship_entries%rowtype;
  v_owner_club_id uuid;
  v_race_id uuid;
  v_stage_id uuid;
  v_stage_plan_id uuid;
  v_stage_plan_rider_id uuid;
  v_start_game_ts timestamp without time zone;
  v_bonus jsonb := '{}'::jsonb;
  v_plan_id uuid;
  v_allowed text[] := array[
    'ride_naturally',
    'conserve_energy',
    'stay_near_front',
    'join_breakaway',
    'attack',
    'chase_breakaway',
    'climb_hard',
    'sprint',
    'avoid_risks'
  ];
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_event_type not in ('qualification','final') then
    raise exception 'Invalid event type';
  end if;

  if not (
    p_phase_1_command=any(v_allowed)
    and p_phase_2_command=any(v_allowed)
    and p_phase_3_command=any(v_allowed)
    and p_phase_4_command=any(v_allowed)
  ) then
    raise exception 'One or more tactic commands are not supported';
  end if;

  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  select * into en
  from public.national_championship_entries
  where edition_id=p_edition_id
    and rider_id=p_rider_id;

  if e.id is null or en.id is null then
    raise exception 'National championship rider entry not found';
  end if;

  if en.club_id_snapshot is null then
    raise exception 'This rider is not managed by a club';
  end if;

  v_owner_club_id := public.universal_race_resource_owner_club_v1(en.club_id_snapshot);

  if not exists (
    select 1
    from public.clubs c
    where c.id=v_owner_club_id
      and c.owner_user_id=v_user_id
  ) then
    raise exception 'You do not manage this rider';
  end if;

  if p_event_type='qualification' then
    if en.entry_path<>'qualification'
       or en.heat_id is null
       or en.entry_status not in ('qualification_assigned','qualified','finalist') then
      raise exception 'Rider is not assigned to national qualification';
    end if;

    select h.race_id into v_race_id
    from public.national_championship_heats h
    where h.id=en.heat_id;
  else
    if en.entry_status not in ('direct_qualified','qualified','finalist') then
      raise exception 'Rider is not qualified for the national final';
    end if;
    v_race_id := e.final_race_id;
  end if;

  if v_race_id is null then
    raise exception 'National championship race is not ready yet';
  end if;

  select
    s.id,
    s.stage_date::timestamp
      + make_interval(
          hours=>coalesce(s.planned_start_hour_number,12),
          mins=>coalesce(s.planned_start_minute,0)
        )
  into v_stage_id,v_start_game_ts
  from public.race_stages s
  where s.race_id=v_race_id
  order by s.stage_number
  limit 1;

  if v_stage_id is null then
    raise exception 'National championship stage not found';
  end if;

  if public.get_current_game_ts_local() >= v_start_game_ts then
    raise exception 'National Championship preparation is locked because the race has started';
  end if;

  if p_equipment_setup_id is not null then
    if not exists (
      select 1
      from public.club_equipment_setup_presets preset
      where preset.id=p_equipment_setup_id
        and preset.club_id in (en.club_id_snapshot,v_owner_club_id)
    ) then
      raise exception 'Equipment preset does not belong to this rider''s club';
    end if;

    select public.equipment_calculate_catalog_setup_bonus_preview(
      preset.frame_catalog_item_id,
      preset.wheelset_catalog_item_id,
      preset.tires_catalog_item_id,
      preset.groupset_catalog_item_id,
      preset.helmet_catalog_item_id,
      preset.shoes_catalog_item_id
    )
    into v_bonus
    from public.club_equipment_setup_presets preset
    where preset.id=p_equipment_setup_id;
  end if;

  insert into public.national_championship_rider_plans (
    edition_id,
    rider_id,
    event_type,
    heat_id,
    equipment_setup_id,
    phase_1_command,
    phase_2_command,
    phase_3_command,
    phase_4_command,
    updated_by_user_id
  )
  values (
    e.id,
    en.rider_id,
    p_event_type,
    case when p_event_type='qualification' then en.heat_id else null end,
    p_equipment_setup_id,
    p_phase_1_command,
    p_phase_2_command,
    p_phase_3_command,
    p_phase_4_command,
    v_user_id
  )
  on conflict (edition_id,rider_id,event_type) do update
    set heat_id=excluded.heat_id,
        equipment_setup_id=excluded.equipment_setup_id,
        phase_1_command=excluded.phase_1_command,
        phase_2_command=excluded.phase_2_command,
        phase_3_command=excluded.phase_3_command,
        phase_4_command=excluded.phase_4_command,
        updated_by_user_id=excluded.updated_by_user_id,
        updated_at=now()
  returning id into v_plan_id;

  select sp.id into v_stage_plan_id
  from public.race_preparations rp
  join public.race_stage_plans sp
    on sp.race_preparation_id=rp.id
   and sp.stage_id=v_stage_id
  where rp.race_id=v_race_id
    and rp.club_id=en.club_id_snapshot
  limit 1;

  if v_stage_plan_id is null then
    perform public.national_championship_sync_race_participants_v1(
      e.id,
      p_event_type,
      case when p_event_type='qualification' then en.heat_id else null end
    );

    select sp.id into v_stage_plan_id
    from public.race_preparations rp
    join public.race_stage_plans sp
      on sp.race_preparation_id=rp.id
     and sp.stage_id=v_stage_id
    where rp.race_id=v_race_id
      and rp.club_id=en.club_id_snapshot
    limit 1;
  end if;

  if v_stage_plan_id is null then
    raise exception 'National Championship rider plan shell is unavailable';
  end if;

  insert into public.race_stage_plan_riders (
    race_stage_plan_id,
    rider_id,
    stage_role,
    tactic,
    risk_level,
    effort_level,
    equipment_setup_id,
    rider_stage_snapshot_json,
    equipment_bonus_snapshot_json,
    final_bonus_snapshot_json,
    metadata
  )
  values (
    v_stage_plan_id,
    en.rider_id,
    'free_role',
    'balanced',
    'normal',
    'normal',
    p_equipment_setup_id,
    jsonb_build_object(
      'national_championship',true,
      'event_type',p_event_type,
      'national_rank',en.national_rank
    ),
    coalesce(v_bonus,'{}'::jsonb),
    coalesce(v_bonus,'{}'::jsonb),
    jsonb_build_object(
      'national_championship',true,
      'saved_by_user',true
    )
  )
  on conflict (race_stage_plan_id,rider_id) do update
    set stage_role='free_role',
        tactic='balanced',
        equipment_setup_id=excluded.equipment_setup_id,
        equipment_bonus_snapshot_json=excluded.equipment_bonus_snapshot_json,
        final_bonus_snapshot_json=excluded.final_bonus_snapshot_json,
        metadata=public.race_stage_plan_riders.metadata||excluded.metadata,
        updated_at=now()
  returning id into v_stage_plan_rider_id;

  update public.race_stage_plans
  set rider_individual_tactics_json =
        jsonb_set(
          coalesce(rider_individual_tactics_json,'{}'::jsonb),
          array[en.rider_id::text],
          jsonb_build_object(
            'phase_1',jsonb_build_object('command',p_phase_1_command),
            'phase_2',jsonb_build_object('command',p_phase_2_command),
            'phase_3',jsonb_build_object('command',p_phase_3_command),
            'phase_4',jsonb_build_object('command',p_phase_4_command)
          ),
          true
        ),
      rider_equipment_json =
        case
          when p_equipment_setup_id is null then
            coalesce(rider_equipment_json,'{}'::jsonb) - en.rider_id::text
          else
            jsonb_set(
              coalesce(rider_equipment_json,'{}'::jsonb),
              array[en.rider_id::text],
              to_jsonb(p_equipment_setup_id::text),
              true
            )
        end,
      team_strategy='balanced',
      team_tactic_json=jsonb_build_object(
        'plan','balanced',
        'internal_neutral_placeholder',true,
        'team_commands_enabled',false,
        'notes','National Championship: every rider competes independently'
      ),
      rider_supplies_json=coalesce(rider_supplies_json,'{}'::jsonb),
      last_saved_at=now(),
      last_saved_game_ts=public.get_current_game_ts_local(),
      updated_at=now()
  where id=v_stage_plan_id;

  return jsonb_build_object(
    'success',true,
    'plan_id',v_plan_id,
    'edition_id',e.id,
    'event_type',p_event_type,
    'rider_id',en.rider_id,
    'race_id',v_race_id,
    'stage_id',v_stage_id,
    'equipment_setup_id',p_equipment_setup_id,
    'phase_1_command',p_phase_1_command,
    'phase_2_command',p_phase_2_command,
    'phase_3_command',p_phase_3_command,
    'phase_4_command',p_phase_4_command,
    'team_strategy','individual_only',
    'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true)
  );
end;
$function$
;

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
  v_limit:=greatest(1,least(coalesce(p_limit,2000),5000));

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
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_national_championship_titles_v1(p_rider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
begin
  v_user_id:=auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'season_number',e.season_number,
        'country_code',e.country_code,
        'final_race_id',e.final_race_id,
        'completed_at',e.completed_at
      )
      order by e.season_number desc
    )
    from public.national_championship_editions e
    where e.champion_rider_id=p_rider_id
      and e.status='completed'
  ),'[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_notify_selection_v1(p_edition_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  x record;
  v_count integer:=0;
  v_country_name text;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then return 0; end if;

  select coalesce(c.name,e.country_code)
  into v_country_name
  from public.countries c
  where upper(c.code)=upper(e.country_code)
  limit 1;

  v_country_name:=coalesce(v_country_name,e.country_code);

  for x in
    select
      en.rider_id,en.rider_name_snapshot,en.entry_path,en.heat_number,
      en.participation_decision,h.qualification_date,
      root.owner_user_id
    from public.national_championship_entries en
    left join public.national_championship_heats h on h.id=en.heat_id
    join public.clubs rc on rc.id=en.club_id_snapshot
    join public.clubs root
      on root.id=case
        when rc.club_type='developing' and rc.parent_club_id is not null
          then rc.parent_club_id
        else rc.id
      end
    where en.edition_id=e.id
      and root.owner_user_id is not null
  loop
    perform public.ppm_create_user_notification_direct_v1(
      x.owner_user_id,
      'NATIONAL_CHAMPIONSHIP_SELECTED',
      x.rider_name_snapshot||' selected for National Championship',
      x.rider_name_snapshot||' is selected for the '||v_country_name||
        ' National Championship. '||
        case
          when x.entry_path='qualification'
            then 'Qualification Group '||coalesce(x.heat_number,1)||
                 ' races on '||x.qualification_date||
                 '. If the rider qualifies, the final is on '||e.final_date||'. '
          else 'No qualification is required; the final is on '||e.final_date||'. '
        end||
        'Open National Championship participation to approve or refuse the rider before '||
        e.participation_decision_deadline||'.',
      '/dashboard/national-ranking?tab=duty',
      jsonb_build_object(
        'edition_id',e.id,
        'country_code',e.country_code,
        'country_name',v_country_name,
        'rider_id',x.rider_id,
        'rider_name',x.rider_name_snapshot,
        'entry_path',x.entry_path,
        'heat_number',x.heat_number,
        'qualification_date',x.qualification_date,
        'qualification_window_start_date',e.qualification_window_start_date,
        'qualification_window_end_date',e.qualification_window_end_date,
        'final_date',e.final_date,
        'participation_decision_deadline',e.participation_decision_deadline,
        'participation_decision',x.participation_decision,
        'action_path','/dashboard/national-ranking?tab=duty',
        'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/National%20Road%20Championsjip.png'
      ),
      'national-championship-selection:'||e.id::text||':'||x.rider_id::text
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_process_qualification_results_base_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  h record;
  v_stage_id uuid;
  v_result_count integer;
  v_processed integer:=0;
  v_completed_editions uuid[]:='{}'::uuid[];
  q record;
begin
  for h in
    select
      heat.*,
      e.country_code,
      e.final_date,
      e.final_race_id,
      e.status edition_status
    from public.national_championship_heats heat
    join public.national_championship_editions e on e.id=heat.edition_id
    where heat.status='ready'
      and heat.race_id is not null
      and e.status in ('qualification_pending','qualification_completed','final_ready')
    order by heat.qualification_date,heat.edition_id,heat.heat_number
  loop
    select s.id into v_stage_id
    from public.race_stages s
    where s.race_id=h.race_id
    order by s.stage_number
    limit 1;

    if v_stage_id is null then continue; end if;

    if not exists(
      select 1
      from public.race_stage_simulation_runs sr
      where sr.stage_id=v_stage_id and sr.status='completed'
    ) then
      continue;
    end if;

    select count(*)::int into v_result_count
    from public.race_stage_results rs
    where rs.stage_id=v_stage_id and rs.rider_id is not null;

    if v_result_count=0 then continue; end if;

    insert into public.national_championship_result_history(
      edition_id,event_type,heat_id,rider_id,club_id_snapshot,rank,status,
      rider_name_snapshot,club_name_snapshot,country_code_snapshot,race_id
    )
    select
      h.edition_id,'qualification',h.id,rs.rider_id,en.club_id_snapshot,
      coalesce(rs.rank,9999),rs.status,
      coalesce(rs.rider_name_snapshot,en.rider_name_snapshot,r.display_name,r.first_name||' '||r.last_name),
      coalesce(c.name,rs.team_name_snapshot),
      en.country_code_snapshot,h.race_id
    from public.race_stage_results rs
    join public.national_championship_entries en
      on en.edition_id=h.edition_id
     and en.rider_id=rs.rider_id
     and en.heat_id=h.id
    join public.riders r on r.id=rs.rider_id
    left join public.clubs c on c.id=en.club_id_snapshot
    where rs.stage_id=v_stage_id
    on conflict do nothing;

    with finished as (
      select
        rs.rider_id,
        row_number() over(order by rs.rank nulls last,rs.id) finish_order
      from public.race_stage_results rs
      where rs.stage_id=v_stage_id
        and rs.rider_id is not null
        and lower(coalesce(rs.status,'finished'))='finished'
    )
    update public.national_championship_entries en
    set entry_status=case
          when f.finish_order is not null
           and f.finish_order<=h.qualifying_places
            then 'qualified'
          else 'eliminated'
        end,
        updated_at=now()
    from public.race_stage_results rs
    left join finished f on f.rider_id=rs.rider_id
    where en.edition_id=h.edition_id
      and en.heat_id=h.id
      and en.rider_id=rs.rider_id
      and rs.stage_id=v_stage_id
      and en.entry_status='qualification_assigned';

    update public.national_championship_duties
    set status='completed',updated_at=now()
    where edition_id=h.edition_id
      and heat_id=h.id
      and duty_type='qualification'
      and status='confirmed';

    insert into public.national_championship_rider_plans(
      edition_id,rider_id,event_type,heat_id,equipment_setup_id,
      phase_1_command,phase_2_command,phase_3_command,phase_4_command,
      updated_by_user_id
    )
    select
      qp.edition_id,qp.rider_id,'final',null,qp.equipment_setup_id,
      qp.phase_1_command,qp.phase_2_command,qp.phase_3_command,qp.phase_4_command,
      qp.updated_by_user_id
    from public.national_championship_rider_plans qp
    join public.national_championship_entries en
      on en.edition_id=qp.edition_id
     and en.rider_id=qp.rider_id
     and en.entry_status='qualified'
    where qp.edition_id=h.edition_id
      and qp.event_type='qualification'
      and en.heat_id=h.id
    on conflict (edition_id,rider_id,event_type) do nothing;

    update public.national_championship_heats
    set status='completed',updated_at=now()
    where id=h.id;

    for q in
      select
        en.rider_id,en.rider_name_snapshot,root.owner_user_id
      from public.national_championship_entries en
      join public.clubs rc on rc.id=en.club_id_snapshot
      join public.clubs root
        on root.id=case
          when rc.club_type='developing' and rc.parent_club_id is not null
            then rc.parent_club_id
          else rc.id
        end
      where en.edition_id=h.edition_id
        and en.heat_id=h.id
        and en.entry_status='qualified'
        and root.owner_user_id is not null
    loop
      perform public.ppm_create_user_notification_direct_v1(
        q.owner_user_id,
        'NATIONAL_CHAMPIONSHIP_QUALIFIED',
        q.rider_name_snapshot||' qualified for the National Championship final',
        q.rider_name_snapshot||' finished inside the qualifying places in National Qualification Group '||
          h.heat_number||' and will race the '||h.country_code||
          ' National Championship final on '||h.final_date||'.',
        '/dashboard/national-ranking?tab=duty',
        jsonb_build_object(
          'edition_id',h.edition_id,
          'country_code',h.country_code,
          'rider_id',q.rider_id,
          'rider_name',q.rider_name_snapshot,
          'heat_number',h.heat_number,
          'final_date',h.final_date,
          'action_path','/dashboard/national-ranking?tab=duty'
        ),
        'national-championship-qualified:'||h.edition_id::text||':'||q.rider_id::text
      );
    end loop;

    if not exists(
      select 1
      from public.national_championship_heats pending
      where pending.edition_id=h.edition_id
        and pending.status<>'completed'
    ) then
      update public.national_championship_entries
      set entry_status='finalist',updated_at=now()
      where edition_id=h.edition_id
        and entry_status='qualified';

      insert into public.national_championship_duties(
        edition_id,rider_id,duty_type,duty_date,heat_id,status,label,
        duty_start_date,duty_end_date
      )
      select
        en.edition_id,en.rider_id,'final',h.final_date,null,'confirmed',
        'National Duty — '||h.country_code||' National Championship Final',
        h.final_date,h.final_date
      from public.national_championship_entries en
      where en.edition_id=h.edition_id
        and en.entry_status='finalist'
        and en.participation_decision in ('approved','auto_approved')
      on conflict (edition_id,rider_id,duty_type) do update
        set duty_date=excluded.duty_date,
            heat_id=null,
            status='confirmed',
            label=excluded.label,
            duty_start_date=excluded.duty_start_date,
            duty_end_date=excluded.duty_end_date,
            updated_at=now();

      update public.national_championship_editions
      set status='final_ready',updated_at=now()
      where id=h.edition_id
        and status in ('qualification_pending','qualification_completed');

      perform public.national_championship_sync_race_participants_v1(
        h.edition_id,'final',null
      );

      v_completed_editions:=array_append(v_completed_editions,h.edition_id);
    end if;

    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object(
    'qualification_heats_processed',v_processed,
    'finals_unlocked_for_editions',to_jsonb(v_completed_editions)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_process_final_results_base_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e record;
  v_stage_id uuid;
  v_result_count integer;
  v_champion record;
  v_processed integer := 0;
begin
  for e in
    select *
    from public.national_championship_editions
    where status='final_ready'
      and final_race_id is not null
    order by final_date,country_code
  loop
    select s.id into v_stage_id
    from public.race_stages s
    where s.race_id=e.final_race_id
    order by s.stage_number
    limit 1;

    if v_stage_id is null then
      continue;
    end if;

    if not exists (
      select 1
      from public.race_stage_simulation_runs sr
      where sr.stage_id=v_stage_id
        and sr.status='completed'
    ) then
      continue;
    end if;

    select count(*)::int into v_result_count
    from public.race_stage_results rs
    where rs.stage_id=v_stage_id
      and rs.rider_id is not null;

    if v_result_count=0 then
      continue;
    end if;

    insert into public.national_championship_result_history (
      edition_id,
      event_type,
      heat_id,
      rider_id,
      club_id_snapshot,
      rank,
      status,
      rider_name_snapshot,
      club_name_snapshot,
      country_code_snapshot,
      race_id
    )
    select
      e.id,
      'final',
      null,
      rs.rider_id,
      en.club_id_snapshot,
      coalesce(rs.rank,9999),
      rs.status,
      coalesce(rs.rider_name_snapshot,en.rider_name_snapshot,r.display_name,r.first_name||' '||r.last_name),
      coalesce(c.name,rs.team_name_snapshot),
      en.country_code_snapshot,
      e.final_race_id
    from public.race_stage_results rs
    join public.national_championship_entries en
      on en.edition_id=e.id
     and en.rider_id=rs.rider_id
    join public.riders r on r.id=rs.rider_id
    left join public.clubs c on c.id=en.club_id_snapshot
    where rs.stage_id=v_stage_id
    on conflict do nothing;

    select
      rs.rider_id,
      coalesce(rs.rider_name_snapshot,en.rider_name_snapshot,r.display_name,r.first_name||' '||r.last_name) as rider_name,
      en.club_id_snapshot,
      c.name as club_name,
      root.owner_user_id
    into v_champion
    from public.race_stage_results rs
    join public.national_championship_entries en
      on en.edition_id=e.id
     and en.rider_id=rs.rider_id
    join public.riders r on r.id=rs.rider_id
    left join public.clubs c on c.id=en.club_id_snapshot
    left join public.clubs root
      on root.id=case
        when c.club_type='developing' and c.parent_club_id is not null
          then c.parent_club_id
        else c.id
      end
    where rs.stage_id=v_stage_id
      and rs.rank=1
      and lower(coalesce(rs.status,'finished'))='finished'
    order by rs.id
    limit 1;

    if v_champion.rider_id is null then
      continue;
    end if;

    /*
     * Rider-only national ranking bonus. This intentionally does not write
     * Team Ranking points.
     */
    insert into public.national_championship_ranking_bonus_awards (
      edition_id,rider_id,rank,points,award_date
    )
    select
      e.id,
      rs.rider_id,
      rs.rank,
      case
        when rs.rank=1 then 200
        when rs.rank=2 then 140
        when rs.rank=3 then 110
        when rs.rank=4 then 90
        when rs.rank=5 then 75
        when rs.rank=6 then 60
        when rs.rank=7 then 50
        when rs.rank=8 then 42
        when rs.rank=9 then 35
        when rs.rank=10 then 30
        when rs.rank between 11 and 15 then 20
        when rs.rank between 16 and 20 then 10
        else 0
      end,
      e.final_date
    from public.race_stage_results rs
    where rs.stage_id=v_stage_id
      and rs.rider_id is not null
      and rs.rank between 1 and 20
      and lower(coalesce(rs.status,'finished'))='finished'
    on conflict (edition_id,rider_id) do update
      set rank=excluded.rank,
          points=excluded.points,
          award_date=excluded.award_date;

    update public.national_championship_duties
    set status='completed',updated_at=now()
    where edition_id=e.id
      and status='confirmed';

    update public.national_championship_editions
    set status='completed',
        champion_rider_id=v_champion.rider_id,
        champion_name_snapshot=v_champion.rider_name,
        champion_club_id=v_champion.club_id_snapshot,
        champion_club_name_snapshot=v_champion.club_name,
        completed_at=now(),
        updated_at=now()
    where id=e.id;

    if v_champion.owner_user_id is not null then
      perform public.ppm_create_user_notification_direct_v1(
        v_champion.owner_user_id,
        'NATIONAL_CHAMPION',
        v_champion.rider_name||' is National Champion!',
        v_champion.rider_name||' won the '||e.country_code||
          ' National Road Championship. The title is now part of the rider''s career honours and National Ranking record.',
        '/dashboard/national-ranking?country='||e.country_code,
        jsonb_build_object(
          'edition_id',e.id,
          'country_code',e.country_code,
          'season_number',e.season_number,
          'rider_id',v_champion.rider_id,
          'rider_name',v_champion.rider_name,
          'final_race_id',e.final_race_id
        ),
        'national-champion:'||e.id::text||':'||v_champion.rider_id::text
      );
    end if;

    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object('national_finals_processed',v_processed);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_national_championship_runtime_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_season integer;
  v_game_date date;
  v_created integer := 0;
  v_frozen integer := 0;
  v_races_ready integer := 0;
  v_auto_approved integer := 0;
  v_final_auto_approved integer := 0;
  v_world_final_auto_approved integer := 0;
  r record;
  q jsonb;
  f jsonb;
  d jsonb;
  nf jsonb;
  wf jsonb;
begin
  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_game_date
  from public.game_state gs
  where gs.id=true;

  v_created:=public.ensure_national_championship_editions_for_season_v1(v_season);
  d:=public.process_championship_calendar_draw_v1();

  v_auto_approved:=public.national_championship_auto_approve_pending_v1();
  v_final_auto_approved:=public.national_championship_auto_approve_final_pending_v1();
  v_world_final_auto_approved:=public.world_road_championship_auto_approve_final_pending_v1();

  for r in
    select id
    from public.national_championship_editions
    where season_number=v_season
      and discipline='road'
      and status='planned'
      and schedule_draw_status='locked'
      and climate_status='ready'
      and route_status='ready'
      and ranking_snapshot_date<=v_game_date
    order by ranking_snapshot_date,country_code
  loop
    perform public.freeze_national_championship_ranking_v1(r.id);
    perform public.national_championship_ensure_races_v1(r.id);
    perform public.national_championship_notify_selection_v1(r.id);
    v_frozen:=v_frozen+1;
    v_races_ready:=v_races_ready+1;
  end loop;

  for r in
    select id
    from public.national_championship_editions
    where season_number=v_season
      and discipline='road'
      and schedule_draw_status='locked'
      and climate_status='ready'
      and route_status='ready'
      and status in ('ranking_frozen','qualification_pending','final_ready')
      and (
        final_race_id is null
        or exists(
          select 1
          from public.national_championship_heats h
          where h.edition_id=national_championship_editions.id
            and h.race_id is null
        )
      )
    order by country_code
  loop
    perform public.national_championship_ensure_races_v1(r.id);
    v_races_ready:=v_races_ready+1;
  end loop;

  q:=public.national_championship_process_qualification_results_v1();
  perform public.national_championship_refresh_final_participants_v1();

  nf:=public.national_championship_open_final_confirmations_v1();
  v_final_auto_approved:=v_final_auto_approved
    +public.national_championship_auto_approve_final_pending_v1();

  f:=public.national_championship_process_final_results_v1();

  perform public.world_road_championship_refresh_availability_v1();
  perform public.world_road_championship_auto_approve_pending_v1();

  wf:=public.world_road_championship_open_final_confirmations_v1();
  v_world_final_auto_approved:=v_world_final_auto_approved
    +public.world_road_championship_auto_approve_final_pending_v1();

  perform public.world_road_championship_process_results_v1();

  return jsonb_build_object(
    'status','ok',
    'season_number',v_season,
    'game_date',v_game_date,
    'calendar_draw',d,
    'editions_created',v_created,
    'pending_entries_auto_approved',v_auto_approved,
    'national_final_pending_auto_approved',v_final_auto_approved,
    'world_final_pending_auto_approved',v_world_final_auto_approved,
    'rankings_frozen',v_frozen,
    'race_sets_ensured',v_races_ready,
    'qualification_processing',q,
    'national_final_confirmation_processing',nf,
    'final_processing',f,
    'world_final_confirmation_processing',wf
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_sanitize_tactics_json_v1(p_tactics jsonb, p_rider_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_result jsonb := '{}'::jsonb; v_rider uuid; v_key text;
begin
  foreach v_rider in array coalesce(p_rider_ids,'{}'::uuid[]) loop
    v_key := v_rider::text;
    v_result := v_result || jsonb_build_object(v_key,jsonb_build_object(
      'phase_1',jsonb_build_object('command',public.national_championship_sanitize_individual_command_v1(p_tactics #>> array[v_key,'phase_1','command'])),
      'phase_2',jsonb_build_object('command',public.national_championship_sanitize_individual_command_v1(p_tactics #>> array[v_key,'phase_2','command'])),
      'phase_3',jsonb_build_object('command',public.national_championship_sanitize_individual_command_v1(p_tactics #>> array[v_key,'phase_3','command'])),
      'phase_4',jsonb_build_object('command',public.national_championship_sanitize_individual_command_v1(p_tactics #>> array[v_key,'phase_4','command']))
    ));
  end loop;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_national_championship_individual_stage_plan_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_is_nc boolean := false; v_rider_ids uuid[] := '{}'::uuid[];
begin
  select coalesce((r.metadata->>'national_championship')::boolean,false)
  into v_is_nc from public.races r where r.id=new.race_id;
  if not coalesce(v_is_nc,false) then return new; end if;

  select coalesce(array_agg(distinct x.rider_id order by x.rider_id),'{}'::uuid[])
  into v_rider_ids
  from (
    select spr.rider_id from public.race_stage_plan_riders spr where spr.race_stage_plan_id=new.id
    union
    select key::uuid from jsonb_object_keys(coalesce(new.rider_individual_tactics_json,'{}'::jsonb)) key
      where key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    union
    select key::uuid from jsonb_object_keys(coalesce(new.rider_roles_json,'{}'::jsonb)) key
      where key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) x;

  new.team_strategy := 'balanced';
  new.team_tactic_json := jsonb_build_object(
    'plan','balanced','internal_neutral_placeholder',true,'team_commands_enabled',false,
    'notes','National Championship: every rider competes independently'
  );
  select coalesce(jsonb_object_agg(rider_id::text,to_jsonb('free_role'::text)),'{}'::jsonb)
  into new.rider_roles_json from unnest(v_rider_ids) rider_id;
  new.rider_individual_tactics_json :=
    public.national_championship_sanitize_tactics_json_v1(
      coalesce(new.rider_individual_tactics_json,'{}'::jsonb),v_rider_ids
    );
  select coalesce(jsonb_object_agg(rider_id::text,jsonb_build_object('source','organizer','standardized',true)),'{}'::jsonb)
  into new.rider_supplies_json from unnest(v_rider_ids) rider_id;
  new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
    'national_championship',true,'individual_only',true,'team_commands_enabled',false,
    'staff_assets_supplies_locked',true
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.block_national_championship_preparation_resource_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_is_nc boolean := false;
begin
  select coalesce((rp.metadata->>'national_championship')::boolean,false)
  into v_is_nc from public.race_preparations rp where rp.id=new.race_preparation_id;
  if coalesce(v_is_nc,false) then
    raise exception 'National Championships use organizer-managed staff, assets and supplies.';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_climate_source_country_v1(p_country_code text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_country text := upper(trim(coalesce(p_country_code,'')));
  v_source text;
  v_lat numeric;
  v_lon numeric;
begin
  if exists(
    select 1
    from public.country_weather_weekly_normals w
    where upper(w.country_code)=v_country
  ) then
    return v_country;
  end if;

  select g.latitude,g.longitude
  into v_lat,v_lon
  from public.travel_country_geography_v1 g
  where upper(g.country_code)=v_country
  limit 1;

  if v_lat is null or v_lon is null then
    return null;
  end if;

  select w.country_code
  into v_source
  from (
    select distinct upper(country_code) as country_code
    from public.country_weather_weekly_normals
  ) w
  join public.travel_country_geography_v1 g
    on upper(g.country_code)=w.country_code
  order by
    power(g.latitude-v_lat,2)+power(g.longitude-v_lon,2),
    w.country_code
  limit 1;

  return v_source;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_schedule_v1(p_country_code text, p_season_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  cfg public.national_championship_config%rowtype;
  v_country text := upper(trim(coalesce(p_country_code,'')));
  v_source text;
  v_week integer;
  v_expected_max numeric;
  v_expected_avg numeric;
  v_year integer := 1999 + p_season_number;
  v_monday date;
  v_start date;
  v_final date;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  v_source := public.national_championship_climate_source_country_v1(v_country);

  if v_source is null then
    return jsonb_build_object(
      'status','weather_data_unavailable',
      'country_code',v_country,
      'climate_source_country_code',null
    );
  end if;

  /*
   * Week 16 is the earliest championship week. This guarantees that a new
   * season has enough race history before the National Ranking is frozen.
   * Week 48 is the latest permitted championship week so the full 3-day
   * window always stays inside the game season.
   */
  select
    w.week_of_year::integer,
    w.avg_max_temp_c,
    w.avg_temp_c
  into
    v_week,
    v_expected_max,
    v_expected_avg
  from public.country_weather_weekly_normals w
  where upper(w.country_code)=v_source
    and w.week_of_year between 16 and 48
    and w.avg_max_temp_c > cfg.climate_target_temp_c
  order by
    abs(w.avg_max_temp_c - 26)
      + coalesce(w.p_heavy_rain,0)*8
      + coalesce(w.p_thunderstorm,0)*7
      + coalesce(w.p_rain,0)*2
      + greatest(coalesce(w.avg_wind_kmh,0)-20,0)*0.10
      + (
          abs(
            pg_catalog.hashtextextended(
              v_country||':'||p_season_number::text||':'||w.week_of_year::text,
              47
            )
          ) % 100
        )::numeric / 10000.0,
    w.week_of_year
  limit 1;

  if v_week is null then
    select
      w.week_of_year::integer,
      w.avg_max_temp_c,
      w.avg_temp_c
    into
      v_week,
      v_expected_max,
      v_expected_avg
    from public.country_weather_weekly_normals w
    where upper(w.country_code)=v_source
      and w.week_of_year between 16 and 48
    order by w.avg_max_temp_c desc,w.week_of_year
    limit 1;

    return jsonb_build_object(
      'status','temperature_target_unavailable',
      'country_code',v_country,
      'climate_source_country_code',v_source,
      'week_of_year',v_week,
      'expected_max_temp_c',v_expected_max,
      'expected_avg_temp_c',v_expected_avg
    );
  end if;

  v_monday := to_date(
    v_year::text||lpad(v_week::text,2,'0')||'1',
    'IYYYIWID'
  );

  v_start := v_monday + 4;
  v_final := v_monday + 6;

  return jsonb_build_object(
    'status','ready',
    'country_code',v_country,
    'climate_source_country_code',v_source,
    'week_of_year',v_week,
    'expected_max_temp_c',v_expected_max,
    'expected_avg_temp_c',v_expected_avg,
    'duty_window_start_date',v_start,
    'qualification_date',v_start,
    'duty_window_end_date',v_final,
    'final_date',v_final,
    'temperature_target_c',cfg.climate_target_temp_c
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_pick_source_stage_v1(p_country_code text, p_season_number integer, p_event_key text, p_exclude_stage_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  cfg public.national_championship_config%rowtype;
  v_country text := upper(trim(coalesce(p_country_code,'')));
  v_stage uuid;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  select s.id
  into v_stage
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where upper(trim(coalesce(nullif(s.host_country_code,''),r.country_code)))=v_country
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and lower(coalesce(s.stage_format,'road_race')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and lower(coalesce(s.terrain_type,'flat')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and s.id is distinct from p_exclude_stage_id
    and coalesce(s.mountain_pct,0) <= cfg.preferred_route_mountain_pct_max
    and coalesce(s.elevation_gain_m,0) <= cfg.preferred_route_elevation_gain_max
    and (
      coalesce(s.distance_km,0) <= 0
      or coalesce(s.elevation_gain_m,0)
         <= coalesce(s.distance_km,0) * cfg.preferred_route_elevation_per_km_max
    )
  order by md5(
    s.id::text||':'||v_country||':'||
    p_season_number::text||':'||coalesce(p_event_key,'event')
  )
  limit 1;

  return v_stage;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_refresh_planned_editions_v1(p_season_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  cfg public.national_championship_config%rowtype;
  e record;
  s jsonb;
  p jsonb;
  v_eligible integer;
  v_first_event date;
  v_updated integer:=0;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  for e in
    select id,country_code,season_number
    from public.national_championship_editions
    where season_number=p_season_number
      and discipline='road'
      and status='planned'
      and schedule_draw_status='pending'
    order by country_code
  loop
    select count(*)::int
    into v_eligible
    from public.preview_national_ranking_v1(
      e.country_code,
      public.get_current_game_date_date()
    );

    p:=public.national_championship_population_plan_v1(v_eligible);
    s:=public.national_championship_schedule_plan_v2(
      e.country_code,e.season_number,v_eligible
    );

    v_first_event:=case
      when coalesce((p->>'heat_count')::int,0)>0
        then nullif(s->>'qualification_window_start_date','')::date
      else nullif(s->>'final_date','')::date
    end;

    update public.national_championship_editions
    set
      eligible_count=v_eligible,
      final_field_size=least(v_eligible,cfg.final_field_size),
      direct_qualifier_count=coalesce((p->>'direct_qualifiers')::int,0),
      qualification_places=coalesce((p->>'qualification_places')::int,0),
      qualification_heat_count=coalesce((p->>'heat_count')::int,0),
      qualification_window_start_date=nullif(s->>'qualification_window_start_date','')::date,
      qualification_window_end_date=nullif(s->>'qualification_window_end_date','')::date,
      final_window_start_date=nullif(s->>'final_window_start_date','')::date,
      final_window_end_date=nullif(s->>'final_window_end_date','')::date,
      duty_window_start_date=v_first_event,
      duty_window_end_date=case
        when coalesce((p->>'heat_count')::int,0)>0
          then nullif(s->>'qualification_window_end_date','')::date
        else nullif(s->>'final_date','')::date
      end,
      qualification_date=coalesce(
        nullif(s->>'qualification_date','')::date,
        qualification_date
      ),
      final_date=coalesce(
        nullif(s->>'final_date','')::date,
        final_date
      ),
      ranking_snapshot_date=case
        when v_first_event is not null
          then v_first_event-cfg.ranking_freeze_lead_days
        else ranking_snapshot_date
      end,
      participation_decision_deadline=case
        when v_first_event is not null
          then v_first_event-cfg.participation_decision_lead_days
        else participation_decision_deadline
      end,
      climate_source_country_code=s->>'climate_source_country_code',
      climate_week_of_year=nullif(s->>'week_of_year','')::int,
      climate_expected_max_temp_c=nullif(s->>'expected_max_temp_c','')::numeric,
      climate_status=coalesce(s->>'climate_status','weather_data_unavailable'),
      qualification_source_stage_id=nullif(s->>'qualification_source_stage_id','')::uuid,
      final_source_stage_id=nullif(s->>'final_source_stage_id','')::uuid,
      route_status=coalesce(s->>'route_status','pending'),
      updated_at=now()
    where id=e.id;

    v_updated:=v_updated+1;
  end loop;

  return jsonb_build_object(
    'season_number',p_season_number,
    'editions_refreshed',v_updated
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_my_national_championship_participation_v1(p_edition_id uuid, p_rider_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  e public.national_championship_editions%rowtype;
  en public.national_championship_entries%rowtype;
  cfg public.national_championship_config%rowtype;
  v_owner uuid;
  v_game_date date;
  v_before integer;
  v_after integer;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then
    raise exception 'National championship edition not found';
  end if;

  select * into en
  from public.national_championship_entries
  where edition_id=e.id and rider_id=p_rider_id
  for update;

  if en.id is null then
    raise exception 'National championship entry not found';
  end if;

  if en.club_id_snapshot is null then
    raise exception 'Clubless riders are automatically entered';
  end if;

  select case
    when rc.club_type='developing' and rc.parent_club_id is not null
      then parent.owner_user_id
    else rc.owner_user_id
  end
  into v_owner
  from public.clubs rc
  left join public.clubs parent on parent.id=rc.parent_club_id
  where rc.id=en.club_id_snapshot;

  if v_owner is distinct from v_user then
    raise exception 'Not allowed to decide for this rider';
  end if;

  select public.get_current_game_date_date() into v_game_date;

  if e.participation_decision_deadline is null
     or v_game_date > e.participation_decision_deadline
  then
    raise exception 'The National Championship participation decision deadline has passed';
  end if;

  if en.participation_decision<>'pending' then
    return jsonb_build_object(
      'edition_id',e.id,
      'rider_id',en.rider_id,
      'participation_decision',en.participation_decision,
      'already_decided',true
    );
  end if;

  if p_approve then
    update public.national_championship_entries
    set participation_decision='approved',
        participation_decision_at=now(),
        participation_decision_user_id=v_user,
        updated_at=now()
    where id=en.id;

    return jsonb_build_object(
      'edition_id',e.id,
      'rider_id',en.rider_id,
      'participation_decision','approved',
      'duty_window_start_date',e.duty_window_start_date,
      'duty_window_end_date',e.duty_window_end_date
    );
  end if;

  select * into cfg
  from public.national_championship_config
  where id=true;

  select coalesce(morale,50) into v_before
  from public.riders
  where id=en.rider_id
  for update;

  v_after:=greatest(0,v_before-cfg.refusal_morale_penalty);

  update public.riders
  set morale=v_after,
      morale_updated_on=greatest(coalesce(morale_updated_on,v_game_date),v_game_date)
  where id=en.rider_id;

  update public.national_championship_entries
  set participation_decision='rejected',
      participation_decision_at=now(),
      participation_decision_user_id=v_user,
      refusal_morale_delta=-cfg.refusal_morale_penalty,
      entry_status='withdrawn',
      updated_at=now()
  where id=en.id;

  update public.national_championship_duties
  set status='cancelled',updated_at=now()
  where edition_id=e.id
    and rider_id=en.rider_id
    and status='confirmed';

  delete from public.national_championship_rider_plans
  where edition_id=e.id and rider_id=en.rider_id;

  update public.national_championship_heats h
  set assigned_count=(
        select count(*)::int
        from public.national_championship_entries x
        where x.heat_id=h.id
          and x.entry_status='qualification_assigned'
      ),
      updated_at=now()
  where h.edition_id=e.id;

  if en.entry_path='qualification' and en.heat_id is not null then
    perform public.national_championship_sync_race_participants_v1(
      e.id,'qualification',en.heat_id
    );
  elsif en.entry_path='direct' and e.final_race_id is not null then
    perform public.national_championship_sync_race_participants_v1(
      e.id,'final',null
    );
  end if;

  return jsonb_build_object(
    'edition_id',e.id,
    'rider_id',en.rider_id,
    'participation_decision','rejected',
    'morale_before',v_before,
    'morale_after',v_after,
    'morale_delta',-cfg.refusal_morale_penalty
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_auto_approve_pending_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_game_date date;
  v_count integer;
begin
  select public.get_current_game_date_date() into v_game_date;

  update public.national_championship_entries en
  set participation_decision='auto_approved',
      participation_decision_at=now(),
      updated_at=now()
  from public.national_championship_editions e
  where e.id=en.edition_id
    and en.participation_decision='pending'
    and e.participation_decision_deadline is not null
    and v_game_date > e.participation_decision_deadline;

  get diagnostics v_count=row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_pick_source_stage_for_window_v2(p_country_code text, p_season_number integer, p_event_key text, p_window_start date, p_window_end date, p_exclude_stage_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  cfg public.national_championship_config%rowtype;
  v_country text:=upper(trim(coalesce(p_country_code,'')));
  v_stage uuid;
  v_week_start date;
  v_week_end date;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  v_week_start:=date_trunc('week',p_window_start::timestamp)::date;
  v_week_end:=date_trunc('week',p_window_end::timestamp)::date+6;

  select s.id
  into v_stage
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where upper(trim(coalesce(nullif(s.host_country_code,''),r.country_code)))=v_country
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and coalesce(r.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    and coalesce(s.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    and lower(coalesce(s.stage_format,'road_race')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and lower(coalesce(s.terrain_type,'flat')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and s.id is distinct from p_exclude_stage_id
    and coalesce(s.mountain_pct,0)<=cfg.preferred_route_mountain_pct_max
    and coalesce(s.elevation_gain_m,0)<=cfg.preferred_route_elevation_gain_max
    and (
      coalesce(s.distance_km,0)<=0
      or coalesce(s.elevation_gain_m,0)
         <=coalesce(s.distance_km,0)*cfg.preferred_route_elevation_per_km_max
    )
    and not (
      coalesce(r.end_date,r.start_date)>=v_week_start
      and r.start_date<=v_week_end
    )
  order by md5(
    s.id::text||':'||v_country||':'||p_season_number::text||':'||
    coalesce(p_event_key,'event')||':'||p_window_start::text
  )
  limit 1;

  return v_stage;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_schedule_plan_v2(p_country_code text, p_season_number integer, p_eligible_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  cfg public.national_championship_config%rowtype;
  v_country text:=upper(trim(coalesce(p_country_code,'')));
  v_source text;
  v_year integer:=1999+p_season_number;
  v_plan jsonb;
  v_heat_count integer:=0;
  v_route_candidates integer:=0;
  q record;
  f record;
  v_q_start date;
  v_q_end date;
  v_final date;
  v_q_stage uuid;
  v_f_stage uuid;
  v_q_temp numeric;
  v_final_temp numeric;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  v_plan:=public.national_championship_population_plan_v1(p_eligible_count);
  v_heat_count:=coalesce((v_plan->>'heat_count')::integer,0);
  v_source:=public.national_championship_climate_source_country_v1(v_country);

  if v_source is null then
    return jsonb_build_object(
      'status','weather_data_unavailable',
      'climate_status','weather_data_unavailable',
      'route_status','pending',
      'country_code',v_country
    );
  end if;

  if not exists(
    select 1
    from public.country_weather_weekly_normals w
    where upper(w.country_code)=v_source
      and w.week_of_year between 16 and 48
      and w.avg_max_temp_c>cfg.climate_target_temp_c
  ) then
    return jsonb_build_object(
      'status','temperature_target_unavailable',
      'climate_status','temperature_target_unavailable',
      'route_status','pending',
      'country_code',v_country,
      'climate_source_country_code',v_source,
      'expected_max_temp_c',(
        select max(w.avg_max_temp_c)
        from public.country_weather_weekly_normals w
        where upper(w.country_code)=v_source
          and w.week_of_year between 16 and 48
      )
    );
  end if;

  select count(*)::int
  into v_route_candidates
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where upper(trim(coalesce(nullif(s.host_country_code,''),r.country_code)))=v_country
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and coalesce(r.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    and coalesce(s.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    and lower(coalesce(s.stage_format,'road_race')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and lower(coalesce(s.terrain_type,'flat')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and coalesce(s.mountain_pct,0)<=cfg.preferred_route_mountain_pct_max
    and coalesce(s.elevation_gain_m,0)<=cfg.preferred_route_elevation_gain_max
    and (
      coalesce(s.distance_km,0)<=0
      or coalesce(s.elevation_gain_m,0)
         <=coalesce(s.distance_km,0)*cfg.preferred_route_elevation_per_km_max
    );

  if v_route_candidates<2 then
    return jsonb_build_object(
      'status','route_unavailable',
      'climate_status','ready',
      'route_status',case when v_route_candidates=0 then 'missing_route' else 'single_route_only' end,
      'country_code',v_country,
      'climate_source_country_code',v_source,
      'heat_count',v_heat_count
    );
  end if;

  if v_heat_count=0 then
    for f in
      select w.week_of_year::int,w.avg_max_temp_c,w.avg_temp_c
      from public.country_weather_weekly_normals w
      where upper(w.country_code)=v_source
        and w.week_of_year between 16 and 48
        and w.avg_max_temp_c>cfg.climate_target_temp_c
      order by
        abs(w.avg_max_temp_c-26)
        +coalesce(w.p_heavy_rain,0)*8
        +coalesce(w.p_thunderstorm,0)*7
        +coalesce(w.p_rain,0)*2
        +greatest(coalesce(w.avg_wind_kmh,0)-20,0)*0.10
        +(abs(pg_catalog.hashtextextended(
          v_country||':'||p_season_number::text||':final:'||w.week_of_year::text,47
        ))%100)::numeric/10000.0,
        w.week_of_year
    loop
      v_final:=to_date(v_year::text||lpad(f.week_of_year::text,2,'0')||'1','IYYYIWID')+6;
      v_f_stage:=public.national_championship_pick_source_stage_for_window_v2(
        v_country,p_season_number,'final',v_final,v_final,null
      );
      if v_f_stage is null then continue; end if;

      v_q_stage:=public.national_championship_pick_source_stage_for_window_v2(
        v_country,p_season_number,'reserve-route',v_final,v_final,v_f_stage
      );
      if v_q_stage is null then continue; end if;

      return jsonb_build_object(
        'status','ready',
        'climate_status','ready',
        'route_status','ready',
        'country_code',v_country,
        'climate_source_country_code',v_source,
        'heat_count',0,
        'qualification_window_start_date',null,
        'qualification_window_end_date',null,
        'qualification_date',v_final-1,
        'final_window_start_date',v_final,
        'final_window_end_date',v_final,
        'final_date',v_final,
        'qualification_source_stage_id',v_q_stage,
        'final_source_stage_id',v_f_stage,
        'final_week_of_year',f.week_of_year,
        'week_of_year',f.week_of_year,
        'expected_max_temp_c',f.avg_max_temp_c,
        'final_expected_max_temp_c',f.avg_max_temp_c,
        'temperature_target_c',cfg.climate_target_temp_c
      );
    end loop;
  else
    for q in
      select w.week_of_year::int,w.avg_max_temp_c,w.avg_temp_c
      from public.country_weather_weekly_normals w
      where upper(w.country_code)=v_source
        and w.week_of_year between 16 and 44
        and w.avg_max_temp_c>cfg.climate_target_temp_c
      order by
        abs(w.avg_max_temp_c-26)
        +coalesce(w.p_heavy_rain,0)*8
        +coalesce(w.p_thunderstorm,0)*7
        +coalesce(w.p_rain,0)*2
        +(abs(pg_catalog.hashtextextended(
          v_country||':'||p_season_number::text||':qualification:'||w.week_of_year::text,47
        ))%100)::numeric/10000.0,
        w.week_of_year
    loop
      v_q_start:=to_date(v_year::text||lpad(q.week_of_year::text,2,'0')||'1','IYYYIWID');
      v_q_end:=v_q_start+(v_heat_count-1);

      if exists(
        select 1
        from generate_series(v_q_start,v_q_end,interval '1 day') d(day_value)
        left join public.country_weather_weekly_normals w
          on upper(w.country_code)=v_source
         and w.week_of_year=extract(week from d.day_value)::int
        where w.week_of_year is null
           or w.avg_max_temp_c<=cfg.climate_target_temp_c
      ) then
        continue;
      end if;

      v_q_stage:=public.national_championship_pick_source_stage_for_window_v2(
        v_country,p_season_number,'qualification',v_q_start,v_q_end,null
      );
      if v_q_stage is null then continue; end if;

      select min(w.avg_max_temp_c)
      into v_q_temp
      from public.country_weather_weekly_normals w
      where upper(w.country_code)=v_source
        and w.week_of_year between q.week_of_year
            and q.week_of_year+ceil(greatest(v_heat_count-1,0)::numeric/7)::int;

      for f in
        select w.week_of_year::int,w.avg_max_temp_c,w.avg_temp_c
        from public.country_weather_weekly_normals w
        where upper(w.country_code)=v_source
          and w.week_of_year between q.week_of_year+4 and least(q.week_of_year+8,48)
          and w.avg_max_temp_c>cfg.climate_target_temp_c
        order by
          abs(w.week_of_year-(q.week_of_year+6)),
          abs(w.avg_max_temp_c-26),
          w.week_of_year
      loop
        v_final:=to_date(v_year::text||lpad(f.week_of_year::text,2,'0')||'1','IYYYIWID')+6;
        if v_final<=v_q_end then continue; end if;

        v_f_stage:=public.national_championship_pick_source_stage_for_window_v2(
          v_country,p_season_number,'final',v_final,v_final,v_q_stage
        );
        if v_f_stage is null then continue; end if;

        v_final_temp:=f.avg_max_temp_c;

        return jsonb_build_object(
          'status','ready',
          'climate_status','ready',
          'route_status','ready',
          'country_code',v_country,
          'climate_source_country_code',v_source,
          'heat_count',v_heat_count,
          'qualification_window_start_date',v_q_start,
          'qualification_window_end_date',v_q_end,
          'qualification_date',v_q_start,
          'final_window_start_date',v_final,
          'final_window_end_date',v_final,
          'final_date',v_final,
          'qualification_source_stage_id',v_q_stage,
          'final_source_stage_id',v_f_stage,
          'qualification_week_of_year',q.week_of_year,
          'final_week_of_year',f.week_of_year,
          'week_of_year',q.week_of_year,
          'expected_max_temp_c',v_q_temp,
          'final_expected_max_temp_c',v_final_temp,
          'temperature_target_c',cfg.climate_target_temp_c
        );
      end loop;

      for f in
        select w.week_of_year::int,w.avg_max_temp_c,w.avg_temp_c
        from public.country_weather_weekly_normals w
        where upper(w.country_code)=v_source
          and w.week_of_year between q.week_of_year+3 and least(q.week_of_year+10,48)
          and w.avg_max_temp_c>cfg.climate_target_temp_c
        order by
          abs(w.week_of_year-(q.week_of_year+6)),
          abs(w.avg_max_temp_c-26),
          w.week_of_year
      loop
        v_final:=to_date(v_year::text||lpad(f.week_of_year::text,2,'0')||'1','IYYYIWID')+6;
        if v_final<=v_q_end then continue; end if;

        v_f_stage:=public.national_championship_pick_source_stage_for_window_v2(
          v_country,p_season_number,'final-fallback',v_final,v_final,v_q_stage
        );
        if v_f_stage is null then continue; end if;

        return jsonb_build_object(
          'status','ready',
          'climate_status','ready',
          'route_status','ready',
          'country_code',v_country,
          'climate_source_country_code',v_source,
          'heat_count',v_heat_count,
          'qualification_window_start_date',v_q_start,
          'qualification_window_end_date',v_q_end,
          'qualification_date',v_q_start,
          'final_window_start_date',v_final,
          'final_window_end_date',v_final,
          'final_date',v_final,
          'qualification_source_stage_id',v_q_stage,
          'final_source_stage_id',v_f_stage,
          'qualification_week_of_year',q.week_of_year,
          'final_week_of_year',f.week_of_year,
          'week_of_year',q.week_of_year,
          'expected_max_temp_c',coalesce(v_q_temp,q.avg_max_temp_c),
          'final_expected_max_temp_c',f.avg_max_temp_c,
          'temperature_target_c',cfg.climate_target_temp_c
        );
      end loop;
    end loop;
  end if;

  return jsonb_build_object(
    'status','route_calendar_conflict',
    'climate_status','ready',
    'route_status','calendar_conflict',
    'country_code',v_country,
    'climate_source_country_code',v_source,
    'heat_count',v_heat_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_national_championship_event_page_v1(p_edition_id uuid, p_event_type text, p_heat_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if h.id is not null and h.assigned_count>0 then
      v_field_count:=h.assigned_count;
    elsif coalesce(e.qualification_heat_count,0)>0 then
      select count(*)::int
      into v_field_count
      from generate_series(1,coalesce(e.eligible_count,0)) g(national_rank)
      where case
        when (floor(((g.national_rank-1)::numeric)/e.qualification_heat_count)::int % 2)=0
          then ((g.national_rank-1)%e.qualification_heat_count)+1
        else e.qualification_heat_count-((g.national_rank-1)%e.qualification_heat_count)
      end=p_heat_number;
    else
      v_field_count:=0;
    end if;
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_national_championship_event_page_v2(p_edition_id uuid, p_event_type text, p_heat_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_base jsonb;
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  v_race_id uuid;
  v_stage_id uuid;
  v_has_entries boolean:=false;
  v_participants jsonb:='[]'::jsonb;
  v_results jsonb:='[]'::jsonb;
  v_viewer_has_participant boolean:=false;
  v_current_game_date date:=public.get_current_game_date_date();
  v_preview_date date;
  v_generic_jersey constant text :=
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/AI%20Teams%20Kits/Genkit53.png';
begin
  v_base:=public.get_national_championship_event_page_v1(
    p_edition_id,p_event_type,p_heat_number
  );

  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then
    raise exception 'National Championship edition not found';
  end if;

  if p_event_type='qualification' then
    select * into h
    from public.national_championship_heats
    where edition_id=e.id
      and heat_number=p_heat_number
    limit 1;
  end if;

  v_race_id:=nullif(v_base->>'race_id','')::uuid;

  if v_race_id is not null then
    select s.id
    into v_stage_id
    from public.race_stages s
    where s.race_id=v_race_id
    order by s.stage_number
    limit 1;
  end if;

  select exists(
    select 1
    from public.national_championship_entries en
    where en.edition_id=e.id
  )
  into v_has_entries;

  v_preview_date:=least(v_current_game_date,e.ranking_snapshot_date);

  if p_event_type='qualification' then
    if v_has_entries then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.national_rank),'[]'::jsonb)
      into v_participants
      from (
        select
          en.rider_id,
          en.rider_name_snapshot as rider_name,
          en.national_rank,
          en.seed_number,
          en.club_id_snapshot as club_id,
          coalesce(c.name,'Free Agent') as team_name,
          en.country_code_snapshot as country_code,
          en.entry_status,
          en.participation_decision,
          coalesce(
            nullif(tk.config->>'image_url',''),
            nullif(aik.jersey_url,''),
            case when en.club_id_snapshot is null then v_generic_jersey else v_generic_jersey end
          ) as jersey_url
        from public.national_championship_entries en
        left join public.clubs c on c.id=en.club_id_snapshot
        left join lateral (
          select tk1.config
          from public.team_kits tk1
          where tk1.team_id=en.club_id_snapshot
          order by
            case when tk1.name='home' then 0 when tk1.name='default' then 1 else 2 end,
            tk1.updated_at desc
          limit 1
        ) tk on true
        left join lateral (
          select a.jersey_url
          from public.ai_team_kit_previews a
          where a.club_id=en.club_id_snapshot
            and coalesce(a.is_active,true)
          order by a.updated_at desc
          limit 1
        ) aik on true
        where en.edition_id=e.id
          and en.heat_number=p_heat_number
          and coalesce(en.participation_decision,'pending')<>'rejected'
          and en.entry_status<>'withdrawn'
      ) x;
    else
      select coalesce(jsonb_agg(to_jsonb(x) order by x.national_rank),'[]'::jsonb)
      into v_participants
      from (
        select
          p.rider_id,
          p.rider_name,
          p.national_rank,
          p.national_rank as seed_number,
          p.club_id,
          coalesce(c.name,'Free Agent') as team_name,
          p.country_code,
          'projected'::text as entry_status,
          'projected'::text as participation_decision,
          coalesce(
            nullif(tk.config->>'image_url',''),
            nullif(aik.jersey_url,''),
            v_generic_jersey
          ) as jersey_url
        from public.preview_national_ranking_v1(e.country_code,v_preview_date) p
        left join public.clubs c on c.id=p.club_id
        left join lateral (
          select tk1.config
          from public.team_kits tk1
          where tk1.team_id=p.club_id
          order by
            case when tk1.name='home' then 0 when tk1.name='default' then 1 else 2 end,
            tk1.updated_at desc
          limit 1
        ) tk on true
        left join lateral (
          select a.jersey_url
          from public.ai_team_kit_previews a
          where a.club_id=p.club_id
            and coalesce(a.is_active,true)
          order by a.updated_at desc
          limit 1
        ) aik on true
        where case
          when (floor(((p.national_rank-1)::numeric)/greatest(e.qualification_heat_count,1))::int % 2)=0
            then ((p.national_rank-1)%greatest(e.qualification_heat_count,1))+1
          else greatest(e.qualification_heat_count,1)-((p.national_rank-1)%greatest(e.qualification_heat_count,1))
        end=p_heat_number
      ) x;
    end if;
  elsif p_event_type='final' then
    if v_has_entries then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.national_rank),'[]'::jsonb)
      into v_participants
      from (
        select
          en.rider_id,
          en.rider_name_snapshot as rider_name,
          en.national_rank,
          en.seed_number,
          en.club_id_snapshot as club_id,
          coalesce(c.name,'Free Agent') as team_name,
          en.country_code_snapshot as country_code,
          en.entry_status,
          en.participation_decision,
          coalesce(
            nullif(tk.config->>'image_url',''),
            nullif(aik.jersey_url,''),
            v_generic_jersey
          ) as jersey_url
        from public.national_championship_entries en
        left join public.clubs c on c.id=en.club_id_snapshot
        left join lateral (
          select tk1.config
          from public.team_kits tk1
          where tk1.team_id=en.club_id_snapshot
          order by
            case when tk1.name='home' then 0 when tk1.name='default' then 1 else 2 end,
            tk1.updated_at desc
          limit 1
        ) tk on true
        left join lateral (
          select a.jersey_url
          from public.ai_team_kit_previews a
          where a.club_id=en.club_id_snapshot
            and coalesce(a.is_active,true)
          order by a.updated_at desc
          limit 1
        ) aik on true
        where en.edition_id=e.id
          and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date)
          and coalesce(en.participation_decision,'pending')<>'rejected'
      ) x;
    elsif coalesce(e.qualification_heat_count,0)=0 then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.national_rank),'[]'::jsonb)
      into v_participants
      from (
        select
          p.rider_id,
          p.rider_name,
          p.national_rank,
          p.national_rank as seed_number,
          p.club_id,
          coalesce(c.name,'Free Agent') as team_name,
          p.country_code,
          'projected'::text as entry_status,
          'projected'::text as participation_decision,
          coalesce(
            nullif(tk.config->>'image_url',''),
            nullif(aik.jersey_url,''),
            v_generic_jersey
          ) as jersey_url
        from public.preview_national_ranking_v1(e.country_code,v_preview_date) p
        left join public.clubs c on c.id=p.club_id
        left join lateral (
          select tk1.config
          from public.team_kits tk1
          where tk1.team_id=p.club_id
          order by
            case when tk1.name='home' then 0 when tk1.name='default' then 1 else 2 end,
            tk1.updated_at desc
          limit 1
        ) tk on true
        left join lateral (
          select a.jersey_url
          from public.ai_team_kit_previews a
          where a.club_id=p.club_id
            and coalesce(a.is_active,true)
          order by a.updated_at desc
          limit 1
        ) aik on true
        order by p.national_rank
        limit e.final_field_size
      ) x;
    else
      v_participants:='[]'::jsonb;
    end if;
  end if;

  if v_stage_id is not null then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.rank nulls last,x.rider_name),'[]'::jsonb)
    into v_results
    from (
      select
        rs.rank,
        rs.rider_id,
        coalesce(rs.rider_name_snapshot,en.rider_name_snapshot,r.display_name,
          trim(coalesce(r.first_name,'')||' '||coalesce(r.last_name,''))) as rider_name,
        en.club_id_snapshot as club_id,
        coalesce(c.name,rs.team_name_snapshot,'Free Agent') as team_name,
        coalesce(en.country_code_snapshot,r.country_code,e.country_code) as country_code,
        rs.elapsed_seconds,
        rs.gap_seconds,
        rs.status,
        coalesce(
          nullif(tk.config->>'image_url',''),
          nullif(aik.jersey_url,''),
          v_generic_jersey
        ) as jersey_url
      from public.race_stage_results rs
      left join public.national_championship_entries en
        on en.edition_id=e.id
       and en.rider_id=rs.rider_id
      left join public.riders r on r.id=rs.rider_id
      left join public.clubs c on c.id=en.club_id_snapshot
      left join lateral (
        select tk1.config
        from public.team_kits tk1
        where tk1.team_id=en.club_id_snapshot
        order by
          case when tk1.name='home' then 0 when tk1.name='default' then 1 else 2 end,
          tk1.updated_at desc
        limit 1
      ) tk on true
      left join lateral (
        select a.jersey_url
        from public.ai_team_kit_previews a
        where a.club_id=en.club_id_snapshot
          and coalesce(a.is_active,true)
        order by a.updated_at desc
        limit 1
      ) aik on true
      where rs.stage_id=v_stage_id
        and rs.rider_id is not null
    ) x;
  end if;

  if v_has_entries then
    select exists(
      select 1
      from public.national_championship_entries en
      left join public.clubs rc on rc.id=en.club_id_snapshot
      left join public.clubs root
        on root.id=case
          when rc.club_type='developing' and rc.parent_club_id is not null
            then rc.parent_club_id
          else rc.id
        end
      where en.edition_id=e.id
        and root.owner_user_id=auth.uid()
        and coalesce(en.participation_decision,'pending')<>'rejected'
        and (
          (p_event_type='qualification'
            and en.heat_number=p_heat_number
            and en.entry_status<>'withdrawn')
          or
          (p_event_type='final'
            and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
        )
    )
    into v_viewer_has_participant;
  end if;

  return v_base || jsonb_build_object(
    'current_game_date',v_current_game_date,
    'generated_stage_id',v_stage_id,
    'participants',v_participants,
    'participants_known',
      case
        when p_event_type='final'
         and coalesce(e.qualification_heat_count,0)>0
         and jsonb_array_length(v_participants)=0
        then false
        else true
      end,
    'results',v_results,
    'viewer_has_participant',v_viewer_has_participant,
    'generated_stage',case
      when v_stage_id is null then null
      else (
        select jsonb_build_object(
          'id',s.id,
          'race_id',s.race_id,
          'stage_number',s.stage_number,
          'stage_date',s.stage_date,
          'name',s.name,
          'start_city',coalesce(nullif(s.start_city_name,''),s.start_city),
          'finish_city',coalesce(nullif(s.finish_city_name,''),s.finish_city),
          'planned_start_time_label',s.planned_start_time_label,
          'planned_start_hour_number',s.planned_start_hour_number,
          'planned_start_minute',s.planned_start_minute,
          'terrain_type',s.terrain_type,
          'profile_type',s.profile_type,
          'distance_km',s.distance_km,
          'elevation_gain_m',s.elevation_gain_m,
          'flat_pct',s.flat_pct,
          'hilly_pct',s.hilly_pct,
          'mountain_pct',s.mountain_pct,
          'cobbled_pct',s.cobbled_pct,
          'weather_snapshot',coalesce(s.weather_snapshot,'{}'::jsonb),
          'weather_summary',s.weather_summary,
          'weather_cancelled',s.weather_cancelled,
          'weather_cancellation_reason',s.weather_cancellation_reason
        )
        from public.race_stages s
        where s.id=v_stage_id
      )
    end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.world_road_championship_pick_host_v1(p_season_number integer, p_race_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_week integer := extract(week from p_race_date)::integer;
  v_previous_host text;
  v_row record;
begin
  select host_country_code
  into v_previous_host
  from public.world_road_championship_editions
  where season_number < p_season_number
    and host_country_code is not null
  order by season_number desc
  limit 1;

  select *
  into v_row
  from (
    select
      w.country_code,
      coalesce(c.name,w.country_code) as country_name,
      w.avg_temp_c,
      w.avg_max_temp_c,
      w.avg_precip_mm,
      src.source_stage_id,
      s.terrain_type,
      s.profile_type
    from public.country_weather_weekly_normals w
    left join public.countries c on c.code=w.country_code
    cross join lateral (
      select public.national_championship_pick_source_stage_for_window_v2(
        w.country_code,
        p_season_number,
        'world_road_championship',
        p_race_date,
        p_race_date,
        null
      ) as source_stage_id
    ) src
    left join public.race_stages s on s.id=src.source_stage_id
    where w.week_of_year=v_week
      and w.avg_temp_c > 24
      and coalesce(w.avg_max_temp_c,30) <= 36
      and (v_previous_host is null or w.country_code<>v_previous_host)
      and src.source_stage_id is not null
      and lower(coalesce(s.terrain_type,'')) <> 'mountain'
  ) candidate
  order by
    md5(p_season_number::text||':'||candidate.country_code),
    coalesce(candidate.avg_precip_mm,999)
  limit 1;

  if v_row.country_code is null then
    select *
    into v_row
    from (
      select
        w.country_code,
        coalesce(c.name,w.country_code) as country_name,
        w.avg_temp_c,
        w.avg_max_temp_c,
        w.avg_precip_mm,
        src.source_stage_id,
        s.terrain_type,
        s.profile_type
      from public.country_weather_weekly_normals w
      left join public.countries c on c.code=w.country_code
      cross join lateral (
        select public.national_championship_pick_source_stage_for_window_v2(
          w.country_code,
          p_season_number,
          'world_road_championship',
          p_race_date,
          p_race_date,
          null
        ) as source_stage_id
      ) src
      left join public.race_stages s on s.id=src.source_stage_id
      where w.week_of_year=v_week
        and w.avg_temp_c > 24
        and src.source_stage_id is not null
        and lower(coalesce(s.terrain_type,'')) <> 'mountain'
    ) candidate
    order by
      md5(p_season_number::text||':fallback:'||candidate.country_code),
      coalesce(candidate.avg_precip_mm,999)
    limit 1;
  end if;

  if v_row.country_code is null then
    return jsonb_build_object(
      'status','missing_route',
      'week_of_year',v_week
    );
  end if;

  return jsonb_build_object(
    'status','ready',
    'country_code',v_row.country_code,
    'country_name',v_row.country_name,
    'week_of_year',v_week,
    'avg_temp_c',v_row.avg_temp_c,
    'avg_max_temp_c',v_row.avg_max_temp_c,
    'avg_precip_mm',v_row.avg_precip_mm,
    'source_stage_id',v_row.source_stage_id,
    'terrain_type',v_row.terrain_type,
    'profile_type',v_row.profile_type
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_world_road_championship_for_season_v1(p_season_number integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_existing public.world_road_championship_editions%rowtype;
  v_date date;
  v_host jsonb;
  v_id uuid;
begin
  select * into v_existing
  from public.world_road_championship_editions
  where season_number=p_season_number
  for update;

  if v_existing.id is null then
    v_date:=public.world_road_championship_race_date_v1(p_season_number);
    v_host:=public.world_road_championship_pick_host_v1(p_season_number,v_date);

    insert into public.world_road_championship_editions(
      season_number,race_date,decision_deadline,
      final_confirmation_open_date,final_decision_deadline,
      host_country_code,host_country_name_snapshot,
      climate_week_of_year,climate_avg_temp_c,climate_expected_max_temp_c,
      source_stage_id,status,route_status,schedule_draw_status,schedule_locked_at
    )
    values(
      p_season_number,v_date,v_date-10,
      v_date-7,v_date-3,
      nullif(v_host->>'country_code',''),
      nullif(v_host->>'country_name',''),
      nullif(v_host->>'week_of_year','')::integer,
      nullif(v_host->>'avg_temp_c','')::numeric,
      nullif(v_host->>'avg_max_temp_c','')::numeric,
      nullif(v_host->>'source_stage_id','')::uuid,
      'planned',
      case when v_host->>'status'='ready' then 'ready' else 'missing_route' end,
      'locked',
      now()
    )
    returning id into v_id;
  else
    v_id:=v_existing.id;

    update public.world_road_championship_editions
    set decision_deadline=least(coalesce(decision_deadline,race_date-10),race_date-10),
        final_confirmation_open_date=coalesce(final_confirmation_open_date,race_date-7),
        final_decision_deadline=coalesce(final_decision_deadline,race_date-3),
        schedule_draw_status='locked',
        schedule_locked_at=coalesce(schedule_locked_at,now()),
        updated_at=now()
    where id=v_id;
  end if;

  perform public.world_road_championship_ensure_race_v1(v_id);
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_world_road_championship_overview_v1(p_season_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_season integer;
  v_game_date date;
  v_edition public.world_road_championship_editions%rowtype;
  v_user uuid:=auth.uid();
begin
  select
    coalesce(p_season_number,gs.season_number),
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_game_date
  from public.game_state gs
  where gs.id=true;

  select * into v_edition
  from public.world_road_championship_editions
  where season_number=v_season;

  if v_edition.id is null then
    return jsonb_build_object(
      'season_number',v_season,
      'current_game_date',v_game_date,
      'edition',null,
      'route',null,
      'participant_count',0,
      'confirmed_count',0,
      'my_entries','[]'::jsonb,
      'past_champions','[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'season_number',v_season,
    'current_game_date',v_game_date,
    'edition',to_jsonb(v_edition),
    'route',case
      when v_edition.race_id is null then null
      else (
        select jsonb_build_object(
          'stage_id',s.id,
          'start_city',coalesce(nullif(s.start_city_name,''),s.start_city),
          'finish_city',coalesce(nullif(s.finish_city_name,''),s.finish_city),
          'route_label',
            coalesce(nullif(s.start_city_name,''),s.start_city,'Start')||' → '||
            coalesce(nullif(s.finish_city_name,''),s.finish_city,'Finish'),
          'distance_km',s.distance_km,
          'terrain_type',s.terrain_type,
          'elevation_gain_m',s.elevation_gain_m,
          'profile_type',s.profile_type
        )
        from public.race_stages s
        where s.race_id=v_edition.race_id
        order by s.stage_number
        limit 1
      )
    end,
    'participant_count',(
      select count(*)::int
      from public.world_road_championship_entries en
      where en.edition_id=v_edition.id
        and en.entry_status in ('invited','confirmed')
        and en.participation_decision<>'rejected'
    ),
    'confirmed_count',(
      select count(*)::int
      from public.world_road_championship_entries en
      where en.edition_id=v_edition.id
        and en.entry_status='confirmed'
        and en.participation_decision in ('approved','auto_approved')
    ),
    'my_entries',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'entry_id',en.id,
          'rider_id',en.rider_id,
          'rider_name',en.rider_name_snapshot,
          'country_code',en.country_code,
          'club_id',en.club_id_snapshot,
          'club_name',en.club_name_snapshot,
          'entry_status',en.entry_status,
          'participation_decision',en.participation_decision,
          'participation_decision_at',en.participation_decision_at,
          'morale_delta',en.morale_delta,
          'decision_deadline',v_edition.decision_deadline,
          'race_date',v_edition.race_date,
          'race_id',v_edition.race_id,
          'can_decide_participation',
            v_game_date<=v_edition.decision_deadline
            and en.participation_decision='pending'
        )
        order by en.country_code,en.rider_name_snapshot
      )
      from public.world_road_championship_entries en
      join public.clubs rc on rc.id=en.club_id_snapshot
      left join public.clubs root
        on root.id=case
          when rc.club_type='developing' and rc.parent_club_id is not null
            then rc.parent_club_id
          else rc.id
        end
      where en.edition_id=v_edition.id
        and root.owner_user_id=v_user
    ),'[]'::jsonb),
    'past_champions',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.season_number desc)
      from (
        select
          season_number,race_date,host_country_code,host_country_name_snapshot,
          race_id,champion_rider_id,champion_name_snapshot,
          champion_club_name_snapshot,second_rider_id,third_rider_id
        from public.world_road_championship_editions
        where status='completed'
        order by season_number desc
        limit 20
      ) x
    ),'[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_championship_honours_v1(p_rider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current_season integer;
begin
  select season_number into v_current_season
  from public.game_state
  where id=true;

  return jsonb_build_object(
    'current_season',v_current_season,
    'honours',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'season_number',h.season_number,
          'honor_type',h.honor_type,
          'rank',h.rank,
          'country_code',h.country_code,
          'source_race_id',h.source_race_id,
          'awarded_on',h.awarded_on,
          'is_current_season',h.season_number=v_current_season
        )
        order by h.season_number desc,
          case h.honor_type when 'world_road' then 0 else 1 end,
          h.rank
      )
      from public.rider_championship_honours h
      where h.rider_id=p_rider_id
    ),'[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.world_road_championship_sync_participants_v1(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.world_road_championship_editions%rowtype;
  v_race_id uuid;
  v_stage_id uuid;
  v_rider_count integer:=0;
  v_team_count integer:=0;
begin
  select * into e
  from public.world_road_championship_editions
  where id=p_edition_id
  for update;

  if e.id is null then
    raise exception 'World Road Championship edition not found';
  end if;

  v_race_id:=e.race_id;
  if v_race_id is null then
    return jsonb_build_object('status','race_not_ready','edition_id',e.id);
  end if;

  select id into v_stage_id
  from public.race_stages
  where race_id=v_race_id
  order by stage_number
  limit 1;

  if v_stage_id is null then
    return jsonb_build_object('status','stage_not_ready','race_id',v_race_id);
  end if;

  if exists(
    select 1
    from public.race_stage_simulation_runs sr
    where sr.stage_id=v_stage_id
      and sr.status in ('running','completed')
  ) then
    return jsonb_build_object(
      'status','participants_locked',
      'race_id',v_race_id,
      'stage_id',v_stage_id
    );
  end if;

  insert into public.race_preparations(
    race_id,club_id,status,startlist_status,
    setup_window_opens_on,rider_submission_deadline_on,submitted_at,
    rider_count,staff_count,
    participation_cost_cash,travel_cost_cash,staff_travel_cost_cash,
    asset_transport_cost_cash,supplies_cost_cash,operations_cost_cash,total_cost_cash,
    cost_breakdown_json,team_policies_snapshot_json,validation_snapshot_json,
    engine_payload_json,metadata,participating_club_id
  )
  select
    v_race_id,
    x.club_id,
    'submitted','submitted',
    e.race_date-14,e.race_date,now(),
    x.rider_count,0,
    0,0,0,0,0,0,0,
    jsonb_build_object(
      'world_road_championship',true,
      'organizer_paid',true,
      'all_team_costs_covered',true
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'world_road_championship',true,
      'standardized_bonus_totals',jsonb_build_object(
        'race_support',0,
        'fatigue_control',0,
        'recovery_support',0,
        'health_protection',0,
        'mechanical_reliability',0
      )
    ),
    jsonb_build_object(
      'world_road_championship',true,
      'participating_club_id',x.club_id
    ),
    jsonb_build_object(
      'world_road_championship',true,
      'preparation_mode','individual_riders_only',
      'organizer_paid',true,
      'team_commands_enabled',false
    ),
    x.club_id
  from (
    select en.club_id_snapshot as club_id,count(*)::int rider_count
    from public.world_road_championship_entries en
    where en.edition_id=e.id
      and en.club_id_snapshot is not null
      and en.entry_status in ('invited','confirmed')
      and en.participation_decision<>'rejected'
    group by en.club_id_snapshot
  ) x
  on conflict (race_id,club_id) do update
    set rider_count=excluded.rider_count,
        participating_club_id=excluded.participating_club_id,
        metadata=public.race_preparations.metadata||excluded.metadata,
        engine_payload_json=public.race_preparations.engine_payload_json||excluded.engine_payload_json,
        validation_snapshot_json=excluded.validation_snapshot_json,
        participation_cost_cash=0,
        travel_cost_cash=0,
        staff_travel_cost_cash=0,
        asset_transport_cost_cash=0,
        supplies_cost_cash=0,
        operations_cost_cash=0,
        total_cost_cash=0,
        updated_at=now();

  delete from public.race_preparation_riders selected
  using public.race_preparations rp
  where selected.race_preparation_id=rp.id
    and rp.race_id=v_race_id
    and coalesce((rp.metadata->>'world_road_championship')::boolean,false)
    and not exists(
      select 1
      from public.world_road_championship_entries en
      where en.edition_id=e.id
        and en.rider_id=selected.rider_id
        and en.club_id_snapshot=rp.club_id
        and en.entry_status in ('invited','confirmed')
        and en.participation_decision<>'rejected'
    );

  insert into public.race_preparation_riders(
    race_preparation_id,rider_id,start_number,race_role,
    default_equipment_setup_id,availability_snapshot_json,rider_snapshot_json,
    bonus_snapshot_json,metadata
  )
  select
    rp.id,en.rider_id,
    row_number() over(order by en.country_code,en.rider_name_snapshot)::int,
    'free_role',null,
    jsonb_build_object(
      'availability_status',r.availability_status,
      'unavailable_until',r.unavailable_until,
      'unavailable_reason',r.unavailable_reason
    ),
    jsonb_build_object(
      'world_road_championship',true,
      'country_code',en.country_code,
      'overall',r.overall,
      'role',r.role
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'world_road_championship',true,
      'individual_only',true
    )
  from public.world_road_championship_entries en
  join public.riders r on r.id=en.rider_id
  join public.race_preparations rp
    on rp.race_id=v_race_id
   and rp.club_id=en.club_id_snapshot
  where en.edition_id=e.id
    and en.club_id_snapshot is not null
    and en.entry_status in ('invited','confirmed')
    and en.participation_decision<>'rejected'
  on conflict (race_preparation_id,rider_id) do update
    set start_number=excluded.start_number,
        race_role='free_role',
        availability_snapshot_json=excluded.availability_snapshot_json,
        rider_snapshot_json=excluded.rider_snapshot_json,
        metadata=public.race_preparation_riders.metadata||excluded.metadata,
        updated_at=now();

  insert into public.race_stage_plans(
    race_preparation_id,race_id,stage_id,stage_number,stage_date,status,
    opens_on_game_date,locks_on_game_date,submitted_at,
    stage_objective,team_strategy,risk_level,
    stage_profile_snapshot_json,bonus_snapshot_json,engine_stage_payload_json,
    metadata,rider_equipment_json,rider_roles_json,team_tactic_json,
    rider_supplies_json,rider_individual_tactics_json,last_saved_at,last_saved_game_ts
  )
  select
    rp.id,v_race_id,v_stage_id,1,s.stage_date,'submitted',
    e.race_date-14,e.race_date,now(),
    'balanced','balanced','normal',
    to_jsonb(s),'{}'::jsonb,
    jsonb_build_object('world_road_championship',true),
    jsonb_build_object(
      'world_road_championship',true,
      'team_strategy_locked','balanced',
      'staff_assets_supplies_locked',true,
      'team_commands_enabled',false
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'plan','balanced',
      'internal_neutral_placeholder',true,
      'team_commands_enabled',false,
      'notes','World Road Championship: riders compete independently'
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),public.get_current_game_ts_local()
  from public.race_preparations rp
  join public.race_stages s on s.id=v_stage_id
  where rp.race_id=v_race_id
    and coalesce((rp.metadata->>'world_road_championship')::boolean,false)
  on conflict (race_preparation_id,stage_number) do update
    set stage_id=excluded.stage_id,
        stage_date=excluded.stage_date,
        status='submitted',
        team_strategy='balanced',
        team_tactic_json=excluded.team_tactic_json,
        metadata=public.race_stage_plans.metadata||excluded.metadata,
        updated_at=now();

  insert into public.race_stage_plan_riders(
    race_stage_plan_id,rider_id,stage_role,tactic,risk_level,effort_level,
    equipment_setup_id,rider_stage_snapshot_json,
    equipment_bonus_snapshot_json,final_bonus_snapshot_json,metadata
  )
  select
    sp.id,en.rider_id,'free_role','balanced','normal','normal',null,
    jsonb_build_object(
      'world_road_championship',true,
      'country_code',en.country_code
    ),
    '{}'::jsonb,'{}'::jsonb,
    jsonb_build_object('world_road_championship',true,'individual_only',true)
  from public.world_road_championship_entries en
  join public.race_preparations rp
    on rp.race_id=v_race_id
   and rp.club_id=en.club_id_snapshot
  join public.race_stage_plans sp
    on sp.race_preparation_id=rp.id
   and sp.stage_id=v_stage_id
  where en.edition_id=e.id
    and en.club_id_snapshot is not null
    and en.entry_status in ('invited','confirmed')
    and en.participation_decision<>'rejected'
  on conflict (race_stage_plan_id,rider_id) do update
    set stage_role='free_role',
        tactic='balanced',
        rider_stage_snapshot_json=public.race_stage_plan_riders.rider_stage_snapshot_json||excluded.rider_stage_snapshot_json,
        metadata=public.race_stage_plan_riders.metadata||excluded.metadata,
        updated_at=now();

  delete from public.race_participant_riders where race_id=v_race_id;
  delete from public.race_participant_teams where race_id=v_race_id;

  insert into public.race_participant_teams(
    race_id,team_id,status,team_name_snapshot,logo_url_snapshot,
    country_code_snapshot,ranking_snapshot,submitted_at,accepted_at
  )
  select
    v_race_id,
    x.team_id,
    'accepted',
    x.team_name,
    null,
    x.country_code,
    null,
    now(),now()
  from (
    select distinct on (coalesce(en.club_id_snapshot,en.rider_id))
      coalesce(en.club_id_snapshot,en.rider_id) as team_id,
      case
        when en.club_id_snapshot is null then 'Free Agent'
        else coalesce(c.name,en.club_name_snapshot,'Team')
      end as team_name,
      en.country_code
    from public.world_road_championship_entries en
    left join public.clubs c on c.id=en.club_id_snapshot
    where en.edition_id=e.id
      and en.entry_status in ('invited','confirmed')
      and en.participation_decision<>'rejected'
    order by coalesce(en.club_id_snapshot,en.rider_id),en.country_code
  ) x;

  insert into public.race_participant_riders(
    race_id,team_id,rider_id,rider_name_snapshot,team_name_snapshot,
    country_code_snapshot,age_snapshot,is_young_rider,start_number,
    role_snapshot,overall_snapshot,can_view_exact_overall,overall_range_label
  )
  select
    v_race_id,
    coalesce(en.club_id_snapshot,en.rider_id),
    en.rider_id,
    en.rider_name_snapshot,
    case
      when en.club_id_snapshot is null then 'Free Agent'
      else coalesce(c.name,en.club_name_snapshot,'Team')
    end,
    en.country_code,
    greatest(0,extract(year from age(e.race_date,r.birth_date))::int),
    extract(year from age(e.race_date,r.birth_date))::int<=21,
    row_number() over(order by en.country_code,en.rider_name_snapshot)::int,
    r.role::text,
    r.overall,
    true,
    null
  from public.world_road_championship_entries en
  join public.riders r on r.id=en.rider_id
  left join public.clubs c on c.id=en.club_id_snapshot
  where en.edition_id=e.id
    and en.entry_status in ('invited','confirmed')
    and en.participation_decision<>'rejected'
  order by en.country_code,en.rider_name_snapshot;

  select count(*)::int,count(distinct team_id)::int
  into v_rider_count,v_team_count
  from public.race_participant_riders
  where race_id=v_race_id;

  update public.world_road_championship_editions
  set participant_count=v_rider_count,
      confirmed_count=(
        select count(*)::int
        from public.world_road_championship_entries en
        where en.edition_id=e.id
          and en.entry_status='confirmed'
          and en.participation_decision in ('approved','auto_approved')
      ),
      updated_at=now()
  where id=e.id;

  return jsonb_build_object(
    'status','participants_synced',
    'edition_id',e.id,
    'race_id',v_race_id,
    'stage_id',v_stage_id,
    'rider_count',v_rider_count,
    'team_count',v_team_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.world_road_championship_ensure_race_v1(p_edition_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.world_road_championship_editions%rowtype;
  src public.race_stages%rowtype;
  v_race_id uuid;
  v_stage_id uuid;
  v_host_city text;
  v_region text;
  v_hour integer;
  v_country_name text;
  v_source_race_id uuid;
begin
  select * into e
  from public.world_road_championship_editions
  where id=p_edition_id
  for update;

  if e.id is null then
    raise exception 'World Road Championship edition not found';
  end if;

  if e.race_id is not null then
    perform public.world_road_championship_sync_participants_v1(e.id);
    return e.race_id;
  end if;

  if e.host_country_code is null or e.source_stage_id is null then
    return null;
  end if;

  select * into src
  from public.race_stages
  where id=e.source_stage_id;

  if src.id is null then
    update public.world_road_championship_editions
    set route_status='missing_route',updated_at=now()
    where id=e.id;
    return null;
  end if;

  v_source_race_id:=src.race_id;
  v_country_name:=coalesce(e.host_country_name_snapshot,e.host_country_code);
  v_host_city:=coalesce(
    nullif(src.host_city,''),
    nullif(src.start_city_name,''),
    nullif(src.start_city,''),
    nullif(src.finish_city_name,''),
    nullif(src.finish_city,''),
    v_country_name
  );
  v_region:=public.race_start_region_code_v1(e.host_country_code);
  v_hour:=case v_region when 'apac' then 9 when 'americas' then 11 else 13 end;

  insert into public.races(
    name,short_name,start_date,end_date,country_code,host_city,
    category,race_type,is_stage_race,stage_count,status,
    profile_image_url,logo_url,description,metadata,
    start_time_region_code,planned_start_hour_number,planned_start_minute,
    planned_start_time_label,planned_start_assigned_at
  )
  values(
    'World Road Championship Grand Finale',
    'World Road Championship',
    e.race_date,e.race_date,e.host_country_code,v_host_city,
    'WRC','one_day',false,1,'scheduled',
    null,
    e.logo_url,
    'One-day World Road Championship for the current national road champions. Prestige only; all team costs are covered by the organizer.',
    jsonb_build_object(
      'world_road_championship',true,
      'world_road_championship_edition_id',e.id,
      'season_number',e.season_number,
      'host_country_code',e.host_country_code,
      'source_stage_id',e.source_stage_id,
      'source_race_id',v_source_race_id,
      'display_logo_mode','custom_logo',
      'custom_logo_url',e.logo_url,
      'no_country_flag',true,
      'individual_only',true,
      'team_commands_enabled',false,
      'all_team_costs_covered',true,
      'team_cost_cash',0,
      'team_cost_coins',0,
      'prize_money_cash',0,
      'prestige_only',true
    ),
    v_region,v_hour,0,lpad(v_hour::text,2,'0')||':00',now()
  )
  returning id into v_race_id;

  insert into public.race_stages(
    race_id,stage_number,stage_date,name,start_city,finish_city,host_city,
    host_country_code,distance_km,terrain_type,finish_type,is_summit_finish,
    flat_pct,hilly_pct,mountain_pct,cobbled_pct,elevation_gain_m,
    profile_image_url,rules_snapshot,metadata,start_city_name,finish_city_name,
    profile_type,notes,intermediate_sprints_json,mountain_climbs_json,
    start_time_region_code,planned_start_hour_number,planned_start_minute,
    planned_start_time_label,planned_start_assigned_at,stage_format
  )
  values(
    v_race_id,1,e.race_date,
    'World Road Championship Grand Finale',
    coalesce(src.start_city,src.start_city_name),
    coalesce(src.finish_city,src.finish_city_name),
    v_host_city,e.host_country_code,
    src.distance_km,src.terrain_type,src.finish_type,coalesce(src.is_summit_finish,false),
    src.flat_pct,src.hilly_pct,src.mountain_pct,src.cobbled_pct,src.elevation_gain_m,
    null,'{}'::jsonb,
    jsonb_build_object(
      'world_road_championship',true,
      'world_road_championship_edition_id',e.id,
      'source_stage_id',e.source_stage_id,
      'source_race_id',v_source_race_id,
      'source_competition_identity_hidden',true,
      'only_start_and_finish_points',true,
      'actual_host_country_code',e.host_country_code
    ),
    coalesce(src.start_city_name,src.start_city),
    coalesce(src.finish_city_name,src.finish_city),
    src.profile_type,
    'World Road Championship route using the selected warm-weather host-country road profile.',
    '[]'::jsonb,'[]'::jsonb,
    v_region,v_hour,0,lpad(v_hour::text,2,'0')||':00',now(),'road_race'
  )
  returning id into v_stage_id;

  insert into public.race_stage_profile_details(
    stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,
    distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
    profile_points,route_markers,intermediate_sprints,mountain_climbs,
    metadata,weather_snapshot
  )
  select
    v_stage_id,v_race_id,
    'World Road Championship Grand Finale',
    coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
      ||' → '||
    coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish'),
    'World Road Championship Grand Finale on a warm-weather host-country road route.',
    null,
    coalesce(spd.distance_km,src.distance_km),
    coalesce(spd.elevation_gain_m,src.elevation_gain_m,0),
    coalesce(spd.terrain_type,src.terrain_type,'flat'),
    coalesce(spd.profile_type,src.profile_type,'mixed'),
    coalesce(spd.terrain_split,jsonb_build_object(
      'flat',coalesce(src.flat_pct,0),
      'hilly',coalesce(src.hilly_pct,0),
      'mountain',coalesce(src.mountain_pct,0),
      'cobbled',coalesce(src.cobbled_pct,0)
    )),
    coalesce(spd.profile_points,'[]'::jsonb),
    jsonb_build_array(
      jsonb_build_object('km',0,'type','start','label',coalesce(src.start_city_name,src.start_city,'Start')),
      jsonb_build_object('km',src.distance_km,'type','finish','label',coalesce(src.finish_city_name,src.finish_city,'Finish'))
    ),
    '[]'::jsonb,'[]'::jsonb,
    jsonb_build_object(
      'world_road_championship',true,
      'source_stage_id',e.source_stage_id,
      'source_competition_identity_hidden',true,
      'only_start_and_finish_points',true
    ),
    coalesce(spd.weather_snapshot,src.weather_snapshot,'{}'::jsonb)
  from public.race_stage_profile_details spd
  where spd.stage_id=e.source_stage_id
  on conflict (stage_id) do nothing;

  if not exists(
    select 1 from public.race_stage_profile_details where stage_id=v_stage_id
  ) then
    insert into public.race_stage_profile_details(
      stage_id,race_id,stage_title,route_label,stage_summary,
      distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
      profile_points,route_markers,intermediate_sprints,mountain_climbs,
      metadata,weather_snapshot
    )
    values(
      v_stage_id,v_race_id,'World Road Championship Grand Finale',
      coalesce(src.start_city_name,src.start_city,'Start')||' → '||
      coalesce(src.finish_city_name,src.finish_city,'Finish'),
      'World Road Championship Grand Finale on a warm-weather host-country road route.',
      coalesce(src.distance_km,0),coalesce(src.elevation_gain_m,0),
      coalesce(src.terrain_type,'flat'),coalesce(src.profile_type,'mixed'),
      jsonb_build_object(
        'flat',coalesce(src.flat_pct,0),
        'hilly',coalesce(src.hilly_pct,0),
        'mountain',coalesce(src.mountain_pct,0),
        'cobbled',coalesce(src.cobbled_pct,0)
      ),
      coalesce(
        src.metadata #> '{route_profile_v1,profile_points}',
        src.metadata->'profile_points',
        '[]'::jsonb
      ),
      jsonb_build_array(
        jsonb_build_object('km',0,'type','start','label',coalesce(src.start_city_name,src.start_city,'Start')),
        jsonb_build_object('km',src.distance_km,'type','finish','label',coalesce(src.finish_city_name,src.finish_city,'Finish'))
      ),
      '[]'::jsonb,'[]'::jsonb,
      jsonb_build_object(
        'world_road_championship',true,
        'source_stage_id',e.source_stage_id,
        'only_start_and_finish_points',true
      ),
      coalesce(src.weather_snapshot,'{}'::jsonb)
    );
  end if;

  perform public.sync_race_stage_points_from_stage_json_v1(v_stage_id,true);

  delete from public.race_stage_points
  where stage_id=v_stage_id
    and upper(point_type) not in ('START','FINISH');

  update public.race_stage_points
  set points_scheme='[]'::jsonb,
      time_bonus_seconds='[]'::jsonb,
      kom_category=null,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'world_road_championship',true,
        'prestige_only',true
      )
  where stage_id=v_stage_id;

  insert into public.race_entry_rules(
    race_id,race_class_code,target_teams,min_teams,max_teams,
    min_riders_per_team,max_riders_per_team,
    applications_open_game_date,applications_close_game_date,
    applications_status,auto_close_when_full,allow_waitlist,
    prize_fund_cash,prize_fund_source,metadata,
    race_season_number,race_start_month_number,race_start_day_number,
    application_window_policy,rider_submission_deadline
  )
  values(
    v_race_id,'1.1',200,1,200,1,200,
    e.race_date-1,e.race_date-1,'closed',true,false,
    0,'manual_override',
    jsonb_build_object(
      'world_road_championship',true,
      'applications_disabled',true,
      'automatic_entry',true,
      'all_team_costs_covered',true,
      'no_prize_money',true,
      'prestige_only',true
    ),
    e.season_number,
    extract(month from e.race_date)::int,
    extract(day from e.race_date)::int,
    'standard_90_3',
    e.race_date
  );

  update public.world_road_championship_editions
  set race_id=v_race_id,status='ready',route_status='ready',updated_at=now()
  where id=e.id;

  perform public.world_road_championship_sync_participants_v1(e.id);

  return v_race_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.world_road_championship_register_national_champion_v1(p_national_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  n public.national_championship_editions%rowtype;
  w public.world_road_championship_editions%rowtype;
  v_world_id uuid;
  v_owner uuid;
  v_decision text;
  v_status text;
  v_before integer;
  v_after integer;
  v_entry_id uuid;
begin
  select * into n
  from public.national_championship_editions
  where id=p_national_edition_id;

  if n.id is null
     or n.status<>'completed'
     or n.champion_rider_id is null
  then
    return jsonb_build_object('status','national_champion_not_ready');
  end if;

  v_world_id:=public.ensure_world_road_championship_for_season_v1(n.season_number);

  select * into w
  from public.world_road_championship_editions
  where id=v_world_id;

  select case
    when c.club_type='developing' and c.parent_club_id is not null
      then parent.owner_user_id
    else c.owner_user_id
  end
  into v_owner
  from public.clubs c
  left join public.clubs parent on parent.id=c.parent_club_id
  where c.id=n.champion_club_id;

  if v_owner is null then
    v_decision:='auto_approved';
    v_status:='confirmed';
  else
    v_decision:='pending';
    v_status:='invited';
  end if;

  insert into public.world_road_championship_entries(
    edition_id,rider_id,country_code,source_national_edition_id,
    rider_name_snapshot,club_id_snapshot,club_name_snapshot,
    participation_decision,entry_status
  )
  values(
    w.id,n.champion_rider_id,n.country_code,n.id,
    coalesce(n.champion_name_snapshot,'National Champion'),
    n.champion_club_id,n.champion_club_name_snapshot,
    v_decision,v_status
  )
  on conflict (edition_id,country_code) do update
    set rider_id=excluded.rider_id,
        source_national_edition_id=excluded.source_national_edition_id,
        rider_name_snapshot=excluded.rider_name_snapshot,
        club_id_snapshot=excluded.club_id_snapshot,
        club_name_snapshot=excluded.club_name_snapshot,
        participation_decision=case
          when public.world_road_championship_entries.rider_id is distinct from excluded.rider_id
            then excluded.participation_decision
          else public.world_road_championship_entries.participation_decision
        end,
        entry_status=case
          when public.world_road_championship_entries.rider_id is distinct from excluded.rider_id
            then excluded.entry_status
          else public.world_road_championship_entries.entry_status
        end,
        updated_at=now()
  returning id into v_entry_id;

  insert into public.world_road_championship_duties(
    edition_id,rider_id,duty_date,status,label
  )
  values(
    w.id,n.champion_rider_id,w.race_date,'confirmed',
    'World Road Championship Grand Finale'
  )
  on conflict (edition_id,rider_id) do update
    set duty_date=excluded.duty_date,
        status='confirmed',
        label=excluded.label,
        updated_at=now();

  if v_decision='auto_approved' then
    select coalesce(morale,50) into v_before
    from public.riders
    where id=n.champion_rider_id
    for update;

    v_after:=least(100,v_before+10);

    update public.riders
    set morale=v_after,
        morale_updated_on=greatest(coalesce(morale_updated_on,public.get_current_game_date_date()),public.get_current_game_date_date())
    where id=n.champion_rider_id;

    update public.world_road_championship_entries
    set morale_delta=10,updated_at=now()
    where id=v_entry_id;
  end if;

  if v_owner is not null then
    perform public.ppm_create_user_notification_direct_v1(
      v_owner,
      'WORLD_ROAD_CHAMPIONSHIP_INVITATION',
      coalesce(n.champion_name_snapshot,'Your rider')||' is invited to the World Road Championship!',
      coalesce(n.champion_name_snapshot,'Your rider')||
        ' won the national title and has automatically qualified for the World Road Championship Grand Finale on '||
        w.race_date||'. All team costs are covered. Approving the invitation gives a major morale boost; refusing it gives a major morale penalty.',
      '/dashboard/national-ranking?tab=duty',
      jsonb_build_object(
        'world_edition_id',w.id,
        'national_edition_id',n.id,
        'country_code',n.country_code,
        'rider_id',n.champion_rider_id,
        'rider_name',n.champion_name_snapshot,
        'race_date',w.race_date,
        'decision_deadline',w.decision_deadline,
        'race_id',w.race_id,
        'action_path','/dashboard/national-ranking?tab=duty'
      ),
      'world-road-invitation:'||w.id::text||':'||n.champion_rider_id::text
    );
  end if;

  perform public.world_road_championship_sync_participants_v1(w.id);

  return jsonb_build_object(
    'status','invited',
    'world_edition_id',w.id,
    'entry_id',v_entry_id,
    'rider_id',n.champion_rider_id,
    'country_code',n.country_code,
    'participation_decision',v_decision
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_my_world_road_championship_participation_v1(p_edition_id uuid, p_rider_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=auth.uid();
  e public.world_road_championship_editions%rowtype;
  en public.world_road_championship_entries%rowtype;
  v_owner uuid;
  v_game_date date;
  v_before integer;
  v_after integer;
  v_delta integer;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select * into e
  from public.world_road_championship_editions
  where id=p_edition_id;

  select * into en
  from public.world_road_championship_entries
  where edition_id=p_edition_id and rider_id=p_rider_id
  for update;

  if e.id is null or en.id is null then
    raise exception 'World Road Championship invitation not found';
  end if;

  if en.club_id_snapshot is null then
    raise exception 'Clubless riders are automatically entered';
  end if;

  select case
    when c.club_type='developing' and c.parent_club_id is not null
      then parent.owner_user_id
    else c.owner_user_id
  end
  into v_owner
  from public.clubs c
  left join public.clubs parent on parent.id=c.parent_club_id
  where c.id=en.club_id_snapshot;

  if v_owner is distinct from v_user then
    raise exception 'Not allowed to decide for this rider';
  end if;

  v_game_date:=public.get_current_game_date_date();

  if v_game_date>e.decision_deadline then
    raise exception 'The World Road Championship participation deadline has passed';
  end if;

  if en.participation_decision<>'pending' then
    return jsonb_build_object(
      'edition_id',e.id,
      'rider_id',en.rider_id,
      'participation_decision',en.participation_decision,
      'already_decided',true
    );
  end if;

  select coalesce(morale,50) into v_before
  from public.riders
  where id=en.rider_id
  for update;

  if p_approve then
    v_delta:=10;
    v_after:=least(100,v_before+v_delta);

    update public.world_road_championship_entries
    set participation_decision='approved',
        entry_status='confirmed',
        participation_decision_at=now(),
        participation_decision_user_id=v_user,
        morale_delta=v_delta,
        updated_at=now()
    where id=en.id;

    update public.world_road_championship_duties
    set status='confirmed',updated_at=now()
    where edition_id=e.id and rider_id=en.rider_id;

  else
    v_delta:=-15;
    v_after:=greatest(0,v_before+v_delta);

    update public.world_road_championship_entries
    set participation_decision='rejected',
        entry_status='withdrawn',
        participation_decision_at=now(),
        participation_decision_user_id=v_user,
        morale_delta=v_delta,
        updated_at=now()
    where id=en.id;

    update public.world_road_championship_duties
    set status='cancelled',updated_at=now()
    where edition_id=e.id and rider_id=en.rider_id;
  end if;

  update public.riders
  set morale=v_after,
      morale_updated_on=greatest(coalesce(morale_updated_on,v_game_date),v_game_date)
  where id=en.rider_id;

  perform public.world_road_championship_sync_participants_v1(e.id);

  return jsonb_build_object(
    'edition_id',e.id,
    'rider_id',en.rider_id,
    'participation_decision',case when p_approve then 'approved' else 'rejected' end,
    'morale_before',v_before,
    'morale_after',v_after,
    'morale_delta',v_delta
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.world_road_championship_refresh_availability_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  r record;
  v_count integer:=0;
begin
  for r in
    select
      en.id,en.edition_id,en.rider_id,en.participation_decision,en.entry_status,
      e.race_date,
      coalesce(rd.availability_status,'fit') availability_status,
      rd.unavailable_until
    from public.world_road_championship_entries en
    join public.world_road_championship_editions e on e.id=en.edition_id
    join public.riders rd on rd.id=en.rider_id
    where e.status in ('planned','ready')
      and en.participation_decision<>'rejected'
  loop
    if r.availability_status<>'fit'
       and (r.unavailable_until is null or r.unavailable_until>=r.race_date)
    then
      if r.entry_status<>'unavailable' then
        update public.world_road_championship_entries
        set entry_status='unavailable',updated_at=now()
        where id=r.id;

        update public.world_road_championship_duties
        set status='cancelled',updated_at=now()
        where edition_id=r.edition_id and rider_id=r.rider_id;

        v_count:=v_count+1;
      end if;
    else
      if r.entry_status='unavailable' then
        update public.world_road_championship_entries
        set entry_status=case
              when r.participation_decision in ('approved','auto_approved')
                then 'confirmed'
              else 'invited'
            end,
            updated_at=now()
        where id=r.id;

        update public.world_road_championship_duties
        set status='confirmed',updated_at=now()
        where edition_id=r.edition_id and rider_id=r.rider_id;

        v_count:=v_count+1;
      end if;
    end if;
  end loop;

  for r in
    select id
    from public.world_road_championship_editions
    where status in ('planned','ready')
      and race_id is not null
  loop
    perform public.world_road_championship_sync_participants_v1(r.id);
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.world_road_championship_auto_approve_pending_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_game_date date:=public.get_current_game_date_date();
  r record;
  v_before integer;
  v_after integer;
  v_count integer:=0;
begin
  for r in
    select en.id,en.edition_id,en.rider_id
    from public.world_road_championship_entries en
    join public.world_road_championship_editions e on e.id=en.edition_id
    where en.participation_decision='pending'
      and en.entry_status='invited'
      and e.decision_deadline<v_game_date
  loop
    select coalesce(morale,50) into v_before
    from public.riders
    where id=r.rider_id
    for update;

    v_after:=least(100,v_before+10);

    update public.riders
    set morale=v_after,
        morale_updated_on=greatest(coalesce(morale_updated_on,v_game_date),v_game_date)
    where id=r.rider_id;

    update public.world_road_championship_entries
    set participation_decision='auto_approved',
        entry_status='confirmed',
        participation_decision_at=now(),
        morale_delta=10,
        updated_at=now()
    where id=r.id;

    update public.world_road_championship_duties
    set status='confirmed',updated_at=now()
    where edition_id=r.edition_id and rider_id=r.rider_id;

    v_count:=v_count+1;
  end loop;

  for r in
    select id
    from public.world_road_championship_editions
    where status in ('planned','ready') and race_id is not null
  loop
    perform public.world_road_championship_sync_participants_v1(r.id);
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.world_road_championship_process_results_base_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e record;
  v_stage_id uuid;
  v_result_count integer;
  v_first record;
  v_second uuid;
  v_third uuid;
  v_processed integer:=0;
  n record;
begin
  for e in
    select *
    from public.world_road_championship_editions
    where status='ready' and race_id is not null
    order by race_date
  loop
    select id into v_stage_id
    from public.race_stages
    where race_id=e.race_id
    order by stage_number
    limit 1;

    if v_stage_id is null then continue; end if;

    if not exists(
      select 1
      from public.race_stage_simulation_runs sr
      where sr.stage_id=v_stage_id and sr.status='completed'
    ) then
      continue;
    end if;

    select count(*)::int into v_result_count
    from public.race_stage_results
    where stage_id=v_stage_id and rider_id is not null;

    if v_result_count=0 then continue; end if;

    insert into public.rider_championship_honours(
      rider_id,season_number,honor_type,rank,country_code,
      source_race_id,source_edition_id,awarded_on
    )
    select
      rs.rider_id,e.season_number,'world_road',rs.rank,null,
      e.race_id,e.id,e.race_date
    from public.race_stage_results rs
    where rs.stage_id=v_stage_id
      and rs.rider_id is not null
      and rs.rank between 1 and 3
      and lower(coalesce(rs.status,'finished'))='finished'
    on conflict do nothing;

    select
      rs.rider_id,
      coalesce(rs.rider_name_snapshot,en.rider_name_snapshot,r.display_name,trim(coalesce(r.first_name,'')||' '||coalesce(r.last_name,''))) rider_name,
      en.club_id_snapshot,
      coalesce(c.name,en.club_name_snapshot) club_name,
      root.owner_user_id
    into v_first
    from public.race_stage_results rs
    join public.world_road_championship_entries en
      on en.edition_id=e.id and en.rider_id=rs.rider_id
    join public.riders r on r.id=rs.rider_id
    left join public.clubs c on c.id=en.club_id_snapshot
    left join public.clubs root
      on root.id=case
        when c.club_type='developing' and c.parent_club_id is not null
          then c.parent_club_id
        else c.id
      end
    where rs.stage_id=v_stage_id
      and rs.rank=1
      and lower(coalesce(rs.status,'finished'))='finished'
    order by rs.id
    limit 1;

    select rider_id into v_second
    from public.race_stage_results
    where stage_id=v_stage_id and rank=2
      and lower(coalesce(status,'finished'))='finished'
    limit 1;

    select rider_id into v_third
    from public.race_stage_results
    where stage_id=v_stage_id and rank=3
      and lower(coalesce(status,'finished'))='finished'
    limit 1;

    if v_first.rider_id is null then continue; end if;

    update public.world_road_championship_duties
    set status='completed',updated_at=now()
    where edition_id=e.id and status='confirmed';

    update public.world_road_championship_editions
    set status='completed',
        champion_rider_id=v_first.rider_id,
        champion_name_snapshot=v_first.rider_name,
        champion_club_id=v_first.club_id_snapshot,
        champion_club_name_snapshot=v_first.club_name,
        second_rider_id=v_second,
        third_rider_id=v_third,
        completed_at=now(),
        updated_at=now()
    where id=e.id;

    if v_first.owner_user_id is not null then
      perform public.ppm_create_user_notification_direct_v1(
        v_first.owner_user_id,
        'WORLD_ROAD_CHAMPION',
        v_first.rider_name||' is World Road Champion!',
        v_first.rider_name||
          ' won the World Road Championship Grand Finale. This is a prestige title with no team prize money and is now part of the rider''s career honours.',
        '/dashboard/riders/'||v_first.rider_id::text,
        jsonb_build_object(
          'world_edition_id',e.id,
          'season_number',e.season_number,
          'rider_id',v_first.rider_id,
          'rider_name',v_first.rider_name,
          'race_id',e.race_id,
          'rank',1
        ),
        'world-road-champion:'||e.id::text||':'||v_first.rider_id::text
      );
    end if;

    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object('world_finals_processed',v_processed);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.on_national_champion_world_qualification_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status='completed' and new.champion_rider_id is not null then
    insert into public.rider_championship_honours(
      rider_id,season_number,honor_type,rank,country_code,
      source_race_id,source_edition_id,awarded_on
    )
    select
      rh.rider_id,new.season_number,'national_road',rh.rank,new.country_code,
      new.final_race_id,new.id,new.final_date
    from public.national_championship_result_history rh
    where rh.edition_id=new.id
      and rh.event_type='final'
      and rh.rank between 1 and 3
      and lower(coalesce(rh.status,'finished'))='finished'
    on conflict do nothing;

    perform public.world_road_championship_register_national_champion_v1(new.id);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_rider_skill_weekly_snapshots_v1(p_game_date date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game_date date;
  v_game_week date;
  v_inserted integer := 0;
begin
  v_game_date := coalesce(p_game_date, public.get_current_game_date_date());

  if v_game_date is null then
    raise exception 'ensure_rider_skill_weekly_snapshots_v1: current in-game date is unavailable';
  end if;

  v_game_week := date_trunc('week', v_game_date)::date;

  insert into public.rider_skill_weekly_snapshots (
    rider_id,
    week_start_date,
    sprint,
    climbing,
    time_trial,
    endurance,
    flat,
    recovery,
    resistance,
    race_iq,
    teamwork,
    recorded_at
  )
  select
    r.id,
    v_game_week,
    greatest(0, least(100, coalesce(r.sprint, 0)))::integer,
    greatest(0, least(100, coalesce(r.climbing, 0)))::integer,
    greatest(0, least(100, coalesce(r.time_trial, 0)))::integer,
    greatest(0, least(100, coalesce(r.endurance, 0)))::integer,
    greatest(0, least(100, coalesce(r.flat, 0)))::integer,
    greatest(0, least(100, coalesce(r.recovery, 0)))::integer,
    greatest(0, least(100, coalesce(r.resistance, 0)))::integer,
    greatest(0, least(100, coalesce(r.race_iq, 0)))::integer,
    greatest(0, least(100, coalesce(r.teamwork, 0)))::integer,
    now()
  from public.riders r
  on conflict (rider_id, week_start_date) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_refresh_final_participants_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_game_date date:=public.get_current_game_date_date();
  r record;
  v_count integer:=0;
begin
  for r in
    select id
    from public.national_championship_editions
    where final_race_id is not null
      and final_date>=v_game_date
      and status in (
        'ranking_frozen',
        'qualification_pending',
        'qualification_complete',
        'final_ready'
      )
    order by final_date,country_code
  loop
    perform public.national_championship_sync_race_participants_v1(
      r.id,
      'final',
      null
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.withdraw_my_national_championship_final_v1(p_edition_id uuid, p_rider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=auth.uid();
  e public.national_championship_editions%rowtype;
  en public.national_championship_entries%rowtype;
  v_owner uuid;
  v_game_date date:=public.get_current_game_date_date();
  v_penalty integer;
  v_before integer;
  v_after integer;
  v_stage_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  select * into en
  from public.national_championship_entries
  where edition_id=p_edition_id and rider_id=p_rider_id
  for update;

  if e.id is null or en.id is null then
    raise exception 'National Championship finalist not found';
  end if;

  if en.entry_status not in ('direct_qualified','qualified','finalist') then
    raise exception 'This rider is not currently qualified for the National Championship final';
  end if;

  if e.final_date<=v_game_date then
    raise exception 'The National Championship final can no longer be withdrawn from';
  end if;

  if e.final_race_id is not null then
    select id into v_stage_id
    from public.race_stages
    where race_id=e.final_race_id
    order by stage_number
    limit 1;

    if v_stage_id is not null and exists(
      select 1 from public.race_stage_simulation_runs
      where stage_id=v_stage_id and status in ('running','completed')
    ) then
      raise exception 'The National Championship final has already started';
    end if;
  end if;

  if en.club_id_snapshot is null then
    raise exception 'Only a rider''s club manager can withdraw the rider';
  end if;

  select case
    when c.club_type='developing' and c.parent_club_id is not null
      then parent.owner_user_id
    else c.owner_user_id
  end
  into v_owner
  from public.clubs c
  left join public.clubs parent on parent.id=c.parent_club_id
  where c.id=en.club_id_snapshot;

  if v_owner is distinct from v_user then
    raise exception 'Not allowed to withdraw this rider';
  end if;

  select greatest(1,abs(coalesce(refusal_morale_penalty,10)))
  into v_penalty
  from public.national_championship_config
  where id=true;

  select coalesce(morale,50) into v_before
  from public.riders
  where id=en.rider_id
  for update;

  v_after:=greatest(0,v_before-v_penalty);

  update public.riders
  set morale=v_after,
      morale_updated_on=greatest(coalesce(morale_updated_on,v_game_date),v_game_date)
  where id=en.rider_id;

  update public.national_championship_entries
  set entry_status='withdrawn',
      participation_decision='rejected',
      participation_decision_at=now(),
      participation_decision_user_id=v_user,
      refusal_morale_delta=-v_penalty,
      updated_at=now()
  where id=en.id;

  update public.national_championship_duties
  set status='cancelled',updated_at=now()
  where edition_id=e.id
    and rider_id=en.rider_id
    and duty_type='final'
    and status='confirmed';

  if e.final_race_id is not null then
    perform public.national_championship_sync_race_participants_v1(
      e.id,'final',null
    );
  end if;

  return jsonb_build_object(
    'status','withdrawn',
    'edition_id',e.id,
    'rider_id',en.rider_id,
    'morale_before',v_before,
    'morale_after',v_after,
    'morale_delta',-v_penalty
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_rider_skill_weekly_snapshots_v1(p_game_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_game_date date;
  v_week date;
  v_expected integer := 0;
  v_snapshot_count integer := 0;
  v_inserted integer := 0;
  v_status text;
begin
  v_game_date := coalesce(p_game_date, public.get_current_game_date_date());

  if v_game_date is null then
    raise exception 'verify_rider_skill_weekly_snapshots_v1: current in-game date is unavailable';
  end if;

  v_week := date_trunc('week', v_game_date)::date;

  select count(*)::integer into v_expected
  from public.riders;

  select count(distinct s.rider_id)::integer into v_snapshot_count
  from public.rider_skill_weekly_snapshots s
  where s.week_start_date = v_week;

  if v_snapshot_count < v_expected then
    v_inserted := public.ensure_rider_skill_weekly_snapshots_v1(v_game_date);

    select count(distinct s.rider_id)::integer into v_snapshot_count
    from public.rider_skill_weekly_snapshots s
    where s.week_start_date = v_week;
  end if;

  v_status := case
    when v_snapshot_count = v_expected then 'healthy'
    else 'missing_snapshots'
  end;

  insert into public.rider_skill_snapshot_week_health_v1(
    week_start_date,
    expected_rider_count,
    snapshot_rider_count,
    inserted_rows,
    status,
    first_checked_at,
    last_checked_at
  )
  values(
    v_week,
    v_expected,
    v_snapshot_count,
    v_inserted,
    v_status,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict(week_start_date) do update
  set expected_rider_count = excluded.expected_rider_count,
      snapshot_rider_count = excluded.snapshot_rider_count,
      inserted_rows = public.rider_skill_snapshot_week_health_v1.inserted_rows + excluded.inserted_rows,
      status = excluded.status,
      last_checked_at = excluded.last_checked_at;

  return jsonb_build_object(
    'ok', v_status='healthy',
    'game_date', v_game_date,
    'week_start_date', v_week,
    'expected_rider_count', v_expected,
    'snapshot_rider_count', v_snapshot_count,
    'inserted_rows_this_check', v_inserted,
    'status', v_status
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_seed_rider_skill_snapshots_after_world_reset_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.status='completed'
     and old.status is distinct from new.status then
    perform public.ensure_rider_skill_weekly_snapshots_v1(
      public.get_current_game_date_date()
    );
    perform public.verify_rider_skill_weekly_snapshots_v1(
      public.get_current_game_date_date()
    );
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.championship_race_operations_reconcile_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_checked integer := 0;
  v_completed integer := 0;
  v_pending integer := 0;
  v_problems integer := 0;
begin
  with special as (
    select
      ops.stage_id,
      ops.race_id,
      ops.race_name,
      ops.race_category,
      ops.stage_number,
      ops.stage_start_game_at,
      ops.game_now_at_check,
      ops.results_published_at_real,
      ops.replay_closed_at_real,
      ops.calculation_completed_at_real,
      ops.stage_result_rows,
      ops.classification_rows,
      ops.calculation_status,
      ops.replay_status,
      ops.results_published,
      ops.official_outputs_persisted,
      (
        ops.results_published
        and ops.official_outputs_persisted
        and ops.stage_result_rows > 0
        and ops.classification_rows > 0
      ) as core_ready,
      case
        when ops.race_category='NCQ' then exists (
          select 1
          from public.national_championship_heats h
          where h.race_id=ops.race_id
            and h.status='completed'
            and (
              select count(*)::integer
              from public.national_championship_result_history rh
              where rh.race_id=ops.race_id
                and rh.event_type='qualification'
                and rh.heat_id=h.id
            ) >= ops.stage_result_rows
            and not exists (
              select 1
              from public.national_championship_entries en
              where en.heat_id=h.id
                and en.entry_status='qualification_assigned'
            )
        )
        when ops.race_category='NC' then exists (
          select 1
          from public.national_championship_editions e
          where e.final_race_id=ops.race_id
            and e.status='completed'
            and e.champion_rider_id is not null
            and (
              select count(*)::integer
              from public.national_championship_result_history rh
              where rh.edition_id=e.id
                and rh.event_type='final'
                and rh.race_id=ops.race_id
            ) >= ops.stage_result_rows
            and (
              select count(*)::integer
              from public.national_championship_ranking_bonus_awards a
              where a.edition_id=e.id
            ) >= (
              select count(*)::integer
              from public.race_stage_results rs
              where rs.stage_id=ops.stage_id
                and rs.rider_id is not null
                and rs.rank between 1 and 20
                and lower(coalesce(rs.status,'finished'))='finished'
            )
            and (
              select count(*)::integer
              from public.rider_championship_honours hnr
              where hnr.source_edition_id=e.id
                and hnr.honor_type='national_road'
                and hnr.rank between 1 and 3
            ) >= (
              select count(*)::integer
              from public.race_stage_results rs
              where rs.stage_id=ops.stage_id
                and rs.rider_id is not null
                and rs.rank between 1 and 3
                and lower(coalesce(rs.status,'finished'))='finished'
            )
            and exists (
              select 1
              from public.world_road_championship_entries we
              where we.source_national_edition_id=e.id
                and we.country_code=e.country_code
                and we.rider_id=e.champion_rider_id
            )
        )
        when ops.race_category='WRC' then exists (
          select 1
          from public.world_road_championship_editions w
          where w.race_id=ops.race_id
            and w.status='completed'
            and w.champion_rider_id is not null
            and (
              select count(*)::integer
              from public.rider_championship_honours hnr
              where hnr.source_edition_id=w.id
                and hnr.honor_type='world_road'
                and hnr.rank between 1 and 3
            ) >= (
              select count(*)::integer
              from public.race_stage_results rs
              where rs.stage_id=ops.stage_id
                and rs.rider_id is not null
                and rs.rank between 1 and 3
                and lower(coalesce(rs.status,'finished'))='finished'
            )
        )
        else false
      end as championship_ready,
      case
        when ops.race_category='NCQ' then
          'Qualification results must be written to National Championship history, qualifiers resolved, and the heat completed.'
        when ops.race_category='NC' then
          'National final post-processing must persist history, ranking bonuses, podium honours, the champion, and the World Championship invitation.'
        when ops.race_category='WRC' then
          'World Championship post-processing must persist the final champion and podium honours.'
        else 'Championship post-processing is incomplete.'
      end as pending_message
    from public.race_operations_stage_status_v1 ops
    where ops.race_category in ('NCQ','NC','WRC')
  ),
  evaluated as (
    select
      s.*,
      (
        s.core_ready
        and s.calculation_status='done'
        and s.replay_status='ready'
        and s.championship_ready
      ) as fully_done,
      (
        s.core_ready
        and s.calculation_status='done'
        and s.replay_status='ready'
        and not s.championship_ready
        and coalesce(
          s.results_published_at_real,
          s.replay_closed_at_real,
          s.calculation_completed_at_real
        ) is not null
        and clock_timestamp() >=
          coalesce(
            s.results_published_at_real,
            s.replay_closed_at_real,
            s.calculation_completed_at_real
          ) + interval '20 minutes'
      ) as post_processing_overdue
    from special s
  )
  update public.race_operations_stage_status_v1 ops
  set
    completion_status = case
      when e.fully_done then 'done'
      when e.post_processing_overdue then 'overdue'
      when e.core_ready and e.calculation_status='done' and e.replay_status='ready'
        then 'waiting'
      else ops.completion_status
    end,
    has_problem = case
      when e.fully_done then false
      when e.post_processing_overdue then true
      else ops.has_problem
    end,
    issue_key = case
      when e.fully_done then null
      when e.post_processing_overdue then 'championship_post_processing_incomplete'
      else ops.issue_key
    end,
    issue_severity = case
      when e.fully_done then null
      when e.post_processing_overdue then 'critical'
      else ops.issue_severity
    end,
    issue_message = case
      when e.fully_done then null
      when e.post_processing_overdue then e.pending_message
      else ops.issue_message
    end,
    first_problem_at = case
      when e.fully_done then null
      when e.post_processing_overdue then
        case
          when ops.has_problem
            and ops.issue_key='championship_post_processing_incomplete'
          then coalesce(ops.first_problem_at,clock_timestamp())
          else clock_timestamp()
        end
      else ops.first_problem_at
    end,
    resolved_at = case
      when e.fully_done and ops.has_problem then clock_timestamp()
      when e.post_processing_overdue then null
      else ops.resolved_at
    end,
    last_checked_at=clock_timestamp(),
    updated_at=clock_timestamp()
  from evaluated e
  where ops.stage_id=e.stage_id
    and e.core_ready
    and e.calculation_status='done'
    and e.replay_status='ready';

  get diagnostics v_checked = row_count;

  update public.race_operations_incidents_v1 i
  set
    resolved_at=clock_timestamp(),
    resolution_message='Championship post-processing is complete or the issue has changed.',
    last_seen_at=clock_timestamp(),
    updated_at=clock_timestamp()
  where i.resolved_at is null
    and i.issue_key in ('completion_incomplete','championship_post_processing_incomplete')
    and exists (
      select 1
      from public.race_operations_stage_status_v1 s
      where s.stage_id=i.stage_id
        and s.race_category in ('NCQ','NC','WRC')
        and (
          not s.has_problem
          or s.issue_key is distinct from i.issue_key
        )
    );

  insert into public.race_operations_incidents_v1(
    stage_id,race_id,race_name,stage_number,issue_key,severity,
    message,stage_start_game_at,detected_game_at,detected_at,
    last_seen_at,metadata
  )
  select
    s.stage_id,s.race_id,s.race_name,s.stage_number,s.issue_key,s.issue_severity,
    s.issue_message,s.stage_start_game_at,s.game_now_at_check,
    clock_timestamp(),clock_timestamp(),
    jsonb_build_object(
      'championship_race',true,
      'race_category',s.race_category,
      'calculation_status',s.calculation_status,
      'replay_status',s.replay_status,
      'completion_status',s.completion_status,
      'stage_result_rows',s.stage_result_rows,
      'classification_rows',s.classification_rows
    )
  from public.race_operations_stage_status_v1 s
  where s.race_category in ('NCQ','NC','WRC')
    and s.has_problem
    and s.issue_key='championship_post_processing_incomplete'
    and not exists (
      select 1
      from public.race_operations_incidents_v1 i
      where i.stage_id=s.stage_id
        and i.issue_key=s.issue_key
        and i.resolved_at is null
    );

  update public.race_operations_incidents_v1 i
  set
    last_seen_at=clock_timestamp(),
    message=s.issue_message,
    severity=s.issue_severity,
    metadata=coalesce(i.metadata,'{}'::jsonb) || jsonb_build_object(
      'championship_race',true,
      'race_category',s.race_category,
      'calculation_status',s.calculation_status,
      'replay_status',s.replay_status,
      'completion_status',s.completion_status
    ),
    updated_at=clock_timestamp()
  from public.race_operations_stage_status_v1 s
  where i.stage_id=s.stage_id
    and i.issue_key='championship_post_processing_incomplete'
    and i.resolved_at is null
    and s.has_problem
    and s.issue_key=i.issue_key;

  select
    count(*) filter (
      where race_category in ('NCQ','NC','WRC')
        and completion_status='done'
    )::integer,
    count(*) filter (
      where race_category in ('NCQ','NC','WRC')
        and completion_status<>'done'
        and not has_problem
    )::integer,
    count(*) filter (
      where race_category in ('NCQ','NC','WRC')
        and has_problem
    )::integer
  into v_completed,v_pending,v_problems
  from public.race_operations_stage_status_v1;

  return jsonb_build_object(
    'status','ok',
    'championship_rows_reconciled',v_checked,
    'championship_completed_rows',v_completed,
    'championship_pending_rows',v_pending,
    'championship_problem_rows',v_problems
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_operations_refresh_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_recovery_timeout jsonb;
  v_championship jsonb;
begin
  v_base:=public.race_operations_refresh_base_v1();

  /*
   * A running/retrying calculation is allowed a 30-real-minute automatic
   * recovery window. After that window the recovery may keep running, but
   * Race Operations must escalate it as a real problem instead of continuing
   * to present it as healthy RUNNING.
   */
  v_recovery_timeout:=public.race_operations_apply_recovery_timeout_v1();

  v_championship:=public.championship_race_operations_reconcile_v1();

  return coalesce(v_base,'{}'::jsonb)
    || jsonb_build_object(
      'automatic_recovery_timeout',v_recovery_timeout,
      'championship_operations',v_championship
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.championship_operations_health_check_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare
  v_game_day date:=public.get_current_game_date_date();
  v_game_ts timestamp:=public.get_current_game_timestamp();
  v_race_refresh jsonb;
  v_all_race_problems integer:=0;
  v_championship_race_problems integer:=0;
  v_world_structure_issues integer:=0;
  v_national_runtime_issues integer:=0;
  v_link_issues integer:=0;
  v_unmonitored_stages integer:=0;
  v_total integer:=0;
  v_details jsonb;
begin
  begin
    v_race_refresh:=public.race_operations_refresh_v1();
  exception when others then
    v_race_refresh:=jsonb_build_object(
      'status','error',
      'message',sqlerrm,
      'sqlstate',sqlstate
    );
  end;

  select count(*)::integer
  into v_all_race_problems
  from public.race_operations_stage_status_v1
  where has_problem;

  perform public.log_system_business_check_v1(
    'check:race_operations',
    case when v_all_race_problems>0 then 'error' else 'success' end,
    case
      when v_all_race_problems>0
        then format('%s active Race Operations problem(s) require attention.',v_all_race_problems)
      else 'Race calculation, replay and completion monitoring is healthy.'
    end,
    jsonb_build_object(
      'active_problem_count',v_all_race_problems,
      'race_operations_refresh',v_race_refresh
    )
  );

  if v_all_race_problems>0 then
    perform public.raise_system_incident_v1(
      'check:race_operations',
      'critical',
      'Race Operations require attention',
      format('%s race stage(s) currently have calculation, replay or completion problems.',v_all_race_problems),
      'business:race-operations',
      jsonb_build_object('active_problem_count',v_all_race_problems)
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      'business:race-operations',
      'Race Operations currently reports no active stage problems.'
    );
  end if;

  select count(*)::integer
  into v_championship_race_problems
  from public.race_operations_stage_status_v1
  where race_category in ('NCQ','NC','WRC')
    and has_problem;

  select count(*)::integer
  into v_world_structure_issues
  from public.world_road_championship_editions w
  left join public.races r on r.id=w.race_id
  left join lateral (
    select s.*
    from public.race_stages s
    where s.race_id=w.race_id
    order by s.stage_number
    limit 1
  ) s on true
  where w.season_number=(select season_number from public.game_state where id=true limit 1)
    and (
      w.race_id is null
      or r.id is null
      or s.id is null
      or coalesce(w.climate_avg_temp_c,0) <= 24
      or lower(coalesce(s.terrain_type,''))='mountain'
      or coalesce((r.metadata->>'world_road_championship')::boolean,false) is not true
    );

  if exists (
    select 1
    from public.national_championship_editions e
    where e.season_number=(select season_number from public.game_state where id=true limit 1)
  ) and not exists (
    select 1
    from public.world_road_championship_editions w
    where w.season_number=(select season_number from public.game_state where id=true limit 1)
  ) then
    v_world_structure_issues:=v_world_structure_issues+1;
  end if;

  select count(*)::integer
  into v_national_runtime_issues
  from public.national_championship_editions e
  where e.season_number=(select season_number from public.game_state where id=true limit 1)
    and (
      (
        e.status='planned'
        and e.climate_status='ready'
        and e.route_status='ready'
        and e.ranking_snapshot_date < v_game_day
      )
      or
      (
        e.status<>'planned'
        and e.climate_status='ready'
        and e.route_status='ready'
        and (
          e.final_race_id is null
          or exists (
            select 1
            from public.national_championship_heats h
            where h.edition_id=e.id
              and h.race_id is null
          )
        )
      )
    );

  select count(*)::integer
  into v_link_issues
  from public.national_championship_editions e
  where e.season_number=(select season_number from public.game_state where id=true limit 1)
    and e.status='completed'
    and e.champion_rider_id is not null
    and (
      not exists (
        select 1
        from public.rider_championship_honours h
        where h.source_edition_id=e.id
          and h.honor_type='national_road'
          and h.rank=1
          and h.rider_id=e.champion_rider_id
      )
      or not exists (
        select 1
        from public.world_road_championship_entries we
        where we.source_national_edition_id=e.id
          and we.rider_id=e.champion_rider_id
          and we.country_code=e.country_code
      )
    );

  select count(*)::integer
  into v_unmonitored_stages
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where r.category in ('NCQ','NC','WRC')
    and public.race_stage_planned_start_game_at_v1(s.id)::timestamp
          <= v_game_ts - interval '30 minutes'
    and s.stage_date >= v_game_day - 7
    and not exists (
      select 1
      from public.race_operations_stage_status_v1 ops
      where ops.stage_id=s.id
    );

  v_total:=
    v_championship_race_problems
    +v_world_structure_issues
    +v_national_runtime_issues
    +v_link_issues
    +v_unmonitored_stages;

  v_details:=jsonb_build_object(
    'active_championship_race_operation_problems',v_championship_race_problems,
    'world_structure_issues',v_world_structure_issues,
    'national_runtime_issues',v_national_runtime_issues,
    'champion_honour_or_world_invitation_link_issues',v_link_issues,
    'championship_stages_missing_race_operations_monitoring',v_unmonitored_stages,
    'race_operations_refresh',v_race_refresh
  );

  perform public.log_system_business_check_v1(
    'check:championship_operations',
    case when v_total>0 then 'error' else 'success' end,
    case
      when v_total>0
        then format('%s National/World Championship operations issue(s) detected.',v_total)
      else 'National and World Championship scheduling, race operations, results and qualification links are healthy.'
    end,
    v_details
  );

  if v_total>0 then
    perform public.raise_system_incident_v1(
      'check:championship_operations',
      'critical',
      'Championship operations require attention',
      format(
        '%s National/World Championship issue(s) were detected across scheduling, calculation/replay/completion, honours or World qualification.',
        v_total
      ),
      'business:championship-operations',
      v_details
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      'business:championship-operations',
      'National and World Championship operations are healthy.'
    );
  end if;

  return jsonb_build_object(
    'status',case when v_total>0 then 'attention_required' else 'healthy' end,
    'issue_count',v_total,
    'details',v_details
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_system_health_watchdog_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_championship jsonb;
  v_draw jsonb;
begin
  v_base:=public.run_system_health_watchdog_base_v1();

  begin
    v_championship:=public.championship_operations_health_check_v1();
  exception when others then
    perform public.raise_system_incident_v1(
      'check:championship_operations',
      'critical',
      'Championship health check failed',
      sqlerrm,
      'business:championship-operations-check-failed',
      jsonb_build_object('sqlstate',sqlstate)
    );
    v_championship:=jsonb_build_object('status','error','message',sqlerrm,'sqlstate',sqlstate);
  end;

  begin
    v_draw:=public.championship_calendar_draw_health_check_v1();
  exception when others then
    perform public.raise_system_incident_v1(
      'check:championship_calendar_draw',
      'critical',
      'Championship calendar draw health check failed',
      sqlerrm,
      'business:championship-calendar-draw-check-failed',
      jsonb_build_object('sqlstate',sqlstate)
    );
    v_draw:=jsonb_build_object('status','error','message',sqlerrm,'sqlstate',sqlstate);
  end;

  return coalesce(v_base,'{}'::jsonb)
    || jsonb_build_object(
      'race_and_championship_operations',v_championship,
      'championship_calendar_draw',v_draw
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_championship_calendar_draw_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_season integer;
  v_game_date date;
  v_month integer;
  v_batch_size integer:=15;
  v_locked_now integer:=0;
  v_total integer:=0;
  v_locked integer:=0;
  v_world_id uuid;
  v_world_locked boolean:=false;
  v_last_batch date;
  v_health jsonb;
  r record;
begin
  select season_number,
         public.game_date_from_parts(season_number,month_number,day_number),
         month_number
  into v_season,v_game_date,v_month
  from public.game_state
  where id=true;

  perform public.ensure_national_championship_editions_for_season_v1(v_season);
  v_world_id:=public.ensure_world_road_championship_for_season_v1(v_season);

  -- World draw is fixed immediately at season generation and remains visible
  -- all season.
  update public.world_road_championship_editions
  set schedule_draw_status='locked',
      schedule_locked_at=coalesce(schedule_locked_at,now()),
      decision_deadline=least(coalesce(decision_deadline,race_date-10),race_date-10),
      final_confirmation_open_date=coalesce(final_confirmation_open_date,race_date-7),
      final_decision_deadline=coalesce(final_decision_deadline,race_date-3),
      updated_at=now()
  where id=v_world_id
    and schedule_draw_status<>'locked';

  select last_batch_game_date
    into v_last_batch
  from public.championship_calendar_draw_state_v1
  where season_number=v_season;

  -- Draw 15 countries per game day, only during January.
  if v_month=1 and v_last_batch is distinct from v_game_date then
    for r in
      select id
      from public.national_championship_editions
      where season_number=v_season
        and discipline='road'
        and schedule_draw_status='pending'
        and climate_status='ready'
        and route_status='ready'
      order by md5(v_season::text||':'||country_code)
      limit v_batch_size
    loop
      update public.national_championship_editions
      set schedule_draw_status='locked',
          schedule_drawn_on_game_date=v_game_date,
          schedule_locked_at=now(),
          final_participation_decision_deadline=
            coalesce(final_participation_decision_deadline,final_date-7),
          updated_at=now()
      where id=r.id;

      v_locked_now:=v_locked_now+1;
    end loop;
  end if;

  select count(*)::int,
         count(*) filter (where schedule_draw_status='locked')::int
  into v_total,v_locked
  from public.national_championship_editions
  where season_number=v_season
    and discipline='road';

  select exists(
    select 1
    from public.world_road_championship_editions
    where season_number=v_season
      and schedule_draw_status='locked'
  ) into v_world_locked;

  insert into public.championship_calendar_draw_state_v1(
    season_number,status,batch_size,total_country_editions,locked_country_editions,
    world_draw_locked,last_batch_game_date,completed_at,last_error
  )
  values(
    v_season,
    case when v_locked=v_total and v_world_locked then 'completed' else 'in_progress' end,
    v_batch_size,
    v_total,
    v_locked,
    v_world_locked,
    case
      when v_locked_now>0 then v_game_date
      else v_last_batch
    end,
    case when v_locked=v_total and v_world_locked then now() else null end,
    null
  )
  on conflict (season_number) do update
  set status=excluded.status,
      batch_size=excluded.batch_size,
      total_country_editions=excluded.total_country_editions,
      locked_country_editions=excluded.locked_country_editions,
      world_draw_locked=excluded.world_draw_locked,
      last_batch_game_date=coalesce(excluded.last_batch_game_date,public.championship_calendar_draw_state_v1.last_batch_game_date),
      completed_at=coalesce(public.championship_calendar_draw_state_v1.completed_at,excluded.completed_at),
      last_error=null,
      updated_at=now();

  begin
    v_health:=public.championship_calendar_draw_health_check_v1();
  exception when undefined_function then
    v_health:=jsonb_build_object('status','health_check_not_installed_yet');
  end;

  return jsonb_build_object(
    'status',case when v_locked=v_total and v_world_locked then 'completed' else 'in_progress' end,
    'season_number',v_season,
    'game_date',v_game_date,
    'january_only',true,
    'batch_size',v_batch_size,
    'locked_this_game_day',v_locked_now,
    'country_editions_total',v_total,
    'country_editions_locked',v_locked,
    'world_draw_locked',v_world_locked,
    'health',v_health
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_open_final_confirmations_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_game_date date:=public.get_current_game_date_date();
  r record;
  v_opened integer:=0;
  v_auto integer:=0;
  v_owner uuid;
begin
  for r in
    select
      en.id as entry_id,
      en.edition_id,
      en.rider_id,
      en.rider_name_snapshot,
      en.club_id_snapshot,
      en.entry_path,
      en.entry_status,
      e.country_code,
      e.final_date,
      coalesce(e.final_participation_decision_deadline,e.final_date-7) as deadline,
      e.final_race_id
    from public.national_championship_entries en
    join public.national_championship_editions e on e.id=en.edition_id
    where en.final_participation_decision='not_open'
      and en.participation_decision in ('approved','auto_approved')
      and en.entry_status in ('direct_qualified','qualified','finalist')
      and (
        en.entry_path='qualification'
        or v_game_date>=e.final_date-14
      )
      and e.final_date>v_game_date
    order by e.final_date,e.country_code,en.national_rank
  loop
    v_owner:=null;

    if r.club_id_snapshot is not null then
      select case
        when c.club_type='developing' and c.parent_club_id is not null then p.owner_user_id
        else c.owner_user_id
      end
      into v_owner
      from public.clubs c
      left join public.clubs p on p.id=c.parent_club_id
      where c.id=r.club_id_snapshot;
    end if;

    if v_owner is null then
      update public.national_championship_entries
      set final_participation_decision='auto_approved',
          final_participation_decision_at=now(),
          updated_at=now()
      where id=r.entry_id;

      v_auto:=v_auto+1;
    else
      update public.national_championship_entries
      set final_participation_decision='pending',
          updated_at=now()
      where id=r.entry_id;

      perform public.ppm_create_user_notification_direct_v1(
        v_owner,
        'NATIONAL_CHAMPIONSHIP_FINAL_CONFIRMATION_REQUIRED',
        r.rider_name_snapshot||' must be confirmed again for the National Championship final',
        r.rider_name_snapshot||
          ' has a place in the '||r.country_code||
          ' National Championship final on '||r.final_date||
          '. Please approve or refuse the final participation separately before '||r.deadline||'.',
        '/dashboard/national-ranking?tab=duty',
        jsonb_build_object(
          'edition_id',r.edition_id,
          'country_code',r.country_code,
          'rider_id',r.rider_id,
          'rider_name',r.rider_name_snapshot,
          'final_date',r.final_date,
          'final_race_id',r.final_race_id,
          'final_decision_deadline',r.deadline,
          'action_path','/dashboard/national-ranking?tab=duty'
        ),
        'national-final-confirmation:'||r.edition_id::text||':'||r.rider_id::text
      );

      update public.national_championship_entries
      set final_decision_notified_at=coalesce(final_decision_notified_at,now())
      where id=r.entry_id;

      v_opened:=v_opened+1;
    end if;
  end loop;

  return jsonb_build_object(
    'final_confirmations_opened',v_opened,
    'final_confirmations_auto_approved',v_auto
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_my_national_championship_final_participation_v1(p_edition_id uuid, p_rider_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=auth.uid();
  e public.national_championship_editions%rowtype;
  en public.national_championship_entries%rowtype;
  v_owner uuid;
  v_game_date date:=public.get_current_game_date_date();
  v_penalty integer;
  v_before integer;
  v_after integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  select * into en
  from public.national_championship_entries
  where edition_id=p_edition_id and rider_id=p_rider_id
  for update;

  if e.id is null or en.id is null then
    raise exception 'National Championship finalist not found';
  end if;

  if en.entry_status not in ('direct_qualified','qualified','finalist') then
    raise exception 'This rider is not in the National Championship final';
  end if;

  if en.final_participation_decision<>'pending' then
    return jsonb_build_object(
      'edition_id',e.id,
      'rider_id',en.rider_id,
      'final_participation_decision',en.final_participation_decision,
      'already_decided',true
    );
  end if;

  if v_game_date>coalesce(e.final_participation_decision_deadline,e.final_date-7) then
    raise exception 'The National Championship final confirmation deadline has passed';
  end if;

  select case
    when c.club_type='developing' and c.parent_club_id is not null then p.owner_user_id
    else c.owner_user_id
  end
  into v_owner
  from public.clubs c
  left join public.clubs p on p.id=c.parent_club_id
  where c.id=en.club_id_snapshot;

  if v_owner is distinct from v_user then
    raise exception 'Not allowed to decide for this rider';
  end if;

  if p_approve then
    update public.national_championship_entries
    set final_participation_decision='approved',
        final_participation_decision_at=now(),
        final_participation_decision_user_id=v_user,
        updated_at=now()
    where id=en.id;

    insert into public.national_championship_duties(
      edition_id,rider_id,duty_type,duty_date,heat_id,status,label,
      duty_start_date,duty_end_date
    )
    values(
      e.id,en.rider_id,'final',e.final_date,null,'confirmed',
      'National Duty — '||e.country_code||' National Championship Final',
      e.final_date,e.final_date
    )
    on conflict (edition_id,rider_id,duty_type) do update
    set duty_date=excluded.duty_date,
        status='confirmed',
        label=excluded.label,
        duty_start_date=excluded.duty_start_date,
        duty_end_date=excluded.duty_end_date,
        updated_at=now();
  else
    select greatest(1,abs(coalesce(refusal_morale_penalty,2)))
    into v_penalty
    from public.national_championship_config
    where id=true;

    select coalesce(morale,50) into v_before
    from public.riders
    where id=en.rider_id
    for update;

    v_after:=greatest(0,v_before-v_penalty);

    update public.riders
    set morale=v_after,
        morale_updated_on=greatest(coalesce(morale_updated_on,v_game_date),v_game_date)
    where id=en.rider_id;

    update public.national_championship_entries
    set final_participation_decision='rejected',
        final_participation_decision_at=now(),
        final_participation_decision_user_id=v_user,
        final_refusal_morale_delta=-v_penalty,
        entry_status='withdrawn',
        updated_at=now()
    where id=en.id;

    update public.national_championship_duties
    set status='cancelled',updated_at=now()
    where edition_id=e.id
      and rider_id=en.rider_id
      and duty_type='final'
      and status='confirmed';
  end if;

  perform public.national_championship_sync_race_participants_v1(e.id,'final',null);

  return jsonb_build_object(
    'edition_id',e.id,
    'rider_id',en.rider_id,
    'final_participation_decision',case when p_approve then 'approved' else 'rejected' end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_auto_approve_final_pending_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_game_date date:=public.get_current_game_date_date();
  r record;
  v_count integer:=0;
begin
  for r in
    select en.id,en.edition_id,en.rider_id,e.final_date
    from public.national_championship_entries en
    join public.national_championship_editions e on e.id=en.edition_id
    where en.final_participation_decision='pending'
      and v_game_date>coalesce(e.final_participation_decision_deadline,e.final_date-7)
  loop
    update public.national_championship_entries
    set final_participation_decision='auto_approved',
        final_participation_decision_at=now(),
        updated_at=now()
    where id=r.id;

    insert into public.national_championship_duties(
      edition_id,rider_id,duty_type,duty_date,heat_id,status,label,
      duty_start_date,duty_end_date
    )
    select
      e.id,r.rider_id,'final',e.final_date,null,'confirmed',
      'National Duty — '||e.country_code||' National Championship Final',
      e.final_date,e.final_date
    from public.national_championship_editions e
    where e.id=r.edition_id
    on conflict (edition_id,rider_id,duty_type) do update
    set status='confirmed',
        duty_date=excluded.duty_date,
        label=excluded.label,
        duty_start_date=excluded.duty_start_date,
        duty_end_date=excluded.duty_end_date,
        updated_at=now();

    perform public.national_championship_sync_race_participants_v1(r.edition_id,'final',null);
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.world_road_championship_open_final_confirmations_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_game_date date:=public.get_current_game_date_date();
  r record;
  v_owner uuid;
  v_opened integer:=0;
  v_auto integer:=0;
begin
  for r in
    select
      en.id as entry_id,en.edition_id,en.rider_id,en.rider_name_snapshot,
      en.club_id_snapshot,en.country_code,e.race_date,e.race_id,
      coalesce(e.final_decision_deadline,e.race_date-3) as deadline
    from public.world_road_championship_entries en
    join public.world_road_championship_editions e on e.id=en.edition_id
    where en.participation_decision in ('approved','auto_approved')
      and en.entry_status='confirmed'
      and en.final_participation_decision='not_open'
      and v_game_date>=coalesce(e.final_confirmation_open_date,e.race_date-7)
      and v_game_date<e.race_date
    order by e.race_date,en.country_code
  loop
    v_owner:=null;

    if r.club_id_snapshot is not null then
      select case
        when c.club_type='developing' and c.parent_club_id is not null then p.owner_user_id
        else c.owner_user_id
      end
      into v_owner
      from public.clubs c
      left join public.clubs p on p.id=c.parent_club_id
      where c.id=r.club_id_snapshot;
    end if;

    if v_owner is null then
      update public.world_road_championship_entries
      set final_participation_decision='auto_approved',
          final_participation_decision_at=now(),
          updated_at=now()
      where id=r.entry_id;
      v_auto:=v_auto+1;
    else
      update public.world_road_championship_entries
      set final_participation_decision='pending',
          updated_at=now()
      where id=r.entry_id;

      perform public.ppm_create_user_notification_direct_v1(
        v_owner,
        'WORLD_ROAD_CHAMPIONSHIP_FINAL_CONFIRMATION_REQUIRED',
        r.rider_name_snapshot||' must be confirmed again for the World Road Championship',
        r.rider_name_snapshot||
          ' is already qualified and accepted for the World Road Championship Grand Finale on '||
          r.race_date||'. Please confirm the final participation again before '||r.deadline||'.',
        '/dashboard/national-ranking?tab=duty',
        jsonb_build_object(
          'world_edition_id',r.edition_id,
          'country_code',r.country_code,
          'rider_id',r.rider_id,
          'rider_name',r.rider_name_snapshot,
          'race_date',r.race_date,
          'race_id',r.race_id,
          'final_decision_deadline',r.deadline,
          'action_path','/dashboard/national-ranking?tab=duty'
        ),
        'world-road-final-confirmation:'||r.edition_id::text||':'||r.rider_id::text
      );

      update public.world_road_championship_entries
      set final_decision_notified_at=coalesce(final_decision_notified_at,now())
      where id=r.entry_id;

      v_opened:=v_opened+1;
    end if;
  end loop;

  return jsonb_build_object(
    'world_final_confirmations_opened',v_opened,
    'world_final_confirmations_auto_approved',v_auto
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_my_world_road_championship_final_confirmation_v1(p_edition_id uuid, p_rider_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=auth.uid();
  e public.world_road_championship_editions%rowtype;
  en public.world_road_championship_entries%rowtype;
  v_owner uuid;
  v_game_date date:=public.get_current_game_date_date();
  v_before integer;
  v_after integer;
  v_delta integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into e from public.world_road_championship_editions where id=p_edition_id;
  select * into en
  from public.world_road_championship_entries
  where edition_id=p_edition_id and rider_id=p_rider_id
  for update;

  if e.id is null or en.id is null then
    raise exception 'World Road Championship entry not found';
  end if;

  if en.final_participation_decision<>'pending' then
    return jsonb_build_object(
      'edition_id',e.id,
      'rider_id',en.rider_id,
      'final_participation_decision',en.final_participation_decision,
      'already_decided',true
    );
  end if;

  if v_game_date>coalesce(e.final_decision_deadline,e.race_date-3) then
    raise exception 'The World Road Championship final confirmation deadline has passed';
  end if;

  select case
    when c.club_type='developing' and c.parent_club_id is not null then p.owner_user_id
    else c.owner_user_id
  end
  into v_owner
  from public.clubs c
  left join public.clubs p on p.id=c.parent_club_id
  where c.id=en.club_id_snapshot;

  if v_owner is distinct from v_user then
    raise exception 'Not allowed to decide for this rider';
  end if;

  select coalesce(morale,50) into v_before
  from public.riders
  where id=en.rider_id
  for update;

  if p_approve then
    v_delta:=3;
    v_after:=least(100,v_before+v_delta);

    update public.world_road_championship_entries
    set final_participation_decision='approved',
        final_participation_decision_at=now(),
        final_participation_decision_user_id=v_user,
        final_morale_delta=v_delta,
        updated_at=now()
    where id=en.id;
  else
    v_delta:=-15;
    v_after:=greatest(0,v_before+v_delta);

    update public.world_road_championship_entries
    set final_participation_decision='rejected',
        final_participation_decision_at=now(),
        final_participation_decision_user_id=v_user,
        final_morale_delta=v_delta,
        entry_status='withdrawn',
        updated_at=now()
    where id=en.id;

    update public.world_road_championship_duties
    set status='cancelled',updated_at=now()
    where edition_id=e.id and rider_id=en.rider_id;
  end if;

  update public.riders
  set morale=v_after,
      morale_updated_on=greatest(coalesce(morale_updated_on,v_game_date),v_game_date)
  where id=en.rider_id;

  perform public.world_road_championship_sync_participants_v1(e.id);

  return jsonb_build_object(
    'edition_id',e.id,
    'rider_id',en.rider_id,
    'final_participation_decision',case when p_approve then 'approved' else 'rejected' end,
    'morale_delta',v_delta
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.world_road_championship_auto_approve_final_pending_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_game_date date:=public.get_current_game_date_date();
  r record;
  v_count integer:=0;
begin
  for r in
    select en.id,en.edition_id
    from public.world_road_championship_entries en
    join public.world_road_championship_editions e on e.id=en.edition_id
    where en.final_participation_decision='pending'
      and en.entry_status='confirmed'
      and v_game_date>coalesce(e.final_decision_deadline,e.race_date-3)
  loop
    update public.world_road_championship_entries
    set final_participation_decision='auto_approved',
        final_participation_decision_at=now(),
        updated_at=now()
    where id=r.id;

    perform public.world_road_championship_sync_participants_v1(r.edition_id);
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_championship_second_confirmations_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=auth.uid();
  v_game_date date:=public.get_current_game_date_date();
  v_season integer;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select season_number into v_season
  from public.game_state
  where id=true;

  return jsonb_build_object(
    'national',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'entry_id',en.id,
          'edition_id',en.edition_id,
          'rider_id',en.rider_id,
          'final_participation_decision',en.final_participation_decision,
          'final_participation_decision_at',en.final_participation_decision_at,
          'final_decision_notified_at',en.final_decision_notified_at,
          'final_refusal_morale_delta',en.final_refusal_morale_delta,
          'final_decision_deadline',coalesce(e.final_participation_decision_deadline,e.final_date-7),
          'final_date',e.final_date,
          'can_decide_final_participation',
            en.final_participation_decision='pending'
            and v_game_date<=coalesce(e.final_participation_decision_deadline,e.final_date-7),
          'requires_second_confirmation',
            en.final_participation_decision in ('pending','approved','auto_approved','rejected')
        )
        order by e.final_date,en.national_rank
      )
      from public.national_championship_entries en
      join public.national_championship_editions e on e.id=en.edition_id
      join public.clubs rc on rc.id=en.club_id_snapshot
      left join public.clubs parent on parent.id=rc.parent_club_id
      where e.season_number=v_season
        and (
          case
            when rc.club_type='developing' and rc.parent_club_id is not null
              then parent.owner_user_id
            else rc.owner_user_id
          end
        )=v_user
    ),'[]'::jsonb),
    'world',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'entry_id',en.id,
          'edition_id',en.edition_id,
          'rider_id',en.rider_id,
          'final_participation_decision',en.final_participation_decision,
          'final_participation_decision_at',en.final_participation_decision_at,
          'final_decision_notified_at',en.final_decision_notified_at,
          'final_decision_deadline',coalesce(e.final_decision_deadline,e.race_date-3),
          'final_confirmation_open_date',coalesce(e.final_confirmation_open_date,e.race_date-7),
          'race_date',e.race_date,
          'can_decide_final_participation',
            en.final_participation_decision='pending'
            and v_game_date<=coalesce(e.final_decision_deadline,e.race_date-3),
          'requires_second_confirmation',
            en.final_participation_decision in ('pending','approved','auto_approved','rejected')
        )
        order by e.race_date,en.country_code
      )
      from public.world_road_championship_entries en
      join public.world_road_championship_editions e on e.id=en.edition_id
      join public.clubs rc on rc.id=en.club_id_snapshot
      left join public.clubs parent on parent.id=rc.parent_club_id
      where e.season_number=v_season
        and (
          case
            when rc.club_type='developing' and rc.parent_club_id is not null
              then parent.owner_user_id
            else rc.owner_user_id
          end
        )=v_user
    ),'[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_cross_game_referral_event_v1(p_event_type text, p_source_game text, p_destination_game text, p_surface text DEFAULT 'unknown'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_event_type not in ('outgoing_click','landing') then
    raise exception 'Unsupported cross-game event type.';
  end if;

  if not (
    (p_event_type='outgoing_click' and p_source_game='propeloton_manager' and p_destination_game='tennis_legacy')
    or
    (p_event_type='landing' and p_source_game='tennis_legacy' and p_destination_game='propeloton_manager')
  ) then
    raise exception 'Invalid cross-game referral direction.';
  end if;

  insert into public.cross_game_referral_events(
    event_type,source_game,destination_game,surface,local_user_id
  )
  values(
    p_event_type,
    p_source_game,
    p_destination_game,
    left(coalesce(nullif(trim(p_surface),''),'unknown'),80),
    auth.uid()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.championship_calendar_draw_health_check_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare
  v_season integer;
  v_game_date date;
  v_month integer;
  v_day integer;
  v_total integer:=0;
  v_locked integer:=0;
  v_pending integer:=0;
  v_ready_pending integer:=0;
  v_blocked_pending integer:=0;
  v_batch integer:=15;
  v_expected_locked integer:=0;
  v_world_locked boolean:=false;
  v_state_status text;
  v_last_batch date;
  v_issue_count integer:=0;
  v_message text;
  v_details jsonb;
begin
  select season_number,
         public.game_date_from_parts(season_number,month_number,day_number),
         month_number,day_number
  into v_season,v_game_date,v_month,v_day
  from public.game_state
  where id=true;

  select count(*)::int,
         count(*) filter (where schedule_draw_status='locked')::int,
         count(*) filter (where schedule_draw_status='pending')::int,
         count(*) filter (
           where schedule_draw_status='pending'
             and climate_status='ready'
             and route_status='ready'
         )::int,
         count(*) filter (
           where schedule_draw_status='pending'
             and (climate_status<>'ready' or route_status<>'ready')
         )::int
  into v_total,v_locked,v_pending,v_ready_pending,v_blocked_pending
  from public.national_championship_editions
  where season_number=v_season
    and discipline='road';

  select coalesce(batch_size,15),status,last_batch_game_date
  into v_batch,v_state_status,v_last_batch
  from public.championship_calendar_draw_state_v1
  where season_number=v_season;

  v_batch:=coalesce(v_batch,15);

  select exists(
    select 1
    from public.world_road_championship_editions
    where season_number=v_season
      and schedule_draw_status='locked'
      and race_date is not null
      and race_id is not null
  ) into v_world_locked;

  if v_month=1 then
    v_expected_locked:=least(v_total,greatest(v_day,1)*v_batch);

    if v_locked<v_expected_locked then
      v_issue_count:=v_issue_count+1;
    end if;

    if not v_world_locked then
      v_issue_count:=v_issue_count+1;
    end if;
  else
    v_expected_locked:=v_total;

    if v_pending>0 or v_locked<>v_total then
      v_issue_count:=v_issue_count+1;
    end if;

    if not v_world_locked then
      v_issue_count:=v_issue_count+1;
    end if;

    if coalesce(v_state_status,'')<>'completed' then
      v_issue_count:=v_issue_count+1;
    end if;
  end if;

  if v_blocked_pending>0 then
    v_issue_count:=v_issue_count+1;
  end if;

  v_details:=jsonb_build_object(
    'season_number',v_season,
    'game_date',v_game_date,
    'january_only',true,
    'batch_size',v_batch,
    'country_editions_total',v_total,
    'country_editions_locked',v_locked,
    'country_editions_pending',v_pending,
    'ready_pending',v_ready_pending,
    'blocked_pending',v_blocked_pending,
    'expected_locked_by_today',v_expected_locked,
    'world_draw_locked',v_world_locked,
    'draw_state',v_state_status,
    'last_batch_game_date',v_last_batch
  );

  v_message:=case
    when v_issue_count=0 and v_month=1
      then format('Championship calendar draw is on schedule: %s/%s national draws locked; World draw locked.',v_locked,v_total)
    when v_issue_count=0
      then format('Championship calendar draw completed and locked: %s national draws plus World Grand Finale.',v_total)
    else format('%s championship calendar draw health issue(s) detected.',v_issue_count)
  end;

  perform public.log_system_business_check_v1(
    'check:championship_calendar_draw',
    case when v_issue_count>0 then 'error' else 'success' end,
    v_message,
    v_details
  );

  if v_issue_count>0 then
    perform public.raise_system_incident_v1(
      'check:championship_calendar_draw',
      'critical',
      'Championship calendar draw requires attention',
      v_message,
      'business:championship-calendar-draw',
      v_details
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      'business:championship-calendar-draw',
      'Championship calendar draw is healthy.'
    );
  end if;

  return jsonb_build_object(
    'status',case when v_issue_count=0 then 'healthy' else 'attention_required' end,
    'issue_count',v_issue_count,
    'details',v_details
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_my_world_road_championship_final_participation_v1(p_edition_id uuid, p_rider_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=auth.uid();
  e public.world_road_championship_editions%rowtype;
  en public.world_road_championship_entries%rowtype;
  v_owner uuid;
  v_game_date date:=public.get_current_game_date_date();
  v_before integer;
  v_after integer;
  v_penalty integer:=15;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into e
  from public.world_road_championship_editions
  where id=p_edition_id;

  select * into en
  from public.world_road_championship_entries
  where edition_id=p_edition_id and rider_id=p_rider_id
  for update;

  if e.id is null or en.id is null then
    raise exception 'World Championship finalist not found';
  end if;

  if en.final_participation_decision<>'pending' then
    return jsonb_build_object(
      'edition_id',e.id,
      'rider_id',en.rider_id,
      'final_participation_decision',en.final_participation_decision,
      'already_decided',true
    );
  end if;

  if v_game_date>coalesce(e.final_decision_deadline,e.race_date-3) then
    raise exception 'The World Championship final confirmation deadline has passed';
  end if;

  select case
    when c.club_type='developing' and c.parent_club_id is not null
      then p.owner_user_id
    else c.owner_user_id
  end
  into v_owner
  from public.clubs c
  left join public.clubs p on p.id=c.parent_club_id
  where c.id=en.club_id_snapshot;

  if v_owner is distinct from v_user then
    raise exception 'Not allowed to decide for this rider';
  end if;

  if p_approve then
    update public.world_road_championship_entries
    set final_participation_decision='approved',
        final_participation_decision_at=now(),
        final_participation_decision_user_id=v_user,
        updated_at=now()
    where id=en.id;
  else
    select coalesce(morale,50) into v_before
    from public.riders
    where id=en.rider_id
    for update;

    v_after:=greatest(0,v_before-v_penalty);

    update public.riders
    set morale=v_after,
        morale_updated_on=greatest(coalesce(morale_updated_on,v_game_date),v_game_date)
    where id=en.rider_id;

    update public.world_road_championship_entries
    set final_participation_decision='rejected',
        final_participation_decision_at=now(),
        final_participation_decision_user_id=v_user,
        final_refusal_morale_delta=-v_penalty,
        entry_status='withdrawn',
        updated_at=now()
    where id=en.id;

    update public.world_road_championship_duties
    set status='cancelled',updated_at=now()
    where edition_id=e.id
      and rider_id=en.rider_id
      and status='confirmed';
  end if;

  perform public.world_road_championship_sync_participants_v1(e.id);

  return jsonb_build_object(
    'edition_id',e.id,
    'rider_id',en.rider_id,
    'final_participation_decision',case when p_approve then 'approved' else 'rejected' end,
    'second_confirmation',true,
    'morale_penalty_applied',case when p_approve then 0 else -v_penalty end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_notify_qualification_results_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  h record;
  u record;
  v_top_three jsonb;
  v_count integer:=0;
begin
  for h in
    select heat.id,heat.edition_id,heat.heat_number,heat.qualifying_places,
           heat.qualification_date,heat.race_id,e.country_code,e.final_date
    from public.national_championship_heats heat
    join public.national_championship_editions e on e.id=heat.edition_id
    where heat.status='completed'
      and heat.race_id is not null
      and exists(
        select 1 from public.national_championship_result_history rh
        where rh.heat_id=heat.id and rh.event_type='qualification'
      )
  loop
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'position',x.rank,
        'rider_id',x.rider_id,
        'rider_name',x.rider_name_snapshot,
        'team_name',x.club_name_snapshot
      ) order by x.rank
    ),'[]'::jsonb)
    into v_top_three
    from (
      select *
      from public.national_championship_result_history rh
      where rh.heat_id=h.id
        and rh.event_type='qualification'
        and lower(coalesce(rh.status,'finished'))='finished'
      order by rh.rank
      limit 3
    ) x;

    for u in
      select
        root.owner_user_id,
        jsonb_agg(
          jsonb_build_object(
            'position',rh.rank,
            'rider_id',rh.rider_id,
            'rider_name',rh.rider_name_snapshot,
            'team_name',rh.club_name_snapshot,
            'qualified',en.entry_status in ('qualified','finalist')
          )
          order by rh.rank
        ) as my_riders,
        jsonb_agg(rh.rider_name_snapshot order by rh.rank)
          filter (where en.entry_status in ('qualified','finalist')) as my_qualified_riders
      from public.national_championship_result_history rh
      join public.national_championship_entries en
        on en.edition_id=rh.edition_id and en.rider_id=rh.rider_id
      join public.clubs rc on rc.id=en.club_id_snapshot
      join public.clubs root on root.id=case
        when rc.club_type='developing' and rc.parent_club_id is not null then rc.parent_club_id
        else rc.id
      end
      where rh.heat_id=h.id
        and rh.event_type='qualification'
        and root.owner_user_id is not null
      group by root.owner_user_id
    loop
      perform public.ppm_create_user_notification_direct_v1(
        u.owner_user_id,
        'NATIONAL_CHAMPIONSHIP_QUALIFICATION_RESULT',
        h.country_code||' National Qualification Group '||h.heat_number||' completed',
        'Official results are available for National Qualification Group '||h.heat_number||
          '. Riders inside the top '||h.qualifying_places||' qualifying places advance to the National Championship final on '||h.final_date||'.',
        '/dashboard/national-championships/'||h.edition_id::text||'/qualification/'||h.heat_number::text,
        jsonb_build_object(
          'edition_id',h.edition_id,
          'heat_id',h.id,
          'heat_number',h.heat_number,
          'country_code',h.country_code,
          'qualification_date',h.qualification_date,
          'qualifying_places',h.qualifying_places,
          'final_date',h.final_date,
          'race_id',h.race_id,
          'top_three',v_top_three,
          'my_riders',coalesce(u.my_riders,'[]'::jsonb),
          'my_qualified_riders',coalesce(u.my_qualified_riders,'[]'::jsonb),
          'action_path','/dashboard/national-championships/'||h.edition_id::text||'/qualification/'||h.heat_number::text
        ),
        'national-qualification-result:'||h.id::text
      );
      v_count:=v_count+1;
    end loop;
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_notify_final_results_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  ed record;
  u record;
  v_top_three jsonb;
  v_count integer:=0;
begin
  for ed in
    select edition.*,coalesce(c.name,edition.country_code) country_name
    from public.national_championship_editions edition
    left join public.countries c on c.code=edition.country_code
    where edition.status='completed'
      and edition.final_race_id is not null
      and edition.champion_rider_id is not null
      and exists(
        select 1 from public.national_championship_result_history rh
        where rh.edition_id=edition.id and rh.event_type='final'
      )
  loop
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'position',x.rank,
        'rider_id',x.rider_id,
        'rider_name',x.rider_name_snapshot,
        'team_name',x.club_name_snapshot
      ) order by x.rank
    ),'[]'::jsonb)
    into v_top_three
    from (
      select *
      from public.national_championship_result_history rh
      where rh.edition_id=ed.id
        and rh.event_type='final'
        and lower(coalesce(rh.status,'finished'))='finished'
      order by rh.rank
      limit 3
    ) x;

    for u in
      select
        root.owner_user_id,
        jsonb_agg(
          jsonb_build_object(
            'position',rh.rank,
            'rider_id',rh.rider_id,
            'rider_name',rh.rider_name_snapshot,
            'team_name',rh.club_name_snapshot
          )
          order by rh.rank
        ) as my_riders
      from public.national_championship_result_history rh
      join public.national_championship_entries en
        on en.edition_id=rh.edition_id and en.rider_id=rh.rider_id
      join public.clubs rc on rc.id=en.club_id_snapshot
      join public.clubs root on root.id=case
        when rc.club_type='developing' and rc.parent_club_id is not null then rc.parent_club_id
        else rc.id
      end
      where rh.edition_id=ed.id
        and rh.event_type='final'
        and root.owner_user_id is not null
      group by root.owner_user_id
    loop
      perform public.ppm_create_user_notification_direct_v1(
        u.owner_user_id,
        'NATIONAL_CHAMPIONSHIP_FINAL_RESULT',
        ed.country_name||' National Championship completed',
        ed.champion_name_snapshot||' is the Season '||ed.season_number||' National Road Champion. The complete final classification is now official.',
        '/dashboard/national-championships/'||ed.id::text||'/final',
        jsonb_build_object(
          'edition_id',ed.id,
          'country_code',ed.country_code,
          'country_name',ed.country_name,
          'season_number',ed.season_number,
          'final_date',ed.final_date,
          'race_id',ed.final_race_id,
          'champion_rider_id',ed.champion_rider_id,
          'champion_rider_name',ed.champion_name_snapshot,
          'top_three',v_top_three,
          'my_riders',coalesce(u.my_riders,'[]'::jsonb),
          'action_path','/dashboard/national-championships/'||ed.id::text||'/final'
        ),
        'national-final-result:'||ed.id::text
      );
      v_count:=v_count+1;
    end loop;
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.world_road_championship_notify_results_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  e record;
  u record;
  v_stage_id uuid;
  v_top_three jsonb;
  v_count integer:=0;
begin
  for e in
    select *
    from public.world_road_championship_editions
    where status='completed'
      and race_id is not null
      and champion_rider_id is not null
  loop
    select id into v_stage_id
    from public.race_stages
    where race_id=e.race_id
    order by stage_number
    limit 1;

    if v_stage_id is null then continue; end if;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'position',x.rank,
        'rider_id',x.rider_id,
        'rider_name',coalesce(x.rider_name_snapshot,en.rider_name_snapshot),
        'team_name',coalesce(x.team_name_snapshot,en.club_name_snapshot)
      ) order by x.rank
    ),'[]'::jsonb)
    into v_top_three
    from (
      select *
      from public.race_stage_results rs
      where rs.stage_id=v_stage_id
        and rs.rider_id is not null
        and rs.rank between 1 and 3
        and lower(coalesce(rs.status,'finished'))='finished'
      order by rs.rank
    ) x
    left join public.world_road_championship_entries en
      on en.edition_id=e.id and en.rider_id=x.rider_id;

    for u in
      select
        root.owner_user_id,
        jsonb_agg(
          jsonb_build_object(
            'position',rs.rank,
            'rider_id',rs.rider_id,
            'rider_name',coalesce(rs.rider_name_snapshot,en.rider_name_snapshot),
            'team_name',coalesce(rs.team_name_snapshot,en.club_name_snapshot)
          )
          order by rs.rank
        ) as my_riders
      from public.race_stage_results rs
      join public.world_road_championship_entries en
        on en.edition_id=e.id and en.rider_id=rs.rider_id
      join public.clubs rc on rc.id=en.club_id_snapshot
      join public.clubs root on root.id=case
        when rc.club_type='developing' and rc.parent_club_id is not null then rc.parent_club_id
        else rc.id
      end
      where rs.stage_id=v_stage_id
        and root.owner_user_id is not null
      group by root.owner_user_id
    loop
      perform public.ppm_create_user_notification_direct_v1(
        u.owner_user_id,
        'WORLD_ROAD_CHAMPIONSHIP_RESULT',
        'World Road Championship completed',
        e.champion_name_snapshot||' is the Season '||e.season_number||' World Road Champion. The Grand Finale classification is now official.',
        '/dashboard/races/'||e.race_id::text,
        jsonb_build_object(
          'world_edition_id',e.id,
          'season_number',e.season_number,
          'race_date',e.race_date,
          'race_id',e.race_id,
          'logo_url',e.logo_url,
          'champion_rider_id',e.champion_rider_id,
          'champion_rider_name',e.champion_name_snapshot,
          'top_three',v_top_three,
          'my_riders',coalesce(u.my_riders,'[]'::jsonb),
          'action_path','/dashboard/races/'||e.race_id::text
        ),
        'world-road-result:'||e.id::text
      );
      v_count:=v_count+1;
    end loop;
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_process_qualification_results_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_notifications integer;
begin
  v_result:=public.national_championship_process_qualification_results_base_v1();
  v_notifications:=public.national_championship_notify_qualification_results_v1();
  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object('result_notifications_sent',v_notifications);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_process_final_results_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_notifications integer;
begin
  v_result:=public.national_championship_process_final_results_base_v1();
  v_notifications:=public.national_championship_notify_final_results_v1();
  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object('result_notifications_sent',v_notifications);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.world_road_championship_process_results_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_notifications integer;
begin
  v_result:=public.world_road_championship_process_results_base_v1();
  v_notifications:=public.world_road_championship_notify_results_v1();
  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object('result_notifications_sent',v_notifications);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.freeze_national_championship_ranking_v1(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  v_result:=public.freeze_national_championship_ranking_base_v1(p_edition_id);

  update public.national_championship_entries en
  set entry_status='withdrawn',
      participation_decision='rejected',
      participation_decision_at=coalesce(en.participation_decision_at,now()),
      updated_at=now()
  from public.national_championship_heats h
  where en.edition_id=p_edition_id
    and en.heat_id=h.id
    and en.entry_status='qualification_assigned'
    and not public.national_championship_rider_available_for_event_v1(
      en.rider_id,
      h.qualification_date
    );

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.join_my_national_association_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_club record;
  v_assoc public.national_associations%rowtype;
  v_country_name text;
  v_membership_id uuid;
  v_member_count integer;
  v_minimum integer;
  v_today date:=public.get_current_game_date_date();
  v_activated boolean:=false;
  v_status text;
  v_election_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_club
  from private.national_association_eligible_main_club_v1(v_uid);

  if v_club.club_id is null then
    raise exception 'Your active human main club is not eligible for a National Association.';
  end if;

  select c.name into v_country_name
  from public.countries c
  where upper(c.code)=v_club.country_code
  limit 1;

  insert into public.national_associations(
    country_code,name,status,created_by_user_id,created_on_game_date,last_status_change_on_game_date
  )
  values(
    v_club.country_code,
    coalesce(v_country_name,v_club.country_code)||' National Association',
    'forming',
    v_uid,
    v_today,
    v_today
  )
  on conflict(country_code) do update
    set updated_at=now()
  returning * into v_assoc;

  update public.national_association_memberships
  set status='left',
      left_on_game_date=v_today,
      updated_at=now()
  where user_id=v_uid
    and status='active'
    and association_id<>v_assoc.id;

  insert into public.national_association_memberships(
    association_id,user_id,club_id,status,coach_eligible,joined_on_game_date,left_on_game_date
  )
  values(
    v_assoc.id,v_uid,v_club.club_id,'active',true,v_today,null
  )
  on conflict(association_id,user_id) do update
    set club_id=excluded.club_id,
        status='active',
        coach_eligible=true,
        joined_on_game_date=
          case
            when public.national_association_memberships.status='active'
              then public.national_association_memberships.joined_on_game_date
            else excluded.joined_on_game_date
          end,
        left_on_game_date=null,
        updated_at=now()
  returning id into v_membership_id;

  select minimum_active_members::integer
  into v_minimum
  from public.national_association_config
  where id=true;

  v_member_count:=private.national_association_active_member_count_v1(v_assoc.id);

  if v_member_count>=coalesce(v_minimum,5)
     and v_assoc.status<>'active' then
    update public.national_associations
    set status='active',
        activated_on_game_date=coalesce(activated_on_game_date,v_today),
        inactive_on_game_date=null,
        last_status_change_on_game_date=v_today,
        updated_at=now()
    where id=v_assoc.id;

    v_activated:=true;
  end if;

  select status into v_status
  from public.national_associations
  where id=v_assoc.id;

  if v_status='active' then
    v_election_id:=public.ensure_national_coach_election_v1(v_assoc.id,null);
  end if;

  return jsonb_build_object(
    'association_id',v_assoc.id,
    'association_name',v_assoc.name,
    'country_code',v_assoc.country_code,
    'membership_id',v_membership_id,
    'member_count',v_member_count,
    'minimum_members',coalesce(v_minimum,5),
    'association_status',v_status,
    'activated_now',v_activated,
    'election_id',v_election_id,
    'has_treasury',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.leave_my_national_association_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_membership public.national_association_memberships%rowtype;
  v_today date:=public.get_current_game_date_date();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_membership
  from public.national_association_memberships
  where user_id=v_uid
    and status='active'
  order by created_at desc
  limit 1
  for update;

  if v_membership.id is null then
    return jsonb_build_object('status','not_member');
  end if;

  if exists(
    select 1
    from public.national_coach_terms t
    where t.association_id=v_membership.association_id
      and t.user_id=v_uid
      and t.status='active'
  ) then
    raise exception 'The active National Coach must resign or be replaced before leaving the Association.';
  end if;

  update public.national_association_memberships
  set status='left',left_on_game_date=v_today,updated_at=now()
  where id=v_membership.id;

  v_count:=private.national_association_active_member_count_v1(v_membership.association_id);

  -- Active Associations are not immediately dissolved when membership drops
  -- below five. Seasonal lifecycle validation will handle future inactivity.
  return jsonb_build_object(
    'status','left',
    'association_id',v_membership.association_id,
    'remaining_eligible_members',v_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.carry_forward_national_coach_v1(p_association_id uuid, p_season_number integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_previous public.national_coach_terms%rowtype;
  v_new_id uuid;
  v_start date:=public.game_date_from_parts(p_season_number,1,1);
  v_end date:=public.game_date_from_parts(p_season_number,12,31);
begin
  if exists(
    select 1
    from public.national_coach_terms
    where association_id=p_association_id
      and season_number=p_season_number
      and status='active'
  ) then
    return null;
  end if;

  select t.*
  into v_previous
  from public.national_coach_terms t
  join public.national_association_memberships m
    on m.id=t.membership_id
   and m.status='active'
  join public.clubs c
    on c.id=t.club_id
   and c.owner_user_id=t.user_id
   and c.club_type='main'
   and coalesce(c.is_ai,false)=false
   and coalesce(c.is_active,true)=true
   and c.deleted_at is null
   and coalesce(c.inactivity_status,'active')='active'
  where t.association_id=p_association_id
    and t.season_number<p_season_number
    and t.status in ('active','completed')
  order by t.season_number desc,t.term_start_game_date desc,t.created_at desc
  limit 1;

  if v_previous.id is null then
    return null;
  end if;

  insert into public.national_coach_terms(
    association_id,election_id,candidate_id,membership_id,user_id,club_id,
    season_number,term_start_game_date,term_end_game_date,status,term_kind
  )
  values(
    p_association_id,v_previous.election_id,v_previous.candidate_id,
    v_previous.membership_id,v_previous.user_id,v_previous.club_id,
    p_season_number,v_start,v_end,'active','caretaker'
  )
  returning id into v_new_id;

  return v_new_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_national_coach_election_v1(p_association_id uuid, p_season_number integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_assoc public.national_associations%rowtype;
  v_cfg public.national_association_config%rowtype;
  v_current_season integer;
  v_season integer;
  v_today date:=public.get_current_game_date_date();
  v_existing uuid;
  v_any_previous boolean:=false;
  v_kind text;
  v_reason text;
  v_registration_open date;
  v_registration_close date;
  v_round1_open date;
  v_round1_close date;
  v_id uuid;
begin
  select * into v_assoc
  from public.national_associations
  where id=p_association_id;

  if v_assoc.id is null or v_assoc.status<>'active' then
    return null;
  end if;

  select season_number into v_current_season
  from public.game_state
  where id=true;

  if v_current_season is null then
    raise exception 'Game season is unavailable.';
  end if;

  v_season:=coalesce(p_season_number,v_current_season);

  if v_season<>v_current_season then
    raise exception 'National Coach elections can only be created for the current season.';
  end if;

  select * into v_cfg
  from public.national_association_config
  where id=true;

  select id into v_existing
  from public.national_coach_elections
  where association_id=p_association_id
    and season_number=v_season
    and status in ('candidate_registration','voting','runoff','completed')
  order by created_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  select exists(
    select 1
    from public.national_coach_elections
    where association_id=p_association_id
  )
  into v_any_previous;

  perform public.carry_forward_national_coach_v1(p_association_id,v_season);

  -- Fixed Tennis-style January window for every Association that is active
  -- while candidature is still open: Jan 1-10 candidature, Jan 10-20 Round 1.
  -- This also applies to the first-ever election, so first activation in early
  -- January does not shift the calendar by an extra day or create a different
  -- voting window.
  v_registration_open:=public.game_date_from_parts(
    v_season,v_cfg.annual_registration_start_month,v_cfg.annual_registration_start_day
  );
  v_registration_close:=public.game_date_from_parts(
    v_season,v_cfg.annual_registration_close_month,v_cfg.annual_registration_close_day
  );
  v_round1_open:=v_registration_close;
  v_round1_close:=public.game_date_from_parts(
    v_season,v_cfg.annual_round1_close_month,v_cfg.annual_round1_close_day
  );

  if v_today<v_registration_close then
    v_kind:='annual';
    v_reason:=case
      when v_any_previous then 'annual_january_election'
      else 'association_activated_january'
    end;
  elsif v_any_previous and v_today<v_round1_close then
    -- An established Association should already have had registration opened
    -- on Jan 1. If maintenance is only catching up after registration closed,
    -- use a replacement election rather than creating an impossible annual
    -- ballot with no candidature window.
    v_kind:='replacement';
    v_reason:='missing_coach_recovery';
    v_registration_open:=v_today;
    v_registration_close:=v_today+v_cfg.activation_registration_days;
    v_round1_open:=v_registration_close;
    v_round1_close:=v_round1_open+v_cfg.activation_voting_days;
  elsif not v_any_previous then
    -- First activation after Jan 10 cannot join a closed annual candidature
    -- window, so open a full replacement election.
    v_kind:='replacement';
    v_reason:='association_activated_after_january_registration';
    v_registration_open:=v_today;
    v_registration_close:=v_today+v_cfg.activation_registration_days;
    v_round1_open:=v_registration_close;
    v_round1_close:=v_round1_open+v_cfg.activation_voting_days;
  else
    -- Annual process was missed after the fixed January window.
    v_kind:='replacement';
    v_reason:='missing_coach_recovery';
    v_registration_open:=v_today;
    v_registration_close:=v_today+v_cfg.activation_registration_days;
    v_round1_open:=v_registration_close;
    v_round1_close:=v_round1_open+v_cfg.activation_voting_days;
  end if;

  insert into public.national_coach_elections(
    association_id,season_number,election_kind,reason,status,
    registration_open_date,registration_close_date,
    round1_open_date,round1_close_date,
    current_round,current_round_open_date,current_round_close_date,
    runoff_registration_open
  )
  values(
    p_association_id,v_season,v_kind,v_reason,'candidate_registration',
    v_registration_open,v_registration_close,
    v_round1_open,v_round1_close,
    1,v_round1_open,v_round1_close,false
  )
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.register_national_coach_candidate_v1(p_election_id uuid, p_manifesto text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_today date:=public.get_current_game_date_date();
  v_e public.national_coach_elections%rowtype;
  v_membership public.national_association_memberships%rowtype;
  v_manifesto text:=btrim(coalesce(p_manifesto,''));
  v_candidate_id uuid;
  v_registration_allowed boolean:=false;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if char_length(v_manifesto)<10 or char_length(v_manifesto)>1000 then
    raise exception 'Manifesto must contain between 10 and 1000 characters.';
  end if;

  select * into v_e
  from public.national_coach_elections
  where id=p_election_id
  for update;

  if v_e.id is null then
    raise exception 'Election not found.';
  end if;

  if v_e.status='candidate_registration'
     and v_today>=v_e.registration_open_date
     and v_today<v_e.registration_close_date then
    v_registration_allowed:=true;
  elsif v_e.status='runoff'
     and v_e.runoff_registration_open
     and v_e.current_round_close_date is not null
     and v_today>=v_e.current_round_open_date
     and v_today<v_e.current_round_close_date then
    v_registration_allowed:=true;
  end if;

  if not v_registration_allowed then
    raise exception 'Candidate registration is closed.';
  end if;

  select * into v_membership
  from public.national_association_memberships
  where association_id=v_e.association_id
    and user_id=v_uid
    and status='active'
    and coach_eligible=true
  limit 1;

  if v_membership.id is null
     or not private.national_association_member_is_eligible_v1(v_e.association_id,v_uid) then
    raise exception 'You are not eligible to stand in this National Coach election.';
  end if;

  insert into public.national_coach_candidates(
    election_id,membership_id,user_id,club_id,manifesto,status,registered_on_game_date
  )
  values(
    v_e.id,v_membership.id,v_uid,v_membership.club_id,v_manifesto,'active',v_today
  )
  on conflict(election_id,user_id) do update
    set membership_id=excluded.membership_id,
        club_id=excluded.club_id,
        manifesto=excluded.manifesto,
        status='active',
        withdrawn_on_game_date=null,
        updated_at=now()
  returning id into v_candidate_id;

  if v_e.status='runoff' and v_e.runoff_registration_open then
    insert into public.national_coach_runoff_candidates(
      election_id,round_number,candidate_id
    )
    values(v_e.id,v_e.current_round,v_candidate_id)
    on conflict do nothing;
  end if;

  return v_candidate_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.withdraw_national_coach_candidate_v1(p_election_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_today date:=public.get_current_game_date_date();
  v_e public.national_coach_elections%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_e
  from public.national_coach_elections
  where id=p_election_id;

  if v_e.id is null then
    raise exception 'Election not found.';
  end if;

  if v_e.status<>'candidate_registration'
     or v_today>=v_e.registration_close_date then
    raise exception 'Candidature can only be withdrawn before voting begins.';
  end if;

  update public.national_coach_candidates
  set status='withdrawn',
      withdrawn_on_game_date=v_today,
      updated_at=now()
  where election_id=v_e.id
    and user_id=v_uid
    and status='active';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cast_national_coach_vote_v1(p_election_id uuid, p_candidate_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_today date:=public.get_current_game_date_date();
  v_e public.national_coach_elections%rowtype;
  v_membership public.national_association_memberships%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_e
  from public.national_coach_elections
  where id=p_election_id;

  if v_e.id is null then
    raise exception 'Election not found.';
  end if;

  if v_e.status not in ('voting','runoff') then
    raise exception 'Voting is not currently open.';
  end if;

  if v_today<v_e.current_round_open_date
     or v_today>=v_e.current_round_close_date then
    raise exception 'Voting is not currently open.';
  end if;

  select * into v_membership
  from public.national_association_memberships
  where association_id=v_e.association_id
    and user_id=v_uid
    and status='active'
  limit 1;

  if v_membership.id is null
     or not private.national_association_member_is_eligible_v1(v_e.association_id,v_uid) then
    raise exception 'Only active eligible Association members may vote.';
  end if;

  if exists(
    select 1
    from public.national_coach_votes
    where election_id=v_e.id
      and round_number=v_e.current_round
      and voter_user_id=v_uid
  ) then
    raise exception 'You have already voted in this round. Your vote is final.';
  end if;

  if not exists(
    select 1
    from public.national_coach_candidates c
    where c.id=p_candidate_id
      and c.election_id=v_e.id
      and c.status='active'
  ) then
    raise exception 'Candidate is not eligible in this election.';
  end if;

  if v_e.status='runoff' and not exists(
    select 1
    from public.national_coach_runoff_candidates rc
    where rc.election_id=v_e.id
      and rc.round_number=v_e.current_round
      and rc.candidate_id=p_candidate_id
  ) then
    raise exception 'Candidate is not part of the current runoff.';
  end if;

  insert into public.national_coach_votes(
    election_id,round_number,membership_id,voter_user_id,candidate_id,cast_on_game_date
  )
  values(
    v_e.id,v_e.current_round,v_membership.id,v_uid,p_candidate_id,v_today
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_national_coach_election_v1(p_election_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_e public.national_coach_elections%rowtype;
  v_cfg public.national_association_config%rowtype;
  v_today date:=public.get_current_game_date_date();
  v_candidate_count integer:=0;
  v_max_votes integer:=0;
  v_top_count integer:=0;
  v_winner uuid;
  v_winner_row public.national_coach_candidates%rowtype;
  v_next_round integer;
  v_next_open date;
  v_next_close date;
  v_open_registration boolean:=false;
begin
  select * into v_e
  from public.national_coach_elections
  where id=p_election_id
  for update;

  if v_e.id is null or v_e.status not in ('voting','runoff') then
    return jsonb_build_object('status','not_resolvable');
  end if;

  if v_today<v_e.current_round_close_date then
    return jsonb_build_object(
      'status','still_open',
      'closes_on',v_e.current_round_close_date
    );
  end if;

  select * into v_cfg
  from public.national_association_config
  where id=true;

  if v_e.status='voting' then
    select count(*)::integer
    into v_candidate_count
    from public.national_coach_candidates c
    where c.election_id=v_e.id
      and c.status='active';

    if v_candidate_count>0 then
      select coalesce(max(x.vote_count),0)::integer
      into v_max_votes
      from (
        select c.id,count(v.id)::integer as vote_count
        from public.national_coach_candidates c
        left join public.national_coach_votes v
          on v.election_id=v_e.id
         and v.round_number=v_e.current_round
         and v.candidate_id=c.id
        where c.election_id=v_e.id
          and c.status='active'
        group by c.id
      ) x;

      select count(*)::integer,min(x.candidate_id::text)::uuid
      into v_top_count,v_winner
      from (
        select c.id as candidate_id,count(v.id)::integer as vote_count
        from public.national_coach_candidates c
        left join public.national_coach_votes v
          on v.election_id=v_e.id
         and v.round_number=v_e.current_round
         and v.candidate_id=c.id
        where c.election_id=v_e.id
          and c.status='active'
        group by c.id
      ) x
      where x.vote_count=v_max_votes;
    end if;
  else
    select count(*)::integer
    into v_candidate_count
    from public.national_coach_runoff_candidates rc
    join public.national_coach_candidates c
      on c.id=rc.candidate_id
     and c.status='active'
    where rc.election_id=v_e.id
      and rc.round_number=v_e.current_round;

    if v_candidate_count>0 then
      select coalesce(max(x.vote_count),0)::integer
      into v_max_votes
      from (
        select rc.candidate_id,count(v.id)::integer as vote_count
        from public.national_coach_runoff_candidates rc
        join public.national_coach_candidates c
          on c.id=rc.candidate_id
         and c.status='active'
        left join public.national_coach_votes v
          on v.election_id=rc.election_id
         and v.round_number=rc.round_number
         and v.candidate_id=rc.candidate_id
        where rc.election_id=v_e.id
          and rc.round_number=v_e.current_round
        group by rc.candidate_id
      ) x;

      select count(*)::integer,min(x.candidate_id::text)::uuid
      into v_top_count,v_winner
      from (
        select rc.candidate_id,count(v.id)::integer as vote_count
        from public.national_coach_runoff_candidates rc
        join public.national_coach_candidates c
          on c.id=rc.candidate_id
         and c.status='active'
        left join public.national_coach_votes v
          on v.election_id=rc.election_id
         and v.round_number=rc.round_number
         and v.candidate_id=rc.candidate_id
        where rc.election_id=v_e.id
          and rc.round_number=v_e.current_round
        group by rc.candidate_id
      ) x
      where x.vote_count=v_max_votes;
    end if;
  end if;

  -- No candidate, no votes, or tied leaders -> another seven-day runoff.
  if v_candidate_count=0 or v_max_votes<=0 or v_top_count<>1 then
    v_next_round:=v_e.current_round+1;
    v_next_open:=v_today;

    -- The fixed annual second round runs Jan 20-27.
    if v_e.election_kind='annual'
       and v_e.current_round=1
       and v_today<=public.game_date_from_parts(
         v_e.season_number,
         v_cfg.annual_round1_close_month,
         v_cfg.annual_round1_close_day
       ) then
      v_next_open:=public.game_date_from_parts(
        v_e.season_number,
        v_cfg.annual_round1_close_month,
        v_cfg.annual_round1_close_day
      );
      v_next_close:=public.game_date_from_parts(
        v_e.season_number,
        v_cfg.annual_round2_close_month,
        v_cfg.annual_round2_close_day
      );
    else
      v_next_close:=v_next_open+v_cfg.repeated_runoff_days;
    end if;

    v_open_registration:=(v_candidate_count=0);

    if v_candidate_count>0 then
      if v_e.status='voting' then
        insert into public.national_coach_runoff_candidates(
          election_id,round_number,candidate_id
        )
        select v_e.id,v_next_round,c.id
        from public.national_coach_candidates c
        left join public.national_coach_votes v
          on v.election_id=v_e.id
         and v.round_number=v_e.current_round
         and v.candidate_id=c.id
        where c.election_id=v_e.id
          and c.status='active'
        group by c.id
        having
          case
            when v_max_votes<=0 then true
            else count(v.id)::integer=v_max_votes
          end
        on conflict do nothing;
      else
        insert into public.national_coach_runoff_candidates(
          election_id,round_number,candidate_id
        )
        select v_e.id,v_next_round,rc.candidate_id
        from public.national_coach_runoff_candidates rc
        join public.national_coach_candidates c
          on c.id=rc.candidate_id
         and c.status='active'
        left join public.national_coach_votes v
          on v.election_id=rc.election_id
         and v.round_number=rc.round_number
         and v.candidate_id=rc.candidate_id
        where rc.election_id=v_e.id
          and rc.round_number=v_e.current_round
        group by rc.candidate_id
        having
          case
            when v_max_votes<=0 then true
            else count(v.id)::integer=v_max_votes
          end
        on conflict do nothing;
      end if;
    end if;

    update public.national_coach_elections
    set status='runoff',
        current_round=v_next_round,
        current_round_open_date=v_next_open,
        current_round_close_date=v_next_close,
        runoff_registration_open=v_open_registration,
        updated_at=now()
    where id=v_e.id;

    return jsonb_build_object(
      'status','runoff',
      'round',v_next_round,
      'opens_on',v_next_open,
      'closes_on',v_next_close,
      'registration_open',v_open_registration,
      'reason',
        case
          when v_candidate_count=0 then 'no_candidates'
          when v_max_votes<=0 then 'no_votes'
          else 'tied_leaders'
        end
    );
  end if;

  select * into v_winner_row
  from public.national_coach_candidates
  where id=v_winner;

  if v_winner_row.id is null then
    return jsonb_build_object('status','winner_missing');
  end if;

  update public.national_coach_elections
  set status='completed',
      winning_candidate_id=v_winner_row.id,
      completed_on_game_date=v_today,
      runoff_registration_open=false,
      updated_at=now()
  where id=v_e.id;

  update public.national_coach_terms
  set status='completed',
      term_end_game_date=greatest(term_start_game_date,v_today-1),
      updated_at=now()
  where association_id=v_e.association_id
    and status='active';

  insert into public.national_coach_terms(
    association_id,election_id,candidate_id,membership_id,user_id,club_id,
    season_number,term_start_game_date,term_end_game_date,status,term_kind
  )
  values(
    v_e.association_id,v_e.id,v_winner_row.id,v_winner_row.membership_id,
    v_winner_row.user_id,v_winner_row.club_id,v_e.season_number,
    v_today,public.game_date_from_parts(v_e.season_number,12,31),
    'active',
    case when v_e.election_kind='replacement' then 'replacement' else 'elected' end
  );

  return jsonb_build_object(
    'status','completed',
    'winner_candidate_id',v_winner_row.id,
    'winner_user_id',v_winner_row.user_id,
    'winner_club_id',v_winner_row.club_id,
    'round',v_e.current_round
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_national_coach_election_v1(p_election_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_e public.national_coach_elections%rowtype;
  v_today date:=public.get_current_game_date_date();
begin
  select * into v_e
  from public.national_coach_elections
  where id=p_election_id
  for update;

  if v_e.id is null then
    return jsonb_build_object('status','not_found');
  end if;

  if v_e.status='candidate_registration'
     and v_today>=v_e.registration_close_date then
    update public.national_coach_elections
    set status='voting',
        current_round=1,
        current_round_open_date=v_e.round1_open_date,
        current_round_close_date=v_e.round1_close_date,
        runoff_registration_open=false,
        updated_at=now()
    where id=v_e.id;

    select * into v_e
    from public.national_coach_elections
    where id=p_election_id;
  end if;

  if v_e.status in ('voting','runoff')
     and v_today>=v_e.current_round_close_date then
    return public.resolve_national_coach_election_v1(v_e.id);
  end if;

  return jsonb_build_object(
    'status',v_e.status,
    'round',v_e.current_round,
    'opens_on',v_e.current_round_open_date,
    'closes_on',v_e.current_round_close_date
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_national_coach_elections_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_season integer;
  v_assoc record;
  v_election_id uuid;
  v_processed integer:=0;
  v_created integer:=0;
begin
  select season_number into v_season
  from public.game_state
  where id=true;

  for v_assoc in
    select id
    from public.national_associations
    where status='active'
  loop
    v_election_id:=public.ensure_national_coach_election_v1(v_assoc.id,v_season);

    if v_election_id is not null then
      if not exists(
        select 1
        from public.national_coach_elections
        where id=v_election_id
          and created_at<now()-interval '2 seconds'
      ) then
        v_created:=v_created+1;
      end if;

      perform public.process_national_coach_election_v1(v_election_id);
      v_processed:=v_processed+1;
    end if;
  end loop;

  return jsonb_build_object(
    'season_number',v_season,
    'associations_processed',v_processed,
    'elections_created_or_existing',v_created
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_national_association_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_club record;
  v_assoc public.national_associations%rowtype;
  v_membership public.national_association_memberships%rowtype;
  v_member_count integer:=0;
  v_minimum integer:=5;
  v_election public.national_coach_elections%rowtype;
  v_term public.national_coach_terms%rowtype;
  v_candidates jsonb:='[]'::jsonb;
  v_my_vote_candidate_id uuid;
  v_my_candidate_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_club
  from private.national_association_eligible_main_club_v1(v_uid);

  if v_club.club_id is null then
    return jsonb_build_object(
      'eligible',false,
      'reason','no_active_human_main_club'
    );
  end if;

  select * into v_assoc
  from public.national_associations
  where country_code=v_club.country_code
  limit 1;

  select minimum_active_members::integer
  into v_minimum
  from public.national_association_config
  where id=true;

  if v_assoc.id is null then
    return jsonb_build_object(
      'eligible',true,
      'country_code',v_club.country_code,
      'club_id',v_club.club_id,
      'club_name',v_club.club_name,
      'association_exists',false,
      'is_member',false,
      'minimum_members',coalesce(v_minimum,5),
      'has_treasury',false
    );
  end if;

  select * into v_membership
  from public.national_association_memberships
  where association_id=v_assoc.id
    and user_id=v_uid
    and status='active'
  limit 1;

  v_member_count:=private.national_association_active_member_count_v1(v_assoc.id);

  select * into v_election
  from public.national_coach_elections
  where association_id=v_assoc.id
    and status in ('candidate_registration','voting','runoff','completed')
  order by season_number desc,created_at desc
  limit 1;

  select * into v_term
  from public.national_coach_terms
  where association_id=v_assoc.id
    and status='active'
  order by season_number desc,created_at desc
  limit 1;

  if v_election.id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'candidate_id',c.id,
          'club_id',c.club_id,
          'club_name',cl.name,
          'manifesto',c.manifesto,
          'status',c.status,
          'is_me',c.user_id=v_uid,
          'in_current_round',
            case
              when v_election.status='runoff' then exists(
                select 1
                from public.national_coach_runoff_candidates rc
                where rc.election_id=v_election.id
                  and rc.round_number=v_election.current_round
                  and rc.candidate_id=c.id
              )
              else c.status='active'
            end
        )
        order by c.registered_on_game_date,c.created_at
      ),
      '[]'::jsonb
    )
    into v_candidates
    from public.national_coach_candidates c
    left join public.clubs cl on cl.id=c.club_id
    where c.election_id=v_election.id;

    select c.id into v_my_candidate_id
    from public.national_coach_candidates c
    where c.election_id=v_election.id
      and c.user_id=v_uid
      and c.status='active'
    limit 1;

    select v.candidate_id into v_my_vote_candidate_id
    from public.national_coach_votes v
    where v.election_id=v_election.id
      and v.round_number=v_election.current_round
      and v.voter_user_id=v_uid
    limit 1;
  end if;

  return jsonb_build_object(
    'eligible',true,
    'country_code',v_assoc.country_code,
    'club_id',v_club.club_id,
    'club_name',v_club.club_name,
    'association_exists',true,
    'association_id',v_assoc.id,
    'association_name',v_assoc.name,
    'association_status',v_assoc.status,
    'is_member',v_membership.id is not null,
    'membership_id',v_membership.id,
    'member_count',v_member_count,
    'minimum_members',coalesce(v_minimum,5),
    'has_treasury',false,
    'coach',
      case
        when v_term.id is null then null
        else jsonb_build_object(
          'term_id',v_term.id,
          'user_id',v_term.user_id,
          'club_id',v_term.club_id,
          'club_name',(select name from public.clubs where id=v_term.club_id),
          'season_number',v_term.season_number,
          'term_kind',v_term.term_kind,
          'starts_on',v_term.term_start_game_date,
          'ends_on',v_term.term_end_game_date
        )
      end,
    'election',
      case
        when v_election.id is null then null
        else jsonb_build_object(
          'id',v_election.id,
          'season_number',v_election.season_number,
          'kind',v_election.election_kind,
          'status',v_election.status,
          'registration_open_date',v_election.registration_open_date,
          'registration_close_date',v_election.registration_close_date,
          'round1_open_date',v_election.round1_open_date,
          'round1_close_date',v_election.round1_close_date,
          'current_round',v_election.current_round,
          'current_round_open_date',v_election.current_round_open_date,
          'current_round_close_date',v_election.current_round_close_date,
          'runoff_registration_open',v_election.runoff_registration_open,
          'winning_candidate_id',v_election.winning_candidate_id,
          'my_candidate_id',v_my_candidate_id,
          'my_vote_candidate_id',v_my_vote_candidate_id,
          'candidates',v_candidates
        )
      end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_my_national_association_election_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_association_id uuid;
  v_season integer;
  v_election_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select m.association_id
  into v_association_id
  from public.national_association_memberships m
  join public.national_associations a
    on a.id=m.association_id
   and a.status='active'
  where m.user_id=v_uid
    and m.status='active'
    and private.national_association_member_is_eligible_v1(m.association_id,v_uid)
  order by m.created_at desc
  limit 1;

  if v_association_id is null then
    return jsonb_build_object('status','no_active_association');
  end if;

  select season_number
  into v_season
  from public.game_state
  where id=true;

  v_election_id:=public.ensure_national_coach_election_v1(
    v_association_id,
    v_season
  );

  if v_election_id is null then
    return jsonb_build_object(
      'status','no_election',
      'association_id',v_association_id,
      'season_number',v_season
    );
  end if;

  return public.process_national_coach_election_v1(v_election_id)
    || jsonb_build_object(
      'association_id',v_association_id,
      'election_id',v_election_id,
      'season_number',v_season
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_national_coach_dashboard_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_term public.national_coach_terms%rowtype;
  v_assoc public.national_associations%rowtype;
  v_season integer;
  v_game_date date;
  v_country_name text;
  v_edition public.national_championship_editions%rowtype;
  v_has_snapshot boolean:=false;
  v_rank_date date;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_game_date
  from public.game_state gs
  where gs.id=true;

  select t.*
  into v_term
  from public.national_coach_terms t
  join public.national_associations a
    on a.id=t.association_id
   and a.status='active'
  join public.national_association_memberships m
    on m.id=t.membership_id
   and m.status='active'
  where t.user_id=v_uid
    and t.status='active'
    and t.season_number=v_season
    and private.national_association_member_is_eligible_v1(t.association_id,v_uid)
  order by
    case t.term_kind when 'elected' then 0 when 'replacement' then 1 else 2 end,
    t.created_at desc
  limit 1;

  if v_term.id is null then
    return jsonb_build_object(
      'allowed',false,
      'reason','not_active_national_coach',
      'season_number',v_season,
      'current_game_date',v_game_date
    );
  end if;

  select * into v_assoc
  from public.national_associations
  where id=v_term.association_id;

  select coalesce(c.name,v_assoc.country_code)
  into v_country_name
  from public.countries c
  where upper(c.code)=v_assoc.country_code
  limit 1;

  v_country_name:=coalesce(v_country_name,v_assoc.country_code);

  select * into v_edition
  from public.national_championship_editions e
  where e.season_number=v_season
    and e.country_code=v_assoc.country_code
    and e.discipline='road'
  limit 1;

  if v_edition.id is not null then
    select exists(
      select 1
      from public.national_championship_ranking_snapshots s
      where s.edition_id=v_edition.id
    )
    into v_has_snapshot;
  end if;

  v_rank_date:=
    case
      when v_edition.id is null then v_game_date
      else least(v_game_date,v_edition.ranking_snapshot_date)
    end;

  return jsonb_build_object(
    'allowed',true,
    'season_number',v_season,
    'current_game_date',v_game_date,
    'association',jsonb_build_object(
      'id',v_assoc.id,
      'name',v_assoc.name,
      'country_code',v_assoc.country_code,
      'country_name',v_country_name
    ),
    'coach',jsonb_build_object(
      'term_id',v_term.id,
      'term_kind',v_term.term_kind,
      'club_id',v_term.club_id,
      'club_name',(select name from public.clubs where id=v_term.club_id),
      'starts_on',v_term.term_start_game_date,
      'ends_on',v_term.term_end_game_date
    ),
    'national_championship',case
      when v_edition.id is null then null
      else jsonb_build_object(
        'edition_id',v_edition.id,
        'status',v_edition.status,
        'qualification_date',v_edition.qualification_date,
        'final_date',v_edition.final_date,
        'champion_rider_id',v_edition.champion_rider_id,
        'champion_name',v_edition.champion_name_snapshot,
        'ranking_frozen',v_has_snapshot
      )
    end,
    'standard_package',public.get_national_team_standard_package_v1(),
    'riders',coalesce((
      with ranking as (
        select
          s.rider_id,
          s.national_rank,
          s.raw_points,
          s.weighted_points,
          s.latest_result_date
        from public.national_championship_ranking_snapshots s
        where v_has_snapshot
          and s.edition_id=v_edition.id

        union all

        select
          p.rider_id,
          p.national_rank,
          p.raw_points,
          p.weighted_points,
          p.latest_result_date
        from public.preview_national_ranking_v1(
          v_assoc.country_code,
          v_rank_date
        ) p
        where not v_has_snapshot
      )
      select jsonb_agg(
        jsonb_build_object(
          'rider_id',r.id,
          'rider_name',r.display_name,
          'image_url',r.image_url,
          'country_code',r.country_code,
          'role',r.role::text,
          'birth_date',r.birth_date,
          'age_years',
            extract(year from age(v_game_date,r.birth_date))::integer,
          'club_id',r.club_id,
          'club_name',r.club_name,
          'club_is_ai',r.club_is_ai,
          'availability_status',r.availability_status,
          'fatigue',r.fatigue,
          'race_sharpness',rc.race_sharpness,
          'last_raced_on',rc.last_raced_on,
          'race_days_last_14',rc.race_days_last_14,
          'season_points',r.season_points_overall,
          'national_rank',rk.national_rank,
          'national_raw_points',rk.raw_points,
          'national_weighted_points',rk.weighted_points,
          'latest_ranked_result_date',rk.latest_result_date,
          'overall_range',jsonb_build_object(
            'min',lower(private.national_coach_masked_overall_bounds_v1(
              r.id,r.overall::integer,v_season
            )),
            'max',upper(private.national_coach_masked_overall_bounds_v1(
              r.id,r.overall::integer,v_season
            ))-1
          ),
          'national_championship',jsonb_build_object(
            'is_current_champion',
              v_edition.champion_rider_id is not null
              and v_edition.champion_rider_id=r.id,
            'final_rank',ncr.final_rank,
            'qualification_rank',ncr.qualification_rank,
            'final_status',ncr.final_status,
            'qualification_status',ncr.qualification_status
          )
        )
        order by
          rk.national_rank nulls last,
          r.season_points_overall desc nulls last,
          r.display_name
      )
      from public.rider_statistics_page_view r
      left join ranking rk on rk.rider_id=r.id
      left join public.rider_race_condition rc on rc.rider_id=r.id
      left join lateral (
        select
          min(h.rank) filter (where h.event_type='final') as final_rank,
          min(h.rank) filter (where h.event_type='qualification') as qualification_rank,
          max(h.status) filter (where h.event_type='final') as final_status,
          max(h.status) filter (where h.event_type='qualification') as qualification_status
        from public.national_championship_result_history h
        where v_edition.id is not null
          and h.edition_id=v_edition.id
          and h.rider_id=r.id
      ) ncr on true
      where upper(r.country_code)=v_assoc.country_code
    ),'[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.send_national_team_callup_v1(p_rider_id uuid, p_cycle_key text DEFAULT 'season_main'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_rider record;
  v_root_owner uuid;
  v_today date:=public.get_current_game_date_date();
  v_deadline date;
  v_response_days integer;
  v_max_callups integer;
  v_active_callups integer;
  v_status text;
  v_callup_id uuid;
  v_cycle text:=btrim(coalesce(p_cycle_key,'season_main'));
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if v_cycle='' or char_length(v_cycle)>80 then
    raise exception 'Invalid national-team cycle key.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can send national-team call-ups.';
  end if;

  select
    r.id,
    r.display_name,
    upper(r.country_code) as country_code,
    r.club_id,
    r.club_name,
    coalesce(r.club_is_ai,false) as club_is_ai,
    r.availability_status,
    c.owner_user_id as direct_owner,
    parent.owner_user_id as parent_owner
  into v_rider
  from public.rider_statistics_page_view r
  left join public.clubs c on c.id=r.club_id
  left join public.clubs parent on parent.id=c.parent_club_id
  where r.id=p_rider_id
  limit 1;

  if v_rider.id is null then
    raise exception 'Rider not found.';
  end if;

  if v_rider.country_code<>v_ctx.country_code then
    raise exception 'This rider is not eligible for your national team.';
  end if;

  select
    callup_response_days::integer,
    max_active_callups::integer
  into v_response_days,v_max_callups
  from public.national_association_config
  where id=true;

  select count(*)::integer
  into v_active_callups
  from public.national_team_callups c
  where c.association_id=v_ctx.association_id
    and c.season_number=v_ctx.season_number
    and c.cycle_key=v_cycle
    and c.status in ('pending','accepted','auto_accepted');

  if v_active_callups>=coalesce(v_max_callups,15) then
    raise exception 'Maximum provisional call-ups reached for this national-team cycle.';
  end if;

  v_root_owner:=coalesce(v_rider.parent_owner,v_rider.direct_owner);

  if v_rider.club_id is null or v_rider.club_is_ai then
    if coalesce(v_rider.availability_status,'fit')='fit' then
      v_status:='auto_accepted';
      v_deadline:=null;
    else
      raise exception 'The AI/free-agent rider is currently unavailable for call-up.';
    end if;
  else
    if v_root_owner is null then
      raise exception 'The rider club does not have a valid controlling manager.';
    end if;
    v_status:='pending';
    v_deadline:=v_today+coalesce(v_response_days,7);
  end if;

  insert into public.national_team_callups(
    association_id,season_number,cycle_key,rider_id,rider_name_snapshot,
    country_code,club_id_snapshot,club_name_snapshot,
    club_owner_user_id_snapshot,sent_by_user_id,status,
    sent_on_game_date,response_deadline,
    responded_on_game_date,responded_by_user_id
  )
  values(
    v_ctx.association_id,v_ctx.season_number,v_cycle,v_rider.id,
    coalesce(v_rider.display_name,v_rider.id::text),
    v_ctx.country_code,v_rider.club_id,v_rider.club_name,
    v_root_owner,v_uid,v_status,v_today,v_deadline,
    case when v_status='auto_accepted' then v_today else null end,
    null
  )
  on conflict(association_id,season_number,cycle_key,rider_id)
  do update
  set
    rider_name_snapshot=excluded.rider_name_snapshot,
    club_id_snapshot=excluded.club_id_snapshot,
    club_name_snapshot=excluded.club_name_snapshot,
    club_owner_user_id_snapshot=excluded.club_owner_user_id_snapshot,
    sent_by_user_id=excluded.sent_by_user_id,
    status=
      case
        when public.national_team_callups.status in ('withdrawn','not_selected','expired')
          then excluded.status
        else public.national_team_callups.status
      end,
    sent_on_game_date=
      case
        when public.national_team_callups.status in ('withdrawn','not_selected','expired')
          then excluded.sent_on_game_date
        else public.national_team_callups.sent_on_game_date
      end,
    response_deadline=
      case
        when public.national_team_callups.status in ('withdrawn','not_selected','expired')
          then excluded.response_deadline
        else public.national_team_callups.response_deadline
      end,
    responded_on_game_date=
      case
        when public.national_team_callups.status in ('withdrawn','not_selected','expired')
          then excluded.responded_on_game_date
        else public.national_team_callups.responded_on_game_date
      end,
    responded_by_user_id=
      case
        when public.national_team_callups.status in ('withdrawn','not_selected','expired')
          then excluded.responded_by_user_id
        else public.national_team_callups.responded_by_user_id
      end,
    updated_at=now()
  returning id,status,response_deadline
  into v_callup_id,v_status,v_deadline;

  if v_status='declined' then
    raise exception 'This rider has already declined the current call-up.';
  end if;

  return jsonb_build_object(
    'callup_id',v_callup_id,
    'rider_id',v_rider.id,
    'rider_name',v_rider.display_name,
    'status',v_status,
    'response_deadline',v_deadline,
    'cycle_key',v_cycle
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.respond_to_national_team_callup_v1(p_callup_id uuid, p_accept boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_callup public.national_team_callups%rowtype;
  v_today date:=public.get_current_game_date_date();
  v_status text;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_callup
  from public.national_team_callups
  where id=p_callup_id
  for update;

  if v_callup.id is null then
    raise exception 'National-team call-up not found.';
  end if;

  if v_callup.club_owner_user_id_snapshot<>v_uid then
    raise exception 'You do not control the club responsible for this call-up.';
  end if;

  if v_callup.status<>'pending' then
    raise exception 'This call-up is no longer awaiting a club decision.';
  end if;

  if v_callup.response_deadline is not null
     and v_today>v_callup.response_deadline then
    update public.national_team_callups
    set status='expired',
        responded_on_game_date=v_today,
        response_note='No club response before deadline.',
        updated_at=now()
    where id=v_callup.id;

    raise exception 'The response deadline has passed. The call-up has expired.';
  end if;

  v_status:=case when p_accept then 'accepted' else 'declined' end;

  update public.national_team_callups
  set status=v_status,
      responded_on_game_date=v_today,
      responded_by_user_id=v_uid,
      response_note=nullif(btrim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=v_callup.id;

  return jsonb_build_object(
    'callup_id',v_callup.id,
    'rider_id',v_callup.rider_id,
    'status',v_status,
    'responded_on',v_today
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.expire_national_team_callups_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_count integer;
begin
  update public.national_team_callups
  set status='expired',
      responded_on_game_date=v_today,
      response_note='No club response before deadline.',
      updated_at=now()
  where status='pending'
    and response_deadline is not null
    and response_deadline<v_today;

  get diagnostics v_count=row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_national_team_squad_v1(p_cycle_key text, p_rider_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_today date:=public.get_current_game_date_date();
  v_cycle text:=btrim(coalesce(p_cycle_key,'season_main'));
  v_required integer;
  v_distinct_count integer;
  v_valid_count integer;
  v_squad_id uuid;
  v_group_id uuid;
  v_duty_start date;
  v_duty_end date;
  v_duty_event_count integer:=0;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can confirm the national squad.';
  end if;

  select national_squad_size::integer
  into v_required
  from public.national_association_config
  where id=true;

  select count(distinct x)::integer
  into v_distinct_count
  from unnest(coalesce(p_rider_ids,array[]::uuid[])) x;

  if v_distinct_count<>coalesce(v_required,10) then
    raise exception 'The final national squad must contain exactly % distinct riders.',coalesce(v_required,10);
  end if;

  select count(*)::integer
  into v_valid_count
  from public.national_team_callups c
  where c.association_id=v_ctx.association_id
    and c.season_number=v_ctx.season_number
    and c.cycle_key=v_cycle
    and c.rider_id=any(p_rider_ids)
    and c.status in ('accepted','auto_accepted');

  if v_valid_count<>coalesce(v_required,10) then
    raise exception 'Every selected rider must have an accepted national-team call-up.';
  end if;

  insert into public.national_team_squads(
    association_id,season_number,cycle_key,status,squad_size,
    confirmed_by_user_id,confirmed_on_game_date
  )
  values(
    v_ctx.association_id,v_ctx.season_number,v_cycle,'confirmed',
    coalesce(v_required,10),v_uid,v_today
  )
  on conflict(association_id,season_number,cycle_key)
  do update
  set status='confirmed',
      squad_size=excluded.squad_size,
      confirmed_by_user_id=excluded.confirmed_by_user_id,
      confirmed_on_game_date=excluded.confirmed_on_game_date,
      updated_at=now()
  returning id into v_squad_id;

  delete from public.national_team_squad_members
  where squad_id=v_squad_id;

  insert into public.national_team_squad_members(
    squad_id,callup_id,rider_id,rider_name_snapshot,
    club_id_snapshot,club_name_snapshot,squad_role
  )
  select
    v_squad_id,c.id,c.rider_id,c.rider_name_snapshot,
    c.club_id_snapshot,c.club_name_snapshot,'squad'
  from public.national_team_callups c
  where c.association_id=v_ctx.association_id
    and c.season_number=v_ctx.season_number
    and c.cycle_key=v_cycle
    and c.rider_id=any(p_rider_ids)
    and c.status in ('accepted','auto_accepted');

  update public.national_team_callups c
  set status='not_selected',
      updated_at=now()
  where c.association_id=v_ctx.association_id
    and c.season_number=v_ctx.season_number
    and c.cycle_key=v_cycle
    and c.status in ('accepted','auto_accepted','pending')
    and not (c.rider_id=any(p_rider_ids));

  -- If this is a scheduled World Nations cycle, the squad row is now complete,
  -- so it is safe to synchronize the three-day National Duty window.
  if v_cycle like 'nations:%' then
    begin
      v_group_id:=substring(v_cycle from 9)::uuid;
    exception when others then
      v_group_id:=null;
    end;

    if v_group_id is not null then
      select min(event_date),max(event_date),count(*) filter(where event_date is not null)
      into v_duty_start,v_duty_end,v_duty_event_count
      from public.nations_group_events
      where group_id=v_group_id;

      if v_duty_event_count=3
         and v_duty_start is not null
         and v_duty_end is not null then
        perform public.set_national_team_duty_window_v1(
          v_squad_id,v_duty_start,v_duty_end
        );
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'squad_id',v_squad_id,
    'association_id',v_ctx.association_id,
    'season_number',v_ctx.season_number,
    'cycle_key',v_cycle,
    'status','confirmed',
    'squad_size',coalesce(v_required,10)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_national_team_callups_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_today date:=public.get_current_game_date_date();
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'callup_id',c.id,
        'association_id',c.association_id,
        'association_name',a.name,
        'country_code',a.country_code,
        'season_number',c.season_number,
        'cycle_key',c.cycle_key,
        'rider_id',c.rider_id,
        'rider_name',c.rider_name_snapshot,
        'club_id',c.club_id_snapshot,
        'club_name',c.club_name_snapshot,
        'status',
          case
            when c.status='pending'
             and c.response_deadline is not null
             and c.response_deadline<v_today
              then 'expired'
            else c.status
          end,
        'sent_on',c.sent_on_game_date,
        'response_deadline',c.response_deadline,
        'responded_on',c.responded_on_game_date,
        'can_respond',
          c.status='pending'
          and (c.response_deadline is null or v_today<=c.response_deadline)
      )
      order by c.sent_on_game_date desc,c.created_at desc
    )
    from public.national_team_callups c
    join public.national_associations a on a.id=c.association_id
    where c.club_owner_user_id_snapshot=v_uid
  ),'[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_national_coach_callups_v1(p_cycle_key text DEFAULT 'season_main'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_cycle text:=btrim(coalesce(p_cycle_key,'season_main'));
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    return jsonb_build_object('allowed',false,'callups','[]'::jsonb,'squad',null);
  end if;

  return jsonb_build_object(
    'allowed',true,
    'association_id',v_ctx.association_id,
    'season_number',v_ctx.season_number,
    'cycle_key',v_cycle,
    'callups',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'callup_id',c.id,
          'rider_id',c.rider_id,
          'rider_name',c.rider_name_snapshot,
          'club_id',c.club_id_snapshot,
          'club_name',c.club_name_snapshot,
          'status',c.status,
          'sent_on',c.sent_on_game_date,
          'response_deadline',c.response_deadline,
          'responded_on',c.responded_on_game_date
        )
        order by
          case c.status
            when 'accepted' then 0
            when 'auto_accepted' then 0
            when 'pending' then 1
            else 2
          end,
          c.rider_name_snapshot
      )
      from public.national_team_callups c
      where c.association_id=v_ctx.association_id
        and c.season_number=v_ctx.season_number
        and c.cycle_key=v_cycle
    ),'[]'::jsonb),
    'squad',(
      select jsonb_build_object(
        'squad_id',s.id,
        'status',s.status,
        'squad_size',s.squad_size,
        'confirmed_on',s.confirmed_on_game_date,
        'duty_start_date',s.duty_start_date,
        'duty_end_date',s.duty_end_date,
        'members',coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'rider_id',m.rider_id,
              'rider_name',m.rider_name_snapshot,
              'club_id',m.club_id_snapshot,
              'club_name',m.club_name_snapshot,
              'squad_role',m.squad_role
            )
            order by m.rider_name_snapshot
          )
          from public.national_team_squad_members m
          where m.squad_id=s.id
        ),'[]'::jsonb)
      )
      from public.national_team_squads s
      where s.association_id=v_ctx.association_id
        and s.season_number=v_ctx.season_number
        and s.cycle_key=v_cycle
      limit 1
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_national_team_lineup_v1(p_squad_id uuid, p_race_day integer, p_rider_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_squad public.national_team_squads%rowtype;
  v_required integer;
  v_max_changes integer;
  v_distinct_count integer;
  v_valid_count integer;
  v_previous_lineup_id uuid;
  v_previous_count integer;
  v_shared_count integer;
  v_changes integer:=0;
  v_lineup_id uuid;
  v_race_type text;
  v_today date:=public.get_current_game_date_date();
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if p_race_day not between 1 and 3 then
    raise exception 'National-team race day must be between 1 and 3.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can submit national-team lineups.';
  end if;

  select * into v_squad
  from public.national_team_squads
  where id=p_squad_id
  for update;

  if v_squad.id is null
     or v_squad.association_id<>v_ctx.association_id
     or v_squad.season_number<>v_ctx.season_number then
    raise exception 'National squad not found for your Association.';
  end if;

  if v_squad.status not in ('confirmed','on_duty') then
    raise exception 'The national squad must be confirmed before race lineups can be submitted.';
  end if;

  select national_lineup_size::integer,max_lineup_changes::integer
  into v_required,v_max_changes
  from public.national_association_config
  where id=true;

  select count(distinct x)::integer
  into v_distinct_count
  from unnest(coalesce(p_rider_ids,array[]::uuid[])) x;

  if v_distinct_count<>coalesce(v_required,7) then
    raise exception 'A national-team race lineup must contain exactly % distinct riders.',coalesce(v_required,7);
  end if;

  select count(*)::integer
  into v_valid_count
  from public.national_team_squad_members m
  where m.squad_id=v_squad.id
    and m.rider_id=any(p_rider_ids);

  if v_valid_count<>coalesce(v_required,7) then
    raise exception 'Every lineup rider must belong to the confirmed 10-rider squad.';
  end if;

  if p_race_day>1 then
    select l.id
    into v_previous_lineup_id
    from public.national_team_lineups l
    where l.squad_id=v_squad.id
      and l.race_day=p_race_day-1
      and l.status in ('confirmed','locked','completed')
    limit 1;

    if v_previous_lineup_id is null then
      raise exception 'The previous race-day lineup must be confirmed first.';
    end if;

    select count(*)::integer
    into v_previous_count
    from public.national_team_lineup_members m
    where m.lineup_id=v_previous_lineup_id;

    select count(*)::integer
    into v_shared_count
    from public.national_team_lineup_members m
    where m.lineup_id=v_previous_lineup_id
      and m.rider_id=any(p_rider_ids);

    v_changes:=coalesce(v_previous_count,coalesce(v_required,7))-coalesce(v_shared_count,0);

    if v_changes>coalesce(v_max_changes,3) then
      raise exception 'A maximum of % lineup changes is allowed between consecutive race days.',coalesce(v_max_changes,3);
    end if;
  end if;

  v_race_type:=private.national_team_race_type_for_day_v1(p_race_day);

  insert into public.national_team_lineups(
    squad_id,race_day,race_type,status,
    submitted_by_user_id,submitted_on_game_date
  )
  values(
    v_squad.id,p_race_day,v_race_type,'confirmed',v_uid,v_today
  )
  on conflict(squad_id,race_day)
  do update
  set race_type=excluded.race_type,
      status='confirmed',
      submitted_by_user_id=excluded.submitted_by_user_id,
      submitted_on_game_date=excluded.submitted_on_game_date,
      updated_at=now()
  where public.national_team_lineups.status in ('draft','confirmed')
  returning id into v_lineup_id;

  if v_lineup_id is null then
    raise exception 'This race-day lineup is locked and can no longer be changed.';
  end if;

  delete from public.national_team_lineup_members
  where lineup_id=v_lineup_id;

  insert into public.national_team_lineup_members(
    lineup_id,squad_member_id,rider_id
  )
  select
    v_lineup_id,m.id,m.rider_id
  from public.national_team_squad_members m
  where m.squad_id=v_squad.id
    and m.rider_id=any(p_rider_ids);

  return jsonb_build_object(
    'lineup_id',v_lineup_id,
    'squad_id',v_squad.id,
    'race_day',p_race_day,
    'race_type',v_race_type,
    'lineup_size',coalesce(v_required,7),
    'changes_from_previous_day',v_changes,
    'status','confirmed'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_national_team_lineups_v1(p_squad_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_squad public.national_team_squads%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    return jsonb_build_object('allowed',false,'lineups','[]'::jsonb);
  end if;

  select * into v_squad
  from public.national_team_squads
  where id=p_squad_id
    and association_id=v_ctx.association_id
    and season_number=v_ctx.season_number;

  if v_squad.id is null then
    raise exception 'National squad not found for your Association.';
  end if;

  return jsonb_build_object(
    'allowed',true,
    'squad_id',v_squad.id,
    'lineups',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'lineup_id',l.id,
          'race_day',l.race_day,
          'race_type',l.race_type,
          'status',l.status,
          'submitted_on',l.submitted_on_game_date,
          'riders',coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'rider_id',m.rider_id,
                'rider_name',sm.rider_name_snapshot,
                'club_name',sm.club_name_snapshot
              )
              order by sm.rider_name_snapshot
            )
            from public.national_team_lineup_members m
            join public.national_team_squad_members sm
              on sm.id=m.squad_member_id
            where m.lineup_id=l.id
          ),'[]'::jsonb)
        )
        order by l.race_day
      )
      from public.national_team_lineups l
      where l.squad_id=v_squad.id
        and l.status<>'cancelled'
    ),'[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_national_team_duty_window_v1(p_squad_id uuid, p_start_date date, p_end_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_squad public.national_team_squads%rowtype;
  v_duty_id uuid;
  v_today date:=public.get_current_game_date_date();
  v_status text;
begin
  if p_start_date is null or p_end_date is null or p_start_date>p_end_date then
    raise exception 'Invalid National Duty window.';
  end if;

  select * into v_squad
  from public.national_team_squads
  where id=p_squad_id
  for update;

  if v_squad.id is null then
    raise exception 'National squad not found.';
  end if;

  if v_squad.status not in ('confirmed','on_duty') then
    raise exception 'Only a confirmed national squad can receive a National Duty window.';
  end if;

  if (
    select count(*)
    from public.national_team_squad_members m
    where m.squad_id=v_squad.id
  )<>v_squad.squad_size then
    raise exception 'National squad is incomplete.';
  end if;

  v_status:=case
    when v_today>p_end_date then 'completed'
    when v_today>=p_start_date then 'active'
    else 'planned'
  end;

  insert into public.national_team_duties(
    squad_id,association_id,season_number,cycle_key,
    start_date,end_date,status,label
  )
  values(
    v_squad.id,v_squad.association_id,v_squad.season_number,
    v_squad.cycle_key,p_start_date,p_end_date,v_status,'National Duty'
  )
  on conflict(squad_id)
  do update
  set start_date=excluded.start_date,
      end_date=excluded.end_date,
      status=excluded.status,
      updated_at=now()
  returning id into v_duty_id;

  update public.national_team_squads
  set duty_start_date=p_start_date,
      duty_end_date=p_end_date,
      status=case
        when v_status='active' then 'on_duty'
        when v_status='completed' then 'completed'
        else 'confirmed'
      end,
      updated_at=now()
  where id=v_squad.id;

  return v_duty_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_national_team_duty_status_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_started integer:=0;
  v_completed integer:=0;
begin
  update public.national_team_duties
  set status='active',updated_at=now()
  where status='planned'
    and start_date<=v_today
    and end_date>=v_today;
  get diagnostics v_started=row_count;

  update public.national_team_squads s
  set status='on_duty',updated_at=now()
  where exists(
    select 1
    from public.national_team_duties d
    where d.squad_id=s.id
      and d.status='active'
  )
    and s.status='confirmed';

  update public.national_team_duties
  set status='completed',updated_at=now()
  where status in ('planned','active')
    and end_date<v_today;
  get diagnostics v_completed=row_count;

  update public.national_team_squads s
  set status='completed',updated_at=now()
  where exists(
    select 1
    from public.national_team_duties d
    where d.squad_id=s.id
      and d.status='completed'
  )
    and s.status in ('confirmed','on_duty');

  return jsonb_build_object(
    'game_date',v_today,
    'duties_started',v_started,
    'duties_completed',v_completed
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_national_association_statuses_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_month integer;
  v_day integer;
  v_minimum integer;
  v_activated integer:=0;
  v_inactivated integer:=0;
begin
  select month_number::integer,day_number::integer
  into v_month,v_day
  from public.game_state
  where id=true;

  select minimum_active_members::integer
  into v_minimum
  from public.national_association_config
  where id=true;

  -- Forming/inactive Associations activate as soon as the minimum eligible
  -- manager count is restored. There is no Coin renewal or treasury payment.
  update public.national_associations a
  set status='active',
      activated_on_game_date=coalesce(a.activated_on_game_date,v_today),
      inactive_on_game_date=null,
      last_status_change_on_game_date=v_today,
      updated_at=now()
  where a.status in ('forming','inactive')
    and private.national_association_active_member_count_v1(a.id)>=coalesce(v_minimum,5);

  get diagnostics v_activated=row_count;

  -- Existing active Associations are not dissolved mid-season if a manager
  -- leaves. Eligibility is revalidated at the annual January checkpoint.
  if v_month=1 and v_day=1 then
    update public.national_associations a
    set status='inactive',
        inactive_on_game_date=v_today,
        last_status_change_on_game_date=v_today,
        updated_at=now()
    where a.status='active'
      and private.national_association_active_member_count_v1(a.id)<coalesce(v_minimum,5);

    get diagnostics v_inactivated=row_count;

    update public.national_coach_terms t
    set status='ineligible',
        term_end_game_date=greatest(t.term_start_game_date,v_today),
        updated_at=now()
    where t.status='active'
      and exists(
        select 1
        from public.national_associations a
        where a.id=t.association_id
          and a.status='inactive'
      );
  end if;

  return jsonb_build_object(
    'game_date',v_today,
    'activated',v_activated,
    'inactivated_at_annual_checkpoint',v_inactivated,
    'minimum_members',coalesce(v_minimum,5)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.nations_qualification_plan_v1(p_active_association_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_current integer:=greatest(0,coalesce(p_active_association_count,0));
  v_initial integer:=v_current;
  v_finalists integer:=least(16,greatest(0,v_current));
  v_round integer:=0;
  v_next integer;
  v_groups integer;
  v_rounds jsonb:='[]'::jsonb;
begin
  if v_current=0 then
    return jsonb_build_object(
      'active_associations',0,
      'finalist_target',0,
      'rounds','[]'::jsonb
    );
  end if;

  -- For large fields, repeatedly reduce toward 32. Each preliminary round
  -- approximately halves the field without dropping below the 32-nation target.
  while v_current>32 loop
    v_round:=v_round+1;
    v_next:=greatest(32,ceil(v_current::numeric/2.0)::integer);
    v_groups:=greatest(1,ceil(v_current::numeric/8.0)::integer);

    v_rounds:=v_rounds||jsonb_build_array(jsonb_build_object(
      'round_index',v_round,
      'round_type','preliminary',
      'round_label','Qualification Round '||v_round,
      'entrants_target',v_current,
      'advance_target',v_next,
      'group_count',v_groups,
      'group_size_min',6,
      'group_size_max',10
    ));

    v_current:=v_next;
  end loop;

  -- Every country plays qualification. When <=16 Associations are active,
  -- all can advance from this qualifier; nobody receives a direct final berth.
  v_round:=v_round+1;
  v_groups:=case
    when v_current=32 then 4
    else greatest(1,ceil(v_current::numeric/8.0)::integer)
  end;

  v_rounds:=v_rounds||jsonb_build_array(jsonb_build_object(
    'round_index',v_round,
    'round_type','final_qualification',
    'round_label','Final Qualification',
    'entrants_target',v_current,
    'advance_target',v_finalists,
    'group_count',v_groups,
    'group_size_min',6,
    'group_size_max',10
  ));

  v_round:=v_round+1;
  v_rounds:=v_rounds||jsonb_build_array(jsonb_build_object(
    'round_index',v_round,
    'round_type','world_final',
    'round_label','World Nations Final',
    'entrants_target',v_finalists,
    'advance_target',1,
    'group_count',1,
    'group_size_min',v_finalists,
    'group_size_max',v_finalists
  ));

  return jsonb_build_object(
    'active_associations',v_initial,
    'finalist_target',v_finalists,
    'rounds',v_rounds
  );
end;
$function$
;

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

  -- Seed score is deliberately neutral in v1 until historical Nations results
  -- exist. Future seasons can populate this from prior Nations performance.
  insert into public.nations_competition_entries(
    edition_id,association_id,country_code,seed_score,status
  )
  select
    v_edition_id,a.id,a.country_code,0,'entered'
  from public.national_associations a
  where a.status='active'
    and private.national_association_active_member_count_v1(a.id)>=(
      select minimum_active_members
      from public.national_association_config
      where id=true
    )
  order by a.country_code;

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
;

CREATE OR REPLACE FUNCTION public.submit_nations_host_application_v1(p_edition_id uuid, p_statement text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_edition public.nations_competition_editions%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can submit a host application.';
  end if;

  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id;

  if v_edition.id is null or v_edition.season_number<>v_ctx.season_number then
    raise exception 'World Nations edition not found for the current season.';
  end if;

  if v_edition.host_association_id is not null then
    raise exception 'The World Nations Final host has already been selected.';
  end if;

  if v_edition.status not in ('planned','qualification') then
    raise exception 'Host applications are closed for this edition.';
  end if;

  insert into public.nations_host_applications(
    edition_id,association_id,submitted_by_user_id,statement,status
  )
  values(
    v_edition.id,v_ctx.association_id,v_uid,
    nullif(btrim(coalesce(p_statement,'')),''),
    'submitted'
  )
  on conflict(edition_id,association_id) do update
  set submitted_by_user_id=excluded.submitted_by_user_id,
      statement=excluded.statement,
      status='submitted',
      submitted_on_game_date=public.get_current_game_date_date(),
      updated_at=now()
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.draw_nations_round_v1(p_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_round public.nations_competition_rounds%rowtype;
  v_edition public.nations_competition_editions%rowtype;
  v_previous_round_id uuid;
  v_available integer;
  v_inserted integer:=0;
begin
  select * into v_round
  from public.nations_competition_rounds
  where id=p_round_id
  for update;

  if v_round.id is null then
    raise exception 'Nations round not found.';
  end if;

  if v_round.status not in ('planned','drawn') then
    raise exception 'This Nations round cannot be drawn in its current state.';
  end if;

  select * into v_edition
  from public.nations_competition_editions
  where id=v_round.edition_id;

  delete from public.nations_group_entries nge
  using public.nations_competition_groups g
  where g.round_id=v_round.id
    and nge.group_id=g.id;

  if v_round.round_index=1 then
    with source as (
      select
        e.id as competition_entry_id,
        row_number() over (
          order by
            e.seed_score desc,
            md5(v_edition.season_number::text||':'||e.country_code)
        )::integer as seed_position
      from public.nations_competition_entries e
      where e.edition_id=v_round.edition_id
        and e.status in ('entered','advanced','finalist')
    ),
    assigned as (
      select
        s.*,
        (
          case
            when ((s.seed_position-1)/v_round.group_count)%2=0
              then ((s.seed_position-1)%v_round.group_count)+1
            else v_round.group_count-((s.seed_position-1)%v_round.group_count)
          end
        )::integer as group_number
      from source s
    )
    insert into public.nations_group_entries(
      group_id,competition_entry_id,seed_position,status
    )
    select
      g.id,a.competition_entry_id,a.seed_position,'entered'
    from assigned a
    join public.nations_competition_groups g
      on g.round_id=v_round.id
     and g.group_number=a.group_number;

    get diagnostics v_inserted=row_count;
  else
    select id into v_previous_round_id
    from public.nations_competition_rounds
    where edition_id=v_round.edition_id
      and round_index=v_round.round_index-1;

    if v_previous_round_id is null then
      raise exception 'Previous Nations round is missing.';
    end if;

    with source as (
      select
        nge.competition_entry_id,
        row_number() over (
          order by
            e.seed_score desc,
            md5(v_edition.season_number::text||':'||e.country_code)
        )::integer as seed_position
      from public.nations_group_entries nge
      join public.nations_competition_groups g on g.id=nge.group_id
      join public.nations_competition_entries e
        on e.id=nge.competition_entry_id
      where g.round_id=v_previous_round_id
        and nge.status in ('advanced','winner')
    ),
    assigned as (
      select
        s.*,
        (
          case
            when ((s.seed_position-1)/v_round.group_count)%2=0
              then ((s.seed_position-1)%v_round.group_count)+1
            else v_round.group_count-((s.seed_position-1)%v_round.group_count)
          end
        )::integer as group_number
      from source s
    )
    insert into public.nations_group_entries(
      group_id,competition_entry_id,seed_position,status
    )
    select
      g.id,a.competition_entry_id,a.seed_position,'entered'
    from assigned a
    join public.nations_competition_groups g
      on g.round_id=v_round.id
     and g.group_number=a.group_number;

    get diagnostics v_inserted=row_count;
  end if;

  select count(*)::integer
  into v_available
  from public.nations_group_entries nge
  join public.nations_competition_groups g on g.id=nge.group_id
  where g.round_id=v_round.id;

  if v_available=0 then
    raise exception 'No eligible nations were available for this round draw.';
  end if;

  update public.nations_competition_groups
  set status='drawn',updated_at=now()
  where round_id=v_round.id;

  update public.nations_competition_rounds
  set status='drawn',updated_at=now()
  where id=v_round.id;

  return jsonb_build_object(
    'round_id',v_round.id,
    'round_index',v_round.round_index,
    'round_type',v_round.round_type,
    'drawn_entries',v_inserted,
    'group_count',v_round.group_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_nations_group_score_v1(p_group_entry_id uuid, p_ttt_rank integer, p_flat_finish_positions integer[], p_mountain_finish_positions integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_entry public.nations_group_entries%rowtype;
  v_ttt integer;
  v_flat integer;
  v_mountain integer;
  v_wins integer;
  v_podiums integer;
  v_best_day3 integer;
begin
  select * into v_entry
  from public.nations_group_entries
  where id=p_group_entry_id
  for update;

  if v_entry.id is null then
    raise exception 'Nations group entry not found.';
  end if;

  if p_ttt_rank is null or p_ttt_rank<=0 then
    raise exception 'A valid TTT finishing rank is required.';
  end if;

  v_ttt:=public.nations_ttt_points_v1(p_ttt_rank);
  v_flat:=public.calculate_nation_road_race_points_v1(p_flat_finish_positions);
  v_mountain:=public.calculate_nation_road_race_points_v1(p_mountain_finish_positions);

  v_wins:=
    case when p_ttt_rank=1 then 1 else 0 end
    + case when 1=any(coalesce(p_flat_finish_positions,array[]::integer[])) then 1 else 0 end
    + case when 1=any(coalesce(p_mountain_finish_positions,array[]::integer[])) then 1 else 0 end;

  select
    (case when p_ttt_rank<=3 then 1 else 0 end)
    + count(*) filter (
        where pos<=3
      )::integer
  into v_podiums
  from (
    select unnest(coalesce(p_flat_finish_positions,array[]::integer[])) as pos
    union all
    select unnest(coalesce(p_mountain_finish_positions,array[]::integer[])) as pos
  ) x;

  select min(pos)
  into v_best_day3
  from unnest(coalesce(p_mountain_finish_positions,array[]::integer[])) pos
  where pos>0;

  update public.nations_group_entries
  set ttt_points=v_ttt,
      flat_points=v_flat,
      mountain_points=v_mountain,
      total_points=v_ttt+v_flat+v_mountain,
      race_wins=v_wins,
      podium_finishes=coalesce(v_podiums,case when p_ttt_rank<=3 then 1 else 0 end),
      ttt_rank=p_ttt_rank,
      best_day3_rider_rank=v_best_day3,
      updated_at=now()
  where id=v_entry.id;

  return jsonb_build_object(
    'group_entry_id',v_entry.id,
    'ttt_points',v_ttt,
    'flat_points',v_flat,
    'mountain_points',v_mountain,
    'total_points',v_ttt+v_flat+v_mountain,
    'race_wins',v_wins,
    'podium_finishes',coalesce(v_podiums,0),
    'best_day3_rider_rank',v_best_day3
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finalize_nations_group_v1(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group public.nations_competition_groups%rowtype;
  v_round public.nations_competition_rounds%rowtype;
  v_unresolved integer:=0;
  v_count integer:=0;
begin
  select * into v_group
  from public.nations_competition_groups
  where id=p_group_id
  for update;

  if v_group.id is null then
    raise exception 'Nations group not found.';
  end if;

  select * into v_round
  from public.nations_competition_rounds
  where id=v_group.round_id;

  select count(*)::integer
  into v_count
  from public.nations_group_entries
  where group_id=v_group.id
    and status<>'withdrawn';

  if v_count=0 then
    raise exception 'Nations group has no entries to finalize.';
  end if;

  with enriched as (
    select
      nge.id,
      nge.total_points,
      nge.race_wins,
      nge.podium_finishes,
      coalesce(nge.ttt_rank,999999) as ttt_rank_key,
      private.nations_day3_rank_vector_v1(
        nge.group_id,
        ce.association_id
      ) as day3_vector
    from public.nations_group_entries nge
    join public.nations_competition_entries ce
      on ce.id=nge.competition_entry_id
    where nge.group_id=v_group.id
      and nge.status<>'withdrawn'
  ),
  enriched_with_sum as (
    select
      e.*,
      (
        select coalesce(sum(v)::bigint,6999993)
        from unnest(e.day3_vector) v
      ) as day3_sum
    from enriched e
  ),
  score_blocks as (
    select
      e.total_points,
      e.race_wins,
      e.podium_finishes,
      e.ttt_rank_key,
      e.day3_vector,
      e.day3_sum,
      count(*)::integer as tie_size
    from enriched_with_sum e
    group by
      e.total_points,
      e.race_wins,
      e.podium_finishes,
      e.ttt_rank_key,
      e.day3_vector,
      e.day3_sum
  ),
  ordered_blocks as (
    select
      b.*,
      coalesce(
        sum(b.tie_size) over (
          order by
            b.total_points desc,
            b.race_wins desc,
            b.podium_finishes desc,
            b.ttt_rank_key asc,
            b.day3_vector asc,
            b.day3_sum asc
          rows between unbounded preceding and 1 preceding
        ),
        0
      )::integer as rows_before
    from score_blocks b
  )
  select count(*)::integer
  into v_unresolved
  from ordered_blocks b
  where b.rows_before<v_group.planned_advance_count
    and b.rows_before+b.tie_size>v_group.planned_advance_count;

  if v_unresolved>0 then
    return jsonb_build_object(
      'status','unresolved_tie_at_cutoff',
      'group_id',v_group.id,
      'advance_count',v_group.planned_advance_count,
      'tie_breaks_applied',jsonb_build_array(
        'total_points',
        'race_wins',
        'podium_finishes',
        'ttt_rank',
        'day3_rider_1',
        'day3_rider_2',
        'day3_rider_3',
        'day3_rider_4',
        'day3_rider_5',
        'day3_rider_6',
        'day3_rider_7',
        'day3_combined_rank_sum'
      )
    );
  end if;

  with enriched as (
    select
      nge.id,
      nge.total_points,
      nge.race_wins,
      nge.podium_finishes,
      coalesce(nge.ttt_rank,999999) as ttt_rank_key,
      private.nations_day3_rank_vector_v1(
        nge.group_id,
        ce.association_id
      ) as day3_vector
    from public.nations_group_entries nge
    join public.nations_competition_entries ce
      on ce.id=nge.competition_entry_id
    where nge.group_id=v_group.id
      and nge.status<>'withdrawn'
  ),
  enriched_with_sum as (
    select
      e.*,
      (
        select coalesce(sum(v)::bigint,6999993)
        from unnest(e.day3_vector) v
      ) as day3_sum
    from enriched e
  ),
  score_blocks as (
    select
      e.total_points,
      e.race_wins,
      e.podium_finishes,
      e.ttt_rank_key,
      e.day3_vector,
      e.day3_sum,
      count(*)::integer as tie_size
    from enriched_with_sum e
    group by
      e.total_points,
      e.race_wins,
      e.podium_finishes,
      e.ttt_rank_key,
      e.day3_vector,
      e.day3_sum
  ),
  ordered_blocks as (
    select
      b.*,
      coalesce(
        sum(b.tie_size) over (
          order by
            b.total_points desc,
            b.race_wins desc,
            b.podium_finishes desc,
            b.ttt_rank_key asc,
            b.day3_vector asc,
            b.day3_sum asc
          rows between unbounded preceding and 1 preceding
        ),
        0
      )::integer as rows_before
    from score_blocks b
  ),
  scored as (
    select
      e.id,
      ob.rows_before+1 as competition_rank,
      ob.rows_before,
      ob.tie_size
    from enriched_with_sum e
    join ordered_blocks ob
      on ob.total_points is not distinct from e.total_points
     and ob.race_wins is not distinct from e.race_wins
     and ob.podium_finishes is not distinct from e.podium_finishes
     and ob.ttt_rank_key=e.ttt_rank_key
     and ob.day3_vector=e.day3_vector
     and ob.day3_sum=e.day3_sum
  )
  update public.nations_group_entries nge
  set final_group_rank=s.competition_rank,
      status=case
        when s.rows_before+s.tie_size<=v_group.planned_advance_count
          then case
            when v_round.round_type='world_final' then 'winner'
            else 'advanced'
          end
        else 'eliminated'
      end,
      updated_at=now()
  from scored s
  where nge.id=s.id;

  update public.nations_competition_groups
  set status='completed',updated_at=now()
  where id=v_group.id;

  return jsonb_build_object(
    'status','completed',
    'group_id',v_group.id,
    'advance_count',v_group.planned_advance_count,
    'tie_breaks',jsonb_build_array(
      'total_points',
      'race_wins',
      'podium_finishes',
      'ttt_rank',
      'day3_rider_1',
      'day3_rider_2',
      'day3_rider_3',
      'day3_rider_4',
      'day3_rider_5',
      'day3_rider_6',
      'day3_rider_7',
      'day3_combined_rank_sum'
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finalize_nations_round_v1(p_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_round public.nations_competition_rounds%rowtype;
  v_edition public.nations_competition_editions%rowtype;
  v_incomplete integer;
  v_advanced integer;
  v_next_round_id uuid;
  v_winner_entry_id uuid;
  v_winner_association_id uuid;
  v_winner_country_code text;
  v_winner_count integer;
begin
  select * into v_round
  from public.nations_competition_rounds
  where id=p_round_id
  for update;

  if v_round.id is null then
    raise exception 'Nations round not found.';
  end if;

  select * into v_edition
  from public.nations_competition_editions
  where id=v_round.edition_id
  for update;

  select count(*)::integer
  into v_incomplete
  from public.nations_competition_groups
  where round_id=v_round.id
    and status<>'completed';

  if v_incomplete>0 then
    return jsonb_build_object(
      'status','groups_incomplete',
      'round_id',v_round.id,
      'incomplete_groups',v_incomplete
    );
  end if;

  select count(*)::integer
  into v_advanced
  from public.nations_group_entries nge
  join public.nations_competition_groups g on g.id=nge.group_id
  where g.round_id=v_round.id
    and nge.status in ('advanced','winner');

  update public.nations_competition_entries e
  set status=case
      when exists(
        select 1
        from public.nations_group_entries nge
        join public.nations_competition_groups g on g.id=nge.group_id
        where g.round_id=v_round.id
          and nge.competition_entry_id=e.id
          and nge.status in ('advanced','winner')
      )
      then case
        when v_round.round_type='world_final' then 'champion'
        when v_round.round_type='final_qualification' then 'finalist'
        else 'advanced'
      end
      else case
        when e.status='withdrawn' then e.status
        else 'eliminated'
      end
    end,
    updated_at=now()
  where e.edition_id=v_round.edition_id
    and exists(
      select 1
      from public.nations_group_entries nge
      join public.nations_competition_groups g on g.id=nge.group_id
      where g.round_id=v_round.id
        and nge.competition_entry_id=e.id
    );

  update public.nations_competition_rounds
  set status='completed',updated_at=now()
  where id=v_round.id;

  select id into v_next_round_id
  from public.nations_competition_rounds
  where edition_id=v_round.edition_id
    and round_index=v_round.round_index+1;

  if v_next_round_id is not null then
    return jsonb_build_object(
      'status','completed',
      'round_id',v_round.id,
      'advanced',v_advanced,
      'next_round_id',v_next_round_id
    );
  end if;

  if v_round.round_type<>'world_final' then
    return jsonb_build_object(
      'status','completed',
      'round_id',v_round.id,
      'advanced',v_advanced,
      'next_round_id',null
    );
  end if;

  select count(*)::integer
  into v_winner_count
  from public.nations_group_entries nge
  join public.nations_competition_groups g on g.id=nge.group_id
  where g.round_id=v_round.id
    and nge.status='winner';

  if v_winner_count<>1 then
    raise exception 'World Nations Final must resolve to exactly one champion before the edition can be completed.';
  end if;

  select
    ce.id,
    ce.association_id,
    ce.country_code
  into
    v_winner_entry_id,
    v_winner_association_id,
    v_winner_country_code
  from public.nations_group_entries nge
  join public.nations_competition_groups g on g.id=nge.group_id
  join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
  where g.round_id=v_round.id
    and nge.status='winner'
  limit 1;

  update public.nations_competition_editions
  set status='completed',
      champion_association_id=v_winner_association_id,
      champion_country_code=v_winner_country_code,
      completed_on_game_date=public.get_current_game_date_date(),
      updated_at=now()
  where id=v_round.edition_id;

  insert into public.nations_competition_history(
    edition_id,season_number,association_id,country_code,
    final_rank,total_points,was_host
  )
  select
    v_round.edition_id,
    v_edition.season_number,
    ce.association_id,
    ce.country_code,
    nge.final_group_rank,
    nge.total_points,
    ce.association_id=v_edition.host_association_id
  from public.nations_group_entries nge
  join public.nations_competition_groups g on g.id=nge.group_id
  join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
  where g.round_id=v_round.id
    and nge.final_group_rank is not null
  on conflict(edition_id,country_code) do update
  set final_rank=excluded.final_rank,
      total_points=excluded.total_points,
      was_host=excluded.was_host;

  return jsonb_build_object(
    'status','edition_completed',
    'round_id',v_round.id,
    'advanced',v_advanced,
    'next_round_id',null,
    'champion_entry_id',v_winner_entry_id,
    'champion_association_id',v_winner_association_id,
    'champion_country_code',v_winner_country_code
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.select_nations_host_v1(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_edition public.nations_competition_editions%rowtype;
  v_selected uuid;
  v_country text;
  v_candidates integer;
begin
  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id
  for update;

  if v_edition.id is null then
    raise exception 'World Nations edition not found.';
  end if;

  update public.nations_host_applications h
  set status=case
      when exists(
        select 1
        from public.national_associations a
        where a.id=h.association_id
          and a.status='active'
      )
      then 'eligible'
      else 'not_selected'
    end,
    updated_at=now()
  where h.edition_id=v_edition.id
    and h.status in ('submitted','eligible');

  select count(*)::integer
  into v_candidates
  from public.nations_host_applications
  where edition_id=v_edition.id
    and status='eligible';

  if v_candidates=0 then
    return jsonb_build_object(
      'status','no_eligible_applications',
      'edition_id',v_edition.id
    );
  end if;

  -- Prefer Associations that have hosted the fewest times, then the one whose
  -- most recent hosting was longest ago. Money is never part of this ordering.
  with eligible as (
    select
      h.association_id,
      a.country_code,
      count(past.id) as host_count,
      max(past.season_number) as last_hosted_season,
      exists(
        select 1
        from public.nations_competition_editions prev
        where prev.season_number=v_edition.season_number-1
          and prev.host_association_id=h.association_id
      ) as hosted_previous_season
    from public.nations_host_applications h
    join public.national_associations a on a.id=h.association_id
    left join public.nations_competition_editions past
      on past.host_association_id=h.association_id
     and past.id<>v_edition.id
    where h.edition_id=v_edition.id
      and h.status='eligible'
    group by h.association_id,a.country_code
  )
  select e.association_id,e.country_code
  into v_selected,v_country
  from eligible e
  order by
    case
      when v_candidates>1 and e.hosted_previous_season then 1
      else 0
    end,
    e.host_count asc,
    e.last_hosted_season asc nulls first,
    md5(v_edition.id::text||':'||e.association_id::text)
  limit 1;

  update public.nations_host_applications
  set status=case
      when association_id=v_selected then 'selected'
      when status='eligible' then 'not_selected'
      else status
    end,
    updated_at=now()
  where edition_id=v_edition.id;

  update public.nations_competition_editions
  set host_association_id=v_selected,
      host_country_code=v_country,
      updated_at=now()
  where id=v_edition.id;

  return jsonb_build_object(
    'status','selected',
    'edition_id',v_edition.id,
    'host_association_id',v_selected,
    'host_country_code',v_country,
    'selection_basis','rotation_not_spending'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_nations_competition_overview_v1(p_season_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_current_season integer;
  v_season integer;
  v_today date;
  v_edition public.nations_competition_editions%rowtype;
  v_active_count integer := 0;
  v_my_association_id uuid;
  v_my_membership_id uuid;
  v_is_coach boolean := false;
  v_my_host_application jsonb := null;
  v_plan jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number, gs.month_number, gs.day_number)
  into v_current_season, v_today
  from public.game_state gs
  where gs.id = true;

  v_season := coalesce(p_season_number, v_current_season);

  select count(*)::integer
  into v_active_count
  from public.national_associations a
  where a.status = 'active'
    and private.national_association_active_member_count_v1(a.id) >= (
      select minimum_active_members
      from public.national_association_config
      where id = true
    );

  select m.association_id, m.id
  into v_my_association_id, v_my_membership_id
  from public.national_association_memberships m
  join public.national_associations a on a.id = m.association_id
  where m.user_id = v_uid
    and m.status = 'active'
    and a.status = 'active'
    and private.national_association_member_is_eligible_v1(m.association_id, v_uid)
  order by m.created_at desc
  limit 1;

  select exists(
    select 1
    from public.national_coach_terms t
    where t.association_id = v_my_association_id
      and t.membership_id = v_my_membership_id
      and t.user_id = v_uid
      and t.status = 'active'
      and t.season_number = v_current_season
  )
  into v_is_coach;

  select *
  into v_edition
  from public.nations_competition_editions e
  where e.season_number = v_season
  limit 1;

  v_plan := public.nations_qualification_plan_v1(
    case
      when v_edition.id is not null then v_edition.active_association_count
      when v_season = v_current_season then v_active_count
      else 0
    end
  );

  if v_edition.id is not null
     and v_my_association_id is not null then
    select jsonb_build_object(
      'id', h.id,
      'status', h.status,
      'statement', h.statement,
      'submitted_on', h.submitted_on_game_date
    )
    into v_my_host_application
    from public.nations_host_applications h
    where h.edition_id = v_edition.id
      and h.association_id = v_my_association_id
    limit 1;
  end if;

  return jsonb_build_object(
    'season_number', v_season,
    'current_season_number', v_current_season,
    'current_game_date', v_today,
    'active_association_count', v_active_count,
    'qualification_plan', v_plan,
    'viewer', jsonb_build_object(
      'association_id', v_my_association_id,
      'is_member', v_my_association_id is not null,
      'is_national_coach', v_is_coach,
      'can_apply_to_host',
        v_is_coach
        and v_edition.id is not null
        and v_edition.season_number = v_current_season
        and v_edition.status in ('planned','qualification'),
      'host_application', v_my_host_application
    ),
    'edition',
      case
        when v_edition.id is null then null
        else jsonb_build_object(
          'id', v_edition.id,
          'competition_name', v_edition.competition_name,
          'status', v_edition.status,
          'active_association_count', v_edition.active_association_count,
          'finalist_target', v_edition.finalist_target,
          'points_curve_version', v_edition.points_curve_version,
          'host_association_id', v_edition.host_association_id,
          'host_country_code', v_edition.host_country_code,
          'champion_association_id', v_edition.champion_association_id,
          'champion_country_code', v_edition.champion_country_code,
          'created_on_game_date', v_edition.created_on_game_date,
          'completed_on_game_date', v_edition.completed_on_game_date
        )
      end,
    'rounds',
      case
        when v_edition.id is null then '[]'::jsonb
        else coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', r.id,
              'round_index', r.round_index,
              'round_type', r.round_type,
              'round_label', r.round_label,
              'entrants_target', r.entrants_target,
              'advance_target', r.advance_target,
              'group_count', r.group_count,
              'group_size_min', r.group_size_min,
              'group_size_max', r.group_size_max,
              'status', r.status,
              'starts_on_game_date', r.starts_on_game_date,
              'ends_on_game_date', r.ends_on_game_date,
              'groups', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'id', g.id,
                    'group_number', g.group_number,
                    'group_label', g.group_label,
                    'planned_entrant_count', g.planned_entrant_count,
                    'planned_advance_count', g.planned_advance_count,
                    'status', g.status,
                    'entries', coalesce((
                      select jsonb_agg(
                        jsonb_build_object(
                          'group_entry_id', nge.id,
                          'competition_entry_id', ce.id,
                          'association_id', ce.association_id,
                          'association_name', a.name,
                          'country_code', ce.country_code,
                          'seed_position', nge.seed_position,
                          'final_group_rank', nge.final_group_rank,
                          'total_points', nge.total_points,
                          'ttt_points', nge.ttt_points,
                          'flat_points', nge.flat_points,
                          'mountain_points', nge.mountain_points,
                          'race_wins', nge.race_wins,
                          'podium_finishes', nge.podium_finishes,
                          'ttt_rank', nge.ttt_rank,
                          'best_day3_rider_rank', nge.best_day3_rider_rank,
                          'status', nge.status
                        )
                        order by
                          nge.final_group_rank nulls last,
                          nge.total_points desc,
                          ce.country_code
                      )
                      from public.nations_group_entries nge
                      join public.nations_competition_entries ce
                        on ce.id = nge.competition_entry_id
                      join public.national_associations a
                        on a.id = ce.association_id
                      where nge.group_id = g.id
                    ), '[]'::jsonb)
                  )
                  order by g.group_number
                )
                from public.nations_competition_groups g
                where g.round_id = r.id
              ), '[]'::jsonb)
            )
            order by r.round_index
          )
          from public.nations_competition_rounds r
          where r.edition_id = v_edition.id
        ), '[]'::jsonb)
      end,
    'entries',
      case
        when v_edition.id is null then '[]'::jsonb
        else coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'entry_id', e.id,
              'association_id', e.association_id,
              'association_name', a.name,
              'country_code', e.country_code,
              'seed_score', e.seed_score,
              'status', e.status
            )
            order by e.country_code
          )
          from public.nations_competition_entries e
          join public.national_associations a on a.id = e.association_id
          where e.edition_id = v_edition.id
        ), '[]'::jsonb)
      end,
    'points_curve', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'race_type', p.race_type,
          'finishing_position', p.finishing_position,
          'points', p.points,
          'version', p.version
        )
        order by p.race_type, p.finishing_position
      )
      from public.nations_points_curve p
      where p.is_active = true
        and p.version = coalesce(v_edition.points_curve_version, 1)
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'season_number', h.season_number,
          'association_id', h.association_id,
          'association_name', a.name,
          'country_code', h.country_code,
          'final_rank', h.final_rank,
          'total_points', h.total_points,
          'was_host', h.was_host
        )
        order by h.season_number desc, h.final_rank asc
      )
      from public.nations_competition_history h
      left join public.national_associations a on a.id = h.association_id
      where h.season_number <= v_season
    ), '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_nations_competition_planning_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_season integer;
  v_today date;
  v_season_start date;
  v_generation_gate date;
  v_active_count integer;
  v_create jsonb;
  v_edition_id uuid;
  v_round_id uuid;
  v_round_status text;
  v_draw jsonb := null;
begin
  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number, gs.month_number, gs.day_number)
  into v_season, v_today
  from public.game_state gs
  where gs.id = true;

  v_season_start := public.game_date_from_parts(v_season, 1, 1);
  v_generation_gate := public.game_date_from_parts(v_season, 1, 28);

  if v_today < v_generation_gate then
    return jsonb_build_object(
      'status','waiting_for_january_election_window',
      'season_number',v_season,
      'generation_gate',v_generation_gate
    );
  end if;

  select count(*)::integer
  into v_active_count
  from public.national_associations a
  where a.status='active'
    and private.national_association_active_member_count_v1(a.id) >= (
      select minimum_active_members
      from public.national_association_config
      where id=true
    );

  if v_active_count=0 then
    return jsonb_build_object(
      'status','waiting_for_active_associations',
      'season_number',v_season,
      'active_associations',0
    );
  end if;

  v_create := public.create_nations_competition_edition_v1(v_season);
  v_edition_id := nullif(v_create->>'edition_id','')::uuid;

  if v_edition_id is null then
    select id into v_edition_id
    from public.nations_competition_editions
    where season_number=v_season
    limit 1;
  end if;

  if v_edition_id is null then
    return coalesce(v_create,'{}'::jsonb)
      || jsonb_build_object('status','edition_not_available');
  end if;

  select id,status
  into v_round_id,v_round_status
  from public.nations_competition_rounds
  where edition_id=v_edition_id
    and round_index=1
  limit 1;

  if v_round_id is not null
     and v_round_status='planned'
     and not exists(
       select 1
       from public.nations_group_entries nge
       join public.nations_competition_groups g on g.id=nge.group_id
       where g.round_id=v_round_id
     ) then
    v_draw := public.draw_nations_round_v1(v_round_id);

    update public.nations_competition_editions
    set status='qualification',
        updated_at=now()
    where id=v_edition_id
      and status='planned';
  end if;

  return jsonb_build_object(
    'status','ready',
    'season_number',v_season,
    'edition_id',v_edition_id,
    'active_associations',v_active_count,
    'edition_creation',v_create,
    'first_round_draw',v_draw
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_nations_group_schedule_v1(p_group_id uuid, p_day1_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group public.nations_competition_groups%rowtype;
  v_round public.nations_competition_rounds%rowtype;
  v_cycle_key text;
  v_squad record;
  v_duty_count integer:=0;
begin
  if p_group_id is null or p_day1_date is null then
    raise exception 'Group and Day 1 date are required.';
  end if;

  select * into v_group
  from public.nations_competition_groups
  where id=p_group_id
  for update;

  if v_group.id is null then
    raise exception 'Nations group not found.';
  end if;

  select * into v_round
  from public.nations_competition_rounds
  where id=v_group.round_id
  for update;

  perform private.ensure_nations_group_runtime_v1(v_group.id);
  v_cycle_key:='nations:'||v_group.id::text;

  update public.nations_group_events
  set event_date=p_day1_date+(race_day-1),
      status=case when status='planned' then 'scheduled' else status end,
      updated_at=now()
  where group_id=v_group.id;

  update public.nations_competition_rounds r
  set starts_on_game_date=(
        select min(e.event_date)
        from public.nations_competition_groups g2
        join public.nations_group_events e on e.group_id=g2.id
        where g2.round_id=r.id
      ),
      ends_on_game_date=(
        select max(e.event_date)
        from public.nations_competition_groups g2
        join public.nations_group_events e on e.group_id=g2.id
        where g2.round_id=r.id
      ),
      updated_at=now()
  where r.id=v_round.id;

  for v_squad in
    select s.id
    from public.national_team_squads s
    join public.nations_group_entries nge
      on true
    join public.nations_competition_entries ce
      on ce.id=nge.competition_entry_id
    where nge.group_id=v_group.id
      and ce.association_id=s.association_id
      and s.season_number=(
        select ed.season_number
        from public.nations_competition_editions ed
        where ed.id=v_round.edition_id
      )
      and s.cycle_key=v_cycle_key
      and s.status in ('confirmed','on_duty')
    group by s.id
  loop
    perform public.set_national_team_duty_window_v1(
      v_squad.id,
      p_day1_date,
      p_day1_date+2
    );
    v_duty_count:=v_duty_count+1;
  end loop;

  return jsonb_build_object(
    'group_id',v_group.id,
    'cycle_key',v_cycle_key,
    'day1_date',p_day1_date,
    'day2_date',p_day1_date+1,
    'day3_date',p_day1_date+2,
    'duty_windows_updated',v_duty_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_operations_apply_recovery_timeout_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_marked integer := 0;
begin
  with recovery_start as (
    select
      a.stage_id,
      min(a.created_at) as recovery_started_at
    from public.race_engine_calculation_survival_audit_v1 a
    where a.action in (
      'enable_checkpointed_safe_mode',
      'switch_to_checkpointed_safe_mode',
      'recover_expired_phase_lease',
      'recover_hard_runtime_limit',
      'deadline_guard_recovery_kick'
    )
    group by a.stage_id
  ),
  eligible as (
    select
      s.stage_id,
      s.race_id,
      s.race_name,
      s.stage_number,
      r.recovery_started_at,
      extract(epoch from (clock_timestamp()-r.recovery_started_at))/60.0
        as recovery_elapsed_minutes
    from public.race_operations_stage_status_v1 s
    join recovery_start r on r.stage_id=s.stage_id
    where not coalesce(s.is_cancelled,false)
      and s.calculation_status<>'done'
      and not exists (
        select 1
        from public.race_stage_authoritative_runs ar
        where ar.stage_id=s.stage_id
      )
      and r.recovery_started_at<=clock_timestamp()-interval '30 minutes'
  ),
  updated as (
    update public.race_operations_stage_status_v1 s
    set
      calculation_status='failed',
      has_problem=true,
      issue_key='automatic_recovery_timeout',
      issue_severity='critical',
      issue_message='Automatic recovery has been running for at least 30 real minutes without producing a completed race calculation.',
      first_problem_at=coalesce(
        case
          when s.has_problem
           and s.issue_key='automatic_recovery_timeout'
          then s.first_problem_at
          else null
        end,
        e.recovery_started_at+interval '30 minutes'
      ),
      resolved_at=null,
      last_checked_at=now(),
      updated_at=now()
    from eligible e
    where s.stage_id=e.stage_id
    returning s.stage_id
  )
  select count(*) into v_marked from updated;

  /*
   * Re-open/reuse the existing escalation incident for the same stage. The
   * base monitor may temporarily resolve it because the engine still emits
   * RUNNING between retries; keeping the same incident id prevents duplicate
   * Control Center emails on each monitor refresh.
   */
  with recovery_start as (
    select stage_id,min(created_at) as recovery_started_at
    from public.race_engine_calculation_survival_audit_v1
    where action in (
      'enable_checkpointed_safe_mode',
      'switch_to_checkpointed_safe_mode',
      'recover_expired_phase_lease',
      'recover_hard_runtime_limit',
      'deadline_guard_recovery_kick'
    )
    group by stage_id
  ),
  eligible as (
    select s.*,rs.recovery_started_at
    from public.race_operations_stage_status_v1 s
    join recovery_start rs on rs.stage_id=s.stage_id
    where s.has_problem
      and s.issue_key='automatic_recovery_timeout'
      and rs.recovery_started_at<=clock_timestamp()-interval '30 minutes'
  ),
  chosen as (
    select distinct on (i.stage_id)
      i.id,
      i.stage_id
    from public.race_operations_incidents_v1 i
    join eligible e on e.stage_id=i.stage_id
    where i.issue_key='automatic_recovery_timeout'
    order by i.stage_id,i.detected_at asc,i.created_at asc
  )
  update public.race_operations_incidents_v1 i
  set
    resolved_at=null,
    resolution_message=null,
    severity='critical',
    message='Automatic recovery has been running for at least 30 real minutes without producing a completed race calculation.',
    last_seen_at=now(),
    metadata=jsonb_build_object(
      'calculation_status',e.calculation_status,
      'replay_status',e.replay_status,
      'completion_status',e.completion_status,
      'automation_status',e.automation_status,
      'engine_version',e.engine_version,
      'survival_phase',e.survival_phase,
      'last_error',e.last_error,
      'calculation_due_game_at',e.calculation_due_game_at,
      'results_due_game_at',e.results_due_game_at,
      'recovery_started_at',e.recovery_started_at,
      'recovery_elapsed_minutes',
        round((extract(epoch from (clock_timestamp()-e.recovery_started_at))/60.0)::numeric,1),
      'recovery_timeout_minutes',30,
      'recovery_timeout_exceeded',true,
      'automatic_recovery_continues',true
    ),
    updated_at=now()
  from chosen c
  join eligible e on e.stage_id=c.stage_id
  where i.id=c.id;

  insert into public.race_operations_incidents_v1(
    stage_id,race_id,race_name,stage_number,issue_key,severity,
    message,stage_start_game_at,detected_game_at,detected_at,last_seen_at,metadata
  )
  select
    s.stage_id,
    s.race_id,
    s.race_name,
    s.stage_number,
    'automatic_recovery_timeout',
    'critical',
    'Automatic recovery has been running for at least 30 real minutes without producing a completed race calculation.',
    s.stage_start_game_at,
    s.game_now_at_check,
    now(),
    now(),
    jsonb_build_object(
      'calculation_status',s.calculation_status,
      'replay_status',s.replay_status,
      'completion_status',s.completion_status,
      'automation_status',s.automation_status,
      'engine_version',s.engine_version,
      'survival_phase',s.survival_phase,
      'last_error',s.last_error,
      'calculation_due_game_at',s.calculation_due_game_at,
      'results_due_game_at',s.results_due_game_at,
      'recovery_started_at',rs.recovery_started_at,
      'recovery_elapsed_minutes',
        round((extract(epoch from (clock_timestamp()-rs.recovery_started_at))/60.0)::numeric,1),
      'recovery_timeout_minutes',30,
      'recovery_timeout_exceeded',true,
      'automatic_recovery_continues',true
    )
  from public.race_operations_stage_status_v1 s
  join (
    select stage_id,min(created_at) as recovery_started_at
    from public.race_engine_calculation_survival_audit_v1
    where action in (
      'enable_checkpointed_safe_mode',
      'switch_to_checkpointed_safe_mode',
      'recover_expired_phase_lease',
      'recover_hard_runtime_limit',
      'deadline_guard_recovery_kick'
    )
    group by stage_id
  ) rs on rs.stage_id=s.stage_id
  where s.has_problem
    and s.issue_key='automatic_recovery_timeout'
    and rs.recovery_started_at<=clock_timestamp()-interval '30 minutes'
    and not exists (
      select 1
      from public.race_operations_incidents_v1 i
      where i.stage_id=s.stage_id
        and i.issue_key='automatic_recovery_timeout'
    );

  /*
   * Resolve duplicate historical timeout rows created during rollout, keeping
   * only the first incident identity per stage as the canonical one.
   */
  update public.race_operations_incidents_v1 i
  set
    resolved_at=coalesce(i.resolved_at,now()),
    resolution_message=coalesce(
      i.resolution_message,
      'Superseded by the canonical automatic-recovery timeout incident for this stage.'
    ),
    updated_at=now()
  where i.issue_key='automatic_recovery_timeout'
    and i.id not in (
      select distinct on (x.stage_id) x.id
      from public.race_operations_incidents_v1 x
      where x.issue_key='automatic_recovery_timeout'
      order by x.stage_id,x.detected_at asc,x.created_at asc
    )
    and i.resolved_at is null;

  return jsonb_build_object(
    'ok',true,
    'recovery_timeout_minutes',30,
    'marked_problems',v_marked
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.schedule_nations_edition_v1(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_edition public.nations_competition_editions%rowtype;
  v_cfg public.nations_competition_schedule_config%rowtype;
  v_final_date date;
  v_final_qual_date date;
  v_first_allowed date;
  v_prelim_count integer:=0;
  v_effective_gap integer;
  v_round record;
  v_group record;
  v_prelims_after integer;
  v_start date;
  v_scheduled_groups integer:=0;
  v_schedule jsonb:='[]'::jsonb;
begin
  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id;

  if v_edition.id is null then
    raise exception 'World Nations edition not found.';
  end if;

  select * into v_cfg
  from public.nations_competition_schedule_config
  where id=true;

  v_final_date:=public.game_date_from_parts(
    v_edition.season_number,
    coalesce(v_cfg.final_month,11),
    coalesce(v_cfg.final_day,24)
  );

  v_final_qual_date:=v_final_date-coalesce(v_cfg.final_qualification_gap_days,42);

  v_first_allowed:=public.game_date_from_parts(
    v_edition.season_number,
    coalesce(v_cfg.earliest_preliminary_month,2),
    coalesce(v_cfg.earliest_preliminary_day,15)
  );

  select count(*)::integer
  into v_prelim_count
  from public.nations_competition_rounds
  where edition_id=v_edition.id
    and round_type='preliminary';

  if v_prelim_count>0 then
    v_effective_gap:=least(
      coalesce(v_cfg.preliminary_gap_days,49)::integer,
      greatest(
        21,
        floor(((v_final_qual_date-v_first_allowed)::numeric)/(v_prelim_count+1))::integer
      )
    );

    if v_final_qual_date-(v_effective_gap*v_prelim_count)<v_first_allowed then
      raise exception 'Not enough season space to schedule % preliminary Nations rounds safely.',v_prelim_count;
    end if;
  else
    v_effective_gap:=coalesce(v_cfg.preliminary_gap_days,49);
  end if;

  for v_round in
    select *
    from public.nations_competition_rounds
    where edition_id=v_edition.id
    order by round_index
  loop
    if v_round.round_type='world_final' then
      v_start:=v_final_date;
    elsif v_round.round_type='final_qualification' then
      v_start:=v_final_qual_date;
    else
      select count(*)::integer
      into v_prelims_after
      from public.nations_competition_rounds r2
      where r2.edition_id=v_edition.id
        and r2.round_type='preliminary'
        and r2.round_index>v_round.round_index;

      v_start:=v_final_qual_date-(v_effective_gap*(v_prelims_after+1));
    end if;

    for v_group in
      select id
      from public.nations_competition_groups
      where round_id=v_round.id
      order by group_number
    loop
      perform public.set_nations_group_schedule_v1(v_group.id,v_start);
      v_scheduled_groups:=v_scheduled_groups+1;
    end loop;

    v_schedule:=v_schedule||jsonb_build_array(jsonb_build_object(
      'round_id',v_round.id,
      'round_index',v_round.round_index,
      'round_type',v_round.round_type,
      'round_label',v_round.round_label,
      'day1_date',v_start,
      'day2_date',v_start+1,
      'day3_date',v_start+2
    ));
  end loop;

  return jsonb_build_object(
    'edition_id',v_edition.id,
    'season_number',v_edition.season_number,
    'scheduled_groups',v_scheduled_groups,
    'preliminary_gap_days',v_effective_gap,
    'rounds',v_schedule
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_current_nations_cycle_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_season integer;
  v_today date;
  v_association_id uuid;
  v_edition public.nations_competition_editions%rowtype;
  v_entry public.nations_competition_entries%rowtype;
  v_cycle record;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_today
  from public.game_state gs
  where gs.id=true;

  select m.association_id
  into v_association_id
  from public.national_association_memberships m
  join public.national_associations a
    on a.id=m.association_id
   and a.status='active'
  where m.user_id=v_uid
    and m.status='active'
    and private.national_association_member_is_eligible_v1(m.association_id,v_uid)
  order by m.created_at desc
  limit 1;

  if v_association_id is null then
    return jsonb_build_object(
      'state','no_active_association',
      'season_number',v_season,
      'current_game_date',v_today
    );
  end if;

  select * into v_edition
  from public.nations_competition_editions
  where season_number=v_season
  limit 1;

  if v_edition.id is null then
    return jsonb_build_object(
      'state','waiting_for_edition',
      'association_id',v_association_id,
      'season_number',v_season,
      'current_game_date',v_today
    );
  end if;

  select * into v_entry
  from public.nations_competition_entries
  where edition_id=v_edition.id
    and association_id=v_association_id
  limit 1;

  if v_entry.id is null then
    return jsonb_build_object(
      'state','not_entered',
      'association_id',v_association_id,
      'edition_id',v_edition.id,
      'season_number',v_season,
      'current_game_date',v_today
    );
  end if;

  if v_entry.status='eliminated' then
    return jsonb_build_object(
      'state','eliminated',
      'association_id',v_association_id,
      'edition_id',v_edition.id,
      'entry_status',v_entry.status,
      'season_number',v_season,
      'current_game_date',v_today
    );
  elsif v_entry.status='champion' then
    return jsonb_build_object(
      'state','champion',
      'association_id',v_association_id,
      'edition_id',v_edition.id,
      'entry_status',v_entry.status,
      'season_number',v_season,
      'current_game_date',v_today
    );
  end if;

  select
    r.id as round_id,
    r.round_index,
    r.round_type,
    r.round_label,
    r.status as round_status,
    g.id as group_id,
    g.group_number,
    g.group_label,
    g.status as group_status,
    nge.id as group_entry_id,
    nge.status as group_entry_status,
    min(e.event_date) as start_date,
    max(e.event_date) as end_date,
    max(e.event_date) filter(where e.race_day=1) as day1_date,
    max(e.event_date) filter(where e.race_day=2) as day2_date,
    max(e.event_date) filter(where e.race_day=3) as day3_date
  into v_cycle
  from public.nations_group_entries nge
  join public.nations_competition_groups g on g.id=nge.group_id
  join public.nations_competition_rounds r on r.id=g.round_id
  left join public.nations_group_events e on e.group_id=g.id
  where nge.competition_entry_id=v_entry.id
    and r.status<>'completed'
    and g.status<>'completed'
    and nge.status not in ('eliminated','withdrawn')
  group by
    r.id,r.round_index,r.round_type,r.round_label,r.status,
    g.id,g.group_number,g.group_label,g.status,
    nge.id,nge.status
  order by r.round_index
  limit 1;

  if v_cycle.group_id is null then
    return jsonb_build_object(
      'state','waiting_for_next_round',
      'association_id',v_association_id,
      'edition_id',v_edition.id,
      'entry_status',v_entry.status,
      'season_number',v_season,
      'current_game_date',v_today
    );
  end if;

  return jsonb_build_object(
    'state','active_cycle',
    'association_id',v_association_id,
    'edition_id',v_edition.id,
    'entry_id',v_entry.id,
    'entry_status',v_entry.status,
    'season_number',v_season,
    'current_game_date',v_today,
    'cycle_key','nations:'||v_cycle.group_id::text,
    'round_id',v_cycle.round_id,
    'round_index',v_cycle.round_index,
    'round_type',v_cycle.round_type,
    'round_label',v_cycle.round_label,
    'round_status',v_cycle.round_status,
    'group_id',v_cycle.group_id,
    'group_number',v_cycle.group_number,
    'group_label',v_cycle.group_label,
    'group_status',v_cycle.group_status,
    'group_entry_id',v_cycle.group_entry_id,
    'group_entry_status',v_cycle.group_entry_status,
    'start_date',v_cycle.start_date,
    'end_date',v_cycle.end_date,
    'day1_date',v_cycle.day1_date,
    'day2_date',v_cycle.day2_date,
    'day3_date',v_cycle.day3_date
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_national_association_nations_runtime_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_status jsonb;
  v_elections jsonb;
  v_expired integer;
  v_duties jsonb;
  v_plan jsonb;
  v_edition_id uuid;
  v_schedule jsonb:=null;
  v_next_round record;
  v_draw jsonb:=null;
  v_final_start date;
  v_host_days integer:=30;
  v_host jsonb:=null;
begin
  v_status:=public.refresh_national_association_statuses_v1();
  v_elections:=public.process_national_coach_elections_v1();
  v_expired:=public.expire_national_team_callups_v1();
  v_duties:=public.refresh_national_team_duty_status_v1();
  v_plan:=public.process_nations_competition_planning_v1();

  v_edition_id:=nullif(v_plan->>'edition_id','')::uuid;

  if v_edition_id is null then
    select id into v_edition_id
    from public.nations_competition_editions
    where season_number=(select season_number from public.game_state where id=true)
    limit 1;
  end if;

  if v_edition_id is not null then
    v_schedule:=public.schedule_nations_edition_v1(v_edition_id);

    select r.id,r.round_type
    into v_next_round
    from public.nations_competition_rounds r
    where r.edition_id=v_edition_id
      and r.status='planned'
      and (
        r.round_index=1
        or exists(
          select 1
          from public.nations_competition_rounds prev
          where prev.edition_id=r.edition_id
            and prev.round_index=r.round_index-1
            and prev.status='completed'
        )
      )
    order by r.round_index
    limit 1;

    if v_next_round.id is not null then
      v_draw:=public.draw_nations_round_v1(v_next_round.id);

      update public.nations_competition_editions
      set status=case
          when v_next_round.round_type='world_final' then 'world_final'
          else 'qualification'
        end,
        updated_at=now()
      where id=v_edition_id
        and status<>'completed';
    end if;

    select min(e.event_date)
    into v_final_start
    from public.nations_competition_rounds r
    join public.nations_competition_groups g on g.round_id=r.id
    join public.nations_group_events e on e.group_id=g.id
    where r.edition_id=v_edition_id
      and r.round_type='world_final';

    select host_selection_days_before_final::integer
    into v_host_days
    from public.nations_competition_schedule_config
    where id=true;

    if v_final_start is not null
       and v_today>=v_final_start-coalesce(v_host_days,30)
       and not exists(
         select 1
         from public.nations_competition_editions
         where id=v_edition_id
           and host_association_id is not null
       )
       and exists(
         select 1
         from public.nations_host_applications
         where edition_id=v_edition_id
           and status in ('submitted','eligible')
       )
    then
      v_host:=public.select_nations_host_v1(v_edition_id);
    end if;
  end if;

  return jsonb_build_object(
    'game_date',v_today,
    'association_statuses',v_status,
    'coach_elections',v_elections,
    'expired_callups',v_expired,
    'national_duties',v_duties,
    'nations_planning',v_plan,
    'nations_schedule',v_schedule,
    'next_round_draw',v_draw,
    'host_selection',v_host
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_nations_operations_health_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_season integer;
  v_generation_gate date;
  v_active_associations integer:=0;
  v_edition_id uuid;
  v_unscheduled integer:=0;
  v_drawn_empty integer:=0;
  v_overdue_events integer:=0;
  v_bad_squads integer:=0;
  v_bad_lineups integer:=0;
  v_lineup_blocked integer:=0;
  v_unsafe_races integer:=0;
  v_issue_count integer:=0;
  v_details jsonb;
  v_summary text;
begin
  select season_number into v_season
  from public.game_state where id=true;

  v_generation_gate:=public.game_date_from_parts(v_season,1,28);

  select count(*)::integer
  into v_active_associations
  from public.national_associations a
  where a.status='active'
    and private.national_association_active_member_count_v1(a.id)>=(
      select minimum_active_members
      from public.national_association_config
      where id=true
    );

  select id into v_edition_id
  from public.nations_competition_editions
  where season_number=v_season
  limit 1;

  if v_edition_id is not null then
    select count(*)::integer
    into v_unscheduled
    from public.nations_competition_groups g
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition_id
      and (
        r.starts_on_game_date is null
        or r.ends_on_game_date is null
        or (
          select count(*)
          from public.nations_group_events e
          where e.group_id=g.id
            and e.event_date is not null
        )<>3
      );

    select count(*)::integer
    into v_drawn_empty
    from public.nations_competition_groups g
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition_id
      and r.status in ('drawn','active','in_progress')
      and g.status in ('drawn','active','in_progress')
      and not exists(
        select 1 from public.nations_group_entries nge where nge.group_id=g.id
      );

    select count(*)::integer
    into v_overdue_events
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id=e.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition_id
      and e.event_date<v_today
      and e.status in ('planned','scheduled','ready','waiting_for_lineups');

    select count(*)::integer
    into v_lineup_blocked
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id=e.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition_id
      and e.event_date between v_today and v_today+3
      and e.status not in ('completed','cancelled','running')
      and (
        e.race_id is null
        or (
          select count(*)
          from (
            select rpr.team_id
            from public.race_participant_riders rpr
            where rpr.race_id=e.race_id
              and rpr.team_id is not null
            group by rpr.team_id
            having count(*)=7
          ) ready_teams
        ) < (
          select count(*)
          from public.nations_group_entries nge
          where nge.group_id=e.group_id
            and nge.status<>'withdrawn'
        )
      );

    select count(*)::integer
    into v_unsafe_races
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id=e.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    join public.races rr on rr.id=e.race_id
    where r.edition_id=v_edition_id
      and rr.status in ('scheduled','active')
      and e.status not in ('completed','cancelled','running')
      and (
        select count(*)
        from (
          select rpr.team_id
          from public.race_participant_riders rpr
          where rpr.race_id=e.race_id
            and rpr.team_id is not null
          group by rpr.team_id
          having count(*)=7
        ) ready_teams
      ) < (
        select count(*)
        from public.nations_group_entries nge
        where nge.group_id=e.group_id
          and nge.status<>'withdrawn'
      );
  end if;

  select count(*)::integer
  into v_bad_squads
  from public.national_team_squads s
  where s.season_number=v_season
    and s.cycle_key like 'nations:%'
    and s.status in ('confirmed','on_duty')
    and (
      select count(*)
      from public.national_team_squad_members sm
      where sm.squad_id=s.id
    )<>10;

  select count(*)::integer
  into v_bad_lineups
  from public.national_team_lineups l
  join public.national_team_squads s on s.id=l.squad_id
  where s.season_number=v_season
    and s.cycle_key like 'nations:%'
    and l.status in ('confirmed','locked','completed')
    and (
      select count(*)
      from public.national_team_lineup_members lm
      where lm.lineup_id=l.id
    )<>7;

  v_issue_count :=
    case
      when v_today>=v_generation_gate and v_active_associations>0 and v_edition_id is null then 1
      else 0
    end
    + v_unscheduled
    + v_drawn_empty
    + v_overdue_events
    + v_bad_squads
    + v_bad_lineups
    + v_lineup_blocked
    + v_unsafe_races;

  v_details:=jsonb_build_object(
    'game_date',v_today,
    'season_number',v_season,
    'generation_gate',v_generation_gate,
    'active_associations',v_active_associations,
    'edition_id',v_edition_id,
    'edition_missing_after_gate',
      v_today>=v_generation_gate and v_active_associations>0 and v_edition_id is null,
    'unscheduled_groups',v_unscheduled,
    'drawn_groups_without_entries',v_drawn_empty,
    'overdue_events',v_overdue_events,
    'invalid_confirmed_squads',v_bad_squads,
    'invalid_lineups',v_bad_lineups,
    'lineup_blocked_events_next_3_days',v_lineup_blocked,
    'unsafe_scheduled_events',v_unsafe_races
  );

  v_summary:=case
    when v_issue_count=0 then
      case
        when v_today<v_generation_gate then 'World Nations operations are healthy; seasonal generation is waiting for the January election window.'
        when v_active_associations=0 then 'World Nations operations are healthy; no active National Associations are currently eligible.'
        else 'World Nations operations are healthy.'
      end
    else format('%s World Nations operational issue(s) detected.',v_issue_count)
  end;

  perform public.log_system_business_check_v1(
    'check:nations_operations',
    case when v_issue_count>0 then 'error' else 'success' end,
    v_summary,
    v_details
  );

  if v_issue_count>0 then
    perform public.raise_system_incident_v1(
      'check:nations_operations',
      'critical',
      'World Nations operations require attention',
      v_summary,
      'business:nations-operations',
      v_details
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      'business:nations-operations',
      'World Nations operations are healthy.'
    );
  end if;

  return jsonb_build_object(
    'status',case when v_issue_count>0 then 'error' else 'success' end,
    'issues',v_issue_count,
    'summary',v_summary,
    'details',v_details
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_national_association_nations_runtime_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_runtime jsonb;
  v_health jsonb;
begin
  v_runtime:=public.process_national_association_nations_runtime_v1();
  v_health:=public.check_nations_operations_health_v1();

  return coalesce(v_runtime,'{}'::jsonb)
    || jsonb_build_object('operations_health',v_health);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_nations_group_event_race_v1(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event public.nations_group_events%rowtype;
  v_group public.nations_competition_groups%rowtype;
  v_round public.nations_competition_rounds%rowtype;
  v_edition public.nations_competition_editions%rowtype;
  v_source public.race_stages%rowtype;
  v_source_race public.races%rowtype;
  v_source_stage_id uuid;
  v_race_id uuid;
  v_stage_id uuid;
  v_country_code text;
  v_country_name text;
  v_race_name text;
  v_short_name text;
  v_stage_name text;
  v_stage_format text;
  v_region text;
  v_hour integer;
  v_team_count integer;
  v_is_final boolean;
begin
  select * into v_event
  from public.nations_group_events
  where id=p_event_id
  for update;

  if v_event.id is null then
    raise exception 'World Nations event not found.';
  end if;

  if v_event.event_date is null then
    return jsonb_build_object(
      'status','waiting_for_schedule',
      'event_id',v_event.id
    );
  end if;

  select * into v_group
  from public.nations_competition_groups
  where id=v_event.group_id;

  select * into v_round
  from public.nations_competition_rounds
  where id=v_group.round_id;

  select * into v_edition
  from public.nations_competition_editions
  where id=v_round.edition_id;

  if v_event.race_id is not null and v_event.stage_id is not null then
    return jsonb_build_object(
      'status','existing',
      'event_id',v_event.id,
      'race_id',v_event.race_id,
      'stage_id',v_event.stage_id
    );
  end if;

  v_source_stage_id:=coalesce(
    v_event.source_stage_id,
    private.pick_nations_source_stage_v1(
      v_event.race_type,
      v_edition.season_number::text||':'||v_group.id::text||':'||v_event.race_day::text
    )
  );

  select * into v_source
  from public.race_stages
  where id=v_source_stage_id;

  if v_source.id is null then
    raise exception 'World Nations source stage % was not found.',v_source_stage_id;
  end if;

  select * into v_source_race
  from public.races
  where id=v_source.race_id;

  v_is_final:=v_round.round_type='world_final';

  v_country_code:=case
    when v_is_final and v_edition.host_country_code is not null
      then upper(v_edition.host_country_code)
    else upper(coalesce(v_source.host_country_code,v_source_race.country_code))
  end;

  if v_country_code is not null then
    select coalesce(c.name,v_country_code)
    into v_country_name
    from public.countries c
    where upper(c.code)=v_country_code
    limit 1;
  end if;

  v_country_name:=coalesce(v_country_name,v_country_code,'International');

  v_race_name:=case v_event.race_type
    when 'team_time_trial' then
      v_round.round_label||' · '||v_group.group_label||' · Team Time Trial'
    when 'flat_road_race' then
      v_round.round_label||' · '||v_group.group_label||' · Flat Road Race'
    else
      v_round.round_label||' · '||v_group.group_label||' · Hilly / Mountain Road Race'
  end;

  v_short_name:=case v_event.race_type
    when 'team_time_trial' then 'WNC TTT'
    when 'flat_road_race' then 'WNC Flat'
    else 'WNC Hills'
  end;

  v_stage_name:=case v_event.race_type
    when 'team_time_trial' then 'World Nations Team Time Trial'
    when 'flat_road_race' then 'World Nations Flat Road Race'
    else 'World Nations Hilly / Mountain Road Race'
  end;

  v_stage_format:=case
    when v_event.race_type='team_time_trial' then 'team_time_trial'
    else 'road_race'
  end;

  v_region:=case
    when v_country_code is null then 'europe'
    else public.race_start_region_code_v1(v_country_code)
  end;

  v_hour:=case v_region
    when 'apac' then 7
    when 'americas' then 17
    else 13
  end;

  insert into public.races(
    name,short_name,start_date,end_date,country_code,host_city,
    category,race_type,is_stage_race,stage_count,status,
    logo_url,description,metadata,
    start_time_region_code,planned_start_hour_number,planned_start_minute,
    planned_start_time_label,planned_start_assigned_at
  )
  values(
    v_race_name,v_short_name,v_event.event_date,v_event.event_date,
    v_country_code,
    case
      when v_is_final then v_country_name
      else coalesce(nullif(v_source.host_city,''),nullif(v_source.start_city_name,''),nullif(v_source.start_city,''),v_country_name)
    end,
    case when v_is_final then 'WNF' else 'WNQ' end,
    'one_day',false,1,'scheduled',
    case
      when v_country_code is not null then 'https://flagcdn.com/w320/'||lower(v_country_code)||'.png'
      else null
    end,
    'World Nations Championship race. National Team operations, travel and equipment are system-covered.',
    jsonb_build_object(
      'nations_competition',true,
      'edition_id',v_edition.id,
      'round_id',v_round.id,
      'round_type',v_round.round_type,
      'group_id',v_group.id,
      'group_label',v_group.group_label,
      'event_id',v_event.id,
      'race_day',v_event.race_day,
      'race_type',v_event.race_type,
      'cycle_key',v_event.cycle_key,
      'source_stage_id',v_source_stage_id,
      'standard_package',true,
      'team_cost_cash',0,
      'team_cost_coins',0,
      'no_prize_money',true,
      'no_ranking_points',true,
      'host_prestige_only',v_is_final
    ),
    v_region,v_hour,0,lpad(v_hour::text,2,'0')||':00',now()
  )
  returning id into v_race_id;

  insert into public.race_stages(
    race_id,stage_number,stage_date,name,start_city,finish_city,host_city,
    host_country_code,distance_km,terrain_type,finish_type,is_summit_finish,
    flat_pct,hilly_pct,mountain_pct,cobbled_pct,elevation_gain_m,
    profile_image_url,weather_snapshot,rules_snapshot,metadata,
    start_city_name,finish_city_name,profile_type,notes,
    intermediate_sprints_json,mountain_climbs_json,
    start_time_region_code,planned_start_hour_number,planned_start_minute,
    planned_start_time_label,planned_start_assigned_at,stage_format
  )
  values(
    v_race_id,1,v_event.event_date,v_stage_name,
    coalesce(nullif(v_source.start_city,''),nullif(v_source.start_city_name,''),'Start'),
    coalesce(nullif(v_source.finish_city,''),nullif(v_source.finish_city_name,''),'Finish'),
    case
      when v_is_final then v_country_name
      else coalesce(nullif(v_source.host_city,''),nullif(v_source.start_city_name,''),v_country_name)
    end,
    v_country_code,
    v_source.distance_km,
    case
      when v_event.race_type='team_time_trial' then 'flat'
      when v_event.race_type='flat_road_race' then 'flat'
      else coalesce(v_source.terrain_type,'hilly')
    end,
    v_source.finish_type,
    coalesce(v_source.is_summit_finish,false),
    v_source.flat_pct,v_source.hilly_pct,v_source.mountain_pct,v_source.cobbled_pct,
    v_source.elevation_gain_m,
    v_source.profile_image_url,
    coalesce(v_source.weather_snapshot,'{}'::jsonb),
    coalesce(v_source.rules_snapshot,'{}'::jsonb),
    coalesce(v_source.metadata,'{}'::jsonb)||jsonb_build_object(
      'nations_competition',true,
      'edition_id',v_edition.id,
      'round_id',v_round.id,
      'group_id',v_group.id,
      'event_id',v_event.id,
      'race_day',v_event.race_day,
      'race_type',v_event.race_type,
      'source_stage_id',v_source_stage_id,
      'standard_package',true,
      'no_prize_money',true,
      'no_ranking_points',true
    ),
    coalesce(nullif(v_source.start_city_name,''),nullif(v_source.start_city,''),'Start'),
    coalesce(nullif(v_source.finish_city_name,''),nullif(v_source.finish_city,''),'Finish'),
    case
      when v_event.race_type='team_time_trial' then 'team_time_trial'
      else v_source.profile_type
    end,
    'World Nations Championship route profile.',
    case
      when v_event.race_type='team_time_trial' then '[]'::jsonb
      else coalesce(v_source.intermediate_sprints_json,'[]'::jsonb)
    end,
    case
      when v_event.race_type='team_time_trial' then '[]'::jsonb
      else coalesce(v_source.mountain_climbs_json,'[]'::jsonb)
    end,
    v_region,v_hour,0,lpad(v_hour::text,2,'0')||':00',now(),v_stage_format
  )
  returning id into v_stage_id;

  insert into public.race_stage_profile_details(
    stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,
    distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
    profile_points,route_markers,intermediate_sprints,mountain_climbs,
    metadata,weather_snapshot
  )
  select
    v_stage_id,
    v_race_id,
    v_stage_name,
    coalesce(nullif(v_source.start_city_name,''),nullif(v_source.start_city,''),'Start')
      ||' → '||
    coalesce(nullif(v_source.finish_city_name,''),nullif(v_source.finish_city,''),'Finish'),
    'World Nations Championship route profile.',
    spd.weather_summary,
    coalesce(spd.distance_km,v_source.distance_km),
    coalesce(spd.elevation_gain_m,v_source.elevation_gain_m,0),
    case
      when v_event.race_type='team_time_trial' then 'flat'
      when v_event.race_type='flat_road_race' then 'flat'
      else coalesce(spd.terrain_type,v_source.terrain_type,'hilly')
    end,
    case
      when v_event.race_type='team_time_trial' then 'team_time_trial'
      else coalesce(spd.profile_type,v_source.profile_type)
    end,
    coalesce(spd.terrain_split,jsonb_build_object(
      'flat',coalesce(v_source.flat_pct,0),
      'hilly',coalesce(v_source.hilly_pct,0),
      'mountain',coalesce(v_source.mountain_pct,0),
      'cobbled',coalesce(v_source.cobbled_pct,0)
    )),
    coalesce(spd.profile_points,'[]'::jsonb),
    coalesce(spd.route_markers,'[]'::jsonb),
    case when v_event.race_type='team_time_trial' then '[]'::jsonb else coalesce(spd.intermediate_sprints,'[]'::jsonb) end,
    case when v_event.race_type='team_time_trial' then '[]'::jsonb else coalesce(spd.mountain_climbs,'[]'::jsonb) end,
    coalesce(spd.metadata,'{}'::jsonb)||jsonb_build_object(
      'nations_competition',true,
      'source_stage_id',v_source_stage_id,
      'event_id',v_event.id
    ),
    coalesce(v_source.weather_snapshot,'{}'::jsonb)
  from public.race_stage_profile_details spd
  where spd.stage_id=v_source_stage_id
  on conflict(stage_id) do nothing;

  perform public.sync_race_stage_points_from_stage_json_v1(v_stage_id,true);

  if v_event.race_type='team_time_trial' then
    delete from public.race_stage_points
    where stage_id=v_stage_id;
  end if;

  select count(*)::integer
  into v_team_count
  from public.nations_group_entries nge
  where nge.group_id=v_group.id
    and nge.status<>'withdrawn';

  insert into public.race_entry_rules(
    race_id,race_class_code,target_teams,min_teams,max_teams,
    min_riders_per_team,max_riders_per_team,
    applications_open_game_date,applications_close_game_date,
    applications_status,auto_close_when_full,allow_waitlist,
    prize_fund_cash,prize_fund_source,metadata,
    race_season_number,race_start_month_number,race_start_day_number,
    application_window_policy,rider_submission_deadline
  )
  values(
    v_race_id,'1.1',
    greatest(v_team_count,1),1,greatest(v_team_count,1),
    7,7,
    v_event.event_date-1,v_event.event_date-1,
    'closed',true,false,
    0,'manual_override',
    jsonb_build_object(
      'nations_competition',true,
      'applications_disabled',true,
      'automatic_entry',true,
      'no_team_cost',true,
      'no_prize_money',true,
      'no_ranking_points',true
    ),
    v_edition.season_number,
    extract(month from v_event.event_date)::int,
    extract(day from v_event.event_date)::int,
    'standard_90_3',
    v_event.event_date
  );

  update public.nations_group_events
  set race_id=v_race_id,
      stage_id=v_stage_id,
      source_stage_id=v_source_stage_id,
      status='ready',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'race_engine_connected',true,
        'source_stage_id',v_source_stage_id
      ),
      updated_at=now()
  where id=v_event.id;

  return jsonb_build_object(
    'status','created',
    'event_id',v_event.id,
    'race_id',v_race_id,
    'stage_id',v_stage_id,
    'source_stage_id',v_source_stage_id,
    'race_type',v_event.race_type,
    'event_date',v_event.event_date
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_nations_group_event_participants_v1(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event public.nations_group_events%rowtype;
  v_group public.nations_competition_groups%rowtype;
  v_round public.nations_competition_rounds%rowtype;
  v_edition public.nations_competition_editions%rowtype;
  v_entry record;
  v_team_id uuid;
  v_squad public.national_team_squads%rowtype;
  v_lineup public.national_team_lineups%rowtype;
  v_setup_id uuid;
  v_prep_id uuid;
  v_stage_plan_id uuid;
  v_setup_slot integer;
  v_valid_teams integer:=0;
  v_missing_teams integer:=0;
  v_rider_count integer:=0;
begin
  select * into v_event
  from public.nations_group_events
  where id=p_event_id;

  if v_event.id is null then
    raise exception 'World Nations event not found.';
  end if;

  if v_event.race_id is null or v_event.stage_id is null then
    return jsonb_build_object(
      'status','waiting_for_race',
      'event_id',v_event.id
    );
  end if;

  if exists(
    select 1
    from public.race_stage_simulation_runs sr
    where sr.stage_id=v_event.stage_id
      and sr.status in ('running','completed')
  ) then
    return jsonb_build_object(
      'status','participants_locked',
      'event_id',v_event.id,
      'race_id',v_event.race_id,
      'stage_id',v_event.stage_id
    );
  end if;

  select * into v_group
  from public.nations_competition_groups
  where id=v_event.group_id;

  select * into v_round
  from public.nations_competition_rounds
  where id=v_group.round_id;

  select * into v_edition
  from public.nations_competition_editions
  where id=v_round.edition_id;

  v_setup_slot:=case v_event.race_type
    when 'team_time_trial' then 3
    when 'flat_road_race' then 1
    else 2
  end;

  for v_entry in
    select
      nge.id as group_entry_id,
      ce.association_id,
      ce.country_code,
      a.name as association_name
    from public.nations_group_entries nge
    join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
    join public.national_associations a on a.id=ce.association_id
    where nge.group_id=v_group.id
      and nge.status<>'withdrawn'
    order by ce.country_code
  loop
    v_team_id:=private.ensure_national_association_race_team_v1(v_entry.association_id);

    select * into v_squad
    from public.national_team_squads s
    where s.association_id=v_entry.association_id
      and s.season_number=v_edition.season_number
      and s.cycle_key=v_event.cycle_key
      and s.status in ('confirmed','on_duty')
    limit 1;

    if v_squad.id is null then
      v_missing_teams:=v_missing_teams+1;
      continue;
    end if;

    select * into v_lineup
    from public.national_team_lineups l
    where l.squad_id=v_squad.id
      and l.race_day=v_event.race_day
      and l.status in ('confirmed','locked','completed')
    limit 1;

    if v_lineup.id is null
       or (
         select count(*)
         from public.national_team_lineup_members lm
         where lm.lineup_id=v_lineup.id
       )<>7 then
      v_missing_teams:=v_missing_teams+1;
      continue;
    end if;

    select p.id
    into v_setup_id
    from public.club_equipment_setup_presets p
    where p.club_id=v_team_id
      and p.setup_slot=v_setup_slot
    limit 1;

    insert into public.race_participant_teams(
      race_id,team_id,status,team_name_snapshot,logo_url_snapshot,
      country_code_snapshot,ranking_snapshot,submitted_at,accepted_at
    )
    values(
      v_event.race_id,v_team_id,'accepted',
      v_entry.association_name,
      'https://flagcdn.com/w160/'||lower(v_entry.country_code)||'.png',
      upper(v_entry.country_code),null,now(),now()
    )
    on conflict(race_id,team_id) do update
    set status='accepted',
        team_name_snapshot=excluded.team_name_snapshot,
        logo_url_snapshot=excluded.logo_url_snapshot,
        country_code_snapshot=excluded.country_code_snapshot,
        accepted_at=excluded.accepted_at;

    delete from public.race_participant_riders
    where race_id=v_event.race_id
      and team_id=v_team_id;

    insert into public.race_participant_riders(
      race_id,team_id,rider_id,rider_name_snapshot,team_name_snapshot,
      country_code_snapshot,age_snapshot,is_young_rider,start_number,
      role_snapshot,overall_snapshot,can_view_exact_overall,overall_range_label
    )
    select
      v_event.race_id,
      v_team_id,
      lm.rider_id,
      coalesce(r.display_name,lm.rider_id::text),
      v_entry.association_name,
      upper(v_entry.country_code),
      greatest(0,extract(year from age(v_event.event_date,r.birth_date))::integer),
      extract(year from age(v_event.event_date,r.birth_date))::integer<=21,
      100*v_group.group_number + row_number() over(order by coalesce(r.display_name,lm.rider_id::text)),
      r.role::text,
      r.overall,
      true,
      null
    from public.national_team_lineup_members lm
    join public.riders r on r.id=lm.rider_id
    where lm.lineup_id=v_lineup.id
    order by coalesce(r.display_name,lm.rider_id::text);

    insert into public.race_preparations(
      race_id,club_id,status,startlist_status,setup_window_opens_on,
      rider_submission_deadline_on,submitted_at,default_equipment_setup_id,
      rider_count,staff_count,participation_cost_cash,travel_cost_cash,
      staff_travel_cost_cash,asset_transport_cost_cash,supplies_cost_cash,
      operations_cost_cash,total_cost_cash,cost_breakdown_json,
      team_policies_snapshot_json,validation_snapshot_json,engine_payload_json,
      metadata,participating_club_id
    )
    values(
      v_event.race_id,v_team_id,'submitted','submitted',
      v_event.event_date-14,v_event.event_date,now(),v_setup_id,
      7,0,0,0,0,0,0,0,0,
      jsonb_build_object('nations_competition',true,'system_covered',true),
      '{}'::jsonb,
      jsonb_build_object(
        'nations_competition',true,
        'standard_package',true,
        'expected_riders',7
      ),
      jsonb_build_object(
        'nations_competition',true,
        'association_id',v_entry.association_id,
        'group_id',v_group.id,
        'event_id',v_event.id,
        'race_day',v_event.race_day,
        'race_type',v_event.race_type
      ),
      jsonb_build_object(
        'nations_competition',true,
        'standard_package',true,
        'system_covered',true,
        'association_id',v_entry.association_id,
        'group_id',v_group.id,
        'event_id',v_event.id
      ),
      v_team_id
    )
    on conflict(race_id,club_id) do update
    set status='submitted',
        startlist_status='submitted',
        default_equipment_setup_id=excluded.default_equipment_setup_id,
        rider_count=7,
        staff_count=0,
        total_cost_cash=0,
        cost_breakdown_json=excluded.cost_breakdown_json,
        validation_snapshot_json=excluded.validation_snapshot_json,
        engine_payload_json=excluded.engine_payload_json,
        metadata=public.race_preparations.metadata||excluded.metadata,
        participating_club_id=excluded.participating_club_id,
        updated_at=now()
    returning id into v_prep_id;

    delete from public.race_preparation_riders
    where race_preparation_id=v_prep_id;

    insert into public.race_preparation_riders(
      race_preparation_id,rider_id,start_number,race_role,
      default_equipment_setup_id,availability_snapshot_json,
      rider_snapshot_json,bonus_snapshot_json,metadata
    )
    select
      v_prep_id,
      lm.rider_id,
      100*v_group.group_number + row_number() over(order by coalesce(r.display_name,lm.rider_id::text)),
      'selected',
      v_setup_id,
      jsonb_build_object(
        'availability_status',r.availability_status,
        'unavailable_until',r.unavailable_until,
        'unavailable_reason',r.unavailable_reason
      ),
      jsonb_build_object(
        'nations_competition',true,
        'association_id',v_entry.association_id,
        'country_code',v_entry.country_code,
        'overall',r.overall,
        'role',r.role
      ),
      jsonb_build_object('standard_package',true),
      jsonb_build_object(
        'nations_competition',true,
        'standard_package',true,
        'national_team',true
      )
    from public.national_team_lineup_members lm
    join public.riders r on r.id=lm.rider_id
    where lm.lineup_id=v_lineup.id;

    insert into public.race_stage_plans(
      race_preparation_id,race_id,stage_id,stage_number,stage_date,status,
      opens_on_game_date,locks_on_game_date,submitted_at,
      stage_objective,team_strategy,risk_level,
      stage_profile_snapshot_json,bonus_snapshot_json,engine_stage_payload_json,
      metadata,rider_equipment_json,rider_roles_json,team_tactic_json,
      rider_supplies_json,rider_individual_tactics_json,last_saved_at,last_saved_game_ts
    )
    select
      v_prep_id,v_event.race_id,v_event.stage_id,1,v_event.event_date,'submitted',
      v_event.event_date-14,v_event.event_date,now(),
      'balanced','balanced','normal',
      to_jsonb(s),
      jsonb_build_object('standard_package',true),
      jsonb_build_object(
        'nations_competition',true,
        'association_id',v_entry.association_id,
        'race_type',v_event.race_type
      ),
      jsonb_build_object(
        'nations_competition',true,
        'standard_package',true,
        'national_team',true
      ),
      '{}'::jsonb,
      '{}'::jsonb,
      jsonb_build_object(
        'plan','balanced',
        'national_team',true,
        'race_type',v_event.race_type
      ),
      '{}'::jsonb,
      '{}'::jsonb,
      now(),
      public.get_current_game_ts_local()
    from public.race_stages s
    where s.id=v_event.stage_id
    on conflict(race_preparation_id,stage_number) do update
    set stage_id=excluded.stage_id,
        stage_date=excluded.stage_date,
        status='submitted',
        team_strategy='balanced',
        stage_profile_snapshot_json=excluded.stage_profile_snapshot_json,
        bonus_snapshot_json=excluded.bonus_snapshot_json,
        engine_stage_payload_json=excluded.engine_stage_payload_json,
        metadata=public.race_stage_plans.metadata||excluded.metadata,
        updated_at=now()
    returning id into v_stage_plan_id;

    delete from public.race_stage_plan_riders
    where race_stage_plan_id=v_stage_plan_id;

    insert into public.race_stage_plan_riders(
      race_stage_plan_id,rider_id,stage_role,tactic,risk_level,effort_level,
      equipment_setup_id,rider_stage_snapshot_json,equipment_bonus_snapshot_json,
      final_bonus_snapshot_json,metadata
    )
    select
      v_stage_plan_id,
      lm.rider_id,
      case when v_event.race_type='team_time_trial' then 'domestique' else 'free_role' end,
      'balanced','normal','normal',v_setup_id,
      jsonb_build_object(
        'nations_competition',true,
        'association_id',v_entry.association_id,
        'race_day',v_event.race_day
      ),
      jsonb_build_object('standard_package',true),
      jsonb_build_object('standard_package',true),
      jsonb_build_object('nations_competition',true,'national_team',true)
    from public.national_team_lineup_members lm
    where lm.lineup_id=v_lineup.id;

    update public.race_stage_plans sp
    set rider_equipment_json=coalesce((
          select jsonb_object_agg(lm.rider_id::text,to_jsonb(v_setup_id::text))
          from public.national_team_lineup_members lm
          where lm.lineup_id=v_lineup.id
        ),'{}'::jsonb),
        rider_roles_json=coalesce((
          select jsonb_object_agg(
            lm.rider_id::text,
            to_jsonb(case when v_event.race_type='team_time_trial' then 'domestique' else 'free_role' end)
          )
          from public.national_team_lineup_members lm
          where lm.lineup_id=v_lineup.id
        ),'{}'::jsonb),
        rider_supplies_json=coalesce((
          select jsonb_object_agg(
            lm.rider_id::text,
            jsonb_build_object(
              'source','national_team_standard_package',
              'standardized',true,
              'system_covered',true
            )
          )
          from public.national_team_lineup_members lm
          where lm.lineup_id=v_lineup.id
        ),'{}'::jsonb),
        rider_individual_tactics_json=coalesce((
          select jsonb_object_agg(
            lm.rider_id::text,
            jsonb_build_object(
              'phase_1',jsonb_build_object('command','ride_naturally'),
              'phase_2',jsonb_build_object('command','ride_naturally'),
              'phase_3',jsonb_build_object('command','ride_naturally'),
              'phase_4',jsonb_build_object('command','ride_naturally')
            )
          )
          from public.national_team_lineup_members lm
          where lm.lineup_id=v_lineup.id
        ),'{}'::jsonb),
        team_tactic_json=jsonb_build_object(
          'plan','balanced',
          'national_team',true,
          'race_type',v_event.race_type
        ),
        updated_at=now()
    where sp.id=v_stage_plan_id;

    delete from public.race_preparation_assets
    where race_preparation_id=v_prep_id
      and asset_key='team_car';

    insert into public.race_preparation_assets(
      race_preparation_id,asset_key,asset_id,display_name,assignment_scope,
      asset_snapshot_json,effect_snapshot_json,metadata,asset_slot_key
    )
    select
      v_prep_id,
      'team_car',
      x.id,
      x.display_name,
      'race',
      to_jsonb(x),
      jsonb_build_object(
        'support_value',x.support_value,
        'condition_percent',x.condition_percent
      ),
      jsonb_build_object(
        'nations_competition',true,
        'standard_package',true,
        'system_covered',true
      ),
      'team_car_'||x.slot_no::text
    from (
      select
        c.*,
        row_number() over(order by c.garage_slot,c.id)::integer as slot_no
      from public.club_team_cars c
      where c.club_id=v_team_id
        and c.status='available'
      order by c.garage_slot,c.id
      limit 3
    ) x;

    v_valid_teams:=v_valid_teams+1;
  end loop;

  select count(*)::integer
  into v_rider_count
  from public.race_participant_riders
  where race_id=v_event.race_id;

  update public.nations_group_events
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'participants_synced',v_valid_teams>0,
        'synced_team_count',v_valid_teams,
        'missing_team_lineups',v_missing_teams,
        'synced_rider_count',v_rider_count
      ),
      updated_at=now()
  where id=v_event.id;

  return jsonb_build_object(
    'status',case when v_missing_teams=0 then 'ready' else 'waiting_for_lineups' end,
    'event_id',v_event.id,
    'race_id',v_event.race_id,
    'stage_id',v_event.stage_id,
    'team_count',v_valid_teams,
    'missing_team_lineups',v_missing_teams,
    'rider_count',v_rider_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_nations_group_results_v1(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group public.nations_competition_groups%rowtype;
  v_round public.nations_competition_rounds%rowtype;
  v_entry record;
  v_team_id uuid;
  v_ttt_stage_id uuid;
  v_flat_stage_id uuid;
  v_mountain_stage_id uuid;
  v_ttt_rank integer;
  v_flat_positions integer[];
  v_mountain_positions integer[];
  v_score jsonb;
  v_finalize jsonb;
  v_scored integer:=0;
begin
  select * into v_group
  from public.nations_competition_groups
  where id=p_group_id
  for update;

  if v_group.id is null then
    raise exception 'World Nations group not found.';
  end if;

  select * into v_round
  from public.nations_competition_rounds
  where id=v_group.round_id;

  -- UUID has no max()/min() aggregate in PostgreSQL. Each Nations group has
  -- exactly one event for each race_day, so select the single UUID from a
  -- filtered array instead.
  select
    (array_agg(stage_id order by race_day) filter(where race_day=1))[1],
    (array_agg(stage_id order by race_day) filter(where race_day=2))[1],
    (array_agg(stage_id order by race_day) filter(where race_day=3))[1],
    count(*) filter(where status='completed')
  into
    v_ttt_stage_id,
    v_flat_stage_id,
    v_mountain_stage_id,
    v_scored
  from public.nations_group_events
  where group_id=v_group.id;

  if v_ttt_stage_id is null or v_flat_stage_id is null or v_mountain_stage_id is null then
    return jsonb_build_object(
      'status','waiting_for_races',
      'group_id',v_group.id
    );
  end if;

  if v_scored<>3 then
    return jsonb_build_object(
      'status','waiting_for_results',
      'group_id',v_group.id,
      'completed_events',v_scored
    );
  end if;

  v_scored:=0;

  for v_entry in
    select
      nge.id as group_entry_id,
      ce.association_id,
      ce.country_code
    from public.nations_group_entries nge
    join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
    where nge.group_id=v_group.id
      and nge.status<>'withdrawn'
    order by ce.country_code
  loop
    select technical_club_id
    into v_team_id
    from public.national_association_race_team_identities
    where association_id=v_entry.association_id;

    if v_team_id is null then
      v_team_id:=private.ensure_national_association_race_team_v1(v_entry.association_id);
    end if;

    select ts.team_rank
    into v_ttt_rank
    from public.race_stage_team_states ts
    join public.race_stage_simulation_runs sr on sr.id=ts.simulation_run_id
    where ts.stage_id=v_ttt_stage_id
      and ts.team_id=v_team_id
      and sr.status='completed'
    order by sr.created_at desc
    limit 1;

    v_ttt_rank:=coalesce(v_ttt_rank,999);

    select coalesce(array_agg(r.rank order by r.rank) filter(where r.rank is not null),'{}'::integer[])
    into v_flat_positions
    from public.race_stage_results r
    where r.stage_id=v_flat_stage_id
      and r.team_id=v_team_id
      and r.status='finished';

    select coalesce(array_agg(r.rank order by r.rank) filter(where r.rank is not null),'{}'::integer[])
    into v_mountain_positions
    from public.race_stage_results r
    where r.stage_id=v_mountain_stage_id
      and r.team_id=v_team_id
      and r.status='finished';

    v_score:=public.record_nations_group_score_v1(
      v_entry.group_entry_id,
      v_ttt_rank,
      v_flat_positions,
      v_mountain_positions
    );

    v_scored:=v_scored+1;
  end loop;

  v_finalize:=public.finalize_nations_group_v1(v_group.id);

  if v_finalize->>'status'='unresolved_tie_at_cutoff' then
    return jsonb_build_object(
      'status','unresolved_tie_at_cutoff',
      'group_id',v_group.id,
      'scored_nations',v_scored,
      'finalization',v_finalize
    );
  end if;

  return jsonb_build_object(
    'status','completed',
    'group_id',v_group.id,
    'round_id',v_round.id,
    'scored_nations',v_scored,
    'finalization',v_finalize
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_nations_race_runtime_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_season integer;
  v_edition_id uuid;
  v_event record;
  v_event_result jsonb;
  v_group record;
  v_group_result jsonb;
  v_round record;
  v_round_result jsonb;
  v_races_created integer:=0;
  v_participant_syncs integer:=0;
  v_events_completed integer:=0;
  v_groups_completed integer:=0;
  v_rounds_completed integer:=0;
  v_ties integer:=0;
begin
  select season_number
  into v_season
  from public.game_state
  where id=true;

  select id
  into v_edition_id
  from public.nations_competition_editions
  where season_number=v_season
    and status<>'completed'
  limit 1;

  if v_edition_id is null then
    return jsonb_build_object(
      'status','no_active_edition',
      'season_number',v_season,
      'game_date',v_today
    );
  end if;

  for v_event in
    select e.id,e.race_id,e.stage_id,e.event_date,e.status
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id=e.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition_id
      and e.status not in ('completed','cancelled')
      and e.event_date is not null
      and e.event_date<=v_today+21
    order by e.event_date,e.race_day
  loop
    if v_event.race_id is null or v_event.stage_id is null then
      v_event_result:=public.ensure_nations_group_event_race_v1(v_event.id);
      if v_event_result->>'status'='created' then
        v_races_created:=v_races_created+1;
      end if;
    end if;

    v_event_result:=public.sync_nations_group_event_participants_v1(v_event.id);
    if v_event_result->>'status' in ('ready','waiting_for_lineups') then
      v_participant_syncs:=v_participant_syncs+1;
    end if;

    update public.nations_group_events e
    set status=case
        when exists(
          select 1
          from public.race_stage_simulation_runs sr
          where sr.stage_id=e.stage_id
            and sr.status='completed'
        ) then 'completed'
        when exists(
          select 1
          from public.race_stage_simulation_runs sr
          where sr.stage_id=e.stage_id
            and sr.status='running'
        ) then 'running'
        else e.status
      end,
      updated_at=case
        when exists(
          select 1
          from public.race_stage_simulation_runs sr
          where sr.stage_id=e.stage_id
            and sr.status in ('running','completed')
        ) then now()
        else e.updated_at
      end
    where e.id=v_event.id;

    if exists(
      select 1
      from public.nations_group_events e
      where e.id=v_event.id
        and e.status='completed'
    ) and v_event.status<>'completed' then
      v_events_completed:=v_events_completed+1;
    end if;
  end loop;

  for v_group in
    select g.id
    from public.nations_competition_groups g
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition_id
      and g.status<>'completed'
      and (
        select count(*)
        from public.nations_group_events e
        where e.group_id=g.id
          and e.status='completed'
      )=3
    order by r.round_index,g.group_number
  loop
    v_group_result:=public.process_nations_group_results_v1(v_group.id);

    if v_group_result->>'status'='completed' then
      v_groups_completed:=v_groups_completed+1;
    elsif v_group_result->>'status'='unresolved_tie_at_cutoff' then
      v_ties:=v_ties+1;
    end if;
  end loop;

  for v_round in
    select r.id
    from public.nations_competition_rounds r
    where r.edition_id=v_edition_id
      and r.status<>'completed'
      and not exists(
        select 1
        from public.nations_competition_groups g
        where g.round_id=r.id
          and g.status<>'completed'
      )
    order by r.round_index
  loop
    v_round_result:=public.finalize_nations_round_v1(v_round.id);
    if v_round_result->>'status' in ('completed','edition_completed') then
      v_rounds_completed:=v_rounds_completed+1;
    end if;
  end loop;

  return jsonb_build_object(
    'status','processed',
    'season_number',v_season,
    'game_date',v_today,
    'edition_id',v_edition_id,
    'races_created',v_races_created,
    'participant_syncs',v_participant_syncs,
    'events_completed',v_events_completed,
    'groups_completed',v_groups_completed,
    'rounds_completed',v_rounds_completed,
    'unresolved_ties',v_ties
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_national_association_nations_runtime_v3()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_core jsonb;
  v_races jsonb;
  v_health jsonb;
begin
  v_core:=public.process_national_association_nations_runtime_v1();
  v_races:=public.process_nations_race_runtime_v1();
  v_health:=public.check_nations_operations_health_v1();

  return coalesce(v_core,'{}'::jsonb)
    || jsonb_build_object(
      'race_runtime',v_races,
      'operations_health',v_health
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_nations_operations_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_season integer;
  v_today date;
  v_edition public.nations_competition_editions%rowtype;
  v_health jsonb;
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required.';
  end if;

  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_today
  from public.game_state gs
  where gs.id=true;

  select *
  into v_edition
  from public.nations_competition_editions e
  where e.season_number=v_season
  limit 1;

  v_health:=public.check_nations_operations_health_v1();

  return jsonb_build_object(
    'season_number',v_season,
    'game_date',v_today,
    'health',v_health,
    'edition',case
      when v_edition.id is null then null
      else jsonb_build_object(
        'id',v_edition.id,
        'status',v_edition.status,
        'active_association_count',v_edition.active_association_count,
        'finalist_target',v_edition.finalist_target,
        'host_country_code',v_edition.host_country_code,
        'champion_country_code',v_edition.champion_country_code,
        'created_on_game_date',v_edition.created_on_game_date,
        'completed_on_game_date',v_edition.completed_on_game_date
      )
    end,
    'rounds',case
      when v_edition.id is null then '[]'::jsonb
      else coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'round_id',r.id,
            'round_index',r.round_index,
            'round_type',r.round_type,
            'round_label',r.round_label,
            'status',r.status,
            'starts_on',r.starts_on_game_date,
            'ends_on',r.ends_on_game_date,
            'entrants_target',r.entrants_target,
            'advance_target',r.advance_target,
            'group_count',r.group_count,
            'groups',coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'group_id',g.id,
                  'group_number',g.group_number,
                  'group_label',g.group_label,
                  'status',g.status,
                  'planned_entrant_count',g.planned_entrant_count,
                  'planned_advance_count',g.planned_advance_count,
                  'entry_count',(select count(*) from public.nations_group_entries nge where nge.group_id=g.id),
                  'scored_entry_count',(select count(*) from public.nations_group_entries nge where nge.group_id=g.id and nge.total_points is not null),
                  'event_count',(select count(*) from public.nations_group_events e where e.group_id=g.id),
                  'scheduled_event_count',(select count(*) from public.nations_group_events e where e.group_id=g.id and e.event_date is not null),
                  'overdue_event_count',(select count(*) from public.nations_group_events e where e.group_id=g.id and e.event_date<v_today and e.status in ('planned','scheduled','ready')),
                  'events',coalesce((
                    select jsonb_agg(
                      jsonb_build_object(
                        'event_id',e.id,
                        'race_day',e.race_day,
                        'race_type',e.race_type,
                        'event_date',e.event_date,
                        'status',e.status,
                        'race_id',e.race_id,
                        'stage_id',e.stage_id
                      )
                      order by e.race_day
                    )
                    from public.nations_group_events e
                    where e.group_id=g.id
                  ),'[]'::jsonb)
                )
                order by g.group_number
              )
              from public.nations_competition_groups g
              where g.round_id=r.id
            ),'[]'::jsonb)
          )
          order by r.round_index
        )
        from public.nations_competition_rounds r
        where r.edition_id=v_edition.id
      ),'[]'::jsonb)
    end,
    'team_checks',jsonb_build_object(
      'nations_squads',(select count(*) from public.national_team_squads s where s.season_number=v_season and s.cycle_key like 'nations:%'),
      'confirmed_squads',(select count(*) from public.national_team_squads s where s.season_number=v_season and s.cycle_key like 'nations:%' and s.status in ('confirmed','on_duty','completed')),
      'invalid_squads',(select count(*) from public.national_team_squads s where s.season_number=v_season and s.cycle_key like 'nations:%' and s.status in ('confirmed','on_duty') and (select count(*) from public.national_team_squad_members sm where sm.squad_id=s.id)<>10),
      'confirmed_lineups',(select count(*) from public.national_team_lineups l join public.national_team_squads s on s.id=l.squad_id where s.season_number=v_season and s.cycle_key like 'nations:%' and l.status in ('confirmed','locked','completed')),
      'invalid_lineups',(select count(*) from public.national_team_lineups l join public.national_team_squads s on s.id=l.squad_id where s.season_number=v_season and s.cycle_key like 'nations:%' and l.status in ('confirmed','locked','completed') and (select count(*) from public.national_team_lineup_members lm where lm.lineup_id=l.id)<>7)
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_admin_nations_runtime_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required.';
  end if;

  return public.process_national_association_nations_runtime_v4();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_nations_race_runtime_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_core jsonb;
  v_season integer;
  v_edition_id uuid;
  v_event record;
  v_expected integer;
  v_valid_teams integer;
  v_sim_started boolean;
  v_ready integer:=0;
  v_blocked integer:=0;
begin
  v_core:=public.process_nations_race_runtime_v1();

  select season_number into v_season
  from public.game_state where id=true;

  select id into v_edition_id
  from public.nations_competition_editions
  where season_number=v_season
    and status<>'completed'
  limit 1;

  if v_edition_id is null then
    return coalesce(v_core,'{}'::jsonb)
      || jsonb_build_object('race_gates_ready',0,'race_gates_blocked',0);
  end if;

  for v_event in
    select e.id,e.group_id,e.race_id,e.stage_id,e.status
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id=e.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition_id
      and e.race_id is not null
      and e.stage_id is not null
      and e.status not in ('completed','cancelled')
  loop
    select count(*)::integer
    into v_expected
    from public.nations_group_entries nge
    where nge.group_id=v_event.group_id
      and nge.status<>'withdrawn';

    select count(*)::integer
    into v_valid_teams
    from (
      select rpr.team_id
      from public.race_participant_riders rpr
      where rpr.race_id=v_event.race_id
        and rpr.team_id is not null
      group by rpr.team_id
      having count(*)=7
    ) x;

    select exists(
      select 1
      from public.race_stage_simulation_runs sr
      where sr.stage_id=v_event.stage_id
        and sr.status in ('running','completed')
    )
    into v_sim_started;

    update public.race_entry_rules
    set target_teams=greatest(v_expected,1),
        min_teams=greatest(v_expected,1),
        max_teams=greatest(v_expected,1),
        min_riders_per_team=7,
        max_riders_per_team=7,
        applications_status='closed',
        updated_at=now()
    where race_id=v_event.race_id;

    if not v_sim_started then
      if v_expected>0 and v_valid_teams=v_expected then
        update public.races
        set status='scheduled',updated_at=now()
        where id=v_event.race_id
          and status in ('draft','scheduled');

        update public.nations_group_events
        set status='ready',
            metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
              'race_gate_ready',true,
              'expected_teams',v_expected,
              'valid_7_rider_teams',v_valid_teams
            ),
            updated_at=now()
        where id=v_event.id
          and status not in ('running','completed','cancelled');

        v_ready:=v_ready+1;
      else
        update public.races
        set status='draft',updated_at=now()
        where id=v_event.race_id
          and status in ('draft','scheduled');

        update public.nations_group_events
        set status='waiting_for_lineups',
            metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
              'race_gate_ready',false,
              'expected_teams',v_expected,
              'valid_7_rider_teams',v_valid_teams
            ),
            updated_at=now()
        where id=v_event.id
          and status not in ('running','completed','cancelled');

        v_blocked:=v_blocked+1;
      end if;
    end if;
  end loop;

  return coalesce(v_core,'{}'::jsonb)
    || jsonb_build_object(
      'race_gates_ready',v_ready,
      'race_gates_blocked',v_blocked
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_national_association_nations_runtime_v4()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_core jsonb;
  v_races jsonb;
  v_health jsonb;
begin
  v_core:=public.process_national_association_nations_runtime_v1();
  v_races:=public.process_nations_race_runtime_v2();
  v_health:=public.check_nations_operations_health_v1();

  return coalesce(v_core,'{}'::jsonb)
    || jsonb_build_object(
      'race_runtime',v_races,
      'operations_health',v_health
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_nations_group_partial_scores_v1(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group public.nations_competition_groups%rowtype;
  v_entry record;
  v_team_id uuid;
  v_event record;
  v_ttt_points integer;
  v_flat_points integer;
  v_mountain_points integer;
  v_ttt_rank integer;
  v_positions integer[];
  v_race_wins integer;
  v_podiums integer;
  v_best_day3 integer;
  v_updated integer:=0;
begin
  select * into v_group
  from public.nations_competition_groups
  where id=p_group_id;

  if v_group.id is null then
    raise exception 'World Nations group not found.';
  end if;

  for v_entry in
    select nge.id as group_entry_id,ce.association_id
    from public.nations_group_entries nge
    join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
    where nge.group_id=v_group.id
      and nge.status<>'withdrawn'
  loop
    select technical_club_id
    into v_team_id
    from public.national_association_race_team_identities
    where association_id=v_entry.association_id;

    v_ttt_points:=0;
    v_flat_points:=0;
    v_mountain_points:=0;
    v_ttt_rank:=null;
    v_race_wins:=0;
    v_podiums:=0;
    v_best_day3:=null;

    for v_event in
      select e.*
      from public.nations_group_events e
      where e.group_id=v_group.id
        and e.status='completed'
        and e.stage_id is not null
      order by e.race_day
    loop
      if v_event.race_type='team_time_trial' then
        select ts.team_rank
        into v_ttt_rank
        from public.race_stage_team_states ts
        join public.race_stage_simulation_runs sr on sr.id=ts.simulation_run_id
        where ts.stage_id=v_event.stage_id
          and ts.team_id=v_team_id
          and sr.status='completed'
        order by sr.created_at desc
        limit 1;

        v_ttt_points:=public.nations_ttt_points_v1(coalesce(v_ttt_rank,999));
        if v_ttt_rank=1 then v_race_wins:=v_race_wins+1; end if;
        if v_ttt_rank between 1 and 3 then v_podiums:=v_podiums+1; end if;

      elsif v_event.race_type='flat_road_race' then
        select coalesce(array_agg(r.rank order by r.rank) filter(where r.rank is not null),'{}'::integer[])
        into v_positions
        from public.race_stage_results r
        where r.stage_id=v_event.stage_id
          and r.team_id=v_team_id
          and r.status='finished';

        v_flat_points:=public.calculate_nation_road_race_points_v1(v_positions);
        if 1=any(coalesce(v_positions,'{}'::integer[])) then
          v_race_wins:=v_race_wins+1;
        end if;
        v_podiums:=v_podiums+(
          select count(*)::integer
          from unnest(coalesce(v_positions,'{}'::integer[])) p
          where p between 1 and 3
        );

      else
        select coalesce(array_agg(r.rank order by r.rank) filter(where r.rank is not null),'{}'::integer[])
        into v_positions
        from public.race_stage_results r
        where r.stage_id=v_event.stage_id
          and r.team_id=v_team_id
          and r.status='finished';

        v_mountain_points:=public.calculate_nation_road_race_points_v1(v_positions);
        select min(p) into v_best_day3
        from unnest(coalesce(v_positions,'{}'::integer[])) p
        where p>0;

        if 1=any(coalesce(v_positions,'{}'::integer[])) then
          v_race_wins:=v_race_wins+1;
        end if;
        v_podiums:=v_podiums+(
          select count(*)::integer
          from unnest(coalesce(v_positions,'{}'::integer[])) p
          where p between 1 and 3
        );
      end if;
    end loop;

    update public.nations_group_entries
    set ttt_points=v_ttt_points,
        flat_points=v_flat_points,
        mountain_points=v_mountain_points,
        total_points=v_ttt_points+v_flat_points+v_mountain_points,
        race_wins=v_race_wins,
        podium_finishes=v_podiums,
        ttt_rank=v_ttt_rank,
        best_day3_rider_rank=v_best_day3,
        updated_at=now()
    where id=v_entry.group_entry_id;

    v_updated:=v_updated+1;
  end loop;

  return jsonb_build_object(
    'group_id',v_group.id,
    'updated_nations',v_updated,
    'completed_race_days',(
      select count(*) from public.nations_group_events e
      where e.group_id=v_group.id and e.status='completed'
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_admin_nations_e2e_validation_v1(p_association_count integer DEFAULT 48)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required.';
  end if;

  return private.run_nations_e2e_validation_core_v1(p_association_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_admin_nations_e2e_fixture_v1(p_association_count integer DEFAULT 48)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required.';
  end if;

  return private.run_nations_e2e_fixture_core_v1(p_association_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_admin_world_nations_e2e_validation_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required.';
  end if;

  return private.world_nations_e2e_validation_core_v4();
end;
$function$
;

