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

test('stable physical checkpoint reconstruction is confined to private candidate and full strict validation',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("handoff.status==='MEMBERSHIP_MISMATCH'"));
 assert.ok(patched.includes('buildPrivateStablePhysicalCheckpointV4({'));
 assert.ok(patched.includes("stable.status==='STABLE_CHECKPOINT_CREATED'"));
 assert.ok(patched.includes('phase10Incidents,stable.timeline,'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(stableSync)'));
 assert.ok(patched.includes('if(stablePolicy.publishable){'));
 assert.ok(!source.includes('buildPrivateStablePhysicalCheckpointV4('));
});

test('late physical mismatch classification remains private and cannot bypass strict replay',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("stable.status==='INCIDENT_OR_FINISH_UNSAFE'"));
 assert.ok(patched.includes("stable.status==='PHYSICAL_NOT_STABLE'"));
 assert.ok(patched.includes('classifyPrivateLatePhysicalMismatchV4({'));
 assert.ok(patched.includes('audit.latePhysicalEvidence=late'));
 assert.ok(!source.includes('classifyPrivateLatePhysicalMismatchV4'));
 assert.ok(patched.includes('  if (!replayPublicationPolicy.publishable) {'));
});

test('private historical diagnostics trace first physical drift and verify DNF survivor provenance',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('tracePrivateFirstPhysicalDivergenceV4({'));
 assert.ok(patched.includes('audit.firstPhysicalDivergence='));
 assert.ok(patched.includes("late.incident==='CONFIRMED_DNF_REMOVAL'"));
 assert.ok(patched.includes('auditPrivateReachedDnfCheckpointV4({'));
 assert.ok(patched.includes('audit.reachedDnfHandoff='));
 assert.ok(!source.includes('tracePrivateFirstPhysicalDivergenceV4'));
 assert.ok(!source.includes('auditPrivateReachedDnfCheckpointV4'));
});

test('private handoff attribution is observational and cannot bypass strict validation',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('attributePrivatePhase10HandoffV4({'));
 assert.ok(patched.includes('audit.phase10HandoffAttribution='));
 assert.ok(patched.includes('phase10Stages:stages,reachedDnfRiderIds:detachment?.dnfRiderIds'));
 assert.ok(!source.includes('attributePrivatePhase10HandoffV4'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(stableSync)'));
});

test('private reached-DNF split evidence uses failed rider and full unchanged strict gate',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('buildPrivateDnfTransitionCommentaryV4({'));
 assert.ok(patched.includes('timeline:replayTimeline,checkpointId,riderId,'));
 assert.ok(patched.includes("audit.reachedDnfHandoff==='DNF_HANDOFF_CONFIRMED'"));
 assert.ok(patched.includes("dnfTransition.status==='DNF_TRANSITION_CREATED'"));
 assert.ok(patched.includes('phase10Incidents,dnfTransition.timeline,'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(sync)'));
 assert.ok(patched.includes('if(policy.publishable){'));
 assert.ok(!source.includes('buildPrivateDnfTransitionCommentaryV4('));
});

test('private DNF-survivor identity repair retains full physical and strict publication gates',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("audit.reachedDnfHandoff==='DNF_HANDOFF_CONFIRMED'"));
 assert.ok(patched.includes('buildPrivateDnfSurvivorIdentityV4({'));
 assert.ok(patched.includes("survivorIdentity.status==='DNF_SURVIVOR_IDENTITY_CREATED'"));
 assert.ok(patched.includes('phase10Incidents,survivorIdentity.timeline,'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(candidateSync)'));
 assert.ok(patched.includes("audit.integratedRepairMode='DNF_SURVIVOR_IDENTITY'"));
 assert.ok(!source.includes('buildPrivateDnfSurvivorIdentityV4'));
});

test('incident-adjusted physical checkpoint reconstruction requires independent Phase10 and original strict acceptance',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('buildPrivateIncidentAdjustedCheckpointV4({'));
 assert.ok(patched.includes("incidentAdjusted.status==='INCIDENT_CHECKPOINT_RECONSTRUCTED'"));
 assert.ok(patched.includes('phase10Incidents,incidentAdjusted.timeline,'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(candidateSync)'));
 assert.ok(patched.includes("audit.integratedRepairMode='INCIDENT_ADJUSTED_CHECKPOINT'"));
 assert.ok(!source.includes('buildPrivateIncidentAdjustedCheckpointV4('));
});

