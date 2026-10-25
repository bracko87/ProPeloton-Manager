# V3 Calibration Batch 11 — Source-complete rider power gate

**25 October 2026 — isolated research, sporting approval BLOCKED.**

## Engineering delivered
- `src/race-engine-v3/riderPowerAdapterV3.ts`: maps flat/climbing/endurance/resistance, chronic fatigue, exact starting stamina, sharpness, recovery, morale and equipment preparation onto a *provisional* sustained-watts and transient-power model. It **refuses incomplete source values by default**; historical CSV proxies must be explicitly enabled and remain labelled `research_proxy`.
- `src/race-engine-v3/pelotonPowerBalanceV3.ts`: preserves the existing unconnected shadow pack-power solver, now deducting extra chase/attack energy according to the individual preparation `inStageEnergyCostMultiplier` when supplied; invalid multipliers fail closed. A source-complete row requires both equipment effect and energy-cost multiplier.
- `scripts/v3/verify-rider-power-adapter-v3.mjs`: verifies skill, terrain, fatigue, sharpness, equipment monotonicity, stamina, repeated efforts, deterministic energy debit, nonmutation and incomplete/invalid inputs.
- `scripts/v3/audit-rider-power-source-coverage-v3.mjs`: evaluates *both entire* frozen historical rosters as **shadow-only** with explicit audit of proxy/source coverage.
- `scripts/v3/fixtures/production-energy-source-coverage-2026-10-25.json`: stores only aggregate historical source attribute observations, without original rider identifiers or source records.
- Dedicated V3 GitHub Actions workflow extended to run both new scripts and strict TypeScript validation.

## Validation and real-roster shadow results
Locally on Node.js 22, **17 of 17 available V3 research test scripts passed**, as did strict TypeScript checking of V3 source modules. The original standalone legacy-isolation tests were not re-executed in this portable test directory. **Remote GitHub Actions, full application build, Netlify production release and live website behavior have not been independently verified**.

| Frozen research race | Riders | Sampled physical packs | Median proxy sustained power | Average difference vs existing V3 trajectory |
|---|---:|---:|---:|---:|
| Dordrecht 118.5 km | 106 | 23 | 257.10 W | 1.568 m/s |
| Guangxi 165.8 km | 168 | 33 | 298.85 W | 1.634 m/s |

**Every sample remains proxy-derived; source-complete rider samples: 0.** The comparison trajectory is the previous *unapproved* V3 solver, not measured cycling performance. A smaller difference from that solver is **not proof of calibration, physics realism or eligibility for official racing**.

Read-only source observations demonstrate precisely why the full raw rider fields are needed: average starting stamina/sharpness/recovery at Dordrecht were 72.91/43.62/63.10 versus 80.37/74.19/76.63 at Guangxi. The prior frozen V3 CSVs do not encode these original values per rider. The separate production source also includes equipment modifiers; Guangxi's average equipment effect was not established. **No source personal identifiers or original raw rider records have been exported.**

## Acceptance gate / next action
1. Establish a safe de-identified, source-complete fixture for both races (including preparation modifiers and provenance), not fabricated stand-ins.
2. Calibrate mechanical power/mass/drag/energy terms using independent sport/telemetry evidence; do not fit only to the old V3 solver.
3. Only then attempt an explicitly opted-in *offline* full-race alternate power simulation, test sensitivity across seeds/weather/attack sequences, and reject false catches, 100-rider mass finishes and implausible climbs.
4. Preserve the separate 12-sector live engine, checkpoint/shard and publication goals until physics and capacity gates pass. Guangxi still has 718 m of unmatched elevation in the source profile.

**No legacy engine, stage selector, official payout, published result, active V3 motion solver, production race worker or game clock was modified. The production game stays paused at Season 1 Oct 20 06:38; the saved speed remains 12×, not yet 2×.**
