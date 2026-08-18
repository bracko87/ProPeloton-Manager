-- Phase 11A read-only database legacy dependency inventory.
-- This is an inventory only. Do NOT delete anything during Phase 11A.

with function_sources as (
  select
    n.nspname as schema_name,
    p.proname as function_name,
    p.oid::regprocedure::text as signature,
    lower(pg_get_functiondef(p.oid)) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
), legacy_references as (
  select
    signature,
    function_name,
    case
      when definition like '%run_race_stage_road_race_v1%' then 'run_race_stage_road_race_v1'
      when definition like '%race_engine_write_road_replay_frames_v1%' then 'race_engine_write_road_replay_frames_v1'
      when definition like '%race_engine_write_stage_results_v1%' then 'race_engine_write_stage_results_v1'
      when definition like '%race_engine_finalize_road_stage_v1%' then 'race_engine_finalize_road_stage_v1'
      else 'other legacy race reference'
    end as reference_kind
  from function_sources
  where definition like '%run_race_stage_road_race_v1%'
     or definition like '%race_engine_write_road_replay_frames_v1%'
     or definition like '%race_engine_write_stage_results_v1%'
     or definition like '%race_engine_finalize_road_stage_v1%'
)
select *
from legacy_references
order by reference_kind, signature;

select
  to_regclass('public.race_stage_simulation_runs') is not null as simulation_runs_present,
  to_regclass('public.race_stage_authoritative_runs') is not null as authoritative_runs_present,
  to_regclass('public.race_stage_results') is not null as official_results_present,
  to_regclass('public.race_stage_point_results') is not null as official_points_present,
  to_regclass('public.race_stage_report_events') is not null as report_events_present,
  to_regclass('public.race_engine_stage_wear_applications') is not null as wear_ledger_present,
  to_regclass('public.race_stage_supply_usage_events') is not null as supply_usage_ledger_present;

-- If public.race_engine_runtime_control_v1 exists in this installation, inspect it
-- separately and confirm its legacy execution switches remain disabled. The script
-- intentionally does not reference the relation directly so it stays portable across
-- historical schema versions.
select to_regclass('public.race_engine_runtime_control_v1') as runtime_control_relation;
