# Project Saturn — SAT-11 production privilege hardening

**Date:** 23 November 2026  
**State:** Applied to live Supabase, permission check passed. No frontend or Netlify deployment.

## Summary

The public Data API previously allowed anonymous and ordinary authenticated callers to invoke 24 additional `postgres`-owned `SECURITY DEFINER` functions that alter or coordinate finance, sponsor payments, rider/staff contracts, training and health, race processing, seasonal resets and player-team inactivity.

**SAT-11 closes only the direct API execution path**, without changing any business logic or invoking the processors.

### Applied production migration

`supabase/migrations/20261123084033_saturn_restrict_remaining_internal_finance_season_process_v1.sql`

Each exact signature is checked against the database catalogue, including its owner, `SECURITY DEFINER` status, lack of non-definer function callers, lack of trigger attachments and view-rule references. Then `EXECUTE` is revoked from `PUBLIC`, `anon` and `authenticated`, and explicitly preserved for `service_role`. Internal definer-function calls and privileged scheduler roles continue to use the existing definitions.

The 24 functions cover:

- **Finance:** staff payroll, weekly team-policy charges, missed-startlist and disqualification fines, monthly tax-audit processing, policy cost synchronization.
- **Player and team lifecycle:** birthday rewards, inactive team handling, staff and rider contract expiry, rider submission deadlines, sponsor processing, weekly development, daily training camps and health cases.
- **Global scheduling:** forward daily automation, daily backlog tasks, watchdog processing, season transition, due season reset and full season reset.

## Verification

The live SQL role check reports exactly 24 functions, and **all 24** deny `anon` and `authenticated`, while preserving `service_role`. The change did not mutate player data, balances, races or game time.

The Supabase Security Advisor shows anonymous-callable `SECURITY DEFINER` functions falling from **1,211 to 1,187** after SAT-11; authenticated-callable warnings now **1,388**; there are **31** remaining definer-view warnings. These are triage numbers, not necessarily 1,187 independently exploitable bugs.

The automated checks cover exact signatures, SQL preflight, no direct mutations in the migration source, previous SAT-10 grants, and the production frontend build. This is **not** a substitute for testing an actual real player JWT and authorized admin operations.

## Boundaries and release implications

- Game state and clock were previously observed **paused**; the game-minute tick cron job was **inactive**. Do not unpause just to test security grants.
- No live gameplay tick, tax audit, monthly process, birthday reward, season reset or payroll process was called for verification. Those processes must be observed after the intentional game resumption.
- Admin UI that calls a restricted function directly with ordinary authenticated credentials will now fail permission checks. It must be migrated to a **server-verified administrator endpoint**, not reopened to every signed-in player.
- Static `prosrc` dependency scanning detects ordinary SQL function references but may miss dynamic SQL or external clients. Review Netlify and other service integrations and test authorized admin workflows before marking all operations release-ready.
- Remaining public API functions may provide indirect ways into the same processes. Continue with individual risk triage rather than blanket revocation. Other default-definer public ranking views need public-data/RLS compatibility review.
- No new Netlify deploy was used and no change to registration, Guest Mode, Coins, Premium or team ownership code.

## Files

- `supabase/migrations/20261123084033_saturn_restrict_remaining_internal_finance_season_process_v1.sql`
- `supabase/tests/saturn_internal_finance_season_rpc_permissions_readonly.sql`
- `tests/saturnInternalFinanceSeasonPermissions.test.mjs`
- `.github/workflows/saturn-finance-season-privilege-gate.yml`

Track the broader ongoing investigation at [security issue #299](https://github.com/bracko87/ProPeloton-Manager/issues/299).
