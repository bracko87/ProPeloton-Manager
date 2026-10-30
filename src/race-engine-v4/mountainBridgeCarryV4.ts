/**
 * V4 research-only Phase3 -> Phase4 carried-bridge checkpoint reconciliation.
 * Read ONLY actual group memberships AFTER the existing low-energy overlay.
 * An exhausted rider already in C must not be announced as an active F bridge.
 * Ambiguous memberships remain unchanged for strict replay validation.
 */
export interface V4CarryGroup {
 readonly displayCode:string
 readonly physicalLineageId?:string|null
 readonly physicalPosition?:string
 readonly riderIds:readonly string[]
}
export interface V4CarryBridge {
 readonly lineageId?:string|null
 readonly displayCode:string
 readonly riderIds:readonly string[]
}
export interface V4CarryDecision {
 readonly emitEvent:boolean
 readonly activeRiderIds:readonly string[]
 readonly verifiedLowEnergyDetach:boolean
}
export function decideV4CarriedBridgeCheckpoint(
 bridge:V4CarryBridge,groups:readonly V4CarryGroup[]
):V4CarryDecision {
 const original=[...bridge.riderIds].sort()
 if(original.length===0)return {emitEvent:true,activeRiderIds:original,verifiedLowEnergyDetach:false}
 const front=groups.find(g=>
  g.displayCode.startsWith('F')&&
  (bridge.lineageId ? g.physicalLineageId===bridge.lineageId:
   g.displayCode===bridge.displayCode))
 if(front){
  const active=original.filter(id=>front.riderIds.includes(id))
  if(active.length>0 && original.every(id=>
   active.includes(id)||groups.some(g=>g.riderIds.includes(id)&&
    g.displayCode.startsWith('C')&&g.physicalPosition==='behind_peloton')))
   return {emitEvent:true,activeRiderIds:active,verifiedLowEnergyDetach:active.length!==original.length}
 }
 const allDetached=original.every(id=>
  groups.some(g=>g.riderIds.includes(id)&&g.displayCode.startsWith('C')&&
   g.physicalPosition==='behind_peloton')) &&
  !groups.some(g=>g.displayCode.startsWith('F')&&
   original.some(id=>g.riderIds.includes(id)))
 return allDetached
  ? {emitEvent:false,activeRiderIds:[],verifiedLowEnergyDetach:true}
  : {emitEvent:true,activeRiderIds:original,verifiedLowEnergyDetach:false}
}
