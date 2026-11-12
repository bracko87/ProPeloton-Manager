import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const migration = read('../supabase/migrations/20261112122700_cycling_private_migration_inspection_v1.sql')
const boundary = read('../src/components/season/CyclingSeasonWindowBoundary.tsx')
const inspector = read('../src/components/season/CyclingAdminInspection.tsx')

test('new sessions may be created during migration only for the private allowlist', () => {
  assert.match(migration, /NEW\.user_id/)
  assert.match(migration, /private\.is_cycling_migration_inspector_v1\(NEW\.user_id\)/)
  assert.match(migration, /v_phase IN \('migration','delayed'\)/)
  assert.match(migration, /RAISE EXCEPTION/)
  assert.doesNotMatch(migration, /UPDATE public\.game_clock_config/i)
  assert.doesNotMatch(migration, /UPDATE public\.game_state/i)
  assert.doesNotMatch(migration, /pelotonpro36@gmail\.com|vasicsominbgd@gmail\.com/i)
})

test('inspection requires a real authenticated allowlisted user', () => {
  assert.match(migration, /v_uid uuid := auth\.uid\(\)/)
  assert.match(migration, /v_uid IS NULL OR NOT private\.is_cycling_migration_inspector_v1\(v_uid\)/)
  assert.match(migration, /w\.phase NOT IN \('migration','delayed'\)/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_cycling_admin_migration_inspection_v1\(\) FROM PUBLIC,anon/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_cycling_admin_migration_inspection_v1\(\) TO authenticated/)
  assert.match(migration, /u\.email_confirmed_at IS NOT NULL/)
  assert.match(migration, /REVOKE ALL ON private\.cycling_migration_inspectors_v1/)
})

test('ordinary game routes stay hidden behind the migration boundary', () => {
  assert.match(boundary, /if \(windowStatus\.locked\)/)
  assert.match(boundary, /if \(inspectorReport\?\.authorized && inspectorReport\.read_only\)/)
  assert.match(boundary, /CyclingAdminInspection/)
  assert.match(boundary, /supabase\.auth\.signInWithPassword/)
  assert.match(boundary, /get_cycling_admin_migration_inspection_v1/)
  assert.match(boundary, /supabase\.auth\.signOut/)
  assert.match(boundary, /Administrator inspection sign-in/)
  assert.match(boundary, /Open game dashboard/)
  assert.match(boundary, /navigate\('\/dashboard\/overview', \{ replace: true \}\)/)
  assert.match(boundary, /<Navigate to="\/dashboard\/overview" replace \/>/)
  assert.match(boundary, /location\.pathname\.startsWith\('\/dashboard\/'\)/)
  assert.match(boundary, /\bchildren\b/)
  assert.match(boundary, /Authorized migration inspection/)
  assert.match(boundary, /WindowContext\.Provider/)
  assert.doesNotMatch(inspector, /update\(|insert\(|delete\(|rpc\(/)
  assert.match(inspector, /Season 2 migration inspection/)
  assert.match(inspector, /read.only/)
})
