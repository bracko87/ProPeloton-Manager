/** A64: Offline normal-start, nonclairvoyant sustained peloton research.
 * Not a production race scheduler. No A44 histories or future paths are read.
 * All riders update on the same fixed physical clock and are rejected on
 * the first swept overlap; no teleport, rollback, speed repair or priority IDs.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {upstreamWarningsV3} from './a2UpstreamPredictionV3.mjs'
import {capacityPlanV3,twoSlotStaggerPlanV3} from './a2LaneCapacityPlannerV3.mjs'
import {reserveTwoSlotEntryV3} from './a2TwoSlotReservationsV3.mjs'
import {auditTwoSlotFeasibilityV3} from './a2TwoSlotFeasibilityV3.mjs'
import {adjacentLaneStoppingReserveV3} from './a2CrossRowFollowingV3.mjs'
import {constrainedLaneTargetV3,roadEnvelopeViolationV3,
 researchRoadEnvelopeV3} from './a2VariableRoadWidthV3.mjs'
import {roadWattsRequiredV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts'
import {initializeEnergyBalanceResearchV3,commitAchievedSpeedEnergyV3} from '../../src/race-engine-v3/energyBalanceResearchV3.ts'
const assert=(x,m)=>{if(!x)throw Error(m)}
const round=x=>Math.round(x*1e6)/1e6
const DT=.5,B=.85,A=.45,L=.38,LEAD=1.8
const road={id:'A64_PROVISIONAL_5_LANE',laneCount:5,centerStepM:1.1,lateralCollisionM:.8}
const height=(road.laneCount-1)*road.centerStepM
const clip=(x,a,b)=>Math.min(b,Math.max(a,x))
const watts=(v,steering=false)=>roadWattsRequiredV3(v,83,.36,{gradePercent:0})+(steering?35:0)
const energetic=()=>initializeEnergyBalanceResearchV3({criticalWatts:305,wPrimeJoules:23000})
/** A reproducible ordinary grid, rather than an alert-time state.
 * Tempered and mixed starts share exactly the same geometric initial grid.
 */
