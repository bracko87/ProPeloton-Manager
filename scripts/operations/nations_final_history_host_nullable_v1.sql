-- Null-safe finalist host recognition. A neutral host country can have
-- a country code but no National Association membership, and was_host is
-- NOT NULL. Do not block official championship finalization.
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
    coalesce(
      ce.association_id=v_edition.host_association_id,
      upper(ce.country_code)=upper(v_edition.host_country_code),
      false
    )
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
$function$;
