import { readFileSync } from "node:fs";
import { simulateRaceWorkerCapacity } from "./lib/race-worker-capacity-model.mjs";

const fixture=JSON.parse(readFileSync(new URL("./fixtures/race_worker_measured_20261024.json",import.meta.url),"utf8"));
const speeds=[2,12];
const result=speeds.map(gameSpeed=>{
 const {records,...metrics}=simulateRaceWorkerCapacity({stages:fixture.stages,gameSpeed,workerSlots:3});
 return metrics;
});
console.log("EMPIRICAL-TIMING WHAT-IF model, not a real game replay/CPU stress test.");
console.log(`Anonymized published stage samples: ${fixture.stages.length}; service interval: ${fixture.sourceMetric}`);
console.table(result);
console.log(JSON.stringify({source:fixture.description,assumptions:"3 independent worker slots, fixed measured calculation intervals, perfect worker handoff; excludes replay playback, DB queuing, event loops, unknown CPU limits",scenarios:result},null,2));
