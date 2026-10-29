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

**Measurements and CI results:** not yet validated until the actual GitHub logs are read. Step102 best baseline is 10 seconds, and milestone A sporting approval is still NO-GO. Readiness estimate ~35%.
