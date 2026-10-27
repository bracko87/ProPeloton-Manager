# Race Engine V3 — A2 Step 30: observed lane-claim continuity

**27 October 2026 — 10,560 / 10,560 OFFLINE MICRO TECHNICAL PASSES; SPORTING NO-GO.**

## Question and bounds

[A29 active-intent comparison](MILESTONE_A_29_ACTIVE_INTENT_ADMISSION_2026-10-27.md) restored both-claimant lane-0 passing but still sacrificed 12/64 single early-entry 60-second passes versus baseline, with 991 unrelated near-halt ticks. Step 30 tests whether *remembering an actually observed lane-change signal* for a bounded period eliminates repeated mid-conflict selection changes. This research does **not** predict future intents, request involuntary rider yielding, alter the production engine, or grant sporting approval.

Two additions to the unchanged A29 research wrapper `scripts/v3/a2ActiveClaimSwitchV3.mjs`:

- `signal_latched`: after a currently communicated, eligible left-lane claim is observed, use the existing baseline intent-aware planner for the remainder of the test. Does not latch based on an unobserved future claim.
- **`signal_memory_3`:** use the baseline for the signal tick and up to two subsequent ticks, refreshing the three-tick counter only if another current eligible signal is observed. Revert to the lane guard when memory expires. The three-tick interval is **synthetic and not road-calibrated**.

The existing per-tick A29 preemptive signal policy, original baseline, A27 outer-lane guard and A28 one-tick bounded hold are included unchanged. The two planners continue to receive the same actual observed frame; only the selected rider request reaches the existing swept-collision/W-prime micro solver. No opponent instruction is rewritten without consent, and all snapshots are deterministic/JSON-serializable.

## Exact matched experiment

The isolated CI workflow [A30 10,560-case comparison](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40533782320) completed all five matrix jobs successfully (field sizes 2, 3, 4, 5, 6). The **same 1,760 fixtures per policy** span four *provisional synthetic*, unverified road geometries, two headways, two passing demands, seven actual starting lane variants where applicable, and open/early/delayed/two-claimant traffic. Each micro trajectory runs 40 × 10-second ticks. Individual per-fixture JSON output is retained in CI artifacts for 30 days. Total **six policies × 1,760 = 10,560**.

Every case passed:
- swept-path accepted movement/collision assertions and no invented forward motion;
- finite, nonnegative W-prime accounting;
- same serialized midpoint-recovery outcome, including policy and physical state;
- unchanged nonconsenting rival instructions and deterministic policy tests;
- original 2D/persistent-pass and complete-stage **technical** regressions.

The application build, including i18n validation, passed in the two-rider comparison job. [Legacy isolation CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40533782462) and [A29 unchanged comparison](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40533782903) also passed. None of this substitutes for a calibrated real peloton or a new complete-stage sporting acceptance run.

## Complete sporting totals, per 1,760 matched micro cases

| Outcome | Baseline | A27 guard | A28 1-tick | A29 early signal | A30 latched | **A30 3-tick memory** |
|---|---:|---:|---:|---:|---:|---:|
| Technical cases passing | 1,760 | 1,760 | 1,760 | 1,760 | 1,760 | **1,760** |
| Sustained 60s passes | 1,502 | 1,610 | 1,590 | 1,634 | **1,646** | **1,646** |
| Sustained 30s passes | 1,550 | 1,670 | 1,638 | 1,694 | **1,694** | **1,694** |
| Near-stopped passing-rider ticks | 1,102 | 692 | 355 | 652 | **298** | **298** |
| Near-stopped unrelated-rider ticks | 974 | 1,025 | 765 | 991 | **706** | **706** |
| Primary claimant final lane arrivals | 1,232 | 1,232 | 1,232 | 1,232 | **1,232** | **1,232** |
| Second claimant final lane arrivals | 336 | 336 | 336 | 336 | **336** | **336** |

The 3-tick candidate improves over A29 by **12 more 60s passes**, **354 fewer near-stopped follower ticks** and **285 fewer unrelated near-stopped ticks**. Versus baseline it adds **144** 60s passes and reduces those respective near-stop counts by **804** and **268**. Aggregate 60s overtakes and unrelated near-stops do not regress compared with baseline in any *scenario × starting-lane* group, but group totals cannot establish that every individual fixture has no regression. These remain numerical model outcomes, **not field-calibrated cycling performance**.

Both continuity choices produce the same reported aggregate totals here. This does **not** prove identical per-fixture trajectories, behavior on untested roads or safety under arbitrary nonlinear sub-tick paths. A bounded memory is a smaller commitment than an indefinite latch, so the three-tick rule is the preferred **offline research candidate**, not a selected racing policy.

## Adversarial sporting screens

| Specific starting-grid scene | Baseline 60s | A29 signal 60s | A30 memory 60s | A30 memory 30s |
|---|---:|---:|---:|---:|
| Follower in lane 0, single early rival (64 fixtures) | 64 | 52 | **64** | **64** |
| Two claimants, first rival starts lane 3 (48 fixtures) | 0 | 0 | **0** | **48** |

The early-entry improvement is real in these fixtures and does not require the opponent to give up its lane change. The 48/48 **30-second** passes in the rival-3 two-claimant scene do **not** persist for 60 seconds. All six policies have this weakness. Classifying a temporary crossing as a sustained sporting solution would be misleading, even with technical collision and replay tests green.

## Decision / next gate

**A30 research complete; technical micro PASS; A2 SPORTING NO-GO.** Do not merge any of the proposed lane-claim planners into the canonical engine, tactical interface, player result processing, production database or game clock. `officialWrites=0` and `sportingApproval='NOT_APPROVED'` remain enforced.

Next isolate **when and why** the 48 rival-3 30-second crossings fail to remain ahead for 60 seconds. Diagnose coupled energy, missed safe gaps, opponent lane completion and sub-tick relative motion from current observations alone. Screen a bounded noncoercive slot option against all previously successful lanes and unrelated halt rates before scaling to 12/24/32 or 106/168 riders. Independent geometric, terrain, calibration and full-peloton benchmarks still block A2 approval.

**A1 technical foundation complete. A2 open / NO-GO. B and C not started.** No changes to selected live physics, results, player UI, Supabase or clock.
