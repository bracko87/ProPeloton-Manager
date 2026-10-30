# Race Engine V4 — isolated replay bridge handoff correction

Date: October 30, 2026. **V2 production source and database remain unchanged.**

## Root cause

Five of the 36 synthetic V4 AI-planned races failed their original strict replay synchronization check. All five involved rider-012, displayed in F2 and then suddenly in the peloton P, without an intervening catch/incident. Forensic replay inspection confirmed:

- The bridge actually reached the road leader: physically merged at 110.90–119.27 km of a 120 km synthetic stage, ending with exactly zero gap to the leader.
- The bridge remained 277–330 seconds ahead of the peloton at its actual merge.
- The rider retained 59–62% energy; the error was not caused by low reserve.
- The bridge still referenced a stale historical B1 leader display code while the actual leading group had become F1.
- The preserved replay builder only assigned merged bridge riders to the lead group if the target display code matched the *current* leading code. This comparison failed, and the replay incorrectly put the rider into P.

This is a replay group-identity handoff error, not a physical peloton catch.

## V4-only research change

The new pure helper at src/race-engine-v4/bridgeHandoffV4.ts normalizes stale B1 replay targets to the active leading F1/F2 group ONLY when:

1. The original B1 no longer carries into phase 4.
2. The bridge records an actual completed merge at finite distance, targeting B1.
3. The final bridge gap to leader is zero within numerical tolerance.
4. The bridge is physically more than the merge tolerance ahead of the peloton.

It leaves all physical gap samples, rider identities, merging distances, energies and times unchanged. Incorrect or uncertain cases retain the original group identity. Negative tests cover no merge, active B1, no samples, low peloton separation, wrong target and idempotence.

The helper is currently exercised via scripts/v4/probeBridgeAliasV4.mjs, which compiles a V4-ONLY temporary research solver bundle using the preserved V2 source plus an in-memory replay target mapping. The original V2 file is NEVER edited. The original strict replay validator still runs, and each simulation can fail. This research build does not publish or write results.

**Not yet integrated** into the ordinary V4 physicalResearchProbeV4.ts or live engine; that code continues to use the unchanged baseline solver. It is a tested candidate for V4's eventual isolated executable.

## Verified strict results

Research CI:
- https://github.com/bracko87/ProPeloton-Manager/actions/runs/41034924592
- https://github.com/bracko87/ProPeloton-Manager/actions/runs/41035287309

| Metric | Unmodified solver + V4 tactics | Isolated V4 replay handoff |
| --- | ---: | ---: |
| Synthetic test seeds | 36 | 36 |
| Completed races with strict replay validation | 31 | 36 |
| Group-transition validation failures | 5 | 0 |
| Cases with successful breakaway | 18 | 18 |
| Median max gap among successful breakaways | 715.559713 sec | 715.559713 sec |

The V4 helper's eight negative unit cases, original physical smoke tests and unchanged production React build all passed.

## Safety and next checks

This resolves **a specific five-seed replay defect** in the isolated research bundle only. It does not solve the 7-second artifact on 199 historical races and does not make the approximately 12-minute synthetic breakaway gaps realistic. It is not production enabled and does not rerun real historical races. Prior to allowing any V4 production shadow mode, test larger fields, other terrains, long breakaway evolution and catches, real private completed-race snapshots, exact official classification parity where applicable, and multi-day fatigue. Never weaken the strict replay validator or change the preserved production V2 source as part of this experiment.
