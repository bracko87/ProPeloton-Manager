/**
 * OFFLINE-ONLY candidate for independent bicycle placement, passing and shelter.
 * Positions are longitudinal; lanes represent finite road width, not separate
 * stage times. Calculations are deterministic and do not prescribe finishes.
 * No DB, workers, production selection or official results.
 */
export interface SpatialRiderV3 {
  readonly riderId:string
  readonly meters:number
  readonly lane:number
  readonly desiredMps:number
  readonly energy:number
  readonly tactic?:'follow'|'tempo'|'chase'|'attack'|'recover'
}
export interface SpatialRoadV3 {
  readonly laneCount:number
  readonly dtSeconds:number
  readonly minWheelGapMeters?:number
  readonly maxLateralMovesPerTick?:number
  readonly crosswindMps?:number
  readonly gradePercent?:number
}
export interface SpatialStepRiderV3 {
  readonly riderId:string
  readonly oldMeters:number
  readonly meters:number
  readonly lane:number
  readonly speedMps:number
  readonly commandedMps:number
  readonly leadRiderId:string|null
  readonly slipstreamFraction:number
  readonly lateralMoves:number
  readonly overtook:boolean
  readonly wheelLimited:boolean
}
const clamp=(n:number,a:number,b:number)=>Math.min(b,Math.max(a,n))
const round6=(n:number)=>Math.round(n*1e6)/1e6
const stable=(a:SpatialRiderV3,b:SpatialRiderV3)=>b.meters-a.meters||a.riderId.localeCompare(b.riderId)
export function calculateSpatialSlipstreamV3(rider:SpatialRiderV3,all:readonly SpatialRiderV3[],road:Pick<SpatialRoadV3,'crosswindMps'|'gradePercent'>):{leaderId:string|null;fraction:number} {
  // Draft is found from rider *locations*, never from array order. A headwind
  // changes its effective value in the separate mechanical power model.
  const leaders=all.filter(x=>x.riderId!==rider.riderId&&x.meters>rider.meters&&x.meters-rider.meters<=18&&Math.abs(x.lane-rider.lane)<=1)
    .sort((a,b)=>a.meters-b.meters||a.riderId.localeCompare(b.riderId))
  const leader=leaders[0]
  if(!leader)return {leaderId:null,fraction:0}
  const gap=leader.meters-rider.meters
  const lateral=Math.abs(leader.lane-rider.lane)
  const wind=clamp(1-Math.abs(road.crosswindMps??0)/16,.18,1)
  const climb=clamp(1-Math.max(0,road.gradePercent??0)/9,.1,1)
  const alignment=lateral===0?1:.4
  // no shelter if rider is effectively riding abreast
  const wheelDistance=clamp((18-gap)/15,0,1)
  return {leaderId:leader.riderId,fraction:round6(.30*wheelDistance*alignment*wind*climb)}
}
/** One simultaneously computed physical tick; no rider can overlap/overtake
 * another in their selected lane. A passing move must use a clear swept lane.
 * Called with actual rider speed targets from an energy/power controller. */
