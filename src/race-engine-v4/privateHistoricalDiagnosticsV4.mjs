/** Fixed-category, identity-free retrospective V2/V4 research diagnostics. */
export const HISTORICAL_TERRAINS=Object.freeze(['flat','hilly','mountain','cobbled','unknown'])
export const HISTORICAL_PARITY_REASONS=Object.freeze([
 'RIDER_COUNT','RIDER_IDENTITY','RANK','STATUS','GAP','OFFICIAL_TIME'
])
export const HISTORICAL_ERROR_TYPES=Object.freeze([
 'TYPE_ERROR','RANGE_ERROR','SYNTAX_ERROR','OTHER_ERROR','NON_ERROR_THROW'
])
export const HISTORICAL_FAILURE_REASONS=Object.freeze([
 'REPLAY_FRONT_GROUP_TRANSFER','REPLAY_OTHER','OTHER_RUNTIME_ERROR','NON_ERROR_THROW'
])
/** Only fixed safe categories; raw error messages can contain private identities. */
export function safeHistoricalFailureReason(error){
 if(!(error instanceof Error))return 'NON_ERROR_THROW'
 if(error.message.startsWith('Universal replay synchronization failed:'))
  return error.message.startsWith(
   'Universal replay synchronization failed: front_group_transfer_without_physical_transition:')?
    'REPLAY_FRONT_GROUP_TRANSFER':'REPLAY_OTHER'
 return 'OTHER_RUNTIME_ERROR'
}
export const HISTORICAL_FAILURE_CHECKPOINTS=Object.freeze([
 'LATE_CHASE_STEP','RACE_STATUS','WINNER_FINISH','FINISH_GROUP_TRANSITION',
 'BRIDGE_CATCH','OTHER_CHECKPOINT'
])
export const HISTORICAL_FAILURE_TRANSFERS=Object.freeze([
 'F1_TO_P','F2_TO_P','B_TO_P','B_TO_F','F_TO_B','F_TO_F',
 'F_TO_C','P_TO_F','OTHER_TRANSFER'
])
/** Parse only whitelisted checkpoint/transfer types, never IDs or free text. */
export function safeHistoricalFailureLocation(error){
 const message=error instanceof Error?error.message:''
 const checkpoint=message.includes('|replay|late-chase-step-')?'LATE_CHASE_STEP':
  message.includes('|replay|race-status-')?'RACE_STATUS':
  message.includes('|replay|winner-finish')?'WINNER_FINISH':
  message.includes('|replay|finish-group-transition')?'FINISH_GROUP_TRANSITION':
  message.includes('|replay|bridge-caught-')?'BRIDGE_CATCH':'OTHER_CHECKPOINT'
 const transfer=message.includes(':F1->P:')?'F1_TO_P':
  message.includes(':F2->P:')?'F2_TO_P':
  /:B\d+->P:/.test(message)?'B_TO_P':
  /:B\d+->F\d+:/.test(message)?'B_TO_F':
  /:F\d+->B\d+:/.test(message)?'F_TO_B':
  /:F\d+->F\d+:/.test(message)?'F_TO_F':
  /:F\d+->C\d+:/.test(message)?'F_TO_C':
  /:P->F\d+:/.test(message)?'P_TO_F':'OTHER_TRANSFER'
 return {checkpoint,transfer}
}
export const HISTORICAL_REPLAY_ISSUE_CATEGORIES=Object.freeze([
 'SAME_KILOMETRE_PHYSICAL_STATE','GAP_DISTANCE_BOUND','FINAL_GROUP_MEMBERSHIP',
 'POST_CATCH_TRANSITION','FRONT_LINEAGE','BRIDGE_SEQUENCE',
 'WINNER_TIMING','REPLAY_GROUP_MEMBERSHIP','REPLAY_OTHER','NOT_REPLAY'
])
/** First strict replay invariant only; never echo free text, IDs or checkpoint names. */
export function safeHistoricalReplayIssueCategory(error){
 const msg=error instanceof Error?error.message:''
 const head='Universal replay synchronization failed: '
 if(!msg.startsWith(head))return 'NOT_REPLAY'
 const code=msg.slice(head.length).split(':')[0]
 if(code==='same_kilometre_physical_state_mismatch')return 'SAME_KILOMETRE_PHYSICAL_STATE'
 if(code==='gap_change_not_distance_bounded')return 'GAP_DISTANCE_BOUND'
 if(code==='final_group_membership_mismatch'||code==='final_road_groups_or_gaps_mismatch')
  return 'FINAL_GROUP_MEMBERSHIP'
 if(code==='post_catch_breakaway_or_chase_reappears'||
    code==='post_catch_group_transfer_without_physical_transition')
  return 'POST_CATCH_TRANSITION'
 if(code.startsWith('opening_breakaway_lineage_')||
    code==='opening_breakaway_reappears')return 'FRONT_LINEAGE'
 if(code.startsWith('bridge_'))return 'BRIDGE_SEQUENCE'
 if(code==='finish_winner_mismatch'||code==='finish_replay_timestamp_mismatch'||
    code==='final_replay_timestamp_mismatch'||code==='finish_commentary_winner_mismatch')
  return 'WINNER_TIMING'
 if(code==='rider_group_gap_mismatch'||code==='rider_state_missing_group'||
    code==='group_gap_identity_mismatch'||code==='duplicate_group_rider_membership')
  return 'REPLAY_GROUP_MEMBERSHIP'
 return 'REPLAY_OTHER'
}
export const HISTORICAL_FINISH_EVIDENCE=Object.freeze([
 'CAUGHT_WITHIN_PHYSICAL_TOLERANCE','CAUGHT_WITHIN_OFFICIAL_GROUP',
 'CAUGHT_BUT_SEPARATED','NOT_CAUGHT_WITHIN_PHYSICAL_TOLERANCE',
 'NOT_CAUGHT_WITHIN_OFFICIAL_GROUP','NOT_CAUGHT_AND_SEPARATED','UNKNOWN'
])
/** Report a fixed category only; raw race results never enter public logs. */
export function safeHistoricalFinishEvidence(error){
 const msg=error instanceof Error?error.message:''
 const pairs=[
  ['YES','WITHIN_CATCH','CAUGHT_WITHIN_PHYSICAL_TOLERANCE'],
  ['YES','WITHIN_OFFICIAL_GROUP','CAUGHT_WITHIN_OFFICIAL_GROUP'],
  ['YES','SEPARATED','CAUGHT_BUT_SEPARATED'],
  ['NO','WITHIN_CATCH','NOT_CAUGHT_WITHIN_PHYSICAL_TOLERANCE'],
  ['NO','WITHIN_OFFICIAL_GROUP','NOT_CAUGHT_WITHIN_OFFICIAL_GROUP'],
  ['NO','SEPARATED','NOT_CAUGHT_AND_SEPARATED']
 ]
 for(const [flag,gap,label] of pairs)
  if(msg.includes(':v4_finish_caught='+flag+':v4_finish_gap='+gap))
   return label
 return 'UNKNOWN'
}
const equalNumber=(a,b)=>a===null||b===null?a===b:
 Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=0.01

