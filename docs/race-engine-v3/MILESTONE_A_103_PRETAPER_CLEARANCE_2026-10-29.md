# Race Engine V3 — Step 103, pre-taper longitudinal clearance

**29 October 2026. Offline opt-in research only.**

## Why

Step102's 12 real A64 physical-trajectory experiments failed before the first gate, accepted 6.5–10 seconds. Root cause supported by original source and independent regression: original A64's four-second road-environment lookahead forces an outer rider inward while a side neighbor still occupies the adjacent lane; the next 0.5s swept body check correctly rejects this overlap. Simply holding lateral target at current lane does not stop the mandatory physical road forecast. Step100 two-gate time appointments are merely necessary optimistic schedules.

## Step103 experiment

The [Step103 research candidate](../../scripts/v3/a2Step103PreTaperClearanceV3.mjs) develops five bounded pre-taper **longitudinal speed profiles** that begin while the starting road is still wide. Outer riders request slower, inner riders faster and center riders intermediate speeds, with two controlled row-phase alternatives, and two modes optionally requesting a merge only when the neighboring current body clearance is available.

Five policies are preopen_moderate, preopen_deep, row_phase, early_join and frontload_inner. Each policy is mirror-neutral based on *starting physical geometry*, not rider ID, and remains fully subject to original A64's acceleration, braking, live road-envelope forecast, 16-substep collision sweep, finite rider W-prime and Step95 achieved moving-speed floor. No rider may be teleported, no collision/rejected future state is committed, and Step101's **exact eight-second continuous membership rule** remains an observation of actual achieved rider positions—not a speed lock or collective bicycle rigid body.

### Acceptance limits

Initial success is a longer *accepted physical prefix* in 106/168 five-abreast fields on both original staged and double narrowings, not another timetable. Count a first-gate physical pass only if **every actual rider x clears 1020m**, second gate only if every x clears 1470m. Full sporting GO would still require 180s, no collisions/crawl/stops, real overtakes, all routes, mirror/renamed fairness and independent checkpoint/replay. Any fail-closed collision or movement veto remains a NO-GO; Step86 32-rider and Step101 group baselines must stay intact.

### Verification

The dedicated [Step103 GitHub workflow](../../.github/workflows/v3-step103-pretaper-clearance.yml) independently runs small original A64 witnesses and checkpoint serialization; **20 full-physical 30-second-at-most A64 attempts** (five strategies × 106/168 riders × staged/double), truthful first collision/sporting-veto diagnosis, the eight-second grouping regression, protected Step86 baseline and production React build. All research is synthetic: no Supabase, payouts, clock, game results, production engine switch or stage publication. Tests do not claim 180-second acceptance from a 30-second prefix.

## Measured original-A64 physical outcomes (29 October 2026)

[Step103 GitHub Actions, final collision-detail run 40942161641](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40942161641): 20 actual original-A64 synchronized five-wide movement attempts, five distinct early longitudinal speed/merge profiles, both 106- and 168-rider formations, staged and double pinch. The micro original-A64 + serialized 1+1 second checkpoint, large physical-measurement and React build test jobs passed; the protected Step86 regression job was still running when this result was initially documented.

### Accepted actual synchronized original A64 seconds (30s requested per run)

| Pre-taper profile | Staged, both 106 and 168 riders | Double pinch, both 106 and 168 riders |
| --- | ---: | ---: |
| preopen_moderate | 10.5s | 8.5s |
| preopen_deep | 10.5s | 9.0s |
| row_phase | 9.5s | 8.0s |
| early_join | 10.0s | 8.5s |
| frontload_inner | **11.0s** | 9.0s |

Every attempt failed the next original-A64 synchronized SWEPT_CONTACT gate: **0/20 30-second completions, 0/20 full first-gate passages, 0/20 180-second sporting success**. Step102 best was 10.0s. The +1.0s best accepted prefix is real, but NOT a solution to either narrowing, overtaking, or first-gate throughput. Every accepted state remained moving above 7.3m/s in measured scenarios and the field remained one peloton by the agreed **consecutive <=8s group** semantics. No rejected bicycle state was accepted or published.

### Specific repeat collision: leader outer vs overtaking inner riders from many rows back

The source-grounded trace at the first rejected original A64 swept microinterval reveals a clear structural failure in all 10 geometries/strategies for the 106-rider runs, reproduced at 168:
- **r000**, leading **OUTER** rider, is in every first rejected pair.
- Its collision partner is an **INNER** rider in a trailing starting row between 4 and 8: r021 (row 4), r026 (row 5), r031 (row 6), r036 (row 7), or r041 (row 8), depending on the speed profile and road width.
- Both are on the same physical side. In all first rejected contacts, achieved transverse separation approaches the original 0.8m body threshold while longitudinal separation is within the swept overlap region (often ~0.9–1.9m).
- The original A64 impending-road preview is **forcing r000 inward**; its lateral path is not a discretionary speed-controller action. Repeatedly accelerating inner riders to open room for same-row outer riders merely causes *inner riders several rows behind* to catch the leading outer rider at the wrong time and place.

**Conclusion:** the dominant blocker is a multi-row, same-side **global merge-order / longitudinal spacing conflict**, not missing gate appointments or a failure to classify riders into peloton. The next solver must coordinate physical precedence throughout the *whole moving corridor*: ensure riders from all relevant rows maintain necessary signed longitudinal clearance against every mandatory inward-shifting outer rider while preserving road width, finite W-prime, minimum moving speed and mirror neutrality. Do not attempt to solve this by inventing group speed, collapsing 106/168 riders into one physical object, disabling A64 collision or accepting a timetable without a swept witness.

Current decision: **Milestone A sporting NO-GO**, estimated overall V3 readiness still ~35%. Live production engine and Supabase records remain unchanged.
