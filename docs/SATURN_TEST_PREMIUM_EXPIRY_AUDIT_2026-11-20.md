# Saturn SAT-01 / SAT-08 — trial Premium, race access and expiration audit

**Development review, 20 November 2026. This is not a production authorization sign-off.**

## Implemented in PR #277

The dedicated test-team creation SQL inserts the ordinary seven-day entitlement in `public.premium_welcome_trials_v1` within the same transaction as the real club, finance, membership and test-account lifecycle. Both share the exact original server `started_at` and the 168-hour expiry. The existing `user_has_premium_access_v1` already reads this table; a conversion to permanent identity does not create another trial record or extend its expiration. Repeated inserts use the primary-key conflict rule and explicitly verify an existing trial has not been reset. This is NOT a paid Premium subscription and grants no extra Coins.

The proposed `saturn_test_account_can_mutate_v1(p_club_id)` checks canonical anonymous Auth status, exact owner club ID, active non-AI club, original start, unexpired 336-hour term, and null conversion marker. It is not directly callable by browser roles. The official `apply_for_race_v1` SQL changes only the anonymous-player guard; permanent players retain the former application path. Guest race entry is permitted ONLY while the precise club is owned by an active test identity. Existing race application windows/eligibility rules remain intact.

## Still unverified, and why public Guest Mode stays OFF

1. **Broad write surface.** A read-only scan of the live Supabase schemas found **2,405 public functions**, **2,010 public SECURITY DEFINER functions**, and a heuristic **941 public function definitions mentioning INSERT/UPDATE/DELETE**. This heuristic is not a list of actual exposed vulnerabilities, but proves that changing one race-entry RPC does not make all gameplay mutations expiration-safe. Permission inventory and review are required per actual player-facing endpoint, trigger, and direct-table RLS policy.
2. The current full-game guest branch does **not** block all other expired account mutations for riders, equipment, staff, transfers, finance, sponsors, policies, training, or team settings. Expiry is fully checked only in the proposed targeted race-entry authorization helper. No server-wide access claim is made.
3. The existing `get_my_premium_trial_onboarding_v1` deliberately excludes anonymous users. The newly inserted entitlement is consumed by `user_has_premium_access_v1`, but onboarding messages and trial displays must be adjusted to avoid contradictory expired/guest notices. Some equipment/infrastructure Premium helpers intentionally check **paid** Premium rather than trial eligibility; audit parity with normal 7-day permanent-user trial before changing them.
4. Abuse prevention is incomplete: creating fresh anonymous UUIDs could yield repeated seven-day trials without CAPTCHA, IP/device restrictions, challenge verification, and claim controls. A UUID-derived trial hash protects against collisions but does **not** prevent repeated anonymous accounts. Do not enable the Auth signup gate.
5. Exact real-user test cases remain missing: JWT negative tests against another club; team creation during concurrent browser sessions; first day vs day 7 vs day 14; server-side write denials; email conversion without new welcome grant; complete race, finance, staff, and equipment preservation.
6. Existing production clock, clubs and race results must remain untouched; these migrations are **review branch only**. Do not merge until verified.

## Prioritized next build work

- Enumerate and classify client-exposed mutation endpoints per game page (race applications and withdrawals, training, staff, equipment, finance, transfers, sponsors, infrastructure, profile changes), then enforce a shared server-side active-test-term authorization check at entry points while preserving system scheduler/game-engine actions.
- Use transactional tests for each category with an unexpired test Auth UUID, an expired UUID, another owner and a normal registered user; assert positive cases and fail-closed negatives.
- Reconcile `get_my_premium_trial_onboarding_v1`, relevant paid-only vs trial feature controls, and no restart on registration; test one-time grant and conversion collision.
- Only after the above, conduct end-to-end staging of full-game test users and approve public activation.
