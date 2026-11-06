import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,dirname} from 'node:path'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'
import {patchV4CalibratedPhysicalSource} from './calibratedPhysicalTransformV4.mjs'

const root=resolve(import.meta.dirname,'../..')
const engine=resolve(root,'src/universal-race-engine/runRaceEngine.ts')
const worker=resolve(root,'src/race-engine-v4/syntheticControlledFourWayWorkerV4.ts')
const fixture=resolve(root,'scripts/v4/syntheticHilly108LockedRaceV4.ts')
const env={PATH:process.env.PATH??'',HOME:process.env.HOME??'',
 TEMP:process.env.TEMP??'',TMP:process.env.TMP??'',
 TMPDIR:process.env.TMPDIR??'',SYSTEMROOT:process.env.SYSTEMROOT??''}
test('public hilly 108-rider 2x2 comparison uses separate physics and shared inputs',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'ppm-v4-public-four-way-'))
 try{
  const original=readFileSync(engine,'utf8')
  const patch=patchV4CalibratedPhysicalSource(original,{
   peloton:true,cooperation:true,energy:true
  })
  const fixtureBundle=join(folder,'fixture.mjs')
  await build({entryPoints:[fixture],outfile:fixtureBundle,
   bundle:true,platform:'node',format:'esm',target:'node20',logLevel:'silent'})
  const generated=spawnSync(process.execPath,[fixtureBundle],{
   cwd:root,encoding:'utf8',env,timeout:30000,maxBuffer:2*1024*1024
  })
  assert.equal(generated.status,0,'public fixture must compile')
  const input=JSON.parse(generated.stdout)
  assert.equal(input.input.riders.length,108)
  const workerBundle=join(folder,'public-four-way.mjs')
  let patchedLoads=0,baselineLoads=0
  await build({
   entryPoints:[worker],outfile:workerBundle,bundle:true,
   platform:'node',format:'esm',target:'node20',logLevel:'silent',
   plugins:[{name:'v4-public-dual-physical-source',setup(api){
    api.onResolve({filter:/^ppm-v4-calibrated-physical$/},()=>({
     path:engine,namespace:'ppm-v4-public-physics'
    }))
    api.onLoad({filter:/.*/,namespace:'ppm-v4-public-physics'},args=>{
     assert.equal(resolve(args.path),engine)
     patchedLoads++
     return {contents:patch,loader:'ts',resolveDir:dirname(engine)}
    })
    api.onLoad({filter:/[\\/]src[\\/]universal-race-engine[\\/]runRaceEngine\.ts$/},args=>{
     assert.equal(resolve(args.path),engine)
     baselineLoads++
     return {contents:original,loader:'ts',resolveDir:dirname(engine)}
    })
   }}]
  })
  assert.equal(patchedLoads,1)
  assert.equal(baselineLoads,1)
  const child=spawnSync(process.execPath,[workerBundle],{
   cwd:root,encoding:'utf8',env,timeout:240000,maxBuffer:512*1024,
   input:generated.stdout
  })
  assert.equal(child.status,0,'public four-way worker must complete')
  assert.equal(child.stderr,'')
  const lines=child.stdout.trim().split(/\r?\n/)
  assert.equal(lines.length,1)
  assert(lines[0].startsWith('V4_SYNTHETIC_FOUR_WAY '))
  const report=JSON.parse(lines[0].slice('V4_SYNTHETIC_FOUR_WAY '.length))
  assert.equal(report.contract,'ppm.v4.public-synthetic-factorial.v1')
  assert.equal(report.realHistoricalStage,false)
  assert.equal(report.productionEnabled,false)
  assert.equal(report.officialWrites,0)
  assert.equal(report.sameSeed,true)
  assert.equal(report.sameRiderSet,true)
  for(const scenario of Object.values(report.cases)){
   assert.equal(scenario.status,'STRICT_REPLAY_PASS')
   assert(scenario.openingBreakawaySize>0,
    'Both tactics variants must contain a genuine breakaway')
  }
  assert(report.plannedAIIntents>0)
  assert.deepEqual(Object.keys(report.cases),[
   'baselineOriginal','baselineV4Tactics','v4Original','v4V4Tactics'])
  assert.doesNotMatch(child.stdout,/PRIVATE|PASSWORD|SERVICE_ROLE/)
  assert.equal(readFileSync(engine,'utf8'),original,
   'main engine source remains unchanged')
  console.log('V4_SYNTHETIC_CONTROLLED_RESULT '+JSON.stringify(report))
 }finally{rmSync(folder,{recursive:true,force:true})}
})
