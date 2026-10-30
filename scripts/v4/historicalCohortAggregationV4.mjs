/**
 * V4 research-only PRIVATE historical cohort aggregates.
 * Accepts only aggregate per-stage comparator results, never rider snapshots.
 * AI planning on preserved V2 physics is not V4 physical realism evidence.
 */
const finite=(n)=>typeof n==='number'&&Number.isFinite(n)&&n>=0
const median=(values)=>{
 const a=values.filter(finite).sort((x,y)=>x-y)
 if(!a.length)return null
 return Number((a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2).toFixed(6))
}
const summarize=(rows)=>({
 stages:rows.length,
 currentV2SavedResultReproduced:rows.filter(r=>r.savedResultReproducedByCurrentV2).length,
 bothReplaysSynchronized:rows.filter(r=>r.replay.currentV2Synchronized&&r.replay.v4ResearchSynchronized).length,
 historicalReplaysSynchronized:rows.filter(r=>r.replay.historicalSynchronized).length,
 acceptedPairedPlanningComparisons:rows.filter(r=>r.savedResultReproducedByCurrentV2&&
   r.replay.currentV2Synchronized&&r.replay.v4ResearchSynchronized).length,
 medianSavedV2MaxGapSeconds:median(rows.map(r=>r.maximumGapSeconds.savedV2)),
 medianCurrentV2MaxGapSeconds:median(rows.map(r=>r.maximumGapSeconds.currentV2)),
 medianV4AiPlannedOnV2PhysicsMaxGapSeconds:median(rows.map(r=>r.maximumGapSeconds.v4Research)),
 currentV2StagesWithAcceptedEscapes:rows.filter(r=>r.escapeLaunches.currentV2>0).length,
 v4AiPlannedStagesWithAcceptedEscapes:rows.filter(r=>r.escapeLaunches.v4Research>0).length,
 changedRankingStages:rows.filter(r=>r.v4ChangedRankCountComparedToCurrentV2>0).length,
 changedGapStages:rows.filter(r=>r.v4ChangedGapCountComparedToCurrentV2>0).length,
 sevenSecondSavedV2:rows.filter(r=>finite(r.maximumGapSeconds.savedV2)&&
   Math.abs(r.maximumGapSeconds.savedV2-7)<=0.005).length,
 sevenSecondV4AiPlannedOnV2Physics:rows.filter(r=>finite(r.maximumGapSeconds.v4Research)&&
   Math.abs(r.maximumGapSeconds.v4Research-7)<=0.005).length,
})
export function summarizeV4PrivateHistoricalCohort(comparisons, rejected=0){
 if(!Array.isArray(comparisons)||comparisons.length>200||!Number.isSafeInteger(rejected)||rejected<0)
  throw Error('Invalid private comparison cohort size')
 const hashes=new Set()
 for(const r of comparisons){
  if(!r||r.researchOnly!==true||r.officialWrites!==0||
     r.historicLockCutoffActuallyVerified!==false||
     r.riskWarning!=='historical_lock_time_reconstructed_not_proven'||
     r.comparisonKind!=='V4_AI_PLANNING_ON_PRESERVED_V2_PHYSICS'||
     r.calibratedV4PhysicsApplied!==false||
     r.physicalRealismApproval!=='NOT_EVALUATED'||
     !/^[a-f0-9]{16}$/.test(String(r.stageHash??''))||hashes.has(r.stageHash)||
     !['flat','hilly','mountain','cobbled'].includes(r.terrain)||
     !Number.isSafeInteger(r.riderCount)||r.riderCount<=0||
     !Number.isSafeInteger(r.humanTeams)||r.humanTeams<0||
     !Number.isSafeInteger(r.aiTeams)||r.aiTeams<0||
     r.humanTeams+r.aiTeams<=0||
     !r.replay||!r.maximumGapSeconds||!r.escapeLaunches||
     !Number.isSafeInteger(r.v4ChangedRankCountComparedToCurrentV2)||
     !Number.isSafeInteger(r.v4ChangedGapCountComparedToCurrentV2)||
     r.v4ChangedRankCountComparedToCurrentV2<0||
     r.v4ChangedGapCountComparedToCurrentV2<0||
     ![r.maximumGapSeconds.savedV2,r.maximumGapSeconds.currentV2,r.maximumGapSeconds.v4Research]
       .every(g=>g===null||finite(g))){
   throw Error('Invalid, duplicate or unverified private historical comparison')
  }
  hashes.add(r.stageHash)
 }
 const eligible=comparisons.filter(r=>r.savedResultReproducedByCurrentV2 &&
   r.replay.currentV2Synchronized&&r.replay.v4ResearchSynchronized)
 return {
  status:'HISTORICAL_AI_PLANNING_DIAGNOSTIC_ONLY',
  comparisonKind:'V4_AI_PLANNING_ON_PRESERVED_V2_PHYSICS',
  calibratedV4PhysicalReruns:0,
  realHistoricalV4PhysicalRealismApproved:false,
  historicLockCutoffActuallyVerified:false,
  strictReplayRequired:true,
  officialWrites:0,
  privateInputsIncluded:false,
  attempted:comparisons.length+rejected,
  rejected,
  all:summarize(comparisons),
  strictPairedPlanningSubset:summarize(eligible),
  terrain:['flat','hilly','mountain','cobbled'].map(terrain=>({
   terrain,...summarize(comparisons.filter(r=>r.terrain===terrain))
  })),
  interpretation:'AI-planning effects on preserved V2 physics only; no calibrated V4 historical comparison or realism approval',
 }
}
