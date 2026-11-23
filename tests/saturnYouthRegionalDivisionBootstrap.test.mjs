import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (name) => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')
const early = '20261005155950_youth_regional_division_bootstrap_v1.sql'
const later = '20261005224500_youth_regional_divisions_notifications_money_kits_v7.sql'

test('all Youth division helper implementations exist before allocation replay', () => {
  assert.ok(early < '20261005160015_youth_trim_future_fields_to_targets_v3.sql')
  const source = read(later)
  const bootstrap = read(early)
  const names = [
    'private.youth_regional_division_for_country_v1',
    'private.youth_continental_division_for_regional_v1',
    'private.youth_continental_division_for_country_v1',
    'private.youth_regional_ai_target_v1',
    'private.youth_regional_feed_count_v1',
  ]
  for (const name of names) {
    const marker = 'create or replace function ' + name + '('
    const start = source.indexOf(marker)
    const end = source.indexOf('$function$;', start)
    assert.ok(start >= 0 && end > start, 'canonical missing ' + name)
    assert.ok(bootstrap.includes(source.slice(start, end + '$function$;'.length)),
      'bootstrap must preserve exact later definition for ' + name)
  }
})
