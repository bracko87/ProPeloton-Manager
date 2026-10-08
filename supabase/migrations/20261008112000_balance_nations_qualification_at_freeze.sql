-- Balance World Nations qualification groups only when the participant field freezes.
-- Existing open-field, Season 1 first-come assignments remain unchanged before the lock.
-- Preserve group IDs, event IDs and host assignments; only shift group entries at lock.

create or replace function private.balance_nations_qualification_on_field_lock_v1(p_edition_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_edition public.nations_competition_editions%rowtype;
  v_round public.nations_competition_rounds%rowtype;
  v_field_count integer;
  v_group_count integer;
  v_drawn_count integer;
  v_min_size integer;
  v_max_size integer;
  v_changes integer := 0;
  v_targets jsonb;
begin
  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id for update;

  if v_edition.id is null then
    raise exception 'World Nations edition not found';
  end if;

  if public.get_current_game_date_date() < public.nations_field_lock_gate_v1(v_edition.season_number) then
    raise exception 'World Nations participant field is still open';
  end if;

  if v_edition.status <> 'planned' then
    return jsonb_build_object('status','already_locked_or_running');
  end if;

  select * into v_round
  from public.nations_competition_rounds
  where edition_id=p_edition_id and round_index=1
  for update;

  if v_round.id is null or v_round.status <> 'planned' then
    return jsonb_build_object('status','round_not_planned');
  end if;

  -- Do not change assignments after any qualification event has started or completed.
  if exists (
    select 1
    from public.nations_group_events ev
    join public.nations_competition_groups g on g.id=ev.group_id
    where g.round_id=v_round.id
      and ev.status not in ('planned','scheduled','waiting_for_lineups')
  ) then
    raise exception 'Cannot rebalance a World Nations round with started events';
  end if;

  select count(*)::integer into v_field_count
  from public.nations_competition_entries e
  where e.edition_id=p_edition_id
    and e.status in ('entered','advanced','finalist');

  select count(*)::integer into v_drawn_count
  from public.nations_group_entries nge
  join public.nations_competition_groups g on g.id=nge.group_id
  where g.round_id=v_round.id and nge.status<>'withdrawn';

  select count(*)::integer into v_group_count
  from public.nations_competition_groups
  where round_id=v_round.id;

  if v_field_count < 1
     or v_drawn_count <> v_field_count
     or v_group_count <> v_round.group_count
     or v_group_count <> ceiling(v_field_count::numeric / 16.0)::integer
  then
    raise exception 'World Nations field/groups inconsistent at freeze: field %, drawn %, groups %, expected %',
      v_field_count, v_drawn_count, v_group_count, ceiling(v_field_count::numeric/16.0)::integer;
  end if;

  select min(s.cnt),max(s.cnt)
  into v_min_size,v_max_size
  from (
    select g.id, count(nge.id)::integer cnt
    from public.nations_competition_groups g
    left join public.nations_group_entries nge
      on nge.group_id=g.id and nge.status<>'withdrawn'
    where g.round_id=v_round.id
    group by g.id
  ) s;

  -- Only reshuffle materially uneven provisional fields. Balanced Season 2+
  -- seeded groups retain their existing team assignments.
  if v_max_size - v_min_size > 1 then
    with ranked as (
      select nge.id as group_entry_id,
             row_number() over (
               order by e.seed_score desc nulls last,
                        md5(v_edition.season_number::text||':'||e.country_code),
                        e.id
             )::integer as position
      from public.nations_group_entries nge
      join public.nations_competition_groups old_g on old_g.id=nge.group_id
      join public.nations_competition_entries e on e.id=nge.competition_entry_id
      where old_g.round_id=v_round.id
        and nge.status<>'withdrawn'
        and e.status in ('entered','advanced','finalist')
    ), assigned as (
      select group_entry_id,position,
             case
               when ((position-1)/v_group_count)%2=0
                 then ((position-1)%v_group_count)+1
               else v_group_count-((position-1)%v_group_count)
             end as group_number
      from ranked
    )
    update public.nations_group_entries nge
    set group_id=g.id,seed_position=a.position,updated_at=now()
    from assigned a
    join public.nations_competition_groups g
      on g.round_id=v_round.id and g.group_number=a.group_number
    where nge.id=a.group_entry_id
      and (nge.group_id<>g.id or nge.seed_position<>a.position);

    get diagnostics v_changes=row_count;
  end if;

  -- Spread all finalist slots evenly as well (22 teams, 16 slots -> 8/8).
  v_targets:=private.nations_distribute_group_counts_v1(
    v_field_count,v_group_count,least(v_round.advance_target,v_field_count)
  );

  update public.nations_competition_groups g
  set planned_entrant_count=(
        select count(*)::integer
        from public.nations_group_entries nge
        where nge.group_id=g.id and nge.status<>'withdrawn'
      ),
      planned_advance_count=(
        select (item->>'advance_count')::integer
        from jsonb_array_elements(v_targets) item
        where (item->>'group_number')::integer=g.group_number
      ),
      updated_at=now()
  where g.round_id=v_round.id;

  update public.nations_competition_rounds
  set entrants_target=v_field_count,
      advance_target=least(v_round.advance_target,v_field_count),
      updated_at=now()
  where id=v_round.id;

  return jsonb_build_object(
    'status','balanced_on_field_lock',
    'round_id',v_round.id,
    'entrants',v_field_count,
    'groups',v_group_count,
    'updated_group_entries',v_changes,
    'group_targets',v_targets
  );
end;
$function$;

revoke all on function private.balance_nations_qualification_on_field_lock_v1(uuid) from public;

create or replace function private.lock_nations_provisional_draw_v1(p_edition_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_round public.nations_competition_rounds%rowtype;
  v_count integer:=0;
  v_balance jsonb:=null;
begin
  select * into v_round
  from public.nations_competition_rounds
  where edition_id=p_edition_id and round_index=1
  for update;

  if v_round.id is null then
    raise exception 'World Nations first round is unavailable.';
  end if;

  if v_round.status <> 'planned' then
    return jsonb_build_object('status','already_locked','round_id',v_round.id);
  end if;

  if public.get_current_game_date_date() <
       (select public.nations_field_lock_gate_v1(e.season_number)
        from public.nations_competition_editions e where e.id=p_edition_id)
  then
    raise exception 'Cannot lock World Nations before the participation freeze';
  end if;

  select count(*)::integer into v_count
  from public.nations_group_entries nge
  join public.nations_competition_groups g on g.id=nge.group_id
  where g.round_id=v_round.id;

  if v_count=0 then
    -- The ordinary draw already distributes entrants across the groups.
    return public.draw_nations_round_v1(v_round.id);
  end if;

  v_balance:=private.balance_nations_qualification_on_field_lock_v1(p_edition_id);

  update public.nations_competition_groups
  set status='drawn',updated_at=now()
  where round_id=v_round.id;

  update public.nations_competition_rounds
  set status='drawn',updated_at=now()
  where id=v_round.id;

  update public.nations_competition_editions
  set status='qualification',updated_at=now()
  where id=p_edition_id and status='planned';

  return jsonb_build_object(
    'status','provisional_draw_locked',
    'edition_id',p_edition_id,
    'round_id',v_round.id,
    'drawn_entries',v_count,
    'group_count',v_round.group_count,
    'field_balance',v_balance
  );
end;
$function$;

revoke all on function private.lock_nations_provisional_draw_v1(uuid) from public;
