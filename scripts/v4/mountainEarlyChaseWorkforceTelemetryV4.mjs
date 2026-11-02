/** Read-only phase-2/3 chase workforce counters for isolated V4 research. */
const phase2Anchor="  const availableChaseAssets = phase2ChaseWorkerRows.length"
const phase3Anchor="  const phase3AvailableChaseAssets = phase3ChaseWorkerRows.length"
export function patchV4EarlyChaseWorkforceTelemetrySource(source){
 if(typeof source!=='string'||source.split(phase2Anchor).length!==2||
    source.split(phase3Anchor).length!==2)
  throw Error('V4 early chase workforce telemetry anchor drift: fail closed')
 const phase2Log=[
  "  if(process.env.V4_EARLY_CHASE_WORKFORCE_TELEMETRY === '1' && input.stage.terrainType === 'mountain'){",
  "   console.log('V4_EARLY_CHASE_WORKFORCE '+JSON.stringify({",
  "    phase:2,seed:input.engine.deterministicSeed,stageKm:input.stage.distanceKm,",
  "    interestedTeams:chasingTeamIds.length,",
  "    explicitChaseOrders:phase2Rows.filter(({phase})=>phase.behaviour==='chase').length,",
  "    selectedChaseOrderedWorkers:phase2ChaseWorkerRows.filter(({phase})=>phase.behaviour==='chase').length,",
  "    roleEligibleNonChaseWorkers:phase2ChaseWorkerRows.filter(({phase})=>phase.behaviour!=='chase').length,",
  "    eligibleChaseAssets:availableChaseAssets,",
  "    capacityFraction:Math.min(1,availableChaseAssets/12)",
  "   }))",
  "  }"
 ].join('\n')
 const phase3Log=[
  "  if(process.env.V4_EARLY_CHASE_WORKFORCE_TELEMETRY === '1' && input.stage.terrainType === 'mountain'){",
  "   console.log('V4_EARLY_CHASE_WORKFORCE '+JSON.stringify({",
  "    phase:3,seed:input.engine.deterministicSeed,stageKm:input.stage.distanceKm,",
  "    interestedTeams:physicalChasingTeamIds.length,",
  "    explicitChaseOrders:phase3Rows.filter(({phase})=>phase.behaviour==='chase').length,",
  "    selectedChaseOrderedWorkers:phase3ChaseWorkerRows.filter(({phase})=>phase.behaviour==='chase').length,",
  "    roleEligibleNonChaseWorkers:phase3ChaseWorkerRows.filter(({phase})=>phase.behaviour!=='chase').length,",
  "    eligibleChaseAssets:phase3AvailableChaseAssets,",
  "    capacityFraction:Math.min(1,phase3AvailableChaseAssets/12)",
  "   }))",
  "  }"
 ].join('\n')
 return source.replace(phase2Anchor,phase2Anchor+'\n'+phase2Log)
  .replace(phase3Anchor,phase3Anchor+'\n'+phase3Log)
}
