# Race Engine V3 — Calibration Batch 6 (25 October 2026)

**Scope:** independent research only. **Sporting acceptance remains NO-GO.** No V3 pilot or live-race execution is authorized.

## Why this batch exists

The current physical solver in `src/race-engine-v3/physicalRaceEngineV3.ts` uses a proximity test that switches drafting support off abruptly outside 24 metres, and adjacent riders may inherit the velocity of a rider already accelerating ahead of them. Those are candidate causes of excessive sensitivity in breakaway formation and peloton separation. **They are hypotheses, not yet demonstrated as the unique root cause.** The rest of the engine has not been changed.

## Rejected attempts — do not ship as physics improvements

Local, uncommitted simulations compared each experiment against the same frozen Dordrecht 106-rider fixture. Both proposals failed the broader sporting check despite promising unit-level behavior.

| Local research candidate | Neutral same-time winner | Neutral last gap | Synthetic 22 km/h crosswind same-time winner | Decision |
|---|---:|---:|---:|---|
| Prior unmodified V3 | 11 / 106 | +505 s | 13 / 106 | Existing inadequate baseline |
| Smooth 16–32 m following + reduced copying of attack pace | 45 / 106 | +3,590 s | Not promoted | Rejected; existing synthetic breakaway survival test failed |
| Smooth 22–26 m following around drafting cutoff | 41 / 106 | +503 s | 103 / 106 | Rejected; implausible mass finish under synthetic strong crosswind |

**Neither rejected proposal was committed into the actual V3 race solver**; the original physical motion core remains unchanged.

## New isolated shadow component on main

- `src/race-engine-v3/slipstreamResponseCandidateV3.ts`: pure, bounded, smooth proximity model. It scales shelter with grade, wind, cobbles and rider energy and does not hand a free full acceleration to followers of an actively attacking rider. **It is deliberately not imported into the current simulator**.
- `scripts/v3/verify-slipstream-response-candidate-v3.mjs`: checks no abrupt jump at 24 metres, monotone physical shelter, exhausted riders' reduced benefit, explicitly ordered chase vs passive following, mountain and crosswind response, and invalid input handling. Local test passed.
- The isolated V3 GitHub Actions workflow now includes these tests and strict TypeScript checking. **Remote GitHub Actions completion has not been independently confirmed**.

A passing isolated helper test is NOT proof that its integration into the peloton solver produces a realistic race.

## Improved real-roster group diagnostics

The sensitivity report now distinguishes the **frontmost group** from the **largest physical pack** instead of reporting only the first group's size.

| Dordrecht at ~5% course progress | Neutral (unknown bearings) | Synthetic full crosswind |
|---|---:|---:|
| Frontmost group riders | 97 | 4 |
| Largest physical pack riders | 97 | 89 |
| Largest pack's distance behind the front | 0 m | 365.5 m |

Thus, the strong synthetic crosswind scenario did not scatter nearly everyone individually; it created a leading four while 89 were still physically together. The actual credibility of the **early attack gap and chase response** remains unproven because we lack road-segment bearings, and the synthetic scenario is not an observation.

Additional frozen-simulation evidence:
- Dordrecht neutral: **11/106** at winner's official time, last rider **+505.20 seconds**.
- Dordrecht synthetic full 22 km/h crosswind: **13/106** at winner's official time, last rider **+511.03 seconds**.
- Guangxi mountain: **168** complete, last rider **+117.25 seconds**, but **718 m** of the declared route ascent is absent in the coarse source elevation points.

## Validation performed

Local Node 22 simulation-only checks passed: **13 synthetic physics tests**, pure group and B1 lineage checks, route completeness checks, wind-vector tests, candidate helper continuity tests, and both frozen real-roster deterministic checkpoint runs. Strict TypeScript checking of the separate V3 modules passed. The sensitivity report explicitly remains `sportingAcceptance: NOT_APPROVED`. These results do **not** establish full website build, production CI, realistic racing or publication readiness.

## Next focused engineering task

Develop a coordinated, **simultaneous physical peloton movement** calculation rather than relying on sequential nearest-front speed inheritance. Validate:
1. attack separation over time, not just successful attack flags;
2. independently commanded chase and accumulated rider energy;
3. physically continuous following at all separation thresholds;
4. stable results under small wind/drafting changes, on multiple real stage rosters;
5. realistic summit splits after acquiring accurate climb geometry.

Reject candidate physics that only improve one finish-time statistic by spoiling breakaways or inducing mass same-time results. Do not synthesize finishing groups or inject arbitrary time gaps.

## Production safety

Batch 6 changes are restricted to `src/race-engine-v3/` **new research-only module**, `scripts/v3/`, this report and the separate V3 CI workflow. Legacy Baseline, Mountain V2, Breakaway V1, selector and all production workers are unchanged. **No SQL writes, game-clock changes, stage assignments or official race recalculations.** Game time stays paused at Season 1, 20 October, 06:38. Secondary multiplier remains **12×**, not yet reconfigured to agreed **2×**.

**Sporting gate: NO-GO. Legacy recovery available.**
