# Race Engine V3 — A2 Step 31: observed safe-lane escape from two-claimant traffic

**27 October 2026 — 5,280 / 5,280 matched micro technical PASS; sporting still NO-GO.**

## Purpose and independent root-cause test

[A30 research](MILESTONE_A_30_CLAIM_CONTINUITY_2026-10-27.md) achieved 1,646/1,760 sustained overtakes but failed all 48 rival-lane-3 two-claimant 60s cases, even though all 48 held an overtake for 30s. Step 31 asked whether these failures were merely test-window censoring or genuinely reversed traffic.

A separate [600-second diagnostic workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40538092731) replayed all 48 exact rival-3 configurations (4–6 riders, four synthetic road envelopes, two initial headways and two follower forward demands) with the baseline, A30 three-tick memory and the new research policy. **The original passing rider crosses the leader at 20 simulated seconds and is repassed at 60 seconds**. The pass lasts **40 seconds**, is not censored at the 400s research limit, and remains unsuccessful at 600s with A30/baseline. The collision-free primary rival enters and stays in outer lane 0 just ahead, and the symmetric swept solver then progressively attenuates both its movement and the passing rider's movement to maintain clearance. Meanwhile the lead rider continues in a separate lane. Example: the passing rider demands 55m in tick 6 but physically achieves only **6.375m**. The inspected rider has **23,000J W-prime remaining**; exhaustion is not the cause of the reversal in that example.

This validates an actual traffic-admission problem, not a missing statistical threshold.

## Research-only policy and conservative revisions

Added `scripts/v3/a2ObservedEscapeV3.mjs` and `scripts/v3/verify-a2-observed-escape-v3.mjs`. The alternative wraps the unchanged three-tick A30 observed-signal policy. It:
- Uses **only present positions and currently communicated lane-change requests**, never fixture labels or future intents.
- Allows the passing cyclist, already in the outer lane, to move to the adjacent lane only after observing a **close cascade of two competing riders currently moving left**. The nearest must be within a provisional **32m** longitudinal window; both are screened within 65m. These parameters are synthetic, not empirically sourced.
- Independently checks the proposed **complete swept path** against every currently submitted opponent path before requesting the adjacent-lane exit. If unsafe, it keeps the existing policy's movement; it never forces the maneuver.
- Keeps the adjacent lane while the observed rival remains ahead or within 12m behind, then releases the extra condition. All opponents retain their submitted lateral and forward commands; only the passing cyclist's voluntary request may change.
- Leaves the unchanged swept-path collision / energy solver as the final authority. State and checkpoints remain deterministic/serializable.

The initial broad version restored **48/48** adversarial overtakes, but introduced **48 near-stopped unrelated-rider ticks** in other previously safe fixture groups. It was therefore **rejected**, despite no new overtaking failures. A first over-narrowed test lost the targeted benefit entirely. The final observed-close-cascade rule intentionally trades universal rescue for strict nonregression. Intermediate variants must not be activated.

## Full matched sporting screen — authoritative A31 result

[Final full-grid GitHub Actions, five jobs all SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40538093213). Three policies × the same 1,760 2–6-rider road/headway/lane/traffic fixtures = **5,280/5,280 technical cases**, with all mid-test checkpoint replays, swept path clearances, finite/nonnegative energy and nonconsenting instructions preserved. The existing micro collision, stage technical regressions and the independent app build also pass. These are **not historical 106/168-rider sporting validation runs**.

| Measure over 1,760 matched fixtures | Original baseline | A30 3-tick memory | **A31 observed safe escape** |
|---|---:|---:|---:|
| Technical cases passed | 1,760 | 1,760 | **1,760** |
| Sustained 60-second overtakes | 1,502 | 1,646 | **1,679** |
| Sustained 30-second overtakes | 1,550 | 1,694 | **1,694** |
| Passing-rider near-stop ticks | 1,102 | 298 | **199** |
| Unrelated rider near-stop ticks | 974 | 706 | **607** |
| Primary competing riders at requested final lane | 1,232 | 1,232 | **1,232** |
| Secondary competing riders at requested final lane | 336 | 336 | **336** |

Matched per-fixture comparisons also verified **0 losses** of A30 or baseline 60s overtakes; **0 extra unrelated near-stop ticks** versus A30 across individual fixtures; **0 lost claimant final-lane completions**, and **0 overridden nonconsenting rival instructions**. These strict nonregression checks are separate from aggregate totals; a useful pass gain does not excuse a hidden regression.

## Hardest 48 rider-starting-lane conflicts

| Outcome | Baseline | A30 3-tick | A31 observed escape |
|---|---:|---:|---:|
| 60s overtakes at 400s | 0/48 | 0/48 | **33/48** |
| 60s overtakes at extended 600s | 0/48 | 0/48 | **33/48** |
| Unrelated near-stop rider-ticks (400s) | 144 | 144 | **45** |
| Passing-rider near-stop ticks (400s) | 144 | 144 | **45** |
| All primary / secondary lateral completions | yes | yes | **yes** |

The remaining **15/48** failures still produce an early crossing at 20s and a reversal at 60s. These had no approved swept-clear adjacent escape. Their absence from the sustained-pass count is not fixture censoring. The research candidate refuses unsafe paths rather than commanding a competing cyclist to yield.

## Acceptance decision

**A31 finite comparison and documented diagnosis complete. A1 technical foundation complete; A2 sporting realism remains NO-GO. Milestones B and C NOT STARTED.**

The final policy is the best **micro research candidate on this matched test set**, not a selected official racing model. Synthetic road widths, unverified nonlinear intratick behavior, final-energy fidelity, large-peloton drafting and authentic breakaway/group finishing dynamics remain unresolved. No evidence supports production activation or a full-stage sporting acceptance claim.

**Next bounded gate (A32):** independently diagnose the 15 swept-unsafe exits by headway/demand/width, then test a truly collision-safe, non-coercive alternative time slot or bounded follower forward adjustment. Validate no lost passes, no increased near-stop ticks, both rivals' final lanes, complete physical swept paths, finite W-prime, exact deterministic recovery and all 1,760 starting grids before any expansion. Never loosen a technical gate to improve sporting counters.

Changes made are limited to `scripts/v3/`, dedicated research CI and `docs/race-engine-v3/`. **No canonical solver, live race selection, results, player UI, Supabase or game clock changes.**
