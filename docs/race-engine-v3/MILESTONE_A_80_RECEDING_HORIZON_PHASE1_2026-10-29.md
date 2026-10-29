# Race Engine V3 — Step 80: physically checked receding-horizon admission

**Date:** 29 October 2026  
**Decision:** Step80 **technical proof / audit PASS**, but **full five-abreast 32/106/168 sporting gate NO-GO**. Live integration is explicitly not authorized.

## What this step implements

After Step79's one-tick distributed planner rejected the first five-abreast collisions early, Step80 adds a **bounded 2- or 3-tick current-time receding-horizon controller**. The [planner](../../scripts/v3/a2Step80RecedingHorizonV3.mjs) uses the current accepted bicycle x/y/speed, currently reserved multi-gate slots and current requested pace/steering. It evaluates up to five distinct synchronized first-tick requests. For each physically accepted first action, it generates up to three possible next moves *from the hypothetical achieved physical state*, then runs each proposed future action through the **unchanged original all-rider swept bicycle and road-edge/energy solver**. For a three-tick horizon it repeats this screening up to the third half-second.

Rejected candidate movements are always discarded. A future trajectory is a **temporary prediction**, not accepted production race history. Even the first action chosen by the planner is **reapplied and independently swept through the original authoritative solver** before accepting its first 0.5s of real motion. The simulation then recalculates all future decisions from the actual accepted current state. There is no hindsight reordering, teleporting, road widening, collision forgiveness, post-hoc position repair, rider-ID exemption or stronger braking/steering than the original physical integrator permits.

The original solver retains +0.45m/s² maximum acceleration, −0.85m/s² maximum braking, 0.38m/s lateral steering speed, bicycle half-width 0.3m, full road-envelope checks, W-prime accounting and all-pair swept collision checks.

Two **opt-in research-only** modes are added to [the offline pilot wrapper](../../scripts/v3/a2MultiGatePhysicalCandidateV3.mjs):
- `horizon2_guarded_v1`: preview 2 accepted physical half-second ticks.
- `horizon3_guarded_v1`: preview 3 accepted physical half-second ticks.

Five possible first physical proposals are evaluated (baseline, previous coupled joint, distributed cruising, distributed lateral hold, and geometric zipper). Follow-up requests are recalculated from the hypothetical physical state with current static reservation data; the planner favors a larger count of physically possible future ticks with no near-stop ticks, then better physical stopping-room clearance, and finally achieved distance. Fixed computational budgets keep this a testable research policy, **not a proven general optimum**. Mirrored games use canonical planning coordinates but must re-sweep their actual reflection geometry independently before accepting the real first movement.

## 16-case original swept physical pilot

[Strict initial physical test matrix](../../scripts/v3/verify-a2-step80-horizon-physical-v3.mjs) validates unit-level imminent collision rejection, source checkpoint immutability, fail-closed handling, true 8/32/106/168 five-abreast bicycle motion and two different double-gate profiles.

| Field | Profile / mode | Actual accepted duration | Safety / conclusion |
| --- | --- | ---: | --- |
| 8 riders | Staged and double, 2- and 3-tick | **180s** all four experiments | Zero near-stops, full 2-gate crossing |
| 32 riders | Staged, 3-tick | **30s** in short pilot | Zero near-stops; not a completed race |
| 32 riders | Double, 2-tick | **30s** in short pilot | Zero near-stops; not a completed race |
| 106 riders | Double, 2-tick | **12.5s** | Contact rejected, no near-stops before rejection |
| 168 riders | Double, 3-tick | **20s** | Contact rejected, **zero near-stops** before rejection |
| 168 riders | Double, 2-tick | **22.5s** | Contact rejected, **170 near-stop rider ticks**—unrealistic and not a sporting improvement |

For context, Step79 risk-aware 168-rider neutral-start double reached **15.5s**, zero near-stops, before its first rejected swept collision. Thus the 3-tick Step80 candidate genuinely postpones contact by 4.5 accepted seconds **without** that slowdown—but it still does **not** make large peloton merging viable. **Zero completed 106/168 five-abreast 180-second simulations**.

