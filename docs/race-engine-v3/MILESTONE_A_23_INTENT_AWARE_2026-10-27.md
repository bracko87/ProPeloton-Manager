# Race Engine V3 — A2 intent-aware initial slot admission with delayed and reversing riders

**27 October 2026 — 1,920 MICRO ENGINEERING TESTS PASS. SPORTING NO-GO. NO LIVE RACE ENGINE OR RESULT WRITES.**

## Hypothesis and evidence boundary

The prior [A22 conditional-slot experiment](MILESTONE_A_22_CONDITIONAL_ADVERSARIAL_2026-10-27.md) successfully restored uncontested passing, but its admission screen required an observation tick whenever a third cyclist was merely nearby. A rider who stayed put until tick 6 then triggered needless early waiting, reducing sustained passing **64/64 → 42/64**, and creating 63 unrelated near-stopped rider-ticks.

The new isolated A2 experiment tests whether **currently communicated lateral intent**, instead of proximity alone, is enough to choose an immediate start while retaining a conservative watch when a rival is *already* asking to enter the corridor. This is **not** a predictive planner or production race algorithm.

## Implementation

- `scripts/v3/a2IntentAwareCorridorV3.mjs` is a new isolated research-only wrapper around the **unchanged** `a2TimedCorridorV3.mjs`. At its first tick, it picks the presently clear adjacent corridor and screens other cyclists between 1.8m behind and 60m ahead, within two lane spacings.
- Only a rival with a **current submitted target lane in the direction of the selected corridor** triggers a one-tick watch-first start. Nearby riders with no lateral request are logged but do not trigger early caution.
- Once started, the existing timed scheduler uses currently communicated intent and previously observed lateral velocity to react if a rival subsequently changes its request. The research wrapper neither commands another rider without consent nor accesses future script decisions.
- No new physical path solver is involved: all final accepted moves, cumulative mechanical effort and W-prime continue through the unchanged `simultaneousConflictResearchV3.mjs` with its continuous bicycle-sweep collision checker.
- The full test emits explicit **strict pass-before, strict pass-after and unresolved same-tick event** counts rather than equating tick-end order with actual sub-tick crossing order.

