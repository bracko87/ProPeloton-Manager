/** Isolated V4 physical mountain chase priority experiment; never loaded by production. */
const paceAnchor="    effectivePelotonPaceKmh = clamp(\n      stepReferencePaceKmh *\n        pelotonComponents.selectedResponseMultiplier *"
const outputAnchor="        pelotonComponents.selectedResponseMultiplier *\n        (chasingTeamIds.length === 0 ? 0.97 : 1) *"
export function patchV4MountainEarlyChasePriorityCandidateSource(source,{gain=0.012}={}){
 if(!Number.isFinite(gain)||gain<0||gain>0.018)throw Error('V4 early chase priority gain outside safe research range')
 if(typeof source!=='string'||source.split(paceAnchor).length!==2||
    source.split(outputAnchor).length!==2)
  throw Error('V4 phase-2 chase priority anchor drift: fail closed')
 const value=Number(gain.toFixed(4))
 const additions=[
  "    // Synthetic V4 only. Prioritize committed, energy-capable workers over role-eligible bystanders.",
  "    // Physical pace only: never replace the measured gap integrator, catch conditions or replay.",
  "    const v4Phase2ExplicitChaseWorkers = phase2ChaseWorkerRows.filter(({phase})=>",
  "      phase.behaviour==='chase').length",
  "    const v4Phase2ExplicitCommitmentFraction = phase2ChaseWorkerRows.length>0",
  "      ? v4Phase2ExplicitChaseWorkers/phase2ChaseWorkerRows.length : 0",
  "    const v4Phase2ChasePriorityMultiplier =",
  "      input.stage.terrainType === 'mountain' && currentGapSeconds>0",
  `        ? 1+${value}*v4Phase2ExplicitCommitmentFraction*phase2WorkerEnergyFraction`,
  "        : 1",
 ].join('\n')
 return source.replace(paceAnchor,additions+'\n'+paceAnchor)
  .replace(outputAnchor,"        pelotonComponents.selectedResponseMultiplier *\n        v4Phase2ChasePriorityMultiplier *\n        (chasingTeamIds.length === 0 ? 0.97 : 1) *")
}