/** Reasons are fixed labels only; never publish rider identity or raw values. */
export function explainHistoricalClassificationParity(saved,current){
 if(!Array.isArray(saved)||!Array.isArray(current))
  throw Error('INVALID_CLASSIFICATION_DIAGNOSTIC')
 const found=new Set()
 if(saved.length!==current.length)found.add('RIDER_COUNT')
 else for(let i=0;i<saved.length;i++){
  const a=saved[i],b=current[i]
  if(a.id!==b.id)found.add('RIDER_IDENTITY')
  if(a.rank!==b.rank)found.add('RANK')
  if(a.status!==b.status)found.add('STATUS')
  if(!equalNumber(a.gap,b.gap))found.add('GAP')
  if(!equalNumber(a.time,b.time))found.add('OFFICIAL_TIME')
 }
 const reasons=HISTORICAL_PARITY_REASONS.filter(x=>found.has(x))
 return {equal:reasons.length===0,reasons}
}
export function safeHistoricalErrorType(error){
 if(error instanceof TypeError)return 'TYPE_ERROR'
 if(error instanceof RangeError)return 'RANGE_ERROR'
 if(error instanceof SyntaxError)return 'SYNTAX_ERROR'
 if(error instanceof Error)return 'OTHER_ERROR'
 return 'NON_ERROR_THROW'
}
export function safeHistoricalTerrain(raw){
 const terrain=raw?.input_snapshot_json?.stage?.terrainType
 return HISTORICAL_TERRAINS.slice(0,4).includes(terrain)?terrain:'unknown'
}

