# Race Engine V3 — A34 synchronized physical substeps and W-prime accounting

**27 October 2026 — engineering micro technical PASS; A2 sporting and nonlinear calibration still NO-GO.**

## Scope and goal

The [A33 observed-track audit](MILESTONE_A_33_NONLINEAR_WITHIN_TICK_2026-10-27.md) established that a start-to-end straight chord may miss collisions if a hypothetical rider steers nonlinearly inside a tick. It did **not** generate such intermediate positions or calculate energy over the corresponding physical intervals. Step A34 answers this limited engineering question: *Can an isolated, deterministic movement adapter generate physically accepted intermediate rider paths while debiting power and W-prime on the same intervals?*

This is a research instrument, **not** an integration into the official race engine. All geometry and acceleration, braking, steering speed, mass/drag and demand assumptions remain provisional.

## Implemented offline adapter

Introduced `scripts/v3/a2SubstepPhysicalResearchV3.mjs` and `scripts/v3/verify-a2-substep-physical-v3.mjs` with [dedicated GitHub Actions validation](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40543976570).

The adapter freezes only the rider's **current** submitted target speed, target lateral coordinate and steering energy surcharge for one 10-second tick. Four synchronized steps of **2.5 seconds** then proceed as follows:

1. Build each rider's permitted new speed from the **last achieved speed** and provisional acceleration/braking caps (0.45m/s² forward, 0.85m/s² braking), and its lateral displacement using a provisional 0.38m/s steering-rate cap.
2. Use the existing isolated `roadWattsRequiredV3` road model and `boundRequestedSpeedByEnergyV3` to limit that 2.5s demand by the rider's **currently available W-prime**.
3. Simultaneously check all pairs' **entire proposed straight movement over the current 2.5s subinterval** through the existing swept geometric collision predicate. For conflicting riders, halve the forward **and** lateral steps symmetrically and repeat. Never silently change the requested target of a nonconsenting rival. An unresolved collision rejects the research step; no unsafe motion is accepted.
4. Record **actual achieved** x/y positions, debit W-prime and the mechanical/metabolic energy ledger by calling `commitAchievedSpeedEnergyV3` with the **actual accepted speed over the same 2.5 seconds** and whether steering actually occurred. A finite, nonnegative energy step is mandatory.
5. Export time-stamped knots at normalized times 0, 0.25, 0.5, 0.75 and 1. Independently recheck each accepted pair using A33's piecewise-observed evaluator, and record the state, metrics and tracks for exact JSON checkpoint replay.

The algorithm is synchronous and rider-order independent, uses current rather than future observed state, and does not emit a race classification or result. The research checkpoint enforces `officialWrites=0` and `sportingApproval='NOT_APPROVED'`.

## Actual GitHub validation

The [A34 CI workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40543976570) ran with Node 22 and the **repository's existing research energy and road-power implementations**. The test matrix contains:

- **4 synthetic road envelopes** (not measured road widths).
- **5 field sizes:** 2, 8, 12, 24, and 32 riders.
- **3 generated speed/steering/grade variations** per geometry and size.
- **6 complete 10s research ticks** per scenario, each with 4 synchronized 2.5s substeps.

| Metric | Result |
|---|---:|
| Independently completed test scenarios | **60/60** |
| Rider-substep movements | **22,464** |
| Accepted movement rider-pair audits | **62,424** |
| Interior knots measurably different from the tick endpoint chord | **13,647** |
| Collision detections in **unaccepted candidate proposal iterations** | **16,421** |
| Rider-substeps attenuated to obtain swept-safe paths | **10,168** |
| Accepted final piecewise path overlaps | **0** |
| Negative or nonfinite W-prime balance | **0** |
| Divergence between integrated mechanical joules and rider energy ledgers | **0** (test tolerance 1e-5 J) |
| Serialized three-tick midpoint recovery | **exact** |
| Input-rider permutation sensitivity | **none in tested runs** |
| Forced change to submitted opponent instructions | **none** |
| Forbidden official race writes | **0** |

All existing A33 adversarial nonlinear/linear equivalence tests, A32 bounded passing-slot micro tests, frozen-proposal physical regressions, Batch 42 two-dimensional collision test and Batch 43 full-stage completion **technical** test passed unchanged. The application production build and internationalization checks passed. In-run status was read from the actual GitHub job logs, rather than inferred from a workflow's green status.

## What has *not* been proved

**A34 validates a small synthetic integrator's internal consistency; it does not show realistic professional cycling.** The **10,168** attenuated rider-substeps constitute a material congestion/behavior warning. More than one proposal may be rejected in a single substep; the 16,421 collision detections are *attempts*, not rider crashes and not accepted overlapping paths. The model uses provisional acceleration, steering rate, rider aerodynamic inputs and a fixed 2.5-second sampling grid; none was independently calibrated.

The accepted substep trajectory is treated as piecewise linear **inside each 2.5s interval**. The tests do not certify an arbitrarily curved path between unobserved intermediate positions, actual historical 106/168-rider sporting outcomes, breakaway and drafting mechanics, verified road widths, source-complete elevation, or time-step convergence. A 2.5s run cannot be assumed equivalent to 2s or 5s merely because all three may pass technical collision checks. Nothing was deployed to the gameplay solver, player results, UI, Supabase or clock.

## Decision and next gate

**A34 offline engineering prototype PASS. A2 sporting realism, nonlinear calibration and complete-stage approval remain NO-GO. Milestones B and C remain NOT STARTED.**

Next gate: compare the same *current* commands under 2s, 2.5s and 5s substeps with exact physical clearance, energy and checkpoint records, report ranking/gap differences and congestion rather than normalizing away divergent results. Do not promote the prototype into the official race engine until independent road/terrain provenance, true large-peloton and stage sporting invariance, groups and breakaways, end-of-stage energy, tactics and owner-controlled release gates are fulfilled.
