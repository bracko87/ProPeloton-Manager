/**
 * SHADOW-ONLY spatial passing opportunity audit. No positions, rider energy,
 * official results or replay frames are mutated by this diagnostic.
 * A hypothetical lane opening is NOT proof of a safe completed lane change:
 * competing simultaneous merges and energy/power coupling remain unsolved.
 */
import {advanceSpatialPelotonV3,type SpatialRiderV3,type SpatialRoadV3} from './pelotonSpatialMotionV3.ts'

export interface ShadowPassOptionV3 {
  readonly riderId:string
  readonly originalLane:number
  readonly originalTargetMeters:number
  readonly actualMeters:number
  readonly blockedMeters:number
  readonly adjacentLane:number|null
  readonly potentialMeters:number
  readonly potentialGainMeters:number
  readonly mergeClearAtStart:boolean
  readonly reason:'not_blocked'|'no_clear_adjacent_lane'|'potential_lane_change'
}
export interface ShadowPassAuditV3 {
  readonly mode:'SHADOW_ONLY_DO_NOT_APPLY'
  readonly riders:number
  readonly blockedRiders:number
  readonly opportunities:number
  readonly potentialTotalGainMeters:number
  readonly decisions:readonly ShadowPassOptionV3[]
}
const round6=(v:number)=>Math.round(v*1e6)/1e6
/** Compare the *existing* fully validated wheel-limited movement to potential
 * lane entrances. Does not make or reserve lane changes. */
export function auditPassingOpportunitiesV3(riders:readonly SpatialRiderV3[],road:SpatialRoadV3):ShadowPassAuditV3 {
  // Reuse the authoritative validation and collision checks; no separate
  // parallel interpretation of a corrupted input is allowed.
  const current=advanceSpatialPelotonV3(riders,road)
  const spacing=road.minWheelGapMeters??1.8
  const byId=new Map(riders.map(r=>[r.riderId,r]))
  const decisions=current.map(motion=>{
    const rider=byId.get(motion.riderId)!
    const originalTargetMeters=rider.meters+rider.desiredMps*road.dtSeconds
    const blockedMeters=Math.max(0,originalTargetMeters-motion.meters)
    if(blockedMeters<=1e-6||rider.tactic==='recover')return {
      riderId:rider.riderId,originalLane:rider.lane,originalTargetMeters:round6(originalTargetMeters),
      actualMeters:motion.meters,blockedMeters:round6(blockedMeters),adjacentLane:null,potentialMeters:motion.meters,
      potentialGainMeters:0,mergeClearAtStart:false,reason:'not_blocked' as const}
    const options=[rider.lane-1,rider.lane+1].filter(l=>l>=0&&l<road.laneCount)
    const alternatives=options.map(lane=>{
      const clearAtEntry=riders.every(other=>other.riderId===rider.riderId||other.lane!==lane||Math.abs(other.meters-rider.meters)>=spacing)
      // A cyclist already *ahead* in that lane continues moving; the rider
      // might merge safely BEHIND them and gain some road. Full clearance
      // during the lateral maneuver is outside this read-only audit.
      const ahead=current.filter(other=>other.lane===lane&&other.oldMeters>=rider.meters&&other.riderId!==rider.riderId)
        .sort((a,b)=>a.meters-b.meters)[0]
      const capped=ahead?Math.max(rider.meters,Math.min(originalTargetMeters,ahead.meters-spacing)):originalTargetMeters
      return {lane,clearAtEntry,meters:round6(capped),gain:round6(Math.max(0,capped-motion.meters))}
    }).filter(x=>x.clearAtEntry&&x.gain>1e-6).sort((a,b)=>b.gain-a.gain||a.lane-b.lane)
    const preferred=alternatives[0]
    return {riderId:rider.riderId,originalLane:rider.lane,originalTargetMeters:round6(originalTargetMeters),
      actualMeters:motion.meters,blockedMeters:round6(blockedMeters),adjacentLane:preferred?.lane??null,
      potentialMeters:preferred?.meters??motion.meters,potentialGainMeters:preferred?.gain??0,
      mergeClearAtStart:!!preferred,reason:preferred?'potential_lane_change' as const:'no_clear_adjacent_lane' as const}
  })
  return {mode:'SHADOW_ONLY_DO_NOT_APPLY',riders:riders.length,
    blockedRiders:decisions.filter(r=>r.blockedMeters>1e-6).length,
    opportunities:decisions.filter(r=>r.potentialGainMeters>0).length,
    potentialTotalGainMeters:round6(decisions.reduce((sum,r)=>sum+r.potentialGainMeters,0)),
    decisions}
}
