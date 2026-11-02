/** Read-only telemetry injected solely in opt-in V4 research bundles. */
const anchor="    const stepEscapePaceKmh = calculateRoadPhysicalGroupPaceKmh("
export function patchV4MountainChaseWorkerTelemetrySource(source){
 if(typeof source!=='string'||source.split(anchor).length!==2)
  throw Error('V4 chase-telemetry anchor drift: fail closed')
 const extra=[
  "    if (process.env.V4_CHASE_STEP_TELEMETRY === '1' &&",
  "        input.stage.terrainType === 'mountain' && input.stage.distanceKm >= 170) {",
  "      console.log('V4_CHASE_PHYSICS_STEP '+JSON.stringify({",
  "        seed:input.engine.deterministicSeed,",
  "        stageKm:input.stage.distanceKm,",
  "        km:Number(currentKm.toFixed(3)),",
  "        explicitOrders:explicitChasers.length,",
  "        activeExplicit:effectiveExplicitChaserCount,",
  "        activeAutomatic:activeAutomaticWorkerCount,",
  "        automaticEligible:eligibleAutomaticWorkers.length,",
  "        automaticSelected:effectiveAutomaticWorkerRows.length,",
  "        teamCount:effectiveExplicitChasingTeamIds.length+activeAutomaticTeamCount,",
  "        responseMode:response.responseMode,",
  "        responseMultiplier:response.selectedResponseMultiplier,",
  "        workIntensity:response.pelotonWorkIntensityFraction,",
  "        pelotonPaceKmh:effectivePelotonPaceKmh,",
  "        currentGapSeconds,",
  "      }))",
  "    }",
 ].join('\n')
 return source.replace(anchor,extra+'\n'+anchor)
}
