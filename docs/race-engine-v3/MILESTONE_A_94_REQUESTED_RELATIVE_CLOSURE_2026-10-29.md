# Race Engine V3 — Step 94: requested relative closing-rate corridor guard

**29 October 2026 — synthetic, opt-in research only.** No live game controller selection, Supabase, race results, rankings, payouts, player data, game clock or migrations were modified.

## Step93 real physical evidence

The [Step93 full original A64 run](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40893022717) passed 4/4 technical CI jobs, but **0/8** large 106/168 full-180 sporting tests, and none of its 32r rolling policies completed 180s. On staged routes Step93 kept zero accepted rider-ticks below 6.5m/s before x=680m, yet still crashed at 8–9 seconds. A following-row center cyclist can catch a preceding-row inner cyclist along their shared necessary lateral merging corridor. Step93 center-fast/inner-slower profiles did not bound requested relative speed through steering.

## Step94 isolated new physical planning

[Step94 relative closure](../../scripts/v3/a2Step94RelativeClosureV3.mjs) uses **uniform rolling speed** upstream rather than center/inner/outer asymmetry. It computes achieved x/y/v and future *requested* velocities over 1.5–4.5s using original bounded acceleration. For every interacting bicycle pair in current/upcoming lateral envelopes, it forecasts whether the requested closing gap is adequate through the entire steering interval. It creates provisional steering holds, concurrent rear speed caps and physically unobstructed leader assist requests. Equal-x ties are resolved only by symmetric achieved geometry or held. Many overlapping pair constraints combine monotonically (minimum rear request cap), not by rider name, array index or road side. Unachievable no-crawl floors are counted, not hidden.

New isolated policies closure_strict_v1 and closure_balanced_v1 compare three Step94 commands with protected Step86 gap-wave, Step87 corridor-order, original baseline and joint commands under A85 guarded three-tick original A64 physics search. Every selected first real 0.5s is re-swept using **unchanged original A64**, including 16-subinterval full bicycle contact, original road envelope, +0.45/-0.85 m/s² legal dynamics, 0.38 m/s steering and W-prime. A hypothetical projection is never committed as actual x/y/v.

## Required validation

[Step94 workflow](../../.github/workflows/v3-step94-relative-closure.yml) checks pure symmetry, achieved/requested closure detection, rider ID and input order invariance, equal-position ties, earlier protected Step78/85/86/87/89/90/91/92/93 controllers, eight real original 106/168 x staged/double x strict/balanced full-180 requests, 16 original physical mirror/name comparisons, independent 8/32 passing, actual lane changes, zero near-stops, true passage through the second gate, exact 90+90 serialized physical/observer replay and React production build. The large-field audit additionally counts accepted speed-under-6.5m/s upstream rider-ticks before x=680m. Technical passing on fail-closed contact rejection is NOT a sporting victory.

Step86 remains protected 32r benchmark: staged 80 independent ≥3s sustained overtakes / 411 actual lane changes; double 70 / 678. No GO without true 106/168 full180, both gates, safe original physics, modest weaving, credible overtaking, mirror/name/replay equality. Milestones B/C remain NOT AUTHORIZED.


## First Step94 actual-body results — 29 October 2026

The [Step94 dedicated Actions workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40895363481) recorded original-A64 full-body 106/168 tests, original-physics 8/32 racing and 16 mirror/renamed controls. The React build passed. A physical job may be technically green because the original solver **correctly rejected a real swept-body contact**; that is explicitly a sporting NO-GO.

### All eight 106/168 five-wide 180-second requests

**0/8 full 180s**, none passed the second gate. Every case stopped on authentic original SWEPT_CONTACT, without committing rejected motion.

| Riders | Road | Mode | Actual accepted | Upstream rider-ticks v<6.5m/s, x<680 | Near-stop rider-ticks (<1m/s) | First pair |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 106 | staged | strict | 16s | 93 | 0 | r030/r031 |
| 106 | staged | balanced | **70.5s** | **2833** | **2073** | r022/r029 |
| 106 | double | strict | 10.5s | 17 | 0 | r015/r016 |
| 106 | double | balanced | 11s | 3 | 0 | r000/r007 |
| 168 | staged | strict | 14.5s | 2 | 0 | r021/r025 |
| 168 | staged | balanced | 13.5s | 0 | 0 | r018/r024 |
| 168 | double | strict | 10.5s | 7 | 0 | r010/r011 |
| 168 | double | balanced | 16.5s | 477 | 0 | r010/r017 |

The 106 staged balanced controller's survival to 70.5 seconds is a large raw duration gain, but is **not sporting progress**: it accomplished the delay with 2,073 actually accepted near-stop cyclist-ticks and 2,833 upstream cyclist-ticks slower than 6.5m/s. This is evidence of physical gridlock, not genuine pack racing. The strict policy avoids true near-stops but still crashes at 10.5–16 seconds. Even the 168 double balanced 16.5s came with 477 slow rider-ticks. The A64 original contact checker was never relaxed.

### Independent 8/32 original racing, overtake observer and exact replay

Full first-7-second original reflected and rider-renamed physical comparisons succeeded **16/16**. Both 8-rider strict runs completed 180s, all riders beyond the second gate, zero near-stops, and exact serialized 90+90 original physical x/y/v/energy and independently sustained ≥3s overtaking-observer replay.

| Riders | Road | Mode | Actual accepted | ≥3s sustained overtakes | Actual lane changes | Real outcome |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 8 | staged | strict | 180s | 8 | 69 | Exact full replay |
| 8 | double | strict | 180s | 7 | 58 | Exact full replay |
| 32 | staged | strict | 10s | 0 | 3 | SWEPT_CONTACT r010/r011 |
| 32 | staged | balanced | 11.5s | 0 | 8 | SWEPT_CONTACT r010/r011 |
| 32 | double | strict | 7.5s | 0 | 1 | SWEPT_CONTACT r003/r004 |
| 32 | double | balanced | 10s | 0 | 3 | SWEPT_CONTACT r010/r011 |

**Protected Step86 sporting benchmark remains decisive:** staged 32r full 180s with 80 independent ≥3s passes and 411 actual lane changes; double full 180s with 70 passes and 678 changes. Step94 cannot be promoted even for 32-rider fields.

## Decision and Step95 research direction

Step94's requested-relative-speed forecast recognized previously missed cross-row conflicts, and its larger-field experiment significantly increased *raw survival* on one configuration. However, physically preserving all cyclists' rolling movement is not achieved and early 32r full-race collision quality deteriorated. **Sporting NO-GO.** The next experiment should integrate a no-crawl/no-near-stop constraint into the actual original-physics horizon *before* it selects a first request, and reject long-lasting stalemates even when they are contact-free. Gap creation must be solved simultaneously with lane-steering feasibility and moving throughput from the dense initial five-wide grid, not by imposing low-speed queues. Include the 2.8m/gap and 6.5m/s upstream criteria, mirror/rename/replay invariance, actual 106/168 180s and protected 32r Step86. No artificial relocation, widening of road, softened contact or bypassed W-prime.

**Milestone A 106/168 sporting NO-GO. No Milestone B gameplay integration. No Milestone C production release or live data writes.**


**Final Step94 CI verification:** [Dedicated Step94 GitHub Actions](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40895363481) finished with **4/4 jobs SUCCESS**: original A64 106/168 full-field physics attempts, original A64 8/32 sporting and mirror/replay, protected Step78/85/86/87/89/90/91/92/93 tests and React build. This green technical result expressly does **not** supersede the 0/8 actual 106/168 full180 sporting NO-GO or the failed 32r outcomes above.
