# Race Engine V3 — Step100: time-expanded global occupancy screen

**29 October 2026 — offline research only.** No activation, production race changes, schema migrations, payouts, standings, game clock, historical results or original A64 physics changes.

## Why this step changes the research approach

Step99 did implement persistent pair claims but 106/168 five-abreast fields stopped after 4–4.5 seconds (0/8 full180 sporting). Individual gate bookings and pairwise overlapping claims were demonstrably insufficient; the still-protected Step86 32-rider 180s outcomes must remain intact. Step100 begins the *time-expanded, globally coupled path-feasibility* investigation, not another extension of Step98 beam length.

## Deliverable: necessary discrete whole-field occupancy lattice

The opt-in [Step100 research module](../../scripts/v3/a2Step100TimeExpandedOccupancyV3.mjs) reads immutable **original physical initial x/y/v**, two actual road-gate geometries and prestart bookings. On a 0.05-second horizon up to 180s it constructs, for each cyclist, optimistic one-dimensional **bounded acceleration/braking speed-floor X reachability envelopes** and a time-indexed pair-interaction warning graph for the first eight seconds. These envelopes are **sets of possible positions**, not a picked trajectory, and their intersections are not confirmed collisions.

It then attempts a *single globally disjoint gate-cell allocation* across both narrowings. A cell is (gate, corridor, time tick); it enforces physical-width-safe lateral gate channels, **at least 2.25m / 6.5m/s = 0.346s** of same-lane longitudinal time (seven 0.05s ticks), bounded earliest/latest X arrival, lateral steering time and optimistic intergate travel and lateral-switch lower bounds. Mirror/renaming/array order never serve as right-of-way; geometrically indistinguishable conflicts remain unresolved. Appointments are not applied to A64 or persisted. This is a *diagnostic scheduling relaxation*: no accepted rider x/y/v, energy or payout is modified.

### Proof boundary — critically important

- **A feasible lattice assignment is not a continuous A64 bicycle path.** It does not demonstrate individual acceleration and lateral steering simultaneously, moving floors at every intermediate tick, dynamic road edge safety, swept all-pair body contacts, W-prime feasibility or sustained overtakes.
- An **unresolved discrete greedy allocation does not prove mathematical impossibility**; alternative lane assignments, tick quantization, ordering or global optimizers might succeed.
- A potential overlapping reachable tube is merely a warning: both riders could select nonoverlapping paths from their tubes.
- There is **no new active controller** in Step100, no new original A64 180-second sporting completion, and **no sporting GO**. Step99's 0/8 remains the most recent real large-field evidence.
- The next work must construct **joint continuous x/y/v trajectories through the full time-expanded occupancy graph**, then independently re-sweep every 0.5s tick through original A64 and meet the established 106/168 full180, two gates, no collision/crawl/near-stop, 3s overtakes, parity and exact replay gates.

## Validation

The [Step100 dedicated workflow](../../.github/workflows/v3-step100-time-expanded-occupancy.yml) runs identity/mirror/permutation/immutable-state/unit tests; original A64 initial 106/168 × staged/double **necessary-only** lattice experiments (no fake full-race success); Step99 pure checks; protected Step86 original-A64 physical checks; and the production React build.

Local synthetic precommit evidence: 20 riders, **40/40 two-gate time-cell appointments**, exact 0.05s / 7-tick same-lane separation, mirrored/renamed/permuted scheduling, invalid inputs rejected, 10-second impossible-reach fixture reported only as *discrete scheduling unresolved*, immutable inputs. Separate simplified 106 and 168 five-wide, two-lane fixtures also produced 212/212 and 336/336 **necessary appointments** respectively. These numbers say NOTHING about a complete physical race.

## Verified Step100 initial and final CI results — 29 October 2026

The [first research run 40936654451](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40936654451) completed **3/3 jobs SUCCESS**: 20-rider pure lattice geometry/symmetry checks, actual original A64 initial 106/168 road-start geometry necessary scheduling, Step99 and protected Step86 regression, and production React build.

The initial planner then had a subtle symmetry weakness: a geometrically centered rider with two equally open slots could silently pick the left lane based only on array order. This was corrected by conservatively reserving BOTH possible gate cells without committing a left/right trajectory, preserving the unresolved physical choice and mirror neutrality. The [corrected final workflow 40937107806](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40937107806) also completed **3/3 jobs SUCCESS**. Its logs independently confirm:

| Real original-A64 initial field | Staged / double | Necessary two-gate slot assignments | Mirror-neutral both-lane placeholders | Latest gate 1 / gate 2 booking |
| --- | --- | ---: | ---: | --- |
| 106 riders | staged | 212/212 | 42 | 29.35s / 58.65s |
| 106 riders | double | 212/212 | 42 | 36.70s / 58.65s |
| 168 riders | staged | 336/336 | 68 | 38.10s / 71.95s |
| 168 riders | double | 336/336 | 68 | 50.00s / 71.95s |

The model recorded **19,983 potential paired reachable-tube overlaps** for 106 riders and **33,022** for 168 riders across its first eight seconds, NOT committed A64 bicycle contacts. Successful scheduling is a useful result: under the relaxed time-cell constraints, **pure gate throughput is not an immediately demonstrated mathematical obstruction**. The physical feasibility of every intermediate movement is still unknown.

The full 106/168 A64 sporting acceptance remains **0/8 from Step99**, because Step100 supplies **no continuous trajectory or new 180-second A64 movement controller**. No near-stop, swept-body, signed road-envelope, W-prime, passing or checkpoint success is inferred from these timetable results. The untouched original A64 and Step86 regressions still pass. Milestone A and production activation remain **NO-GO**; project readiness estimate remains about 35%.

Next research task: from the bounded time-expanded tubes and symmetric gate constraints, construct a *joint continuous physically achievable x/y/v trajectory* over multiple rider rows, not just a cell reservation, and independently verify it in original A64, including the initial first-eight-second conflict network, before attempting 180s sporting proof.
