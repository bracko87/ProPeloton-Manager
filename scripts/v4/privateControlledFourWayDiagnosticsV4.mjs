/**
 * Read-only four-way V4 diagnostic aggregation.
 * No rider IDs, team IDs, race IDs, detailed replay or private commands escape.
 * Historical comparison is NOT an original-lock parity proof.
 */
const finite=x=>typeof x==='number'&&Number.isFinite(x)
const num=x=>finite(x)?x:null
const round=x=>finite(x)?Math.round(x*1000)/1000:null
const mean=x=>x.length?round(x.reduce((a,b)=>a+b,0)/x.length):null
const max=x=>x.length?round(Math.max(...x)):null
const sameGap=(a,b)=>a===null&&b===null||
 finite(a)&&finite(b)&&Math.abs(a-b)<0.011
function indexed(result,label){
 const rows=result?.finishResolution?.classification
 if(!Array.isArray(rows)||rows.length!==108)throw Error(label+'_CLASSIFICATION_INVALID')
 const out=new Map()
 for(const row of rows){
  if(typeof row?.riderId!=='string'||!row.riderId||out.has(row.riderId))
   throw Error(label+'_RIDER_SET_INVALID')
  out.set(row.riderId,row)
 }
 return out
}
function energies(result,label){
 const rows=result?.postStageUpdate?.riderUpdates
 if(!Array.isArray(rows)||rows.length!==108)throw Error(label+'_ENERGY_SET_INVALID')
 const out=new Map()
 for(const row of rows){
  if(typeof row?.riderId!=='string'||!row.riderId||out.has(row.riderId)||
     !finite(row.finishEnergy)||!finite(row.energySpent))
   throw Error(label+'_ENERGY_ROW_INVALID')
  out.set(row.riderId,row)
 }
 return out
}
function gap(row){return row.gapSeconds===null?null:num(row.gapSeconds)}
function rank(row){return row.rank===null?null:num(row.rank)}
function status(row){return String(row?.status??'')}
const race=result=>result?.roadRaceResolution??{}
/**
 * Calibration summary's maximumBreakawayGapSeconds omits intermediate
 * Phase-1/2/3 trajectory samples. Never label it the observed peak.
 */
