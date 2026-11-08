// Stage-scoped production worker routing, exact pin and resume continuity
// checks. These assertions describe the current deployed architecture, unlike
// the original 2026-09 assumptions that expected one source SHA everywhere.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import './verify-v1-clock-production-rollout.mjs'

const read = slug => readFileSync(`supabase/functions/${slug}/index.ts`, 'utf8')
const runner = read('universal-race-stage-runner')
const pass1 = read('universal-race-stage-pass1-resume')
const pass2 = read('universal-race-stage-pass2-resume')
const safe = read('universal-race-stage-safe-resume')
const selector = '7bb8cffa1631077d893f60ae0d10bbde3803b751'
const clockCommit = '92de26698126e646f6ecc4ae74455bfc831e66c2'
for (const [name, code] of [['runner', runner], ['pass2', pass2]]) {
  assert.ok(code.includes(`${selector}/src/universal-race-engine/runSelectedRaceEngineV1.ts`))
  assert.match(code, /runSelectedRaceEngineV1\(input/)
  assert.match(code, /runCorrectedFlatBaselineRaceEngine\(input/)
  assert.match(code, /runCorrectedMountainPilotRaceEngine\(input/)
  assert.match(code, /runBreakawayPilotRaceEngine\(input/)
  assert.ok(code.includes(`const SOURCE_COMMIT = "${clockCommit}";`))
  assert.ok(code.includes('MANDATORY_OCTOBER_MOUNTAIN_PILOT_IDS.has(stageId)'))
  assert.ok(code.includes('MANDATORY_BREAKAWAY_PILOT_IDS.has(stageId)'))
  assert.ok(code.includes('Breakaway V1 replay synchronization failed: refusing degraded official publication.'))
}
assert.match(pass1, /buildScenarioProductionUniversalRaceEngineInput/)
assert.ok(safe.includes('selectMountainEngineLaneV1'))
assert.ok(safe.includes('isBreakawayOfficialPilotStageV1'))
assert.match(safe, /selectedEngineLaneV1:engineLaneV1/)
assert.match(safe, /selectedEngineSourceCommit:effectiveSourceCommit/)
assert.match(safe, /const savedLane=text\(checkpoint.selectedEngineLaneV1\)/)
assert.match(safe, /const savedEngineSourceCommit=text\(checkpoint.selectedEngineSourceCommit\)/)
assert.match(safe, /savedEngineSourceCommit === PROSPECTIVE_CLOCK_SOURCE_COMMIT/)
assert.match(safe, /savedEngineSourceCommit === REVIEWED_NEXT_STAGE_SOURCE_COMMIT/)
assert.match(safe, /engineLaneV1 === "baseline_universal"/)
for (const method of [
  'resolveRoadPhase1Opening','resolveRoadPhase2Development',
  'resolveRoadPhase3Decisive','resolveRoadPhase4Finish',
  'buildUniversalPhase5GroupingSummary','resolveUniversalFinishResolution',
  'reconcileReplayTimelineIntermediatePointsV1','resolveUniversalPhase10Incidents',
  'buildUniversalReplaySynchronizationSummary',
]) assert.ok(safe.includes(`selectedCore.${method}(`), method)
assert.match(safe, /primarySourceCommit:effectiveSourceCommit/)
assert.match(safe, /replayCore\.buildUniversalReplayTimeline\(/)

const safeStep = safe.slice(safe.indexOf('async function executeStep('))
const stepZeroStart = safeStep.indexOf('if(step===0){', safeStep.indexOf('let engineLaneV1:'))
const stepZeroEnd = safeStep.indexOf('} else {', stepZeroStart)
const stepZero = safeStep.slice(stepZeroStart, stepZeroEnd)
const stageLoaded = stepZero.indexOf('input=built.input;')
const selection = stepZero.indexOf('engineLaneV1=isBreakawayOfficialPilotStageV1(input.stage)')
const executable = stepZero.indexOf('selectedCore=engineLaneV1 === "experimental_breakaway_v1"')
const phase9 = stepZero.indexOf('phase9Modifiers=selectedCore.buildUniversalPhase9ModifierSummary(input);')
assert.ok(stageLoaded>=0 && stageLoaded<selection && selection<executable && executable<phase9,
  'Safe Resume must select stage-scoped engine before Phase 9')
const resume = safeStep.slice(stepZeroEnd,safeStep.indexOf('const effectiveSourceCommit ='))
assert.match(resume,/const savedLane=text\(checkpoint.selectedEngineLaneV1\)/)
assert.match(resume,/savedEngineSourceCommit === PROSPECTIVE_CLOCK_SOURCE_COMMIT/)
assert.match(resume,/!input \|\| !calculationInput \|\| !phase9Modifiers/)
console.log('PASS safe-resume stage-scoped source + historical checkpoint continuity')

// Don't accidentally change race input generation while repinning stage execution.
const builder = readFileSync('src/universal-race-engine/buildProductionRaceInput.ts')
const blobHash = createHash('sha1')
  .update(Buffer.concat([Buffer.from(`blob ${builder.byteLength}\0`),builder]))
  .digest('hex')
assert.equal(blobHash, 'f520ab08d05dc406918d34295d02ca6ef1f53cb2')

const mountainAllowlist = readFileSync('src/universal-race-engine/mountainEnginePilotV1.ts','utf8')
for(const id of ['62c7ca62-b6aa-470f-bf32-0822f64849c0','9c329adc-ccbf-45cf-8b5f-5b07604b341a','0885f370-5082-4bbe-994f-3938f00b7b11']) {
  assert.ok(mountainAllowlist.includes(id))
}
assert.match(mountainAllowlist,/stage.stageFormat === 'road_race'/)
assert.match(mountainAllowlist,/stage.terrainType === 'mountain'/)

const approvedBreakaway = readFileSync('src/universal-race-engine/breakawayOfficialPilotV1.ts','utf8')
for(const id of ['5523cf76-8fd4-4a12-ab28-7f285c9829ff','335708f7-d56a-4816-9068-38399e8f74e3','7f69e552-b116-453c-bf55-16ef655ea021']){
  assert.ok(approvedBreakaway.includes(id))
  for(const code of [runner,pass2,safe]) assert.ok(code.includes(id))
}
assert.doesNotMatch(approvedBreakaway,/f5af8665-91c1-4585-937e-11fb94f65819/)
assert.match(safe, /Mandatory Breakaway V1 pilot engine mismatch: safe resume refused baseline/)
console.log('PASS approved pilot routing and unchanged baseline input builder')
