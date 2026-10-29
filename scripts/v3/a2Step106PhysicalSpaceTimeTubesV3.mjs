/**
 * Race Engine V3 Step106 — research-only ORIGINAL A64 swept trajectory tubes.
 *
 * A space-time conflict is a projected conditional warning, NEVER proof of
 * a safe path. Only a full original A64 16-microstep body/road/W-prime sweep
 * and achieved-speed gate can authorize a half-second of movement.
 * A forecast is discarded; the chosen first action is independently re-swept.
 * Eight-second race groups are labels, not shared bicycle bodies/speeds.
 */
import {advanceNormalStartV3} from './a2NormalStartPelotonV3.mjs';
import {step95AchievedMovingGateV3} from './a2Step95MovingPhysicalGateV3.mjs';
import {step101ObserveA64GroupsV3} from './a2Step101EightSecondGroupsV3.mjs';
import {step104GlobalPrecedenceCommandsV3} from './a2Step104GlobalMultiRowPrecedenceV3.mjs';
import {step105ZipperEdgesV3,step105CoupledRequestsV3}
  from './a2Step105CoupledZipperV3.mjs';
import {researchRoadEnvelopeV3,constrainedLaneTargetV3}
  from './a2VariableRoadWidthV3.mjs';
import {createHash} from 'node:crypto';
const DT=.5, ACC=.45, BRAKE=.85, EPS=1e-7;
const q=v=>Math.round(v*1e6)/1e6;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const BASE=['zipper_brake_strict','zipper_window','chain_strict'];
function validate(field,initial,bookings){
 if(!field||!initial||field.reason!==null||field.dt!==DT||
   !Array.isArray(field.states)||!Array.isArray(initial.states)||
   field.states.length<2||field.states.length>168||
   initial.states.length!==field.states.length||
   !Array.isArray(bookings)||bookings.length!==field.states.length*2)
   throw Error('A106 invalid original A64 research field');
 const ids=new Set(initial.states.map(s=>s.id));
 if(ids.size!==initial.states.length||field.states.some(s=>!ids.has(s.id)))
   throw Error('A106 rider ID mismatch');
}
function sideRole(s){
 const delta=Math.abs(s.y-2.2);
 return {side:s.y<2.2-EPS?'LEFT':s.y>2.2+EPS?'RIGHT':'CENTER',
 role:delta>1.55?'OUTER':delta<.43?'CENTER':'INNER',
 row:s.startX??s.x};
}
function upcomingTaperTime(s,geometry){
 const envelopes=[680,1130];
 const start=envelopes.find(x=>x>s.x-1)??1470;
 return Math.max(0,(start-s.x)/Math.max(2,s.v)-4);
}
/** Recompute conditional time-expanded occupancy conflict graph from
 * current achieved x/y/v, start-grid geometric precedence, and exact
 * unchanged spatial road envelope at future physical coordinates.
 *
 * Any edge marked "unreachable" refers ONLY to assumed required
 * convergence within horizonSeconds and independently capped acceleration.
 * No 180-second physical infeasibility conclusion is permitted.
 */
