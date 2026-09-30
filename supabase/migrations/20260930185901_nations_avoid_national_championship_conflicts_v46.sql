CREATE OR REPLACE FUNCTION private.nations_three_day_block_conflicts_national_championship_v1(p_edition_id uuid, p_start_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(
    select 1
    from public.nations_competition_editions ed
    join public.nations_competition_entries ce
      on ce.edition_id=ed.id
     and ce.status<>'withdrawn'
    join public.national_championship_editions nc
      on nc.season_number=ed.season_number
     and upper(nc.country_code)=upper(ce.country_code)
    where ed.id=p_edition_id
      and p_start_date is not null
      and coalesce(nc.status,'planned')<>'cancelled'
      and (
        (
          coalesce(nc.qualification_window_start_date,nc.qualification_date) is not null
          and coalesce(nc.qualification_window_end_date,nc.qualification_date)
                >= p_start_date-1
          and coalesce(nc.qualification_window_start_date,nc.qualification_date)
                <= p_start_date+3
        )
        or
        (
          coalesce(nc.final_window_start_date,nc.final_date) is not null
          and coalesce(nc.final_window_end_date,nc.final_date)
                >= p_start_date-1
          and coalesce(nc.final_window_start_date,nc.final_date)
                <= p_start_date+3
        )
      )
  );
$function$


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
  v_round record;
  v_group record;
  v_start date;
  v_existing_start date;
  v_candidate date;
  v_offset integer;
  v_found boolean;
  v_scheduled_groups integer := 0;
  v_schedule jsonb := '[]'::jsonb;
begin
  select * into v_edition
  from public.nations_competition_editions
  where id = p_edition_id;

  if v_edition.id is null then
    raise exception 'World Nations edition not found.';
  end if;

  select * into v_cfg
  from public.nations_competition_schedule_config
  where id = true;

  v_final_date := public.game_date_from_parts(
    v_edition.season_number,
    coalesce(v_cfg.final_month, 11),
    coalesce(v_cfg.final_day, 24)
  );

  v_final_qual_date :=
    v_final_date - coalesce(v_cfg.final_qualification_gap_days, 42);

  v_first_allowed :=
    public.nations_earliest_preliminary_date_v1(v_edition.season_number);

  for v_round in
    select *
    from public.nations_competition_rounds
    where edition_id = v_edition.id
    order by round_index
  loop
    if v_round.round_type = 'world_final' then
      v_start := v_final_date;
    else
      v_start := v_final_qual_date;
    end if;

    if v_start < v_first_allowed then
      raise exception
        'World Nations round % would start before the allowed season launch date %.',
        v_round.round_index,
        v_first_allowed;
    end if;

    -- Once a round has a safe schedule, keep it. If an existing schedule
    -- conflicts with a participant's National Championship duty window,
    -- move the whole three-day round together to the first safe date.
    select min(e.event_date)
    into v_existing_start
    from public.nations_competition_groups g
    join public.nations_group_events e on e.group_id=g.id
    where g.round_id=v_round.id
      and e.event_date is not null;

    if v_existing_start is not null
       and not private.nations_three_day_block_conflicts_national_championship_v1(
         v_edition.id,v_existing_start
       ) then
      v_start:=v_existing_start;
    else
      v_found:=false;

      for v_offset in 0..28 loop
        v_candidate:=v_start+v_offset;

        if v_candidate>=v_first_allowed
           and not private.nations_three_day_block_conflicts_national_championship_v1(
             v_edition.id,v_candidate
           ) then
          v_start:=v_candidate;
          v_found:=true;
          exit;
        end if;
      end loop;

      if not v_found then
        raise exception
          'No conflict-free three-day World Nations window found within 28 days of %.',
          v_start;
      end if;
    end if;

    for v_group in
      select id
      from public.nations_competition_groups
      where round_id = v_round.id
      order by group_number
    loop
      perform public.set_nations_group_schedule_v1(v_group.id, v_start);
      v_scheduled_groups := v_scheduled_groups + 1;
    end loop;

    v_schedule := v_schedule || jsonb_build_array(jsonb_build_object(
      'round_id', v_round.id,
      'round_index', v_round.round_index,
      'round_type', v_round.round_type,
      'round_label', v_round.round_label,
      'day1_date', v_start,
      'day2_date', v_start + 1,
      'day3_date', v_start + 2,
      'national_championship_conflict_free', true
    ));
  end loop;

  return jsonb_build_object(
    'edition_id', v_edition.id,
    'season_number', v_edition.season_number,
    'earliest_allowed_date', v_first_allowed,
    'scheduled_groups', v_scheduled_groups,
    'rounds', v_schedule
  );
end;
$function$

