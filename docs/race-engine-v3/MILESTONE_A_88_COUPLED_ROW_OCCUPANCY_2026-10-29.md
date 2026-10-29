# Race Engine V3 — Step 88: coupled whole-row narrow-corridor occupancy and velocity

**Research date:** 29 October 2026. **Research-only opt-in.** No active race engine, stage records, GC, game clock, prizes, rider profiles, Supabase data or player operations changed. **Milestone A 106/168 five-wide sporting NO-GO** unless eight original A64 180-second five-wide cases actually pass after independent overtaking/replay validation.

## Why a new coupled solver is needed

Step87 proved a mirror/ID-neutral first+second-gate necessary arrival order. It did not coordinate **actual immediate whole-row occupied space and speed**: 106/168-rider five-abreast starts continued to reject A64 full-body swept contacts by 10–15.5s. Step87 32r double did complete 180s but had 1,212 physical lane changes and only 50 independent sustained ≥3s passes. Historical protected baselines remain **Step78 32r staged 180s / 87 real sustained passes / 356 lane changes / 0 near-stops** and **Step86 32r double 180s / 70 passes / 678 lanes / 0 near-stops**.

## New code

[Research-only Step88 coupled row-flow module](../../scripts/v3/a2Step88CoupledRowFlowV3.mjs) works exclusively from each rider's **currently physically accepted** x/y/v/startX, its unmodified per-rider first/second gate booking and its current requested speed/targetY. It:

- Groups actual 5-wide starting rows without ID-based or geographic left/right right of way, and forms an attainable provisional two-sided passage/occupancy ledger. Center positions remain their immutable booked slots, not an invented favored side.
- Builds a directed **preceding-row occupancy graph** for the same real next gate. A group conflict asks the threatened narrow-side cohort for **one** bounded request speed rather than repeatedly braking each rider independently. It rechecks current occupied 2D movement envelopes, and blocks only actually conflicting lateral merges; genuine equal-x ties are not broken using rider names, array order or fixed side preference.
- The first version was overrestrictive: all five riders in a row could receive an unconditional 10.4m/s pace ceiling, even when no ahead-row corridor was occupied. This was corrected to **apply a cap only when an actual preceding-row closing conflict exists**.
- A subsequent correction separated **LEFT, RIGHT and CENTER** corridor capacity, initially still calculating the threat from the slowest leading and fastest following rider across the *entire* row. The final correction measures *achieved* front/rear x separation and speeds **within the same booked physical side**; a left-side closing group must not penalize riders already safely moving on the right.
- The planner's warnings, necessary arrival windows and row slot sequence do **not certify** collision-free 2D movement. It never inserts predicted x/y/v or energy, rewrites bookings, guarantees a finish, increases A64 acceleration/braking/steering bounds or widens real road geometry.

[Opt-in physical wrapper](../../scripts/v3/a2MultiGatePhysicalCandidateV3.mjs) exposes `whole_row_strict_v1` (hard original-physics no-near-stop first-tick veto) and `whole_row_balanced_v1` (throughput-scored without a hard near-stop guarantee). The later policy now compares up to **eight** actual A64-full-body physically swept whole-field candidate requests: original baseline, Step78 joint, Step86 gap wave, Step87 order hold/pace, Step84 consensus hold and Step88 own actual row hold and side-specific row yield/balanced. Bounded physical receding-horizon future alternatives retain Step87 order hold, Step86 gap wave and new Step88 row hold. Every selected real first half-second is then **independently re-swept on the actual (possibly mirrored) original A64 field**. The temporary preview is discarded and a contact/road/energy rejection is never committed. Step85's previously working default policies and Step78/86/87 behavior were not changed; only the optional Step88 search breadth (maximum eight proposals) was expanded.

## First objectively tested prototype (before side-specific corrections)

The initial [Step88 16-case original-swept CI and protected baseline suite](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40878251992) completed SUCCESS for *technically honest* A64 state, whole-row geometry, mirrored/renamed/array-neutral pure requests and fail-closed rejection. React production build also passed. The initial [full 8/32 physical + independent overtake/replay audit](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40878465722) completed SUCCESS as a technical CI job, but actual sporting quality regressed:

