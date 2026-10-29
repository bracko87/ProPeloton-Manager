# Race Engine V3 — Step 85: physically checked group-throughput and no-stop guard

**Date:** 29 October 2026  
**Technical outcome:** PASS for strict A64 original-solver physical audits, genuine no-stop request rejection, 16 real field mirror/rename comparisons and independent 8/32 full-race checkpoint replay.  
**Sporting outcome:** new **32-rider five-abreast double-strong 180s clean safety pass** under `throughput_balanced_v1`; **106/168 five-abreast sporting NO-GO** and 32r staged Step85 regression. Research-only opt-in modules; no production release.

## Problem and design

Step84's 106-rider five-abreast double-strong pilot accepted the first 25s of physical racing only by accumulating **1,661 near-stop rider ticks**. That is not a viable peloton; all near-stop losses must be sporting failures even if an original A64 half-second swept collision check passes. Meanwhile Step84's 168-rider double accepted only 9s before a real collision, and the existing successful **32r staged** Step78 controller remains 180s/87 independently verified 3s overtakes/356 physical lane changes/zero near-stops.

Step85 introduces [a2Step85ThroughputGuardV3.mjs](../../scripts/v3/a2Step85ThroughputGuardV3.mjs), a **bounded group-wide, physically checked receding-horizon selection objective**, not a claim of sufficient joint multi-row zipper passage:

- For up to five concurrent first-tick synchronized candidate full fields and up to three dynamically recomputed physical next-tick requests, preview the **entire 8–168 rider field through the unchanged A64 all-body swept, road-boundary and W′ energy solver** for 2–3 half-second ticks. Future states are produced only by the original physical solver and **never committed**.
- After each accepted hypothetical physical step, measure *achieved* near-stop rider ticks, rider speeds below a moving-speed floor, 10th-percentile speed, number of physically braking riders, total deceleration, spatial clearance and genuine group distance gain. Ranking now prioritizes completing the real feasible preview without a near-stop and then moving the group at sustainable, less shockwave-prone speeds. No rider identity or arbitrary left/right track is rewarded.
- `throughput_strict_v1` rejects any **first-tick physically possible proposal** that creates one or more near-stop ticks. If no clean physical proposal exists, it **fails closed**, keeping all previous accepted rider positions/energy unchanged rather than simulating a fictional fix. A dedicated test proves strict refusal even when a fake candidate physical integrator returns an accepted but stopped field, and the 16-case original-physics suite also asserts the policy **never commits a near-stop rider tick**.
- `throughput_balanced_v1` instead treats near-stop accumulation as a strong but **non-hard** sporting cost while also favoring group pace. It is not advertised as a strict no-stop guarantee: a full race must independently have zero real near-stop ticks to receive a sporting pass.
- Candidate sets reuse previous baseline, Step78 actual joint viability and Step84 simultaneous crossing-order requests, plus distributed cruising/limited-wave research requests; they are **requests, not physical position/speed resets**. Every finally selected first 0.5s synchronized field is re-swept through original A64 on the actual (possibly mirrored) road geometry, and a rejected movement is never added to accepted history.
- The final fail-closed audit now distinguishes `NO_NO_STOP_PHYSICAL_REQUEST` (no A64-valid available action that also satisfies the strict stop budget), `NO_SAFE_PHYSICAL_REQUEST`, and actual original A64 `SWEPT_CONTACT` rejection. This improves investigation but is **not** a substitute for a successful full race.

## Initial 16-case original physics acceptance matrix

[Step85 original-swept physical/near-stop verifier](../../scripts/v3/verify-a2-step85-throughput-v3.mjs) covers 8/32/106/168 physically initialized **five-abreast** cyclist grids; 3.3→2.2m staged and double-strong 2.2m bottlenecks; both strict/balanced research policies; neutral 9m/s large-field rolling starts; and independent hard no-stop motion assertions.

| Size/layout, mode | Actual accepted seconds | Actual near-stop rider ticks | Result |
| --- | ---: | ---: | --- |
| 8r staged/double, strict and balanced | **45s** study horizon | 0 | No swept rejection within study horizon |
| 32r staged, strict | **10.5s** | 0 | Original swept contact r015/r016 rejected |
| 32r staged, balanced | **9.5s** | 0 | Original swept contact r005/r006 rejected |
| 32r double, strict | **6s** | 0 | Original swept contact r000/r006 rejected |
| **32r double, balanced** | **55s** study horizon | **0** | No swept rejection within study horizon; full race independently tested below |
| 106r staged, strict / balanced | **7s / 10s** | 0 | Original swept contacts rejected |
| 106r double, strict / balanced | **6.5s / 8.5s** | 0 | Original swept contacts rejected |
| 168r staged, strict / balanced | **7s / 7.5s** | 0 | Original swept contacts rejected |
| 168r double, strict / balanced | **6.5s / 8.5s** | 0 | Original swept contacts rejected |

