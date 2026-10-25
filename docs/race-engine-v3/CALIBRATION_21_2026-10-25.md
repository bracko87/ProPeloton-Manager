# ProPeloton Manager — V3 Batch 21 integrated path-drafting research (25 October 2026)

**Engine milestone: measured. Sporting approval: NO-GO. Production use: forbidden.**

## What changed

Added `src/race-engine-v3/pathDraftExposureV3.ts`: a deterministic research-only physical-aerodynamics integration helper. The old coupled simulator computes rider speed using the wheel shelter observed at the **beginning** of a 10-second tick, then charges mechanical power at achieved speed using that same start shelter even if the rider changes wheel alignment or lane. The new helper observes physical drafting at **both ends** of actual achieved movement and evaluates the corresponding difference in mechanical watts. Lateral positioning *prepared at the end of the tick* is not granted free shelter for the preceding tick.

Added the explicitly gated `experimentalPathDraftWork: true` option to `coupledRoadRaceResearchV3.ts`. It substitutes path-averaged drag in the **actual-work energy debit**, not commanded speed or fictitious extra distance. Accumulated work difference is persisted in the rider checkpoint. Without the option, the original calculation is unchanged. The offline/no-sporting-approval gates and `officialWrites: 0` remain mandatory. No legacy solver, production selector, race worker, timing system, live stage or official result changed.

The option is **not a validated 2D motion or professional cycling aerodynamics model**. Its simple interval averaging, lane-transition weighting and provisional rider+bicycle frontal area must eventually be checked against independent physics data.

## Test execution

- **37/37 public V3 research/regression scripts passed locally** (private operator-only source supplement unavailable; no original rider rows included).
- Strict TypeScript V3 source compilation passed.
- `verify-path-draft-work-v3.mjs` checks that unchanged shelter causes unchanged mechanical work; losing shelter during a lane change increases watts at the achieved speed; an end-of-tick lane-preparation cannot retroactively grant shelter; physical source arrays remain immutable; invalid trajectories fail closed; off-by-default output is preserved; and checkpoint resume reproduces the complete output.
- Both complete frozen-size race simulations (Dordrecht 106; Guangxi 168) finished **and matched exact serialized interrupted/resumed results** after 36 and 45 irregular restart batches respectively, with path-drafting alone and with Batch 20 anticipatory lane preparation enabled.
- Dedicated isolated V3 GitHub Actions workflow now runs the targeted test and two complete A/B runner configurations. Remote CI completion, full app build and Netlify release were **not independently verified**.

## Full-length A/B outcome — synthetic-input stress, NOT historical validation

| Research metric | Dordrecht path drafting | Guangxi path drafting | Dordrecht with anticipatory lanes | Guangxi with anticipatory lanes |
|---|---:|---:|---:|---:|
| Riders | 106 | 168 | 106 | 168 |
| Last rider gap (seconds) | **2694.469** | **2001.083** | **2860.354** | **2055.269** |
| Exact checkpoint restart matches | Yes (36 batches) | Yes (45) | Yes (36) | Yes (45) |
| Aggregate net additional path-draft mechanical work (joules) | +160,012 | +409,467 | +167,209 | +11,776 |
| Sporting outcome | **FAIL** | **FAIL** | **FAIL** | **FAIL** |

These unrealistic 33–48 minute final-rider gaps remained virtually unchanged compared with Batch 20. Improved path energy attribution by itself does **not** repair the race. All public full-race rider preparation substitutes are explicitly synthetic; Guangxi still has an incomplete elevation profile.

## More fundamental energy-model defect measured

| Offline metric without anticipatory lanes | Dordrecht | Guangxi |
|---|---:|---:|
| Aggregate mechanically performed work | **274.65 million J** | **759.67 million J** |
| Mechanical work above riders' modeled sustainable watts | **1.58 million J** | **4.63 million J** |
| Work above sustainable power as fraction of all mechanical work | **0.576%** | **0.610%** |
| Mean final simulation energy reserve | **59.4%** | **48.7%** |

The existing offline engine effectively charges a small constant aerobic baseline per rider-tick, plus a separate extra cost only when **instantaneous mechanical watts exceed a modeled sustainable threshold**. Thus approximately 99.4% of measured mechanical work does not enter that *additional excess-power* debit. This does NOT mean 99.4% of all work must be spent from a single energy bar; sustainable aerobic work must be modeled together with physiology and recovery. However, the present representation cannot be considered a calibrated power-duration/energy/recovery model. This explains why many realistic-looking drafting improvements have had minimal or unstable impacts on long-race outcomes.

## Next acceptance gate

Build a separate, explicitly calibrated **power-duration and energy balance**: consistent mechanical-to-metabolic efficiency, finite aerobic/anaerobic effort, recovery/feeding and fatigue, without charging sustained riding twice or creating free energy. Then test how workload varies with position, wind, grade and cooperation. Apply it to the same offline full-race framework only after synthetic and independent reference checks, and reject any A/B that worsens unrealistic groups or last-rider tails. Recover complete mountain route and original source preparation inputs first.

**V3 remains disconnected from official production. The game clock must stay paused; 12× saved speed must not be changed or resumed without separate explicit approval.**
