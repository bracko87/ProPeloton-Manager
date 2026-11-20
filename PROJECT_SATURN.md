# Project Saturn — ProPeloton Manager ONLY

**Owner:** Next Quest Studio  
**Scope lock:** Project **Saturn** applies exclusively to **ProPeloton Manager**, its Supabase project (`okuravitxocyevkexfgi`), and the ProPeloton-specific views/feeds inside the **existing Game Control Center**. It does **not** include Tennis Legacy. Tennis Legacy's independent 21-goal initiative is **Project Helios** in its own repository. Techniques may be compared, but tasks, data, credentials, testing and deployment must never be combined.

**Objective:** Complete, verify and professionally release all 21 ProPeloton Manager improvements—secure access, meaningful live analytics, authentic gameplay, modern navigation and clear first-time player onboarding. A source-code change or passing CI is not equivalent to a deployed and tested player experience.

## Safety and release rules

- Keep the controlled ProPeloton Season 1 launch **10 December 2026 at 07:00 CET (06:00 UTC)**. Game clock must remain paused until the established release job runs; Saturn must not start it.
- Existing human clubs, rider ownership, credits/Coins, paid Premium, trials, races and financial ledgers must remain intact. Do not reset or copy player identities for the sake of Guest Mode.
- ProPeloton's existing administrator account has been **verified active and correctly mapped** on 20 November. Reuse `public.is_app_admin_v1()` and the existing admin-only analytics route. Do not add a duplicate broad administrator role, expose secrets or create another Control Center.
- Game Control Center is a shared **platform**, but Project Saturn only changes **ProPeloton-specific** panels, metrics, data contracts or authorization. Work on Tennis is Helios, never Saturn.
- Guest sign-in cannot be launched until abuse resistance, RLS, reward/trial protection, team uniqueness, competition eligibility and identity-link tests pass. Supabase anonymous users have the Postgres `authenticated` role, **not** verified-human authorization.
- Keep supplied source and public repo free of email addresses, secrets, raw visitor identities and private transaction details.
- Existing `main` branch is production-tracked: validate any scoped change before commit; verify GitHub Actions and live Netlify separately afterward.

## Interactive checklist / 21 deliverables

Complete the entire checklist **for ProPeloton Manager**. Put PR/commit, test evidence, deployed version and verified live date against each item. [ ] means not yet fully complete, even when work has begun.

### S1 — Registration, identity and onboarding (01–08)

