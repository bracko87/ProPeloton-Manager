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
    // V4: sample the uncommitted F/B/P physical partition just BEFORE the
    // actual Phase-2 merger. The checkpoint itself shares the merge kilometre.
    const v4Phase2BridgeContactGroups = groupsAtKm(
      Math.max(
        phase2.secondaryFrontLaunchKm ?? 0,
        phase2.secondaryFrontMergeKm - 0.00001,
      ),
    )
    const v4Phase2BridgeContactSource = v4Phase2BridgeContactGroups.find(
      (group) =>
        group.displayCode.startsWith('F') &&
        phase2.secondaryFrontRiderIdsAtLaunch.length > 0 &&
        phase2.secondaryFrontRiderIdsAtLaunch.every((riderId) =>
          group.riderIds.includes(riderId),
        ),
    )
    const v4Phase2BridgeContactTarget = v4Phase2BridgeContactGroups.find(
      (group) => group.displayCode.startsWith('B'),
    )
    const v4Phase2BridgeContactPeloton = v4Phase2BridgeContactGroups.find(
      (group) => group.displayCode === 'P',
    )
    const v4Phase2BridgeContactVerified =
      v4Phase2BridgeContactSource !== undefined &&
      v4Phase2BridgeContactTarget !== undefined &&
      Number.isFinite(v4Phase2BridgeContactSource.gapSeconds) &&
      Number.isFinite(v4Phase2BridgeContactTarget.gapSeconds) &&
      v4Phase2BridgeContactSource.gapSeconds >=
        v4Phase2BridgeContactTarget.gapSeconds - 0.000001 &&
      v4Phase2BridgeContactSource.gapSeconds -
        v4Phase2BridgeContactTarget.gapSeconds <=
        PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 0.00001 &&
      (v4Phase2BridgeContactPeloton === undefined ||
        v4Phase2BridgeContactSource.gapSeconds <
          v4Phase2BridgeContactPeloton.gapSeconds - 0.000001)
    if (v4Phase2BridgeContactVerified) {
      eventDefinitions.push({
        checkpointIdSuffix: 'phase-2-secondary-front-contact',
        checkpointKind: 'event',
        phase: 2,
        kmFromStart: phase2.secondaryFrontMergeKm,
        sortOrder: 364,
        groups: v4Phase2BridgeContactGroups,
        energyByRiderId: energyAtKm(2, phase2.secondaryFrontMergeKm),
        eventType: 'bridge_contact',
        title: 'The counterattack reaches merge tolerance',
        description: 'F1 reaches B1 physically before the riders merge.',
        riderIds: [...phase2.secondaryFrontRiderIdsAtLaunch],
        teamIds: Array.from(
          new Set(
            phase2.secondaryFrontRiderIdsAtLaunch
              .map((riderId) => riderById.get(riderId)?.teamId)
              .filter((teamId): teamId is string => Boolean(teamId)),
          ),
        ).sort(),
        physicalMergeTargetDisplayCode:
          v4Phase2BridgeContactTarget!.displayCode as 'B1',
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
