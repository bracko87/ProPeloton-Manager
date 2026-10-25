# ProPeloton Manager — Isolated V3 Calibration Batch 10 (2026-10-25)

**Status: independent research; full sporting acceptance is NO-GO. V3 remains disconnected from all official race execution.**

## Work completed on GitHub `main`

- New pure module: `src/race-engine-v3/pelotonPowerBalanceV3.ts`.
- New isolated regression: `scripts/v3/verify-pack-power-v3.mjs`.
- New reproducible full-roster *shadow* audit: `scripts/v3/audit-pack-power-real-roster-v3.mjs`.
- Dedicated V3 CI workflow now runs the two checks and strict TypeScript validation of the new module.
- **No import into `physicalRaceEngineV3.ts`, legacy engine selectors, race workers, result publisher, game clock or official replay code.**

The candidate estimates a **collective** physically attainable group speed by balancing finite rider output against power needed for air drag, rolling resistance and grade. It models reduced effective drag from a group; shareable leading duty prevents arbitrary rider-ID/processing-order advantages. Headwinds, tailwinds, and crosswinds affect aerodynamic cost. Ordered chase and attack can add explicit, energy-dependent temporary watts rather than making an adjacent rider's higher speed contagious. Exhausted riders cannot produce that extra power. No predetermined breakaway gaps, result templates, or stage-specific speed targets are in the module.

### Repeated attacks — explicit extra-energy debit

The candidate now also exports `debitPowerReserveV3`, a pure, deterministic helper that applies only additional attack/chase watt expenditure between checkpoints (baseline aerobic cost is handled by the main solver, not duplicated here). In an isolated 300-W, 83-kg test rider with 95% starting reserve, **four continuous 200-second attack bursts** exhaust the transient bonus; a fifth full-power burst becomes unavailable. The helper preserves the original rider objects and validates the energy-step size. This is a **synthetic bounded-behavior test, not yet a calibrated physiological recovery model**, and the helper is **not active in race execution**.

## Validation

Locally on Node.js 22.16.0 and TypeScript 5.8.3: **15 existing/new research regression scripts passed**, plus the two-roster shadow audit and strict `tsc --noEmit --strict` checking of the V3 modules. Existing deterministic completed-race and physical-group checkpoint tests continued to pass. The repeated-burst reserve-depletion and nonmutation regression also passed.

The isolated 300-W, 83-kg toy benchmark gives **10.53 m/s solo**, **11.97 m/s in a group of twelve**, **12.03 m/s when one rider chases**, and **12.07 m/s when one attacks**, with the extra contributor explicitly charged for energy. An 8% climb substantially lowers modeled speed. These are provisional mechanical examples, **not calibrated ProPeloton rider speeds or validation against measured cycling data**.

## Actual frozen race inputs: shadow measurements

The comparison uses the same **106 riders from Dordrecht** and **168 riders from Guangxi**. It never changes the race's velocity, energy or result. Rider watts are explicitly **unverified proxies from the game's flat, stamina and form attributes**; mass is assumed 83 kg including bicycle, and route-relative wind is neutral because actual road bearings are unknown.

| Shadow audit | Pack samples | Mean absolute candidate-versus-current speed difference | Maximum difference | Sampled pack size |
|---|---:|---:|---:|---:|
| Dordrecht (106 riders) | 23 | **2.731 m/s** | 3.004 m/s | 94 |
| Guangxi (168 riders) | 33 | **2.437 m/s** | 4.872 m/s | 167 |

Dordrecht included **17 samples** in which a rider had an applicable additional pursuit/attack duty; Guangxi had zero equivalent commanded helpers in its frozen fixture.

**Decision: NOT APPROVED for solver integration.** These mismatches are too large to infer physical correctness. In addition, the existing V3 trajectory is itself an unapproved benchmark; matching it is not the scientific goal. A reliable conversion of rider skills and fatigue to sustained/peak watts, real bike/rider mass assumptions, aerodynamic profiles, realistic teamwork, actual wind exposure and verified terrain profiles are needed. Guangxi still has 718 m of declared ascent missing in its coarse 17-point profile.

## Remaining work

1. Establish a calibrated mapping from current rider skills, fatigue, sharpness, equipment and effort to sustained and short-burst watts, including physiological expenditure and recovery.
2. Make drafting depend on physical group geometry and work rotation (currently a candidate group-size estimate only), without discontinuous "copy the wheel ahead" speed propagation.
3. Add an experimental **explicitly gated** mode that applies power-balance pace and worker energy to isolated simulations; compare multiple real rosters, seeds, winds and attacks. Keep the default solver unchanged until quality gates pass.
4. Validate release-relevant 12-sector live simulation, saved short checkpoints (append-only groups/replay rather than rewriting 4+ MB), published outputs and 15-minute execution against deliberately interrupted workers.
5. Never activate V3 officially or restart the paused game without separate explicit authorization.

### Verification bounds

All changes belong exclusively to the V3 research directory, its tests, documentation and the dedicated V3 CI workflow. Historical official results and the three legacy engines remain untouched. Local tests passed; **remote GitHub Actions completion, full application build and Netlify deployment have not been verified**.

The authoritative game time is held at Season 1, **20 October 06:38**, with both clocks paused. Saved multiplier is still **12×**, not yet the agreed future **2×**.
