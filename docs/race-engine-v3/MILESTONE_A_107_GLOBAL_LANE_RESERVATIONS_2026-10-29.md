# Race Engine V3 — Step 107, joint whole-peloton lane and gap allocation

**2026-10-29. Isolated synthetic research only, never a live race-engine switch.**

## Why it is necessary

Original unchanged A64 106/168 five-wide cyclists still fail before even the first original staged/double road narrowing, despite A64-checked short trajectories, timetable feasibility and 4/6/12-second physically swept previews. The best A64 accepted time is **14 seconds** (Step104 and Step106). Step106 exhausted 16/16 true A64 attempts; longer lookahead did NOT increase successful time or change the first collision. The limiting defect is lack of **simultaneously compatible future lateral lane occupancy and longitudinal headway** for the *whole field*, not missing 8s group classification.

## New Step107 architectural experiment

[Step107 global lane/slot allocations](../../scripts/v3/a2Step107GlobalLaneReservationsV3.mjs) assign every rider in the original accepted five-abreast start to a **provisional two-lane, full-field ordered queue** before any bicycle physically moves:

- Original starting geography, lateral positions, actual starting velocities and row depths determine the two lane assignments and front-to-back rank. For each side, an INNER rider in a starting row is ahead of its OUTER counterpart in the same provisional merging lane. The next row follows both. Center riders are assigned to the less loaded side; ties use the observed geometric speed of the two inner-flank riders, ensuring that a mirrored start mirrors the choice, and exact indistinguishable ties remain explicitly unassigned rather than given ID or geographic priority.
- Six separate **spatial slot width / headway / cruising / early-lateral** strategies evaluate the exact same unchanged original A64 106/168 initial physical geometry. The controller commands all riders jointly based on their global lane position and actual front physical x/v (not just a last predicted collision pair). Ahead and rear constraints are linked through the whole side queue. Signed gap inversions, reachable maxima and shortfalls are independently auditable; the booking is not a claimed physically completed path.
- For early lane changes, the controller requests a booked lateral target **only** when no other accepted bicycle is already in or crossing that prospective local corridor within the physical longitudinal buffer. An A64 road-width lookahead may still require lateral steering; no candidate disables, changes or relaxes that requirement.
- **Original A64 remains authoritative on every accepted 0.5-second state:** actual 16-substep all-pair continuous bike collision, road body envelope and finite W-prime checks, plus the unchanged Step95 achieved-moving-speed veto. Rejected future movement never becomes an accepted race state; no teleportation, no owner data edits, no fake 2-slot combined bicycle and no free group speed bonus.
- The Step101 owner-approved **consecutive gap <=8 seconds** peloton/breakaway/rejoin rule is run on actual accepted rider x/v after each tick. Riders retain individual x/y/v/energy/drafting context while sharing a racing-group label.

### Acceptance, tests and evidence

Dedicated [Step107 GitHub workflow](../../.github/workflows/v3-step107-global-lane-reservations.yml) tests six reservation modes and exact original A64 serialized 1+1 second checkpoint parity, mirror and rename symmetry, initial 32-rider one-peloton semantics, and the complete protected eight-second dynamic grouping and Step86 original-A64 32-rider 180-second benchmark, plus React build.

**24** 106/168 × staged/double × six policies experiments request the full 180s physical movement, stopping at the first original-A64 rejection. For each, report first actual A64 swept collision and physical time; do **not** count mere provisional slot assignment as passing either road gate. True sporting GO still needs the whole original five-wide field to physically travel **180 seconds through both narrowings**, with all bodies safe, no crawl or energy corruption, meaningful sustained overtakes and exact replay. An original-A64 180-second candidate would still need distinct overtaking, mirror/renamed and independent checkpoint sporting audits before GO.

**Measurements:** pending independent GitHub Actions run and logs. Until a fully verified original A64 result exceeds 14s and/or completes gate one, sporting milestone A is **NO-GO**, overall research readiness estimate ~35%, no production engine activation and no Supabase changes.
