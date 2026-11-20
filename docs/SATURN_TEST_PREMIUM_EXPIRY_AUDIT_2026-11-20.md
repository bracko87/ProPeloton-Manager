# Saturn SAT-01 / SAT-08 — trial Premium, race access and expiration audit

**Development review, 20 November 2026. This is not a production authorization sign-off.**

## Implemented in PR #277

The dedicated test-team creation SQL inserts the ordinary seven-day entitlement in `public.premium_welcome_trials_v1` within the same transaction as the real club, finance, membership and test-account lifecycle. Both share the exact original server `started_at` and the 168-hour expiry. The existing `user_has_premium_access_v1` already reads this table; a conversion to permanent identity does not create another trial record or extend its expiration. Repeated inserts use the primary-key conflict rule and explicitly verify an existing trial has not been reset. This is NOT a paid Premium subscription and grants no extra Coins.

The proposed `saturn_test_account_can_mutate_v1(p_club_id)` checks canonical anonymous Auth status, exact owner club ID, active non-AI club, original start, unexpired 336-hour term, and null conversion marker. It is not directly callable by browser roles. The official `apply_for_race_v1` SQL changes only the anonymous-player guard; permanent players retain the former application path. The matching `cancel_race_application_v1` code also checks the same canonical guest, club ownership and unexpired term before an application can be withdrawn. Guest race entry is permitted ONLY while the precise club is owned by an active test identity. Existing race application windows/eligibility rules remain intact.

## Still unverified, and why public Guest Mode stays OFF

1. **Broad write surface.** A read-only scan of the live Supabase schemas found **2,405 public functions**, **2,010 public SECURITY DEFINER functions**, and a heuristic **941 public function definitions mentioning INSERT/UPDATE/DELETE**. This heuristic is not a list of actual exposed vulnerabilities, but proves that changing one race-entry RPC does not make all gameplay mutations expiration-safe. Permission inventory and review are required per actual player-facing endpoint, trigger, and direct-table RLS policy.
2. The current full-game guest branch does **not** block all other expired account mutations for riders, equipment, staff, transfers, finance, sponsors, policies, training, or team settings. Expiry is checked only in the proposed targeted race application/withdrawal authorization helper so far. No server-wide access claim is made.
3. The existing `get_my_premium_trial_onboarding_v1` deliberately excludes anonymous users. The newly inserted entitlement is consumed by `user_has_premium_access_v1`, but onboarding messages and trial displays must be adjusted to avoid contradictory expired/guest notices. Some equipment/infrastructure Premium helpers intentionally check **paid** Premium rather than trial eligibility; audit parity with normal 7-day permanent-user trial before changing them.
4. Abuse prevention is incomplete: creating fresh anonymous UUIDs could yield repeated seven-day trials without CAPTCHA, IP/device restrictions, challenge verification, and claim controls. A UUID-derived trial hash protects against collisions but does **not** prevent repeated anonymous accounts. Do not enable the Auth signup gate.
5. Exact real-user test cases remain missing: JWT negative tests against another club; team creation during concurrent browser sessions; first day vs day 7 vs day 14; server-side write denials; email conversion without new welcome grant; complete race, finance, staff, and equipment preservation.
6. Existing production clock, clubs and race results must remain untouched; these migrations are **review branch only**. Do not merge until verified.

## Prioritized next build work

- Enumerate and classify client-exposed mutation endpoints per game page (race applications and withdrawals, training, staff, equipment, finance, transfers, sponsors, infrastructure, profile changes), then enforce a shared server-side active-test-term authorization check at entry points while preserving system scheduler/game-engine actions.
- Use transactional tests for each category with an unexpired test Auth UUID, an expired UUID, another owner and a normal registered user; assert positive cases and fail-closed negatives.
- Reconcile `get_my_premium_trial_onboarding_v1`, relevant paid-only vs trial feature controls, and no restart on registration; test one-time grant and conversion collision.
- Only after the above, conduct end-to-end staging of full-game test users and approve public activation.


## SAT-08 implementation progress — six training/staff, six equipment, nine direct tables

Review-only source migrations now add canonical anonymous Auth checks and the existing active-test/owner/expiry predicate to **12 selected player mutation RPCs**:

- Training and staff: clear daily override, set daily override, set rider regular training management, set coach automation, save training camp day plans, hire staff candidate.
- Equipment: discard equipment, purchase equipment, purchase race supplies, save auto-restock settings, save default equipment setup, save equipment presets.

