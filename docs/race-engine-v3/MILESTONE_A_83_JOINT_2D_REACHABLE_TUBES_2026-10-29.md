# Race Engine V3 — Step 83: joint two-dimensional reachable-tube warnings

**Date:** 29 October 2026  
**Status:** Technical first matrix PASS. **106/168 five-abreast real racing NO-GO**. All code is synthetic/offline, and no production race is enabled.

## Motivation and boundary

Step82 demonstrated that individually attainable arrival windows and temporally ordered same-lane reservations are **not sufficient** to give simultaneous 5→2 bicycle lane entry. A 106- or 168-rider five-abreast field still rejected the first real swept-body contact after 5s (staged) or 8s (double) despite consistent provisional time windows. A known successful Step78 **32 five-abreast staged** controller still finishes 180s with 87 independently confirmed ≥3-second overtakes and 356 lane changes, zero stops. A protected Step82 32r staged pilot finishes 180s with 85 passes, 460 lane changes and zero near-stops.

Step83 implements an **opt-in research-only joint 2D reachable-tube *warning*** module: [a2Step83JointTubesV3.mjs](../../scripts/v3/a2Step83JointTubesV3.mjs). It is deliberately **not** advertised as a mathematical safety certificate or proof of inevitable collision.

- Uses only currently accepted rider position, current speed, and pending whole-field speed/steering requests (never future real history or payouts).
- Generates bounded constant-request bicycle center projections at 0.5-second intervals across a six-second local horizon, respecting the research command's up-to +0.45m/s² acceleration, −0.85m/s² braking, and ±0.38m/s steering speed. It samples the exact linear-relative overlap intervals for *both* longitudinal and lateral body envelopes on every projected step.
- Produces first projected 2D crossing times and connected conflict graphs across multiple overlapping rider neighborhoods. An equal-x conflicting pair has **no rider-ID, array-index, or left/right geographical priority**.
- Four candidate joint requests: `joint_tube_hold_crossing`, `joint_tube_yield_corridor`, `joint_tube_coordinated`, and `joint_tube_early_release`. They defer threatened current lateral transitions and request bounded gradual follower pace reduction / lead assistance based on current longitudinal order.
- Adds two explicit **offline** wrapper policies, `joint_tube_hold_v1` and `joint_tube_release_v1`, in [a2MultiGatePhysicalCandidateV3.mjs](../../scripts/v3/a2MultiGatePhysicalCandidateV3.mjs). They submit multiple synchronized candidates to the Step80 3-tick **actual physical** preview. All tentative future states are discarded; the selected first 0.5-second movement is independently re-swept by the original A64 solver with full bicycle shape, road edges, W-prime and all-pair swept contact. A rejected physical movement is **never committed**, even if the 2D tube forecaster considered the request plausible.

### Important model limitation

The forecast projects current requested controls *without full game road-envelope constraints, full power/energy dynamics, actual steering arbitration or next-tick tactical decisions*. Consequently a projected overlap is a **warning**, not proof an actual collision will occur, and absence of a projected overlap **cannot guarantee** that future real A64 movements will be safe. The authoritative full physical check must remain mandatory. No new safety gate was weakened.

## Initial strict physical matrix (16 independent research configurations)

[Physical tube validation script](../../scripts/v3/verify-a2-step83-joint-tubes-v3.mjs) first proves an equal-x, side-by-side physical crossing intention is detected before overlap, tests symmetric lane reflection and ID-neutral behavior and fails closed on malformed requests. It then runs 8/32/106/168 actual **five-abreast** A64 bicycle trajectories on both synthetic staged and double 2.2m bottlenecks, with both opt-in policies. The larger fields begin with the previously tested physically valid neutral 9m/s rolling start.

| Field and road | Best actual accepted duration | First authoritative result |
| --- | ---: | --- |
| 8r staged, both policies | **45s test horizon** | No swept contact and 0 near-stop ticks |
| 8r double, both policies | **45s test horizon** | No swept contact and 0 near-stop ticks |
| 32r staged, both policies | **50s test horizon** | No swept contact and 0 near-stop ticks |
| 32r double, hold | **26.5s** | Rejected swept contact r018/r024, 1 near-stop tick |
| 32r double, release | **15.5s** | Rejected swept contact r010/r011, 1 near-stop tick |
| 106r staged, best release | **11s** | Rejected swept contact r068/r073, zero near-stops |
| 106r double, both policies | **14s** | Rejected swept contact, **214–226 near-stop ticks** |
| 168r staged, both policies | **11s** | Rejected swept contact, zero near-stops |
| 168r double, both policies | **12.5s** | Rejected swept contact r050/r055, **193 near-stop ticks** |

