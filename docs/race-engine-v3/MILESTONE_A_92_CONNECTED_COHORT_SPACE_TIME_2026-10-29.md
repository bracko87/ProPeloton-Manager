# Race Engine V3 — Step 92: connected multi-row space-time occupancy research

**Research-only experimental controller. 29 October 2026.** No live race engine controller, classifications, Supabase record, W-prime data, game clock or payouts are changed.

## Verified Step91 handoff
The completed [Step91 workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40888102673) passed all four technical jobs, physical 16/16 mirror/name checks, React build and exact 90+90 physical/independent overtake observer replay for surviving 8/32-rider races. All eight large 106/168 five-wide cases still terminated with genuine original A64 swept-body contacts within 7.5–13 seconds, 0/8 full 180-second finishes. The improved 32r staged balanced completed 180s with 80 sustained >=3s passes but 678 physical lane changes; double strict finished with 56 passes/991 changes and balanced with 55/966. Protected Step86 staged 80/411 and double 70/678 are sporting benchmarks.

## Step92 new connected-group planner
The isolated [Step92 cohort module](../../scripts/v3/a2Step92CohortSpaceTimeV3.mjs) builds an undirected conflict graph of *all* currently overlapping physical steering envelopes within the upcoming gate region. Connected components contain multiple physical starting rows, not simply a pair. It analyzes the entire component's competing moves: each pair uses achieved front/rear x, geometric steering distance and symmetric center distance for ordering. Truly symmetric ties grant no unique priority. A time-indexed projection at 0.5-second spacing over 5.5 seconds conservatively compares full bicycle-width lateral envelopes and longitudinal bounds from original legal acceleration and braking to flag possible future occupied tubes. This is a warning for *possible* overlap and is NEVER equivalent to a physical contact proof or a guaranteed free route. Provisional holds/pace requests across the connected component try to protect gaps without teleporting riders or imposing a standstill.

Two new opt-in policies, cohort_strict_v1 and cohort_balanced_v1, compare baseline, Step78 joint, protected Step86 gap wave, Step90 trajectory flow, Step91 lease flow and Step92 cohort hold/yield/flow through the original A85 three-tick guarded selection and an independent real A64 first-tick resweep. Existing Step76/78/85/86/87/88/89/90/91 policies and A64 swept bicycle, road edge, acceleration, steering and W-prime remain unchanged. No guessed future path is committed.

## Required validation
The [Step92 workflow](../../.github/workflows/v3-step92-cohort-space-time.yml) executes independent pure connected-component/mirror/renamed/reversed input/identical geometry checks and input-immutability; protected Step78/85/86/87/89/90/91 tests; eight full requested 180s original A64 106/168 five-wide trials across staged/double routes and strict/balanced policies; 16 full swept physical mirror/name comparisons; 8/32 original A64 sporting and independent sustained >=3s overtaking plus zero near-stops and exact 90+90 serialized physics/observer replay for actually completed races; and a React production build.

A green original-physics job may mean *correct fail-closed collision rejection*, not actual successful racing. Review actual accepted seconds, first contact, completion, 32r passes/lane changes and replay in logs before claiming an improvement. Preserve Step86 benchmark and protected A64 engine. **Milestone A full 106/168 five-abreast sporting clearance remains NO-GO until evidence demonstrates all true 180s with every cyclist beyond second gate, no near-stop/road/energy/contact failure, credible passes and restrained weaving. Milestones B/C remain unauthorized.**


## First completed Step92 original-body audit (29 October 2026)

The [dedicated Step92 Actions workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40889782403) executed original A64 full-body physics. The React build, the eight large 106/168 physical cases, and the 16 physical mirror/renamed + 8/32 full sporting/replay job all completed SUCCESS as technical jobs. The separate protected regression job must be read from the workflow's final status; **technical green does not mean sporting clearance**.

### Eight 106/168 five-abreast attempts, original 180s requested

**0/8** successfully completed 180 seconds; all eight were rejected at a real original swept-body collision before the second narrowing, with zero near-stop ticks *before rejection*. They are not approved full races.

| Riders | Route | Strict accepted | Balanced accepted | Genuine first-contact reason |
| --- | --- | ---: | ---: | --- |
| 106 | staged_pinch | 5.5s | 5.5s | SWEPT_CONTACT |
| 106 | double_pinch | 9.5s | 6.5s | SWEPT_CONTACT |
| 168 | staged_pinch | 5s | 5s | SWEPT_CONTACT |
| 168 | double_pinch | 10.5s | 9.5s | SWEPT_CONTACT |

This is a **regression** versus Step90 (106 staged 14.5s; 168 staged 13s) and Step91 (up to 13s staged and 12s double). Wider conservative occupancy projections incorrectly conflate many merely *possible* future closings, suppressing useful steering/gap creation before initial density can relax.

### Actual 8/32 original-physics passing and exact checkpoint

Original mirror/name cases passed **16/16**. All actual 180-second runs below crossed the second gate, had zero near-stops, no committed road/contact/energy failure, and exact 90+90 serialized A64 physics + independent ≥3-second passing-observer equality. The failed 32 double balanced case did not claim replay success.

| Riders | Route | Policy | Accepted | Near-stop ticks | Real lane changes | Sustained ≥3s overtakes | Exact 90+90 |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| 8 | staged | strict | 180s | 0 | 158 | 8 | Yes |
| 8 | double | strict | 180s | 0 | 109 | 7 | Yes |
| 32 | staged | strict | 180s | 0 | 621 | 68 | Yes |
| 32 | staged | balanced | 180s | 0 | 596 | 78 | Yes |
| 32 | double | strict | 180s | 0 | 1052 | 40 | Yes |
| 32 | double | balanced | 8.5s contact | 0 before reject | 3 | 0 | Not reached |

Protected Step86 sporting reference remains better: 32 staged 180s / **80** sustained ≥3s passes / **411** lane changes; double 180s / **70** passes / **678** lane changes. Step92's full 32r passes occur with too much weaving or fewer passes.

## Decision and next physical research target

**Step92 remains synthetic opt-in research and is sporting NO-GO for full 106/168 five-abreast racing.** The multi-row graph is valid as a potential-warning model, but pessimistic full-horizon reachable tubes are too broad to assign right-of-way. The next engineering task should diagnose *actual contact formation before the first gate* and design bounded attainable group speed/lateral trajectories for the dense five-wide launch, with physical swept clearance at each 0.5s and explicit time-to-complete lateral moves, not just more conservative envelope warnings. Include accepted physical x/y/v snapshots of failure pairs and neighboring rows, use true longitudinal acceleration limits and W-prime, avoid stopwaves, and retain the protected 32r benchmark and full 106/168 × two routes × 180s/independent overtaking/replay acceptance gates.

**Milestone A sporting 106/168 full-field 180s remains NO-GO. Milestones B and C not authorized.**
