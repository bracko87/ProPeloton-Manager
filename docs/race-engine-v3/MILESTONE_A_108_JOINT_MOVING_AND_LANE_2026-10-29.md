# Race Engine V3 — Step108 actual moving-speed and global lane coupling

**2026-10-29. Research only, NOT production engine activation.**

Step107 produced a genuine new best **17 seconds** for correctly fully allocated 106/168 rider five-wide staged pinch, with all riders in one peloton, no original A64 collision accepted. The stricter double pinch reached **13s**, then an *achieved-moving-speed* Step95 rejection. The protected original Step86 32 rider 180-second baseline and eight-second peloton rule passed. Merely increasing booked speeds is not sufficient, because original A64 can apply collision-avoidance braking *after* the requested speed is set.

## Step108 research design

[Step108 original A64 controller](../../scripts/v3/a2Step108JointMovingA64V3.mjs) retains Step107's exhaustive ordered two-lane geometry, including both mirror-image center assignment branches. It adds 6 true-physical candidate controllers: unmodified Step107 balanced baseline, floor margin, global upstream leader assist plus floor margin, throughput wave, compact wave and staggered wave. Global headway caps use actual front/rear x/v and relative stopping distance. No commands are permitted to override original A64 acceleration limits, road/body swept collision, steering, energy W-prime or its independent collision-avoidance braking.

**Crucially Step95 still inspects every *actual achieved* 0.5s original A64 trajectory.** Its original 6.5m/s upstream / 4.5m/s downstream moving floor is not modified. The floor-margin logic is a *requested rider speed* and carries no exemption; any resulting physical movement below the protected sporting threshold is rejected, not committed. Likewise a predicted collision is not resolved by accepting an overlapping x/y.

For every physical 0.5s racing step, test up to six fully swept 1.5s original A64 future trajectories in parallel at the same starting authoritative checkpoint. Select by actually collision-free and moving-floor-valid achieved preview duration, achieved minimum speed and genuine forward advancement. Discard *all preview states*, independently re-sweep the winning first original A64 tick, and only then advance the research checkpoint. Eight-second groups are observed solely from accepted original A64 x/v; individual rider speeds and W-prime remain independent.

## Verification

[Step108 GitHub Actions](../../.github/workflows/v3-step108-joint-moving-floor.yml) checks 8- and 32-rider physical commands, unchanged Step107 baseline parity, two independent mirror center branches, exact checkpoint 1+1 replay, the exact <=8-second peloton group rule, protected original Step86 32-rider 180s and production React build. Full 180-second real-physical A64 requests for 106 and 168 riders across staged and double pinch, both center tie branches (8 complete field attempts). Each prints the first original contact *or* achieved-moving-floor veto; only real A64 accepted seconds and real gate crossings count.

**Status before CI inspection:** Step107 best 17s, none passed first narrowing. Step108 result NOT YET VERIFIED. Sporting Milestone A remains NO-GO; overall readiness ~35% provisional; no Supabase / live result changes or automatic deployment of the research controller.


## Initial physical outcome and Step108B correction (29 October 2026)

The initial [Step108 research run 40951546960](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40951546960) passed micro actual-A64 replay and the real 8-case diagnostic job, but **the adaptive policy-swapping controller REGRESSED**: 106/168 staged fields reached **7.0s**, double fields **6.0s**, all failing a real swept-contact between r000 and r001. This was worse than Step107's **17.0s** record. Inspection of chosen policies showed the optimizer oscillating among stagger, wave, floor, compact and fast within the first seconds. A two-step physical preview is not enough to guarantee multi-second coordinated lane entry, and per-half-second policy switches invalidate the long-term meaning of spatial reservations. This is a negative result, not a solved group-flow system.

