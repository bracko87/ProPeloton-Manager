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

test('exact checkpoint instrumentation calls physical boundary classifier privately',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('physicalGroupsAtKm:groupsAtKm'));
 assert.ok(patched.includes('probe.boundaryPhysicalStatus=classifyPhysicalCheckpointBoundaryV4('));
 assert.ok(patched.includes('physicalGroupsAtKm:probe.physicalGroupsAtKm'));
});

test('isolated replay failure capture classifies same-distance presentation separately',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('probe.replayPresentationStatus=classifyReplayCheckpointPresentationV4('));
 assert.ok(patched.includes('previous:checkpoints[at-1],current:checkpoints[at]'));
});

test('isolated physical candidate uses real checkpoint bounds without replay mutation',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('const physicalCandidate=reconstructPhysicalCheckpointCandidateV4('));
 assert.ok(patched.includes('probe.physicalCheckpointCandidate=physicalCandidate.classification'));
 assert.ok(patched.includes('probe.physicalCheckpointProposal=physicalCandidate.proposal'));
 assert.ok(patched.includes('groupToleranceSeconds:PHASE5_GROUP_MERGE_TOLERANCE_SECONDS'));
 assert.ok(patched.includes('physicalGroupsAtKm:probe.physicalGroupsAtKm'));
});

test('physical event proposal is retained only in private probe memory',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('probe.physicalCheckpointProposal=physicalCandidate.proposal'));
 assert.ok(patched.includes('probe.physicalCheckpointCandidate=physicalCandidate.classification'));
 assert.ok(patched.includes("import {reconstructPhysicalCheckpointCandidateV4}"));
});

test('historical shadow merger is diagnostic only and never replaces original replay timeline',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('const shadow=buildPrivatePhysicalMergerShadowV4({'));
 assert.ok(patched.includes('timeline:replayTimeline,'));
 assert.ok(patched.includes('probe.shadowMergerStatus=shadow.status'));
 assert.ok(!patched.includes('replayTimeline=shadow.timeline'));
});

test('shadow trial runs original synchronization checks without replacing published replay',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('const strictShadow=buildUniversalReplaySynchronizationSummary('));
 assert.ok(patched.includes('phase10Incidents,shadow.timeline,'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(strictShadow)'));
 assert.ok(patched.includes("probe.shadowStrictStatus=strictPolicy.publishable?"));
 assert.ok(patched.includes("probe.shadowMismatch=shadow.mismatch"));
 assert.ok(!patched.includes('replayTimeline=shadow.timeline'));
});
