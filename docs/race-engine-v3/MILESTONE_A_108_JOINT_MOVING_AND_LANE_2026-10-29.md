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
