# Project Saturn — Guest Signup Abuse Gate (20 November 2026)

Status: **code implemented; service configuration and real verification NOT done**.

## Abuse model and implementation

A browser-only cooldown, an IP address supplied by the browser, or a database
rate limit by `auth.uid()` **cannot** prevent someone creating another
anonymous identity. Do not count any of these as a release control.

The Test Player form now renders a Cloudflare Turnstile challenge with the public
`VITE_SATURN_TURNSTILE_SITE_KEY`; when the flag is enabled it refuses to start a
new anonymous session unless the widget returns a token. It passes the token as
`testClient.auth.signInAnonymously({ options: { captchaToken } })`. The token is
never sent to the game club-creation RPC, stored in local/session storage,
or treated as an authorization claim. It is discarded after use, expiry or
challenge error. No Turnstile secret is placed in browser environment variables.

**Important:** This is only useful if Supabase Auth independently enforces
CAPTCHA on its public anonymous/signup endpoint. Otherwise a scripted caller
can bypass the entire React form, even if our UI refuses signup.

## Required service settings before staging and public release

- [ ] Create a Turnstile widget for the actual staging/production hostnames.
      Record the public site key as `VITE_SATURN_TURNSTILE_SITE_KEY`
      in the selected deployment environment.
- [ ] Under **Supabase Dashboard → Authentication → Bot and Abuse Protection**,
      enable CAPTCHA enforcement with **Cloudflare Turnstile**, install the
      corresponding **secret key** in Supabase Auth **only**.
- [ ] Configure/verify Supabase's IP-based anonymous-sign-in rate limit at a
      conservative level. Do not confuse general email signup rate limits
      with anonymous sign-in limits. Validate NAT/shared-network behavior.
- [ ] Prove a direct API anonymous signup **without** a valid CAPTCHA token is
      rejected, not just that the frontend displays a challenge.
- [ ] Prove expired, replayed and malformed tokens fail and a fresh token
      succeeds; test with an actual browser from the permitted hostname.
- [ ] Confirm existing ordinary Google/email registration is unaffected by
      the chosen global Auth CAPTCHA setting; adjust those flows if needed.
- [ ] Test retry/refresh after a transient Auth failure (new challenge token).
- [ ] Confirm no new test team can be created for the same UUID in concurrent
      requests and no session can reset the original 14-day or 7-day clocks.
- [ ] Verify starting Coins, finances, rider allocations and Premium cannot be
      farmed through multiple anonymous identities or account conversions.
      Turnstile reduces automation but does **not** guarantee one trial per
      human, household, browser or IP. Decide the acceptable abuse budget
      and monitor unexpected creation spikes.
- [ ] Monitor anonymous signup counts, blocked CAPTCHA/rate-limit responses,
      club creation success/failure and legitimate user conversion drop-off
      in staging, without logging CAPTCHA token values or exposing IP data.
- [ ] Approve and verify league capacities and both separate OFF-by-default
      Auth/club rollout gates before enabling the browser feature flag.

## Existing database defenses (not sufficient alone)

- The club creation RPC uses **both** private rollout gates, both disabled,
  and does not have browser EXECUTE grants in the draft.
- Only a canonical anonymous `auth.users` identity is eligible at creation.
- The server uses a per-user transaction advisory lock and unique lifecycle
  identity, and refuses users who already own a club.
- The exact trial and Premium timestamps cannot be reset by retry.
- No separate welcome-Coin grant is intentionally performed by this RPC.
  Recheck normal club-creation triggers and financial credits in staging.

## Do not enable production

The new front-end site key is **public** by design. The Turnstile **secret**
belongs only in Supabase Auth configuration. No production Auth, CAPTCHA, rate
limits, guest rollout, permissions, or schema have been changed by this PR.

References:
- https://supabase.com/docs/guides/auth/auth-captcha
- https://supabase.com/docs/reference/javascript/auth-signinanonymously
- https://supabase.com/docs/guides/auth/auth-anonymous
