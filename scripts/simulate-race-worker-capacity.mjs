import { simulateRaceWorkerCapacity } from "./lib/race-worker-capacity-model.mjs";
// Controlled illustrative scenario. NOT empirical throughput or validated
// game simulation. Replace synthetic service times with measured worker traces.
const stages=Array.from({length:96},(_,i)=>({
  id:`synthetic-stage-${i+1}`,
  startGameMinute:180+Math.floor(i/4)*60,
  workerServiceRealMinutes:i%8===0?12:7,
}));
const results=[2,12].map(gameSpeed=>{
  const {records,...summary}=simulateRaceWorkerCapacity({stages,gameSpeed,workerSlots:3});
  return summary;
});
console.log("SYNTHETIC race-worker admission model; not an actual race engine load test");
console.table(results);
