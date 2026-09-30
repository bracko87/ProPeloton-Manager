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
          and date_trunc(
                'week',
                coalesce(nc.qualification_window_start_date,nc.qualification_date)::timestamp
              )::date
              <= date_trunc('week',(p_start_date+2)::timestamp)::date
          and date_trunc(
                'week',
                coalesce(nc.qualification_window_end_date,nc.qualification_date)::timestamp
              )::date
              >= date_trunc('week',p_start_date::timestamp)::date
        )
        or
        (
          coalesce(nc.final_window_start_date,nc.final_date) is not null
          and date_trunc(
                'week',
                coalesce(nc.final_window_start_date,nc.final_date)::timestamp
              )::date
              <= date_trunc('week',(p_start_date+2)::timestamp)::date
          and date_trunc(
                'week',
                coalesce(nc.final_window_end_date,nc.final_date)::timestamp
              )::date
              >= date_trunc('week',p_start_date::timestamp)::date
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
  v_base_start date;
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
      v_base_start := v_final_date;
    else
      v_base_start := v_final_qual_date;
    end if;

    if v_base_start < v_first_allowed then
      raise exception
        'World Nations round % would start before the allowed season launch date %.',
        v_round.round_index,
        v_first_allowed;
    end if;

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

      -- Find the nearest safe three-day block around the configured target.
      -- This avoids using the same calendar week as any participating nation's
      -- National Championship, while keeping the intended season timing close.
      for v_offset in 0..35 loop
        v_candidate:=v_base_start+v_offset;
        if v_candidate>=v_first_allowed
           and not private.nations_three_day_block_conflicts_national_championship_v1(
             v_edition.id,v_candidate
           ) then
          v_start:=v_candidate;
          v_found:=true;
          exit;
        end if;

        if v_offset>0 then
          v_candidate:=v_base_start-v_offset;
          if v_candidate>=v_first_allowed
             and not private.nations_three_day_block_conflicts_national_championship_v1(
               v_edition.id,v_candidate
             ) then
            v_start:=v_candidate;
            v_found:=true;
            exit;
          end if;
        end if;
      end loop;

      if not v_found then
        raise exception
          'No conflict-free World Nations week found within 35 days of %.',
          v_base_start;
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
      'national_championship_week_conflict_free', true
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


do $$
declare
  v_edition_id uuid;
begin
  select e.id
  into v_edition_id
  from public.nations_competition_editions e
  join public.game_state gs on gs.id=true
  where e.season_number=gs.season_number
  limit 1;

  if v_edition_id is not null then
    perform public.schedule_nations_edition_v1(v_edition_id);
  end if;
end;
$$;
