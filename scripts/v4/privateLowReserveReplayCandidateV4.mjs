/**
 * Isolated research candidate: repair replay-only low-reserve detachment continuity
 * and publish only physically sampled early group splits. NEVER production V2.
 * Fails closed if the authoritative source has moved.
 */
const replaceOne=(source,from,to,label)=>{
 if(source.split(from).length!==2)throw Error('PRIVATE_REPLAY_SOURCE_DRIFT_'+label)
 return source.replace(from,to)
}
export function patchPrivateLowReserveReplayCandidateV4(source){
 if(typeof source!=='string')throw Error('PRIVATE_REPLAY_SOURCE_REQUIRED')
 let out=source.replace(/\r\n?/g,'\n')
 out=replaceOne(out,
  "          reserve === undefined ||\n          reserve <= 0.000001 ||\n          reserve >= 5 - 0.000001",
  "          reserve === undefined ||\n          reserve < -0.000001 ||\n          reserve >= 5 - 0.000001",
  'ZERO_RESERVE')
 out=replaceOne(out,
  "  const physicalDropProbeKms = Array.from(new Set([\n    phase4.phaseBoundary.startKm,\n    ...eventDefinitions.map((d) => d.kmFromStart)\n      .filter((km) => km >= phase4.phaseBoundary.startKm),",
  "  const physicalDropProbeKms = Array.from(new Set([\n    phase1.phaseBoundary.startKm,\n    ...eventDefinitions.map((d) => d.kmFromStart)\n      .filter((km) => km >= phase1.phaseBoundary.startKm),",
  'EARLY_PROBES')
 out=replaceOne(out,
  "        checkpointIdSuffix: `physical-energy-detachment-${riderId}`,\n        checkpointKind: 'event',\n        phase: 4,\n        kmFromStart: crossing,",
  "        checkpointIdSuffix: `physical-energy-detachment-${riderId}`,\n        checkpointKind: 'event',\n        phase: phaseForKm(crossing),\n        kmFromStart: crossing,",
  'EVENT_PHASE')
 out=replaceOne(out,
  "        energyByRiderId: energyAtKm(4,crossing),",
  "        energyByRiderId: energyAtKm(phaseForKm(crossing),crossing),",
  'EVENT_ENERGY')
 return out
}
