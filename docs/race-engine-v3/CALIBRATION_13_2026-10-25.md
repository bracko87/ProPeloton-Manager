# Race Engine V3 — Calibration Batch 13 (25 October 2026)

**Scope:** independent offline physics research only. **Sporting acceptance: NO-GO.** Neither the production Baseline, Mountain V2, Breakaway V1 engines nor existing V3 solver are promoted or routed into official races.

## Important reproduced root causes

**1. The Dordrecht "2 riders at winner time / 9-minute tail" result was previously misleading as a field-wide interpretation.** A reproducible, de-identified, privately sourced full-race replay reveals the 106 riders remain in one contiguous physical group for roughly 90% of the stage. At the finish, approximately 100 share the *same computed time around +5.87 seconds*, while an exhausted outlier finishes about nine minutes behind. This is not realistic peloton energy/group behavior; simply counting riders on the exact winning second hides the error.

**2. A true discontinuity in the existing experimental energy rule.** With the same 25 synthetic riders, start positions, tactics, route and time tick, changing one weakened rider's reserve from **13.001% to 12.999%** produces a speed step from **11.1 to 9.252876 m/s**, a **1.847124 m/s difference for a 0.00002 energy difference**. The `s.energy<.13` threshold is a sharp cliff, not a physically gradual fatigue curve. The new `scripts/v3/audit-exhaustion-cliff-v3.mjs` reproduces and labels this *sporting no-go*; it does NOT pretend a successful calculation demonstrates physically valid racing.

**3. The source-complete mountain candidate still has incomplete terrain.** A read-only Supabase examination found the **World Nations Hilly / Mountain Road Race (13 October, 77 riders)** with all 77 riders having the required stamina, recovery, resistance and preparation fields. However, the 150-km stage claims **1,785 m** of ascent while the coarse recorded profile contains only **720 m** of positive climbing. **1,065 m (59.7%) is unresolved**, and original weather bearings are unknown. The new frozen *route-only* audit stores 14 geometry points and aggregate source-field coverage but **no private rider rows**. Rider-input completeness is not course-input completeness; sporting use remains blocked.

## Completed engineering changes on `main`

- `src/race-engine-v3/experimentalPowerRaceV3.ts`: after a depleted rider's speed is capped, the energy accounting now calculates excess work using **the actual capped speed**, rather than charging all of the unattainable pre-cap target. This is a narrow physical accounting bug fix; it does not alter the 13% cliff, group targeting, power calibration or official execution.
- `scripts/v3/privateEnergySupplementV3.mjs`: strict operator-only input validator requiring **all seven original energy/preparation/resistance values plus de-identified row index**, ordered and unique, with bounded numeric ranges; no guessing or silent missing source resistance.
- `scripts/v3/audit-offline-power-private-v3.mjs`: now invokes that validator rather than silently leaving `resistance` undefined. The previously distributed private supplement was missing resistance; the rebuilt private source fixture was verified from read-only historical values. **No private source fixture or original rider ID is committed to GitHub or included in the public bundle.**
- Added `scripts/v3/verify-private-energy-fixture-contract-v3.mjs`, `scripts/v3/verify-third-stage-source-quality-v3.mjs`, `scripts/v3/audit-exhaustion-cliff-v3.mjs`, and `scripts/v3/fixtures/world-nations-mountain-2000-10-13.route.json`.
- Extended the dedicated research-only GitHub Actions workflow for these three checks; the cliff script records an explicit diagnostic **NO-GO** rather than attempting to silently normalize its output.

## Measured offline comparison

| Research scenario | Previous Batch 12 | Batch 13 energy-work accounting fix |
|---|---:|---:|
| Dordrecht 106 completed riders | 106 | 106 |
| Dordrecht exact winner-time riders | 2 | 2 |
| Dordrecht last rider gap | +540.249 seconds | **+539.745 seconds** |
| Dordrecht 15 attack attempts | 15 | 15 |
| Guangxi 168 completed riders (synthetic missing preparation) | 168 | 168 |
| Guangxi within 1 second of winner | 98 | **98 — still invalid** |
| Guangxi last rider gap | +174.188 seconds | +174.188 seconds |

The accounting fix correctly removes energy charges for unperformed work but has **not resolved flat/mountain sporting behavior**. Both active power-race alternatives remain exclusively offline and unapproved.

Two possible smooth-depletion corrections were compared privately and **rejected**: they increased the Dordrecht last-rider gap to approximately **1,215 seconds** and **688 seconds** respectively without fixing the mountain issue. Neither was committed. This demonstrates why removing the energy threshold requires a revised model of pack-limited physical work, not an arbitrary coefficient change.

## Verification and safeguards

- **22 relevant isolated research/diagnostic scripts passed locally**, including both original frozen-roster suites, the offline experimental runner, private-input schema validation, real-stage route diagnostics, persistent group checkpoints and the intentionally NO-GO energy-cliff audit. Strict TypeScript checking of the V3 modules passed.
- The privately sourced Dordrecht calculation completed identically with repeated checkpoint serialization and interruption; no rider-level original source data was uploaded to the public repository.
- All new commits are under `src/race-engine-v3/`, `scripts/v3/`, `docs/race-engine-v3/` and the dedicated V3 GitHub workflow. The prior V3 motion solver, original production engines, workers, DB rows, official classifications and payouts remain untouched.
- **Remote GitHub Actions run completion, full website build and Netlify status are not independently verified.** Passing synthetic engineering tests is not a sporting pass.

## Next milestone
Implement a smooth, physically power-limited fatigue response **within cooperative peloton work and drafting**, test it against individual power requirements at every checkpoint, and reject any variant that produces 100-rider artificial exact ties or extreme last-rider outliers. Recover actual rider/wind/route data for a complete mountain test; the World Nations fixture demonstrates both rider-input availability and missing altitude geometry. Continue keeping source and historical official outputs separate.

**Both production clocks must stay paused at Season 1, 20 October 06:38, and the stored 12× multiplier must remain unchanged until a separately authorized safe 2× restart.**
