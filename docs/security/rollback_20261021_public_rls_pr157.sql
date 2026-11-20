-- Emergency reversible DDL ONLY for PR #157 (2026-10-21).
-- This restores the PRE-PR #157 access configuration of the listed 20 tables.
-- No data rows, race results, club records, game clock, or views are altered.
-- SECURITY RISK: returning to prior RLS-disabled state temporarily restores previous public access.
-- Only run after documenting a specific regression; then prioritize a safe forward fix.
-- DO NOT run this file automatically as part of a normal migration chain.

begin;
set local lock_timeout = '4s';

drop policy if exists "nations_competition_schedule_config_authenticated_read" on public.nations_competition_schedule_config;
drop policy if exists "youth_competition_transition_movements_v1_authenticated_read" on public.youth_competition_transition_movements_v1;
drop policy if exists "youth_team_standing_history_v1_authenticated_read" on public.youth_team_standing_history_v1;
drop policy if exists "race_eligibility_notification_state_own_club_read" on public.race_eligibility_notification_state;
drop policy if exists "team_policy_nonrecurring_charge_state_v1_own_club_read" on public.team_policy_nonrecurring_charge_state_v1;
drop policy if exists "team_policy_rider_effect_log_v1_own_club_read" on public.team_policy_rider_effect_log_v1;
drop policy if exists "national_association_renewal_coin_events_own_read" on public.national_association_renewal_coin_events;

alter table public.admin_shadow_validation_runs_v1 disable row level security;
alter table public.championship_calendar_draw_state_v1 disable row level security;
alter table public.premium_trial_claim_history_v1 disable row level security;
alter table public.premium_trial_launch_v1 disable row level security;
alter table public.premium_welcome_trials_v1 disable row level security;
alter table public.race_engine_calculation_survival_audit_v1 disable row level security;
alter table public.race_engine_due_stage_watchdog_v1 disable row level security;
alter table public.race_safe_checkpoint_frames_v1 disable row level security;
alter table public.race_safe_checkpoint_shards_v1 disable row level security;
alter table public.race_safe_checkpoint_transfer_chunks_v1 disable row level security;
alter table public.race_stage_safe_calculation_v1 disable row level security;
alter table public.rider_skill_snapshot_week_health_v1 disable row level security;
alter table public.youth_academy_service_config disable row level security;
alter table public.nations_competition_schedule_config disable row level security;
alter table public.youth_competition_transition_movements_v1 disable row level security;
alter table public.youth_team_standing_history_v1 disable row level security;
alter table public.race_eligibility_notification_state disable row level security;
alter table public.team_policy_nonrecurring_charge_state_v1 disable row level security;
alter table public.team_policy_rider_effect_log_v1 disable row level security;
alter table public.national_association_renewal_coin_events disable row level security;

-- The original baseline was RLS=false and 0 policies for each table.
-- No view properties or game data are modified.
commit;
