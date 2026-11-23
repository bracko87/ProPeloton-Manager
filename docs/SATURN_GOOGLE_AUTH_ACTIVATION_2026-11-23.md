# ProPeloton Manager — Google account activation checklist

**Date:** 23 November 2026. **State:** Frontend and source regression build ready; **production Auth provider not enabled**, so live Google authentication is currently blocked.

## Confirmed production blocker

Read-only production Supabase Auth log inspection found `/user/identities/authorize` returning HTTP `400` with error `provider is not enabled` for a Google identity-link attempt. This explains the owner's screenshot where guest-to-Google linking would not start. The current Supabase management connector cannot configure the external provider, and the connected browser automation was unavailable. No Google credentials were added to source code, and no provider settings were claimed updated.

## Three supported journeys in GitHub

1. **New permanent manager using Google** from `#/register`: `signInWithOAuth({provider:'google'})`; on authorized return, look up the user's existing club and send them to `#/create-club` if none exists. Never create the club inside the callback. Normal profile trigger generates a manager username if absent.
2. **Existing manager using Google** from `#/login`: same Google provider entry; route based on `get_my_club_id`. Supabase identity matching must refer to that manager's verified Google identity. If Google email differs from the existing account's email, users must not assume automatic merging.
3. **Active guest using Google** from `#/test-account-register`: use `linkIdentity` on the ORIGINAL anonymous Supabase Auth session. Never call `signInWithOAuth` from guest conversion or transfer tokens across users. Return to the protected guest conversion page, confirm same canonical UUID, presence of the Google identity, finalize via `saturn_finalize_test_account_google_conversion_v1`, and preserve original club/trial/Coins. Email conversion remains unchanged.

Existing `https://propelotonmanager.com/create-club` is the canonical Auth callback already used by signup verification; new code reuses that URL and handles Google authorization through the HashRouter.

## One-time Google + Supabase configuration (operator action)

1. Open [Google Auth Platform — Clients](https://console.cloud.google.com/auth/clients). Choose or create the correct Google Cloud project and create an **OAuth client ID: Web application**.
2. In Google OAuth client configuration set **Authorized JavaScript origins** to `https://propelotonmanager.com`. Set **Authorized redirect URIs** to `https://okuravitxocyevkexfgi.supabase.co/auth/v1/callback`. This latter URL is Google's callback into Supabase, **not** the application-facing /create-club URL.
3. Configure Google consent screen audience and required scopes `openid`, email and profile; for public signup, ensure the Google app is not limited to manually listed test users. Do not request sensitive scopes unnecessarily.
4. In [ProPeloton Supabase Auth — Providers](https://supabase.com/dashboard/project/okuravitxocyevkexfgi/auth/providers?provider=Google), enable **Google**, and paste the Client ID and Client Secret **directly into Supabase**. Save. Never put the secret in GitHub, Netlify `VITE_*` variables, the browser, or a chat.
5. On [Supabase Auth — Sign In / Providers](https://supabase.com/dashboard/project/okuravitxocyevkexfgi/auth/providers), turn on **Allow manual linking**. This is required for an existing anonymous guest to link Google; ordinary Google signup/sign-in alone does not verify this switch.
6. In [Supabase Auth — URL Configuration](https://supabase.com/dashboard/project/okuravitxocyevkexfgi/auth/url-configuration), confirm production Site URL is `https://propelotonmanager.com` and `https://propelotonmanager.com/create-club` is an allowed redirect URL. Avoid broad wildcard allowlists. (Already used for email, but verify.)
7. Publish the tested frontend from the latest GitHub `main` commit on Netlify. Do not publish stale Netlify Drop assets. No GitHub source change alone establishes production deployment.

## Acceptance tests (requires real browser identity, not fake database claims)

- Open sign-in screen in a private browser without a saved guest; use Google with a previously registered Google identity. Verify correct existing team and same Auth UUID.
- Open registration screen in a separate clean browser; use a *different* test Google identity. Verify exactly one new profile, onboarding prompt, and exactly one official club creation after the user completes team setup.
- Open a genuine existing anonymous guest team (same browser, no private window) and select **Link Google to this team**. Verify server finalizes same UUID and original club, no new team, the original seven-day Premium term, 14-day guest deadline removed, 20 Coins only once and jersey preserved.
- Negative: Google identity already bound to another account must **never** silently replace or merge an existing guest's team; show a recoverable message.
- Check redirected URL, browser history, errors, and that no OAuth authorization code, token or verifier leaks to public URLs or logs. Inspect browser if OAuth callback fails.
- Retest existing email registration, email/password sign-in and email guest conversion. Keep Guest Mode on and game clock paused.

## Verification

Dedicated workflow on 23 November passed: https://github.com/bracko87/ProPeloton-Manager/actions/runs/45176749402

**Note:** That run validates source, eight languages and production build, not Google Cloud consent/provider credentials or an actual OAuth round-trip. Until the external provider is enabled and tested, do not call Google authentication live or fully complete.
