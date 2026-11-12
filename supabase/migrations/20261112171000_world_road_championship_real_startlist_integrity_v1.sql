-- World Road Championship real-startlist integrity safeguards, captured from the
-- verified production definitions on 2026-11-12. Idempotent CREATE OR REPLACE.
-- Existing Season 1 race entries, simulation runs, final rankings and winner are untouched.
-- Fixes the source disagreement: 110 WRC riders versus 200 unrelated AI club entries.

-- Source: public.fill_race_ai_teams_v1(uuid)
CREATE OR REPLACE FUNCTION public.fill_race_ai_teams_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_category text;
  v_individual_only boolean := false;
  v_primary jsonb := '{}'::jsonb;
  v_hierarchy jsonb := '{}'::jsonb;
begin
  select category::text,
         coalesce(metadata->>'individual_only','false')='true'
  into v_category,v_individual_only
  from public.races
  where id=p_race_id;

  if not found then
    return jsonb_build_object('success',false,'error','race_not_found');
  end if;

  -- National/individual events build their own rider lists; no club AI filling.
  if v_individual_only or v_category in ('WRC','NC','NCQ') then
    return jsonb_build_object(
      'success',true,'skipped',true,
      'reason','individual_national_field_managed_by_championship',
      'ai_entries_added',0
    );
  end if;

  /*
   * Preserve the race-class-specific composition model as the primary policy.
   * The universal hierarchy only fills whatever shortage remains.
   */

  -- Nations entrants are assigned by the official group draw, not AI filler.
  if v_category in ('WNQ','WNF') then
    return jsonb_build_object(
      'success', true, 'skipped', true,
      'reason', 'nations_entries_managed_by_group_draw',
      'ai_entries_added', 0
    );
  end if;

  if v_category in ('1.UWT','2.UWT') then
    v_primary := public.fill_race_ai_teams_uwt_v1(p_race_id);
  else
    v_primary := public.fill_race_ai_teams_pre_uwt_policy_v1(p_race_id);
  end if;

  v_hierarchy := public.fill_race_ai_teams_hierarchy_v1(p_race_id);

  return coalesce(v_primary,'{}'::jsonb) || jsonb_build_object(
    'universal_hierarchy_fallback',v_hierarchy,
    'universal_hierarchy_policy','worldteam_proteam_continental_amateur_v1'
  );
end;
$function$

-- Source: public.universal_race_stage_get_calculation_payload_full_v1(uuid)
CREATE OR REPLACE FUNCTION public.universal_race_stage_get_calculation_payload_full_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_id uuid;
  v_stage_number integer;
  v_race jsonb;
  v_stage jsonb;
  v_profile jsonb;
  v_rider_inputs jsonb;
  v_phase_commands jsonb;
  v_phase9_inputs jsonb;
  v_pre_stage_leaders jsonb;
  v_stage_points jsonb;
  v_participant_teams jsonb;
  v_participant_riders jsonb;
  v_stage_plans jsonb;
  v_stage_plan_riders jsonb;
  v_stage_start_game_at timestamp without time zone;
  v_lock_game_at timestamp without time zone;
  v_jersey_eligibility jsonb;
  v_disqualified jsonb;