| Five-wide race, initial Step88 | Real accepted seconds | Near-stop ticks | Real lane changes | Independent sustained ≥3s pair passes | Outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| 8r staged strict | 180 | 0 | 132 | 3 | Full physical + exact 90+90 observer/physics replay |
| 8r double strict | 180 | 0 | 220 | 1 | Full physical + exact replay, low passing quality |
| 32r staged strict | **180** | **0** | **756** | **58** | Complete safe physical pilot, sporting regression vs Step78/86 |
| 32r staged balanced | **180** | **0** | **765** | **63** | Complete safe physical pilot, sporting regression vs Step78/86 |
| 32r double strict | 21 | 0 | 41 | 1 before rejection | No nonstopping physically acceptable request; fail-closed |
| 32r double balanced | 7.5 | 0 | 3 | 0 before rejection | Original SWEPT_CONTACT rejected |

Every completed 180s field passed the second gate reopening, actual collision/road/energy/near-stop checks and exact serialized 90+90 physics+independent passing observer equality. A rejected 7.5s/21s configuration did **not** claim replay success.

The first [106/168 × staged/double × strict/balanced full-180 attempts](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40878465722) also completed as technically honest rejection tests, with **zero** eight-case full-180 sporting passes:

| Five-wide layout | Best initial Step88 accepted seconds | First original-physics result | Near-stop ticks before rejection |
| --- | ---: | --- | ---: |
| 106 staged | 9s | SWEPT_CONTACT | 0 |
| 106 double | 10.5s | SWEPT_CONTACT | 0 |
| 168 staged | 9.5s | SWEPT_CONTACT | 0 |
| 168 double | 10.5s | SWEPT_CONTACT | 0 |

A subsequent global-cap correction and provisional speed-side correction still rejected 106/168 staged contacts around **7s**; these revisions are *not* a sporting improvement. A clean zero-near-stop count **before the collision** does not imply that a full peloton can traverse the course without stopping.

## Latest side-specific safety verification (do not infer results prematurely)

The [16 original A64 physical test](../../scripts/v3/verify-a2-step88-coupled-physical-v3.mjs) now hard-asserts **physical left-side closure must not invent right-side braking**, alongside mirror/rename/reversed-array neutrality, equal-x tie handling, proper opposite-side occupancy and physically accepted/rejected full-field integrity. [Step88 original-swept and protected A87/A86/A78/A76 CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40879797760) checks those assertions and React build. The [final Step88 full 8/32 independent overtake/parity/checkpoint and eight 106/168 full 180s original A64 attempts](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40879797812) tests the complete revised controller. **These final-revision workflow outcomes must be read from GitHub's actual completed jobs and log matrices before claiming PASS or an improvement**.

## Step89 necessary engineering target

A bounded three-tick planner that merely compares eight different heuristic request fields may continue to fail five-wide congestion even when physical feasibility exists. The remaining problem needs **pre-merge joint 2D attainable trajectory space/time constraints** that explicitly allocate finite bike-width occupancy, lateral steering time, sustainable speed/W-prime, and whole-row forward gap creation over sufficiently long lookahead, rather than penalizing an entire row or waiting until a collision is imminent. Use the unchanged A64 original full-body swept acceptance for every half-second, prevent artificial 106/168 stopwaves and excessive 32r weaving, preserve ≥3s independent overtaking and strict mirror/name parity, and pass **32/106/168 five-abreast two real route profiles for full 180s, all riders beyond second gate, zero actual contacts/exits/energy/near-stops and exact serialized 90+90 physics+observer checkpoint** before moving beyond Milestone A.

**Milestone A full 106/168 five-wide sporting realism = NO-GO. Milestone B gameplay NOT STARTED. Milestone C live authorization NOT GIVEN.** Repository `main` contains only the opt-in synthetic research implementation and tests, not a live controller replacement. GitHub build passing does not independently verify a live Netlify deployment.
