# Race Engine V3 — Step98 whole-field conflict graph and 6s original A64 lookahead

**29 October 2026 — synthetic opt-in research; Milestone A sporting NO-GO pending original physical evidence.** No changes to production game races, results, payouts, classification, player records, Supabase or game clock.

## Current science problem

Step97 removed a provable fixed-timetable contradiction (34 first gate appointments at 168 riders double narrow) using whole-race floor-aware gate bookings at 0.35s. Original A64 still rejected every one of 11 106/168-rider full-180s race requests, while 8 riders complete, and protected Step86 32-rider five-wide runs remain the best sportive control. A valid individual gate schedule is NOT a certificate that cyclists can simultaneously move through all lateral and longitudinal constraints.

## New opt-in whole-field physical trajectory proposal

The [Step98 global graph](../../scripts/v3/a2Step98GlobalTrajectoryGraphV3.mjs) uses all 106/168 (or smaller) riders' actual CURRENT x/y/v states to project bounded requested x and y for up to **8 seconds**. It scans every physically interacting rider pair at common 0.5-second temporal samples, identifies potential shared swept envelope conflicts (x<2.25m, y<0.84m), and produces a connected global front/rear request graph. At geometric equal-x ties it never uses IDs/array priority; competing lateral movements are held symmetrically. Otherwise it generates simultaneous leader acceleration goals and capped follower speed commands across the whole conflict graph, with at most six constraint passes. The graph is an intentionally **necessary planning warning**, NOT proof of 2D physical clearance.

Candidate first full-field requests are global_shield, global_coupled, global_surge, protected Step86 gap-wave, Step87 order-pace, baseline and joint. Distinct opt-in pace policies global_graph_strict_v1 and global_graph_balanced_v1 are gated behind their own experiment. Original alternative policies remain untouched.

## True A64 six-second receding search

The [Step98 selection module](../../scripts/v3/a2Step98LongHorizonPhysicalChoiceV3.mjs) considers up to five candidate FIRST fields, continues each with up to two alternative joint futures per tick in a bounded width-two beam for **12 half-second steps (6 seconds)**, and ranks only *actually accepted* solver outcomes. Every preview tick runs unchanged original A64 with true full-bicycle sixteen-subinterval all-pair swept contact, road-edge and W-prime energy. The physical outcome must then pass Step95's achieved speed floor (upstream at x<680 >=6.5m/s, downstream >=4.5m/s, no near-stops). A selected FIRST tick is independently re-swept by original A64 on the real potentially mirrored field. No prediction teleports, edits or repairs accepted physical x/y/v/energy, modifies bicycle width or widens roads. A green 6s preview is explicitly not a 180s success.

Step98 unit test independently verifies the all-rider graph, conflict pairs across multiple starting rows, equal-x geometric tie, mirrored/renamed/permuted-input neutral commands, fail-closed genuine A64 collision and achieved moving-speed veto, no first-state mutation and an actual full six-second A64 preview. Dedicated CI runs protected Step78,85,86,87,89–97; eight original 106/168 five-wide 180s full requests through both staged/double constrictions under the Step97 0.35s booking (not invented completion); 16 real A64 mirror and name comparisons, independent 8/32 physical overtakes and 90+90 serialized physical + observer replay, plus React build.

## Sporting gate

Milestone A passes ONLY if 106/168 five-wide fields actually complete 180 seconds, all pass second narrowing, zero committed collision/road/energy/crawl, meaningful sustained 3s overtakes, mirror/renamed and exact 90+90 replay. Protected Step86 32-rider staged full180 with 80 passes/411 real changes and double with 70/678 remains the sporting benchmark. Technical CI success can truthfully report sporting NO-GO.

No Milestone B gameplay integration or Milestone C live production switch is authorized.
