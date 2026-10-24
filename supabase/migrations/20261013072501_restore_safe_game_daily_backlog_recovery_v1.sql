-- The accelerated clock deliberately enqueues heavy daily work. The queue
-- previously had no autonomous consumer; restore a bounded, serial consumer.
-- In particular, never leave game_state or game_clock_config paused after a
-- historical backlog replay (legacy processors leave both paused).
create or replace function private.recover_game_daily_backlog_safe_v1()
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog', 'public', 'private', 'pg_temp'
as $fn$
declare
 v_config_paused boolean;
 v_state_paused boolean;
 v_oldest date;
 v_today date;
 v_result jsonb;
 v_lag integer;
 v_total integer;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('private.recover_game_daily_backlog_safe_v1',0)) then
   return jsonb_build_object('status','already_running');
 end if;
 v_today := public.get_current_game_date_date();
 select min(current_game_date) into v_oldest
 from public.game_daily_tick_backlog_v1 where status='pending';
 if v_oldest is null or v_oldest >= v_today then
   return jsonb_build_object('status','nothing_overdue','oldest_pending',v_oldest,'game_date',v_today);
 end if;
 select is_paused into v_state_paused from public.game_state where id=true;
 select is_paused into v_config_paused from public.game_clock_config where id=true;
 -- Legacy replay functions use historical game_state inside a single
 -- transaction; their persistent pause side effect must be undone here.
 v_result := public.process_one_daily_tick_backlog_smart_v1(90);
 update public.game_state set is_paused=v_state_paused
 where id=true and is_paused is distinct from v_state_paused;
 update public.game_clock_config set is_paused=v_config_paused
 where id=true and is_paused is distinct from v_config_paused;
 select count(*) into v_total from public.game_daily_tick_backlog_v1 where status='pending';
 select count(*) into v_lag from public.game_daily_tick_backlog_v1
 where status='pending' and current_game_date < public.get_current_game_date_date()-1;
 perform private.youth_watchdog_finish_v1(
   'check:daily_backlog',v_lag,'high','Daily game processing queue is delayed',
   format('%s deferred game day(s) are more than one game day behind. Oldest: %s.',v_lag,v_oldest),
   'Daily processing backlog is within one game day of the game clock.',
   jsonb_build_object('pending_days',v_total,'overdue_days',v_lag,
     'oldest_pending',v_oldest,'last_replay_status',v_result->>'status',
     'last_replay_error',left(coalesce(v_result->>'error',''),300),
     'game_date',public.get_current_game_date_date())
 );
 return jsonb_build_object('status',v_result->>'status','result',v_result,
    'game_date',v_today,'pending_days',v_total,'overdue_days',v_lag,
    'clock_pause_restored',true);
end
$fn$;
revoke all on function private.recover_game_daily_backlog_safe_v1() from public, anon, authenticated;
-- Run away from the 00/10/20 System Health cadence to reduce lock contention.
select cron.schedule(
 'game-daily-backlog-safe-recovery-v1',
 '3-59/10 * * * *',
 $$set statement_timeout = '180s'; select private.recover_game_daily_backlog_safe_v1();$$
);
