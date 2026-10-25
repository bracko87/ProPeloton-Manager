/**
 * Independent research-only mapping from ProPeloton rider attributes to
 * provisional mechanical power. NOT a measured or approved physiological model.
 * Source values must be supplied to make a production-input claim. The
 * fallback exists ONLY for historical de-identified research CSV fixtures.
 */
import type {PackPowerRiderV3,PowerTacticV3} from './pelotonPowerBalanceV3.ts'
export type PowerInputQualityV3='source_snapshot'|'research_proxy'
export interface RiderAttributePowerV3 {
 readonly riderId:string
 readonly flat:number
 readonly climbing:number
 readonly endurance:number
 readonly resistance:number
 readonly fatigueBeforeStage:number
 readonly startStamina?:number
 readonly raceSharpness?:number
 readonly recovery?:number
 readonly morale?:number
 readonly equipmentStagePerformancePct?:number
 readonly inStageEnergyCostMultiplier?:number
}
export interface RiderPowerProjectionV3 extends PackPowerRiderV3 {
 readonly inputQuality:PowerInputQualityV3
 readonly modelVersion:'v3_power_proxy_01'
 readonly transientWatts:number
 readonly energyCostScale:number
 readonly assumptions:readonly string[]
}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v))
const fixed=(x:number)=>Math.round(x*1e6)/1e6
const bounded=(v:number,min:number,max:number,field:string)=>{
 if(!Number.isFinite(v)||v<min||v>max)throw Error('Invalid '+field)
 return v
}
/** Grade changes which skill combination limits continuous mechanical work. */
export function projectRiderPowerV3(
 rider:RiderAttributePowerV3,
 gradePercent:number,
 tactic:PowerTacticV3='follow',
 allowResearchProxy=false,
):RiderPowerProjectionV3 {
 if(!rider.riderId)throw Error('Missing rider')
 const flat=bounded(rider.flat,0,100,'flat')
 const climb=bounded(rider.climbing,0,100,'climbing')
 const endurance=bounded(rider.endurance,0,100,'endurance')
 const resistance=bounded(rider.resistance,0,100,'resistance')
 const fatigue=bounded(rider.fatigueBeforeStage,0,100,'fatigue')
 const grade=bounded(gradePercent,-22,22,'grade')
 if(!['follow','tempo','attack','chase','recover'].includes(tactic))throw Error('Invalid tactic')
 const absent=['startStamina','raceSharpness','recovery','morale','equipmentStagePerformancePct','inStageEnergyCostMultiplier'].filter(k=>rider[k as keyof RiderAttributePowerV3]===undefined)
 if(absent.length&&!allowResearchProxy)throw Error('Missing physical source attributes: '+absent.join(','))
 const source=absent.length===0
 const sharp=bounded(rider.raceSharpness??50,0,100,'race sharpness')
 const recovery=bounded(rider.recovery??endurance,0,100,'recovery')
 const morale=bounded(rider.morale??75,0,100,'morale')
 const start=bounded(rider.startStamina??clamp(100-fatigue*.45,40,100),0,100,'start stamina')
 const equip=bounded(rider.equipmentStagePerformancePct??0,-15,15,'equipment performance')
 const costScale=bounded(rider.inStageEnergyCostMultiplier??1,.5,2,'energy cost multiplier')
 const climbWeight=clamp((grade-1)/7,0,1)
 const flatSkill=flat*.7+resistance*.15+endurance*.15
 const climbSkill=climb*.7+resistance*.1+endurance*.2
 const weightedSkill=(1-climbWeight)*flatSkill+climbWeight*climbSkill
 // Training-market calibration inputs are not measured here. These bounds are
 // explicit so a future evidence-based calibration can replace them safely.
 const referenceWatts=210+2.25*(weightedSkill-50)+.55*(endurance-50)
 const fatigueFactor=1-.001*Math.max(0,fatigue-30)
 const sharpFactor=.92+.0016*sharp
 const moraleFactor=.975+.0005*morale
 const equipmentFactor=1+equip/100
 const recoveryFactor=.98+.0004*recovery
 const sustainableWatts=fixed(clamp(referenceWatts*fatigueFactor*sharpFactor*moraleFactor*equipmentFactor*recoveryFactor,70,550))
 // Starting stamina, not chronic fatigue, is the current attack reserve. It
 // remains separate from work done during a simulated race.
 const energy=fixed(clamp(start/100,0,1))
 return {
  modelVersion:'v3_power_proxy_01',riderId:rider.riderId,tactic,
  sustainableWatts,energy,massKg:83,transientWatts:fixed(sustainableWatts*.25*clamp((energy-.27)/.73,0,1)),
  energyCostScale:costScale,
  inputQuality:source?'source_snapshot':'research_proxy',
  assumptions:source?['Provisional watts: no measured power or rider+bike mass']:
  ['Missing rider source values replaced by research-only stand-ins','Provisional watts: no measured power or rider+bike mass'],
 }
}
