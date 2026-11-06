import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,statSync,mkdtempSync,rmSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'
import {patchV4CalibratedPhysicalSource} from './calibratedPhysicalTransformV4.mjs'
import {isValidV4PhysicalPatch} from './runIsolatedShadowV4.mjs'

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
 // A Windows git checkout can be CRLF. The V4 transform converts it to
 // LF, so physical patch validation must compare like-for-like lengths.
 const winSource=original.replace(/\r\n?/g,'\n').replace(/\n/g,'\r\n')
 const winPatch=patchV4CalibratedPhysicalSource(winSource,{
  peloton:true,cooperation:true,energy:true
 })
 assert.equal(winPatch,patch,'CRLF and LF sources produce identical V4 physics')
 assert.equal(isValidV4PhysicalPatch(original,patch),true)
 assert.equal(isValidV4PhysicalPatch(winSource,winPatch),true,
  'CRLF checkout must not reject a valid physical patch')
 assert.equal(isValidV4PhysicalPatch(winSource,original),false,
  'unpatched source must still fail closed')

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
  // Execute the ACTUAL calibrated physical solver on a complete public
  // synthetic locked stage, with one human team and one AI team. No database.
  const fixtureBundle=join(folder,'synthetic-envelope.mjs')
  await build({
   entryPoints:[resolve(root,'scripts/v4/syntheticLockedRaceV4.ts')],
   outfile:fixtureBundle,bundle:true,platform:'node',format:'esm',
   target:'node20',logLevel:'silent'
  })
  const fixture=spawnSync(process.execPath,[fixtureBundle],{
   cwd:root,encoding:'utf8',timeout:30000,
   env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',
    TMPDIR:process.env.TMPDIR??'',TEMP:process.env.TEMP??'',
    TMP:process.env.TMP??'',SYSTEMROOT:process.env.SYSTEMROOT??''}
  })
  assert.equal(fixture.status,0,'synthetic public fixture runtime failed: '+
   String(fixture.stderr??'').slice(0,1200))
  const envelope=JSON.parse(fixture.stdout)
  assert.equal(envelope.input.stage.stageId,'stage-1')
  assert.equal(envelope.options.teamControl.filter(x=>x.kind==='ai').length,1)
  const live=spawnSync(process.execPath,[output],{
   cwd:root,encoding:'utf8',timeout:180000,
   input:fixture.stdout,maxBuffer:512*1024,
   env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',
    TMPDIR:process.env.TMPDIR??'',TEMP:process.env.TEMP??'',
    TMP:process.env.TMP??'',SYSTEMROOT:process.env.SYSTEMROOT??''}
  })
  assert([0,1].includes(live.status))
  assert.equal(live.stderr,'')
  const liveLines=live.stdout.trim().split(/\r?\n/)
  assert.equal(liveLines.length,1)
  assert(liveLines[0].startsWith('V4_ISOLATED_SHADOW_REPORT '))
  const syntheticReport=JSON.parse(
   liveLines[0].slice('V4_ISOLATED_SHADOW_REPORT '.length))
  assert(['SHADOW_STRICT_REPLAY_PASS','SHADOW_STRICT_REPLAY_BLOCKED']
   .includes(syntheticReport.status),
   'synthetic stage must reach actual calibrated physics and strict gate')
  assert.equal(syntheticReport.officialWrites,0)
  assert.equal(syntheticReport.productionEnabled,false)
  assert.equal(syntheticReport.researchOnly,true)
  assert.equal(syntheticReport.aiTeams,1)
  assert.equal(syntheticReport.humanTeams,1)
  assert.doesNotMatch(live.stdout,/rider-1|stage-1|race-1/)
  assert.equal(live.status,syntheticReport.status==='SHADOW_STRICT_REPLAY_PASS'?0:1)
  // Exercise the public, user-callable wrapper as well: path validation,
  // isolated rebuild, sanitized report and automatic cleanup.
  const privateFile=join(folder,'synthetic-private-envelope.json')
  writeFileSync(privateFile,fixture.stdout,{encoding:'utf8',mode:0o600,flag:'wx'})
  const cli=spawnSync(process.execPath,[
   resolve(root,'scripts/v4/runIsolatedShadowV4.mjs'),privateFile
  ],{
   cwd:root,encoding:'utf8',timeout:180000,maxBuffer:512*1024,
   env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',
    TMPDIR:process.env.TMPDIR??'',TEMP:process.env.TEMP??'',
    TMP:process.env.TMP??'',SYSTEMROOT:process.env.SYSTEMROOT??''}
  })
  assert([0,1].includes(cli.status),'offline wrapper must finish')
  assert.equal(cli.stderr,'')
  const cliLines=cli.stdout.trim().split(/\r?\n/)
  assert.equal(cliLines.length,1)
  assert(cliLines[0].startsWith('V4_ISOLATED_SHADOW_SUMMARY '))
  const cliReport=JSON.parse(
   cliLines[0].slice('V4_ISOLATED_SHADOW_SUMMARY '.length))
  assert.equal(cliReport.status,syntheticReport.status)
  assert.equal(cliReport.officialWrites,0)
  assert.equal(cliReport.productionEnabled,false)
  assert.equal(cliReport.calibration,'peloton_cooperation_energy')
  assert.doesNotMatch(cli.stdout,/rider-1|stage-1|race-1/)
  assert.equal(cli.status,syntheticReport.status==='SHADOW_STRICT_REPLAY_PASS'?0:1)
  console.log('V4_SYNTHETIC_OFFLINE_EXECUTION '+JSON.stringify({
   endToEnd:true,strictStatus:cliReport.status,
   replayQuality:cliReport.replayQuality,
   officialWrites:cliReport.officialWrites,
   aiTeams:cliReport.aiTeams,humanTeams:cliReport.humanTeams
  }))
 }finally{rmSync(folder,{recursive:true,force:true})}
})
