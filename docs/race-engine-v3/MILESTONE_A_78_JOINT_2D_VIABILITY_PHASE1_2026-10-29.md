# Race Engine V3 - Step 78 Phase 1: joint 2D viability and pre-commit full-field physical choices

**Date:** 29 October 2026

**Decision:** offline Step78 first physical research gate PASS for a protected 32-rider five-abreast staged-road trial, **106/168 five-abreast large-field gate remains NO-GO**. No gameplay integration, official sporting release or live database modification.

## Scope and architecture

Step77 showed that speed requests and lane steering cannot be scheduled independently for a dense five-abreast peloton. Simply lengthening start rows or issuing broad advance brake warnings failed. Step78 therefore introduced two **opt-in offline-only** strategies. Neither edits the A64-A76 authoritative movement integrator, live race clock, Supabase tables, payout functions or official results:

- [A78 joint request screen](../../scripts/v3/a2Step78JointViabilityV3.mjs): inspect the *current* bicycle field, prescribed static narrowing profile, tentative speed requests and intended steering corridors. Evaluate possible near-future shared corridor occupancy at bounded +0.45m/s², -0.85m/s² and ±0.38m/s. Hold a conflicting lane request or communicate a bounded leader/follower pace request. It may warn but cannot authorize physical movement.
- [A78 pre-commit whole-field proposer](../../scripts/v3/a2Step78ProspectiveChoiceV3.mjs): generate a baseline current-tick candidate and a joint current-tick candidate, call the **unmodified full-field swept-body/road-edge/energy solver on separate isolated snapshots BEFORE accepting any movement**, and commit only one completely physically accepted 0.5s tick. Failed alternatives do not get committed, repaired, teleported or treated as accepted rider paths. Favor fewest physically observed near-stop ticks then greater achieved advancement; tie order is deterministic and does not depend on rider ID. This remains an initial local candidate policy, **not** a complete rolling-horizon solver.
- [Opt-in 2D research wrapper](../../scripts/v3/a2MultiGatePhysicalCandidateV3.mjs) adds `joint_viability_v1` and `joint_prospective_v1` policies, preserving Step77 baseline defaults and original sporting controller. Candidate selection counters and all accepted physics live inside the research snapshot for JSON replay.

Synthetic road geometry, rider speed/energy models and static booking data retain their prior limitations. These tests do not establish a full stage or validate geographically sourced roads.

## First joint-request-only results

[Step78 necessary 2D screen verification](../../scripts/v3/verify-a2-step78-joint-viability-v3.mjs) tests 16 configurations across 8, 32, 106 and 168 five-abreast starts, staged 3.3m→2.2m and double 2.2m profiles, plus variable/neutral 9m/s starts. Source inputs stay immutable; mirror, renamed-ID, malformed and static road-edge controls pass.

The isolated joint controller alone proved **insufficient**: the 32-rider double-strong original-speed scenario ran 180s with no swept contact but accumulated **6,588 near-stop rider ticks** and did not clear the second reopening; the 106/168 riders rejected contacts after **8.5s** at best. This candidate is explicitly **NOT sporting-approved**.

## Pre-commit physical comparisons and independent passing

[Step78 whole-field physical study](../../scripts/v3/verify-a2-step78-prospective-coupled-v3.mjs) tests 16 full-field configurations with the alternative proposal selector and records all rejected as true physical failures, not success. [Separate 32-rider sporting/replay verifier](../../scripts/v3/verify-a2-step78-32-sporting-replay-v3.mjs) independently certifies 3-second pair passing, full physical movement, mirrored/renamed trajectories, exact serialized 90+90s replay and safe energy.

**32-rider five-abreast staged road — Phase1 pilot PASS:**
- 180 accepted seconds, **all riders beyond x1470m**; rearmost x = **2055.248234m**.
- **Zero swept collisions**, zero road-envelope violations, **zero near-stop rider ticks**.
- **356 completed lane changes** and **87 independently confirmed sustained 3-second rider-pair overtakes**.
- **347 baseline** and **13 joint** physically accepted half-second candidate selections; no rejected proposals in this successful path.
- Exact **90+90s JSON checkpoint** replay for the physical field and independent overtake observer, mirrored-road physical movement parity and renamed-rider equality.

**32-rider five-abreast double 2.2m narrowing — NOT sporting approved:** 180s accepted, all riders beyond x1470m, no detected collision or roadside exit, but **21 near-stop ticks** (variable start) or **7 near-stop ticks** (uniform 9m/s start), and **832/935** lane changes, respectively. Excessive weaving and slowdowns require correction.

**106/168 five-abreast — NOT physically viable yet:** no tested staged or double-strong configuration completed the 180s. Best 106 and 168 attempts with neutral 9m/s double-strong rows reached **8.5s**, then the authoritative sweep rejected pair `r052/r058`. Staged tests failed around 4-5s. They are real rejected ticks, not counted as accepted collisions. No large-field physical sporting success is claimed.

## Protected existing baselines

The final Step78 CI also passed the original A76 **32/106/168 three-abreast** double-2.2m 180s runs with independent sustained 3-second passes **58/151/198**, zero collisions/road exits/near-stops, and exact physics+observer 90+90s replay. The original A77 **32-rider five-abreast** staged 180s result with **87 independent 3-second passes**, zero near-stops and mirror/rename/checkpoint parity also passed unchanged. React production build passed.

**Verification:** [GitHub Actions Step78 full physical audit, regression and build](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40841125655) — completed successfully. The green CI certifies correct technical behavior and explicit failures; it **does not** certify large-five-abreast sporting completeness.

## Next: Step78 Phase 2 — directly coupled local multi-rider spatial negotiation

The experiments show that selecting from just two fixed entire-field proposals does not solve a dense 106/168 rider merge. The next solver candidate must anticipate both longitudinal closure and lateral corridor disappearance **before** a rider reaches a braking-unreachable state. It should negotiate locally linked groups of 3–8 adjacent bicycles, reserve a concrete crossing interval and gap under bounded steering/braking, and propagate a front-rider acceleration/slowdown constraint to directly affected riders. A fail-closed plan should identify which current-state constraints are mutually impossible; it may not simply stop the whole group, clip road width, teleport a rider, or weaken the authoritative physical sweep.

**Explicit acceptance gate:** 32→106→168 five-abreast on *both* staged and double-strong, 180 seconds, every rider past second reopening, zero collision/roadside/near-stop ticks, meaningful independently sustained 3-second overtakes, exact complete JSON physics and observer replay, geometric reflection and rider-ID parity. After synthetic full-field success, extend to verified real road geometry, long stages, drafting/power/fatigue, attacks/group gaps and full classifications.

**Overall Milestone A full sporting realism = NO-GO. Milestone B gameplay integration = NOT STARTED. Milestone C production = NOT STARTED. Live Supabase, races, payouts and game clock = UNCHANGED.**
