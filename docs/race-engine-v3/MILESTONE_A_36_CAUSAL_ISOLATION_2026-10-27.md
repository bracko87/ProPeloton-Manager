# Race Engine V3 — A2 Step 36: causal isolation of timestep instability

**27 October 2026 — 900/900 TECHNICAL RUNS PASS; 600/600 paired comparison records; numerical stability NO-GO.**

## Goal and controlled comparisons

[A35](MILESTONE_A_35_SUBSTEP_NUMERICAL_STABILITY_2026-10-27.md) exposed up to **207–209 metres of position deviation** in the same synthetic one-minute scenario simulated at 2s, 2.5s and 5s physical substeps, along with 1,012–1,192 reversed rider pairs relative to the 2s reference. Technically safe swept paths and finite energy did not imply convergence.

A36 isolates *which kind of rider interactions* make this instability large. The new **research-only** `scripts/v3/audit-a2-step36-causal-isolation-v3.mjs` runs the **unchanged** A34 physical and energy integrator, changing only the controlled **synthetic starting geometry and rider steering commands** across five families. Every timestep comparison holds initial rider IDs, watts, starting speed, power budgets, road gradient and the per-ID, per-10s-game-tick speed/lateral request constant. The 2s comparison is a reference, **not a verified correct ground truth**.

| Fixture family | Longitudinal spacing and lane controls | Purpose |
|---|---|---|
| Free straight | Riders 250m apart, starting in separate cycling lanes, lateral targets fixed | Check speed/energy numerical effects **without physical conflicts** |
| Free steering | Same isolated positions; ordinary lateral targets change at specified game ticks | Isolate voluntary lane steering and steering watt surcharge **without physical conflicts** |
| Same-lane following | Riders 6.4m apart, all in lane zero, no requested steering | Isolate **longitudinal wheel-following conflict** and symmetric attenuation |
| Mixed-lane hold | Riders 6.4m apart, initially distributed over four lanes, **no lane changes** | Measure overtaking and longitudinal conflicts across tracks while disabling merges |
| Mixed-lane merge | Same mixed starting grid and speed demand, with deterministic lateral requests | Add competing lane movements **without changing the initial grid or speed wishes** |

Four provisional road-width envelopes × five rider counts (2, 8, 12, 24, 32) × three variations = **60 identical matching configurations for each family**, each simulated three times at **2s/2.5s/5s**. This gives **900 completed physical simulations** and **600 paired timestep comparisons**, with 6 × 10s logical game ticks per run.

## Exact checks and GitHub execution

[Successful dedicated A36 GitHub Actions run](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40548532307) passed the complete diagnostic, exported per-fixture JSON, re-ran the unmodified A35, A34, A33, A32 and complete-stage technical regression checks and built the React application. It validates:
- No accepted swept collisions at the generated intermediate positions, and independently checks the complete pairwise piecewise trajectories.
- No negative or nonfinite W-prime, consistent achieved-motion energy ledger and exact 30s serialized mid-run replay through 60s.
- All rival commands unchanged; no official race result writes; no gameplay integration.
- **Zero** rejected collision proposals or attenuated movements in either deliberately uncongested family.
- The **2.5s mixed-lane merge** fixture reproduces **exactly 10,168 attenuated rider substeps and 16,421 rejected collision proposal detections** from A35, protecting against an unintentional change in benchmark inputs.

An initial audit run encountered an independent *test-command construction* error on the wide-road envelope: rounded 3.6m lane coordinates exceeded the binary floating-point road edge by a tiny amount. The original A34 adapter correctly rejected those invalid commands. The **fixture generator only** now bounds the rounded target to the existing validated road edge, matching A35; no collision thresholds or physics routines were relaxed. The failed run was discarded; the final 900/900 verified result is from the corrected audit.

## Measured 60-second results: 2.5s relative to 2s

