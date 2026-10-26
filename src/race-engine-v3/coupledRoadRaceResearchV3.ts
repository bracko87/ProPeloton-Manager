/**
 * SINGLE coupled road-physics experiment. Positions determine physical draft;
 * finite rider watts determine intended speed; wheel clearance determines
 * actual speed; ONLY actual mechanical work is debited from energy.
 * Explicitly offline-only, no production tables, no official race outcomes.
 * No fixed target groups, timings, or stage-specific scripted results.
 */
import {planNeutralStartFormationV3,type NeutralStartGridV3} from './neutralStartFormationV3.ts'
import {planAnticipatoryLanesV3} from './anticipatoryLaneResearchV3.ts'
import {initializeFinitePassingV3,validateFinitePassingV3,capFinitePassSpeedV3,startFinitePassV3,stepFinitePassV3,type FinitePassingResearchStateV3} from './finitePassingResearchV3.ts'
import {calculatePathDraftWorkV3} from './pathDraftExposureV3.ts'
import {initializeWheelBottleneckTelemetryV3,recordWheelBottleneckTickV3,summarizeWheelBottlenecksV3,type WheelBottleneckTelemetryV3,type WheelBottleneckSummaryV3} from './wheelBottleneckTelemetryV3.ts'
import {advanceSpatialPelotonV3,calculateSpatialSlipstreamV3,type SpatialRiderV3} from './pelotonSpatialMotionV3.ts'
import {projectRiderPowerV3,type RiderAttributePowerV3} from './riderPowerAdapterV3.ts'
import {fatiguePowerEnvelopeV3} from './fatiguePowerEnvelopeV3.ts'
import {separatedAerobicPeakPowerV3} from './separatedAerobicResearchV3.ts'
import {initializeEnergyBalanceResearchV3,advanceEnergyBalanceResearchV3,boundRequestedSpeedByEnergyV3,type ResearchEnergyStateV3} from './energyBalanceResearchV3.ts'
import {roadWattsRequiredV3,type PackRoadV3} from './pelotonPowerBalanceV3.ts'
import {initializePhysicalGroupTimelineV3,advancePhysicalGroupTimelineV3,type PhysicalGroupTimelineStateV3} from './physicalGroupTimelineV3.ts'

