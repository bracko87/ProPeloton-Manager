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

**Results / CI**: Pending completion of dedicated physical GitHub workflow. Step103 best 11 seconds, 0/20 30s, 0 first-gate passage. No production activation regardless of preliminary planning success. Overall readiness estimate ~35%, Phase A NO-GO.
