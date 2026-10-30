/**
 * PRIVATE offline V4 AI-planning historical cohort. No network or database.
 * Bundle with esbuild before use. Never prints identities or raw envelopes.
 * This is NOT a calibrated V4 physics rerun.
 */
import {readFileSync,realpathSync,statSync} from 'node:fs'
import {isAbsolute,relative,sep} from 'node:path'
import {compareHistoricalStageV4} from '../../src/race-engine-v4/historicalComparisonV4.ts'
import {summarizeV4PrivateHistoricalCohort} from './historicalCohortAggregationV4.mjs'
const repo=realpathSync(process.cwd())
const isInside=(root,filepath)=>{
 const rel=relative(root,filepath)
 return rel===''||(rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel))
}
const privateFile=(raw,maxBytes)=>{
 if(typeof raw!=='string'||!isAbsolute(raw))throw Error('Private input path must be absolute')
 const path=realpathSync(raw)
 if(isInside(repo,path))throw Error('Private data must be outside repository')
 const meta=statSync(path)
 if(!meta.isFile()||meta.size<=0||meta.size>maxBytes)
  throw Error('Private file missing, empty or oversized')
 if(process.platform!=='win32'&&(meta.mode&0o077)!==0)
  throw Error('Private file permissions must be owner-only (0600)')
 return path
}
try{
 if(process.argv.length!==3)throw Error('Usage: node private-historical-cohort.mjs /PRIVATE/manifest.json')
 const manifestPath=privateFile(process.argv[2],128*1024)
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'))
 if(!manifest||!Array.isArray(manifest.privateEnvelopePaths)||
  manifest.privateEnvelopePaths.length<1||manifest.privateEnvelopePaths.length>100||
  Object.keys(manifest).some(k=>k!=='privateEnvelopePaths'))
  throw Error('Invalid private manifest: expected 1–100 absolute paths')
 const paths=manifest.privateEnvelopePaths.map(path=>privateFile(path,64*1024*1024))
 if(new Set(paths).size!==paths.length)throw Error('Duplicate private history paths')
 const comparisons=[]
 let rejected=0
 for(const path of paths){
  try{
   const envelope=JSON.parse(readFileSync(path,'utf8'))
   const result=compareHistoricalStageV4(envelope)
   comparisons.push(result)
  }catch{
   rejected++
  }
 }
 const report=summarizeV4PrivateHistoricalCohort(comparisons,rejected)
 process.stdout.write('V4_PRIVATE_HISTORICAL_COHORT_REPORT '+JSON.stringify(report)+'\n')
 if(report.strictPairedPlanningSubset.stages===0)process.exitCode=1
}catch{
 process.stderr.write('V4 private cohort rejected: invalid manifest, file security, or aggregation\n')
 process.exitCode=1
}
