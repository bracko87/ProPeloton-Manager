# Race Engine V3 — Batch 42: first truly coupled continuous two-dimensional movement pilot

**Date:** 2026-10-26  
**Status: ENGINEERING PILOT PASS / SPORTING NO-GO / OFFLINE ONLY.**  
**Official writes: 0; stage classifications from the new solver: 0.**
**Production V3 selector, existing official race physics, historical results, production timing and Supabase unchanged.**

## Why this is a step beyond Batch 41

The previous reservation studies independently varied a lateral shadow while comparing it to an **unchanged physical race**. Batch 42 adds `scripts/v3/coupled2DMicroV3.mjs`: its next tick reads the rider's **actual prior simulated longitudinal metre position, continuous lateral coordinate, current velocity, completed blocking queue, and W-prime balance**. Riders are no longer pinned to the original physical baseline. Actual accepted lateral moves affect **subsequent longitudinal movement, aerodynamic shelter, energy use, wheel clearance, and blocking**.

The new module is imported only by offline research scripts. No `src/race-engine-v3/**` production/research library was changed. The existing V3 reference stage is calculated separately without a new engine selection switch.

## Provisional physics and collision safety

- **Coordinates:** every bicycle has a longitudinal position in metres and a *continuous* lateral `y` position. Provisional road widths are 5 m and 6.5 m using the four-track Batch 40 envelopes; these are not measured Dordrecht or Guangxi course widths.
- **Dynamics:** each tick finds nearest observed draft leaders in 2D, calculates power-limited desired speed from provisional CdA, grade, headwind/crosswind, critical mechanical watts, W-prime and tactic, applies bounded acceleration/deceleration, then advances the bicycle's **lateral and longitudinal path together**.
- **Shared reservations:** deterministic front-to-back planning uses complete previously accepted swept paths. To prevent earlier bikes making it impossible for a not-yet-processed rider to yield, their **frozen initial envelopes also reserve space** during provisional planning. Earlier reservations cannot ignore unprocessed bicycles.
- **Collision:** full interval 2D sweep from actual current position to the proposed endpoint; if unsafe, search for a lower safe forward speed. If steering remains unsafe even while slowing, cancel steering, and test the no-steer path again. If even stationary yielding collides, fail closed. Independently re-check **every pair's complete accepted 2D trajectories** after all riders are planned. No instantaneous longitudinal distance grant is possible: actual displacement never exceeds commanded movement.
- **Passing:** at most two concurrent rider reservations, with two 10-second reaction ticks, then three 10-second steering ticks. An available adjacent track is required, repeated blocked-wheel queues trigger candidates, and every actual accepted steering tick charges **35 additional mechanical watts**.
- **Energy:** charge the **power actually demanded at achieved speed**, including lateral surcharge, with persistent W-prime cap. A 0.5 W numerical margin before limiting requested speed protects the strict budget when achieved coordinates are rounded. Run both zero-W-prime and normal-W-prime unit tests. State never mutates in place; every applied tick returns a new serializable checkpoint.
- **Constraints:** priority by current forward metres then rider ID is a provisional fairness assumption; this remains a discretized tick-lateral model, not a calibrated real bicycle steering model. Road width, rider mass, CdA, sustainable power, fatigue and commands remain provisional synthetic research values.

## Scale and validation protocol

- **8-rider and 24-rider micro-pelotons**, each run for 84 ticks (14 simulated minutes).
- **106 Dordrecht and 168 Guangxi field-size pelotons**, each run for **144 ticks = 24 simulated minutes**.
- For each size test **two assumed road-width geometries** and **two fully evolving simulation arms**: steering enabled and steering disabled. Both arms evolve position and energy, so differences represent actual propagated changes *within this provisional 2D model*.
- **12 total coupled 2D runs per frozen fixture**, 24 across both fixtures, none a completed full stage. In addition, the existing V3 is advanced independently through 144 ticks as a **reference checkpoint only**, without inventing an unavailable final movement metric.
- Every independent 2D run is matched to an irregular-batch **JSON serialize/restore/replay** covering the entire 84- or 144-tick interval and must be structurally exactly equal. The new module's pure input state is checked for nonmutation. Collision, overdrawn W-prime and official-write guard failures fail the tests.
- The "blocked rider-ticks" metrics shown below compare **within the new 2D model**: steering-on minus its own steering-off control. They cannot be directly compared to Batch 41's unchanged coupled V3, whose movement, aerodynamic exposure and provisional power assumptions differ.

## Field-size pilot results — 24 simulated minutes

