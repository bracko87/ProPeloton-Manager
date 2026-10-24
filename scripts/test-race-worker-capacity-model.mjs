import assert from "node:assert/strict";
import { test } from "node:test";
import { simulateRaceWorkerCapacity } from "../scripts/lib/race-worker-capacity-model.mjs";
const stages=Array.from({length:96},(_,i)=>({
  id:`test-${i}`,startGameMinute:180+Math.floor(i/4)*60,
  workerServiceRealMinutes:i%8===0?12:7,
}));
test("same in-game schedule creates more admission pressure at 12x than 2x",()=>{
 const a=simulateRaceWorkerCapacity({stages,gameSpeed:12,workerSlots:3});
 const b=simulateRaceWorkerCapacity({stages,gameSpeed:2,workerSlots:3});
 assert.equal(a.total,96);assert.equal(b.total,96);
 assert.ok(a.latePublication>b.latePublication);
 assert.ok(a.queueP95Minutes>b.queueP95Minutes);
});
test("does not claim a real load test and preserves all work items",()=>{
 const a=simulateRaceWorkerCapacity({stages,gameSpeed:12,workerSlots:3});
 assert.equal(new Set(a.records.map(x=>x.id)).size,96);
 assert.ok(a.records.every(x=>x.worker>=0&&x.worker<3));
});
test("empty queue and invalid inputs are well-defined",()=>{
 const empty=simulateRaceWorkerCapacity({stages:[],gameSpeed:2});
 assert.equal(empty.total,0);assert.equal(empty.queueP95Minutes,0);
 assert.throws(()=>simulateRaceWorkerCapacity({stages,gameSpeed:0}),/Invalid scenario/);
 assert.throws(()=>simulateRaceWorkerCapacity({stages,gameSpeed:2,workerSlots:0}),/Invalid worker slots/);
});
