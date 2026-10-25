# Race Engine V3 — Calibration Batch 8 (25 October 2026)

**Status: ISOLATED RESEARCH; SPORTING NO-GO. Production race routing, existing engines, official data and clock must not be altered.**

## What changed
1. Replaced one particular ghost-attack marker cleanup that formerly depended on the *field median plus 25 metres*. The current V3 research engine classifies sorted rider positions into contiguous physical packs (24 m neighbour spacing), identifies the largest physical pack and marks a former attacker as **inside**, **behind** or **clear ahead** of it. An expired attack is retired if the rider has physically joined or fallen behind that pack. A rider genuinely clear ahead retains their marker. No artificial grouping or time gap is inserted.
2. Added `src/race-engine-v3/physicalAttackLifecycleV3.ts` and a deterministic lifecycle regression. The full 106-rider Dordrecht and 168-rider Guangxi frozen tests retained **identical** official-simulation output statistics after this replacement.
3. Added `src/race-engine-v3/cooperativePursuitV3.ts`, a separate **SHADOW controller, not imported into the race motion solver**. It groups riders by actual coordinates, requires a physical gap of at least 120 m between packs and an explicit chase command, computes diminishing-return cooperative pace bounded by contributors' sustainable speeds, and reports per-contributor energy duties. It does not move riders, subtract their energy or publish results.
4. Added pure pursuit tests and a read-only shadow test against the saved 106-rider Dordrecht replay. Registered new checks in the dedicated V3 isolation workflow.

## Locally verified results
- Node.js **v22.16.0**, TypeScript **v5.8.3** strict compilation for all V3 modules: PASS.
- The original **13 synthetic physics tests**: PASS. Existing B1 identity, route, wind and former-catch checks: PASS.
- New physical catch classification and deterministic resume tests: PASS.
- New team-pursuit invariants (real front gap, explicit workers, bounded speed, effort spend, fatigue cutoff, array-order independence): PASS.
- Read-only Dordrecht shadow: **32 sampled research checkpoints**, of which **8 physical groups were eligible to be cooperatively chased**. Peak proposed pace improvement **0.3801 m/s**; positive proposed worker energy cost. These are candidate values only, never applied to the actual race.
- Frozen full race baseline, after revised catch test: **Dordrecht 106 riders, 5 winner-time riders, +413.93 seconds last-rider gap**; **Guangxi 168 riders, 1 winner-time rider, +117.25 seconds last-rider gap**. Both retain identical summarized outcomes to Batch 7.

## Remaining important limitations
- Selecting the *largest current physical pack* is a provisional way to identify the peloton, not stable historical group identity. When a breakaway becomes larger than the true peloton, or all riders scatter, this classifier may not represent actual race lineage. The validated `physicalGroupTimelineV3` tracking must ultimately be integrated into the physical engine's checkpoint state before sporting approval.
- A 24 m pack-distance cutoff is a research grouping parameter, not scientifically calibrated across speeds, gradients and road geometries. It must be validated against real physics; do not equate it to a confirmed catch in all circumstances.
- The proposed cooperative pace/energy has **not been integrated or benchmarked as an active calculation**. No claim that it improves full race sporting realism is justified.
- The Dordrecht road bearings are unavailable, so wind exposure remains direction-neutral by default. The Guangxi sparse course remains short **718 m of declared ascent**. Do not invent wind, mountains or target finishing groups.
- Current real-race B1 timeline samples have no verified catch event in the frozen replay; synthetic catch tests prove only structural correctness.
- GitHub main contains this **isolated prototype and checks**. Remote CI success and the full application build are not independently verified. No production worker deployed, routing switched, tactical-sector UI integrated or official result written.

## Next engineering milestone
Build **group lineage into the authoritative simulator's checkpoint state**, then test a real chase while subtracting cooperative contributors' energy. Only promote a changed full-race solver after hard acceptance of breakaway survival, catches, finish gaps, deterministic resume and sensitivity on multiple routes.

**Production guard:** keep both clocks paused at Season 1 October 20, 06:38; the saved multiplier remains 12x until separately approved and safely changed to 2x. Do not resume the game without express user authorization.
