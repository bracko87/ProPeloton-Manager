# Race Engine V3 — A63: recover the last synthetic field collision with an earlier physical checkpoint

**28 October 2026 — offline 67-case physical micro-field safety gate PASS. Sporting, complete-stage and production gates remain NO-GO.**

## Question investigated

A62's autonomous, 3-second headway forecast and synchronous 0.5s physical integration were clear in **66/67** ten-second replays. The single remaining fail-closed event was **r003/r007** on provisional `compact_4m`, 32 synthetic riders, variant 1, source command frame 2.5s. The A62 physical replay began at **12.5s** and detected the first swept longitudinal contact at **13.59375s**. This happened *before* the earlier A59/A60 retrospective warning at 15–17.5s.

Step 63 tests the hypothesis that the physical controller needs to be active *before* that closing gap becomes unrecoverable. It does **not** modify the collision detection tolerances, stopping capabilities, energy limits, rider intentions, road dimensions or accepted motion after a collision.

## Method — preserve the original evaluation endpoint

Each of the original **67** histories is evaluated twice: the unchanged A62 0.5-second coupled-controller reference, and an A63 initial-state variant using the same bounded controller.

- For the **40** histories already supplied in **0.5s source frames**, the A63 test is the **identical A62 physical replay**. The source start and complete 10-second horizon remain unchanged.
- For the **27** histories supplied in **2.5s source frames**, A63 begins from **one additional actual, earlier source pre-substep state**, **2.5s before** the A62 starting checkpoint; the physical run is extended from 10.0 to **12.5 seconds**, reaching the **same absolute end time** as its A62 comparator. This is a uniform source-quantum rule across the cohort, **not a hard-coded exception for r003 or r007**.
- Existing source tick commands are held until the next actual source tactical frame. All 2–32 riders integrate and recompute current-state headway and intended-lane responses every **0.5 seconds**, bounded to longitudinal acceleration `+0.45/-0.85 m/s²`, lateral motion `<=0.38m/s`, exact all-pair continuous swept collision rejection and research W-prime checks.
- A63 never accepts impossible speed changes, moves a cyclist through a neighbor or resets a collision after its occurrence. The original source A44 histories remain read-only. Mirror/reflection, bijective rider-ID remapping and exact serialized replays are checked on every case.

**Caution:** A63's earlier-start comparison is **not** an identical-start physics-policy comparison. The source checkpoints are legitimately different for the 2.5s cohort, although the endpoint is the same. The case-selection/initialization times originate from retrospective A56/A59 research scenarios; the result **does not validate an autonomous full-race startup procedure**. It shows feasibility under earlier, physically plausible controller activation, not a production policy with advance knowledge of collisions.

## Measured results

| Physical 2–32-rider trial | A62 reference | A63 earlier-activation variant |
|---|---:|---:|
| Complete collision-free physical field through the original endpoint | **66/67** | **67/67** |
| First swept-contact failures | **1** | **0** |
| Source frame 0.5 seconds | 40/40 | **40/40 (identical)** |
| Source frame 2.5 seconds | 26/27 | **27/27** |
| Previously clear cases regressed | — | **0** |
| Mirrored-road outcome differences | — | **0** |
| Rider-ID-renamed outcome differences | — | **0** |
| Mirror/rename first-contact pair differences | — | **0** |
| Exact JSON replay differences | — | **0** |
| Changed original end times | — | **0** |
| Energy invalidations | 0 | **0** |

The **one rescued case** is the previously failed `compact_4m` / 32 / variant 1 / 2.5s source history:

| Field | A62 | A63 |
|---|---|---|
| Physical start | 12.5s | **10.0s** |
| Physical end | 22.5s | **22.5s** |
| First swept contact | r003 / r007 at 13.59375s | **None detected through 22.5s** |
| Collisions accepted, retroactive velocity jumps, database writes | 0 | **0** |

The comparison retains all 66 previously safe cases, and the rescued case is not the result of a rider-ID-specific maneuver or a shortened horizon.

## Technical and sporting acceptance

**A63 bounded synthetic-field engineering gate: PASS**. The latest workflow explicitly asserts **67/67 clear**, zero regressions, zero invalid energy updates, unchanged end times, zero mirror/rename outcome and first-pair mismatches, and exact JSON checkpoint replay.

- [A63 all-case assertion source](../../scripts/v3/verify-a2-step59-symmetry-and-field-v3.mjs)
- [Bounded all-field physical research integrator](../../scripts/v3/a2MirrorAndFullFieldProbeV3.mjs)
- [A63 physical evidence / CI and historical regressions](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-a2-step59-symmetry-and-field.yml)

**A2 full-stage sporting and production approval remain NO-GO.** These were short, synthetic, source-recorded command-field snapshots containing 2–32 riders, not complete sourced stages with 106 and 168 realistic cyclists, team tactics, breakaways and 30s+ time gaps, real width/terrain, regulated power and drafting, classified finish, or stable 5s vs 10s clock behavior. A satisfactory 12.5-second shadow cannot be extrapolated to hours of real road racing.

## Next Milestone A64

Build a **general nonclairvoyant startup/cadence and long-horizon 2D peloton adapter**. Start from normal initial race states rather than retrospective warning checkpoints, use fixed physical steps independent of tactical frame cadence, check different grid orderings and race geometries, and preserve swept and W-prime safety, deterministic recovery, rider-ID parity, reflection and performance. Expand first to sustained 32-rider realistic bunch/escape tests and then complete **106/168-rider** sourced stages, measuring true persistent overtakes, fair ordering, breakaway gaps, drafting, fatigue, power and stage classifications. Do not promote to the official selected race engine until sporting and production milestones are separately accepted.

**Production boundary:** no Supabase changes, official race calculations, payouts, historic results, Netlify racing switch, race clocks or live player data were altered. All changes are isolated offline research in GitHub `main`.
