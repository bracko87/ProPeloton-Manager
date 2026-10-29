# V3 alternative simplified capacity-first cycling prototype

**October 29, 2026. Experimental architecture pivot after A64 Steps 102–108. No production release.**

The user's objective is a racing manager with credible rider speeds, peloton/group splits, breakaways, overtakes, hills and outcomes, NOT mandatory centimeter-accurate lateral bicycle trajectories. The current A64 106/168 field controller fails around 17 seconds in a staged narrowing. Do not keep iterating arbitrary speed constants or present a 32-rider 180-second physics benchmark as a playable race.

This research-only alternative uses longitudinal individual rider positions, individual bounded acceleration/braking (+0.45/-0.85m/s2), a 6.5m/s minimum moving speed, separate energy reservoirs, and explicit safe longitudinal headway *per discrete lane*. Initial starts are five-abreast. At the first gate, riders receive deterministic two-lane channel admission slots 0.3 seconds apart in each channel. An initial approach cruise is solved to reach the reservation at the exact simulated timestep without stopping or assigning any position retroactively. Riders traverse both narrow road sections in two channels. Wider road capacity between narrowings is intentionally not exploited in this first proof.

**Important physical approximation:** The moment of lane admission is an **atomic conceptual handoff** from one wide lane to a narrow traffic channel. No continuous lateral bicycle-body sweep is simulated, unlike A64. Passing proves safe *discrete lane occupancy* and plausible manager-level race flow, NOT a feasible real-world bicycle trajectory, no teleportation, or a physical proof of five-wide merging. Do not misrepresent this point.

A 24-rider dedicated breakaway scenario independently exercises a leader group accelerating away and being caught. Grouping is rebuilt from consecutive adjacent rider time gaps <=8 seconds and group membership alone never dictates individual speed. Overtakes require an actual initial-to-final cross-lane x-order inversion. Determinism is established by a fresh full replay plus 90+90-second saved checkpoint equivalence. Negative failures reject the whole candidate and print the first conflict.

Mandatory success gates: 106 and 168 riders, each staged/double layout, 180 actual simulated seconds, all riders past both constrictions, no lane occupancy conflicts or below-6.5m/s movement, actual overtakes, independently observed splitting/rejoining and deterministic/serialized replay. Tests also protect the original Step86 full 180s 32-rider A64 baseline, Step101 original 8s groups, and React production build.

This is a **technical proof of concept**, NOT a first playable version: no browser UI, race scheduling, rider stats imports, results publication, mountains, drafting balance, live DB, economics or official engine integration. Those require separate milestones. The production engine and all user race data stay unchanged.

**Test results:** pending GitHub Actions. A passing prototype would authorize deeper game-design/balance review, not production integration or deployment.
