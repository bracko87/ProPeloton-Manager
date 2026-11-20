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
