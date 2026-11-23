import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = (name) => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')
const helperFile = '20261001173000_national_championship_confirmation_helper_bootstrap_v1.sql'
const consumerFile = '20261001173500_skip_missing_route_national_championships_in_lifecycle_v1.sql'
const canonicalFile = '20261001190500_national_championship_lifecycle_watchdog_v60.sql'
const name = 'national_championship_entry_confirmed_for_event_v1'
const fn = (sql) => {
  const marker = 'CREATE OR REPLACE FUNCTION public.' + name
  const start = sql.indexOf(marker)
  assert.notEqual(start, -1, 'missing function definition')
  const end = sql.indexOf('$function$;', start)
  assert.notEqual(end, -1)
  return sql.slice(start, end + '$function$;'.length)
}

test('confirmation helper exists before National Championship lifecycle consumer', () => {
  assert.ok(helperFile < consumerFile)
  assert.match(migration(consumerFile), /public\.national_championship_entry_confirmed_for_event_v1\(/)
  assert.equal(fn(migration(helperFile)), fn(migration(canonicalFile)))
})
