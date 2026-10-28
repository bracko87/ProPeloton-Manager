# Race Engine V3 — A58: bounded coupled braking and smooth-steering shadow responses

**28 October 2026 — OFFLINE technical PASS; 44/67 prior-alert scenarios have some collision-free ten-second shadow; physical/sporting GO remains denied.**

## Objective and scope

A57 reconstructed genuinely changed rider trajectories from **67 real A44 pre-substep early-warning checkpoints**, with the warned rider ordinary-braking continuously at -0.85m/s². Only **29/67** were safe through the critical event and ten-second shadow horizon when every other rider stayed on their unchanged recorded A44 path; **38/67** were blocked by contact with frozen neighboring cyclists.

A58 tests bounded additional **simultaneous local rider reactions and lateral steering** without allowing the solver to assign an impossible terminal speed or silently change official race results. The initial acting cohort is identified **solely from the frozen source of the warning checkpoint**. The larger field still replays original A44 accepted motion without responding. This is a controlled partial-field research study, not a full responsive peloton or an approved automatic decision algorithm.

## Implemented offline modules

- `scripts/v3/a2CoupledCheckpointBrakeAuditV3.mjs`: deterministic pre-alert cohort selection, enumerated simultaneous wake braking plus alternative 5-second smooth lateral steering plans, exact state/energy integration, continuous full-field swept safety, input immutability, and original game-result isolation.
- `scripts/v3/verify-a2-step58-coupled-reaction-v3.mjs`: the 162 historical A44/A50 60s runs and prior 75/110/67 cases, **383** alternative trials, selected candidate exact JSON restart, five real checkpoint reflection controls, and additional synthetic identity/left-right/rear-end negative and positive controls.
- `.github/workflows/v3-a2-step58-coupled-reaction.yml`: dedicated research CI with 30-day JSON evidence plus independent A57–A39 and full-stage regression gates and React build.

[Step58 GitHub Actions evidence](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40689316730)

### Physical response and safety model

For each warning state, the initial group consists of the alerted rider plus **up to three cyclists behind within the same bicycle lateral corridor and 15 metres**, or rear members explicitly connected to the alerted rider by the initial contact pair. Selection uses only positions and provisional contacts known at that alert checkpoint. It never uses the identity of a future blocker to pick additional cyclists.

The predetermined candidate set is: single-rider ordinary braking; primary plus available trailing-group ordinary braking; left/right next-lane smooth steering for the primary while braking; primary steering with all selected wake cyclists braking; and left/right steering of the nearest trailing rider with simultaneous wake braking, where a lane is available. Invalid edge-lane candidates are omitted. **No future-best choice is installed as a gameplay policy**: selecting the first successful candidate in the report is retrospective feasibility analysis.

Every participating rider is restarted from its **actual frozen pre-substep A44 x/y/v and W-prime state**. Longitudinal motion integrates `v(t)=max(v0-0.85t,0)` and stops without negative velocity. The optional lateral movement from the starting y to an adjacent legal lane center uses cubic `3s²-2s³` over five seconds, with zero endpoint lateral velocity and a maximum rate **0.36 m/s** on the widest examined 1.2m lane spacing, below the original provisional **0.38 m/s**. Lateral movement is continuously constrained to the original road envelope, and steering cost is added to the original road power calculation when the rider changes y.

The model performs an independent **32 microinterval swept-collision check for every pair involving an altered cyclist**, including two altered cyclists colliding with each other and altered cyclists meeting all unmodified A44 moving obstacles. The longitudinal footprint includes a conservative **0.85·h²/8** chord-curvature envelope for each continuously braking rider; lateral clearance likewise includes a curvature bound derived from the smoothstep second derivative. Each successfully completed substep recomputes the research W-prime ledger and verifies exact elapsed energy time. Failed collision or energy candidates are **rejected and not continued as accepted motion**. Source histories and original rider intentions are not modified.

This certifies the experimental reaction's physical speed/braking, steering, geometric clearance and W-prime **for the selected riders against the original source obstacle paths**. It does not ensure that the unchanged A44 field trajectories themselves meet these velocity bounds or that mutual full-field response is possible.

## Quantified 10-second outcomes

