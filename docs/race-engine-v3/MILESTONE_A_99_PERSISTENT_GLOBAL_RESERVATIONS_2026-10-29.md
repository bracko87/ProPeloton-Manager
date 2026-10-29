# Race Engine V3 — Step99 persistent whole-peloton space-time reservations

**29 October 2026 — Milestone A, research-only opt-in experiment.** No production live race controller, historical outcome, payouts, Supabase state or game clock touched.

## What is new

Steps97/98 established that neither corrected two-gate global appointment windows nor an 8-second whole-field conflict forecast plus 6-second original-A64 physical lookahead yields complete large 106/168 five-abreast racing. Step98 concluded technical CI 4/4 but sporting 0/8 full180s, best accepted 9.5s, with its controller unable to persist commitments across half-second requests.

Step99 introduces a *serializable globally assessed* [physical space-time reservation ledger](../../scripts/v3/a2Step99PersistentReservationsV3.mjs) for each actual leader/follower/corridor/gate relation. The claim explicitly stores leader and waiting rider, gate ID and physical x, requested lateral target, accepted-clock claim start, bounded expiration, and the reserved steering window. Existing claims are revalidated against **current achieved** relative longitudinal position, closing speed, steering time and target gate; physical headway loss, clock expiration, gate mismatch or completion forces revocation. New claims are acquired only if the achieved bicycle gap and available distance can support the requested lateral manoeuvre. Same-x geometric ties cannot use IDs, list order or mirror side as right-of-way.

All pair conflicts are evaluated across the entire physically proximate peloton—not only neighboring five-rider start rows. Requests combine bounded forward assistance for a leader with capped follower desired speed (never commanded below 6.5m/s) and holds on incompatible lane change requests. Multiple claims affecting the same cyclist are accumulated before output. First-gate claims cannot silently transfer to the second gate. Reservations are ADVISORY only; a claim is not permission to override actual 16-subinterval A64 all-pair swept bicycle collision, road edges, force/braking constraints or W-prime ledger.

The new opt-in **persistent_global_strict_v1** and **persistent_global_balanced_v1** policies test seven first-field candidates (three newly reserved hold/flow/release requests, Step86 physical gap wave, Step87 row pace, baseline, Step78 joint), then use the unchanged Step98 original A64 lookahead selector with a *four-second/eight-half-second* physical continuation and two future options per tick, preserving the Step95 achieved upstream speed >=6.5m/s, downstream >=4.5m/s and near-stop veto. Only independently original-A64 accepted real first movements can commit or renew saved claims; hypothetical search futures never write a lease or mutate accepted x/y/v/energy. Mirror canonicalization and identity renaming are explicitly tested.

## Validation matrix

[Dedicated Step99 CI](../../.github/workflows/v3-step99-global-trajectory.yml) includes pure claim acquisition/reuse/revocation, two-gate handoff, equal-x neutrality and reflection/identity/order tests; the protected Step78/85/86/87/89–98 regression suites, real original-A64 106/168 × staged/double × strict/balanced 180-second attempt with actual near-stop/speed/energy audit, 16 original A64 mirrored+renamed comparisons, independent 8/32 180-second actual overtake+lane-change+exact 90+90 checkpoint tests and React production build.

**Sporting GO is not determined by green CI.** Only 106 AND 168 full 180s five-wide, two actual gates completely crossed, zero contact/road/off-energy/crawl, sustained true >=3s overtakes, parity and exact recovery can approve milestone A. The earlier Step86 32 five-wide full180 staged 80 passes/411 changes and double 70 passes/678 is the protected benchmark. Milestones B/C not approved. No production rollout.

## Physical results

To be populated only from completed GitHub Actions original A64 logs. Research-only Step99 must be rejected for sporting activation if it does not pass its real complete large-field gate.