export function step106TubeConflictsV3(field,initial,{
 horizonSeconds=6,clearanceMeters=2.25
}={}){
 validate(field,initial,Array.from({length:field.states.length*2},
  (_,i)=>({id:field.states[Math.floor(i/2)].id})));
 if(!Number.isFinite(horizonSeconds)||horizonSeconds<1||
   horizonSeconds>8||!Number.isFinite(clearanceMeters)||
   clearanceMeters<1.8||clearanceMeters>4)
   throw Error('A106 invalid time-expanded conflict horizon');
 const topo=step105ZipperEdgesV3(initial);
 const pos=new Map(field.states.map(s=>[s.id,s]));
 const edges=[],roadForces=[];
 for(const s of field.states){
  const look=constrainedLaneTargetV3(field.roadGeometry,s.x,s.v,s.y,{
    previewSeconds:4,bodyHalfWidthM:field.bodyHalfWidthM??0});
  if(look.changed){
   roadForces.push({riderId:s.id,x:q(s.x),forcedY:q(look.targetY),
     timeToPreview:q(upcomingTaperTime(s,field.roadGeometry))});
  }
 }
 for(const e of topo.edges){
  const lead=pos.get(e.leadId),rear=pos.get(e.rearId);
  const t=horizonSeconds,dx=lead.x-rear.x,dv=lead.v-rear.v;
  // If the riders maintain their current relative pace, their projected
  // signed gap and their maximum physically reachable gap are:
  const projected=dx+dv*t;
  const maxReach=projected+.5*(ACC+BRAKE)*t*t;
  const required=clearanceMeters;
  // Road pinch is at a physical x, not a race-clock scripted event.
  const leadAt=lead.x+lead.v*t,rearAt=rear.x+rear.v*t;
  const tightWidth=Math.min(
    researchRoadEnvelopeV3(field.roadGeometry,leadAt).widthM,
    researchRoadEnvelopeV3(field.roadGeometry,rearAt).widthM);
  const assumedConverging=tightWidth<4.4-1e-5||
    roadForces.some(f=>f.riderId===lead.id||f.riderId===rear.id);
  const predictedDeficit=Math.max(0,required-projected);
  edges.push({leadId:lead.id,rearId:rear.id,side:e.side,kind:e.kind,
    existingSignedGap:q(dx),currentRelativeMps:q(dv),
    forecastSignedGap:q(projected),maxReachableSignedGap:q(maxReach),
    conditionalConvergence:assumedConverging,
    projectedGapShortfall:q(predictedDeficit),
    necessarilyInfeasibleIfConverging:assumedConverging&&
      maxReach<required-EPS,
    horizonSeconds:t});
 }
 return {edges,forcedLookahead:roadForces,
   edgeCount:edges.length,roadForecastCount:roadForces.length,
   conditionalUnreachable:edges.filter(e=>e.necessarilyInfeasibleIfConverging).length,
   conditionalGapDeficits:edges.filter(e=>e.conditionalConvergence&&
     e.projectedGapShortfall>EPS).length,
   independentlySweptPathNotYetProven:true,
   officialWrites:0};
}
function baseCommands(field,initial,bookings,mode){
 if(BASE.includes(mode))
  return step104GlobalPrecedenceCommandsV3(field,initial,bookings,{mode}).requests;
 if(['adaptive','early','conservative'].includes(mode))
  return step105CoupledRequestsV3(field,initial,bookings,{mode}).requests;
 throw Error('A106 unsupported physical plan');
}
function geometricPrecedence(pair,initial){
 if(!Array.isArray(pair)||pair.length!==2)return null;
 const byId=new Map(initial.states.map(s=>[s.id,s]));
 const [a,b]=pair.map(id=>byId.get(id));
 if(!a||!b)return null;
 const A=sideRole(a),B=sideRole(b);
 if(A.side!==B.side||A.side==='CENTER')return null;
 if(Math.abs(A.row-B.row)<EPS){
  if(A.role===B.role)return null;
  if(A.role==='INNER')return {front:a.id,rear:b.id,kind:'same_row'};
  if(B.role==='INNER')return {front:b.id,rear:a.id,kind:'same_row'};
  return null;
 }
 return A.row>B.row?{front:a.id,rear:b.id,kind:'cross_row'}:
   {front:b.id,rear:a.id,kind:'cross_row'};
}
/** Convert *a forecast first physical collision* into a bounded current-
 * state joint longitudinal request on that pair, never a position repair.
 * Neighbor edges remain enforced by A64 (including third-party bodies).
 */
