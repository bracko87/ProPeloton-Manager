# ProPeloton Manager — final-test live issue repair (17 Nov 2026)

## Status
Work was applied **directly to the production Supabase project** `okuravitxocyevkexfgi` while the owner was running the *closed final test* in Season 1 at **6×** game speed. Registration was kept blocked. No game restart, user-account deletion, coin/Premium edit or reset was performed.

The last full database verification returned **0 unresolved Control Center incidents** (0 critical, 0 high, 0 warning); 64 pg_cron jobs active; account-protection hash unchanged; 27 auth accounts and 11 owned clubs preserved. This is **not** a claim that race results and rider training have been tested end-to-end for the month. Newly scheduled races and the first completed training day must still be watched.

## Fix 1 — Human team's basic training
A previous check found 8 active human first teams without any default training plan. Added missing baseline `general / normal / auto_when_free=true` records with `ON CONFLICT DO NOTHING`, preserving two existing custom `sprint` and `climbing` defaults. Added `trg_ppm_seed_new_human_club_default_training_v1` on new human club inserts. Latest check: **0 active human clubs missing defaults**, **0 AI clubs missing the previously enforced general defaults**. No coach was invented or hired.

## Fix 2 — Youth Academy delegated staffing
The only active human Youth Academy had **no hired U16 head coach**, while the `race_entry_decider` and `race_squad_decider` were delegated to that role. Both were assigned back to the owner/manager rather than inventing staff, in keeping with the user rule that an unavailable staff member's responsibilities revert to the player. `monitor_youth_staff_responsibilities_health_v1()`: **0 issues**, including no missing mandatory delegated role.

## Fix 3 — Three race-stage scoring/profile conflicts
The two *Tour del Solis* stages, 2000-01-06 and 2000-01-07, had route/profile sprint and KOM definitions inconsistent with their already-established `race_stage_points` scoring records. Profile data and `race_stages` sprint/KOM/route markers were reconciled to the scoring catalogue. The 2000-05-12 opening Polkowice stage of *Piastowskie Grody Tour* had an ITT timing gate incorrectly represented as a points sprint; retained the non-scoring timing checkpoint in route markers, removed its one bogus sprint-scoring record, and corrected the stage format to `individual_time_trial`. All three stages had **zero authoritative race simulations/results** at repair time. `monitor_future_race_scoring_profile_integrity_v1()`: **0 issues**. Other race results were untouched.

## Fix 4 — Youth races placed outside climate windows
The previously reset world scheduled **1,044** Season 1 youth races. Of those, **282 future scheduled races** violated the existing documented `private.youth_race_city_weather_eligible_v9` weather gate (approved host-city months and country weekly max temperature >=15°C). These 282 races were cancelled and hidden; the **remaining 762 valid races were kept**. We deliberately did not call the wider `apply_youth_weather_calendar_v8` function, which would have cancelled many additional valid fixtures through monthly quotas, because that would change the test calendar beyond the confirmed problem. Future scheduled races are protected with `zz_ppm_youth_climate_schedule_guard_v1`.

There were **270 AI youth entries** in the cancelled weather-ineligible events, with exactly matching debit records. Those entries were withdrawn and **1,248,944 in-game cash** was refunded in 270 positive `race_cancellation_refund` ledger records, matched to the original entry/travel ledger; 270 per-entry audit rows are retained privately in `private.ppm_youth_climate_cancel_refund_audit_v1`. Corresponding season-budget spent totals were reduced by exactly the refund totals. No player Academy had entered any of these cancelled races; no completed youth race was rewritten. Verification: 762 scheduled/282 cancelled, 0 weather-invalid active races, 0 entered-in-cancelled races, refunded ledger total exactly 1,248,944, `monitor_youth_competition_health_v1()` 0 issues and `monitor_youth_finance_health_v1()` 0 issues.

## Fix 5 — False overdue alerts immediately after protected reset
Three active cron jobs (rider wages, staff wages, birthday gifts) were raising stale-alerts for run slots missed **during the protected restart** even though their next post-resume scheduled slots were not yet due. Added `private.ppm_cron_reset_first_due_grace_v1` and a tightly scoped branch to the existing watchdog. The branch suppresses the **first scheduled run's overdue alert only until 15 minutes after that job's next actual post-resume due slot**. Real missed runs after that point are still reported; missing or disabled jobs still report. Does **not** fabricate successful job runs or issue premature/double payroll payments. The 6-hour news job had since run successfully. `run_system_health_watchdog_base_v1()` returned `active_checks_failed:0`.

## Changes saved to GitHub
- SQL for **permanent non-destructive guards** was committed as `supabase/migrations/20261117193000_prelaunch_club_training_youth_weather_watchdog_guards_v1.sql`.
- **One-time historical corrections** were applied as named production migrations:
  - `repair_human_club_basic_training_defaults_and_youth_manager_fallback_20261117`
  - `repair_tour_del_solis_and_piastowskie_race_stage_scoring_profiles`
  - `repair_youth_calendar_climate_invalid_fixtures_and_refund_ai_entries_20261117`
  - `maintenance_aware_cron_scheduler_monitor_grace_20261117`

**Do not turn one-time financial refunds, test-data cancellation or existing-race corrections into an automatically re-run migration.** The GitHub migration contains only idempotent functional guards, not destructive one-time data repair.

## What is not yet verified
- Actual senior rider training / skill improvement after the first full game day and first completed game week.
- Calculated results and classifications for January 6–7 *Tour del Solis*.
- Actual completion of the payroll/birthday cron jobs at their next scheduled run and the scheduler's alert reactivation if a run is truly missed.
- The complete next month of game progression. Future issues may surface as the accelerated season proceeds.

The user's planned **pretest clean reset** and **later final launch reset** are separate tasks and were **not** performed here. At the final reset, re-check all human/AI club training defaults, climate-valid youth fixtures, stage scoring, refunds/finances, signup block and protection of existing identities/entitlements before publication.
