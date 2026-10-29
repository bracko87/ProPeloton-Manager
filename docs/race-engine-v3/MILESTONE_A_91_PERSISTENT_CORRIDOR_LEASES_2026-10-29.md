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
