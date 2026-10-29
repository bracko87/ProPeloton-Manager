# Race Engine V3 — Step99 persistent whole-peloton space-time reservations

**29 October 2026 — Milestone A, research-only opt-in experiment.** No production live race controller, historical outcome, payouts, Supabase state or game clock touched.

## What is new

Steps97/98 established that neither corrected two-gate global appointment windows nor an 8-second whole-field conflict forecast plus 6-second original-A64 physical lookahead yields complete large 106/168 five-abreast racing. Step98 concluded technical CI 4/4 but sporting 0/8 full180s, best accepted 9.5s, with its controller unable to persist commitments across half-second requests.

Step99 introduces a *serializable globally assessed* [physical space-time reservation ledger](../../scripts/v3/a2Step99PersistentReservationsV3.mjs) for each actual leader/follower/corridor/gate relation. The claim explicitly stores leader and waiting rider, gate ID and physical x, requested lateral target, accepted-clock claim start, bounded expiration, and the reserved steering window. Existing claims are revalidated against **current achieved** relative longitudinal position, closing speed, steering time and target gate; physical headway loss, clock expiration, gate mismatch or completion forces revocation. New claims are acquired only if the achieved bicycle gap and available distance can support the requested lateral manoeuvre. Same-x geometric ties cannot use IDs, list order or mirror side as right-of-way.

All pair conflicts are evaluated across the entire physically proximate peloton—not only neighboring five-rider start rows. Requests combine bounded forward assistance for a leader with capped follower desired speed (never commanded below 6.5m/s) and holds on incompatible lane change requests. Multiple claims affecting the same cyclist are accumulated before output. First-gate claims cannot silently transfer to the second gate. Reservations are ADVISORY only; a claim is not permission to override actual 16-subinterval A64 all-pair swept bicycle collision, road edges, force/braking constraints or W-prime ledger.

The new opt-in **persistent_global_strict_v1** and **persistent_global_balanced_v1** policies test seven first-field candidates (three newly reserved hold/flow/release requests, Step86 physical gap wave, Step87 row pace, baseline, Step78 joint), then use the unchanged Step98 original A64 lookahead selector with a *four-second/eight-half-second* physical continuation and two future options per tick, preserving the Step95 achieved upstream speed >=6.5m/s, downstream >=4.5m/s and near-stop veto. Only independently original-A64 accepted real first movements can commit or renew saved claims; hypothetical search futures never write a lease or mutate accepted x/y/v/energy. Mirror canonicalization and identity renaming are explicitly tested.

## Validation matrix

[Dedicated Step99 CI](../../.github/workflows/v3-step99-global-trajectory.yml) includes pure claim acquisition/reuse/revocation, two-gate handoff, equal-x neutrality and reflection/identity/order tests; the protected Step78/85/86/87/89–98 regression suites, real original-A64 106/168 × staged/double × strict/balanced 180-second attempt with actual near-stop/speed/energy audit, 16 original A64 mirrored+renamed comparisons, independent 8/32 180-second actual overtake+lane-change+exact 90+90 checkpoint tests and React production build.

**Sporting GO is not determined by green CI.** Only 106 AND 168 full 180s five-wide, two actual gates completely crossed, zero contact/road/off-energy/crawl, sustained true >=3s overtakes, parity and exact recovery can approve milestone A. The earlier Step86 32 five-wide full180 staged 80 passes/411 changes and double 70 passes/678 is the protected benchmark. Milestones B/C not approved. No production rollout.

## Physical results

To be populated only from completed GitHub Actions original A64 logs. Research-only Step99 must be rejected for sporting activation if it does not pass its real complete large-field gate.

## Verified Step99 physical outcome — 29 October 2026

[Corrected dedicated Step99 original-A64 CI run](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40922850209): **4/4 technical jobs SUCCESS**: pure global claim tests and protected Steps78/85/86/87/89–98 regressions; original A64 8 × 106/168 true 180-second requested physical races; 16 mirrored and renamed original-solver comparisons with independent 8/32 overtaking+exact 90+90 replay; and React production build. The original Step99 prototype's first run [40921329960](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40921329960) exposed **hundreds of conflicting simultaneous reservations per field** (869 acquisitions in 106 staged strict). That was not a coherent whole-field schedule. [Fix 18250b0](https://github.com/bracko87/ProPeloton-Manager/commit/18250b099812da41c4d6acfd45590ee0cca17703) replaced per-pair acquisition with one *geometrically neutral disjoint rider matching*: at most one reservation role per rider, conflicts denied, equal-priority competitors tied without ID/array/side advantage, and old accepted claims still physically revalidated before continuing. Pure tests explicitly check no oversubscription, mirror, rename, permutation, safety revocation, bounded expiry, two-gate handoff, immutable inputs. A global partial matching is not yet a guaranteed physically achievable connected schedule.

