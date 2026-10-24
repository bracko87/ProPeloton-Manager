#!/usr/bin/env bash
# Disposable PostgreSQL CI stress test, never against the game database.
set -euo pipefail
createdb race_capacity_burst
export PGDATABASE=race_capacity_burst
psql -X -v ON_ERROR_STOP=1 -f scripts/tests/safe-worker-admission-fixtures.sql
psql -X -v ON_ERROR_STOP=1 -f docs/engineering/safe_step_admission_cap_proposal_20261024.sql
psql -X -v ON_ERROR_STOP=1 -c "
INSERT INTO public.race_stage_safe_calculation_v1(stage_id,status)
SELECT ('00000000-0000-4000-8001-'||lpad(g.idx::text,12,'0'))::uuid,'pending'
FROM generate_series(1,32) AS g(idx);
"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
# Each xargs item invokes a separate PostgreSQL client/transaction.
# Twenty-four simultaneous claim requests must not bypass the advisory lock.
seq 1 24 | xargs -P 24 -I '{}' psql -X -At -v ON_ERROR_STOP=1 \
  -c "SELECT public.universal_race_stage_claim_safe_step_v2('burst')->>'status';" > "$tmp"
claimed="$(grep -cx claimed "$tmp" || true)"
deferred="$(grep -cx capacity_deferred "$tmp" || true)"
count="$(wc -l < "$tmp" | tr -d ' ')"
printf 'Concurrent claim responses: claimed=%s deferred=%s total=%s\n' "$claimed" "$deferred" "$count"
if [[ "$claimed" -ne 3 || "$deferred" -ne 21 || "$count" -ne 24 ]]; then
  printf 'FAIL: expected exactly three active claims and 21 deferrals\n' >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 -c "
DO \$check\$
BEGIN
 IF (SELECT count(*) FROM public.race_stage_safe_calculation_v1
     WHERE status='running' AND lease_expires_at>clock_timestamp())<>3 THEN
   RAISE EXCEPTION 'Concurrent admission exceeded three active leases';
 END IF;
 IF (SELECT count(*) FROM public.race_stage_safe_calculation_v1
     WHERE status='pending')<>29 THEN
   RAISE EXCEPTION 'Concurrent admission mutated the pending queue';
 END IF;
 RAISE NOTICE 'PASS: 24 simultaneous claimers, 3 claimed, 21 deferred, 29 remaining pending';
END \$check\$;
"
