/** V4-only observations: physical B/F gap samples, pursuit and energy. No writes. */
type Sample={readonly kmFromStart:number;readonly gapSeconds:number}
type Energy={readonly riderId:string;readonly startEnergy:number;readonly energyAfterPhase:number}
type Phase={readonly physicalGapTrajectory:readonly Sample[];readonly phaseBoundary:{readonly startKm:number;readonly endKm:number}}
interface Input{
 readonly roadRaceResolution?:{
  readonly phase1Opening?:(Phase&{readonly breakawayRiderIds:readonly string[];readonly riderEnergy:readonly Energy[];readonly breakawayCatchKm:number|null})|null
  readonly phase2Development?:(Phase&{readonly breakawayRiderIdsAtStart:readonly string[];readonly riderEnergy:readonly Energy[];readonly breakawayCatchKm:number|null;readonly pelotonResponse:{readonly chasingTeamIds:readonly string[];readonly cooperationScore?:number}})|null
  readonly phase3Decisive?:(Phase&{readonly physicalEscapeRiderIdsAtStart:readonly string[];readonly riderStates:readonly Energy[];readonly physicalChasingTeamIds:readonly string[];readonly physicalCatchKm:number|null})|null
 }|null
}
export interface V4EarlyPhaseObservation{
 readonly sampleCount:number
 readonly sampledKm:number
 readonly startGapSeconds:number|null
 readonly endGapSeconds:number|null
 readonly peakGapSeconds:number|null
 readonly netGapChangeSeconds:number|null
 readonly distanceGrowingKm:number
 readonly distanceShrinkingKm:number
 readonly positiveGapGainSeconds:number
 readonly negativeGapLossSeconds:number
 readonly chaseTeamCount:number|null
 readonly meanFrontStartEnergy:number|null
 readonly meanFrontEndEnergy:number|null
 readonly meanFrontEnergySpent:number|null
 readonly catchKm:number|null
}
export interface V4EarlyGapEvolution{
 readonly researchOnly:true
 readonly phase1:V4EarlyPhaseObservation|null
 readonly phase2:V4EarlyPhaseObservation|null
 readonly phase3:V4EarlyPhaseObservation|null
}
const round=(n:number)=>Number(n.toFixed(6))
function mean(values:number[]):number|null{return values.length?round(values.reduce((a,b)=>a+b,0)/values.length):null}
function observe(phase:Phase,frontIds:readonly string[],energy:readonly Energy[],chasers:number|null,catchKm:number|null):V4EarlyPhaseObservation{
 const points=phase.physicalGapTrajectory
 const ids=new Set(frontIds)
 const actors=energy.filter(x=>ids.has(x.riderId))
 const starts=actors.map(x=>x.startEnergy),ends=actors.map(x=>x.energyAfterPhase)
 let growingKm=0,shrinkingKm=0,gain=0,loss=0,sampledKm=0,peak:number|null=null
 if(!Number.isFinite(phase.phaseBoundary.startKm)||!Number.isFinite(phase.phaseBoundary.endKm)||
    phase.phaseBoundary.endKm<=phase.phaseBoundary.startKm)throw Error('Invalid V4 phase boundary')
 if(catchKm!==null && (!Number.isFinite(catchKm)||catchKm<phase.phaseBoundary.startKm||catchKm>phase.phaseBoundary.endKm+0.000001))
  throw Error('Invalid V4 catch kilometre')
 for(let i=0;i<points.length;i++){
  const s=points[i]
  if(!Number.isFinite(s.kmFromStart)||!Number.isFinite(s.gapSeconds)||s.gapSeconds<0||
   s.kmFromStart<phase.phaseBoundary.startKm-0.000001||s.kmFromStart>phase.phaseBoundary.endKm+0.000001)
   throw Error('Invalid V4 physical gap sample')
  peak=Math.max(peak??0,s.gapSeconds)
  if(i===0)continue
  const previous=points[i-1]
  const km=s.kmFromStart-previous.kmFromStart
  if(km<=0)throw Error('V4 physical gap samples not increasing')
  sampledKm+=km
  const change=s.gapSeconds-previous.gapSeconds
  if(change>0.000001){growingKm+=km;gain+=change}
  if(change< -0.000001){shrinkingKm+=km;loss-=change}
 }
 for(const r of actors)if(!Number.isFinite(r.startEnergy)||!Number.isFinite(r.energyAfterPhase))
  throw Error('Invalid V4 energy evidence')
 const start=points[0]?.gapSeconds??null,end=points.at(-1)?.gapSeconds??null
 return {sampleCount:points.length,sampledKm:round(sampledKm),startGapSeconds:start,
  endGapSeconds:end,peakGapSeconds:peak,
  netGapChangeSeconds:start!==null&&end!==null?round(end-start):null,
  distanceGrowingKm:round(growingKm),distanceShrinkingKm:round(shrinkingKm),
  positiveGapGainSeconds:round(gain),negativeGapLossSeconds:round(loss),
  chaseTeamCount:chasers,
  meanFrontStartEnergy:mean(starts),meanFrontEndEnergy:mean(ends),
  meanFrontEnergySpent:mean(actors.map(x=>x.startEnergy-x.energyAfterPhase)),catchKm}
}
export function auditV4EarlyGapEvolution(result:Input):V4EarlyGapEvolution{
 const x=result.roadRaceResolution,p1=x?.phase1Opening,p2=x?.phase2Development,p3=x?.phase3Decisive
 return {researchOnly:true,
  phase1:p1?observe(p1,p1.breakawayRiderIds,p1.riderEnergy,null,p1.breakawayCatchKm):null,
  phase2:p2?observe(p2,p2.breakawayRiderIdsAtStart,p2.riderEnergy,p2.pelotonResponse.chasingTeamIds.length,p2.breakawayCatchKm):null,
  phase3:p3?observe(p3,p3.physicalEscapeRiderIdsAtStart,p3.riderStates,p3.physicalChasingTeamIds.length,p3.physicalCatchKm):null}
}
