# Race Engine V3 — Milestone A2: frozen-state simultaneous motion micro gate

**27 October 2026 — MICRO ENGINEERING PASS. FULL-STAGE NOT YET TESTED. SPORTING APPROVAL NO-GO.**

## Why this gate exists

The previous [12-full-stage sequential order study](MILESTONE_A_10_SOLVE_ORDER_2026-10-27.md) established that resolving front-of-pack riders first and treating riders not yet processed as static yields different results from rear-first or alternating schedules. Reversing processing order was not a physically valid correction, even where ranking metrics superficially improved: alternating-order steering almost disappeared.

This follow-up adds an **independent, offline-only synchronous micro-prototype** in `scripts/v3/simultaneousConflictResearchV3.mjs`; it does **not** alter `coupled2DMicroV3.mjs`, official race physics, any production database tables or the game clock.

## Actual algorithm (not a sporting claim)

1. Freeze all cyclists' positions and energies at the start of the tick.
2. Compute the requested forward/sideways trajectory for **every rider** from the same frozen state, with energy and acceleration envelope limiting the forward request.
3. Compare complete swept paths using the existing `continuousBicycleCollisionV3` envelope (1.8m longitudinal; geometry-specific lateral separation). At each conflict iteration, **halve the planned movement of every cyclist involved in every currently detected collision simultaneously**, never processing a privileged front or rear rider.
4. Repeat using the updated joint proposal until all paths are swept-collision-free, or **fail closed** if the configured iteration bound is reached. The solver checks both the initial stationary geometry and final accepted travel to rule out initial overlap and invented distance.
5. Apply only accepted actual movement and mechanical power to each rider's finite W-prime ledger. No rider is allowed to draw more supra-critical energy than available. All outputs are marked `A2_SIMULTANEOUS_OFFLINE_ONLY`, `officialWrites=0`, and `sportingApproval=NOT_APPROVED`.

This is **simultaneous proposal and symmetric collective reduction**. It is a conservative deterministic prototype, **not** an optimized simultaneous multi-agent solver. Halving all conflicted paths can unnecessarily slow or strand groups. Neighboring traffic, full-stage road curvature/width, tactical racing, multiple teams, live data and fully realistic passing have not yet been integrated.

## Verified micro-test coverage

[GitHub Actions micro gate — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40474541795), at research commit [`a7b50c61`](https://github.com/bracko87/ProPeloton-Manager/commit/a7b50c617d61e93e958eb2296a8b7f627654c997). The log reports:

`{"suite":"A2 frozen-proposal simultaneous micro","status":"PASS","mergeConflictIterations":1,"flowConflictIterations":1,"safeAdjacentOvertake":true,"orderIndependent":true,"checkpointExact":true,"energyBounded":true,"officialWrites":0,"sportingApproval":"NOT_APPROVED"}`

Specific checks:

- Two same-lane bicycles with a faster follower: conflicting path proposals must be reduced and swept paths remain clear.
- Two riders in separate lanes: a truly collision-free faster follower can pass without losing its requested forward motion.
- Four-rider coordinated lane merging: proposals are collectively checked with no unsafe geometrical overlap.
- Identical test with rider-array order reversed: accepted paths must be **exactly equivalent per rider**; this prevents accidental front/rear or array-order privilege in the resolver.
- A distant fifth rider is not needlessly slowed by an unrelated local conflict.
- Invalid off-road intent or overlapping initial bicycle positions fail closed.
- Repeated micro movement over 10 ticks must survive a 5-tick serialized JSON checkpoint with **exact replay**, nonnegative W-prime and achieved distance never above requested distance.
- Exhausted W-prime is handled by bounding rider speed/power instead of spending unavailable energy.
- Existing Batch 42 and Batch 43 tests, and independent application production build, passed in the same Actions job.

## Boundary between technical and sporting acceptance

The solver currently supports up to **32 cyclists in the stateful micro adapter** (up to 200 for the standalone geometric resolver) but has **not** been validated in a 106/168-rider race or benchmarked for sustained peloton mobility. The test proves specified micro safety properties only; it does not prove that enough genuine overtaking or realistic wheel-following occurs in longer stages.

**Next narrowly scoped engineering gate:** 12/24/32-rider repeated-tick stress tests with sustained following, passing, merge contention and disjoint groups. Report halted-rider seconds, accepted/requested metres, collision-conflict iterations, lateral motion, repeat passing and energy. Reject a candidate that is only safe because collective slowing blocks normal maneuvers. Only then design the 106/168-rider stage adapter and compare three starting grids. Further independent blockers are synthetic/unverified road widths, missing stage climbing, sub-tick finish W-prime and historically credible breakaway/pack behavior.

**Decision: A1 technically passed. A2 still OPEN / NO-GO. B and C NOT STARTED. Do not activate this prototype.**
