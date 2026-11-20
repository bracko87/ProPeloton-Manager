# Project Saturn — ProPeloton Manager ONLY

**Owner:** Next Quest Studio  
**Scope lock:** Project **Saturn** applies exclusively to **ProPeloton Manager**, its Supabase project (`okuravitxocyevkexfgi`), and the ProPeloton-specific views/feeds inside the **existing Game Control Center**. It does **not** include Tennis Legacy. Tennis Legacy's independent 21-goal initiative is **Project Helios** in its own repository. Techniques may be compared, but tasks, data, credentials, testing and deployment must never be combined.

**Objective:** Complete, verify and professionally release all 21 ProPeloton Manager improvements—secure access, meaningful live analytics, authentic gameplay, modern navigation and clear first-time player onboarding. A source-code change or passing CI is not equivalent to a deployed and tested player experience.

## 20 November 2026 owner decision — SAT-01 / SAT-02 superseding scope

**Full-game 14-day test players replace the former isolated 7-day Practice League plan.** Test accounts create a real team with only a nickname, start in the lowest eligible official tier, participate in real racing/finances/staff/equipment/training and receive seven days of Premium. After 14 days account play is read-only until identity conversion. The same Auth UUID, real club ID, rider inventory, financial/competition history and assets must survive verified registration. Attempt highest eligible vacancy placement after conversion only when season/race safety permits; never displace another club. Permanent Register stays on homepage and is visible throughout trial; first-run explanation modal required.

