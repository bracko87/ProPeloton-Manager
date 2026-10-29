# Race Engine V3 — Step 81: multi-second provisional corridor reservations

**Date:** 29 October 2026  
**Outcome:** synthetic offline research technical PASS. **32-rider five-abreast staged-route 180s physical and 3-second passing PASS**, but 106/168 five-abreast sporting readiness **NO-GO**. Not production-authorized.

## What was actually implemented

Step80's 1–1.5-second original-solver receding horizon sometimes delayed a contact but could not reliably coordinate a large peloton over many narrow rows. Step81 implements an **eight-second conservative, provisional space-time corridor forecast** and uses it to form additional, opt-in full-field candidate requests:

- [Pure current-state forecast and provisional requests](../../scripts/v3/a2Step81SpaceTimeReservationsV3.mjs) computes limited-acceleration, limited-braking and limited-steering extrapolations at 0.5-second intervals, detects overlapping expected bicycle envelopes over 8 seconds, groups riders by geometric conflicts (not rider IDs), and associates static two-gate lane/time bookings with each rider. The predictions are **not physically accepted paths or guaranteed booking windows**.
- Four request families: `reserved_pace_reserve` gently protects the forward rider and asks following bicycles to open space; `reserved_lane_hold` defers a crowded cross-lane transition; `reserved_row_stagger` uses road-centre-symmetric five-rider grid roles to stagger movement without giving one geographic side priority; `reserved_combined` evaluates the combined intervention.
- [Offline full-field candidate wrapper](../../scripts/v3/a2MultiGatePhysicalCandidateV3.mjs) exposes `multisecond_reserve_v1` and `multisecond_zipper_v1`. It combines five first-tick proposals with a receding **3-tick authoritative physical** lookahead. Subsequent proposals are generated from each *temporarily* full-body-swept future state and static gate bookings; **all hypothetical states are discarded**.
- Only the selected **first 0.5-second tick** is independently re-swept by the unchanged A64 original bicycle solver, even for canonical mirrored-road planning. A failed contact, road boundary or energy calculation rejects the movement without mutating the previously accepted race state. Nothing changes actual bicycle positions, speed, energy, road width or classifications retroactively.

Original all-pair swept collision detection, half-width 0.3m bicycle road edges, acceleration +0.45m/s², braking −0.85m/s², lateral velocity 0.38m/s, energy budget and W′ safeguards remain unchanged. This is **provisional time-corridor planning**, not yet an implemented mathematically sufficient long-range multi-gate scheduler.

## First 16 five-abreast physical tests

[Step81 physical matrix](../../scripts/v3/verify-a2-step81-multisecond-physical-v3.mjs) includes 8/32/106/168 five-column bodies on 3.3m→2.2m staged and double 2.2m road profiles, and both opt-in policies. Original static gate bookings are necessary conditions, never treated as proof of physical passage. Truthful early swept-contact rejection is an expected audited result, not a sporting pass.

| Size, layout, research policy | Accepted actual 0.5s ticks until | Body / near-stop result |
| --- | --- | --- |
| 8, both geometries, both variants | **60s study horizon** | No failed swept body movement or near-stop |
| 32, staged, **multisecond_zipper_v1** | **45s study horizon** | Zero contacts and near-stops |
| 32, double, **multisecond_reserve_v1** | **45s study horizon** | Zero contacts, **one near-stop tick** |
| 106, staged, zipper | **15.5s** | Swept contact rejected, zero near-stops |
| 106, double, reserve | **20s** | Swept contact rejected, **81 near-stop rider ticks** |
| 168, staged, reserve | **12s** | Swept contact rejected, zero near-stops |
| 168, double, reserve | **15s** | Swept contact rejected, zero near-stops |

The large-field results **do not beat the prior trustworthy Step80 168r double 3-tick result of 20s with zero near-stops**. Neither 106 nor 168 five-abreast completes its expected 180 seconds. Step81 must **not be enabled as the live racing controller**.

## Independent full-race 32-rider tests — important new evidence

[Dedicated full 180s 32-rider original-physics and overtaking verifier](../../scripts/v3/verify-a2-step81-32-full-races-v3.mjs) was run separately rather than treating a 45s pilot as a sporting result.

| 32-rider five-abreast layout / policy | Actual accepted duration | Near-stop rider ticks | Completed physical lane changes | Independent sustained ≥3s rider-pair overtakes | Outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| Staged, `multisecond_zipper_v1` | **180s** | **0** | **768** | **64** | Full crossing, no swept contact/road exit, exact serialized 90+90 physics+observer replay **PASS** |
| Double, `multisecond_reserve_v1` | **180s** | **1** | **1,219** | **41** | Full crossing but strict zero-near-stop sporting gate **FAIL** |