Code commits: [research wrapper and exact micro tests](https://github.com/bracko87/ProPeloton-Manager/commit/34d99f22974651e04de141ea1ad1b3a40ef83659); [adversarial comparison matrix](https://github.com/bracko87/ProPeloton-Manager/commit/b0e50dc632de5160177c6d2ffee35ba6797d4be5).

## Verified test matrix

[Five-job GitHub Actions A2 adversarial matrix — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40503079635). The unit micro and application-build tests also passed. Per-size JSON event histories and metrics are archived for 30 days as `v3-a2-adversarial-intent-2` through `v3-a2-adversarial-intent-6`.

The matrix comprises **five separate policies** (unmodified symmetric micro baseline, cautious rival-first, eager first-tick, previous geometry-only conditional, new intent-aware admission), across:
- Fields of **2, 3, 4, 5, and 6 riders**;
- Synthetic road/envelope profiles of 4m, 5m, 6.5m and cautious 5m (none are source-verified stage widths);
- 9m and 18m starting longitudinal headways and 55m/75m per-tick trailing requested travel against a 45m leading demand;
- Six scenarios: open lane, opponent entering **on tick 1** (current communicated intent), opponent entering **on tick 2**, opponent waiting until tick 6, another cyclist moving left then *physically reversing*, and two distinct cyclists attempting to claim adjacent space (last requires 4+ riders).

Counts: 2-rider field **80**, 3-rider field **400**, each 4/5/6-rider field **480**, for **1,920 total** × 40 simulated ticks (400s each). Each test uses no future-intent inputs, no rider-result updates and no official writes.

**All 1,920 micro runs technically PASS:** no swept bicycle overlap, finite/nonnegative W-prime, no invented distance, exact JSON serialized midpoint replay of the accepted motion, energy, all pass events, and policy state; input rider-array permutation checks; and 60-second sustained longitudinal passing classification. Existing original micro and full-stage technical regression scripts plus independent production application build passed inside CI. This is **not full-stage sporting acceptance**.

## Strict longitudinal passes retained for 60 seconds

| Fixture | Cases per policy | Baseline | Prior geometry-only conditional | **Intent-aware** | Eager first-tick |
|---|---:|---:|---:|---:|---:|
| Clear corridor | 80 | 80 | 80 | **80** | 80 |
| Rival actively signals on the first tick | 64 | 0 | 64 | **64** | 64 |
| Rival signals on the second tick | 64 | 0 | 64 | **64** | 64 |
| Rival signals on tick 6 | 64 | **64** | 42 | **64** | 64 |
| Rival moves left and then reverses | 64 | 33 | 64 | **64** | 64 |
| Two distinct riders contest the area | 48 | 0 | 48 | **48** | 48 |
| **Total matched cases** | **384** | **177** | **362** | **384** | **384** |

The new method restores **22 sustained passes** lost to excessive geometry-only caution under delayed entry. Its fast-start decision was selected in all 80 initially open, all 64 second-tick entry, all 64 late-entry, all 64 reversing and all 48 multiple-claim cases. Its cautious first-tick decision was selected in all **64 immediately communicated lane-change cases**.

### Safety, congestion and both-rider progress

- The immediate-entry cases preserve **64/64 completed opponent moves**, 64/64 sustained overtakes and **zero unrelated-rider near-stops**. Here the opponent's lane request is already visible on the first tick and the new watch policy is engaged.
- A rival that waits until tick 6 does not trigger an anticipatory penalty. All **64/64** still complete a sustained pass with no unrelated near-stop ticks, rather than the previous conditional policy's 42/64 and 63 stopped ticks.
- In all **64 reversal** cases, instrumentation proves the opponent *physically* moved laterally and later changed lateral direction. The new policy preserves 64/64 60s passes with zero unrelated near-stop ticks in this particular synthetic fixture. Reversal by definition does not require that cyclist to finish in lane 0.
- In the **48 two-claimant** cases, the secondary rider genuinely moved laterally. The 48 sustained passages, completed primary blocker moves and zero unrelated near-stop ticks are real observations. However, the *secondary claimant's entire desired maneuver completion is not yet independently established*.
- All opponents retain their intended forward and lateral requests; physical safety is verified by the unchanged continuous swept-path solver.

### Critical unresolved within-tick ordering

The passing observer sees only discrete tick-end positions. On the 64 **second-tick-entry** trials, the new policy records **32 strict passes before** the primary blocker's tick-end completion and **32 crossings in the very same ten-second tick**. The 64 reversal trials likewise have 32 strict-before and 32 same-tick crossings. All 48 two-claimant trials include 24 strict-before and 24 same-tick primary blocker crossings. **88 such event pairs are temporally unresolved** for the new method.

The 64 immediate-entry trials instead show strict later crossings, based on tick-end stamps. Temporal classification is a measurement of the synthetic observer, **not proof of exact within-tick physical order**. The same-tick cases cannot be claimed as verified pass-before or pass-after and are a core sporting NO-GO blocker.

## Decision and next gate

**MICRO ENGINEERING PASS; A2 SPORTING NO-GO.** This research demonstrates a useful distinction between inactive proximity and an actual communicated lane-change request. It removes a measurable false-positive delay in the controlled late-entry traffic, without relaxing collision safety, W-prime accounting or opponents' rights.

But the new policy mostly reproduces the eager-start strategy whenever no current lateral request exists. In those conditions it inherits **88 ambiguous same-tick ordering pairs**, and is not yet validated for shifts between initial lane grids, non-scripted multi-rider fairness, realistic physical widths/road curvature or full-stage classification.

**Next bounded A2 task:** introduce a mathematically controlled *sub-tick event timing diagnostic* for the existing continuous swept paths. Determine whether the relative bicycle envelopes cross at genuinely distinct times or whether two events overlap temporally; explicitly classify unresolvable order as ambiguous, never guess. Separately test physical completion by **both** conflicting claimant riders and vary initial lanes and longitudinal offsets. Keep all research isolated in the small micro suites until these gates pass.

Road-fidelity blockers remain authenticated stage widths/elevation (including missing Guangxi and World Nations ascent), fraction-of-tick finish energy, historically realistic peloton drafting/breakaway/chase dynamics and full 106/168-rider grid stability.

**A1 technically complete. A2 SPORTING NO-GO. B/C NOT STARTED. officialWrites=0.**
