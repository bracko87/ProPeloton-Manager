// Executable source and provenance checks for a candidate four-worker release.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const file = slug => readFileSync(`supabase/functions/${slug}/index.ts`,'utf8')
const sha='c1b46c39efd513932da65e4c331357f86b727412'
const [runner,pass1,pass2,safe]=['universal-race-stage-runner','universal-race-stage-pass1-resume','universal-race-stage-pass2-resume','universal-race-stage-safe-resume'].map(file)
for(const code of [runner,pass1,pass2,safe])assert.ok(code.includes(`const SOURCE_COMMIT = "${sha}"`))
for(const code of [runner,pass2]) {
 assert.ok(code.includes(`${sha}/src/universal-race-engine/runSelectedRaceEngineV1.ts`))
 assert.match(code,/runSelectedRaceEngineV1\(input/)
 assert.doesNotMatch(code,/const rawResult = runRaceEngine\(/)
}
assert.ok(pass1.includes(`${sha}/src/universal-race-engine/buildProductionRaceInputScenarioV1.ts`))
assert.ok(safe.includes(`${sha}/src/universal-race-engine/runSelectedRaceEngineV1.ts`))
assert.ok(safe.includes(`${sha}/src/universal-race-engine/mountainEngineLaneV1.ts`))
assert.match(safe,/selectedEngineLaneV1:engineLaneV1/)
assert.match(safe,/selectedEngineSourceCommit:effectiveSourceCommit/)
assert.match(safe,/text\(checkpoint.selectedEngineLaneV1\) === "experimental_mountain_v1"/)
assert.match(safe,/\? getSelectedRaceEngineModuleV1\(calculationInput.stage\)/)
for(const method of ['resolveRoadPhase1Opening','resolveRoadPhase2Development','resolveRoadPhase3Decisive','resolveRoadPhase4Finish','buildUniversalPhase5GroupingSummary','resolveUniversalFinishResolution','buildUniversalReplayTimeline','resolveUniversalPhase10Incidents','buildUniversalReplaySynchronizationSummary'])assert.ok(safe.includes(`selectedCore.${method}(`))
assert.match(safe,/primarySourceCommit:effectiveSourceCommit/)
const allowlist=readFileSync('src/universal-race-engine/mountainEnginePilotV1.ts','utf8')
for(const id of ['62c7ca62-b6aa-470f-bf32-0822f64849c0','9c329adc-ccbf-45cf-8b5f-5b07604b341a','0885f370-5082-4bbe-994f-3938f00b7b11'])assert.ok(allowlist.includes(id))
assert.match(allowlist,/stage.stageFormat === 'road_race'/)
assert.match(allowlist,/stage.terrainType === 'mountain'/)
console.log('PASS stage-scoped mountain pilot routing across all four workers')
