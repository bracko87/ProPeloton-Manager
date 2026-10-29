/** V3 Step85: physically checked receding-horizon group-throughput guard.
 *
 * A proposal which avoids a swept collision by making a peloton stop is
 * NOT sporting success. Analyze only actually A64-swept preview fields,
 * penalize moving shockwaves, and optionally reject ALL proposals that
 * create a near-stop. No predicted state is ever committed.
 */
import {step80ClearanceRiskV3} from './a2Step80RecedingHorizonV3.mjs'
const DT=.5,EPS=1e-7;
const finite=Number.isFinite,q=x=>Math.round(x*1e5)/1e5;
function validate(s){
 if(!s||!Array.isArray(s.states)||s.states.length<2||
  s.states.length>168||!finite(s.at)||!finite(s.nearStops)||
  !finite(s.cumulativeAdvancement)||!Number.isInteger(s.acceptedSteps))
 throw Error('A85 invalid actual physical field');
}
function physicalStep(previous,plan,solver){
 if(!plan||typeof plan.policy!=='string'||!plan.policy||
  !Array.isArray(plan.requests)||plan.requests.length!==previous.states.length)
 throw Error('A85 invalid simultaneous plan');
 const input=structuredClone(previous);
 for(let i=0;i<input.states.length;i++){
  const s=input.states[i],r=plan.requests[i];
  if(!r||r.id!==s.id||![r.speed,r.targetY].every(finite)||
   r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
   throw Error('A85 invalid rider command');
  s.desired=r.speed;s.targetY=r.targetY;
 }
 const result=solver(input);
 const accepted=result?.reason===null&&
  result.acceptedSteps===previous.acceptedSteps+1&&
  Math.abs(result.at-previous.at-DT)<EPS&&
  result.states?.length===previous.states.length;
 if(!accepted)return {accepted:false,result};
 const near=result.nearStops-previous.nearStops;
 if(!finite(near)||near<0)throw Error('A85 corrupt near-stop accounting');
 return {accepted:true,result,near};
}
/** Measurements are exclusively achieved post-sweep physical outcomes.
 * All body position and velocity results come from A64, never commands.
 */
export function step85ThroughputMetricsV3(previous,actual,{
 movingFloorMps=6.5
}={}){
 validate(previous);validate(actual);
 if(previous.states.length!==actual.states.length||
 !finite(movingFloorMps)||movingFloorMps<3||movingFloorMps>12)
 throw Error('A85 invalid compare field');
 const vs=actual.states.map(s=>s.v).sort((a,b)=>a-b);
 if(vs.some(v=>!finite(v)||v<0))throw Error('A85 invalid swept speed');
 let slowdown=0,brakingShock=0;
 for(let i=0;i<vs.length;i++){
  const old=previous.states[i],s=actual.states[i];
  if(old.id!==s.id)throw Error('A85 rider identity mismatch');
  const dv=Math.max(0,old.v-s.v);
  brakingShock+=dv;
  if(dv>.22)slowdown++;
 }
 return {stoppedRiderTicks:actual.nearStops-previous.nearStops,
  belowMovingFloor:vs.filter(v=>v<movingFloorMps).length,
  lowestDecileSpeedMps:q(vs[Math.floor((vs.length-1)*.1)]),
  meanSpeedMps:q(vs.reduce((a,b)=>a+b,0)/vs.length),
  brakedRiders:slowdown,aggregateBrakingMps:q(brakingShock),
  allRidersMoving:vs.every(v=>v>=movingFloorMps),
  netProgressM:q(actual.cumulativeAdvancement-previous.cumulativeAdvancement)};
}
function rank(record,clearanceFirst=false){
 if(clearanceFirst)return [
   record.fullHorizon?1:0,
   -record.nearStops,
   -record.highRiskSlowCount,
   -record.clearanceRisk,
   record.minimumDecile,
   -record.brakingShock,
   record.advance
 ];
 return [
   record.fullHorizon?1:0,
   -record.nearStops,
   -record.highRiskSlowCount,
   record.minimumDecile,
   -record.brakingShock,
   -record.clearanceRisk,
   record.advance
 ];
}
/** Bounded physical continuations. Reject illegal or mass-braking motions;
 * choose only legal first requests. The caller always re-sweeps selected
 * first movement on real (possibly mirrored) authoritative field.
 */
export function chooseThroughputGuardedTickV3(previous,firstPlans,
 makeFuture,advancePhysical,{
 depth=3,maxFirst=5,maxFuture=3,
 minimumMovingSpeedMps=6.5,
 strictNoNearStops=true,clearanceFirst=false
}={}){
 validate(previous);
 if(!Array.isArray(firstPlans)||!firstPlans.length||
 firstPlans.length>8||![2,3].includes(depth)||
 !Number.isInteger(maxFirst)||maxFirst<1||maxFirst>6||
 !Number.isInteger(maxFuture)||maxFuture<1||maxFuture>3||
 typeof makeFuture!=='function'||typeof advancePhysical!=='function'||
 !finite(minimumMovingSpeedMps)||minimumMovingSpeedMps<3||
 minimumMovingSpeedMps>12||typeof strictNoNearStops!=='boolean'||
 typeof clearanceFirst!=='boolean')
 throw Error('A85 invalid search budget');
 let best=null,firstRejected=null,blockedNearStops=0;
 const evidence=[];
 for(const plan of firstPlans.slice(0,maxFirst)){
  const first=physicalStep(previous,plan,advancePhysical);
  if(!first.accepted){
   if(!firstRejected)firstRejected=first.result;
   evidence.push({policy:plan.policy,physicallyAccepted:false,
    acceptedFutureSteps:0,reason:first.result?.reason??'NO_PHYSICAL_STEP'});
   continue;
  }
  const metric=step85ThroughputMetricsV3(previous,first.result,{
   movingFloorMps:minimumMovingSpeedMps});
  if(strictNoNearStops&&metric.stoppedRiderTicks>0){
   blockedNearStops++;
   evidence.push({policy:plan.policy,physicallyAccepted:true,
    rejectedBySportingBudget:true,nearStopTicks:metric.stoppedRiderTicks,
    acceptedFutureSteps:1});
   continue;
  }
  let beams=[{field:first.result,nearStops:metric.stoppedRiderTicks,
   highRiskSlowCount:metric.belowMovingFloor,
   brakingShock:metric.aggregateBrakingMps,
   minimumDecile:metric.lowestDecileSpeedMps,
   advance:metric.netProgressM}];
  let reached=1,failedFuture=0,blockedFuture=0;
  for(let level=1;level<depth;level++){
   const next=[];
   for(const beam of beams){
    const choices=makeFuture(beam.field);
    if(!Array.isArray(choices)||!choices.length)
     throw Error('A85 empty current-state continuation');
    for(const req of choices.slice(0,maxFuture)){
     const physical=physicalStep(beam.field,req,advancePhysical);
     if(!physical.accepted){failedFuture++;continue}
     const quality=step85ThroughputMetricsV3(beam.field,physical.result,{
      movingFloorMps:minimumMovingSpeedMps});
     if(strictNoNearStops&&quality.stoppedRiderTicks>0){
      blockedFuture++;continue;
     }
     next.push({field:physical.result,
      nearStops:beam.nearStops+quality.stoppedRiderTicks,
      highRiskSlowCount:beam.highRiskSlowCount+
       quality.belowMovingFloor,
      brakingShock:q(beam.brakingShock+quality.aggregateBrakingMps),
      minimumDecile:Math.min(beam.minimumDecile,
       quality.lowestDecileSpeedMps),
      advance:q(beam.advance+quality.netProgressM)});
    }
   }
   if(!next.length)break;
   next.sort((a,b)=>a.nearStops-b.nearStops||
    a.highRiskSlowCount-b.highRiskSlowCount||
    b.minimumDecile-a.minimumDecile||
    a.brakingShock-b.brakingShock||
    step80ClearanceRiskV3(a.field.states)-
     step80ClearanceRiskV3(b.field.states)||
    b.advance-a.advance);
   beams=next.slice(0,2);
   reached=level+1;
  }
  const finish=beams[0],rec={
   policy:plan.policy,physicallyAccepted:true,
   fullHorizon:reached===depth,acceptedFutureSteps:reached,
   nearStops:finish.nearStops,
   highRiskSlowCount:finish.highRiskSlowCount,
   minimumDecile:q(finish.minimumDecile),
   brakingShock:q(finish.brakingShock),
   clearanceRisk:q(step80ClearanceRiskV3(finish.field.states)),
   advance:q(finish.advance),failedFuture,blockedFuture,
   firstNearStopTicks:metric.stoppedRiderTicks,
   firstMovingFloorViolations:metric.belowMovingFloor
  };
  evidence.push(rec);
  const a=rank(rec,clearanceFirst);
  let wins=!best;
  if(best){
   const b=rank(best.record,clearanceFirst);
   for(let i=0;i<a.length;i++){
    if(Math.abs(a[i]-b[i])<1e-4)continue;
    wins=a[i]>b[i];break;
   }
  }
  if(wins)best={record:rec,preview:first.result};
 }
 return {status:best?'PHYSICAL_SPORTING_FIRST_TICK':
  blockedNearStops?'NO_NO_STOP_PHYSICAL_REQUEST':
  'NO_SAFE_PHYSICAL_REQUEST',
  selectedPolicy:best?.record.policy??null,
  firstPhysicalPreview:best?.preview??null,
  firstRejected,blockedNearStops,evidence,
  physicallySafeLookaheadTicks:best?.record.acceptedFutureSteps??0,
  realMotionMustBeReswept:true,noPredictedStatesCommitted:true,
  officialWrites:0,sportingApproval:'NO_GO'};
}