test('source-drift and continuity evidence remain isolated from official replay physics',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('classifyPrivatePhase10SourceDriftV4({'));
 assert.ok(patched.includes('classifyPrivatePostCatchContinuityV4({'));
 assert.ok(patched.includes('audit.phase10SourceDrift='));
 assert.ok(patched.includes('audit.postCatchContinuity='));
 assert.ok(!source.includes('classifyPrivatePhase10SourceDriftV4'));
 assert.ok(!source.includes('classifyPrivatePostCatchContinuityV4'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(candidateSync)'));
});

test('earlier physical checkpoint trial uses its own Phase10 DNF evidence and original strict gate',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("audit.postCatchContinuity.source==='PREVIOUS_MISMATCH'"));
 assert.ok(patched.includes("audit.postCatchContinuity.phys==='PHYSICALLY_STABLE'"));
 assert.ok(patched.includes('const earlierId=prev.checkpointId'));
 assert.ok(patched.includes('get(earlierId)'));
 assert.ok(patched.includes('reachedDnfRiderIds:earlierDetachment?.dnfRiderIds'));
 assert.ok(patched.includes('phase10Incidents,earlier.timeline,'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(earlierSync)'));
 assert.ok(patched.includes('if(earlierPolicy.publishable){'));
 assert.ok(!source.includes('earlierCheckpointStrictStatus'));
});

test('previous checkpoint Phase10 drift diagnosis is independent and observational',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('audit.earlierPhase10SourceDrift=classifyPrivatePhase10SourceDriftV4({'));
 assert.ok(patched.includes('checkpoint:prev,physicalGroupsAtKm:audit.physicalGroupsAtKm'));
 assert.ok(patched.includes('phase10Stages:earlierStages'));
 assert.ok(patched.includes('autonomousRiderIds:earlierDetachment?.autonomousRiderIds'));
 assert.ok(!source.includes('earlierPhase10SourceDrift'));
});

test('exact-event source inheritance probe uses base timeline privately without changing acceptance gates',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('audit.earlierExactEventSource=classifyPrivateExactEventSourceV4({'));
 assert.ok(patched.includes('baseTimeline:baseReplayTimeline'));
 assert.ok(patched.includes('checkpointId:earlierId'));
 assert.ok(!source.includes('earlierExactEventSource'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(earlierSync)'));
});

test('Phase10 input provenance uses base timeline only in isolated physical replay probe',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('audit.earlierInputProvenance=classifyPrivatePhase10InputProvenanceV4({'));
 assert.ok(patched.includes('checkpoint:prev,phase10Stages:earlierStages'));
 assert.ok(patched.includes('baseTimeline:baseReplayTimeline'));
 assert.ok(!source.includes('earlierInputProvenance'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(earlierSync)'));
});

test('physical exact-event repair remains private and cannot bypass strict publication',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('buildPrivateExactEventPhysicalCandidateV4({'));
 assert.ok(patched.includes('provenance:audit.earlierInputProvenance'));
 assert.ok(patched.includes('reachedDnfRiderIds:earlierDetachment?.dnfRiderIds'));
 assert.ok(patched.includes('phase10Incidents,exactCandidate.timeline,'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(exactSync)'));
 assert.ok(patched.includes('if(exactPolicy.publishable){'));
 assert.ok(patched.includes("audit.integratedRepairMode='EXACT_EVENT_PHYSICAL'"));
 assert.ok(!source.includes('buildPrivateExactEventPhysicalCandidateV4'));
});

test('base physical source repair is private and must pass unchanged strict publication',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('buildPrivateBasePhysicalSourceV4({'));
 assert.ok(patched.includes('baseTimeline:baseReplayTimeline'));
 assert.ok(patched.includes('provenance:audit.earlierInputProvenance'));
 assert.ok(patched.includes('phase10Incidents,baseSourceCandidate.timeline,'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(baseSourceSync)'));
 assert.ok(patched.includes('if(baseSourcePolicy.publishable){'));
 assert.ok(patched.includes("'BASE_PHYSICAL_PASSIVE_EVENT':'BASE_PHYSICAL_SOURCE'"));
 assert.ok(patched.includes("baseSourceCandidate.status==='BASE_PHYSICAL_PASSIVE_EVENT_CREATED'"));
 assert.ok(patched.includes("baseSourceCandidate.status==='BASE_PHYSICAL_EVENT_CREATED'"));
 assert.ok(patched.includes("baseSourceCandidate.status==='BASE_PHYSICAL_CATCH_CREATED'"));
 assert.ok(patched.includes("'BASE_PHYSICAL_CATCH':"));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(baseSourceSync)'));
 assert.ok(patched.includes("baseSourceCandidate.status==='BASE_PHYSICAL_SOURCE_CREATED'"));
 assert.ok(patched.includes('audit.baseSourceRejectedEventKind=baseSourceCandidate.status'));
 assert.ok(patched.includes('audit.baseSourceRejectedEventBoundary=baseSourceCandidate.status'));
 assert.ok(!source.includes('buildPrivateBasePhysicalSourceV4'));
});

