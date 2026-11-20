# Project Saturn — isolated staging release gate (20 November 2026)

Status: **NOT RUN**. Production is `okuravitxocyevkexfgi`. Do not run
migration/auth/club mutation tests against production.

## Environment

- Supabase branch inventory: **only the default production branch** was found
  on 20 Nov 2026. A new isolated development branch/project is NOT authorized
  until any charges are quoted and explicitly accepted by the project owner.
- Work only in `saturn/full-game-test-accounts-v1` / PR #277 while blocked.
- Use `supabase/tests/saturn_predeploy_schema_preflight.sql` first and verify
  **21 checks pass** against isolated schema before applying migrations.
- Apply proposed SQL migrations to staging in sequence, review dependencies,
  then run `supabase/tests/saturn_postdeploy_authorization_audit.sql`.
- Keep BOTH private signup/test-club gates disabled and the RPC EXECUTE grant
  revoked until the full authorization audit and anti-abuse controls pass.

## Required real test sessions

Each test must use real Supabase JWTs with a distinct `auth.users` UUID;
changing app-local flags or impersonating a client user in JavaScript is not
enough. Seed staging accounts only:

1. Brand-new anonymous user with no official club.
2. Active trial test manager with one official lowest-tier club, 0–6 days old.
3. Standard trial after 168 hours but before 336 hours.
4. Expired test manager exactly at or after 336 hours.
5. Converted verified permanent manager retaining the same UUID and club.
6. Unrelated permanent player with an established team.
7. Normal AI team with current race entries or historical records.

Freeze logical test time or seed server-owned `started_at` in **staging
only**; never manipulate the production game clock.

## Acceptance matrix

| Category | Expected | Verified |
| --- | --- | --- |
| Anonymous signup with both rollout gates OFF | Rejected; no user/club | [ ] |
| Test club creation with invalid nickname/country/kit | Rejected atomically | [ ] |
| Two simultaneous club creation submissions | One club, one trial record, one league slot only | [ ] |
| Attempt to create club using another user ID or client-supplied team tier | Rejected | [ ] |
| Lower regional AI slot unavailable | No club, no AI move, no money | [ ] |
| AI slot has race application/participation in either history format | Cannot be displaced | [ ] |
| Active guest creates real official team | Club, roster, settings, staff/finance, Premium, league all valid | [ ] |
| Club creation failure after AI slot reservation | Entire transaction rolls back, AI unchanged | [ ] |
| Within first 168h | Same 7-day Premium entitlement as standard signup | [ ] |
| 168h elapsed | Premium expires, base game continues | [ ] |
| 336h elapsed | All player-initiated writes rejected | [ ] |
| Expired guest reads club, training, finance and race history | Read-only UI continues | [ ] |
| Expired guest tries direct table write with authenticated JWT | Denied by RLS | [ ] |
| Expired guest tries SECURITY DEFINER mutations | Rejected even if RLS bypassed | [ ] |
| Guest targets another player's club/team/rider | Rejected everywhere | [ ] |
| Existing permanent player | No regression in game APIs and permissions | [ ] |
| AI/scheduler/time progression writes | Continue without treating system as expired human | [ ] |
| Guest converts via email/password | Same Auth UUID and original club/finance/results | [ ] |
| Guest converts via Google | Same Auth UUID; never creates duplicate team | [ ] |
| Conversion after trial expiry | Team and history restored; Premium not restarted | [ ] |
| Converted manager moves to eligible higher-tier vacancy | Only safe unlocked/empty slot, not mid-race | [ ] |
| Public roster/team/national rankings after security_invoker change | All expected pages still display correctly | [ ] |
| Launch and season rollover | No reset, phantom race entry or rank corruption | [ ] |
| Rapid signup/replay attempts | CAPTCHA/rate limiting/anti-farming verified | [ ] |

## Known unverified blockers

