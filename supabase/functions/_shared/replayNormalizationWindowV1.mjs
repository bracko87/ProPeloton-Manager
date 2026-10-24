/**
 * Bound replay normalization CPU work without rewriting large checkpoints
 * unnecessarily. Typical races (<=256 frames) still normalize in one step.
 * The caller persists step9ReplayCursor using its existing checkpoint lease.
 *
 * This does not split the initial mountain replay builder in step 7.
 */
export function planReplayNormalizationWindow(totalFrames, persistedCursor = 0, maxFrames = 256) {
  if (!Number.isInteger(totalFrames) || totalFrames < 0) throw new Error("Invalid replay frame count");
  if (!Number.isInteger(persistedCursor) || persistedCursor < 0 || persistedCursor > totalFrames) {
    throw new Error("Invalid persisted replay normalization cursor");
  }
  if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 1024) {
    throw new Error("Invalid replay normalization page size");
  }
  const start = persistedCursor;
  const end = Math.min(totalFrames, start + maxFrames);
  return { start, end, nextCursor: end < totalFrames ? end : null, complete: end === totalFrames };
}
