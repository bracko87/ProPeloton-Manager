create or replace function public.refresh_nations_group_partial_scores_v1(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
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
$function$;

create or replace function private.trg_notify_nations_event_result_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='completed'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform public.refresh_nations_group_partial_scores_v1(new.group_id);
    perform private.notify_nations_event_result_v1(new.id);
  end if;
  return new;
end;
$function$;