test('physical catch strict diagnostic exposes only allowlisted issue classes',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('audit.baseSourceStrictIssueCodes=[...new Set('));
 assert.ok(patched.includes("knownStrictIssueCodes.has(code)?code:'OTHER'"));
 assert.ok(patched.includes('baseSourcePolicy.blockingIssues.map(issue=>{'));
 assert.ok(patched.includes('if(baseSourcePolicy.publishable){'));
 assert.ok(!source.includes('baseSourceStrictIssueCodes'));
});

test('catch residual classification remains private and strict acceptance unchanged',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("audit.baseSourceResidualPosition='NONE'"));
 assert.ok(patched.includes("audit.baseSourceResidualSource=continuity.source??'UNAVAILABLE'"));
 assert.ok(patched.includes("audit.baseSourceResidualTransfer=previous===current?"));
 assert.ok(patched.includes("classifyUniversalReplaySynchronizationForPublication(baseSourceSync)"));
 assert.ok(patched.includes("if(baseSourcePolicy.publishable){"));
 assert.ok(!source.includes('baseSourceResidualPosition'));
});

test('bounded catch residual trial uses evidence-backed builders and unchanged strict validator',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("audit.baseSourceResidualPosition==='LATER'"));
 assert.ok(patched.includes("audit.baseSourceResidualPhysical==='PHYSICALLY_STABLE'"));
 assert.ok(patched.includes("audit.baseSourceResidualSource==='PREVIOUS_MISMATCH'"));
 assert.ok(patched.includes("audit.baseSourceResidualMovement==='PRESENTATION_MEMBERSHIP_CHANGE'"));
 assert.ok(patched.includes('checkpointId:staleId,'));
 assert.ok(patched.includes('baseTimeline:baseReplayTimeline,'));
 assert.ok(patched.includes('phase10Stages:staleStages,'));
 assert.ok(patched.includes('reachedDnfRiderIds:staleDnf?.dnfRiderIds'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(residualSync)'));
 assert.ok(patched.includes('if(residualPolicy.publishable){'));
 assert.ok(patched.includes("audit.integratedRepairMode='BASE_CATCH_PLUS_RESIDUAL'"));
 assert.ok(!source.includes('baseSourceResidualRepairStatus'));
});

test('stable physical C-to-C residual can only re-enter unchanged publication gate',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('buildPrivateResidualPhysicalCheckpointV4({'));
 assert.ok(patched.includes("baseSourceCandidate.status==='BASE_PHYSICAL_CATCH_CREATED'"));
 assert.ok(patched.includes("audit.baseSourceResidualTransfer==='C_TO_C'"));
 assert.ok(patched.includes('residualCheckpointId:residualId'));
 assert.ok(patched.includes("audit.baseSourceResidualPhysicalCandidate=stableResidual.status"));
 assert.ok(patched.includes("candidates.push({mode:'RESIDUAL_PHYSICAL',timeline:stableResidual.timeline})"));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(residualSync)'));
 assert.ok(patched.includes('if(residualPolicy.publishable){'));
 assert.ok(!source.includes('buildPrivateResidualPhysicalCheckpointV4'));
});

test('residual unsafe reason is private categorical metadata, not identity',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("audit.baseSourceResidualPhysicalGuard='NONE'"));
 assert.ok(patched.includes("audit.baseSourceResidualPhysicalGuard=stableResidual.reason??'NONE'"));
 assert.ok(patched.includes('if(residualPolicy.publishable){'));
 assert.ok(!source.includes('baseSourceResidualPhysicalGuard'));
});

test('provenance detail is a fixed research-only category',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("audit.baseSourceResidualProvenanceDetail='NONE'"));
 assert.ok(patched.includes("audit.baseSourceResidualProvenanceDetail=stableResidual.detail??'NONE'"));
 assert.ok(patched.includes('if(residualPolicy.publishable){'));
 assert.ok(!source.includes('baseSourceResidualProvenanceDetail'));
});

test('ledger-only incident relation is aggregated privately and never bypasses strict replay',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("audit.baseSourceResidualIncidentRelation='NONE'"));
 assert.ok(patched.includes("audit.baseSourceResidualIncidentRelation=stableResidual.incidentProvenanceRelation??'NONE'"));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(residualSync)'));
 assert.ok(patched.includes('if(residualPolicy.publishable){'));
 assert.ok(!source.includes('baseSourceResidualIncidentRelation'));
});