Both 32r tests had every rider past x1470m (rear x1971.775158m staged and x1953.555249m double) and passed exact 90+90s serialized **full physical field and independent 3-second overtaking observer** recovery.

Caution: **768 and 1,219 physical lane changes** are much more than the **356 lane changes** in the previously successful Step78 32-rider staged 180s policy with **87 genuine 3-second overtakes**, zero near-stop ticks and exact recovery. Step81 staged does achieve the required physical finish and real overtakes, but is **not a better sporting controller by default**; overfrequent weaving is a realistic-quality concern. Preserve the Step78 successful baseline and do not replace it blindly.

## Real physical fairness and small-field energy audit

[16-case full-field mirror/name and complete 8r observer audit](../../scripts/v3/verify-a2-step81-parity-and-passing-v3.mjs) confirms exact reflected x/y/v, energy, physical accepted time, contact status and selected candidate policies for 8/32/106/168 × both road layouts × both Step81 research modes. **All 16 short-run parity tests PASS**. No rider ID or physical left/right privilege was introduced.

Four complete-horizon 8-rider checks show:

| 8-rider layout / research policy | Duration | Independent sustained ≥3s overtakes | Near-stop ticks | True outcome |
| --- | ---: | ---: | ---: | --- |
| Staged / reserve | **180s** | 10 | 0 | Full passage, exact 90+90 replay PASS |
| Double / reserve | **148s** | 5 | 0 | **ENERGY_FAILED**; the original energy safeguard correctly rejected the next tick |
| Staged / zipper | **180s** | 5 | 0 | Full passage, exact 90+90 replay PASS |
| Double / zipper | **180s** | 4 | 0 | Full passage, exact 90+90 replay PASS |

Even the rejected 148s energy case passed its serialized physics+observer 90+90 replay, proving deterministic fail-closed recovery rather than an energy bypass. The 8r 148s run is **not an acceptable race completion**, regardless of riders' achieved positions.

## Validation and protected results

- [Initial Step81 physical matrix and protected regression CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40849874576) — **SUCCESS**.
- [Step81 physical + mirror/identity + 8r long/replay + protected build CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40850459765) — **SUCCESS**.
- [Full Step81 32r physical/rider-passing sporting review](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40850830854) — **SUCCESS**, with truthful separate full 32r results and original successful Step78 32r benchmark.

All workflows distinguish **technical checks passed** from **sporting permission denied**. Protected A76 **three-abreast** 32/106/168 full 180s and independent **58/151/198** genuine 3-second passes remain green. The original A78 five-abreast 32r staged full 180s, **87** independently sustained three-second passes, exact checkpoint, zero near-stops and mirrored fair physics remains green. React production build passes.

No physical simulator production integration, live Supabase race/result/finance updates, payout changes, game-clock modifications or new game deployments were requested or carried out. GitHub `main` contains this isolated synthetic research and test code; successful CI is not proof of Netlify production behavior.

## Next engineering gate — Step 82

Step81's heuristic 8s occupancy forecast can identify geographically overlapping corridors, but **does not yet create and enforce a feasible shared multi-second zipper admission contract**. Actual 106/168 trajectories still produce early contacts; one 106r configuration avoids contact for 20s only by causing 81 near-stop ticks, an unacceptable artifact.

**Step82** must negotiate real **joint space-time lane entry windows, attainable acceleration and deceleration constraints, and leader/follower travel-time intervals** across simultaneous 3–8 bicycle neighborhoods. Treat conflict pairs with incompatible demands as explicit **UNSAT** conditions *before* geometric narrowing, rather than artificially stopping the peloton. Check physically available road width and row capacity over the entire funnel, not simply one provisional 8s path. Require full 180s **32/106/168 five-abreast**, both road profiles, every rider past second reopening, zero swept body contacts/road exits/near-stop ticks, credible passing rates rather than overfrequent lane changes, mirror/rename neutrality, actual energy/W′ feasibility and exact full physics+independent observer 90+90 JSON checkpoint. Follow with geographically verified real stage profiles, grade, drafting, team tactics, rider energy/fatigue and classified long races.

**Milestone A full sporting realism: NO-GO. Milestone B gameplay integration: NOT STARTED. Milestone C production release: NOT STARTED.**
