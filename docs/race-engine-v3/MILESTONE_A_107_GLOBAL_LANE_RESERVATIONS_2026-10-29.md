# Race Engine V3 — Step 107, joint whole-peloton lane and gap allocation

**2026-10-29. Isolated synthetic research only, never a live race-engine switch.**

## Why it is necessary

Original unchanged A64 106/168 five-wide cyclists still fail before even the first original staged/double road narrowing, despite A64-checked short trajectories, timetable feasibility and 4/6/12-second physically swept previews. The best A64 accepted time is **14 seconds** (Step104 and Step106). Step106 exhausted 16/16 true A64 attempts; longer lookahead did NOT increase successful time or change the first collision. The limiting defect is lack of **simultaneously compatible future lateral lane occupancy and longitudinal headway** for the *whole field*, not missing 8s group classification.

## New Step107 architectural experiment

[Step107 global lane/slot allocations](../../scripts/v3/a2Step107GlobalLaneReservationsV3.mjs) assign every rider in the original accepted five-abreast start to a **provisional two-lane, full-field ordered queue** before any bicycle physically moves:

- Original starting geography, lateral positions, actual starting velocities and row depths determine the two lane assignments and front-to-back rank. For each side, an INNER rider in a starting row is ahead of its OUTER counterpart in the same provisional merging lane. The next row follows both. Center riders are assigned to the less loaded side. Ties use the observed geometric speed of the two inner-flank riders when unequal. Crucially, all equal-speed/symmetric ties are handled by two explicit *mirror-image alternative allocations* (left-first and right-first). Both are tested, preserving parity of the candidate set rather than silently making a one-sided assignment. Every rider is allocated in each branch; neither ID nor alphabetical lane order breaks a geometric tie.
- Six separate **spatial slot width / headway / cruising / early-lateral** strategies evaluate the exact same unchanged original A64 106/168 initial physical geometry. The controller commands all riders jointly based on their global lane position and actual front physical x/v (not just a last predicted collision pair). Ahead and rear constraints are linked through the whole side queue. Signed gap inversions, reachable maxima and shortfalls are independently auditable; the booking is not a claimed physically completed path.
- For early lane changes, the controller requests a booked lateral target **only** when no other accepted bicycle is already in or crossing that prospective local corridor within the physical longitudinal buffer. An A64 road-width lookahead may still require lateral steering; no candidate disables, changes or relaxes that requirement.
- **Original A64 remains authoritative on every accepted 0.5-second state:** actual 16-substep all-pair continuous bike collision, road body envelope and finite W-prime checks, plus the unchanged Step95 achieved-moving-speed veto. Rejected future movement never becomes an accepted race state; no teleportation, no owner data edits, no fake 2-slot combined bicycle and no free group speed bonus.
- The Step101 owner-approved **consecutive gap <=8 seconds** peloton/breakaway/rejoin rule is run on actual accepted rider x/v after each tick. Riders retain individual x/y/v/energy/drafting context while sharing a racing-group label.

### Acceptance, tests and evidence

Dedicated [Step107 GitHub workflow](../../.github/workflows/v3-step107-global-lane-reservations.yml) tests six reservation modes and exact original A64 serialized 1+1 second checkpoint parity, mirror and rename symmetry, initial 32-rider one-peloton semantics, and the complete protected eight-second dynamic grouping and Step86 original-A64 32-rider 180-second benchmark, plus React build.

**48** 106/168 × staged/double × six policies × both mirrored center allocation alternatives request the full 180s physical movement, stopping at the first original-A64 rejection. For each, report first actual A64 swept collision and physical time; do **not** count mere provisional slot assignment as passing either road gate. True sporting GO still needs the whole original five-wide field to physically travel **180 seconds through both narrowings**, with all bodies safe, no crawl or energy corruption, meaningful sustained overtakes and exact replay. An original-A64 180-second candidate would still need distinct overtaking, mirror/renamed and independent checkpoint sporting audits before GO.

## Verified original-A64 outcomes — corrected full-roster allocation (29 October 2026)

**Measurement correction:** the first pre-fix [Step107 run 40949831412](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40949831412) recorded a 19.5-second A64-accepted prefix **but did not assign any center riders to the two provisional lane reservations** (21 in 106-rider fields, 33 in 168-rider fields). Thus **19.5s is not a verified result for a complete all-rider reservation controller** and must not be presented as such.

The corrected [Step107 CI run 40950164370](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40950164370) tests **six global spatial reservation strategies × both mirror-image center tie branches × 106/168 riders × staged/double narrowing = 48 original-A64 physical attempts**. Every rider, **including all starting-center riders**, now has an explicit provisional lane/rank assignment under each branch; the branch pair is left/right mirror symmetric, and no starting rider ID decides right of way. The exact 1+1 accepted A64 state replay, mirror/rename reservation parity, all 6 research-policy microtests and 32-rider one-peloton check passed. The large-field fail-closed physical research job and React production build passed; the protected original Step86 32-rider 180-second CI test was running at the initial evidence review.

### Achieved continuous A64 physical durations (180 seconds requested per attempt)

| Field | Road | Best corrected full-roster result | Research strategy | First rejected next move |
| --- | --- | ---: | --- | --- |
| 106 riders | Staged pinch | **17.0 seconds** | slots_balanced (both mirror branches) | SWEPT_CONTACT; r040/r041 or mirrored r043/r044 |
| 168 riders | Staged pinch | **17.0 seconds** | slots_balanced (both mirror branches) | SWEPT_CONTACT; same physical leading/middle-row conflict |
| 106 riders | Double pinch | **13.0 seconds** | slots_compact (both mirror branches) | Achieved-moving-speed gate veto, NOT a collision |
| 168 riders | Double pinch | **13.0 seconds** | slots_compact (both mirror branches) | Achieved-moving-speed gate veto, NOT a collision |

**0/48 reached 180 seconds; 0/48 had every rider past the first x=1020m road narrowing; 0/48 passed both original narrowings.** In 24 staged-layout runs the first rejected original-A64 movement was a true SWEPT_CONTACT. In 24 double-layout runs the original A64 sweep accepted a candidate bicycle state but Step95 correctly rejected its insufficient *achieved moving speed*. No such speed-vetoed candidate was committed. All accepted rider trajectories stayed in **one physical racing peloton under the exact consecutive <=8-second group rule**, with independent x/y/v and W-prime. No virtual group-speed boost, forced position or changed bike body/road width was introduced.

### Engineering conclusion

The full-field *global slot ordering* improves the best completely allocated physical prefix from Step104/Step106's **14.0s to 17.0s**, a genuine **+3.0 seconds** but nowhere near full sporting viability. Assigning a collision-compatible nominal sequence is not itself a continuously achievable swept path. The staged blocker has advanced to an outer/inner collision around starting row 8; the more restrictive double-pinch controller triggers the upstream moving-floor protection before a full merge. **The next work must couple speed-floor viability, actual continuous A64 lateral steering and longitudinal gap reservations**, not merely expand the simulation horizon or declare an assigned timetable a solved race.

The 180-second milestone, real sustained overtaking, two full narrowing passages, finite energy, identity parity and full replay remain **NO-GO / incomplete**. Overall V3 readiness is still a rough **35% estimate**, not a derived project KPI. All work is confined to opt-in research source, CI, and documentation in GitHub; **no production race-engine activation or Supabase modifications** occurred.
