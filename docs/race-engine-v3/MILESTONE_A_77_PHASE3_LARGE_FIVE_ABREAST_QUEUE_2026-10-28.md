# Race Engine V3 - Step 77 Phase 3: 106/168 five-abreast queue and contact-causality audit

**Date: 28 October 2026. Technical regression/evidence gate PASS; large-field physical racing gate FAIL / NO-GO.**

## Scope and preserved safety

This research is **offline and synthetic**, and does not alter live races, Supabase tables, race publications, payouts, game clock, Netlify gameplay, or the authoritative A64-A76 bicycle physics integrator. Existing physical limits remain +0.45m/s² acceleration, -0.85m/s² braking, 0.38m/s lateral steering, 0.3m bicycle half-width and exact swept full-field collision/road-edge rejection. Rejected half-second transitions are not committed; the newly added controllers only request temporary rider speeds and steer targets.

Step 77 Phase 2 already proved an opt-in **32-rider** body-valid five-abreast mixed-width stage-shaped 180s pilot with all riders beyond x1470m, **87 independent genuinely sustained 3-second passes**, no detected collisions, road exits or near-stop ticks, exact 90+90s snapshot and mirror / renamed identity parity. That protected controller is unchanged and remains green.

## Phase 3 tests executed

**A. Initial-row spacing hypothesis:** [source](../../scripts/v3/probe-a2-step77-phase3-launch-spacing-v3.mjs). Initial before-clock row spacings 5.2, 6.5, 8 and 10 metres, two road layouts, 106 and 168 riders, both original variable speeds and uniform 9m/s neutral rolling start = **32 variants**. All **32** were rejected by the original full-body swept collision solver before completing 180 seconds. Some 8/10m starts reached roughly 9.5-17.5 seconds, but simply widening the starting grid does not solve physical merging. A very large row gap is also not a legitimate production replacement for a realistic bunch.

**B. Anticipatory leader-retention and upstream brake requests:** [offline helper](../../scripts/v3/a2Phase3QueueWaveV3.mjs), [physical wrapper](../../scripts/v3/a2MultiGatePhysicalCandidateV3.mjs), [72-case matrix](../../scripts/v3/probe-a2-step77-phase3-anticipatory-wave-v3.mjs). The new helper uses only current positions/velocities and temporary crossing requests. It preserves lead pace when a fast cyclist is approaching from behind, then passes bounded speed requests back through the queue. It does not create accepted motion or override the collision solver.

The matrix contains **72** variants: 32/106/168 riders × staged/double-2.2m × 5.2/6.5/8m rows × neutral/original start × two warning policies. **Zero** variants met the complete 180s physical clearance with no contact. For 106-rider staged starts, best 10.0 accepted seconds (baseline 4.0); for 168 riders best 11.0 seconds (baseline 3.0). These are early **rejections**, not successfully completed simulations. The wave also harmed the proven 32-rider staged full-run path and therefore is **NOT APPROVED** to replace it.

**C. Determinism, fail-closed recovery and first contact diagnostics:** [mirror/checkpoint suite](../../scripts/v3/verify-a2-step77-phase3-mirror-and-checkpoint-v3.mjs) checks 12 matched 30s configurations for physical mirror parity, rider-ID renaming, exact JSON continuation and refusal to advance a rejected field. [First-contact authority audit](../../scripts/v3/probe-a2-step77-phase3-first-contact-authority-v3.mjs) checks 18 scenarios. All these *technical audit tests* passed.

The first-contact audit distinguishes:
- **Same-lane longitudinal compression**: in several 106/168 runs, at the rejected tick even instant +0.45m/s² lead acceleration and -0.85m/s² rear braking would leave less than 1.8m clearance if lateral position remains fixed. This is a current-tick limitation, **not a proof that an earlier steering path cannot avoid contact**.
- **Cross-lane lateral convergence**: other riders are already too close longitudinally when approaching lateral tracks overlap. Simply broadcasting earlier braking requests can push the contact into this different failure class, rather than solving it.
- **Available bounded margin**: some rejected contacts still have sufficient longitudinal clearance if acceleration is coordinated properly, demonstrating that current policy decisions also leave avoidable cases.

[Final Phase 3 CI, with exact logs and JSON artifacts](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40773205294) completed successfully for the *audit*, not the 106/168 sporting result.

## Engineering conclusion: do not promote Phase 3 warning policy

A fixed time-table plus independent rider speed caps is insufficient. Future work must solve **joint local space-time viability**, rather than tuning global row spacing, tweaking emergency braking, accepting overlaps or swapping the working controller.

## Next gate — Step 78, genuinely coupled physical lane-and-speed negotiation

1. Build a **current-state, rolling-horizon 2D viability planner** that decides *which* riders may enter a disappearing lateral corridor while reserving longitudinal passing clearance and a braking-reachable plan for **all directly affected riders**. Operate before the risk is irreversible, not at the moment of contact.
2. All decisions use bounded +0.45/-0.85m/s² longitudinal commands and ±0.38m/s steering in the unchanged authoritative swept solver. Fail closed where no viable state exists; no teleport, side-clipping, imaginary roads, rider-ID exemptions or hindsight rescheduling.
3. First protect the exact 32-rider staged **180s/87-pass** baseline. Extend to 106 and 168 *five-abreast* on staged and double-strong roads. Require every rider past the second reopening x1470 at 180s, zero detected contacts, road exits and near-stops, sustained 3-second overtakes, mirrored/renamed parity, and exact 90+90s physics and independent overtake observer JSON recovery.
4. After synthetic multi-gate runs pass, validate full-stage terrain/grade and rider power/energy realism before Milestone A sporting approval, then later Milestone B gameplay integration and Milestone C production readiness.

**Current status:** Step77 Phase3 diagnostic work COMPLETED, physical 106/168 scalability UNRESOLVED, full V3 Milestone A NO-GO, no production integration authorized.
