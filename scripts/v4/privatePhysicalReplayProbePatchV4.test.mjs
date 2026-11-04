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

test('current membership mismatch is classified without changing the strict replay',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("if(shadow.mismatch==='CURRENT_MEMBERSHIP')"));
 assert.ok(patched.includes('probe.shadowHandoff=classifyPhysicalReplayMembershipHandoffV4({'));
 assert.ok(patched.includes('physicalMembers:physicalCandidate.proposal.afterMembers'));
 assert.ok(patched.includes('replayGroups:checkpoints[at].groups'));
 assert.ok(!patched.includes('replayTimeline=shadow.timeline'));
});

test('checkpoint construction stages are observed without mutating published replay',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('__ppmV4CheckpointStages.set('));
 assert.ok(patched.includes('{raw:definition.groups,normalized:normalizedGroups,published:publishedGroups}'));
 assert.ok(patched.includes('probe.checkpointStageDivergence=classifyCheckpointGroupStagesV4({'));
 assert.ok(patched.includes('finalGroups:checkpoints[at].groups'));
 assert.ok(!patched.includes('replayTimeline=shadow.timeline'));
});

test('downstream handoff probe separates Phase 10 from final reconciliation without mutating replay',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('probe.postConstructionHandoff=classifyPostConstructionHandoffV4({'));
 assert.ok(patched.includes('baseTimeline:baseReplayTimeline'));
 assert.ok(patched.includes('phase10Timeline:phase10Resolution.replayTimeline'));
 assert.ok(patched.includes('finalTimeline:replayTimeline'));
 assert.ok(!patched.includes('replayTimeline=shadow.timeline'));
});

test('Phase 10 mutation boundary probe captures physical memberships privately',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("cpStages['INITIAL']=groups.map"));
 assert.ok(patched.includes("cpStages['AFTER_DETACHMENT']=groups.map"));
 assert.ok(patched.includes("cpStages['AFTER_AUTONOMOUS_GROUPS']=groups.map"));
 assert.ok(patched.includes("cpStages['AFTER_CONSOLIDATION']=groups.map"));
 assert.ok(patched.includes("cpStages['AFTER_FINISH_COMMIT']=groups.map"));
 assert.ok(patched.includes("cpStages['AFTER_DISPLAY_NORMALIZATION']=groups.map"));
 assert.ok(patched.includes('probe.phase10MembershipStage=classifyPhase10MembershipStageV4({'));
 assert.ok(!patched.includes('replayTimeline=shadow.timeline'));
});

test('Phase 10 detachment evidence distinguishes autonomous episodes from reached DNF',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('__ppmV4Phase10DetachEvidence.set(checkpoint.checkpointId'));
 assert.ok(patched.includes('autonomousRiderIds:[...autonomousRiderIds]'));
 assert.ok(patched.includes('dnfRiderIds:[...reachedDnfRiderIds]'));
 assert.ok(patched.includes('probe.phase10DetachmentEvidence=classifyPhase10DetachmentEvidenceV4({'));
 assert.ok(!patched.includes('replayTimeline=shadow.timeline'));
});

test('DNF-aware shadow is confined to confirmed incident detachment and reuses strict validator',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("probe.phase10DetachmentEvidence==='DNF_DETACHMENT'"));
 assert.ok(patched.includes('const dnfShadow=buildPrivateDnfAwareMergerShadowV4({'));
 assert.ok(patched.includes('reachedDnfRiderIds:detachment.dnfRiderIds'));
 assert.ok(patched.includes('phase10Incidents,dnfShadow.timeline,'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(dnfStrict)'));
 assert.ok(!patched.includes('replayTimeline=dnfShadow.timeline'));
});

test('unified research candidate validates independently before private end-to-end integration',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('const unified=buildPrivateUnifiedMergerCandidateV4({'));
 assert.ok(patched.includes('detachmentClass:probe.phase10DetachmentEvidence'));
 assert.ok(patched.includes('phase10Incidents,unified.timeline,'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(unifiedSummary)'));
 assert.ok(patched.includes('probe.unifiedMergerStrictStatus=unifiedPolicy.publishable?'));
 // The isolated, compiled research engine may adopt the candidate only after
 // it passes the original strict validator; the repository engine stays intact.
 assert.ok(patched.includes('replayTimeline=unified.timeline'));
 assert.ok(patched.includes('if(candidatePolicy.publishable){'));
 assert.ok(!source.includes('replayTimeline=unified.timeline'));
 assert.ok(patched.includes('  if (!replayPublicationPolicy.publishable) {'));
 assert.ok(patched.includes('throw new Error('));
});

test('private end-to-end repair re-enters unchanged strict publication and acceptance checks',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('  let replayTimeline ='));
 assert.ok(patched.includes('  let replaySynchronization ='));
 assert.ok(patched.includes('  let replayPublicationPolicy ='));
 assert.ok(patched.includes('replayPublicationPolicy.blockingIssues.length>0'));
 assert.ok(patched.includes("blockingIssues.find("));
 assert.ok(patched.includes("candidatePolicy.publishable"));
 assert.ok(!patched.includes('replayPublicationPolicy.blockingIssues.length===1'));
 assert.ok(patched.includes("audit.integratedRepairStatus='STRICT_ACCEPTED'") || patched.includes("'STRICT_ACCEPTED':'STRICT_BLOCKED'"));
 assert.ok(patched.includes('replayTimeline=unified.timeline'));
 assert.ok(patched.includes('replaySynchronization=candidateSync'));
 assert.ok(patched.includes('replayPublicationPolicy=candidatePolicy'));
 assert.ok(patched.includes('const postStageUpdate = buildUniversalPostStageUpdateSummary('));
 assert.ok(patched.includes('const phase78Acceptance = buildUniversalPhase78AcceptanceReport('));
 assert.ok(patched.indexOf('replayTimeline=unified.timeline')<patched.indexOf('const postStageUpdate ='));
 // Guarded transformation is limited to the private candidate compilation.
 assert.ok(source.includes('  const replayTimeline ='));
 assert.ok(source.includes('  const replayPublicationPolicy ='));
 assert.ok(!source.includes('integratedRepairStatus'));
});

test('physical-parity label handoff is research-only and subject to complete strict gate',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('const handoff=buildPrivatePhysicalLabelHandoffV4({'));
 assert.ok(patched.includes('physicalGroupsAtKm:audit.physicalGroupsAtKm'));
 assert.ok(patched.includes("handoff.status==='LABEL_HANDOFF_CREATED'"));
 assert.ok(patched.includes('phase10Incidents,handoff.timeline,'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(labelSync)'));
 assert.ok(patched.includes("audit.integratedRepairMode='PHYSICAL_LABEL_HANDOFF'"));
 assert.ok(!source.includes('buildPrivatePhysicalLabelHandoffV4('));
});
