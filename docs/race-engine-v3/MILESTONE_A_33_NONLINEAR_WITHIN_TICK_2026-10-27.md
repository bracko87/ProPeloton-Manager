# Race Engine V3 — Step A33: nonlinear within-tick trajectory fidelity audit

**27 October 2026 — independent research technical tests PASS; nonlinear race-physics realism gate remains NO-GO.**

## Scope: check a modeling assumption before further racing-scale claims

[A32](MILESTONE_A_32_BOUNDED_SAFE_SLOTS_2026-10-27.md) passed the 1,760 matched *linear swept-path* micro cases and recovered all 48 difficult two-rider lane-claim overtakes. It did **not** validate a future physical model in which riders steer or change longitudinal velocity **nonlinearly inside a 10-second tick**.

The existing `continuousBicycleCollisionV3` predicate is mathematically appropriate for the two linearly interpolated 2D trajectories *actually supplied to it*. However, two trajectories that share exactly the same endpoints may differ substantially between those endpoints if they are allowed to accelerate, brake or steer within the tick.

For A33, no canonical racing integrator was modified or claimed to produce curved movements. Instead, the new offline-only `scripts/v3/a2NonlinearSweepAuditV3.mjs` compares:
- **Endpoint chord:** the existing continuous analytic checker applied once to each rider's tick start/end states.
- **Explicit intermediate knot trajectories:** the *same existing analytic checker* independently applied to each overlapping time interval of the two riders' **supplied, timestamped piecewise-linear** movements. Each interval uses its own longitudinal and lateral start/end positions.

The union of both riders' timestamp boundaries is used so trajectories with different knot times are compared over identical physical subintervals. Every knot set must span t=0..1 with strictly increasing timestamps, finite positions and nondecreasing forward metres. This is exact **for the specified piecewise-linear segments**, **not** a numerical proof for unsampled smooth curvature or real engine behavior. Adversarial tracks are intentionally synthetic, not sourced ride telemetry.

## Exact validations

[GitHub Step A33 CI validation](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40541912086) ran the new audit, unchanged simultaneous micro/Step32 bounded-slot regressions and production application/i18n build. The new deterministic cases include:

1. **256/256 two-knot equivalence checks:** with exactly two positions, the piecewise checker and original endpoint-checker agree. The audit did not silently change linear collision rules.
2. **Four clear counterexamples to endpoint-only clearance:** a rival stays longitudinally within 1m of another but briefly crosses its lane and returns during the tick. Both tick endpoints are in non-overlapping lanes, while explicit middle positions show an overlap; the chord returns false and segmented motion returns true.
3. **Four opposite counterexamples:** endpoint interpolation predicts a collision, but a fully specified rider temporarily shifts into another lane before crossing longitudinal order; all segmented paths are clear. The chord is overly restrictive for this alternate true track.
4. **96 synthetic 8/12/24/32-rider snapshots:** four provisional road envelopes × four field sizes × six distinct motion phases. All rider orders produce the same saved, deterministic per-pair results; the whole report is JSON round-trip exact. These are *snapshots*, NOT a complete 8/12/24/32-rider race or actual V3 trajectory capture.

The larger synthetic sample generated:

| Audit quantity | Recorded |
|---|---:|
| Snapshots | **96** |
| Compared rider pairs | **20,784** |
| Time-aligned piecewise subinterval checks | **83,136** |
| Collisions indicated by straight endpoint chords | **0** |
| Collisions indicated by supplied nonlinear-path knots | **120** |
| Nonlinear-path overlaps missed by endpoint chords | **120** |
| Extra endpoint collision alarms in this 96-snapshot batch | **0** |
| Two-knot reference equivalence tests | **256/256** |

The four hand-constructed false-alarm examples are **additional** to the above snapshot counts. The 120 overlaps are *not production race collisions* or a calibrated projected crash rate. They are diagnostic evidence that the result of a collision checker depends on whether the tested physical movement is a straight chord or a different within-tick path. The source V3 linear micro solver still follows its existing explicit linear-motion assumptions and is unchanged.

## Acceptance boundaries and remaining work

**Completed:** an independent, deterministic, repeatable adversarial nonlinear-motion checker and audit with logged JSON evidence, plus unchanged A32 and legacy physical checks, collision tests and build. The first A33 requirement, detecting *when* endpoint-only paths are insufficient for an alternative nonlinear motion model, is now demonstrated.

**Not completed:** physical generation of authentic intermediate trajectories from the production candidate, fractional/substep power and W-prime integration, calibration of steering and road width to measured routes, and independent complete 106/168-rider sporting comparisons with the same new physics. A sampled piecewise path is only as trustworthy as its underlying movement source; no A33 result certifies arbitrary acceleration between knots.

**Disposition: A33 audit complete and PASS; A2 nonlinear movement and sporting realism remain NO-GO.** The offline checker is a research instrument, not a new selected collision resolver. Do not disable original collision checks, promote this routine into canonical race physics, write official race results, change the player UI, alter Supabase or game clock, or claim any A2/B/C milestone complete from this study.

**Next step A34:** integrate trustworthy time-stamped intermediate movements in an isolated physical-simulation research adapter (not official racing); use consistent piecewise swept collision and finite-energy accounting, then stress nonlinear turn/braking/merges over small grids and larger pelotons with exact checkpoint replay. Real width/elevation sources, historic results/ranking stability and realistic breakaways remain blockers.
