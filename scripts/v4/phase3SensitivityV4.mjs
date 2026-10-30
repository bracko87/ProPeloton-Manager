/**
 * V4 RESEARCH ONLY — Phase-3 physical pace sensitivity matrix.
 * Executes the original strict replay physics in temporary esbuild bundles.
 * All V2 source files on disk remain bit-identical; never calls Supabase,
 * dispatches an official race, edits game data, or publishes results.
 */
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'
import {patchV4FinishTransitionSource} from './finishTransitionResearchPatchV4.mjs'
import {patchV4MountainCarriedBridgeSource} from './mountainBridgeCarryResearchPatchV4.mjs'
import {patchV4MountainBridgeCatchSource} from './mountainBridgeCatchResearchPatchV4.mjs'

const root=resolve(import.meta.dirname,'../..')
const folder=mkdtempSync(join(tmpdir(),'ppm-v4-phase3-sensitivity-'))
const needle=(lines)=>lines.join('\n')
const bridgeNeedle="  const authoritativeBridgeGroups = phase4.bridgeGroups\n    .slice()\n    .sort("
const bridgeReplacement=needle([
 "  const authoritativeBridgeGroups = reconcileV4ReplayBridgeMergeTargets(",
 "    phase4.bridgeGroups,",
 "    { openingBreakawayCarriesIntoPhase4,",
 "      activeFrontDisplayCode:openingFrontDisplayCode,",
 "      mergeToleranceSeconds:PHASE5_GROUP_MERGE_TOLERANCE_SECONDS }",
 "  )",
 "    .slice()",
 "    .sort("
])
const paceNeedle=needle([
 "    physicalGapTrajectory.push({",
 "      kmFromStart: deterministicRound(stepEndKm, 6),",
 "      gapSeconds: deterministicRound(physicalCurrentGapSeconds, 6),",
 "    })"
])
const paceReplacement=needle([
 "    physicalGapTrajectory.push({",
 "      kmFromStart: deterministicRound(stepEndKm, 6),",
 "      gapSeconds: deterministicRound(physicalCurrentGapSeconds, 6),",
 "      v4ResearchPace: {",
 "        pelotonPaceKmh, escapePaceKmh,",
 "        selectedResponseMultiplier:response.selectedResponseMultiplier,",
 "        chaseAssets:phase3FiniteChaseAssets,",
 "        chasingTeamCount:physicalChasingTeamIds.length,",
 "        explicitChasingTeamCount:explicitPhase3ChasingTeamIds.length,",
 "        automaticChasingTeamCount:phase3AutomaticFinishInterestTeamIds.length,",
 "        gcThreatChasingTeamCount:phase3GcThreatTeamIds.length,",
 "        cooperationMultiplier:phase3DynamicCooperationMultiplier,",
 "        chaseInterestScore:response.chaseInterestScore,",
 "        chaseCapacityScore:response.chaseCapacityScore,",
 "        responseMode:response.responseMode",
 "      }",
 "    })"
])
const pelotonNeedle=needle([
 "        response.selectedResponseMultiplier *",
 "        // No organized chase: ordinary peloton tempo is not an active pursuit."
])
const pelotonReplacement=needle([
 "        (physicalChasingTeamIds.length>0",
 "          ? Math.max(response.selectedResponseMultiplier,1.015)",
 "          : response.selectedResponseMultiplier) *",
 "        // No organized chase: ordinary peloton tempo is not an active pursuit."
])
const cooperationNeedle="        : phase3DynamicCooperationMultiplier)"
const cooperationReplacement="        : 1 + (phase3DynamicCooperationMultiplier - 1) * 0.5)"
// V4-only seed 33 replay snapshot before the original strict throw.
const forensicNeedle="  if (!replayPublicationPolicy.publishable) {"
const forensicReplacement=forensicNeedle+"\n"+"    if(input.engine.deterministicSeed==='v4-seven-second-regression-033'){\n      console.log('V4_SEED33_FINISH_FORENSIC '+JSON.stringify({\n        seed:input.engine.deterministicSeed,\n        blockingIssues:replayPublicationPolicy.blockingIssues,\n        phase4:{\n          startGapSeconds:roadRaceResolution?.phase4Finish?.startGapSeconds,\n          endGapSeconds:roadRaceResolution?.phase4Finish?.endGapSeconds,\n          breakawayCaught:roadRaceResolution?.phase4Finish?.breakawayCaught,\n          breakawaySurvived:roadRaceResolution?.phase4Finish?.breakawaySurvived,\n          bridgeGroups:roadRaceResolution?.phase4Finish?.bridgeGroups?.map(g=>({\n            displayCode:g.displayCode,riderIds:g.riderIds,catchKm:g.catchKm,\n            mergeKm:g.mergeKm,mergedIntoOpeningBreakaway:g.mergedIntoOpeningBreakaway\n          })),\n          finalChaseSteps:roadRaceResolution?.phase4Finish?.chaseSteps?.slice(-4)\n            .map(g=>({kmStart:g.kmStart,kmEnd:g.kmEnd,\n              startGapSeconds:g.startGapSeconds,endGapSeconds:g.endGapSeconds}))\n        },\n        catches:replayTimeline.checkpoints.filter(cp=>\n          cp.commentary.some(c=>c.eventType==='catch')).map(cp=>({\n            id:cp.checkpointId,km:cp.raceProgress.kmFromStart,\n            groups:cp.groups.map(g=>({code:g.displayCode,riders:g.riderIds}))\n          })).slice(-20),\n        checkpoints:replayTimeline.checkpoints.slice(-8).map(cp=>({\n          id:cp.checkpointId,km:cp.raceProgress.kmFromStart,\n          finalResultsVisible:cp.finalResultsVisible,\n          groups:cp.groups.map(g=>({code:g.displayCode,riders:g.riderIds,\n            lineageId:g.physicalLineageId,position:g.physicalPosition})),\n          gaps:cp.gaps.map(g=>({code:g.displayCode,seconds:g.gapSeconds})),\n          events:cp.commentary.map(c=>({type:c.eventType,riders:c.riderIds}))\n        }))\n      }))\n    }"
const energyNeedle="    const phaseEnergyCost = phaseEnergyCostByRiderId.get(row.riderId) ?? 0"
const energyReplacement="    const v4OriginalPhaseEnergyCost = phaseEnergyCostByRiderId.get(row.riderId) ?? 0\n    const v4PaceEnergySurcharge = calculateV4Phase3PaceEnergySurcharge({\n      riderId:row.riderId,\n      escapeRiderIds:physicalEscapeRiderIdsAtLaunch,\n      chasingRiderIds:phase3ChaseWorkerRows.map(({row})=>row.riderId),\n      baseEnergyCost:v4OriginalPhaseEnergyCost,\n      phaseStartKm:phaseBoundary.startKm,\n      samples:physicalGapTrajectory.map(sample=>({\n        kmFromStart:sample.kmFromStart,\n        referencePaceKmh:calculateRoadReferencePaceKmh(input.stage,sample.kmFromStart),\n        pelotonPaceKmh:sample.v4ResearchPace?.pelotonPaceKmh??null,\n        escapePaceKmh:sample.v4ResearchPace?.escapePaceKmh??null\n      }))\n    })\n    const phaseEnergyCost = deterministicRound(v4OriginalPhaseEnergyCost+v4PaceEnergySurcharge,6)"

