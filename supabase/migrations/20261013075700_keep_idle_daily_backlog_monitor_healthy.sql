-- Keep the backlog monitor alive even when the queue is empty.
-- Otherwise an idle/healthy queue eventually triggers a false stale-monitor
-- alarm because the worker returned before logging a successful check.
do $patch$
declare
 v_def text;
 v_before text :=
   'return jsonb_build_object(''status'',''nothing_overdue'',''oldest_pending'',v_oldest,''game_date'',v_today);';
 v_after text :=
   'perform private.youth_watchdog_finish_v1(''check:daily_backlog'',0,''high'',''Daily game processing queue is delayed'',''Daily processing backlog is delayed.'',''Daily processing backlog is caught up.'',jsonb_build_object(''game_date'',v_today,''oldest_pending'',v_oldest,''pending_days'',(select count(*) from public.game_daily_tick_backlog_v1 where status=''pending''),''overdue_days'',0));'||chr(10)||'   '||
   'return jsonb_build_object(''status'',''nothing_overdue'',''oldest_pending'',v_oldest,''game_date'',v_today);';
begin
 select pg_get_functiondef('private.recover_game_daily_backlog_safe_v1()'::regprocedure) into v_def;
 if position(v_before in v_def)>0 then
   execute replace(v_def,v_before,v_after);
 elsif position('''Daily processing backlog is caught up.''' in v_def)=0 then
   raise exception 'Recovery function changed: refuse blind replacement';
 end if;
end
$patch$;