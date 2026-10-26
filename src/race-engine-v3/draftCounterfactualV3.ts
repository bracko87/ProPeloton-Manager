/** OFFLINE ONLY: mechanics at an unchanged achieved speed for 0/50/100% shelter. */
import {roadWattsRequiredV3,type PackRoadV3} from './pelotonPowerBalanceV3.ts'
export type ShelterFactorV3=0|0.5|1
export function draftCounterfactualWattsV3(speed:number,shelter:number,road:PackRoadV3,factor:ShelterFactorV3,baselinePathWatts?:number):number{
 if(![0,.5,1].includes(factor)||!Number.isFinite(speed)||speed<0||speed>30||!Number.isFinite(shelter)||shelter<0||shelter>.55)throw Error('Invalid offline shelter counterfactual')
 if(baselinePathWatts!==undefined&&(!Number.isFinite(baselinePathWatts)||baselinePathWatts<0))throw Error('Invalid path-watts baseline')
 if(factor===1&&baselinePathWatts!==undefined)return baselinePathWatts
 return roadWattsRequiredV3(speed,83,.36*(1-factor*shelter),road)
}
