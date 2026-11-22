# Project Saturn — SQL view privacy remediation (22 November 2026)

## State: LIVE in Supabase, no Netlify deployment

The nine existing public view names and column contracts are preserved. Fields that reveal live exact rival rider skills, salary/contract, fatigue, training changes, financial balances, wages, or private club management settings are returned as `NULL` unless the **requesting JWT** owns or belongs to the relevant club. Public race, team and rider identities, results and ranking fields remain in the same views.

**Applied migrations:** `saturn_privileged_view_private_field_masking`, `saturn_privileged_view_helper_execute_bridge`, `saturn_privileged_view_service_role_bridge`, `saturn_expired_guest_private_view_guard`. The first was initially rejected because `numeric(14,2)` typmod had not been retained and was rolled back; the corrected version applied successfully. The extra grants preserve PostgreSQL's view-execution requirements. The GitHub initial migration incorporates the corrected type casts and all three role grants for clean replay.

**Nine views masked:**
`club_profile_popup_view`, `rider_statistics_page_international_v1`, `rider_statistics_page_view`, `rider_statistics_view`, `v_rider_modal_skill_ui`, `v_rider_skill_card_deltas`, `v_rider_latest_weekly_change_ui`, `v_rider_latest_weekly_visible_deltas_ui`, `race_participant_riders_v1`.

All nine preserve original column data types, including numeric precision; `security_barrier=true` was added. The nine original definitions were stored under `private.saturn_sensitive_view_originals_20261122` for emergency rollback. No `riders`, `clubs`, `auth.users`, wallet or trial user rows were modified. The private schema remains not directly usable by `anon`, `authenticated` or `service_role`; helpers can be invoked through the views, and return only JWT-checked boolean decisions.

## Verified read-only results

| Test | Result |
|---|---|
| Plain `anon`, club profile rows | **532** retained |
| Plain `anon`, rider statistics rows | **14,856** retained |
| Plain `anon`, non-null private club balances/income | **0** |
| Plain `anon`, non-null exact rider skills, potential and salaries | **0** |
| Authenticated SQL role without a user JWT, non-null private data | **0** |
| Simulated real club owner request, own balance rows | **1**, visible |
| Simulated real club owner request, own riders with exact sprint | **10**, visible |
| Simulated owner, rival private values | **0** |
| Simulated anonymous Auth guest, own balance / exact rider skills | **1 / 10**, visible |
| Simulated anonymous Auth guest, rival private values | **0** |
| Simulated service-role JWT, exact rider values / club balances | **14,856 / 532**, retained |
| Security barrier on patched views / original definitions backed up | **9 / 9** |
| `anon`, `authenticated` and `service_role` direct `private` schema usage | **Denied** |
| Representative anonymous 14.8k rider aggregation | About **0.42s** backend execution, not a browser SLA |

All claim simulations used read-only SQL request settings and return aggregate counts, not private values. **Real browser JWT validation is still pending**. They do not test all player permissions, old cached page behavior, every game-process callsite, scouting precision or a full game cycle.

## Compatibility and limitations

- This is a **database-side privacy fix**: the existing deployed frontend still receives the same view names and column types. Rival-only sensitive fields will now be `NULL`; displays should show `—`/unknown rather than misleading `0`. Public rankings by race and season points remain intact.
- Expired, unconverted guest identities are explicitly denied private values even if club ownership rows remain before cleanup. There were no expired guest accounts available for a live branch test; recheck the expiry behavior when a test trial actually expires.
- Own team and trial guest are authorized based on `auth.uid()` and server-owned `clubs`/member records. All 9 views are subject to the same masking rules. The backend service-role path remains available.
- The remaining Security Advisor definer-view warnings **are not all cleared** by this patch. Other unaudited views and RPCs may still expose private fields. Continue issue #299 and investigate the game-control-centre security findings separately.
- With no current race participant rows and no weekly delta rows, those two future-history mask paths have *static* checks, not a populated-data test. Re-test after real race and weekly updates.
- Test browser with a registered manager, unrelated manager, active anonymous guest, converted guest and a public visitor. Verify Statistics, Rider Profile, Team Profile, Scouting and race participation without using production dummy birthdays.
- **No Netlify deployment required for these database changes.** Application-side labels for unavailable rival values may be improved in the next combined deploy if needed.

## Recovery

The isolated emergency restore SQL is at `supabase/rollback/SATURN_20261122_sensitive_view_masking_RESTORE_ONLY.sql`; it restores original view SQL from the private backups. **Warning:** running it would reopen the sensitive-data exposure. Never run as a routine rollback or as part of a normal migration. Prefer fixing a failing consumer while keeping database masking active.

## Source and verification

- `supabase/migrations/20261122211500_saturn_privileged_view_private_field_masking.sql`
- `supabase/tests/saturn_privileged_view_private_field_mask_verify_readonly.sql`
- `supabase/tests/saturn_private_view_owner_guest_service_verify_readonly.sql`
- `tests/saturnPrivateViewMasking.test.mjs`
- `docs/SATURN_SENSITIVE_VIEW_PRIVACY_AUDIT_2026-11-22.md`
- Ongoing broader security issue: https://github.com/bracko87/ProPeloton-Manager/issues/299
