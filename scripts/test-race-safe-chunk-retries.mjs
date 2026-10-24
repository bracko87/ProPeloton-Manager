import { test } from "node:test";
import assert from "node:assert/strict";
import { isTransientChunkWriteError, writeIdempotentChunkWithRetry } from "../supabase/functions/_shared/idempotentChunkRetryV1.mjs";

test("retries an ambiguous transport failure at the same chunk index", async () => {
  const stored = new Map();
  let attempts = 0;
  const waits = [];
  const writes = [];
  const receipt = await writeIdempotentChunkWithRetry({
    chunkIndex: 4, label: "Replay output", sleep: async (ms) => { waits.push(ms); },
    write: async () => {
      attempts++;
      const key = "stage:run:lease:4";
      stored.set(key, "unchanged-payload");
      writes.push(key);
      // Simulate a successful database upsert whose response was lost.
      if (attempts === 1) throw new Error("connection terminated due to connection timeout");
      return { status: "saved_chunk", chunk_index: 4 };
    },
  });
  assert.equal(receipt.status, "saved_chunk");
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [250]);
  assert.deepEqual(writes, ["stage:run:lease:4", "stage:run:lease:4"]);
  assert.equal(stored.size, 1);
});

test("never retries stale leases or validation failures", async () => {
  let attempts = 0;
  await assert.rejects(
    writeIdempotentChunkWithRetry({ chunkIndex: 1, write: async () => {
      attempts++; return { status: "stale_lease", chunk_index: 1 };
    } }), /stale_lease/,
  );
  assert.equal(attempts, 1);
  assert.equal(isTransientChunkWriteError("Invalid checkpoint chunk"), false);
});

test("rejects wrong chunk index instead of silently accepting corruption", async () => {
  let attempts = 0;
  await assert.rejects(writeIdempotentChunkWithRetry({
    chunkIndex: 7, write: async () => {
      attempts++; return { status: "saved_chunk", chunk_index: 8 };
    },
  }), /mismatched index/);
  assert.equal(attempts, 1);
});

test("transient errors stop after a bounded number of attempts", async () => {
  let attempts = 0;
  const waits = [];
  await assert.rejects(writeIdempotentChunkWithRetry({
    chunkIndex: 2, maxAttempts: 3, sleep: async ms => waits.push(ms),
    write: async () => { attempts++; throw new Error("HTTP 503"); },
  }), /HTTP 503/);
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [250, 500]);
});

test("permanent errors do not waste worker time on retries", async () => {
  let attempts = 0;
  await assert.rejects(writeIdempotentChunkWithRetry({
    chunkIndex: 0, write: async () => { attempts++; throw Error("Invalid checkpoint chunk"); },
  }), /Invalid checkpoint chunk/);
  assert.equal(attempts, 1);
});
