# Issue #182 — secure migration recovery, phase 1 (read-only)

Date: 2026-10-24. Scope: ProPeloton Manager. **Not a migration repair or production-ready schema.**

## Newly checked against the actual Supabase project

Read-only SQL against production project `okuravitxocyevkexfgi` confirmed:
- 999 history rows, all with a non-null `statements` array.
- 999 timestamp-format migration versions.
- 999 stored SQL array entries (one array entry per history row). **An entry may contain multiple SQL commands; do not equate this to 999 parsed SQL statements.**
- The existing staging manifest reports 372 repository migration SQL files; 58 shared version IDs; 941 production-only and 314 repository-only IDs.

This validates *recoverability of SQL text*, not its safety or successful replay. The existing issue audit previously flagged potential credentials, data operations and email patterns. **Never copy raw statements to this public repository, CI logs, issues or PR comments.**

## Recovery decision

The public repository has a reconstructed baseline (starting September 29), alongside later incremental files. Two alternatives must be evaluated *in a private/restricted environment*:

A. **Snapshot baseline + verified future incrementals**: produce an appropriately sanitized schema-only baseline from the current actual database and a verified cutover point; record historical IDs privately and avoid replaying old data migrations. This is preferred if verified schema equivalence can be demonstrated.

B. **Full chronological migration chain**: retrieve, classify and carefully replay historical SQL after credential and data-mutation review. Do not execute 999 historical SQL bodies on production, a live branch or a database containing user data.

Neither alternative is approved until a clean local disposable database can be recreated and inspected.

## Required controlled steps

1. Establish a restricted workspace (no public issue attachments, GitHub Actions logs or PR content), access-controlled and excluded from git; record who can access it.
2. Export SQL history there using supported Supabase tooling. Preserve original version and content hashes; **do not export secrets to this public repo**.
3. Inspect for key material, secret literals, addresses, personal records, hard-coded account IDs, risky DML (`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`), `SECURITY DEFINER`, privileged grants and environment-specific names. Do not assume regex screening alone is sufficient.
4. Make an explicit baseline-vs-incremental decision, with chronological dependency analysis, a private mapping of applied IDs, review sign-off and a rollback/abandon path. Do not modify `supabase_migrations.schema_migrations` in production as a shortcut.
5. On a disposable **local** database containing no production data, apply the proposed chain; capture the first failing migration/version, SQLSTATE and sanitized error context. Fix the candidate chain and restart from a fresh disposable database until fully replayable.
6. Compare expected tables, column types, constraints, indexes, functions, triggers, RLS and grants to the real production schema **without exposing user data**. Include race processing tables/functions and worker-specific behavior.
7. Only after local replay + parity success, obtain cost approval if required, create a disposable hosted preview and run representative worker interruption, replay parity, persistence and 12×/2× workload tests. Do not change production workers or feature flags.
8. Open a separate reviewed `staging` → `main` release PR with explicit approval. Keep issue #182 open until hosted checks prove schema readiness.

## Read-only verification query

The following query returns aggregates only, never SQL text:

```sql
SELECT
  count(*) AS history_rows,
  count(*) FILTER (WHERE statements IS NOT NULL) AS rows_with_sql_arrays,
  count(*) FILTER (WHERE version ~ '^[0-9]{14}$') AS timestamp_version_rows,
  sum(coalesce(array_length(statements, 1), 0)) AS stored_array_entries,
  max(coalesce(array_length(statements, 1), 0)) AS max_entries_per_row
FROM supabase_migrations.schema_migrations;
```

## Release gate

The replay blocker remains open. The successful PR #185 mountain batch parity test is not a substitute for full-schema hosted worker tests. No migration state or production result was changed by this read-only audit.
