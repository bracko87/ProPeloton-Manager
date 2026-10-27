/** A2 offline-only, non-clairvoyant corridor feasibility selector.
 * This DOES NOT modify physics or confer priority. It chooses an adjacent
 * lane from only the frozen positions of other riders, for micro testing.
 */
import {validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
const assert=(v,msg)=>{if(!v)throw Error(msg)}
export function selectEarlyCorridorV3(riders,rearId,geometry,{lookaheadMeters=25}={}){
 const g=validateRoadScenarioV3(geometry)
 assert(Array.isArray(riders)&&riders.length>=2&&riders.length<=32&&typeof rearId==='string'&&Number.isFinite(lookaheadMeters)&&lookaheadMeters>=10&&lookaheadMeters<=40,'Invalid corridor selection')
 const rear=riders.find(r=>r.riderId===rearId)
 assert(rear&&Number.isFinite(rear.meters)&&Number.isFinite(rear.y),'Missing corridor rider')
 const candidates=[rear.y-g.centerStepM,rear.y+g.centerStepM].filter(y=>y>=0&&y<=(g.laneCount-1)*g.centerStepM)
 assert(candidates.length>0,'No lateral corridor on road')
 const choices=candidates.map(y=>{
  let blockingRiders=0,nearestBlockerAheadMeters=null
  for(const other of riders){
   if(other.riderId===rearId)continue
   const dx=other.meters-rear.meters
   if(Math.abs(other.y-y)<g.lateralCollisionM&&dx>=-1.8&&dx<=lookaheadMeters){
    blockingRiders++
    if(dx>=0&&(nearestBlockerAheadMeters===null||dx<nearestBlockerAheadMeters))nearestBlockerAheadMeters=dx
   }
  }
  return {targetY:y,blockingRiders,nearestBlockerAheadMeters}
 })
 choices.sort((a,b)=>a.blockingRiders-b.blockingRiders||a.targetY-b.targetY)
 return {selectedY:choices[0].targetY,candidates:choices,method:'FROZEN_OCCUPANCY_HEURISTIC_ONLY',notSafetyApproval:true}
}
