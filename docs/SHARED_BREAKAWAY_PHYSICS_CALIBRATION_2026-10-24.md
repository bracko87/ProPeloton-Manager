# Shared road-escape physics recalibration — 2026-10-24

## Production diagnosis (read-only)

Across 204 recent completed road-race calculations (three real days, as assessed on 2026-10-24):

| Engine lane | Completed runs | Maximum recorded gap ≤ 7.1 seconds | >30 seconds | Opening group reaches phase 2 | Original escape survived finish |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline universal | 96 | 65 | 27 | 18 | 0 |
| Experimental Breakaway V1 | 3 | 3 | 0 | 0 | 0 |
| Experimental Mountain V1 | 1 | 0 | 0 | 0 | 0 |
| Legacy/unlabelled (different source versions) | 104 | 64 | 32 | 28 | 0 |

The raw flags measure original opening-escape survival. They do not establish that no rider who attacked ever won. Baseline had 75 races with opening riders; 57 of those groups were physically caught before the first phase ended (mean catch ~km 11.7). Recent Zeeland Breakaway V1 recorded three opening escape riders, an initial 7-second gap and physical catch at km 20.0. Its replay/classification was internally correct.

### Causes in the common road engine

1. **Wrong interpretation of player orders**: Baseline and Mountain phase 1 counted both `chase` and `race_control` (`control_tempo`) as organized pursuit. Phase 2 likewise combined `chasingTeamIds.length + controllingTeamIds.length` when calculating pursuit commitment, and charged controllers as physical chase workers.
2. **Double-counted early escape work cost**: Opening and middle-race escape pace multiplied by the full live cooperation penalty even though available rider energy and effort costs are already included in other factors. The resulting slow escape speeds could be below the peloton's unopposed cruise pace.
3. **No-chase cruising speed**: The baseline/Mountain peloton formerly ran reference pace even when no team had expressly committed to chasing. This could erase a successful attack's seven-second launch almost immediately.

### Code changes integrated into GitHub main

Validated immutable revision: `39f20657dd37c44a6b27fb2e5e96e02eb57ad9a4`.

- `src/universal-race-engine/runRaceEngine.ts`: phase 1 recognizes only explicit chase teams; the physically calculated escape-cooperation speed penalty is attenuated to avoid duplicate fatigue charging; no-chase peloton cruise uses 95.5% of reference pace in opening phase; Phase 2 uses only actual chasers for response-worker commitment and uses 97% unopposed cruise speed.
- `src/universal-race-engine/runMountainExperimentalEngineV1.ts`: applies exactly the same common road corrections while retaining the mountain-specific stage physics.
- `src/universal-race-engine/runBreakawayExperimentalEngineV1.ts`: aligns Phase 2 pursuit classification with explicit chase teams. **The more aggressive specialist opening-pace correction was withdrawn:** it made an existing 96-rider Binche hilly fixture retain a B1 escape but exposed invalid final physical-group transfers and duplicate display codes. Existing proven Breakaway opening dynamics remain unchanged until replay lineage can be repaired and a full end-to-end validation re-passed.
- `src/universal-race-engine/breakawayFullPilotRealRoster.test.ts`: includes the same synthetic 96-rider control-tempo vs explicit chase Phase 1 comparison across all three direct cores, with no writes or game-state mutations.
- `src/universal-race-engine/runRaceEngine.test.ts`: preserves the under-5%-energy physical detachment assertion using a synthetic rider whose lower reserve makes the condition reachable after the recalibration.

## Validation

- GitHub Actions **[run 40111779440](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40111779440)**: every checked job step passed. The separately logged full legacy race-engine suite passed **557/557** tests. The 96-rider full Breakaway Hilly (Binche) acceptance, phase 7/8, replay-group synchronization and sustained-escape/winner fixtures all passed.
- Synthetic same-input opening comparisons (km 0–25% of the road stage):
  - Baseline: unopposed tempo gap **209.856249 seconds**, organized chase gap **79.689682 seconds**.
  - Mountain core on the identical flat-road physical-control fixture: **209.856249 / 79.689682 seconds**.
  - Specialist full experimental core (direct fixture): **510.401047 / 227.406624 seconds**. This is a *fresh synthetic, optimal-cooperation scenario*, not a guarantee of any real-world breakaway outcome. The existing separate 96-rider specialist production-tactic scenario still shows **45.046535 / 7.093516 seconds** with a later catch.
- New isolated `road-physics-calibration-canary` Supabase Edge function v1 imports immutable `39f20657...` and **performs no database reads or writes**. Live read-back for `?stage=baseline`, `?stage=mountain`, and `?stage=zeeland` all reported full finish, synchronized raw replay, phase 7/8 + 9 accepted, no issues and zero persistence, on four-rider synthetic inputs. Synthetic canary inputs are a runtime/import smoke test, not a production realistic-racing outcome guarantee.

## Production release status — NOT YET ACTIVATED

**Production workers remain pinned to their original immutable sources.** The live baseline source is still `878aa8ae0db95d97fa5385513d2c1394e3a791a2`; completed Breakaway pilot stages retain their separately pinned `e00c4e694c0629efa5b06497dd514b505b166934`. These are intentional holdbacks, not permission to rewrite completed results.

During release safety check:
- `World Nations Hilly / Mountain Road Race` had an in-progress production calculation. Replacing modules mid-calculation risks source/physical-state divergence.
- `Trofeo Tessile & Moda - Valdengo-Oropa` (Mountain pilot stage) had seven failed/recovery attempts with Safe Resume replay step 7 CPU exhaustion. Do not conflate this independent production incident with the escape-physics correction or overwrite its checkpoint to force a release.
- Live GitHub worker templates and deployed Supabase workers have different source-pin architectures: the latter retain a baseline pin and a distinct historical Breakaway pin. Deploying the GitHub templates wholesale could change unrelated worker behavior. Reconcile source selection carefully and review a source-specific migration.

**Release checklist once safe to continue:** verify no active race calculation and no unreviewed replay-recovery checkpoint; test new source-pinning with already-stored resume checkpoints and baseline/mountain stage IDs; select validated rollout with zero historical rewrites; verify actual fresh-game-race trajectory, replay and result consistency; address the specialist hilly B1 replay lineage issue before increasing specialist speed again. No forced winners or artificial gap floors.

Historical official classifications, game clock, roster and payouts were not edited in this calibration work.
