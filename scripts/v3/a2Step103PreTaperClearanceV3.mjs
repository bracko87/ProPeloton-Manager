/** Step 103: EARLY relative-headway formation, original A64 swept witness.
 * Proposed row ordering starts upstream of the forced A64 four-second taper
 * preview. This module cannot alter A64 contact, road edges or W-prime.
 * The eight-second group rule is observed, NEVER used as a speed lock.
 */
import {advanceNormalStartV3} from './a2NormalStartPelotonV3.mjs';
import {step95AchievedMovingGateV3} from './a2Step95MovingPhysicalGateV3.mjs';
import {step101ObserveA64GroupsV3} from './a2Step101EightSecondGroupsV3.mjs';
import {constrainedLaneTargetV3} from './a2VariableRoadWidthV3.mjs';
import {createHash} from 'node:crypto';
const EPS=1e-7, q=x=>Math.round(x*1e6)/1e6;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const policies={
  preopen_moderate:{outer:7.7,inner:10.9,center:8.85,oddShift:0,manualMerge:false},
  preopen_deep:{outer:7.35,inner:11.65,center:8.55,oddShift:0,manualMerge:false},
  row_phase:{outer:7.65,inner:11.25,center:8.55,oddShift:.35,manualMerge:false},
  early_join:{outer:7.55,inner:11.15,center:8.65,oddShift:.1,manualMerge:true},
  frontload_inner:{outer:7.35,inner:11.85,center:9,oddShift:-.15,manualMerge:true}
};
function valid(field,initial){
 if(!field||!initial||field.dt!==.5||field.reason!==null||
   !Number.isFinite(field.at)||!Array.isArray(field.states)||
   !Array.isArray(initial.states)||field.states.length!==initial.states.length||
   field.states.length<2||field.states.length>168)throw Error('A103 invalid original physical field');
 const ids=new Set(field.states.map(s=>s.id));
 if(ids.size!==field.states.length||initial.states.some(s=>!ids.has(s.id)))
   throw Error('A103 physical roster changed');
}
function roles(initial){
 const grid=new Map();
 for(const s of initial.states){
  // Identify physical left, center and right from original five-wide grid,
  // never from player/rider IDs. The same plan mirrors under y -> 4.4-y.
  const distance=Math.abs(s.y-2.2);
  const role=distance>1.55?'OUTER':distance<.43?'CENTER':'INNER';
  const row=Math.round((600-s.startX)/5.2);
  grid.set(s.id,{role,row,side:Math.sign(s.y-2.2),startY:s.y,
    startX:s.startX});
 }
 return grid;
}
export function step103ClearanceRequestsV3(field,initial,{
 mode='preopen_deep',bookingById=null
}={}){
 valid(field,initial);
 const setup=policies[mode];
 if(!setup)throw Error('A103 unknown early formation mode');
 const role=roles(initial),requests=[];
 const blockedPairs=[],forecastForces=[];
 let manualMerges=0;
 for(const s of field.states){
  const r=role.get(s.id),rowParity=r.row%2===0?1:-1;
  const phase=rowParity*setup.oddShift;
  const cruising=setup[r.role.toLowerCase()]+phase;
  // Hard physical floor 7.3 keeps a safety margin above the 6.5m/s
  // upstream-moving guard. Actual A64 acceleration/braking remains bounded.
  let speed=clamp(cruising,7.3,12.1);
  let targetY=s.y;
  const nearFirstTaper=(s.x<1020&&s.x>=545);
  const booked=bookingById?.get(s.id)?.find(b=>b.gateX>s.x-3);
  // The A64 lookahead will force a lane closure within 4s. Proactively
  // detect its physical direction for *diagnosis*; do not bypass it.
  if(nearFirstTaper){
   const force=constrainedLaneTargetV3(field.roadGeometry,s.x,s.v,s.y,{
     previewSeconds:4,bodyHalfWidthM:field.bodyHalfWidthM});
   if(force.changed){
    forecastForces.push({riderId:s.id,currentY:q(s.y),
      enforcedTargetY:q(force.targetY),x:q(s.x)});
   }
   if(setup.manualMerge&&booked&&
      Math.abs(booked.targetY-s.y)>EPS){
    const direction=Math.sign(booked.targetY-s.y);
    // A physically safe local corridor must be clear laterally AND
    // longitudinally on the *current* field. All true swept movement
    // still belongs to original A64, never this heuristic.
    const neighbor=field.states.find(t=>t.id!==s.id&&
      Math.abs(t.x-s.x)<3.2&&
      direction*(t.y-s.y)>-0.1&&
      direction*(t.y-booked.targetY)<.85);
    if(!neighbor){
     targetY=booked.targetY;manualMerges++;
    }else blockedPairs.push([s.id,neighbor.id]);
   }
  }
  requests.push({id:s.id,speed:q(speed),targetY:q(targetY),
    role:r.role,row:r.row});
 }
 return {mode,requests,manualMerges,blockedPairs,
  enforcedLookaheadTargets:forecastForces,
  unchangedPhysics:true,groupSpeedLock:false,officialWrites:0};
}
export function step103RunA64ClearanceV3(initial,bookings,{
 mode='preopen_deep',seconds=30,stopAtGate=false,
 startPhysical=null,recordTrace=false
}={}){
 valid(initial,initial);
 if(!policies[mode]||!Array.isArray(bookings)||
    !Number.isFinite(seconds)||seconds<.5||seconds>180||
    Math.round(seconds*2)!==seconds*2)
   throw Error('A103 invalid physical research parameters');
 const untouched=JSON.stringify([initial,bookings]);
 let current=startPhysical?structuredClone(startPhysical):structuredClone(initial);
 valid(current,initial);
 const book=new Map();
 for(const b of bookings){
  if(!b||typeof b.id!=='string'||!Number.isFinite(b.gateX)||
     !Number.isFinite(b.targetY))throw Error('A103 invalid necessary booking');
  if(!book.has(b.id))book.set(b.id,[]);
  book.get(b.id).push(b);
 }
 const rowHistory=[],startAt=current.at;
 let failure=null,rejectedAt=null,acceptedSteering=0,forcedCounts=0;
 let observed=step101ObserveA64GroupsV3(current);
 for(let tick=0;tick<seconds*2;tick++){
  const plans=step103ClearanceRequestsV3(current,initial,{
    mode,bookingById:book});
  forcedCounts+=plans.enforcedLookaheadTargets.length;
  const preview=structuredClone(current);
  for(let i=0;i<preview.states.length;i++){
    preview.states[i].desired=plans.requests[i].speed;
    preview.states[i].targetY=plans.requests[i].targetY;
  }
  const actual=advanceNormalStartV3(preview);
  if(actual.reason){
   failure=actual.reason;rejectedAt=current.at;break;
  }
  const sport=step95AchievedMovingGateV3(actual);
  if(!sport.admitted){
   failure='A103_MOVING_FLOOR_VETO';rejectedAt=current.at;break;
  }
  if(actual.acceptedSteps!==current.acceptedSteps+1)throw Error('A103 step discontinuity');
  acceptedSteering+=actual.states.filter((s,i)=>Math.abs(s.y-current.states[i].y)>EPS).length;
  observed=step101ObserveA64GroupsV3(actual,current);
  current=actual;
  rowHistory.push({
    at:q(current.at),rear:q(Math.min(...current.states.map(s=>s.x))),
    front:q(Math.max(...current.states.map(s=>s.x))),
    minSpeed:q(Math.min(...current.states.map(s=>s.v))),
    groups:observed.groups.length,
    physicalHash:sha(current.states.map(s=>[s.id,s.x,s.y,s.v,
      s.energy?.remainingWPrimeJoules]))});
  if(stopAtGate&&current.states.every(s=>s.x>1020))break;
 }
 if(JSON.stringify([initial,bookings])!==untouched)
   throw Error('A103 mutated original A64 initial data');
 const evidence={mode,n:current.states.length,
   acceptedSeconds:q(current.at-startAt),startAtSeconds:startAt,
   acceptedSteps:rowHistory.length,requestedSeconds:seconds,
   firstRejectReason:failure,firstRejectAt:rejectedAt,
   collisionFreeAcceptedPrefix:true,
   minAcceptedMps:rowHistory.length?
     Math.min(...rowHistory.map(x=>x.minSpeed)):null,
   forcedRoadPreviewRequests:forcedCounts,
   acceptedSteeringRiderTicks:acceptedSteering,
   physicalGroupCount:observed.groups.length,
   pelotonRiders:observed.groups.find(g=>g.code==='P')?.riderIds.length??0,
   allFirstGatePassed:current.states.every(s=>s.x>1020),
   allSecondGatePassed:current.states.every(s=>s.x>1470),
   complete30Seconds:seconds===30&&!failure&&
      current.at-startAt===30,
   full180SportingSuccess:seconds===180&&!failure&&
     current.states.every(s=>s.x>1470),
   stableCheckpointHash:sha(rowHistory),
   snapshots:recordTrace?rowHistory:undefined,
   exactEightSecondGroupRule:observed.groupingThresholdSeconds===8,
   originalA64Unmodified:true,officialWrites:0,
   sportingDecision:'NO_GO_UNTIL_REAL_180S_ALL_GATES_OVERTAKES'};
 return {evidence,physical:current};
}
