# Race Engine V3 — owner-facing milestone register

**Last updated: 2026-10-26, after the full-stage A2 start-row confinement audit.** Research lives on GitHub `main` in isolated V3 files. The game's selected race engine and historical results have NOT been changed.

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
| Real stage terrain and road widths | **BLOCKED** | Repair 718 m missing Guangxi, 1065 m missing World Nations; verified source road widths |
| Authentic breakaways, pursuits, groups and gaps | **BLOCKED** | Historical flat/hilly/mountain benchmarks; credible 30s+ breakaways where applicable |
| Calibrated drafting, fatigue, weather, sprint and attacks | **OPEN** | Mechanically and sportingly plausible stage-wide rider and team data |
| Official switch permitted | **NO** | Separate owner approval *after all relevant acceptance gates pass* |

**A2 further rejected candidate (closing-wheel anticipation, 2026-10-26):** a conservative forecast of a slower wheel within two reaction ticks passed complete 106/168-rider simulations and exact checkpoint recovery, but did **not** improve classification stability: Dordrecht inversion share **7.619%→7.942%** (worse) and Guangxi **18.556%→18.556%** (unchanged). Original-grid gap and blocked-tick figures were identical; do not activate this option. [Detailed report](MILESTONE_A_03_EARLY_WHEEL_2026-10-26.md).

**Latest A2 diagnostic:** [Full-stage row confinement study](MILESTONE_A_04_ROW_CONFINEMENT_2026-10-26.md) passes both full stages with unchanged baseline finishes; original starting-quartile retention 70.92% / 49.27% and ~70% sampled blocking. Next investigate **research-only spatially local passing admission** versus the existing global cap of three, judging actual passes, queue wait, classification stability and final gaps rather than blocked ticks alone. No option approved.

**Immediate focus:** first full-stage technical gate is closed. The follow-up [A2 position-bias report](MILESTONE_A_02_START_GRID_2026-10-26.md) confirms fixed rider-ID priority **is not the cause**; coordinated overtaking capacity materially affects the result but does **not** pass sporting realism. Next: test spatially local vs global passing admission, measure authentic queue release and pursuit, correct route width/elevation sources, and repair sub-tick finish energy. Do not consider gameplay integration ready on the strength of these research simulations.

## Milestone B — Gameplay contract and interface

**NOT STARTED for the latest coupled 2D model.** Must implement 12 tactical sectors, live team/rider decisions, pre-race defaults, stage viewer, controlled command transport, Game Center readiness states, replay and finish contracts. Prove end-to-end gameplay with the approved physics. A source-code simulation is not user-facing gameplay.

## Milestone C — Controlled production readiness

**NOT STARTED.** Stage schedule throughput and worker reliability, migrations only with independent review, historical replay compatibility, 2x clock transition only under explicit approval, measured latency (<15 real minutes per live stage), recovery, load testing and rollback. Production switching and game clocks are explicitly outside research authorization.

## Overall decision

**Milestone 1 independent V3 architecture = completed foundation. Milestone A/core physics = in progress (full-stage computational gate passed; sporting stability, physics calibration and source-fidelity failed). Milestones B and C = not ready. Sporting approval = NO-GO.** Next progress reports must state which gate was closed and which remain open, including links to green CI and actual result data.
