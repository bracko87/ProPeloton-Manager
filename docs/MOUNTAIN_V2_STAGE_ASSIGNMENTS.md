# Mountain V2 — stage assignments and rollout contract

Updated: 2026-10-23. This list is the **single code-level source of truth** for experimental Mountain V2 evaluation. The canonical data are in `src/universal-race-engine/mountainV2StageRegistry.ts`; this page is explanatory.

## Selection rules

1. Mountain V2 is never selected by terrain, race name, category, country, game date, difficulty or a global configuration flag alone.
2. The stage must be a `road_race` with `terrainType: 'mountain'`, and its **exact stage UUID** must appear in the registry. Other stages, even stages of the same tour, stay with their current official engine.
3. The registry is separate from the pre-existing Mountain V1 pilot stage list. Adding a V2 stage does not enable V1, and an earlier V1 pilot is not automatically promoted to V2.
4. Until the sporting/physical replay, penalties, classification, GC, points, money and stage-worker contracts are integrated and passed, V2 is `sandbox_shadow_only`. `canMountainV2WriteOfficialResults` intentionally returns `false` for **every** stage.
5. `evaluateSelectedMountainV2Stage(input)` is the isolated test entrypoint: for unlisted stages it returns `preview:null` without running Mountain V2 physics; for selected stages it returns read-only diagnostics. It does not trigger live simulation, change a race clock or write Supabase data.
6. Promote each stage to official V2 **only** through a separately reviewed release with explicit approval and validation of four source-pinned worker execution paths and safe resume/fallback. Never change completed race results.

## Current explicit candidate list

| Stage ID | Stage | In-game date | Stage V2 mode |
| --- | --- | --- | --- |
| `be7ce2aa-ec52-4b6b-a6c6-48bfab89ab9b` | Montenegro Tour — Stage 3: Durmitor Finale | 2000-10-03 | Sandbox/shadow only |
| `1c4b77a8-5102-40c9-bf0d-8695b0deb877` | GP Urubici Ciclismo | 2000-10-04 | Sandbox/shadow only |
| `0885f370-5082-4bbe-994f-3938f00b7b11` | Trofeo Tessile & Moda — Valdengo–Oropa | 2000-10-12 | Sandbox/shadow only |

The stage list does **not** include Tour of Poyang Lakes Stage 7 because its sampled route captures insufficient climbing. The previously completed Poyang stages remain immutable.

## Performance principle

The best *combined* climber/all-rounder should be favored on demanding mountain terrain, not guaranteed first by an arbitrary coefficient or fixed finish ranking. V2 must still let tactics, cumulative efforts, team support, descent, fatigue, incidents and physically possible bridging change outcomes. There are no hard-coded finishing-order or number-of-groups quotas.

The 2026-10-23 Durmitor sandbox used 96 registered riders' anonymized attributes and actual route points. Rider R022 (climbing 87, endurance 94) won the steady scenario; R021 (climbing 87, endurance 90) won the synthetic attack/support scenario. That supports ranking behavior but does not establish official readiness.

The prototype separated the 96 riders into **87–88** finish groups and all riders finished at zero modeled energy. This is a known energy/group-physics calibration concern. The result was internally consistent (54 focused, 557 legacy tests passed), but it remains synthetic and **not** evidence that the official racing, GC, replay or prize systems are wired to V2. Correct the energy model, physical pack interactions and sporting-contract integration before any production-authority promotion.

### What changes are needed to add a stage?

Add an exact entry to the TypeScript registry, check eligibility, calendar and sampled route coverage, write a stage-specific deterministic simulation fixture, and run the full validation workflow. Changes to the V1 pilot list, shared universal physics, game database and production worker pins are not part of stage selection.

## 2026-10-23: isolated production-integration preparation

The V2 physics prototype was corrected after the actual Durmitor sandbox exposed 96/96 exhausted riders and 87–88 end groups. New physics use duration-scaled energy, sustainable paceline/drafting matching, and physically calculated on-road separation. **This is calibration, not an official release.**

| Durmitor, 96 riders | Previous V2 | Revised V2 |
|---|---:|---:|
| Steady finish groups | 87 | 23 |
| Attack/support finish groups | 88 | 42 |
| Riders with zero reserve at finish | 96 | 0 |
| Steady winner-to-10th gap | 457.7s | 430.0s |
| Attack winner-to-10th gap | 607.4s | 531.0s |

Both use the same anonymized, frozen rider attributes and sampled real route; the full-stage situation and tactics remain synthetic. No hard-coded group quotas or forced finish order.

The shadow adapter now computes the validated physical/timing/replay pipeline **once** and translates solver errors into a non-authoritative diagnostic rather than throwing them into the game race pathway. `runSelectedRaceEngineWithMountainV2Shadow(input)` is a separate **in-memory integration boundary** that returns the unchanged accepted official result plus an optional stage-whitelisted V2 preview. A failure of V2 preview never changes or blocks the official output. This new helper is tested against the original result equality and has no database I/O.

### Deployment reality and hold

The actual production calculation, pass1, pass2 and safe-resume Edge Functions still import pinned accepted sources. They **do not call** the new wrapper. A GitHub PR merge alone is not equivalent to a Supabase worker deployment. For future *production shadow* deployment, review and pin all four workers to a coherent release, prove checkpointed resume parity and fallback, carry V2 diagnostics in separate non-sporting telemetry, and demonstrate an actual run whose official result and payout hashes exactly match the pre-V2 engine. Shadow must remain optional, fail-safe and separately toggleable on exact stage IDs. Production testing must never rewrite completed stages or change rankings, points, GC, prizes, replay or ownership.

**Status: preparation implemented in draft PR; no merge, no deploy, no engine promotion.** The documented stage IDs are diagnostic candidates only. Their V2 status must remain `sandbox_shadow_only` until explicit release approval and the worker changes are reviewed/tested.