export type CoupledOrderV3='follow'|'tempo'|'chase'|'attack'|'recover'
export interface CoupledRiderV3 extends RiderAttributePowerV3 {readonly teamId:string}
export interface CoupledStageSegmentV3 {readonly lengthKm:number;readonly gradePercent:number;readonly headwindMps?:number;readonly crosswindMps?:number}
export interface CoupledTacticV3 {readonly riderId:string;readonly startKm:number;readonly endKm:number;readonly tactic:CoupledOrderV3}
export interface CoupledInputV3 {
  readonly raceId:string;readonly stageId:string;readonly seed:string
  readonly riders:readonly CoupledRiderV3[];readonly route:readonly CoupledStageSegmentV3[]
  readonly orders?:readonly CoupledTacticV3[]
  readonly tickSeconds?:number;readonly sampleSeconds?:number
  readonly grid:NeutralStartGridV3
  /** Opt-in checkpointed congestion diagnosis. Changes NO rider physics. */
  readonly experimentalBottleneckTelemetry?:true
  /** OFFLINE-ONLY research probe. Does not alter longitudinal metres this tick. */
  readonly experimentalAnticipatoryLaneMoves?:true
  /** Research-only real-energy debit using end-of-tick spatial exposure. */
  readonly experimentalPathDraftWork?:true
  /** Finite high-intensity energy. Strictly offline research, never officially selected. */
  readonly experimentalPowerDurationEnergy?:true
  /** OFFLINE ONLY: three-tick power-charged passing study; disabled by default. */
  readonly experimentalFinitePassReservation?:true
  /** Strictly offline Batch 24 A/B, depends on W-prime research mode. */
  readonly experimentalSeparatedAerobicPower?:true
  readonly gate:{readonly offlineOnly:true;readonly acknowledgedNoSportingApproval:true;readonly sourceQuality:'source_snapshot'|'synthetic_research'}
}
export interface CoupledRiderStateV3 {
  riderId:string;teamId:string;meters:number;lane:number;speedMps:number;energy:number
  finishSeconds:number|null;activeAttackKey:string|null;attackSeconds:number;attackAttempts:number
  passes:number;wheelLimitedTicks:number;cumulativeActualWorkJoules:number;cumulativePowerDebtJoules:number;anticipatoryMoves?:number;draftPathExtraWorkJoules?:number;powerDurationEnergy?:ResearchEnergyStateV3
}
export interface CoupledFrameV3 {readonly elapsedSeconds:number;readonly riders:readonly {riderId:string;meters:number;energy:number;lane:number}[]}
export interface CoupledStateV3 {
  readonly version:'coupled_offline_v3_01';readonly fingerprint:string;readonly totalMeters:number
  elapsedSeconds:number;tick:number;complete:boolean
  riders:CoupledRiderStateV3[];replay:CoupledFrameV3[];groupTimeline:PhysicalGroupTimelineStateV3
  bottleneckTelemetry?:WheelBottleneckTelemetryV3
  passingResearch?:FinitePassingResearchStateV3
}
export interface CoupledResultV3 {
  readonly mode:'OFFLINE_RESEARCH_ONLY';readonly sportingApproval:'NOT_APPROVED';readonly officialWrites:0
  readonly elapsedSeconds:number;readonly frames:readonly CoupledFrameV3[]
  readonly groups:PhysicalGroupTimelineStateV3['history']
  readonly finish:readonly {riderId:string;rank:number;finishSeconds:number;gapSeconds:number;energy:number}[]
  readonly movement:{passes:number;wheelLimitedTicks:number;attackAttempts:number;totalWorkJoules:number;powerDebtJoules:number;anticipatoryMoves?:number}
  readonly bottlenecks?:WheelBottleneckSummaryV3
  readonly passingResearch?:{readonly attempts:number;readonly completed:number;readonly rejected:number;readonly pending:boolean;readonly additionalMechanicalJoules:number}
  readonly pathDraft?:{readonly netActualAdditionalJoules:number;readonly affectedRiders:number}
  readonly powerDuration?:{readonly remainingWPrimeJoules:number;readonly supraCriticalJoules:number;readonly metabolicJoules:number;readonly modeledRiders:number}
}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
const round=(n:number)=>Math.round(n*1000000)/1000000
const check=(yes:boolean,msg:string)=>{if(!yes)throw Error(msg)}
function fingerprint(input:CoupledInputV3):string{
 let h=2166136261,source=JSON.stringify(input)
 for(let i=0;i<source.length;i++){h^=source.charCodeAt(i);h=Math.imul(h,16777619)}
 return (h>>>0).toString(16)
}
function validate(input:CoupledInputV3):void{
 check(input.gate?.offlineOnly===true&&input.gate.acknowledgedNoSportingApproval===true,'Missing offline-only sporting NO-GO gate')
 check(!input.experimentalSeparatedAerobicPower||input.experimentalPowerDurationEnergy===true,'Separated aerobic experiment requires power-duration energy mode')
 check(!input.experimentalFinitePassReservation||(input.experimentalPowerDurationEnergy===true&&!input.experimentalAnticipatoryLaneMoves),'Finite passing requires isolated W-prime research without automatic lateral preparation')
 check(input.gate.sourceQuality==='source_snapshot'||input.gate.sourceQuality==='synthetic_research','Invalid source quality')
 check(!!input.raceId&&!!input.stageId&&!!input.seed,'Missing deterministic provenance')
 check(input.riders.length>0&&input.riders.length<=260,'Invalid field size')
 check(input.route.length>0&&input.route.every(s=>Number.isFinite(s.lengthKm)&&s.lengthKm>0&&Number.isFinite(s.gradePercent)&&Math.abs(s.gradePercent)<=22&&Number.isFinite(s.headwindMps??0)&&Math.abs(s.headwindMps??0)<=30&&Number.isFinite(s.crosswindMps??0)&&Math.abs(s.crosswindMps??0)<=30),'Invalid route')
 const dt=input.tickSeconds??10,sample=input.sampleSeconds??120
 check(Number.isInteger(dt)&&dt>0&&dt<=20&&Number.isInteger(sample)&&sample%dt===0&&sample>=dt,'Invalid deterministic tick/replay interval')
 const seen=new Set<string>()
 for(const r of input.riders){check(!!r.riderId&&!!r.teamId&&!seen.has(r.riderId),'Missing/duplicate rider');seen.add(r.riderId);projectRiderPowerV3(r,0,'follow',input.gate.sourceQuality==='synthetic_research')}
 planNeutralStartFormationV3([...seen],input.seed,input.grid)
 for(const o of input.orders??[]){check(seen.has(o.riderId)&&Number.isFinite(o.startKm)&&Number.isFinite(o.endKm)&&o.startKm>=0&&o.endKm>o.startKm&&['follow','tempo','chase','attack','recover'].includes(o.tactic),'Invalid order')}
}
function roadAt(input:CoupledInputV3,meters:number):PackRoadV3{
 let distance=0
 for(const segment of input.route){distance+=segment.lengthKm*1000;if(meters<distance)return {gradePercent:segment.gradePercent,headwindMps:segment.headwindMps??0,crosswindMps:segment.crosswindMps??0}}
 const last=input.route[input.route.length-1]
 return {gradePercent:last.gradePercent,headwindMps:last.headwindMps??0,crosswindMps:last.crosswindMps??0}
}
function tacticAt(input:CoupledInputV3,id:string,meters:number):{action:CoupledOrderV3;key:string|null}{
 const matched=(input.orders??[]).filter(o=>o.riderId===id&&meters/1000>=o.startKm&&meters/1000<o.endKm).at(-1)
 return matched?{action:matched.tactic,key:String(matched.startKm)+":"+String(matched.endKm)}:{action:'follow',key:null}
}
function solveSpeed(watts:number,cdA:number,road:PackRoadV3):number{
 let low=0,high=25
 for(let i=0;i<34;i++){const mid=(low+high)/2; if(roadWattsRequiredV3(mid,83,cdA,road)>watts)high=mid;else low=mid}
 return (low+high)/2
}
export function initializeCoupledV3(input:CoupledInputV3):CoupledStateV3{
 validate(input)
 const lineup=new Map(planNeutralStartFormationV3(input.riders.map(r=>r.riderId),input.seed,input.grid).map(r=>[r.riderId,r]))
 const total=input.route.reduce((sum,s)=>sum+s.lengthKm*1000,0)
 return {version:'coupled_offline_v3_01',fingerprint:fingerprint(input),totalMeters:total,elapsedSeconds:0,tick:0,complete:false,replay:[],groupTimeline:initializePhysicalGroupTimelineV3(total),
  ...(input.experimentalBottleneckTelemetry?{bottleneckTelemetry:initializeWheelBottleneckTelemetryV3(input.riders.map(r=>r.riderId))}:{}),
   ...(input.experimentalFinitePassReservation?{passingResearch:initializeFinitePassingV3()}:{}),riders:
  [...input.riders].sort((a,b)=>a.riderId.localeCompare(b.riderId)).map(r=>({riderId:r.riderId,teamId:r.teamId,meters:lineup.get(r.riderId)!.meters,lane:lineup.get(r.riderId)!.gridLane,speedMps:0,energy:round((r.startStamina??75)/100),finishSeconds:null,activeAttackKey:null,attackSeconds:0,attackAttempts:0,passes:0,wheelLimitedTicks:0,cumulativeActualWorkJoules:0,cumulativePowerDebtJoules:0,...(input.experimentalAnticipatoryLaneMoves?{anticipatoryMoves:0}:{}),...(input.experimentalPathDraftWork?{draftPathExtraWorkJoules:0}:{}),...(input.experimentalPowerDurationEnergy?{powerDurationEnergy:initializeEnergyBalanceResearchV3({criticalWatts:projectRiderPowerV3(r,0,'follow',input.gate.sourceQuality==='synthetic_research').sustainableWatts,wPrimeJoules:20000,initialWPrimeJoules:20000*(r.startStamina??75)/100})}:{})}))}
}
export function advanceCoupledV3(input:CoupledInputV3,state:CoupledStateV3,maxTicks:number):CoupledStateV3{
 validate(input)
 check(state.version==='coupled_offline_v3_01'&&state.fingerprint===fingerprint(input),'Checkpoint input mismatch')
 check(state.groupTimeline?.courseMeters===state.totalMeters&&state.groupTimeline.history.length===state.replay.length,'Divergent checkpoint replay/group history')
 check(!input.experimentalBottleneckTelemetry||state.bottleneckTelemetry?.tickCount===state.tick,'Missing or divergent wheel telemetry checkpoint')
 if(input.experimentalPowerDurationEnergy)check(state.riders.every(r=>r.powerDurationEnergy!==undefined),'Missing power-duration checkpoint')
 if(input.experimentalFinitePassReservation){check(!!state.passingResearch,'Missing finite-passing checkpoint');validateFinitePassingV3(state.passingResearch!,state.riders.map(r=>r.riderId),input.grid.ridersAcross)}
 check(Number.isInteger(maxTicks)&&maxTicks>=1&&maxTicks<=100000,'Invalid checkpoint budget')
 const dt=input.tickSeconds??10,sample=input.sampleSeconds??120
 const profile=new Map(input.riders.map(r=>[r.riderId,r]))
 for(let step=0;step<maxTicks&&!state.complete;step++){
  // Research mode stages rider state so a rejected tick cannot partially debit the checkpoint.
  const active=state.riders.filter(r=>r.finishSeconds===null).map(r=>input.experimentalPowerDurationEnergy?{...r}:r)
  const maxDistance=Math.max(...active.map(r=>r.meters))
  const position:readonly SpatialRiderV3[]=active.map(r=>({riderId:r.riderId,meters:r.meters,lane:r.lane,desiredMps:0,energy:r.energy}))
  const intent=new Map<string,{desired:number;road:PackRoadV3;drag:number;baseWatts:number;scale:number;action:CoupledOrderV3;attack:boolean}>()
  for(const rider of active){
   const road=roadAt(input,rider.meters),spec=profile.get(rider.riderId)!,tactic=tacticAt(input,rider.riderId,rider.meters)
   const riderView=position.find(p=>p.riderId===rider.riderId)!
   const shelter=calculateSpatialSlipstreamV3(riderView,position,road).fraction
   const drag=clamp(.36*(1-shelter),.22,.36)
   const projected=projectRiderPowerV3(spec,road.gradePercent,'follow',input.gate.sourceQuality==='synthetic_research')
   if(tactic.action==='attack'&&rider.activeAttackKey!==tactic.key){rider.activeAttackKey=tactic.key;rider.attackSeconds=rider.energy>.24?90:0;if(rider.attackSeconds>0)rider.attackAttempts++}
   if(tactic.action!=='attack')rider.activeAttackKey=null
   const attack=tactic.action==='attack'&&rider.attackSeconds>0&&rider.energy>.1
   const chased=tactic.action==='chase'&&maxDistance-rider.meters>120
   const effort=tactic.action==='recover'?.73:attack?1.46:chased?1.12:tactic.action==='tempo'?1.05:.98
   // W-prime still restricts above-critical work through the achieved-speed budget.
   const fatigueMax=input.experimentalSeparatedAerobicPower?separatedAerobicPeakPowerV3(projected.sustainableWatts):fatiguePowerEnvelopeV3(rider.energy,projected.sustainableWatts).peakDeliverableWatts
   const available=Math.min(fatigueMax,projected.sustainableWatts*effort)
   const ideal=solveSpeed(available,drag,road)
   const speed=rider.speedMps===0?Math.min(6,ideal):clamp(ideal,Math.max(.1,rider.speedMps-.9),rider.speedMps+.9)
   // A strong tailwind can invert the aerodynamic drag contribution. Check BOTH supported CdA endpoints.
   const physicalUpperWatts=(v:number)=>Math.max(roadWattsRequiredV3(v,83,.22,road),roadWattsRequiredV3(v,83,.36,road))
   const capped=input.experimentalPowerDurationEnergy?boundRequestedSpeedByEnergyV3(rider.powerDurationEnergy!,dt,speed,physicalUpperWatts):speed
   const pendingPassing=state.passingResearch?.pending?.riderId===rider.riderId
    const reservedCap=pendingPassing?capFinitePassSpeedV3(capped,Math.min(available,rider.powerDurationEnergy!.criticalWatts+rider.powerDurationEnergy!.remainingWPrimeJoules/dt),physicalUpperWatts,35):capped
    intent.set(rider.riderId,{desired:input.experimentalPowerDurationEnergy?Math.max(0,Math.floor(reservedCap*1e6)/1e6-0.000002):round(reservedCap),road,drag,baseWatts:projected.sustainableWatts,scale:projected.energyCostScale,action:tactic.action,attack})
  }
  const telemetryBefore=input.experimentalPowerDurationEnergy&&input.experimentalBottleneckTelemetry
    ?active.map(r=>({riderId:r.riderId,meters:r.meters,lane:r.lane,energy:r.energy,desiredMps:intent.get(r.riderId)!.desired,tactic:intent.get(r.riderId)!.action})):null
  const passBefore= input.experimentalFinitePassReservation?active.map(r=>({riderId:r.riderId,meters:r.meters,lane:r.lane})):null
   // Pending riders hold their original lane until the third safe reservation tick.
   const spatialBefore=active.map(r=>({riderId:r.riderId,meters:r.meters,lane:r.lane,energy:r.energy,desiredMps:intent.get(r.riderId)!.desired,tactic:state.passingResearch?.pending?.riderId===r.riderId?'recover' as const:intent.get(r.riderId)!.action}))
   const moves=advanceSpatialPelotonV3(spatialBefore,{laneCount:input.grid.ridersAcross,dtSeconds:dt,minWheelGapMeters:1.8})
   const finitePassTick=input.experimentalFinitePassReservation?stepFinitePassV3(state.passingResearch!,passBefore!,moves,dt,35):null
  if(input.experimentalBottleneckTelemetry&&!input.experimentalPowerDurationEnergy)recordWheelBottleneckTickV3(state.bottleneckTelemetry!,active.map(r=>({riderId:r.riderId,meters:r.meters,lane:r.lane,energy:r.energy,desiredMps:intent.get(r.riderId)!.desired,tactic:intent.get(r.riderId)!.action})),moves,state.totalMeters,dt)
  const lateral=input.experimentalAnticipatoryLaneMoves
    ?new Map(planAnticipatoryLanesV3(active.map(r=>({riderId:r.riderId,meters:r.meters,lane:r.lane,energy:r.energy,desiredMps:intent.get(r.riderId)!.desired,tactic:intent.get(r.riderId)!.action})),moves,input.grid.ridersAcross).riders.map(p=>[p.riderId,p]))
    :null
  const observedDraft=input.experimentalPathDraftWork||input.experimentalPowerDurationEnergy
    ?new Map(calculatePathDraftWorkV3(active.map(r=>({riderId:r.riderId,meters:r.meters,lane:r.lane,energy:r.energy,desiredMps:intent.get(r.riderId)!.desired})),moves,
      new Map(active.map(r=>[r.riderId,intent.get(r.riderId)!.road])),
      lateral?new Map([...lateral].map(([id,v])=>[id,v.lane])):undefined).map(w=>[w.riderId,w]))
    :null
  const movement=new Map(moves.map(m=>[m.riderId,m]))
  // Validate achieved work for ALL riders before any rider energy update.
  const acceptedEnergy=input.experimentalPowerDurationEnergy?new Map(active.map(r=>{
    const m=movement.get(r.riderId)!,work=intent.get(r.riderId)!
    const watts=observedDraft?.get(r.riderId)?.wattsWithPathExposure??roadWattsRequiredV3(m.speedMps,83,work.drag,work.road)
    const step=advanceEnergyBalanceResearchV3(r.powerDurationEnergy!,watts+(finitePassTick?.chargedRiderId===r.riderId?35:0),dt)
    if(!step.accepted)throw Error('Research power-duration budget violated by achieved motion')
    return [r.riderId,step.state] as const
  })):null
  for(const rider of active){
   const outcome=movement.get(rider.riderId)!,work=intent.get(rider.riderId)!,before=rider.meters
   const actualSpeed=outcome.speedMps
   const physicalWatts=(observedDraft?.get(rider.riderId)?.wattsWithPathExposure??roadWattsRequiredV3(actualSpeed,83,work.drag,work.road))+(finitePassTick?.chargedRiderId===rider.riderId?35:0)
   if(input.experimentalPathDraftWork&&observedDraft)rider.draftPathExtraWorkJoules=round((rider.draftPathExtraWorkJoules??0)+observedDraft.get(rider.riderId)!.extraWattsFromExposureChange*dt)
   const energyDebt=Math.max(0,physicalWatts-work.baseWatts)
   // Cost is based on MECHANICAL WORK ACTUALLY PERFORMED, not a requested
   // target that a blocked wheel never reached. Aerobic base remains bounded.
   const baseline=.000001*dt
   const extra=energyDebt*dt*.000008*work.scale
   const regen=work.action==='recover'?dt*.000006:0
   if(acceptedEnergy){
    rider.powerDurationEnergy=acceptedEnergy.get(rider.riderId)!
    // Displayed energy is the short-duration reserve; metabolic work is tracked separately.
    rider.energy=round(clamp(rider.powerDurationEnergy.remainingWPrimeJoules/rider.powerDurationEnergy.wPrimeJoules,0,1))
   }else rider.energy=round(clamp(rider.energy-baseline-extra+regen,0,1))
   rider.cumulativeActualWorkJoules=round(rider.cumulativeActualWorkJoules+physicalWatts*dt)
   rider.cumulativePowerDebtJoules=round(rider.cumulativePowerDebtJoules+energyDebt*dt)
   if(lateral){rider.anticipatoryMoves=(rider.anticipatoryMoves??0)+Number(lateral.get(rider.riderId)!.promoted)}
   rider.lane=lateral?.get(rider.riderId)?.lane??outcome.lane;rider.speedMps=actualSpeed
   rider.passes+=Number(outcome.overtook);rider.wheelLimitedTicks+=Number(outcome.wheelLimited)
   if(outcome.meters>=state.totalMeters){
    rider.finishSeconds=round(state.elapsedSeconds+(state.totalMeters-before)/Math.max(.01,actualSpeed))
    rider.meters=state.totalMeters
   }else rider.meters=outcome.meters
   if(rider.attackSeconds>0)rider.attackSeconds=Math.max(0,rider.attackSeconds-dt)
  }
  // One final lane change may be committed after three swept-corridor-safe ticks.
   if(finitePassTick?.commitLane){
    const r=active.find(x=>x.riderId===finitePassTick.commitLane!.riderId)
    check(!!r&&r.finishSeconds===null,'Passing rider finished before lane commit')
    r.lane=finitePassTick.commitLane.toLane
   }
   // The recorder mutates counters as it validates. Clone for atomic opt-in acceptance.
  const acceptedTelemetry=input.experimentalPowerDurationEnergy&&input.experimentalBottleneckTelemetry
    ?structuredClone(state.bottleneckTelemetry!):null
  if(acceptedTelemetry)recordWheelBottleneckTickV3(acceptedTelemetry,telemetryBefore!,moves,state.totalMeters,dt)
  if(input.experimentalPowerDurationEnergy){
   const accepted=new Map(active.map(r=>[r.riderId,r]))
   state.riders=state.riders.map(r=>accepted.get(r.riderId)??r)
   if(acceptedTelemetry)state.bottleneckTelemetry=acceptedTelemetry
   if(finitePassTick)state.passingResearch=finitePassTick.state
  }
  // Start a conservative one-at-a-time maneuver only after the completed tick.
   // No instant longitudinal movement or energy debit is permitted at selection.
   if(input.experimentalFinitePassReservation&&!state.complete&&!state.passingResearch!.pending&&state.tick-state.passingResearch!.lastStartTick>=8&&maxDistance<5000&&active.length>1){
    try{
     const planned=planAnticipatoryLanesV3(spatialBefore,moves,input.grid.ridersAcross,1.8)
     const candidate=planned.riders.filter(p=>p.promoted&&p.fromLane!==p.lane).sort((a,b)=>a.riderId.localeCompare(b.riderId))[0]
     if(candidate)state.passingResearch=startFinitePassV3(state.passingResearch!,candidate,moves,state.tick)
    }catch(error){if(!(error instanceof Error&&error.message==='Invalid anticipatory bicycle placement'))throw error}
   }
   state.elapsedSeconds=round(state.elapsedSeconds+dt);state.tick++
  state.complete=state.riders.every(r=>r.finishSeconds!==null)
  if(state.elapsedSeconds%sample===0||state.complete){
   const frame={elapsedSeconds:state.elapsedSeconds,riders:state.riders.map(r=>({riderId:r.riderId,meters:r.meters,energy:r.energy,lane:r.lane}))}
   if(state.replay.at(-1)?.elapsedSeconds!==frame.elapsedSeconds){
    advancePhysicalGroupTimelineV3(state.groupTimeline,frame)
    state.replay.push(frame)
   }
  }
 }
 return state
}
export function finalizeCoupledV3(input:CoupledInputV3,state:CoupledStateV3):CoupledResultV3{
 check(state.complete&&state.fingerprint===fingerprint(input),'Unfinished or wrong race')
 check(state.groupTimeline.history.length===state.replay.length,'Group/replay inconsistency')
 const ranking=[...state.riders].sort((a,b)=>a.finishSeconds!-b.finishSeconds!||a.riderId.localeCompare(b.riderId))
 const best=ranking[0].finishSeconds!
 return {mode:'OFFLINE_RESEARCH_ONLY',sportingApproval:'NOT_APPROVED',officialWrites:0,elapsedSeconds:state.elapsedSeconds,frames:state.replay,groups:state.groupTimeline.history,
  finish:ranking.map((r,i)=>({riderId:r.riderId,rank:i+1,finishSeconds:r.finishSeconds!,gapSeconds:round(r.finishSeconds!-best),energy:r.energy})),
  movement:{passes:ranking.reduce((n,r)=>n+r.passes,0),wheelLimitedTicks:ranking.reduce((n,r)=>n+r.wheelLimitedTicks,0),attackAttempts:ranking.reduce((n,r)=>n+r.attackAttempts,0),totalWorkJoules:round(ranking.reduce((n,r)=>n+r.cumulativeActualWorkJoules,0)),powerDebtJoules:round(ranking.reduce((n,r)=>n+r.cumulativePowerDebtJoules,0)),...(input.experimentalAnticipatoryLaneMoves?{anticipatoryMoves:ranking.reduce((n,r)=>n+(r.anticipatoryMoves??0),0)}:{})},
  ...(input.experimentalBottleneckTelemetry?{bottlenecks:summarizeWheelBottlenecksV3(state.bottleneckTelemetry!)}:{}),
  ...(input.experimentalFinitePassReservation?{passingResearch:{attempts:state.passingResearch!.attempts,completed:state.passingResearch!.completed,rejected:state.passingResearch!.rejected,pending:state.passingResearch!.pending!==null,additionalMechanicalJoules:round(state.passingResearch!.cumulativeExtraMechanicalJoules)}}:{}),
  ...(input.experimentalPathDraftWork?{pathDraft:{netActualAdditionalJoules:round(ranking.reduce((n,r)=>n+(r.draftPathExtraWorkJoules??0),0)),affectedRiders:ranking.filter(r=>Math.abs(r.draftPathExtraWorkJoules??0)>1e-6).length}}:{}),
  ...(input.experimentalPowerDurationEnergy?{powerDuration:{remainingWPrimeJoules:round(ranking.reduce((n,r)=>n+r.powerDurationEnergy!.remainingWPrimeJoules,0)),supraCriticalJoules:round(ranking.reduce((n,r)=>n+r.powerDurationEnergy!.cumulativeSupraCriticalJoules,0)),metabolicJoules:round(ranking.reduce((n,r)=>n+r.powerDurationEnergy!.cumulativeMetabolicJoules,0)),modeledRiders:ranking.length}}:{})}
}
export function runCoupledV3(input:CoupledInputV3):CoupledResultV3{
 const state=initializeCoupledV3(input)
 advanceCoupledV3(input,state,100000)
 return finalizeCoupledV3(input,state)
}
