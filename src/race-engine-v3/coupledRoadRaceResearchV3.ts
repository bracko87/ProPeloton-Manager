/**
 * SINGLE coupled road-physics experiment. Positions determine physical draft;
 * finite rider watts determine intended speed; wheel clearance determines
 * actual speed; ONLY actual mechanical work is debited from energy.
 * Explicitly offline-only, no production tables, no official race outcomes.
 * No fixed target groups, timings, or stage-specific scripted results.
 */
import {planNeutralStartFormationV3,type NeutralStartGridV3} from './neutralStartFormationV3.ts'
import {advanceSpatialPelotonV3,calculateSpatialSlipstreamV3,type SpatialRiderV3} from './pelotonSpatialMotionV3.ts'
import {projectRiderPowerV3,type RiderAttributePowerV3} from './riderPowerAdapterV3.ts'
import {fatiguePowerEnvelopeV3} from './fatiguePowerEnvelopeV3.ts'
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
  readonly gate:{readonly offlineOnly:true;readonly acknowledgedNoSportingApproval:true;readonly sourceQuality:'source_snapshot'|'synthetic_research'}
}
export interface CoupledRiderStateV3 {
  riderId:string;teamId:string;meters:number;lane:number;speedMps:number;energy:number
  finishSeconds:number|null;activeAttackKey:string|null;attackSeconds:number;attackAttempts:number
  passes:number;wheelLimitedTicks:number;cumulativeActualWorkJoules:number;cumulativePowerDebtJoules:number
}
export interface CoupledFrameV3 {readonly elapsedSeconds:number;readonly riders:readonly {riderId:string;meters:number;energy:number;lane:number}[]}
export interface CoupledStateV3 {
  readonly version:'coupled_offline_v3_01';readonly fingerprint:string;readonly totalMeters:number
  elapsedSeconds:number;tick:number;complete:boolean
  riders:CoupledRiderStateV3[];replay:CoupledFrameV3[];groupTimeline:PhysicalGroupTimelineStateV3
}
export interface CoupledResultV3 {
  readonly mode:'OFFLINE_RESEARCH_ONLY';readonly sportingApproval:'NOT_APPROVED';readonly officialWrites:0
  readonly elapsedSeconds:number;readonly frames:readonly CoupledFrameV3[]
  readonly groups:PhysicalGroupTimelineStateV3['history']
  readonly finish:readonly {riderId:string;rank:number;finishSeconds:number;gapSeconds:number;energy:number}[]
  readonly movement:{passes:number;wheelLimitedTicks:number;attackAttempts:number;totalWorkJoules:number;powerDebtJoules:number}
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
 return {version:'coupled_offline_v3_01',fingerprint:fingerprint(input),totalMeters:total,elapsedSeconds:0,tick:0,complete:false,replay:[],groupTimeline:initializePhysicalGroupTimelineV3(total),riders:
  [...input.riders].sort((a,b)=>a.riderId.localeCompare(b.riderId)).map(r=>({riderId:r.riderId,teamId:r.teamId,meters:lineup.get(r.riderId)!.meters,lane:lineup.get(r.riderId)!.gridLane,speedMps:0,energy:round((r.startStamina??75)/100),finishSeconds:null,activeAttackKey:null,attackSeconds:0,attackAttempts:0,passes:0,wheelLimitedTicks:0,cumulativeActualWorkJoules:0,cumulativePowerDebtJoules:0}))}
}
export function advanceCoupledV3(input:CoupledInputV3,state:CoupledStateV3,maxTicks:number):CoupledStateV3{
 validate(input)
 check(state.version==='coupled_offline_v3_01'&&state.fingerprint===fingerprint(input),'Checkpoint input mismatch')
 check(state.groupTimeline?.courseMeters===state.totalMeters&&state.groupTimeline.history.length===state.replay.length,'Divergent checkpoint replay/group history')
 check(Number.isInteger(maxTicks)&&maxTicks>=1&&maxTicks<=100000,'Invalid checkpoint budget')
 const dt=input.tickSeconds??10,sample=input.sampleSeconds??120
 const profile=new Map(input.riders.map(r=>[r.riderId,r]))
 for(let step=0;step<maxTicks&&!state.complete;step++){
  const active=state.riders.filter(r=>r.finishSeconds===null)
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
   const fatigueMax=fatiguePowerEnvelopeV3(rider.energy,projected.sustainableWatts).peakDeliverableWatts
   const available=Math.min(fatigueMax,projected.sustainableWatts*effort)
   const ideal=solveSpeed(available,drag,road)
   const speed=rider.speedMps===0?Math.min(6,ideal):clamp(ideal,Math.max(.1,rider.speedMps-.9),rider.speedMps+.9)
   intent.set(rider.riderId,{desired:round(speed),road,drag,baseWatts:projected.sustainableWatts,scale:projected.energyCostScale,action:tactic.action,attack})
  }
  const moves=advanceSpatialPelotonV3(active.map(r=>({riderId:r.riderId,meters:r.meters,lane:r.lane,energy:r.energy,desiredMps:intent.get(r.riderId)!.desired,tactic:intent.get(r.riderId)!.action})),{laneCount:input.grid.ridersAcross,dtSeconds:dt,minWheelGapMeters:1.8})
  const movement=new Map(moves.map(m=>[m.riderId,m]))
  for(const rider of active){
   const outcome=movement.get(rider.riderId)!,work=intent.get(rider.riderId)!,before=rider.meters
   const actualSpeed=outcome.speedMps
   const physicalWatts=roadWattsRequiredV3(actualSpeed,83,work.drag,work.road)
   const energyDebt=Math.max(0,physicalWatts-work.baseWatts)
   // Cost is based on MECHANICAL WORK ACTUALLY PERFORMED, not a requested
   // target that a blocked wheel never reached. Aerobic base remains bounded.
   const baseline=.000001*dt
   const extra=energyDebt*dt*.000008*work.scale
   const regen=work.action==='recover'?dt*.000006:0
   rider.energy=round(clamp(rider.energy-baseline-extra+regen,0,1))
   rider.cumulativeActualWorkJoules=round(rider.cumulativeActualWorkJoules+physicalWatts*dt)
   rider.cumulativePowerDebtJoules=round(rider.cumulativePowerDebtJoules+energyDebt*dt)
   rider.lane=outcome.lane;rider.speedMps=actualSpeed
   rider.passes+=Number(outcome.overtook);rider.wheelLimitedTicks+=Number(outcome.wheelLimited)
   if(outcome.meters>=state.totalMeters){
    rider.finishSeconds=round(state.elapsedSeconds+(state.totalMeters-before)/Math.max(.01,actualSpeed))
    rider.meters=state.totalMeters
   }else rider.meters=outcome.meters
   if(rider.attackSeconds>0)rider.attackSeconds=Math.max(0,rider.attackSeconds-dt)
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
  movement:{passes:ranking.reduce((n,r)=>n+r.passes,0),wheelLimitedTicks:ranking.reduce((n,r)=>n+r.wheelLimitedTicks,0),attackAttempts:ranking.reduce((n,r)=>n+r.attackAttempts,0),totalWorkJoules:round(ranking.reduce((n,r)=>n+r.cumulativeActualWorkJoules,0)),powerDebtJoules:round(ranking.reduce((n,r)=>n+r.cumulativePowerDebtJoules,0))}}
}
export function runCoupledV3(input:CoupledInputV3):CoupledResultV3{
 const state=initializeCoupledV3(input)
 advanceCoupledV3(input,state,100000)
 return finalizeCoupledV3(input,state)
}
