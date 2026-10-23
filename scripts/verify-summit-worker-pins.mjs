// Fail closed if any production race execution path drifts to an old primary engine.
// The accepted emergency fallback is intentionally pinned separately; it is
// classified as degraded and must never pass summit-finish acceptance.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const RELEASE_SHA = '10dc6e7b7470f2c859a7019515a46708a5792024'
const prefix = 'https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/'
const workers = new Map([
  ['universal-race-stage-runner', [
    'runRaceEngine.ts',
    'runSelectedRaceEngineV1.ts',
    'buildProductionRaceInputScenarioV1.ts',
    'buildProductionRaceOutput.ts',
  ]],
  ['universal-race-stage-pass1-resume', [
    'buildProductionRaceInputScenarioV1.ts',
  ]],
  ['universal-race-stage-pass2-resume', [
    'runRaceEngine.ts',
    'runSelectedRaceEngineV1.ts',
    'buildProductionRaceInput.ts',
    'buildProductionRaceOutput.ts',
  ]],
  ['universal-race-stage-safe-resume', [
    'runRaceEngine.ts',
    'runSelectedRaceEngineV1.ts',
    'buildProductionRaceInput.ts',
    'buildProductionRaceOutput.ts',
  ]],
])

for (const [name, requiredPrimaryModules] of workers) {
  const source = readFileSync(
    join(ROOT, 'supabase/functions', name, 'index.ts'), 'utf8',
  )
  assert.ok(
    source.includes(`const SOURCE_COMMIT = "${RELEASE_SHA}"`),
    `${name}: source metadata does not match the summit release`,
  )
  for (const moduleName of requiredPrimaryModules) {
    const primaryName = moduleName === 'buildProductionRaceInputScenarioV1.ts'
      ? 'buildScenarioProductionUniversalRaceEngineInput'
      : moduleName === 'buildProductionRaceInput.ts'
        ? 'buildProductionUniversalRaceEngineInput as buildBaseInput'
        : moduleName === 'runSelectedRaceEngineV1.ts'
          ? (name === 'universal-race-stage-safe-resume' ? 'getSelectedRaceEngineModuleV1' : 'runSelectedRaceEngineV1')
        : moduleName === 'buildProductionRaceOutput.ts'
          ? 'buildProductionUniversalRaceOutput'
          : 'runRaceEngine'
    const lines = source.split('\n')
    const primaryUrl = `${prefix}${RELEASE_SHA}/src/universal-race-engine/${moduleName}`
    assert.ok(
      lines.some((line) => line.includes(primaryUrl)) &&
      source.includes(primaryName),
      `${name}: missing pinned primary module ${moduleName}`,
    )
  }
  if (name === 'universal-race-stage-safe-resume') {
    assert.ok(source.includes('selectCompleteRaceEngineLaneV1'), 'Safe Resume must dispatch the complete three-way stage selector')
  }
  if (name === 'universal-race-stage-pass2-resume') {
    assert.ok(source.includes('7e4299371f452e5d1d0a706e48fb083340362d11'), 'legacy fallback engine changed')
    assert.ok(source.includes('38fec7814395d77331ae255d1b9203edba0142c7'), 'legacy fallback adapter changed')
  }
  if (name === 'universal-race-stage-runner') {
    assert.ok(source.includes('90fc6ce06197f4537b6088d30252b60025f39253'), 'legacy fallback changed')
  }
  console.log(`PASS ${name}: pinned primary engine source ${RELEASE_SHA}`)
}

const inputBuilder = readFileSync(
  join(ROOT, 'src/universal-race-engine/buildProductionRaceInput.ts'), 'utf8',
)
assert.match(inputBuilder, /summitFinishSelectivityV1:/)
assert.match(inputBuilder, /terrainType === 'mountain'/)
const engine = readFileSync(join(ROOT, 'src/universal-race-engine/runRaceEngine.ts'), 'utf8')
assert.match(engine, /frontSummitDetachedByRiderId/)
assert.match(engine, /allowTransitiveMerging/)
console.log('PASS accepted summit flag and physical finish-group implementation exist')

// This verifies repository source only. After actual Supabase deployment, inspect
// each deployed function source/version; passing this script alone is not release proof.
