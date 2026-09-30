create index if not exists race_stage_simulation_runs_phase11b_claim_idx
on public.race_stage_simulation_runs (
  status,
  (coalesce(result_summary_json->>'survival_phase','')),
  (coalesce(result_summary_json->>'pass2_scenario_mode','')),
  failed_at,
  started_at,
  created_at
)
where coalesce(result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1';
