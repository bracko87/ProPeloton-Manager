/**
 * EXPERIMENTAL, OFFLINE-ONLY, source-gated collective road power simulation.
 * No legacy imports, no time control, database, official results, or live worker.
 * This is a candidate for falsification, NOT a sports-calibrated replacement.
 */
import {fatiguePowerEnvelopeV3} from './fatiguePowerEnvelopeV3.ts'
import {calculatePackPowerV3,roadWattsRequiredV3,type PackPowerRiderV3,type PackRoadV3} from './pelotonPowerBalanceV3.ts'
import {projectRiderPowerV3,type RiderAttributePowerV3} from './riderPowerAdapterV3.ts'
import {initializePhysicalGroupTimelineV3,advancePhysicalGroupTimelineV3,type PhysicalGroupTimelineStateV3} from './physicalGroupTimelineV3.ts'

export type PowerOrderV3='follow'|'tempo'|'attack'|'chase'|'recover'
export interface PowerStageSegmentV3 {readonly lengthKm:number;readonly gradePercent:number;readonly headwindMps?:number;readonly crosswindMps?:number}
export interface SourcePowerRiderV3 extends RiderAttributePowerV3 {readonly teamId:string}
export interface PowerStageOrderV3 {readonly riderId:string;readonly startKm:number;readonly endKm:number;readonly tactic:PowerOrderV3}
export interface ExperimentalPowerInputV3 {
  readonly raceId:string;readonly stageId:string;readonly sourceFingerprint:string;
  readonly riders:readonly SourcePowerRiderV3[];readonly segments:readonly PowerStageSegmentV3[];
  readonly orders?:readonly PowerStageOrderV3[];readonly secondsPerTick?:number;readonly sampleSeconds?:number;
  readonly gate:{readonly offlineOnly:true;readonly acknowledgedNoSportingApproval:true;readonly sourceQuality:'source_snapshot'|'synthetic_research'}
}
export interface PowerRiderDynamicV3 {
  readonly riderId:string;readonly teamId:string;
  meters:number;speedMps:number;energy:number;finishSeconds:number|null;
  attackOrderKey:string|null;attackSecsLeft:number;attempts:number;
}
export interface PowerSampleV3 {elapsedSeconds:number;riders:{riderId:string;meters:number;energy:number}[]}
export interface ExperimentalPowerStateV3 {
  readonly version:'experimental_collective_power_v3_01'
  readonly fingerprint:string;readonly totalMeters:number;
  elapsedSeconds:number;tick:number;complete:boolean;
  riders:PowerRiderDynamicV3[];replay:PowerSampleV3[];
  groupTimeline:PhysicalGroupTimelineStateV3
}
export interface ExperimentalPowerResultV3 {
  readonly mode:'OFFLINE_RESEARCH_ONLY';readonly sportingApproval:'NOT_APPROVED';readonly officialWrites:0;
  readonly riderCount:number;readonly sourceQuality:string;readonly elapsedSeconds:number;
  readonly finish:{riderId:string;rank:number;elapsedSeconds:number;gapSeconds:number;energy:number}[];
  readonly replay:PowerSampleV3[];
  readonly groupFrames:PhysicalGroupTimelineStateV3['history'];
  readonly attackAttempts:number;
}
const ensure=(condition:boolean,message:string)=>{if(!condition)throw Error(message)}
const clamp=(value:number,a:number,b:number)=>Math.min(b,Math.max(a,value))
const round=(n:number)=>Math.round(n*1e6)/1e6
function fingerprint(input:ExperimentalPowerInputV3):string {
  const source=JSON.stringify(input);let hash=2166136261
  for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return (hash>>>0).toString(16)
}
function validate(input:ExperimentalPowerInputV3):void {
  ensure(input.gate?.offlineOnly===true&&input.gate.acknowledgedNoSportingApproval===true,'Offline/no-approval gate required')
  ensure(input.gate.sourceQuality==='source_snapshot'||input.gate.sourceQuality==='synthetic_research','Source quality unknown')
  ensure(!!input.raceId&&!!input.stageId&&!!input.sourceFingerprint,'Missing stage provenance')
  ensure(input.riders.length>=1&&input.riders.length<=260,'Invalid peloton size')
  ensure(input.segments.length>=1,'Missing course geometry')
  ensure(input.segments.every(x=>Number.isFinite(x.lengthKm)&&x.lengthKm>0&&Number.isFinite(x.gradePercent)&&Math.abs(x.gradePercent)<=22&&Number.isFinite(x.headwindMps??0)&&Math.abs(x.headwindMps??0)<=40&&Number.isFinite(x.crosswindMps??0)&&Math.abs(x.crosswindMps??0)<=40),'Invalid course gradient or wind')
  const ids=new Set<string>()
  for(const r of input.riders){
    ensure(!!r.teamId&&!!r.riderId&&!ids.has(r.riderId),'Missing/duplicate rider/team')
    ids.add(r.riderId)
    // This call refuses an incomplete source if the source snapshot gate is on.
    projectRiderPowerV3(r,0,'follow',input.gate.sourceQuality==='synthetic_research')
  }
  ensure((input.secondsPerTick??10)>0&&(input.secondsPerTick??10)<=20&&Number.isInteger(input.secondsPerTick??10),'Invalid tick')
  ensure((input.sampleSeconds??60)>0&&(input.sampleSeconds??60)%(input.secondsPerTick??10)===0,'Invalid replay sampling')
  for(const o of input.orders??[]){ensure(ids.has(o.riderId)&&Number.isFinite(o.startKm)&&Number.isFinite(o.endKm)&&o.startKm>=0&&o.startKm<o.endKm&&['follow','tempo','attack','chase','recover'].includes(o.tactic),'Invalid instruction')}
}
function stageAt(input:ExperimentalPowerInputV3,meters:number):PowerStageSegmentV3{
  let distance=0
  for(const seg of input.segments){distance+=seg.lengthKm*1000;if(meters<distance)return seg}
  return input.segments[input.segments.length-1]
}
function ordersAt(input:ExperimentalPowerInputV3,riderId:string,meters:number):{key:string|null;tactic:PowerOrderV3}{
  const km=meters/1000
  const matched=(input.orders??[]).filter(o=>o.riderId===riderId&&km>=o.startKm&&km<o.endKm).at(-1)
  return matched?{key:`${matched.startKm}:${matched.endKm}`,tactic:matched.tactic}:{key:null,tactic:'follow'}
}
function aeroSoloSpeed(watts:number,road:PackRoadV3,drag:number):number{
  let a=0,b=30
  for(let i=0;i<36;i++){const m=(a+b)*.5;if(roadWattsRequiredV3(m,83,drag,road)>watts)b=m;else a=m}
  return round((a+b)*.5)
}
export function initializeExperimentalPowerV3(input:ExperimentalPowerInputV3):ExperimentalPowerStateV3{
  validate(input)
  const total=input.segments.reduce((sum,s)=>sum+s.lengthKm*1000,0)
  return {
    version:'experimental_collective_power_v3_01',fingerprint:fingerprint(input),totalMeters:total,
    elapsedSeconds:0,tick:0,complete:false,
    riders:[...input.riders].sort((a,b)=>a.riderId.localeCompare(b.riderId)).map(r=>({riderId:r.riderId,teamId:r.teamId,meters:0,speedMps:0,energy:round(r.startStamina===undefined?clamp(1-r.fatigueBeforeStage/200,.4,1):r.startStamina/100),finishSeconds:null,attackOrderKey:null,attackSecsLeft:0,attempts:0})),
    replay:[],groupTimeline:initializePhysicalGroupTimelineV3(total)
  }
}
export function advanceExperimentalPowerV3(input:ExperimentalPowerInputV3,state:ExperimentalPowerStateV3,maxTicks:number):ExperimentalPowerStateV3{
  validate(input)
  ensure(state.version==='experimental_collective_power_v3_01'&&state.fingerprint===fingerprint(input),'Checkpoint source mismatch')
  ensure(state.groupTimeline?.courseMeters===state.totalMeters&&state.groupTimeline.history.length===state.replay.length,'Missing or divergent group checkpoint')
  ensure(Number.isInteger(maxTicks)&&maxTicks>=1&&maxTicks<=100000,'Invalid batch tick count')
  const seconds=input.secondsPerTick??10,sample=input.sampleSeconds??60
  const profiles=new Map(input.riders.map(r=>[r.riderId,r]))
  for(let step=0;step<maxTicks&&!state.complete;step++){
    const active=state.riders.filter(s=>s.finishSeconds===null).sort((a,b)=>b.meters-a.meters||a.riderId.localeCompare(b.riderId))
    const groups:PowerRiderDynamicV3[][]=[]
    for(const s of active){const g=groups.at(-1);if(!g||g.at(-1)!.meters-s.meters>28)groups.push([s]);else g.push(s)}
    const front=active[0]?.meters??0
    const desired=new Map<string,{speed:number;cost:number}>()
    for(const g of groups){
      const seg=stageAt(input,g[0].meters)
      const road:PackRoadV3={gradePercent:seg.gradePercent,headwindMps:seg.headwindMps??0,crosswindMps:seg.crosswindMps??0}
      const groupHasTarget=front-g[0].meters>120
      const orders=g.map(s=>ordersAt(input,s.riderId,s.meters))
      const profilesForGroup=g.map((s,i)=>{
        const rider=profiles.get(s.riderId)!
        const tactic=orders[i].tactic
        if(tactic==='attack'&&s.attackOrderKey!==orders[i].key){
          s.attackOrderKey=orders[i].key
          if(s.energy>.3){s.attackSecsLeft=110;s.attempts++}
        }else if(tactic!=='attack')s.attackOrderKey=null
        const onAttack=tactic==='attack'&&s.attackSecsLeft>0&&s.energy>.27
        const participation=tactic==='recover'?.71:tactic==='tempo'?.94:groupHasTarget&&tactic==='chase'?1:.84
        const source=projectRiderPowerV3(rider,seg.gradePercent,'follow',input.gate.sourceQuality==='synthetic_research')
        const originalW=source.sustainableWatts
        return {s,source,participation,onAttack,order:tactic,watts:Math.max(70,originalW*participation)}
      })
      // A rider's uncoordinated attack never increases every follower's pace.
      const powerGroup:PackPowerRiderV3[]=profilesForGroup.map(p=>({
        riderId:p.s.riderId,sustainableWatts:p.watts,energy:p.s.energy,massKg:83,
        energyCostScale:p.source.energyCostScale,
        tactic:p.order==='chase'&&groupHasTarget?'chase':'follow'
      }))
      const plan=calculatePackPowerV3(powerGroup,road,seconds)
      const collective=plan.attainableSpeedMps
      for(let i=0;i<profilesForGroup.length;i++){
        const p=profilesForGroup[i],s=p.s
        const work=plan.perRider.find(x=>x.riderId===s.riderId)!
        let target=collective
        let extraCost=work.energyCostPerSecond*p.source.energyCostScale
        if(p.onAttack){
          const reserve=clamp((s.energy-.27)/.73,0,1)
          // A transitional attack has temporary partial wheel shelter; once
          // clear of the moving pack it pays the FULL solo aerodynamic cost.
          const clear=front-s.meters>35||g.length===1
          const attackCdA=clear?.36:.245
          const transientWatts=p.source.sustainableWatts*(1+.90*reserve)
          target=Math.max(target,aeroSoloSpeed(transientWatts,road,attackCdA))
          extraCost+=.00045+.00085*reserve
        }
        if(p.order==='recover')target*=.91
        // A rider who cannot sustain the group's speed can ride with it by
        // spending reserve. When deeply depleted they fall back naturally.
        const groupN=g.length
        const shelter=groupN>1?clamp((groupN-1)/(groupN+3)*.5,0,.5)*clamp(1-Math.max(0,road.gradePercent)/8,0,1):0
        const adjustedCdA=.36*(1-shelter)
        // Climbing ability imposes a mechanically measured individual speed
        // ceiling; following the pack never grants missing rider watts.
        if(road.gradePercent>=5 && !p.onAttack){
          const climbingCap=aeroSoloSpeed(p.watts*(1+.015*s.energy),road,adjustedCdA)
          target=Math.min(target,climbingCap)
        }
        // Continuous finite power capacity replaces the artificial 13% hard
        // cliff; drafting can still support higher collective pace when the
        // rider has sufficient reserve. No assigned group target or final gap.
        const required=roadWattsRequiredV3(target,83,adjustedCdA,road)
        const lack=Math.max(0,required-p.source.sustainableWatts)
        if(lack>0){const cap=aeroSoloSpeed(fatiguePowerEnvelopeV3(s.energy,p.source.sustainableWatts).peakDeliverableWatts,road,adjustedCdA);target=Math.min(target,cap)}
        // Charge only the power required at the rider's actual, capped speed.
        // Pre-cap demanded watts never represent performed physical work.
        extraCost+=Math.max(0,roadWattsRequiredV3(target,83,adjustedCdA,road)-p.source.sustainableWatts)*.0000018
        const baseline=.000004*seconds
        const recovery=p.order==='recover'?seconds*.000014:0
        desired.set(s.riderId,{speed:round(clamp(target,1,28)),cost:round(baseline+extraCost*seconds-recovery)})
      }
    }
    for(const s of active){
      const d=desired.get(s.riderId)!
      const speed=s.speedMps===0?Math.min(d.speed,6):clamp(d.speed,Math.max(1,s.speedMps-1.1),s.speedMps+1.1)
      const metersLeft=state.totalMeters-s.meters
      s.speedMps=round(speed)
      if(metersLeft<=seconds*speed){s.finishSeconds=round(state.elapsedSeconds+metersLeft/speed);s.meters=state.totalMeters}
      else{s.meters=round(s.meters+seconds*speed)}
      s.energy=round(clamp(s.energy-d.cost,0,1))
      if(s.attackSecsLeft>0){s.attackSecsLeft=Math.max(0,s.attackSecsLeft-seconds)}
    }
    state.tick++
    state.elapsedSeconds=round(state.elapsedSeconds+seconds)
    state.complete=state.riders.every(r=>r.finishSeconds!==null)
    if(state.elapsedSeconds%sample===0||state.complete){
      const sampleFrame={elapsedSeconds:state.elapsedSeconds,riders:state.riders.map(r=>({riderId:r.riderId,meters:r.meters,energy:r.energy}))}
      if(state.replay.at(-1)?.elapsedSeconds!==sampleFrame.elapsedSeconds){
        advancePhysicalGroupTimelineV3(state.groupTimeline,sampleFrame)
        state.replay.push(sampleFrame)
      }
    }
  }
  return state
}
export function finalizeExperimentalPowerV3(input:ExperimentalPowerInputV3,state:ExperimentalPowerStateV3):ExperimentalPowerResultV3{
  ensure(state.complete&&state.fingerprint===fingerprint(input),'Cannot finalize incomplete or unmatched experiment')
  ensure(state.replay.length===state.groupTimeline.history.length,'Replay/group divergence')
  const ranking=[...state.riders].sort((a,b)=>a.finishSeconds!-b.finishSeconds!||a.riderId.localeCompare(b.riderId))
  const winning=ranking[0]?.finishSeconds??0
  return {mode:'OFFLINE_RESEARCH_ONLY',sportingApproval:'NOT_APPROVED',officialWrites:0,riderCount:ranking.length,sourceQuality:input.gate.sourceQuality,elapsedSeconds:state.elapsedSeconds,
    finish:ranking.map((r,i)=>({riderId:r.riderId,rank:i+1,elapsedSeconds:r.finishSeconds!,gapSeconds:round(r.finishSeconds!-winning),energy:r.energy})),
    replay:state.replay,groupFrames:state.groupTimeline.history,attackAttempts:state.riders.reduce((sum,r)=>sum+r.attempts,0)}
}
export function runExperimentalPowerV3(input:ExperimentalPowerInputV3):ExperimentalPowerResultV3 {
  const state=initializeExperimentalPowerV3(input)
  advanceExperimentalPowerV3(input,state,100000)
  return finalizeExperimentalPowerV3(input,state)
}
