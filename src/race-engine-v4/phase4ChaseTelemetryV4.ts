/** V4 read-only Phase-4 chase observations: no physics or publishing writes. */
type Step={
 readonly kmStart:number;readonly kmEnd:number
 readonly startGapSeconds:number;readonly endGapSeconds:number
 readonly escapePaceKmh:number;readonly effectivePelotonPaceKmh:number
 readonly selectedResponseMultiplier:number;readonly pelotonWorkIntensityFraction:number
 readonly explicitChasingTeamCount:number;readonly responseMode:string
}
type Input={readonly roadRaceResolution?:{readonly phase4Finish?:{
 readonly chaseSteps:readonly Step[]
 readonly chasingTeamStrength:readonly {readonly explicitChaserRiderIds:readonly string[]}[]
 readonly riderStates:readonly {readonly riderId:string;readonly startEnergy:number;readonly energyAtFinish:number}[]
}|null}|null}
export interface V4ChaseTelemetry{
 readonly researchOnly:true;readonly steps:number
 readonly explicitChaseKm:number;readonly escapeFasterKm:number
 readonly pelotonFasterKm:number;readonly gapGrowingDespiteChaseKm:number
 readonly gapSpeedDisagreementKm:number
 readonly medianEscapeSpeedKmh:number|null
 readonly medianPelotonSpeedKmh:number|null
 readonly medianResponseMultiplier:number|null
 readonly medianWorkIntensity:number|null
 readonly explicitChaserCount:number
 readonly averageExplicitChaserFinishEnergy:number|null
 readonly averageExplicitChaserEnergyUsed:number|null
 readonly responseModeKm:Readonly<Record<string,number>>
}
const round=(n:number)=>Number(n.toFixed(6))
const median=(x:readonly number[])=>x.length?round([...x].sort((a,b)=>a-b)[Math.floor(x.length/2)]):null
const mean=(x:readonly number[])=>x.length?round(x.reduce((a,b)=>a+b,0)/x.length):null
export function readV4ChaseTelemetry(result:Input):V4ChaseTelemetry|null{
 const p=result.roadRaceResolution?.phase4Finish
 if(!p)return null
 let explicit=0,escapeFaster=0,pelotonFaster=0,grow=0,disagreement=0
 const modes:Record<string,number>={}
 for(const step of p.chaseSteps){
  const values=[step.kmStart,step.kmEnd,step.startGapSeconds,step.endGapSeconds,
   step.escapePaceKmh,step.effectivePelotonPaceKmh,step.selectedResponseMultiplier,
   step.pelotonWorkIntensityFraction,step.explicitChasingTeamCount]
  if(values.some(x=>!Number.isFinite(x))||step.kmEnd<=step.kmStart||
   step.kmStart<0||step.startGapSeconds<0||step.endGapSeconds<0||
   step.escapePaceKmh<=0||step.effectivePelotonPaceKmh<=0||
   step.explicitChasingTeamCount<0)
    throw Error('V4 chase telemetry invalid physical step')
  const d=step.kmEnd-step.kmStart
  const velocity=step.effectivePelotonPaceKmh-step.escapePaceKmh
  const gap=step.endGapSeconds-step.startGapSeconds
  if(step.explicitChasingTeamCount>0)explicit+=d
  if(velocity>0.000001)pelotonFaster+=d
  if(velocity< -0.000001)escapeFaster+=d
  if(gap>0.000001&&step.explicitChasingTeamCount>0)grow+=d
  if((gap>0.000001&&velocity>0.000001)||(gap< -0.000001&&velocity< -0.000001))disagreement+=d
  modes[step.responseMode]=(modes[step.responseMode]??0)+d
 }
 const chaserIds=new Set(p.chasingTeamStrength.flatMap(x=>x.explicitChaserRiderIds))
 const chasers=p.riderStates.filter(x=>chaserIds.has(x.riderId))
 return {researchOnly:true,steps:p.chaseSteps.length,explicitChaseKm:round(explicit),
  escapeFasterKm:round(escapeFaster),pelotonFasterKm:round(pelotonFaster),
  gapGrowingDespiteChaseKm:round(grow),gapSpeedDisagreementKm:round(disagreement),
  medianEscapeSpeedKmh:median(p.chaseSteps.map(x=>x.escapePaceKmh)),
  medianPelotonSpeedKmh:median(p.chaseSteps.map(x=>x.effectivePelotonPaceKmh)),
  medianResponseMultiplier:median(p.chaseSteps.map(x=>x.selectedResponseMultiplier)),
  medianWorkIntensity:median(p.chaseSteps.map(x=>x.pelotonWorkIntensityFraction)),
  explicitChaserCount:chasers.length,
  averageExplicitChaserFinishEnergy:mean(chasers.map(x=>x.energyAtFinish)),
  averageExplicitChaserEnergyUsed:mean(chasers.map(x=>x.startEnergy-x.energyAtFinish)),
  responseModeKm:Object.fromEntries(Object.entries(modes).map(([k,v])=>[k,round(v)]))
 }
}
