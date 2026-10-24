import assert from "node:assert/strict";
import { test } from "node:test";
import { planReplayNormalizationWindow } from "../supabase/functions/_shared/replayNormalizationWindowV1.mjs";

test("preserves single-pass normalization for Oropa-sized replays", () => {
  assert.deepEqual(planReplayNormalizationWindow(215), {
    start: 0, end: 215, nextCursor: null, complete: true,
  });
});

test("resumes an unusually long replay from the persisted cursor", () => {
  const visited = [];
  let cursor = 0;
  let pages = 0;
  do {
    const page = planReplayNormalizationWindow(610, cursor);
    for (let i = page.start; i < page.end; i++) visited.push(i);
    pages++;
    if (page.complete) break;
    cursor = page.nextCursor;
  } while (true);
  assert.equal(pages, 3);
  assert.equal(visited.length, 610);
  assert.deepEqual(visited,[...Array(610).keys()]);
});

test("a retried page uses exactly the same range (checkpoint commit is idempotent)",()=>{
  const first = planReplayNormalizationWindow(610,256);
  const retry = planReplayNormalizationWindow(610,256);
  assert.deepEqual(first,retry);
  assert.deepEqual(first,{start:256,end:512,nextCursor:512,complete:false});
});

test("invalid persisted cursor fails instead of silently skipping replay frames",()=>{
  assert.throws(()=>planReplayNormalizationWindow(200,201),/Invalid persisted/);
  assert.throws(()=>planReplayNormalizationWindow(200,-1),/Invalid persisted/);
  assert.throws(()=>planReplayNormalizationWindow(200,NaN),/Invalid persisted/);
});

test("bounds work even for a very large replay",()=>{
  const page=planReplayNormalizationWindow(80000,45000);
  assert.equal(page.end-page.start,256);
  assert.equal(page.nextCursor,45256);
});
