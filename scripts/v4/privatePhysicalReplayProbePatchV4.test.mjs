import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchPhysicalReplayProbeSourceV4} from './privatePhysicalReplayProbePatchV4.mjs';

test('physical shadow replay injection preserves official checkpoint construction',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.equal(patched.includes('const __v4PhysicalReplayProbe ='),true);
 assert.equal(patched.includes('const preFinishPublishedDefinition = [...baseDefinitions, ...eventDefinitions]'),true);
 assert.equal(patched.includes('capturePhysicalReplaySamplesV4(kms,groupsAtKm)'),true);
 assert.equal(patched.includes('buildReplayFromPhysicalGroupsV4(samples'),true);
 assert.throws(()=>patchPhysicalReplayProbeSourceV4(patched),/SOURCE_DRIFT/);
});
test('source change fails closed instead of silently instrumenting wrong function',()=>{
 assert.throws(()=>patchPhysicalReplayProbeSourceV4('irrelevant source'),/SOURCE_DRIFT/);
});

test('forensic suffix is removed from the checkpoint lookup, not from the issue itself',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("parts.slice(3).join(':').split(':v4_private_phase=')[0]"));
 const issue='post_catch_group_transfer_without_physical_transition:rider-x:C1->C2:race-checkpoint-32:v4_private_phase=CROSS_PHASE:v4_private_gap=SEPARATED';
 const parts=issue.split(':');
 assert.equal(parts.slice(3).join(':').split(':v4_private_phase=')[0],'race-checkpoint-32');
});
