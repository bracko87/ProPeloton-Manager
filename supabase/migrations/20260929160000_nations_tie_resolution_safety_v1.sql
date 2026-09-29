-- Correct Nations advancement tie handling.
-- Complete ties are evaluated as a score block, so a tie crossing the
-- qualification cutoff is never accidentally split by row order.

create or replace function public.finalize_nations_group_v1(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  with score_blocks as (
    select
      nge.total_points,
      nge.race_wins,
      nge.podium_finishes,
      coalesce(nge.ttt_rank,2147483647) as ttt_rank_key,
      coalesce(nge.best_day3_rider_rank,2147483647) as day3_key,
      count(*)::integer as tie_size
    from public.nations_group_entries nge
    where nge.group_id=v_group.id
      and nge.status<>'withdrawn'
    group by
      nge.total_points,
      nge.race_wins,
      nge.podium_finishes,
      coalesce(nge.ttt_rank,2147483647),
      coalesce(nge.best_day3_rider_rank,2147483647)
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
            b.day3_key asc
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
      'advance_count',v_group.planned_advance_count
    );
  end if;

  with score_blocks as (
    select
      nge.total_points,
      nge.race_wins,
      nge.podium_finishes,
      coalesce(nge.ttt_rank,2147483647) as ttt_rank_key,
      coalesce(nge.best_day3_rider_rank,2147483647) as day3_key,
      count(*)::integer as tie_size
    from public.nations_group_entries nge
    where nge.group_id=v_group.id
      and nge.status<>'withdrawn'
    group by
      nge.total_points,
      nge.race_wins,
      nge.podium_finishes,
      coalesce(nge.ttt_rank,2147483647),
      coalesce(nge.best_day3_rider_rank,2147483647)
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
            b.tt_rank_key asc,
            b.day3_key asc
          rows between unbounded preceding and 1 preceding
        ),
        0
      )::integer as rows_before
    from (
      select
        total_points,race_wins,podium_finishes,
        ttt_rank_key,
        ttt_rank_key as tt_rank_key,
        day3_key,tie_size
      from score_blocks
    ) b
  ),
  scored as (
    select
      nge.id,
      ob.rows_before+1 as competition_rank,
      ob.rows_before,
      ob.tie_size
    from public.nations_group_entries nge
    join ordered_blocks ob
      on ob.total_points=nge.total_points
     and ob.race_wins=nge.race_wins
     and ob.podium_finishes=nge.podium_finishes
     and ob.ttt_rank_key=coalesce(nge.ttt_rank,2147483647)
     and ob.day3_key=coalesce(nge.best_day3_rider_rank,2147483647)
    where nge.group_id=v_group.id
      and nge.status<>'withdrawn'
  )
  update public.nations_group_entries nge
  set final_group_rank=s.competition_rank,
      status=case
        when s.rows_before+s.tie_size<=v_group.planned_advance_count
          then case when v_round.round_type='world_final' then 'winner' else 'advanced' end
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
    'advance_count',v_group.planned_advance_count
  );
end;
$$;
