/**
 * V4 research-only bridge handoff normalizer.
 * Reconciles a stale historical 'B1' replay target with the ACTIVE F1/F2
 * leader AFTER an actual zero-gap physical bridge merge.
 *
 * This is not a physics calculation and MUST NOT force a gap or catch.
 * Never import this from V2, the live worker, or result writer.
 */
export type V4FrontCode = 'B1'|'F1'|'F2'
export interface V4BridgeHandoffShape {
 readonly mergeTargetDisplayCode:V4FrontCode|null
 readonly mergedIntoOpeningBreakaway:boolean
 readonly mergeKm:number|null
 readonly gapSamples:readonly {
  readonly gapToLeaderSeconds:number
  readonly gapToPelotonSeconds:number
 }[]
}
export interface V4BridgeHandoffContext {
 readonly openingBreakawayCarriesIntoPhase4:boolean
 readonly activeFrontDisplayCode:V4FrontCode
 readonly mergeToleranceSeconds:number
}
/**
 * Never change a bridge that has not physically merged (zero leader gap),
 * never alias B1 while B1 is still active, and never rewrite the group
 * identity if the peloton is already within the physical merge threshold.
 * Return exact original object reference unless the alias is justified.
 */
export function reconcileV4ReplayBridgeMergeTargets<T extends V4BridgeHandoffShape>(
 bridges:readonly T[],
 context:V4BridgeHandoffContext
):readonly T[] {
 if(!Number.isFinite(context.mergeToleranceSeconds)||
    context.mergeToleranceSeconds<0)
  throw Error('V4 bridge handoff requires valid physical merge tolerance')
 return bridges.map(bridge=>{
  const final=bridge.gapSamples.at(-1)
  const isValidatedPhysicalMerge=
   !context.openingBreakawayCarriesIntoPhase4 &&
   context.activeFrontDisplayCode!=='B1' &&
   bridge.mergeTargetDisplayCode==='B1' &&
   bridge.mergedIntoOpeningBreakaway===true &&
   bridge.mergeKm!==null&&Number.isFinite(bridge.mergeKm)&&
   final!==undefined &&
   Number.isFinite(final.gapToLeaderSeconds)&&
   Math.abs(final.gapToLeaderSeconds)<=0.000001 &&
   Number.isFinite(final.gapToPelotonSeconds)&&
   final.gapToPelotonSeconds>context.mergeToleranceSeconds
  return isValidatedPhysicalMerge
    ? {...bridge,mergeTargetDisplayCode:context.activeFrontDisplayCode}
    : bridge
 })
}
