/**
 * Research-only source patch. Anchored inside replay timeline construction,
 * before winner-finish versus final membership transitions are published.
 */
const anchor='    const beforeCodes = displayCodeByRiderId(preFinishPublishedDefinition.groups)'
export function patchV4ChaseContactResearchSource(source){
 if(typeof source!=='string'||source.split(anchor).length!==2)
  throw Error('V4 chase contact winner anchor drift: fail closed')
 const addition=[
  "    if (input.stage.terrainType === 'mountain' && stageDistanceKm >= 200 &&",
  "        winnerFinishDefinitionIndex >= 0) {",
  "      const winner = eventDefinitions[winnerFinishDefinitionIndex]",
  "      eventDefinitions[winnerFinishDefinitionIndex] = {",
  "        ...winner,",
  "        groups: reconcileV4WinnerChaseContact(",
  "          normalizeReplayGroups(preFinishPublishedDefinition.groups),",
  "          winner.groups, finalGroups, PHASE5_GROUP_MERGE_TOLERANCE_SECONDS),",
  "      }",
  "    }",
 ].join('\n')
 return "import {reconcileV4WinnerChaseContact} from '../race-engine-v4/mountainChaseContactCohesionV4.mjs'\n"+
  source.replace(anchor,addition+'\n'+anchor)
}
