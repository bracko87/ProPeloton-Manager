# Race Engine V3 — owner-facing milestone register

**Last updated: 2026-10-26, after first full-stage 2D gate.** Research lives on GitHub `main` in isolated V3 files. The game's selected race engine and historical results have NOT been changed.

## Why this register exists

A numbered engineering batch is NOT evidence that the engine is nearing release. This register tracks outcomes, objective acceptance conditions and blockers. Do not replace a missing test with another numbered batch or silently claim percentage completion.

## Milestone A — Complete, credible 2D racing

| Acceptance condition | Status as of Batch 42 | Evidence required to close |
|---|---|---|
| True coupled forward/lateral motion, collision and finite W-prime | **Prototype verified** | Collision-free 8, 24, 106 and 168-rider replays |
| **Complete 106 and 168-rider 2D stages** | **TECHNICAL PASS (6 offline stages)** | Both complete; each race: steering disabled, enabled, two-rider lane swap; every rider classified. Sporting realism remains **FAILED** |
| Deterministic mid-race recovery | **TECHNICAL PASS for six offline stages** | Serialised 40%-distance checkpoints produced exact full final state in all six scenarios |
| Start grid / priority fairness | **FAIL** | Two-rider same-row lane swap changed 102/106 Dordrecht ranks and 163/168 Guangxi ranks; winners changed in both |
| Real stage terrain and road widths | **BLOCKED** | Repair 718 m missing Guangxi, 1065 m missing World Nations; verified source road widths |
| Authentic breakaways, pursuits, groups and gaps | **BLOCKED** | Historical flat/hilly/mountain benchmarks; credible 30s+ breakaways where applicable |
| Calibrated drafting, fatigue, weather, sprint and attacks | **OPEN** | Mechanically and sportingly plausible stage-wide rider and team data |
| Official switch permitted | **NO** | Separate owner approval *after all relevant acceptance gates pass* |

**Immediate focus:** the full-stage technical gate is now closed; next resolve the sporting blockers: 2D collision/finish-time modeling, initial grid priority, authentic real-world routes, power/fatigue, and race tactics. Do not consider gameplay integration ready on the strength of these six research simulations.

## Milestone B — Gameplay contract and interface

**NOT STARTED for the latest coupled 2D model.** Must implement 12 tactical sectors, live team/rider decisions, pre-race defaults, stage viewer, controlled command transport, Game Center readiness states, replay and finish contracts. Prove end-to-end gameplay with the approved physics. A source-code simulation is not user-facing gameplay.

## Milestone C — Controlled production readiness

**NOT STARTED.** Stage schedule throughput and worker reliability, migrations only with independent review, historical replay compatibility, 2x clock transition only under explicit approval, measured latency (<15 real minutes per live stage), recovery, load testing and rollback. Production switching and game clocks are explicitly outside research authorization.

## Overall decision

**Milestone 1 independent V3 architecture = completed foundation. Milestone A/core physics = in progress (full-stage computational gate passed; sporting stability, physics calibration and source-fidelity failed). Milestones B and C = not ready. Sporting approval = NO-GO.** Next progress reports must state which gate was closed and which remain open, including links to green CI and actual result data.
