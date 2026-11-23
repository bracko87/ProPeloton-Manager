-- Production applied 2026-11-23. No gameplay or scheduled-job mutation.
-- The public administrator wrapper validates auth.uid and is_app_admin_v1().
-- Internal caller functions and the wrapper are SECURITY DEFINER routines
-- owned by postgres. Preserve service_role execution.
REVOKE ALL ON FUNCTION public.monitor_youth_competition_health_v1()
FROM PUBLIC, anon, authenticated;
