import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20261123113242_saturn_random_generic_home_kit_for_guest_teams_v1.sql')
const customize = read('src/pages/CustomizeTeam.tsx')
const createClub = read('src/pages/CreateClub.tsx')

test('new Saturn guest club receives saved home jersey from existing generic pool', () => {
  assert.match(migration, /after insert on public\.saturn_test_accounts_v1/)
  assert.match(migration, /private\.saturn_assign_missing_home_kit_v1\(\)/)
  assert.ok(migration.includes('AI Teams Kits/[Gg]enkit'))
  assert.match(migration, /\[Gg\]enkit/)
  assert.match(migration, /order by random\(\)/i)
  assert.match(migration, /insert into public\.team_kits\(team_id, name, config, updated_at\)/)
  assert.match(migration, /'mode', 'generic_pool'/)
  assert.match(migration, /'source', 'saturn_guest_default'/)
  assert.match(createClub, /const GENERIC_TEAM_KITS = \[/)
  assert.match(customize, /raw\.mode === 'generic_pool'/)
})

test('an existing custom jersey is never replaced, even on backfill', () => {
  assert.match(migration, /if exists \([\s\S]*?from public\.team_kits k[\s\S]*?k\.team_id = new\.club_id and k\.name = 'home'/)
  assert.equal((migration.match(/on conflict \(team_id, name\) do nothing;/g) ?? []).length, 2)
  assert.match(migration, /where not exists \([\s\S]*?select 1 from public\.team_kits/)
  assert.doesNotMatch(migration, /on conflict \(team_id, name\) do update/)
})

test('fallback stays non-blocking and original generic kit can be restored', () => {
  assert.match(migration, /if v_asset_name is null then[\s\S]*?return new;/)
  assert.match(migration, /'original_generic_image_url', v_url/)
  assert.match(customize, /original_generic_image_url/)
  assert.match(migration, /revoke all on function private\.saturn_assign_missing_home_kit_v1\(\)/)
})
