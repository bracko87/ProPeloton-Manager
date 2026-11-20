import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
const read = p => readFileSync(new URL('../' + p, import.meta.url),'utf8')
const practice = read('src/pages/GuestPractice.tsx')
const migration = read('supabase/migrations/20261120114500_saturn_guest_demo_drafts_v1.sql')

test('a guest must create a nickname and team before accessing practice riders', () => {
  assert.match(practice, /draft\.nickname\.trim\(\)/)
  assert.match(practice, /draft\.teamName\.trim\(\)/)
  assert.match(practice, /draft\.country\.trim\(\)/)
  assert.match(practice, /!setupComplete \|\| !hasDraft/)
  assert.match(practice, /Create practice team/)
})
test('guest demo shows a separate practice league, never official slots', () => {
  assert.match(practice, /Practice League — Entry level/)
  assert.match(practice, /occupies no official division slot/)
  assert.doesNotMatch(practice, /\.from\('clubs'\)|\.rpc\('create_club'/)
})
test('seven-day draft expiry is enforced server-side and creation date immutable to guest', () => {
  assert.match(practice, /7 \* 86400000/)
  assert.match(migration, /created_at > now\(\) - interval '7 days'/)
  assert.match(migration, /grant select, insert \(user_id, draft\), update \(draft\)/)
  assert.doesNotMatch(migration, /grant .*update \(created_at\)|grant .*insert \(.*created_at/)
})
test.todo('staging: expiry blocks reading and updating expired guest drafts')
test.todo('staging: converted permanent account can still read its draft')
test.todo('staging: form setup, reload, and conversion preserve name and team identity')