[Full policy and blockers](docs/SATURN_FULL_GAME_TEST_ACCOUNT_POLICY_2026-11-20.md) · [Replacement draft PR #277](https://github.com/bracko87/ProPeloton-Manager/pull/277). The incompatible isolated 7-day practice-only PR #275 was closed unmerged. **The 14-day timebox schema and tests are code-complete, but the actual full-game guest authorization, trial Premium integration, real team creation, UI, expiry and identity conversion are NOT done or live-verified.** Production anonymous account creation remains disabled. Do not lift real club/race/reward gates until the full audit and integration tests pass.

The older November 20 SAT-01/02 entries below describe the previous security implementation and are superseded where they suggest an isolated sandbox.

## SAT-01 / SAT-02 progress — 20 November 2026 (new draft #277)

Full-game Test Player UI code now includes: feature-gated homepage Test the Game CTA, nickname + real team creation form, separate persisted test session, 14-day lifecycle display with a one-time welcome popup, permanent Register / Keep my Team link, and same-UUID email/password conversion prototype. [Draft PR #277](https://github.com/bracko87/ProPeloton-Manager/pull/277). GitHub checks passed. **These components are NOT live or fully functional**: the dedicated authenticated server club-creation RPC does not exist; the production Auth gate still blocks guests; anonymous club/race/finance permissions and the actual Premium entitlement are not yet adapted; no real guest tests were performed. The test CTA is hidden behind a false-by-default feature flag. Never mark SAT-01/02 completed based on these code-only milestones.

## Current project checklist status (20 November 2026)

The checkboxes below stay unchecked until **live-verified**. Source tests and
database checks are tracked separately so we never confuse "code is written"
with "players/admins can use it on the deployed website."

| ID | Task | Current progress |
|---|---|---|
| SAT-01 | Guest play | **Security foundation code-tested:** fail-closed anonymous signup gate active; playable guest sandbox not implemented |
| SAT-02 | Convert guest without losing progress | Identity-linking architecture reviewed; same-UUID upgrade, trial/welcome reward migration and draft preservation not implemented |
| SAT-03 | Google Sign-In | Investigating; not enabled |
| SAT-04 | Passkeys | Backlog |
| SAT-05 | Additional providers | Backlog |
| SAT-06 | Optional birthday | Code-tested, eight-language build passed; live signup unverified |
| SAT-07 | Simplified registration | **Code-tested**: manager name optional, backend generates privacy-safe UUID-derived fallback; birthday fields collapsed; benefits explained and translated (8 languages); live browser sign-up still unverified |
| SAT-08 | Guest abuse protection | **Partial server guards live-tested:** block guest welcome coins, Premium trial, official club ownership and race applications; other abuse/RLS audits pending |
| SAT-09 | Website analytics and Control Center | **Backend tested and admin UI code-tested**; last-event activity, five-minute navigation and three-table pageview checks; full Control Center/live-browser verification pending |
| SAT-10 | Registration conversion | Backlog |
| SAT-11 | Online presence | Backlog; last-five-minute navigation in SAT-09 is **not** true online presence |
| SAT-12 | Gameplay events | Backlog |
| SAT-13 | Economy/transaction monitoring | Backlog |
| SAT-14 | Event/audit search | Backlog |
| SAT-15 | PostgreSQL architecture | Backlog |
| SAT-16 | Redis feasibility | Backlog |
| SAT-17 | Admin security | Existing account mapping verified; one admin analytics RPC invocation privilege tightened; wider security audit pending |
| SAT-18 | Visual polish | Backlog |
| SAT-19 | External tests | Backlog |
| SAT-20 | First-run guidance | Backlog |
| SAT-21 | Unique game mechanics | Backlog |

**SAT-09 change evidence (20 Nov):**
- ProPeloton production `public.get_admin_analytics_dashboard_v1(7|30)` now
  includes UTC server `generated_at`, last recorded page/session time,
  5-minute navigation counts and an integrity comparison of independent
  visitor/session/path pageview totals. An ordinary authenticated test user
  was denied, authorized admin succeeded, and anonymous EXECUTE was revoked.
- For **19 November UTC**, all three source tables agree on **67 pageviews**;
  26 visitor identifiers and 29 sessions were recorded.
- [Production build and scope/access contract CI: PASS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/44710179291).
- Source migrations are committed. Production DB and GitHub are both
  updated. **Netlify deployment and authenticated browser/GCC visual
  reconciliation are not yet proven**; do not mark SAT-09 fully done.

### SAT-07 implementation evidence (20 November 2026)

- `src/pages/Register.tsx` no longer requires a manually selected username.
  On an empty username the existing `public.handle_new_user()` database trigger
  generates a non-identifying 24-character manager name from a stable hash of the new user's UUID,
  without changing the player's identity or database schema.
- Email, strong password, password confirmation, email activation and the
  existing `/create-club` redirect are unchanged.
- Birthday fields appear only if the player opens the optional details panel.
  The current server-side reward rules remain unchanged: no birthday submitted
  means no birthday reward.
- Eight locale files now explain why the manager account matters, that name
  entry is optional, and how to open or hide birthday details.
- [Production site build passed](https://github.com/bracko87/ProPeloton-Manager/actions/runs/44712274013),
  and [expanded SAT-07 privacy, username, birthday, eight-language and production checks passed](https://github.com/bracko87/ProPeloton-Manager/actions/runs/44713388407).
- **No new account was created.** Production Netlify deployment and a real
  signup flow are not yet verified. SAT-07 remains unchecked until deployed
  and checked, particularly on mobile.

**Privacy safeguard (SAT-07):** The original fallback used the email
local part in the public username. This is replaced in the live database
with `mgr_` plus the first 20 hexadecimal characters of a hash of the
complete Supabase Auth UUID; a 24-character nickname is produced without
publishing email information. Two sample UUIDs and active trigger state
were verified read-only; existing account profiles are unchanged.
[Committed database migration](supabase/migrations/20261120110000_saturn_privacy_safe_generated_manager_handles.sql).

### SAT-09 independent Control Center check

The ProPeloton **source** database is producing visitor events and the
analytics-only delivery job has a fresh `last_sent_at`. The **separate shared
Control Center** Supabase project denied access during the November 20
reconciliation attempt. This prevents independently verifying the mobile/web
Control Center's figures, and does **not** justify marking SAT-09 complete.
Never change Helios or fabricate a reconciliation result to close this task.

### SAT-01/02/08 server-side security milestone — 20 November 2026

The feature is **not publicly enabled**, but foundational safeguards are
deployed and source-tested:

- Fail-closed private guest gate with default `enabled=false` and a
  `BEFORE INSERT ON auth.users` trigger blocks accidental anonymous accounts.
- The current 20-coin signup reward skips anonymous Auth users.
- Premium onboarding returns `ineligible / guest_account` without creating
  a trial. No email, ID or account metadata can bypass the canonical
  `auth.users.is_anonymous` check.
- `create_club` and direct `clubs` owner INSERT/UPDATE reject guest ownership.
- `apply_for_race_v1` rejects guest race entry even with explicit club IDs.
- A **temporary-table** test invoked the real anonymous signup gate, proving
  guest INSERT rejected and ordinary INSERT accepted; no auth user was created.
- **Production state:** 27 pre-existing accounts, 0 anonymous accounts, 21
  owner-linked clubs; game time remains paused until 10 Dec 2026 07:00 CET.
- [Guest safeguard build and regression checks](https://github.com/bracko87/ProPeloton-Manager/actions/runs/44716605829).
  [Full technical scope and incomplete conversion checklist](docs/SATURN_GUEST_MODE_SECURITY_AND_CONVERSION_2026-11-20.md).

**Still missing:** isolated playable guest sandbox, draft persistence,
same-user-ID email/Google conversion, deferred one-time welcome grant,
rate limiting/CAPTCHA, coverage of other reward and competition RPCs,
cross-guest RLS tests, mobile login/recovery and controlled rollout sign-off.
SAT-01, SAT-02 and SAT-08 checkboxes remain **unchecked**.

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
- [ ] **SAT-07 · High · Simplify registration.** Reduce fields and friction, show guest versus permanent-account benefits, concise CTAs, mobile keyboard/tab navigation, sensible errors and accessible account recovery. **Code-tested:** username now optional (Supabase auth trigger generates a non-identifying UUID-hash fallback), optional birthday folded away until requested, account benefits and labels translated across eight languages. [Registration production build passed](https://github.com/bracko87/ProPeloton-Manager/actions/runs/44712274013). **Still open:** authenticated Netlify/browser verification, mobile interaction/accessibility, and eventual Guest Mode comparison.
- [ ] **SAT-08 · High · Guest abuse prevention.** Explicit server-side gates for official races, leaderboards, sponsor/reward/coin farming, team quantity, welcome grants, Premium trials and conversion. Negative RLS tests for guest, signed-in player and administrator.

### S2 — Analytics and ProPeloton-specific Control Center (09–14)

- [ ] **SAT-09 · High · Accurate website analytics.** Reconcile daily visitor IDs, sessions and page views end-to-end: browser event → database rows → game admin RPC → Control Center ProPeloton panel. Display UTC reporting window, last event time, last successful ingest and user-visible refresh time; no inferred visitors. **Partially repaired and extended on 20 November:** reporting-only job `gcc-live-analytics` re-enabled 20 Nov under verified launch hold, 1-minute schedule, successful remote HTTP 204, gameplay tick stays disabled. A visual Control Center reconciliation remains mandatory.
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
