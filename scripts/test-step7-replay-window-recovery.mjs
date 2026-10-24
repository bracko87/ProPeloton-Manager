import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleReplayWindowV1 } from "../supabase/functions/_shared/replayWindowAssemblyV1.mjs";
const mk=(start,end,total=19)=>({
 active:true,baseCheckpointCount:5,eventCheckpointCount:total-5,
 finalCheckpointId:"stage|replay|finish",resultsVisibleFromCheckpointId:"stage|replay|finish",
 modelVersion:"universal_replay_timeline_v1",checkpoints:Array.from({length:end-start},(_,i)=>({
   checkpointIndex:start+i,checkpointId:`replay-${start+i}`,
   groups:[{groupCode:"P",gapSeconds:0}],riderStates:[{riderId:"R1",energy:10+start+i}],
 })),
});
test("interrupted worker resumes from exact checkpoint, preserving output and indices",()=>{
  const expected=mk(0,19).checkpoints;
  const first=assembleReplayWindowV1({cursor:0,previousFrames:[],previousMetadata:null,page:mk(0,8)});
  assert.equal(first.completed,false);
  const saved=JSON.parse(JSON.stringify(first)); // simulate DB checkpoint and a new isolate
  const second=assembleReplayWindowV1({
    cursor:saved.nextCursor,previousFrames:saved.frames,
    previousMetadata:saved.metadata,page:mk(8,16),
  });
  const saved2=JSON.parse(JSON.stringify(second));
  const third=assembleReplayWindowV1({
    cursor:saved2.nextCursor,previousFrames:saved2.frames,
    previousMetadata:saved2.metadata,page:mk(16,19),
  });
  assert.equal(third.completed,true);
  assert.deepEqual(third.frames,expected);
  assert.equal(new Set(third.frames.map(c=>c.checkpointId)).size,19);
});
test("same last unfinished page can be retried after losing its response",()=>{
  const first=assembleReplayWindowV1({cursor:0,previousFrames:[],previousMetadata:null,page:mk(0,8)});
  const args={cursor:8,previousFrames:first.frames,previousMetadata:first.metadata,page:mk(8,16)};
  assert.deepEqual(assembleReplayWindowV1(args),assembleReplayWindowV1(args));
});
test("invalid or duplicate checkpoint output is refused",()=>{
  const before=assembleReplayWindowV1({cursor:0,previousFrames:[],previousMetadata:null,page:mk(0,8)});
  assert.throws(()=>assembleReplayWindowV1({
   cursor:9,previousFrames:before.frames,previousMetadata:before.metadata,page:mk(9,16),
  }),/cursor\/checkpoint mismatch/);
  const bad=mk(8,16);bad.checkpoints[0].checkpointIndex=7;
  assert.throws(()=>assembleReplayWindowV1({
   cursor:8,previousFrames:before.frames,previousMetadata:before.metadata,page:bad,
  }),/checkpoint index drift/);
  const duplicate=mk(8,16);duplicate.checkpoints[0].checkpointId="replay-0";
  assert.throws(()=>assembleReplayWindowV1({
   cursor:8,previousFrames:before.frames,previousMetadata:before.metadata,page:duplicate,
  }),/duplicate or missing/);
  const drift=mk(8,16);drift.finalCheckpointId="different";
  assert.throws(()=>assembleReplayWindowV1({
   cursor:8,previousFrames:before.frames,previousMetadata:before.metadata,page:drift,
  }),/metadata changed/);
});
