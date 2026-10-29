# Alternative V3 — separate road-width and second-gate test

2026-10-29. Research-only, not A64 and not production.

## Objective and model limitations

The alternative proof passed 180 simulated seconds for 106/168 riders on nominal staged/double road profiles but initially those profiles were numerically identical. This step introduces an opt-in roadWidthMode=two_distinct_gates keeping the old baseline unchanged.

Under this opt-in simulation, the initial five-wide group must enter a two-lane first bottleneck at x=680 by physically achievable longitudinal movement and scheduled admission. The staged layout expands into up to five **abstract occupancy lanes** from x=1020 up to second gate x=1130 and the entire field must then remap into two reserved longitudinal queues. The double layout stays at two lanes throughout both constrictions, but its second gate admission is tracked independently. Both require all riders past first x1020, second x1470, 180 seconds, preserved 6.5m/s floor, no occupancy overlaps, cross-channel order inversions, deterministic replay, and 90+90 checkpoint parity.

A lane change here remains **an instantaneous logical traffic-lane handoff**, never a continuous swept bicycle lateral path, and a passing test does NOT establish geometric realism. There is no official race data read or mutation, no game UI and no production activation. The game's exact consecutive gap <=8s group semantics remain unchanged. This is an intermediate game abstraction for evaluation only.

**Results:** not measured yet. New test must show distinct SHA-256 traces and at least three actively occupied middle-wide lanes for staged, with no middle-wide expansion on double. Baseline A64 and the old alternate prototype are protected separately.
