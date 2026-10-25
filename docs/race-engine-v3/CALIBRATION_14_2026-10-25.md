# Race Engine V3 — Calibration Batch 14 (25 October 2026)

**RESEARCH ONLY. SPORTING ACCEPTANCE: NO-GO.** The game clock, production workers, legacy engines, current V3 physical engine, historical results and payouts must remain untouched.

## Implemented and verified

1. `src/race-engine-v3/fatiguePowerEnvelopeV3.ts`: an isolated continuous finite-power envelope. A rider with full reserve may temporarily deliver up to 150% of modeled sustainable mechanical watts; a depleted rider gradually falls to 80%. The last 20% of energy is interpolated with a smoothstep polynomial, avoiding the previous abrupt branch at 13% reserve. **These percentages are provisional research hypotheses, not measured sporting physiology.**
2. `src/race-engine-v3/experimentalPowerRaceV3.ts`: the **offline-only alternate power simulator** now caps physically deliverable watts using this continuous envelope when aerodynamic work exceeds modeled sustainable watts. A well-rested rider is no longer mistakenly restricted to SOLO sustainable watts just for participating in a draft-supported group.
3. `scripts/v3/verify-fatigue-continuity-v3.mjs`: tests numerical continuity, reserve monotonicity, finite bounded power, missing-data rejection, offline-only gate, and no results writes. Added to the dedicated V3 GitHub Actions workflow with strict TypeScript validation.

No stage-specific gap targets, scripted regrouping or result templates were added.

## Evidence of eliminated discontinuity

In the same 25-rider synthetic positioning test previously failing at the exhaustion boundary:

| Energy around the 13% boundary | Batch 13 | Batch 14 |
|---|---:|---:|
| Difference in weak rider's 10-second step speed, 13.001% vs 12.999% reserve | 1.847124 m/s | **0.000000 m/s** |

A previous attempted broad smoothing variant eliminated the numerical cliff, but incorrectly capped well-rested riders to ordinary solo sustained power, producing an **extreme 4,308-second Dordrecht tail**. That variant was rejected. The committed formulation preserves the ability to deliver bounded temporary energy-supported power and is a different, explicitly tested model.

## Full-roster read-only experiments

| Frozen offline benchmark | Previous | Batch 14 |
|---|---:|---:|
| Dordrecht 106/106 finish | Yes | Yes |
| Dordrecht on exact winner second | 2 | 2 |
| Dordrecht last gap | +539.745 seconds | **+263.295 seconds** |
| Dordrecht orders executed as attempts | 15 | 15 |
| Dordrecht checkpoint batches | 32 | 30 |
| Guangxi synthetic prep-source rider count | 168 | 168 |
| Guangxi within 1 second of winner | 98 | **98 — still invalid** |
| Guangxi last rider gap | +174.188 seconds | +174.188 seconds |

A deeper private-input, aggregated finish-gap audit found **98 of Dordrecht's 106 riders tied exactly at ~+6.10 seconds**. This is a clear **group-position/energy realism failure** even though the numerical energy cliff is gone and the tail looks less extreme. It is NOT a real-world historical result or an approval to put the engine into official racing.

The Dordrecht run was made locally using a private de-identified supplement of actual source stamina, sharpness, recovery, resistance and preparation modifiers; the supplement **must not be committed, printed or included in public archives**. Guangxi still uses explicitly synthetic missing equipment inputs and lacks 718 m of claimed positive route ascent. Its result is not valid as source-complete sporting evidence.

## Engineering test results

- Node.js v22.16.0; strict TypeScript v5.8.3: PASS.
- 24 available isolated V3 research/regression/audit scripts: **24/24 passed** including original group-lineage and checkpoint tests, core V3 legacy-independent simulations, the new fatigue curve test, source completeness, private-input validation and offline 106-/168-rider stress.
- Deterministic serialization/restart of the entire Dordrecht calculation: PASS.
- Existing legal `offlineOnly: true`, `acknowledgedNoSportingApproval: true` and `sportingApproval: NOT_APPROVED` guard remains mandatory.
- Local research tests do **not** establish sporting correctness, remote GitHub Actions success, full application build success or Netlify deployment.

## Why sporting approval remains closed

1. Eliminate the large **98-rider identical-position/time group** through actual physical pack geometry and positioning, not by distributing synthetic finishing times.
2. Calibrate cooperative energy demand and drafting so chasing neither produces an artificial mass finish nor extreme fragmentation.
3. Recover detailed mountain route geometry and original rider equipment inputs; Guangxi's mountain realism test still fails.
4. Test against independent cycling performance/energy evidence, different route bearings/wind and more than two frozen historical events.
5. Test genuinely resumable small published replay/group shards, 12 Tactical Sectors, 15-minute race execution and end-to-end publication before any approved V3 pilot.

**Production must remain paused at Season 1 Oct 20, 06:38.** Saved game speed is 12× and must not be changed without an separately authorized safe 2× restart.

**Verdict:** smooth finite-energy correction implemented and isolated; sporting quality remains NO-GO.
