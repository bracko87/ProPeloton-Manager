# Race Engine V3 — Milestone A2: conditional passing slots versus adversarial lane movements

**27 October 2026 — 1,280 OFFLINE MICRO TECHNICAL PASSES; SPORTING NO-GO. NO PRODUCTION PHYSICS OR DATABASE CHANGE.**

## Starting hypothesis

[A21 before/after time-slot research](MILESTONE_A_21_TIME_SLOTS_2026-10-27.md) identified a controllable trade-off. Waiting one 10-second tick before committing to a corridor permits a safe pass *after* an observed rival lane change (64/64 sustained passages), but suppresses some passes on an uncontested road (62/80 instead of 80/80). Starting immediately fixes the uncontested result but makes many opposing maneuvers occur during the same 10-second tick, where their within-tick order is not known.

This milestone implements a conditional start selected from **currently observed geometry**, then directly challenges it with delayed lane entries, actual lateral reversals and an additional competing rider. We do not assume clairvoyant knowledge of the fixture's future scripted actions.

## Isolated algorithm

- `scripts/v3/a2ConditionalCorridorV3.mjs` wraps the previously unchanged `a2TimedCorridorV3.mjs`. When the trailing rider initially has a free adjacent lane and **no other rider within two lane spacings and 60m ahead** (also screening 1.8m behind), it admits a fast first-tick corridor request.
- If a potentially conflicting rider is currently in that screen, the wrapper selects the established **one-tick observed / rival-first** policy. When the other rider signals a lateral move in a later tick, the underlying scheduler permits it and subsequently reselects a lane from observed occupancy.
- Selection uses *current geometry*, not the other rider's unseen future plans. This conservatism is deliberate but can misclassify a rider who does not actually plan to change lanes for several more ticks.
- The wrapper has exact JSON-serializable state and no authority to override any nonconsenting rider's intentions. Every actual physical move, collision resolution and energy update still goes through the unchanged offline `simultaneousConflictResearchV3.mjs` solver.

