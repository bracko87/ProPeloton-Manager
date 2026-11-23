import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8')
const shell = read('scripts/saturn_export_staging_baseline.sh')
const powershell = read('scripts/saturn_export_staging_baseline.ps1')
const inventory = read('supabase/tests/saturn_managed_auth_hooks_readonly.sql')

test('Bash staging archive never exports production player data or writes to DB', () => {
  assert.ok(shell.includes('--schema-only'))
  assert.ok(shell.includes('default_transaction_read_only=on'))
  assert.ok(shell.includes('umask 077'))
  assert.ok(shell.includes('PGSSLMODE'))
  assert.ok(shell.includes('pg_restore --list'))
  assert.ok(shell.includes('saturn_managed_auth_hooks_readonly.sql'))
  assert.ok(shell.includes('ppm_prevent_unverified_guest_signup_v1'))
  assert.ok(shell.includes('.auth-hooks.txt'))
  assert.doesNotMatch(shell,/\bpg_restore\s+--dbname\b|\bpg_dump\s+--data-only\b/)
})

test('Windows staging archive captures managed Auth hook inventory privately', () => {
  assert.ok(powershell.includes('--schema-only'))
  assert.ok(powershell.includes('default_transaction_read_only=on'))
  assert.ok(powershell.includes('$env:PGSSLMODE = \'require\''))
  assert.ok(powershell.includes('saturn_managed_auth_hooks_readonly.sql'))
  assert.ok(powershell.includes('ppm_prevent_unverified_guest_signup_v1'))
  assert.ok(powershell.includes('AUTH_HOOKS_INVENTORY'))
  assert.ok(powershell.includes('Do not apply this inventory automatically'))
  assert.doesNotMatch(powershell,/&\s*\$restorePath\s+--dbname\b|--data-only/)
})

test('managed Auth trigger inventory is read-only, excludes user rows, and excludes vendor Storage triggers', () => {
  const src = inventory.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')
  assert.match(src,/pg_get_triggerdef\(t\.oid, true\)/)
  assert.match(src,/n\.nspname='auth'/)
  assert.match(src,/c\.relname in \('users','sessions'\)/)
  assert.match(src,/not t\.tgisinternal/)
  assert.match(src,/fn\.nspname in \('public','private','control_center_private'\)/)
  assert.doesNotMatch(src,/\b(insert\s+into|update\s+|delete\s+from|truncate\s+|drop\s+|alter\s+|create\s+|grant\s+|revoke\s+)\b/i)
  assert.doesNotMatch(src,/select\s+\*\s+from\s+auth\.users/i)
})