A separate read-only security-definer authorization helper is added to the `authenticated` RLS path as a **RESTRICTIVE** policy for INSERT, UPDATE and DELETE on nine club-linked tables: `clubs`, `club_memberships`, `club_equipment_inventory`, `club_finance_summary`, `club_infrastructure`, `club_staff`, `race_team_entries`, `rider_regular_training_daily_plans` and `rider_regular_training_management`. SELECT is deliberately untouched so the team remains visible after expiry. The predicate gives true to an existing non-anonymous manager only subject to all ordinary RLS policies; a temporary Auth identity must own the exact club and have an unexpired lifecycle. The helper is NOT an unconditional owner bypass and does NOT grant INSERT/UPDATE/DELETE by itself.

**Important qualification:** These RLS barriers do not restrict writes performed by database-owner SECURITY DEFINER RPCs, so each player-facing RPC still needs its own guard. Direct writes involving other tables (transfers, pricing, sponsor offers, training camps, settings, inventory maintenance, development squads, etc.) are not all covered. Existing system/scheduler behavior under database privileges is unverified. No genuine anonymous JWT or Supabase staging integration test has yet passed. Gates remain OFF, no migration deployed, and this remains a draft PR. The upgraded CI workflow now executes the entire `tests/saturnTest*.test.mjs` suite, rather than the previous two-file subset.


## SAT-08 incremental hardening — transfers, contracts, camp finance

Added **seven** reviewed player-requested SECURITY DEFINER mutations to the draft expiry guards:
- `accept_rider_transfer_offer` — owning seller's club
- `cancel_rider_transfer_listing` — owning seller's club
- `confirm_unsolicited_ai_transfer_bid_v1` — owning buyer's club
- `extend_club_staff_contract` — club assigned to staff member
- `finance_book_training_camp` and `finance_book_training_camp_v2` — requested owning club
- `cancel_training_camp_booking` — club attached to selected booking

Each retains its original permanent-account code and checks the canonical anonymous Auth flag, the exact owned club and the server's 14-day expiration before altering the selected state. Debug wrappers delegate to the protected underlying booking functions, but still require dedicated staging verification.

A further five player-facing RLS-protected tables now have restrictive INSERT/UPDATE/DELETE policies using the previously defined active-test-owner predicate: `rider_transfer_listings`, `rider_transfer_offers`, `rider_transfer_negotiations`, `rider_unsolicited_transfer_bids`, and `training_camp_bookings`. For transfer offers and negotiations, either the matching owned seller or buyer club can satisfy the *additional* expiry predicate; the existing RLS policies still decide actual permissions. Read access is unchanged.

This brings the **draft** protections to 21 selected player-facing mutation RPCs (race apply/withdraw, six training/staff, six equipment, seven additional transfer/contracts/camp operations) and 14 club-linked restrictive direct-write tables. These counts do NOT mean server-wide expiry coverage. More transfer settlement, finance posting, staff changes, sponsorship, account, youth and system-facing functions require independent assessment.

**Release remains blocked:** these are source-level protections only, not deployed, not evaluated on staging guest JWTs, not tested against real money/race transactions, and not evidence that SECURITY DEFINER execution paths or all direct RLS policies are complete.


## SAT-08 additional real financial and roster operations

Another seven **player-facing** reviewed SQL functions now include canonical anonymous Auth and exact owned club / unexpired 14-day timebox checks before state changes: `finance_issue_emergency_loan`, `purchase_race_replay_access_v1`, `release_club_staff`, `release_owned_rider`, `release_rider_to_free_agents`, `sell_infrastructure_asset`, and `upgrade_club_facility`. These protect loan attempts, spending replay Coins, rider/staff contract cancellation or transfer to the free-agent market, and construction/sale of infrastructure. Registered players and scheduler calls without an anonymous Auth identity retain existing authorization and game rules.

Five additional RLS-enabled tables now have proposed **restrictive INSERT/UPDATE/DELETE** policies against expired anonymous users: `rider_contracts`, `club_riders`, `club_team_cars`, `club_team_buses`, `club_equipment_vans`. SELECT remains unaffected. **Important: live `public.club_roster` has RLS disabled despite authenticated INSERT/UPDATE/DELETE privileges.** It requires a separate migration and detailed existing-app/game-engine compatibility assessment. It is NOT included in these proposed policies.

Total draft coverage becomes **28 named player-facing mutation functions** (counting 2 race, 6 training/staff, 6 equipment, 7 transfer/camp finance and 7 rider/facility/loan/Coins) and **19 club-linked restrictive RLS tables**. This is a count of source-level proposals, not proof of complete server-wide protection. It does not address other SECURITY DEFINER functions (such as scheduler finance postings) or all direct-write tables, and there have been no actual anonymous-JWT staging tests. Do not merge/deploy or enable Guest Mode without full coverage and negative tests.
