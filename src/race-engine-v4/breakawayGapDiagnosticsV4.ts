/**
 * V4 research-only gap diagnostics. Reads physical trajectories without
 * mutating V2 outputs, rider states, chase behavior, or replay validation.
 * Phase peaks belong to different physical lineages; the cross-phase peak
 * is an OBSERVED sample maximum, not a new official race result.
 */
export interface V4GapSample { readonly kmFromStart:number; readonly gapSeconds:number }
interface GapAuditInput {
 readonly calibrationSummary?:{readonly maximumBreakawayGapSeconds?:number}|null
 readonly roadRaceResolution?:{
  readonly phase1Opening?:{
   readonly initialGapSeconds:number
   readonly endGapSeconds:number
   readonly breakawayCatchKm:number|null
   readonly physicalGapTrajectory:readonly V4GapSample[]
  }|null
  readonly phase2Development?:{
   readonly startGapSeconds:number
   readonly endGapSeconds:number
   readonly breakawayCatchKm:number|null
   readonly physicalGapTrajectory:readonly V4GapSample[]
   readonly pelotonResponse:{
    readonly responseMode:string
    readonly chasingTeamIds:readonly string[]
    readonly controllingTeamIds:readonly string[]
   }
  }|null
  readonly phase4Finish?:{
   readonly startGapSeconds:number
   readonly endGapSeconds:number
   readonly breakawayCaught:boolean
   readonly breakawaySurvived:boolean
   readonly explicitChasingTeamIds:readonly string[]
   readonly automaticChasingTeamIds:readonly string[]
   readonly chaseSteps:readonly {
    readonly kmEnd:number
    readonly startGapSeconds:number
    readonly endGapSeconds:number
   }[]
  }|null
 }|null
}
export interface V4GapPeak {
 readonly seconds:number
 readonly km:number|null
 readonly sampleCount:number
}
export interface V4GapTrajectoryAudit {
 readonly researchOnly:true
 readonly reportedMaxGapSeconds:number|null
 readonly observedSampleMaxGapSeconds:number|null
 readonly observedPeakPhase:'phase1'|'phase2'|'phase4'|null
 readonly unreportedSamplePeakSeconds:number|null
 readonly phase1: (V4GapPeak & {
  readonly initialGapSeconds:number
  readonly endGapSeconds:number
  readonly catchKm:number|null
 })|null
 readonly phase2: (V4GapPeak & {
  readonly startGapSeconds:number
  readonly endGapSeconds:number
  readonly catchKm:number|null
  readonly responseMode:string
  readonly explicitChasingTeamCount:number
  readonly controllingTeamCount:number
 })|null
 readonly phase4: (V4GapPeak & {
  readonly startGapSeconds:number
  readonly endGapSeconds:number
  readonly breakawayCaught:boolean
  readonly breakawaySurvived:boolean
  readonly explicitChasingTeamCount:number
  readonly automaticChasingTeamCount:number
 })|null
}
function finiteGap(n:number):number{
 if(!Number.isFinite(n)||n<0)throw Error('V4 gap audit requires finite nonnegative physical gap')
 return n
}
function peak(anchors:readonly number[],samples:readonly V4GapSample[]):V4GapPeak{
 let seconds=0,km:number|null=null
 for(const a of anchors)if(finiteGap(a)>seconds){seconds=a;km=null}
 for(const s of samples){
  if(!Number.isFinite(s.kmFromStart)||s.kmFromStart<0)
   throw Error('V4 gap audit requires finite physical kilometre')
  if(finiteGap(s.gapSeconds)>seconds){seconds=s.gapSeconds;km=s.kmFromStart}
 }
 return {seconds,km,sampleCount:samples.length}
}
export function auditV4GapTrajectories(result:GapAuditInput):V4GapTrajectoryAudit{
 const r=result.roadRaceResolution
 const p1=r?.phase1Opening
 const p2=r?.phase2Development
 const p4=r?.phase4Finish
 const phase1=p1?{
  ...peak([p1.initialGapSeconds,p1.endGapSeconds],p1.physicalGapTrajectory),
  initialGapSeconds:p1.initialGapSeconds,endGapSeconds:p1.endGapSeconds,
  catchKm:p1.breakawayCatchKm
 }:null
 const phase2=p2?{
  ...peak([p2.startGapSeconds,p2.endGapSeconds],p2.physicalGapTrajectory),
  startGapSeconds:p2.startGapSeconds,endGapSeconds:p2.endGapSeconds,
  catchKm:p2.breakawayCatchKm,
  responseMode:p2.pelotonResponse.responseMode,
  explicitChasingTeamCount:p2.pelotonResponse.chasingTeamIds.length,
  controllingTeamCount:p2.pelotonResponse.controllingTeamIds.length
 }:null
 const phase4=p4?{
  ...peak([p4.startGapSeconds,p4.endGapSeconds],
   p4.chaseSteps.flatMap(s=>[
    {kmFromStart:s.kmEnd,gapSeconds:s.startGapSeconds},
    {kmFromStart:s.kmEnd,gapSeconds:s.endGapSeconds}
   ])),
  startGapSeconds:p4.startGapSeconds,endGapSeconds:p4.endGapSeconds,
  breakawayCaught:p4.breakawayCaught,breakawaySurvived:p4.breakawaySurvived,
  explicitChasingTeamCount:p4.explicitChasingTeamIds.length,
  automaticChasingTeamCount:p4.automaticChasingTeamIds.length
 }:null
 const candidates=[
  {phase:'phase1' as const,value:phase1?.seconds},
  {phase:'phase2' as const,value:phase2?.seconds},
  {phase:'phase4' as const,value:phase4?.seconds}
 ].filter((x):x is {phase:'phase1'|'phase2'|'phase4';value:number}=>x.value!==undefined)
 const largest=candidates.length?
  candidates.reduce((a,b)=>b.value>a.value?b:a):null
 const rawReported=result.calibrationSummary?.maximumBreakawayGapSeconds
 const reported=typeof rawReported==='number'?finiteGap(rawReported):null
 const observed=largest?.value??null
 return {
  researchOnly:true,reportedMaxGapSeconds:reported,
  observedSampleMaxGapSeconds:observed,observedPeakPhase:largest?.phase??null,
  unreportedSamplePeakSeconds:reported!==null&&observed!==null?
   Math.max(0,Number((observed-reported).toFixed(6))):null,
  phase1,phase2,phase4
 }
}