- Many more publicly callable SECURITY DEFINER functions and direct Data API
  paths exist beyond the 28 specifically guarded RPCs and 20 base tables.
  A green source test suite proves contract wording, not end-to-end security.
- The selected AI reserve move and new-user financial initializers still need
  a genuine transactional staging test.
- The proposed `club_roster` `security_invoker=true` may change which roster
  rows public and national-team pages can see.
- Conversion and high-tier vacancy promotion remain incomplete.
- No production migration, anonymous Auth signup, or feature activation is
  authorized by this checklist.

## Evidence to record at approval

For each case: staging project ref, source commit SHA, test user UUID prefix
(not full personally identifying data), timestamp, expected result, actual
result, DB rollback evidence where relevant, and reviewer sign-off.


## Staging billing and conversion-completion addendum

Attempted to provision `saturn-14day-guest-staging` without a confirmation ID. Supabase explicitly refused with `This client needs a cost confirmation ID`. **No staging branch was created.** A cost quote requires the owner's exact Supabase organization ID and explicit approval of the quoted amount/frequency before a new branch may be provisioned. Until then only read-only schema validation and GitHub static/build checks are authorized.

A dedicated source migration now adds `saturn_finalize_test_account_email_conversion_v1()`. It checks the **original** `auth.uid()` from the existing anonymous trial, canonical `auth.users.is_anonymous=false`, a confirmed email, an actual password credential, official club ownership and owner membership. It locks and marks only that same lifecycle's `converted_at`, idempotently, without restarting the original Premium term or creating new clubs, finances, user wallets or race entries. The conversion UI must receive success and the matching user ID from this RPC before claiming account conversion is complete.

Further staging acceptance:
- Email update + confirmation + password update all operate on the SAME Auth UUID.
- Calling finalizer on an anonymous account, email-unconfirmed account, passwordless account or different original UUID must fail.
- A converted manager may retry finalization without any additional Premium or duplicate clubs.
- Registration after 336h must restore original assets and permit permanent gameplay without resetting standings.
- OAuth / Google conversion is separate work and is not implemented by this password-based finalizer.


## SAT-02 Google identity linking source milestone — not live tested

Based on Supabase's current documented anonymous-upgrade flow (manual identity linking, not a new `signInWithOAuth` account), the review branch now includes:

- `testClient.auth.linkIdentity({ provider: 'google', options: { redirectTo } })` on the original persistent anonymous Auth session, retaining the same `auth.uid()`.
- A callback URL with a dedicated `saturn_google_link=1` query parameter **outside** the HashRouter `#/test-account-register` fragment. Only the persisted Saturn test client processes that tagged OAuth callback, while the ordinary in-memory game client intentionally skips it. Untagged ordinary OAuth callbacks retain normal handling.
- A server-owned `saturn_finalize_test_account_google_conversion_v1()` that checks canonical `auth.users.is_anonymous=false`, a real linked `auth.identities.provider='google'` record with `user_id=auth.uid()`, the original 14-day test lifecycle, exact official club ownership and owner membership. Only then does it idempotently set the original `converted_at` field.
- The UI checks the linked Google identity and matching original user UUID, finalizes over the original persistent test client and restores that same session to the game client. It reports success only after all checks complete; no new club or Premium grant occurs.

**Required staging Auth setup** (do not configure in production before approval): Enable manual identity linking in Supabase Auth and configure Google OAuth with the app's exact return URL including the dedicated callback path/query pattern. Verify the redirect allowlist accepts the tagged HashRouter URL in the actual deployment, and that callback code is consumed by the persistent test client only. The generic "Sign in with Google" flow is **NOT** a permitted substitute, since that can create or select a different Auth UUID. Existing Google identities belonging to other registered accounts must be rejected safely, not silently merged.

**No OAuth flow was executed against production or staging.** The source CI checks are static/build-only; replay, callback, session refresh, Auth identity creation, and completed trial conversion all remain staging TODOs.