test('two stale adjacent replay checkpoints require physical pair proof and unchanged strict gate',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("if(stableResidual.status==='CURRENT_NOT_PHYSICAL'){"));
 assert.ok(patched.includes('buildPrivateResidualPhysicalPairV4({'));
 assert.ok(patched.includes('timeline:baseSourceCandidate.timeline,'));
 assert.ok(patched.includes('checkpointId:staleId,residualCheckpointId:residualId,'));
 assert.ok(patched.includes("audit.baseSourceResidualPairStatus=pair.status"));
 assert.ok(patched.includes("candidates.push({mode:'RESIDUAL_PHYSICAL_PAIR',timeline:pair.timeline})"));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(residualSync)'));
 assert.ok(patched.includes('if(residualPolicy.publishable){'));
 assert.ok(!source.includes('buildPrivateResidualPhysicalPairV4'));
});

test('paired residual candidate records only allowlisted strict blocking issue categories',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("audit.baseSourceResidualPairDetail=pair.detail??'NONE'"));
 assert.ok(patched.includes("if(candidate.mode==='RESIDUAL_PHYSICAL_PAIR'){"));
 assert.ok(patched.includes('audit.baseSourceResidualPairStrictIssues=[...new Set('));
 assert.ok(patched.includes("knownStrictIssueCodes.has(code)?code:'OTHER'"));
 assert.ok(patched.includes('if(residualPolicy.publishable){'));
 assert.ok(!source.includes('baseSourceResidualPairStrictIssues'));
});

test('residual DNF survivor exception uses recorded Phase10 source, not guessed rider removal',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("const nextDnf=privateStore.__ppmV4Phase10DetachEvidence?.get(residualId)"));
 assert.ok(patched.includes('nextReachedDnfRiderIds:nextDnf?.dnfRiderIds'));
 assert.ok(patched.includes("audit.baseSourceResidualPhysicalDetail=stableResidual.detail??'NONE'"));
 assert.ok(patched.includes("audit.baseSourceResidualNextDnfAlignment=stableResidual.nextDnfAlignment??'NONE'"));
 assert.ok(patched.includes("candidates.push({mode:'RESIDUAL_PHYSICAL',timeline:stableResidual.timeline})"));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(residualSync)'));
 assert.ok(patched.includes('if(residualPolicy.publishable){'));
 assert.ok(!source.includes('nextReachedDnfRiderIds'));
});

test('residual root diagnosis audits two checkpoints without changing source replay',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('classifyPrivateResidualRiderSetOriginV4({'));
 assert.ok(patched.includes('audit.baseSourceResidualOriginFirst=classifyPrivateResidualRiderSetOriginV4('));
 assert.ok(patched.includes('audit.baseSourceResidualOriginSecond=classifyPrivateResidualRiderSetOriginV4('));
 assert.ok(patched.includes('phase10Stages:staleStages,detachment:staleDnf'));
 assert.ok(patched.includes('phase10Stages:laterStages,detachment:laterDnf'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(residualSync)'));
 assert.ok(patched.includes('if(residualPolicy.publishable){'));
 assert.ok(!source.includes('classifyPrivateResidualRiderSetOriginV4'));
});

test('DNF survivor pair is source-witnessed, research-only and subject to original strict validator',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("audit.baseSourceResidualOriginFirst?.phase10Initial==="));
 assert.ok(patched.includes("'INITIAL_SAME_RIDERS_DIFFERENT_GROUPS'"));
 assert.ok(patched.includes("'INITIAL_RAW_PHYSICAL'"));
 assert.ok(patched.includes("audit.baseSourceResidualOriginSecond?.recordedMissingCoverage==="));
 assert.ok(patched.includes("'ALL_CONFIRMED_DNF'"));
 assert.ok(patched.includes('buildPrivateResidualDnfSurvivorPairV4({'));
 assert.ok(patched.includes('firstDetachment:staleDnf,secondDetachment:laterDnf'));
 assert.ok(patched.includes('firstPhase10Stages:staleStages,'));
 assert.ok(patched.includes("candidates.push({mode:'DNF_SURVIVOR_PAIR',timeline:survivorPair.timeline})"));
 assert.ok(patched.includes("if(candidate.mode==='DNF_SURVIVOR_PAIR'){"));
 assert.ok(patched.includes("knownStrictIssueCodes.has(code)?code:'OTHER'"));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(residualSync)'));
 assert.ok(patched.includes('if(residualPolicy.publishable){'));
 assert.ok(!source.includes('buildPrivateResidualDnfSurvivorPairV4'));
});

