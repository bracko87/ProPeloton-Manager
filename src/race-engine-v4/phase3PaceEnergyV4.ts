/**
 * V4 research-only Phase-3 aerodynamic effort sensitivity.
 *
 * Faster riding costs more energy per distance at fixed terrain/conditions:
 * aerodynamic work per km scales approximately with squared road speed.
 * This is a bounded relative surcharge on the EXISTING modeled phase energy,
 * NOT a claimed physiological watt/power meter. It is only charged to riders
 * explicitly carrying the lead or documented as active chase workers.
 * The penalty is applied after the Phase-3 trace (affects Phase-4 readiness),
 * and therefore does NOT falsely claim to feed back into Phase-3 speeds.
 */
export interface V4PaceEnergySample{
 readonly kmFromStart:number
 readonly pelotonPaceKmh:number|null
 readonly escapePaceKmh:number|null
 readonly referencePaceKmh:number
}
export interface V4PaceEnergyRequest {
 readonly riderId:string
 readonly escapeRiderIds:readonly string[]
 readonly chasingRiderIds:readonly string[]
 readonly baseEnergyCost:number
 readonly phaseStartKm:number
 readonly samples:readonly V4PaceEnergySample[]
}
/** Extra Phase-3 energy units. Positive, finite, capped at 15% of base cost. */
export function calculateV4Phase3PaceEnergySurcharge(request:V4PaceEnergyRequest):number {
 const {riderId,escapeRiderIds,chasingRiderIds,samples,phaseStartKm,baseEnergyCost}=request
 const isEscape=escapeRiderIds.includes(riderId)
 const isChaser=!isEscape&&chasingRiderIds.includes(riderId)
 if(!Number.isFinite(baseEnergyCost)||baseEnergyCost<0||
  !Number.isFinite(phaseStartKm)||phaseStartKm<0)
  throw Error('V4 pace energy requires nonnegative finite inputs')
 if(!isEscape&&!isChaser||baseEnergyCost===0||samples.length===0)return 0
 let weighted=0,distance=0,previousKm=phaseStartKm
 for(const sample of samples){
  const nextKm=sample.kmFromStart
  if(!Number.isFinite(nextKm)||nextKm<previousKm-0.0000001||
   !Number.isFinite(sample.referencePaceKmh)||sample.referencePaceKmh<=0)
   throw Error('V4 pace energy requires an ordered physical trace')
  const speed=isEscape?sample.escapePaceKmh:sample.pelotonPaceKmh
  if(speed!==null&&(!Number.isFinite(speed)||speed<=0))
   throw Error('V4 pace energy requires positive measured speed')
  const d=nextKm-previousKm
  if(d>0&&speed!==null){
   // Pace increment relative to the SAME terrain and wind reference.
   // Square-speed estimate represents drag work per distance, not power.
   const pressure=Math.min(0.4,Math.max(0,(speed/sample.referencePaceKmh)**2-1))
   // Escape riders carry exposed wind; chase workers draft/rotate.
   weighted+=d*pressure*(isEscape?0.50:0.35)
   distance+=d
  }
  previousKm=nextKm
 }
 if(distance===0)return 0
 const fractional=Math.min(0.15,weighted/distance)
 return Number((baseEnergyCost*fractional).toFixed(6))
}
