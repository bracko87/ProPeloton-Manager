# Race Engine V3 — owner-facing milestone register

**Last updated: 2026-10-26, after the 5s versus 10s full-stage A2 stability audit.** Research lives on GitHub `main` in isolated V3 files. The game's selected race engine and historical results have NOT been changed.

## Why this register exists

A numbered engineering batch is NOT evidence that the engine is nearing release. This register tracks outcomes, objective acceptance conditions and blockers. Do not replace a missing test with another numbered batch or silently claim percentage completion.

## Milestone A — Complete, credible 2D racing

| Acceptance condition | Latest status | Evidence required to close |
|---|---|---|
| True coupled forward/lateral motion, collision and finite W-prime | **Prototype verified** | Collision-free 8, 24, 106 and 168-rider replays |
| **Complete 106 and 168-rider 2D stages** | **TECHNICAL PASS (6 offline stages)** | Both complete; each race: steering disabled, enabled, two-rider lane swap; every rider classified. Sporting realism remains **FAILED** |
| Deterministic mid-race recovery | **TECHNICAL PASS for six offline stages** | Serialised 40%-distance checkpoints produced exact full final state in all six scenarios |
| Start grid / priority fairness | **FAIL — A2 controlled tests complete** | Rotating same-row priority caused **zero** rank improvement; increasing simultaneous overtakes from 2 to 3 reduced inverted rider pairs Dordrecht **13.41%→7.62%**, Guangxi **27.98%→18.56%**, but **96/106 and 165/168** still changed rank; finish gaps worsened in both originals |
| Starting-row confinement diagnostic | **OBSERVATION PASSED, SPORTING NO-GO** | [Full report](MILESTONE_A_04_ROW_CONFINEMENT_2026-10-26.md): 70.92% / 49.27% original-quartile retention; ~70% sampled riders blocked; both original control results unchanged. Cause and correction unverified |
| Local vs global overtaking admission | **TEST PASSED; SPORTING FAILED / CANDIDATE REJECTED** | [A2 report](MILESTONE_A_05_LOCAL_ADMISSION_2026-10-26.md): inverted pair share worsened 7.62%→15.76% Dordrecht and 18.56%→26.00% Guangxi despite more steering; Guangxi winner flips under lane swap |
| Exact overtaking queue and pass diagnostic | **OBSERVATION PASSED, SPORTING STILL FAILED** | [Full verified 106/168-rider report](MILESTONE_A_06_QUEUE_CAUSES_2026-10-26.md): capacity denial 60.69% / 72.62%, physical lane denial 37.58% / 26.43%, zero result changes; distinct cause not yet proven |
| Coordinated neighbor-space lane preference | **TECHNICAL PASS; SPORTING FAIL / REJECTED** | [12 complete-stage scenarios](MILESTONE_A_07_NEIGHBOR_SPACE_2026-10-26.md): two-rider starting-lane swap inversion share worsened 7.62%→19.12% Dordrecht, 18.56%→24.78% Guangxi; full-grid rotation also worsened |
| 5s vs 10s tick-size stability | **TECHNICAL PASS; SPORTING FAIL / dt5 NOT APPROVED** | [12 scenarios / full report](MILESTONE_A_08_STEP_SIZE_2026-10-26.md): swapped-grid inversions 7.62%→11.14% Dordrecht, 18.56%→24.05% Guangxi; tick-based reaction/steering times change with dt, so this is not isolated numerical convergence |
| Real stage terrain and road widths | **BLOCKED** | Repair 718 m missing Guangxi, 1065 m missing World Nations; verified source road widths |
| Authentic breakaways, pursuits, groups and gaps | **BLOCKED** | Historical flat/hilly/mountain benchmarks; credible 30s+ breakaways where applicable |
| Calibrated drafting, fatigue, weather, sprint and attacks | **OPEN** | Mechanically and sportingly plausible stage-wide rider and team data |
| Official switch permitted | **NO** | Separate owner approval *after all relevant acceptance gates pass* |

**A2 further rejected candidate (closing-wheel anticipation, 2026-10-26):** a conservative forecast of a slower wheel within two reaction ticks passed complete 106/168-rider simulations and exact checkpoint recovery, but did **not** improve classification stability: Dordrecht inversion share **7.619%→7.942%** (worse) and Guangxi **18.556%→18.556%** (unchanged). Original-grid gap and blocked-tick figures were identical; do not activate this option. [Detailed report](MILESTONE_A_03_EARLY_WHEEL_2026-10-26.md).

**Latest A2 numerical sensitivity result:** [5-second versus 10-second full-stage audit](MILESTONE_A_08_STEP_SIZE_2026-10-26.md) passed technical safety/recovery for all 12 scenarios, but the shortened tick interval worsened two-rider-grid inversion share in both races. Crucially, 2-tick reaction and 3-tick steering take half as much physical time at dt5; do not call this proof of numerical convergence or switch the engine. Next: opt-in seconds-normalized dt5 with 20s reaction, 30s steering and equivalent acceleration across the same grids.

**Immediate focus:** first full-stage technical gate is closed. The follow-up [A2 position-bias report](MILESTONE_A_02_START_GRID_2026-10-26.md) confirms fixed rider-ID priority **is not the cause**; coordinated overtaking capacity materially affects the result but does **not** pass sporting realism. Next: isolate dt numerical behavior with seconds-normalized reaction, steering and acceleration; then benchmark authentic queue release/pursuit, correct route width/elevation sources, and repair sub-tick finish energy. Do not consider gameplay integration ready on the strength of these research simulations.

## Milestone B — Gameplay contract and interface

**NOT STARTED for the latest coupled 2D model.** Must implement 12 tactical sectors, live team/rider decisions, pre-race defaults, stage viewer, controlled command transport, Game Center readiness states, replay and finish contracts. Prove end-to-end gameplay with the approved physics. A source-code simulation is not user-facing gameplay.

## Milestone C — Controlled production readiness

**NOT STARTED.** Stage schedule throughput and worker reliability, migrations only with independent review, historical replay compatibility, 2x clock transition only under explicit approval, measured latency (<15 real minutes per live stage), recovery, load testing and rollback. Production switching and game clocks are explicitly outside research authorization.

## Overall decision

**Milestone 1 independent V3 architecture = completed foundation. Milestone A/core physics = in progress (full-stage computational gate passed; sporting stability, physics calibration and source-fidelity failed). Milestones B and C = not ready. Sporting approval = NO-GO.** Next progress reports must state which gate was closed and which remain open, including links to green CI and actual result data.