/**
 * Research-only physical front-gap peak. Unlike the official V2 calibration
 * summary, also includes interior main-front trajectory points across phases.
 * Secondary-front distance is intentionally separate from the primary escape.
 */
export function historicalPhysicalGapAudit(result){
 const road=result?.roadRaceResolution
 const published=result?.calibrationSummary?.maximumBreakawayGapSeconds
 const publishedMaximum=typeof published==='number'&&Number.isFinite(published)&&published>=0?published:null
 if(!road||road.active!==true)
  return {publishedMaximum,observedPeak:null,omittedPeakSeconds:null}
 const p1=road.phase1Opening,p2=road.phase2Development
 const p3=road.phase3Decisive,p4=road.phase4Finish
 const values=[]
 const add=n=>{if(typeof n==='number'&&Number.isFinite(n)&&n>=0)values.push(n)}
 for(const p of [p1,p2,p3,p4]){
  if(!p)continue
  for(const point of Array.isArray(p.physicalGapTrajectory)?p.physicalGapTrajectory:[])
   add(point?.gapSeconds)
 }
 add(p1?.initialGapSeconds)
 add(p2?.startGapSeconds);add(p2?.endGapSeconds)
 add(p3?.physicalStartGapSeconds);add(p3?.physicalEndGapSeconds)
 add(p4?.startGapSeconds);add(p4?.endGapSeconds)
 for(const step of Array.isArray(p4?.chaseSteps)?p4.chaseSteps:[]){
  add(step?.startGapSeconds);add(step?.endGapSeconds)
 }
 const observedPeak=values.length?Number(Math.max(...values).toFixed(6)):null
 const omittedPeakSeconds=publishedMaximum!==null&&observedPeak!==null?
  Number(Math.max(0,observedPeak-publishedMaximum).toFixed(6)):null
 return {publishedMaximum,observedPeak,omittedPeakSeconds}
}

/**
 * Observed distance of the ORIGINAL opening-B breakaway, not an arbitrary
 * later F lineage. Start/end samples and exact catch fields are authoritative;
 * Phase 4 catch distance is interpolated within recorded 2-km chase steps.
 * Unknown or untraceable lineages remain unknown, never "caught at 7 seconds".
 * Metric values only: no stage, rider, team or private-record identifiers.
 */
