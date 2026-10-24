import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
const worker=readFileSync(new URL("../supabase/functions/universal-race-stage-safe-resume/index.ts",import.meta.url),"utf8");
const mountain="ef5f0d4f2a91be80834140fbda977b5da614908b";
const previousMountain="726682eaf58385c4d60a9b664d2b9696b8cfc1a0";
const flat="fa93be2b6e4d8aeb4200caa3dcf82a1b4dcb8cf2";

test("staging matches the protected live version 74 mountain and flat engine pins",()=>{
  assert.ok(worker.includes(`const OPTIMIZED_MOUNTAIN_SOURCE_COMMIT = "${mountain}";`));
  assert.ok(worker.includes(`const PREVIOUS_OPTIMIZED_MOUNTAIN_SOURCE_COMMIT = "${previousMountain}";`));
  assert.ok(worker.includes(`const FLAT_BASELINE_SOURCE_COMMIT = "${flat}";`));
  assert.match(worker,/import \* as correctedFlatBaselineCore/);
  assert.match(worker,/import \* as optimizedMountainCore/);
  assert.match(worker,/import \* as previousOptimizedMountainCore/);
  assert.match(worker,/MANDATORY_OCTOBER_MOUNTAIN_PILOT_IDS/);
  assert.match(worker,/mountainReplayOptimizationSourceCommit: OPTIMIZED_MOUNTAIN_SOURCE_COMMIT/);
});

test("in-flight mountain calculations honor their saved physics source commit",()=>{
  assert.match(worker,/savedEngineSourceCommit === OPTIMIZED_MOUNTAIN_SOURCE_COMMIT/);
  assert.match(worker,/savedEngineSourceCommit === PREVIOUS_OPTIMIZED_MOUNTAIN_SOURCE_COMMIT/);
  assert.match(worker,/savedEngineSourceCommit === FLAT_BASELINE_SOURCE_COMMIT/);
  assert.match(worker,/previousOptimizedMountainCore/);
  assert.match(worker,/MANDATORY_BREAKAWAY_PILOT_IDS/);
});

test("baseline and breakaway engine lanes retain source-specific routing",()=>{
  assert.match(worker,/import \* as calibratedBaselineCore/);
  assert.match(worker,/import \* as calibratedBreakawayCore/);
  assert.match(worker,/import \* as correctedFlatBaselineCore/);
  assert.match(worker,/\? optimizedMountainCore : correctedFlatBaselineCore/);
  assert.match(worker,/\? calibratedBreakawayCore : breakawayPilotCore/);
});

test("reliability enhancements remain additive and output v2 stays opt-in",()=>{
  assert.match(worker,/writeIdempotentChunkWithRetry/);
  assert.match(worker,/planReplayNormalizationWindow/);
  assert.match(worker,/Deno\.env\.get\("PPM_PERSISTENT_RACE_OUTPUT_V2"\)==="enabled"/);
  assert.match(worker,/\? "universal_race_stage_submit_persistent_output_v2"/);
  assert.match(worker,/: "universal_race_stage_submit_chunked_calculation_v1"/);
});
