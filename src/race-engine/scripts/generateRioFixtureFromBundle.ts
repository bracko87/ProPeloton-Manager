/**
 * generateRioFixtureFromBundle.ts
 *
 * Generator script to produce a rioStage1SourceRows fixture file for tests.
 *
 * Purpose:
 * - Read an exported "source bundle" module that contains the original database
 *   source rows for the Rio stage.
 * - Validate the expected structure minimally.
 * - Emit a TypeScript fixture file:
 *     src/race-engine/tests/fixtures/rioStage1SourceRows.ts
 *   which exports:
 *     export const rioStage1SourceRows = { ... } as const
 *
 * Usage (node >= 14 with ESM support or ts-node):
 *   node ./src/race-engine/scripts/generateRioFixtureFromBundle.ts <bundleModulePath> <outFilePath>
 *
 * Example:
 *   node ./src/race-engine/scripts/generateRioFixtureFromBundle.ts ./data/rioSourceBundle.js ./src/race-engine/tests/fixtures/rioStage1SourceRows.ts
 *
 * Notes:
 * - The script does not invent or modify rider rows: it uses the exact exported
 *   contents of the supplied bundle.
 * - The bundle is expected to export an object that contains the properties:
 *   { race, stage, participantTeams, participantRiders, riders, stagePlans, profilePoints }
 *   under any top-level export name (default or named). The script will attempt
 *   to locate those properties.
 * - The script writes a plain TypeScript file; running the tests requires the
 *   generated fixture file to exist in the repo.
 */

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

/**
 * findExportedBundle
 *
 * Try to load a module (ESM or CommonJS) from the supplied path and return
 * an object whose keys include the required source-row properties.
 *
 * @param modulePath - path to the module file
 */
async function findExportedBundle(modulePath: string): Promise<any> {
  const resolvedPath = path.isAbsolute(modulePath)
    ? modulePath
    : path.resolve(process.cwd(), modulePath)

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Bundle module not found: ${resolvedPath}`)
  }

  let mod: any
  try {
    // Try dynamic ESM import
    mod = await import(pathToFileURL(resolvedPath).href)
  } catch (err) {
    // Fallback to require for CommonJS
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require(resolvedPath)
  }

  // If module has default export that looks like the bundle, prefer it.
  const candidates = []

  if (mod && typeof mod === 'object') {
    // Collect default then named exports
    if (mod.default && typeof mod.default === 'object') {
      candidates.push(mod.default)
    }
    for (const key of Object.keys(mod)) {
      candidates.push((mod as any)[key])
    }
  }

  // Helper to check if object contains required keys
  function looksLikeBundle(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false
    const required = [
      'race',
      'stage',
      'participantTeams',
      'participantRiders',
      'riders',
      'stagePlans',
      'profilePoints',
    ]
    return required.every((k) => Object.prototype.hasOwnProperty.call(obj, k))
  }

  for (const cand of candidates) {
    if (looksLikeBundle(cand)) return cand
  }

  // If module itself contains required keys, return it
  if (looksLikeBundle(mod)) return mod

  throw new Error(
    `Could not find an exported bundle object with required properties in ${resolvedPath}`,
  )
}

/**
 * prettySerialize
 *
 * Serialize JS object to TypeScript source suitable for "as const" export.
 *
 * @param obj - object to serialize
 */
function prettySerialize(obj: unknown): string {
  // We rely on JSON.stringify producing strict JSON — that's fine because the
  // source bundle is plain data (strings, numbers, booleans, arrays, objects).
  // Use a replacer to ensure 'undefined' is not kept (shouldn't be present).
  return JSON.stringify(obj, null, 2)
}

/**
 * validateBundle
 *
 * Basic runtime validation to catch obvious issues early.
 *
 * @param bundle - candidate bundle object
 */
function validateBundle(bundle: any) {
  if (!bundle) throw new Error('Bundle is empty')
  if (!bundle.race || typeof bundle.race.id !== 'string')
    throw new Error('bundle.race.id missing or invalid')
  if (!bundle.stage || typeof bundle.stage.id !== 'string')
    throw new Error('bundle.stage.id missing or invalid')

  // Minimal expectations: arrays exist
  const arrProps = [
    'participantTeams',
    'participantRiders',
    'riders',
    'stagePlans',
    'profilePoints',
  ]
  for (const p of arrProps) {
    if (!Array.isArray(bundle[p])) {
      throw new Error(`bundle.${p} must be an array`)
    }
  }
}

/**
 * writeFixtureFile
 *
 * Emit the fixture TS file containing the rioStage1SourceRows const.
 *
 * @param outPath - filesystem path to write to
 * @param bundle - object to serialize
 */
function writeFixtureFile(outPath: string, bundle: any) {
  const dir = path.dirname(outPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const content =
    `/**\n` +
    ` * rioStage1SourceRows.ts\n` +
    ` *\n` +
    ` * Auto-generated fixture for tests.\n` +
    ` *\n` +
    ` * This file was generated by src/race-engine/scripts/generateRioFixtureFromBundle.ts\n` +
    ` * and contains the exact source rows exported by your source bundle.\n` +
    ` */\n\n` +
    `export const rioStage1SourceRows = ` +
    prettySerialize(bundle) +
    ` as const\n`

  fs.writeFileSync(outPath, content, { encoding: 'utf8' })
}

/**
 * main
 *
 * CLI entry point.
 *
 * @param argv - process.argv
 */
export async function main(argv: string[]) {
  const args = argv.slice(2)
  if (args.length < 2) {
    console.error(
      'Usage: node generateRioFixtureFromBundle.js <bundleModulePath> <outFilePath>',
    )
    process.exitCode = 2
    return
  }

  const [bundleModulePath, outFilePath] = args

  try {
    console.log('Loading bundle from:', bundleModulePath)
    const bundle = await findExportedBundle(bundleModulePath)
    console.log('Validating bundle...')
    validateBundle(bundle)

    console.log('Writing fixture to:', outFilePath)
    writeFixtureFile(outFilePath, bundle)

    console.log('Done.')
  } catch (err: any) {
    console.error('Error:', err && err.message ? err.message : String(err))
    process.exitCode = 1
  }
}

// If the script is executed directly, run main.
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main(process.argv)
}