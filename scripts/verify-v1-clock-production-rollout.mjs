import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const sha = '92de26698126e646f6ecc4ae74455bfc831e66c2'
const url = (file) => `https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/${sha}/src/universal-race-engine/${file}`
const read = (slug) => readFileSync(`supabase/functions/${slug}/index.ts`, 'utf8')
const runner = read('universal-race-stage-runner')
const pass2 = read('universal-race-stage-pass2-resume')
const safe = read('universal-race-stage-safe-resume')
const pass1 = read('universal-race-stage-pass1-resume')

for (const [name, source] of [['runner', runner], ['pass2', pass2]]) {
  assert.ok(source.includes(url('runRaceEngine.ts')))
  assert.ok(source.includes(url('runMountainExperimentalEngineV1.ts')))
  assert.ok(source.includes(url('runBreakawayExperimentalEngineV1.ts')))
  assert.ok(source.includes(`const SOURCE_COMMIT = "${sha}";`))
  assert.ok(source.includes(`const FLAT_BASELINE_SOURCE_COMMIT = "${sha}";`))
  assert.ok(source.includes(`const MOUNTAIN_PILOT_SOURCE_COMMIT = "${sha}";`))
  assert.match(source, /Mandatory Breakaway V1 pilot cannot publish baseline fallback/)
  assert.match(source, /Breakaway V1 replay synchronization failed: refusing degraded official publication/)
  assert.ok(source.includes('7bb8cffa1631077d893f60ae0d10bbde3803b751/src/universal-race-engine/runSelectedRaceEngineV1.ts'))
  console.log('PASS', name, 'prospective clock-fix engine pin and fallback guard')
}
for (const file of ['runRaceEngine.ts', 'runMountainExperimentalEngineV1.ts', 'runBreakawayExperimentalEngineV1.ts']) {
  assert.ok(safe.includes(url(file)))
}
assert.ok(safe.includes(`const PROSPECTIVE_CLOCK_SOURCE_COMMIT = "${sha}";`))
assert.ok(safe.includes('selectedCore=savedEngineSourceCommit === PROSPECTIVE_CLOCK_SOURCE_COMMIT'))
assert.ok(safe.includes('const effectiveSourceCommit = step === 0'))
assert.ok(safe.includes('? PROSPECTIVE_CLOCK_SOURCE_COMMIT'))
// Historical in-flight stages must continue on their original, immutable engine.
for (const oldSha of [
  '8db593c61bfe0193d281a116a0028d47b54dfee7',
  'ef5f0d4f2a91be80834140fbda977b5da614908b',
  '726682eaf58385c4d60a9b664d2b9696b8cfc1a0',
]) assert.ok(safe.includes(oldSha), `Missing historical safe-resume pin ${oldSha}`)
assert.match(safe, /savedEngineSourceCommit === FLAT_BASELINE_SOURCE_COMMIT/)
assert.match(safe, /savedEngineSourceCommit === OPTIMIZED_MOUNTAIN_SOURCE_COMMIT/)
assert.match(safe, /savedEngineSourceCommit === CALIBRATED_ROAD_SOURCE_COMMIT/)
assert.ok(safe.includes('PROSPECTIVE_CLOCK_SOURCE_COMMIT, OPTIMIZED_MOUNTAIN_SOURCE_COMMIT, PREVIOUS_OPTIMIZED_MOUNTAIN_SOURCE_COMMIT'))
assert.ok(safe.includes('CALIBRATED_ROAD_SOURCE_COMMIT, PROSPECTIVE_CLOCK_SOURCE_COMMIT'))
assert.ok(pass1.includes('878aa8ae0db95d97fa5385513d2c1394e3a791a2/src/universal-race-engine/buildProductionRaceInputScenarioV1.ts'))
console.log('PASS safe-resume prospective-only switch, historical recovery, pass1 unchanged')
