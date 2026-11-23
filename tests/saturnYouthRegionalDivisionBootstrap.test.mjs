import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (name) => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')
const early = '20261005155950_youth_regional_division_bootstrap_v1.sql'
const later = '20261005224500_youth_regional_divisions_notifications_money_kits_v7.sql'

test('regional Youth division helper exists before allocation replay and matches later version', () => {
  assert.ok(early < '20261005160015_youth_trim_future_fields_to_targets_v3.sql')
  const marker = 'create or replace function private.youth_regional_division_for_country_v1('
  const canonical = read(later)
  const start = canonical.indexOf(marker)
  const end = canonical.indexOf('$function$;', start)
  assert.ok(start >= 0 && end > start)
  assert.ok(read(early).includes(canonical.slice(start, end + '$function$;'.length)))
  assert.match(read(early), /public\.get_amateur_division_for_country\(p_country_code\)/)
})
