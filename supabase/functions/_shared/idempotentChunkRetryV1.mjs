/**
 * Bounded retries for the already-idempotent race checkpoint-chunk RPC.
 * The DB upserts by (stage, simulation, lease, chunk_index), so retrying an
 * identical index and payload within the SAME lease cannot duplicate a chunk.
 * A new lease is a separate upload; it must not adopt partial old transfers.
 */
export function isTransientChunkWriteError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:timed?\s*out|statement timeout|connection (?:terminated|reset|refused|closed)|econnreset|econnrefused|fetch failed|failed to fetch|network error|http (?:502|503|504)|status (?:502|503|504))/i.test(message);
}

export async function writeIdempotentChunkWithRetry({
  write,
  chunkIndex,
  label = "Race checkpoint",
  maxAttempts = 3,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onRetry = () => {},
}) {
  if (typeof write !== "function") throw new Error("Missing chunk writer");
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) throw new Error("Invalid chunk index");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new Error("Invalid chunk retry limit");
  }
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const receipt = await write();
      if (receipt?.status !== "saved_chunk") {
        throw new Error(`${label} chunk ${chunkIndex} rejected: ${String(receipt?.status ?? "missing_status")}`);
      }
      if (receipt.chunk_index !== chunkIndex) {
        throw new Error(`${label} chunk ${chunkIndex} returned a mismatched index`);
      }
      return receipt;
    } catch (error) {
      if (!isTransientChunkWriteError(error) || attempt === maxAttempts) throw error;
      onRetry({ chunkIndex, label, failedAttempt: attempt, message: String(error) });
      // Back off for transient transport failures without losing the lease.
      await sleep(Math.min(250 * (2 ** (attempt - 1)), 1000));
    }
  }
  throw new Error("Chunk retry loop reached an invalid state");
}
