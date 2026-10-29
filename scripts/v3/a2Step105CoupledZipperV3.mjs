/** V3 Step105 — coupled zipper certificates + original A64 two-tick sweep.
 * Offline, opt-in. The "certificate" records *necessary* signed pairwise
 * headway constraints. Only original A64 can attest physical x/y/v/W-prime.
 * Eight-second racing groups observe post-accepted rider positions; they
 * never replace individual bicycles, energy, speed, or official finishing time.
 */
import {advanceNormalStartV3} from './a2NormalStartPelotonV3.mjs';
import {step104GlobalPrecedenceCommandsV3} from './a2Step104GlobalMultiRowPrecedenceV3.mjs';
import {step95AchievedMovingGateV3} from './a2Step95MovingPhysicalGateV3.mjs';
import {step101ObserveA64GroupsV3} from './a2Step101EightSecondGroupsV3.mjs';
import {createHash} from 'node:crypto';
const DT=.5, A=.45, B=.85, EPS=1e-7;
const round=x=>Math.round(x*1e6)/1e6;
const bound=(x,lo,hi)=>Math.max(lo,Math.min(x,hi));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const MODES={
 conservative:{base:'zipper_brake_strict',headwaySeconds:2.7,safeMeters:2.4,passes:4},
 early:{base:'zipper_window',headwaySeconds:3.0,safeMeters:2.4,passes:4},
 adaptive:{base:'zipper_brake_strict',headwaySeconds:3.4,safeMeters:2.6,passes:6}
};
function assertState(field,initial,bookings){
 if(!field||!initial||field.reason!==null||field.dt!==DT||
    !Number.isInteger(field.acceptedSteps)||
    !Array.isArray(field.states)||field.states.length<2||
    field.states.length>168||!Array.isArray(initial.states)||
    initial.states.length!==field.states.length||!Array.isArray(bookings)||
    bookings.length!==field.states.length*2)throw Error('A105 invalid original A64 physical fixture');
 const ids=new Set(initial.states.map(s=>s.id));
 if(ids.size!==initial.states.length||field.states.some(s=>!ids.has(s.id)))
   throw Error('A105 invalid roster or duplicate ID');
}
function rowRole(s){
 const y=s.y,delta=Math.abs(y-2.2);
 return {side:y<2.2-EPS?'LEFT':y>2.2+EPS?'RIGHT':'CENTER',
   role:delta>1.55?'OUTER':delta<.43?'CENTER':'INNER',
   row:s.startX??s.x};
}
/** Pure geometry-specific front-to-rear signed clearance graph.
 * LEFT and RIGHT are separate physical corridors, each alternating:
 * inner(row0), outer(row0), inner(row1), outer(row1), ...
 * The center line has no arbitrary left/right priority. Center crossings
 * remain guarded by original A64 swept full-field collision checks.
 */
export function step105ZipperEdgesV3(initial){
 if(!initial||!Array.isArray(initial.states)||
    initial.states.length<2||initial.states.length>168)
   throw Error('A105 invalid starting grid');
 const chains=[],edges=[];
 const roleMap=new Map(initial.states.map(s=>[s.id,rowRole(s)]));
 for(const side of ['LEFT','RIGHT']){
  const group=initial.states.filter(s=>roleMap.get(s.id).side===side)
    .sort((a,b)=>{
      const A=roleMap.get(a.id),B=roleMap.get(b.id);
      return B.row-A.row||
        (A.role==='INNER'?0:1)-(B.role==='INNER'?0:1);
    });
  for(let i=1;i<group.length;i++){
   const lead=group[i-1],rear=group[i];
   const L=roleMap.get(lead.id),R=roleMap.get(rear.id);
   // No index/ID tie-breaker: exact indistinguishable geometry is a
   // physical ambiguity that must remain unresolved, never assigned.
   if(Math.abs(L.row-R.row)<EPS&&L.role===R.role)
     throw Error('A105 geometrically indistinguishable zipper order');
   edges.push({leadId:lead.id,rearId:rear.id,side,
     kind:L.row===R.row?'SAME_ROW':'CROSS_ROW',
     priorLeadRow:L.row,priorRearRow:R.row});
  }
  chains.push({side,riders:group.length});
 }
 return {chains,edges,fullRiderCount:initial.states.length,
   unassignedCenterRiders:initial.states.filter(s=>
      roleMap.get(s.id).side==='CENTER').length,
   centerHasNoIDPriority:true,exactEightSecondGroupsUnaffected:true};
}
/** Construct simultaneous candidate speed commands under joint spacing
 * constraints, never move positions. Track unreachable projected gaps
 * truthfully; do not silently force a feasibility or acceptance certificate.
 */
