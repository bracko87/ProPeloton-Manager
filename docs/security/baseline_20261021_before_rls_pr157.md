# Production baseline — ProPeloton Manager, PR #157

Capture time: **2026-10-21 09:15:51 UTC** (11:15:51 Europe/Berlin).
Project ref: `okuravitxocyevkexfgi`, `main` SHA `bddc14fe109520e932c82738de4394dcb88c9966`.
This baseline is from SELECT-only queries against the live Supabase database.

## Schema baseline

- All 20 targeted public tables exist with `relrowsecurity = false` and **zero policies**.
- Total definer-mode public SQL views: **45** (historical standings/statistics access intentionally preserved).
- No production changes applied at baseline capture.

## Exactly counted rows in target tables

| Table | Exact rows at capture |
|---|---:|
| admin_shadow_validation_runs_v1 | 4 |
| championship_calendar_draw_state_v1 | 1 |
| premium_trial_claim_history_v1 | 1 |
| premium_trial_launch_v1 | 1 |
| premium_welcome_trials_v1 | 1 |
| race_engine_calculation_survival_audit_v1 | 4,051 |
| race_engine_due_stage_watchdog_v1 | 1,305 |
| race_safe_checkpoint_frames_v1 | 37,365 |
| race_safe_checkpoint_shards_v1 | 459 |
| race_safe_checkpoint_transfer_chunks_v1 | 0 |
| race_stage_safe_calculation_v1 | 796 |
| rider_skill_snapshot_week_health_v1 | 26 |
| youth_academy_service_config | 1 |
| nations_competition_schedule_config | 1 |
| youth_competition_transition_movements_v1 | 0 |
| youth_team_standing_history_v1 | 0 |
| race_eligibility_notification_state | 35 |
| team_policy_nonrecurring_charge_state_v1 | 1,539 |
| team_policy_rider_effect_log_v1 | 0 |
| national_association_renewal_coin_events | 0 |

**Note**: these are live, evolving backend tables. Counts may naturally change as the game runs at 12x speed. A different count is NOT automatically data corruption. Migration has no DML statements; also compare older records/IDs if needed.

## Live game baseline

- 624 clubs, 27 profiles, 857 races, 179,733 stage results, 3,422 simulation runs.
- Season 1; game clock running at 12x.
- Team standings, team international statistics and rider statistics return data with both anon and authenticated database-role smoke tests (see linked PR audit).
- Universal replay snapshot persistence checked separately: 20 latest completed simulation runs contain output snapshots and replay timeline checkpoints.
- No automated signed-in frontend session available at capture. Do not claim player-account UX tested until a real session was exercised.

## Rollback procedure

The exact previous schema/policy state is restorable using
`docs/security/rollback_20261021_public_rls_pr157.sql`. This does **not** restore past game clock/data time, and does **not** replace a full point-in-time backup. It restores only the 20 target tables' pre-change access rules.

1. Record the failing frontend screen/API response and table; check the actual player role/JWT first.
2. Prefer a narrow forward policy correction. If immediate restoration is needed, run the vetted rollback SQL directly in the live Supabase project and verify RLS=false/policies=0 on only those 20 tables.
3. Record a forward-only corrective migration in GitHub; do not delete prior migration history or rewind the active game database.
4. Re-test standings, statistics, replay, premium, youth academy and team policies, and reconcile runtime logs.

## Safety check commands

```sql
select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity=false;

select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='v'
  and not coalesce(c.reloptions,array[]::text[]) @> array['security_invoker=true'];
```
