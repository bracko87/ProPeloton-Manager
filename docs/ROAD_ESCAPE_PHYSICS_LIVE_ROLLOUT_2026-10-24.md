# Road-escape physics — live source-pin rollout (2026-10-24)

## Scope and status
Production deployment performed on 2026-10-24, AFTER the 557/557 legacy suite pass on immutable physics revision `39f20657dd37c44a6b27fb2e5e96e02eb57ad9a4`. The subsequent main revision `726682eaf58385c4d60a9b664d2b9696b8cfc1a0` retains that physics and caches shared physical-group probes in the Mountain replay path; its GitHub Actions race-engine validation workflow succeeded (run 40113235188).

### Active Supabase Edge workers, project `okuravitxocyevkexfgi`
| Worker | Active version | New calculations | Existing or legacy checkpoints |
| --- | ---: | --- | --- |
| `universal-race-stage-safe-resume` | 71 | Baseline `726682ea`, Mountain `726682ea`, Breakaway pilot `726682ea` | Restore the recorded source/engine lane; retain original baseline `878aa8ae`, historical Breakaway `e00c4e69`, and older Mountain when checkpoint requires them |
| `universal-race-stage-runner` | 47 | `726682ea` selector and stage-scoped specialist | Existing fallback `90fc6ce0` remains unchanged |
| `universal-race-stage-pass2-resume` | 65 | `726682ea` selector and stage-scoped specialist | Existing emergency fallback remains unchanged |
| `universal-race-stage-pass1-resume` | 43 (unchanged) | Input/scenario construction only; existing `878aa8ae` adapter | No physics calculation in this worker |

The three changed functions were deployed with Supabase Edge deployments and read back as **ACTIVE**. The runner's GET `?action=health` returned `status: ok` and `source_commit: 726682eaf58385c4d60a9b664d2b9696b8cfc1a0`. Do not confuse successful deployment/import checks with verified real-race results.

### Tests
- Physics main revision `39f20657...`: GitHub Actions run [40111779440](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40111779440), 557/557 legacy tests and additional acceptance fixtures passed.
- Optimized Mountain commit `726682ea...`: GitHub Actions run [40113235188](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40113235188), overall success including replay regression gate and three-lane relevant compilation/checks. The optional full legacy-suite step was not run on this particular commit; do not imply it was.
- Isolated, no-database-write 96-rider Binche-style full replay canary using the `39f20657...` specialist physics: 96/96 finish classification, opening escape 3 riders, opening-phase gap 86.858818 sec, gap at halfway 0 sec, replay synchronized, no issues, phases 7/8 and 9 accepted. The canary's temporary 96-rider variant was then restored to its original read-only four-rider version, which passed post-restore health. Since `726682ea...` only changes Mountain replay caching, this specialist executable source is unchanged between the two revisions. **A no-chase Binche escape being caught before halfway remains a sporting-calibration concern.**
- The read-only baseline canary passed after restoration with synchronized replay, empty issues and no persistence.

### Preserved production data and recovery
- `World Nations Hilly / Mountain Road Race` run `443093df-f1a3-4b8c-882a-ca4e4f2b186d` completed at 2026-10-24 16:50:13 UTC, before this rollout.
- `Trofeo Tessile & Moda - Valdengo-Oropa`, stage `0885f370-5082-4bbe-994f-3938f00b7b11`, remains quarantined on historical safe replay step 7 after CPU exhaustion. Never reset it or silently overwrite its physical checkpoint.
- Four other older pending safe-calculation checkpoints and two failed states remain separate operational work; do not force-resume them as part of physics deployment.
- No official classifications, replay, payments, rider rosters or game-clock records were altered by these read-only audits and Edge deployments.

### Outstanding acceptance and maintenance
1. Verify the first newly **completed** baseline, Mountain and specialist production race that actually recorded source `726682ea...`: opening gap trajectory, tactics, replay/physical groups, classification, source stamp and all phase-acceptance gates. Do not claim full real-world rollout acceptance until observed.
2. The specialist's more aggressive opening-pace adjustment is not part of this deployment. The prior candidate caused B1 lineage/replay group-transfer failures on a 96-rider hilly race. Correct physical transitions and re-pass full replay acceptance before tuning further.
3. The running Supabase function sources have historically diverged from the tracked `supabase/functions/...` templates on GitHub. **Do not redeploy those templates wholesale** without reconciling them against versions 71/47/65/43: doing so can remove independent safe-resume, stage-specific and source-pin features.
4. If real races reveal new issues, roll back **new starts only**, preserve existing source-pinned checkpoints, and inspect stage-by-stage results. The old immutable pinned sources and safety fallbacks remain available.
