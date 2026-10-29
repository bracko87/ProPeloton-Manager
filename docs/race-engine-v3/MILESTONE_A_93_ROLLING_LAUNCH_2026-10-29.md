# Race Engine V3 — Step 93 phase 2: preserve rolling launch speed

**29 October 2026, research-only two new opt-in policies. No live race integration.**

## A93 phase 1 real-physics evidence

[Step93 forensic CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40891744703) re-swept 12 synthetic 106/168 five-abreast original A64 starts under three earlier strict controllers (Step90/91/92), on both road profiles. Every first contact occurred while full road width was still **4.4m**, before the synthetic road begins tapering at x=680m. Example original A64 collision data:

- 106 staged Step90: r043/r048 at 14.5s, same x-track y=3.15, achieved speeds 3.32 and 4.12 m/s, only 2.098m physical separation. Both were already commanded maximum -0.85 m/s² and original A64 genuine swept collision happened as their x-gap fell below 1.8m.
- 106 staged Step91: r086/r091 at 11.5s, x-gap 1.82m, speeds 3.92 and 4.29 m/s, both at -0.85 m/s².
- 168 double Step90/91: r041/r042 at 10s, side-by-side starting same row x-gap .31m, speeds 2.81 and 3.05m/s. The inner rider steered 0.19m toward the occupied center lane and original swept lateral separation dropped to 0.8075m.
- 168 staged Step92: r050/r056 at 5s, adjacent starting rows only 1.85m longitudinal gap and 0.76m lateral gap, both moving slowly. Actual full-body sweep rejected contact.
- 168 double Step92: r032/r037 at 10.5s, same physical track y=2.2, gap 1.967m, closing .832m/s while both commanded -0.85m/s².

**Finding:** the early collapse is not primarily caused by the road narrowing. It begins *well upstream*, because booking-paced speed reductions create a dense nearly stopped peloton and overlapping riders are then allowed to steer or are unable to regain sufficient same-track gap. The old "near stop" check (<1m/s) misses 2–5m/s crawl. Racing speed preservation must be explicitly evaluated.

## Step93 targeted controller

The [new rolling-launch research module](../../scripts/v3/a2Step93RollingStartV3.mjs) produces opt-in request-only physical_launch_straight_roll, physical_launch_gap_match and physical_launch_rolling_assist. While the next narrowing is still sufficiently far ahead, it requests a sustained moving pace rather than the early static booking-window crawl, and delays optional lateral movement. Centre/inner/outer lanes receive symmetric *gradual desired-speed differentiation* to create actual x gaps without moving bodies. Near the narrowing, inward steering is allowed only if current actual longitudinal clearance and current pair velocities permit it; otherwise the rear crossing request is held. Emergency front acceleration assistance is bounded and denied when the forward occupied corridor is blocked. The lookahead reaches 395m upstream so the very last starting row of 168 cyclists is included from t=0.

Each candidate is merely a desired speed/steering command. Unchanged original A64 physically caps acceleration (+0.45), braking (-0.85), steering (0.38m/s), bicycle swept contact, actual road width and achieved-energy W-prime. The A85 bounded physical selector compares baseline, joint, protected Step86 gap wave, Step87 order pace and three new requests, with speed preservation preferred over overly pessimistic 1.5s static proximity. Actual selected first .5s is independently swept on the original full field. No committed movement from any predicted state.

## Sporting and technical acceptance

[Dedicated Step93 rolling CI](../../.github/workflows/v3-step93-rolling-start.yml) checks symmetric geometry, immutable requests, no ID or array ordering, protected Step78/85/86/87/89/90/91/92, all eight 106/168 five-wide 180s actual physical runs, independent 8/32 racing and 16 mirror/name physics parity cases, exact 90+90 checkpoint + overtake observer replay and React build. The full-field test also counts **accepted rider ticks below 6.5m/s while the road is still fully wide upstream of x680**, preventing slow-moving but not fully stopped traffic from being mislabeled sporting success. Physical collision/road/energy failure always rejects the actual tick; no collision is repaired, hidden or rescheduled.

Protected sporting benchmark remains Step86 staged 32r 80 independent >=3s passes/411 physical lane changes, and double 70 passes/678 changes. Full 106/168 180s both gates and no crawl, high-quality overtaking and replay remains required before sporting GO. Milestones B/C are not authorized.


## Verified original A64 Step93 rolling audit — 29 October 2026

