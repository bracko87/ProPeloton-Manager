/**
 * V4 isolated-research replay construction only.
 *
 * An actual Phase-2 secondary front can physically merge into B1. The
 * production replay currently emits only the post-merge checkpoint, which
 * leaves the strict physical bridge validator without a same-kilometre
 * source-front contact witness. Emit that witness ONLY when the authoritative
 * pre-transition physical groups independently confirm contact <= tolerance.
 *
 * Also use the already-reconciled authoritative Phase-4 bridge list for
 * event construction. The original worker/simulator remains unchanged.
 */
const exactlyOnce=(source,needle,replacement)=>{
 if(typeof source!=='string'||source.split(needle).length!==2)
  throw Error('V4 physical bridge replay source anchor changed or ambiguous')
 return source.replace(needle,replacement)
}
export function patchV4PhysicalBridgeContactReplaySource(original){
 let source=original
 const old=String.raw`  if (phase2.secondaryFrontMergeKm !== null) {
    eventDefinitions.push({
      checkpointIdSuffix: 'phase-2-secondary-front-merge',`;
 const replacement=String.raw`  if (phase2.secondaryFrontMergeKm !== null) {
    // The F/B partition immediately BEFORE the recorded merge is used
    // only to identify actual riders. Its displayed gap is deliberately
    // greater than five seconds to keep F and B separate, even though the
    // *physical* terminal merge sample closes the gap to zero. Validate
    // the same exact-km physical sample before publishing contact.
    const v4Phase2MergeKm = phase2.secondaryFrontMergeKm
    const v4Phase2BeforeGroups = groupsAtKm(
      Math.max(
        phase2.secondaryFrontLaunchKm ?? 0,
        v4Phase2MergeKm - 0.00001,
      ),
    )
    const v4Phase2AfterGroups = groupsAtKm(v4Phase2MergeKm)
    const v4Phase2BeforeSource = v4Phase2BeforeGroups.find(
      (group) => group.displayCode === 'F1',
    )
    const v4Phase2BeforeTarget = v4Phase2BeforeGroups.find(
      (group) => group.displayCode === 'B1',
    )
    const v4Phase2AfterTarget = v4Phase2AfterGroups.find(
      (group) => group.displayCode === 'B1',
    )
    const v4Phase2MergeSample = phase2.secondaryFrontGapTrajectory.find(
      (sample) =>
        Math.abs(sample.kmFromStart - v4Phase2MergeKm) <= 0.000001,
    )
    const v4Phase2ActualMergedRiderIds =
      v4Phase2BeforeTarget && v4Phase2AfterTarget
        ? v4Phase2AfterTarget.riderIds.filter(
            (id) => !v4Phase2BeforeTarget.riderIds.includes(id),
          ).sort()
        : []
    const v4Phase2SourceMatchesActualMerge =
      v4Phase2BeforeSource !== undefined &&
      v4Phase2ActualMergedRiderIds.length > 0 &&
      v4Phase2ActualMergedRiderIds.every((id) =>
        v4Phase2BeforeSource.riderIds.includes(id),
      ) &&
      v4Phase2BeforeTarget !== undefined &&
      v4Phase2AfterTarget !== undefined &&
      v4Phase2BeforeTarget.riderIds.every((id) =>
        v4Phase2AfterTarget.riderIds.includes(id),
      )
    // Only exact physical contact (0..5s) in FRONT of P is accepted.
    const v4Phase2BridgeContactVerified =
      v4Phase2SourceMatchesActualMerge &&
      v4Phase2MergeSample !== undefined &&
      Number.isFinite(v4Phase2MergeSample.gapToLeaderSeconds) &&
      Number.isFinite(v4Phase2MergeSample.gapToPelotonSeconds) &&
      v4Phase2MergeSample.gapToLeaderSeconds >= -0.000001 &&
      v4Phase2MergeSample.gapToLeaderSeconds <=
        PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 0.000001 &&
      v4Phase2MergeSample.gapToPelotonSeconds >
        PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 0.000001
    if (v4Phase2BridgeContactVerified) {
      const v4Phase2ContactGroups = v4Phase2BeforeGroups.map((group) =>
        group.displayCode === 'F1'
          ? {
              ...group,
              // Exact contact physical gap, NOT the pre-merge rendering floor.
              gapSeconds: Math.max(0, v4Phase2MergeSample!.gapToLeaderSeconds),
              physicalLineageId: 'v4-phase2-secondary-front',
            }
          : group.displayCode === 'P'
            ? {
                ...group,
                gapSeconds: v4Phase2MergeSample!.gapToPelotonSeconds,
              }
            : group,
      )
      eventDefinitions.push({
        checkpointIdSuffix: 'phase-2-secondary-front-contact',
        checkpointKind: 'event',
        phase: 2,
        kmFromStart: v4Phase2MergeKm,
        sortOrder: 364,
        groups: v4Phase2ContactGroups,
        energyByRiderId: energyAtKm(2, v4Phase2MergeKm),
        eventType: 'bridge_contact',
        title: 'The counterattack physically reaches the leaders',
        description: 'The front group is within the actual merge tolerance.',
        riderIds: v4Phase2ActualMergedRiderIds,
        teamIds: Array.from(
          new Set(
            v4Phase2ActualMergedRiderIds
              .map((riderId) => riderById.get(riderId)?.teamId)
              .filter((teamId): teamId is string => Boolean(teamId)),
          ),
        ).sort(),
        physicalLineageId: 'v4-phase2-secondary-front',
        physicalSourceDisplayCode: 'F1',
        physicalMergeTargetDisplayCode: 'B1',
      })
    }
    eventDefinitions.push({
      checkpointIdSuffix: 'phase-2-secondary-front-merge',`;
 source=exactlyOnce(source,old,replacement)
 // The authoritative list is already checked by
 // reconcileV4ReplayBridgeMergeTargets in calibratedPhysicalTransformV4.
 source=exactlyOnce(
  source,
  '  phase4.bridgeGroups.forEach((bridgeGroup, bridgeIndex) => {',
  '  authoritativeBridgeGroups.forEach((bridgeGroup, bridgeIndex) => {',
 )
 return source
}