The matrix passes **technical assertions** because each rejection is recorded faithfully and does not mutate the previous accepted physical state. The large-field results are materially worse than Step80's **168r double 20s with zero near-stops**, and do not meet realism. **Zero verified 106r or 168r five-abreast 180s successful starts.** Do not promote Step83 candidate requests as the default controller.

## Original protected experimental results

The [Step83 first GitHub Actions workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40857136722) passed the new honest 16-case A83 matrix, the protected A82 32r full 180s/85 independently sustained 3s overtakes, protected A78 32r 180s/87 independent passes, and original A76 32/106/168 **three-abreast** full 180s with **58/151/198** independent ≥3s passes. React production build passed. These older successful fixtures are **not** Step83 full-field sporting successes.

The independent [Step83 full-field fairness and full 8/32 sporting replay workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40857347024) also **PASSED all technical assertions**, including **16 mirrored-road/renamed-rider A64 actual-physical full-field short tests** (8/32/106/168 × staged/double × both research policies). Their selected synchronized proposals, accepted x/y/v, W-prime energy and rejection outcomes were symmetric and identity-neutral.

The same verifier continued six 8/32-rider five-abreast research configurations to the full 180-second intended limit, coupling **only actually accepted physical ticks** to the independent ≥3-second sustained overtaking observer:

| Test and Step83 policy | Full physical accepted duration | Near-stop ticks | Real lane changes | Independent sustained ≥3s overtakes | Actual result |
| --- | ---: | ---: | ---: | ---: | --- |
| 8r staged, hold | **180s** | 0 | 118 | **10** | Full physical pass, exact serialized 90+90 physics + observer recovery |
| 8r double, hold | **180s** | 0 | 210 | **8** | Full physical pass, exact serialized 90+90 physics + observer recovery |
| 32r staged, hold | **73.5s** | 0 | 215 | 60 before rejection | **SWEPT_CONTACT r011/r020**; full 180s FAIL |
| 32r staged, release | **73.5s** | 0 | 227 | 60 before rejection | **SWEPT_CONTACT r011/r020**; full 180s FAIL |
| 32r double, hold | **26.5s** | 1 | 84 | 8 before rejection | **SWEPT_CONTACT r018/r024**; full 180s FAIL |
| 32r double, release | **15.5s** | 1 | 31 | 2 before rejection | **SWEPT_CONTACT r010/r011**; full 180s FAIL |

Both completed 8r races reached well beyond second gate reopening (rear x2173.1625m staged, x2138.843632m double), zero contact/road exit/near-stops and exact independent serialized replay. **None of the four 32r Step83 policies finished 180 seconds.** The 32r staged 73.5s cases cannot be described as checkpoint-complete, since they rejected a real swept collision before 90s; the verifier records exact 90+90 recovery as **not applicable**, not as a pass.

The previously proven Step78 32r staged full 180s/87 passes/356 lanes and Step82 32r staged full 180s/85 passes/460 lanes are preserved by independent strict regression and are **far better sporting controllers**. Step83's new projected 2D warning machinery must remain a separate diagnostic, not a replacement race policy.

## Next research gate

**Step84** should replace per-pair broad braking and lane holding with **multi-neighborhood constraint consensus on admissible crossing order and achievable simultaneous 2D gap creation**, including precise forward lookahead to the body's road-width contraction, dynamically propagated leader response, and **proof by actual multi-tick authoritative swept physical checks**. It must not sacrifice high-speed group travel, realistic pace, energy feasibility or rider passing simply to avoid contact. Validate 32/106/168 initial **five-abreast** fields for the whole 180s through both profiles, with all riders past the second opening, zero near-stops/contact/road exit, credible sustained passes and lane-change counts, mirror and renamed-ID neutrality, exact 90+90 real physical and independent observer replay, and no game-state writes.

**Overall Milestone A 106/168 five-abreast sporting NO-GO; Milestone B gameplay NOT STARTED; Milestone C live production authorization NOT STARTED.** All Steps 76–83 remain isolated research; production racing, Supabase, player data, results, payouts and game clock were not changed.
