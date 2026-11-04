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
`;
 const guarded=source.replace(anchor,body+anchor)
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
 return imports+guarded.replace(publicationAnchor,capture+publicationAnchor)
}