Implementation commits: [conditional adapter and micro gates](https://github.com/bracko87/ProPeloton-Manager/commit/0c4cd955b8c6de2555574e0995f859a225286e9a), [adversarial suite](https://github.com/bracko87/ProPeloton-Manager/commit/965f68603b749e9311c08f04c791b0a126db51b4), [all-scenario lateral observation correction](https://github.com/bracko87/ProPeloton-Manager/commit/e2bfe42e82b7a1d86bac9e163fba1ef2ab53ab31), and [reversal-tick variable correction](https://github.com/bracko87/ProPeloton-Manager/commit/4bb039a2fd7fae5f462dcc0b0ed183ea675062d0).

The added research code does not modify production engine selection, official race writes, game clocks, or historic classifications. Repository `main` remains the user-directed code destination, but **code present on main is not the same thing as activating a research algorithm in gameplay**.

## Full verified evidence

[Final GitHub Actions micro matrix — all five jobs SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40501116230). Per-size complete JSON outcomes retained for 30 days as `v3-a2-adversarial-2` through `v3-a2-adversarial-6`.

There are **1,280 isolated scenarios**, each 40 ten-second ticks, with:
- Fields of **2, 3, 4, 5 and 6 riders**;
- Four synthetic, **not source-verified**, road/rider-envelope profiles (4m, baseline 5m, 6.5m, cautious 5m);
- Initial headways **9m and 18m**, scripted requested rear distances **55m/75m per 10s**, and a 45m/10s leader;
- Four controlled policies: unchanged no-reservation baseline, cautious rival-first one-tick watch, eager first-tick start, and new conditional start;
- Open corridors (all sizes); from 3 riders, an early moving blocker, a **late entrant** (starts requesting lateral movement on tick 5), and a rival **reversing** its direction after first entering; from 4 riders, a **second nearby claimant** also attempting a lane change.

Counts: 2 riders × 16 parameter combinations × 4 policies = **64**; 3 riders × 16 × 4 scenarios × 4 policies = **256**; and each field size 4–6 × 16 × 5 scenarios × 4 policies = **320**, totaling **1,280**.

All runs passed independent continuous swept bicycle collision checks, finite/nonnegative rider W-prime, noninvented forward metres, checkpoint-exact physics / passing observer / policy state after JSON serialization at tick 20, and first-tick rider input-array permutation consistency. Micro pass events use a **strict longitudinal crossing held for at least 60 simulated seconds**, not an independently calibrated cycling overtake.

### Sporting outcomes

For each scenario, counts are a matched set of the original scripted parameters, not full-stage wins or classifications.

| Synthetic condition | Matched cases | No-reservation baseline | Cautious one-tick watch | New conditional | Eager first-tick |
|---|---:|---:|---:|---:|---:|
| Open corridor | 80 | **80** | 62 | **80** | **80** |
| Early moving blocker | 64 | 0 | **64** | **64** | **64** |
| **Late-starting blocker** | 64 | **64** | 42 | **42** | **64** |
| Opponent moves left then reverses | 64 | 33 | **64** | **64** | **64** |
| Additional competing lane claimant | 48 | 0 | **48** | **48** | **48** |

The conditional policy starts **fast in all 80 uncontested trials** and **with caution in all 64 early, all 64 late, all 64 reversing and all 48 two-claimant trials**. It solves the prior *open-road* penalty but does not meaningfully differ from the conservative rival-first policy whenever the same nearby cyclist is present, regardless of what that cyclist plans next.

### Congestion and fairness caveats

- **Early mover:** the conditional policy preserves the 64/64 sustained pass and the 64/64 opponent lane-change completion, with **zero near-halted unrelated-rider ticks**; the baseline has 445 near-halts and no passes.
- **Late mover:** the conditional policy completes only **42/64** sustained passes, versus **64/64** for both no reservation and eager start. Although the late opponent completes its move in every run, the conditional/watch-first choices accumulate **63 unrelated near-halted rider-ticks**, while the baseline/eager choices record zero. **This is a real regression.**
- **Reversal:** the additional instrumentation independently verified **actual sideways movement and an actual change back in direction in all 64 matched conditional trials**. The conditional policy makes 64/64 sustained passes but accumulates **124 unrelated and 140 requesting-rider near-halted ticks** in these 64 cases. The eager policy records zero of each under the same synthetic inputs. The opponent intentionally ends back on a different lane, so its lack of final lane-0 completion is **not an uncompleted outstanding demand**.
- **Second claimant:** the additional rider makes actual lateral movement in **all 48 conditional trials**, and the main blocker completes its lane change in all 48. Conditional passing succeeds 48/48 with no unrelated near-halts, but we **did not establish that the second claimant completed its entire intended maneuver**. This is a passing and physical safety measurement, not multi-rider fairness certification.
- **Temporal order:** a 10-second tick does not reveal the exact moment of two concurrent within-tick maneuvers. The eager early-blocker pass and the other rider's lane change can share a tick; the conditional risk-screen policy does not resolve the general **sub-tick ordering ambiguity**. Do not label all passing events as proven pass-before or pass-after solely from tick-end observations.

The new reverse counter originally only collected events under the old `moving_left` label. Expanding it exposed a simple misspelled current tick variable in the diagnostic; the final corrected CI run is the accepted source for these numbers. No collision/motion physics were changed during that correction.

## Decision

**Engineering micro PASS. Sporting realism still NO-GO.**

The conditional start is materially better than unconditional watching for open roads and remains robust to the specific early blocker, reversal and second claimant scripts. But a parked potential threat that does not begin moving until later still triggers an unnecessarily costly watch-first start. The policy also lacks intratick ordering, authentic geometry and any confidence interval on the adversarial input distribution. It is **not approved** for the canonical full-stage model, player gameplay, 106/168-rider race simulations or live operations.

### Next bounded A2 gate

Use a **current-intent-aware risk gate** that differentiates the present lateral *potential* of a nearby rider from an **active, communicated** lane change. It must:
1. Preserve immediate overtaking when the nearby rider does not signal entry, but react safely when a rival changes intent on tick 1, tick 5, or later.
2. Track sustained passing, other riders' complete maneuver and near-halted ticks, not just collision counts.
3. Classify same-tick crossings and lane changes as **temporally unresolved** unless the physically supported sub-tick crossing times can be calculated.
4. Stress multiple initial grids and more than one approaching rival before testing 12/24/32 riders.
5. Still require historical width/elevation sources, corrected fractional-tick finish energy, authentic pack/drafting dynamics and 106/168 full-stage stability prior to sporting clearance.

**A1 TECHNICAL COMPLETE. A2 SPORTING NO-GO. MILESTONES B/C NOT STARTED. OFFICIAL WRITES 0.**
