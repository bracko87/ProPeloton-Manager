/**
 * Research-only continuous reserve envelope. Converts dwindling anaerobic
 * reserve into a gradual sustainable-power derate, never a binary hard cutoff.
 * Coefficients are provisional and MUST NOT be used for official racing.
 */
export interface FatigueEnvelopeV3 {
  readonly energy: number
  readonly multiplier: number
  readonly peakDeliverableWatts: number
}
const clamp=(x:number,a:number,b:number)=>Math.min(b,Math.max(a,x))
export function fatiguePowerEnvelopeV3(energy:number,sustainableWatts:number):FatigueEnvelopeV3 {
  if(!Number.isFinite(energy)||energy<0||energy>1)throw Error('Invalid energy reserve')
  if(!Number.isFinite(sustainableWatts)||sustainableWatts<70||sustainableWatts>550)throw Error('Invalid sustainable watts')
  // Smoothstep across the final 20% of stored reserve. No binary 13%
  // cutoff: a fresh rider may temporarily output up to 150% sustained power;
  // a depleted rider falls gradually to 80%. Coefficients uncalibrated.
  const x=clamp(energy/.2,0,1)
  const easing=x*x*(3-2*x)
  const multiplier=.8+.7*easing
  return {energy,multiplier,peakDeliverableWatts:sustainableWatts*multiplier}
}
