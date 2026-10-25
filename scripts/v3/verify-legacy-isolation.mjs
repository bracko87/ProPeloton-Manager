/**
 * V3 isolation gate. No unapproved V3 import may reach an existing production
 * entrypoint or Edge worker. No network, database or production mutations.
 */
import {readdirSync,readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {fileURLToPath} from 'node:url'
const forbidden=/(?:import\s*['"][^'"]*(?:race-engine-v3|physicalRaceEngineV3)[^'"]*['"]|from\s*['"][^'"]*(?:race-engine-v3|physicalRaceEngineV3)[^'"]*['"]|import\s*\(\s*['"][^'"]*(?:race-engine-v3|physicalRaceEngineV3)[^'"]*['"]\s*\)|require\s*\(\s*['"][^'"]*(?:race-engine-v3|physicalRaceEngineV3)[^'"]*['"]\s*\))/g
const extensions=/\.(?:tsx?|jsx?|mjs|mts)$/
export function checkLegacyIsolation(root=process.cwd()){
 const violations=[];let inspected=0
 function visit(dir){
  let entries;try{entries=readdirSync(join(root,dir),{withFileTypes:true})}
  catch(e){if(e.code==='ENOENT')return;throw e}
  for(const item of entries){
   const path=join(dir,item.name)
   if(item.isDirectory()){
    if(['node_modules','.git','race-engine-v3'].includes(item.name)||path.startsWith('supabase/functions/race-v3-'))continue
    visit(path)
   }else if(item.isFile()&&extensions.test(item.name)){
    inspected++
    for(const m of readFileSync(join(root,path),'utf8').matchAll(forbidden))violations.push({path,import:m[0]})
   }
  }
 }
 visit('src');visit('supabase/functions')
 return {inspected,violations}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=checkLegacyIsolation(resolve(process.argv[2]??process.cwd()))
 if(result.violations.length){console.error('FAIL V3 isolation:',result.violations);process.exitCode=1}
 else console.log('PASS V3 isolation: '+result.inspected+' production source files inspected')
}
