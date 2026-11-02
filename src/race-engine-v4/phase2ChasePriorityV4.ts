/**
 * V4-only experimental phase-2 team-chase priority (no production dispatch).
 *
 * Roles qualifying as helpers are not necessarily actively turning at the
 * front. Explicitly committed pursuit workers can deliver an incremental,
 * energy-limited speed advantage without prescribing gap targets or catches.
 * The road gap integrator and replay validator remain authoritative.
 */
export type V4ChasePriorityTerrain='flat'|'hilly'|'mountain'|string
export interface V4Phase2ChasePriorityInput {
 readonly terrainType:V4ChasePriorityTerrain
 readonly currentGapSeconds:number
 readonly eligibleChaseWorkers:number
 readonly explicitlyChasingWorkers:number
 readonly meanWorkerEnergyFraction:number
 readonly gain?:number
}
/** 1.0 for unaffected races; bounded [1, 1+gain] for active mountain pursuits. */
export function calculateV4Phase2ChasePriorityMultiplier(input:V4Phase2ChasePriorityInput):number{
 const {terrainType,currentGapSeconds,eligibleChaseWorkers,
  explicitlyChasingWorkers,meanWorkerEnergyFraction,gain=0.012}=input
 if(typeof terrainType!=='string'||terrainType.length===0||
    !Number.isFinite(currentGapSeconds)||currentGapSeconds<0||
    !Number.isInteger(eligibleChaseWorkers)||eligibleChaseWorkers<0||
    !Number.isInteger(explicitlyChasingWorkers)||explicitlyChasingWorkers<0||
    explicitlyChasingWorkers>eligibleChaseWorkers||
    !Number.isFinite(meanWorkerEnergyFraction)||
    meanWorkerEnergyFraction<0||meanWorkerEnergyFraction>1||
    !Number.isFinite(gain)||gain<0||gain>0.018)
  throw Error('V4 phase-2 chase priority: invalid bounded research inputs')
 if(terrainType!=='mountain'||currentGapSeconds===0||eligibleChaseWorkers===0)return 1
 return 1+gain*(explicitlyChasingWorkers/eligibleChaseWorkers)*meanWorkerEnergyFraction
}
