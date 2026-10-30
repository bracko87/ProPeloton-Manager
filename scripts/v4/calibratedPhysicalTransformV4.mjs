/** V4-only calibrated source transforms, shared by stress and private historical runner. */
import {patchV4FinishTransitionSource} from './finishTransitionResearchPatchV4.mjs'
import {patchV4MountainCarriedBridgeSource} from './mountainBridgeCarryResearchPatchV4.mjs'
import {patchV4MountainBridgeCatchSource} from './mountainBridgeCatchResearchPatchV4.mjs'

const needle=(lines)=>lines.join('\n')
const bridgeNeedle="  const authoritativeBridgeGroups = phase4.bridgeGroups\n    .slice()\n    .sort("
const bridgeReplacement=needle([
 "  const authoritativeBridgeGroups = reconcileV4ReplayBridgeMergeTargets(",
 "    phase4.bridgeGroups,",
 "    { openingBreakawayCarriesIntoPhase4,",
 "      activeFrontDisplayCode:openingFrontDisplayCode,",
 "      mergeToleranceSeconds:PHASE5_GROUP_MERGE_TOLERANCE_SECONDS }",
 "  )",
 "    .slice()",
 "    .sort("
])
const paceNeedle=needle([
 "    physicalGapTrajectory.push({",
 "      kmFromStart: deterministicRound(stepEndKm, 6),",
 "      gapSeconds: deterministicRound(physicalCurrentGapSeconds, 6),",
 "    })"
])
const paceReplacement=needle([
 "    physicalGapTrajectory.push({",
 "      kmFromStart: deterministicRound(stepEndKm, 6),",
 "      gapSeconds: deterministicRound(physicalCurrentGapSeconds, 6),",
 "      v4ResearchPace: {",
 "        pelotonPaceKmh, escapePaceKmh,",
 "        selectedResponseMultiplier:response.selectedResponseMultiplier,",
 "        chaseAssets:phase3FiniteChaseAssets,",
 "        chasingTeamCount:physicalChasingTeamIds.length,",
 "        explicitChasingTeamCount:explicitPhase3ChasingTeamIds.length,",
 "        automaticChasingTeamCount:phase3AutomaticFinishInterestTeamIds.length,",
 "        gcThreatChasingTeamCount:phase3GcThreatTeamIds.length,",
 "        cooperationMultiplier:phase3DynamicCooperationMultiplier,",
 "        chaseInterestScore:response.chaseInterestScore,",
 "        chaseCapacityScore:response.chaseCapacityScore,",
 "        responseMode:response.responseMode",
 "      }",
 "    })"
])
const pelotonNeedle=needle([
 "        response.selectedResponseMultiplier *",
 "        // No organized chase: ordinary peloton tempo is not an active pursuit."
])
const pelotonReplacement=needle([
 "        (physicalChasingTeamIds.length>0",
 "          ? Math.max(response.selectedResponseMultiplier,1.015)",
 "          : response.selectedResponseMultiplier) *",
 "        // No organized chase: ordinary peloton tempo is not an active pursuit."
])
const cooperationNeedle="        : phase3DynamicCooperationMultiplier)"
const cooperationReplacement="        : 1 + (phase3DynamicCooperationMultiplier - 1) * 0.5)"
const energyNeedle="    const phaseEnergyCost = phaseEnergyCostByRiderId.get(row.riderId) ?? 0"
const energyReplacement="    const v4OriginalPhaseEnergyCost = phaseEnergyCostByRiderId.get(row.riderId) ?? 0\n    const v4PaceEnergySurcharge = calculateV4Phase3PaceEnergySurcharge({\n      riderId:row.riderId,\n      escapeRiderIds:physicalEscapeRiderIdsAtLaunch,\n      chasingRiderIds:phase3ChaseWorkerRows.map(({row})=>row.riderId),\n      baseEnergyCost:v4OriginalPhaseEnergyCost,\n      phaseStartKm:phaseBoundary.startKm,\n      samples:physicalGapTrajectory.map(sample=>({\n        kmFromStart:sample.kmFromStart,\n        referencePaceKmh:calculateRoadReferencePaceKmh(input.stage,sample.kmFromStart),\n        pelotonPaceKmh:sample.v4ResearchPace?.pelotonPaceKmh??null,\n        escapePaceKmh:sample.v4ResearchPace?.escapePaceKmh??null\n      }))\n    })\n    const phaseEnergyCost = deterministicRound(v4OriginalPhaseEnergyCost+v4PaceEnergySurcharge,6)"


const exact=(source,from,to)=>{
 if(source.split(from).length!==2)
  throw Error('V4 physical calibration source anchor changed or ambiguous')
 return source.replace(from,to)
}
export function patchV4CalibratedPhysicalSource(original,config){
 if(typeof original!=='string'||!config||
   typeof config.peloton!=='boolean'||typeof config.cooperation!=='boolean'||
   typeof config.energy!=='boolean'||(config.energy&&(!config.peloton||!config.cooperation)))
  throw Error('Invalid V4 calibrated physics configuration')
 let source=original
 source=exact(source,bridgeNeedle,bridgeReplacement)
 source=exact(source,paceNeedle,paceReplacement)
 if(source.split(pelotonNeedle).length!==2||
    source.split(cooperationNeedle).length!==2||
    source.split(energyNeedle).length!==2)
  throw Error('V4 physical calibration source drift')
 if(config.peloton)source=exact(source,pelotonNeedle,pelotonReplacement)
 if(config.cooperation)source=exact(source,cooperationNeedle,cooperationReplacement)
 if(config.energy)source=exact(source,energyNeedle,energyReplacement)
 return "import { reconcileV4ReplayBridgeMergeTargets } from '../race-engine-v4/bridgeHandoffV4.ts'\n"+
  "import {calculateV4Phase3PaceEnergySurcharge} from '../race-engine-v4/phase3PaceEnergyV4.ts'\n"+
  patchV4MountainBridgeCatchSource(
   patchV4MountainCarriedBridgeSource(
    patchV4FinishTransitionSource(source)))
}
