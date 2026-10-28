# Race Engine V3 — Step 61: earlier-checkpoint autonomous upstream headway anticipation

**28 October 2026 — offline engineering PASS; sporting/production NO-GO.**

## Objective and why the comparison matters

Step 60's fixed alert-time full-field response cleared only **7/67** ten-second stress scenes. That result cannot be directly compared with an experiment that starts the physical field earlier. Step 61 therefore tests three autonomous movement policies **from the same earlier source checkpoint for each of the 67 A56-derived cases**: the A60 current-state lane-intent controller, a new 3-second upstream forecast and a new 5-second upstream forecast. No chosen primary rider is forced to brake in these three experiments; all riders use the same current-source command interpretation and react autonomously.

The historical cases were selected from A56/A59 retrospectively, but **the action policy does not know which rider was selected**, inspect future accepted A44 motion or choose its best future strategy. This distinction is critical to interpreting the evidence.

## Isolated implementation

- [A61 upstream warning and preceding-history observer](../../scripts/v3/a2UpstreamPredictionV3.mjs)
- [Opt-in full-field re-integration and independent swept contact](../../scripts/v3/a2MirrorAndFullFieldProbeV3.mjs)
- [A61 isolated unit controls](../../scripts/v3/verify-a2-step61-unit-v3.mjs)
- [All 67 bounded scenario comparator, reflected/renamed and JSON replay tests](../../scripts/v3/verify-a2-step59-symmetry-and-field-v3.mjs)
- [A61 validation workflow, numerical summary and retained case evidence](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40696862713)

At each physical substep the A61 advisor reads **only current** rider x/y/speed and this substep's bounded requested longitudinal acceleration and lateral displacement. It linearly extrapolates that **current** lateral rate across either a 3- or 5-second horizon, clamping positions at road boundaries, and asks rear cyclists to brake at no more than **-0.85 m/s²** if current or projected lane contact could develop before the rear can safely shed closing speed. At the next substep, the forecast is recalculated. This is a provisional warning heuristic, not fully realistic collision negotiation.

All rider movement remains acceleration-limited (+0.45/-0.85 m/s²), lateral-rate limited (0.38 m/s), continuously pairwise swept-checked, W-prime accounted and fail-closed on contact. No instantaneous lateral teleport, velocity reset, post-hoc collision resolution or official write was introduced.

## Source history and common-start comparison

- **67/67** scenarios had a valid earlier start, between **2.5 and 3.0 seconds before** the A59/A60 alert-time source checkpoint.
- **454** preceding physical snapshot entries were available in the corresponding per-case five-second audit windows (some snapshots repeat across related cases; not unique races).
- Every comparator was restarted from the **identical** original pre-substep position, speed, energy and road shape in that case and was evaluated for the next **10 seconds**.
- Source histories comprise **2–32 synthetic riders**, not validated full-stage 106/168-rider pelotons. Historical A44 tick intentions are used as current commands; neither policy is yet integrated with live tactical decisions.

| Policy from identical earlier checkpoint | 10-second clear | Collision-blocked | Rescued versus earlier baseline | Regressed versus earlier baseline |
|---|---:|---:|---:|---:|
| Earlier-start A60 lane-intent baseline | **32/67** | 35/67 | — | — |
| Autonomous upstream 3-second forecast | **50/67** | 17/67 | **19** | **1** |
| Autonomous upstream 5-second forecast | **47/67** | 20/67 | **19** | **4** |

By physical time resolution:

| Step size | Matched baseline | 3s upstream | 5s upstream |
|---|---:|---:|---:|
| 0.5 seconds (40 scenes) | 25/40 | **40/40** | 40/40 |
| 2.5 seconds (27 scenes) | 7/27 | **10/27** | 7/27 |

The longer 5s lookahead generated more upstream pair alarms (**3,607** vs **3,078**) and more bounded braking events (**3,018** vs **2,769**) but performed worse as a whole. These counts include repeated rider-step decisions, not unique riders. One 5s first contact happened before the old A59/A60 warning start, proving that even initiating earlier does not guarantee safety.

## Technical fairness, deterministic replay and regressions

All A61 5s matched-field tests passed: **0 mirrored-road outcome differences**, **0 renamed-identity outcome differences**, **0 mirrored or renamed first-contact pair differences**, **0 exact JSON re-run mismatches**. A61 independent unit checks verified nontrivial approaching pairs, physically separated lanes, reflection, relabeling, invalid rider identities and preceding snapshot counts. The A59/A60 baseline reproduced unchanged. Existing A58–A39 regression and full-stage simulation workflows remain intact.

A major qualification: the **3s candidate still regresses on one of the seven earlier-baseline successful 2.5s scenes**, and **17/67** scenes still fail continuously swept contact. The 3s policy is the best *screened research candidate*, **not** an approved real-time race rule. The reason for that one regression and the remaining 17 collisions has not yet been isolated. A five-second lookahead must **not** be presumed superior simply because it fires earlier.

## Production, realism, and Step 62

**Engineering PASS / sporting NO-GO.** No live race engine, production stage, Supabase object, club, historical result, classification, payout or game-clock state was modified. The latest coupled field is still 2–32 synthetic riders, not a complete sourced 106/168-rider stage.

**Step 62:** inspect the 17 first-contact failures and the single 3s regression against the same earlier baseline, preserving the common initial state and checking whether over-braking, another rider's merging intention, or initial physical crowding causes the divergence. Introduce only bounded physically motivated cooperative response candidates with full mirror/rename parity. Require **zero regression** in comparable clear cases before any candidate is promoted, and continue 106/168-rider source calibration, realistic road widths, groups/gaps, terrain, energy and tactical integration.
