/** Synthetic/mocked read-only pilot test. No live Supabase access. */
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,writeFileSync,existsSync,statSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {runPrivateHistoricalPilotV4} from './privateHistoricalPilotV4.mjs'
import {selectV4HistoricalPilotCandidates} from './privateHistoricalPilotSelectionV4.mjs'
const url='https://okuravitxocyevkexfgi.supabase.co'
const uuid=(n)=>'12345678-1234-4234-8234-'+String(n).padStart(12,'0')
const entry=(n,t,stage_format='road_race')=>({
 stage_id:uuid(n),completed_at:'2026-10-25T00:00:00Z',terrain:t,stage_format})
const rows=[entry(1,'flat'),entry(2,'flat'),entry(3,'flat'),
 entry(4,'hilly'),entry(5,'mountain'),entry(6,'cobbled'),
 entry(7,'individual_time_trial','individual_time_trial'),
 entry(1,'flat'),{...entry(8,'flat'),stage_id:'bad'}]
const parsed=selectV4HistoricalPilotCandidates(rows,{maxPerTerrain:3})
assert.deepEqual(parsed.potential,{flat:3,hilly:1,mountain:1,cobbled:1})
assert.deepEqual(parsed.rejected,{invalid:1,unsupported:1,duplicate:1})
assert.throws(()=>selectV4HistoricalPilotCandidates(null))
assert.throws(()=>selectV4HistoricalPilotCandidates(rows,{maxPerTerrain:0}))
assert.throws(()=>selectV4HistoricalPilotCandidates(Array(351).fill(rows[0])))
const created=[]
let queries=0,exports=0,physics=0
function clientFactory(){return{from(table){
 assert.equal(table,'race_stage_simulation_runs')
 return {select(columns){
  assert.ok(columns.includes('terrain:input_snapshot_json'))
  assert.ok(!columns.includes('result_summary_json'))
  return {eq(k,v){assert.equal(k,'status');assert.equal(v,'completed')
   return {order(k){assert.equal(k,'completed_at')
    return {async limit(n){assert.ok(n<=350);queries++;return{data:rows,error:null}}}
   }}
  }}
 }}
}}}
async function exporter({stageId}){
 exports++
 if(stageId===uuid(1))throw Error('Unmapped historical entry intentionally rejected')
 const dir=mkdtempSync(join(tmpdir(),'ppm-v4-private-history-'))
 created.push(dir)
 const privatePath=join(dir,'synthetic.json')
 writeFileSync(privatePath,JSON.stringify({stageId}),{mode:0o600,flag:'wx'})
 return{privatePath,riders:96,teams:16}
}
async function runner(manifest){
 physics++
 const paths=JSON.parse(readFileSync(manifest,'utf8')).privateEnvelopePaths
 assert.equal(paths.length,3)
 if(process.platform!=='win32')assert.equal(statSync(manifest).mode&0o077,0)
 for(const p of paths)assert.ok(existsSync(p))
 return{consideredCompleteTriples:3,officialWrites:0,
  rawStageDataPublished:false,privatePathsPublished:false,
  historicalV4RealismApproved:false}
}
try{
 const report=await runPrivateHistoricalPilotV4({
  url,key:'synthetic-placeholder-only',clientFactory,
  exportStage:exporter,physicalRunner:runner,metadataLimit:25,
  targets:{flat:2,hilly:1,mountain:0,cobbled:0},maxProbesPerTerrain:3})
 assert.equal(report.consideredCompleteTriples,3)
 assert.equal(report.status,'PRIVATE_HISTORICAL_PILOT_DIAGNOSTIC_ONLY')
 assert.deepEqual(report.accepted,{flat:2,hilly:1,mountain:0,cobbled:0})
 assert.deepEqual(report.rejected,{flat:1,hilly:0,mountain:0,cobbled:0})
 assert.equal(queries,1);assert.equal(exports,4);assert.equal(physics,1)
 assert.equal(report.officialWrites,0)
 assert.equal(report.historicalV4RealismApproved,false)
 assert.equal(JSON.stringify(report).includes('synthetic-placeholder'),false)
 for(const d of created)assert.equal(existsSync(d),false)
 await assert.rejects(()=>runPrivateHistoricalPilotV4({
  url:'https://attacker.example',key:'test',clientFactory}),/Unauthorized project origin/)
 await assert.rejects(()=>runPrivateHistoricalPilotV4({
  url,key:'test',clientFactory,metadataLimit:500}),/Unsafe private pilot limits/)
 console.log('V4_PRIVATE_HISTORICAL_AUTO_PILOT_UNIT '+JSON.stringify({
  status:'PASS',cases:17,syntheticOnly:true,
  readOnlyMetadataQueries:queries,mockExportAttempts:exports,
  privatePhysicsMockCalls:physics,temporaryFilesDeleted:true,officialWrites:0}))
}finally{for(const d of created)rmSync(d,{recursive:true,force:true})}