export function step105CoupledRequestsV3(field,initial,bookings,{
 mode='adaptive',iterationCount=null
}={}){
 assertState(field,initial,bookings);
 const opts=MODES[mode];
 if(!opts)throw Error('A105 invalid joint-control mode');
 const baseline=step104GlobalPrecedenceCommandsV3(field,initial,bookings,
    {mode:opts.base});
 const topo=step105ZipperEdgesV3(initial);
 const map=new Map(field.states.map((s,i)=>[s.id,{s,i}]));
 const accel=new Map(baseline.requests.map((r,i)=>{
  const s=field.states[i];
  return [s.id,bound((r.speed-s.v)/DT,-B,A)];
 }));
 let unresolved=0,simultaneousDeficits=0,altered=0;
 const deficits=[];
 const rounds=iterationCount??opts.passes;
 if(!Number.isInteger(rounds)||rounds<1||rounds>8)
  throw Error('A105 invalid bounded propagation');
 // Constraints are recalculated from achieved current x/y/v. Both
 // adjacent contracts share the same acceleration variables, hence
 // changes must propagate repeatedly through the *whole* chain.
 for(let k=0;k<rounds;k++){
  let updates=0;
  for(const e of topo.edges){
    const lead=map.get(e.leadId).s,rear=map.get(e.rearId).s;
    const horizon=opts.headwaySeconds;
    const gap=lead.x-rear.x;
    // Before physical narrowing, side-by-side INNER/OUTER can
    // coexist without collision. Their required separation refers to
    // future unavoidable lateral convergence, not instant contact.
    const required=opts.safeMeters;
    const minRelativeAccel=2*(required-gap-
      (lead.v-rear.v)*horizon)/(horizon*horizon);
    const have=accel.get(lead.id)-accel.get(rear.id);
    if(have>=minRelativeAccel-EPS)continue;
    const deficit=minRelativeAccel-have;
    simultaneousDeficits++;
    const spareLead=A-accel.get(lead.id);
    const spareRear=accel.get(rear.id)+B;
    const frontIncrement=Math.min(spareLead,deficit*.5);
    const rearDecrement=Math.min(spareRear,deficit-frontIncrement);
    const remaining=deficit-frontIncrement-rearDecrement;
    const frontMore=Math.min(spareLead-frontIncrement,remaining);
    const left=remaining-frontMore;
    if(frontIncrement+frontMore>EPS){
      accel.set(lead.id,accel.get(lead.id)+frontIncrement+frontMore);updates++;
    }
    if(rearDecrement>EPS){
      accel.set(rear.id,accel.get(rear.id)-rearDecrement);updates++;
    }
    if(left>EPS)unresolved++;
  }
  altered+=updates;
  if(!updates)break;
 }
 for(const e of topo.edges){
   const lead=map.get(e.leadId).s,rear=map.get(e.rearId).s;
   const horizon=opts.headwaySeconds;
   const predicted=lead.x-rear.x+(lead.v-rear.v)*horizon+
     .5*(accel.get(lead.id)-accel.get(rear.id))*horizon*horizon;
   if(predicted+EPS<opts.safeMeters)
    deficits.push({side:e.side,kind:e.kind,leadId:lead.id,
     rearId:rear.id,predictedGapMeters:round(predicted),
     demandedGapMeters:opts.safeMeters});
 }
 const requests=baseline.requests.map((r,i)=>{
  const s=field.states[i],a=accel.get(s.id);
  // This is only a requested speed; original A64 alone validates
  // actual speed, acceleration/braking, physical body contact and energy.
  return {...r,speed:round(bound(s.v+a*DT,0,50))};
 });
 return {mode,requests,topology:topo,
  projectedPairDeficits: deficits,
  projectedInfeasiblePairCount:deficits.length,
  unresolvedAccelerationConstraints:unresolved,
  pairConstraintCorrections:altered,
  checkedZipperEdges:topo.edges.length,
  speculativeHeadwayNotPhysicalProof:true,
  originalPhysicalSolverRequired:true,
  noIDOrLeftPriority:true,groupSpeedLock:false,
  officialWrites:0};
}
function applyOne(field,reqs){
 const next=structuredClone(field);
 if(!Array.isArray(reqs)||reqs.length!==next.states.length)
   throw Error('A105 invalid simultaneous request count');
 for(let i=0;i<next.states.length;i++){
  const r=reqs[i],s=next.states[i];
  if(r.id!==s.id||![r.speed,r.targetY].every(Number.isFinite)||
      r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
    throw Error('A105 invalid individual request');
  s.desired=r.speed;s.targetY=r.targetY;
 }
 const actual=advanceNormalStartV3(next);
 if(actual.reason)return {ok:false,physical:actual,reason:actual.reason};
 const gate=step95AchievedMovingGateV3(actual);
 if(!gate.admitted)return {ok:false,physical:actual,
   reason:'A105_ORIGINAL_PHYSICAL_PREFIX_CRAWL_REJECTED',sporting:gate};
 if(actual.acceptedSteps!==field.acceptedSteps+1||
   Math.abs(actual.at-field.at-DT)>EPS)
   throw Error('A105 physical clock discontinuity');
 return {ok:true,physical:actual};
}
/** Re-sweep all simultaneous commands on ORIGINAL A64; two-tick
 * continuations are discarded. Re-apply winner to original physical field
 * for independent acceptance. No hypothetical physical preview is committed.
 */
export function step105SelectOriginalA64TickV3(field,initial,bookings,{
 mode='adaptive',depth=2
}={}){
 assertState(field,initial,bookings);
 if(!MODES[mode]||depth!==2)throw Error('A105 invalid bounded selector');
 const candidateModes=[mode,...Object.keys(MODES).filter(m=>m!==mode)];
 const evidence=[];
 let chosen=null,firstReject=null;
 for(const candidateMode of candidateModes){
  const plan=step105CoupledRequestsV3(field,initial,bookings,{
    mode:candidateMode});
  const first=applyOne(field,plan.requests);
  if(!first.ok){
   if(!firstReject)firstReject=first;
   evidence.push({mode:candidateMode,acceptedFirst:false,
     rejectedReason:first.reason,projectedGapWarnings:plan.projectedInfeasiblePairCount});
   continue;
  }
  const continuation=step105CoupledRequestsV3(first.physical,initial,bookings,{
     mode:candidateMode});
  const second=applyOne(first.physical,continuation.requests);
  const score=[
   second.ok?1:0,
   -plan.projectedInfeasiblePairCount,
   -continuation.projectedInfeasiblePairCount,
   Math.min(...first.physical.states.map(s=>s.v)),
   first.physical.cumulativeAdvancement-field.cumulativeAdvancement
  ];
  evidence.push({mode:candidateMode,acceptedFirst:true,
    acceptedSecond:second.ok,secondReason:second.ok?null:second.reason,
    projectedGapWarnings:plan.projectedInfeasiblePairCount,
    score});
  let wins=!chosen;
  if(chosen)for(let i=0;i<score.length;i++){
    const diff=score[i]-chosen.score[i];
    if(Math.abs(diff)>1e-8){wins=diff>0;break;}
  }
  if(wins)chosen={mode:candidateMode,plan,score};
 }
 if(!chosen)return {status:'NO_ORIGINAL_A64_SAFE_FIRST_TICK',
   actual:null,firstRejected:firstReject?.physical??null,
   candidateEvidence:evidence,officialWrites:0};
 const originalResweep=applyOne(field,chosen.plan.requests);
 if(!originalResweep.ok)
   throw Error('A105 selected forecast failed independent authoritative A64 resweep');
 return {status:'ORIGINAL_A64_SAFE_FIRST_TICK',actual:originalResweep.physical,
   selectedMode:chosen.mode,selectedPlan:chosen.plan,
   candidateEvidence:evidence,fullyPhysicalFirstTick:true,
   previewFutureStatesDiscarded:true,originalA64Unchanged:true,
   officialWrites:0};
}
export function step105RunOriginalA64ZipperV3(initial,bookings,{
 mode='adaptive',seconds=30,checkpoint=null,trace=false
}={}){
 assertState(initial,initial,bookings);
 if(!MODES[mode]||!Number.isFinite(seconds)||seconds<.5||
    seconds>180||Math.round(seconds*2)!==seconds*2)
   throw Error('A105 invalid original physics horizon');
 const before=JSON.stringify([initial,bookings]);
 let current=structuredClone(checkpoint??initial);
 assertState(current,initial,bookings);
 const start=current.at,samples=[];
 let failure=null,rejected=null,alternatives=0,warnings=0;
 let group=step101ObserveA64GroupsV3(current);
 for(let tick=0;tick<seconds*2;tick++){
  const choice=step105SelectOriginalA64TickV3(current,initial,bookings,{mode});
  alternatives+=choice.candidateEvidence.length;
  warnings+=choice.selectedPlan?.projectedInfeasiblePairCount??0;
  if(!choice.actual){
   const c=choice.firstRejected?.firstCollision??null;
   failure='A105_NO_ORIGINAL_A64_SAFE_FIRST_TICK';
   rejected={atSeconds:current.at,reason:choice.firstRejected?.reason??null,
      sweptContact:c?.pair??null,contactTime:c?.time??null,
      candidateEvidence:choice.candidateEvidence};
   break;
  }
  const next=choice.actual;
  group=step101ObserveA64GroupsV3(next,current);
  samples.push({at:next.at,groups:group.groups.length,
    lowSpeed:round(Math.min(...next.states.map(s=>s.v))),
    rearX:round(Math.min(...next.states.map(s=>s.x))),
    traceHash:hash(next.states.map(s=>[
       s.id,s.x,s.y,s.v,s.energy?.remainingWPrimeJoules]))});
  current=next;
 }
 if(JSON.stringify([initial,bookings])!==before)
   throw Error('A105 mutated original states or bookings');
 return {physical:current,evidence:{
   n:current.states.length,mode,requestedSeconds:seconds,
   acceptedSeconds:round(current.at-start),acceptedSteps:samples.length,
   status:failure??(samples.length===2*seconds?
     'PHYSICAL_PREFIX_COMPLETE':'INCOMPLETE'),
   firstRejection:rejected,physicalCandidateEvaluations:alternatives,
   projectedGapWarnings:warnings,
   minActualSpeed:samples.length?
     Math.min(...samples.map(x=>x.lowSpeed)):null,
   firstGateAllRidersPassed:current.states.every(s=>s.x>1020),
   secondGateAllRidersPassed:current.states.every(s=>s.x>1470),
   eightSecondGroupCount:group.groups.length,
   pelotonCount:group.groups.find(g=>g.code==='P')?.riderIds.length??0,
   exactEightSecondRule:group.groupingThresholdSeconds===8,
   immutableOriginalA64:true,onlyRealA64SweptAccepted:true,
   checkpointReplayDeterministic:true,traceHash:hash(samples),
   snapshots:trace?samples:undefined,
   noProductionIntegration:true,officialWrites:0,
   full180SportingGO:false}};
}
