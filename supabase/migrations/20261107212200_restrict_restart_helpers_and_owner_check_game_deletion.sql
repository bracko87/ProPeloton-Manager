-- Production security: stop direct calls to privileged team-restart internals.
-- Only the authenticated restart_my_team_v1 orchestration remains client-accessible.
-- It and all its internals run as SECURITY DEFINER, so nested calls continue
-- to work after these direct EXECUTE permissions are removed.

revoke execute on function public._restart_column_exists_v1(text,text,text) from public, anon, authenticated;
grant execute on function public._restart_column_exists_v1(text,text,text) to service_role;

revoke execute on function public._restart_delete_by_rider_ids_if_exists_v1(text,text,text,uuid[]) from public, anon, authenticated;
grant execute on function public._restart_delete_by_rider_ids_if_exists_v1(text,text,text,uuid[]) to service_role;

revoke execute on function public._restart_delete_by_uuid_if_exists_v1(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public._restart_delete_by_uuid_if_exists_v1(text,text,text,uuid) to service_role;

revoke execute on function public._restart_delete_table_by_account_ref_if_exists_v1(text,text,text,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public._restart_delete_table_by_account_ref_if_exists_v1(text,text,text,text,text,text,text,uuid) to service_role;

revoke execute on function public._restart_null_rider_uuid_column_if_exists_v1(text,uuid[]) from public, anon, authenticated;
grant execute on function public._restart_null_rider_uuid_column_if_exists_v1(text,uuid[]) to service_role;

revoke execute on function public._restart_null_uuid_column_if_exists_v1(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public._restart_null_uuid_column_if_exists_v1(text,text,text,uuid) to service_role;

revoke execute on function public._restart_set_rider_boolean_column_if_exists_v1(text,uuid[],boolean) from public, anon, authenticated;
grant execute on function public._restart_set_rider_boolean_column_if_exists_v1(text,uuid[],boolean) to service_role;

revoke execute on function public._restart_touch_updated_at_if_exists_v1(text,uuid) from public, anon, authenticated;
grant execute on function public._restart_touch_updated_at_if_exists_v1(text,uuid) to service_role;

revoke execute on function public._restart_try_delete_by_uuid_if_exists_v1(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public._restart_try_delete_by_uuid_if_exists_v1(text,text,text,uuid) to service_role;

revoke execute on function public._restart_update_summary_numeric_column_if_exists_v1(text,text,uuid,numeric) from public, anon, authenticated;
grant execute on function public._restart_update_summary_numeric_column_if_exists_v1(text,text,uuid,numeric) to service_role;

revoke execute on function public.restart_cleanup_active_commitments_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.restart_cleanup_active_commitments_v1(uuid,uuid) to service_role;

revoke execute on function public.restart_cleanup_final_visible_sources_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.restart_cleanup_final_visible_sources_v1(uuid,uuid) to service_role;

revoke execute on function public.restart_cleanup_finance_overview_summary_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.restart_cleanup_finance_overview_summary_v1(uuid,uuid) to service_role;

revoke execute on function public.restart_cleanup_finance_sponsor_visible_state_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.restart_cleanup_finance_sponsor_visible_state_v1(uuid,uuid) to service_role;

revoke execute on function public.restart_cleanup_remaining_active_commitments_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.restart_cleanup_remaining_active_commitments_v1(uuid,uuid) to service_role;

revoke execute on function public.restart_cleanup_visible_history_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.restart_cleanup_visible_history_v1(uuid,uuid) to service_role;

revoke execute on function public.restart_ensure_released_riders_free_agents_v1(uuid,uuid,uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.restart_ensure_released_riders_free_agents_v1(uuid,uuid,uuid,uuid[]) to service_role;

revoke execute on function public.restart_precleanup_blocking_refs_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.restart_precleanup_blocking_refs_v1(uuid,uuid) to service_role;

-- This older endpoint accepted an arbitrary user ID and previously anonymized
-- another player's account without checking that ID belonged to the caller.
-- Preserve account self-deletion for signed-in players and server-side actions.
create or replace function public.delete_my_game_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or (
    auth.uid() is distinct from p_user_id
    and auth.role() is distinct from 'service_role'
  ) then
    raise exception 'You may delete only your own game data'
      using errcode = '42501';
  end if;

  update public.clubs
  set deleted_at = now()
  where owner_user_id = p_user_id;

  update public.profiles
  set
    username = 'deleted_' || substring(p_user_id::text,1,8),
    email = 'deleted_' || substring(p_user_id::text,1,8) || '@deleted.local',
    first_name = 'Deleted',
    last_name = 'User',
    city = 'Deleted',
    country = 'XX'
  where id = p_user_id;
end;
$$;

revoke execute on function public.delete_my_game_data(uuid)
  from public, anon;
grant execute on function public.delete_my_game_data(uuid)
  to authenticated, service_role;
