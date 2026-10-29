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