The [rolling launch physical workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40893022717) audited eight genuine 106/168 five-abreast full-180-second attempts, independent 8/32 sporting and exact physical/observer replay, 16 original swept-physics mirror/name comparisons, and the React production build. The technical status is not the sporting status: all large cases remained NO-GO. The protected regression run has its own final GitHub job result and is not inferred from the physical research job.

### Eight original 106/168 full-180 requests — zero complete

All eight cases stopped at a genuine A64 SWEPT_CONTACT, before the second gate. Every rejected half-second was left uncommitted. No trial completed 180 seconds or had all riders past the second gate.

| Riders | Route | Policy | Actual accepted | First collision | Early slow rider-ticks (x < 680m, v < 6.5m/s) | Lowest upstream v |
| --- | --- | --- | ---: | --- | ---: | ---: |
| 106 | staged | strict | 9s | r003/r007 | **0** | 7.399m/s |
| 106 | staged | balanced | 9s | r003/r007 | **0** | 7.399m/s |
| 106 | double | strict | 11s | r013/r017 | 416 | 3.701m/s |
| 106 | double | balanced | 9s | r006/r012 | 100 | 5.482m/s |
| 168 | staged | strict | 8s | r101/r112 | **0** | 7.183m/s |
| 168 | staged | balanced | 9s | r011/r022 | **0** | 6.825m/s |
| 168 | double | strict | 11s | r013/r017 | 410 | 3.276m/s |
| 168 | double | balanced | 9s | r006/r012 | 158 | 5.106m/s |

These new early slow rider-ticks catch crawling riders that the original 'near stops' indicator misses (it counts only speed < 1m/s). This distinction is crucial: the Step93 strict staged 106/168 launches actually preserved speed over accepted upstream ticks, but the faster following center riders caught inner riders in a preceding start row before an overlapping steering path had physically cleared. The double narrowing policies still generated widespread slow movement even before rejection.

### 8/32 racing quality and independent checkpoint

16/16 physical reflected/renamed comparisons were exact. Both eight-rider strict routes completed the original A64 180s, all riders beyond the second gate, no near-stops, and exactly matched physical-plus-independent-overtaking-observer 90+90 checkpoint restoration. None of the 32-rider rolling policies completed 180s.

| Riders | Route | Policy | Physical accepted | ≥3s independent overtakes | Actual lane changes | Real result |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 8 | staged | strict | 180s | 8 | 62 | Exact replay, full second gate |
| 8 | double | strict | 180s | 7 | 116 | Exact replay, full second gate |
| 32 | staged | strict | 11.5s | 4 | 15 | SWEPT_CONTACT r021/r027 |
| 32 | staged | balanced | 11.5s | 4 | 15 | SWEPT_CONTACT r021/r027 |
| 32 | double | strict | 11s | 0 | 7 | SWEPT_CONTACT r017/r022 |
| 32 | double | balanced | 9s | 0 | 3 | SWEPT_CONTACT r011/r012 |

Reference protected Step86: 32 staged 180s with **80** sustained ≥3s overtakes / **411** physical lane changes; double 180s with **70** overtakes / **678** lane changes. Step93 rolling control is not a replacement even at 32 riders. Full-field 106/168 remains **0/8 sporting passes**.

## Engineering decision and next target

**Step93 is a successfully instrumented synthetic research trial, but is sporting NO-GO for the required realistic full peloton.** The original A64 full-body contact rejection remains effective. Upstream rolling speed alone does not solve safely shared corridors. A simple center > inner > outer speed hierarchy was insufficient: a following-row fast center line can close on a slower preceding-row inner line during a later necessary steering merge. Strict 'near-stop-free' status alone is not an adequate sporting acceptance proxy.

Step94 must constrain *requested future closing rates* across adjacent start rows and all overlapping **actual lateral transition paths**, not just the current relative velocity. Enforce a physically achievable longitudinal gap throughout steering, account for earlier front-row actions and preserve speed above the no-crawl threshold. Recheck the actual A64 0.5-second swept motion, real W-prime and road edges, and keep strict mirror/name/array parity plus independent sporting checkpoints. Do not use arbitrary rider IDs or right/left biases; never manufacture x/y/v, teleport, widen the road or permit accepted contact.

**No Milestone A large-field sporting approval, no Milestone B gameplay integration, no Milestone C production release, and no live Supabase user/race data modifications.**
