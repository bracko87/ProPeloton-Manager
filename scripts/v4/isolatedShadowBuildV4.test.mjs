import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,statSync,mkdtempSync,rmSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'
import {patchV4CalibratedPhysicalSource} from './calibratedPhysicalTransformV4.mjs'

const root=resolve(import.meta.dirname,'../..')
const engine=resolve(root,'src/universal-race-engine/runRaceEngine.ts')
const worker=resolve(root,'src/race-engine-v4/isolatedShadowWorkerV4.ts')
test('isolated V4 physical worker compiles and rejects unverified inputs without data leakage',
 async()=>{
 const original=readFileSync(engine,'utf8')
 const patch=patchV4CalibratedPhysicalSource(original,{
  peloton:true,cooperation:true,energy:true
 })
 assert.notEqual(patch,original)
 assert.match(patch,/calculateV4Phase3PaceEnergySurcharge/)
 assert.equal(readFileSync(engine,'utf8'),original)
 const folder=mkdtempSync(join(tmpdir(),'ppm-v4-shadow-build-test-'))
 try{
  const output=join(folder,'shadow.mjs')
  let loads=0
  await build({entryPoints:[worker],outfile:output,bundle:true,
   platform:'node',format:'esm',target:'node20',logLevel:'silent',
   plugins:[{name:'v4-source-injection-check',setup(api){
    api.onLoad({filter:/[\\/]src[\\/]universal-race-engine[\\/]runRaceEngine\.ts$/},
     args=>{
      assert.equal(resolve(args.path),engine)
      loads++
      return {contents:patch,loader:'ts',resolveDir:resolve(root,'src/universal-race-engine')}
     })
   }}]})
  assert.equal(loads,1,'V4 source must be patched exactly once')
  assert(statSync(output).size>1000)
  // Deliberately malformed input must fail, not fall back to production solver.
  const child=spawnSync(process.execPath,[output],{
   encoding:'utf8',input:JSON.stringify({
    input:{stage:{stageId:'private-stage-123'}},options:{}
   }),cwd:root,timeout:30000,
   env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',
    TMPDIR:process.env.TMPDIR??'',TEMP:process.env.TEMP??'',
    TMP:process.env.TMP??'',SYSTEMROOT:process.env.SYSTEMROOT??''}
  })
  assert.equal(child.status,1)
  assert.equal(child.stderr,'')
  const lines=child.stdout.trim().split(/\r?\n/)
  assert.equal(lines.length,1)
  assert(lines[0].startsWith('V4_ISOLATED_SHADOW_REPORT '))
  const report=JSON.parse(lines[0].slice('V4_ISOLATED_SHADOW_REPORT '.length))
  assert.equal(report.status,'SHADOW_EXECUTION_REJECTED')
  assert.equal(report.officialWrites,0)
  assert.equal(report.productionEnabled,false)
  assert.equal(report.researchOnly,true)
  assert.doesNotMatch(JSON.stringify(report),/private-stage-123/)
 }finally{rmSync(folder,{recursive:true,force:true})}
})
