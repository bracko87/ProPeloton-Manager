# Race Engine V3 — Step 71: genuine two-slot staggering and bicycle-wide pinch admission

**28 October 2026 — isolated technical research validated; strong-pinch 32/106/168-rider sporting safety FAIL; production NO-GO.**

## Objective and reference

Step 70 corrected a serious centre-only assumption: a **2.2m-wide synthetic narrow road**, with a provisional **0.3m half-width bicycle** and **over 0.8m lateral clearance** requirement, has only **two simultaneous safe lateral slots**. The former 32-rider strong-road "120s clear" was false at bicycle-edge level, which rejected the proposed motion at **16.5s**. Under Step 70’s baseline, 32 riders on the 3.3m mild pinch remain physically accepted for 120s; larger 106/168 fields still reject first swept collisions.

Step 71 asks whether a third rider originally abreast can **fall behind longitudinally before the two side riders shift into the narrowing**, without moving sideways faster than **0.38m/s**, braking harder than **−0.85m/s²**, accelerating faster than **+0.45m/s²**, borrowing energy, accepting a collision, skipping a road boundary or choosing outcomes from future rider tracks.

## Implementation and tested candidates

New [`twoSlotStaggerPlanV3`](../../scripts/v3/a2LaneCapacityPlannerV3.mjs) is a read-only, identity-free planner using only **current actual x/y/speed**, present requests and known **spatial road width**. It estimates the narrowed road's capacity and identifies a rider in the provisional centre position with flanking riders about 1.1m to each side, then requests bounded slowing to establish a **2.35m centre-versus-flank longitudinal offset**. The integrator still applies every actual acceleration/steering/energy rule before any rider state is committed.

The following are **separate opt-in research-only policies**, not live-game choices:

- `platoon_two_slot_stagger`: individual centre-rider gap-building; no advance communication across the centre line.
- `platoon_two_slot_wave`: a common centre-rider pace-warning wave to adjacent groups, with 20s road preview and 85m nearby communication.
- `platoon_two_slot_extended`: 28s centre-wave preview, 120m communication and 8s road-boundary steering preview. **Rejected**, because a mirrored 106-rider strong-road scenario diverges for **two physical rider trajectories**; not allowed into the passing gate.
- `platoon_two_slot_hazard_hold`: same broader preview, but **no new discretionary passing-lane admission** while an imminent known strong narrowing is ahead; mandatory physical inward steering still remains available. A recorded same-size negative-control test continues to prove the rejected extended policy's symmetry failure. The hazard-hold policy itself must pass strict mirror, renamed-ID and checkpoint assertions.

All cases start from the **same ordinary t=0 three-column racing grid**. The synthetic road is 4.4m before narrowing, then either **3.3m mild** or **2.2m strong** and widens back. Existing all-pair continuous swept overlap, complete bicycle-body road boundary, full failed-step rejection, energy accounting and exact JSON checkpoint rules remain active.

## Actual results

The final [Step 71 physical validation script](../../scripts/v3/verify-a2-step71-two-slot-stagger-v3.mjs) checks **32-rider 120s** and **106/168-rider 90s** normal-start fields on both provisional road profiles, under the unchanged Step 70 lane-forecast control and three primary two-slot candidates.

| Peloton / road | Step 70 lane-forecast baseline | Individual stagger | 85m centre-wave stagger | 120m wave + no-new-pass hold |
|---|---|---|---|---|
| 32 riders / mild 3.3m | **120s clear** | **120s clear** | **120s clear** | **120s clear** |
| 32 riders / strong 2.2m | **Road exit at 16.5s** | Rider contact after **12.5s** | Road exit after **20s** | Road exit after **20s** |
| 106 riders / mild | Contact after **22.5s** | Contact after **22.5s** | Contact after **22.5s** | Contact after **22.5s** |
| 106 riders / strong | Contact after **15.5s** | Contact after **12.5s** | Contact after **3.5s** | Contact after **15.5s** |
| 168 riders / mild | Contact after **22.5s** | Contact after **22.5s** | Contact after **22.5s** | Contact after **22.5s** |
| 168 riders / strong | Contact after **15.5s** | Contact after **12.5s** | Contact after **3.5s** | Contact after **15.5s** |

All durations above are **last accepted full simulation times**; subsequent contact or road-boundary microinterval failures reject the proposed physical step. No simulation marked any partial result as full completion. All trials recorded **zero near-stop rider-ticks** before their rejection.

The strengthened 32-rider strong-pinch wave delays the bicycle-edge rejection from 16.5 to **20s**, permitting **two completed lateral lane changes** before rejection. The boundary case remains physically inadmissible: at one rejected sample, `r014` at x≈752.821m / y=3.3m was ~**1.03mm beyond** its permissible full-bicycle right-side margin. The controller must not ignore even a small edge breach; tolerance and body width were not relaxed. The attempted 85m group wave also exposes an **earlier same-centre-column rear compression** on 106/168-rider fields: `r052/r055` approach ~1.81m longitudinal separation and correctly reject a swept bicycle contact at 3.69s. Wider prior communication and a temporary no-new-pass zone remove that *early* conflict but expose the previously unresolved downstream `r033/r036` collision at the same 15.5s as the Step 70 baseline.

A synthetic three-rider starting row positioned abreast **inside the fully narrowed 2.2m section** with insufficient lateral clearance is rejected at **t=0**, with no physical or energy update. All active positive-control candidate cases pass full road reflection, renamed rider-ID outcome/physical trajectory parity, and exact midpoint resume where complete. The intentionally rejected `extended` counterexample remains visible with its measured two rider-mirror differences.

## Engineering conclusion

The current 3-column starting grid and fixed bounded bicycle physics need a **joint longitudinal + lateral space-time reservation system** that schedules which two usable slots become occupied first and which rider yields *before* the entire row reaches the pinch. Merely commanding centre riders to brake, sending pace warnings or banning discretionary overtakes does **not** solve the 106/168-rider braking chain or the remaining 32-rider strong-pinch bicycle-edge failure.

**Technical test gate PASS** means that the experimental controller, negative controls, symmetry and fail-closed constraints are tested correctly. It does **not** mean the 2.2m-wide narrowed-road simulation is collision-free or physically sporting-approved. That acceptance gate remains **FAIL / NO-GO**.

The canonical preexisting A63 **67/67** safety cases, A64–A70 normal starts, A66 passing, A67 sustained 106/168-rider passes on constant road, historical A58–A39 and production React build remain in the [full validation workflow](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-a2-step59-symmetry-and-field.yml). The specific [Step 71 targeted CI workflow](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-step71-two-slot-targeted.yml) retains JSON reports, including every rejected first collision or road exit.

## Next A72

Investigate **space-time reservations before narrowing**: robust advance lane-slot admission for a 2-slot 2.2m bottleneck, fair alternating whole-row stagger with strict longitudinal headway, explicit impossibility/traffic-queue handling, and timed release on reopening. Prove 32 → 106 → 168-rider full-bicycle-width variable-road traversals with real sustained passing outside the narrow bottleneck, no road exits, zero swept overlaps, exact checkpoint replay, rider/left-right fairness and no forced near-stops. Then independently calibrate real route widths, full bicycle/rider envelopes, terrain, drafting, attack power, group gaps and complete racing stages.

**Production boundary:** These are separate offline research scripts and documentation in GitHub `main`. No live race engine switch, Supabase database mutation, player/classification result, payout, game clock or Netlify release action has been performed.
