# Race Engine V3 — A60: chronological first contacts and current-state lane-intent warning

**28 October 2026 — A60 offline technical PASS, sporting / physical full-race NO-GO.**

## Goal and scope

A59's all-rider bounded replay rejected **61/67** ten-second synthetic warning-checkpoint scenes, while 6/67 were collision-free. A58's 44/67 selected-rider frozen-obstacle responses do not apply to the physically re-integrated field. A60 changes **only opt-in research code**, not the live race engine, completed classifications, stage schedule, database or payouts.

A60 has three distinct deliverables:

1. Fix the old research observer's *pair-first* collision reporting: first detected swept collision is now selected **chronologically by physical microinterval** across all cyclist pairs, not whichever pair appeared first in the array. This changes contact diagnostics, not accepted physical motion.
2. Audit first contact at the failed substep using the actual source warning checkpoint and previously accepted bounded shadow states: current gap, lane overlap, closing speed, warning-to-contact interval and **optimistic** ordinary rear-braking distance (assuming a fixed-speed leader). The classification is a retrospective diagnosis, not an approved response.
3. Compare one fixed **SINGLE_BRAKE** alert-time option under the existing A59 current-corridor headway rule with the *same fixed option* plus a new current-state lane-intent warning. The warning checks current x/y/speed, this substep's bounded longitudinal and intended lateral commands, and prospective lateral convergence. It may request **at most -0.85 m/s²** ordinary braking from approaching followers. No future accepted path, post-event strategy search or rider ID is used to choose a new warning.

The historical A56 identification of **which initial cyclist to replay** is still retrospective case selection. Thus A60 is **not** a complete nonclairvoyant field controller, nor a race engine for production.

## Source and verification

- [A60 warning and first-contact research](../../scripts/v3/a2FirstContactFeasibilityV3.mjs)
- [A59 opt-in full-field replay with A60 policy](../../scripts/v3/a2MirrorAndFullFieldProbeV3.mjs)
- [A60 standalone reflection, relabel, bounded motion and contact-audit controls](../../scripts/v3/verify-a2-step60-unit-v3.mjs)
- [A59/A60 all-67-case research verifier](../../scripts/v3/verify-a2-step59-symmetry-and-field-v3.mjs)
- [GitHub CI evidence and retained per-case JSON](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40695290147)

The same 67 actual A44 warning checkpoints and 162 synthetic physical runs were replayed. A60 adds fixed-plan comparator replays and separate reflected/renamed A60 shadow checks.

## Exact observed results

| Measure | Original A59 all-field trial | A60 fixed-brake control | A60 current-state lane-intent trial |
|---|---:|---:|---:|
| 10-second collision-free scenarios | **6/67** | **6/67** | **7/67** |
| Collision-blocked scenarios | **61/67** | **61/67** | **60/67** |

- **One genuine 10-second rescue** against the matched fixed-brake control; **zero previously clear scenarios lost**.
- New lane-intent diagnostic recorded **934 current-state warning pair events**, resulting in **736 additional bounded braking decisions** (repeated riders and substeps; not unique cyclists).
- First detected contact for each of the remaining **60** collision-rejected A60 runs was a **same/overlapping corridor** contact at the beginning of a substep. All 60 had **too little longitudinal gap for rear-only ordinary braking at the failing step** under the optimistic fixed-leader reference. This is *not* proof the event could never have been avoided at an **earlier** warning, or with coordinated steering/acceleration.
- On the 67 A60 scenarios: **0 mirror outcome differences**, **0 identity-rename outcome differences**, **0 mirrored or renamed first-pair differences**, **0 JSON replay differences**. Standalone positive and negative warning tests passed.
- All decisions use the same acceleration, lateral-bound, continuously swept pairwise contact, W-prime, fail-closed and original-source-immutability checks inherited from A59. No emergency speed reset or forced teleportation was introduced.

**Important limitation:** an internal *warning request* is not the same as a globally collision-free solution. Even though Step60 is better than Step59, **60/67 still collide** with all riders responsive. This is a research-quality preliminary controller with only **2–32 riders**, source-recorded tick intentions and uncalibrated terrain, drafting and contact physics; it is **not** a realistic 106/168-rider stage.

## Decision and focus for Step 61

**A60 ENGINEERING GATE: PASS. A2 SPORTING GATE: NO-GO.** Do not activate the new rule, change the selected live engine or rerun old results.

**A61:** determine the earliest **available pre-contact lead** in the actual 60 failing histories using only already-observed states and rider intentions. Compare multi-substep, bounded *anticipatory* response (not just braking at the failing substep), including safe lateral egress and coordinated lead/follower reactions. Reject any option that causes another swept collision, illegal speed jump, road departure, energy deficit, mirror/ID inconsistency or worse matched outcomes. Continue toward source-calibrated complete peloton tests before Stage A may be approved.
