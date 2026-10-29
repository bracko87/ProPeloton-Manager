# Race Engine V3 — Step95: achieved physically moving-throughput gate

**2026-10-29. Research-only opt-in controller; Milestone A NO-GO pending full physical sport evidence.** No production controller, race result, ranking, payout, Supabase record or game clock write.

## Evidence from Step94

The [Step94 original A64 audit](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40895363481) technically passed all 4 jobs but 0/8 true 106/168 full 180-second physical races. The 106-rider staged balanced policy lasted 70.5 seconds only by recording **2,073 near-stop rider-ticks** (v<1m/s) and 2,833 upstream crawling rider-ticks (v<6.5m/s before x680). Other large cases failed at 10.5–16.5s original A64 SWEPT_CONTACT. All four Step94 32-rider attempts failed by 11.5 seconds, whereas the protected Step86 32-rider benchmark completes full180: staged 80 independent sustained ≥3s overtakes/411 physical lane changes; double 70 overtakes/678 lane changes.

## Actual Step95 enforcement, not soft scoring

The new [Step95 A64-achieved moving gate](../../scripts/v3/a2Step95MovingPhysicalGateV3.mjs) wraps only the synthetic 3-physical-tick research beam, using the original Step85 candidate scorer without modifying it. It first runs the **unchanged original A64 physics solver** for every offered candidate and every subsequent hypothetical continuation. Then it reads actual achieved x and v and rejects that uncommitted preview if any rider is below **6.5m/s before x680**, or below **4.5m/s beyond x680**, or experiences a near-stop below 1m/s. It does not fake a high speed, widen the road, restart a rejected collision, or silently discard a bad rider. Existing collision/energy/road physics still decide every physical movement.

A preview rejected for sporting crawling is labeled A95_PREVIEW_CRAWL_REJECTED and never surfaced as a real A64 contact. If all physically legal options cause excessive slowdown, the Step95 research controller stops explicitly with A95_NO_MOVING_PHYSICAL_REQUEST, preserves the previous accepted physical field intact, and does NOT claim a full 180-second finish. This is truthful NO-GO, not a hidden crash repair or an artificial pause.

New opt-in pace policies moving_strict_v1 and moving_balanced_v1 reuse all seven original Step94 physical proposal types, but both impose the achieved moving-floor veto (strict additionally favors A85 clearance-first ordering; balanced favors moving-throughput ordering). The selected first half-second is independently re-swept by unchanged original A64; mirrored/renamed fields stay symmetric. The gate checks every proposed 0.5s in all 3 levels of the bounded horizon; it is not proof of future 180-second feasibility.

## Acceptance

[Dedicated Step95 workflow](../../.github/workflows/v3-step95-moving-throughput.yml) checks isolated pure choose/reject/mirror/name/no-mutation; protected Step78/85/86/87/89/90/91/92/93/94 regressions; all eight original A64 106/168 × staged/double × strict/balanced requested 180s, and exact counted **zero accepted upstream sub-6.5m/s ticks and zero near-stops**; 16 physical mirror/name controls; 8/32 realistic sporting overtake >=3s and actual lane changes; exact serialized 90+90 A64 physical/independent observer replay of completed races; and production React build.

The protected Step86 sporting reference is required. There is NO Milestone A sporting GO without full 106/168 five-abreast 180-second racing on both gates with all riders through second gate, zero contact, road or energy failure and moving realistic overtaking. Milestones B and C are not authorized. Production remains unchanged.


## Final verified Step95 actual A64 results (29 October 2026)

[Step95 dedicated GitHub Actions run](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40903327415) completed **4/4 technical jobs SUCCESS**: isolated pure gate and protected Step78/85/86/87/89/90/91/92/93/94 tests, original A64 106/168 full 180s attempts, original A64 8/32 independent overtaking and 16 mirror/name parity tests, and production React build. Technical success means the original solver or the new achieved moving-speed gate **correctly refused unacceptable motion**; it does not mean 106/168 realistic cycling completed.

### All eight 106/168 five-wide full-180 attempts

