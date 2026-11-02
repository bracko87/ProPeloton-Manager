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

## Strict twelve-race historical pilot (4+4+4)
Set `PPM_V4_RESEARCH_COHORT=chase_priority_12` **together with**
`PPM_V4_RESEARCH_CHASE_PRIORITY=1`. This selects at most **four flat, four
hilly and four mountain** records; no cobbled races. It rejects any pilot
without the explicit chase-priority opt-in, excludes unsynchronized or unmapped
metadata, checks original locked input and team-entry authority on private
export, and preserves the unmodified strict V2 reproduction/replay checks.

Windows CMD on the already configured **trusted private workstation**, with
its existing restricted read-only Postgres credentials and CA file (never send
the password, stages or snapshots to GitHub, chat or CI):

```cmd
git pull origin main
set PPM_V4_RESEARCH_COHORT=chase_priority_12
set PPM_V4_RESEARCH_CHASE_PRIORITY=1
node scripts/v4/privateHistoricalPgV4.mjs
```

The final aggregate `chasePriority12` reports the export count and the number
of **strict, reproduced V2 and validated V4 matched pairs**. A cohort with
fewer than 12 valid pairs is labeled incomplete; passing selection preflight
does not count as replay or realism acceptance. Even a full 12/12 produces
`READY_FOR_HISTORICAL_REALISM_REVIEW` rather than production approval.
These flags and guardrails have been tested with synthetic archive records
only; **no real private rerun** has been claimed.

## Connection fix: separate login from the restricted reader
The original research reader `v4_historical_research_reader` is **NOLOGIN** by design and cannot authenticate directly through Supabase's shared pooler. A failed attempt resulted in `phase:CONNECT, postgresCode:XX000`; this is not a race-engine failure. The project region is **eu-central-2**, but the pooler cluster index must always be copied from the Supabase **Connect → Session pooler** dialog rather than guessed.

The runner now authenticates only as a dedicated `v4_historical_research_login` account via **session pooler port 5432**, verifies that exact login identity, executes `SET ROLE v4_historical_research_reader`, then checks the effective reader is still NOLOGIN, has SELECT on precisely the two research views and no SELECT access to the two live production tables, and is not a BYPASSRLS role. Fail closed otherwise. The reader group itself is not modified.

**One-time trusted Supabase SQL editor configuration** (choose a new unique password yourself; do not commit, paste in ChatGPT or print it in logs):

```sql
CREATE ROLE v4_historical_research_login
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
  PASSWORD '<choose-a-new-long-unique-private-password>';
GRANT v4_historical_research_reader TO v4_historical_research_login
  WITH INHERIT FALSE, SET TRUE;
```

If this login role already exists, review its privileges and ownership instead of blindly creating or altering it. Use a dedicated strong password for this one read-only research login, never the database administrator password.

On your own Windows CMD with the updated `main`, set `PPM_V4_RESEARCH_DB_HOST` to the **exact** hostname copied from the dashboard (no URL scheme or port), and set `PPM_V4_RESEARCH_DB_PASSWORD` locally to the newly chosen login-role password. Keep the existing trusted CA file setting. Do not upload or share secrets. The older `v4_historical_research_reader.<project-ref>` username is no longer used for authentication.

The app, source, production V2, default V4, user database permissions and replay validator are not modified. All proof tests use synthetic Postgres clients and no private archive inputs.

## November 2 first 12-race historical result and safe replay diagnostics
The restricted research pilot successfully exported **12/12** verified archived stages. Only **2/12** achieved strict matched historical comparisons: 1 flat, 0 hilly, 1 mountain. Of the ten excluded races: 4 used a different official V2 engine lane (1 flat breakaway pilot, 3 mountain experimental pilots), 5 failed **original V2 strict replay** at the race-status checkpoint (1 flat, 4 hilly), and 1 further flat race showed archived/current V2 classification drift (rank/gap/time). The **two matched V4-versus-priority races had zero measured differences** and were not sufficient for realism approval. The one opening mountain breakaway lasted 31.132 km before being caught.

Do not relax strict replay or edit archived stage IDs to hide exclusions. The runner now reports `rejected.safeReplayIssueCodesByVariant` with **only whitelisted static replay issue codes**, aggregated by solver variant. Unknown codes are reported as `UNKNOWN_ISSUE_CODE`, never echoed verbatim. Raw messages, checkpoints, stage IDs and rider identities remain private. This additional diagnostic distinguishes the race-status replay failures for targeted future repairs without changing physics or strict validation.

The first 12 were the newest four qualified metadata stages per terrain; successful export is not equivalent to proving historical reproduction. Four already-known unsupported solver stages should be excluded by lane from expanded analysis.

## Safe post-catch physical transition classification
The five historical `post_catch_group_transfer_without_physical_transition` rejections occur in original preserved V2 and all three V4 research variants, generally at a generated `race-status-XX` checkpoint. The validator checks consecutive checkpoint membership and requires an actual documented `group_split`, `group_merge` or `incident` whenever a group change is more than positional C-number relabeling.

The new research-only diagnostics collect the **first failing transfer family** (P→C, C→C, etc.) and a coarse checkpoint position (5–30%, 35–70%, 75–95% or other). They **do not** expose rider IDs, stages, group identifiers, or raw error text and **do not** change the original strict validator. Do not interpret shared error codes alone as proving a particular race physics fix; physical group membership evidence and legitimate event chronology still need a test before any solver change.

The private operator's `V4_PRIVATE_PG_COMPACT_SUMMARY` adds `postCatchFirstTransferTypes` and `postCatchFirstCheckpointPeriods`; this is the next actionable diagnostic needed to narrow the five failures. No production write or promotion is included.
