import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../supabase/migrations/20261002154000_consolidate_national_notifications_v2.sql', import.meta.url),
  'utf8',
)

test('notification type sequence catches up before canonical seed without rewriting IDs', () => {
  const sync = sql.indexOf("select setval(\n  'public.notification_types_id_seq'::regclass")
  const insert = sql.indexOf('insert into public.notification_types(')
  assert.ok(sync >= 0 && sync < insert, 'sequence must be synchronized before insert')
  const block = sql.slice(sync, insert)
  assert.match(block, /greatest\(/i)
  assert.match(block, /select coalesce\(max\(id\), 1\) from public\.notification_types/i)
  assert.match(block, /select last_value from public\.notification_types_id_seq/i)
  assert.match(sql.slice(insert), /on conflict\(code\) do update/i)
})
