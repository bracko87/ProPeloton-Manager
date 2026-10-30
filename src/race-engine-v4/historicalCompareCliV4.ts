/**
 * Private local V4 history comparison.
 * Usage after building with esbuild:
 * node /tmp/ppm-v4-history.mjs /path/OUTSIDE_REPOSITORY/private-stage.json
 *
 * No network, no database connection, no writes, no raw rider data in stdout.
 */
import {readFileSync} from 'node:fs'
import {compareHistoricalStageV4} from './historicalComparisonV4.ts'
const file=process.argv[2]
if(!file||process.argv.length!==3){
 console.error('Usage: node ppm-v4-history.mjs /private/path/stage-envelope.json')
 process.exitCode=2
}else{
 try{
  const raw=JSON.parse(readFileSync(file,'utf8'))
  const result=compareHistoricalStageV4(raw)
  process.stdout.write(JSON.stringify(result,null,2)+'\n')
  if(!result.savedResultReproducedByCurrentV2){
   process.stderr.write(
    'WARNING: historical V2 output differs from current preserved solver. '+
    'V4 changes are only comparable to current V2, not directly to the old result.\n')
  }
 }catch(error){
  console.error('V4 private historical comparison rejected: '+
    (error instanceof Error?error.message:String(error)))
  process.exitCode=1
 }
}
