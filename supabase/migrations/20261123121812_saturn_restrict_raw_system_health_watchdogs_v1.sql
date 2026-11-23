-- Production applied 2026-11-23.
-- Raw health watchdogs are SECURITY DEFINER and can write incident/log rows.
-- Internal postgres-owned SECURITY DEFINER callers and service_role retain
-- access. The admin dashboard reads get_admin_* RPCs; this restricts only
-- direct browser execution. No gameplay, cron or game clock changes.
REVOKE ALL ON FUNCTION public.run_system_health_watchdog_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_youth_academy_full_health_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_special_infrastructure_health_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_youth_core_health_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_youth_staff_responsibilities_health_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_youth_scouting_recruitment_health_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_youth_finance_health_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_youth_rankings_health_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_youth_lifecycle_health_v1() FROM PUBLIC, anon, authenticated;