export function createNormalStartV3(n,{mode='tempered',mirror=false,renamed=false,
 controllerPolicy='legacy',headwayStandOffM=4.5,roadGeometry='constant',
 roadMergePolicy='preview_only',bodyHalfWidthM=0}={}){
 assert([8,32,106,168].includes(n)&&['tempered','mixed','pressure','corridor'].includes(mode)&&
 ['legacy','coordinated_headway','coordinated_demand','coordinated_either'].includes(controllerPolicy)&&
 [3.2,3.8,4.5].includes(headwayStandOffM)&&
 ['constant','mild_pinch','strong_pinch'].includes(roadGeometry)&&
 [0,.3,.4].includes(bodyHalfWidthM)&&
 ['preview_only','buffered_headway','yield_reservation','platoon_soft_yield','platoon_chain','platoon_lane_forecast',
 'platoon_lane_forecast_chain','platoon_lane_forecast_buffer',
 'platoon_velocity_headway','platoon_capacity_hold',
 'platoon_capacity_wave','platoon_two_slot_stagger',
 'platoon_two_slot_wave','platoon_two_slot_extended',
 'platoon_two_slot_hazard_hold','platoon_space_time_reservation',
 'platoon_no_yield_control','platoon_space_time_admission','platoon_gate_schedule',
 'platoon_gate_crossrow',
 'platoon_gate_pairwise','platoon_gate_pairwise_gentle','platoon_gate_interval55','platoon_gate_interval60','platoon_gate_interval65','platoon_gate_interval70','platoon_gate_frontload','platoon_gate_balanced'].includes(roadMergePolicy),
 'A68 unknown normal-start scenario, policy or road geometry')
 const starts=[]
 for(let i=0;i<n;i++){
  const activeLanes=mode==='corridor'?3:5
  const row=Math.floor(i/activeLanes),lane=mode==='corridor'?1+i%3:i%5
  const id='r'+String(i).padStart(3,'0')
  const gridX=600-row*5.2
  const v=mode==='tempered'?9.0+(i%3)*.02:
   ['mixed','corridor'].includes(mode)?8.45+((i*7)%9)*.14:8.2+((i*11)%13)*.20
  const desired=mode==='tempered'?9.05:
    ['mixed','corridor'].includes(mode)?8.6+((i*7)%9)*.14:8.3+((i*11)%13)*.20
  starts.push({id:renamed?'z'+String(n-i).padStart(4,'0'):id,
   x:round(gridX),y:round(lane*road.centerStepM),
   v:round(v),desired:round(desired),targetY:round(lane*road.centerStepM),
   energy:energetic(),startOrder:i,startX:gridX})
 }
 if(mirror)for(const s of starts){s.y=round(height-s.y);s.targetY=s.y}
 // A73 one-time timetable, derived from *only the initial field*.
 // Snapshotting it preserves exact recovery and prevents opportunistic
 // hindsight replanning after a failed narrowing attempt.
 const feasibility=['platoon_gate_schedule','platoon_gate_crossrow',
 'platoon_gate_pairwise','platoon_gate_pairwise_gentle','platoon_gate_interval55','platoon_gate_interval60','platoon_gate_interval65','platoon_gate_interval70','platoon_gate_frontload','platoon_gate_balanced']
  .includes(roadMergePolicy)?
  auditTwoSlotFeasibilityV3(starts,roadGeometry,{
   halfBikeM:bodyHalfWidthM,minSpeedMps:5,
   slotSpacingSeconds:roadMergePolicy==='platoon_gate_interval55'?.55:
    roadMergePolicy==='platoon_gate_interval60'?.60:
    roadMergePolicy==='platoon_gate_interval65'?.65:
    roadMergePolicy==='platoon_gate_interval70'?.70:.5,
   slotSpacingProfile:roadMergePolicy==='platoon_gate_frontload'?'front_loaded':
    roadMergePolicy==='platoon_gate_balanced'?'balanced':'uniform'}):null
 return {version:1,road:{...road},dt:DT,at:0,states:starts,
  roadGateStatus:feasibility?.status??null,
  roadGateBookings:feasibility?.bookings.map(b=>({
   id:b.id,slot:b.slot,scheduledSeconds:b.scheduledSeconds,
   targetY:b.targetY,gateX:b.gateX}))??null,
  controllerPolicy,headwayStandOffM,roadGeometry,roadMergePolicy,bodyHalfWidthM,
  acceptedSteps:0,pairChecks:0,brakeEvents:0,steerEvents:0,
  initiatedLaneChanges:0,completedLaneChanges:0,
  nearStops:0,lowestSpeed:Infinity,maxSpeed:0,
  negotiatedHeadwayPairTicks:0,headwayLimitedRiderTicks:0,
  roadBoundaryGuardTicks:0,roadMergeBufferedRiderTicks:0,
  roadMergeYieldRiderTicks:0,roadPlatoonAssistRiderTicks:0,
  roadPlatoonUnresolvedConstraints:0,roadLaneForecastGuardTicks:0,
  roadVelocityHeadwayTicks:0,roadCapacityHoldRiderTicks:0,
  roadCapacityPaceLimitedRiderTicks:0,
  roadTwoSlotStaggerRiderTicks:0,
  roadSlotReservationRiderTicks:0,roadSlotPaceWarningRiderTicks:0,
  roadSlotCrossRowHoldRiderTicks:0,
  roadGateWindowRiderTicks:0,roadGateLateralHoldRiderTicks:0,
  roadGateLateWindowRiderTicks:0,
  roadGateCrossRowWarningRiderTicks:0,
  roadGateSelectiveGapWarningTicks:0,
  firstRoadViolation:null,
  cumulativeAdvancement:0,firstCollision:null,reason:null,
  source:'PHYSICAL_NORMAL_GRID_NO_RETROSPECTIVE_WARNING'}
}
function checkSnapshot(p){
 assert(p?.dt===DT&&p?.road?.id===road.id&&Number.isInteger(p.acceptedSteps)&&
  p.states?.length>=2&&p.states?.length<=168,'A64 invalid checkpoint')
 assert(Math.abs(p.at-p.acceptedSteps*DT)<1e-6,'A64 time discontinuity')
 assert(['legacy','coordinated_headway','coordinated_demand','coordinated_either'].includes(p.controllerPolicy??'legacy')&&
  [3.2,3.8,4.5].includes(p.headwayStandOffM??4.5)&&
  ['constant','mild_pinch','strong_pinch'].includes(p.roadGeometry??'constant')&&
  [0,.3,.4].includes(p.bodyHalfWidthM??0)&&
  ['preview_only','buffered_headway','yield_reservation','platoon_soft_yield','platoon_chain','platoon_lane_forecast',
  'platoon_lane_forecast_chain','platoon_lane_forecast_buffer',
  'platoon_velocity_headway','platoon_capacity_hold',
  'platoon_capacity_wave','platoon_two_slot_stagger',
  'platoon_two_slot_wave','platoon_two_slot_extended',
  'platoon_two_slot_hazard_hold','platoon_space_time_reservation',
  'platoon_no_yield_control','platoon_space_time_admission','platoon_gate_schedule',
  'platoon_gate_crossrow',
 'platoon_gate_pairwise','platoon_gate_pairwise_gentle','platoon_gate_interval55','platoon_gate_interval60','platoon_gate_interval65','platoon_gate_interval70','platoon_gate_frontload','platoon_gate_balanced'].includes(p.roadMergePolicy??'preview_only'),
  'A65 invalid controller policy')
 const ids=new Set()
 for(const s of p.states){
  assert(!ids.has(s.id),'A64 duplicate rider')
  ids.add(s.id)
  assert(s.v>=0&&s.v<=50&&s.y>=-1e-6&&s.y<=height+1e-6&&
   s.energy.remainingWPrimeJoules>=0,'A64 invalid physical rider')
 }
}
/** Purely current-state neighbor corridor check before beginning a pass.
 * Does not guess future accepted positions or use rider order/identity.
 */
function chooseLane(s,states,{intentMode='actual'}={}){
 // A66 candidate: continue to seek passing corridors after physically
 // bounded following has already reduced the rider's current velocity.
 // Speed desire is present-time rider intent, not a future accepted path.
 assert(['actual','demand','either'].includes(intentMode),'A66 invalid lane intent')
 if(Math.abs(s.targetY-s.y)>1e-5)return s.targetY
 const sameLane=states.filter(t=>t!==s&&t.x>s.x&&
  Math.abs(t.y-s.y)<road.lateralCollisionM)
 const ahead=sameLane.sort((a,b)=>a.x-b.x)[0]
 const currentDemand=s.v>ahead?.v+.20
 const sustainedDemand=s.desired>ahead?.desired+.20
 const wishesPass=intentMode==='actual'?currentDemand:
  intentMode==='demand'?sustainedDemand:
  (currentDemand||sustainedDemand)
 if(!ahead||ahead.x-s.x>26||!wishesPass)return s.targetY
 const candidates=[s.y-road.centerStepM,s.y+road.centerStepM]
 .filter(y=>y>=-1e-6&&y<=height+1e-6)
 .map(y=>({y,margin:Math.min(...states.filter(t=>t!==s&&
   Math.abs(t.y-y)<road.lateralCollisionM+1e-7)
   .map(t=>Math.abs(t.x-s.x)),Infinity)}))
 .filter(x=>x.margin>=9)
 .sort((a,b)=>b.margin-a.margin)
 // Equal openings must not prefer a hard-coded physical side. A mirror-
 // invariant controller stays in lane until one corridor has an advantage.
 if(candidates.length>1&&(candidates[0].margin===candidates[1].margin||
  Math.abs(candidates[0].margin-candidates[1].margin)<1e-7))
  return s.targetY
 return candidates[0]?.y??s.targetY
}
/** One synchronized 0.5-second move. The full proposed field is swept
 * before any rider is committed. On contact, return a fail-closed record.
 */
