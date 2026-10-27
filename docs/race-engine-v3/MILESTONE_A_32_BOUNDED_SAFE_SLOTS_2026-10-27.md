# Race Engine V3 — A2 Step 32: bounded swept-safe passing slots

**27 October 2026 — 7,040/7,040 FULL MATCHED MICRO TECHNICAL PASSES; 192/192 extended-duration technical passes; A2 sporting remains NO-GO.**

## Objective

[A31](MILESTONE_A_31_OBSERVED_ESCAPE_2026-10-27.md) regained **33 of 48** 60-second sustained passes in the rival-lane-3, two-claimant micro configuration with a non-coercive adjacent lane escape. Fifteen remained unresolved because the normal full-forward request could not complete the lateral maneuver without intersecting a rival's *currently submitted* swept path. The next research gate was to diagnose these exact unsafe proposals and check whether the passing rider alone could reduce its requested longitudinal movement without compromising any other rider's command or an already successful overtaking case.

## Implementation: optional follower-only forward slot

Added `scripts/v3/a2BoundedSlotEscapeV3.mjs`, dedicated `verify-a2-bounded-slot-v3.mjs`, full-grid diagnostic `audit-a2-step32-grid-v3.mjs` and a separate GitHub Actions research workflow. The wrapper starts from **unchanged A31** `a2ObservedEscapeV3.mjs`:

- Only if **A31 observes a live two-claimant hazard** and rejects a full-forward swept-safe adjacent-lane escape, the wrapper tests a bounded sequence of **90%, 80%, 70%, …, 10%** of *that rider's own* requested forward movement. These fractions are experimental and not calibrated to real race behavior.
- Every reduced-forward, full-adjacent-lane path must be safe against **every currently submitted** opponent trajectory for the *full tick sweep*, not merely at tick endpoints. It never invents forward travel, assumes future intent, alters an opponent command, grants implicit consent, or overrides the original collision/energy solver.
- The highest admissible listed fraction is selected; if none is safe, the unmodified A31 request is retained. When an exit succeeds, it retains the original observed-rival release rule; accepted policy/replay state is serializable and deterministic.
- `officialWrites=0` and `sportingApproval='NOT_APPROVED'` remain enforced. No live V3 engine integration, UI, results, Supabase, migration or game-clock operations were performed.

The **15 rejected A31 cases** were exactly the 18m headway with slower 55m requested forward demand at **four synthetic road envelopes** (12 matched scenarios across field sizes 4/5/6), plus 18m headway, 75m demand at the stricter `cautious_5m` envelope (3 matched scenarios). The blocked candidate's actual passing-rider forward request at the decision tick is not always identical to the nominal demand: the strict-envelope 75m fixture generated a 65m policy output. These 15 all found a safe swept alternative: twelve used **80%** of 55m (44m) and three used **40%** of 65m (26m). Total voluntarily foregone forward demand was **249m** over all matching configurations. These are cumulative synthetic simulation counters, not actual cycling distance.

## Authoritative full matched comparison

[Complete A32 GitHub Actions comparison — five matrix jobs](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40539976950) executed identical 1,760 cases under **four** policies: original baseline, A30 three-tick signaled-intent memory, A31 observed swept-safe lane escape and A32 optional bounded slot. Field sizes 2–6 riders, four provisional synthetic road widths/envelopes, two opening headways, two forward demands, multiple actual starting lanes and adverse early/delayed/two-rival claims. Each case covers 40 × 10 simulated seconds.

All **7,040 cases** passed accepted full swept-clear movements, finite/nonnegative W-prime, exact midpoint serialized physics/passing/policy state replay, independent observed intent, and zero forced changes to nonconsenting riders. Original micro collision/complete-stage *technical* checks and the independent app build passed in the CI matrix. The research never claims calibrated full-stage sporting realism.

| Counter per 1,760 matched fixtures | Baseline | A30 observed 3-tick memory | A31 observed safe escape | **A32 bounded slot** |
|---|---:|---:|---:|---:|
| Technical cases passed | 1,760 | 1,760 | 1,760 | **1,760** |
| 60s sustained overtakes | 1,502 | 1,646 | 1,679 | **1,694** |
| 30s sustained overtakes | 1,550 | 1,694 | 1,694 | **1,694** |
| Passing-rider near-stop ticks | 1,102 | 298 | 199 | **154** |
| Unrelated rider near-stop ticks | 974 | 706 | 607 | **562** |
| Primary competing riders' final lane arrivals | 1,232 | 1,232 | 1,232 | **1,232** |
| Secondary competing riders' final lane arrivals | 336 | 336 | 336 | **336** |

The complete **1,760 per-fixture paired comparison** confirms **zero lost A31 60s overtakes**, **15 newly sustained passes**, **zero added near-stop ticks** for either the passing or unrelated riders in *any* matched fixture, **zero lost primary or secondary claimant final-lane completions**, **1,760/1,760 unchanged nonconsenting instructions**, and **0/1,760 incomparable technical cases**. These are separate nonregression criteria, not merely favorable total sums.

## 600-second duration verification — no artificial crossing victory

[Extended A32 GitHub Actions](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40540536923) tested **48 matched rival-3 two-claimant configurations × four policies = 192 technical cases**, 60 ticks each, with exact checkpoint replay at simulated second 300 and re-execution to 600.

| Overtaking success over hard 48 cases | Baseline | A30 memory | A31 escape | **A32 bounded slot** |
|---|---:|---:|---:|---:|
| Sustained 60s by second 400 | 0 | 0 | 33 | **48** |
| Sustained 60s by second 480 | 0 | 0 | 33 | **48** |
| Sustained 60s by second 600 | 0 | 0 | 33 | **48** |
| Passing rider still strictly ahead at 600s | 0 | 0 | 33 | **48** |
| Primary claimant final lane achieved | 48 | 48 | 48 | **48** |
| Second claimant final lane achieved | 48 | 48 | 48 | **48** |

All 192 extended technical runs succeeded. Neither a late-test crossing nor 30-second-only position reversal is being misclassified as a 60-second sustained pass. This is credible micro-fixture improvement, **not** historical whole-stage performance or a race-engine deployment decision.

## Remaining sporting and source-quality blockers

Despite successful A32 bounded research, the wider Milestone A2 is **NOT approved**. The 1,760-case matrix still has 66 configurations without a 60s pass, which are not in themselves necessarily sporting defects absent calibrated expectations. More importantly, geometric envelopes are synthetic; nonlinear intratick acceleration and lateral crossing fidelity, source-verified widths and missing route elevation, realistic peloton congestion, drafting/fatigue, breakaways, gaps and finish-line energy are not validated. Full-scale 12/24/32 and 106/168 rider sporting approval remains outstanding. Existing official physics, result persistence, player tactics and clock must remain untouched.

**Final decision: A1 technical foundation complete. A32 research and targeted micro gates PASS. A2 sporting still NO-GO; Milestones B and C not started.** Do not promote any research candidate to the live race engine without the owner separately approving all relevant gates and production integration.
