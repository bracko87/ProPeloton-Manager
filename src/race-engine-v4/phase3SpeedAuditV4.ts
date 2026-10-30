/** V4-only: read-only measured Phase-3 pace from temporary research bundles. */
interface Pace{
 readonly pelotonPaceKmh:number
 readonly escapePaceKmh:number
 readonly selectedResponseMultiplier:number
 readonly chaseAssets:number
 readonly chasingTeamCount:number
 readonly explicitChasingTeamCount:number
 readonly automaticChasingTeamCount:number
 readonly gcThreatChasingTeamCount:number
 readonly cooperationMultiplier:number
 readonly chaseInterestScore:number
 readonly chaseCapacityScore:number
 readonly responseMode:string
}
interface Sample{readonly kmFromStart:number;readonly gapSeconds:number;readonly v4ResearchPace?:Pace}
interface Input{readonly roadRaceResolution?:{readonly phase3Decisive?:{readonly physicalGapTrajectory:readonly Sample[]}|null}|null}
export interface V4Phase3SpeedAudit{
 readonly instrumented:true
 readonly sampleSteps:number
 readonly measuredKm:number
 readonly gapGrowingKm:number
 readonly gapShrinkingKm:number
 readonly pelotonFasterKm:number
 readonly escapeFasterKm:number
 readonly medianPelotonPaceKmh:number
 readonly medianEscapePaceKmh:number
 readonly medianSpeedAdvantageToEscapeKmh:number
 readonly medianSelectedResponseMultiplier:number
 readonly medianChaseAssets:number
 readonly medianChasingTeamCount:number
 readonly medianExplicitChasingTeams:number
 readonly medianAutomaticChasingTeams:number
 readonly medianGcThreatChasingTeams:number
 readonly medianCooperationMultiplier:number
 readonly medianChaseInterestScore:number
 readonly medianChaseCapacityScore:number
 readonly measuredGapGrowthSeconds:number
 readonly physicalSpeedImpliedGapGrowthSeconds:number
 readonly responseModeKm:Readonly<Record<string,number>>
}
const round=(x:number)=>Number(x.toFixed(6))
const median=(input:number[]):number=>{
 if(!input.length)throw Error('V4 speed median has no samples')
 const s=[...input].sort((a,b)=>a-b)
 return round(s[Math.floor(s.length/2)])
}
/** Does not calculate race results, change gaps or alter the underlying V2 source. */
export function auditV4Phase3Speed(input:Input):V4Phase3SpeedAudit|null{
 const samples=input.roadRaceResolution?.phase3Decisive?.physicalGapTrajectory??[]
 const steps:{pace:Pace}[]=[]
 let measuredKm=0,gapGrowingKm=0,gapShrinkingKm=0,pelotonFasterKm=0,escapeFasterKm=0
 let measuredGapGrowthSeconds=0,physicalSpeedImpliedGapGrowthSeconds=0
 const modes:Record<string,number>={}
 for(let i=1;i<samples.length;i++){
  const prev=samples[i-1],current=samples[i],pace=current.v4ResearchPace
  if(!pace)continue
  const nums=[prev.kmFromStart,current.kmFromStart,prev.gapSeconds,current.gapSeconds,
   pace.pelotonPaceKmh,pace.escapePaceKmh,pace.selectedResponseMultiplier,
   pace.chaseAssets,pace.chasingTeamCount,pace.explicitChasingTeamCount,
   pace.automaticChasingTeamCount,pace.gcThreatChasingTeamCount,
   pace.cooperationMultiplier,pace.chaseInterestScore,pace.chaseCapacityScore]
  if(nums.some(x=>!Number.isFinite(x))||current.kmFromStart<=prev.kmFromStart||
   prev.gapSeconds<0||current.gapSeconds<0||pace.pelotonPaceKmh<=0||
   pace.escapePaceKmh<=0||pace.chaseAssets<0||pace.chasingTeamCount<0||
   pace.explicitChasingTeamCount<0||pace.automaticChasingTeamCount<0||
   pace.gcThreatChasingTeamCount<0)throw Error('V4 invalid Phase 3 physical speed evidence')
  const distance=current.kmFromStart-prev.kmFromStart
  const gap=current.gapSeconds-prev.gapSeconds
  const speedGap=(distance/pace.pelotonPaceKmh-distance/pace.escapePaceKmh)*3600
  measuredKm+=distance
  measuredGapGrowthSeconds+=gap
  physicalSpeedImpliedGapGrowthSeconds+=speedGap
  if(gap>0.000001)gapGrowingKm+=distance
  if(gap< -0.000001)gapShrinkingKm+=distance
  if(pace.pelotonPaceKmh>pace.escapePaceKmh+0.000001)pelotonFasterKm+=distance
  if(pace.escapePaceKmh>pace.pelotonPaceKmh+0.000001)escapeFasterKm+=distance
  modes[pace.responseMode]=(modes[pace.responseMode]??0)+distance
  steps.push({pace})
 }
 if(!steps.length)return null
 const values=(key:Exclude<keyof Pace,'responseMode'>)=>median(steps.map(s=>s.pace[key]))
 return {instrumented:true,sampleSteps:steps.length,measuredKm:round(measuredKm),
  gapGrowingKm:round(gapGrowingKm),gapShrinkingKm:round(gapShrinkingKm),
  pelotonFasterKm:round(pelotonFasterKm),escapeFasterKm:round(escapeFasterKm),
  medianPelotonPaceKmh:values('pelotonPaceKmh'),
  medianEscapePaceKmh:values('escapePaceKmh'),
  medianSpeedAdvantageToEscapeKmh:median(steps.map(s=>s.pace.escapePaceKmh-s.pace.pelotonPaceKmh)),
  medianSelectedResponseMultiplier:values('selectedResponseMultiplier'),
  medianChaseAssets:values('chaseAssets'),
  medianChasingTeamCount:values('chasingTeamCount'),
  medianExplicitChasingTeams:values('explicitChasingTeamCount'),
  medianAutomaticChasingTeams:values('automaticChasingTeamCount'),
  medianGcThreatChasingTeams:values('gcThreatChasingTeamCount'),
  medianCooperationMultiplier:values('cooperationMultiplier'),
  medianChaseInterestScore:values('chaseInterestScore'),
  medianChaseCapacityScore:values('chaseCapacityScore'),
  measuredGapGrowthSeconds:round(measuredGapGrowthSeconds),
  physicalSpeedImpliedGapGrowthSeconds:round(physicalSpeedImpliedGapGrowthSeconds),
  responseModeKm:Object.fromEntries(Object.entries(modes).map(([k,v])=>[k,round(v)]))}
}
