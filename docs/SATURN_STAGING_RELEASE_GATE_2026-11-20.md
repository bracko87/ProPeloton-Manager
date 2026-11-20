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
