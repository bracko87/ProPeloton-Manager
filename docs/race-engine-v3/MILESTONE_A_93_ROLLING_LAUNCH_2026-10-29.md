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
