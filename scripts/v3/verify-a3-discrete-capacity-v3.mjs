import assert from 'node:assert/strict';
import {createDiscretePelotonV3,advanceDiscretePelotonV3,
 runDiscretePelotonV3} from './a3DiscreteCapacityPelotonV3.mjs';
const report=[];
for(const n of [106,168])for(const layout of ['staged','double']){
 const f=createDiscretePelotonV3(n,{layout});
 const input=JSON.stringify(f);
 const a=runDiscretePelotonV3(f,{seconds:180});
 const e=a.evidence;
 report.push({n,layout,accepted:e.acceptedSeconds,rejection:e.rejection,
  detail:e.rejectionDetail,first:e.firstGateAll,second:e.secondGateAll,
  overtakes:e.crossLaneOvertakes,minGap:e.minObservedLaneGap,
  minSpeed:e.minObservedSpeed,groups:e.pelotonGroupCount,
  sha256:e.traceHash});
 console.log('POC_FIELD '+JSON.stringify(report.at(-1)));
 assert.equal(JSON.stringify(f),input,'source fixture mutated');
 assert.equal(e.rejection,null,'capacity movement rejected');
 assert.equal(e.all180Accepted,true,'did not complete 180s');
 assert.equal(e.firstGateAll,true,'did not clear first pinch');
 assert.equal(e.secondGateAll,true,'did not clear second pinch');
 assert(e.minObservedLaneGap>=1.85-1e-5,
  'discrete same-channel bike occupancy overlap');
 assert(e.minObservedSpeed>=6.5,'moving-floor failure');
 assert(e.crossLaneOvertakes>0,'no genuine cross-lane order reversal');
 assert.equal(e.noProductionWrites,true);
 const second=runDiscretePelotonV3(f,{seconds:180});
 assert.equal(second.evidence.traceHash,e.traceHash,
  'non-deterministic replay');
 assert.deepEqual(second.physical,a.physical);
}
const f=createDiscretePelotonV3(32,{layout:'double'});
const all=runDiscretePelotonV3(f,{seconds:180});
const part=runDiscretePelotonV3(f,{seconds:90});
const rest=runDiscretePelotonV3(f,{seconds:90,
 checkpoint:structuredClone(part.physical)});
assert.deepEqual(rest.physical,all.physical,
 'saved checkpoint 90+90 must equal continuous 180');
const breakup=createDiscretePelotonV3(24,{
 scenario:'breakaway',layout:'double'});
const split=runDiscretePelotonV3(breakup,{seconds:180});
console.log('POC_BREAKAWAY '+JSON.stringify({
 accepted:split.evidence.acceptedSeconds,rejection:split.evidence.rejection,
 split:split.evidence.splitSeen,rejoin:split.evidence.rejoinSeen,
 events:split.evidence.splitEvents,groups:split.evidence.pelotonGroupCount,
 safetyGap:split.evidence.minObservedLaneGap}));
assert.equal(split.evidence.all180Accepted,true);
assert.equal(split.evidence.splitSeen,true);
assert.equal(split.evidence.rejoinSeen,true);
assert.equal(split.evidence.noProductionWrites,true);
assert.throws(()=>createDiscretePelotonV3(169));
assert.throws(()=>advanceDiscretePelotonV3({
 ...f,reason:'PREVIOUS_REJECTION'}));
console.log('DISCRETE_CAPACITY_POC_REPORT '+JSON.stringify({
 kind:'RESEARCH_ONLY_ABSTRACT_ATOMIC_LANE_HANDOFF',
 allFieldsPassed:true,caseCount:report.length,
 full180BothNarrowings:true,
 laneOccupancySafe:true,minimumAchievedSpeed6_5:true,
 actualCrossLaneOvertakes:true,breakawaySplitRejoin:true,
 deterministicReplay:true,checkpointReplay:true,
 originalA64AndLiveEngineUntouched:true,
 notCentimeterLevelLateralPhysics:true,report}));
