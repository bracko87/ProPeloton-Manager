import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
const source=readFileSync(new URL("../supabase/functions/universal-race-stage-safe-resume/index.ts",import.meta.url),"utf8");
const calibrated="726682eaf58385c4d60a9b664d2b9696b8cfc1a0";

test("staged reliability inherits the verified mountain source pin",()=>{
 assert.match(source,/import \* as optimizedMountainCore/);
 assert.ok(source.includes(`const OPTIMIZED_MOUNTAIN_SOURCE_COMMIT = "${calibrated}";`));
 assert.match(source,/mountainReplayOptimizationSourceCommit: OPTIMIZED_MOUNTAIN_SOURCE_COMMIT/);
 assert.match(source,/\? optimizedMountainCore : calibratedBaselineCore/);
});
test("in-flight races retain the selected lane, not the latest default",()=>{
 assert.match(source,/savedEngineSourceCommit/);
 assert.match(source,/savedEngineSourceCommit === OPTIMIZED_MOUNTAIN_SOURCE_COMMIT/);
 assert.match(source,/\? optimizedMountainCore : getSelectedRaceEngineModuleV1\(calculationInput\.stage\)/);
 assert.match(source,/MANDATORY_BREAKAWAY_PILOT_IDS/);
});
test("baseline and breakaway source selection are not downgraded",()=>{
 assert.match(source,/import \* as calibratedBaselineCore/);
 assert.match(source,/import \* as calibratedBreakawayCore/);
 assert.ok(source.includes(`const CALIBRATED_ROAD_SOURCE_COMMIT = "${calibrated}";`));
 assert.match(source,/\? calibratedBreakawayCore : breakawayPilotCore/);
});
test("new upload protocol requires explicit enablement",()=>{
 assert.match(source,/PPM_PERSISTENT_RACE_OUTPUT_V2/);
 assert.match(source,/\? "universal_race_stage_submit_persistent_output_v2"/);
 assert.match(source,/: "universal_race_stage_submit_chunked_calculation_v1"/);
});