test('autonomous Phase10 pair repair requires independently witnessed groups and original strict gate',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("buildPrivateResidualDnfSurvivorPairV4({"));
 assert.ok(patched.includes("firstPhase10Stages:staleStages,"));
 assert.ok(patched.includes("secondPhase10Stages:laterStages"));
 assert.ok(patched.includes("candidates.push({mode:'DNF_SURVIVOR_PAIR',timeline:survivorPair.timeline})"));
 assert.ok(patched.includes("classifyUniversalReplaySynchronizationForPublication(residualSync)"));
 assert.ok(patched.includes("if(residualPolicy.publishable){"));
 assert.ok(!source.includes("buildPrivateResidualDnfSurvivorPairV4"));
});

test('autonomous group source drift categories stay private and keep strict publication',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('audit.baseSourceResidualDnfPairStage=survivorPair.stage'));
 assert.ok(patched.includes('audit.baseSourceResidualDnfPairDetail=survivorPair.detail'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(residualSync)'));
 assert.ok(!source.includes('audit.baseSourceResidualDnfPairStage'));
});

test('DNF survivor pair strict residual audit classifies position without leaking issue contents',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes('classifyPrivateDnfPairStrictResidualV4({'));
 assert.ok(patched.includes('timeline:candidate.timeline,'));
 assert.ok(patched.includes('blockingIssues:residualPolicy.blockingIssues,'));
 assert.ok(patched.includes('firstId:staleId,secondId:residualId,'));
 assert.ok(patched.includes('baselineIssue:residualIssue,'));
 assert.ok(patched.includes('classifyUniversalReplaySynchronizationForPublication(residualSync)'));
 assert.ok(!source.includes('classifyPrivateDnfPairStrictResidualV4'));
});

test('strict-blocked DNF pair can only trial source-proven earlier exact events',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("diagnostic.position==='BEFORE_PAIR'"));
 assert.ok(patched.includes("diagnostic.transfer==='P_TO_C'"));
 assert.ok(patched.includes("diagnostic.physicalMembership==='UNCHANGED'"));
 assert.ok(patched.includes("diagnostic.kinds==='EVENT_TO_EVENT'"));
 assert.ok(patched.includes("const origin=classifyPrivatePhase10InputProvenanceV4({"));
 assert.ok(patched.includes("const exact=buildPrivateExactEventPhysicalCandidateV4({"));
 assert.ok(patched.includes("if(exact.status==='EXACT_EVENT_CANDIDATE_CREATED')"));
 assert.ok(patched.includes("candidates.push({mode:'DNF_PAIR_PLUS_EXACT'"));
 assert.ok(patched.includes('const residualPolicy=classifyUniversalReplaySynchronizationForPublication(residualSync)'));
 assert.ok(patched.includes('if(residualPolicy.publishable){'));
 assert.ok(!source.includes("mode:'DNF_PAIR_PLUS_EXACT'"));
});

test('original event trial requires stable real source, no Phase10 detach and unchanged strict gate',()=>{
 const source=readFileSync(new URL('../../src/universal-race-engine/runRaceEngine.ts',import.meta.url),'utf8');
 const patched=patchPhysicalReplayProbeSourceV4(source);
 assert.ok(patched.includes("diagnostic.currentOrigin==='ORIGINAL'"));
 assert.ok(patched.includes("diagnostic.previousPhysicalParity==='MATCH'"));
 assert.ok(patched.includes("diagnostic.currentPhysicalParity==='DIFFERS'"));
 assert.ok(patched.includes('const originalEvent=buildPrivateOriginalEventPhysicalHandoffV4({'));
 assert.ok(patched.includes('phase10Stages:sourceStages,'));
 assert.ok(patched.includes('detachment:observedDetachment,'));
 assert.ok(patched.includes('previousDetachment,'));
 assert.ok(patched.includes('?.get(previousSourceId):null'));
 assert.ok(patched.includes("originalEvent.status==='ORIGINAL_EVENT_PHYSICAL_HANDOFF_CREATED'"));
 assert.ok(patched.includes("candidates.push({mode:'DNF_PAIR_PLUS_ORIGINAL_EVENT'"));
 assert.ok(patched.includes('const residualPolicy=classifyUniversalReplaySynchronizationForPublication(residualSync)'));
 assert.ok(patched.includes('if(residualPolicy.publishable){'));
 assert.ok(!source.includes('buildPrivateOriginalEventPhysicalHandoffV4'));
});
