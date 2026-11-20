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

## SAT-01 — guarded real club creation implementation (draft)

The full-game test account branch now includes a dedicated `public.saturn_create_test_club_v1` SQL implementation that (when eventually authorized) creates one actual club, owner membership, settings, standard new-club finance records and an immutable 14-day lifecycle in a single transaction. It uses existing country-to-amateur mapping and the lowest currently active amateur tier, serializes per-account and per-region placement, and requires an administrator-approved capacity row. A second private creation gate defaults OFF and RPC EXECUTE is revoked from browser roles. **This is source code only, not applied or enabled on production, and is NOT an end-to-end working test player feature.**

Required before activation: canonical Auth/club trigger compatibility review; authoritative league capacity approvals; proper CAPTCHA and anonymous account quotas; all real gameplay/RLS permissions; server-wide 14-day expiry enforcement; real seven-day Premium entitlement; verified account conversion and highest eligible vacancy placement; staging race/financial test cases. [Draft PR #277](https://github.com/bracko87/ProPeloton-Manager/pull/277).

## SAT-01 / SAT-08 — Premium and race-expiry code milestone

The source now grants the ordinary seven-day Premium trial entitlement atomically at test-team creation using `premium_welcome_trials_v1`, without opening another paid subscription or granting Coins. The original server-clock expiry is checked and must not reset during identity conversion. Test-player access to official race applications **and withdrawals** is restricted in source to the active 14-day term and exactly the user's club. Regular registered-player logic remains unchanged. [Premium/expiry security audit](docs/SATURN_TEST_PREMIUM_EXPIRY_AUDIT_2026-11-20.md).

**Not ready to release:** these changes are code-only on draft PR #277, not tested with real guest JWTs or deployed. The game has many more player-facing write APIs across squad, training, equipment, staff, finance and transfers; those still need server-side expiry restrictions. Some Premium features distinguish paid access from normal trial access. CAPTCHA/rate-limits, full onboarding checks and conversion tests remain mandatory. No guest gate should be enabled.

## SAT-08 — Additional 14-day expiration write controls (20 Nov 2026)

On the **unmerged** `saturn/full-game-test-accounts-v1` branch, draft SQL now enforces canonical anonymous Auth, exact test-club identity and unexpired 14-day lifecycle across **12** reviewed player-facing RPCs (six rider training/staff actions and six equipment inventory/setup actions) in addition to race applications and withdrawals. Proposed restrictive RLS INSERT/UPDATE/DELETE policies cover **nine** clearly club-linked tables without removing read access. Registered players retain their existing RLS and RPC conditions. This is **not comprehensive**: transfers, other finance operations, sponsorships and further equipment/training direct writes and SECURITY DEFINER paths still require audit and tests; full server-wide expiry enforcement remains **unchecked**.

The previously incomplete Saturn workflow was fixed to run the **full test suite**. On source commit `b8a214907cc8415ec4935879d5f0e394fc859ad7`, [Saturn checks passed](https://github.com/bracko87/ProPeloton-Manager/actions/runs/44741260224): **50 passing, 0 failing, 41 TODO staging tests** (91 total reported), plus successful app build and two other GitHub workflows. Production test-account Auth gate is OFF, no guest team created, SQL not deployed, and the other user projects and launch date remain untouched.

## SAT-08 — Transfer and camp-finance expiration coverage (20 Nov 2026)

On draft PR #277, test-account owner/expiry checks now also cover **seven** more player-facing RPCs: accepting or cancelling rider transfer activity, confirming unsolicited bids, extending staff contracts, booking training camps (two variants), and cancelling camp bookings. Corresponding restrictive INSERT/UPDATE/DELETE RLS rules cover **five** additional direct-write tables: transfer listings, offers, negotiations, unsolicited bids and training-camp bookings. This makes **21 selected player mutation RPCs** and **14 direct-write tables** proposed protected in source, but NOT every possible game operation. Existing registered-user behavior is deliberately retained.

[Detailed SAT-08 review](docs/SATURN_TEST_PREMIUM_EXPIRY_AUDIT_2026-11-20.md). CI was verified on source commit `b594d85f77af001b5011b3d507e5ee76ad093769`: **109 total cases, 63 passing, 0 failing, 46 TODO staging**, along with app build and two additional successful workflows. These are static and build checks only, NOT real guest end-to-end validation. All production guest gates remain OFF and no draft migrations have been deployed. Do not activate before completing the remaining mutation audit, anti-abuse work and live JWT/staging verification.

## SAT-08 — Additional rider, loans, Coins and infrastructure safeguards

Draft PR #277 now includes expiry and exact-club safeguards for seven further user-initiated actions: `finance_issue_emergency_loan`, `purchase_race_replay_access_v1`, `release_club_staff`, `release_owned_rider`, `release_rider_to_free_agents`, `sell_infrastructure_asset`, and `upgrade_club_facility`. Five additional existing RLS-enabled tables have restrictive INSERT/UPDATE/DELETE guard policies: `rider_contracts`, `club_riders`, `club_team_cars`, `club_team_buses`, and `club_equipment_vans`. Existing permanent-user and system behavior is preserved in the proposed SQL branches.

The draft currently covers **28 selected player mutation RPCs and 19 club-linked direct-write tables**, but numerous other pathways remain unreviewed. **CORRECTED:** `public.club_roster` is a non-updatable view (not a table), so it cannot use table RLS. Its owner-context read behavior is a distinct visibility concern. A draft invoker-view change and restrictive `riders` UPDATE policy now require real staging. No public launch, production SQL deployment or real guest testing took place. Latest verified tested source commit `ce89ef7bf459bb609c274bf577e3878a75febddd`: **131 test cases (77 pass, 0 fail, 54 TODO staging)**, application build and two other workflows passed. [Details](docs/SATURN_TEST_PREMIUM_EXPIRY_AUDIT_2026-11-20.md).

## SAT-08 — Club roster view security correction (20 November 2026)

**Corrected finding:** `public.club_roster` is a non-updatable JOIN VIEW, not a base table. Prior checklist language claiming the roster had "RLS disabled with direct authenticated writes" was incorrect. The real base tables `club_riders` and `riders` already have RLS. However the view was configured with `security_invoker=false`, meaning reads can use the view owner's privileges rather than caller-specific underlying row filters.

A new **unmerged, undeployed, reviewed-in-source** migration proposes `ALTER VIEW public.club_roster SET (security_invoker=true)` and a restrictive direct `riders` UPDATE owner/14-day-expiry check. The migration includes a fail-closed schema preflight. **This may change public roster display behavior**, so it must pass staging tests for national ranking, race/team pages and the player dashboard before enabling. It does NOT change the roster view into a writable table. Check [the corrected SAT-08 security audit](docs/SATURN_TEST_PREMIUM_EXPIRY_AUDIT_2026-11-20.md). Production remains unchanged.

## SAT-08 — Roster view and rider-update review (20 November 2026)

Read-only verification proves `club_roster` is a **non-updatable JOIN VIEW** (`pg_relation_is_updatable=0`), not the RLS-disabled writable table described previously. Both underlying base tables already use RLS; the view has `security_invoker=false`. A draft migration now proposes `security_invoker=true`, with a schema/RLS preflight and a restrictive anonymous-test-account expiry policy for direct `riders` UPDATE. There are no changes to the view definition, its outputs, or public permissions, but actual visible roster rows can change under caller RLS. National rankings, public team/rider pages, and game simulation must be staging-tested before applying. This is NOT production-deployed. The correct current draft coverage is **28 selected mutation RPCs and 20 RLS-protected underlying tables**; the view is not counted as a table.

The latest complete source review workflow at `e52198aa3ead5b0e7465d16da67320107e00ae36` passed: **141 cases, 82 pass, 0 fail, 59 TODO integration**, including successful application build. Staging Auth/JWT and database migration execution remain pending.

## SAT-01 — isolated staging readiness and lifecycle insert compatibility

On 20 Nov 2026 Supabase branch inventory contained **only the production/default branch**; no separate staging database currently exists. Creating a new branch/project may carry charges, so no branch has been created and production remains untouched. A **read-only schema preflight** was added at `supabase/tests/saturn_predeploy_schema_preflight.sql` and executed successfully against the existing production schema (**21/21 checks passed**, without mutations). An additional `supabase/tests/saturn_postdeploy_authorization_audit.sql` validates the future staging RLS/grants after migrations. Neither script authorizes activation.

**Fix found during the audit:** the draft lifecycle migration's `FORCE ROW LEVEL SECURITY` conflicted with the intended trusted server-side lifecycle INSERT into a table whose only user policy is self-read. The FORCE setting was removed from draft source while retaining ordinary RLS, client DML privilege revocations, authenticated self-read, and **no** browser INSERT/UPDATE/DELETE policies. The database still needs actual SECURITY DEFINER and JWT staging verification; this is not proof it works. All three GitHub Actions passed on source commit `770180b57150c59d056840baf418d116efdd9b22` (**141 total tests: 82 pass, 0 fail, 59 staging TODO**).

[Staging execution matrix and blockers](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md). Public Guest Mode, the 14-day lifecycle, and real club-creation SQL have NOT been deployed; unchanged live anonymous user count: 0.

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