| Family | Max rider position difference | Max W-prime difference | Different ordering cases | Reversed rider pairs |
|---|---:|---:|---:|---:|
| Free straight | **1.19m** | 48.91 J | **0/60** | **0** |
| Free steering | **1.19m** | 138.24 J | **0/60** | **0** |
| Same-lane following | **186.09m** | 895.90 J | **0/60** | **0** |
| Mixed-lane hold, no steering | **197.38m** | 226.44 J | **44/60** | **860** |
| Mixed-lane merge | **207.03m** | 2,253.46 J | **42/60** | **1,012** |

The magnitude in the same-lane cases shows that numerical divergence is **not restricted to deliberate lane changes**. Their longitudinal order remains fixed but the gap and absolute progress vary wildly. In mixed-lane traffic, riders may physically overtake one another, creating timetable-sensitive order changes; adding explicit lane merges increases pairwise inversions and energy divergence. These comparisons do not show that steering itself is inherently unstable without other riders: the uncongested free-steering family has the same worst position deviation as free straight.

## Timestep attenuation: physical obstacle appears before intentional lane merges

| Family | 2s attenuated movement ratio | 2.5s | 5s |
|---|---:|---:|---:|
| Free straight | **0%** | **0%** | **0%** |
| Free steering | **0%** | **0%** | **0%** |
| Same-lane following | 57.74% | 65.65% | 76.10% |
| Mixed-lane hold | 36.64% | 45.32% | 57.55% |
| Mixed-lane merge | 38.54% | 45.26% | 55.96% |

These values count rider-substeps whose initial proposed movement was scaled down by the present **symmetric half-distance conflict solver**, not crashes, not real injuries, and not an empirically validated crowding measure. A larger timestep increases the share of rider-substeps that need attenuation in **every congested family**, even without any requested lane change.

At 2.5s, the isolated free-steering family expends **156,362.5 J** more mechanical work across all cases than the free-straight family due to the configured steering surcharge and time profiles, *without any collision attenuation*. Within the same initial mixed-lane grids, enabling lane merges increases combined mechanical work by **201,518.43 J**, although its count of attenuated rider-substeps is slightly lower (**10,168 versus 10,180**). Therefore aggregate counts alone cannot explain every aspect of rank and energy sensitivity.

## Coarse 5-second substeps do not converge either

| Family | Maximum position deviation vs 2s | Reversed rider pairs | Changed order cases |
|---|---:|---:|---:|
| Free straight | 5.25m | 0 | 0/60 |
| Free steering | 5.25m | 0 | 0/60 |
| Same-lane following | 187.39m | 0 | 0/60 |
| Mixed-lane hold | 205.43m | 952 | 48/60 |
| Mixed-lane merge | 209.15m | 1,192 | 48/60 |

The simulation never changed its 10-second gameplay command cadence. Thus the differences arise in how the physics step sizes propagate and resolve the **same externally fixed requests**.

## Decision and Step 37 next bounded experiment

**A36 causal-isolation study COMPLETE; all 900 technical runs PASS. Numerical stability and sporting acceptance remain NO-GO.** This is evidence that repeated swept conflict attenuation in congested rider groups is a major contributor to the failure. It is **not** proof that symmetric half-movement scaling is the *only* underlying cause, or that the current 2s output is the true physical path.

**Step 37** should record time-to-contact and first blocking partner for each physical substep and independently test **continuous-time, bounded voluntary follower speed/yield proposals**, ideally with time-normalized results, against the original symmetric attenuation solver. Strictly require exact pairwise swept collision clearance, consistent energy accounts, no forced opponent commands, matched 2/2.5/5s comparisons, deterministic checkpoint replay, and visible near-stop/ranking/gap counters. Do not accept “fewer crashes” or better average motion as sporting convergence unless each relevant acceptance condition improves and no hidden regressions are introduced.

The source race solver, multiplayer live simulation, official classifications, Supabase database, user interface and game clock remain **unchanged**. Real-world road width/elevation provenance, drafting/fatigue and full-scale 106/168-rider sporting realism still block A2. Milestones B and C remain NOT STARTED.
