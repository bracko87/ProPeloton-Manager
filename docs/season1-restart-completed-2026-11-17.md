# ProPeloton Manager — completed Season 1 restart (17 November 2026)

## Authoritative production state

Supabase project: `okuravitxocyevkexfgi`
Reset run: `3ad6fcce-c798-4e8f-a416-9c614fc7189e`
Completion recorded: 2026-11-17 13:24:05 UTC

**Confirmed by live database queries after the release:**
- Reset run status: `completed`; recorded full validator: `ok=true`.
- Season 1, January 1; resumed at 01:00 game time (subsequent verification showed 01:02).
- Game clock unpaused; maintenance gate unlocked.
- Exactly 64 scheduled jobs active; seven previously inactive jobs remain disabled.
- 14,836 riders, including 7,430 assigned riders and 56 generated free agents.
- 499 baseline competition clubs; 150 fresh road National Championship editions; World Road/Nations competitions rebuilt.
- No future Season 2 races, and old Season 1 test results/ranking/runtime history absent under the full validator.
- Protected: 27 auth accounts, 27 profiles, 27 wallets, 11 player-owned clubs, three Premium subscriptions, and four Premium invoice-payment records.
- Public login route rendered normally at https://propelotonmanager.com/#/login.

## Corrections during release

- Blocked concurrent full-world reset execution before its status check. A prior duplicate invocation had invalidated the status of the other run.
- Enforced the canonical Season 1 club tier/division baseline at final validation.
- Correctly treated a player Developing Team's shared equipment as shared inventory rather than missing owned equipment.
- Kept championship cleanup limited to an authorized, maintenance-locked, paused reset transaction.
- Optimized sponsor eligibility evaluation without changing its rule.
- Blocked automatic supply restocking while the game is paused or in maintenance; cleared old test-season restocking rules on full reset.
- Five automatic supply purchases made while paused were corrected through auditable finance reversals and void records (total 4,950 game cash). Unused unintended stock and stale rules were cleared. The affected club's starting balance was restored to 2,500,000 and full validation passed again.

The original test-world history was explicitly treated as disposable by the owner. The critical account snapshot was a narrow protected-account/entitlement snapshot, **not a full database backup**.

## Scope of verification

This confirms the database restart, data-preservation checks, automatic-job restoration, maintenance release and public login accessibility. It does not certify every authenticated gameplay action; further gameplay QA can be performed in the normal running Season 1 world.
