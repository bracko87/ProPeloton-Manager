/**
 * Isolated source instrumentation for an independent, read-only V4 replay probe.
 * Injects immediately before pre-finish replay definitions, when groupsAtKm,
 * stageDistanceKm and phase boundaries already exist. No replay publication change.
 * Probe failure is retained as a diagnostic; never changes the race outcome.
 */
const anchor='  const preFinishPublishedDefinition = [...baseDefinitions, ...eventDefinitions]';
export function patchPhysicalReplayProbeSourceV4(source){
 if(typeof source!=='string'||source.split(anchor).length!==2||
    source.includes('const __v4PhysicalReplayProbe ='))
   throw Error('PHYSICAL_REPLAY_PROBE_SOURCE_DRIFT');
 const body=`  // Research-only observational probe; official replay and physics untouched.
  const __v4PhysicalReplayProbe = (() => {
    try {
      const kms = planPhysicalReplaySamplesV4({
        distanceKm:stageDistanceKm,
        phaseBoundariesKm:[
          phase1.phaseBoundary.endKm,
          phase2.phaseBoundary.endKm,
          phase3.phaseBoundary.endKm
        ],
        stepKm:5
      })
      const samples=capturePhysicalReplaySamplesV4(kms,groupsAtKm)
      const observed=buildReplayFromPhysicalGroupsV4(samples,{
        groupToleranceSeconds:PHASE5_GROUP_MERGE_TOLERANCE_SECONDS
      })
      // Keep detailed observations in isolated process memory only.
      // Never serialize rider IDs, checkpoint locations, or raw groups.
      return {status:'OBSERVED',samples:observed.frames.length,
        transitions:observed.observations.length,
        observations:observed.observations,
        // Closure remains private to the isolated process, never serialized.
        physicalGroupsAtKm:groupsAtKm,
        physicsModified:false}
    }catch{
      return {status:'UNAVAILABLE',samples:0,transitions:0,physicsModified:false}
    }
  })()
  // Research worker may read aggregate only; no riders, groups or locations exported.
  ;(globalThis as typeof globalThis & {__ppmV4PhysicalProbe?: unknown})
    .__ppmV4PhysicalProbe=__v4PhysicalReplayProbe

`;
 const imports=`import {planPhysicalReplaySamplesV4,capturePhysicalReplaySamplesV4} from '../../scripts/v4/physicalReplaySamplingV4.mjs'
import {buildReplayFromPhysicalGroupsV4} from '../../scripts/v4/physicalGroupReplayAdapterV4.mjs'
import {classifyPhysicalCheckpointBoundaryV4,diagnosePhysicalCheckpointBoundaryV4} from '../../scripts/v4/privatePhysicalBoundaryCompareV4.mjs'
import {classifyReplayCheckpointPresentationV4} from '../../scripts/v4/privateReplayCheckpointPresentationV4.mjs'
import {reconstructPhysicalCheckpointCandidateV4} from '../../scripts/v4/privatePhysicalCheckpointCandidateV4.mjs'
import {buildPrivatePhysicalMergerShadowV4} from '../../scripts/v4/privatePhysicalMergerShadowV4.mjs'
import {buildPrivateDnfAwareMergerShadowV4} from '../../scripts/v4/privateDnfAwareMergerShadowV4.mjs'
import {buildPrivateUnifiedMergerCandidateV4} from '../../scripts/v4/privateUnifiedMergerCandidateV4.mjs'
import {buildPrivatePhysicalLabelHandoffV4} from '../../scripts/v4/privatePhysicalLabelHandoffV4.mjs'
import {buildPrivateStablePhysicalCheckpointV4} from '../../scripts/v4/privateStablePhysicalCheckpointV4.mjs'
import {classifyPrivateLatePhysicalMismatchV4} from '../../scripts/v4/privateLatePhysicalMismatchV4.mjs'
import {tracePrivateFirstPhysicalDivergenceV4} from '../../scripts/v4/privateFirstPhysicalDivergenceV4.mjs'
import {auditPrivateReachedDnfCheckpointV4} from '../../scripts/v4/privateReachedDnfCheckpointV4.mjs'
import {attributePrivatePhase10HandoffV4} from '../../scripts/v4/privatePhase10HandoffAttributionV4.mjs'
import {buildPrivateDnfTransitionCommentaryV4} from '../../scripts/v4/privateDnfTransitionCommentaryV4.mjs'
import {buildPrivateDnfSurvivorIdentityV4} from '../../scripts/v4/privateDnfSurvivorIdentityV4.mjs'
import {buildPrivateIncidentAdjustedCheckpointV4} from '../../scripts/v4/privateIncidentAdjustedCheckpointV4.mjs'
import {classifyPrivatePhase10SourceDriftV4} from '../../scripts/v4/privatePhase10SourceDriftV4.mjs'
import {classifyPrivatePostCatchContinuityV4} from '../../scripts/v4/privatePostCatchContinuityV4.mjs'
import {classifyPrivateExactEventSourceV4} from '../../scripts/v4/privateExactEventSourceV4.mjs'
import {classifyPrivatePhase10InputProvenanceV4} from '../../scripts/v4/privatePhase10InputProvenanceV4.mjs'
import {buildPrivateExactEventPhysicalCandidateV4} from '../../scripts/v4/privateExactEventPhysicalCandidateV4.mjs'
import {buildPrivateBasePhysicalSourceV4} from '../../scripts/v4/privateBasePhysicalSourceV4.mjs'
import {buildPrivateResidualPhysicalCheckpointV4} from '../../scripts/v4/privateResidualPhysicalCheckpointV4.mjs'
import {classifyPhysicalReplayMembershipHandoffV4} from '../../scripts/v4/privatePhysicalReplayHandoffV4.mjs'
import {classifyCheckpointGroupStagesV4} from '../../scripts/v4/privateCheckpointGroupStagesV4.mjs'
import {classifyPostConstructionHandoffV4} from '../../scripts/v4/privatePostConstructionHandoffV4.mjs'
import {classifyPhase10MembershipStageV4} from '../../scripts/v4/privatePhase10MembershipStagesV4.mjs'
import {classifyPhase10DetachmentEvidenceV4} from '../../scripts/v4/privatePhase10DetachmentEvidenceV4.mjs'
`;
 // Only in private candidate compilation: inspect actual source definition,
 // normalization and filtering without changing any checkpoint groups.
 const stagesAnchor='      const groupByRiderId = new Map<'
 if(source.split(stagesAnchor).length!==3)
   throw Error('PHYSICAL_REPLAY_GROUP_STAGE_SOURCE_DRIFT')
 const stageCapture=`      // Isolated private checkpoint construction evidence.
      const privateStageStore=(globalThis as typeof globalThis & {
        __ppmV4CheckpointStages?: Map<string,unknown>
      })
      if(!privateStageStore.__ppmV4CheckpointStages)
        privateStageStore.__ppmV4CheckpointStages=new Map()
      privateStageStore.__ppmV4CheckpointStages.set(
        \`\${input.stage.stageId}|replay|\${definition.checkpointIdSuffix}\`,
        {raw:definition.groups,normalized:normalizedGroups,published:publishedGroups}
      )
`
 const stageLocation=source.indexOf(stagesAnchor,source.indexOf('const publishedGroups ='))
 if(stageLocation<0)throw Error('PHYSICAL_REPLAY_GROUP_STAGE_SOURCE_DRIFT')
 // Pin each Phase 10 mutation boundary in the isolated compilation only.
 // Capture all group memberships in worker memory, never in the report.
 const p10Start=source.indexOf('  const replayCheckpoints = phase10SourceReplayTimeline.checkpoints.map(')
 const p10End=source.indexOf('  const replayTimeline: UniversalReplayTimeline = {',p10Start)
 if(p10Start<0||p10End<=p10Start)throw Error('PHYSICAL_REPLAY_PHASE10_SOURCE_DRIFT')
 const snap=(key)=>`      ;(() => {
        const privateStore=(globalThis as typeof globalThis & {
          __ppmV4Phase10GroupStages?:Map<string,Record<string,unknown>>
        })
        if(!privateStore.__ppmV4Phase10GroupStages)
          privateStore.__ppmV4Phase10GroupStages=new Map()
        const cpStages=privateStore.__ppmV4Phase10GroupStages.get(checkpoint.checkpointId)??{}
        cpStages['${key}']=groups.map(g=>({...g,riderIds:[...g.riderIds]}))
        privateStore.__ppmV4Phase10GroupStages.set(checkpoint.checkpointId,cpStages)
      })()
`
 let phaseSource=source.slice(p10Start,p10End)
 const boundaries=[
  ['INITIAL','      let gaps = checkpoint.gaps.map((gap) => ({ ...gap }))'],
  ['AFTER_DETACHMENT','        const autonomousGroupByDisplayCode = new Map<'],
  ['AFTER_AUTONOMOUS_GROUPS','        const consolidatedGroups: Array<(typeof groups)[number]> = []'],
  ['AFTER_CONSOLIDATION','        // Keep autonomous incident groups physically authoritative.'],
  ['AFTER_FINISH_COMMIT','      const replayIncidents: UniversalReplayIncident[] = occurred.map('],
  ['AFTER_DISPLAY_NORMALIZATION','      const activeCommands = checkpoint.activeCommands.filter(']
 ]
 for(const [key,needle] of boundaries){
   if(phaseSource.split(needle).length!==2)throw Error('PHYSICAL_REPLAY_PHASE10_SOURCE_DRIFT:'+key)
   // INITIAL is after groups and gaps declarations; others before the next step.
   phaseSource=phaseSource.replace(needle,snap(key)+needle)
 }
 // At the detach boundary, both the autonomous episode set and reached DNF
 // set are available. Retain these only inside the isolated worker.
 const detachmentMarker="        const autonomousGroupByDisplayCode = new Map<"
 const detachmentCapture=`        ;(() => {
          const store=(globalThis as typeof globalThis & {
            __ppmV4Phase10DetachEvidence?: Map<string,unknown>
          })
          if(!store.__ppmV4Phase10DetachEvidence)
            store.__ppmV4Phase10DetachEvidence=new Map()
          store.__ppmV4Phase10DetachEvidence.set(checkpoint.checkpointId,{
            autonomousRiderIds:[...autonomousRiderIds],
            dnfRiderIds:[...reachedDnfRiderIds]
          })
        })()
`
 if(phaseSource.split(detachmentMarker).length!==2)
   throw Error('PHYSICAL_REPLAY_DETACHMENT_SOURCE_DRIFT')
 phaseSource=phaseSource.replace(detachmentMarker,detachmentCapture+detachmentMarker)
 const phaseInstrumented=source.slice(0,p10Start)+phaseSource+source.slice(p10End)
 const adjustedStageLocation=phaseInstrumented.indexOf(stagesAnchor,phaseInstrumented.indexOf('const publishedGroups ='))
 if(adjustedStageLocation<0)throw Error('PHYSICAL_REPLAY_GROUP_STAGE_SOURCE_DRIFT')
 const withStages=phaseInstrumented.slice(0,adjustedStageLocation)+stageCapture+phaseInstrumented.slice(adjustedStageLocation)
 const guarded=withStages.replace(anchor,body+anchor)
 const publicationAnchor='  if (!replayPublicationPolicy.publishable) {'
 if(guarded.split(publicationAnchor).length!==2)
   throw Error('PHYSICAL_REPLAY_PUBLICATION_SOURCE_DRIFT')
 const capture=`  // Capture precise failed replay checkpoint interval in private memory.
  if (!replayPublicationPolicy.publishable) {
    const issue=replayPublicationPolicy.blockingIssues.find((v: string) =>
      v.startsWith('post_catch_group_transfer_without_physical_transition:'))
    if(issue){
      const parts=issue.split(':')
      // Historical forensics appends diagnostic suffixes after the real ID.
      const checkpointId=parts.slice(3).join(':').split(':v4_private_phase=')[0]
      const checkpoints=replayTimeline.checkpoints
      const at=checkpoints.findIndex(c=>c.checkpointId===checkpointId)
      const probe=(globalThis as typeof globalThis & {__ppmV4PhysicalProbe?: any}).__ppmV4PhysicalProbe
      if(probe){
        probe.failureCaptureStatus=at>0?'CAPTURED':at===0?'FIRST_CHECKPOINT':'CHECKPOINT_NOT_FOUND'
        if(at>0){
          probe.failedCheckpointInterval={
            riderId:parts[1],
            previousKm:checkpoints[at-1].raceProgress.kmFromStart,
            checkpointKm:checkpoints[at].raceProgress.kmFromStart
          }
          probe.replayPresentationStatus=classifyReplayCheckpointPresentationV4({
            riderId:parts[1],previous:checkpoints[at-1],current:checkpoints[at]
          })
          const physicalCandidate=reconstructPhysicalCheckpointCandidateV4({
            ...probe.failedCheckpointInterval,
            physicalGroupsAtKm:probe.physicalGroupsAtKm,
            groupToleranceSeconds:PHASE5_GROUP_MERGE_TOLERANCE_SECONDS
          })
          probe.physicalCheckpointCandidate=physicalCandidate.classification
          // Proposal retains rider identities only in isolated worker memory.
          probe.physicalCheckpointProposal=physicalCandidate.proposal
          // Guarded shadow is diagnostic-only; never replace replayTimeline.
          if(physicalCandidate.classification==='PHYSICAL_TRANSITION_CANDIDATE'&&
             physicalCandidate.proposal?.eventType==='group_merge'){
            const shadow=buildPrivatePhysicalMergerShadowV4({
              timeline:replayTimeline,
              checkpointId,
              riderId:parts[1],
              proposal:physicalCandidate.proposal
            })
            probe.shadowMergerStatus=shadow.status
            probe.shadowMismatch=shadow.mismatch
            if(shadow.mismatch==='CURRENT_MEMBERSHIP'){
              const savedStages=(globalThis as typeof globalThis & {
                __ppmV4CheckpointStages?:Map<string,any>
              }).__ppmV4CheckpointStages?.get(checkpointId)
              const phase10Stages=(globalThis as typeof globalThis & {
                __ppmV4Phase10GroupStages?:Map<string,Record<string,unknown>>
              }).__ppmV4Phase10GroupStages?.get(checkpointId)
              const detachment=(globalThis as typeof globalThis & {
                __ppmV4Phase10DetachEvidence?:Map<string,any>
              }).__ppmV4Phase10DetachEvidence?.get(checkpointId)
              if(detachment&&phase10Stages){
                probe.phase10DetachmentEvidence=classifyPhase10DetachmentEvidenceV4({
                  riderId:parts[1],
                  physicalMembers:physicalCandidate.proposal.afterMembers,
                  initialGroups:phase10Stages.INITIAL,
                  detachedGroups:phase10Stages.AFTER_DETACHMENT,
                  autonomousRiderIds:detachment.autonomousRiderIds,
                  dnfRiderIds:detachment.dnfRiderIds
                })
              }else probe.phase10DetachmentEvidence='UNAVAILABLE'
              // Only try DNF-aware reconstruction when an actual Phase 10
              // detachment was proven, never for arbitrary membership drift.
              if(probe.phase10DetachmentEvidence==='DNF_DETACHMENT'&&detachment){
                const dnfShadow=buildPrivateDnfAwareMergerShadowV4({
                  timeline:replayTimeline,checkpointId,riderId:parts[1],
                  proposal:physicalCandidate.proposal,
                  reachedDnfRiderIds:detachment.dnfRiderIds
                })
                probe.dnfShadowStatus=dnfShadow.status
                if(dnfShadow.status==='DNF_AWARE_SHADOW_CREATED'){
                  try{
                    const dnfStrict=buildUniversalReplaySynchronizationSummary(
                      calculationInput,riderReadiness,roadCommandResolution,
                      intermediatePointFinalization,groupAndTimeResolution,
                      finishResolution,phase10Incidents,dnfShadow.timeline,
                      roadRaceResolution
                    )
                    const dnfPolicy=classifyUniversalReplaySynchronizationForPublication(dnfStrict)
                    probe.dnfShadowStrictStatus=dnfPolicy.publishable?
                      'STRICT_PASS':'STRICT_BLOCKED'
                  }catch{
                    probe.dnfShadowStrictStatus='STRICT_ERROR'
                  }
                }
              }
              probe.phase10MembershipStage=classifyPhase10MembershipStageV4({
                riderId:parts[1],
                physicalMembers:physicalCandidate.proposal.afterMembers,
                stages:phase10Stages
              })
              probe.postConstructionHandoff=classifyPostConstructionHandoffV4({
                riderId:parts[1],checkpointId,
                physicalMembers:physicalCandidate.proposal.afterMembers,
                baseTimeline:baseReplayTimeline,
                phase10Timeline:phase10Resolution.replayTimeline,
                finalTimeline:replayTimeline
              })
              if(savedStages){
                probe.checkpointStageDivergence=classifyCheckpointGroupStagesV4({
                  riderId:parts[1],
                  physicalMembers:physicalCandidate.proposal.afterMembers,
                  ...savedStages,
                  finalGroups:checkpoints[at].groups
                })
              }else probe.checkpointStageDivergence='CHECKPOINT_NOT_IN_BUILDER'
              probe.shadowHandoff=classifyPhysicalReplayMembershipHandoffV4({
                riderId:parts[1],
                physicalMembers:physicalCandidate.proposal.afterMembers,
                replayGroups:checkpoints[at].groups
              })
              probe.shadowHandoffCheckpointKind=checkpoints[at].checkpointKind==='event'?
                'EVENT':checkpoints[at].checkpointKind==='base'?'BASE':'OTHER'
            }
            if(shadow.status==='SHADOW_CREATED'){
              // Invoke the ORIGINAL strict synchronization function on a
              // separate shadow timeline. The published replay is untouched.
              try{
                const strictShadow=buildUniversalReplaySynchronizationSummary(
                  calculationInput,riderReadiness,roadCommandResolution,
                  intermediatePointFinalization,groupAndTimeResolution,
                  finishResolution,phase10Incidents,shadow.timeline,
                  roadRaceResolution
                )
                const strictPolicy=classifyUniversalReplaySynchronizationForPublication(strictShadow)
                probe.shadowStrictStatus=strictPolicy.publishable?
                  'STRICT_PASS':'STRICT_BLOCKED'
                probe.shadowStrictRemainingIssues=strictPolicy.blockingIssues.length
              }catch{
                probe.shadowStrictStatus='STRICT_ERROR'
              }
            }
          }
          // Unified trial runs once for either physically grounded merger path.
          // It evaluates the unmodified validator on an isolated copy only.
          if(physicalCandidate.classification==='PHYSICAL_TRANSITION_CANDIDATE'&&
             physicalCandidate.proposal?.eventType==='group_merge'){
            const incidentEvidence=(globalThis as typeof globalThis & {
              __ppmV4Phase10DetachEvidence?:Map<string,any>
            }).__ppmV4Phase10DetachEvidence?.get(checkpointId)
            const unified=buildPrivateUnifiedMergerCandidateV4({
              timeline:replayTimeline,checkpointId,riderId:parts[1],
              proposal:physicalCandidate.proposal,
              detachmentClass:probe.phase10DetachmentEvidence,
              reachedDnfRiderIds:incidentEvidence?.dnfRiderIds
            })
            probe.unifiedMergerStatus=unified.status
            probe.unifiedMergerMode=unified.mode
            if(unified.status==='CANDIDATE_CREATED'){
              try{
                const unifiedSummary=buildUniversalReplaySynchronizationSummary(
                  calculationInput,riderReadiness,roadCommandResolution,
                  intermediatePointFinalization,groupAndTimeResolution,
                  finishResolution,phase10Incidents,unified.timeline,
                  roadRaceResolution
                )
                const unifiedPolicy=classifyUniversalReplaySynchronizationForPublication(unifiedSummary)
                probe.unifiedMergerStrictStatus=unifiedPolicy.publishable?
                  'STRICT_PASS':'STRICT_BLOCKED'
              }catch{
                probe.unifiedMergerStrictStatus='STRICT_ERROR'
              }
            }
          }
          probe.boundaryPhysicalStatus=classifyPhysicalCheckpointBoundaryV4({
            ...probe.failedCheckpointInterval,
            physicalGroupsAtKm:probe.physicalGroupsAtKm
          })
          if(probe.boundaryPhysicalStatus==='UNAVAILABLE')
            probe.boundaryUnavailableReason=diagnosePhysicalCheckpointBoundaryV4({
              ...probe.failedCheckpointInterval,
              physicalGroupsAtKm:probe.physicalGroupsAtKm
            })
        }
      }
    }else{
      const probe=(globalThis as typeof globalThis & {__ppmV4PhysicalProbe?: any}).__ppmV4PhysicalProbe
      if(probe)probe.failureCaptureStatus='ISSUE_NOT_FOUND'
    }
  }
`

 // This transformation applies ONLY to private_replay_candidate's in-memory
 // compiled engine source. The committed source and live race engine are intact.
 // Re-evaluate the ORIGINAL strict gate on the isolated candidate before
 // continuing through ordinary Phase 9 and Phase 7/8 acceptance.
 const slots=[
  '  const replayTimeline =',
  '  const replaySynchronization =',
  '  const replayPublicationPolicy ='
 ]
 let writable=guarded
 for(const slot of slots){
   if(writable.split(slot).length!==2)throw Error('PHYSICAL_REPLAY_REPAIR_SOURCE_DRIFT')
   writable=writable.replace(slot,slot.replace('  const ','  let '))
 }
 const repair=`  // Private candidate-only: run an evidence-backed candidate through the
  // ordinary strict publication gate. The baseline would otherwise throw.
  if (!replayPublicationPolicy.publishable) {
    const privateStore=(globalThis as typeof globalThis & {
      __ppmV4PhysicalProbe?:any,
      __ppmV4Phase10DetachEvidence?:Map<string,any>
    })
    const audit=privateStore.__ppmV4PhysicalProbe
    // More than one issue can describe the same missing transition.
    // Select the first recognized issue, but accept ONLY when the original
    // validator clears ALL blocking issues on the completed candidate.
    if(audit?.status==='OBSERVED'&&
       replayPublicationPolicy.blockingIssues.length>0){
      const problem=replayPublicationPolicy.blockingIssues.find(
        (issue: string)=>issue.startsWith('post_catch_group_transfer_without_physical_transition:')
      )??''
      if(problem.startsWith('post_catch_group_transfer_without_physical_transition:')){
        const segments=problem.split(':')
        const riderId=segments[1]
        const checkpointId=segments.slice(3).join(':').split(':v4_private_phase=')[0]
        const n=replayTimeline.checkpoints.findIndex(cp=>cp.checkpointId===checkpointId)
        if(n>0){
          const prev=replayTimeline.checkpoints[n-1]
          const curr=replayTimeline.checkpoints[n]
          const physical=reconstructPhysicalCheckpointCandidateV4({
            riderId,previousKm:prev.raceProgress.kmFromStart,
            checkpointKm:curr.raceProgress.kmFromStart,
            physicalGroupsAtKm:audit.physicalGroupsAtKm,
            groupToleranceSeconds:PHASE5_GROUP_MERGE_TOLERANCE_SECONDS
          })
          if(physical.classification==='PHYSICAL_TRANSITION_CANDIDATE'&&
             physical.proposal?.eventType==='group_merge'){
            const phaseEvidence=privateStore.__ppmV4Phase10DetachEvidence?.get(checkpointId)
            // DNF-aware fallback is allowed only after exact detachment
            // justification was computed by the earlier private probe.
            const unified=buildPrivateUnifiedMergerCandidateV4({
              timeline:replayTimeline,checkpointId,riderId,
              proposal:physical.proposal,
              detachmentClass:audit.phase10DetachmentEvidence,
              reachedDnfRiderIds:phaseEvidence?.dnfRiderIds
            })
            audit.integratedRepairStatus=unified.status==='CANDIDATE_CREATED'?
              'CANDIDATE_CHECKED':'NOT_ELIGIBLE'
            if(unified.status==='CANDIDATE_CREATED'){
              const candidateSync=buildUniversalReplaySynchronizationSummary(
                calculationInput,riderReadiness,roadCommandResolution,
                intermediatePointFinalization,groupAndTimeResolution,
                finishResolution,phase10Incidents,unified.timeline,
                roadRaceResolution
              )
              const candidatePolicy=classifyUniversalReplaySynchronizationForPublication(candidateSync)
              audit.integratedRepairStatus=candidatePolicy.publishable?
                'STRICT_ACCEPTED':'STRICT_BLOCKED'
              if(candidatePolicy.publishable){
                // Only the local private compiled candidate has mutable slots.
                // Later acceptance reports still run unmodified.
                replayTimeline=unified.timeline
                replaySynchronization=candidateSync
                replayPublicationPolicy=candidatePolicy
                audit.integratedRepairMode=unified.mode
              }
            }
          }else{
            // Separate presentation-only lane for unchanged physical group
            // membership. Never invent physical splits, merges or transfers.
            const handoff=buildPrivatePhysicalLabelHandoffV4({
              timeline:replayTimeline,checkpointId,riderId,
              physicalGroupsAtKm:audit.physicalGroupsAtKm
            })
            audit.labelHandoffStatus=handoff.status
            audit.integratedRepairStatus='NOT_ELIGIBLE'
            // If a stale replay group partition causes a failed label-only
            // check, trial a physically stable checkpoint reconstruction.
            // A genuine split/merge or DNF is never invented here.
            const stable=handoff.status==='MEMBERSHIP_MISMATCH'?
              buildPrivateStablePhysicalCheckpointV4({
                timeline:replayTimeline,checkpointId,
                physicalGroupsAtKm:audit.physicalGroupsAtKm
              }):{status:'NOT_ELIGIBLE'}
            audit.stablePhysicalStatus=stable.status
            if(stable.status==='INCIDENT_OR_FINISH_UNSAFE'||
               stable.status==='PHYSICAL_NOT_STABLE'){
              const stages=(globalThis as typeof globalThis & {
                __ppmV4Phase10GroupStages?:Map<string,Record<string,unknown>>
              }).__ppmV4Phase10GroupStages?.get(checkpointId)
              const detachment=privateStore.__ppmV4Phase10DetachEvidence?.get(checkpointId)
              const late=classifyPrivateLatePhysicalMismatchV4({
                timeline:replayTimeline,checkpointId,riderId,
                physicalGroupsAtKm:audit.physicalGroupsAtKm,
                phase10Stages:stages,reachedDnfRiderIds:detachment?.dnfRiderIds
              })
              // Aggregate fixed categories only; never expose rider IDs.
              audit.latePhysicalEvidence=late
              audit.postCatchContinuity=classifyPrivatePostCatchContinuityV4({
                timeline:replayTimeline,checkpointId,
                physicalGroupsAtKm:audit.physicalGroupsAtKm
              })
              // The failing checkpoint can be physically correct while the
              // preceding replay checkpoint is not. Reconstruct ONLY that
              // earlier checkpoint from its own authoritative Phase10 stage.
              // Never reuse current-checkpoint incident/DNF evidence for it.
              if(audit.postCatchContinuity.source==='PREVIOUS_MISMATCH'&&
                 audit.postCatchContinuity.phys==='PHYSICALLY_STABLE'){
                const earlierId=prev.checkpointId
                const earlierStages=(globalThis as typeof globalThis & {
                  __ppmV4Phase10GroupStages?:Map<string,Record<string,unknown>>
                }).__ppmV4Phase10GroupStages?.get(earlierId)
                const earlierDetachment=privateStore.__ppmV4Phase10DetachEvidence?.get(earlierId)
                const earlier=buildPrivateIncidentAdjustedCheckpointV4({
                  timeline:replayTimeline,checkpointId:earlierId,
                  physicalGroupsAtKm:audit.physicalGroupsAtKm,
                  phase10Stages:earlierStages,
                  reachedDnfRiderIds:earlierDetachment?.dnfRiderIds
                })
                // Diagnose that earlier checkpoint at its OWN source boundary.
                // The reported current checkpoint may be physically correct.
                audit.earlierInputProvenance=classifyPrivatePhase10InputProvenanceV4({
                  checkpoint:prev,phase10Stages:earlierStages,
                  baseTimeline:baseReplayTimeline,
                  physicalGroupsAtKm:audit.physicalGroupsAtKm
                })
                // Source-level base replay correction is isolated to the
                // research candidate. It is never applied to live race
                // physics or production V2 checkpoints.
                const baseSourceCandidate=buildPrivateBasePhysicalSourceV4({
                  timeline:replayTimeline,baseTimeline:baseReplayTimeline,
                  checkpointId:earlierId,
                  physicalGroupsAtKm:audit.physicalGroupsAtKm,
                  provenance:audit.earlierInputProvenance,
                  reachedDnfRiderIds:earlierDetachment?.dnfRiderIds
                })
                audit.baseSourceCandidateStatus=baseSourceCandidate.status
                audit.baseSourceRejectedEventKind=baseSourceCandidate.status==='NON_NEUTRAL_EVENT'?
                  baseSourceCandidate.eventKind:undefined
                audit.baseSourceRejectedEventBoundary=baseSourceCandidate.status==='NON_NEUTRAL_EVENT'?
                  baseSourceCandidate.eventBoundary:undefined
                if(baseSourceCandidate.status==='BASE_PHYSICAL_SOURCE_CREATED'||
                   baseSourceCandidate.status==='BASE_PHYSICAL_EVENT_CREATED'||
                   baseSourceCandidate.status==='BASE_PHYSICAL_PASSIVE_EVENT_CREATED'||
                   baseSourceCandidate.status==='BASE_PHYSICAL_CATCH_CREATED'){
                  const baseSourceSync=buildUniversalReplaySynchronizationSummary(
                    calculationInput,riderReadiness,roadCommandResolution,
                    intermediatePointFinalization,groupAndTimeResolution,
                    finishResolution,phase10Incidents,baseSourceCandidate.timeline,
                    roadRaceResolution
                  )
                  const baseSourcePolicy=classifyUniversalReplaySynchronizationForPublication(baseSourceSync)
                  audit.baseSourceStrictStatus=baseSourcePolicy.publishable?
                    'STRICT_PASS':'STRICT_BLOCKED'
                  // Strict issues may include private rider/checkpoint IDs.
                  // Retain only fixed allowlisted category labels.
                  const knownStrictIssueCodes=new Set([
                    'post_catch_group_transfer_without_physical_transition',
                    'same_kilometre_physical_state_mismatch',
                    'front_group_transfer_without_physical_transition',
                    'gap_change_not_distance_bounded',
                    'duplicate_physical_group_gap',
                    'group_gap_identity_mismatch',
                    'rider_group_gap_mismatch',
                    'rider_state_missing_group',
                    'group_gap_cardinality_mismatch',
                    'bridge_merge_invalid',
                    'bridge_group_disappears_without_merge',
                    'bridge_group_without_peloton',
                    'opening_breakaway_lineage_changed',
                    'opening_breakaway_lineage_changed_without_bridge_merge',
                    'pre_finish_status_mismatch',
                    'checkpoint_rider_states_incomplete',
                    'final_road_groups_or_gaps_mismatch'
                  ])
                  audit.baseSourceStrictIssueCodes=[...new Set(
                    baseSourcePolicy.blockingIssues.map(issue=>{
                      const code=issue.split(':')[0]
                      return knownStrictIssueCodes.has(code)?code:'OTHER'
                    })
                  )].sort()

                  // Research-only audit of the first residual strict issue.
                  // Never export its rider or checkpoint identity.
                  const residualIssue=baseSourcePolicy.blockingIssues.find(issue=>
                    issue.startsWith('post_catch_group_transfer_without_physical_transition:'))
                  audit.baseSourceResidualPosition='NONE'
                  audit.baseSourceResidualPhysical='UNAVAILABLE'
                  audit.baseSourceResidualSource='UNAVAILABLE'
                  audit.baseSourceResidualMovement='UNAVAILABLE'
                  audit.baseSourceResidualTransfer='UNAVAILABLE'
                  if(residualIssue){
                    const segments=residualIssue.split(':')
                    const residualId=segments.slice(3).join(':').split(':v4_private_phase=')[0]
                    const correctedIndex=baseSourceCandidate.timeline.checkpoints.findIndex(
                      row=>row.checkpointId===earlierId)
                    const residualIndex=baseSourceCandidate.timeline.checkpoints.findIndex(
                      row=>row.checkpointId===residualId)
                    audit.baseSourceResidualPosition=correctedIndex<0||residualIndex<0?
                      'MISSING':residualIndex<correctedIndex?'BEFORE':
                      residualIndex===correctedIndex?'SAME':
                      residualIndex===correctedIndex+1?'NEXT':'LATER'
                    const continuity=classifyPrivatePostCatchContinuityV4({
                      timeline:baseSourceCandidate.timeline,checkpointId:residualId,
                      physicalGroupsAtKm:audit.physicalGroupsAtKm
                    })
                    audit.baseSourceResidualPhysical=continuity.phys??'UNAVAILABLE'
                    audit.baseSourceResidualSource=continuity.source??'UNAVAILABLE'
                    audit.baseSourceResidualMovement=continuity.movement??'UNAVAILABLE'
                    if(residualIndex>0){
                      const before=baseSourceCandidate.timeline.checkpoints[residualIndex-1]
                      const after=baseSourceCandidate.timeline.checkpoints[residualIndex]
                      const code=(checkpoint:any)=>checkpoint.groups?.find((group:any)=>
                        Array.isArray(group.riderIds)&&
                        group.riderIds.includes(segments[1]))?.displayCode
                      const previous=code(before),current=code(after)
                      if(typeof previous==='string'&&typeof current==='string'){
                        audit.baseSourceResidualTransfer=previous===current?
                          'NO_TRANSFER':previous==='P'&&/^C[0-9]+$/.test(current)?
                          'P_TO_C':/^C[0-9]+$/.test(previous)&&current==='P'?
                          'C_TO_P':/^C[0-9]+$/.test(previous)&&/^C[0-9]+$/.test(current)?
                          'C_TO_C':'UNAVAILABLE'
                      }
                    }
                  }

                  // An independently witnessed catch can uncover a SECOND stale
                  // checkpoint later in the replay. Research-only: try bounded
                  // evidence-backed reconstruction of that residual's PREVIOUS
                  // checkpoint. Never patch a later correct physical checkpoint.
                  audit.baseSourceResidualRepairStatus='NOT_RUN'
                  audit.baseSourceResidualRepairMode='NONE'
                  audit.baseSourceResidualPhysicalCandidate='NOT_RUN'
                  if(!baseSourcePolicy.publishable&&
                     baseSourcePolicy.blockingIssues.length>0&&
                     baseSourcePolicy.blockingIssues.every(issue=>
                       issue.startsWith('post_catch_group_transfer_without_physical_transition:'))&&
                     audit.baseSourceResidualPosition==='LATER'&&
                     audit.baseSourceResidualPhysical==='PHYSICALLY_STABLE'&&
                     audit.baseSourceResidualSource==='PREVIOUS_MISMATCH'&&
                     audit.baseSourceResidualMovement==='PRESENTATION_MEMBERSHIP_CHANGE'&&
                     residualIssue){
                    const parts=residualIssue.split(':')
                    const residualId=parts.slice(3).join(':').split(':v4_private_phase=')[0]
                    const checkpoints=baseSourceCandidate.timeline.checkpoints
                    const residualAt=checkpoints.findIndex(cp=>cp.checkpointId===residualId)
                    if(residualAt>1){
                      const stale=checkpoints[residualAt-1]
                      const staleId=stale.checkpointId
                      const staleStages=(globalThis as typeof globalThis & {
                        __ppmV4Phase10GroupStages?:Map<string,Record<string,unknown>>
                      }).__ppmV4Phase10GroupStages?.get(staleId)
                      const staleDnf=privateStore.__ppmV4Phase10DetachEvidence?.get(staleId)
                      const staleProvenance=classifyPrivatePhase10InputProvenanceV4({
                        checkpoint:stale,phase10Stages:staleStages,
                        baseTimeline:baseReplayTimeline,
                        physicalGroupsAtKm:audit.physicalGroupsAtKm
                      })
                      const candidates:Array<{mode:string,timeline:any}>=[]
                      const secondBase=buildPrivateBasePhysicalSourceV4({
                        timeline:baseSourceCandidate.timeline,
                        baseTimeline:baseReplayTimeline,
                        checkpointId:staleId,
                        physicalGroupsAtKm:audit.physicalGroupsAtKm,
                        provenance:staleProvenance,
                        reachedDnfRiderIds:staleDnf?.dnfRiderIds
                      })
                      if(['BASE_PHYSICAL_SOURCE_CREATED','BASE_PHYSICAL_EVENT_CREATED',
                          'BASE_PHYSICAL_PASSIVE_EVENT_CREATED',
                          'BASE_PHYSICAL_CATCH_CREATED'].includes(secondBase.status))
                        candidates.push({mode:'BASE_SOURCE',timeline:secondBase.timeline})
                      const secondExact=buildPrivateExactEventPhysicalCandidateV4({
                        timeline:baseSourceCandidate.timeline,
                        checkpointId:staleId,
                        physicalGroupsAtKm:audit.physicalGroupsAtKm,
                        baseTimeline:baseReplayTimeline,
                        provenance:staleProvenance,
                        reachedDnfRiderIds:staleDnf?.dnfRiderIds
                      })
                      if(secondExact.status==='EXACT_EVENT_CANDIDATE_CREATED')
                        candidates.push({mode:'EXACT_EVENT',timeline:secondExact.timeline})
                      // Causal narration and incidents remain untouched. The
                      // stable fallback is allowed only for passive checkpoints.
                      const passiveTypes=new Set(['race_status','peloton_control',
                        'bridge_progress','kom','intermediate_sprint','bonus_sprint'])
                      if(Array.isArray(stale.commentary)&&
                         stale.commentary.every(entry=>passiveTypes.has(entry.eventType))&&
                         (!Array.isArray(stale.incidents)||stale.incidents.length===0)){
                        const secondStable=buildPrivateStablePhysicalCheckpointV4({
                          timeline:baseSourceCandidate.timeline,
                          checkpointId:staleId,
                          physicalGroupsAtKm:audit.physicalGroupsAtKm
                        })
                        if(secondStable.status==='STABLE_CHECKPOINT_CREATED')
                          candidates.push({mode:'STABLE_CHECKPOINT',timeline:secondStable.timeline})
                      }

                      // C-to-C residual only: if BOTH physical snapshots are
                      // stable and the next replay is physical, reconstruct a
                      // passive prior checkpoint. No causal/incident rewrites.
                      if(baseSourceCandidate.status==='BASE_PHYSICAL_CATCH_CREATED'&&
                         audit.baseSourceResidualTransfer==='C_TO_C'){
                        const stableResidual=buildPrivateResidualPhysicalCheckpointV4({
                          timeline:baseSourceCandidate.timeline,
                          checkpointId:staleId,
                          residualCheckpointId:residualId,
                          physicalGroupsAtKm:audit.physicalGroupsAtKm
                        })
                        audit.baseSourceResidualPhysicalCandidate=stableResidual.status
                        if(stableResidual.status==='RESIDUAL_PHYSICAL_CHECKPOINT_CREATED')
                          candidates.push({mode:'RESIDUAL_PHYSICAL',timeline:stableResidual.timeline})
                      }
                      audit.baseSourceResidualRepairStatus=candidates.length?
                        'STRICT_BLOCKED':'NO_PROVEN_CANDIDATE'
                      for(const candidate of candidates){
                        // No partial acceptance: use the original full gate
                        // across ALL checkpoints, not only the repaired pair.
                        const residualSync=buildUniversalReplaySynchronizationSummary(
                          calculationInput,riderReadiness,roadCommandResolution,
                          intermediatePointFinalization,groupAndTimeResolution,
                          finishResolution,phase10Incidents,candidate.timeline,
                          roadRaceResolution
                        )
                        const residualPolicy=classifyUniversalReplaySynchronizationForPublication(residualSync)
                        if(residualPolicy.publishable){
                          replayTimeline=candidate.timeline
                          replaySynchronization=residualSync
                          replayPublicationPolicy=residualPolicy
                          audit.baseSourceResidualRepairStatus='STRICT_ACCEPTED'
                          audit.baseSourceResidualRepairMode=candidate.mode
                          audit.integratedRepairStatus='STRICT_ACCEPTED'
                          audit.integratedRepairMode='BASE_CATCH_PLUS_RESIDUAL'
                          break
                        }
                      }
                    }else{
                      audit.baseSourceResidualRepairStatus='NO_PROVEN_CANDIDATE'
                    }
                  }
                  if(baseSourcePolicy.publishable){
                    replayTimeline=baseSourceCandidate.timeline
                    replaySynchronization=baseSourceSync
                    replayPublicationPolicy=baseSourcePolicy
                    audit.integratedRepairStatus='STRICT_ACCEPTED'
                    audit.integratedRepairMode=baseSourceCandidate.status==='BASE_PHYSICAL_CATCH_CREATED'?
                      'BASE_PHYSICAL_CATCH':
                      baseSourceCandidate.status==='BASE_PHYSICAL_EVENT_CREATED'?
                      'BASE_PHYSICAL_EVENT':
                      baseSourceCandidate.status==='BASE_PHYSICAL_PASSIVE_EVENT_CREATED'?
                      'BASE_PHYSICAL_PASSIVE_EVENT':'BASE_PHYSICAL_SOURCE'
                  }
                }
                const exactCandidate=buildPrivateExactEventPhysicalCandidateV4({
                  timeline:replayTimeline,checkpointId:earlierId,
                  physicalGroupsAtKm:audit.physicalGroupsAtKm,
                  baseTimeline:baseReplayTimeline,
                  provenance:audit.earlierInputProvenance,
                  reachedDnfRiderIds:earlierDetachment?.dnfRiderIds
                })
                audit.exactEventCandidateStatus=exactCandidate.status
                if(exactCandidate.status==='EXACT_EVENT_CANDIDATE_CREATED'){
                  const exactSync=buildUniversalReplaySynchronizationSummary(
                    calculationInput,riderReadiness,roadCommandResolution,
                    intermediatePointFinalization,groupAndTimeResolution,
                    finishResolution,phase10Incidents,exactCandidate.timeline,
                    roadRaceResolution
                  )
                  const exactPolicy=classifyUniversalReplaySynchronizationForPublication(exactSync)
                  audit.exactEventStrictStatus=exactPolicy.publishable?
                    'STRICT_PASS':'STRICT_BLOCKED'
                  if(exactPolicy.publishable){
                    replayTimeline=exactCandidate.timeline
                    replaySynchronization=exactSync
                    replayPublicationPolicy=exactPolicy
                    audit.integratedRepairStatus='STRICT_ACCEPTED'
                    audit.integratedRepairMode='EXACT_EVENT_PHYSICAL'
                  }
                }
                audit.earlierExactEventSource=classifyPrivateExactEventSourceV4({
                  timeline:replayTimeline,checkpointId:earlierId,
                  physicalGroupsAtKm:audit.physicalGroupsAtKm,
                  baseTimeline:baseReplayTimeline
                })
                audit.earlierPhase10SourceDrift=classifyPrivatePhase10SourceDriftV4({
                  checkpoint:prev,physicalGroupsAtKm:audit.physicalGroupsAtKm,
                  phase10Stages:earlierStages,
                  reachedDnfRiderIds:earlierDetachment?.dnfRiderIds,
                  autonomousRiderIds:earlierDetachment?.autonomousRiderIds
                })
                audit.earlierCheckpointStatus=earlier.status
                if(earlier.status==='INCIDENT_CHECKPOINT_RECONSTRUCTED'){
                  const earlierSync=buildUniversalReplaySynchronizationSummary(
                    calculationInput,riderReadiness,roadCommandResolution,
                    intermediatePointFinalization,groupAndTimeResolution,
                    finishResolution,phase10Incidents,earlier.timeline,
                    roadRaceResolution
                  )
                  const earlierPolicy=classifyUniversalReplaySynchronizationForPublication(earlierSync)
                  audit.earlierCheckpointStrictStatus=earlierPolicy.publishable?
                    'STRICT_PASS':'STRICT_BLOCKED'
                  if(earlierPolicy.publishable){
                    replayTimeline=earlier.timeline
                    replaySynchronization=earlierSync
                    replayPublicationPolicy=earlierPolicy
                    audit.integratedRepairStatus='STRICT_ACCEPTED'
                    audit.integratedRepairMode='EARLIER_PHYSICAL_CHECKPOINT'
                  }
                }
              }
              audit.phase10SourceDrift=classifyPrivatePhase10SourceDriftV4({
                checkpoint:curr,physicalGroupsAtKm:audit.physicalGroupsAtKm,
                phase10Stages:stages,
                reachedDnfRiderIds:detachment?.dnfRiderIds,
                autonomousRiderIds:detachment?.autonomousRiderIds
              })
              audit.phase10HandoffAttribution=attributePrivatePhase10HandoffV4({
                checkpoint:curr,physicalGroupsAtKm:audit.physicalGroupsAtKm,
                phase10Stages:stages,reachedDnfRiderIds:detachment?.dnfRiderIds
              })
              // Replace a wrong checkpoint partition only if the last
              // constructed Phase10 snapshot independently matches physical
              // survivor membership. Always use the original strict validator.
              const incidentAdjusted=buildPrivateIncidentAdjustedCheckpointV4({
                timeline:replayTimeline,checkpointId,
                physicalGroupsAtKm:audit.physicalGroupsAtKm,
                phase10Stages:stages,reachedDnfRiderIds:detachment?.dnfRiderIds
              })
              audit.incidentAdjustedStatus=incidentAdjusted.status
              if(incidentAdjusted.status==='INCIDENT_CHECKPOINT_RECONSTRUCTED'){
                const candidateSync=buildUniversalReplaySynchronizationSummary(
                  calculationInput,riderReadiness,roadCommandResolution,
                  intermediatePointFinalization,groupAndTimeResolution,
                  finishResolution,phase10Incidents,incidentAdjusted.timeline,
                  roadRaceResolution
                )
                const candidatePolicy=classifyUniversalReplaySynchronizationForPublication(candidateSync)
                audit.incidentAdjustedStrictStatus=candidatePolicy.publishable?
                  'STRICT_PASS':'STRICT_BLOCKED'
                audit.integratedRepairStatus=candidatePolicy.publishable?
                  'STRICT_ACCEPTED':'STRICT_BLOCKED'
                if(candidatePolicy.publishable){
                  replayTimeline=incidentAdjusted.timeline
                  replaySynchronization=candidateSync
                  replayPublicationPolicy=candidatePolicy
                  audit.integratedRepairMode='INCIDENT_ADJUSTED_CHECKPOINT'
                }
              }
              audit.firstPhysicalDivergence=tracePrivateFirstPhysicalDivergenceV4({
                timeline:replayTimeline,checkpointId,
                physicalGroupsAtKm:audit.physicalGroupsAtKm
              })
              if(late.incident==='CONFIRMED_DNF_REMOVAL'){
                audit.reachedDnfHandoff=auditPrivateReachedDnfCheckpointV4({
                  timeline:replayTimeline,checkpointId,
                  physicalGroupsAtKm:audit.physicalGroupsAtKm,
                  phase10Stages:stages,reachedDnfRiderIds:detachment?.dnfRiderIds
                }).status
                if(audit.reachedDnfHandoff==='DNF_HANDOFF_CONFIRMED'){
                  const survivorIdentity=buildPrivateDnfSurvivorIdentityV4({
                    timeline:replayTimeline,checkpointId,riderId,
                    physicalGroupsAtKm:audit.physicalGroupsAtKm,
                    phase10Stages:stages,reachedDnfRiderIds:detachment?.dnfRiderIds
                  })
                  audit.survivorIdentityStatus=survivorIdentity.status
                  if(survivorIdentity.status==='DNF_SURVIVOR_IDENTITY_CREATED'){
                    const candidateSync=buildUniversalReplaySynchronizationSummary(
                      calculationInput,riderReadiness,roadCommandResolution,
                      intermediatePointFinalization,groupAndTimeResolution,
                      finishResolution,phase10Incidents,survivorIdentity.timeline,
                      roadRaceResolution
                    )
                    const candidatePolicy=classifyUniversalReplaySynchronizationForPublication(candidateSync)
                    audit.survivorIdentityStrictStatus=candidatePolicy.publishable?
                      'STRICT_PASS':'STRICT_BLOCKED'
                    audit.integratedRepairStatus=candidatePolicy.publishable?
                      'STRICT_ACCEPTED':'STRICT_BLOCKED'
                    if(candidatePolicy.publishable){
                      replayTimeline=survivorIdentity.timeline
                      replaySynchronization=candidateSync
                      replayPublicationPolicy=candidatePolicy
                      audit.integratedRepairMode='DNF_SURVIVOR_IDENTITY'
                    }
                  }

                  const dnfTransition=buildPrivateDnfTransitionCommentaryV4({
                    timeline:replayTimeline,checkpointId,riderId,
                    physicalGroupsAtKm:audit.physicalGroupsAtKm,
                    phase10Stages:stages,reachedDnfRiderIds:detachment?.dnfRiderIds
                  })
                  audit.dnfTransitionStatus=dnfTransition.status
                  if(dnfTransition.status==='DNF_TRANSITION_CREATED'){
                    const sync=buildUniversalReplaySynchronizationSummary(
                      calculationInput,riderReadiness,roadCommandResolution,
                      intermediatePointFinalization,groupAndTimeResolution,
                      finishResolution,phase10Incidents,dnfTransition.timeline,
                      roadRaceResolution
                    )
                    const policy=classifyUniversalReplaySynchronizationForPublication(sync)
                    audit.dnfTransitionStrictStatus=policy.publishable?
                      'STRICT_PASS':'STRICT_BLOCKED'
                    audit.integratedRepairStatus=policy.publishable?
                      'STRICT_ACCEPTED':'STRICT_BLOCKED'
                    if(policy.publishable){
                      replayTimeline=dnfTransition.timeline
                      replaySynchronization=sync
                      replayPublicationPolicy=policy
                      audit.integratedRepairMode='CONFIRMED_DNF_TRANSITION'
                    }
                  }
                }
              }
            }
            if(stable.status==='STABLE_CHECKPOINT_CREATED'){
              const stableSync=buildUniversalReplaySynchronizationSummary(
                calculationInput,riderReadiness,roadCommandResolution,
                intermediatePointFinalization,groupAndTimeResolution,
                finishResolution,phase10Incidents,stable.timeline,
                roadRaceResolution
              )
              const stablePolicy=classifyUniversalReplaySynchronizationForPublication(stableSync)
              audit.stablePhysicalStrictStatus=stablePolicy.publishable?
                'STRICT_PASS':'STRICT_BLOCKED'
              audit.integratedRepairStatus=stablePolicy.publishable?
                'STRICT_ACCEPTED':'STRICT_BLOCKED'
              if(stablePolicy.publishable){
                replayTimeline=stable.timeline
                replaySynchronization=stableSync
                replayPublicationPolicy=stablePolicy
                audit.integratedRepairMode=stable.mode==='SAME_KM_STABLE'?
                  'SAME_KM_STABLE':'DISTANCE_STABLE'
              }
            }
            if(handoff.status==='LABEL_HANDOFF_CREATED'){
              const labelSync=buildUniversalReplaySynchronizationSummary(
                calculationInput,riderReadiness,roadCommandResolution,
                intermediatePointFinalization,groupAndTimeResolution,
                finishResolution,phase10Incidents,handoff.timeline,
                roadRaceResolution
              )
              const labelPolicy=classifyUniversalReplaySynchronizationForPublication(labelSync)
              audit.labelHandoffStrictStatus=labelPolicy.publishable?
                'STRICT_PASS':'STRICT_BLOCKED'
              audit.integratedRepairStatus=labelPolicy.publishable?
                'STRICT_ACCEPTED':'STRICT_BLOCKED'
              if(labelPolicy.publishable){
                replayTimeline=handoff.timeline
                replaySynchronization=labelSync
                replayPublicationPolicy=labelPolicy
                audit.integratedRepairMode='PHYSICAL_LABEL_HANDOFF'
              }
            }
          }
        }else audit.integratedRepairStatus='NOT_ELIGIBLE'
      }else audit.integratedRepairStatus='NOT_ELIGIBLE'
    }else if(audit)audit.integratedRepairStatus='NO_BLOCKING_ISSUE'
  }
`
 return imports+writable.replace(publicationAnchor,capture+repair+publicationAnchor)
}
