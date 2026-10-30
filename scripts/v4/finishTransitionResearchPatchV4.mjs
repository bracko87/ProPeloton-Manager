/**
 * V4-only temporary research-bundle patch for finish-group classification.
 * Deliberately exact anchored; rejects all source drift. Never edits V2.
 * The existing strict replay validator, finish classification and energy
 * calculations are left untouched.
 */
const replaceExact=(source,from,to)=>{
 if(source.split(from).length!==2)
  throw Error('V2 final finish source changed; refuse fuzzy V4 research patch: '+from.slice(0,90))
 return source.replace(from,to)
}
export function patchV4FinishTransitionSource(original){
 let source=original
 const physicalFrontNeedle="  const actualContenderIds =\n    contenderRiderIds.length > 0\n      ? contenderRiderIds\n      : provisionalRiderStates\n          .filter((state) => phase3.finishEligibleRiderIds.includes(state.riderId))"
 const physicalFrontReplacement="  const v4PhysicalFrontFinishFallback = selectV4PhysicalFrontFinishFallback({\n    physicalFrontRiderIds: winningGroup.riderIds,\n    finishEligibleRiderIds: phase3.finishEligibleRiderIds,\n    riderFinishStates: provisionalRiderStates,\n    groupingToleranceSeconds: PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,\n  })\n  const actualContenderIds =\n    contenderRiderIds.length > 0\n      ? contenderRiderIds\n      : v4PhysicalFrontFinishFallback.length > 0\n        ? v4PhysicalFrontFinishFallback\n        : provisionalRiderStates\n          .filter((state) => phase3.finishEligibleRiderIds.includes(state.riderId))"
 source=replaceExact(source,physicalFrontNeedle,physicalFrontReplacement)
 const begin="    if (finalTransitionRiderIds.length > 0) {\n      eventDefinitions.push({"
 const decision=[
  "    const v4FinishTransition = reconcileV4FinishTransition({",
  "      allTransitionsAreFrontCaughtByPeloton,",
  "      changedRiderIds:finalTransitionRiderIds,",
  "      finalDisplayCodes:finalGroups.map(group=>group.displayCode),",
  "      bridgeGroups:phase4.bridgeGroups,",
  "      breakawaySurvived:phase4.breakawaySurvived,",
  "      breakawayCaught:phase4.breakawayCaught,",
  "      physicalEndGapSeconds:phase4.endGapSeconds,",
  "      officialFinishGroupingToleranceSeconds:PHASE5_GROUP_MERGE_TOLERANCE_SECONDS",
  "    })",
  begin
 ].join('\n')
 source=replaceExact(source,begin,decision)
 source=replaceExact(source,
  "        checkpointIdSuffix: 'finish-group-transition',\n        checkpointKind: 'event',\n        phase: 4,\n        kmFromStart: stageDistanceKm,\n        sortOrder: 990,\n        groups: finalGroups,",
  "        checkpointIdSuffix: 'finish-group-transition',\n        checkpointKind: 'event',\n        phase: 4,\n        kmFromStart: stageDistanceKm,\n        sortOrder: 990,\n        groups: v4FinishTransition.usePhysicalPelotonGapAtTransition\n          ? adjustGroupsToPelotonGap(finalGroups,phase4.endGapSeconds)\n          : finalGroups,")
 source=replaceExact(source,
  "        eventType: allTransitionsAreFrontCaughtByPeloton ? 'catch' : 'group_split',",
  "        eventType: v4FinishTransition.eventType,")
 source=replaceExact(source,
  "        title: allTransitionsAreFrontCaughtByPeloton ? 'Front group caught on the line' : 'Final gaps open on the line',",
  "        title: v4FinishTransition.title,")
 const catchIndexNeedle = [
  "      const laterFrontExists = replayTimeline.checkpoints",
  "        .slice(candidateIndex + 1)"
 ].join('\n')
 const catchIndexReplacement = [
  "      // A partial finish-line F-to-P grouping is not a TERMINAL catch",
  "      // while a B/F front still physically leads at that checkpoint.",
  "      // Full terminal catches retain the untouched strict post-catch checks.",
  "      const survivingFrontAtCatch = replayTimeline.checkpoints[candidateIndex].groups",
  "        .some(group=>group.displayCode.startsWith('B') || group.displayCode.startsWith('F'))",
  "      const laterFrontExists = replayTimeline.checkpoints",
  "        .slice(candidateIndex + 1)"
 ].join('\n')
 source=replaceExact(source,catchIndexNeedle,catchIndexReplacement)
 source=replaceExact(source,
  "      return laterFrontExists ? terminalIndex : candidateIndex",
  "      return (survivingFrontAtCatch || laterFrontExists) ? terminalIndex : candidateIndex")
 return "import { reconcileV4FinishTransition, selectV4PhysicalFrontFinishFallback } from '../race-engine-v4/finishTransitionV4.ts'\n"+source
}