### Actually accepted large five-abreast original-A64 seconds

All **eight** cases requested 180 seconds. Rejections below are truthful physical/moving NO-GO, not collisions suppressed, completed stages or fictitious accepted motion. The A98 prefix identifies the underlying reused genuine Step98 original-physics/Step95 achieved-moving guard.

| Riders | Narrowing | Controller | Accepted seconds | Exact failure | New claims (matched) | Active claims at rejection | Original-A64 preview sweeps |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: |
| 106 | staged | strict | 4.5 | A98_NO_MOVING_PHYSICAL_REQUEST | 32 | 31 | 150 |
| 106 | staged | balanced | 4.5 | A98_NO_MOVING_PHYSICAL_REQUEST | 30 | 30 | 148 |
| 106 | double | strict | 4.0 | A98_NO_MOVING_PHYSICAL_REQUEST | 42 | 27 | 313 |
| 106 | double | balanced | 4.0 | A98_NO_MOVING_PHYSICAL_REQUEST | 43 | 28 | 301 |
| 168 | staged | strict | 4.5 | A98_NO_MOVING_PHYSICAL_REQUEST | 32 | 31 | 150 |
| 168 | staged | balanced | 4.5 | A98_NO_MOVING_PHYSICAL_REQUEST | 30 | 30 | 148 |
| 168 | double | strict | 4.0 | A98_NO_MOVING_PHYSICAL_REQUEST | 42 | 27 | 313 |
| 168 | double | balanced | 4.0 | A98_NO_MOVING_PHYSICAL_REQUEST | 42 | 27 | 313 |

**0/8 large full180; no large second-gate passage.** Zero committed near-stop and upstream/downstream below-speed-floor rider ticks, zero committed original A64 swept collisions, road-edge or energy corruption. The 106 staged strict claim count dropped **869→32** after preventing simultaneous overlapping roles. That fixes the malformed reservation graph but is not itself a sporting gain: the 106/168 best time remains **4.5s**, down from Step98 best 9.5s, Step97 11.5s, Step96 13.5s.

### Physically independent fairness, overtakes and replay

All **16** mirrored/renamed whole-field physical comparisons reproduced original accepted x/y/v, W-prime and selected policy; no arbitrary left/right/ID priority. Actual 8/32 full-race requests:

| Riders | Road | Controller | Accepted seconds | Genuine independent >=3s overtakes | Lane changes | Past second gate | Exact physical + independent observer 90+90 replay |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| 8 | staged | strict | **180** | **7** | 57 | Yes | Yes |
| 8 | double | strict | **180** | **6** | 165 | Yes | Yes |
| 32 | staged | strict | 8.0 | 0 | 5 | No | Not reached |
| 32 | staged | balanced | 3.5 | 0 | 2 | No | Not reached |
| 32 | double | strict | 5.5 | 0 | 1 | No | Not reached |
| 32 | double | balanced | 5.5 | 0 | 1 | No | Not reached |

All accepted smaller-field ticks also have zero near-stops. Protected original Step86 32-rider true full180 staged **80 independent sustained passes / 411 physical lane changes**, double **70 / 678** remains much better; the research controller must NOT replace it.

## Sporting decision and next research question

**Step99 experimental persistence and immutable, mirror-neutral, globally disjoint reservation state are implemented and fully technically validated; Milestone A remains sporting NO-GO.** Persisting claims and removing contradictory pair assignments is not sufficient to find a feasible **whole-field** 5-abreast to 4/2-wide dynamic motion plan. Important early failures occur before the first taper when hundreds of riders are still physically packed in rows; an available local gap does not prove the network of simultaneously required gaps can evolve while everyone keeps moving at 6.5m/s or faster. The current 4-second two-future physical beam still frequently cannot propose even one full safe 4s continuation.

The next research should explicitly model the full **global time-expanded occupancy problem** (bounded achievable x/y/v, lane-change intervals, cross-row precedence, signed clearance and reservation time), solve or falsify concrete fixed-grid initial-condition feasibility, and re-sweep any candidate through untouched A64. Do not infer mathematical impossibility from finite heuristic failure, lengthen an ineffective horizon without new constraints, relax collision geometry, or revive the oversubscribed claims. Keep source calibration and 106/168 180s sporting criteria before any Phase B gameplay interface or Phase C production integration. No live race, payouts, rider classification, Supabase, historical results or game clock changed.
