# Race Engine V3 — Step 79: distributed overlapping local spatial admission

**Date:** 29 October 2026. **Decision: technical research/invariance gate PASS; 32/106/168 five-abreast sporting gate FAIL / NO-GO.** No live or official engine integration.

## Problem and experiment

Step78 coupled two full-field speed/steering proposals and then added a single local 3–8-rider group. The 32-rider 3.3m→2.2m staged scenario physically passed 180s with 87 independently sustained 3-second overtakes, but no 106/168 five-abreast physical test survived beyond 14s; that longest run had 342 near-stop rider ticks.

Step79 introduces an **opt-in synthetic distributed multi-neighborhood planner**: [distributed adjacency graph](../../scripts/v3/a2Step79DistributedAdmissionV3.mjs), [current-tick full-field candidate selection](../../scripts/v3/a2Step79PhysicalChoiceV3.mjs), and [research-only physical wrapper](../../scripts/v3/a2MultiGatePhysicalCandidateV3.mjs).

- Determine risky overlapping rider neighborhoods (up to eight riders each) from current bicycle positions, speeds, proposed lateral track overlap and physical closing speed. Process multiple overlapping regions rather than only a single first-contact pair. All graph requests remain **proposals**, not accepted motion.
- Test six synchronized, whole-field physically bounded proposals: original baseline, Step78 coupled, upstream cruise assistance, distributed lane holds, five-rider row geometric zipper and combined spatial zipper. The planner cannot change past accepted states, future official race events or rider ID-based rules.
- Two experimental selection policies: `distributed_multiwave_v1` favors greater actual accepted advancement with no increase in near-stop ticks; `distributed_risk_v1` evaluates remaining longitudinal braking room and actual proposed lateral closeness across the **full accepted candidate field**.
- **Every** candidate goes through the original unchanged authoritative A64 swept full-bicycle contact, road-edge and energy solver; proposals rejected on contact are discarded. The winner's complete physical half-second movement is committed only after full authoritative acceptance. No teleportation, instant braking, passing-through overlap, road widening or near-stop waiver.
- Mirrored experiments use a canonical **planning-only** road orientation to eliminate numerical left/right policy-selection drift. The chosen candidate is **reapplied and newly validated through the original solver in the true mirrored road coordinates**; canonical preview x/y/v/energy is never transplanted or used as an accepted movement. Exact 1e-6m pose precision and rider-ID neutrality are maintained.

## 24 actual 180-second physical trial results

[Strict Step79 physical matrix](../../scripts/v3/verify-a2-step79-distributed-v3.mjs) compares both policies in 8/32/106/168 rider **five-abreast** body-valid starts, two distinct synthetic double-gate profiles and default / 9m/s neutral starting speed for the large fields. The technical test passes only when it truthfully records swept contact, immutability and fail-closed rejection.

| Field | Progress-favoring distributed | Braking-risk-aware distributed | Sporting result |
| --- | --- | --- | --- |
| 8, staged 3.3→2.2m | Full 180s | Full 180s, zero near-stops | Pilot pass |
| 8, double 2.2m | Full 180s | Full 180s, zero near-stops | Pilot pass |
| 32, staged | 8s, swept contact | 10s, swept contact | **Regression against working Step78 32r 180s** |
| 32, double | 6s, swept contact | 6.5s, swept contact | **Not safe** |
| 106, staged | 8s original start | Best 8.5s neutral start | **NO-GO** |
| 106, double | 6–6.5s | Best **12s** neutral start, **zero near-stop ticks before collision** | **NO-GO** |
| 168, staged | 7–8s | Best 8.5s neutral start | **NO-GO** |
| 168, double | 6–6.5s | Best **15.5s** neutral start, **zero near-stop ticks before collision** | **NO-GO** |

The best 168-rider risk-policy double-narrowing candidate rejects pair `r009/r013` after 15.5 seconds, with rearmost x=513.37995m. The best 106-rider neutral double candidate rejects pair `r010/r016` after 12s. These are strictly **accepted durations before the next swept collision would occur**, not completed races. **Zero** 106/168 rider full 180s/no-near-stop results exist.

The new mode also damages 32-rider full passage. **Do NOT promote any Step79 distributed policy** to the game or replace the previously certified Step78 staged policy. A modest early improvement in the 168-rider case is not an acceptable reason to relax the real collision or near-stop checks.

## Strong independent determinism / checkpoint proof

[Step79 dedicated physical parity and checkpoint verifier](../../scripts/v3/verify-a2-step79-risk-parity-replay-v3.mjs):
- Eight physically evaluated short-run mirror/renamed-ID pairs: n=8/32/106/168 × staged/double. The full actual x/y/v/energy fields, accepted times, rejection outcomes and selected policy counts match across corresponding symmetric/renamed trials, **including rejected large fields**.
- 8-rider risk policy completes both staged and double 180-second circuits without contact, road-edge violation or near-stop ticks. It achieves **8 independently sustained 3-second passes** (staged) and **3** (double) under a separately coupled observer.
- Exact independently serialized **90+90-second** replay for each complete 8-rider physics+observer trajectory, not just matching a hash of an uncommitted admission reservation.

## Protected prior approved offline pilots and build

The [final Step79 full validation workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40845418985) completed successfully. In addition to all Step79 tests it re-ran:
- Original A78 32-rider five-abreast staged 180s **87 real sustained passes**, 90+90s JSON replay, mirror/renamed parity, no stops/contact.
- Original A77 32-rider five-abreast staged 180s **87 independently sustained passes**, no stops/contact.
- A76 32/106/168 **three-abreast** double-strong 180s with **58/151/198** independent 3-second sustained passes and zero near-stop/contact/road exits.
- React production build `npm ci && npm run build` succeeded.

These green regression gates protect the *old* successful test fixtures. They must **not** be presented as evidence that the new distributed 32/106/168 five-abreast policy completed a race.

## Next research gate — Step 80

A distributed collection of **myopic half-second proposals** is insufficient even with a causal braking-room score. Spatial admission needs an **actual multi-step physical viability horizon**, evaluating a physically bounded zipper sequence from current states and the static road profile before the first unavoidable contact. Candidate outcomes should preserve group speed and passing behavior, detect impossible 3–8-rider constraints early and avoid near-stop shock waves. Evaluate 32→106→168 five-abreast across both gates with 180s, every rider beyond x1470m, zero near-stops/swept contact/road exit, independently sustained passing, full 90+90s replay and mirror/name parity. Only then expand to terrain/grade, aerodynamic draft, fatigue and stage classifications.

**Milestone A full sporting realism = NO-GO. Milestone B gameplay = NOT STARTED. Milestone C production = NOT STARTED. No live race, Supabase, payout, race history, classification or game-clock data was touched.**
