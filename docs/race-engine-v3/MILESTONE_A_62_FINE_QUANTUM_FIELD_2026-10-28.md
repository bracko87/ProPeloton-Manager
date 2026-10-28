# Race Engine V3 — A62: synchronized half-second full-field response from unchanged tactical commands

**28 October 2026 — offline engineering gate PASS; sporting/production NO-GO.**

## Objective

A61's best autonomous three-second headway forecast cleared **50/67** matched earlier-start ten-second scenarios, with 17 continuously swept collision rejects. All 40 cases using source-frame 0.5s passed; the 2.5s source-frame group only cleared 10/27. This suggested a control-resolution problem, not proof that different braking strength or unconstrained steering was required.

A62 evaluates **one strictly opt-in change**: preserve exactly the same starting physical checkpoint, 3s forecast, rider tactical commands, road geometry, acceleration limits, lateral steering limits, energy model and ten-second horizon, but **re-integrate all riders and reconsider their current-state advisory at 0.5-second intervals** within every originally 2.5-second tactical frame. No future tactical command or A44 accepted trajectory is read between these internal substeps. A recorded 0.5-second frame already matches that quantum and must remain exactly unchanged.

## Source, execution and release boundary

- [Research-only full-field solver with optional internal quantum](../../scripts/v3/a2MirrorAndFullFieldProbeV3.mjs)
- [All-67-case A59–A62 matched comparison and correctness verification](../../scripts/v3/verify-a2-step59-symmetry-and-field-v3.mjs)
- [GitHub CI physical and parity evidence](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40698211809)
- [Retained complete per-case JSON evidence](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40698211809/artifacts/12819873331)

All source histories remain immutable. Every internal step independently recomputes bounded +0.45/-0.85m/s² longitudinal commands, lateral movement limited to 0.38m/s, and the current physical state-based three-second anticipatory braking advisory. Every pair is continuously swept-tested at 16 smaller collision intervals per 0.5s step; each accepted substep recomputes the provisional W-prime energy ledger. A collision rejects the scene instead of teleporting riders, overwriting speed or accepting an overlap.

The experiment deliberately isolates only 0.5s **physical decision/integration cadence**, not tactical command cadence, which still comes from recorded A44 source intervals. This is not proof of physical numerical convergence under changed physical timesteps, and not a validated production scheduler.

## Exact comparison: identical checkpoint, commands and horizon

| Measure | A61 3-second autonomous response at native frame size | A62 same 3s response internally refreshed at 0.5s |
|---|---:|---:|
| Collision-free 10-second scenes | **50/67** | **66/67** |
| Swept-contact failures | **17/67** | **1/67** |
| Previously failed scenes rescued | — | **16** |
| Previously successful scenes lost | — | **0** |
| Original 0.5s subset clear | 40/40 | **40/40** |
| Original 2.5s subset clear | 10/27 | **26/27** |
| Mirror outcome differences | — | **0** |
| Renamed rider-ID outcome differences | — | **0** |
| Reflected/renamed first-contact pair mismatches | — | **0** |
| Exact serialized JSON replay mismatches | — | **0** |
| 0.5s reference drift mismatches | — | **0** |

The 17 earlier contact failures were all **longitudinal closing** at a step's beginning, rather than two cyclists already occupying the same collision envelope. After half-second reintegration, 16 disappeared, leaving one longitudinal closing event. **This is substantial evidence of a time-resolution contribution to the *tested* synthetic controller's collisions**, not evidence all real stage overtakes, bunch formations, energy or dynamics are calibrated.

## The single remaining blocker

A62's preserved artifact identifies one failing case:

- Synthetic road: **compact_4m** (4m provisional geometry); **32** riders; variant **v1**; recorded source-frame length **2.5s**.
- Earlier full-field physical start: **12.5s**; old retrospective warning checkpoint ends **17.5s** (warning-frame starts at 15s).
- First swept blocked pair: **r003 / r007** at **13.59375s**, around **1.09375s** after the earlier common physical start.
- First-contact type: **longitudinal closing**; no pre-existing overlap at the preceding substep start.
- Both the coarse and half-second variants fail on that exact first-contact time, despite independently recomputed half-second decisions.
- This contact occurs **before** the old A59/A60 warning start, and therefore cannot be corrected solely by changing decisions made at that later warning.

The pre-existing five-second observation window includes **two earlier physical checkpoint entries** for this 2.5s source case. A future feasibility investigation may begin from an even earlier *actual recorded checkpoint* (not from the later blocked state) and test dynamically bounded braking or safe negotiated space; there is no approval to insert impossible velocity discontinuities.

## Assessment and next action

**A62 technical checks PASS; sporting / physical complete-stage gate NO-GO.** The 66/67 figure is **98.51% of synthetic ten-second 2–32-rider scenes**. It does **not** describe the percentage of completed races, a full 106/168-rider peloton certification or readiness for player tactics or production.

**A63 research focus:** reproduce the compact 4m, n32, v1, 2.5s source scenario starting at **10.0s or the earliest available preceding actual source checkpoint** and compare bounded nonclairvoyant three-second field control with an appropriately early-start matched baseline. Check road-lane occupancy of r003/r007, kinetic closure, power/W-prime, and secondary contacts, while preserving the previously clear 66-case results. Validate full-stage realistic 106/168-rider bunch racing, sourced road geometry, sprint and terrain behavior, drafting, team tactics and classification before any promotion.

No official race engine, Game Center decision, production stage, historical classification, Supabase database, prize payout or game clock was altered.
