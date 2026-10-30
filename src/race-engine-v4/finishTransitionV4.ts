/**
 * V4 research-only correction for a final OFFICIAL GROUP assignment that is
 * NOT an observed physical catch. V2 production and classification untouched.
 * A separate leading B lineage may survive while an F rider is grouped into P
 * at the finish according to official results.
 */
export interface V4FinishBridge {
 readonly riderIds:readonly string[]
 readonly caughtByPeloton:boolean
 readonly catchKm:number|null
}
export interface V4FinishTransitionContext {
 readonly allTransitionsAreFrontCaughtByPeloton:boolean
 readonly changedRiderIds:readonly string[]
 readonly finalDisplayCodes:readonly string[]
 readonly bridgeGroups:readonly V4FinishBridge[]
 readonly breakawaySurvived:boolean
 readonly breakawayCaught:boolean
 readonly physicalEndGapSeconds:number
}
export interface V4FinishTransitionDecision {
 readonly officialGroupingWithoutPhysicalCatch:boolean
 readonly eventType:'catch'|'group_split'
 readonly title:string
 readonly usePhysicalPelotonGapAtTransition:boolean
}
export function reconcileV4FinishTransition(context:V4FinishTransitionContext):V4FinishTransitionDecision{
 const b=context.bridgeGroups
 const officiallyGroupedButNotCaught=
  context.allTransitionsAreFrontCaughtByPeloton &&
  context.changedRiderIds.length>0 &&
  context.breakawaySurvived===true &&
  context.breakawayCaught===false &&
  context.finalDisplayCodes.some(code=>code.startsWith('B')) &&
  context.finalDisplayCodes.includes('P') &&
  Number.isFinite(context.physicalEndGapSeconds)&&context.physicalEndGapSeconds>0 &&
  context.changedRiderIds.every(id=>b.some(bridge=>
    bridge.riderIds.includes(id)&&bridge.caughtByPeloton===false&&bridge.catchKm===null))
 // Preserve physical catches if *any* changed rider has recorded catch evidence.
 if(officiallyGroupedButNotCaught)return {
  officialGroupingWithoutPhysicalCatch:true,
  eventType:'group_split',
  title:'Final finishing groups confirmed',
  usePhysicalPelotonGapAtTransition:true
 }
 return {
  officialGroupingWithoutPhysicalCatch:false,
  eventType:context.allTransitionsAreFrontCaughtByPeloton?'catch':'group_split',
  title:context.allTransitionsAreFrontCaughtByPeloton
   ?'Front group caught on the line':'Final gaps open on the line',
  usePhysicalPelotonGapAtTransition:false
 }
}
