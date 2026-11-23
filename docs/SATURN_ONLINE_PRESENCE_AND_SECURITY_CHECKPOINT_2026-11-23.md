# Project Saturn — online presence and guest security checkpoint

**Date:** 23 November 2026. **Scope:** ProPeloton Manager only.

## SAT-11 online managers — implemented

- The existing `SiteAnalyticsTracker.tsx` already sends `touch_online_player_v1()` once a minute from visible, authenticated tabs, including anonymous Supabase Auth guests **without email**.
- `get_public_homepage_snapshot_v1()` counts distinct authenticated identities recently seen in `private.site_online_players_v1` during the past **three minutes**; a historical Auth account is not considered online merely because it exists.
- New `get_admin_online_presence_breakdown_v1()` uses exactly that same window and returns only aggregate counts: all recent identities, unconverted/anonymous guests, permanent registered users, and how many current permanent users originally converted from a guest. A Google/email identity **linked but not finalized** still counts as an unfinished guest.
- `AdminAnalyticsPage.tsx` now renders the breakdown with explicit wording: three-minute heartbeats are **not guaranteed live socket connections**. Failure to fetch is shown as unavailable, never invented zero.
- Other analytic cards now label all identified users, Auth signups and player-account totals accurately as **guest-inclusive**, not misleadingly “registered.”
- No individual UUIDs, emails, IP addresses or sessions are returned by the administrator reporting function. Direct browser `SELECT` on the private presence table remains denied.
- Production privilege checks: anonymous database role cannot execute the admin RPC; authenticated users can call its entry point but the function checks `auth.uid()` and `is_app_admin_v1()` on every request. A simulated non-admin JWT claim was rejected. Existing admin authorized session test returned structurally valid aggregate totals. The API is **admin-only**, not publicly readable.
- No club, time, points, ledger, scheduled process or trial record was changed by this report.

**Checks:** [new CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/45200701902) and [existing Saturn analytics CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/45200701908) passed, including production build. **Actual Netlify publication and live administrator browser visual test remain outstanding.** A count of zero when nobody has pinged in three minutes is legitimate, not evidence of a bug.

## SAT-08 security & expiration — read-only production checks

The following checks were run without creating, expiring or deleting accounts:

| Check | Result |
| --- | --- |
| Anonymous Auth/test-club gates verified and public signup allowed | PASS |
| Game clock paused | PASS |
| Guest-origin clubs / converted / unconverted | 3 / 2 / 1 |
| Missing original Auth identity or club owner | 0 |
| Incorrect seven-day Premium or fourteen-day guest window | 0 |
| Missing/duplicate welcome trial among guest-origin teams | 0 |
| Unconverted guest with Coins or a 20-Coin welcome grant | 0 |
| Converted guest with missing/duplicate 20-Coin welcome grant | 0 |
| Guest accounts already overdue for cleanup | 0 |
| Failed day-15 retirement cron runs in past 24 hours | 0 |
| Day-15 retirement job frequency | every 15 minutes, enabled |
| Guest account creation RPC executable by PostgREST anon role | NO |
| Anonymous users accepted by Auth-based guest creation under their own authenticated role | Controlled by original-UUID and rollout checks |

The latest audit of the retirement function confirmed that it searches only for unconverted, expired, owned trial clubs and avoids active race commitments. Real expired-account/AI-reserve cleanup has **not** been run against a disposable staging database. Cron success with zero eligible victims is not proof of complete cleanup behavior.

The current Supabase security advisors still show broader project-wide findings, including a security-definer-view category and privileged authenticated RPCs requiring review. The administrator presence RPC's `SECURITY DEFINER` warning is expected and must be judged against its explicit `auth.uid()`/admin guard and narrowly scoped aggregate output; this does not justify disabling the admin route. **No global security sign-off is claimed.**

## Outstanding validation and work

1. With the updated frontend deployed, sign in as the designated real administrator and check the “Online managers · last 3 minutes” panel. Open an active guest and permanent account in separate visible tabs, confirm the three counts reconcile, then close the tabs and confirm they age out after the window.
2. Real HTTP/real-JWT negative tests: direct anonymous Auth signup without Turnstile, malformed/replayed CAPTCHA tokens, rate limits, cross-owner reads/writes, competing club creation and repeat registration/farming. Supabase Auth's server-side CAPTCHA configuration is **not independently verified** via the available project read-only connector.
3. Disposable staging expiry day 7/14/15: verify 14-day write lock, correct free-Premium downgrade, safe day-15 AI replacement and completed race history retention. Never accelerate a production guest's expiration.
4. Reconcile the separate Game Control Center site's received numbers with first-party ProPeloton totals; access to the separate GCC project was previously denied, so SAT-09 full parity cannot yet be certified.
5. German and Spanish full locale audits currently fail in GitHub Actions; handle as a separate translation-quality task.
6. Continue targeted review of RLS and high-risk `SECURITY DEFINER` routines. Do not blindly revoke functions needed by logged-in players.

**Status:** SAT-11 database/feature ready and frontend code-tested; SAT-09 partial; SAT-08 security audit partial. Production Netlify/live admin acceptance and full staging negative tests remain.
