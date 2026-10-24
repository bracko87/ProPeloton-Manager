# Issue #182 — baseline parity checkpoint (2026-10-24)

This is a **count-only gate**, not a database reconstruction or proof of schema equivalence.

A read-only query of production's public information schema returned:
- 629 BASE TABLE objects
- 10,834 columns
- 2,375 routines

Only these three aggregate integers belong in the reference snapshot. Do not export production row data, function bodies, historical migration statements, passwords, access tokens, or other sensitive material into the public repository.

## Obtain snapshots independently

Run these read-only SQL queries against each isolated target, and write the results to JSON keys `tables`, `columns`, `routines`:

```sql
SELECT count(*) AS tables FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
SELECT count(*) AS columns FROM information_schema.columns
WHERE table_schema = 'public';
SELECT count(*) AS routines FROM information_schema.routines
WHERE routine_schema = 'public';
```

Then run:

```sh
node scripts/verify-schema-baseline.mjs reference.json candidate.json
node --test scripts/test-schema-baseline.mjs
```

Passing only confirms counts. For final acceptance, separately validate all actual object identities/definitions, constraints, indexes, triggers, RLS/policies, privileges, extensions, functions, race-engine tables and database calls. Do not approve release on the basis of counts alone.

**Current blocker:** the execution environment does not have `supabase`, `pg_dump`, `psql` or a local Docker/Postgres instance. Consequently an actual sanitized schema baseline has not been exported, applied or replay-tested. Complete these steps in a secured execution environment before a hosted preview. This gate does not alter production or enable replay batching.