## SAT-03 conversion vacancy placement (source only)

The separate, idempotent-after-success `saturn_place_converted_test_team_v1()` checks canonical permanent Auth, original `saturn_test_accounts_v1.converted_at`, exact unchanged club UUID, active non-AI ownership and original owner membership before attempting any move. It never creates a new club or changes rider contracts, results, season points, finances or Premium terms.

**Capacity must be approved, not guessed.** The private `saturn_converted_vacancy_caps_v1` contains a strict `world_tier` + `club_tier` + regional code cap, `approved_at` and `enabled=false` default; **no capacities are prefilled**. Each candidate must match official country-to-ProTeam/Continental/Amateur regional functions. It checks ALL currently active AI/human clubs against the approved cap; a full division is skipped. The highest approved empty upper-tier destination is chosen first, with locks to serialize simultaneous requests. The function **does not displace any AI or human club** and leaves the current team unchanged when no approved higher vacancy exists.

No placement is attempted during an armed season transition or while the same club has unresolved race applications or entries in the legacy/v1 participation systems. Race records remain attached to the same club ID; no results are deleted or rewritten. Existing permanent team creation still uses its original logic; these new restrictions are conversion-specific.

The email-password and Google registration screens call the optional placement RPC **only after successful conversion finalization**. Failure or lack of vacancy never invalidates registration. Players receive a status indicating moved, pending due to race/season, or no approved higher vacancy.

**Staging verification still required:** transaction/trigger/RLS compilation, upper-tier occupancy under concurrent conversions, official region eligibility, league standings/race calendars and active race handling, season reset, finance stability, and the correct division hierarchy. No approved capacity exists by default, and no production team has been moved. Full-game roll-out remains OFF.


## SAT-03 hardening update — one-time placement, admin concurrency, real league existence

The approved-vacancy placement code now records every **successful** conversion placement in the private `saturn_converted_team_placements_v1` table, unique by original `user_id` and `club_id`. A repeat call returns `already_placed`, never another promotion. If no approved vacancy exists, no row is written and the manager may retry later. Tier update and audit INSERT occur in one database transaction; either both commit or both roll back.

Concurrent capacity changes are now handled using the **fresh `max_teams` value selected with `FOR UPDATE`** after the per-league advisory lock, rather than the potentially stale loop snapshot. A disabled or unapproved capacity row is ignored. Before considering a destination, the function also verifies that the exact competition `club_tier` + `world_tier` + regional division has an existing active main-club cohort. A mistaken capacity record cannot manufacture a new league.

Added `supabase/tests/saturn_approved_vacancy_occupancy_audit.sql`: **READ-ONLY STAGING QUERY** showing approved/disabled capacities, active AI and human incumbents, current total occupancy, usable vacant slots, and review status. It never creates or approves slot records. Run after draft migrations and before enabling any capacity. Do not run on production: the capacity table does not exist there.

**Staging cases remaining:** duplicate concurrent submissions, one-time placement retries, rollback after interrupted audit insert, administrator reducing/disabling a capacity during placement, and a capacity entry for a nonexistent region/league. These are explicit TODO checks, not completed database integration tests.


## SAT-03 critical integration: existing TOP-3 AI overflow trigger

Live read-only schema inspection identified `trg_rebalance_top3_overflow_ai_to_pool_v1` on `public.clubs`. It executes `rebalance_top3_overflow_ai_to_pool_v1` after an inserted/updated human WorldTeam, ProTeam or Continental club. That function works on **category + region across all world tiers**, with a 25-team upper boundary; it may move existing AI clubs into the reserve pool. An approved capacity **within one world tier** is therefore NOT sufficient to prove that a conversion into a top-three division won't disturb other teams.

Actual snapshot: WorldTeam 25, PRO_WEST 27, PRO_EAST 20; Continental Africa 20, America 24, Asia 22, Europe 22, Oceania 24 (read-only November 20, 2026). These are changing game totals, NOT permanent approved capacity values.

