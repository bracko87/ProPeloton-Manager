create or replace function public.process_nations_group_results_v1(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
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
    return jsonb_build_object('status','waiting_for_races','group_id',v_group.id);
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
    select nge.id as group_entry_id,ce.association_id,ce.country_code
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
$function$;
