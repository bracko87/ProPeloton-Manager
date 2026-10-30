/**
 * V4-only exact-source transform. Reconcile carried F bridge commentary with
 * observed low-energy C attachment at Phase-4 entry.
 * Do not mutate the original V2 source or relax strict replay validators.
 */
function once(source,from,to){
 if(source.split(from).length!==2)
  throw Error('V2 source drift: refuse ambiguous mountain bridge transform: '+from.slice(0,90))
 return source.replace(from,to)
}
export function patchV4MountainCarriedBridgeSource(source){
 const condition="    if (bridgeGroup.carriedFromPreviousPhase) {\n      eventDefinitions.push({\n        checkpointIdSuffix: \`bridge-carried-\${bridgeIndex + 1}\`,"
 const replacement=[
  "    const v4CarryCheckpointGroups=groupsAtKm(bridgeGroup.launchKm)",
  "    const v4CarryDecision=decideV4CarriedBridgeCheckpoint({",
  "      lineageId:bridgeGroup.lineageId,",
  "      displayCode:bridgeGroup.displayCode,",
  "      riderIds:bridgeGroup.riderIds",
  "    },v4CarryCheckpointGroups)",
  "    if (bridgeGroup.carriedFromPreviousPhase && v4CarryDecision.emitEvent) {",
  "      eventDefinitions.push({",
  "        checkpointIdSuffix: \`bridge-carried-\${bridgeIndex + 1}\`,"
 ].join('\n')
 source=once(source,condition,replacement)
 const eventBody="        riderIds: [...bridgeGroup.riderIds],\n        teamIds,\n        physicalLineageId: bridgeGroup.lineageId ?? null,\n        physicalSourceDisplayCode: bridgeGroup.sourceDisplayCode ?? null,\n        physicalLaunchKm: bridgeGroup.launchKm,\n        physicalMergeTargetDisplayCode: mergeTargetDisplayCode,\n      })\n    } else {\n      eventDefinitions.push({\n        checkpointIdSuffix: \`bridge-attack-\${bridgeIndex + 1}\`,"
 const eventReplacement=[
  "        riderIds: [...v4CarryDecision.activeRiderIds],",
  "        teamIds: [...new Set(v4CarryDecision.activeRiderIds.map(id=>riderById.get(id)?.teamId).filter(Boolean))].sort(),",
  "        physicalLineageId: bridgeGroup.lineageId ?? null,",
  "        physicalSourceDisplayCode: bridgeGroup.sourceDisplayCode ?? null,",
  "        physicalLaunchKm: bridgeGroup.launchKm,",
  "        physicalMergeTargetDisplayCode: mergeTargetDisplayCode,",
  "      })",
  "    } else if (!bridgeGroup.carriedFromPreviousPhase) {",
  "      eventDefinitions.push({",
  "        checkpointIdSuffix: \`bridge-attack-\${bridgeIndex + 1}\`,"
 ].join('\n')
 source=once(source,eventBody,eventReplacement)
 return "import {decideV4CarriedBridgeCheckpoint} from '../race-engine-v4/mountainBridgeCarryV4.ts'\n"+source
}
