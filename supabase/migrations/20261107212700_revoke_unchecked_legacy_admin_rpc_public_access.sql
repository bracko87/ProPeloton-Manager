-- Emergency pre-launch restriction of legacy SECURITY DEFINER RPCs
-- that contain no caller authorization checks. Their bodies are not changed.
-- Protect the game clock, forced rider development and confidential club finances.
-- No first-party browser source or SQL wrappers reference these endpoints.

revoke execute on function public.admin_reset_game_time(integer,smallint,smallint,smallint,smallint,boolean) from public, anon, authenticated;
grant execute on function public.admin_reset_game_time(integer,smallint,smallint,smallint,smallint,boolean) to service_role;

revoke execute on function public.admin_process_weekly_rider_development_for_window(date,date,boolean) from public, anon, authenticated;
grant execute on function public.admin_process_weekly_rider_development_for_window(date,date,boolean) to service_role;

revoke execute on function public.finance_get_club_statement_admin(uuid,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.finance_get_club_statement_admin(uuid,integer,timestamptz) to service_role;

revoke execute on function public.finance_get_team_policy_cost_summary_admin(uuid,date,date) from public, anon, authenticated;
grant execute on function public.finance_get_team_policy_cost_summary_admin(uuid,date,date) to service_role;