export function historicalOpeningBreakawayJourney(result,stageDistanceKm=result?.stage?.distanceKm){
 const road=result?.roadRaceResolution
 const p1=road?.phase1Opening,p2=road?.phase2Development
 const p3=road?.phase3Decisive,p4=road?.phase4Finish
 const accepted=Array.isArray(p1?.attackAttempts)?
  p1.attackAttempts.filter(a=>a?.acceptedEscapeLaunch===true&&
   Number.isFinite(a?.attemptKm)&&a.attemptKm>=0):[]
 const empty={openingAccepted:false,launchKm:null,catchKm:null,
  catchLocation:'none',kmAhead:null,peakSeconds:null,
  sampledAbove60Km:0,sampledAbove120Km:0,samples:0,phase4Estimated:false}
 if(!accepted.length||!Array.isArray(p1?.breakawayRiderIds)||
  !p1.breakawayRiderIds.length)return empty
 const launchKm=Math.min(...accepted.map(a=>a.attemptKm))
 const ids=new Set(p1.breakawayRiderIds)
 const belongs=rows=>Array.isArray(rows)&&rows.some(id=>ids.has(id))
 const points=[]
 const add=(km,gap)=>{
  if(Number.isFinite(km)&&Number.isFinite(gap)&&km>=launchKm-0.001&&gap>=0)
   points.push({km,gap})
 }
 const trajectory=p=>{
  for(const q of Array.isArray(p?.physicalGapTrajectory)?p.physicalGapTrajectory:[])
   add(q?.kmFromStart,q?.gapSeconds)
 }
 const chaseSteps=p=>{
  for(const s of Array.isArray(p?.chaseSteps)?p.chaseSteps:[]){
   add(s?.kmStart,s?.startGapSeconds);add(s?.kmEnd,s?.endGapSeconds)
  }
 }
 let catchKm=null,catchLocation='unknown',phase4Estimated=false
 const caught=(km,label,estimated=false)=>{
  if(Number.isFinite(km)&&km>=launchKm-0.001){
   catchKm=km;catchLocation=label;phase4Estimated=estimated
  }else catchLocation='caught_location_unknown'
 }
 trajectory(p1)
 if(p1?.breakawayCatchKm!=null)caught(p1.breakawayCatchKm,'phase1_exact')
 else if(!p2||!belongs(p2.breakawayRiderIdsAtStart))
  catchLocation='lineage_untraceable_after_phase1'
 else{
  trajectory(p2)
  if(p2.breakawayCatchKm!=null)caught(p2.breakawayCatchKm,'phase2_exact')
  else if(!p3||!belongs(p2.breakawayRiderIdsAtEnd)||
   !belongs(p3.physicalEscapeRiderIdsAtStart))
   catchLocation='lineage_untraceable_after_phase2'
  else{
   trajectory(p3)
   if(p3.physicalCatchKm!=null)caught(p3.physicalCatchKm,'phase3_exact')
   else if(!p4||!belongs(p3.physicalEscapeRiderIdsAtEnd)||
    !belongs(p4.escapeRiderIdsAtStart))
    catchLocation='lineage_untraceable_after_phase3'
   else{
    chaseSteps(p4)
    const tolerance=0.75
    if(p4.breakawayCaught===true){
     const step=(p4.chaseSteps??[]).find(s=>
      Number.isFinite(s?.kmStart)&&Number.isFinite(s?.kmEnd)&&
      Number.isFinite(s?.startGapSeconds)&&Number.isFinite(s?.endGapSeconds)&&
      s.startGapSeconds>tolerance&&s.endGapSeconds<=tolerance&&
      s.kmEnd>s.kmStart)
     if(step){
      const fraction=Math.max(0,Math.min(1,
       (step.startGapSeconds-tolerance)/
       Math.max(0.000001,step.startGapSeconds-step.endGapSeconds)))
      caught(step.kmStart+(step.kmEnd-step.kmStart)*fraction,
       'phase4_step_estimate',true)
     }else catchLocation='phase4_caught_location_unknown'
    }else if(p4.breakawaySurvived===true&&
     Number.isFinite(stageDistanceKm)&&
     p4.endGapSeconds>tolerance)
     catchLocation='survived_to_finish'
    else catchLocation='phase4_outcome_unresolved'
   }
  }
 }
 const finishKm=stageDistanceKm
 const endKm=catchKm??(catchLocation==='survived_to_finish'&&
  Number.isFinite(finishKm)?finishKm:null)
 const sorted=points.filter(p=>endKm===null||p.km<=endKm+0.001)
  .sort((a,b)=>a.km-b.km||b.gap-a.gap)
 const ordered=[]
 for(const p of sorted){
  if(ordered.length&&Math.abs(ordered.at(-1).km-p.km)<0.000001){
   ordered[ordered.length-1].gap=Math.max(ordered.at(-1).gap,p.gap)
  }else ordered.push({...p})
 }
 const observedAtLeast=threshold=>{
  let km=0
  for(let i=1;i<ordered.length;i++){
   const prior=ordered[i-1],next=ordered[i]
   const segment=next.km-prior.km
   // Do not interpolate an unmeasured gap across >5 km of the course.
   if(segment>0&&segment<=5&&prior.gap>=threshold&&next.gap>=threshold)
    km+=segment
  }
  return Number(km.toFixed(3))
 }
 const kmAhead=endKm===null?null:
  Number(Math.max(0,endKm-launchKm).toFixed(3))
 return {openingAccepted:true,launchKm:Number(launchKm.toFixed(3)),
  catchKm:catchKm===null?null:Number(catchKm.toFixed(3)),
  catchLocation,kmAhead,phase4Estimated,
  peakSeconds:ordered.length?Number(Math.max(...ordered.map(x=>x.gap)).toFixed(3)):null,
  sampledAbove60Km:observedAtLeast(60),
  sampledAbove120Km:observedAtLeast(120),
  samples:ordered.length}
}
