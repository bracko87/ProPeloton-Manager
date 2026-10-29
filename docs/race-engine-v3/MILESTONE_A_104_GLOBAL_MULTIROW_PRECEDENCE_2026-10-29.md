# Race Engine V3 — Step104, global multi-row physical precedence

**2026-10-29 — strictly isolated research. No live-race engine change, production Supabase write, game-clock manipulation, past classification modification or payouts.**

## Purpose

Step103 measured 20 genuine A64-swept attempts (106/168 riders on staged and double pinch), all ending before the first narrowing. Best 11s. Detailed rejection recorded leading OUTER rider r000 contacting INNER riders from rows 4–8 behind as inner speed was increased without protecting global ordering. Just improving same-starting-row zipper speed is not sufficient.

Step104 tests five read-only, identity-neutral global-precedence controllers that calculate **simultaneous requested speed and steering**, not accepted x/y/v. Each controller constrains *rear riders sharing the future narrowed corridor* against an actual leading rider's attained speed, existing longitudinal distance, and a safety margin with multiple-second closing horizon. Same-row INNER riders retain permission to open a longitudinal gap relative to their own OUTER rider; the rear row's INNER rider may not use that permission to catch an OUTER in an earlier row. This is an initial physically constrained planner, not an optimization proof. The modes are chain_soft, chain_strict, global_reserve, stepped_release and early_ordered_merge. All relative precedence and roles derive from physical row coordinates, never rider ID or left/right identity.

Step104 still lets original A64 mandate early lateral steering from physical road width lookahead. Only an unchanged A64 0.5s sixteen-substep full-peloton swept check may accept motion, and Step95's minimum moving-speed screen must also pass before committing a physical tick. No road widening, staged-position edit, teleportation, collisions, W-prime tampering or synthetic future lanes. The Step101 **consecutive <=8-second** peloton/breakaway/rejoin rule is applied to actually accepted trajectories, never to override individual rider motion, speed or power. A catch that reduces the gap to eight seconds joins the same group without turning riders into a single physical body.

## Experiment and acceptance criteria

- 106/168 riders × staged/double narrowing × five global policies = **20 real original A64 physical attempts**, 30-second requested horizon each, report accepted time, first collision pair's original rows and lateral/longitudinal offset, enforced road-forecast rider ticks and cross-row physical constraints.
- Separate original A64 8/32-rider tests, mirrored and identity-renamed request parity, exact checkpoint resume, eight-second groups, immutable inputs, 32-rider Step86 original 180s controlled pass and production React build.
- Strict fail-closed: an optimistic global plan does not prove an achievable lane transition; failed physical previews produce a truthful sporting NO-GO, not a successful race. First gate requires **all rider bodies to pass x=1020m**, second gate all x=1470m. Full sporting GO needs 106 and 168 riders through both narrowings with **180s physically accepted, meaningful >3s overtakes, valid W-prime and deterministic 90+90 checkpoint/replay**, as before.

## Actual Step104 measurement and verification — 29 October 2026

Research was expanded in three controlled versions. The [first Step104 workflow](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40943152408) passed 4/4 tests including the protected original 32-rider Step86 physical baseline. The second run added physically level-speed **zipper ordering**, where inner(row k) must precede outer(row k), and outer(row k) precede inner(row k+1). The [latest Step104 run 40943694064](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40943694064) added a forward closing-speed/braking-distance-aware forecast based on **the original A64 .85m/s² bounded braking**, without editing A64. Its micro original A64 exact 1+1 checkpoint, 56 physical large-field diagnostics, and production React build were PASS; its separate protected Step86 + Step101 CI job was still running when these results were first recorded.

### Physically accepted A64 moving seconds (up to 30s requested per attempt)

| Progressive physical experiment | 106 riders, staged | 106 riders, double | 168 riders, staged | 168 riders, double |
| --- | ---: | ---: | ---: | ---: |
| Prior Step103 best | 11.0 | 9.0 | 11.0 | 9.0 |
| Step104: five cross-row precedence modes | **11.5** | 9.0 | **11.5** | 9.0 |
| Step104: five uniform zipper variants | **12.5** | 9.0 | **12.5** | 9.0 |
| Step104: four brake-aware global zipper variants | **14.0** | 9.0 | **14.0** | 9.0 |

**56/56 research attempts were genuinely original-A64 swept-body collision rejections before the first gate. 0/56 physically complete 30 seconds; 0/56 have all riders past gate 1, 0/56 sporting GO.** Exact physical 0.5s synchronized motion alone is counted. These results are **not** 180s completions and the +3.0s best accepted early prefix must not be mistaken for production viability.

### Important structural diagnosis

- Original Step103 first collided leading r000 OUTER with an INNER from starting row 4–8. Initial Step104 cross-row caps eliminated that pair as the *first* rejected collision; they pushed the frontier to **r010 OUTER vs r011 INNER within row 2** (staged, 11.5s), demonstrating insufficient same-row longitudinal clearance.
- The level-speed zipper modes kept that pair clear longer, but failed next on **r011 INNER (row 2) vs r015 OUTER (row 3)**, because enforcing only one pair's clearance can endanger the neighboring row.
- A braking-distance-aware demand constraint shifted the staged first rejected pair further down the line to **r016 INNER (row 3) vs r020 OUTER (row 4)** at **14s**, with r020's lane forced inward by the original A64 road lookahead. In the harsher double pinch, the first rejected pair remains **r005 OUTER vs r006 INNER (row 1)** around 9s.
- This progression validates a *real multi-row interaction problem*, not a need for arbitrary rider-group splitting. All 106/168 cyclists remained assigned to ONE peloton under the owner-approved **consecutive <=8s** group rule during all accepted prefixes. Rider speeds remain independent; no group-speed lock or free group draft.
- Repeated adjustments to desired rider speed are inadequate for guaranteed traversal. A full solution must simultaneously construct **feasible, causally ordered, continuous multi-row longitudinal and lateral zipper occupancy**, including each road-forced steering command, with an explicit collision-free physical witness for the complete field through both gates.

No accepted physical state violated the original A64 body or road checks. All failed future proposals were discarded. No W-prime ledger changes outside original A64, no historical result edits, no Supabase writes, no live engine deployment. **Milestone A remains sporting NO-GO**; Phase B/C not ready, overall estimated readiness ~35%.
