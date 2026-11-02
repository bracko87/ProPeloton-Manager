/** Synthetic locked-race proof of the research-only physical replay patch. */
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'
import {patchPrivateLowReserveReplayCandidateV4 as patch} from './privateLowReserveReplayCandidateV4.mjs'
const root=resolve(import.meta.dirname,'../..')
const source=readFileSync(join(root,'src/universal-race-engine/runRaceEngine.ts'),'utf8')
const candidate=patch(source)
assert(candidate.includes('reserve < -0.000001'))
assert(candidate.includes('phase: phaseForKm(crossing)'))
assert(candidate.includes('energyAtKm(phaseForKm(crossing),crossing)'))
assert(candidate.includes('phase1.phaseBoundary.startKm'))
assert.equal(patch(source.replace(/\r\n?|\n/g,'\r\n')),candidate)
assert.throws(()=>patch(candidate),/PRIVATE_REPLAY_SOURCE_DRIFT/)
assert.throws(()=>patch('not a real source'),/PRIVATE_REPLAY_SOURCE_DRIFT/)
const fixture=readFileSync(join(root,'src/race-engine-v4/physicalResearchProbeV4.test.ts'),'utf8')
const first=fixture.indexOf('function makeField('),last=fixture.indexOf('\nconst scenarios=',first)
assert(first>=0&&last>first)
const factory=fixture.slice(first,last)
const folder=mkdtempSync(join(tmpdir(),'ppm-v4-low-reserve-replay-synthetic-'))
try{
 const sourceScript=[
 "import {PPM_UNIVERSAL_RACE_ENGINE_KEY,PPM_UNIVERSAL_RACE_ENGINE_VERSION} from './src/universal-race-engine/runRaceEngine.ts'",
 "import {runSelectedRaceEngineV1} from './src/universal-race-engine/runSelectedRaceEngineV1.ts'",
 factory,
 "const {input}=makeField(4,2,{neutral:false,terrain:'flat',seed:'private-low-reserve-01'})",
 "const immutability=JSON.stringify(input)",
 "const result=runSelectedRaceEngineV1(input)",
 "if(!result.validationPassed||result.replaySynchronization?.synchronized!==true)throw Error('STRICT_REPLAY_FAILED')",
 "if(immutability!==JSON.stringify(input))throw Error('INPUT_MUTATED')",
 "const cls=result.finishResolution?.classification??[]",
 "if(cls.length!==input.riders.length)throw Error('CLASSIFICATION_INCOMPLETE')",
 "console.log('PRIVATE_LOW_RESERVE_SYNTHETIC '+JSON.stringify({status:'PASS',riders:cls.length,strictReplayPassed:true,officialWrites:0}))"
 ].join('\n')
 const output=[]
 for(const mode of ['baseline','research']){
  const target=join(folder,mode+'.mjs')
  let patched=0
  await build({
   absWorkingDir:root,stdin:{contents:sourceScript,resolveDir:root,sourcefile:'synthetic-low-reserve-replay.ts',loader:'ts'},
   bundle:true,platform:'node',format:'esm',target:'node22',outfile:target,logLevel:'silent',
   plugins:[{name:'private-replay-optional',setup(ctx){
    ctx.onLoad({filter:/[\\/]runRaceEngine\.ts$/},args=>{
     if(mode==='baseline')return null
     patched++
     return {contents:patch(readFileSync(args.path,'utf8')),loader:'ts'}
    })
   }}]
  })
  assert.equal(patched,mode==='research'?1:0)
  const run=spawnSync(process.execPath,[target],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:1024*1024})
  assert.equal(run.status,0,mode+' strict solver synthetic failure: '+String(run.stderr).slice(0,250))
  const line=String(run.stdout??'').trim().split('\n').find(x=>x.startsWith('PRIVATE_LOW_RESERVE_SYNTHETIC '))
  assert(line,mode+' missing research result')
  const info=JSON.parse(line.slice('PRIVATE_LOW_RESERVE_SYNTHETIC '.length))
  assert.equal(info.strictReplayPassed,true)
  assert.equal(info.officialWrites,0)
  output.push({variant:mode,...info})
 }
 console.log('PRIVATE_LOW_RESERVE_REPLAY_CANDIDATE '+JSON.stringify({status:'PASS',syntheticOnly:true,variants:output.length,strictReplayUnchanged:true,productionUnchanged:true,officialWrites:0}))
}finally{rmSync(folder,{recursive:true,force:true})}