begin
  if p_stage_id is null then
    raise exception using errcode='22023', message='stage_id is required';
  end if;

  select
    s.race_id,
    s.stage_number,
    to_jsonb(s),
    s.stage_date::timestamp
      + make_interval(
          hours=>coalesce(s.planned_start_hour_number,12),
          mins=>coalesce(s.planned_start_minute,0)
        )
  into
    v_race_id,
    v_stage_number,
    v_stage,
    v_stage_start_game_at
  from public.race_stages s
  where s.id=p_stage_id;

  if v_race_id is null then
    raise exception using
      errcode='P0002',
      message=format('Stage %s was not found.',p_stage_id);
  end if;

  v_lock_game_at:=v_stage_start_game_at-interval '3 hours';

  -- Hard sporting decision before immutable engine input is assembled.
  v_jersey_eligibility:=
    public.universal_race_stage_enforce_mandatory_jerseys_v1(p_stage_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'team_id',d.team_id,
        'from_stage_id',d.from_stage_id,
        'from_stage_number',d.from_stage_number,
        'reason_code',d.reason_code,
        'required_jersey_units',d.required_jersey_units,
        'available_jersey_units',d.available_jersey_units,
        'missing_jersey_units',d.missing_jersey_units
      )
      order by d.team_id
    ),
    '[]'::jsonb
  )
  into v_disqualified
  from public.race_team_stage_disqualifications d
  where d.race_id=v_race_id
    and d.from_stage_number<=v_stage_number
    and d.reason_code <> 'mandatory_race_jersey_shortage';

  select to_jsonb(r)
  into v_race
  from public.races r
  where r.id=v_race_id;

  v_profile:=coalesce(
    public.get_race_stage_profile_detail_v1(p_stage_id),
    '{}'::jsonb
  );

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.team_id,x.rider_id),
    '[]'::jsonb
  )
  into v_rider_inputs
  from public.race_engine_get_stage_rider_inputs_v1(p_stage_id) x
  where not public.universal_race_team_disqualified_for_stage_v1(
    v_race_id,x.team_id,v_stage_number
  );

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.team_id,x.rider_id),
    '[]'::jsonb
  )
  into v_phase_commands
  from public.race_engine_get_stage_phase_commands_v1(p_stage_id) x
  where not public.universal_race_team_disqualified_for_stage_v1(
    v_race_id,x.team_id,v_stage_number
  );

  v_phase9_inputs:=coalesce(
    public.race_engine_get_stage_phase9_inputs_v1(p_stage_id),
    '{}'::jsonb
  );

  v_phase9_inputs:=
    public.universal_race_stage_filter_phase9_eligible_v1(
      p_stage_id,
      v_phase9_inputs
    );

  -- Phase 11D.1: one exact durable jersey/use for every remaining rider.
  v_phase9_inputs:=
    public.universal_race_stage_force_mandatory_jersey_phase9_v1(
      p_stage_id,
      v_phase9_inputs
    );

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
  into v_pre_stage_leaders
  from public.get_race_stage_pre_stage_leaders_v1(p_stage_id) x
  where nullif(to_jsonb(x)->>'team_id','') is null
     or (
       (to_jsonb(x)->>'team_id')
         ~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not public.universal_race_team_disqualified_for_stage_v1(
         v_race_id,
         (to_jsonb(x)->>'team_id')::uuid,
         v_stage_number
       )
     );

  perform public.sync_race_stage_points_from_stage_json_v1(p_stage_id,false);

  select coalesce(
    jsonb_agg(to_jsonb(p) order by p.sort_order,p.km_from_start,p.id),
    '[]'::jsonb
  )
  into v_stage_points
  from public.race_stage_points p
  where p.stage_id=p_stage_id;

  select coalesce(
    jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),
    '[]'::jsonb
  )
  into v_participant_teams
  from public.race_participant_teams_v1 t
  where t.race_id=v_race_id
    and lower(coalesce(t.status,'accepted'))='accepted'
    and not public.universal_race_team_disqualified_for_stage_v1(
      v_race_id,t.club_id,v_stage_number
    );


  -- WRC is an individual event. Match the 1-per-country confirmed riders
  -- to its own accepted race_participant_teams, not race_team_entries_v1.
  if exists (
    select 1 from public.world_road_championship_editions wrc
    where wrc.race_id=v_race_id
  ) then
    select coalesce(
      jsonb_agg(to_jsonb(t) order by t.team_id),
      '[]'::jsonb
    )
    into v_participant_teams
    from public.race_participant_teams t
    where t.race_id=v_race_id and t.status='accepted'
      and not public.universal_race_team_disqualified_for_stage_v1(
        v_race_id,t.team_id,v_stage_number
      );
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.start_number nulls last,r.rider_id),
    '[]'::jsonb
  )
  into v_participant_riders
  from public.race_participant_riders_v1 r
  where r.race_id=v_race_id
    and not public.universal_race_team_disqualified_for_stage_v1(
      v_race_id,r.team_id,v_stage_number
    );

  select coalesce(
    jsonb_agg(
      to_jsonb(p)||jsonb_build_object(
        'team_id',coalesce(rp.participating_club_id,rp.club_id),
        'club_id',rp.club_id,
        'participating_club_id',rp.participating_club_id,
        'race_preparation_status',rp.status
      )
      order by coalesce(rp.participating_club_id,rp.club_id),p.id
    ),
    '[]'::jsonb
  )
  into v_stage_plans
  from public.race_stage_plans p
  join public.race_preparations rp
    on rp.id=p.race_preparation_id
  where p.stage_id=p_stage_id
    and not public.universal_race_team_disqualified_for_stage_v1(
      v_race_id,
      coalesce(rp.participating_club_id,rp.club_id),
      v_stage_number
    );

  select coalesce(
    jsonb_agg(
      to_jsonb(pr)||jsonb_build_object(
        'team_id',coalesce(rp.participating_club_id,rp.club_id),
        'race_stage_plan_id',p.id
      )
      order by coalesce(rp.participating_club_id,rp.club_id),pr.rider_id
    ),
    '[]'::jsonb
  )
  into v_stage_plan_riders
  from public.race_stage_plan_riders pr
  join public.race_stage_plans p
    on p.id=pr.race_stage_plan_id
  join public.race_preparations rp
    on rp.id=p.race_preparation_id
  where p.stage_id=p_stage_id
    and not public.universal_race_team_disqualified_for_stage_v1(
      v_race_id,
      coalesce(rp.participating_club_id,rp.club_id),
      v_stage_number
    );


  -- A completed championship cannot have a partial or AI-club-filtered field.
  -- Refuse the calculation BEFORE any official results are published.
  if exists (
    select 1 from public.world_road_championship_editions wrc
    where wrc.race_id=v_race_id
  ) then
    if jsonb_array_length(v_rider_inputs)=0
       or jsonb_array_length(v_rider_inputs) <>
          (select count(*) from public.race_participant_riders pr
           where pr.race_id=v_race_id)
       or jsonb_array_length(v_participant_riders)<>jsonb_array_length(v_rider_inputs)
       or jsonb_array_length(v_rider_inputs) <>
          coalesce((select wrc.confirmed_count from public.world_road_championship_editions wrc
                    where wrc.race_id=v_race_id),0)
       or exists (
          select 1
          from jsonb_array_elements(v_participant_riders) pr
          where not exists (
            select 1 from jsonb_array_elements(v_participant_teams) pt
            where pt.value->>'team_id'=pr.value->>'team_id'
          )
       )
    then
      raise exception using
        errcode='P0001',
        message=format(
          'World Championship simulation input incomplete: confirmed %s, startlist %s, rider inputs %s, payload riders %s, payload teams %s',
          (select wrc.confirmed_count from public.world_road_championship_editions wrc
           where wrc.race_id=v_race_id),
          (select count(*) from public.race_participant_riders pr where pr.race_id=v_race_id),
          jsonb_array_length(v_rider_inputs),jsonb_array_length(v_participant_riders),
          jsonb_array_length(v_participant_teams)
        );
    end if;
  end if;

  return jsonb_build_object(
    'contract','universal_race_calculation_payload_v3_phase11b',
    'race',coalesce(v_race,'{}'::jsonb),
    'stage',coalesce(v_stage,'{}'::jsonb),
    'profile',coalesce(v_profile,'{}'::jsonb),
    'participant_teams',v_participant_teams,
    'participant_riders',v_participant_riders,
    'rider_inputs',v_rider_inputs,
    'phase_commands',v_phase_commands,
    'phase9_inputs',v_phase9_inputs,
    'pre_stage_leaders',v_pre_stage_leaders,
    'stage_points',v_stage_points,
    'locked_plans',v_stage_plans,
    'stage_plan_riders',v_stage_plan_riders,
    'mandatory_jersey_eligibility',v_jersey_eligibility,
    'disqualified_teams',v_disqualified,
    'lifecycle',jsonb_build_object(
      'lock_game_at',v_lock_game_at,
      'stage_start_game_at',v_stage_start_game_at,
      'replay_duration_real_seconds',900,
      'official_outputs_persisted',false,
      'phase11_persistence_applied',false,
      'verification_only',false
    )
  );
end;
$function$

-- Source: public.world_road_championship_process_results_base_v1()
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

    -- Every confirmed startlist rider must have an authoritative result row
    -- (finished, DNS, DNF, or other explicit status) before a world title
    -- is marked fully completed. Existing historical outcomes are unchanged.
    if exists (
      select 1 from public.race_participant_riders pr
      where pr.race_id=e.race_id
        and not exists (
          select 1 from public.race_stage_results rs
          where rs.stage_id=v_stage_id and rs.rider_id=pr.rider_id
        )
    ) or v_result_count <> (
      select count(*) from public.race_participant_riders pr
      where pr.race_id=e.race_id
    ) then
      raise warning 'WRC race % remains unverified: result rows % vs confirmed startlist %',
        e.race_id,v_result_count,
        (select count(*) from public.race_participant_riders pr where pr.race_id=e.race_id);
      continue;
    end if;


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