export function advanceNormalStartV3(snapshot){
 const p=structuredClone(snapshot);checkSnapshot(p)
 assert(p.reason===null,'A64 cannot restart rejected field')
 if(['platoon_gate_schedule','platoon_gate_crossrow',
 'platoon_gate_pairwise','platoon_gate_pairwise_gentle','platoon_gate_interval55','platoon_gate_interval60','platoon_gate_interval65','platoon_gate_interval70','platoon_gate_frontload','platoon_gate_balanced']
  .includes(p.roadMergePolicy)){
  const booked=p.roadGateBookings
  const ids=new Set(p.states.map(s=>s.id))
  const seen=new Set()
  const invalid=p.roadGateStatus!=='NECESSARY_WINDOWS_EXIST'||
   !Array.isArray(booked)||booked.length!==p.states.length||
   booked.some(b=>{
    if(!b||typeof b.id!=='string'||!ids.has(b.id)||
     seen.has(b.id)||!Number.isFinite(b.scheduledSeconds)||
     b.scheduledSeconds<0||b.scheduledSeconds>120||
     !Number.isFinite(b.targetY)||b.targetY<0||b.targetY>height||
     b.gateX!==780||
     !['LEFT','RIGHT','CENTER_AFTER_FLANKS'].includes(b.slot))
     return true
    seen.add(b.id)
    return false
   })
  if(invalid){
   p.reason='GATE_ENTRY_NO_WINDOW'
   return p
  }
 }
 const byId=new Map(p.states.map(s=>[s.id,s]))
 let forecastGuardCount=0,capacityHoldCount=0,capacityPaceCount=0,
  twoSlotCount=0,slotAdmissionCount=0,slotWaveCount=0,
  crossRowHoldCount=0,gateCount=0,gateHoldCount=0,gateLateCount=0,
  gateCrossRowCount=0,gateSelectiveCount=0
 const capacityMode=['platoon_capacity_hold','platoon_capacity_wave']
  .includes(p.roadMergePolicy)&&(p.roadGeometry??'constant')!=='constant'
 const capacityDecisions=capacityMode?new Map(capacityPlanV3(
  p.states,p.roadGeometry,{groupPace:p.roadMergePolicy==='platoon_capacity_wave'?
   'local_wave':'none'}).map(d=>[d.id,d])):new Map()
 // A71 opt-in stagger: a physically meaningful 2-slot pinch needs a
 // longitudinal offset for the centre rider before the flanks converge.
 // Planner reads only current x/y/v and fixed geographic road shape.
 const twoSlotMode=['platoon_two_slot_stagger','platoon_two_slot_wave',
  'platoon_two_slot_extended','platoon_two_slot_hazard_hold']
  .includes(p.roadMergePolicy)&&
  (p.roadGeometry??'constant')!=='constant'
 const twoSlotDecisions=twoSlotMode?new Map(twoSlotStaggerPlanV3(
  p.states,p.roadGeometry,{bodyHalfWidthM:p.bodyHalfWidthM??0,
   cohortWave:['platoon_two_slot_wave','platoon_two_slot_extended',
    'platoon_two_slot_hazard_hold']
    .includes(p.roadMergePolicy),
   lookaheadSeconds:['platoon_two_slot_extended','platoon_two_slot_hazard_hold']
    .includes(p.roadMergePolicy)?28:20,
   communicationRangeM:['platoon_two_slot_extended','platoon_two_slot_hazard_hold']
    .includes(p.roadMergePolicy)?120:85})
  .map(d=>[d.id,d])):new Map()
 // A72: current-position/starting-row reservation of the two safe lateral
 // slots in a 2.2m road. Pure guidance: every accepted x/y is still bounded
 // and swept. No rider ID, future accepted path or game engine integration.
 const reservationMode=['platoon_space_time_reservation',
  'platoon_space_time_admission'].includes(p.roadMergePolicy)&&
  p.roadGeometry==='strong_pinch'&&(p.bodyHalfWidthM??0)>=.3
 const reserved=reservationMode?reserveTwoSlotEntryV3(
  p.states,p.roadGeometry,{bodyHalfWidthM:p.bodyHalfWidthM,
   crossRowPolicy:p.roadMergePolicy==='platoon_space_time_admission'?
    'defer':'pace'}):null
 const reserveById=new Map(reserved?.decisions.map(d=>[d.id,d])??[])
 const gateBookings=new Map(p.roadGateBookings?.map(b=>[b.id,b])??[])
 const plans=p.states.map(s=>{
  const intentMode=p.controllerPolicy==='coordinated_demand'?'demand':
   p.controllerPolicy==='coordinated_either'?'either':'actual'
  let desired=chooseLane(s,p.states,{intentMode})
  const gate=gateBookings.get(s.id)
  if(['platoon_gate_schedule','platoon_gate_crossrow',
 'platoon_gate_pairwise','platoon_gate_pairwise_gentle','platoon_gate_interval55','platoon_gate_interval60','platoon_gate_interval65','platoon_gate_interval70','platoon_gate_frontload','platoon_gate_balanced']
   .includes(p.roadMergePolicy)&&gate&&s.x<1020){
   // Known geometric two-slot corridor, not an accepted movement.
   // The following central rider must first fall longitudinally behind
   // both side riders. Deny a discretionary new pass during the funnel.
   desired=s.y
   if(gate.slot==='LEFT'||gate.slot==='RIGHT'){
    const relevant=p.states.filter(t=>t.id!==s.id&&
     Math.abs(t.y-2.2)<.46&&Math.abs(t.x-s.x)<2.35)
    const center=p.states.find(t=>t.startX===s.startX&&
     Math.abs(t.y-2.2)<.46)
    const ownClear=!center||s.x-center.x>=2.35
    if(ownClear&&!relevant.length)desired=gate.targetY
    else gateHoldCount++
   }
   gateCount++
   if(p.at>gate.scheduledSeconds+.5&&s.x<gate.gateX)
    gateLateCount++
  }
  const slot=reserveById.get(s.id)
  if(slot?.requiredTwoSlots){
   // No speculative new passes in the reserved funnel. For flank riders,
   // move towards one of the TWO physical slots only after a real 2.6m
   // longitudinal offset separates this rider from the centre of its row.
   // Centre rider stays in its physical current lane and adjusts pace.
   desired=slot.sideMoveAuthorized?slot.lateralTargetY:s.y
   slotAdmissionCount++
   if(slot.queueWave)slotWaveCount++
   if(slot.crossRowHold)crossRowHoldCount++
  }
  const geometry=p.roadGeometry??'constant'
  if(p.roadMergePolicy==='platoon_two_slot_hazard_hold'&&
   geometry==='strong_pinch'&&Math.abs(s.targetY-s.y)<1e-5){
   // A71: known spatial narrowing is a temporary no-new-pass zone.
   // Existing necessary inward steering still follows the body-wide
   // road envelope. No artificial lane changes or motion rollback.
   const imminent=Math.min(...[0,5,10,15,20,25].map(t=>
    researchRoadEnvelopeV3(geometry,s.x+s.v*t).widthM))<4.4-1e-5
   if(imminent)desired=s.y
  }
  const laneForecast=['platoon_lane_forecast','platoon_lane_forecast_chain',
   'platoon_lane_forecast_buffer','platoon_velocity_headway',
   'platoon_capacity_hold','platoon_capacity_wave',
   'platoon_two_slot_stagger','platoon_two_slot_wave',
   'platoon_two_slot_extended','platoon_two_slot_hazard_hold',
   'platoon_space_time_reservation','platoon_no_yield_control',
   'platoon_space_time_admission','platoon_gate_schedule',
   'platoon_gate_crossrow',
 'platoon_gate_pairwise','platoon_gate_pairwise_gentle','platoon_gate_interval55','platoon_gate_interval60','platoon_gate_interval65','platoon_gate_interval70','platoon_gate_frontload','platoon_gate_balanced'].includes(p.roadMergePolicy)
  if(laneForecast&&geometry!=='constant'){
   // A69: do not enter an overtaking lane known from current, static
   // road geometry to disappear within 20 seconds at current speed.
   // This is geographic foresight, NEVER a future accepted rider path.
   // It is symmetrical and id-free. Only the desired target is changed.
   const samples=[0,5,10,15,20].map(t=>
    researchRoadEnvelopeV3(geometry,s.x+s.v*t))
   const lo=Math.max(...samples.map(e=>e.minY))
   const hi=Math.min(...samples.map(e=>e.maxY))
   if(desired<lo-1e-7||desired>hi+1e-7){
    desired=clip(s.y,lo,hi)
    forecastGuardCount++
   }
  }
  const decision=capacityDecisions.get(s.id)
  if(decision?.hold){
   // A70 capacity admission: retain this rider's CURRENT usable lateral
   // corridor before the known static road narrows. Every future step is
   // still swept for both bicycle overlaps and the actual road boundary.
   if(Math.abs(desired-s.y)>1e-7)capacityHoldCount++
   desired=s.y
  }
  if(decision?.paceLimited)capacityPaceCount++
  const corridor=constrainedLaneTargetV3(geometry,
   s.x,s.v,desired,{previewSeconds:
    ['platoon_two_slot_extended','platoon_two_slot_hazard_hold',
     'platoon_space_time_reservation','platoon_no_yield_control',
     'platoon_space_time_admission','platoon_gate_schedule',
     'platoon_gate_crossrow',
 'platoon_gate_pairwise','platoon_gate_pairwise_gentle','platoon_gate_interval55','platoon_gate_interval60','platoon_gate_interval65','platoon_gate_interval70','platoon_gate_frontload','platoon_gate_balanced'].includes(p.roadMergePolicy)?8:4,
    bodyHalfWidthM:p.bodyHalfWidthM??0})
  const target=corridor.targetY
  const y1=round(s.y+clip(target-s.y,-L*DT,L*DT))
  const staggerDecision=twoSlotDecisions.get(s.id)
  if(staggerDecision?.staggerRequested&&
   staggerDecision.speedRequest<s.desired-1e-8)twoSlotCount++
  const gateRemaining=gate?gate.scheduledSeconds-p.at:null
  const schedulePace=gate&&['platoon_gate_schedule','platoon_gate_crossrow',
 'platoon_gate_pairwise','platoon_gate_pairwise_gentle','platoon_gate_interval55','platoon_gate_interval60','platoon_gate_interval65','platoon_gate_interval70','platoon_gate_frontload','platoon_gate_balanced']
   .includes(p.roadMergePolicy)&&s.x<gate.gateX&&gateRemaining>DT?
   Math.max(5,Math.min(s.desired,(gate.gateX-s.x)/gateRemaining)):
   s.desired
  // Opt-in A73 cross-row early gap reserve: current, slower centre
  // riders are accounted for BEFORE the 1.8m swept overlap threshold.
  let crossRowSpeed=s.desired
  if(p.roadMergePolicy==='platoon_gate_crossrow'&&gate&&
   ['LEFT','RIGHT'].includes(gate.slot)&&s.x<gate.gateX){
   const ahead=p.states.filter(t=>t.id!==s.id&&t.x>s.x&&
    t.x-s.x<=30&&Math.abs(t.y-2.2)<.46)
    .sort((a,b)=>a.x-b.x)[0]
   if(ahead){
    const gap=ahead.x-s.x
    const closing=Math.max(0,s.v-ahead.v)
    const targetGap=2.35+3*closing+closing*closing/(2*B)
    crossRowSpeed=Math.min(crossRowSpeed,
     ahead.v+clip((gap-targetGap)/2,-2,1))
    if(crossRowSpeed<s.desired-1e-7)gateCrossRowCount++
   }
  }
  const actualSpeedRequest=Math.max(0,Math.min(
   decision?.speedRequest??s.desired,
   staggerDecision?.speedRequest??s.desired,
   slot?.requestedPaceMps??s.desired,schedulePace,crossRowSpeed))
  const accel=clip((actualSpeedRequest-s.v)/DT,-B,A)
  return {id:s.id,accel,y1,target,oldTarget:s.targetY,
   roadGuard: corridor.changed}
 })
 // A68: nonclairvoyant zipper admission. A lateral move toward another
 // rider's occupied corridor may be blocked when their current x gap is
 // insufficient. A trailing requester yields bounded acceleration, allowing
 // an actual gap to develop before retrying. No ID/array-position priority,
 // velocity reset or instantaneous lateral relocation.
 const chainMode=['platoon_soft_yield','platoon_chain','platoon_lane_forecast',
  'platoon_lane_forecast_chain','platoon_lane_forecast_buffer',
  'platoon_velocity_headway','platoon_capacity_hold',
  'platoon_capacity_wave','platoon_two_slot_stagger',
  'platoon_two_slot_wave','platoon_two_slot_extended',
  'platoon_two_slot_hazard_hold'].includes(p.roadMergePolicy)
 const mergeYield=(p.roadMergePolicy==='yield_reservation'||chainMode)&&
  (p.roadGeometry??'constant')!=='constant'
 const forcedYield=new Set()
 let mergeYieldCount=0
 if(mergeYield){
  for(const a of plans){
   const s=byId.get(a.id)
   if(Math.abs(a.y1-s.y)<=1e-9)continue
   for(const t of p.states){
    if(t.id===s.id)continue
    const present=Math.abs(s.y-t.y)
    const proposed=Math.abs(a.y1-t.y)
    if(present<=road.lateralCollisionM+1e-7||
       proposed>=present-1e-8||
       proposed>road.lateralCollisionM+L*DT+.10||
       Math.abs(t.x-s.x)>=7.0)continue
    // Hold the *current* physical lateral coordinate, rather than
    // stealing space from a rider whose presence is already known.
    a.y1=s.y
    a.target=s.targetY
    mergeYieldCount++
    if(s.x<t.x-1e-7)forcedYield.add(s.id)
    break
   }
  }
 }
 // A65 experimental dense-field following: compute a simultaneous plan
 // using only the CURRENT state and this step's lateral intentions. Process
 // from ahead to rear, so a follower knows the leader's already-limited
 // acceleration. No hard-coded rider IDs, future accepted paths or repair.
 const coordinated=['coordinated_headway','coordinated_demand','coordinated_either'].includes(p.controllerPolicy)
 // Previously: a blocked outside cyclist always braked at the physical
 // limit. Such discontinuous commands compressed an entire following chain.
 // New opt-in platoon candidates instead negotiate speed from actual leader
 // states, reserving -0.85 only when the headway requires it.
 const commanded=new Map(plans.map(a=>[a.id,
  forcedYield.has(a.id)&&!chainMode?-B:a.accel]))
 let negotiatedHeadway=0,headwayLimited=0,bufferedHeadway=0,velocityHeadway=0
 if(coordinated){
  const intents=new Map(plans.map(a=>[a.id,a]))
  const frontFirst=[...p.states].sort((a,b)=>b.x-a.x)
  for(const s of frontFirst){
   const a=intents.get(s.id)
   const ahead=frontFirst.filter(t=>{
    if(t.x<=s.x+1e-9)return false // no ID-based priority on same row
    const b=intents.get(t.id)
    const lateral0=s.y-t.y,lateral1=a.y1-b.y1
    return Math.abs(lateral0)<=p.road.lateralCollisionM+1e-7||
     Math.abs(lateral1)<=p.road.lateralCollisionM+1e-7||
     lateral0*lateral1<0 // projected lateral crossing
   }).sort((a,b)=>a.x-b.x)[0]
   if(!ahead)continue
   const gap=ahead.x-s.x
   const leaderAccel=commanded.get(ahead.id)
   // Ahead-of-position spatial road-width forecast provides extra
   // cooperative following room before a narrowing lane disappears.
   // This changes only commanded bounded acceleration, never x/y state.
   const previewX=s.x+s.v*8
   const projectedWidth=researchRoadEnvelopeV3(
    p.roadGeometry??'constant',previewX).widthM
   const missingWidth=Math.max(0,4.4-projectedWidth)
   const farBuffer=p.roadMergePolicy==='platoon_lane_forecast_buffer'
   const predictedWidth=farBuffer?Math.min(...[0,5,10,15,20].map(t=>
    researchRoadEnvelopeV3(p.roadGeometry??'constant',s.x+s.v*t).widthM)):
    projectedWidth
   const bufferableMissing=Math.max(0,4.4-predictedWidth)
   const buffered=(p.roadMergePolicy==='buffered_headway'||
    (chainMode&&s.x<780))?
    2.4*bufferableMissing/1.1:0
   if(buffered>1e-8)bufferedHeadway++
   let targetGap=(p.headwayStandOffM??4.5)+buffered
   if(['platoon_gate_pairwise','platoon_gate_pairwise_gentle','platoon_gate_interval55','platoon_gate_interval60','platoon_gate_interval65','platoon_gate_interval70','platoon_gate_frontload','platoon_gate_balanced']
    .includes(p.roadMergePolicy)&&s.x<780){
    const active=adjacentLaneStoppingReserveV3(s,ahead,{
     mode:p.roadMergePolicy==='platoon_gate_pairwise_gentle'?'gentle':'selective',
     baseGapM:targetGap,lateralContactM:p.road.lateralCollisionM})
    if(active.active){targetGap=active.gapM;gateSelectiveCount++}
   }
   if(p.roadMergePolicy==='platoon_velocity_headway'){
    // A69: time-headway and differential stopping distance, computed
    // only from current velocity and bounded CURRENT commands. The
    // warning scales with relative closing speed, avoiding a fixed
    // following gap that becomes unrecoverable after lead deceleration.
    const closing=Math.max(0,s.v-ahead.v,
     (s.v+commanded.get(s.id)*DT)-(ahead.v+leaderAccel*DT))
    const stoppingReserve=2.05+2.5*closing+closing*closing/(2*B)
    targetGap=Math.max(targetGap,stoppingReserve)
    if(stoppingReserve>(p.headwayStandOffM??4.5)+1e-7)velocityHeadway++
   }
   const targetV=ahead.v+clip((gap-targetGap)/1.5,-2,2)
   const requested=clip((targetV-s.v)/DT,-B,A)
   // 2.05 m conservative end-of-step clearance; +.25m beyond bike length.
   // The formula includes actual bounded lead acceleration, unlike the
   // fixed-leader A61 rear-only alarm. It cannot override brake limits.
   const maxSafe=leaderAccel+2*(gap-2.05+(ahead.v-s.v)*DT)/(DT*DT)
   const limited=Math.max(-B,Math.min(commanded.get(s.id),requested,maxSafe))
   if(limited<commanded.get(s.id)-1e-9){
    commanded.set(s.id,limited);headwayLimited++
   }
   negotiatedHeadway++
  }
 }
 // A69 experimental multi-rider coupling, still research-only:
 // all constraints depend solely on CURRENT x/y/v and this step's proposed
 // lateral corridors. A leader may increase acceleration (at most +.45)
 // to make room for a rear rider already braking, provided that leader's
 // own ahead clearance remains physically possible. Repeat downstream
 // brake and upstream assist until constraints settle, never teleport.
 let platoonAssists=0,unresolvedConstraints=0
 if(['platoon_chain','platoon_lane_forecast_chain'].includes(p.roadMergePolicy)&&mergeYield){
  const intentById=new Map(plans.map(a=>[a.id,a]))
  const sorted=[...p.states].sort((a,b)=>b.x-a.x)
  const pairs=[]
  for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){
   const lead=sorted[i],rear=sorted[j]
   if(lead.x-rear.x>12)break
   const a=intentById.get(lead.id),b=intentById.get(rear.id)
   if(!a||!b)continue
   const overlap=Math.abs(lead.y-rear.y)<road.lateralCollisionM+.4||
    Math.abs(a.y1-b.y1)<road.lateralCollisionM+.4||
    Math.abs(a.target-b.target)<road.lateralCollisionM+.4
   if(overlap)pairs.push({lead,rear})
  }
  // Work with the entire physical chain, not a rider-specific exception.
  // In each pass prioritize applying needed leader acceleration to avoid
  // a follower that has exhausted braking authority. Then re-limit any
  // rear rider following a newly accelerated (or constrained) leader.
  for(let iteration=0;iteration<4;iteration++){
   let changed=false
   for(const {lead,rear} of [...pairs].reverse()){
    const gap=lead.x-rear.x
    const safe=2.05
    const closing=rear.v-lead.v
    const aRear=commanded.get(rear.id)
    const aLead=commanded.get(lead.id)
    const requiredLead=aRear+2*(safe-gap+closing*DT)/(DT*DT)
    if(requiredLead>aLead+1e-8){
     const proposed=clip(requiredLead,-B,A)
     if(proposed>aLead+1e-8){
      commanded.set(lead.id,proposed)
      platoonAssists++;changed=true
     }
    }
   }
   for(const {lead,rear} of pairs){
    const gap=lead.x-rear.x
    const maxRear=commanded.get(lead.id)+
     2*(gap-2.05+(lead.v-rear.v)*DT)/(DT*DT)
    const current=commanded.get(rear.id)
    if(current>maxRear+1e-8){
     const proposed=Math.max(-B,maxRear)
     if(proposed<current-1e-8){
      commanded.set(rear.id,proposed);changed=true
     }
    }
   }
   if(!changed)break
  }
  unresolvedConstraints=pairs.filter(({lead,rear})=>{
   const separation=lead.x-rear.x+(lead.v-rear.v)*DT+
    .5*(commanded.get(lead.id)-commanded.get(rear.id))*DT*DT
   return separation<2.05-1e-7
  }).length
 }
 const warnings=coordinated?null:
  upstreamWarningsV3(p.states,plans,p.road,DT,{lookaheadSeconds:3})
 const brakes=new Set(warnings?.brakeRiders??[])
 const paths=plans.map(a=>{
  const s=byId.get(a.id)
  const accel=coordinated?commanded.get(a.id):
   brakes.has(a.id)?-B:a.accel
  const nextV=Math.max(0,s.v+accel*DT)
  const travel=Math.max(0,s.v*DT+.5*accel*DT*DT)
  return {s,a,accel,x1:s.x+travel,y1:a.y1,v1:nextV,
   xAt:t=>s.x+s.v*t+.5*accel*t*t,
   yAt:t=>s.y+(a.y1-s.y)*t/DT}
 })
 const pieces=16,h=DT/pieces
 let checked=0,first=null
 // Chronological all-pair conservative sweep, not lexical priority.
 for(let k=0;k<pieces&&!first;k++){
  const t0=k*h,t1=(k+1)*h
  for(let i=0;i<paths.length&&!first;i++)for(let j=i+1;j<paths.length;j++){
   const a=paths[i],b=paths[j]
   const xEarly=Math.abs(a.xAt(t0)-b.xAt(t0))
   if(xEarly>LEAD+Math.max(a.s.v,b.s.v)*h+1)continue
   const yEarly=Math.abs(a.yAt(t0)-b.yAt(t0))
   if(yEarly>road.lateralCollisionM+2*L*h+.01)continue
   checked++
   if(continuousBicycleCollisionV3(
    {x0:a.xAt(t0),x1:a.xAt(t1),y0:a.yAt(t0),y1:a.yAt(t1)},
    {x0:b.xAt(t0),x1:b.xAt(t1),y0:b.yAt(t0),y1:b.yAt(t1)},
    {longitudinal:LEAD+(Math.abs(a.accel)+Math.abs(b.accel))*h*h/8+1e-5,
     lateral:road.lateralCollisionM+1e-5})){
     first={pair:[a.s.id,b.s.id].sort(),time:round(p.at+t0),
      step:p.acceptedSteps,withinStep:k}
     // A68 forensic-only evidence from the rejected physical step.
     // No path alteration or retroactive contact resolution is permitted.
     if((p.roadGeometry??'constant')!=='constant'){
      const describe=q=>({
       id:q.s.id,xStart:round(q.s.x),yStart:round(q.s.y),
       speedStartMps:round(q.s.v),commandAcceleration:round(q.accel),
       speedRequestedMps:round(q.s.desired),
       currentTargetY:round(q.s.targetY),
       stepTargetY:round(q.y1),
       crossingX:round(q.xAt(t0)),crossingY:round(q.yAt(t0)),
       roadAtCrossing:researchRoadEnvelopeV3(p.roadGeometry,q.xAt(t0))
      })
      first.preCollisionField={riders:[describe(a),describe(b)],
       deltaStartX:round(a.s.x-b.s.x),
       deltaStartY:round(a.s.y-b.s.y),
       deltaAtContactX:round(a.xAt(t0)-b.xAt(t0)),
       deltaAtContactY:round(a.yAt(t0)-b.yAt(t0)),
       actualLateralM:round(Math.abs(a.yAt(t0)-b.yAt(t0))),
       actualLongitudinalM:round(Math.abs(a.xAt(t0)-b.xAt(t0)))}
     }
     }
  }
 }
 if(first){p.firstCollision=first;p.reason='SWEPT_CONTACT';return p}
 // A68 independent spatial road-boundary sweep: evaluate all riders'
 // continuous accepted motion at each 1/16th physical step and midpoint.
 // A failure rejects the WHOLE proposed field before any energy or x/y
 // movement is committed. No teleport/clamp or relaxed collision check.
 for(let k=0;k<pieces;k++){
  for(const fraction of [0,.5,1]){
   const t=(k+fraction)*h
   for(const path of paths){
    const x=path.xAt(t),y=path.yAt(t)
    const failure=roadEnvelopeViolationV3(
     p.roadGeometry??'constant',x,y,
     {bodyHalfWidthM:p.bodyHalfWidthM??0})
    if(failure){
     p.firstRoadViolation={riderId:path.s.id,
      time:round(p.at+t),withinStep:k+fraction,...failure}
     p.reason='ROAD_ENVELOPE_VIOLATION'
     return p
    }
   }
  }
 }
 // Reject without committing anything if physically required watts exceed
 // W-prime. Future stages must also model critical-power-limited acceleration.
 const updates=[]
 for(const a of paths){
  let energy
  try{
   energy=commitAchievedSpeedEnergyV3(a.s.energy,DT,
    (a.x1-a.s.x)/DT,v=>watts(v,Math.abs(a.y1-a.s.y)>1e-7))
  }catch(error){
   p.reason='ENERGY_FAILED';p.energyFailure=String(error.message)
   return p
  }
  updates.push({...a.s,x:round(a.x1),y:round(a.y1),v:round(a.v1),
   targetY:round(a.a.target),energy})
 }
 p.states=updates;p.at=round(p.at+DT);p.acceptedSteps++
 p.pairChecks+=checked
 p.brakeEvents+=coordinated?paths.filter(a=>a.accel<-.05).length:brakes.size
 p.headwayLimitedRiderTicks=(p.headwayLimitedRiderTicks??0)+headwayLimited
 p.negotiatedHeadwayPairTicks=(p.negotiatedHeadwayPairTicks??0)+negotiatedHeadway
 p.steerEvents+=paths.filter(a=>Math.abs(a.y1-a.s.y)>1e-7).length
 p.roadBoundaryGuardTicks+=plans.filter(a=>a.roadGuard).length
 p.roadMergeBufferedRiderTicks+=bufferedHeadway
 p.roadMergeYieldRiderTicks+=mergeYieldCount
 p.roadPlatoonAssistRiderTicks+=platoonAssists
 p.roadPlatoonUnresolvedConstraints+=unresolvedConstraints
 p.roadLaneForecastGuardTicks+=forecastGuardCount
 p.roadVelocityHeadwayTicks+=velocityHeadway
 p.roadCapacityHoldRiderTicks+=capacityHoldCount
 p.roadCapacityPaceLimitedRiderTicks+=capacityPaceCount
 p.roadTwoSlotStaggerRiderTicks+=twoSlotCount
 p.roadSlotReservationRiderTicks+=slotAdmissionCount
 p.roadSlotPaceWarningRiderTicks+=slotWaveCount
 p.roadSlotCrossRowHoldRiderTicks+=crossRowHoldCount
 p.roadGateWindowRiderTicks+=gateCount
 p.roadGateLateralHoldRiderTicks+=gateHoldCount
 p.roadGateLateWindowRiderTicks+=gateLateCount
 p.roadGateCrossRowWarningRiderTicks+=gateCrossRowCount
 p.roadGateSelectiveGapWarningTicks+=gateSelectiveCount
 p.initiatedLaneChanges+=plans.filter(a=>Math.abs(a.target-a.oldTarget)>1e-7).length
 p.completedLaneChanges+=paths.filter(a=>Math.abs(a.s.targetY-a.s.y)>1e-5&&
  Math.abs(a.a.target-a.y1)<1e-6).length
 p.nearStops+=updates.filter(s=>s.v<1.0).length
 p.lowestSpeed=Math.min(p.lowestSpeed,...updates.map(s=>s.v))
 p.maxSpeed=Math.max(p.maxSpeed,...updates.map(s=>s.v))
 p.cumulativeAdvancement=round(p.cumulativeAdvancement+
  paths.reduce((sum,a)=>sum+a.x1-a.s.x,0))
 return p
}
export function runNormalStartV3(initial,{seconds=60}={}){
 assert(Number.isInteger(seconds*2)&&seconds>0&&seconds<=240,'A64 invalid research horizon')
 let s=structuredClone(initial);checkSnapshot(s)
 const end=s.at+seconds
 while(s.at<end-1e-7&&!s.reason)s=advanceNormalStartV3(s)
 return s
}
export function finishNormalStartMetricsV3(original,final){
 assert(original.states.length===final.states.length,'A64 mismatched field')
 const lookup=new Map(final.states.map(s=>[s.id,s]))
 const start=original.states
 let overtakes=0,sortInversions=0
 for(let i=0;i<start.length;i++)for(let j=i+1;j<start.length;j++){
  const a=start[i],b=start[j],aa=lookup.get(a.id),bb=lookup.get(b.id)
  const initial=a.x-b.x,ending=aa.x-bb.x
  if(Math.abs(initial)<1e-5||Math.abs(ending)<1e-5)continue
  if(initial*ending<0){overtakes++;sortInversions++}
 }
 const xs=final.states.map(s=>s.x)
 const ws=final.states.map(s=>s.energy.remainingWPrimeJoules)
 return {status:final.reason??'FULL_HORIZON_CLEAR',fieldSize:final.states.length,
  seconds:final.at-original.at,acceptedSteps:final.acceptedSteps-original.acceptedSteps,
  firstCollision:final.firstCollision??null,pairChecks:final.pairChecks,
  uniquePairOrderReversals:overtakes,
  frontToLastGapM:round(Math.max(...xs)-Math.min(...xs)),
  minimumSpeedMps:final.lowestSpeed,maximumSpeedMps:final.maxSpeed,
  nearStopRiderTicks:final.nearStops,brakeRiderTicks:final.brakeEvents,
  headwayPairDecisionTicks:final.negotiatedHeadwayPairTicks??0,
  headwayLimitedRiderTicks:final.headwayLimitedRiderTicks??0,
  laneSteeringRiderTicks:final.steerEvents,
  initiatedLaneChanges:final.initiatedLaneChanges,
  completedLaneChanges:final.completedLaneChanges,
  roadBoundaryGuardRiderTicks:final.roadBoundaryGuardTicks??0,
  roadMergeBufferedRiderTicks:final.roadMergeBufferedRiderTicks??0,
  roadMergeYieldRiderTicks:final.roadMergeYieldRiderTicks??0,
  roadPlatoonAssistRiderTicks:final.roadPlatoonAssistRiderTicks??0,
  roadPlatoonUnresolvedConstraints:final.roadPlatoonUnresolvedConstraints??0,
  roadLaneForecastGuardTicks:final.roadLaneForecastGuardTicks??0,
  roadVelocityHeadwayTicks:final.roadVelocityHeadwayTicks??0,
  roadCapacityHoldRiderTicks:final.roadCapacityHoldRiderTicks??0,
  roadCapacityPaceLimitedRiderTicks:final.roadCapacityPaceLimitedRiderTicks??0,
  roadTwoSlotStaggerRiderTicks:final.roadTwoSlotStaggerRiderTicks??0,
  roadSlotReservationRiderTicks:final.roadSlotReservationRiderTicks??0,
  roadSlotPaceWarningRiderTicks:final.roadSlotPaceWarningRiderTicks??0,
  roadSlotCrossRowHoldRiderTicks:final.roadSlotCrossRowHoldRiderTicks??0,
  roadGateWindowRiderTicks:final.roadGateWindowRiderTicks??0,
  roadGateLateralHoldRiderTicks:final.roadGateLateralHoldRiderTicks??0,
  roadGateLateWindowRiderTicks:final.roadGateLateWindowRiderTicks??0,
  roadGateCrossRowWarningRiderTicks:final.roadGateCrossRowWarningRiderTicks??0,
  roadGateSelectiveGapWarningTicks:final.roadGateSelectiveGapWarningTicks??0,
  bodyHalfWidthM:final.bodyHalfWidthM??0,
  firstRoadViolation:final.firstRoadViolation??null,
  meanRemainingWPrimeJoules:round(ws.reduce((a,b)=>a+b,0)/ws.length),
  officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
