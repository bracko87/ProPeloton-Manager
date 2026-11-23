/**
 * Project Saturn: read-only repository migration integrity check.
 *
 * This check NEVER connects to Supabase and NEVER modifies migrations.
 * Production's historical migration history starts before this repo's
 * baseline. A successful file audit does NOT authorize a paid Supabase
 * preview branch; --require-branch-safe deliberately fails in that case.
 */
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
export const PRODUCTION_FIRST_APPLIED_VERSION = '20260820065515'
export const EXPECTED_BASELINE_FILE = '20260929182948_baseline_00_extensions_types.sql'

/** Returns structured errors and resolved versions for unit tests and CI. */
export function analyzeMigrationFilenames(files, productionFirst = PRODUCTION_FIRST_APPLIED_VERSION) {
  const errors = []
  const versions = new Map()
  const namePattern = /^(\d{14})_([a-zA-Z0-9][a-zA-Z0-9_-]*)\.sql$/
  const source = files.filter(f => f.endsWith('.sql')).sort()
  if (!source.length) errors.push('No migration SQL files found')

  for (const name of source) {
    const match = name.match(namePattern)
    if (!match) {
      errors.push('Invalid 14-digit Supabase migration filename: ' + name)
      continue
    }
    const version = match[1]
    if (versions.has(version)) {
      errors.push('Duplicate version ' + version + ': ' + versions.get(version) + ' and ' + name)
    } else {
      versions.set(version, name)
    }
    // Supabase CLI treats the 14-digit prefix as the migration identity.
    if (!/^20\d{12}$/.test(version)) errors.push('Unexpected migration century: ' + name)
  }
  const firstRepositoryVersion = [...versions.keys()].sort()[0] ?? null
  if (firstRepositoryVersion && firstRepositoryVersion !== EXPECTED_BASELINE_FILE.slice(0, 14)) {
    errors.push('Repository baseline ordering changed: ' + firstRepositoryVersion)
  }
  if (!source.includes(EXPECTED_BASELINE_FILE)) errors.push('Expected fresh-install baseline missing')

  return {
    errors,
    fileCount: source.length,
    uniqueVersionCount: versions.size,
    firstRepositoryVersion,
    productionFirst,
    // Production's historical hotpatches are NOT replayable against an
    // empty database until a separately verified early baseline exists.
    isProductionBranchReplaySafe: Boolean(firstRepositoryVersion) &&
      productionFirst >= firstRepositoryVersion && errors.length === 0,
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const report = analyzeMigrationFilenames(readdirSync(ROOT))
  console.log(JSON.stringify(report, null, 2))
  if (report.errors.length) process.exitCode = 1
  if (process.argv.includes('--require-branch-safe') && !report.isProductionBranchReplaySafe) {
    console.error('STOP: paid Supabase branch replay is unsafe. Production history predates the repo baseline.')
    process.exitCode = 2
  }
}
