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


## Verified Step98 106/168 original-A64 outcome — 29 October 2026

The first [Step98 CI run](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40917125476) completed **all 4/4 technical jobs SUCCESS**, including pure global-graph physical selector checks, protected regressions, original-A64 106/168 eight-case full180 requested race attempts, 16 physical mirror/renaming short runs, 8/32 sport/checkpoint and React build. It confirmed **0/8** large five-abreast full180 completions. Initially, the experimental selector accidentally limited the *seven* available first plans to just **five**, excluding protected baseline and Step78 joint. That caused staged fields to fail after only 1s and invalidated comparisons of the new search against all available control alternatives. The final Step98 controller was corrected in [commit 483d0ed](https://github.com/bracko87/ProPeloton-Manager/commit/483d0ed965790ed4659e8be8f939710e916249ee) to search **seven** first alternatives and to report true failure status rather than generic NO_ACCEPTABLE_PROPOSAL.

The [corrected Step98 source's dedicated run](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40917539347) has **completed the full eight-case large original-A64 job successfully**. The following are actual *accepted* original solver physical times, NOT predicted 6s horizon duration.

| Riders | Road | Policy | Actually accepted seconds | True failed status | 6-second preview-vetted selection ticks |
| --- | --- | --- | ---: | --- | ---: |
| 106 | staged | strict | 4.0 | NO_SAFE_PHYSICAL_REQUEST | 0 |
| 106 | staged | balanced | 4.0 | A98_NO_MOVING_PHYSICAL_REQUEST | 0 |
| 106 | double | strict | 8.0 | A98_NO_MOVING_PHYSICAL_REQUEST | 5 |
| 106 | double | balanced | 9.5 | NO_SAFE_PHYSICAL_REQUEST | 5 |
| 168 | staged | strict | 3.0 | A98_NO_MOVING_PHYSICAL_REQUEST | 0 |
| 168 | staged | balanced | 3.5 | A98_NO_MOVING_PHYSICAL_REQUEST | 0 |
| 168 | double | strict | 8.0 | A98_NO_MOVING_PHYSICAL_REQUEST | 5 |
| 168 | double | balanced | 9.5 | NO_SAFE_PHYSICAL_REQUEST | 5 |

Every case was asked to run the COMPLETE 180-second original-A64 physical race. **0/8 finished**, **none passed the second narrowing**, all were prevented from committing upstream crawling or near-stop motion, and no A64 collision or road-edge failure was committed. The actual selector executed from **79** to **2,120** original whole-field A64 preview sweeps across each of these failing races; the double-narrowing scenarios sometimes had a genuine complete six-second physically swept projected continuation **at the selected ticks**, but cannot maintain those safe trajectories for the required full race.

The best corrected large acceptance is just **9.5s** (106/168 double balanced), worse than Step97's 11.5s best and Step96's 13.5s. **Longer future lookahead has not fixed the whole-field model.** This is not proof that the physical 5-abreast problem is mathematically impossible; it proves this specific whole-field conflict graph and finite-beam controller cannot solve it.

The first five-first-plan Step98 run independently verified **16/16 original physical mirrored/renamed cases**, and the 8-rider double strict race physically completed 180 seconds with zero near-stops, **4 independent 3s overtakes**, **69 actual lane changes**, every rider past gate two and exact 90+90 physical and independent observer replay. However that first configuration had only 0.5s accepted on 8-rider staged and no completed 32-rider cases. The **corrected seven-first-plan 8/32 parity/replay result must be checked separately**, and the corrected protected regression CI remains pending as of this report. Do NOT cite the first configuration's green CI as proof the corrected config's four jobs all passed.

### Engineering interpretation and next objective

The new eight-second global pair graph genuinely coordinates simultaneous x/y/v request *predictions* and the six-second chooser genuinely sweeps hypothetical full-field A64 motion. But *neither* makes a permanently feasible multigroup crossing reservation. A length-six forecast is repeatedly rebuilt from current commands without persistent multirow allocation / cross-gate conflict-free commitments; a selected first step can lead to physical deadlock a few seconds later. Projected conflicts are sampled at 0.5s, not a sufficient swept envelope guarantee, although original A64 independently rejects actual substep contacts. Finite beam search failure must never be called mathematical impossibility.

**Milestone A sporting NO-GO.** The next research gate should test genuine global x/y/time lane-crossing constraints with persistent priority/order and reserved longitudinal windows (with original accelerations, swept contact, moving floors, exact replay) rather than simply extending the same short-horizon graph. Preserve Step86 protected 32 full180 stage passes and all established tests. No Milestone B/C production integration, race/game clock, Supabase write, user record or payout change.
