create or replace function private.nations_day3_rank_vector_v1(
  p_group_id uuid,
  p_association_id uuid
)
returns integer[]
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_stage_id uuid;
  v_team_id uuid;
  v_vector integer[];
begin
  select e.stage_id
  into v_stage_id
  from public.nations_group_events e
  where e.group_id=p_group_id
    and e.status='completed'
    and (e.race_day=3 or e.race_type='mountain_road_race')
    and e.stage_id is not null
  order by
    case when e.race_day=3 then 0 else 1 end,
    e.race_day desc
  limit 1;

  select i.technical_club_id
  into v_team_id
  from public.national_association_race_team_identities i
  where i.association_id=p_association_id
  limit 1;

  if v_stage_id is null or v_team_id is null then
    return array_fill(999999,array[7]);
  end if;

  with ranked as (
    select
      r.rank,
      row_number() over(order by r.rank,r.rider_id)::integer as rn
    from public.race_stage_results r
    where r.stage_id=v_stage_id
      and r.team_id=v_team_id
      and r.status='finished'
      and r.rank is not null
  ),
  slots as (
    select generate_series(1,7)::integer as rn
  )
  select array_agg(coalesce(r.rank,999999) order by s.rn)
  into v_vector
  from slots s
  left join ranked r on r.rn=s.rn;

  return coalesce(v_vector,array_fill(999999,array[7]));
end;
$function$;

revoke all on function private.nations_day3_rank_vector_v1(uuid,uuid)
from public,anon,authenticated;

create or replace function public.finalize_nations_group_v1(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
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
$function$;
