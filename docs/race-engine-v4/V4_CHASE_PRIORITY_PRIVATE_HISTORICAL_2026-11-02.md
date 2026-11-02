# V4 chase-priority candidate — optional private historical comparison

**Research-only; never a production V4 or V2 change.** Commit adds an explicitly opt-in fourth isolated solver variant to the existing trusted-machine runner. Default historical physics comparison remains the original preserved V2 / combined / combined-energy trio.

## Privileged data boundary
- Read archived race snapshots only on the already established private, owner-controlled machine or restricted Postgres research workflow, never in GitHub Actions, issues, source, browser logs or chat.
- Keep manifest and exported JSON privately stored outside this repository with restrictive file permissions. Runner rejects input files from inside repository and validates 1–100 manifest paths. No database connector or network call is added to the runner.
- Recompute and verify the saved V2 finish classification and strict replay before accepting a stage as comparable; reject baseline drift or unsupported solver lanes.
- On matched eligible archived inputs, compare the existing calibrated+energy V4 result against **the same V4 with the bounded phase-2 mountain explicit-chase priority candidate**. Never change AI/human commands or the stage snapshot. Records return only aggregate counts, anonymized metrics and safe failure codes.

## Optional local command
From a privately configured trust boundary with valid private envelope manifest and Node 22:

```cmd
node scripts/v4/privateHistoricalPhysicsV4.mjs C:\\Private\\v4-cohort-manifest.json --v4-private-chase-priority
```

The default command (without the final flag) is behaviorally unchanged. The opt-in report appends `chasePriorityResearch` with compared/rejected counts, phase peak/energy medians and outcome differences by terrain. It never outputs stage/rider/team identifiers, stored input snapshots or private paths. If a candidate replay fails, it is excluded; strict validators are **never bypassed**.

## Available historical cohort and limitations
A SELECT-only aggregate check on 2026-11-02 found 69 intact completed records in the restricted `v4_historical_research.completed_runs` research view: 17 flat, 40 hilly and 12 mountain. Of these, 38 have complete authoritative team-entry mapping **and** a synchronized saved replay (flat 8, hilly 21, mountain 9). These are metadata preflight candidates only: they are **not yet accepted matched historical V2/V4 replays**.

The archive does not reliably prove its exact production source revision or original three-hour lock instant; saved synchronization alone cannot establish exact current-V2 reproduction. Real comparisons must be run locally on the private source, reviewed for provenance, and never treated as automatic approval. No historical snapshots were fetched into GitHub or used to set synthetic targets.

## Before production
Require opt-in synthetic test and historical runner clean, nonzero strictly matched historical cases, believable physical breakaway durations, pursuit-response sensitivity, energy budgets, replay consistency and explicit review. Production V2 and normal V4 remain unchanged.

## Restricted Postgres pilot integration (additional opt-in)
The existing `scripts/v4/privateHistoricalPgV4.mjs` restricted-reader pilot now supports the private fourth variant **only** when `PPM_V4_RESEARCH_CHASE_PRIORITY=1` is explicitly set by the trusted operator. The default remains the previous three variants.

For Windows CMD in a trusted private machine with the existing restricted-reader credentials and CA configuration (never share those values):

```cmd
set PPM_V4_RESEARCH_CHASE_PRIORITY=1
node scripts/v4/privateHistoricalPgV4.mjs
```

With this flag, candidate discovery considers only archived stages with **confirmed synchronized saved replay and full authoritative team-entry mapping**, rather than relying on missing/unknown metadata as fallback. The private solver must report positive evidence that its opt-in variant ran; missing or malformed candidate evidence is rejected. The usual current-V2 saved-finish parity and strict replay guards still determine eligible paired historical results. The pilot prints only anonymized aggregate outcome categories and metrics and securely deletes temporary private files. Keep the environment flag unset for the default three-variant behavior.

This integration was verified with synthetic data only. The real historical sample has not yet been run with this new mode.
