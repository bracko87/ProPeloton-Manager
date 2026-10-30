/**
 * Isolated V4 forensic trace on synthetic fixtures ONLY.
 * Instruments temporary esbuild output, not preserved source code.
 * Strict replay validation still throws; errors are recorded with context.
 */
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'

const home=resolve(import.meta.dirname,'../..')
const temp=mkdtempSync(join(tmpdir(),'ppm-v4-forensic-'))
const outfile=join(temp,'v4-trace.mjs')
const issue='front_group_transfer_without_physical_transition:${riderId}:${previousDisplayCode}->${currentDisplayCode}:${checkpoint.checkpointId}'
const diagnostic=':trace=${JSON.stringify({km:checkpoint.raceProgress.kmFromStart,previousCode:previousDisplayCode,currentCode:currentDisplayCode,previousGap:previous.gaps.find(g=>g.displayCode===previousDisplayCode)?.gapSeconds,currentGap:checkpoint.gaps.find(g=>g.displayCode===currentDisplayCode)?.gapSeconds,previousEnergy:previousState?.liveEnergyPercent,currentEnergy:currentState?.liveEnergyPercent,hasCatch,dropout:newlyDocumentedPhysicalDropouts.has(riderId),eventsAtKm:[...sameKilometreEventTypes],currentEvents:checkpoint.commentary.map(c=>c.eventType),previousGroup:previous.groups.find(g=>g.displayCode===previousDisplayCode)?.riderIds,currentGroup:checkpoint.groups.find(g=>g.displayCode===currentDisplayCode)?.riderIds,bridgeGroups:roadRaceResolution?.phase4Finish?.bridgeGroups?.map(g=>({code:g.displayCode,hasRider:g.riderIds.includes(riderId),target:g.mergeTargetDisplayCode,lineage:g.lineageId,launchKm:g.launchKm,catchKm:g.catchKm,caught:g.caughtByPeloton,merged:g.mergedIntoOpeningBreakaway,mergeKm:g.mergeKm,gaps:g.gapSamples?.slice(-1)}))})}'
const errorMarker="if(!message.startsWith('Universal replay synchronization failed:'))throw error"
try{
 let replacedCore=0,replacedTest=0
 await build({
  absWorkingDir:home,
  entryPoints:['src/race-engine-v4/physicalResearchProbeV4.test.ts'],
  bundle:true,platform:'node',target:'node22',format:'esm',outfile,
  logLevel:'warning',
  plugins:[{name:'v4-synthetic-forensics',setup(ctx){
   ctx.onLoad({filter:/[\\/]runRaceEngine\.ts$/},args=>{
    const src=readFileSync(args.path,'utf8')
    if(src.split(issue).length!==2)throw Error('Unexpected source replay validation implementation')
    replacedCore++
    return {contents:src.replace(issue,issue+diagnostic),loader:'ts'}
   })
   ctx.onLoad({filter:/[\\/]physicalResearchProbeV4\.test\.ts$/},args=>{
    const src=readFileSync(args.path,'utf8')
    if(!src.includes(errorMarker))throw Error('Synthetic test exception classification changed')
    replacedTest++
    return {contents:src.replace(errorMarker,
     errorMarker+"\n if(process.env.V4_REPLAY_TRACE==='1'&&message.includes(':trace='))console.log('V4_REPLAY_TRANSITION_TRACE '+message.slice(0,4700))"
    ),loader:'ts'}
   })
  }}]
 })
 if(replacedCore!==1||replacedTest!==1)throw Error('Trace hooks were not installed exactly once')
 const run=spawnSync(process.execPath,[outfile],{
  cwd:home,encoding:'utf8',timeout:120000,
  env:{...process.env,V4_REPLAY_TRACE:'1',V4_SKIP_EXPLICIT_CHASE_AB:'1'},maxBuffer:6*1024*1024
 })
 if(run.error)throw run.error
 const lines=String(run.stdout??'').split('\n')
 const traces=lines.filter(s=>s.startsWith('V4_REPLAY_TRANSITION_TRACE '))
 const summary=lines.find(s=>s.startsWith('V4_SEVEN_SECOND_MULTI_SEED_REPORT '))
 if(run.status!==0||traces.length!==5||!summary){
  console.error(String(run.stderr??'').slice(-1600))
  throw Error('Physical forensic run failed: status='+run.status+', trace count='+traces.length)
 }
 for(const row of traces)console.log(row)
 console.log(summary)
 console.log('V4_FORENSIC_REPORT '+JSON.stringify({
  status:'PASS',actualReplayValidationExceptions:5,
  originalV2SourceUnmodified:true,strictValidationNotBypassed:true,
  productionWrites:0,dataset:'synthetic_only'
 }))
} finally {
 rmSync(temp,{recursive:true,force:true})
}
