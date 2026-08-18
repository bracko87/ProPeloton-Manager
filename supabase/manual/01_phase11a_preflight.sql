-- Phase 11A read-only installation / prerequisite audit.
-- Safe to run before and after the Phase 11A migration. No writes.

with required_functions(signature) as (
  values
    ('public.universal_race_stage_claim_calculation_v1(uuid)'),
    ('public.universal_race_stage_fail_calculation_v1(uuid,uuid,text,jsonb)'),
    ('public.race_engine_get_stage_rider_inputs_v1(uuid)'),
    ('public.race_engine_get_stage_phase_commands_v1(uuid)'),
    ('public.race_engine_get_stage_phase9_inputs_v1(uuid)'),
    ('public.get_race_stage_pre_stage_leaders_v1(uuid)'),
    ('public.get_race_stage_profile_detail_v1(uuid)')
), function_status as (
  select
    signature,
    to_regprocedure(signature) is not null as installed
  from required_functions
), required_relations(relation_name) as (
  values
    ('public.race_stage_simulation_runs'),
    ('public.race_stage_automation_state'),
    ('public.race_stage_results'),
    ('public.race_stage_point_results'),
    ('public.race_stage_report_events'),
    ('public.race_stage_plans'),
    ('public.race_stage_plan_riders'),
    ('public.race_preparations'),
    ('public.race_stage_points'),
    ('public.riders')
), relation_status as (
  select
    relation_name,
    to_regclass(relation_name) is not null as installed
  from required_relations
)
select 'function' as object_type, signature as object_name, installed
from function_status
union all
select 'relation', relation_name, installed
from relation_status
order by object_type, object_name;

select
  p.oid::regprocedure::text as signature,
  pg_get_function_result(p.oid) as return_type,
  l.lanname as language,
  p.provolatile as volatility
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.proname in (
    'race_engine_get_stage_phase9_inputs_v1',
    'universal_race_stage_claim_calculation_v1',
    'universal_race_stage_fail_calculation_v1',
    'universal_race_stage_submit_calculation_v1',
    'get_universal_race_stage_replay_payload_v1'
  )
order by p.proname, p.oid::regprocedure::text;

-- Historical official-result fingerprint. Save this output before Phase 11A
-- verification and compare it again afterwards. Phase 11A must not change it.
select
  count(*)::bigint as official_result_rows,
  count(distinct race_id)::bigint as races_with_results,
  count(distinct stage_id)::bigint as stages_with_results,
  md5(coalesce(string_agg(
    md5(concat_ws('|',
      coalesce(race_id::text, ''),
      coalesce(stage_id::text, ''),
      coalesce(rider_id::text, ''),
      coalesce(team_id::text, ''),
      coalesce(rank::text, ''),
      coalesce(status::text, ''),
      coalesce(elapsed_seconds::text, ''),
      coalesce(gap_seconds::text, ''),
      coalesce(bonus_seconds::text, ''),
      coalesce(penalty_seconds::text, ''),
      coalesce(output_contract::text, '')
    )), '' order by stage_id::text, rank, rider_id::text), '')) as official_result_fingerprint
from public.race_stage_results;
