// Executable source and provenance checks for a candidate four-worker release.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const file = slug => readFileSync(`supabase/functions/${slug}/index.ts`,'utf8')
const sha='10dc6e7b7470f2c859a7019515a46708a5792024'
const [runner,pass1,pass2,safe]=['universal-race-stage-runner','universal-race-stage-pass1-resume','universal-race-stage-pass2-resume','universal-race-stage-safe-resume'].map(file)
for(const code of [runner,pass1,pass2,safe])assert.ok(code.includes(`const SOURCE_COMMIT = "${sha}"`))
for(const code of [runner,pass2]) {
 assert.ok(code.includes(`${sha}/src/universal-race-engine/runSelectedRaceEngineV1.ts`))
 assert.match(code,/runSelectedRaceEngineV1\(input/)
 assert.doesNotMatch(code,/const rawResult = runRaceEngine\(/)
}
assert.ok(pass1.includes(`${sha}/src/universal-race-engine/buildProductionRaceInputScenarioV1.ts`))
assert.ok(safe.includes(`${sha}/src/universal-race-engine/runSelectedRaceEngineV1.ts`))
assert.match(safe,/selectCompleteRaceEngineLaneV1/)
assert.match(safe,/selectedEngineLaneV1:engineLaneV1/)
assert.match(safe,/selectedEngineSourceCommit:effectiveSourceCommit/)
assert.match(safe,/savedLane === "experimental_breakaway_v1"/)
assert.match(safe,/\? getSelectedRaceEngineModuleV1\(calculationInput.stage\)/)
for(const method of ['resolveRoadPhase1Opening','resolveRoadPhase2Development','resolveRoadPhase3Decisive','resolveRoadPhase4Finish','buildUniversalPhase5GroupingSummary','resolveUniversalFinishResolution','buildUniversalReplayTimeline','resolveUniversalPhase10Incidents','buildUniversalReplaySynchronizationSummary'])assert.ok(safe.includes(`selectedCore.${method}(`))
assert.match(safe,/primarySourceCommit:effectiveSourceCommit/)
const allowlist=readFileSync('src/universal-race-engine/mountainEnginePilotV1.ts','utf8')
for(const id of ['62c7ca62-b6aa-470f-bf32-0822f64849c0','9c329adc-ccbf-45cf-8b5f-5b07604b341a','0885f370-5082-4bbe-994f-3938f00b7b11'])assert.ok(allowlist.includes(id))
assert.match(allowlist,/stage.stageFormat === 'road_race'/)
assert.match(allowlist,/stage.terrainType === 'mountain'/)
console.log('PASS stage-scoped mountain pilot routing across all four workers')

// Fail closed if this rollout changes any pre-existing baseline input behavior.
const builder = readFileSync('src/universal-race-engine/buildProductionRaceInput.ts')
const baselineBlobHash = createHash('sha1')
  .update(Buffer.concat([Buffer.from(`blob ${builder.byteLength}\0`),builder]))
  .digest('hex')
assert.equal(baselineBlobHash, 'f520ab08d05dc406918d34295d02ca6ef1f53cb2',
  'Pre-existing baseline race input builder must remain byte-for-byte unchanged')

/**
 * Production incident 2026-10-22: using selectedCore in Phase 9 before it was
 * initialized caused ALL baseline Safe Resume calculations to fail. Require
 * stage-scoped module assignment before the FIRST phase-9 engine call.
 */
const safeStep = safe.slice(safe.indexOf('async function executeStep('))
const stepZeroStart = safeStep.indexOf('if(step===0){', safeStep.indexOf('let engineLaneV1:'))
const stepZeroEnd = safeStep.indexOf('} else {', stepZeroStart)
const stepZero = safeStep.slice(stepZeroStart, stepZeroEnd)
const stageLoaded = stepZero.indexOf('input=built.input;')
const selection = stepZero.indexOf('engineLaneV1=selectCompleteRaceEngineLaneV1(input.stage);')
const executable = stepZero.indexOf('selectedCore=engineLaneV1 !== "baseline_universal"')
const phase9 = stepZero.indexOf('phase9Modifiers=selectedCore.buildUniversalPhase9ModifierSummary(input);')
const phase9Application = stepZero.indexOf('calculationInput=selectedCore.applyUniversalPhase9ModifiersToInput(input,phase9Modifiers);')
assert.ok(
  stageLoaded>=0 && stageLoaded<selection && selection<executable &&
  executable<phase9 && phase9<phase9Application,
  'Safe Resume Phase 9 must select/initialize stage engine BEFORE first use'
)
const resume = safeStep.slice(stepZeroEnd,safeStep.indexOf('const effectiveSourceCommit ='))
assert.match(resume,/const savedLane=text\(checkpoint.selectedEngineLaneV1\)/)
assert.match(resume,/selectedCore=engineLaneV1 !== "baseline_universal"/)
assert.match(resume,/!input \|\| !calculationInput \|\| !phase9Modifiers/)
console.log('PASS safe-resume pilot/baseline engine initialized before Phase 9')

// Exactly two user-approved official breakaway releases; Danube remains shadow-only.
const officialPilot=readFileSync('src/universal-race-engine/breakawayOfficialPilotV1.ts','utf8')
assert.match(officialPilot,/5523cf76-8fd4-4a12-ab28-7f285c9829ff/)
assert.match(officialPilot,/335708f7-d56a-4816-9068-38399e8f74e3/)
assert.doesNotMatch(officialPilot,/f5af8665-91c1-4585-937e-11fb94f65819/)
assert.match(safe,/Saved experimental engine lane no longer matches its stage/)
assert.match(safe,/Mandatory Breakaway V1 pilot cannot resume on baseline/)
assert.match(safe,/Breakaway V1 checkpoint source commit does not match deployed release/)
assert.match(safe,/selectedEngineLaneV1:engineLaneV1/)
assert.match(runner,/Mandatory Breakaway V1 pilot cannot publish baseline fallback/)
assert.match(pass2,/Mandatory Breakaway V1 pilot cannot publish baseline fallback/)
assert.match(runner,/selectedEngineLaneV1: !useFallback/)
assert.match(pass2,/selectedEngineLaneV1: !useFallback/)
console.log('PASS experimental breakaway pilot has isolated stage source and safe resume lane')
