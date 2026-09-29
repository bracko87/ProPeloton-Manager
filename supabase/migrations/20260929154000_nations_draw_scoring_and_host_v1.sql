-- World Nations draw, scoring, advancement and host rotation v1.

create or replace function public.draw_nations_round_v1(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.record_nations_group_score_v1(
  p_group_entry_id uuid,
  p_ttt_rank integer,
  p_flat_finish_positions integer[],
  p_mountain_finish_positions integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.finalize_nations_group_v1(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.nations_competition_groups%rowtype;
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

  select count(*)::integer
  into v_count
  from public.nations_group_entries
  where group_id=v_group.id
    and status<>'withdrawn';

  if v_count=0 then
    raise exception 'Nations group has no entries to finalize.';
  end if;

  -- Refuse to invent a tie-break when a complete tie crosses the advancement
  -- cutoff. The Control Center can resolve such a rare case explicitly later.
  with scored as (
    select
      nge.id,
      count(*) over (
        partition by
          nge.total_points,
          nge.race_wins,
          nge.podium_finishes,
          coalesce(nge.ttt_rank,2147483647),
          coalesce(nge.best_day3_rider_rank,2147483647)
      )::integer as tie_size,
      count(*) over (
        order by
          nge.total_points desc,
          nge.race_wins desc,
          nge.podium_finishes desc,
          coalesce(nge.ttt_rank,2147483647) asc,
          coalesce(nge.best_day3_rider_rank,2147483647) asc
        rows between unbounded preceding and 1 preceding
      )::integer as rows_before,
      rank() over (
        order by
          nge.total_points desc,
          nge.race_wins desc,
          nge.podium_finishes desc,
          coalesce(nge.ttt_rank,2147483647) asc,
          coalesce(nge.best_day3_rider_rank,2147483647) asc
      )::integer as competition_rank
    from public.nations_group_entries nge
    where nge.group_id=v_group.id
      and nge.status<>'withdrawn'
  )
  select count(*)::integer
  into v_unresolved
  from scored s
  where coalesce(s.rows_before,0)<v_group.planned_advance_count
    and coalesce(s.rows_before,0)+s.tie_size>v_group.planned_advance_count;

  if v_unresolved>0 then
    return jsonb_build_object(
      'status','unresolved_tie_at_cutoff',
      'group_id',v_group.id,
      'advance_count',v_group.planned_advance_count
    );
  end if;

  with scored as (
    select
      nge.id,
      rank() over (
        order by
          nge.total_points desc,
          nge.race_wins desc,
          nge.podium_finishes desc,
          coalesce(nge.ttt_rank,2147483647) asc,
          coalesce(nge.best_day3_rider_rank,2147483647) asc
      )::integer as competition_rank,
      count(*) over (
        order by
          nge.total_points desc,
          nge.race_wins desc,
          nge.podium_finishes desc,
          coalesce(nge.ttt_rank,2147483647) asc,
          coalesce(nge.best_day3_rider_rank,2147483647) asc
        rows between unbounded preceding and 1 preceding
      )::integer as rows_before
    from public.nations_group_entries nge
    where nge.group_id=v_group.id
      and nge.status<>'withdrawn'
  )
  update public.nations_group_entries nge
  set final_group_rank=s.competition_rank,
      status=case
        when coalesce(s.rows_before,0)<v_group.planned_advance_count
          then 'advanced'
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

create or replace function public.finalize_nations_round_v1(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.nations_competition_rounds%rowtype;
  v_incomplete integer;
  v_advanced integer;
  v_next_round_id uuid;
begin
  select * into v_round
  from public.nations_competition_rounds
  where id=p_round_id
  for update;

  if v_round.id is null then
    raise exception 'Nations round not found.';
  end if;

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

  return jsonb_build_object(
    'status','completed',
    'round_id',v_round.id,
    'advanced',v_advanced,
    'next_round_id',null
  );
end;
$$;

create or replace function public.select_nations_host_v1(p_edition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.draw_nations_round_v1(uuid)
from public,anon,authenticated;
grant execute on function public.draw_nations_round_v1(uuid)
to service_role;

revoke all on function public.record_nations_group_score_v1(uuid,integer,integer[],integer[])
from public,anon,authenticated;
grant execute on function public.record_nations_group_score_v1(uuid,integer,integer[],integer[])
to service_role;

revoke all on function public.finalize_nations_group_v1(uuid)
from public,anon,authenticated;
grant execute on function public.finalize_nations_group_v1(uuid)
to service_role;

revoke all on function public.finalize_nations_round_v1(uuid)
from public,anon,authenticated;
grant execute on function public.finalize_nations_round_v1(uuid)
to service_role;

revoke all on function public.select_nations_host_v1(uuid)
from public,anon,authenticated;
grant execute on function public.select_nations_host_v1(uuid)
to service_role;
