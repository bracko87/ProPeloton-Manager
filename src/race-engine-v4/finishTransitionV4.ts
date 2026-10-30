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
 readonly gapSamples?:readonly {readonly gapToPelotonSeconds:number}[]
}
export interface V4FinishTransitionContext {
 readonly allTransitionsAreFrontCaughtByPeloton:boolean
 readonly changedRiderIds:readonly string[]
 readonly finalDisplayCodes:readonly string[]
 readonly bridgeGroups:readonly V4FinishBridge[]
 readonly breakawaySurvived:boolean
 readonly breakawayCaught:boolean
 readonly physicalEndGapSeconds:number
 readonly officialFinishGroupingToleranceSeconds:number
}
export interface V4FinishTransitionDecision {
 readonly officialGroupingWithoutPhysicalCatch:boolean
 readonly eventType:'catch'|'group_split'
 readonly title:string
 readonly usePhysicalPelotonGapAtTransition:boolean
}
export function reconcileV4FinishTransition(context:V4FinishTransitionContext):V4FinishTransitionDecision{
 const b=context.bridgeGroups
 const tolerated=context.officialFinishGroupingToleranceSeconds
 const officiallyGroupedButNotCaught=
  context.allTransitionsAreFrontCaughtByPeloton &&
  context.changedRiderIds.length>0 &&
  context.breakawaySurvived===true &&
  context.breakawayCaught===false &&
  context.finalDisplayCodes.some(code=>code.startsWith('B')) &&
  context.finalDisplayCodes.includes('P') &&
  Number.isFinite(context.physicalEndGapSeconds)&&context.physicalEndGapSeconds>0 &&
  Number.isFinite(tolerated)&&tolerated>=0 &&
  context.changedRiderIds.every(id=>b.some(bridge=>{
    const separation=bridge.gapSamples?.at(-1)?.gapToPelotonSeconds
    return bridge.riderIds.includes(id)&&bridge.caughtByPeloton===false&&
      bridge.catchKm===null&&separation!==undefined&&
      Number.isFinite(separation)&&separation>=0&&separation<=tolerated
  }))
 // Preserve physical catches if *any* changed rider has recorded catch evidence.
 if(officiallyGroupedButNotCaught)return {
  officialGroupingWithoutPhysicalCatch:true,
  eventType:'catch',
  title:'Front group joins the official peloton finish group',
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

/**
 * The finish winner must be physically ahead, even if the lone leader has
 * exhausted Phase-3 sprint eligibility. This does not turn an F-to-P move
 * into a catch: it limits the fallback sprint contest to observed leaders.
 * Only overrides the legacy fallback when the nearest eligible rider is
 * separated by strictly more than the existing physical grouping tolerance.
 */
export interface V4PhysicalFrontFinishState {
 readonly riderId:string
 readonly finalGapSeconds:number
}
export interface V4PhysicalFrontFinishFallbackContext {
 readonly physicalFrontRiderIds:readonly string[]
 readonly finishEligibleRiderIds:readonly string[]
 readonly riderFinishStates:readonly V4PhysicalFrontFinishState[]
 readonly groupingToleranceSeconds:number
}
export function selectV4PhysicalFrontFinishFallback(
 context:V4PhysicalFrontFinishFallbackContext
):string[]{
 const tolerance=context.groupingToleranceSeconds
 if(!Number.isFinite(tolerance)||tolerance<0||context.physicalFrontRiderIds.length===0)return []
 const states=new Map(context.riderFinishStates.map(state=>[state.riderId,state]))
 const frontIds=[...new Set(context.physicalFrontRiderIds)]
 if(frontIds.some(id=>!states.has(id)))return [] // no invented finish positions
 const front=frontIds.map(id=>states.get(id)!)
 if(front.some(state=>!Number.isFinite(state.finalGapSeconds)||state.finalGapSeconds<0))return []
 const eligible=new Set(context.finishEligibleRiderIds)
 if(front.some(state=>eligible.has(state.riderId)))return [] // normal sprint scoring wins
 const nearestEligibleGap=context.riderFinishStates
  .filter(state=>eligible.has(state.riderId))
  .map(state=>state.finalGapSeconds)
  .filter(gap=>Number.isFinite(gap)&&gap>=0)
  .sort((a,b)=>a-b)[0]
 const frontGap=Math.min(...front.map(state=>state.finalGapSeconds))
 if(nearestEligibleGap!==undefined&&nearestEligibleGap-frontGap<=tolerance+0.000001)return []
 return front.sort((a,b)=>a.finalGapSeconds-b.finalGapSeconds||
  a.riderId.localeCompare(b.riderId)).map(state=>state.riderId)
}
