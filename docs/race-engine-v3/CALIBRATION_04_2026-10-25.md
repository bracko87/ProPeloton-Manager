# Race Engine V3 — Calibration Batch 4 (25 October 2026)

**Research-only. Sporting acceptance remains CLOSED. Nothing routed into official race execution.**

## Engineering corrections on GitHub main
- `src/race-engine-v3/physicalRaceEngineV3.ts`: add the **authoritative terminal replay sample** if simulation completes between the ordinary one-minute replay samples. Before this correction the replay could end before the actual finish, despite the classification being final.
- `src/race-engine-v3/physicalGroupTimelineV3.ts`: add checkpoint-resumable physical group lineage with B1/G1 identity across frames, explicit catch/merge/dissolve/finish events and one assignment per rider. Completed riders are excluded from all moving groups and are marked FINISHED, preventing imaginary finish-line catches or post-finish teleportation. Peloton lineage is matched by rider membership instead of selecting the largest group anew every frame. Physical time gaps come from recorded position and measured peloton speed.
- `src/race-engine-v3/routeFidelityV3.ts`: add named-climb annotation vs coarse-profile interpolation audit. This *reports* missing geometry; it never inserts a fabricated gradient or finishing gap.
- Regressions and isolated V3 GitHub Actions workflow expanded to cover terminal frames, real-roster lineage, coherent B1 catches, resumed group projections, physical teleportation and climb discrepancies.

## Verified local results
Node 22 and strict TypeScript compile pass locally (using `--allowImportingTsExtensions`); 13 synthetic physics tests pass. The B1 catch/finish scenario passes and the de-identified Dordrecht run retains **106 unique riders across 194 sampled replay frames**, including a terminal frame where all are finished. Independent group-lineage checkpoint processing produces identical events.

The *sporting* metrics are unchanged by these replay and audit corrections:

| Research baseline | Riders | Same-time winner | Last rider gap |
|---|---:|---:|---:|
| Dordrecht, provisional 8.8 km/h crosswind | 106 | 27 | +428.34 s |
| Guangxi Yizhou–Nongla, coarse route | 168 | 1 | +117.25 s |

These provisional outcomes are **NOT accepted as realistic**, and do not modify historical results.

## Guangxi climb discrepancies
The production input provides a 17-point profile with 1,000 m of summed uphill elevation changes but declares 1,718 m total ascent, a **718 m deficit**. Linear interpolation of the sparse points disagrees with named climbs:

| Finish km | Recorded climb | Annotated gain | Coarse interpolation gain | Missing at anchor |
|---:|---|---:|---:|---:|
| 72.0 | 4.9 km at 4.7% | 230.3 m | 53.08 m | 177.22 m |
| 134.2 | 3.0 km at 4.8% | 144 m | 55.88 m | 88.12 m |
| 165.8 | 3.2 km at 6.8% | 217.6 m | 235 m | -17.4 m |

The first two climbs are under-resolved. The final climb broadly matches. The missing profile geometry must be researched/verified; **do not** fill it with artificial mountains to manufacture selective results. Climb-anchor discrepancies and total missing ascent are not necessarily additive.

## Safety and next gates
- All Batch 4 repository changes are confined to `src/race-engine-v3/`, `scripts/v3/`, `docs/race-engine-v3/` and the dedicated V3 CI workflow. No original engine files, production workers, original results, race routing or database records changed.
- GitHub Actions workflow is updated; **remote CI completion and full application build not independently verified**. Local regression execution is not proof of remote CI success.
- Physical group labels are not yet wired to production commentary or the live/replay UI. The saved physics still requires peloton cohesion, breakaway/chase quality, weather-to-road bearing modeling, summit performance, AI tactics and 15-minute live-window capacity validation.
- Game clocks remain paused at Season 1 Oct 20 06:38 authoritative game time; stored speed multiplier remains 12x. Never restart or change clock without explicit authorization.

**Decision: engineering replay correctness progressed. Release and sporting acceptance remain NO-GO.**