**0/8 full 180s and 0/8 through second gate.** All stopped because A64 or the research gate could not select an acceptable moving request. No accepted A64 tick had any near-stopped rider or upstream rider below 6.5 m/s, and the original physical solver was unchanged. Note that a no-safe-request reason is not itself a recorded original collision; the wrapper properly reports no committed new physical state and no fabricated contact pair.

| Riders | Route | Policy | Accepted physical time | Actual failure status | Accepted upstream v<6.5 rider-ticks | Accepted near-stops | Rejected preview moving ticks |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: |
| 106 | staged | strict | 13.5s | NO_SAFE_PHYSICAL_REQUEST | 0 | 0 | 102 |
| 106 | staged | balanced | 8s | NO_SAFE_PHYSICAL_REQUEST | 0 | 0 | 0 |
| 106 | double | strict | 10.5s | A95_NO_MOVING_PHYSICAL_REQUEST | 0 | 0 | 53 |
| 106 | double | balanced | 7s | NO_SAFE_PHYSICAL_REQUEST | 0 | 0 | 0 |
| 168 | staged | strict | 13.5s | NO_SAFE_PHYSICAL_REQUEST | 0 | 0 | 49 |
| 168 | staged | balanced | 8s | NO_SAFE_PHYSICAL_REQUEST | 0 | 0 | 0 |
| 168 | double | strict | 9s | A95_NO_MOVING_PHYSICAL_REQUEST | 0 | 0 | 21 |
| 168 | double | balanced | 7s | NO_SAFE_PHYSICAL_REQUEST | 0 | 0 | 0 |

**What improved:** Step94's misleading 106 staged 70.5s run had 2,073 near-stop rider-ticks and 2,833 upstream slow rider-ticks; Step95 now rejects any such A64-accepted but non-sporting preview before selection. This is a successful **fail-closed acceptance guarantee** for accepted 0.5s states, not a successful racing-control algorithm. The inability to find a viable moving request remains unsolved.

### Genuine 8/32 sporting and checkpoint

Original full-body physical mirrored/renamed comparison: **16/16**. Both 8-rider strict paths completed 180 seconds, all riders across second gate, zero near-stops, true independent sustained overtaking and exact 90+90 serialized original A64 physical plus overtaking observer replay. The 32-rider policies all fail before 11 seconds, with no claims of full checkpoint success.

| Riders | Route | Policy | Accepted seconds | Independent ≥3s passes | Actual lane changes | Status | Exact 90+90 |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| 8 | staged | strict | 180s | 8 | 69 | FULL_180 | Yes |
| 8 | double | strict | 180s | 7 | 62 | FULL_180 | Yes |
| 32 | staged | strict | 10.5s | 0 | 3 | A95_NO_MOVING_PHYSICAL_REQUEST | Not reached |
| 32 | staged | balanced | 8.5s | 0 | 0 | NO_SAFE_PHYSICAL_REQUEST | Not reached |
| 32 | double | strict | 8s | 0 | 1 | A95_NO_MOVING_PHYSICAL_REQUEST | Not reached |
| 32 | double | balanced | 6.5s | 0 | 1 | NO_SAFE_PHYSICAL_REQUEST | Not reached |

Protected Step86 sporting benchmark remains staged 32 riders full180 with 80 independent ≥3s passes and 411 real lane changes; double full180 with 70 passes/678 lane changes. **Step95 is still sporting NO-GO** for realistic full racing; the stricter hard-gate exposes the control-law infeasibility instead of masking it with a slow/stopped queue.

## Decision and Step96 engineering objective

Step95 may be retained as a synthetic **research-only safety/sporting evaluator** (accepted-state upstream 6.5m/s, downstream 4.5m/s, global near-stop floor). It must not replace the actual game physics or the protected Step86 controller. The next engineering task must *create new genuine physical gap-opening movement* for the dense five-wide start while maintaining those moving floors: analyze a conflicting 3–5-rider local neighborhood's actually attainable longitudinal acceleration and lateral steering, choose mutually feasible target-speed commands **together**, and require A64 all-pair swept verification over many subsequent ticks, not only flag/cap existing proposals. Preserve no ID/side bias, independent overtaking and exact replay.

**Milestone A 106/168 five-abreast 180s remains NO-GO. Milestones B/C not approved. No live Supabase records, race outcomes, payouts, game clock or user data changed.**
