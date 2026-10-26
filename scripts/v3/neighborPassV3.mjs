/** Research-only deterministic lateral corridor selection. This changes only
 * the preference among lanes already judged physically clear by the solver.
 * It does NOT permit extra lane reservations or relax continuous collision checks.
 */
export function chooseNeighborSpaceLaneV3(r, rows, reservations, candidates, g) {
  if (!r || !Number.isFinite(r.meters) || !Number.isFinite(r.y) ||
      !Array.isArray(rows) || !Array.isArray(reservations) || !Array.isArray(candidates) ||
      candidates.length === 0 || !g || !Number.isFinite(g.centerStepM) ||
      !Number.isFinite(g.lateralCollisionM) || g.centerStepM <= 0 ||
      !candidates.every(l => Number.isInteger(l) && l >= 0 && l < g.laneCount)) {
    throw new Error('Invalid A2 neighbor-space passing candidate');
  }
  const evaluated = candidates.map(lane => {
    const targetY = lane * g.centerStepM;
    let ahead = 30, behind = 20, reserved = 0;
    for (const other of rows) {
      if (other.riderId === r.riderId || other.finishSeconds !== null ||
          Math.abs(other.y - targetY) >= g.lateralCollisionM) continue;
      const diff = other.meters - r.meters;
      if (diff > 0) ahead = Math.min(ahead, diff);
      else if (diff < 0) behind = Math.min(behind, -diff);
    }
    for (const other of reservations) {
      if (other.riderId === r.riderId || !other.reservation ||
          Math.abs(other.reservation.targetY - targetY) >= g.centerStepM + 0.01) continue;
      const dist = Math.abs(other.meters - r.meters);
      if (dist <= 30) reserved += 1;
    }
    // Equal weights for forward and rearward physical clearance; reservation
    // contention is a soft penalty only after hard safety screening.
    return {lane, score: Math.round((2 * ahead + behind - 10 * reserved) * 1e6) / 1e6};
  });
  evaluated.sort((a, b) => b.score - a.score || a.lane - b.lane);
  return evaluated[0].lane;
}
