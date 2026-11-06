import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'
import {runPrivateControlledFourWayV4}
 from './runPrivateControlledFourWayV4.mjs'
const root=resolve(import.meta.dirname,'../..')
const safeEnv={PATH:process.env.PATH??'',HOME:process.env.HOME??'',
 TEMP:process.env.TEMP??'',TMP:process.env.TMP??'',
 TMPDIR:process.env.TMPDIR??'',SYSTEMROOT:process.env.SYSTEMROOT??''}
test('complete public 108-rider historical-shaped four-way report passes private gates',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'ppm-v4-private-four-way-positive-'))
 const engine=resolve(root,'src/universal-race-engine/runRaceEngine.ts')
 const original=readFileSync(engine,'utf8')
 try{
  const fixtureBundle=join(folder,'synthetic.mjs')
  const referenceBundle=join(folder,'reference.mjs')
  await build({entryPoints:[resolve(root,'scripts/v4/syntheticHilly108LockedRaceV4.ts')],
   outfile:fixtureBundle,bundle:true,platform:'node',format:'esm',target:'node20',logLevel:'silent'})
  await build({entryPoints:[resolve(root,'scripts/v4/syntheticPrivateFourWayReferenceV4.ts')],
   outfile:referenceBundle,bundle:true,platform:'node',format:'esm',target:'node20',logLevel:'silent'})
  const generated=spawnSync(process.execPath,[fixtureBundle],{
   cwd:root,encoding:'utf8',env:safeEnv,timeout:30000,maxBuffer:3*1024*1024
  })
  assert.equal(generated.status,0,'Synthetic race fixture build failed')
  const reference=spawnSync(process.execPath,[referenceBundle],{
   cwd:root,encoding:'utf8',input:generated.stdout,env:safeEnv,
   timeout:120000,maxBuffer:8*1024*1024
  })
  assert.equal(reference.status,0,'Synthetic reference generation failed')
  const envelope=JSON.parse(reference.stdout)
  assert.equal(envelope.reference.officialRows.length,108)
  const result=await runPrivateControlledFourWayV4(envelope)
  assert.equal(result.status,'V4_CONTROLLED_FOUR_WAY_COMPLETE')
  assert.equal(result.researchOnly,true)
  assert.equal(result.officialWrites,0)
  assert.equal(result.productionEnabled,false)
  assert.equal(result.sharedReconstructedInputAndSeed,true)
  assert.equal(result.ridersCompared,108)
  for(const [key,value] of Object.entries(result.cases)){
   assert.equal(typeof value.observedBreakawayPeakSeconds,'number',
    'All four scenarios must produce physical-gap diagnostics: '+key)
  }
  assert.doesNotMatch(JSON.stringify(result),/v4-synthetic-stage-01|rider-001|team-1/)
  assert.equal(readFileSync(engine,'utf8'),original,'Production source was mutated')
  console.log('V4_PUBLIC_FOUR_WAY_POSITIVE '+JSON.stringify({
   pass:true,casePeaks:Object.fromEntries(
    Object.entries(result.cases).map(([key,value])=>[key,value.observedBreakawayPeakSeconds])),
   isolatedRankChanges:Object.fromEntries(
    Object.entries(result.isolatedEffects).map(([key,value])=>[key,value.rankChangedRiders])),
   officialWrites:result.officialWrites
  }))
 }finally{rmSync(folder,{recursive:true,force:true})}
})
