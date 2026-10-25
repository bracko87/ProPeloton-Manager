# Race Engine V3 — Calibration Batch 7 (25 October 2026)

**Research-only; sporting acceptance: NO-GO.** No V3 engine activation, live command deployment, official result write, worker deployment or game clock change.

## Validated narrow correction
The V3 research solver previously preserved `attackUsedAtKm` after an attacker had been physically reabsorbed. Because its escaped-rider logic checked the old marker and a 90-m lead above midfield, that rider could later receive an **uncommanded escaped-rider speed bonus** without another attack.

The isolated source now retires that expired attempt when: the actual attack command is no longer active, the rider has no active attack key, and the rider has returned to within 25 metres of the current field median position. The historical `attackAttempts` count remains intact. A physically clear breakaway is not retired. The field-median criterion is a **provisional catch proxy**, not yet a fully physical group-lineage detector; it must not be described as a finished sporting model.

Added `scripts/v3/verify-breakaway-catch-lifecycle-v3.mjs` to test caught-rider pace, history preservation, still-escaping riders and deterministic serialized checkpoint resumption. Registered this test in the dedicated V3 GitHub Actions workflow.

## Frozen real-roster comparison

| Isolated calculation | Same time as winner | Final rider gap |
|---|---:|---:|
| Dordrecht 106 riders, direction-neutral forecast, before correction | 11 | +505.20 s |
| Dordrecht 106 riders, direction-neutral forecast, after correction | 5 | +413.93 s |
| Dordrecht 106 riders, explicitly synthetic 22 km/h crosswind, after correction | 13 | +511.03 s |
| Guangxi 168 riders, coarse mountain geometry, before and after | 1 | +117.25 s |

These figures describe **experimental simulations**, not revised historical results. Neutral wind means unknown road bearings were not invented. The synthetic crosswind is not a verified historical wind condition. Guangxi's coarse elevation record still omits approximately 718 m of declared climbing. These results do **not** establish realistic finishing distributions.

## Rejected cooperative-peloton integration
A separate cooperative velocity model was prototyped and tested locally. It calculated group pace from nearby nonattacking riders, independently of the leading attacker's temporary acceleration, and passed pure-component continuity/array-ordering tests. **It failed real-roster sporting checks:** Dordrecht produced only one rider at the winner's time and approximately +1603.13 seconds at the tail; Guangxi produced approximately +86.61 seconds at the tail.

Accordingly **that preview was rejected and was NOT merged into the V3 race solver**. Its tests were useful in identifying overly restrictive draft support and the danger of selecting a coefficient to make one race look plausible.

## Verification performed
- Local Node.js 22: **13 synthetic physical-engine regression tests passed**, new attack retirement/resume regression passed, route/group lineage, wind, slipstream candidate, Dordrecht and Guangxi frozen-roster tests passed, and comparative weather harness completed.
- Strict TypeScript checking of isolated V3 modules passed locally.
- GitHub `main` changes were kept within `src/race-engine-v3/`, `scripts/v3/`, the dedicated V3 workflow and this report.
- **Remote GitHub Actions success and full application production build remain unverified**; this is *not* a production release.

## Next no-go criteria
1. Replace midfield-proxy caught status with actual physical group overlap/trajectory, eliminate hidden order lifetimes and prohibit re-attacks without accepted user/AI orders.
2. Implement and benchmark genuinely cooperative pursuit from energy-bounded team contributors, not direct speed copying from an adjacent accelerating rider.
3. Add more representative real-roster flat/hilly/mountain tests, measured course bearings, validated altitude profiles and AI tactical diversity; no fixed result templates.
4. Check stable B1 identity, catch event, official and replay continuity across all checkpoints.
5. Load-test 12 Tactical Sectors, 15-minute maximum live race, and result publication before any authorized pilot.

**Legacy engines are untouched and retained.** Both production game clocks stay paused at Season 1 October 20, 06:38. Stored multiplier still 12x; 2x reconfiguration and unpause require later explicit permission.
