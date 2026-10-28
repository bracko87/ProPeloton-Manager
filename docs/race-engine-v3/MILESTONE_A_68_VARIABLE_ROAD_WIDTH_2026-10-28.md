# Race Engine V3 — Step 68: changing road width and first actual merge-contact failures

**28 October 2026. Variable-width physics/diagnostic gate PASS; successful narrowed-peloton sporting gate FAIL; full-stage/production NO-GO.**

## What this step changes

The previous [A67 field controller](MILESTONE_A_67_VERIFIED_SUSTAINED_OVERTAKES_2026-10-28.md) validated 106/168-rider interactive **60-second** passing on a **fixed 4.4m nominal five-lane road**. This is not enough: real cycling road widths change, and entering a bottleneck must not push riders unrealistically through one another or over a road edge.

A68 introduces [`a2VariableRoadWidthV3.mjs`](../../scripts/v3/a2VariableRoadWidthV3.mjs) and opt-in road handling in the isolated [normal-start coupled field](../../scripts/v3/a2NormalStartPelotonV3.mjs). It specifies a **spatially varying, symmetric, deterministic** road envelope that is identical for all cyclists. The profile uses absolute forward distance, not a preselected collision time or future accepted A44 motion:

| Segment (synthetic physical x) | Mild road | Strong road |
|---|---|---|
| x up to 680m | 4.4m | 4.4m |
| x = 680–780m, linear narrowing | 4.4 → **3.3m** | 4.4 → **2.2m** |
| x = 780–920m | **3.3m** | **2.2m** |
| x = 920–1020m, linear widening | 3.3 → 4.4m | 2.2 → 4.4m |
| x at or after 1020m | 4.4m | 4.4m |

These are **NOT sourced race-road widths**, confirmed peloton capacity assumptions or UCI regulatory parameters. They are specifically designed to falsify unsafe merge behavior. The maximum nominal steering rate remains **0.38m/s**, acceleration remains **+0.45m/s² / −0.85m/s²** and rider power/W-prime is charged only for committed motion.

Every provisional move is checked against the road boundary **throughout the 0.5-second physical interval**, at 16 microintervals and their midpoints. It must remain within the current physical road envelope at the corresponding forward x. A detected road exit rejects the **entire proposed step**, without silently clamping a position or velocity or altering the clock and energy balances. The full existing all-pair swept-collision checker is still applied independently.

Three offline behaviors have now been screened: `preview_only` (look ahead four current-speed seconds and constrain future lateral targets to allowed road space), and `buffered_headway` (the same lookahead plus a longer, spatially forecast follower headway up to several metres when the road ahead narrows). A third, `yield_reservation`, defers a lateral merge when the next corridor is already occupied within 7m longitudinally, and commands ordinary bounded trailing braking. These are global current-state research policies, not individualized hindsight exceptions. None reads future accepted trajectories or is activated for the selected live game engine.

## Common-start synthetic pilot results

| Rider count | Control, fixed width | Mild preview | Mild buffered | Mild yield | Strong preview | Strong buffered | Strong yield |
|---:|---|---|---|---|---|---|---|
| 32 | **90s CLEAR** | contact **10.875s** | contact **10.875s** | contact **9.96875s** | contact **8.09375s** | contact **8.125s** | contact **9.96875s** |
| 106 | **60s CLEAR** | contact **10.875s** | contact **10.875s** | contact **9.96875s** | contact **8.09375s** | contact **8.125s** | contact **9.96875s** |
| 168 | **60s CLEAR** | contact **10.875s** | contact **10.875s** | contact **9.96875s** | contact **8.09375s** | contact **8.125s** | contact **9.96875s** |

All **18** narrowing trials rejected the proposed motion at the first actual continuous swept rider contact. The preview and buffered options both first fail at **r002/r005**. In the yield-reservation option the original pair no longer collides first, but congestion moves to **r011/r014** at **9.96875s** on both severity profiles and all three field sizes. No result contains a reported road-edge violation; all are detected rider/rider swept contacts. No collision was accepted into the official result or subsequent research physical state, and no rider was teleported. At failure time the accepted simulation clock remains at its last complete **0.5s** physical checkpoint; collision time above is the recorded microinterval time in the *rejected* next step, not the accepted simulation duration.

This is an intentionally **negative sporting result**: restricting the steering target, adding buffered following distance, or naively yielding only one merge requester cannot safely negotiate these synthetic bottlenecks. The mild/strong profiles are not valid for live full peloton races yet.

The unchanged `constant` width profile reproduces the A67 open-corridor 32/106/168 controls with **22 / 51 / 78 completed lane movements** and accepted durations **90 / 60 / 60 seconds** respectively, with zero road guards and no contact.

## Technical gates and limits

- [Step 68 test, all widths, mirrored/renamed field, checkpoint and negative control](../../scripts/v3/verify-a2-step68-variable-road-v3.mjs)
- [A59–A68 continuous integration, historical safety and React build](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-a2-step59-symmetry-and-field.yml)
- All tested road profiles are centered and mirrored exactly; rider relabeling never changes physical outcomes or the accepted step count in either screened merge policy. A physical start placed off the road at x=800m rejects at time 0 with **no accepted step, no movement and no power update**.
- A67 safe same-width original controls, actual confirmed sustained passing, A66 three safe 32-rider **240s** test runs, A65 coordination, A64 normal starts, A63 **67/67** short-field swept safety and older A58–A39 regression suites remain in the workflow.
- The isolated first-swept-contact diagnostic now records both involved riders' previous state, commanded bounded accelerations, intended lateral targets, physical contact positions and active spatial envelope at the substep; it is read-only and cannot change movement or hide failures.

**Forensic finding, no hindsight action authorized:** In the mild preview case at 10.875s, `r002` at y=3.3m and `r005` at y≈4.1003m have only **0.6923m** longitudinal separation; the lateral crossing approaches the 0.8m collision envelope. In the strong preview case, at 8.09375s the pair have ≈**1.8044m** longitudinal separation and ≈**0.798m** lateral separation. The new yield-reservation policy removes that first pair, but at 9.96875s `r011` and `r014` in the outer y≈4.4m corridor are only **1.8108m** apart longitudinally and both request the maximum **−0.85m/s² braking**, while the rear travels faster. This demonstrates a **multi-rider braking-chain conflict upstream of the pinch**; a single follower's already-maximal brake cannot stop gap loss if the leader is also forced to brake at the same rate.

**Technical diagnostic gate: PASS. Narrowing sporting safety gate: FAIL. Milestone A full-race sporting NO-GO. Milestones B/C NOT STARTED.**

## Next Step 69 — actual merge admission and priority

Analyze both the **r002/r005** unsafe inward merge and **r011/r014** upstream braking-chain compression. Add **nonclairvoyant, bounded multi-rider merging coordination** that propagates required headway upstream and prevents a leader and its faster follower from simultaneously max-braking into a fixed closing gap. Establish physical merge order before the pinched road, without increasing acceleration/braking limits, resetting velocities, accepting overlap, or turning off passing. Demand safety on **32, 106 and 168-rider** moving-width scenarios with mirrored/renamed deterministic checkpoint resumes, while preserving all known constant-width and historical 67-case regressions.

If a physically feasible merge cannot be completed before a road restriction, the correct research result is fail-closed and sporting NO-GO—not a synthetic post-hoc rider relocation. Longer sourced real profiles, drafting, power and real breakaways/classifications remain essential before live activation.

**Production protection:** only offline V3 research code and documentation were changed on GitHub `main`. No Supabase record, official race, live rider, classification, payout, game clock, Netlify-selected race policy or customer data was modified.
