CREATE OR REPLACE FUNCTION public.process_youth_team_allocations_v2(p_game_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare gd date:=coalesce(p_game_date,public.get_current_game_date_date()); x record; n integer:=0; f integer:=0;
begin
  perform public.sync_youth_scheduled_race_invitations_v2(public.get_current_season_number());
  for x in
    select id,race_date from public.youth_races
    where status='scheduled' and race_date>gd and race_date<=gd+14
    order by race_date,id
  loop
    perform private.ensure_youth_race_runtime_v1(x.id);
    perform private.fill_youth_race_field_v2(x.id,gd,x.race_date<=gd+7);
    n:=n+1; if x.race_date<=gd+7 then f:=f+1; end if;
  end loop;
  return jsonb_build_object('game_date',gd,'allocation_window_days',14,'final_fill_days',7,'races_processed',n,'final_fill_races',f);
end;
$function$;

CREATE OR REPLACE FUNCTION public.run_hourly_game_processors_v1(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current record;
  v_run_id uuid;
  v_processor_key text;

  v_overdue_completion_result jsonb;
  v_team_list_announcement_result jsonb;
  v_race_day_result jsonb;
  v_youth_race_runtime_result jsonb;
  v_youth_allocation_result jsonb;
  v_youth_health_result jsonb;
  v_final_result jsonb;
begin
  select *
  into v_current
  from public.get_current_game_clock_v1()
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'current_game_clock_not_found'
    );
  end if;

  if p_force then
    v_processor_key := concat(
      'hourly_game_processors_force_',
      replace(gen_random_uuid()::text, '-', '')
    );

    insert into public.hourly_game_processor_runs (
      processor_key,
      season_number,
      month_number,
      day_number,
      hour_number,
      minute_number,
      started_at
    )
    values (
      v_processor_key,
      v_current.season_number,
      v_current.month_number,
      v_current.day_number,
      v_current.hour_number,
      v_current.minute_number,
      now()
    )
    returning id into v_run_id;
  else
    v_processor_key := 'hourly_game_processors';

    insert into public.hourly_game_processor_runs (
      processor_key,
      season_number,
      month_number,
      day_number,
      hour_number,
      minute_number,
      started_at
    )
    values (
      v_processor_key,
      v_current.season_number,
      v_current.month_number,
      v_current.day_number,
      v_current.hour_number,
      v_current.minute_number,
      now()
    )
    on conflict (
      processor_key,
      season_number,
      month_number,
      day_number,
      hour_number,
      minute_number
    )
    do nothing
    returning id into v_run_id;

    if v_run_id is null then
      return jsonb_build_object(
        'success', true,
        'skipped', true,
        'reason', 'already_processed_for_this_game_hour',
        'current_game_time_label', v_current.game_time_label
      );
    end if;
  end if;

  begin
    select public.complete_overdue_races_by_date_v2()
    into v_overdue_completion_result;

    select public.process_due_team_list_announcements_v1()
    into v_team_list_announcement_result;

    select public.process_due_race_days_v1()
    into v_race_day_result;

    select public.process_youth_team_allocations_v2(
      public.get_current_game_date_date()
    )
    into v_youth_allocation_result;

    select public.process_due_youth_race_runtime_v2(
      public.get_current_game_timestamp()::timestamp without time zone
    )
    into v_youth_race_runtime_result;

    select public.monitor_youth_competition_health_v1()
    into v_youth_health_result;

    v_final_result := jsonb_build_object(
      'success', true,
      'skipped', false,
      'force', p_force,
      'processor_key', v_processor_key,
      'current_game_date', v_current.game_date_display,
      'current_game_time_label', v_current.game_time_label,
      'overdue_completion_result', v_overdue_completion_result,
      'team_list_announcement_result', v_team_list_announcement_result,
      'race_day_result', v_race_day_result,
      'youth_team_allocation_result', v_youth_allocation_result,
      'youth_race_runtime_result', v_youth_race_runtime_result,
      'youth_competition_health_result', v_youth_health_result
    );

    update public.hourly_game_processor_runs
    set
      finished_at = now(),
      success = true,
      result = v_final_result
    where id = v_run_id;

    return v_final_result;

  exception when others then
    update public.hourly_game_processor_runs
    set
      finished_at = now(),
      success = false,
      error_message = sqlerrm
    where id = v_run_id;

    return jsonb_build_object(
      'success', false,
      'error', sqlerrm,
      'processor_key', v_processor_key,
      'current_game_time_label', v_current.game_time_label
    );
  end;
end;
$function$;

select public.process_youth_team_allocations_v2(public.get_current_game_date_date());
select public.monitor_youth_competition_health_v1();
