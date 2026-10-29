/**
 * Dedicated alternate game-engine rider physiology / gradient / drafting
 * proof. The baseline scripts remain separately protected and unchanged.
 */
import assert from 'node:assert/strict';
import {a3RiderProfileV3,a3GradientV3,a3DraftFractionV3,
 a3AttackStateV3,a3PerformanceIntentV3,a3EnergyStepV3}
 from './a3RiderPerformanceV3.mjs';
import {createDiscretePelotonV3,runDiscretePelotonV3}
 from './a3DiscreteCapacityPelotonV3.mjs';
assert.equal(a3RiderProfileV3(0).type,'climber');
assert.equal(a3RiderProfileV3(1).type,'sprinter');
assert(a3GradientV3('double',1250)>a3GradientV3('staged',1250));
assert(a3GradientV3('staged',800)>0);
assert(a3GradientV3('staged',980)<0);
const lead={id:'leader',phase:'two_lane',channel:0,x:1000};
const follower={id:'follower',phase:'two_lane',channel:0,x:994};
assert(a3DraftFractionV3(follower,lead)>0);
assert.equal(a3DraftFractionV3({...follower,channel:1},lead),0);
const climber={ordinal:0,phase:'two_lane',channel:0,x:1250,
 performance:a3RiderProfileV3(0),energyJ:21500};
const sprinter={...climber,ordinal:1,performance:a3RiderProfileV3(1)};
const uphill={layout:'double',performanceMode:'profiles_v1',
 attackScenario:'none',time:125};
const c=a3PerformanceIntentV3(uphill,climber,0);
const s=a3PerformanceIntentV3(uphill,sprinter,0);
assert(c.target>s.target,'climber must lose less speed uphill');
assert(a3PerformanceIntentV3(uphill,{...climber,energyJ:10000},0)
 .target<c.target,'fatigue must lower desired speed');
assert(a3PerformanceIntentV3(uphill,climber,.4).target>c.target,
 'drafting should help riding speed modestly');
const energyInput={speed:11,grade:.07,draft:0,attack:'none'};
assert(a3EnergyStepV3(climber,{...energyInput,draft:.4})>
 a3EnergyStepV3(climber,energyInput),
 'drafting must independently save energy');
assert(a3EnergyStepV3(climber,{...energyInput,grade:0})>
 a3EnergyStepV3(climber,energyInput),
 'hills must independently cost energy');
assert.equal(a3AttackStateV3({time:60,attackScenario:'leader_surge'},
 {...climber,phase:'wide'}),'none');
assert.equal(a3AttackStateV3({time:60,attackScenario:'leader_surge'},
 climber),'attacking');
const rows=[];
for(const n of [106,168])for(const layout of ['staged','double']){
 const base=createDiscretePelotonV3(n,{
  layout,roadWidthMode:'two_distinct_gates'});
 const f=createDiscretePelotonV3(n,{layout,
  roadWidthMode:'two_distinct_gates',performanceMode:'profiles_v1'});
 const untouched=JSON.stringify(f);
 const normal=runDiscretePelotonV3(base,{seconds:180});
 const result=runDiscretePelotonV3(f,{seconds:180});
 const e=result.evidence;
 const row={n,layout,seconds:e.acceptedSeconds,reason:e.rejection,
  detail:e.rejectionDetail,gates:e.firstGateAll&&e.secondGateAll,
  overtake:e.crossLaneOvertakes,groups:e.pelotonGroupCount,
  slopeRiders:e.peakClimbingRiders,maximumDrafting:e.peakDraftingRiders,
  energy:e.finalMeanEnergyJ,climber:e.finalMeanClimberEnergyJ,
  sprinter:e.finalMeanSprinterEnergyJ,minSpeed:e.minObservedSpeed,
  minSpacing:e.minObservedLaneGap,trace:e.traceHash,
  baselineTrace:normal.evidence.traceHash};
 console.log('A3_ATHLETE_FIELD '+JSON.stringify(row));
 rows.push(row);
 assert.equal(JSON.stringify(f),untouched);
 assert.equal(e.rejection,null,'profile game run rejected a collision');
 assert(e.all180Accepted,'profile game run failed continuous 180s');
 assert(e.firstGateAll&&e.secondGateAll);
 assert(e.peakClimbingRiders>0,'climbing grade not encountered');
 assert(e.peakDraftingRiders>0,'no drafting rider observed');
 assert(e.finalMeanEnergyJ<23000,'no exertion/fatigue energy cost');
 assert(e.minObservedSpeed>=6.5);
 assert(e.minObservedLaneGap>=1.85-1e-5);
 assert(e.crossLaneOvertakes>0);
 assert.notEqual(e.traceHash,normal.evidence.traceHash,
   'athlete abilities did not change race results');
 const repeat=runDiscretePelotonV3(f,{seconds:180});
 assert.deepEqual(repeat.physical,result.physical);
}
const attackRows=[];
for(const n of [106,168]){
 const f=createDiscretePelotonV3(n,{layout:'staged',
  roadWidthMode:'two_distinct_gates',
  performanceMode:'profiles_v1',attackScenario:'leader_surge'});
 const run=runDiscretePelotonV3(f,{seconds:180});
 const e=run.evidence;
 const record={n,seconds:e.acceptedSeconds,reason:e.rejection,
  activeAttackTicks:e.activeAttackTicks,groups:e.pelotonGroupCount,
  overtakes:e.crossLaneOvertakes,meanEnergy:e.finalMeanEnergyJ,
  minGap:e.minObservedLaneGap,trace:e.traceHash};
 console.log('A3_ATHLETE_ATTACK '+JSON.stringify(record));
 attackRows.push(record);
 assert.equal(e.rejection,null);
 assert(e.all180Accepted&&e.firstGateAll&&e.secondGateAll);
 assert(e.activeAttackTicks>200,'individual leader attack was not exercised');
 assert(e.minObservedSpeed>=6.5);
 assert(e.minObservedLaneGap>=1.85-1e-5);
}
const saved=createDiscretePelotonV3(32,{
 layout:'staged',roadWidthMode:'two_distinct_gates',
 performanceMode:'profiles_v1',attackScenario:'leader_surge'});
const continuous=runDiscretePelotonV3(saved,{seconds:180});
const a=runDiscretePelotonV3(saved,{seconds:90});
const b=runDiscretePelotonV3(saved,{seconds:90,checkpoint:
 structuredClone(a.physical)});
assert.equal(continuous.evidence.all180Accepted,true);
assert.deepEqual(b.physical,continuous.physical,
 'profile mode must restore complete energy and tactics state');
console.log('A3_ATHLETE_PROFILES_REPORT '+JSON.stringify({
 scenario:'PROFILES_CLIMB_DRAFT_FATIGUE_ATTACK',
 safe180Fields:rows.length,attackFields:attackRows.length,
 allSuccessful:true,originalEngineUntouched:true,
 gradeAndAbilitiesChangedRace:true,
 trueDraftEnergyDifference:true,fatigueSlowsRider:true,
 attacksIndividuallyObserved:true,checkpointReplay:true,
 originalDiscreteBaselineUntouched:true,
 liveRacesActivated:false,rows,attackRows}));
