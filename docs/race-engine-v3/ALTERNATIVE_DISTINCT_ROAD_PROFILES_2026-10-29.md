# Alternative V3 — separate road-width and second-gate test

2026-10-29. Research-only, not A64 and not production.

## Objective and model limitations

The alternative proof passed 180 simulated seconds for 106/168 riders on nominal staged/double road profiles but initially those profiles were numerically identical. This step introduces an opt-in roadWidthMode=two_distinct_gates keeping the old baseline unchanged.

Under this opt-in simulation, the initial five-wide group must enter a two-lane first bottleneck at x=680 by physically achievable longitudinal movement and scheduled admission. The staged layout expands into up to five **abstract occupancy lanes** from x=1020 up to second gate x=1130 and the entire field must then remap into two reserved longitudinal queues. The double layout stays at two lanes throughout both constrictions, but its second gate admission is tracked independently. Both require all riders past first x1020, second x1470, 180 seconds, preserved 6.5m/s floor, no occupancy overlaps, cross-channel order inversions, deterministic replay, and 90+90 checkpoint parity.

A lane change here remains **an instantaneous logical traffic-lane handoff**, never a continuous swept bicycle lateral path, and a passing test does NOT establish geometric realism. There is no official race data read or mutation, no game UI and no production activation. The game's exact consecutive gap <=8s group semantics remain unchanged. This is an intermediate game abstraction for evaluation only.

## Verified results

GitHub Actions run [40956833406](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40956833406) measured **four full 180.0-second** field scenarios. Each passed deterministic fresh replay and the preserved 90+90-second serialized 32-rider checkpoint test. The previous alternative 106/168-rider baseline and 24-rider breakaway split/rejoin regression also passed separately, and React build passed. The protected original A64 Step86 benchmark was running at the first review of this result.

| Riders | Layout | Original 10Hz accepted racing seconds | First and second gates | Staged middle-lane riders / maximum simultaneously active lanes | Second-gate remaps | Minimum same-lane spacing | Minimum achieved speed |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: |
| 106 | staged | 180.0 | both yes | 106 riders / 5 lanes | 106 | 2.214548 m | 7.4234 m/s |
| 106 | double | 180.0 | both yes | 0 riders / 0 middle lanes | 106 | 2.149396 m | 7.4234 m/s |
| 168 | staged | 180.0 | both yes | 168 riders / 5 lanes | 168 | 2.207684 m | 7.284336 m/s |
| 168 | double | 180.0 | both yes | 0 riders / 0 middle lanes | 168 | 2.149180 m | 7.284336 m/s |

All four original 10Hz simulation runs were **without rejected occupancy, speed-floor, early-entry or gate admission events**. The staged and double road layouts yielded **different full-trajectory SHA-256s** as required; there is now actual middle-width occupancy diversity rather than merely relabeled identical test cases.

### Critical negative test and corrective safety allocation

The initial staggered middle-wide to second two-lane merge test rejected a true same-channel occupancy conflict: r000 and r006 would have entered the second receiving lane only **0.548007m** apart at 53.8 simulated seconds. This was correctly a test **FAIL**, not an accepted collision. The fix was to preserve a **continuous future receiving-channel signed-headway reservation** even while riders occupy distinct lanes in the wider middle section. The extra constraint uses actual physical x/v and bounded independent deceleration, maintaining the no-stop floor; it does not repair x positions or relax the 1.85m occupancy rule. The corrected full 106/168 matrix passed with minimum observed margins stated above.

### Deliberate modeling boundaries

- Transitions to five-wide from two-wide and back are **atomic discrete-lane occupancy handoffs** at x1020 and x1130. No lateral swept movement or real bicycle-body collision proof exists for these transitions. The research result is for a game management abstraction only.
- The staged road uses five middle lanes from x1020–1130 and then remerges to two. The double road stays two lanes and tracks the second gate crossing. This validates distinct *logical width capacity*, not measured map geometry or source-profile fidelity.
- Middle-wide lanes preserve receiving-channel provisional gap reservations, so having five available lanes does not yet imply optimally modeled real-world overtaking opportunities or capacity throughput.
- No gradients, wind, drafting, racing tactics, climber/sprinter attributes, crash risk, season outcomes, race-result publishing, UI or multiplayer service integration are included. Rider W-prime here remains a simplified energy counter, not physically calibrated racing power.
- Production A64 and live race engine, official results, Supabase race records and payouts remain unchanged.

**Decision:** 180-second distinct-road discrete-manager proof is PASSED. Playable or production-ready V3 is **NOT** proven. The next independent milestone is scenario-varying athlete-specific energy, gradient/drafting and attacks, with validated overtaking/group outcomes and full 180-second safe continuous runs, before game integration.
