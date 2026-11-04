/**
 * PRIVATE historical V2-versus-calibrated-V4 physics worker.
 * Compiled three times (preserved_v2 / combined / combined_energy) with
 * different source transformations. Uses IDENTICAL original locked input.
 * No network, SQL, publication, rider names or raw snapshots in stdout.
 */
import {readFileSync,realpathSync,statSync} from 'node:fs'
import {matchPhysicalFailureCheckpointV4} from '../../scripts/v4/privatePhysicalFailureMatchV4.mjs'
import {relative,isAbsolute,sep} from 'node:path'
import {createHash} from 'node:crypto'
import {explainHistoricalClassificationParity,safeHistoricalErrorType,safeHistoricalFailureReason,safeHistoricalFailureLocation,safeHistoricalFinishEvidence,
 safeHistoricalTerrain,historicalPhysicalGapAudit,historicalOpeningBreakawayJourney,
 safeHistoricalReplayIssueCode,safeV4PostCatchTransferClass,V4_POST_CATCH_TRANSFER_CLASSES,
 safeHistoricalPostCatchPeriod,HISTORICAL_POST_CATCH_PERIODS,
 safeHistoricalPostCatchForensicPhase,safeHistoricalPostCatchForensicGap,
 HISTORICAL_POST_CATCH_FORENSIC_PHASES,HISTORICAL_POST_CATCH_FORENSIC_GAPS,
 HISTORICAL_TERRAINS,HISTORICAL_ERROR_TYPES,HISTORICAL_FAILURE_REASONS,
 HISTORICAL_FAILURE_CHECKPOINTS,HISTORICAL_FAILURE_TRANSFERS,HISTORICAL_FINISH_EVIDENCE}
 from './privateHistoricalDiagnosticsV4.mjs'
import {runSelectedRaceEngineV1,selectCompleteRaceEngineLaneV1}
 from '../universal-race-engine/runSelectedRaceEngineV1.ts'
import type {UniversalRaceEngineResult} from '../universal-race-engine/runRaceEngine.ts'