Every rejected tick leaves the original accepted physical field unchanged, preserving exact achieved time, x/y/speed/energy. An audit PASS does **not** mean those races passed.

## Longer actual physics and determinism audit

A separate [full 32-rider continuation, fairness and replay verifier](../../scripts/v3/verify-a2-step80-mirror-replay-and-180-v3.mjs) ran **16 short mirrored and rider-renamed field pairs** across 8/32/106/168 riders, both gate layouts and both Step80 horizon policies. It compares accepted times, first rejected-contact reasons, selected first-action policy counts, every rider's actual x/y/v and energy. **All 16 passed mirrored-road and renamed identity parity**.

The same verifier independently coupled accepted 8-rider motion to the *separate physical overtaking observer* and compared serialized 90+90s physics+observer checkpoints against a full 180-second run:

- **8 riders, staged:** 180s actual full road passage, **zero near-stop ticks**, **8 independently confirmed sustained three-second overtakes**, 79 physical lane changes, rear x=2158.128619m; full 90+90 JSON replay exact.
- **8 riders, double strong:** 180s actual full passage, **zero near-stop ticks**, **2 independently confirmed sustained three-second overtakes**, 151 physical lane changes, rear x=2175.48088m; full 90+90 JSON replay exact.

The extended **32-rider full 180-second attempts both failed the actual swept solver**, despite their earlier 30-second success:

| 32-rider configuration | Strict accepted physical time | First rejected reason | Near-stops before rejection |
| --- | ---: | --- | ---: |
| Staged 3.3→2.2m, 3-tick | **73.5s** | Swept contact r017 / r025, rearmost x=1138.521153m | **0** |
| Double 2.2m, 2-tick | **37s** | Swept contact r028 / r029, rearmost x=755.983554m | **1** |

The new Step80 controller is therefore **not a replacement** for the original Step78 32-rider staged model, which has already passed the actual full **180s / 87 independently sustained three-second overtakes / zero near-stops / exact 90+90 replay**.

## Protected older pilots and build

The final [Step80 GitHub Actions validation run](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40847220577) passed both independent test jobs: Step80 initial and extended pilot, earlier **A78 32r five-abreast staged 180s / 87 sustained three-second passes / exact replay**, A77 protected 32r 87-pass experiment, original A76 **32/106/168 three-abreast 180s** with independent **58/151/198** sustained 3-second passing events, plus the React production build. None of the regression assertions were relaxed.

The full Step80 source and CI are **offline/synthetic only**. GitHub `main` changes might be seen by Netlify as repository updates, but the actual active race engine, official stages, Supabase tables, historic races, payouts and game clock were not modified. Netlify deployment/live-functionality verification is a separate matter and has not been claimed here.

## Next gate — Step81: multi-second coupled zipper and headway reservation

Step80 demonstrates that 2–3 physically checked steps improve *short-term* collision detection and can support longer valid movement, but a fixed **1–1.5 second horizon cannot anticipate a multi-row queue compression tens of metres ahead**. The same failure can reappear later even after 73.5s, and naive speed favoring produces near-stop shock waves.

Step81 must propose physically reachable **multi-second spatial zipper reservations** spanning many linked groups and both gate profiles, including verified initial full five-abreast cyclist geometry, exact stopping-distance constraints and explicit longitudinal gap opening **before** adjacent cyclists merge laterally. Plan with static road profile and current-state rider dynamics, recheck every future hypothetical state using original physical sweeps, and commit only the next legal half-second. A candidate must fail closed if demands conflict, not stop a hundred cyclists for artificial clearance. Require **32, 106 and 168 five-abreast**, both two-gate profiles, **180s**, all beyond x1470m, no near-stops/contact/road exits, independently sustained three-second overtakes, full mirror/ID parity and exact 90+90 physics+observer replay; then extend to actual long-stage road grades, corners, aerodynamic drafting, fatigue, attacks and classification.

**Full Milestone A sporting realism NO-GO. Milestones B gameplay integration and C production authorization NOT STARTED.**