**Crucial outcome:** Both Step85 modes **avoid committing the Step84 106r 1,661-tick near-stop shockwave**, but the currently available spatial movement proposals are still **not physically viable**: the actual swept solver rejects the resulting 106/168 starts much sooner than the 25s shockwave pilot. This is **safer failure handling, not an improvement in large-field completed racing**. Step80's previous 168r double 20s/zero near-stops remains a stronger physically accepted short pilot. **Zero** Step85 106/168 five-abreast full 180s finish.

## Full 180s 8/32 physical races, independent sustained overtakes, replay

[Step85 mirror/renamed and actual long-run verifier](../../scripts/v3/verify-a2-step85-physical-parity-replay-v3.mjs) uses the same original full-bike A64 integrator plus an **independent** pair-based ≥3-second overtaking observer. All 16 short full-field mirror/name physical comparisons passed across **8/32/106/168 × both gate layouts × both Step85 policies**; the checks cover first contact/rejection, selected option, actual position x/y/v and remaining W-prime energy. This is **not** full 180s mirror certification for 106/168.

| Five-abreast race and policy | Actual accepted duration | Near-stop rider ticks | Physical lane changes | Independent sustained ≥3s pair overtakes | Outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| 8r staged, strict | **180s** | 0 | 111 | **8** | Full physical crossing; exact serialized 90+90 physics + observer replay |
| 8r double, strict | **180s** | 0 | 95 | **8** | Full physical crossing; exact serialized 90+90 replay |
| 32r staged, strict | **10.5s** | 0 | 16 | 1 before rejection | Swept contact r015/r016; FAIL |
| 32r staged, balanced | **9.5s** | 0 | 14 | 4 before rejection | Swept contact r005/r006; FAIL |
| 32r double, strict | **6s** | 0 | 3 | 0 before rejection | Swept contact r000/r006; FAIL |
| **32r double, balanced** | **180s** | **0** | **752** | **66** | **Full 180s clean safety and genuine sustained-passing pilot PASS; exact 90+90 replay** |

The successful double-strong 32r field has every rider beyond the second road reopening (rear x2019.095122m), **zero near-stops, original-solver swept contacts, road exits or energy violations**, 66 verified sustained ≥3-second pair overtakes and deterministic 90+90 checkpoint recovery for *both physical state and observer*.

This is the first Step85 contribution that improves the strict no-near-stop result for the 32r **double-strong** route over Step84's 180s / **1** near-stop / 38 passes / 834 lane changes, and Step82's double 180s / 32 near-stop / 45 passes / 971 lane changes. **752 lane changes is still high** relative to plausible real-peloton discipline. The original **Step78 32r staged** 180s / 87 passes / 356 lanes / zero near-stops remains the best protected staged-route reference; Step84 32r staged 180s / 83 passes / 370 lanes / zero near-stops also remains protected. Step85's staged policy must **never** replace those successful variants.

The 8r strict result supports small-field feasibility; it does not generalize to 106/168.

## Test and release guards

- [Step85 first full suite: no-stop unit proof, 16 physical cases, protected A84, A78, A76, React build](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40863236642) — completed SUCCESS.
- [Step85 long true mirror/renamed and 8/32 180s independent passing/replay](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40863409348) — completed SUCCESS, including protected A78.
- [Step85 corrected fail-closed classification and protected CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40863552404) — completed SUCCESS.
- [Step85 strict **zero committed near-stop ticks** hard assertion, all 16 physical fixtures, previous A84/A78/A76 real passing regressions, React build and artifact upload](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40863814467) — **completed SUCCESS** (verified every protected job and evidence upload).

All changes are limited to opt-in synthetic offline scripts, tests, CI and documentation; no active physical controller, live race stage, classification, historic result, Supabase database, payout, game clock or player team data was modified. `main` is the owner-requested destination for scoped code changes, but GitHub CI passing does **not** certify Netlify production deployment.

## Step86 engineering target

**Step85's guard detects an unacceptable result but cannot create enough usable geometry.** The next important change is not merely a deeper lookahead or stronger mass braking; it is to calculate and maintain **feasible group-wide zipper movement plans with forward gap creation**, using coupled achievable acceleration and braking over multiple current-time bicycle rows before riders enter the narrowing. The plan should explicitly coordinate multiple nearby rider neighborhoods so one rider is not given incompatible lateral instructions; check 2D physical road-width capacity and dynamic queue throughput without stopwaves, and use the unmodified A64 all-body physical integrator to approve each half-second. Explore longer physically bounded horizons only with an efficient search strategy, and preserve real racing overtakes/energy and runtime budget.

Require **32/106/168 five-abreast** start grids, **both staged and double-strong gate profiles**, **180s**, all beyond x1470m, **zero near-stop/contact/road-exit/energy violations**, credible rider passing, real mirror/renamed parity and exact 90+90 physics+observer checkpoint. Preserve existing full 32r staged and double-strong successes as hard regression gates.

**Milestone A full 106/168 five-abreast sporting realism: NO-GO. Milestones B gameplay integration and C production authorization: NOT STARTED.**
