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
