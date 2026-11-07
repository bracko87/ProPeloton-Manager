-- Deny untrusted clients direct access to internal state-changing helpers.
-- Their only known callers are SECURITY DEFINER server-side functions.
-- Keep service_role access for trusted server automation.

revoke execute on function public._apply_durable_supply_stage_uses(uuid,text,integer,date) from public, anon, authenticated;
grant execute on function public._apply_durable_supply_stage_uses(uuid,text,integer,date) to service_role;

revoke execute on function public._consume_club_race_supply_count(uuid,text,integer,date) from public, anon, authenticated;
grant execute on function public._consume_club_race_supply_count(uuid,text,integer,date) to service_role;

revoke execute on function public._complete_free_agent_signing_internal(uuid,uuid) from public, anon, authenticated;
grant execute on function public._complete_free_agent_signing_internal(uuid,uuid) to service_role;

revoke execute on function public._create_generated_free_agent_internal(text,integer) from public, anon, authenticated;
grant execute on function public._create_generated_free_agent_internal(text,integer) to service_role;

revoke execute on function public._finance_charge_club_rider_wages_core_v1(uuid,text,date) from public, anon, authenticated;
grant execute on function public._finance_charge_club_rider_wages_core_v1(uuid,text,date) to service_role;