export function observedBreakawayPeakV4(result){
 const r=race(result),all=[]
 const collect=x=>{if(finite(x)&&x>=0)all.push(x)}
 for(const phase of ['phase1Opening','phase2Development','phase3Decisive']){
  const p=r[phase]
  if(!p)continue
  for(const key of ['initialGapSeconds','startGapSeconds','endGapSeconds',
                    'physicalStartGapSeconds','physicalEndGapSeconds'])
   collect(p[key])
  if(Array.isArray(p.physicalGapTrajectory))
   for(const row of p.physicalGapTrajectory)collect(row?.gapSeconds)
 }
 const p4=r.phase4Finish
 if(p4){
  collect(p4.startGapSeconds);collect(p4.endGapSeconds)
  if(Array.isArray(p4.chaseSteps))
   for(const row of p4.chaseSteps){
    collect(row?.startGapSeconds);collect(row?.endGapSeconds)
   }
 }
 return all.length?max(all):null
}
export function compactRaceDiagnosticsV4(result){
 const classification=indexed(result,'DIAGNOSTIC')
 const r=race(result)
 const count=x=>[...classification.values()].filter(v=>status(v)===x).length
 const p1=r.phase1Opening,p2=r.phase2Development,p3=r.phase3Decisive,p4=r.phase4Finish
 const phaseEnd=p=>p?num(p.physicalEndGapSeconds??p.endGapSeconds):null
 const finishers=[...classification.values()].filter(x=>status(x)==='finished')
 const winner=finishers.find(x=>rank(x)===1)
 if(!winner||!finite(winner.officialTimeSeconds))throw Error('DIAGNOSTIC_WINNER_INVALID')
 return {
  finishers:count('finished'),dnf:count('dnf'),winnerTimeSeconds:round(winner.officialTimeSeconds),
  ridersAtZeroGap:finishers.filter(x=>sameGap(gap(x),0)).length,
  maximumFinishGapSeconds:max(finishers.map(gap).filter(finite)),
  finalGroupCount:num(result.calibrationSummary?.finalGroupCount),
  calibrationReportedPeakSeconds:num(result.calibrationSummary?.maximumBreakawayGapSeconds),
  observedBreakawayPeakSeconds:observedBreakawayPeakV4(result),
  phase1EndGapSeconds:phaseEnd(p1),
  phase2EndGapSeconds:phaseEnd(p2),
  phase3EndGapSeconds:phaseEnd(p3),
  phase4EndGapSeconds:phaseEnd(p4),
  phase3ChasingTeamCount:Array.isArray(p3?.physicalChasingTeamIds)?
    p3.physicalChasingTeamIds.length:null,
  openingBreakawaySize:Array.isArray(p1?.breakawayRiderIds)?
    p1.breakawayRiderIds.length:null,
  caught:typeof result.calibrationSummary?.breakawayCaught==='boolean'?
    result.calibrationSummary.breakawayCaught:null,
  replayCheckpoints:Array.isArray(result.replayTimeline?.checkpoints)?
    result.replayTimeline.checkpoints.length:null
 }
}
/** Pair variants privately to isolate AI-tactics and V4-physics effects. */
export function pairedRaceDifferencesV4(a,b){
 const x=indexed(a,'PAIR_LEFT'),y=indexed(b,'PAIR_RIGHT')
 const ea=energies(a,'PAIR_LEFT'),eb=energies(b,'PAIR_RIGHT')
 if([...x.keys()].some(id=>!y.has(id)||!ea.has(id)||!eb.has(id)))
  throw Error('PAIR_RIDER_SET_MISMATCH')
 const ranks=[],gaps=[],energiesAbs=[]
 let statusChanged=0,rankChanged=0,gapChanged=0,rankOnlySameGap=0
 for(const [id,left] of x){
  const right=y.get(id)
  const sr=status(left)!==status(right)
  const rr=rank(left)!==rank(right)
  const gr=!sameGap(gap(left),gap(right))
  if(sr)statusChanged++
  if(rr)rankChanged++
  if(gr)gapChanged++
  if(rr&&!gr&&!sr)rankOnlySameGap++
  if(finite(rank(left))&&finite(rank(right)))
   ranks.push(Math.abs(rank(left)-rank(right)))
  if(finite(gap(left))&&finite(gap(right)))
   gaps.push(Math.abs(gap(left)-gap(right)))
  energiesAbs.push(Math.abs(eb.get(id).finishEnergy-ea.get(id).finishEnergy))
 }
 const winner=m=>[...m.values()].find(row=>status(row)==='finished'&&rank(row)===1)?.riderId
 const lw=winner(x),rw=winner(y)
 if(!lw||!rw)throw Error('PAIR_WINNER_INVALID')
 return {
  sameWinner:lw===rw,
  statusChangedRiders:statusChanged,rankChangedRiders:rankChanged,
  gapChangedRiders:gapChanged,rankChangedWithSameGapAndStatus:rankOnlySameGap,
  meanAbsoluteRankChange:mean(ranks),maximumAbsoluteRankChange:max(ranks),
  meanAbsoluteGapChangeSeconds:mean(gaps),maximumAbsoluteGapChangeSeconds:max(gaps),
  meanAbsoluteFinishEnergyDelta:mean(energiesAbs),
  maximumAbsoluteFinishEnergyDelta:max(energiesAbs)
 }
}
export function summarizeControlledFourWayV4({reference,planned,baselineOriginal,
 baselineV4Tactics,v4Original,v4V4Tactics,compareWithOfficial}){
 if(!reference||!planned||!Array.isArray(planned.intents)||
    typeof compareWithOfficial!=='function')throw Error('FOUR_WAY_INPUT_REJECTED')
 const cases={baselineOriginal,baselineV4Tactics,v4Original,v4V4Tactics}
 const metrics={}
 for(const [name,result] of Object.entries(cases)){
  const official=compareWithOfficial(reference,result)
  if(official.status!=='V4_HISTORICAL_OUTCOMES_COMPARED'||
     official.officialArchivedResultVerified!==true)
   throw Error('FOUR_WAY_OFFICIAL_VERIFICATION_REJECTED')
  metrics[name]={...compactRaceDiagnosticsV4(result),
   vsArchivedOfficial:official.differences}
 }
 const officialPeak=num(reference.savedRaceSummary?.observedPeakBreakawayGapSeconds)
 if(officialPeak===null)throw Error('FOUR_WAY_OFFICIAL_PEAK_MISSING')
 return {
  contract:'ppm.v4.private-controlled-four-way.v1',
  status:'V4_CONTROLLED_FOUR_WAY_COMPLETE',
  researchOnly:true,officialWrites:0,productionEnabled:false,
  productionParityVerified:false,originalProductionLockVerified:false,
  ridersCompared:108,
  sharedReconstructedInputAndSeed:true,
  // The source was reconstructed at the historical lock window.
  comparisonScope:'factorial_same_reconstructed_input_and_seed_not_original_production_lock',
  aiTeams:planned.aiTeams,humanTeams:planned.humanTeams,
  plannedAIIntents:planned.intents.length,
  archivedOfficial:{
   finishers:reference.officialRows.filter(x=>status(x)==='finished').length,
   dnf:reference.officialRows.filter(x=>status(x)==='dnf').length,
   calibrationReportedPeakSeconds:num(reference.savedRaceSummary.peakBreakawayGapSeconds),
   observedBreakawayPeakSeconds:officialPeak,
   observedSampleCount:num(reference.savedRaceSummary.observedPeakSampleCount)
  },
  cases:metrics,
  isolatedEffects:{
   aiTacticsOnBaseline:pairedRaceDifferencesV4(baselineOriginal,baselineV4Tactics),
   v4PhysicsWithOriginalTactics:pairedRaceDifferencesV4(baselineOriginal,v4Original),
   v4PhysicsWithAiTactics:pairedRaceDifferencesV4(baselineV4Tactics,v4V4Tactics),
   aiTacticsOnV4Physics:pairedRaceDifferencesV4(v4Original,v4V4Tactics)
  }
 }
}

