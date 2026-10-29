# Race Engine V3 — Step105: coupled zipper constraints with actual original-A64 lookahead

**29 October 2026 — separate OFFLINE sporting research only.** No production race engine integration, race simulation cron, payouts, user data or Supabase changes.

## Starting evidence

Step104 passed all four prior CI jobs and all 56 large-field physical diagnostic attempts while producing only **14s** of accepted continuous original A64 movement at best. No 106/168 field cleared the first narrowing. The staged-front collision frontier moved from a first same-row outer/inner pair, to an inner rider versus the following row's outer rider, and then several rows back. This is **not** a solved zipper: pairwise speed fixes repeatedly shift the collision point.

Owner-approved sporting invariant remains: riders belong to the same racing group if their **consecutive gap is <=8s**, group splits beyond 8s, and riders/groups rejoin when the actual physical gap closes to <=8s. This is a label and aerobic drafting context; it is NOT a shared position, rigid grouped bicycle body, group speed lock or a rule changing official finish times.

## Step105 implementation

The opt-in [Step105 joint zipper research](../../scripts/v3/a2Step105CoupledZipperV3.mjs):

1. Constructs two complete **identity-neutral geometric precedence chains**, one on each side of the initial five-wide peloton. Each chain is ordered inner(row 0), outer(row 0), inner(row 1), outer(row 1), and so forth. Center riders have no arbitrary left/right priority; all their swept contacts are still handled by original A64. The original rider x/y, body half-width, lateral speed and official road geometry are untouched.
2. For **every neighboring pair in each chain at the same time**, projects the signed longitudinal gap after a bounded horizon using actual current accepted positions and velocities and requested bounded acceleration. The constraints are coupled: a rider is rear to one rider and lead to another, and adjusting its request affects both. Iteratively propagate bounded request corrections through the entire chain and report any projected infeasible/unresolved pairs. The projection is a *necessary control warning*, not a permission to move or a valid 2-D trajectory.
3. Derives three candidate continuous trajectories (conservative, early, adaptive) by applying those joint speed requests. **Original unchanged A64 physically sweeps all bicycle pairs, continuous road boundaries, and energy for every 0.5s candidate tick.** Only original-A64-accepted first ticks that also meet the Step95 achieved-moving threshold can be selected.
4. Discards two-tick A64 hypothetical continuations and **independently re-sweeps the chosen first 0.5s command** on the unchanged actual physical checkpoint before advancing. Never commits previews, resets energy, suppresses contacts, manufactures gate clearances or advances time without physics. Racing group observation uses original A64 accepted results, through the unchanged Step101 exactly-eight-second group projection.

### Scientific limits

- A projected pair-gap constraint is not guaranteed to be achievable when lateral steering, center riders, gate capacities or the road envelope compete. The design reports projected infeasibility and the first original A64 swept failure honestly.
- A physically accepted 0.5s movement or two-tick lookahead does not prove a complete zipper. The full original A64 106/168, staged/double, **180s** physical acceptance through *both* gates plus meaningful overtaking and exact replay is the criterion.
- No change whatsoever to existing A64 acceleration/braking, bike contact, road widths, safety checks, W-prime, group definitions, protected Step86 baselines or production behavior.

## Verification

Dedicated [Step105 workflow](../../.github/workflows/v3-step105-coupled-zipper.yml): 8/32-rider short A64 physics with mirror and rider rename geometry, one plus one second exact resume and re-sweep, **12 original-A64 180-second requested large-field experiments** (three policies × 106/168 × two exact road layouts), eight-second group breakaway/rejoin tests, protected Step86 full 180s and React production build.

**Physical results / CI:** Pending independent GitHub log inspection. The best evidence before Step105 is Step104's 14s accepted physical prefix and 0/56 successful passage through gate one. No sporting GO, no production activation; overall Race Engine V3 readiness estimate remains ~35%.
