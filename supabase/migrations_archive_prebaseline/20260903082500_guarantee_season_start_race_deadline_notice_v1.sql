create or replace function public.send_season_start_race_deadline_notice_if_due_v1()
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_season_number integer;
  v_month_number smallint;
  v_day_number smallint;
  v_transition_run_id uuid;
  v_timeline_id uuid;
  v_created integer := 0;
  v_existing_before integer;
  v_existing_after integer;
  v_event_key text;
  r record;
begin
  select g.season_number, g.month_number, g.day_number
  into v_season_number, v_month_number, v_day_number
  from public.get_current_game_date() g;

  if v_season_number is null then
    raise exception 'Unable to determine current game season.';
  end if;

  if v_month_number <> 1 or v_day_number not in (1, 2) then
    return jsonb_build_object(
      'ok', true,
      'sent', false,
      'reason', 'not_due',
      'season_number', v_season_number
    );
  end if;

  if v_season_number > 1 then
    select c.timeline_id
    into v_timeline_id
    from public.season_transition_control_v1 c
    where c.id = true;

    select r0.id
    into v_transition_run_id
    from public.season_transition_runs_v1 r0
    where r0.timeline_id = v_timeline_id
      and r0.source_season = v_season_number - 1
      and r0.target_season = v_season_number
      and r0.status = 'completed'
    order by r0.finished_at desc nulls last, r0.id desc
    limit 1;

    if v_transition_run_id is null then
      return jsonb_build_object(
        'ok', true,
        'sent', false,
        'reason', 'season_transition_not_completed',
        'season_number', v_season_number
      );
    end if;
  end if;

  for r in
    select distinct c.owner_user_id as user_id, c.id as club_id, c.name as club_name
    from public.clubs c
    where c.owner_user_id is not null
      and coalesce(c.club_type, 'main') = 'main'
      and c.deleted_at is null
  loop
    v_event_key := case
      when v_transition_run_id is not null
        then format('season_started:%s:%s', v_transition_run_id, r.club_id)
      else format('season_started:season:%s:%s', v_season_number, r.club_id)
    end;

    select count(*)::integer
    into v_existing_before
    from public.user_notifications un
    join public.notifications n on n.id = un.notification_id
    where un.user_id = r.user_id
      and un.deleted_at is null
      and n.payload_json ->> 'event_key' = v_event_key;

    perform public.create_user_game_notification_v1(
      r.user_id,
      'SEASON_STARTED',
      format('Season %s has started', v_season_number),
      format('Season %s is now underway. Review %s and the January race calendar.', v_season_number, r.club_name),
      '/dashboard/overview',
      jsonb_strip_nulls(jsonb_build_object(
        'transition_run_id', v_transition_run_id,
        'source_season', case when v_season_number > 1 then v_season_number - 1 else null end,
        'target_season', v_season_number,
        'club_id', r.club_id,
        'club_name', r.club_name,
        'season_start_notice_safety_net', true
      )),
      v_event_key,
      null
    );

    select count(*)::integer
    into v_existing_after
    from public.user_notifications un
    join public.notifications n on n.id = un.notification_id
    where un.user_id = r.user_id
      and un.deleted_at is null
      and n.payload_json ->> 'event_key' = v_event_key;

    if v_existing_before = 0 and v_existing_after = 1 then
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'sent', v_created > 0,
    'season_number', v_season_number,
    'transition_run_id', v_transition_run_id,
    'created', v_created
  );
end;
$$;

create or replace function public.process_due_game_notifications_scheduler_v1()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_game_result jsonb:=null; v_safety_result jsonb:=null; v_supplies_result jsonb:=null;
  v_jersey_result jsonb:=null; v_morale_result jsonb:=null; v_contract_result jsonb:=null;
  v_season_start_result jsonb:=null;
  v_game_error text:=null; v_safety_error text:=null; v_supplies_error text:=null;
  v_jersey_error text:=null; v_morale_error text:=null; v_contract_error text:=null;
  v_season_start_error text:=null;
begin
  begin
    v_season_start_result := public.send_season_start_race_deadline_notice_if_due_v1();
  exception when others then v_season_start_error:=sqlerrm; end;

  begin
    if to_regprocedure('public.process_due_game_notifications_v1()') is not null then
      execute 'select to_jsonb(public.process_due_game_notifications_v1())' into v_game_result;
    else v_game_error:='process_due_game_notifications_v1() not found'; end if;
  exception when others then v_game_error:=sqlerrm; end;

  begin
    if to_regprocedure('public.process_due_notification_safety_net_v1()') is not null then
      v_safety_result:=public.process_due_notification_safety_net_v1();
    else v_safety_error:='process_due_notification_safety_net_v1() not found'; end if;
  exception when others then v_safety_error:=sqlerrm; end;

  begin
    if to_regprocedure('public.process_due_race_supplies_low_notifications_v1()') is not null then
      v_supplies_result:=public.process_due_race_supplies_low_notifications_v1();
    else v_supplies_error:='process_due_race_supplies_low_notifications_v1() not found'; end if;
  exception when others then v_supplies_error:=sqlerrm; end;

  begin v_jersey_result:=public.process_due_mandatory_race_jersey_notifications_v1();
  exception when others then v_jersey_error:=sqlerrm; end;

  begin
    if to_regprocedure('public.process_rider_daily_selection_morale_v1(date)') is not null then
      v_morale_result:=public.process_rider_daily_selection_morale_v1();
    else v_morale_error:='process_rider_daily_selection_morale_v1(date) not found'; end if;
  exception when others then v_morale_error:=sqlerrm; end;

  begin
    if to_regprocedure('public.process_rider_contract_expiry_notifications_v1(date)') is not null then
      v_contract_result:=public.process_rider_contract_expiry_notifications_v1();
    else v_contract_error:='process_rider_contract_expiry_notifications_v1(date) not found'; end if;
  exception when others then v_contract_error:=sqlerrm; end;

  return jsonb_build_object(
    'status',case when v_season_start_error is null and v_game_error is null and v_safety_error is null
      and v_supplies_error is null and v_jersey_error is null and v_morale_error is null
      and v_contract_error is null then 'completed' else 'completed_with_errors' end,
    'season_start_race_deadline_result',v_season_start_result,
    'season_start_race_deadline_error',v_season_start_error,
    'game_notifications_result',v_game_result,'game_notifications_error',v_game_error,
    'safety_net_result',v_safety_result,'safety_net_error',v_safety_error,
    'race_supplies_low_result',v_supplies_result,'race_supplies_low_error',v_supplies_error,
    'mandatory_race_jersey_result',v_jersey_result,'mandatory_race_jersey_error',v_jersey_error,
    'rider_morale_result',v_morale_result,'rider_morale_error',v_morale_error,
    'rider_contract_expiry_result',v_contract_result,'rider_contract_expiry_error',v_contract_error,
    'processed_at',now()
  );
end;
$$;
