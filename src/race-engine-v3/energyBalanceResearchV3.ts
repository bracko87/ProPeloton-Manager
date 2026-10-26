/** Research-only W-prime accounting. NOT routed to official races.
 * Critical watts and metabolic efficiency are PROVISIONAL.
 */
export interface ResearchEnergyConfigV3 {
 readonly criticalWatts:number;readonly wPrimeJoules:number;readonly efficiency?:number;readonly initialWPrimeJoules?:number
}
export interface ResearchEnergyStateV3 {
 readonly criticalWatts:number;readonly wPrimeJoules:number;readonly efficiency:number;
 readonly remainingWPrimeJoules:number;readonly cumulativeMechanicalJoules:number;
 readonly cumulativeMetabolicJoules:number;readonly cumulativeSupraCriticalJoules:number;
 readonly cumulativeRecoveredWPrimeJoules:number;readonly seconds:number
}
export type ResearchEnergyStepV3={readonly accepted:true;readonly state:ResearchEnergyStateV3}|{readonly accepted:false;readonly maxSustainableWattsThisStep:number;readonly state:ResearchEnergyStateV3}
const finite=(x:number,name:string):number=>{if(!Number.isFinite(x))throw Error('Invalid '+name);return x}
const clamp=(x:number,a:number,b:number):number=>Math.min(b,Math.max(a,x))
export function initializeEnergyBalanceResearchV3(config:ResearchEnergyConfigV3):ResearchEnergyStateV3{
 const {criticalWatts,wPrimeJoules,efficiency=.23,initialWPrimeJoules=wPrimeJoules}=config
 finite(criticalWatts,'criticalWatts');finite(wPrimeJoules,'wPrimeJoules');finite(efficiency,'efficiency');finite(initialWPrimeJoules,'initialWPrimeJoules')
 if(criticalWatts<70||criticalWatts>550||wPrimeJoules<1000||wPrimeJoules>100000||efficiency<.15||efficiency>.3||initialWPrimeJoules<0||initialWPrimeJoules>wPrimeJoules)throw Error('Invalid rider configuration')
 return {criticalWatts,wPrimeJoules,efficiency,remainingWPrimeJoules:initialWPrimeJoules,cumulativeMechanicalJoules:0,cumulativeMetabolicJoules:0,cumulativeSupraCriticalJoules:0,cumulativeRecoveredWPrimeJoules:0,seconds:0}
}
export function advanceEnergyBalanceResearchV3(state:ResearchEnergyStateV3,actualMechanicalWatts:number,seconds:number,recoveryTauSeconds=300):ResearchEnergyStepV3{
 finite(actualMechanicalWatts,'actualMechanicalWatts');finite(seconds,'seconds');finite(recoveryTauSeconds,'recoveryTauSeconds')
 if(actualMechanicalWatts<0||actualMechanicalWatts>12000||seconds<=0||seconds>30||recoveryTauSeconds<30||recoveryTauSeconds>3600)throw Error('Invalid step')
 const fields=[state.criticalWatts,state.wPrimeJoules,state.efficiency,state.remainingWPrimeJoules,state.cumulativeMechanicalJoules,state.cumulativeMetabolicJoules,state.cumulativeSupraCriticalJoules,state.cumulativeRecoveredWPrimeJoules,state.seconds]
 if(!fields.every(Number.isFinite)||state.criticalWatts<70||state.criticalWatts>550||state.wPrimeJoules<1000||state.wPrimeJoules>100000||state.efficiency<.15||state.efficiency>.3||state.remainingWPrimeJoules<0||state.remainingWPrimeJoules>state.wPrimeJoules||fields.slice(4).some(x=>x<0))throw Error('Invalid checkpoint')
 const above=Math.max(0,actualMechanicalWatts-state.criticalWatts)*seconds
 if(above>state.remainingWPrimeJoules+1e-7)return {accepted:false,maxSustainableWattsThisStep:state.criticalWatts+state.remainingWPrimeJoules/seconds,state}
 const recovered=actualMechanicalWatts<state.criticalWatts?(state.wPrimeJoules-state.remainingWPrimeJoules)*(1-Math.exp(-(state.criticalWatts-actualMechanicalWatts)/state.criticalWatts*seconds/recoveryTauSeconds)):0
 return {accepted:true,state:{...state,remainingWPrimeJoules:clamp(state.remainingWPrimeJoules-above+recovered,0,state.wPrimeJoules),cumulativeMechanicalJoules:state.cumulativeMechanicalJoules+actualMechanicalWatts*seconds,cumulativeMetabolicJoules:state.cumulativeMetabolicJoules+actualMechanicalWatts*seconds/state.efficiency,cumulativeSupraCriticalJoules:state.cumulativeSupraCriticalJoules+above,cumulativeRecoveredWPrimeJoules:state.cumulativeRecoveredWPrimeJoules+recovered,seconds:state.seconds+seconds}}
}
export function boundRequestedSpeedByEnergyV3(state:ResearchEnergyStateV3,seconds:number,requestedSpeed:number,powerAtSpeed:(speed:number)=>number):number{
 finite(requestedSpeed,'requestedSpeed')
 if(requestedSpeed<0||requestedSpeed>50)throw Error('Invalid desired road speed')
 const powerAtZero=finite(powerAtSpeed(0),'zero-speed power')
 const powerAtTop=finite(powerAtSpeed(requestedSpeed),'desired-speed power')
 if(powerAtZero<0||powerAtTop<powerAtZero||powerAtTop>120000)throw Error('Invalid road power curve')
 advanceEnergyBalanceResearchV3(state,0,seconds)
 const maxWatts=state.criticalWatts+state.remainingWPrimeJoules/seconds
 if(powerAtTop<=maxWatts)return requestedSpeed
 if(powerAtZero>maxWatts)throw Error('Unattainable road power at zero speed')
 let lo=0,hi=requestedSpeed
 for(let i=0;i<42;i++){
  const mid=(lo+hi)/2,watts=finite(powerAtSpeed(mid),'speed-dependent power')
  if(watts<0||watts>120000)throw Error('Invalid road power curve')
  if(watts>maxWatts)hi=mid;else lo=mid
 }
 return lo
}
export function commitAchievedSpeedEnergyV3(state:ResearchEnergyStateV3,seconds:number,achievedSpeed:number,powerAtSpeed:(speed:number)=>number):ResearchEnergyStateV3{
 finite(achievedSpeed,'achievedSpeed');if(achievedSpeed<0||achievedSpeed>50)throw Error('Invalid achieved speed')
 const step=advanceEnergyBalanceResearchV3(state,finite(powerAtSpeed(achievedSpeed),'achieved watts'),seconds)
 if(!step.accepted)throw Error('Motion exceeded research rider energy budget; recalculate motion')
 return step.state
}