export function advanceSpatialPelotonV3(riders:readonly SpatialRiderV3[],road:SpatialRoadV3):readonly SpatialStepRiderV3[]{
  if(!Number.isInteger(road.laneCount)||road.laneCount<1||road.laneCount>6||!Number.isFinite(road.dtSeconds)||road.dtSeconds<=0||road.dtSeconds>20||
   !Number.isFinite(road.minWheelGapMeters??1.8)||(road.minWheelGapMeters??1.8)<1.5||(road.minWheelGapMeters??1.8)>5||
   !Number.isInteger(road.maxLateralMovesPerTick??1)||(road.maxLateralMovesPerTick??1)!==1||
   !Number.isFinite(road.crosswindMps??0)||Math.abs(road.crosswindMps??0)>55||!Number.isFinite(road.gradePercent??0)||Math.abs(road.gradePercent??0)>22)
    throw Error('Invalid finite-road spatial settings')
  const spacing=road.minWheelGapMeters??1.8
  const ids=new Set<string>()
  for(const r of riders){
    if(!r.riderId||ids.has(r.riderId)||!Number.isFinite(r.meters)||r.meters<0||!Number.isInteger(r.lane)||r.lane<0||r.lane>=road.laneCount||
    !Number.isFinite(r.desiredMps)||r.desiredMps<0||r.desiredMps>30||!Number.isFinite(r.energy)||r.energy<0||r.energy>1)
      throw Error('Invalid or duplicated physical rider')
    ids.add(r.riderId)
  }
  if(!riders.length)return []
  const ordered=[...riders].sort(stable)
  // A recorded stage checkpoint must not contain overlapping bicycles on
  // the same wheel track. In particular reject coincident zero-grid starts.
  for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){
    if(ordered[i].lane===ordered[j].lane&&Math.abs(ordered[i].meters-ordered[j].meters)<spacing-1e-6)
      throw Error('Overlapping starting bicycle positions')
  }
  const completed:SpatialStepRiderV3[]=[]
  const result=new Map<string,SpatialStepRiderV3>()
  for(const rider of ordered){
    const target=rider.meters+rider.desiredMps*road.dtSeconds
    const draft=calculateSpatialSlipstreamV3(rider,ordered,road)
    const lastSame=completed.filter(other=>other.lane===rider.lane&&other.oldMeters>=rider.meters).sort((a,b)=>a.meters-b.meters)[0]
    // Leaders already planned this same time interval. Respect wheel spacing
    // by limiting the follower's actual end position when lane is congested.
    const allowedSame=lastSame?Math.max(rider.meters,lastSame.meters-spacing):target
    let position=Math.min(target,allowedSame),lane=rider.lane
    let moved=0,passed=false
    if(position<target-1e-6 && road.laneCount>1 && rider.tactic!=='recover'){
      const moves=[rider.lane-1,rider.lane+1].filter(n=>n>=0&&n<road.laneCount)
      const candidates:{lane:number;meters:number;passes:boolean}[]=[]
      for(const laneOption of moves){
        // Safe swept corridor: neither a current bicycle nor a reserved
        // trajectory may be crossed inside the destination lane. Front bikes
        // farther ahead than requested end position are not obstacles.
        const sweptBlocked=ordered.some(x=>x.riderId!==rider.riderId&&x.lane===laneOption&&x.meters>=rider.meters-spacing&&x.meters<=target+spacing)
        if(sweptBlocked)continue
        const reservation=completed.filter(x=>x.lane===laneOption&&x.oldMeters>=rider.meters).sort((a,b)=>a.meters-b.meters)[0]
        const safeTarget=reservation?Math.min(target,reservation.meters-spacing):target
        if(safeTarget>position+1e-6)candidates.push({lane:laneOption,meters:safeTarget,passes:safeTarget>(lastSame?.meters??Infinity)+spacing})
      }
      candidates.sort((a,b)=>b.meters-a.meters||a.lane-b.lane)
      if(candidates.length){lane=candidates[0].lane;position=candidates[0].meters;moved=1;passed=candidates[0].passes}
    }
    position=round6(Math.max(rider.meters,position))
    const speed=round6((position-rider.meters)/road.dtSeconds)
    const item={riderId:rider.riderId,oldMeters:rider.meters,meters:position,lane,speedMps:speed,commandedMps:rider.desiredMps,
      leadRiderId:draft.leaderId,slipstreamFraction:draft.fraction,lateralMoves:moved,overtook:passed,wheelLimited:position+1e-6<target}
    result.set(rider.riderId,item);completed.push(item)
  }
  // Moving lanes can introduce a collision with a rider who started further
  // behind but is planned later. We reject rather than silently teleporting.
  for(let i=0;i<completed.length;i++)for(let j=i+1;j<completed.length;j++){
    if(completed[i].lane===completed[j].lane&&Math.abs(completed[i].meters-completed[j].meters)<spacing-1e-5)
      throw Error('Spatial lane reservation collision '+JSON.stringify([completed[i],completed[j]]))
  }
  return riders.map(r=>result.get(r.riderId)!)
}