To address that concrete causal defect without weakening physics, Step108B now runs a **fixed global reservation policy through the entire original A64 trajectory**. All six speed-floor/leader-assist candidates retain the same longitudinal and lateral strategy from first rider movement to first genuine A64 or Step95 rejection. Explicit policy-lock verification requires the unmodified Step107 slots_balanced controller to reproduce *exactly* the same accepted A64 rider x/y/v, finite W-prime and checkpoint as Step108B's base mode. That is the 17-second controlled comparator; policy mixing can no longer create a false improvement or move the collision frontier without a stable trajectory.

[Step108B workflow](../../.github/workflows/v3-step108-joint-moving-floor.yml) adds **48 real A64+Step95 180-second requested experiments** (six fixed strategies × two 106/168 rider fields × two original layouts × both mirror-image center branches). Every test outputs first physical collision versus achieved-moving-speed rejection, actual accepted seconds and original rider grouping. **No 180s or first-gate sporting claim is authorized without the physical evidence.**

**Step108B measured results:** pending actual GitHub log verification. Milestone A remains NO-GO.


## Verified Step108B stable-lane outcomes — October 29, 2026

[Step108B GitHub Actions run 40951912374](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40951912374): the new 48-case locked-lane original-A64 physical job passed its test assertions. The separate 8-case adaptive A64 physical diagnostic, 8/32 rider microtests with exact checkpoint 1+1 replay, and React production build also passed. The protected Step86 full-180 original A64 benchmark was still running when the result was first inspected. These green diagnostic jobs do **not** mean large fields completed a race.

### Actual 106/168 accepted A64 continuous movement

All measurements below hold for both field sizes and both mirrored center-assignment branches.

| Fixed Step108B controller | Staged narrowing | Double narrowing | Failure |
| --- | ---: | ---: | --- |
| base (unchanged Step107 slots_balanced) | **17.0s** | 12.0s | Staged swept contact; double achieved-moving veto |
| floor (+0.9 m/s requested margin) | 16.5s | 12.0s | Staged swept contact; double swept contact |
| wave (global assist and headway) | 6.0s | 5.0s | Swept contact r000/r001 |
| fast (throughput base and assist) | 6.0s | 5.0s | Swept contact r000/r001 |
| compact (compact slots and assist) | 6.0s | 5.0s | Swept contact r000/r001 |
| stagger (stagger slots and assist) | 6.0s | 5.0s | Swept contact r000/r001 |

**48/48 experimental full-field policies failed original A64 collision or Step95 achieved-moving safety before the first narrowing; 0/48 reached 180 seconds; 0/48 passed gate one or gate two.** The best stabilized Step108B result **equals Step107's 17.0s staged best** and does not exceed Step107's **13.0s** double-layout record (from the different Step107 slots_compact controller). The Step108B base comparison independently verified **deep exact equality of original-A64 final state, including actual rider positions, velocities and W-prime**, with Step107 slots_balanced for both sizes and mirrored lane branches. Both real-field sizes remained one peloton under the exact consecutive time-gap <=8s rule during accepted physical movement.

The floor-only intervention shifts the double-pinch reason from *moving-speed veto* to *swept-contact veto*, without creating additional safe duration. Stronger upstream leader acceleration causes a **front-row r000/r001 collision by 5–6s** even with fixed lane order. A command to create space is not a proof of a physically feasible same-row/lateral merge, and may destroy clearance elsewhere.

### Decision / next architecture

**Step108 research complete, sporting NO-GO.** Its contributions are safe fail-closed achieved-speed selection, a documented negative result for half-second controller-policy switching, locked full-field lane-order comparison, and original Step107 exact control parity. It does **not** solve the 106/168 road constrictions. The next solver should jointly allocate **actual signed longitudinal separation and mandatory continuous lateral swept corridors in time**, constrain acceleration *and* minimum-speed feasibility before assigning a merge order, and validate entire multi-rider trajectories with original A64. Do not retry arbitrary speed boosts, relax A64 collision thresholds, accept slow/stopped riders, or convert racing groups into combined physical objects.

Production race-engine V3 remains disabled; no official race clock, results, payouts or Supabase data have been changed. Overall V3 readiness remains an approximate 35% estimate rather than a measured project completion KPI.
