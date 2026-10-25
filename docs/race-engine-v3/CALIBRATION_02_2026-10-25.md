# V3 Calibration 02 — independent research (25 October 2026)

**Status: NOT sporting-ready; no production execution or publication.**

## Preserved and isolated
- Legacy Baseline, Mountain V2, Breakaway V1, the four production calculation workers, and all historical results are unmodified by this V3 work.
- The V3 legacy-import guard and its GitHub Actions workflow are in `main`.
- De-identified, frozen real rosters are available under `scripts/v3/fixtures/`: Dordrecht (106 riders, 18 teams) and Tour of Guangxi Yizhou–Nongla (168 riders, 22 teams).
- Source prototype and test runner for this calibration are packaged separately for offline execution. **The recalibrated V3 physics is not yet present in GitHub `main` or deployed.**

## Local simulation progress
- 12 synthetic V3 tests passed with Node 22 and TypeScript strict compilation.
- Added cumulative energy costs for repeated attack orders; energy never resets between phases.
- Reworked the chase rule: ordinary chase orders only increase effort when an actual front group is at least 120 metres ahead, preventing phantom chase attacks.
- Drafting/pack-following and energy-dependent attacks now share rider movement state.
- Headwind, provisional crosswind and wetness modify speeds/drafting; weather calibration is incomplete.

## Real-input Dordrecht acceptance
- Source run: `635ca0b9-7478-4fff-9599-a562060f4ef9`; source input MD5 `504424f871e94654079f4e54ba2e5235`.
- 106 riders, 18 teams, 39 non-default pre-race commands; 118.5 km, flat; test uses a 22 km/h effective crosswind proxy.
- Most recent local experiment: **99/106 riders recorded the same official time**, while the tail was approximately **34.3 minutes** behind.
- Checkpoint-resume determinism and rider integrity pass, but **the sporting-quality test FAILS**: simulated pack concentration and excessive tail separation both remain unacceptable.
- This is NOT an official race result and does not alter historical results.

## Unresolved requirements
1. Correct physically grounded pack cohesion and finish-line timing; do not flatten unrealistic differences with artificial regrouping.
2. Model wind relative to route direction and peloton shelter rather than assume all weather wind is crosswind.
3. Run the frozen **168-rider Tour of Guangxi** mountain fixture end to end, plus hilly/cobbled variants.
4. Only after simulation acceptance: 12 live Tactical Sectors, server-controlled live commands, live-to-replay continuity, race publication idempotency and Game Control Center monitoring.
5. Required before any official pilot: main-branch build/CI verification, approved engine provenance, worker read-back, and explicit user approval.

The game clock must remain paused. The database still stores 12x and needs an approved 2x reconfiguration before any restart. No automatic V3 routing is authorized.
