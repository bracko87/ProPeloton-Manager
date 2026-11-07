-- Restrict internal race-engine diagnostic views to trusted server roles.
-- These expose function inventories, award reconciliation and finance
-- transaction metadata; they are not public gameplay endpoints.
-- Do not change underlying views, RLS, engine logic, or production results.
-- Internal owner / service_role can still query; ordinary player roles cannot.

revoke all privileges on public.race_engine_function_audit_v1 from public, anon, authenticated;
grant select on public.race_engine_function_audit_v1 to service_role;
revoke all privileges on public.race_engine_missing_participant_team_rows_v1 from public, anon, authenticated;
grant select on public.race_engine_missing_participant_team_rows_v1 to service_role;
revoke all privileges on public.race_engine_paid_orphan_prize_award_audit_v1 from public, anon, authenticated;
grant select on public.race_engine_paid_orphan_prize_award_audit_v1 to service_role;
revoke all privileges on public.race_engine_paid_orphan_prize_award_detail_v1 from public, anon, authenticated;
grant select on public.race_engine_paid_orphan_prize_award_detail_v1 to service_role;
revoke all privileges on public.race_engine_paid_orphan_prize_finance_transactions_v1 from public, anon, authenticated;
grant select on public.race_engine_paid_orphan_prize_finance_transactions_v1 to service_role;
revoke all privileges on public.race_engine_paid_orphan_prize_reversal_plan_rows_v1 from public, anon, authenticated;
grant select on public.race_engine_paid_orphan_prize_reversal_plan_rows_v1 to service_role;
revoke all privileges on public.race_engine_paid_orphan_prize_reversal_plan_summary_v1 from public, anon, authenticated;
grant select on public.race_engine_paid_orphan_prize_reversal_plan_summary_v1 to service_role;
revoke all privileges on public.race_engine_replay_density_audit_v1 from public, anon, authenticated;
grant select on public.race_engine_replay_density_audit_v1 to service_role;
revoke all privileges on public.race_engine_replay_function_audit_v1 from public, anon, authenticated;
grant select on public.race_engine_replay_function_audit_v1 to service_role;
revoke all privileges on public.race_engine_replay_storage_by_stage_v1 from public, anon, authenticated;
grant select on public.race_engine_replay_storage_by_stage_v1 to service_role;
revoke all privileges on public.race_engine_stage_output_integrity_v1 from public, anon, authenticated;
grant select on public.race_engine_stage_output_integrity_v1 to service_role;
revoke all privileges on public.race_engine_stage_processing_function_inventory_v1 from public, anon, authenticated;
grant select on public.race_engine_stage_processing_function_inventory_v1 to service_role;
revoke all privileges on public.race_engine_stage_sporting_integrity_v1 from public, anon, authenticated;
grant select on public.race_engine_stage_sporting_integrity_v1 to service_role;
