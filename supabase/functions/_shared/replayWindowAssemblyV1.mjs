/**
 * Pure cursor/metadata contract for checkpointed replay generation.
 * Called only by the opt-in step-7 Edge worker. Every invocation operates on
 * the caller's saved output; stale leases are rejected at the SQL commit.
 * This helper never changes physical rider calculations or group identities.
 */
export function assembleReplayWindowV1({
  cursor, previousFrames, previousMetadata, page, compact = frame => frame,
}) {
  if (!Number.isInteger(cursor) || cursor < 0 ||
      !Array.isArray(previousFrames) || previousFrames.length !== cursor) {
    throw new Error("Resumable step-7 cursor/checkpoint mismatch");
  }
  if (!page || page.active !== true || !Array.isArray(page.checkpoints)) {
    throw new Error("Paged replay was not active");
  }
  const total = Number(page.baseCheckpointCount) + Number(page.eventCheckpointCount);
  if (!Number.isInteger(total) || total < 1 || cursor >= total ||
      page.checkpoints.length < 1 || page.checkpoints.length > 32 ||
      cursor + page.checkpoints.length > total) {
    throw new Error("Paged replay returned an invalid window");
  }
  const metadata = { ...page, checkpoints: [] };
  if (cursor > 0) {
    if (!previousMetadata || typeof previousMetadata !== "object" ||
       ["finalCheckpointId","resultsVisibleFromCheckpointId","modelVersion",
        "baseCheckpointCount","eventCheckpointCount"].some(
        name => previousMetadata[name] !== metadata[name])) {
      throw new Error("Replay metadata changed after worker resume");
    }
  }
  const frames = page.checkpoints.map((frame,index)=>{
    if (frame?.checkpointIndex !== cursor + index) {
      throw new Error("Replay checkpoint index drift");
    }
    return compact(frame,index);
  });
  const assembled = [...previousFrames,...frames];
  // IDs must be stable, unique and ordered across persisted pages.
  const ids = new Set(assembled.map(frame=>frame?.checkpointId));
  if (ids.has(undefined) || ids.size !== assembled.length) {
    throw new Error("Replay duplicate or missing checkpoint identity");
  }
  return {
    nextCursor: assembled.length,
    metadata,
    frames: assembled,
    totalFrames: total,
    completed: assembled.length === total,
  };
}
