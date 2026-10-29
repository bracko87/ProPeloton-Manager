# V3 Step101 — eight-second dynamic race groups and physical drafting

**29 October 2026. Offline V3 research; no live race activation or Supabase writes.**

## Owner-approved sporting rule

Every individual rider retains independently achieved physical position, velocity, energy and tactics. **Group membership is a separate, dynamic sporting interpretation** of their actual relative gaps; it is NOT a speed lock or a shared collision body.

- Exactly 8.000 seconds between consecutive riders **joins** the same race group. Only a strictly larger gap splits.
- For a rider behind a group, measure longitudinal separation from the group's **rearmost rider** at the trailing rider's recent, physically observed forward speed; never compare every rider to the group's foremost rider. This makes adjacent <=8-second links transitive, preventing 120 solo labels in a stretched peloton.
- At one common starting time the entire 120-rider five-wide grid is the peloton P, unless physical riders are deliberately initialized with >8s gaps.
- When 10 riders physically open >8s to the peloton, label them a breakaway; when a rider falls >8s behind the last peloton wheel, label a chase/drop group. Multiple real breakaways/chases can exist.
- Distinct rider movements rejoin and merge when the actual gap returns to <=8s. Group lineage IDs are preserved by the existing physicalGroupTimelineV3 read-only state and serialized checkpoint recovery.
- Eight seconds is a **bunch membership rule only**. It does NOT change existing official finishing bunch-time regulations or collapse individual stage finish times.

## Changes in this step

Updated the existing [physical group projection](../../src/race-engine-v3/physicalGroupsV3.ts) from the previous ad-hoc 2.75-second, 18–55m capped adjacency threshold to exactly eight seconds using current observed separation and the rear rider's recent physical speed. The current [durable group lineage](../../src/race-engine-v3/physicalGroupTimelineV3.ts) automatically consumes the updated projection. The historical 4-rider breakaway example now opens a genuinely >8s gap before later being caught.

Added [Step101 original-A64 accepted-state observer](../../scripts/v3/a2Step101EightSecondGroupsV3.mjs). It reads independently A64-accepted x/y/v fields, reports grouping plus each rider's real nearby 2D leader and conservative aerodynamic work reduction at the achieved speed, never edits position/speed/energy, never permits a collision or awards a free group pace. A rider simply being assigned to P does not grant remote drafting when no bicycle is actually nearby; physical wheel shelter weakens with gap, lateral separation, steep grade and strong crosswind. The game's pre-existing isolated full-stage physicalRaceEngineV3 already has proximity-based drafting and finite rider energy logic; this step does not invent a second unvalidated flat speed multiplier.

## Sporting and proof boundary

This is the requested **grouping rule + physical group/draft observation**, NOT the missing globally collision-free 106/168-rider A64 trajectory controller. It does not solve Step100's inter-row body occupancy gap, and no race engine switch, stage publication or player data change is approved.

Required Step101 tests: 120 simultaneously started riders P, 10-rider breakaway plus one dropped cyclist, actual catch/reabsorption and stable P lineage, strict >8 / <=8 / exactly-8 boundaries, ten individually separated riders with <=8s adjacent links becoming one group, 8-rider original A64 accepted field without state modification, local measurable draft vs solo, no free drafting under strong crosswind/steep gradient, input validation, mirrored/renamed physical groups, legacy 106-rider group replay, finish handling and full checkpoint exactness. All unchanged physical A64 safety and protected Step86 sporting requirements remain separate gates.

## Validation

Dedicated CI: [V3 Step101 eight-second groups workflow](../../.github/workflows/v3-step101-eight-second-groups.yml). Record actual pass/fail job conclusions and any changes to deterministic replay; never treat green CI as a 106/168 sporting victory.

Status at creation: **await GitHub CI**. Milestone A sporting NO-GO; 106/168 original-A64 full180 still 0/8 from Step99. Project readiness ~35%.