The proposed conversion SQL now has a **private transaction-scoped TOP-3 update ticket**, locked against the exact original user/club and verified source and destination tiers/region. Only the conversion's precise club UPDATE skips the legacy overflow trigger; every normal permanent-account onboarding or club update retains the preexisting rebalancing behavior. Before issuing a ticket, the placement RPC takes an advisory lock on the **global** category/region pool and verifies the current all-world-tier incumbent count is strictly below 25. It still applies the narrower explicitly approved per-world-tier cap. Ticket insertion, actual club update, ticket deletion and immutable successful placement audit share one transaction; any exception rolls all changes back.

**Unverified staging cases:** trigger execution order, normal registered-player top-tier rebalancing remains unchanged, converted vacancy does not move AI/human clubs or rewrite historical races, global cohort counts remain bounded under parallel conversions across different world tiers, PRO_WEST over-cap remains blocked, and simulation/season movement still works. No production trigger, AI team, race or placement table was modified.


## Offline PostgreSQL parser gate — confirmed 20 Nov 2026

The Saturn workflow now installs Python `pglast` and runs `scripts/saturn_sql_parse.py` against **every `supabase/migrations/*saturn*.sql`** migration and `supabase/tests/saturn*.sql` audit. Unlike the earlier regex-based Node contract tests, this actually parses the **top-level PostgreSQL SQL statements** without connecting to production or requiring a chargeable staging database.

On first execution this gate correctly caught **six draft files** with invalid statement boundaries: the Saturn admin analytics function (one) and five new race/training/equipment/transfer/financial RPC migrations. Some existing `pg_get_functiondef()` snapshots had no terminating semicolon, including compact `end;$function$` endings. All detected SQL termination defects were fixed on the review branch. Latest verified source commit `a17f263767f02f5b88a574d3494080816a2638b0`: **233 valid top-level PostgreSQL statements across 22 Saturn SQL files**, Saturn test suite **116 pass, 0 fail, 93 pending integration**, and all three GitHub workflows including frontend build PASS.

**Limit:** This parser does NOT compile the PL/pgSQL body inside `AS $function$ ... $function$` or resolve database table/column types, triggers, SECURITY DEFINER ownership, RLS execution, Auth sessions, transaction semantics or the effect of triggers on other clubs. A complete staging database remains a release blocker. The SQL parser must remain a mandatory gate for future edits to these migration files.


## Deeper PL/pgSQL parser verification — 20 Nov

The no-cost GitHub SQL parse gate now checks not only the outer PostgreSQL statements but also **PL/pgSQL stored function bodies**, using pglast `parse_plpgsql` on each full `CREATE FUNCTION ... LANGUAGE plpgsql` statement.

The first run identified a faulty `release_rider_to_free_agents` source variable definition/selection (`v_role`, an otherwise unused rider enum value), followed by a more consequential guard-placement mistake in `upgrade_club_facility`: an expiry `IF EXISTS` block had been accidentally inserted inside an `INSERT INTO public.club_infrastructure (...)` column list. Both have now been corrected in draft source. A dedicated Node regression assertion verifies that the 14-day guest expiry check executes **before** the facility write. The PL/pgSQL parse step is now a mandatory GitHub review gate.

Verified source commit `d96f9fcde7b89c1920e5601753c61a485f6ac868`: **233 top-level SQL statements and 43 PL/pgSQL function bodies parsed in 22 Saturn SQL files**, **210 Saturn tests (117 pass, 0 fail, 93 pending integration)**, and all three GitHub workflows including application build passed.

**Remaining limitation:** Offline body parsing checks grammar, NOT function execution against PostgreSQL catalog types, role grants, RLS evaluation, triggers or multiclub transactional side effects. Do not merge or deploy without real isolated Supabase staging tests. No production change occurred.
