# Controlled four-worker mountain pilot deployment candidate
All four Supabase workers pin primary source SHA `878aa8ae0db95d97fa5385513d2c1394e3a791a2`, the already tested
isolation implementation merged to main. Emergency sporting fallback sources
remain unchanged.

Only approved stage IDs select the experimental solver: Xingtai Stage 2
(already complete), Poyang Lakes Stage 7 and Valdengo–Oropa. All other
races continue using the baseline engine.

The main runner and pass2 call the explicit engine dispatcher; pass1 creates
the stage-scoped input/scenario. Safe-resume selects the same source for each
deterministic physical phase, replay, and publication, locking lane+commit in
the first checkpoint; pre-release in-flight checkpoints without the lane
marker continue on baseline.

Required before live deployment: all CI gates pass, recheck all four worker
deploy settings and source versions, coordinated four-function deployment,
read-back of deployed code and operational logs. Do not trigger real races,
alter historical results, or edit Supabase SQL for this change.

Baseline input guard: `buildProductionRaceInput.ts` matches the pre-pilot accepted SHA `f520ab08d05dc406918d34295d02ca6ef1f53cb2` byte-for-byte. Old baseline summit settings remain unchanged; the experimental solver is selected by stage ID, not by rewriting input flags for other races.