const mountainForensicNeedle="  if (!replayPublicationPolicy.publishable) {"
const mountainForensicSnippet=[
 "  if(!replayPublicationPolicy.publishable && input.engine.deterministicSeed.startsWith('v4-stress-mountain-')){",
 "    const cps=replayTimeline.checkpoints",
 "    const carried=cps.map((c,i)=>({c,i})).filter(x=>x.c.checkpointId.includes('bridge-carried-') || x.c.checkpointId.includes('bridge-caught-') || x.c.checkpointId.includes('late-chase-step-12'))",
 "    const around=carried.flatMap(({i})=>cps.slice(Math.max(0,i-2),i+3))",
 "    const selected=[...new Map(around.map(c=>[c.checkpointId,c])).values()]",
 "    console.log('V4_MOUNTAIN_BRIDGE_FORENSIC '+JSON.stringify({",
 "      seed:input.engine.deterministicSeed,",
 "      blockingIssues:replayPublicationPolicy.blockingIssues,",
 "      bridges:roadRaceResolution?.phase4Finish?.bridgeGroups?.map(b=>({",
 "        code:b.displayCode,lineageId:b.lineageId,carried:b.carriedFromPreviousPhase,",
 "        riders:b.riderIds,launchKm:b.launchKm,mergeKm:b.mergeKm,catchKm:b.catchKm,",
 "        caught:b.caughtByPeloton,mergeTarget:b.mergeTargetDisplayCode,",
 "        launchGapToLeader:b.launchGapToLeaderSeconds,launchGapToPeloton:b.launchGapToPelotonSeconds,",
 "        firstGapSamples:b.gapSamples.slice(0,2),lastGapSamples:b.gapSamples.slice(-2)",
 "      })),",
 "      finishState:{endGapSeconds:roadRaceResolution?.phase4Finish?.endGapSeconds,",
 "        startGapSeconds:roadRaceResolution?.phase4Finish?.startGapSeconds,",
 "        breakawaySurvived:roadRaceResolution?.phase4Finish?.breakawaySurvived,",
 "        breakawayCaught:roadRaceResolution?.phase4Finish?.breakawayCaught},",
 "      finishCheckpoints:cps.filter(c=>c.raceProgress.kmFromStart>=stageDistanceKm-.1).slice(-9).map(c=>({",
 "        id:c.checkpointId,km:c.raceProgress.kmFromStart,final:c.finalResultsVisible,",
 "        groups:c.groups.filter(g=>g.displayCode.startsWith('B')||g.displayCode.startsWith('F')||g.displayCode==='P'||g.riderIds.includes('rider-050')||g.riderIds.includes('rider-071')).map(g=>({code:g.displayCode,lin:g.physicalLineageId,riders:g.riderIds,gap:g.gapSeconds})),",
 "        events:c.commentary.map(e=>({type:e.eventType,riders:e.riderIds}))",
 "      })),",
 "      checkpoints:selected.map(c=>({id:c.checkpointId,km:c.raceProgress.kmFromStart,",
 "        groups:c.groups.map(g=>({code:g.displayCode,lineageId:g.physicalLineageId,",
 "          riders:g.riderIds,gap:g.gapSeconds})),",
 "        events:c.commentary.map(e=>({type:e.eventType,riders:e.riderIds,lineageId:e.physicalLineageId}))",
 "      }))",
 "    }))",
 "  }"
].join('\n')
const configs=[
 {key:'baseline',peloton:false,cooperation:false,energy:false},
 {key:'peloton_response',peloton:true,cooperation:false,energy:false},
 {key:'breakaway_cooperation',peloton:false,cooperation:true,energy:false},
 {key:'combined',peloton:true,cooperation:true,energy:false},
 {key:'combined_energy',peloton:true,cooperation:true,energy:true}
]
const exact=(source,from,to)=>{
 if(source.split(from).length!==2)throw Error('V2 research anchor changed or ambiguous: '+from.slice(0,110))
 return source.replace(from,to)
}
const median=(values)=>{
 if(values.length===0)return null
 const arr=[...values].sort((a,b)=>a-b)
 return Number(arr[Math.floor(arr.length/2)].toFixed(6))
}
const field=(cases,key)=>median(cases.map(x=>x[key]).filter(x=>typeof x==='number'&&Number.isFinite(x)))
const paced=(cases,key)=>median(cases.map(x=>x.pace?.[key]).filter(x=>typeof x==='number'&&Number.isFinite(x)))
const results=[]
try{
 for(const config of configs){
  let transformed=0
  const out=join(folder,config.key+'.mjs')
  await build({
   absWorkingDir:root,
   entryPoints:['src/race-engine-v4/physicalResearchProbeV4.test.ts'],
   bundle:true,platform:'node',format:'esm',target:'node22',outfile:out,
   logLevel:'warning',
   plugins:[{name:'v4-only-phase3-physical-sensitivity',setup(ctx){
    ctx.onLoad({filter:/[\\/]runRaceEngine\.ts$/},args=>{
     let source=readFileSync(args.path,'utf8')
     source=exact(source,bridgeNeedle,bridgeReplacement)
     source=exact(source,paceNeedle,paceReplacement)
     source=exact(source,mountainForensicNeedle,mountainForensicSnippet+'\n'+forensicReplacement)
     // Before applying either candidate, verify both knobs remain unique.
     if(source.split(pelotonNeedle).length!==2||
        source.split(cooperationNeedle).length!==2)
      throw Error('Phase-3 physical source changed; refuse fuzzy calibration')
     if(config.peloton)source=exact(source,pelotonNeedle,pelotonReplacement)
     if(config.cooperation)source=exact(source,cooperationNeedle,cooperationReplacement)
     if(source.split(energyNeedle).length!==2)throw Error('Phase-3 energy source drift')
     if(config.energy)source=exact(source,energyNeedle,energyReplacement)
     transformed++
     return {
      contents:"import { reconcileV4ReplayBridgeMergeTargets } from '../race-engine-v4/bridgeHandoffV4.ts'\nimport {calculateV4Phase3PaceEnergySurcharge} from '../race-engine-v4/phase3PaceEnergyV4.ts'\n"+patchV4MountainBridgeCatchSource(patchV4MountainCarriedBridgeSource(patchV4FinishTransitionSource(source))),
      loader:'ts'
     }
    })
   }}]
  })
  if(transformed!==1)throw Error(config.key+': in-memory V2 source transform not applied once')
  const run=spawnSync(process.execPath,[out],{
   cwd:root,encoding:'utf8',
   env:{...process.env,V4_PHASE3_SENSITIVITY:'1',
    V4_FIELD_TERRAIN_STRESS:['baseline','combined','combined_energy'].includes(config.key)?'1':'0'},
   timeout:240000,maxBuffer:20*1024*1024
  })
  if(run.error)throw run.error
  const lines=String(run.stdout??'').split('\n')
  const get=(prefix)=>{
   const found=lines.find(x=>x.startsWith(prefix+' '))
   return found?JSON.parse(found.slice(prefix.length+1)):null
  }
  const stress=get('V4_FIELD_TERRAIN_STRESS_REPORT')
  const diag=get('V4_SEVEN_SECOND_MULTI_SEED_REPORT')
  const seeds=get('V4_PHASE3_SENSITIVITY_SEEDS')
  if(run.status!==0||!diag||!seeds||seeds.cases.length!==36||
    (['baseline','combined','combined_energy'].includes(config.key)&&stress?.attempted!==12)){
   console.error(String(run.stderr??'').slice(-1800))
   throw Error(config.key+': strict replay suite, diagnostic extraction or seed count failed')
  }
  if(!seeds.researchOnly||seeds.officialRaceWrites!==0)
   throw Error('V4 experiment lost its read-only invariant')
  const forensic=get('V4_SEED33_FINISH_FORENSIC')
  const mountainForensics=lines.filter(x=>x.startsWith('V4_MOUNTAIN_BRIDGE_FORENSIC '))
   .map(x=>JSON.parse(x.slice('V4_MOUNTAIN_BRIDGE_FORENSIC '.length)))
  const cases=seeds.cases
  if(cases.some(x=>x.completed&&x.officialWrites!==0))
   throw Error('Official race writes were reported')
  results.push({key:config.key,config,diag,cases,forensic,stress,mountainForensics})
  console.log('V4_PHASE3_CANDIDATE_RUN '+JSON.stringify({
   candidate:config.key,
   smallFieldCompleted:diag.v4Complete,
   smallFieldReplayExceptions:diag.v4ReplayExceptions,
   smallFieldAcceptedEscapes:diag.v4WithEscape,
   largerFieldComplete:cases.filter(x=>x.completed).length,
   largerFieldAcceptedEscape:cases.filter(x=>x.completed&&x.acceptedBreakaway>0).length,
   largerFieldReplayExceptions:cases.filter(x=>!x.completed).length,
   originalV2SourceModified:false,officialWrites:0
  }))
 }
 const common=Array.from({length:36},(_,i)=>i).filter(seed=>
  results.every(r=>{
   const x=r.cases[seed]
   return x?.completed&&x?.replaySynchronized&&x?.acceptedBreakaway>0&&x?.pace?.instrumented
  }))
 if(common.length===0)throw Error('No valid matched escape races across all Phase-3 variants')
 for(const seed of common){
  const hashes=results.map(r=>r.cases[seed].sourceSnapshotHash)
  if(hashes.some(x=>!x)||new Set(hashes).size!==1)
   throw Error('Calibrations changed the locked input snapshot for seed '+seed)
 }
 const comparable=results.map(r=>{
  const cases=common.map(seed=>r.cases[seed])
  return {
   candidate:r.key,
   medianPhase3GapGrowthSeconds:field(cases,'phase3GrowthSeconds'),
   medianMaxGapSeconds:field(cases,'maximumGapSeconds'),
   medianPelotonKmh:paced(cases,'medianPelotonPaceKmh'),
   medianEscapeKmh:paced(cases,'medianEscapePaceKmh'),
   medianEscapeSpeedAdvantageKmh:paced(cases,'medianSpeedAdvantageToEscapeKmh'),
   medianPhase3ChaseResponse:paced(cases,'medianSelectedResponseMultiplier'),
   medianPhase3ChaseAssets:paced(cases,'medianChaseAssets'),
   medianBreakawayCooperation:paced(cases,'medianCooperationMultiplier'),
   medianFrontEnergySpent:field(cases,'phase3FrontEnergySpent'),
   medianPhase3GapGrowingKm:paced(cases,'gapGrowingKm'),
   completedSmallField:r.diag.v4Complete,
   replayExceptionsSmallField:r.diag.v4ReplayExceptions
  }
 })
 const baseline=results[0]
 const paired=results.slice(1).map(r=>({
  candidate:r.key,
  gapReductionCases:common.filter(seed=>
   baseline.cases[seed].phase3GrowthSeconds>r.cases[seed].phase3GrowthSeconds+0.000001).length,
  gapIncreaseCases:common.filter(seed=>
   baseline.cases[seed].phase3GrowthSeconds<r.cases[seed].phase3GrowthSeconds-0.000001).length,
  medianPairedPhase3GapReductionSeconds:median(common.map(seed=>
   baseline.cases[seed].phase3GrowthSeconds-r.cases[seed].phase3GrowthSeconds)),
  medianPairedMaxGapReductionSeconds:median(common.map(seed=>
   baseline.cases[seed].maximumGapSeconds-r.cases[seed].maximumGapSeconds))
 }))
 const replayFailureSamples=results.map(r=>({
  candidate:r.key,
  failures:r.cases.filter(x=>!x.completed).map(x=>({seed:x.seed,reason:x.replayError})).slice(0,12)
 }))
 const energyInvariance=results.slice(1).map(r=>({
  candidate:r.key,
  differentFrontEnergyCases:common.filter(seed=>
   Math.abs((baseline.cases[seed].phase3FrontEnergySpent??0)-
    (r.cases[seed].phase3FrontEnergySpent??0))>0.000001).length,
  medianPairedFrontEnergyDelta:median(common.map(seed=>
   (r.cases[seed].phase3FrontEnergySpent??0)-
   (baseline.cases[seed].phase3FrontEnergySpent??0)))
 }))
 const strictCandidates=results.map(r=>({
  candidate:r.key,
  smallFieldPassed:r.diag.v4Complete===36&&r.diag.v4ReplayExceptions===0,
  largerFieldReplayFailures:r.cases.filter(x=>!x.completed).length
 }))
 const noEnergy=results.find(r=>r.key==='combined')
 const withEnergy=results.find(r=>r.key==='combined_energy')
 if(!noEnergy||!withEnergy)throw Error('Missing paired energy variants')
 const energyEffect={
  matchedCases:common.length,
  medianFrontEnergyBaseline:field(common.map(seed=>noEnergy.cases[seed]),'phase3FrontEnergySpent'),
  medianFrontEnergyAdjusted:field(common.map(seed=>withEnergy.cases[seed]),'phase3FrontEnergySpent'),
  medianPairedAdditionalFrontEnergy:median(common.map(seed=>
   withEnergy.cases[seed].phase3FrontEnergySpent-
   noEnergy.cases[seed].phase3FrontEnergySpent)),
  casesFrontEnergyIncreased:common.filter(seed=>
   withEnergy.cases[seed].phase3FrontEnergySpent>
   noEnergy.cases[seed].phase3FrontEnergySpent+0.000001).length,
  casesFrontEnergyDecreased:common.filter(seed=>
   withEnergy.cases[seed].phase3FrontEnergySpent<
   noEnergy.cases[seed].phase3FrontEnergySpent-0.000001).length,
  casesMaxGapChanged:common.filter(seed=>
   Math.abs(withEnergy.cases[seed].maximumGapSeconds-
    noEnergy.cases[seed].maximumGapSeconds)>0.000001).length
 }
 const baselineStress=results.find(r=>r.key==='baseline')?.stress
 const combinedStress=results.find(r=>r.key==='combined')?.stress
 const energyStress=results.find(r=>r.key==='combined_energy')?.stress
 if(!baselineStress||!combinedStress||!energyStress)
  throw Error('Baseline/combined/energy terrain stress results are required')
 const stressComparison=baselineStress.cases.map((row,index)=>{
  const normal=combinedStress.cases[index]
  const variant=energyStress.cases[index]
  if(!normal||!variant||
   [normal,variant].some(x=>row.terrain!==x.terrain||
    row.riders!==x.riders||row.seedNumber!==x.seedNumber))
   throw Error('Stress fixtures must be matched and ordered')
  const valid=[row,normal,variant].filter(x=>x.completed)
  if(valid.length>1&&new Set(valid.map(x=>x.sourceSnapshotHash)).size!==1)
   throw Error('Stress input snapshots not identical')
  return {
   terrain:row.terrain,riders:row.riders,seedNumber:row.seedNumber,
   baselineCompleted:row.completed,combinedCompleted:normal.completed,
   energyCompleted:variant.completed,
   baselineError:row.replayError,combinedError:normal.replayError,
   energyError:variant.replayError,
   baselineGapSeconds:row.maxGapSeconds,
   combinedGapSeconds:normal.maxGapSeconds,
   energyGapSeconds:variant.maxGapSeconds,
   baselineFrontEnergy:row.phase3FrontEnergySpent,
   combinedFrontEnergy:normal.phase3FrontEnergySpent,
   energyFrontEnergy:variant.phase3FrontEnergySpent,
   snapshotsConsistent:valid.length>1?
    new Set(valid.map(x=>x.sourceSnapshotHash)).size===1:null
  }
 })
 const eligibleEnergyPairs=stressComparison.filter(x=>x.combinedCompleted&&x.energyCompleted)
 const stressSummary={
  attemptedPerVariant:baselineStress.attempted,
  comparisons:stressComparison,
  completedAllThree:stressComparison.filter(x=>x.baselineCompleted&&x.combinedCompleted&&x.energyCompleted).length,
  replayFailuresBaseline:stressComparison.filter(x=>!x.baselineCompleted).length,
  replayFailuresCombined:stressComparison.filter(x=>!x.combinedCompleted).length,
  replayFailuresEnergy:stressComparison.filter(x=>!x.energyCompleted).length,
  newReplayFailuresFromEnergy:stressComparison.filter(x=>x.combinedCompleted&&!x.energyCompleted).length,
  recoveredReplayFailuresWithEnergy:stressComparison.filter(x=>!x.combinedCompleted&&x.energyCompleted).length,
  validEnergyOnlyPairs:eligibleEnergyPairs.length,
  casesEnergyOnlyFrontFatigueIncreased:eligibleEnergyPairs.filter(x=>
   x.combinedFrontEnergy!==null&&x.energyFrontEnergy!==null&&
   x.energyFrontEnergy>x.combinedFrontEnergy+0.000001).length,
  casesEnergyOnlyFrontFatigueDecreased:eligibleEnergyPairs.filter(x=>
   x.combinedFrontEnergy!==null&&x.energyFrontEnergy!==null&&
   x.energyFrontEnergy<x.combinedFrontEnergy-0.000001).length,
  casesEnergyOnlyMaximumGapChanged:eligibleEnergyPairs.filter(x=>
   x.combinedGapSeconds!==null&&x.energyGapSeconds!==null&&
   Math.abs(x.energyGapSeconds-x.combinedGapSeconds)>0.000001).length,
  terrains:['flat','mountain'],riderCounts:[96,168],
  strictReplayStillActive:true,officialWrites:0,
  realismApproval:'BLOCKED_PENDING_MOUNTAIN_REPLAY_RECONCILIATION'
 }
 const seed33Forensics=results.map(r=>({candidate:r.key,forensic:r.forensic}))
 const report={
  status:'DIAGNOSTIC_ONLY_NO_REALISM_APPROVAL',
  seeds:36,matchedValidAcceptedEscapes:common.length,
  scenarios:configs.map(x=>x.key),
  measured:comparable,pairedVsBaseline:paired,
  strictReplay:strictCandidates,
  replayFailureSamples,energyInvariance,energyEffect,stressSummary,seed33Forensics,
  mountainForensicEvidence:results.filter(r=>r.mountainForensics.length>0).map(r=>({candidate:r.key,cases:r.mountainForensics})),
  pelotonCandidate:'Phase-3 organized pursuit minimum response 1.015',
  cooperationCandidate:'Phase-3 dynamic cooperation contribution reduced by 50% only on full-cooperation branch',
  energyCandidate:'Bounded physical speed-relative cost, only recorded Phase-3 front and chase workers; post-phase effect only',
  changedPhysicsInMemory:true,originalV2SourceModified:false,
  officialRaceWrites:0,syntheticOnly:true,strictValidatorStillEnabled:true
 }
 console.log('V4_PHASE3_CALIBRATION_MATRIX '+JSON.stringify(report))
 if(strictCandidates.some(x=>!x.smallFieldPassed||x.largerFieldReplayFailures!==0))
  throw Error('A V4 candidate regressed the strict 36-seed or 30-rider replay baseline')
 if(results.some(r=>{
  const seed33=r.cases[33]
  return !seed33?.completed||!seed33?.replaySynchronized||
   seed33.officialWrites!==0||r.forensic!==null
 }))
  throw Error('V4 seed-33 physical finish grouping replay must remain strictly valid')

 if(energyEffect.casesFrontEnergyIncreased===0||energyEffect.casesFrontEnergyDecreased!==0)
  throw Error('V4 energy candidate did not produce physically directional fatigue')
 if(replayFailureSamples.some(x=>x.failures.some(f=>!f.reason)))
  throw Error('A replay failure was not classified')
}finally{
 rmSync(folder,{recursive:true,force:true})
}