export function step106ConflictFeedbackV3(field,initial,requests,collision,{
 effort=1.1
}={}){
 if(!Array.isArray(requests)||requests.length!==field.states.length||
    !Number.isFinite(effort)||effort<0||effort>3)
  throw Error('A106 invalid collision feedback');
 const order=geometricPrecedence(collision?.pair,initial);
 if(!order)return {requests:requests.map(r=>({...r})),
   actionable:false,reason:'NO_UNAMBIGUOUS_GEOMETRIC_ORDER',
   originalPhysicalMandatory:true};
 const idx=new Map(field.states.map((s,i)=>[s.id,i]));
 const front=field.states[idx.get(order.front)];
 const rear=field.states[idx.get(order.rear)];
 const result=requests.map(r=>({...r}));
 const f=result[idx.get(order.front)],r=result[idx.get(order.rear)];
 // The opposite adjustments are requested, bounded by A64 on execution.
 // If the nominal front has already been overtaken, no swapping of
 // physical state or retroactive priority is permitted.
 f.speed=q(clamp(Math.max(f.speed,front.v+effort),0,50));
 r.speed=q(clamp(Math.min(r.speed,rear.v-effort),6.5,50));
 return {requests:result,actionable:true,frontId:front.id,rearId:rear.id,
   kind:order.kind,actualPhysicalOrderAlreadyReversed:front.x<rear.x-EPS,
   requiredSweptA64Verification:true,originalPhysicalMandatory:true};
}
function perform(field,requests){
 const candidate=structuredClone(field);
 if(requests.length!==candidate.states.length)
   throw Error('A106 incomplete physical command');
 for(let i=0;i<candidate.states.length;i++){
  const s=candidate.states[i],r=requests[i];
  if(s.id!==r.id||![r.speed,r.targetY].every(Number.isFinite)||
     r.speed<0||r.speed>50||r.targetY<0||r.targetY>4.4)
   throw Error('A106 invalid rider physical request');
  s.desired=r.speed;s.targetY=r.targetY;
 }
 const swept=advanceNormalStartV3(candidate);
 if(swept.reason)return {ok:false,physical:swept,reason:swept.reason};
 const gate=step95AchievedMovingGateV3(swept);
 if(!gate.admitted)
  return {ok:false,physical:swept,
    reason:'A106_ACHIEVED_SPEED_VETO',sporting:gate};
 if(swept.acceptedSteps!==field.acceptedSteps+1||
    Math.abs(swept.at-field.at-DT)>EPS)
  throw Error('A106 original physics checkpoint discontinuity');
 return {ok:true,physical:swept};
}
function physicalTube(start,initial,bookings,mode,feedback,{
 ticks=12}={}){
 let field=structuredClone(start),first=null,why=null;
 const samples=[];
 for(let k=0;k<ticks;k++){
  let requests=baseCommands(field,initial,bookings,mode);
  if(feedback?.pair)
    requests=step106ConflictFeedbackV3(field,initial,requests,feedback,{
      effort:feedback.effort??1.1}).requests;
  const r=perform(field,requests);
  if(!r.ok){
   const c=r.physical?.firstCollision;
   why={reason:r.reason,atSeconds:field.at,
     pair:c?.pair??null,contactTime:c?.time??null,
     firstRoadViolation:r.physical?.firstRoadViolation??null};
   break;
  }
  if(k===0)first=requests;
  samples.push({at:r.physical.at,
    rearX:q(Math.min(...r.physical.states.map(s=>s.x))),
    physicalHash:hash(r.physical.states.map(s=>[
      s.id,s.x,s.y,s.v,s.energy?.remainingWPrimeJoules]))});
  field=r.physical;
 }
 return {mode,feedback,acceptedTicks:samples.length,
   lastAcceptedAt:field.at,firstRequests:first,
   firstFailure:why,traceHash:hash(samples),
   actualA64EveryTick:true,
   noPredictedPathCommitted:true,officialWrites:0};
}
/** Bounded time-expanded search: evaluate ORIGINAL A64 futures for each
 * seed (no collision heuristics masquerading as collision-free paths);
 * infer geometric precedence of each genuine forecast contact, re-run
 * full physical tube with that feedback, and select by physically swept
 * accepted ticks, then forward progress. Only one first command is returned.
 */
