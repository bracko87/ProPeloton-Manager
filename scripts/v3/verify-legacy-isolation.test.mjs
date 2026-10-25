import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {checkLegacyIsolation} from './verify-legacy-isolation.mjs'
const root=mkdtempSync(join(tmpdir(),'ppm-v3-guard-'))
try{
 mkdirSync(join(root,'src','race-engine-v3'),{recursive:true})
 mkdirSync(join(root,'src','legacy'),{recursive:true})
 mkdirSync(join(root,'supabase','functions','universal-race-stage-runner'),{recursive:true})
 writeFileSync(join(root,'src','race-engine-v3','core.ts'),"export const preview = true")
 writeFileSync(join(root,'src','legacy','core.ts'),"export const legacy = true")
 const worker=join(root,'supabase','functions','universal-race-stage-runner','index.ts')
 writeFileSync(worker,"import '../acceptedCore.ts'")
 assert.deepEqual(checkLegacyIsolation(root).violations,[])
 writeFileSync(worker,"import '../../../src/race-engine-v3/physicalRaceEngineV3.ts'")
 assert.equal(checkLegacyIsolation(root).violations.length,1)
 writeFileSync(worker,"import('../../../src/race-engine-v3/core.ts')")
 assert.equal(checkLegacyIsolation(root).violations.length,1)
 console.log('PASS V3 guard blocks accidental runtime imports and allows isolated source')
}finally{rmSync(root,{recursive:true,force:true})}
