# Race Engine V3 — A2 road-width, closing-speed and dynamic-corridor stress

**27 October 2026 — TECHNICAL MICRO PASS; DYNAMIC-OBSTRUCTION SPORTING FAIL / NO-GO.**

## Controlled scope and engineering isolation

After [A2's early/collaborative corridor study](MILESTONE_A_17_EARLY_CORRIDORS_2026-10-27.md), the next question was whether an early lane request remains safe *and effective* under changing width, rider headway, closing demand, and another cyclist steering into the apparently free corridor.

The offline suite [`audit-a2-width-dynamic-corridors-v3.mjs`](../../scripts/v3/audit-a2-width-dynamic-corridors-v3.mjs) exercises **unchanged** `simultaneousConflictResearchV3.mjs`, `a2EarlyCorridorV3.mjs`, the original continuous swept-bicycle collision check, finite W-prime/energy ledger and persistent 60-second longitudinal pass observer. The test runner, GitHub workflow and fixture positions were the only added/changed files. **No official race solver, model selection, rider data, game clock, Supabase table, live worker or result writer was modified.**

[Final validation workflow — SUCCESS, five matrix jobs](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40487877503); [legacy engine isolation — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40487877649). Five independent artifacts `v3-a2-width-dynamic-corridors-{2,3,4,5,6}` hold exact JSON metrics for 30 days.

The experiment spans:
- All **five field sizes: 2, 3, 4, 5, 6 riders**.
- Four **synthetic, not source-measured** envelopes: `compact_4m` (4m road / 0.85m lane centers), `baseline_5m` (5m / 1m), `wide_6_5m` (6.5m / 1.2m), `cautious_5m` (5m / 1m, wider rider envelope).
- **Two initial headways** (9m and 18m) and **two scripted trailing forward requests** (55m or 75m per 10s, versus leader request of 45m), always subjected to actual finite power/acceleration limits.
- Three open-corridor policies: `early`, `late` (wait for a gap of at most 5m), `coordinated` (leading rider requests a sideways yield).
- For fields of 3–6 riders, an **initially occupied right corridor** with `forced_right` vs `adaptive` chosen open lane; and a **moving-left blocker** with `early`, `late`, `adaptive` policies. The moving blocker starts in lane 2, then requests lane 1 and lane 0 in successive ticks. The candidate chooser only sees rider positions *already observed at the beginning of a tick*; it is not clairvoyant.

Each scenario runs **40 ten-second ticks (400 synthetic seconds)**. There are **48 scenarios for 2 riders plus 128 for each 3–6-rider field, for 560 total**.

## Micro technical acceptance

**All 560 final scenarios passed the engineering checks:**
1. **No pair of swept bicycle paths collides in any tick** under the chosen provisional longitudinal/lateral envelopes.
2. No rider gains invented forward distance or spends negative/nonfinite W-prime.
3. Full original simulation state and persistent pass-event history exactly reproduce after a **serialized tick-20 checkpoint**.
4. Reversing the array order of all riders leaves the first step's per-rider physical outcome exactly unchanged.
5. `officialWrites=0` and `sportingApproval='NOT_APPROVED'` at every step. The independent production app build and prior 2D micro/full-stage regression tests completed in CI.

The first run (at [`a4d072a5`](https://github.com/bracko87/ProPeloton-Manager/commit/a4d072a552b0250ee70786b4e794aafe1b7aebd4)) exposed a precision-sensitive outermost **6.5m-road lane-center coordinate**: rounded `3.6` exceeded the internally represented `3×1.2` bound by a floating-point epsilon. The fixture was shifted inward by just **0.000001m** in [`4da61596`](https://github.com/bracko87/ProPeloton-Manager/commit/4da61596ce47562a7f737b0a0ec9df8c1e609d28), with *no collision physics change*. The corrected static/mild-moving matrix passed, but subsequent diagnostic review found the first moving blocker crossed into the corridor **behind** the fast rider. This was an inadequate challenge.

The fixture was then strengthened in [`24547a45`](https://github.com/bracko87/ProPeloton-Manager/commit/24547a4558c2ff086bc45ef238a19f7844c6de67): the moving blocker starts at 150m instead of 110m, so its lane change can interact with the trailing rider while the latter is approaching. **Actual** blocker lateral movement, entry into the originally open lane and minimum longitudinal gap are measured. The table and acceptance decision below use **only this final verified matrix**, not the easier earlier result.

## Sporting measurements — final physically interacting blocker

For each row, a "success" is a strict `rear`-ahead-of-`lead` longitudinal crossing retained for **at least 60 seconds**, not simply a pair passing once or a technically valid collision-avoidance run.

| Scenario / movement instruction | Sustained passes | Technical safety |
|---|---:|---|
| Initially open side, early positioning | **80 / 80** | PASS |
| Initially open side, coordinated leader yield | **80 / 80** | PASS |
| Initially open side, late steering request | **47 / 80** | PASS |
| Initially occupied right side, choose current open side | **64 / 64** | PASS |
| Initially occupied right side, force blocked lane | **0 / 64** | PASS |
| **Other rider moves into selected side corridor, early commitment** | **0 / 64** | PASS |
| **Other rider moves into selected side corridor, current-occupancy 'adaptive' choice** | **0 / 64** | PASS |
| Other rider moves into selected side corridor, late movement | **26 / 64** | PASS |
| **Total** | **297 / 560** | **560 / 560 PASS** |

**Critical falsification of the optimistic earlier observation:** In the stronger moving-blocker variant, the blocker **actually entered the previously open side corridor in all 192 moving-blocker runs** (64 tests × 3 policies). At least one tick-end longitudinal gap to the overtaking rider came within 5m in 155 of these runs; the minimum measured center separation was 1.8m. No swept bicycle collisions occurred.

The early-commit and current-occupancy "adaptive" instructions both **fail every single sustained-pass case** under that moving blocker; their trajectories remain collision-safe because the unchanged collective collision resolver reduces/avoids unsafe travel. Together they register **1,192 near-halted rider-ticks among unrelated cyclists** (596 each), using the threshold of less than 0.5m actual progress in a 10s tick. The late approach succeeds 26/64 but also halts unrelated traffic for 87 rider-ticks. The approach that blindly forces an already occupied lane never succeeds and causes 1,376 near-halted unrelated rider-ticks.

These are *summed* rider-ticks, not 1,192 different riders or elapsed seconds. The slowdowns strongly suggest a traffic/cooperation problem, even when every collision assertion passes.

### Result counts by field size

| Rider count | Completed scenarios | Technically passed | 60s sustained rear-on-leader passes |
|---|---:|---:|---:|
| 2 | 48 | 48 | 48 |
| 3 | 128 | 128 | 80 |
| 4 | 128 | 128 | 48 |
| 5 | 128 | 128 | 48 |
| 6 | 128 | 128 | 73 |
| **Total** | **560** | **560** | **297** |

The outcomes depend materially on group composition. The combined counts by synthetic width are 75 sustained passes in `compact_4m`, 75 in `baseline_5m`, **72 in `wide_6_5m`** and 75 in `cautious_5m`. A wider road is **not automatically better** given the existing discrete lateral layout and scripted relative motions; these data do not establish width-specific real cycling performance.

## Acceptance decision and next gate

**Technical micro validation: PASS. Early static-corridor feasibility: demonstrated. Dynamic moving-corridor sporting robustness: FAIL / NO-GO.** A lane open in the rider's current snapshot can become physically contested during the next couple of ten-second movements. Merely moving early or recalculating based on the latest lane occupancy does not solve this. Neither the earlier unilateral priority tweak nor the proposed current-occupancy selector may be activated for official races.

**Next bounded A2 engineering problem:** create a separate **non-clairvoyant multi-tick lateral occupancy prediction or reservation protocol** using only *observed* lateral velocity, current position, available corridor width and other riders' acknowledged movement intents, with cancellation and safe abort when the anticipated corridor becomes occupied. Test that prediction against varied unpredictable blockers in **2–6-rider** micro groups before 12/24/32 rider traffic. Require no swept collisions, finite W-prime, reproducible checkpoint behavior, persistent passes and strictly bounded unrelated-rider halts. **Do not invent lookahead access to other riders' future decisions.**

Independent sporting blockers still include authoritative road width and climbing sources (718m missing Guangxi and 1,065m missing World Nations), sub-tick finish energy, historical breakaway/chase structure, team tactics, real stage classification stability and eventually the live UI and controlled production release.

**A1 technically passed. A2 SPORTING OPEN / NO-GO. B/C NOT STARTED. Official writes 0.**
