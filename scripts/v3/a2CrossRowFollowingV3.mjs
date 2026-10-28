/** A74: research-only adjacent-row speed-dependent following reserve.
 * Inputs are present kinematics and physical lateral positions, never
 * rider IDs, fictional future A44 accepted trajectories, or test time.
 * This returns a requested gap only; full solver retains all collision,
 * road edge and bounded acceleration authority.
 */
const check=(p,m)=>{if(!p)throw Error(m)}
export function adjacentLaneStoppingReserveV3(rear,lead,{
 mode='selective',baseGapM=3.2,lateralContactM=.8,
 maxBrakeMps2=.85
}={}){
 check(['selective','gentle'].includes(mode)&&
  [rear.x,rear.y,rear.v,lead.x,lead.y,lead.v,
   baseGapM,lateralContactM,maxBrakeMps2].every(Number.isFinite)&&
  rear.v>=0&&lead.v>=0&&maxBrakeMps2>0&&maxBrakeMps2<=2&&
  baseGapM>=2.05&&baseGapM<=5,
  'A74 invalid current cross-row state or safety limits')
 const dx=lead.x-rear.x
 const dy=Math.abs(lead.y-rear.y)
 const approach=rear.v-lead.v
 // Avoid arbitrary buffer penalties to riders who are in wholly different
 // lateral tracks, already pulling away, or nearly centred in one track.
 const overlappingAdjacent=dx>0&&dx<=15&&
  dy>=.50-1e-7&&dy<=lateralContactM+.03
 if(!overlappingAdjacent||approach<=0)
  return {active:false,gapM:baseGapM,closingMps:Math.max(0,approach),
   lateralGapM:dy,requiredStoppingM:0}
 const conservativeClosing=approach
 const stoppingDelta=conservativeClosing*conservativeClosing/(2*maxBrakeMps2)
 // Physical stop reserve includes speed-relative time headway, not a
 // discontinuous full-brake command. Gentle/standard compare identically
 // except ahead-of-contact time allowance.
 const timeAllowance=mode==='gentle'?.85:1.55
 const physicalRequired=2.35+timeAllowance*conservativeClosing+stoppingDelta
 const gapM=Math.max(baseGapM,physicalRequired)
 return {active:gapM>baseGapM+1e-8,
  gapM,closingMps:conservativeClosing,lateralGapM:dy,
  requiredStoppingM:stoppingDelta,mode}
}
