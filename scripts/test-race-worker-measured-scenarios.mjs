import {test} from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { simulateRaceWorkerCapacity } from "../scripts/lib/race-worker-capacity-model.mjs";
const fixture=JSON.parse(readFileSync(new URL("../scripts/fixtures/race_worker_measured_20261024.json",import.meta.url),"utf8"));
test("measured scenario contains anonymized valid real elapsed calculation intervals",()=>{
 assert.equal(fixture.clockSpeedAtCapture,12);
 assert.equal(fixture.stages.length,88);
 assert.ok(fixture.stages.every(s=>s.startGameMinute>=0 && s.workerServiceRealMinutes>0 && s.workerServiceRealMinutes<15));
 assert.ok(fixture.stages.every(s=>/^sample-\d+$/.test(s.id)));
 assert.doesNotMatch(JSON.stringify(fixture),/rider_id|club_id|simulation_run_id/);
});
test("same measured calculations run under 2x and 12x schedules without pretending to measure CPU",()=>{
 const two=simulateRaceWorkerCapacity({stages:fixture.stages,gameSpeed:2,workerSlots:3});
 const twelve=simulateRaceWorkerCapacity({stages:fixture.stages,gameSpeed:12,workerSlots:3});
 assert.equal(two.total,88);assert.equal(twelve.total,88);
 assert.ok(twelve.queueP95Minutes>=two.queueP95Minutes);
 assert.ok(twelve.latePublication>=two.latePublication);
 assert.ok(two.records.every(s=>s.finish>=s.start));
 assert.ok(twelve.records.every(s=>s.finish>=s.start));
});
