/**
 * RESEARCH ONLY: a continuous, isolated alternative for physical following.
 * This component is NOT wired into the V3 simulator or any production worker.
 * It must pass multi-roster sporting calibration before integration.
 *
 * Unlike the current cliff at 24 metres, proximity affects support smoothly.
 * Following a rider making a deliberate attack cannot automatically grant
 * that attack's full acceleration to riders who merely selected 'follow'.
 */
export interface SlipstreamCandidateV3Input {
  readonly ownUnassistedSpeedMps: number
  readonly frontSpeedMps: number
  readonly gapMeters: number
  readonly gradePercent: number
  readonly crosswindKph: number
  readonly wetness: number
  readonly cobbled: boolean
  readonly liveEnergy: number
  readonly leaderAttacking: boolean
  readonly followerChasing: boolean
}
export interface SlipstreamCandidateV3Output {
  readonly proposedSpeedMps: number
  readonly aerodynamicShelter: number
  readonly proximity: number
  readonly attackFollowingFactor: number
  readonly supportedMaximumMps: number
}
const clamp = (n:number, lo:number, hi:number) => Math.min(hi,Math.max(lo,n))
/** Pure deterministic kinematic suggestion; the energy solver remains authoritative. */
export function calculateSlipstreamResponseCandidateV3(i:SlipstreamCandidateV3Input):SlipstreamCandidateV3Output {
  for(const x of [i.ownUnassistedSpeedMps,i.frontSpeedMps,i.gapMeters,i.gradePercent,i.crosswindKph,i.wetness,i.liveEnergy]){
    if(!Number.isFinite(x))throw Error('Non-finite physical input')
  }
  if(i.ownUnassistedSpeedMps<=0||i.frontSpeedMps<0||i.gapMeters<0||i.gradePercent< -22||i.gradePercent>22||i.crosswindKph<0||i.crosswindKph>120||i.wetness<0||i.wetness>1||i.liveEnergy<0||i.liveEnergy>1)throw Error('Physical input outside supported bounds')
  const gradientShelter=clamp(1-Math.max(0,i.gradePercent)/8,0,1)
  const crosswindShelter=clamp(1-i.crosswindKph/44,.12,1)
  const surfaceShelter=i.cobbled?.48:1
  const aerodynamicShelter=gradientShelter*crosswindShelter*surfaceShelter
  // Smooth from close wheels to physically disconnected riders. No magic 24m cliff.
  const proximity=1/(1+Math.pow(i.gapMeters/16,2))
  const energyConstraint=.45+.55*i.liveEnergy
  const supportedMaximumMps=i.ownUnassistedSpeedMps*(1+.18*aerodynamicShelter*energyConstraint)
  const attackFollowingFactor=i.leaderAttacking&&!i.followerChasing?.22:1
  const headroom=Math.max(0,Math.min(i.frontSpeedMps,supportedMaximumMps)-i.ownUnassistedSpeedMps)
  const closeGapAllowance=Math.min(.12,Math.max(0,i.gapMeters)*.008)
  const gain=Math.max(0,headroom+Math.min(closeGapAllowance,Math.max(0,supportedMaximumMps-i.ownUnassistedSpeedMps-headroom)))
  const proposedSpeedMps=Math.min(supportedMaximumMps,i.ownUnassistedSpeedMps+gain*proximity*attackFollowingFactor)
  return {proposedSpeedMps,aerodynamicShelter,proximity,attackFollowingFactor,supportedMaximumMps}
}
