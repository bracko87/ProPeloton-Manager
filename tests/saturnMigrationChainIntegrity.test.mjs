import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { analyzeMigrationFilenames, PRODUCTION_FIRST_APPLIED_VERSION, EXPECTED_BASELINE_FILE } from '../scripts/saturn-check-migration-chain.mjs'

const directory = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
const files = readdirSync(directory).filter(name => name.endsWith('.sql'))

test('every tracked migration uses exactly one valid Supabase 14-digit version', () => {
  const report = analyzeMigrationFilenames(files)
  assert.deepEqual(report.errors, [])
  assert.equal(report.fileCount, report.uniqueVersionCount)
  assert.ok(report.fileCount >= 533, 'migration count unexpectedly decreased')
  assert.equal(report.firstRepositoryVersion, EXPECTED_BASELINE_FILE.slice(0, 14))
})

test('eight historical filename repairs match IDs recorded in production', () => {
  const canonical = [
    '20261007174208_liechtenstein_to_niger_nc_routes_v1.sql',
    '20261007194909_allow_championship_route_reuse.sql',
    '20261013051636_checkpoint_completed_run_payload_retention_v1.sql',
    '20261013051933_restore_safe_game_daily_backlog_recovery_v1.sql',
    '20261013100426_forward_only_stage_race_attrition.sql',
    '20261013100735_monitor_future_race_elimination_integrity.sql',
    '20261018161834_french_tour_and_future_stage_winner_integrity.sql',
    '20261018162507_filter_eliminated_riders_before_new_race_simulation.sql',
  ]
  for (const name of canonical) assert.ok(files.includes(name), 'missing canonical '+name)
  assert.equal(files.filter(name => /^(20261007200500_|20261013072500_|20261013_|20261018_)/.test(name)).length,0)
})

test('staging replay guard blocks production history older than repository baseline', () => {
  const report = analyzeMigrationFilenames(files, PRODUCTION_FIRST_APPLIED_VERSION)
  assert.equal(PRODUCTION_FIRST_APPLIED_VERSION,'20260820065515')
  assert.equal(report.isProductionBranchReplaySafe, false)
  assert.equal(report.firstRepositoryVersion,'20260929182948')
})

test('invalid names and reused migration versions fail closed', () => {
  const report = analyzeMigrationFilenames([
    EXPECTED_BASELINE_FILE,
    '20261013_old_incorrect_migration.sql',
    '20261007200500_duplicate_a.sql',
    '20261007200500_duplicate_b.sql',
  ])
  assert.ok(report.errors.some(x => x.includes('Invalid 14-digit')))
  assert.ok(report.errors.some(x => x.includes('Duplicate version')))
})

test('a synthetic compatible chain is marked replay-safe, but does not affect production', () => {
  const report = analyzeMigrationFilenames([EXPECTED_BASELINE_FILE], '20260929182948')
  assert.deepEqual(report.errors,[])
  assert.equal(report.isProductionBranchReplaySafe,true)
})
