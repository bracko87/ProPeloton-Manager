/** V3 Step104: identity-neutral *global multi-row* physical precedence.
 * Only constructs simultaneous commands. The unchanged original A64 bicycle
 * swept-body/road/W-prime solver remains the sole movement authority.
 * Race group membership (<=8s consecutive gaps) does not lock rider speeds.
 */
import {advanceNormalStartV3} from './a2NormalStartPelotonV3.mjs';
import {step95AchievedMovingGateV3} from './a2Step95MovingPhysicalGateV3.mjs';
import {step101ObserveA64GroupsV3} from './a2Step101EightSecondGroupsV3.mjs';
import {constrainedLaneTargetV3} from './a2VariableRoadWidthV3.mjs';
import {createHash} from 'node:crypto';
const EPS=1e-7,finite=Number.isFinite;
const q=n=>Math.round(n*1e6)/1e6;
const clamp=(n,a,b)=>Math.max(a,Math.min(n,b));
const SHA=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const MODES={
 chain_soft:{outer:9.35,step:.22,boost:1.65,center:7.6,headway:4,clear:3.6,manual:false},
 chain_strict:{outer:9.7,step:.31,boost:2.0,center:7.45,headway:5,clear:4.1,manual:false},
 global_reserve:{outer:10,step:.26,boost:1.9,center:7.5,headway:6,clear:4.5,manual:false},
 stepped_release:{outer:9.8,step:.18,boost:1.8,center:7.55,headway:4.5,clear:3.65,manual:false},
 early_ordered_merge:{outer:9.55,step:.23,boost:1.75,center:7.4,headway:5,clear:3.8,manual:true},
 // A zipper must preserve *both* adjacent longitudinal gaps:
 //  inner(row k) > outer(row k) > inner(row k+1).
 // Strong row speed gradients left later rows unable to open their
 // same-row separation at the time A64's road lookahead forces merging.
 zipper_uniform:{outer:8.85,step:0,boost:.58,center:8.1,headway:2.8,clear:2.35,manual:false},
 zipper_soft:{outer:8.65,step:0,boost:.72,center:7.45,headway:3,clear:2.4,manual:false},
 zipper_pace:{outer:9.35,step:0,boost:.62,center:8.6,headway:2.4,clear:2.45,manual:false},
 zipper_slower:{outer:7.8,step:0,boost:.62,center:7.35,headway:2.5,clear:2.4,manual:false},
 zipper_window:{outer:8.65,step:0,boost:.52,center:8.0,headway:3.2,clear:2.45,manual:false},
 zipper_brake:{outer:8.85,step:0,boost:.62,center:8.1,headway:3.4,clear:2.55,manual:false,predictive:true},
 zipper_brake_strict:{outer:8.65,step:0,boost:.72,center:7.35,headway:4,clear:2.55,manual:false,predictive:true},
 zipper_brake_fast:{outer:9.15,step:0,boost:.6,center:8.25,headway:3,clear:2.65,manual:false,predictive:true},
 global_brake:{outer:9.5,step:.20,boost:1.6,center:7.7,headway:3.8,clear:3,manual:false,predictive:true}
};
function check(field,original){
 if(!field||!original||field.reason!==null||field.dt!==.5||
    !finite(field.at)||field.at<0||!Array.isArray(field.states)||
    field.states.length<2||field.states.length>168||
    !Array.isArray(original.states)||original.states.length!==field.states.length)
   throw Error('A104 invalid original A64 accepted checkpoint');
 const a=new Set(field.states.map(s=>s.id)),b=new Set(original.states.map(s=>s.id));
 if(a.size!==field.states.length||b.size!==original.states.length||
    [...a].some(id=>!b.has(id))||field.states.some(s=>![s.x,s.y,s.v].every(finite)))
   throw Error('A104 duplicate/missing or invalid physical rider');
}
function identity(original){
 const map=new Map();
 for(const s of original.states){
  const row=q(s.startX),dy=Math.abs(s.y-2.2),side=Math.sign(s.y-2.2);
  const role=dy>1.55?'OUTER':dy<.43?'CENTER':'INNER';
  map.set(s.id,{row,side,role,originalY:s.y});
 }
 return map;
}
function targetInformation(field,bookings){
 const originalById=new Map();
 for(const b of bookings){
  if(!b||typeof b.id!=='string'||!finite(b.gateX)||
     !finite(b.targetY))throw Error('A104 invalid original booking');
  if(!originalById.has(b.id))originalById.set(b.id,[]);
  originalById.get(b.id).push(b);
 }
 const map=new Map();
 for(const s of field.states){
  const next=(originalById.get(s.id)||[]).filter(b=>
    b.gateX>s.x-3).sort((a,b)=>a.gateX-b.gateX)[0];
  map.set(s.id,next??null);
 }
 return map;
}
export function step104GlobalPrecedenceCommandsV3(field,original,bookings,{
 mode='chain_strict'}={}){
 check(field,original);
 const p=MODES[mode];if(!p||!Array.isArray(bookings))
  throw Error('A104 invalid global precedence input');
 const meta=identity(original),targets=targetInformation(field,bookings);
 const byId=new Map(field.states.map(s=>[s.id,s]));
 const frontmost=Math.max(...field.states.map(s=>s.x));
 const orders=new Map(),forces=new Map();
 const ranked=field.states.map(s=>({s,m:meta.get(s.id)})).sort((a,b)=>
   b.m.row-a.m.row||
   (a.m.role==='INNER'?-1:a.m.role==='OUTER'?0:1)-
   (b.m.role==='INNER'?-1:b.m.role==='OUTER'?0:1)||
   Math.abs(a.m.originalY-2.2)-Math.abs(b.m.originalY-2.2));
 // Global progression: front row first; body ID may never break precedence.
 // Lane-side is only used to determine physically relevant nearby pairs.
 let capped=0,upstreamCrossRowConstraints=0,unresolved=0;
 const requested=new Map();
 for(const {s,m} of ranked){
  const depth=Math.max(0,Math.round((600-m.row)/5.2));
  const outer=clamp(p.outer-p.step*depth,7.35,11.4);
  const own=m.role==='INNER'?outer+p.boost:
    m.role==='CENTER'?p.center:outer;
  let demand=clamp(own,7.35,12.5),cap=Infinity;
  const localForecast=constrainedLaneTargetV3(
    field.roadGeometry,s.x,s.v,s.y,{
      previewSeconds:4,bodyHalfWidthM:field.bodyHalfWidthM});
  const b=targets.get(s.id);
  const target= b?.targetY??s.y;
  const incoming=field.states.filter(t=>{
    if(t.id===s.id)return false;
    const tm=meta.get(t.id);
    // Same-side future corridor intersections are the critical Step103
    // multi-row failure. Center riders are conservatively considered
    // close to both inner lanes when approaching a two-slot gate.
    if(tm.side!==m.side&&m.role!=='CENTER'&&tm.role!=='CENTER')
      return false;
    const gap=t.x-s.x;
    if(gap<2.3||gap>55) return false;
    const tbooking=targets.get(t.id);
    const futureGap=Math.abs((tbooking?.targetY??t.y)-target);
    const currentGap=Math.abs(t.y-s.y);
    return futureGap<1.15||currentGap<1.16;
  }).sort((a,b)=>a.x-b.x);
  for(const lead of incoming){
    const lm=meta.get(lead.id);
    // Do not regard an INNER same-row rider as an existing leader at
    // equal x before physical separation has actually been achieved.
    if(lm.row===m.row)continue;
    const dx=lead.x-s.x,leaderSpeed=requested.get(lead.id)??lead.v;
    const aheadEffective=Math.min(lead.v,leaderSpeed);
    // A follower must start slowing before the *predicted* swept
    // collision. Actual A64 still bounds deceleration to 0.85m/s².
    // The prospective closing distance is a conservative headway
    // request, not a claimed achieved clearance.
    const closure=Math.max(0,s.v-aheadEffective);
    const required=p.predictive?
      p.clear+closure*2.0+closure*closure/(2*.85):
      p.clear;
    const safe=clamp(aheadEffective+
      (dx-required)/p.headway,7.3,12.5);
    cap=Math.min(cap,safe);
    upstreamCrossRowConstraints++;
  }
  if(finite(cap)&&demand>cap+EPS){demand=Math.max(7.3,cap);capped++;}
  // A corridor assignment is an optional direction REQUEST. The road
  // itself may still force movement via A64 lookahead, which is re-swept.
  let chosenY=s.y;
  if(p.manual&&b&&b.gateX-s.x<170&&
     Math.abs(b.targetY-s.y)>.03){
    const dir=Math.sign(b.targetY-s.y);
    const occupied=field.states.some(t=>{
      if(t.id===s.id||Math.abs(t.x-s.x)>p.clear+1.8)return false;
      return dir*(t.y-s.y)>-.08&&dir*(t.y-b.targetY)<.88;
    });
    if(!occupied)chosenY=b.targetY;else unresolved++;
  }
  if(localForecast.changed)forces.set(s.id,{
    id:s.id,fromY:q(s.y),requiredByRoadY:q(localForecast.targetY),
    gapToClosestAhead:incoming[0]?q(incoming[0].x-s.x):null,
    role:m.role,row:m.row});
  requested.set(s.id,demand);
  orders.set(s.id,{id:s.id,speed:q(demand),targetY:q(chosenY),
    row:m.row,role:m.role});
 }
 return {mode,requests:field.states.map(s=>orders.get(s.id)),
  forecastForces:[...forces.values()],
  cappedByCrossRowPrecedence:capped,
  checkedGlobalPairConstraints:upstreamCrossRowConstraints,
  unresolvedUnsafeManualMerges:unresolved,
  noIDPriority:true,noGroupSpeedLock:true,
  requestOnly:true,officialWrites:0};
}
export function step104OriginalA64PassageV3(initial,bookings,{
 mode='chain_strict',seconds=30,startingCheckpoint=null,
 trace=false}={}){
 check(initial,initial);
 if(!MODES[mode]||!Array.isArray(bookings)||
    !finite(seconds)||seconds<.5||seconds>180||
    Math.round(seconds*2)!==seconds*2)
   throw Error('A104 invalid research horizon or mode');
 let current=structuredClone(startingCheckpoint??initial);
 check(current,initial);
 const inputs=JSON.stringify([initial,bookings]);
 const beganAt=current.at,samples=[];
 let firstRejection=null,forceRiderTicks=0,globalPairConstraints=0,caps=0;
 let groups=step101ObserveA64GroupsV3(current);
 for(let n=0;n<seconds*2;n++){
  const o=step104GlobalPrecedenceCommandsV3(current,initial,bookings,{mode});
  const proposed=structuredClone(current);
  for(let i=0;i<proposed.states.length;i++){
   proposed.states[i].desired=o.requests[i].speed;
   proposed.states[i].targetY=o.requests[i].targetY;
  }
  const physical=advanceNormalStartV3(proposed);
  forceRiderTicks+=o.forecastForces.length;
  globalPairConstraints+=o.checkedGlobalPairConstraints;
  caps+=o.cappedByCrossRowPrecedence;
  if(physical.reason){
   const c=physical.firstCollision??null;
   const im=identity(initial);
   firstRejection={
    kind:physical.reason,atSeconds:current.at,
    contactTimeSeconds:c?.time??null,
    pair:c?.pair?.map(id=>({id,...im.get(id)}))??null,
    deltaX:c?.preCollisionField?.deltaAtContactX??null,
    deltaY:c?.preCollisionField?.deltaAtContactY??null,
    originalRoadViolation:physical.firstRoadViolation??null,
    forcedPair:o.forecastForces.filter(f=>c?.pair?.includes(f.id))};
   break;
  }
  const gate=step95AchievedMovingGateV3(physical);
  if(!gate.admitted){
   firstRejection={kind:'A104_ACHIEVED_SPEED_VETO',atSeconds:current.at,
      upstreamSlow:gate.upstreamSlow,downstreamSlow:gate.downstreamSlow,
      nearStop:gate.nearStop};break;
  }
  if(physical.acceptedSteps!==current.acceptedSteps+1||
     Math.abs(physical.at-current.at-.5)>EPS)
    throw Error('A104 checkpoint discontinuity');
  groups=step101ObserveA64GroupsV3(physical,current);
  samples.push({at:physical.at,
    groups:groups.groups.length,
    minAchieved:q(Math.min(...physical.states.map(s=>s.v))),
    rearX:q(Math.min(...physical.states.map(s=>s.x))),
    hash:SHA(physical.states.map(s=>[
      s.id,s.x,s.y,s.v,s.energy?.remainingWPrimeJoules]))});
  current=physical;
 }
 if(JSON.stringify([initial,bookings])!==inputs)
   throw Error('A104 research mutated initial A64 field or itinerary');
 const accepted=q(current.at-beganAt);
 const e={mode,n:current.states.length,
   acceptedSeconds:accepted,requestedSeconds:seconds,
   completedRequestedPrefix:accepted===seconds,
   allFirstGatePassed:current.states.every(s=>s.x>1020),
   allSecondGatePassed:current.states.every(s=>s.x>1470),
   minAchievedMps:samples.length?
      Math.min(...samples.map(s=>s.minAchieved)):null,
   firstRejection,
   forceRiderTicks,globalPairConstraints,caps,
   groupCount:groups.groups.length,
   pelotonRiders:groups.groups.find(g=>g.code==='P')?.riderIds.length??0,
   eightSecondGroupRule:true,
   acceptedSamples:samples.length,trace:trace?samples:undefined,
   traceSha256:SHA(samples),
   exactA64SweptMovement:true,noOriginalA64Changes:true,
   noGroupSpeedLock:true,noProdIntegration:true,officialWrites:0,
   sportingApproval:'NO_GO_UNTIL_180S_ALL_GATES_AND_OVERTAKES'};
 return {evidence:e,physical:current};
}
