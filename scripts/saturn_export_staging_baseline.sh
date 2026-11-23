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
if [[ -e "$out" || -L "$out" || -e "${out}.auth-hooks.txt" || -L "${out}.auth-hooks.txt" ]]; then
  echo 'Output or companion hook inventory already exists. Stop.' >&2; exit 2
fi
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
tmp_hooks="$(mktemp "${out}.auth-hooks.partial.XXXXXX")"
trap 'rm -f -- "$tmp" "$tmp_hooks"' EXIT
pg_dump --format=custom --schema-only --no-password \
    --lock-wait-timeout=5s \
    --schema=public --schema=private --schema=finance \
    --schema=archive --schema=control_center_private --schema=v4_historical_research \
    --file="$tmp"
pg_restore --list "$tmp" >/dev/null
# Export only application triggers defined ON managed Auth tables. They are
# deliberately excluded from schema-only application schema dumps. This is
# an inventory for review, NEVER an automatically executed restore script.
psql -X -At -v ON_ERROR_STOP=1 \
  -f "$root/supabase/tests/saturn_managed_auth_hooks_readonly.sql" > "$tmp_hooks"
if ! grep -Fq 'ppm_prevent_unverified_guest_signup_v1' "$tmp_hooks"; then
  echo 'Expected protected Auth guest signup hook is missing; review source.' >&2
  exit 3
fi
mv -- "$tmp_hooks" "${out}.auth-hooks.txt"
mv -- "$tmp" "$out"
trap - EXIT
echo 'Schema-only archive and Auth hook inventory captured privately. No restore performed.'
