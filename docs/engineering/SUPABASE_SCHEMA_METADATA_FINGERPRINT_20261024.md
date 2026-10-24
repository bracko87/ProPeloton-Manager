# Issue #182 — read-only structural metadata fingerprint

Verified against production Supabase on 2026-10-24 (read-only): **13,896** public table/column/routine metadata entries; MD5 metadata fingerprint **51f5fe5e019d596ca44880127deef490**.

The following SQL returns only aggregate metadata and a digest; it does not return production rows, migration SQL, credentials, or function bodies:

```sql
WITH objects AS (
  SELECT 'column:'||table_name||'.'||column_name||':'||ordinal_position||':'||
         data_type||':'||is_nullable||':'||coalesce(column_default,'') AS signature
  FROM information_schema.columns WHERE table_schema='public'
  UNION ALL
  SELECT 'table:'||table_name||':'||table_type
  FROM information_schema.tables WHERE table_schema='public'
  UNION ALL
  SELECT 'routine:'||routine_name||':'||routine_type||':'||coalesce(data_type,'')
  FROM information_schema.routines WHERE routine_schema='public'
)
SELECT count(*) AS components,
       md5(string_agg(md5(signature),'' ORDER BY signature)) AS fingerprint
FROM objects;
```

Save only the two returned values in restricted/sanitized JSON files named `production.json` and `isolated.json` (these are examples; no connection credentials belong in JSON). Run:

```sh
node scripts/verify-schema-fingerprint.mjs production.json isolated.json
node --test scripts/test-schema-fingerprint.mjs
```

**Limitations:** This is a metadata smoke gate, not a schema export, cryptographic integrity guarantee, or proof of database equivalence. MD5 is used only as a reproducible non-security checksum. This query does not detect changes to function *bodies*, overloaded function argument types, triggers, policies, RLS settings, extension configuration, privileges, indexes, constraints, views or other schemas. Column defaults can embed environment-dependent literals; the digest is not guaranteed to match logically equivalent databases without normalization. The comparator intentionally rejects fields beyond `components` and `fingerprint`.

Actual schema-only reconstruction, private safety review, disposable local replay and hosted race engine worker tests are **still required**. Never manipulate production migration history to make fingerprints match.
