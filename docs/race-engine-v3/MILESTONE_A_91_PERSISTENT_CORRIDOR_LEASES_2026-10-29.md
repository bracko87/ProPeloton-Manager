# Race Engine V3 — Step 91 persistent achieved-space corridor leases

**29 October 2026 — opt-in synthetic research only.** This milestone is not approved for live races. No Supabase race result, historical classification, payout, player record, game clock or migration is changed.

## Verified Step90 handoff

Step90 completed [original full-body CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40885344872): all four jobs succeeded, mirror/renamed physical parity, protected older algorithms, exact replay for completed 8/32 races, and React build. The 106/168 five-wide runs still had **0/8 actual 180-second finishes**, despite initial staged-pinch survival to 14.5s (106) and 13s (168). The 32-rider balanced full races were inferior to the protected Step86 sporting benchmark: Step90 staged 75 sustained >=3s overtakes / 856 real physical lane changes, double 46 / 1,217. Protected Step86 staged 80 / 411 and double 70 / 678 remain stronger.

## New Step91 hypothesis

Step90 re-computed geometric steering permission every half-second without keeping any record of a corridor's intended occupant. A neighboring row could fill a gap before the previous rider completes its lateral movement.

The [opt-in Step91 lease module](../../scripts/v3/a2Step91PersistentCorridorLeaseV3.mjs) maintains limited-duration claims tied exclusively to *achieved* front/rear x-gap, achieved velocities, current upcoming gate and bounded steering. Rider names, input array order and geographical left/right do not assign priority. Equal-x ties never acquire a lease. Existing claims are revalidated against each achieved physical state, revoked if the attained clearance disappears, released after gate passage, and expired after their bounded lifetime. A revoked/expired claim cannot immediately reacquire in the same update.

A lease is **not a physical collision certificate**: it only adjusts temporary steering/speed requests; unchanged A64 all-pair swept bicycle contact, narrowing-road boundary, legal acceleration/braking and W-prime physics solely determine which actual next 0.5-second states can be committed. Leases are renewed only *after* A64 accepts the actual physical movement. Rejected ticks never commit provisional leases. The optional snapshot's step91Leases field is serialized so 90+90 checkpoints can be reproduced, with canonical reflection for mirrored routes. Existing policies' snapshots and controls remain unchanged.

Opt-in lease_strict_v1 and lease_balanced_v1 compare original baseline, Step78 joint, Step86 gap wave, Step87 corridor pace and three persistent-lease request variants through the existing bounded original-A64 receding-horizon physical selection. This is a first study of persistent coordination, **not a complete global space-time optimizer**.

## Required verification

[Step91 dedicated CI](../../.github/workflows/v3-step91-persistent-leases.yml) checks pure lease acquisition, renewal, expiry, achieved-clearance revocation, exact serialized restoration and mirror/name/reversed-array neutrality; protected Step78/85/86/87/89/90; all eight 106/168 x staged/double x strict/balanced original A64 full-180 attempts; 16 full-physical mirror/name cases; 8/32 true 180s independent sustained overtake, near-stop, lane-change, road/energy and second-gate checks; 90+90 exact physical/observer checkpoint on completed races; and the React build. A green workflow that correctly rejects an actual swept-body contact is **not** a sporting success.

**Milestone A for realistic 106/168 full peloton 180-second racing remains NO-GO until all original physics, second-gate, no-stop, overtaking and replay gates pass. Milestones B/C remain unauthorized.**


## First completed Step91 original A64 evidence — 29 October 2026

The [Step91 dedicated workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40888102673) completed with **4/4 jobs SUCCESS**. The job for pure lease lifecycle, current-geometry symmetry and protected Step78/85/86/87/89/90 regressions passed. Original-physics mirror and rider-name audit was **16/16**, and exact serialized 90+90 physics plus independent overtake-observer replay passed for every 8/32 course that actually survived 90 seconds. React production build passed. There were no official writes.

### Eight decisive 106/168 five-abreast full-180 attempts

All eight early encounters were genuinely **rejected SWEPT_CONTACT** by the original A64 full-body solver; **0/8** completed 180 seconds or reached the second gate. A zero near-stop count **before** each early rejection is not a successful sporting race.

| Riders | Road | Strict actual accepted | Balanced actual accepted | First contact (strict) |
| --- | --- | ---: | ---: | --- |
| 106 | staged_pinch | 11.5s | 11.5s | r086 / r091 |
| 106 | double_pinch | 11.5s | 12s | r016 / r017 |
| 168 | staged_pinch | 13s | 11s | r041 / r047 |
| 168 | double_pinch | 10s | 7.5s | r041 / r042 |

Compared with Step90, persistent claims do not improve large-peloton survival consistently. The Step90 106 staged best of 14.5s remains stronger, and no Step91 policy meets the actual multirow racing requirement.

### Independent physical 8/32 sporting and replay

| Riders | Road | Policy | Real accepted | Near-stop ticks | Actual lane changes | >=3s sustained pair overtakes | Full 90+90 replay |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| 8 | staged | strict | 180s | 0 | 130 | 6 | Exact |
| 8 | double | strict | 180s | 0 | 232 | 7 | Exact |
| 32 | staged | strict | **16.5s** (contact) | 0 | 26 | 2 | Not reached |
| 32 | staged | balanced | **180s** | 0 | 678 | 80 | Exact |
| 32 | double | strict | **180s** | 0 | 991 | 56 | Exact |
| 32 | double | balanced | **180s** | 0 | 966 | 55 | Exact |

Every 180-second field had all bicycles beyond the second gate, no committed swept-body collision/road exit/W-prime violation, zero near-stop ticks and exact serialized physics+observer replay. This improves Step90's 32-rider staged balanced (75 passes, 856 changes), and unlike Step90 double strict this 32-rider strict layout completed. It does **not** exceed protected Step86 sporting quality: staged 80 passes with **411** lane changes; double 70 passes with **678**. Lease-based 32r races still weave too much, particularly at the second gate.

## Decision and Step92 direction

**Step91 technically verified, but sporting NO-GO for Milestone A 106/168 five-abreast.** Local pairwise persistent claims cannot reserve the *joint time-expanded 2D corridor space of multiple neighboring rows*, so the same-lane rear/inner/outer bikes continue to encounter physical contacts. The next engineering study should coordinate cohorts of several rows with shared bounded space-time occupancy, explicit longitudinal/lateral velocity envelopes, multi-rider nonstopping gap allocation and entire-steering-interval protection. Continue using actual achieved current state, symmetric geometry, original A64 full-body swept contact and energy authority; never "resolve" contact by teleporting riders, widening roads or inventing no-stop racing. Preserve all reference passes, 32/106/168 actual 180s, second-gate and exact 90+90 replay gates.

**Milestone B gameplay and Milestone C production deployment NOT APPROVED.**
