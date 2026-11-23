import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const file = new URL('../supabase/migrations/20260930185828_nations_stable_groups_capacity_v46.sql', import.meta.url)

test('World Nations fresh-install SQL terminates every dollar-quoted function', () => {
  const source = readFileSync(file,'utf8')
  const functions = [...source.matchAll(/^CREATE OR REPLACE FUNCTION\b/gm)]
  const starts = [...source.matchAll(/^AS \$function\$$/gm)]
  const ends = [...source.matchAll(/^\$function\$;$/gm)]
  assert.equal(functions.length,3)
  assert.equal(starts.length,3)
  assert.equal(ends.length,3)
  assert.doesNotMatch(source,/^\$function\$$/m)
  assert.match(source,/^\$function\$;\s*\n\s*CREATE OR REPLACE FUNCTION/m)
})
