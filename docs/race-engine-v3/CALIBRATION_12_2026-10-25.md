# ProPeloton Manager — V3 Calibration Batch 12

**25 October 2026 | research-only; sporting acceptance: NO-GO.**

## First actual full-race alternative power run

For the first time the experimental **collective-power** solver calculated 106 complete Dordrecht rider trajectories independently of the original V3 physical-race engine. This is a separate module:
`src/race-engine-v3/experimentalPowerRaceV3.ts`.

The solver uses physical positions, evolving contiguous groups, a collective bounded-watt pace, solo power bursts for attacks, energy costs, capability-dependent climb limits, 10-second steps and physical finish-line interpolation. Physical group identities and replay samples are kept within a resumable deterministic checkpoint.

**The solver is not imported by the production race selector, legacy engine, existing research motion solver or Supabase production workers.** It requires both `offlineOnly: true` and `acknowledgedNoSportingApproval: true` to run. It always returns `sportingApproval: NOT_APPROVED` and `officialWrites: 0`; no production database or publishing code is present.

### Source audit

A read-only Supabase count against the frozen simulation input snapshots found:

| Original stage snapshot | Riders | Start stamina, sharpness, recovery and morale | Equipment modifier | In-stage energy-cost modifier |
|---|---:|---:|---:|---:|
| Dordrecht 2000-10-15 | 106 | 106 | 106 | 106 |
| Guangxi 2000-10-19 | 168 | 168 | **0** | **0** |

The Dordrecht experimental calculation used a **private**, de-identified, row-aligned projection of these values, including original `resistance`, with stamina/sharpness rounded to 0.01. Average start stamina 72.91, sharpness 43.62 and recovery 63.10 matched the original aggregates. **The individual source supplement is intentionally NOT committed to this public GitHub repository or included in public research packages.** The operator runner requires a local environment-supplied path.

Guangxi cannot truthfully pass the source-complete gate: all 168 rows lack both preparation modifiers. This is a source-data blocker, not an excuse to default to invented zero/one values in a real-source experiment.

### Experimental output (not official)

| Comparison | Dordrecht source-field run | Guangxi synthetic-source stress |
|---|---:|---:|
| Riders completing | 106/106 | 168/168 |
| Riders within one second of winner | **2** | **98** |
| Final rider gap | **+540.25 s** (9m00s) | **+174.19 s** (2m54s) |
| Attempted attacks | 15 | 0 |
| Replay/group checkpoint samples | 184 | 254 |
| Source completeness | All adapter inputs present in private projection | Missing original equipment fields — **synthetic values** |
| Sporting approval | **FAILED** | **FAILED** |

**Dordrecht:** the alternative engine gives too much flat-race fragmentation (104 riders more than one second behind the winner). It is not an acceptable realistic result, even though a 15-attack race computes correctly.

**Guangxi:** a deliberate synthetic-only stress fixture (never claimed to contain real missing source values) exposes overlarge summit grouping: 98 riders finish within one second. The coarse route also omits **718 metres** of its declared ascent. Do not tune a scripted final gap to mask these physics and source weaknesses.

### Verified engineering integrity

- Offline-only and no-sporting-approval gate is mandatory; incomplete source attributes fail closed.
- All synthetic 18-rider tests passed, including actual energy depletion from an attack and no-attack comparison.
- The 106-rider Dordrecht calculation was interrupted and serialized in **32 irregular checkpoint batches**; the entire final results and replay/group history matched uninterrupted output byte-for-byte.
- Every rider finished once; physical group membership and replay time stayed synchronized.
- A deliberately corrupted checkpoint with missing physical-group history was rejected.
- Strict TypeScript validation of new and existing research modules passed locally.
- No production execution, official payout, historical result mutation, existing V3 solver replacement or game-clock edit occurred.

`scripts/v3/verify-offline-power-v3.mjs` and `scripts/v3/audit-guangxi-synthetic-power-v3.mjs` run in CI. `scripts/v3/audit-offline-power-private-v3.mjs` is an **operator-only** offline runner requiring `V3_PRIVATE_SOURCE_SUPPLEMENT`; its rider-level fixture is not committed.

## Rejected correction experiment

A stronger sustained-climbing cap was tried locally. It produced more separation but caused **implausibly large, 50+ minute tail gaps** in both flat and mountain research runs. That version was rejected and never pushed. The committed research prototype keeps a bounded climbing watt cap, but still fails the sporting tests. No coefficients were altered to force specific finishing group sizes.

## Next hard gates

1. Establish scientifically credible rider watts/drag/mass/recovery calibration and measured reference points, not comparisons only against another unapproved game engine.
2. Recover missing Guangxi preparation modifiers where genuinely recorded, or select a different complete mountain snapshot; do not invent them.
3. Replace average-pace drafting with explicit exposure/work rotation and energy-limited chasing that does not force either entire peloton mass finishes or implausible fragmentation.
4. Resolve actual route geometry, grade profiles and wind bearings. Replay must be derived only from positions.
5. Capacity-test bounded checkpoint *shards*, 12 Tactical Sectors and live 15-minute execution before any approval of V3 as the official road engine.

**Production stays paused.** No game clock resumption or 12× to 2× switch has been authorized. Local tests establish engineering consistency only; remote CI, the complete application build and deployment are not independently confirmed.
