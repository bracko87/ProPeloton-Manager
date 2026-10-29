# Race Engine V3 — Step 78 Phase 2: local 3–8 bicycle prospective physical negotiation

**Date:** 29 October 2026. **Technical isolation / fail-closed regression gate PASS; 106/168 five-abreast sporting gate NO-GO.**

## Purpose and actual change

Phase 1's two globally fixed pre-commit suggestions could not keep a large five-abreast peloton physically apart. This phase introduces a distinct [local research negotiator](../../scripts/v3/a2Step78LocalNegotiationV3.mjs) and two **opt-in** research policies in [the existing offline wrapper](../../scripts/v3/a2MultiGatePhysicalCandidateV3.mjs):

- `joint_local_negotiation_v1`: evaluate the existing baseline and joint global suggestions through the authoritative swept all-body solver. Only when neither is acceptable, build alternative **current-state 3–8-rider** steering/pace requests centered on the prospective first collision; evaluate each as a complete, isolated proposal before committing anything.
- `joint_local_preemptive_v1`: additionally evaluate local requests proactively based on present x/y/v proximity and intended shared corridor, even while a base proposal remains acceptable. This is an experiment, **not** an approved replacement policy.

The three coordinated local proposals are **hold a conflicting lateral move**, **protect a lead rider's physically bounded acceleration while warning/braking a follower**, and **selective lane holding**. A failed prospective half-second sweep can identify a pair to evaluate in a subsequent uncommitted proposal, but **no rejected tick is ever applied, repaired or treated as a valid future rider state**.

The original A64-A76 integrator still solely controls all synchronized accepted 0.5-second movement, speed, body envelopes, swept contact, W-prime, road edge and actual lateral displacement. It retains bounded +0.45m/s² acceleration, −0.85m/s² braking, ±0.38m/s lateral speed and 0.3m bicycle half-width. Neither proposals nor diagnostic results change the production race engine, Supabase or published racing.

## Strict physical test results

[24-case Phase 2 initial physical matrix](../../scripts/v3/verify-a2-step78-phase2-local-negotiation-v3.mjs) spans 8, 32, 106 and 168 **five-abreast** riders, the distinct 3.3→2.2m staged and double-2.2m narrowings, default variable starting speeds and (for 106/168) equal 9m/s neutral starts, with both opt-in policies.

| Fixture | Outcome | Sporting interpretation |
| --- | --- | --- |
| 32, staged, non-preemptive | **180s**, all beyond second reopening, zero detected swept collisions, roadside exits or near-stop ticks, 356 physical lane changes | Retains the credible Phase1 synthetic pilot |
| 32, double-strong, non-preemptive | 180s; **21 near-stop rider ticks** | Collision-free but **fails** strict sporting quality gate |
| 106, double-strong, preemptive variable start | **14 accepted seconds** (up from the 8.5s Step78 Phase1 best), then first rejected swept contact pair r047/r052 | **342 near-stop rider ticks even before contact**, therefore the extra duration is not a sporting success |
| 168, double-strong | Best **8.5 accepted seconds**; swept contact then rejected | No proven large-field advance |
| 106/168, staged | All tested policies reject a swept body contact early | Multi-gate admission remains unresolved |
| 32, staged, preemptive | Early first contact at 10s | Strong evidence that undisciplined prospective local intervention **damages** an otherwise working controller |

**Large-field 180s clear/no-near-stop count: 0**. The first 106/168 contact remains a true failed full-body proposal and is discarded; a green test script is not a green sporting run.

## Independent checkpoint, identity, and overtaking evidence

A second [local-policy physical sporting and parity verifier](../../scripts/v3/verify-a2-step78-phase2-local-replay-v3.mjs) independently reran the new **non-preemptive** 32-rider staged policy:

- **180 seconds accepted**, every rider beyond x1470m, rearmost **2055.248234m**, **zero contacts/road exits/near-stop ticks**, 356 physical lane changes.
- **87 independently verified true rider-pair passes sustained at least 3 seconds** from actually accepted physical movement.
- **Exactly identical 90+90-second serialized full physics + separate passing observer** recovery.
- Full 180-second reflected-road and renamed-ID physical/energy parity.
- **16 additional short-run mirrored/renamed parity scenarios** cover 8/32/106/168 riders and both road geometries under *both* local policies, including where the original physics correctly rejects a contact.

All unit-level local negotiations leave source states/requests immutable, reject malformed/duplicated rider identities, and never bypass the authoritative solver.

## Protected regressions and build

[Step78 Phase2 final GitHub workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40842576852) completed **both** the strict physical audit and React production build successfully. The workflow also ran:

- The original **A77 five-abreast 32r staged**, with 180s, **87 independent 3-second passes**, no near-stops, replay and mirror parity.
- The original **A76 three-abreast 32/106/168** strong-double, 180s all, **58/151/198** true sustained pair passes, zero detected contacts/road exits/near-stops and exact checkpoint recovery.
- Step78 Phase1 new coupled physical and 32r sporting/replay tests.

These protected passes **do not demonstrate 106/168 five-abreast capability**.

## Decision and next gate

**Decision: Phase2 technical implementation and investigation PASS; original 32r synthetic staged pilot is protected; 106/168 five-abreast sporting capability remains FAIL / NO-GO.** The preemptive candidate which temporarily improves 106r accepted duration also causes severe unrealistic stopping. It is **not** promoted or enabled in production.

**Step79 recommended direction:** replace a single locally dominant pair's limited one-tick corrective proposals with a **distributed spatial reservation/viability model** across multiple simultaneous 3–8 bicycle neighborhoods. Plan physically reachable timed zipper positions early enough for the most rearward 106/168 riders, preserve per-rider acceleration and actual speed dynamics, and prevent a crowd-wide artificial slowdown. Require 180s with every rider past the two narrowings, no near-stops, meaningful independent sustained overtakes, mirror and rider-ID equivalence, and exact serialized physics+observer recovery. Only then extend to realistic long-stage terrain/drafting/power and consider Milestone A sporting approval.

**No live race, current Supabase data, classifications, payouts, game clock or production race engine was modified. Full Milestone A sporting = NO-GO; Milestones B/C remain NOT STARTED.**
