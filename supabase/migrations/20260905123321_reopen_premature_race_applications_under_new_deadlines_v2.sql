do $$
declare
  v_current record;
  v_today_ordinal integer;
  v_unsafe integer := 0;
  v_reopen_count integer := 0;
  v_loop record;
begin
  select * into v_current
  from public.get_current_game_date_parts()
  limit 1;

  if not found then
    raise exception 'Current game date not found';
  end if;

  v_today_ordinal := public.game_date_ordinal_v1(
    v_current.season_number,
    v_current.month_number,
    v_current.day_number
  );

  create temporary table tmp_races_to_reopen(
    race_id uuid primary key
  ) on commit drop;

  insert into tmp_races_to_reopen(race_id)
  select race.id
  from public.races race
  join public.race_entry_rules rer on rer.race_id=race.id
  cross join lateral public.calculate_race_application_deadlines_v1(
    coalesce(rer.race_season_number,extract(year from race.start_date)::integer-1999),
    coalesce(rer.race_start_month_number,extract(month from race.start_date)::integer),
    coalesce(rer.race_start_day_number,extract(day from race.start_date)::integer)
  ) d
  where race.status='scheduled'
    and extract(year from race.start_date)::integer-1999=v_current.season_number
    and public.game_date_ordinal_v1(
          extract(year from race.start_date)::integer-1999,
          extract(month from race.start_date)::integer,
          extract(day from race.start_date)::integer
        ) > v_today_ordinal
    and lower(coalesce(race.metadata->>'team_list_announcement_finalized','false')) in ('true','1','yes')
    and public.game_date_ordinal_v1(
          d.applications_open_season_number,
          d.applications_open_month_number,
          d.applications_open_day_number
        ) <= v_today_ordinal
    and public.game_date_ordinal_v1(
          d.applications_close_season_number,
          d.applications_close_month_number,
          d.applications_close_day_number
        ) > v_today_ordinal;

  select count(*)::integer into v_reopen_count from tmp_races_to_reopen;

  select count(*)::integer into v_unsafe
  from tmp_races_to_reopen x
  where exists (
      select 1 from public.race_team_entries e
      where e.race_id=x.race_id
        and coalesce(e.is_ai_filler,false)=false
    )
    or exists (
      select 1 from public.race_preparations p
      where p.race_id=x.race_id
    )
    or exists (
      select 1
      from public.race_stages s
      join public.race_stage_results rr on rr.stage_id=s.id
      where s.race_id=x.race_id
    )
    or exists (
      select 1
      from public.race_stages s
      join public.race_stage_authoritative_runs ar on ar.stage_id=s.id
      where s.race_id=x.race_id
    );

  if v_unsafe > 0 then
    raise exception 'Refusing race-application reopen: % candidate race(s) contain human/preparation/result data',v_unsafe;
  end if;

  delete from public.race_participant_riders pr
  using tmp_races_to_reopen x
  where pr.race_id=x.race_id;

  delete from public.race_team_entries e
  using tmp_races_to_reopen x
  where e.race_id=x.race_id
    and coalesce(e.is_ai_filler,false)=true;

  delete from public.race_participant_teams pt
  using tmp_races_to_reopen x
  where pt.race_id=x.race_id;

  update public.races race
  set metadata = (
        coalesce(race.metadata,'{}'::jsonb)
        - 'team_list_announcement_finalized'
        - 'team_list_announcement_finalized_at'
        - 'team_list_announcement_processed'
        - 'team_list_announcement_processed_at'
        - 'team_list_announcement_team_count'
        - 'captains_pending_rider_deadline'
      ) || jsonb_build_object(
        'application_window_reopened_under_new_policy',true,
        'application_window_reopened_at',now(),
        'application_window_reopen_policy','jan_late_d3_feb_onward_d7_v1'
      ),
      updated_at=now()
  from tmp_races_to_reopen x
  where race.id=x.race_id;

  for v_loop in
    select race.id
    from public.races race
    where race.status='scheduled'
      and extract(year from race.start_date)::integer-1999=v_current.season_number
      and public.game_date_ordinal_v1(
            extract(year from race.start_date)::integer-1999,
            extract(month from race.start_date)::integer,
            extract(day from race.start_date)::integer
          ) > v_today_ordinal
    order by race.start_date,race.id
  loop
    perform * from public.recalculate_race_entry_deadlines_v1(v_loop.id);
  end loop;

  perform public.sync_race_application_statuses_v1();
  perform public.process_race_application_preselection_v1();

  if v_reopen_count < 1 then
    raise exception 'Expected at least one safely reopenable future race; found none';
  end if;
end;
$$;