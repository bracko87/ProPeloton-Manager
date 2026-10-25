/**
 * V3 OFFLINE research: calculate aerodynamic work at the *achieved* speed
 * using shelter observed at both ends of a physical movement interval.
 * A lane move at a tick boundary cannot retrospectively grant shelter during
 * the full tick. This is a provisional trapezoid/quadrature model, NOT a
 * validated continuous 2-D bike trajectory or production physics.
 */
import {calculateSpatialSlipstreamV3,type SpatialRiderV3,type SpatialStepRiderV3} from './pelotonSpatialMotionV3.ts'
import {roadWattsRequiredV3,type PackRoadV3} from './pelotonPowerBalanceV3.ts'

export interface PathDraftExposureV3 {
  readonly riderId:string
  readonly shelterAtStart:number
  readonly shelterAtEnd:number
  readonly integratedShelter:number
  readonly wattsAtStartExposure:number
  readonly wattsWithPathExposure:number
  readonly extraWattsFromExposureChange:number
  readonly lateralChanged:boolean
}
const r6=(n:number)=>Math.round(n*1e6)/1e6
const finite=(x:number)=>Number.isFinite(x)
export function calculatePathDraftWorkV3(
  before:readonly SpatialRiderV3[],moves:readonly SpatialStepRiderV3[],
  roadByRider:ReadonlyMap<string,PackRoadV3>,
  finalLaneByRider?:ReadonlyMap<string,number>,
):readonly PathDraftExposureV3[]{
  if(before.length!==moves.length||new Set(before.map(x=>x.riderId)).size!==before.length||new Set(moves.map(x=>x.riderId)).size!==moves.length)throw Error('Invalid path draft roster')
  const start=new Map(before.map(r=>[r.riderId,r]))
  const end:SpatialRiderV3[]=moves.map(m=>{
    const original=start.get(m.riderId)
    if(!original||!finite(m.meters)||m.meters<original.meters||!finite(m.speedMps)||m.speedMps<0||m.speedMps>30||Math.abs(m.oldMeters-original.meters)>1e-4)throw Error('Invalid path draft trajectory')
    const lane=finalLaneByRider?.get(m.riderId)??m.lane
    if(!Number.isInteger(lane)||lane<0||lane>5||Math.abs(lane-original.lane)>1)throw Error('Invalid final physical lane')
    return {riderId:m.riderId,meters:m.meters,lane,desiredMps:m.speedMps,energy:original.energy}
  })
  const byEnd=new Map(end.map(r=>[r.riderId,r]))
  return moves.map(m=>{
    const r=start.get(m.riderId)!,after=byEnd.get(m.riderId)!,road=roadByRider.get(m.riderId)
    if(!road||!finite(road.gradePercent)||!finite(road.headwindMps??0)||!finite(road.crosswindMps??0))throw Error('Missing physical road conditions')
    const begin=calculateSpatialSlipstreamV3(r,before,road).fraction
    const finish=calculateSpatialSlipstreamV3(after,end,road).fraction
    const lateralChanged=after.lane!==r.lane
    // End-of-tick lane preparation is never retroactively effective. An
    // actual one-tick passing move receives at most a quarter end exposure.
    const pendingLane=finalLaneByRider?.get(m.riderId)!==undefined&&m.lane!==after.lane
    const endWeight=pendingLane?0:lateralChanged?.25:.5
    const integrated=begin*(1-endWeight)+finish*endWeight
    const startWatts=roadWattsRequiredV3(m.speedMps,83,.36*(1-begin),road)
    const pathWatts=roadWattsRequiredV3(m.speedMps,83,.36*(1-integrated),road)
    return {riderId:m.riderId,shelterAtStart:r6(begin),shelterAtEnd:r6(finish),integratedShelter:r6(integrated),
      wattsAtStartExposure:r6(startWatts),wattsWithPathExposure:r6(pathWatts),extraWattsFromExposureChange:r6(pathWatts-startWatts),lateralChanged}
  })
}
