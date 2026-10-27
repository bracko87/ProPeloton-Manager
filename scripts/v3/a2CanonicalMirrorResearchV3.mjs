/** A41: one canonical left-right road representation for the A39 OFFLINE solver.
 * Physical rider geometry is reflected only at the research boundary.
 * The collision/energy algorithm itself is unchanged. Never drives real races.
 */
import {initializeSubstepPhysicalResearchV3,advanceSubstepPhysicalResearchV3} from './a2SubstepPhysicalResearchV3.mjs'
import {validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
const check=(v,m)=>{if(!v)throw Error(m)}
const r6=x=>Math.round(x*1e6)/1e6
const bounds=geometry=>{
 const g=validateRoadScenarioV3(geometry)
 return {physicalMax:(g.laneCount-1)*g.centerStepM,
  canonicalMax:r6((g.laneCount-1)*g.centerStepM)}
}
// Quantize once before reflection. A rounded wide-road upper edge may be
// 3.6 rather than binary-floating 3.5999999999999996; clamp input back
// inside the unchanged A34 adapter's validated road envelope.
function reflect(y,b){
 check(Number.isFinite(y)&&y>=0&&y<=b.canonicalMax+1e-7,'A41 invalid physical lateral coordinate')
 return Math.max(0,Math.min(b.physicalMax,r6(b.canonicalMax-r6(y))))
}
const reflectedOutput=(y,b)=>r6(b.canonicalMax-r6(y))
function physicalView(wrapper){
 const s=wrapper.source,b=bounds(s.geometry),flip=wrapper.canonicalFlipped
 const riders=s.riders.map(r=>({...r,y:flip?reflectedOutput(r.y,b):r.y}))
 const lastTickTracks=s.lastTickTracks.map(t=>({...t,knots:t.knots.map(k=>({
  ...k,y:flip?reflectedOutput(k.y,b):k.y
 }))}))
 return {...wrapper,version:1,gate:'A41_CANONICAL_OFFLINE_ONLY',
  tick:s.tick,elapsedSeconds:s.elapsedSeconds,geometry:s.geometry,road:s.road,
  officialWrites:0,sportingApproval:'NOT_APPROVED',riders,
  metrics:s.metrics,lastTickTracks,lastTickConflictTrace:s.lastTickConflictTrace}
}
export function initializeCanonicalMirrorResearchV3(options){
 check(options&&Array.isArray(options.riders)&&options.riders.length>=2,
  'A41 requires synthetic riders')
 const b=bounds(options.geometry)
 const ordered=[...options.riders].sort((a,c)=>
  a.meters-c.meters||a.speedMps-c.speedMps||a.cpWatts-c.cpWatts)
 const anchor=ordered.find(r=>Math.abs(2*r6(r.y)-b.canonicalMax)>1e-6)
 check(anchor,'A41 requires a distinguishable lateral anchor; cannot canonicalize an all-center starting field')
 const canonicalFlipped=r6(anchor.y)>b.canonicalMax/2
 const normalized=options.riders.map(x=>({...x,y:canonicalFlipped?reflect(x.y,b):x.y}))
 const source=initializeSubstepPhysicalResearchV3({
  ...options,riders:normalized,conflictPolicy:'event_time_fair',diagnosticTrace:false
 })
 return physicalView({canonicalFlipped,source})
}
export function advanceCanonicalMirrorResearchV3(checkpoint,intents){
 check(checkpoint?.gate==='A41_CANONICAL_OFFLINE_ONLY'&&checkpoint?.source?.gate==='A34_OFFLINE_SUBSTEP_ONLY'&&
  checkpoint.source.conflictPolicy==='event_time_fair'&&
  checkpoint.source.officialWrites===0&&checkpoint.sportingApproval==='NOT_APPROVED'&&
  typeof checkpoint.canonicalFlipped==='boolean',
  'A41 invalid saved offline canonical checkpoint')
 check(Array.isArray(intents)&&intents.length===checkpoint.source.riders.length,
  'A41 missing physical rider commands')
 const b=bounds(checkpoint.source.geometry)
 const normalizedIntents=intents.map(c=>({...c,targetY:checkpoint.canonicalFlipped?reflect(c.targetY,b):c.targetY}))
 const source=advanceSubstepPhysicalResearchV3(checkpoint.source,normalizedIntents)
 return physicalView({canonicalFlipped:checkpoint.canonicalFlipped,source})
}
