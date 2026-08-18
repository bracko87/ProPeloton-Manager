-- Phase 11B emergency pause.
-- Stops future universal lifecycle work AND pauses authoritative game time at
-- its current stored position. Does not delete race data or alter cron jobs.

begin;

update public.race_engine_runtime_control_v1
set typescript_lifecycle_enabled = false,
    updated_at = clock_timestamp(),
    updated_by = current_user,
    notes = 'Phase 11B emergency pause: universal lifecycle disabled; stored data retained.'
where singleton_id = true;

-- Pause config first so any game_state trigger sees the administrative pause.
update public.game_clock_config
set is_paused = true
where id = true;

update public.game_state
set is_paused = true
where id = true;

commit;

select jsonb_pretty(jsonb_build_object(
  'status', 'phase11b_emergency_paused',
  'current_game_timestamp', public.get_current_game_timestamp(),
  'game_state', (select to_jsonb(gs) from public.game_state gs where gs.id = true),
  'game_clock_config', (select to_jsonb(gc) from public.game_clock_config gc where gc.id = true),
  'runtime_control', (select to_jsonb(c) from public.race_engine_runtime_control_v1 c where c.singleton_id = true)
)) as phase11b_emergency_pause_result;
