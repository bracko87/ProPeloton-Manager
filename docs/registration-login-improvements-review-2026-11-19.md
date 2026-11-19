# ProPeloton Manager — registration/login improvement investigation
**Recorded:** 19 November 2026 · **New official release:** 10 December 2026 at 07:00 CET (06:00 UTC).

## Confirmed current state (read-only technical audit)

- Registration page (`src/pages/Register.tsx`) requires a username, email, password, birthday month and birthday day. Birthday year is optional. It creates an auth user with metadata and navigates to club creation. Login (`src/pages/Login.tsx`) uses `signInWithPassword`.
- `auth.users` triggers include `public.handle_new_user()`, the season migration signup guard and the explicit `prelaunch_test` registration gate.
- `public.handle_new_user()` generates a fallback username, inserts a `profiles` record, uses `new.email` or empty string, and already accepts birthday month/day/year as nullable. `profiles` has no birthday NOT NULL constraint. It has a case-insensitive unique username index; email uniqueness is enforced only on **nonblank** email addresses.
- The profile INSERT triggers award **20 welcome coins** and a welcome notification. Anonymous signups must be assessed for reward farming and unwanted registration counts.
- `get_my_club_id()` is keyed to the current Supabase Auth user ID. **Account conversion must keep that same UUID**, rather than creating a second account or manually moving finance data.
- `public.get_my_premium_trial_onboarding_v1()` uses `auth.uid()` and an **email hash or user-ID fallback** to enforce a one-time trial. Linking an email to a guest requires a reviewed policy for the claim hash / trial eligibility.
- Current auth count at investigation: 27, with **0 anonymous users**. No guest, Google, Apple or passkey entry point has been implemented in the frontend.
- Existing premium trial anchors are now **10–17 December 2026** for the 25 existing future trial records. Paid purchase records and entitlements were not adjusted.

## Prioritized improvements — proposals, not production functionality

| Priority | Feature | Proposed approach | Important check | Status |
|---|---|---|---|---|
| High | Play as Guest | Investigate Supabase `signInAnonymously()`; create a normal stable user ID and temporary club | Server trigger, profile, coin/advertisement abuse limits, RLS, session persistence, returning after browser data deletion | Investigation only |
| High | Guest → permanent account | Link **existing** guest identity to email or a Google OAuth account using supported Supabase identity-linking; keep same UUID | Manual linking configuration, confirmation/callback flow, unique username/email, team/coins/Premium untouched | Investigation only |
| High | Google Sign-In | Configure Google OAuth provider and callback, then add Google sign-in to both Register and Login | OAuth app credentials, redirects, email verification, existing account linking, desktop wrapper external browser flow | Investigation only |
| Medium | Passkey (face/fingerprint/PIN) | Investigate Supabase passkey API and account recovery | Passkeys currently **experimental** in Supabase, may require version upgrade and project-level enablement; testing across browser + Electron | Investigation only |
| Medium | Apple/other provider | Assess demand after Google | Apple developer credentials, redirect domains, recovery and possible private relay email | To consider |
| Medium | Optional birthday | Frontend can conditionally omit month/day; backend nullable fields already allow this | Birthday gift/email processing, profile-locked semantics and age rules (if required by legal/commercial policy) | To review |

## Recommended delivery sequence

1. **Design + safe sandbox test** for anonymous guest user creation and strict policies: guest eligibility, starter coins/Premium rules, abusive repeat signups, account expiry if relevant, and confirmation of preserving the same user ID.
2. **Guest account conversion** into a permanent identity with identity linking, including session loss recovery notice before the user tries Guest Mode. Test the same club, riders, equipment, purse, Premium and race registrations before/after link.
3. **Google OAuth** provider configuration and UI only after the callback + existing-account linking path works. Existing password logins must continue working throughout.
4. **Optional birthday** after confirming whether any age/consent requirements exist; the backend birthday gift job should simply skip users without a birthday.
5. **Passkeys** and **Apple** after the core access flows are stable; do not risk the December 10 release with an unverified experimental sign-in method.

## December 10 release gate

- Live release scheduler now reads `2026-12-10T06:00:00Z` and retains the verified S1 reset / 64 original cron snapshot. The release job runs every minute but cannot release early.
- Game remains paused at Season 1, Jan 1 01:00; registration open in prelaunch mode.
- `premium_trial_launch_v1` and the 25 future `premium_welcome_trials_v1` records were moved to December 10–17. Paid subscriptions unchanged.
- Website launch date / popup / signup and sign-in notices updated in `src/components/PreReleaseNotice.tsx`, `src/pages/Register.tsx`, `src/pages/Login.tsx`, `src/components/home/PreReleasePopup.tsx`. Must still independently confirm Netlify deployment.
- Do not silently enable providers, open guest signup, merge accounts, restart the game, or alter live economic/trial systems before separate implementation/security verification.

### Relevant Supabase documentation
- https://supabase.com/docs/guides/auth/auth-anonymous
- https://supabase.com/docs/guides/auth/auth-identity-linking
- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- https://supabase.com/docs/guides/auth/passkeys