export function step106ChooseTubeV3(field,initial,bookings,{
 horizonTicks=12,baseModes=['zipper_brake_strict','zipper_window',
    'adaptive'],efforts=[.8,1.5]
}={}){
 validate(field,initial,bookings);
 if(!Number.isInteger(horizonTicks)||horizonTicks<2||
    horizonTicks>16||!Array.isArray(baseModes)||baseModes.length<1||
    baseModes.length>4||!Array.isArray(efforts)||
    efforts.length<1||efforts.length>3||
    efforts.some(e=>!Number.isFinite(e)||e<0||e>3))
  throw Error('A106 invalid bounded physical search');
 const graph=step106TubeConflictsV3(field,initial,{
   horizonSeconds:Math.min(8,horizonTicks*DT)});
 const proposals=[];
 for(const mode of baseModes){
  const base=physicalTube(field,initial,bookings,mode,null,{
    ticks:horizonTicks});
  proposals.push(base);
  if(base.firstFailure?.pair){
   for(const effort of efforts){
    const p=physicalTube(field,initial,bookings,mode,{
      pair:base.firstFailure.pair,effort},{ticks:horizonTicks});
    proposals.push(p);
   }
  }
 }
 proposals.sort((a,b)=>b.acceptedTicks-a.acceptedTicks||
   (a.feedback?1:0)-(b.feedback?1:0)||
   a.mode.localeCompare(b.mode));
 const best=proposals.find(p=>p.firstRequests!==null);
 if(!best)return {status:'NO_A64_ACCEPTED_FIRST_TICK',selected:null,
   proposals:proposals.map(p=>({mode:p.mode,feedback:p.feedback,
     acceptedTicks:p.acceptedTicks,failure:p.firstFailure})),
   graph,officialWrites:0};
 // No forecast may mutate the actual field; FIRST request is again swept
 // by original A64 as if not forecast previously.
 const independentlySwept=perform(field,best.firstRequests);
 if(!independentlySwept.ok)
  throw Error('A106 independent original A64 resweep differs from selected tube');
 const evidence={
  selectedMode:best.mode,selectedFeedback:best.feedback,
  bestPreviewAcceptedTicks:best.acceptedTicks,
  totalPreviewA64Steps:proposals.reduce((n,p)=>n+p.acceptedTicks,0),
  sweptCandidateCount:proposals.length,
  allCandidatesUseOriginalA64:true,
  actualFirstTickResweptIndependently:true,
  predictedStatesDiscarded:true,
  previewHorizonTicks:horizonTicks,
  graphConditionalUnreachable:graph.conditionalUnreachable,
  graphConditionalDeficits:graph.conditionalGapDeficits,
  candidateResults:proposals.map(p=>({
    mode:p.mode,feedback:p.feedback,
    actualPhysicalPrefixTicks:p.acceptedTicks,
    firstPhysicalFailure:p.firstFailure})),
  officialWrites:0
 };
 return {status:'ORIGINAL_A64_RECHECKED_FIRST_TICK',
   selected:independentlySwept.physical,evidence,graph,
   officialWrites:0};
}
export function step106RunPhysicalSpaceTimeV3(initial,bookings,{
 seconds=30,horizonTicks=12,checkpoint=null,
 baseModes=['zipper_brake_strict','zipper_window','adaptive'],
 efforts=[.8,1.5],trace=false
}={}){
 validate(initial,initial,bookings);
 if(!Number.isFinite(seconds)||seconds<.5||seconds>180||
    seconds*2!==Math.round(seconds*2))
  throw Error('A106 invalid requested race horizon');
 const untouched=JSON.stringify([initial,bookings]);
 let current=structuredClone(checkpoint??initial);
 validate(current,initial,bookings);
 const start=current.at,samples=[];
 let rejected=null,proposed=0,discards=0;
 let groups=step101ObserveA64GroupsV3(current);
 for(let k=0;k<seconds*2;k++){
  const choice=step106ChooseTubeV3(current,initial,bookings,{
    horizonTicks,baseModes,efforts});
  proposed+=choice.evidence?.sweptCandidateCount??choice.proposals?.length??0;
  discards+=choice.evidence?.totalPreviewA64Steps??0;
  if(!choice.selected){
   rejected={atSeconds:current.at,reason:choice.status,
     candidates:choice.proposals,
     conditionalImpossiblePairCount:choice.graph.conditionalUnreachable};
   break;
  }
  const actual=choice.selected;
  groups=step101ObserveA64GroupsV3(actual,current);
  samples.push({at:actual.at,
    rearX:q(Math.min(...actual.states.map(s=>s.x))),
    minPhysicalSpeed:q(Math.min(...actual.states.map(s=>s.v))),
    groupCount:groups.groups.length,
    stateHash:hash(actual.states.map(s=>[
      s.id,s.x,s.y,s.v,s.energy?.remainingWPrimeJoules]))});
  current=actual;
 }
 if(JSON.stringify([initial,bookings])!==untouched)
  throw Error('A106 mutated source race fixture');
 return {physical:current,evidence:{
   acceptedSeconds:q(current.at-start),
   requestedSeconds:seconds,fieldSize:current.states.length,
   originalA64AcceptedTicks:samples.length,
   firstRejection:rejected,
   triedPhysicalTubes:proposed,
   discardedA64PreviewTicks:discards,
   fullRequestedHorizonAccepted:samples.length===seconds*2,
   firstGateClearedByAll:current.states.every(s=>s.x>1020),
   secondGateClearedByAll:current.states.every(s=>s.x>1470),
   minimumActualSpeed:samples.length?
     Math.min(...samples.map(s=>s.minPhysicalSpeed)):null,
   groupCount:groups.groups.length,
   pelotonCount:groups.groups.find(g=>g.code==='P')?.riderIds.length??0,
   exactlyEightSecondGroups:groups.groupingThresholdSeconds===8,
   originalA64Unmodified:true,noSpeedGroupLock:true,
   noProductionActivation:true,officialWrites:0,
   full180SportingGO:false,
   traceHash:hash(samples),trace:trace?samples:undefined}};
}
