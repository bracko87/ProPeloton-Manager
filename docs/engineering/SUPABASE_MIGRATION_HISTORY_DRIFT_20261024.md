# ProPeloton Supabase migration history: replay blocker

Snapshot date: 2026-10-24. This is a **diagnosis**, not a migration repair.

Production migration inventory, compared with the `staging` repository:

| Inventory | Count |
| --- | ---: |
| Production applied migration versions | **999** |
| Repository SQL migration files | **372** |
| Matching version numbers | **58** |
| Applied in production but missing from the repository | **941** |
| Repository migrations not recorded in production | **314** |

The repository begins with a large reconstructed September 29 baseline, whereas production history includes hundreds of older incremental migrations. Simply creating a preview project from the incomplete source history can fail. An earlier preview returned `MIGRATIONS_FAILED` and did not contain the game schema. Do not assert that fixing one isolated SQL error will recreate the game.

## Reproducible check

`node scripts/check-migration-parity.mjs --json` provides an honest, read-only migration inventory comparison. `--strict` returns nonzero if either direction is unmatched. CI executes it in reporting mode plus regression tests; this known blocker must not be hidden by a green engine-physics test.

## Safe repair path

1. Export all migration versions and SQL bodies that are still recoverable from the canonical production migration history using Supabase-supported migration fetch/db pull workflows, in a controlled workspace. Preserve the current `staging` baseline files; do **not** rewrite applied production history without a migration repair plan.
2. Reconcile baseline-versus-incremental migrations in chronological order. Duplicate version IDs and incompatible object definitions must be resolved in a dedicated candidate migration chain.
3. Rehearse on disposable local Supabase containers and capture the first failing SQL statement with Postgres logs. Keep production unchanged.
4. Only after the full schema recreates locally, create a fresh isolated hosted preview branch and verify its tables/functions/Edge workers; include synthetic and representative race workloads.
5. Production release requires separate explicit approval and a reviewed `staging` → `main` PR per AGENTS.md.

`prod_applied_migration_versions_20261024.json` is a point-in-time list of version identifiers, not secret values, SQL bodies or proof of parity for later dates.
