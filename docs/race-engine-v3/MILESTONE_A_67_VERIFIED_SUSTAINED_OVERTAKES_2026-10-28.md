# Race Engine V3 — Step 67: sustained physical overtakes and 106/168-rider interactive corridors

**28 October 2026. Engineering research PASS; complete-stage sporting and production readiness NO-GO.**

## Why Step 67 is materially different

Step 66 restored **22 completed lane changes** over 90 seconds for a provisional 32-rider field and supported three nonclairvoyant 240-second, 32-rider synthetic starts. The first **106/168-rider** fully occupied five-lane, 30-second dynamic grids finished with **zero completed lateral lane changes**. Initial-to-final rider-pair rank reversals were being treated only as an *ordering proxy*, not independently confirmed passing.

Step 67 introduces a **read-only, independent observer**:
- [`a2SustainedOvertakeObserverV3.mjs`](../../scripts/v3/a2SustainedOvertakeObserverV3.mjs)
- [`verify-a2-step67-sustained-overtakes-v3.mjs`](../../scripts/v3/verify-a2-step67-sustained-overtakes-v3.mjs)
- [GitHub A59–A67 CI and evidence artifacts](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-a2-step59-symmetry-and-field.yml)

**Every reported confirmed pass** is a particular rider pair whose relative signed longitudinal order **actually reverses during accepted physical steps**, at whose crossing the measured lateral distance is **at least 0.8001m**, and whose originally trailing rider later establishes a **2.05m lead and maintains it for 3 continuous seconds**. Crossing time is solved from the constant-acceleration relative longitudinal trajectory, constrained to the exact accepted x endpoints; lateral crossing separation is interpolated from accepted y endpoints. The holding clock checks the **within-step minimum longitudinal gap** throughout each 0.5s accepted physical interval, not merely its two endpoints. The independent existing collision checker rejects any continuous swept overlap before motion is committed. A passing count refers to **rider-pairs**, not distinct racers or separate racing maneuvers.

The observer runs **after** every already-accepted 2D step, cannot change accelerations, lane targets, swept contact acceptance, rider rankings or W-prime. Future A44 accepted trajectories and hindsight-selected collision events are not consulted. Initially tied grid-row pairs are not counted as a rear/lead pair until a future study provides an unambiguous unbiased starting ordering; this makes the test conservative.

The test separately proves that a synthetic, same-lane crossing is rejected by the observer, even if its ending order is reversed; it does not imply the physical solver would accept such an overlap. Rider-ID changes, road reflection, and exact JSON checkpoint recovery preserve the corresponding physical and observer outcomes.

## Measured results — all start at t=0, dynamic requested speeds

| Rider field | Initial formation | Test horizon | Accepted time | Completed lateral lane changes | Initial-to-final longitudinal order reversals | Independently confirmed 3s sustained physical rider-pair passes | Swept collision/near-stops |
|---|---|---:|---:|---:|---:|---:|---|
| 32 | 3 occupied columns, outer corridors available | 90s | **90s** | **22** | 122 | **108** | None |
| 32 | All 5 columns occupied, mixed | 90s | **90s** | 0 | 74 | **67** | None |
| 32 | All 5 columns occupied, aggressive | 90s | **90s** | **25** | 135 | **131** | None |
| 106 | All 5 columns occupied, mixed | 30s | **30s** | **0** | 106 | **55** | None |
| 106 | Outer corridors available, mixed | 30s | **30s** | **47** | 159 | **126** | None |
| 106 | Outer corridors available, mixed | 60s | **60s** | **51** | 406 | **363** | None |
| 168 | All 5 columns occupied, mixed | 30s | **30s** | **0** | 165 | **81** | None |
| 168 | Outer corridors available, mixed | 30s | **30s** | **74** | 255 | **201** | None |
| 168 | Outer corridors available, mixed | 60s | **60s** | **78** | 660 | **591** | None |

The all-five-column 106/168 fields still have **zero lane changes**, but they can have genuine signed longitudinal passes when riders already in *different* lanes travel alongside one another without colliding. This explains why ordinal inversion and lateral lane completion are distinct metrics.

The 106/168 open-corridor experiments use the **same `coordinated_demand` 3.2m headway policy and synthetic speed demands** as the occupied grid; only the initial lateral grid allocates three columns rather than five, allowing free outside corridors. The 30-second comparison therefore indicates **road-space availability** is an important immediate admission constraint, not an intrinsic inability of the coupled solver to move large fields sideways. This is a diagnostic synthetic experiment, *not* proof of real road width or whole-race peloton spacing.

## Acceptance checks and falsifiability

- All **nine** study runs complete the intended accepted physical horizon with **zero** swept collisions and near-stop rider-ticks in this selected synthetic cohort.
- 106/168 open-corridor 30s physical runs must contain **nonzero completed lateral lane movements and independently confirmed sustained passes**, and must have more sustained passes than the corresponding same-size occupied-grid control.
- Both 106- and 168-rider open-corridor **60-second** physical runs must complete entirely, with **zero near-stops**, nonzero completed lane movements and nonzero independently confirmed passes. These conditions are now explicit, enforced test assertions, not merely observed counts.
- For 32 riders, the Step 66 open-corridor **22 completed lane changes** are preserved, and the overtaking observer must identify nonzero sustained passes.
- An adversarial acceleration-bound detector test ensures that two sampled gaps of 2.08m do **not** certify a persistent pass when the accepted within-step minimum drops to 2.039375m, below the 2.05m requirement; the holding timer is reset. A same-lane signed crossing is separately rejected.
- A **45+45-second** exact serialized checkpoint/replay of the 32-rider corridor preserves the *entire observer state* as well as physical positions, energy and counters. For each completed 106/168-rider 60s corridor run, **30+30-second** checkpointing and exact JSON physical+observer resumption likewise matches.
- Mirror and bijective ID-relabel outcomes agree, including the independent passing counts, on the **32-rider 90s** and the **106/168-rider 30s** corridor scenes.
- Existing A63 **67/67** retrospective short-field collision-free gate, A64 normal-start test, A65 dense safety, A66 240-second passing, historical A58–A39 and complete-stage technical regressions, localization and React build remain in the validation workflow.

**No data was altered in Supabase and no production race, rider, payout or classification was changed.** All work is isolated offline V3 research checked into GitHub `main`.

## Sporting and architectural blockers

**Milestone A sporting NO-GO.** The accepted trajectories still assume a constant, provisional **five-lane road with 1.1m lane-centre spacing**, synthetic start gaps, rider capacities and desired speeds. Real event road-width profiles and elevation are not integrated. The overtake detector's 0.8001m lateral margin and 2.05m lead-plus-3s test are **provisional engineering definitions**, not official UCI sporting definitions or source-calibrated professional racing metrics.

The results do not yet cover complete 106/168-rider stages lasting hours, rider power attacks, meaningful W-prime depletion, fatigue, aerodynamic drafting, real breakaways and catch dynamics, road narrowing/expansion, actual team tactics, crashes, race weather, official finish classifications and full deterministic multi-hour race recovery. A rider-pair "pass" in a static lateral lane is genuine longitudinal progress but does not, by itself, demonstrate competitive bunch dynamics.

**Next Step 68:** Test **realistic varying road width and sequential physical lane occupancy** (including narrowing and re-expansion), diverse/tight starting grids, sustained 106/168-rider flow beyond 60 seconds, truthful persistent passing and group gaps with energy/drafting pressure. Preserve collision/identity/energy/serialization gates. Expand toward sourced full-stage Dordrecht and Guangxi field simulations without promoting V3 into the selected game engine. Milestones B/C remain not started.
