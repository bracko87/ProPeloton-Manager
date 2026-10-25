# Race Engine V3 — isolated development and legacy recovery inventory

Status: **RESEARCH ONLY; no official race routing; no live game deployment**.
Recorded 2026-10-25. Owner authorized starting independent V3 engineering and preserving every legacy engine.

## Legacy recovery snapshot (read-only; do not change)
Original main HEAD before isolated V3 work: `8db593c61bfe0193d281a116a0028d47b54dfee7`.
Existing production source files and their Git blob SHAs:
- `src/universal-race-engine/runRaceEngine.ts` — `ff25e81d16e817f812519fa0486c5dd706170a3f`
- `src/universal-race-engine/runMountainExperimentalEngineV1.ts` — `22b0407444df9d967f4ac2041c59d05a7614af47`
- `src/universal-race-engine/runBreakawayExperimentalEngineV1.ts` — `9f1b3bbab5efbd81b008c213e245e508decb3f13`
- `src/universal-race-engine/runSelectedRaceEngineV1.ts` — `b9807d92f733e121ff30926ae1eeb2131676ad5b`

Deployed Supabase Edge Function readback (project `okuravitxocyevkexfgi`, 2026-10-25):
- `universal-race-stage-runner` ACTIVE version **52**
- `universal-race-stage-pass1-resume` ACTIVE version **43**
- `universal-race-stage-pass2-resume` ACTIVE version **70**
- `universal-race-stage-safe-resume` ACTIVE version **77**

These are **inventory pointers**, not instructions to roll back active workers without further verification. No existing file, deployed worker, official result, historic replay or database record is to be modified as part of initial V3 development.

Game clocks: authoritative `game_state.is_paused=true` (Season 1, 20 Oct 06:38); `game_clock_config.is_paused=true`. Secondary base time disagrees with authoritative time and must be reconciled before an explicitly approved restart. Stored speed is still 12x, NOT yet switched to 2x.

## Isolation contract
- Research-only source path: `src/race-engine-v3/`; tests/fixtures: `scripts/v3/`.
- The existing `src/universal-race-engine/` and `supabase/functions/universal-race-stage-*/` remain unchanged.
- No V3 module may be imported by the legacy UI, workers or selector; `node scripts/v3/verify-legacy-isolation.mjs` must pass.
- Never use a production calculation worker, write official results, issue payouts, progress game time or alter race routing to execute a V3 test.
- V3 tests are deterministic, simulation-only and operate on offline fixtures.
- A validated separate pilot requires explicit approval for worker deployment, schema changes and routing. No silent fallback between engines.

## First historical real-roster fixture
`Dordrecht Alblasserwaard Circuit`, 15 Oct 2000, 118.5 km, **106 starters from 18 teams**, frozen production source run `635ca0b9-7478-4fff-9599-a562060f4ef9`, input snapshot MD5 `504424f871e94654079f4e54ba2e5235`. Source attributes and per-rider planned commands are transformed into a de-identified offline research fixture.

The first V3 preview's *structural* tests passed, but its initial actual-roster output showed only three riders on winner's time and an implausibly large final gap of ~2,896 seconds for this flat stage. **Sporting acceptance FAILED**. No model is approved for production or described as realistic until it passes broader calibration, especially peloton formation/cohesion, repeated-attack depletion and weather-dependent behavior. Reference model outputs are not official results.

## Staged build
1. Frozen real-roster fixtures, deterministic checkpoints and physical output audit.
2. Realistic peloton dynamics, rider energy, wind, gradient, breakaway & chase validation.
3. Live 12 tactical sectors, four-phase pre-race defaults, optional live team commands.
4. Read-only live player viewer, server-controlled commands, finish/replay/control-center contracts.
5. Isolated load, publication recovery and full test acceptance; separately authorized official pilot.

Calendar: game 2x after future approval, 12-15 min real-time live stages (hard max 15), 15 min pre-live access, up to 12 ordinary road stages/day targeted, up to 15 only if capacity proven. Time trials/juniors excluded from early live commands.

**No task in this document permits resuming either clock.**
