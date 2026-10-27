# Race Engine V3 — Milestone A2: sustained 12/24/32-rider synchronous motion

**27 October 2026 — TECHNICAL STRESS GATE PASSED. SPORTING REALISM UNVERIFIED / NOT APPROVED.**

## Scope

Continue the previously validated [synchronous 2D micro-resolver](MILESTONE_A_11_SIMULTANEOUS_MICRO_2026-10-27.md) without changing its physics. The solver still uses frozen state, collective collision-path attenuation, collision-safe swept trajectories, finite rider W-prime and deterministic JSON replay. This experiment is **not** a full 106/168-rider race, and is isolated from the official engine selector, historical results, Supabase and live clock.

Script: [`audit-a2-simultaneous-stress-v3.mjs`](../../scripts/v3/audit-a2-simultaneous-stress-v3.mjs); CI: [successful sustained-stress workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40477070742). Final corrected stress fixture: commit [`af5235f1`](https://github.com/bracko87/ProPeloton-Manager/commit/af5235f1566a0b9e5b88b13d4bb74d47dbc2cd8b).

Three roster sizes (12, 24, 32) × four scenarios (dense following, passing corridors, repeated merge pressure, disconnected groups) × 90 ticks at 10s = **12 synthetic scenarios, each 900 simulated seconds**. After every tick, all rider-pair swept paths are checked for collisions; rider energy and distance conservation are asserted. Every scenario also verifies one-tick rider-array reversal invariance and exact full final state after a serialized midpoint checkpoint. A separate 12-tick split-versus-combined test proves independence of distant packs that are physically unable to interact.

## Quantitative movement results

The percentage in the first table is achieved forward metres divided by the power/acceleration-limited, pre-collision requested metres. These are synthetic driving instructions, **not historically realistic peloton speed metrics**.

| Scenario | 12 riders | 24 riders | 32 riders |
|---|---:|---:|---:|
| Dense follow — achieved/requested | 83.145673% | 81.382200% | 80.765055% |
| Passing corridors — achieved/requested | 83.832031% | 78.786464% | 77.972269% |
| Merge pressure — achieved/requested | 92.060370% | 81.664843% | 77.987406% |
| Separated packs — achieved/requested | 92.860419% | 87.057631% | 65.095954% |

**Passing-corridor measurements:**

| Metric | 12 riders | 24 riders | 32 riders |
|---|---:|---:|---:|
| Longitudinal pair order-crossing events | 66 | 202 | 442 |
| Lateral movement (metres summed across riders) | 4 | 8 | 10 |
| Blocked rider-decision ticks | 30.28% | 38.10% | **44.55%** |
| Near-halted rider time (summed seconds) | 660 | 1,690 | 2,400 |
| Worst single tick achieved/requested | **10.40%** | **5.71%** | **4.60%** |
| Rider-ticks moving more than 0.5m | 93.89% | 92.18% | 91.67% |

**Repeated merging measurements:**

| Metric | 12 riders | 24 riders | 32 riders |
|---|---:|---:|---:|
| Lateral movement (total metres) | 114.494494 | 195.962227 | 216.909109 |
| Longitudinal order-crossing events | 21 | 350 | 619 |
| Blocked rider-decision ticks | 23.33% | 43.06% | **49.58%** |
| Worst single tick achieved/requested | 44.73% | 22.64% | 24.64% |

Longitudinal *crossing events* count tick-to-tick ordering reversals, **not unique tactical overtakes**; pairs may reverse more than once. Blocked rider-decision ticks count requests clipped by collision handling, not unique obstructed riders. Near-halted seconds are the sum of rider-ticks with a request above 10m but actual progress below 0.5m. The worst-tick metric is sensitive to a temporary cluster bottleneck; it must not be misread as an entire-stage speed ratio.

## Engineering acceptance and limitations

**Technical gate passed for 12/24/32:** all 12 scenarios completed all 90 ticks, had no swept collisions, nonnegative finite energy, no invented forward movement, exact checkpoint replay and rider-array order independence. Two widely separated groups also evolve identically whether simulated together or separately. [CI logs and 30-day JSON artifacts](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40477070742) contain the per-scenario counters under `v3-a2-stress-12`, `v3-a2-stress-24` and `v3-a2-stress-32`. The production application build and legacy-isolation workflow passed.

The first stress workflow attempt failed due to a **test-harness array/state argument mistake**, corrected in `c7e6093e`. Another 24-rider test failed because the supposedly independent packs started only 500m apart and could catch one another: this was a **poor independence fixture**, not proof of a distant-group interaction. The corrected comparison moved the packs well outside contact range in `af5235f1`. Both failure logs remain part of the GitHub history; there was no solver physics change.

**Sporting gate remains OPEN.** Although aggregate progression and pair crossings remain nonzero, these synthetic scenarios reveal potentially severe **transient simultaneous slowing**: as little as 4.60% of requested distance was accepted during one 32-rider passing tick, and nearly half of 32-rider merge decision-ticks were clipped. These observations do not meet a source-backed sports acceptance threshold and cannot be considered evidence of a credible 106/168-rider peloton. The current alerts were permissive (global distance fulfilment under 50%, zero passing or near-halt over 20%); absence of alerts does **not** prove high-quality group dynamics.

## Next bounded A2 engineering gate

Instrument *why* the symmetric attenuation collapses movement in isolated ticks: record conflict graph components, leader/follower same-track relationships, iteration count per tick and distances lost by each conflicting component. Compare the unmodified symmetric rule with a **research-only collective velocity/yield formulation** that preserves the same-snapshot physics and swept collision rules without halving unconstrained group members. First pass the 12/24/32-rider stress tests on multiple initial grids; only then attempt 106/168 full stages, real energy accounting and source-validated road profiles.

Independent blockers remain authentic road widths, missing Guangxi/World Nations climbing, sub-tick finish energy, historical breakaway/pursuit behavior, realistic tactics and group outcomes.

**A1 technical gate retained. A2 SPORTING NO-GO. B and C NOT STARTED. No production changes.**