/**
 * A rejected original-engine arm is valid research evidence, not a reason to
 * erase all successful controlled runs. Missing arms are explicitly null and
 * NO causal interaction is inferred from an unavailable pair.
 * The result is never labeled a completed four-way experiment.
 */
export function summarizeControlledPartialFourWayV4({
 reference,planned,caseResults,failures,prefixProbes,compareWithOfficial
}){
 const names=['baselineOriginal','baselineV4Tactics','v4Original','v4V4Tactics']
 const pairs={
  aiTacticsOnBaseline:['baselineOriginal','baselineV4Tactics'],
  v4PhysicsWithOriginalTactics:['baselineOriginal','v4Original'],
  v4PhysicsWithAiTactics:['baselineV4Tactics','v4V4Tactics'],
  aiTacticsOnV4Physics:['v4Original','v4V4Tactics']
 }
 if(!reference||!planned||!Array.isArray(planned.intents)||
    typeof compareWithOfficial!=='function'||!caseResults||!failures||
    Object.keys(caseResults).some(k=>!names.includes(k))||
    Object.keys(failures).some(k=>!names.includes(k))||
    !caseResults.baselineOriginal||!Array.isArray(prefixProbes)||
    prefixProbes.length!==4)
  throw Error('PARTIAL_FOUR_WAY_INPUT_REJECTED')
 const metrics={},safeFailures={},effects={}
 let completed=0
 for(const name of names){
  const result=caseResults[name]??null
  const failure=failures[name]??null
  if((result===null)===(failure===null)||
    (failure!==null&&(typeof failure!=='string'||
      !/^SHADOW_PHYSICS_[A-Z0-9_]+_REJECTED$/.test(failure))))
   throw Error('PARTIAL_FOUR_WAY_FAILURE_REJECTED')
  safeFailures[name]=failure
  if(result===null){metrics[name]=null;continue}
  const official=compareWithOfficial(reference,result)
  if(official?.status!=='V4_HISTORICAL_OUTCOMES_COMPARED'||
     official.officialArchivedResultVerified!==true)
   throw Error('PARTIAL_FOUR_WAY_OFFICIAL_VERIFICATION_REJECTED')
  metrics[name]={...compactRaceDiagnosticsV4(result),
   vsArchivedOfficial:official.differences}
  completed++
 }
 if(completed>=4||completed<1||
    !prefixProbes.every((row,i)=>row&&row.throughPhase===i+1&&
     ['PASS','EXECUTION_REJECTED','REPLAY_REJECTED','NOT_RUN'].includes(row.status)&&
     (row.reason===null||typeof row.reason==='string'&&
      /^SHADOW_PHYSICS_[A-Z0-9_]+_REJECTED$/.test(row.reason))))
  throw Error('PARTIAL_FOUR_WAY_PROBES_REJECTED')
 for(const [name,[left,right]] of Object.entries(pairs)){
  effects[name]=caseResults[left]&&caseResults[right]?
   pairedRaceDifferencesV4(caseResults[left],caseResults[right]):null
 }
 const saved=reference.savedRaceSummary
 if(!saved||!finite(saved.observedPeakBreakawayGapSeconds))
  throw Error('PARTIAL_FOUR_WAY_OFFICIAL_PEAK_MISSING')
 return {
  contract:'ppm.v4.private-controlled-four-way.v1',
  status:'V4_CONTROLLED_PARTIAL_DIAGNOSTIC',
  researchOnly:true,officialWrites:0,productionEnabled:false,
  productionParityVerified:false,originalProductionLockVerified:false,
  ridersCompared:108,sharedReconstructedInputAndSeed:true,
  comparisonScope:'factorial_same_reconstructed_input_and_seed_not_original_production_lock',
  aiTeams:planned.aiTeams,humanTeams:planned.humanTeams,
  plannedAIIntents:planned.intents.length,
  archivedOfficial:{
   finishers:reference.officialRows.filter(x=>status(x)==='finished').length,
   dnf:reference.officialRows.filter(x=>status(x)==='dnf').length,
   calibrationReportedPeakSeconds:num(saved.peakBreakawayGapSeconds),
   observedBreakawayPeakSeconds:num(saved.observedPeakBreakawayGapSeconds),
   observedSampleCount:num(saved.observedPeakSampleCount)
  },
  cases:metrics,isolatedEffects:effects,
  completedArms:completed,completeFourWay:false,
  safeFailures,prefixProbes
 }
}
