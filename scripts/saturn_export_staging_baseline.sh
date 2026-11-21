#!/usr/bin/env bash
# Capture a current, schema-only baseline for an isolated Saturn database.
# No production writes, no player data, no migration history changes.
# Output is confidential, local-only; never commit it or upload it as CI artifact.
set -euo pipefail
umask 077
: "${PGHOST:?Set PGHOST for the production read connection}"
: "${PGUSER:?Set the database user in PGUSER}"
: "${PGDATABASE:?Set PGDATABASE}"
: "${PGSSLMODE:?Set PGSSLMODE to require or verify-full}"
case "$PGSSLMODE" in require|verify-ca|verify-full) ;; *) echo 'TLS required' >&2; exit 2;; esac
out="${1:-}"
if [[ -z "$out" || -e "$out" ]]; then
  echo 'Specify a new output file outside the Git checkout.' >&2; exit 2
fi
# Resolve the destination parent and refuse any path inside this checkout.
outdir="$(cd -- "$(dirname -- "$out")" && pwd -P)"
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
case "$outdir/" in "$root/"*) echo 'Do not write a live schema archive inside Git.' >&2; exit 2;; esac
out="$outdir/$(basename -- "$out")"
if [[ -e "$out" || -L "$out" ]]; then echo 'Output exists. Stop.' >&2; exit 2; fi
export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=120000"
command -v pg_dump >/dev/null
command -v psql >/dev/null
command -v pg_restore >/dev/null
if [[ "$(psql -X -At -v ON_ERROR_STOP=1 -c "select (to_regclass('public.clubs') is not null and to_regprocedure('public.generate_race_prize_awards_v1(uuid,uuid,boolean)') is not null)::int")" != 1 ]]; then
  echo 'Source lacks the current game schema. Stop.' >&2; exit 3
fi
# Explicit application schema selection. Managed Auth/Storage/extension schemas
# must already exist on a compatible destination. Custom objects/triggers in
# managed schemas need a separate reviewed inventory and restore step.
# Owner and ACL metadata are retained; do not silently change definer ownership.
tmp="$(mktemp "${out}.partial.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
pg_dump --format=custom --schema-only --no-password \
    --lock-wait-timeout=5s \
    --schema=public --schema=private --schema=finance \
    --schema=archive --schema=control_center_private --schema=v4_historical_research \
    --file="$tmp"
pg_restore --list "$tmp" >/dev/null
mv -- "$tmp" "$out"
trap - EXIT
echo 'Schema-only archive captured. Keep confidential. No restore performed.'
