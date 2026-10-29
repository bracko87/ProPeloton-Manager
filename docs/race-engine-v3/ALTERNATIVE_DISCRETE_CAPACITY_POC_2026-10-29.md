# V3 alternative simplified capacity-first cycling prototype

**October 29, 2026. Experimental architecture pivot after A64 Steps 102–108. No production release.**

The user's objective is a racing manager with credible rider speeds, peloton/group splits, breakaways, overtakes, hills and outcomes, NOT mandatory centimeter-accurate lateral bicycle trajectories. The current A64 106/168 field controller fails around 17 seconds in a staged narrowing. Do not keep iterating arbitrary speed constants or present a 32-rider 180-second physics benchmark as a playable race.

This research-only alternative uses longitudinal individual rider positions, individual bounded acceleration/braking (+0.45/-0.85m/s2), a 6.5m/s minimum moving speed, separate energy reservoirs, and explicit safe longitudinal headway *per discrete lane*. Initial starts are five-abreast. At the first gate, riders receive deterministic two-lane channel admission slots 0.3 seconds apart in each channel. An initial approach cruise is solved to reach the reservation at the exact simulated timestep without stopping or assigning any position retroactively. Riders traverse both narrow road sections in two channels. Wider road capacity between narrowings is intentionally not exploited in this first proof.

**Important physical approximation:** The moment of lane admission is an **atomic conceptual handoff** from one wide lane to a narrow traffic channel. No continuous lateral bicycle-body sweep is simulated, unlike A64. Passing proves safe *discrete lane occupancy* and plausible manager-level race flow, NOT a feasible real-world bicycle trajectory, no teleportation, or a physical proof of five-wide merging. Do not misrepresent this point.

A 24-rider dedicated breakaway scenario independently exercises a leader group accelerating away and being caught. Grouping is rebuilt from consecutive adjacent rider time gaps <=8 seconds and group membership alone never dictates individual speed. Overtakes require an actual initial-to-final cross-lane x-order inversion. Determinism is established by a fresh full replay plus 90+90-second saved checkpoint equivalence. Negative failures reject the whole candidate and print the first conflict.

Mandatory success gates: 106 and 168 riders, each staged/double layout, 180 actual simulated seconds, all riders past both constrictions, no lane occupancy conflicts or below-6.5m/s movement, actual overtakes, independently observed splitting/rejoining and deterministic/serialized replay. Tests also protect the original Step86 full 180s 32-rider A64 baseline, Step101 original 8s groups, and React production build.

This is a **technical proof of concept**, NOT a first playable version: no browser UI, race scheduling, rider stats imports, results publication, mountains, drafting balance, live DB, economics or official engine integration. Those require separate milestones. The production engine and all user race data stay unchanged.

## Verified prototype outcomes — 29 October 2026

[GitHub Actions run 40955972629](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40955972629) verified the independent simulator, with **every individual research assertion passing**:

| Five-abreast field | Layout label | Real accepted discrete ticks | Both x=1020 and x=1470 clearance | Cross-channel rider order inversions | Minimum actual speed | Minimum same-lane gap |
|---|---|---:|---|---:|---:|---:|
| 106 riders | staged | 180.0s / 1800 | yes | 1367 | 7.4234 m/s | 2.149396 m |
| 106 riders | double | 180.0s / 1800 | yes | 1367 | 7.4234 m/s | 2.149396 m |
| 168 riders | staged | 180.0s / 1800 | yes | 3401 | 7.284336 m/s | 2.149180 m |
| 168 riders | double | 180.0s / 1800 | yes | 3401 | 7.284336 m/s | 2.149180 m |

All four received **0 discrete lane-occupancy rejections**, **0 minimum 6.5 m/s moving-floor rejections**, and 180.0s accepted. An independent rerun of every field matched its full deterministic SHA-256 trajectory. A separate 32-rider 90+90-second restored checkpoint produced an identical complete state to continuous 180-second execution. **These are passing *game-model simulations*, NOT original A64 physical bike trajectories.**

The independent 24-rider breakaway scenario also reached **180.0 seconds safely**, with a real consecutive-gap **split at simulation 38.4s and rejoin at 76.2s**. This validates grouping and catch-up with separate rider velocities, but does not yet demonstrate balanced race tactics or energy use in a full game.

### Critical nonclaims and unresolved gaps

1. The test labels staged/double currently produce **identical trajectories by design**: this first prototype uses the conservative two-slot capacity for the entire x>=680 course and does not exploit or change roadway width between the two geometric gate checkpoints. Thus two differently named test cases do **not** establish differentiated stage/double geometry, second-bottleneck merge feasibility or full road-profile realism. That must be a separate concrete test before declaring race-road support ready.
2. At x=680, conceptual five-lane to two-channel **atomic lane handoff** omits swept lateral motion. The test guarantees per-channel longitudinal clearance, not collision-free physical bicycle path through a taper. In particular, this prototype cannot be benchmarked as a fix for original A64 continuous swept-contact failures.
3. Current endurance is a simplified independent reserve counter. Road grades, wind, weather, drafting, recovery realism, mechanics, road-furniture hazards, race tactics, stage profiles, official ranking, statistics, multiplayer determinism across real race data and production scheduling are **not implemented** here.
4. The crossing-order-inversion counts quantify abstract same-road passing between the two channels, not realistic overtaking lane-change maneuvers. A future game-play test must inspect whether those counts and observed racing behaviors are realistic.
5. This is only a research-owned module, checker, documentation and dedicated CI. There is **no player-facing interface, no online race test, no production activation, no Supabase query or mutation and no real-user game result**.

### Next acceptance milestones

**Do not resume the A64 continuous collision solver as a prerequisite for a first playable prototype.** First extend this alternative discrete simulator to explicitly support independently tested 5-lane wide sections and two separate merge constrictions, controlled lane transfers with measurable queue occupancy, realistic individual energy, hills, attacks/drafting and race ranking. Then integrate it behind an isolated test toggle/data source with real rider IDs and reproducible seeded results; keep official V2 races untouched. Only after playable testers validate results and balances should we discuss a controlled full-scale production migration.

**Proof-of-concept gate: PASSED for the explicitly simplified abstract lane model. Full race engine / playable game / production readiness: NOT PASSED.**

