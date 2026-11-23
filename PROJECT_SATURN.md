# Project Saturn — ProPeloton Manager ONLY

**Owner:** Next Quest Studio  
**Scope lock:** Project **Saturn** applies exclusively to **ProPeloton Manager**, its Supabase project (`okuravitxocyevkexfgi`), and the ProPeloton-specific views/feeds inside the **existing Game Control Center**. It does **not** include Tennis Legacy. Tennis Legacy's independent 21-goal initiative is **Project Helios** in its own repository. Techniques may be compared, but tasks, data, credentials, testing and deployment must never be combined.

**Objective:** Complete, verify and professionally release all 21 ProPeloton Manager improvements—secure access, meaningful live analytics, authentic gameplay, modern navigation and clear first-time player onboarding. A source-code change or passing CI is not equivalent to a deployed and tested player experience.

## CURRENT SATURN STATUS — 23 November 2026, clean database and broad CI milestone

- ✅ **Full isolated Supabase database migration replay AND baseline smoke passed**: [GitHub Actions run #45253387980](https://github.com/bracko87/ProPeloton-Manager/actions/runs/45253387980), commit `89356f83903da61ed934f57c7ba883a0755c56ae`. The final smoke asserts all **54** national equipment choices, the 10 National Team cars, Nations runtime definitions/configuration, operational health and Nations scheduling.
- ✅ **Broader Saturn review passed**: [GitHub Actions run #45254270098](https://github.com/bracko87/ProPeloton-Manager/actions/runs/45254270098), commit `9ded761894603d25a379b575311fbc41287400aa`. Both lifecycle (Saturn source/test suite, SQL parser, finance audit, production web build) and historical-bootstrap-reproduction (disposable PostgreSQL 17 runtime fixtures) passed.
- ✅ Historical migrations were repaired for fresh-install compatibility and deterministic replay without changing production; production function/table references used only READ-ONLY SQL introspection. All disposable GitHub CI infrastructure was cleaned up.
- ⬜ **NOT release certified:** No isolated real Supabase Auth/JWT/CAPTCHA staging environment or actual browser account test has been completed. Critical remaining checks include CAPTCHA enforcement and rate limits, anonymous guest creation and AI replacement, one 7-day Premium term, day-14/day-15 expiry/retirement, same-UUID Google/email conversion, RLS/privileged RPC access and normal-player regression. Local CI/fixture checks cannot replace these real-environment acceptance tests.
- ⬜ A separate Supabase staging branch/project is not provisioned and must not be created without the owner's explicit billing approval. **Do not deploy Saturn migrations or enable guest gates in production** based on the current green CI alone. Existing [staging checklist](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md) and [security issues](https://github.com/bracko87/ProPeloton-Manager/issues/299) remain open.

## CURRENT SATURN STATUS — 21 November 2026, creation/finance/Premium fixture milestone

- ✅ Added **51 passed PostgreSQL runtime checks**, 88 total including the earlier 37 lifecycle checks. All three GitHub workflows passed at `b0991fce76661c47ef6ca0e9be1a370e6c894523`, Saturn run 44885353295, database job 136789337898.
- ✅ Four actual Saturn creation/AI-placement/lifecycle/finance-privilege migrations executed against a disposable synthetic schema; ten exact production finance, roster initialization and Premium-reader routines included. Verified both rollout gates, eligible AI replacement, no historical AI displacement, region occupancy, owner/setup, one starting ledger transaction, duplicate/replay rejection, atomic rollback after missing profile/prior entitlement, 168h Premium boundary, paid-access fixture, normal allocator dispatch, four finance permissions revoked from browser roles but retained by service role.
- ✅ No additional paid Supabase branch, production write or permission change. Synthetic roster generator, balance-sync trigger, regional mapping and paid access are fixture dependencies, not production parity.
- ⬜ All 145 full staging TODOs remain pending. Real Auth/JWT, exact production schema and triggers, paid Academy entitlements, true finance caller compatibility, concurrent creation and gameplay are not yet certified. Production guest mode remains disabled; existing finance exposure is not fixed live.

## CURRENT SATURN STATUS — 21 November 2026, first PostgreSQL runtime verification

- ✅ **37 runtime assertions passed** on disposable PostgreSQL 17 in GitHub Actions, job 136787953010, source commit `7318ed07f5a40d115076b43c5012ae0acff8d74f`. Five actual Saturn migration files applied against synthetic Auth/club/race fixtures; entire transaction rolled back. Tested exact 336h expiry, owner race entries/withdrawals, national race block, linked-but-unconverted expiry, own lifecycle/club reads, direct owner update/delete restriction, verified email/Google finalizers, repeat conversion, unchanged original UUID, club and deadline, ordinary manager and no-team/missing Auth rejection.
- ✅ Fixed shared guard: unconverted trial **OR** no verified canonical permanent Auth identity requires restriction; anonymous before club creation no longer bypasses reviewed player RPCs. Null user UUID system path retained. Updated source assertion for this added guard at commit `bd11bf08cf51091ed5f2fbf1b9f989c1082776a2`.
- ⬜ Fixture Auth accessor is simulated; real Supabase JWT/OAuth/CAPTCHA and full game schema, finance, Premium entitlement, game schedulers and all other runtime behavior not verified. All 145 full-staging TODOs remain pending. Full schema export/restore remains separate.
- ✅ No production mutations or paid branch created. Public guest gate stays OFF.

[Staging test evidence](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## CURRENT SATURN STATUS — 21 November 2026, Windows export and schema inventory

- ✅ Native Windows PostgreSQL 17 baseline exporter added at `scripts/saturn_export_staging_baseline.ps1` (no Docker), with local password prompt and schema-only archive validation.
- ✅ Production read-only parity inventory ran successfully: 28 groups / 7,340 objects, including 692 app tables, 2,720 routines, 3,082 constraints, six app-owned managed Auth triggers and eleven Storage policies. Query: `supabase/tests/saturn_baseline_parity_inventory.sql`.
- ⬜ Native archive capture requires locally authorized PostgreSQL connection, because the available Supabase connector exposes SQL queries but no pg_dump archive or direct connection credentials. No password or archive should be pasted into chat. Run the exporter in a detached worktree; retain archive locally.
- ⬜ App schema restore, managed Auth/Storage dependency restore, isolated fixture setup, actual Saturn DB integration tests remain pending. No new paid environment or production changes.

[Recovery and Windows instructions](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## CURRENT SATURN STATUS — 21 November 2026, historical replay root cause and recovery tooling

- ✅ Production migration metadata reviewed read-only: **1,125 migrations, first version 20260820065515 (phase11b_stage_rewards_each_publication)**, all statement arrays populated.
- ✅ Exact failure identified: the very first migration patches an existing race-prize function. On an empty database its definition is NULL, SQL UNKNOWN bypasses the old guard, and dynamic EXECUTE fails. The earlier original game schema is missing from the recorded replay history.
- ✅ Exact historical fixture saved outside deployment migrations, and a disposable PostgreSQL 17 CI job **successfully reproduced the reported error**. Normal Saturn lifecycle source CI also passed.
- ✅ Added `scripts/saturn_export_staging_baseline.sh` to capture a current application schema-only archive via a read-only, TLS-protected DB connection. The tool retains owner/ACL metadata, refuses output inside Git, and never includes player table data. Documentation warns that managed Supabase dependencies need separate review.
- ⬜ Current schema archive has not yet been captured/restored; compatible PostgreSQL connection and isolated restore/role/DLL parity verification are required. Do not blindly mark old migrations applied or edit production history. No new staging branch or cost incurred, no production change, Guest Mode OFF.
- ⬜ Full Saturn integration testing remains blocked; existing finance permission concern remains unresolved.

[Recovery procedure and evidence](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## CURRENT SATURN STATUS — 20 November 2026, failed staging branch replay

- ✅ Owner approved **$0.01344 per hour** branch compute quote; a temporary isolated Supabase branch was actually created. Production was NOT changed.
- ❌ Supabase reported **`MIGRATIONS_FAILED`** while replaying existing historical migration history. Staging project `snlhnscacxsrlfpolohf` contained **zero applied migrations** and lacked `public.clubs` and the guest Auth gate. Database logs include `query string argument of EXECUTE is null`. No Saturn SQL could be deployed or tested there.
- ✅ To avoid ongoing hourly billing, the failed staging branch was **deleted**. Subsequent branch list showed **only production/default main**. Final charge/proration not yet confirmed.
- ⬜ **New priority blocker:** identify the specific legacy SQL migration causing null dynamic EXECUTE during branch replay, and prepare a safe migration history / staging bootstrap solution **without changing production**. Only then create another billable staging environment with explicit approval.
- ⬜ No real Saturn database/JWT/CAPTCHA/finance/guest tests ran. The previously green **164 source tests, 0 failures** remain true only of CI, not real runtime. Guest Mode OFF, finance exposure unresolved.

[Staging failure evidence and required recovery](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## CURRENT SATURN STATUS — 20 November 2026, isolated staging readiness and cost gate

- ✅ **Verified existing database starting schema, read-only:** `supabase/tests/saturn_predeploy_schema_preflight.sql` returned **21 PASS / 0 FAIL**. No schema changes, guest accounts or clubs were created. This is NOT migration execution or guest behavior validation.
- ✅ **Supabase branch inventory:** only production/main branch exists; no isolated Saturn staging environment currently exists. Supabase organization-specific branch quote was **0.01344/hour** (approximately 0.32256/day or 9.6768 per 30 days assuming 24-hour daily billing; quote does not guarantee a total bill). **No branch created / no cost accepted.** Obtain explicit owner approval before provisioning.
- ✅ GitHub workflow updated to run on **all** `tests/saturn*.test.mjs` changes plus new CAPTCHA component and staging docs, avoiding silent gaps as we add new regression suites. Added `tests/saturnStagingCiReadiness.test.mjs` to check triggers and pre/postdeploy gates.
- ✅ **Last verified CI source commit `76e6a11caf1b85cb880c0b0d3259aa0c9fa75e69`: all THREE workflows passed, 309 Saturn cases (164 PASS / 0 FAIL / 145 isolated-staging TODO), 273 SQL statements / 69 PL/pgSQL bodies parsed in 33 files, 576 frontend files scanned with no direct finance-helper calls.** Tests prove source/build contracts, not full DB runtime integration.
- ⬜ **Now blocking live testing:** explicitly approved isolated staging branch and its hourly cost, real CAPTCHA Auth service setup and per-IP rate controls, staged SQL application and role audits, real guest/expired/OAuth JWT verification, 7/14 day economy/races, finance privilege corrections and all other player-write surfaces. Production guest Auth rollout remains OFF; no Saturn migrations deployed.

[Detailed staging runbook](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## CURRENT SATURN STATUS — 20 November 2026, registration abuse protection

- ✅ **Code-tested:** `src/components/auth/SaturnGuestCaptcha.tsx` renders a Cloudflare Turnstile challenge; `src/pages/TestTeamSignup.tsx` passes its short-lived token to Supabase `auth.signInAnonymously({ options: { captchaToken } })` and fails closed when the public site key is missing or no valid widget token exists. The widget remounts on retry, and no CAPTCHA secret is present in frontend code.
- ✅ Source tests `tests/saturnGuestCaptchaAbuseGate.test.mjs` and updated `tests/saturnTestTeamSignup.test.mjs` validate frontend token handling and preserve one-club/transaction rollout constraints.
- ✅ Verified source commit `fa4401ae941121597778f3db9946a41fc8a920bb`: **303 tests (161 PASS / 0 FAIL / 142 staging TODO)**, 273 SQL statements / 69 PL/pgSQL bodies parsed in 33 files; **all THREE GitHub workflows passed**, 576 frontend files scanned with zero direct calls to the four sensitive finance helpers.
- 🟡 **Anti-abuse is NOT complete:** Supabase Authentication must be configured to validate Turnstile using a server-side **secret**, with the public site key in the deployment environment. Configure and test per-IP **anonymous** Auth signup rate limits, direct API calls without CAPTCHA, replayed tokens, full-game reward/Coins farming, and normal permanent-registration regressions. Browser CAPTCHA alone is bypassable. Details in `docs/SATURN_GUEST_SIGNUP_ABUSE_GATE_2026-11-20.md`.
- ⬜ No guest Auth/club rollout, Saturn migration or finance permission changes were deployed; Guest Mode remains OFF. Real isolated staging, database JWT, economy, OAuth conversion and complete mutation coverage still block public activation.

[Current staging release gate](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## CURRENT SATURN STATUS — 20 November 2026, AI transfer bid authorization

- ✅ Draft 14-day lifecycle and owned club safeguards now cover **54 selected player-initiated write RPCs**, up from 52. New `supabase/migrations/20261120235920_saturn_ai_unsolicited_bid_expiry_and_ownership_v1.sql` adds independent buyer owner/member validation and unconverted 14-day trial checks before **any** unsolicited AI bid record, including hard-rejected bids, and before confirmation converts an accepted bid into a transfer negotiation.
- ✅ Real ownership logic in the AI bid calculator and all normal player authorization, decision/financial pricing rules, read-only AI decision preview and scheduler have not been changed. Email/Google-linked but unconverted test accounts still follow their original 14-day trial.
- ✅ New `tests/saturnAiUnsolicitedBidSecurity.test.mjs` adds three source tests plus five real-staging TODO cases for authorization, rejected record prevention, expired conversion, and member/owner regressions.
- ✅ **Last verified source commit `10ba73eaca20034146bcce3a64dae6383c49b3c0`: 294 cases, 158 PASS / 0 FAIL / 136 staging TODO; 273 PostgreSQL SQL statements / 69 PL/pgSQL bodies in 33 files; all THREE GitHub workflows including app build passed.**
- ⬜ This does not close all player/system mutation or anti-abuse coverage. Isolated staging, actual guest Auth/JWT, rate limits, transfer finance, full gameplay and conversion, and the separately existing live finance helper security issue are still unresolved. **No Saturn feature has been deployed to production; Guest Mode remains OFF.**

[Full verification and release blockers](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## CURRENT SATURN STATUS — 20 November 2026, contract and transfer offer protections

- ✅ **52 selected player-facing write RPCs** now have draft original-UUID/unconverted lifecycle/14-day expiry guards, up from 48. Added `cancel_rider_transfer_listing`, `reject_rider_transfer_offer`, `submit_contract_renewal_offer`, `withdraw_rider_transfer_offer` in `supabase/migrations/20261120235910_saturn_contract_transfer_offer_expiry_v1.sql`. The existing club ownership checks remain ahead of each trial restriction.
- ✅ `tests/saturnContractTransferOfferExpiry.test.mjs` confirms four owner-before-guard-before-write source invariants and six outstanding isolated staging scenarios.
- ✅ **Verified code commit `dda9cb6babaf0ff874bc750bc9c56aa918b60265`: 286 source cases, 155 PASS / 0 FAIL / 131 staging TODO; 271 PostgreSQL statements / 67 PL/pgSQL bodies in 32 Saturn SQL files; all THREE CI workflows passed.**
- 🟡 A copied contract renewal `RETURNING morale INTO` record field was replaced with a scalar return target to meet offline PL/pgSQL syntax validation without intentionally changing contract outcomes; must verify in actual staging.
- ⬜ AI unsolicited transfer-bid authorization (including early rejected-bid persistence), other staff/finance functions, registration abuse protection and full-game mutation coverage remain unverified. The existing finance permission risk is still live, and Guest Mode remains OFF with no trial migration deployed.

[Detailed staging gate](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## CURRENT SATURN STATUS — 20 November 2026, transfer shortlist + search security

- ✅ **48 selected player-facing mutation RPCs** now have source-level 14-day lifecycle/owner guards (up from 43). New migration `supabase/migrations/20261120235900_saturn_transfer_shortlist_saved_search_expiry_v1.sql` protects add-rider shortlist (including optional Coin debits), add/remove shortlist targets, save market searches and delete saved searches, including linked-but-unconverted Google/email accounts.
- ✅ Existing owner checks and regular/fully converted manager behavior are preserved in the draft. Transfer-market read-only functions were deliberately left unchanged; a guest must still be able to browse after expiry.
- ✅ Dedicated `tests/saturnTransferShortlistExpiry.test.mjs` covers five source-level guard-before-write checks plus five explicitly pending real staging tests.
- ✅ **Last verified source commit `13414986cc28863b7800a2df857295746b54ecd9`: 275 Saturn cases (150 passing, 0 failing, 125 staging TODO); 267 SQL statements and 63 PL/pgSQL bodies parsed across 31 files; all three GitHub workflows passed**, 575 React files scanned for direct unsafe finance helpers (zero detected).
- ⬜ **NOT READY:** still incomplete game-wide expiry, direct/indirect transfer/contract finance authorization, anti-abuse, real guest/Auth conversion, staging and full-game/UI tests. Production Guest Mode OFF and no migrations deployed; separately identified finance privilege exposure remains live.

[Current full release gate](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## CURRENT SATURN STATUS — 20 November 2026, sponsorship and branding security

- ✅ Draft 14-day lifecycle/own-club expiry protections now cover **43 selected player-facing write RPCs**, up from 39: `sponsor_sign_offer`, `sponsor_prepare_main_offer_deal_metadata_v1`, `sponsor_set_objective_target_v1`, and `update_club_branding_v1` were added in `supabase/migrations/20261120235800_saturn_sponsor_and_branding_write_expiry_v1.sql`. Guards run after existing club-owner authorization, before database writes; email/Google-linked but unconverted test accounts remain restricted. Ordinary and fully converted managers retain original behavior in draft source.
- ✅ Sponsor payout, offer-generation, race-season scheduler and read-only sponsor dashboard functions were deliberately NOT overwritten. They need independent security and finance reviews.
- ✅ New `tests/saturnSponsorBrandingExpiry.test.mjs` verifies these four specific guards and lists six real-staging regression tests.
- ✅ **Last fully verified source commit `5fff5ad822692143276cc083ea9f8f8263fd8d6f`:** **144 passing / 0 failing / 120 staging TODO (264 cases)**, 262 PostgreSQL statements and 58 PL/pgSQL bodies parsed in 30 files, all THREE GitHub workflows including frontend build passed, 575 frontend files scanned for unsafe direct calls to the four sensitive internal finance helpers (0).
- ⬜ Remaining unreviewed player/system mutation surfaces, anti-farming, finance permissions, paid license and JWT/transaction integrations remain blocked on isolated staging. No guest rollout or production migration.

[Detailed release matrix](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## CURRENT SATURN STATUS — 20 November 2026, Youth Academy expiry guards

- ✅ Draft 14-day lifecycle / original club guards now cover **39 reviewed player-facing mutation RPCs**: the prior 33 and six manager-initiated Youth Academy actions (race entry, race withdrawal, lineup selection, scouting, Academy budget transfer and training philosophy). The six new functions are in `supabase/migrations/20261120235700_saturn_youth_academy_player_expiry_v1.sql`. Fully converted and ordinary managers keep prior checks, and linked-but-unconverted original UUIDs remain subject to the trial expiry.
- ✅ The separate **paid Youth Academy** eligibility check remains intact; seven-day welcome Premium does not automatically grant paid Youth Academy. Read-only Academy views and race-engine/scheduler functions are left untouched.
- ✅ Source tests `tests/saturnYouthAcademyExpiry.test.mjs` enforce guard-before-write ordering and explicitly list remaining real-staging regressions.
- ✅ **Last verified code commit `df2cd8cd04dd4f56b9db74408610d32221e114d9`:** **139 PASS / 0 FAIL / 114 staging TODO** (253 cases), 258 PostgreSQL statements and 54 PL/pgSQL function bodies parsed in 29 SQL files, all THREE workflows passed. 575 React source files scanned; zero direct internal finance RPC references.
- ⬜ More player-facing mutations and anti-farming remain unaudited. No isolated staging yet, no real guest JWT, Youth paid access, Academy finances, race, read-only view or scheduler integration tests. Production guest functionality and finance permission fixes are **not deployed**.

[Full staging and release blockers](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## CURRENT SATURN STATUS — 20 November 2026, expanded gameplay write audit

- ✅ **Code-tested:** 33 selected player-facing write RPCs now have draft Saturn lifecycle/club/expiry checks (the previous 28 plus five equipment writers). Latest added: equipment default setup types, maintenance reminders, selling equipment, starting maintenance and Coins-based setup slot unlock.
- ✅ **Read-only preserved:** A potential shared-helper override was reverted after identifying `equipment_assert_club_access` is used by read-only inventory, market and dashboard views. Expired test players must be able to inspect existing equipment and finances. Five specific write RPCs are instead protected individually.
- ✅ **Database-wide discovery:** Production read-only inventory shows 353 `public` SECURITY DEFINER functions with effective authenticated EXECUTE and a *heuristic* SQL write/delegation signal. This is NOT a count of exploitable or missing guards. `supabase/tests/saturn_unreviewed_security_definer_inventory.sql` prioritizes actual player-facing finance, competition, equipment, training and internal scheduler routines for further review.
- ✅ **Last verified source commit `1f73b3a7ab4624b8f1cda1fe92f89d745b56436b`:** 240 Saturn cases, **132 pass / 0 fail / 108 staging TODO**; 252 SQL statements / 48 PL/pgSQL bodies / 28 SQL files parsed; all three CI workflows passed.
- ⬜ **Not deployed or live-tested:** New SQL remains in draft PR #277. Remaining game mutations, finance security and anti-abuse still incomplete. No isolated staging environment, real JWT, gameplay, or concurrency tests yet. Keep guest feature OFF in production.

[Staging and full mutation-audit detail](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## CURRENT SATURN STATUS — 20 November 2026, linked-identity security milestone

- ✅ **Code-tested: 14-day expiry for the 28 selected RPCs now follows the unconverted Saturn lifecycle, not the Supabase anonymous flag.** Email/Google identity linking before final `converted_at` can no longer skip the review-branch checks merely because `is_anonymous` became false. The 20 direct-write RLS table guards reuse a helper that checks the unconverted lifecycle FIRST. Fully converted and ordinary permanent-user paths remain unchanged in the draft source.
- ✅ Added `tests/saturnLinkedIdentityExpirySafety.test.mjs`, `tests/saturnLinkedIdentityExpiryAudit.test.mjs` and read-only staging `supabase/tests/saturn_linked_identity_expiry_audit.sql`, including explicit expired linked-but-unconverted detection.
- ✅ **Last verified source commit `4923f123abafd9d877341daed76a16d433c38769`:** 229 test cases, **126 passed / 0 failed / 103 staging TODO**, 246 SQL statements and 43 PL/pgSQL bodies parsed in 26 files, all THREE GitHub workflows passed, 575 frontend files scanned with no direct calls to the four sensitive finance helpers.
- ⬜ **NOT DONE:** Real guest JWT, expiry, Google/email linking and conversion, scheduled jobs, all other user mutation functions, finance grants hardening and full-game behavior still require isolated staging. Source fixes are **not deployed**; the production guest gate remains OFF.
- ⚠️ Existing browser-executable finance primitives remain a separate live security risk; the review-only permission tightening migration must be compatibility-tested before any production change.

The older dated implementation notes below are historical milestones, **not claims of live activation**. Follow this latest summary and the [staging release matrix](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md) for outstanding work.

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

## SAT-02 — Server-confirmed identity-preserving email conversion

The review branch includes `saturn_finalize_test_account_email_conversion_v1()`: after a test manager links and confirms email and sets a password using Supabase Auth, this server procedure locks the **same original UUID** lifecycle, checks the real Auth user's non-anonymous status, confirmed email, password credential, original team ownership and membership, then idempotently records `converted_at`. It does **not** create another Auth user/team, regrant Coins or reset the seven-day Premium window. The test-account conversion page now reports completion **only after** the server confirms the matching original Auth user ID and conversion success. Existing non-anonymous player workflows are unchanged in source.

**Not live-tested:** Supabase Auth email confirmation flow, renewal of sessions, exact JWT mapping after transition, expired-to-registered permission restoration, Google OAuth linking, tier vacancy reassignment and production deployment. `saturn-14day-guest-staging` branch creation was attempted but Supabase required a cost-confirmation ID; no branch, charge or production changes occurred. The user must approve the quoted cost (Supabase organization ID required to obtain the quote). Latest checked source commit `d45a1ba25718fead88e5408d3bdca1b66842c5e4` passed Saturn CI: **151 cases, 86 pass, 0 fail, 65 TODO staging**, including frontend build. [Complete staging gate](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## SAT-02 — Same-UUID Google conversion review milestone

The draft registration page now offers **Link Google to this team**, using `testClient.auth.linkIdentity({provider:'google'})` on the original persistent anonymous Auth session rather than the new-account Google login flow. A tagged OAuth callback returns to ProPeloton's **HashRouter** page while avoiding competition between the main memory-only Auth client and the persistent test client. A separate draft server finalizer checks the **canonical linked Google identity** in `auth.identities`, `auth.users.is_anonymous=false`, the unchanged original Auth UUID and actual official club ownership before marking that same lifecycle converted. This does not reset Premium or copy a team.

**Status: source code completed, not staging validated, not deployed.** Manual identity linking and the tagged callback URL must be configured and checked in isolated staging. An already-linked Google account must never merge or replace an existing team. Latest verified CI commit `7ff4bd0a0f20bedb45b6bd6f648263aa8d826113`: **160 test cases, 90 passing, 0 failing, 70 TODO staging**, app build and all 3 workflows passed. [Staging acceptance instructions](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md). Guest Mode remains OFF.

## SAT-03 — Highest approved vacant tier for converted teams (20 Nov 2026)

The draft PR now includes `saturn_place_converted_test_team_v1()` and a private, **OFF-by-default**, manually approved `saturn_converted_vacancy_caps_v1` capacity table. The RPC verifies the canonical original permanent Auth UUID, `saturn_test_accounts_v1.converted_at`, unchanged original owned main club and owner membership. It evaluates available WorldTeam, ProTeam, Continental and Amateur slots in descending competition-category / ascending world-tier priority; region must match the live country-to-division mappings. Vacancies have a **hard approved capacity** and are serialized with advisory/row locks to avoid simultaneous overallocation. The function never moves existing AI or human clubs, replaces a race entrant or resets original assets, finances, points, or Premium.

If active race applications/entries exist (legacy and v1 formats), a season transition is armed or there is no **approved actual empty higher slot**, placement is deferred and the club stays unchanged. After successfully finalizing email/password or Google registration, the UI calls placement as an optional step, reports the result and does not fail registration if relocation is unavailable. These remain **source-only** protections: no approved slot records exist, no production SQL was deployed and no team was moved. Real staging must verify concurrency and race/season handling.

**CI correction:** Earlier Saturn workflow used `tests/saturnTest*.test.mjs` and silently omitted a new `saturnConvertedVacancyPlacement.test.mjs` test. It now runs `tests/saturn*.test.mjs`, including all Saturn contract tests. Source commit `092b6c88d7a28631c09990caf3adc8cd124ace91` passed all three workflows; **199 test cases, 113 passed, 0 failed, 86 TODO staging**. [Staging approval matrix](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## SAT-03 — Safer division vacancy allocation, idempotency and review

The converted-team placement SQL is now hardened with a private, durable **one-time placement audit** (`saturn_converted_team_placements_v1`, unique user/club). A successful promotion can never repeat if the player retries later; no vacancy leaves the original club unchanged and permits recheck. Successful club tier update and audit insert are atomic. The per-division vacancy cap is re-read **under a row lock**, preventing outdated admin capacity values from being used after a concurrent reduction. A cap is eligible only if the destination corresponds to an **existing active official league cohort**, so configuration mistakes cannot create imaginary leagues. Human and AI incumbents remain untouched.

Added the **read-only staging vacancy/occupancy report** `supabase/tests/saturn_approved_vacancy_occupancy_audit.sql`, showing existing human/AI counts, hard caps, effective free places and missing/inactive cohorts. No cap records are preapproved. Verified GitHub source commit `8a98023795b826f90b07a36e16f0421bbda111b6`: **205 tests (115 passed, 0 failed, 90 staging TODO)**; all three workflows and application build passed. This is still draft only; no production schema, club, division, race or guest setting changed. Actual Supabase JWT/concurrency/race tests remain blocking.

## SAT-03 — Protect converted clubs from existing global TOP-3 AI overflow

A read-only live audit found that the original `trg_rebalance_top3_overflow_ai_to_pool_v1` may move unrelated AI teams after a converted human club enters WorldTeam, ProTeam or Continental. The legacy 25-club limit applies to category/region **across all world tiers**, not just the new approved tier-cap row. Live grouped counts include WorldTeam 25 and PRO_WEST 27, so a higher-tier vacancy cannot be assumed merely from a local league slot.

The review-branch conversion transaction now adds a **private exact-club/source/destination/transaction ticket**, which makes only this authorized placement skip the unrelated global AI rebalance trigger. Normal player allocation/rebalancing remains unchanged. A global division advisory lock and a strict **all-world-tier incumbent count below 25**, alongside the approved tier/region capacity, prevent the conversion from exceeding that global rule. The ticket is removed in the same transaction; original club ID, assets, finances and race history remain untouched. **No live migration or team move occurred.**

Verified GitHub contract/build run for `fd2a63205460814a3df2acbb7f27c797c81edc41`: **209 tests, 116 passing, 0 failing, 93 staging TODO**, all three workflows successful. Requires an isolated database and real concurrency/trigger tests before release. [Staging checklist](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## SAT — no-cost PostgreSQL syntax validation for every draft migration

The GitHub review workflow now installs `pglast` and invokes `scripts/saturn_sql_parse.py`, which parses every Saturn migration and read-only SQL audit directly from source without touching production. On its first run it exposed **six previously untested invalid SQL migration files**, including missing semicolon terminators after function bodies. All have been repaired and the final run parsed **233 top-level PostgreSQL statements across 22 files**. Latest tested commit `a17f263767f02f5b88a574d3494080816a2638b0`: **116 passing Saturn tests, zero failing, 93 staging TODO**, all three GitHub workflows passed. This removes known top-level SQL syntax blockers; PL/pgSQL compilation, permissions, triggers and real game transaction behavior remain **untested** until isolated staging becomes available. No production SQL was deployed and no guest feature was enabled. [Staging matrix and parser limitations](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## SAT — complete offline PL/pgSQL grammar validation

GitHub's Saturn SQL audit now uses `pglast.parse_plpgsql` to parse stored function bodies as well as outer PostgreSQL statements. It caught and corrected two previously undetected issues in the rider/facility migration: an unused rider-role variable and, critically, a guest-expiration `IF EXISTS` guard mistakenly inserted **inside** an infrastructure INSERT column list. The server authorization check is now positioned correctly **before** any upgrade write, with a regression test checking ordering. Latest verified source commit `d96f9fcde7b89c1920e5601753c61a485f6ac868`: **233 SQL statements, 43 function bodies, 22 files**, 210 Saturn tests **117 passed, 0 failed, 93 staging TODO**, three GitHub workflows PASSED. All draft-only; isolated staging SQL execution and Auth/JWT/game simulation tests still needed. [Release verification matrix](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## SAT-01 — Real test club setup: extra race-entry safety and postcreation reconciliation

Live read-only club setup inspection confirmed that normal club creation already invokes starter setup and finance initialization, including a unique `finance.event_locks` bonus safeguard, but real anonymous account creation still needs staging. The draft low-tier AI-slot swap has now been strengthened to **reject AI clubs appearing in `race_team_entries`** under either owning or participating club IDs, in addition to the existing race application and legacy/v1 participant guards. Even withdrawn/completed historical entries are excluded, so onboarding never rewrites race history.

Added **read-only staging SQL** `supabase/tests/saturn_guest_postcreation_reconciliation.sql`, which flags any mismatch between official owner membership, ten domestic starter riders, club and finance summary cash, one Premium entitlement and the original 168-hour Premium and 336-hour test term. No records are mutated by the audit. Latest verified source commit `1e749403890aba0281aa1cb8b964ec7f637c8971`: **234 PostgreSQL statements, 43 PL/pgSQL function bodies in 23 files**, Saturn tests **118 passed, 0 failed, 93 staging TODO**, all three workflows passed. [Staging matrix](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## SAT-SEC — Critical existing finance RPC privilege exposure discovered

Read-only production inspection found that **four existing SECURITY DEFINER financial helper functions** allow direct EXECUTE by both `anon` and `authenticated` browser roles: `finance_grant_new_club_bonus`, `finance_setup_new_club`, `finance_credit_to_club` and `finance_get_or_create_club_account`. The bonus allows an explicit positive amount and has no internal owner check; the credit RPC has an authorization branch that is bypassed for requests with no UID. **This is a potentially severe existing finance authorization weakness, not just a future guest-account concern.** The draft `20261120235000_saturn_internal_finance_privilege_hardening_v1.sql` removes browser EXECUTE for all four and retains service-role access. Source tests were added, but normal user and scheduler finance dependency regression is still required before deploying this revocation in production. No live permissions were changed. Prioritize an independent live finance-security remediation review rather than conflating it with Saturn's eventual guest release.

Last fully checked source commit `276d1cfe891806647c1afb80057ccaa560e6b4f6`: **242 PostgreSQL statements / 43 PL/pgSQL bodies / 24 SQL files**, 217 Saturn test cases **120 passing, zero failing, 97 staging TODO**, all three CI workflows passed. [Finance/security blocker and staging test matrix](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

## SAT-SEC — Finance RPC dependency compatibility audit (20 November)

The finance security follow-up traced the four externally callable internal finance primitives through live `pg_proc` definitions; the identified in-database callers are SECURITY DEFINER functions used by ordinary team registration, rider payroll, equipment sales, refunds, taxes, loan finance and the race engine. New CI script `scripts/saturn_frontend_finance_rpc_audit.py` scans **all 575 frontend source files** for direct calls to these four internal APIs: **0 references found**. This supports, but does not prove, safe browser-role EXECUTE revocation, since external/edge clients and runtime-generated names may be missed. New **read-only** `supabase/tests/saturn_internal_finance_grants_audit.sql` confirmed all four remain executable by both anonymous and authenticated roles in current production. Their proposed REVOKEs are still only an undeployed migration. Staging authorization and all gameplay transaction tests must pass before any live privilege change. [Full finance security review](docs/SATURN_STAGING_RELEASE_GATE_2026-11-20.md).

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
