-- Restrict privileged background maintenance RPCs from direct player access.
-- All seven are active pg_cron jobs (executed as postgres), and any identified
-- server-to-server SQL callers are SECURITY DEFINER.
-- No implementation or scheduling change is needed.

revoke execute on function public.run_daily_tick_if_needed() from public,anon,authenticated;
grant execute on function public.run_daily_tick_if_needed() to service_role;

revoke execute on function public.finance_process_weekly_rider_wages_guarded_v1() from public,anon,authenticated;
grant execute on function public.finance_process_weekly_rider_wages_guarded_v1() to service_role;

revoke execute on function public.finance_process_weekly_staff_wages() from public,anon,authenticated;
grant execute on function public.finance_process_weekly_staff_wages() to service_role;

revoke execute on function public.finance_recompute_weekly_summaries(uuid) from public,anon,authenticated;
grant execute on function public.finance_recompute_weekly_summaries(uuid) to service_role;

revoke execute on function public.run_hourly_market_ai_jobs_guarded_v1() from public,anon,authenticated;
grant execute on function public.run_hourly_market_ai_jobs_guarded_v1() to service_role;

revoke execute on function public.process_national_association_nations_runtime_v4() from public,anon,authenticated;
grant execute on function public.process_national_association_nations_runtime_v4() to service_role;

revoke execute on function public.run_daily_free_agent_maintenance_unlimited() from public,anon,authenticated;
grant execute on function public.run_daily_free_agent_maintenance_unlimited() to service_role;
