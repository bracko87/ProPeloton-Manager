/** Step A68 -- synthetic route-width physics, research only.
 * Width is a SPATIAL property of world x, never a future accepted A44 path.
 * The given 4.4m constant envelope is unchanged for A64-A67. The pinch
 * fixtures are NOT verified source road profiles and do not authorize
 * production road geometry or official race results.
 */
const MAX_ROAD_Y=4.4
const PROFILES=Object.freeze({
 constant:{id:'constant',edgeInsetM:0},
 mild_pinch:{id:'mild_pinch',edgeInsetM:.55},
 strong_pinch:{id:'strong_pinch',edgeInsetM:1.10}
})
function validate(kind,x){
 if(!Object.hasOwn(PROFILES,kind)||!Number.isFinite(x))
  throw Error('A68 invalid finite road profile query')
}
/** Pinch starts at road x=680, reaches maximum inset at x=780,
 * remains narrow to x=920, widens back to full by x=1020.
 * The same spatial coordinate is used by both sides, every rider, and
 * every step, so rider-ID and left/right reflection cannot change width.
 */
export function researchRoadEnvelopeV3(kind,x){
 validate(kind,x)
 const amount=PROFILES[kind].edgeInsetM
 const factor=x<=680?0:x<780?(x-680)/100:
  x<=920?1:x<1020?(1020-x)/100:0
 const low=amount*factor
 return {minY:low,maxY:MAX_ROAD_Y-low,widthM:MAX_ROAD_Y-2*low,
  id:kind,spatialX:x,synthetic:true}
}
/** Current speed and position may be used for a safety lookahead, but
 * not future accepted movement. The desired lateral target is restricted
 * to a centered corridor that stays on the forthcoming road width.
 * The bounded 0.38m/s physical steering remains the solver's responsibility.
 */
export function constrainedLaneTargetV3(kind,x,v,target,{previewSeconds=4.0}={}){
 validate(kind,x)
 if(!Number.isFinite(v)||v<0||!Number.isFinite(target)||v>50||
  !Number.isFinite(previewSeconds)||previewSeconds<0||previewSeconds>8)
  throw Error('A68 invalid preview target')
 const now=researchRoadEnvelopeV3(kind,x)
 const ahead=researchRoadEnvelopeV3(kind,x+v*previewSeconds)
 // The road may widen or narrow, but the next desired lane must be in
 // BOTH current and upcoming corridor. No immediate state displacement.
 const lo=Math.max(now.minY,ahead.minY)
 const hi=Math.min(now.maxY,ahead.maxY)
 return {targetY:Math.max(lo,Math.min(hi,target)),
  changed:target<lo-1e-9||target>hi+1e-9,
  minimumWidthM:Math.min(now.widthM,ahead.widthM)}
}
/** Physical-point guard used at each collision microinterval, including
 * midpoint, so a road boundary cannot be crossed between full steps.
 * This is fail-closed: never clips the accepted rider coordinates.
 */
export function roadEnvelopeViolationV3(kind,x,y,{toleranceM=1e-6}={}){
 validate(kind,x)
 if(!Number.isFinite(y)||!Number.isFinite(toleranceM)||toleranceM<0)
  throw Error('A68 invalid swept road point')
 const road=researchRoadEnvelopeV3(kind,x)
 return y<road.minY-toleranceM||y>road.maxY+toleranceM?
  {x,y,minY:road.minY,maxY:road.maxY,
   roadWidthM:road.widthM,kind}:null
}
