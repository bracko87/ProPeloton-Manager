/**
 * Exact V4-only research transform: respect authoritative physical C/P
 * attachment at a Phase-4 bridge catch kilometre.
 * Never modifies V2 files or strict replay validation.
 */
function replaceExact(source,from,to){
 if(source.split(from).length!==2)throw Error('V2 bridge catch source changed, refuse fuzzy V4 transform')
 return source.replace(from,to)
}
export function patchV4MountainBridgeCatchSource(input){
 let source=input
 const oldHeader=[
  "    if (",
  "      bridgeGroup.caughtByPeloton &&",
  "      bridgeGroup.catchKm !== null",
  "    ) {",
  "      const caughtRiderIds = phase4BridgeRiderIdsAtKm(",
  "        bridgeGroup,",
  "        bridgeGroup.catchKm,",
  "      )"
 ].join('\n')
 const newHeader=[
  "    const v4PhysicalBridgeCaughtRiderIds =",
  "      bridgeGroup.caughtByPeloton && bridgeGroup.catchKm !== null",
  "        ? physicallyCaughtBridgeRiderIds(",
  "            phase4BridgeRiderIdsAtKm(bridgeGroup,bridgeGroup.catchKm),",
  "            groupsAtKm(bridgeGroup.catchKm),",
  "          )",
  "        : []",
  "    if (",
  "      bridgeGroup.caughtByPeloton &&",
  "      bridgeGroup.catchKm !== null &&",
  "      v4PhysicalBridgeCaughtRiderIds.length > 0",
  "    ) {",
  "      const caughtRiderIds = v4PhysicalBridgeCaughtRiderIds"
 ].join('\n')
 source=replaceExact(source,oldHeader,newHeader)
 source=replaceExact(source,
  "        groups: applyReplayFrontCatchCommits(\n          phase4PreTransitionGroupsAt(bridgeGroup.catchKm),\n          phase4CatchCommitsAt(bridgeGroup.catchKm, bridgeIndex),\n        ),",
  "        groups: groupsAtKm(bridgeGroup.catchKm),")
 // Catch entry's evidence must match its actually-caught rider IDs.
 const eventOld=[
 "        description: \`\${bridgeDisplayCode} is reabsorbed by the peloton at kilometre \${deterministicRound(bridgeGroup.catchKm, 1)}.\`,",
 "        riderIds: [...bridgeGroup.riderIds],",
 "        teamIds,"
 ].join('\n')
 const eventNew=[
 "        description: \`\${bridgeDisplayCode} is reabsorbed by the peloton at kilometre \${deterministicRound(bridgeGroup.catchKm, 1)}.\`,",
 "        riderIds: caughtRiderIds,",
 "        teamIds: caughtTeamIds,"
 ].join('\n')
 source=replaceExact(source,eventOld,eventNew)
 return "import {physicallyCaughtBridgeRiderIds} from '../race-engine-v4/mountainBridgeCatchV4.ts'\n"+source
}