declare const __V4_PRIVATE_PHYSICS_VARIANT__: 'preserved_v2'|'combined'|'combined_energy'|'combined_energy_priority'|'private_replay_candidate'
const variant=__V4_PRIVATE_PHYSICS_VARIANT__
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const privatePath=(raw:unknown,repository:string,limit:number):string=>{
 if(typeof raw!=='string'||!isAbsolute(raw))throw Error('INVALID_PRIVATE_INPUT')
 const path=realpathSync(raw),sub=relative(repository,path),meta=statSync(path)
 if(sub===''||(sub!=='..'&&!sub.startsWith('..'+sep)&&!isAbsolute(sub))||
    !meta.isFile()||meta.size<=0||meta.size>limit||
    (process.platform!=='win32'&&(meta.mode&0o077)!==0))
  throw Error('INVALID_PRIVATE_INPUT')
 return path
}
const normalized=(result:UniversalRaceEngineResult)=>{
 const arr=result.finishResolution?.classification
 if(!Array.isArray(arr)||arr.length<2)throw Error('NO_FINISH_CLASSIFICATION')
 return arr.map(r=>({
  id:String(r.riderId),rank:r.rank==null?null:Number(r.rank),
  status:String(r.status),
  gap:r.gapSeconds==null?null:Number(r.gapSeconds),
  time:r.officialTimeSeconds==null?null:Number(r.officialTimeSeconds),
 })).sort((a,b)=>a.id.localeCompare(b.id))
}
const finite=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null
function evaluate(raw:unknown){
 if(!record(raw)||raw.status!=='completed'||!record(raw.input_snapshot_json)||
   !record(raw.result_summary_json)||!record(raw.result_summary_json.output_snapshot))
  throw Error('INCOMPLETE_HISTORY')
 const input=raw.input_snapshot_json
 const saved=raw.result_summary_json.output_snapshot.universalResult as UniversalRaceEngineResult
 if(!record(saved)||!record(input.stage)||!record(input.race)||
   input.stage.stageFormat!=='road_race'||!input.stage.stageId||
   !['flat','hilly','mountain','cobbled'].includes(input.stage.terrainType)||
   !Array.isArray(input.riders)||input.riders.length<2||
   !Array.isArray(input.teams)||input.teams.length<1||
   !Array.isArray(input.stagePlans)||input.stagePlans.length!==input.teams.length||
   input.stagePlans.some((p:any)=>p.locked!==true||p.status!=='locked')||
   saved.stageId!==input.stage.stageId||saved.raceId!==input.race.raceId)
  throw Error('INVALID_LOCKED_HISTORY')
 if(selectCompleteRaceEngineLaneV1(input.stage)!=='baseline_universal')
  throw Error('UNSUPPORTED_V2_SOLVER_LANE')
 const ctrl=raw.team_control
 if(!Array.isArray(ctrl)||ctrl.length!==input.teams.length)
  throw Error('UNVERIFIED_TEAM_CONTROL')
 const ownership=new Map(ctrl.map((x:any)=>[x.teamId,x.kind]))
 if(ownership.size!==ctrl.length||input.teams.some((t:any)=>
   !['ai','human'].includes(ownership.get(t.teamId)) ||
   (t.snapshot?.metadata?.scenarioAiControlled===true&&ownership.get(t.teamId)!=='ai'))||
   new Set(input.teams.map((t:any)=>t.teamId)).size!==input.teams.length||
   new Set(input.stagePlans.map((p:any)=>p.teamId)).size!==input.teams.length||
   input.stagePlans.some((p:any)=>!ownership.has(p.teamId)))
  throw Error('UNVERIFIED_TEAM_CONTROL')
 if(!Array.isArray(saved.finishResolution?.classification)||
   !raw.result_summary_json.stage_start_game_at)
  throw Error('MISSING_SAVED_RESULT')
 const srcHash=sha(input),stageHash=sha(input.stage.stageId).slice(0,16)
 const result=runSelectedRaceEngineV1(input)
 if(!result.validationPassed||sha(input)!==srcHash)
  throw Error('PHYSICAL_RESULT_INVALID')
 const rows=normalized(result),historic=normalized(saved)
 const historicalParity=explainHistoricalClassificationParity(historic,rows)
 const finishers=rows.filter(x=>x.status==='finished')
 const gaps=finishers.map(x=>x.gap).filter((g):g is number=>g!==null&&Number.isFinite(g))
 const rankings=finishers.filter(x=>x.rank!==null).sort((a,b)=>(a.rank??0)-(b.rank??0))
 const p3=result.roadRaceResolution?.phase3Decisive
 const p4=result.roadRaceResolution?.phase4Finish
 const phase3Growth=(p3&&Number.isFinite(p3.physicalStartGapSeconds)&&
   Number.isFinite(p3.physicalEndGapSeconds))?
    p3.physicalEndGapSeconds-p3.physicalStartGapSeconds:null
 const replaySynchronized=result.replaySynchronization?.synchronized===true
 const gapAudit=historicalPhysicalGapAudit(result)
 const archiveGapAudit=historicalPhysicalGapAudit(saved)
 const journey=historicalOpeningBreakawayJourney(result,input.stage.distanceKm)
 return {
  stageHash,sourceHash:srcHash,terrain:input.stage.terrainType,
  riderCount:input.riders.length,teams:input.teams.length,
  savedV2ClassificationParity:historicalParity.equal,
  savedV2ParityFailureKinds:historicalParity.reasons,
  historicalReplaySynchronized:saved.replaySynchronization?.synchronized===true,
  replaySynchronized,classificationHash:sha(rows),
  winnerHash:rankings.length?sha(rankings[0].id).slice(0,16):null,
  completedRiders:finishers.length,
  publishedFinishGroups:result.groupAndTimeResolution?.finalGroups?.length??null,
  maximumFinishGapSeconds:gaps.length?Math.max(...gaps):null,
  topFiveGapSeconds:rankings.slice(0,5).map(x=>x.gap),
  maximumBreakawayGapSeconds:gapAudit.publishedMaximum,
  observedPhysicalPeakSeconds:gapAudit.observedPeak,
  omittedPhysicalPeakSeconds:gapAudit.omittedPeakSeconds,
  archivedObservedPhysicalPeakSeconds:archiveGapAudit.observedPeak,
  archivedReportedMaximumGapSeconds:archiveGapAudit.publishedMaximum,
  archivedOmittedPhysicalPeakSeconds:archiveGapAudit.omittedPeakSeconds,
  breakawayCaught:result.calibrationSummary?.breakawayCaught===true,
  breakawaySurvived:result.calibrationSummary?.breakawaySurvived===true,
  openingJourney:journey,
  acceptedOpeningAttacks:result.roadRaceResolution?.phase1Opening?.attackAttempts
    ?.filter((a:any)=>a.acceptedEscapeLaunch).length??0,
  phase3GapGrowthSeconds:phase3Growth,
  phase4EndGapSeconds:finite(p4?.endGapSeconds),
  meanPhase4EnergyAtFinish:p4?.riderStates?.length?
   Number((p4.riderStates.reduce((sum:number,r:any)=>sum+r.energyAtFinish,0)/p4.riderStates.length).toFixed(6)):null,
 }
}
function main(){
 const repo=realpathSync(process.cwd())
 const manifest=privatePath(process.argv[2],repo,128*1024)
 const doc=JSON.parse(readFileSync(manifest,'utf8'))
 if(!record(doc)||!Array.isArray(doc.privateEnvelopePaths)||
   doc.privateEnvelopePaths.length===0||doc.privateEnvelopePaths.length>100||
   Object.keys(doc).some(k=>k!=='privateEnvelopePaths'))
  throw Error('BAD_MANIFEST')
 const paths=doc.privateEnvelopePaths.map((raw:unknown)=>privatePath(raw,repo,64*1024*1024))
 if(new Set(paths).size!==paths.length)throw Error('DUPLICATE_PRIVATE_PATH')
 const rows=[],rejected={invalid:0,unsupported:0,unsynchronized:0}
 const physicalProbe={observed:0,unavailable:0,missing:0,samples:0,transitions:0,failedRiderMovementObserved:0,failedRiderMovementMissing:0,failedRiderNotMatched:0,failedRiderLateBandObserved:0,failedRiderLateBandMissing:0,failedRiderOtherPeriod:0,exactIntervalOverlap:0,exactIntervalOutside:0,exactIntervalUnmatchable:0,boundaryPhysical:{CHANGED_MEMBERSHIP:0,SAME_MEMBERSHIP:0,UNAVAILABLE:0},boundaryUnavailableReasons:{INVALID_INPUT:0,REVERSED_INTERVAL:0,ZERO_LENGTH_INTERVAL:0,NO_GROUPS:0,RIDER_ABSENT:0,DUPLICATE_RIDER:0,INVALID_PHYSICAL_GROUP:0,PHYSICAL_MODEL_ERROR:0,VALID:0,UNKNOWN:0},replayPresentation:{SAME_KM_UNCHANGED:0,SAME_KM_RENUMBER_ONLY:0,SAME_KM_MEMBERSHIP_CHANGED:0,DISTANCE_UNCHANGED:0,DISTANCE_RENUMBER_ONLY:0,DISTANCE_MEMBERSHIP_CHANGED:0,UNAVAILABLE:0},physicalCheckpointCandidates:{PHYSICAL_TRANSITION_CANDIDATE:0,NO_PHYSICAL_MEMBERSHIP_CHANGE:0,NOT_ELIGIBLE:0,INVALID_PHYSICAL_EVIDENCE:0,UNSUPPORTED_TRANSITION:0,UNAVAILABLE:0},physicalEventProposals:{group_split:0,group_merge:0,group_reorganization:0,unavailable:0},shadowMerger:{SHADOW_CREATED:0,REJECTED_EVIDENCE:0,CHECKPOINT_NOT_FOUND:0,REPLAY_PHYSICAL_MEMBERSHIP_MISMATCH:0,ALREADY_HAS_TRANSITION:0,DUPLICATE_COMMENTARY_ID:0,UNAVAILABLE:0},shadowMismatch:{RIDER_GROUP_UNAVAILABLE:0,DISTANCE_MISMATCH:0,BOTH_MEMBERSHIPS:0,PREVIOUS_MEMBERSHIP:0,CURRENT_MEMBERSHIP:0,INVALID_COMMENTARY:0,UNKNOWN:0},shadowHandoff:{MATCH:0,REPLAY_GROUP_EXCHANGE:0,REPLAY_MISSING_PHYSICAL_MEMBERS:0,REPLAY_CONTAINS_EXTRA_MEMBERS:0,RIDER_MISSING_FROM_REPLAY:0,RIDER_DUPLICATED_IN_REPLAY:0,INVALID_EVIDENCE:0,UNKNOWN:0},shadowHandoffCheckpointKind:{EVENT:0,BASE:0,OTHER:0,UNKNOWN:0},checkpointStageDivergence:{STAGES_MATCH_PHYSICAL:0,DEFINITION_ALREADY_DIFFERS:0,NORMALIZATION_DIVERGENCE:0,PUBLICATION_FILTER_DIVERGENCE:0,POST_CONSTRUCTION_DIVERGENCE:0,RIDER_GROUP_UNAVAILABLE:0,CHECKPOINT_NOT_IN_BUILDER:0,UNAVAILABLE:0},postConstructionHandoff:{BASE_REPLAY_DIVERGED:0,PHASE10_DIVERGED:0,INTERMEDIATE_RECONCILIATION_DIVERGED:0,ALL_STAGES_MATCH:0,CHECKPOINT_OR_RIDER_MISSING:0,UNAVAILABLE:0},phase10MembershipStage:{INITIAL_ALREADY_DIFFERS:0,DIVERGED_AFTER_DETACHMENT:0,DIVERGED_AFTER_AUTONOMOUS_GROUPS:0,DIVERGED_AFTER_CONSOLIDATION:0,DIVERGED_AFTER_FINISH_COMMIT:0,DIVERGED_AFTER_DISPLAY_NORMALIZATION:0,RIDER_UNAVAILABLE_INITIAL:0,RIDER_UNAVAILABLE_AFTER_DETACHMENT:0,RIDER_UNAVAILABLE_AFTER_AUTONOMOUS_GROUPS:0,RIDER_UNAVAILABLE_AFTER_CONSOLIDATION:0,RIDER_UNAVAILABLE_AFTER_FINISH_COMMIT:0,RIDER_UNAVAILABLE_AFTER_DISPLAY_NORMALIZATION:0,ALL_STAGES_MATCH:0,STAGE_MISSING:0,UNAVAILABLE:0},shadowStrict:{STRICT_PASS:0,STRICT_BLOCKED:0,STRICT_ERROR:0,NOT_RUN:0},failureCaptureStatus:{CAPTURED:0,FIRST_CHECKPOINT:0,CHECKPOINT_NOT_FOUND:0,ISSUE_NOT_FOUND:0,NOT_REACHED:0}}
 const safeCodes=['INCOMPLETE_HISTORY','INVALID_LOCKED_HISTORY',
  'UNVERIFIED_TEAM_CONTROL','UNSUPPORTED_V2_SOLVER_LANE',
  'MISSING_SAVED_RESULT','PHYSICAL_RESULT_INVALID','NO_FINISH_CLASSIFICATION']
 const failureClasses=Object.fromEntries(safeCodes.map(k=>[k,0]))
 failureClasses.other=0
 const failureTerrains=Object.fromEntries(HISTORICAL_TERRAINS.map(t=>[t,{invalid:0,unsupported:0,other:0}]))
 const otherErrorTypes=Object.fromEntries(HISTORICAL_ERROR_TYPES.map(t=>[t,0]))
 const otherFailureReasons=Object.fromEntries(HISTORICAL_FAILURE_REASONS.map(t=>[t,0]))
 const safeReplayIssueCodes:Record<string,number>={}
 const postCatchTransferClasses=Object.fromEntries(V4_POST_CATCH_TRANSFER_CLASSES.map(k=>[k,0]))
 const postCatchPeriods=Object.fromEntries(HISTORICAL_POST_CATCH_PERIODS.map(k=>[k,0]))
 const postCatchForensicPhases=Object.fromEntries(HISTORICAL_POST_CATCH_FORENSIC_PHASES.map(k=>[k,0]))
 const postCatchForensicGaps=Object.fromEntries(HISTORICAL_POST_CATCH_FORENSIC_GAPS.map(k=>[k,0]))
 const otherFailureCheckpoints=Object.fromEntries(HISTORICAL_FAILURE_CHECKPOINTS.map(t=>[t,0]))
 const otherFailureTransfers=Object.fromEntries(HISTORICAL_FAILURE_TRANSFERS.map(t=>[t,0]))
 const otherFinishEvidence=Object.fromEntries(HISTORICAL_FINISH_EVIDENCE.map(t=>[t,0]))
 for(const path of paths){
  // Isolated worker state only. Never emit rider identities or snapshots.
  const globalProbe=globalThis as typeof globalThis & {__ppmV4PhysicalProbe?: unknown}
  delete (globalThis as typeof globalThis & {__ppmV4CheckpointStages?:unknown}).__ppmV4CheckpointStages
  delete (globalThis as typeof globalThis & {__ppmV4Phase10GroupStages?:unknown}).__ppmV4Phase10GroupStages
  delete globalProbe.__ppmV4PhysicalProbe
  let data:unknown=null
  let failedRiderId:string|null=null
  let failedPeriod:string|null=null
  try{
   data=JSON.parse(readFileSync(path,'utf8'))
   rows.push(evaluate(data))
  }catch(e){
   const code=e instanceof Error?e.message:'UNKNOWN'
   const category=code==='UNSUPPORTED_V2_SOLVER_LANE'?'unsupported':'invalid'
   rejected[category]++
   const bucket=failureTerrains[safeHistoricalTerrain(data)]
   bucket[category]++
   // Fixed constant keys only. Never print raw error messages, stacks or identities.
   if(safeCodes.includes(code))failureClasses[code]++
   else{
    failureClasses.other++
    bucket.other++
    otherErrorTypes[safeHistoricalErrorType(e)]++
    otherFailureReasons[safeHistoricalFailureReason(e)]++
    if(variant==='private_replay_candidate'){
      // The engine wraps blocking replay issues in a longer exception message.
      // Extract the rider from the known issue token, never report the ID.
      const match=code.match(/(?:^|[\s,])post_catch_group_transfer_without_physical_transition:([^:,\s]+):/)
      failedRiderId=match?.[1]??null
    }
    const replayCode=safeHistoricalReplayIssueCode(e)
    safeReplayIssueCodes[replayCode]=(safeReplayIssueCodes[replayCode]??0)+1
    postCatchTransferClasses[safeV4PostCatchTransferClass(e)]++
    postCatchPeriods[safeHistoricalPostCatchPeriod(e)]++
    if(variant==='private_replay_candidate')failedPeriod=safeHistoricalPostCatchPeriod(e)
    postCatchForensicPhases[safeHistoricalPostCatchForensicPhase(e)]++
    postCatchForensicGaps[safeHistoricalPostCatchForensicGap(e)]++
    const safeLocation=safeHistoricalFailureLocation(e)
    otherFailureCheckpoints[safeLocation.checkpoint]++
    otherFailureTransfers[safeLocation.transfer]++
    otherFinishEvidence[safeHistoricalFinishEvidence(e)]++
   }
  }finally{
   if(variant==='private_replay_candidate'){
    const probe=globalProbe.__ppmV4PhysicalProbe as {status?:unknown,samples?:unknown,transitions?:unknown}|undefined
    if(probe?.status==='OBSERVED'&&typeof probe.samples==='number'&&Number.isSafeInteger(probe.samples)&&typeof probe.transitions==='number'&&Number.isSafeInteger(probe.transitions)){
      physicalProbe.observed++
      physicalProbe.samples+=probe.samples as number
      physicalProbe.transitions+=probe.transitions as number
      const status=(probe as {failureCaptureStatus?:string}).failureCaptureStatus
      const statuses=physicalProbe.failureCaptureStatus
      if(status==='CAPTURED'||status==='FIRST_CHECKPOINT'||status==='CHECKPOINT_NOT_FOUND'||status==='ISSUE_NOT_FOUND')
        statuses[status]++
      else statuses.NOT_REACHED++
      if(failedRiderId){
        const outcome=(probe as {physicalCheckpointCandidate?:string}).physicalCheckpointCandidate
        const categories=physicalProbe.physicalCheckpointCandidates
        if(outcome&&Object.prototype.hasOwnProperty.call(categories,outcome))
          categories[outcome as keyof typeof categories]++
        else categories.UNAVAILABLE++
        if(outcome==='PHYSICAL_TRANSITION_CANDIDATE'){
          const shadow=(probe as {shadowMergerStatus?:string}).shadowMergerStatus
          const shadowCounts=physicalProbe.shadowMerger
          if(shadow&&Object.prototype.hasOwnProperty.call(shadowCounts,shadow))
            shadowCounts[shadow as keyof typeof shadowCounts]++
          else shadowCounts.UNAVAILABLE++
          if(shadow==='REPLAY_PHYSICAL_MEMBERSHIP_MISMATCH'){
            const mismatch=(probe as {shadowMismatch?:string}).shadowMismatch
            const mismatches=physicalProbe.shadowMismatch
            if(mismatch&&Object.prototype.hasOwnProperty.call(mismatches,mismatch))
              mismatches[mismatch as keyof typeof mismatches]++
            else mismatches.UNKNOWN++
            if(mismatch==='CURRENT_MEMBERSHIP'){
              const handoff=(probe as {shadowHandoff?:string}).shadowHandoff
              const categories=physicalProbe.shadowHandoff
              if(handoff&&Object.prototype.hasOwnProperty.call(categories,handoff))
                categories[handoff as keyof typeof categories]++
              else categories.UNKNOWN++
              const kind=(probe as {shadowHandoffCheckpointKind?:string}).shadowHandoffCheckpointKind
              const kinds=physicalProbe.shadowHandoffCheckpointKind
              const stage=(probe as {checkpointStageDivergence?:string}).checkpointStageDivergence
              const phase10=(probe as {phase10MembershipStage?:string}).phase10MembershipStage
              const phaseCounts=physicalProbe.phase10MembershipStage
              if(phase10&&Object.prototype.hasOwnProperty.call(phaseCounts,phase10))
                phaseCounts[phase10 as keyof typeof phaseCounts]++
              else phaseCounts.UNAVAILABLE++
              const downstream=(probe as {postConstructionHandoff?:string}).postConstructionHandoff
              const downCounts=physicalProbe.postConstructionHandoff
              if(downstream&&Object.prototype.hasOwnProperty.call(downCounts,downstream))
                downCounts[downstream as keyof typeof downCounts]++
              else downCounts.UNAVAILABLE++
              const stageCounts=physicalProbe.checkpointStageDivergence
              if(stage&&Object.prototype.hasOwnProperty.call(stageCounts,stage))
                stageCounts[stage as keyof typeof stageCounts]++
              else stageCounts.UNAVAILABLE++
              if(kind&&Object.prototype.hasOwnProperty.call(kinds,kind))
                kinds[kind as keyof typeof kinds]++
              else kinds.UNKNOWN++
            }
          }
          const strict=(probe as {shadowStrictStatus?:string}).shadowStrictStatus
          const strictCounts=physicalProbe.shadowStrict
          if(shadow==='SHADOW_CREATED'&&
             (strict==='STRICT_PASS'||strict==='STRICT_BLOCKED'||strict==='STRICT_ERROR'))
            strictCounts[strict]++
          else strictCounts.NOT_RUN++
        }
        if(outcome==='PHYSICAL_TRANSITION_CANDIDATE'){
          const proposal=(probe as {physicalCheckpointProposal?:{eventType?:string,exactEventKmKnown?:boolean,exactEventTimeKnown?:boolean,source?:string}}).physicalCheckpointProposal
          const type=proposal?.eventType
          if(proposal?.source==='authoritative_physical_groups'&&
             proposal.exactEventKmKnown===false&&proposal.exactEventTimeKnown===false&&
             (type==='group_split'||type==='group_merge'||type==='group_reorganization'))
            physicalProbe.physicalEventProposals[type]++
          else physicalProbe.physicalEventProposals.unavailable++
        }
      }
      if(failedRiderId){
        const presentation=(probe as {replayPresentationStatus?:string}).replayPresentationStatus
        const counts=physicalProbe.replayPresentation
        if(presentation&&Object.prototype.hasOwnProperty.call(counts,presentation))
          counts[presentation as keyof typeof counts]++
        else counts.UNAVAILABLE++
      }
      if(failedRiderId){
        const state=(probe as {boundaryPhysicalStatus?:string}).boundaryPhysicalStatus
        if(state==='CHANGED_MEMBERSHIP'||state==='SAME_MEMBERSHIP')
          physicalProbe.boundaryPhysical[state]++
        else {
          physicalProbe.boundaryPhysical.UNAVAILABLE++
          const reason=(probe as {boundaryUnavailableReason?:string}).boundaryUnavailableReason
          const reasons=physicalProbe.boundaryUnavailableReasons
          if(reason&&Object.prototype.hasOwnProperty.call(reasons,reason))
            reasons[reason as keyof typeof reasons]++
          else reasons.UNKNOWN++
        }
      }
      const fullProbe=probe as {failedCheckpointInterval?:{riderId?:string,previousKm?:number,checkpointKm?:number},observations?:unknown}
      if(failedRiderId){
        const failure=fullProbe.failedCheckpointInterval
        const match=matchPhysicalFailureCheckpointV4({
          riderId:failedRiderId,
          previousKm:failure?.previousKm,
          checkpointKm:failure?.checkpointKm,
          observations:fullProbe.observations
        })
        if(failure?.riderId!==failedRiderId||match==='UNMATCHABLE')
          physicalProbe.exactIntervalUnmatchable++
        else if(match==='CHECKPOINT_INTERVAL_OVERLAP')
          physicalProbe.exactIntervalOverlap++
        else physicalProbe.exactIntervalOutside++
      }
      if(failedRiderId){
       const observations=(probe as {observations?:readonly {riderIds?:readonly string[]}[]}).observations
       if(!Array.isArray(observations))physicalProbe.failedRiderNotMatched++
       else if(observations.some(o=>o.riderIds?.includes(failedRiderId!))){
         physicalProbe.failedRiderMovementObserved++
         if(failedPeriod==='LATE_75_95_PERCENT'){
           const distance=(data as {input_snapshot_json?:{stage?:{distanceKm?:unknown}}})?.input_snapshot_json?.stage?.distanceKm
           if(typeof distance==='number'&&Number.isFinite(distance)&&distance>0&&
              observations.some(o=>o.riderIds?.includes(failedRiderId!)&&
                Array.isArray((o as {observedBetweenKm?:number[]}).observedBetweenKm)&&
                (o as {observedBetweenKm:number[]}).observedBetweenKm[0]<=distance*0.95&&
                (o as {observedBetweenKm:number[]}).observedBetweenKm[1]>=distance*0.75))
             physicalProbe.failedRiderLateBandObserved++
           else physicalProbe.failedRiderLateBandMissing++
         }else physicalProbe.failedRiderOtherPeriod++
       }
       else physicalProbe.failedRiderMovementMissing++
      }
    }else if(probe?.status==='UNAVAILABLE'){
     physicalProbe.unavailable++
     if(failedRiderId)physicalProbe.failedRiderNotMatched++
    }
    else {physicalProbe.missing++;if(failedRiderId)physicalProbe.failedRiderNotMatched++}
    delete globalProbe.__ppmV4PhysicalProbe
   }
  }
 }
 // Never emit the original stage/rider/team identity or error details.
 process.stdout.write('V4_PRIVATE_PHYSICAL_VARIANT '+JSON.stringify({
  variant,researchOnly:true,officialWrites:0,networkCalls:0,
  inputPathsReported:false,attempted:paths.length,rejected,failureClasses,
  failureTerrains,otherErrorTypes,otherFailureReasons,
  safeReplayIssueCodes,postCatchTransferClasses,postCatchPeriods,
  postCatchForensicPhases,postCatchForensicGaps,
  otherFailureCheckpoints,otherFailureTransfers,otherFinishEvidence,rows,
  physicalProbe,
 })+'\n')
 // Zero usable stages is a valid diagnostic result, not a child-process crash.
 // The outer operator CLI still returns failure when no comparable triple exists.
}
try{if(process.argv.length!==3)throw Error('ARGUMENTS');main()}
catch{
 console.error('V4_PRIVATE_PHYSICAL_REJECTED: private manifest inaccessible or invalid')
 process.exitCode=1
}