| Fixture and assumed road geometry | Steering-off blocked rider-ticks | Steering-on blocked rider-ticks | Reduced blocked rider-ticks | Completed/started passes | Delta aggregate travelled field metres |
|---|---:|---:|---:|---:|---:|
| Dordrecht, 106, 5 m | 12,155 | 11,430 | **725** | 47 / 56 | **−834.86 m** |
| Dordrecht, 106, 6.5 m | 12,037 | 10,953 | **1,084** | 47 / 55 | **+5,931.97 m** |
| Guangxi, 168, 5 m | 20,549 | 19,544 | **1,005** | 48 / 57 | **+12,651.49 m** |
| Guangxi, 168, 6.5 m | 20,558 | 19,888 | **670** | 46 / 56 | **+5,633.60 m** |

A "completed pass" is a completed three-tick *lateral reservation*, not necessarily a verified overtake of the rider originally ahead. **The newly coupled model has produced zero completed full stages, winners, or official time gaps.**

Very important: **fewer blocked ticks are not necessarily better sport**. Dordrecht's narrow-road setup reduced blocked counts yet reduced **aggregate field travel by 835 metres**, relative to steering disabled, and even the wider road's aggregate effects differ significantly between Dordrecht and Guangxi. We must understand any additional congestion redistribution and grid effects before claiming realism.

### Smaller 8- and 24-rider regression microfixtures

Both test sizes complete 84 ticks in both widths and both steering modes. The 8/24 rider flows exhibit measurable movement and energy changes when steering is enabled, and every state checkpoint reproduces exactly after repeated JSON restores. In the dedicated 12-rider unit fixture, 36 ticks yield 8 completed steering reservations with identical resumed results and no collision or W-prime overdraw.

The first larger-field run caught an **energy cap numerical boundary**: a strict W-prime debit rejected a speed that had passed the unchecked rounded target. The solver was conservatively limited by an additional 0.5 W margin and a depleted-reserve regression was added. The next run caught a real ordering safety issue: earlier riders could steer into a currently occupied spot belonging to an unprocessed follower. The solver was **strengthened** to reserve all unplanned riders' starting bicycle envelopes; no collision requirement was relaxed. A subsequent failure came only from trying to access a completed-result `movement` property on a **partially calculated** legacy checkpoint. That report code was corrected to retain only known `ticks`, `elapsedSeconds`, and `riderPositions`. Both final field-sized research jobs then passed.

## Verified CI and exact evidence

- [Batch 42 two-job full-size coupled 2D pilot — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40352413681): independent 8/24-rider and 106/168-rider paths, both assumed geometries, live rider-to-rider 2D constraints, energy checks, all JSON checkpoint equivalence checks, and `npm run build`.
- [V3 legacy isolation — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40352413841): all **51 steps completed, zero failed, no GitHub `##[error]` log lines**. The separate source-fidelity check still correctly reports **SPORTING BLOCKED** for the World Nations mountain stage: **1,065 m declared ascent missing** (1,785 m stated versus 720 m represented).
- The synthetic Guangxi route is also **718 m short** of published reported climbing; Dordrecht sprint command conversion is uncalibrated.
- Two Actions JSON artifacts, one per 106/168 fixture, include every pilot rider's final **partial-stage** forward and lateral position, W-prime remaining, steering/no-steering differential, collision/obstruction metrics, and exact recovery count, plus the unchanged original V3 144-tick reference metadata. No user data, live races, or official writes involved.
- The scoped repository diff contains only `scripts/v3/coupled2DMicroV3.mjs`, `scripts/v3/verify-batch42-2d-v3.mjs`, `scripts/v3/audit-batch42-2d-v3.mjs`, `.github/workflows/v3-batch42-coupled-2d.yml`, and this report. **No production engine routing change.**

## Sporting decision and Batch 43

**ENGINEERING PILOT PASS; SPORTING NO-GO.** Batch 42 establishes that the 2D experimental solver genuinely couples lateral steering to forward movement and power consumption, and that a full-size peloton can advance 24 minutes with continuous collision checks and exact restarts. It is **not** a calibrated racing engine, and it has not yet completed an entire stage with actual overtaking rules and realistic gap propagation.

**Batch 43 priority:** first expand to **complete 106/168-rider full stages**, including finish-line crossing interpolation, realistic draft/air power, race-phase tactics, rider fatigue, and road-width variation by route segment; explicitly measure group splits and **finish-order** changes across independent initial grids. Address fairness bias from front-to-back/id priority and no overtake-credit ambiguity, retain full within-tick collision checking and W-prime restoration, and fix route elevation inputs before any gameplay activation.

**Final: OFFLINE ONLY; 0 official writes; NO-GO for live racing.**
