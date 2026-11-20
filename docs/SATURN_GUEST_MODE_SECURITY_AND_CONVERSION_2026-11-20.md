# Project Saturn — Guest Mode security and conversion design

**Game:** ProPeloton Manager only. **Date:** 20 November 2026.  
**Work items:** SAT-01 (Play as Guest), SAT-02 (convert identity), SAT-08 (abuse prevention).  
**Status:** first server-side security safeguards *implemented and verified*; Guest Mode itself **OFF**, conversion not implemented.

## Live, independently verified before any public guest access

The production database has an Auth user table with an authoritative `is_anonymous` boolean, not an app-controlled flag. Supabase anonymous sign-ins carry the `authenticated` SQL role, so existing `TO authenticated` RLS does not distinguish guests from verified players. Existing ProPeloton profile-creation and reward code was inspected, not inferred from Tennis.

Safety protections deployed:

1. `private.ppm_guest_auth_gate_v1` is a private, RLS-enabled table with no public or logged-in SELECT permission. Initial `enabled=false`; `enabled=true` is constrained to require `verified_at`. Migration replay **never silently re-enables** it.
2. `auth.users` has an enabled `BEFORE INSERT` guest trigger. A Supabase Auth anonymous user is rejected while the gate is closed, **even if someone accidentally enables anonymous Auth provider access or calls the Auth endpoint directly**. Standard permanent registration does not match the guard.
3. The existing `public.grant_welcome_coins_for_new_profile()` now skips canonical anonymous Auth users so repeated guest registrations cannot collect the 20 welcome coins.
4. The existing `public.get_my_premium_trial_onboarding_v1()` returns `state: ineligible`, `reason: guest_account` and no welcome/expiry popup for guests; no claim-history row is inserted.
5. The existing `public.create_club()` rejects a guest caller.
6. `public.clubs` additionally has an INSERT/owner-update trigger rejecting guest ownership, closing the direct-table-write loophole caused by existing `clubs_insert_own` RLS permitting `authenticated` owners.
7. `public.apply_for_race_v1()` rejects a guest caller even if a club ID is passed explicitly. Direct `race_team_entries` INSERT has no player INSERT RLS policy.

**Production tests:** a trigger-level test attached the actual guest Auth guard to a temporary table and verified anonymous INSERT was rejected while nonanonymous INSERT passed; test fixture never touched `auth.users`. Verified 27 existing Auth accounts, 0 guests, 21 owner-linked clubs, unchanged launch schedule at 2026-12-10T06:00:00Z and paused game clock. Source SQL and automated regression tests are committed to `main`.

- [Auth/rewards/club creation migration](../supabase/migrations/20261120110500_saturn_guest_mode_fail_closed_auth_and_rewards_v1.sql)
- [Direct club and race entry migration](../supabase/migrations/20261120113000_saturn_guest_competition_and_direct_club_guards_v1.sql)
- [Guest security tests](../tests/saturnGuestSecurity.test.mjs)
- [GitHub Actions security and production build](https://github.com/bracko87/ProPeloton-Manager/actions/runs/44716605829)

## Safe architecture to finish SAT-01 / SAT-02

1. **Isolated demo sessions**. Once the guest Auth provider and private gate are explicitly enabled after testing, use Supabase `signInAnonymously()` to create a stable temporary `auth.users.id`; display a prominent notice that browser/device data loss may prevent recovery. Persist guest preferences and demonstration progress under **the same UUID** in a separate guest-only table. Do **not** create official clubs or enter live races while anonymous.
2. **Demo gameplay, not a fake financial account**. Build a guest sandbox with representative rider training, cycling strategy and team setup; keep sandbox state out of `clubs`, `club_riders`, financial ledgers, official results, world ranking and promotion tables. Test for RLS isolation across two guest identities, admin and permanent player. Do not promise simulated choices affect the real season until conversion is implemented.
3. **Upgrade in-place**. For email account upgrade, use Supabase `auth.updateUser({ email })` and a verified-email confirmation flow; only add a password *after* verification, following Supabase documentation. For Google, a signed-in guest uses manual `auth.linkIdentity({ provider: 'google' })` after the Auth provider and manual linking are configured. Never create a separate new UUID and merge unrelated users.
4. **Verify conversion before granting entitlements**. When an identity becomes permanent and its verified email/provider is confirmed, preserve the same `auth.users.id`, migrate only approved demo draft fields to a **new official club through the existing rules** and grant welcome coins **exactly once** if the ledger lacks the corresponding system key. A conversion is not automatically a new eligible Premium trial; enforce one-time claim history, rate limits and paid entitlements. Do not start a trial for a still-anonymous account.
5. **Permission tests**. Validate direct table INSERT, UPDATE, REST and RPC entry points in addition to normal UI. Rate-limit anonymous Auth; enable CAPTCHA/Turnstile in the Supabase Auth provider. Test multiple tabs, session refresh, browser data loss, existing email collisions, invalid invitation, discarded drafts, retries, loss of connectivity during linking and desktop wrapper redirects.

## Explicit barriers to launch Guest Mode

- [ ] Real, isolated sandbox gameplay and a schema for guest-only drafts/persistence (no live economy or competition writes).
- [ ] Verify Auth anonymous sign-in provider disabled/enabled only in controlled staging.
- [ ] Verify account linking/manual linking configurations and same-UUID conversion across email and Google with retries and collisions.
- [ ] Conversion reward policy; prevent double welcome coins, birthday grants, sponsorship, advertising grants and Premium.
- [ ] Comprehensive RLS/RPC review of all live gameplay entry points, not just `create_club` and `apply_for_race_v1`.
- [ ] CAPTCHA/Turnstile and signup rate limiting configured; abuse tests and account/session cleanup schedule.
- [ ] Player-visible notice about loss of anonymous session on new device or browser clear.
- [ ] Verified install/web/mobile login, support recoverability and deliberate release sign-off.

**Not authorized/implemented:** opening Guest Mode to the public, enabling OAuth linking, handing guests money, activating an anonymous Auth provider, letting guests participate in live race rankings. **Helios/Tennis Legacy untouched.**

## Documentation verified

- [Supabase Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous) — anonymous users share the `authenticated` role; manual linking, rate limits and CAPTCHA are recommended.
- [Supabase Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking) — manual linking for an existing signed-in identity.
- [Supabase Auth Rate Limits](https://supabase.com/docs/guides/auth/rate-limits) — anonymous requests have a separate quota; rate limits are not sufficient on their own.