| Physical timestep | Eligible earlier warnings | A57 single brake clears 10s | A58 any listed plan clears 10s | New cleared cases | Still blocked |
|---|---:|---:|---:|---:|---:|
| 0.5 s | 40 | **12** | **23** | **11** | **17** |
| 2 s (one case, no prior warning) | 0 | 0 | 0 | 0 | 0 |
| 2.5 s | 27 | **17** | **21** | **4** | **6** |
| **Total** | **67** | **29** | **44** | **15** | **23** |

Of the **383** enumerated test plans, **191** involved at least one additional reacting rider beyond the primary. The maximum was two added trailing riders in the historical tested cohorts. **No candidate failed energy accounting**.

The extra **15** ten-second clearances all occurred with **`SINGLE_BRAKE_STEER_RIGHT`** — a braking primary rider moving gradually toward the adjacent right lane. **There were zero cases rescued by simultaneous additional rear-group braking alone**, notwithstanding a positive synthetic control below. These are empirical outcomes from this very constrained fixture corpus. The direction is not a claim that rightward steering is universally safer; its relationship to lane layout, fixture commands and mirror fairness still needs systematic investigation.

There is no claim that all 383 trial policies were safe or that 44 full 32-rider races were successfully simulated; a case counted as cleared means **at least one** of its retrospectively tested candidates cleared the ten-second shadow horizon against the remaining frozen A44 traffic. Treating the “first successful strategy” as if a real controller could know it beforehand would be clairvoyant and is explicitly forbidden.

### New controlled three-rider positive/negative test

A synthetic three-rider scenario places one warned rider at 8m/s with a same-speed trailing rider 6m behind in the same corridor and an unrelated rider in an adjacent lane. If only the warned rider brakes, the unmodified follower catches them: **single-rider braking is rejected**. When both cyclists begin bounded braking **from the exact same pre-substep state**, they preserve 6m headway and the full ten-second shadow is collision-free. The W-prime ledger, exact JSON replay, mirror transformation and renamed rider identities pass. This establishes that *local simultaneous response can matter* in a clear test, but **not that it repaired any of the actual 67 cases**.

## Original four conflict-event spotlights

- **Baseline 5m, eight riders, v1, 51s original A44 event:** r004 gets an early source alert at **44.5s**; the initial reacting cohort includes trailing r000. Five available response options were tested. All were blocked, and single braking contacts r000 at **48.828125s**.
- **Wide 6.5m, eight riders, v1, 51.5s:** r004 alert at **44.5s**; trailing r000 is in the initial cohort; none of the five candidates clears the horizon. The original single-brake shadow again meets r000 at **48.828125s**.
- **Cautious 5m, 32 riders, v0, 22.5s:** r030 first alert at **15s**, with two original rear cohort members r026/r022. Eight pre-defined responses are examined, none of which reaches the ten-second horizon without contact. The single-brake attempt first meets r026 at **16.71875s**.
- **Cautious 5m, 32 riders, v1, 22s:** r002 and r014 each have prior alerts at **14s**, and each individually passes braking-only ten-second replays; r024 alert at **18s** still blocks despite the five tested variants, with single braking first contacting r020 at **21.3125s**.

The historical source-event times and the **first actual A44/A50 divergence** can differ substantially. They remain separate evidence categories.

## Verification and interpretation

**Step58 PASS:** 162 source 60s simulations and original invariants, 383 bounded shadow strategy trials with source history frozen, exact JSON replay of one selected strategy in each of 67 real earlier-warning cases, five real mirrored-checkpoint outcomes, synthetic renamed/mirror/wake-controls, lateral speed ceiling and independent inflated continuous swept-pair clearance, and no W-prime budget errors. Race/official writes = 0.

**Step58 NO-GO:** the 23 unrescued cases, fairness of steering direction, multi-rider interactions outside the preselected group, physically impossible speeds already present in A44 frozen obstacles, a real-time policy that can choose among options without future knowledge, realistic 106/168-rider full-stage classification, genuine terrain/road geometry and actual pack response. Milestones B/C remain unstarted. No production solver, Supabase race table, payouts, historic result or game-clock change.

**A59 focus:** full 67-case mirror/ID symmetry audit; distinguish geometric source-position asymmetry from candidate direction preference; and begin a truly re-integrated coupled physical field where other riders respond instead of following original A44 accepted paths. Preserve anticipation, continuous physical velocity, independently validated all-pair collision safety, W-prime, checkpoint replay and nonclairvoyant selection, with explicit failures whenever no physically feasible solution exists.
