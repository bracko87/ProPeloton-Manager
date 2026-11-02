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
      return {status:'OBSERVED',samples:observed.frames.length,
        transitions:observed.observations.length,
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
`;
 return imports+source.replace(anchor,body+anchor)
}
