# V4 historical research — dedicated restricted PostgreSQL role

A NOLOGIN, NOINHERIT, NOBYPASSRLS, no-write role was provisioned for
historical comparison on 30 October 2026. It is currently disabled for login.

Role: v4_historical_research_reader. Views in unexposed schema
v4_historical_research: completed_runs and race_entries.

The two security-barrier views expose only completed road race data from
2026-10-24 (inclusive) through 2026-10-26 (exclusive), and only entries
belonging to those races. At installation: 69 race snapshots:
17 flat, 40 hilly, 12 mountain. Zero cobbled available.
The role has SELECT on these views but not on public base tables,
and no write or RLS bypass privileges.

Operator-only activation: In the Supabase dashboard SQL Editor, activate
the role with a strong password created only on the operator's computer:
ALTER ROLE v4_historical_research_reader WITH LOGIN PASSWORD 'YOUR_PRIVATE_PASSWORD';
Do not paste the secret into ChatGPT or GitHub.

In Supabase Connect, copy the real Shared Pooler Session hostname
(aws-N-region.pooler.supabase.com). Do not guess the pooler host.
Configure local CMD session PPM_V4_RESEARCH_DB_HOST and
PPM_V4_RESEARCH_DB_PASSWORD privately. Do not screenshot these secrets.
Run npm install --no-save --package-lock=false pg for an optional PG client,
then npx --yes node@22 scripts\v4\privateHistoricalPgV4.mjs.

The CLI requires the exact role and privilege posture, uses verified TLS,
only parameterized SELECT statements, temporary owner-only snapshot files,
strict V2 baseline / V4 replay checks, and aggregate-only output.
No snapshots or secrets are sent to GitHub CI.
After the research session, disable the role:
ALTER ROLE v4_historical_research_reader NOLOGIN;
