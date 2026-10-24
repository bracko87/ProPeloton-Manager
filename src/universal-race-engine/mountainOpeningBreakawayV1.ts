/**
 * Preserve the opening B1 lineage until the *physical* solver reports a catch.
 *
 * The ordinary grouping tolerance (5 seconds) means riders can receive the
 * same official finish time; it is NOT evidence that a real road breakaway
 * has been caught. The physical catch threshold is much tighter (0.75 s).
 * A replay must not convert an active B1 into P at the phase boundary just
 * because the boundary gap happens to be under the grouping tolerance.
 *
 * Pure helper for the separate experimental mountain solver only.
 */
export function mountainOpeningBreakawayPhysicallyActiveV1(
  phaseOneEndGapSeconds: number,
  physicalCatchToleranceSeconds: number,
  phaseTwoPhysicalCatchKm: number | null,
  currentKm: number,
): boolean {
  return Number.isFinite(phaseOneEndGapSeconds) &&
    phaseOneEndGapSeconds > physicalCatchToleranceSeconds &&
    (phaseTwoPhysicalCatchKm === null ||
      currentKm < phaseTwoPhysicalCatchKm - 0.000001)
}
