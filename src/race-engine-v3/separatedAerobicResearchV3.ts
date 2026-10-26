/** OFFLINE candidate. W-prime must not automatically derate critical aerobic watts.
 * A separate finite W-prime cap still restricts transient above-critical work.
 * Chronic fatigue and measured physiological calibration remain future work.
 */
export function separatedAerobicPeakPowerV3(criticalWatts:number):number{
 if(!Number.isFinite(criticalWatts)||criticalWatts<70||criticalWatts>550)throw Error('Invalid provisional critical watts')
 return criticalWatts*1.5
}
