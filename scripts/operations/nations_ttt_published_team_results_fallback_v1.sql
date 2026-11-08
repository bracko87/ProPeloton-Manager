-- National teams World Nations TTT: use authoritative published results
-- wherever the dedicated race_stage_team_states output has no rows.
-- No race results, finish times, or scoring scales are changed.
CREATE OR REPLACE FUNCTION public.get_nations_competition_event_page_v1(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_event public.nations_group_events%rowtype;
  v_group public.nations_competition_groups%rowtype;
  v_round public.nations_competition_rounds%rowtype;
  v_edition public.nations_competition_editions%rowtype;
  v_stage public.race_stages%rowtype;
  v_profile public.race_stage_profile_details%rowtype;
  v_stage_id uuid;
  v_host_name text;
  v_viewer_has_participant boolean:=false;
  v_results jsonb:='[]'::jsonb;
  v_participants jsonb:='[]'::jsonb;
begin
  select * into v_event
  from public.nations_group_events
  where id=p_event_id;

  if v_event.id is null then
    raise exception 'World Nations race not found.';
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

  v_stage_id:=coalesce(v_event.stage_id,v_event.source_stage_id);

  if v_stage_id is not null then
    select * into v_stage
    from public.race_stages
    where id=v_stage_id;

    select * into v_profile
    from public.race_stage_profile_details
    where stage_id=v_stage_id
    limit 1;
  end if;

  select coalesce(c.name,v_event.host_country_code,'International')
  into v_host_name
  from public.countries c
  where upper(c.code)=upper(v_event.host_country_code)
  limit 1;

  v_host_name:=coalesce(v_host_name,v_event.host_country_code,'International');

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'group_entry_id',nge.id,
      'competition_entry_id',ce.id,
      'association_id',ce.association_id,
      'association_name',a.name,
      'country_code',ce.country_code,
      'seed_position',nge.seed_position,
      'status',nge.status,
      'team_id',ti.technical_club_id,
      'flag_url','https://flagcdn.com/w160/'||lower(ce.country_code)||'.png'
    )
    order by nge.seed_position nulls last,ce.country_code
  ),'[]'::jsonb)
  into v_participants
  from public.nations_group_entries nge
  join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
  join public.national_associations a on a.id=ce.association_id
  left join public.national_association_race_team_identities ti
    on ti.association_id=ce.association_id
  where nge.group_id=v_group.id
    and nge.status<>'withdrawn';

  if v_uid is not null then
    select exists(
      select 1
      from public.nations_group_entries nge
      join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
      join public.national_association_memberships m
        on m.association_id=ce.association_id
       and m.user_id=v_uid
       and m.status='active'
      where nge.group_id=v_group.id
        and nge.status<>'withdrawn'
    )
    into v_viewer_has_participant;
  end if;

  if v_event.stage_id is not null then
    if v_event.race_type='team_time_trial' then
      with raw as (
        select
          ce.association_id,
          a.name as association_name,
          ce.country_code,
          coalesce(official.team_rank,ts.team_rank) as rank,
          coalesce(official.team_finish_time_seconds,ts.team_finish_time_seconds) as elapsed_seconds,
          public.nations_ttt_points_v1(coalesce(official.team_rank,ts.team_rank,999)) as points
        from public.nations_group_entries nge
        join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
        join public.national_associations a on a.id=ce.association_id
        left join public.national_association_race_team_identities ti
          on ti.association_id=ce.association_id
        left join lateral (
          select x.team_rank,x.team_finish_time_seconds
          from public.race_stage_team_states x
          join public.race_stage_simulation_runs sr on sr.id=x.simulation_run_id
          where x.stage_id=v_event.stage_id
            and x.team_id=ti.technical_club_id
            and sr.status='completed'
          order by sr.created_at desc
          limit 1
        ) ts on true
        -- Production TTT outputs authoritative seven-rider result rows, not
        -- necessarily a row in race_stage_team_states. Use the fourth finisher
        -- for team time and the existing group-scoped official rank function.
        -- Never use an un-published simulation for this fallback.
        left join lateral (
          select
            private.nations_official_ttt_group_rank_v2(
              v_group.id,v_event.stage_id,ti.technical_club_id
            ) as team_rank,
            (
              select (array_agg(rr.elapsed_seconds order by rr.elapsed_seconds,rr.rank))[4]
              from public.race_stage_results rr
              join public.race_stage_authoritative_runs ar
                on ar.stage_id=rr.stage_id
               and ar.simulation_run_id=rr.simulation_run_id
              where rr.stage_id=v_event.stage_id
                and rr.team_id=ti.technical_club_id
                and rr.status='finished'
                and rr.elapsed_seconds is not null
            ) as team_finish_time_seconds
        ) official on true
        where nge.group_id=v_group.id
          and nge.status<>'withdrawn'
      ),
      timed as (
        select raw.*,
          case
            when elapsed_seconds is null then null
            else elapsed_seconds-min(elapsed_seconds) over()
          end as gap_seconds
        from raw
      )
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'rank',rank,
          'association_id',association_id,
          'association_name',association_name,
          'country_code',country_code,
          'points',points,
          'elapsed_seconds',elapsed_seconds,
          'gap_seconds',gap_seconds,
          'best_rider_rank',null
        )
        order by rank nulls last,country_code
      ),'[]'::jsonb)
      into v_results
      from timed
      where rank is not null;
    else
      with positions as (
        select
          ce.association_id,
          a.name as association_name,
          ce.country_code,
          coalesce(array_agg(rr.rank order by rr.rank)
            filter(where rr.rank is not null),'{}'::integer[]) as finish_positions
        from public.nations_group_entries nge
        join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
        join public.national_associations a on a.id=ce.association_id
        left join public.national_association_race_team_identities ti
          on ti.association_id=ce.association_id
        left join public.race_stage_results rr
          on rr.stage_id=v_event.stage_id
         and rr.team_id=ti.technical_club_id
         and rr.status='finished'
        where nge.group_id=v_group.id
          and nge.status<>'withdrawn'
        group by ce.association_id,a.name,ce.country_code
      ),
      scored as (
        select
          p.*,
          public.calculate_nation_road_race_points_v1(p.finish_positions) as points,
          (select min(x) from unnest(p.finish_positions) x) as best_rider_rank
        from positions p
      ),
      ranked as (
        select
          s.*,
          row_number() over(
            order by s.points desc,s.best_rider_rank asc nulls last,s.country_code
          )::integer as rank
        from scored s
        where cardinality(s.finish_positions)>0
      )
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'rank',rank,
          'association_id',association_id,
          'association_name',association_name,
          'country_code',country_code,
          'points',points,
          'elapsed_seconds',null,
          'gap_seconds',null,
          'best_rider_rank',best_rider_rank
        )
        order by rank
      ),'[]'::jsonb)
      into v_results
      from ranked;
    end if;
  end if;

  return jsonb_build_object(
    'event_id',v_event.id,
    'edition_id',v_edition.id,
    'season_number',v_edition.season_number,
    'competition_name',v_edition.competition_name,
    'round_id',v_round.id,
    'round_index',v_round.round_index,
    'round_type',v_round.round_type,
    'round_label',v_round.round_label,
    'group_id',v_group.id,
    'group_number',v_group.group_number,
    'group_label',v_group.group_label,
    'race_day',v_event.race_day,
    'race_type',v_event.race_type,
    'event_date',v_event.event_date,
    'status',v_event.status,
    'race_id',v_event.race_id,
    'generated_stage_id',v_event.stage_id,
    'source_stage_id',v_event.source_stage_id,
    'host_association_id',v_event.host_association_id,
    'host_country_code',v_event.host_country_code,
    'host_country_name',v_host_name,
    'host_flag_url',
      case
        when v_event.host_country_code is null then null
        else 'https://flagcdn.com/w320/'||lower(v_event.host_country_code)||'.png'
      end,
    'team_count',jsonb_array_length(v_participants),
    'advancing_places',v_group.planned_advance_count,
    'participants',v_participants,
    'participants_known',jsonb_array_length(v_participants)>0,
    'results',v_results,
    'viewer_has_participant',v_viewer_has_participant,
    'start_time_label',coalesce(v_stage.planned_start_time_label,null),
    'expected_max_temp_c',
      case
        when jsonb_typeof(coalesce(v_stage.weather_snapshot,'{}'::jsonb))='object'
          and (v_stage.weather_snapshot ? 'avg_max_temp_c')
        then nullif(v_stage.weather_snapshot->>'avg_max_temp_c','')::numeric
        else null
      end,
    'route',jsonb_build_object(
      'stage_id',v_stage_id,
      'route_label',coalesce(
        v_profile.route_label,
        concat_ws(' → ',
          nullif(coalesce(v_stage.start_city_name,v_stage.start_city),''),
          nullif(coalesce(v_stage.finish_city_name,v_stage.finish_city),'')
        )
      ),
      'start_city',coalesce(v_stage.start_city_name,v_stage.start_city,'—'),
      'finish_city',coalesce(v_stage.finish_city_name,v_stage.finish_city,'—'),
      'host_city',coalesce(v_stage.host_city,v_stage.start_city_name,v_stage.start_city,v_host_name),
      'distance_km',coalesce(v_profile.distance_km,v_stage.distance_km),
      'terrain_type',coalesce(v_profile.terrain_type,v_stage.terrain_type),
      'profile_type',coalesce(v_profile.profile_type,v_stage.profile_type),
      'elevation_gain_m',coalesce(v_profile.elevation_gain_m,v_stage.elevation_gain_m,0),
      'flat_pct',v_stage.flat_pct,
      'hilly_pct',v_stage.hilly_pct,
      'mountain_pct',v_stage.mountain_pct,
      'cobbled_pct',v_stage.cobbled_pct,
      'summary',coalesce(v_profile.stage_summary,v_stage.notes),
      'profile_points',coalesce(v_profile.profile_points,'[]'::jsonb),
      'route_markers',coalesce(v_profile.route_markers,'[]'::jsonb),
      'weather_snapshot',coalesce(v_stage.weather_snapshot,'{}'::jsonb),
      'weather_summary',v_profile.weather_summary
    )
  );
end;
$function$;

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

        -- Same authoritative four-finisher official team rank as used by
        -- the full three-day finalization. Older worker outputs have no
        -- race_stage_team_states, so do not score the TTT as zero.
        v_ttt_rank:=coalesce(
          private.nations_official_ttt_group_rank_v2(
            v_group.id,v_event.stage_id,v_team_id
          ),
          v_ttt_rank
        );
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
$function$;