- [ ] **SAT-01 · High · Play as Guest.** One-click trial access without email; unique server-issued identity; clear guest limitations and recoverability warnings. Test multi-session identity and browser-data-loss behavior.
- [ ] **SAT-02 · High · Guest → permanent conversion.** Link to email or trusted provider while preserving **the exact existing auth UUID**, team, riders, roster, standings, coins, purchases, premium trial and history; test collisions and interrupted conversions.
- [ ] **SAT-03 · High · Google Sign-In.** OAuth configuration and secure redirect/link flow on browser and desktop; preserve existing password login, email transparency and duplicate-account prevention.
- [ ] **SAT-04 · Medium · Passkeys.** Investigate Supabase passkey maturity and recovery; test device PIN/biometrics, device loss and cross-device flows before enabling.
- [ ] **SAT-05 · Low · Other providers.** Apple or another provider only if player demand, account-linking safety and cost justify it.
- [ ] **SAT-06 · High · Optional birthday.** Sign up with all birthday fields blank; no birthday reward when omitted. If provided, validate month/day/year, grant the existing annual reward only once under current rules. **Partially implemented:** ProPeloton form and eight translations updated, production build checks passed ([CI evidence](https://github.com/bracko87/ProPeloton-Manager/actions/runs/44706496820)); still requires confirmed Netlify deployment and a real account-creation/reward negative test.
- [ ] **SAT-07 · High · Simplify registration.** Reduce fields and friction, show guest versus permanent-account benefits, concise CTAs, mobile keyboard/tab navigation, sensible errors and accessible account recovery.
- [ ] **SAT-08 · High · Guest abuse prevention.** Explicit server-side gates for official races, leaderboards, sponsor/reward/coin farming, team quantity, welcome grants, Premium trials and conversion. Negative RLS tests for guest, signed-in player and administrator.

### S2 — Analytics and ProPeloton-specific Control Center (09–14)

- [ ] **SAT-09 · High · Accurate website analytics.** Reconcile daily visitor IDs, sessions and page views end-to-end: browser event → database rows → game admin RPC → Control Center ProPeloton panel. Display UTC reporting window, last event time, last successful ingest and user-visible refresh time; no inferred visitors. **Partially repaired:** reporting-only job `gcc-live-analytics` re-enabled 20 Nov under verified launch hold, 1-minute schedule, successful remote HTTP 204, gameplay tick stays disabled. A visual Control Center reconciliation remains mandatory.
- [ ] **SAT-10 · High · Conversion funnel.** Count landing → registration opened → account created → team created → later return, with pseudonymous IDs, idempotent event tracking and meaningful conversion percentages.
- [ ] **SAT-11 · High · Online player presence.** Explicit definitions for live authenticated **people**, active **human clubs**, **guests**, idle timeout and recent visits. Never show all registered accounts as online users.
- [ ] **SAT-12 · Medium · Gameplay activity.** Aggregate team training, rider development, race applications, results, transfers, staff management and equipment without heavy event logging.
- [ ] **SAT-13 · Medium · Economy monitoring.** Reconcile club cash, welcome coins, reward grants, premiums and unusual transfers with underlying ledgers, privately; guard against guest farming.
- [ ] **SAT-14 · Medium · Searchable event history.** Stable UTC timestamps and event IDs, actor/team/rider reference, retained event type, restricted admin search and documented retention/access rules.

### S3 — Database, architecture and security (15–17)

- [ ] **SAT-15 · Low · PostgreSQL review.** Reuse Supabase/PostgreSQL. Measure and optimize slow queries/indexes, RLS, functions, backups and connections only where measured.
- [ ] **SAT-16 · Low · Redis investigation.** Explore caching or online presence only if latency/cost evidence demands it; no mandatory second database.
- [ ] **SAT-17 · High · Admin and monitoring hardening.** Verify existing admin allowlist and UUID mapping, page-route and RPC access denial for non-admins, MFA in shared Control Center, signed telemetry, least privilege, logs and retention. **Partial check:** the specified existing ProPeloton admin identity was verified active and correctly linked on 20 Nov; no new privilege created.

### S4 — Real player quality and differentiation (18–21)

- [ ] **SAT-18 · Medium · UI consistency.** Audit **actual ProPeloton screenshots and pages** on mobile and desktop; standardize navigation hierarchy, typography, spacing, cards, loading states, focus and race information. Do not critique unrelated game imagery.
- [ ] **SAT-19 · High · External gameplay testing.** Recruit first-time cycling-manager players; measure time-to-team, first training, first race entry, errors, comprehension and repeat interest; fix evidenced blockers.
- [ ] **SAT-20 · Medium · First-session tutorial.** Short contextual tasks—create team, select riders, choose training, enter a suitable race, monitor readiness—with easy skip/resume and a safe guest-mode path.
- [ ] **SAT-21 · Medium · Unique gameplay showcase.** Show genuine ProPeloton features via real cycling game captures (training/strategy, senior+U23 development, nation championships and long-term management), not generic stock imagery or unimplemented promises.

## Implementation phases and exit checks

| Stage | Work | Required gate |
|---|---|---|
| **SAT-0** | SAT-09 / 17 analytics integrity and admin access | ProPeloton GCC matches source SQL for same date/time zone; fresh received timestamps; verified admin and non-admin access tests |
| **SAT-1** | SAT-06 / 07 plus first-run improvements | Birthday fully optional and no unwanted gift; shorter, accessible registration verified on actual browser and mobile |
| **SAT-2** | SAT-01 / 02 / 08 controlled guest prototype | Same ID before/after conversion and zero unauthorized race, reward, wallet or Premium effects; do not expose to production competitions until proven |
| **SAT-3** | SAT-03 / 04 / 05 login options | OAuth verified with real callbacks and existing accounts; passkey/Apple only after support/recovery tests |
| **SAT-4** | SAT-10–16 reporting and optimization | Secure event taxonomy, dedupe, privacy, reconciled finance and acceptable measured costs |
| **SAT-5** | SAT-18–21 UX/playtesting | Actual cycling players complete key actions; measurable UX improvements and no game-rule regressions |

## Initial verified baseline, 20 November 2026

- ProPeloton source database for **19 November UTC**: **26 visitor IDs, 29 sessions, 67 page views**, 11 Reddit-attributed sessions. These are measured, not approximated.
- Analytics job had stopped during the planned prelaunch pause; job `gcc-live-analytics` was restored as a **reporting-only** operation. The source log reported successful cron runs and remote acceptance; full dashboard reconciliation remains open.
- The verified administrator identity already exists and has an active ID-linked admin mapping; no extra permission granted.
- Optional-birthday frontend and translations have passed production CI; live signup and Netlify deployment are not independently confirmed.
- Official release stays **10 December 2026, 07:00 CET**; no gameplay clock restart permitted by this checklist.

## Status workflow

Use **Backlog → Investigating → Implementing → Code-tested → Deployed → Live-verified**. Mark the checkbox [x] only at **Live-verified**. Add issue/commit, evidence, test actor/environment, dependency and risk to each checkbox. A feature can be partially implemented in ProPeloton without being counted complete.

**Helios comparison rule:** Helios's admin-only Analytics navigation, last-navigation timestamps, five-minute recent activity label and database page-view reconciliation may inform Saturn's implementation. Copy designs and tested patterns only after adapting to ProPeloton's own tables, clocks, authorization, cycling terminology and policies. Never edit or deploy Tennis code as a Saturn task.
