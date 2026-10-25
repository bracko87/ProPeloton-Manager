/**
 * Research-only physical calibration comparison. No official race, clock or
 * results writes. Engineering-integrity success is NOT sporting acceptance.
 */
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname,join} from 'node:path'
const directory=dirname(fileURLToPath(import.meta.url))
function load(script,weather){
 const proc=spawnSync(process.execPath,['--experimental-strip-types','--disable-warning=ExperimentalWarning',join(directory,script)],{
  encoding:'utf8',env:{...process.env,...(weather?{V3_WEATHER_SCENARIO:weather}:{})},timeout:120000,maxBuffer:3*1024*1024,
 })
 if(proc.error||proc.status!==0)throw Error('Fixture failed: '+script+' '+(weather??'')+' '+(proc.error??proc.stderr))
 return JSON.parse(proc.stdout)
}
const neutral=load('verify-dordrecht-real-roster-v3.mjs','forecast_unknown_bearing')
const calm=load('verify-dordrecht-real-roster-v3.mjs','calm')
const crosswind=load('verify-dordrecht-real-roster-v3.mjs','worst_crosswind')
const mountain=load('verify-guangxi-real-roster-v3.mjs')
assert.equal(neutral.roadBearingVerified,false)
assert.equal(neutral.windAssumedCrosswindKph,0,'Unknown bearing must not invent crosswind')
assert.equal(neutral.wetnessAssumed,0,'Rain probability does not establish wetness')
assert.equal(crosswind.windScenarioSynthetic,true)
assert.deepEqual(neutral.firstTen,calm.firstTen,'Unknown road heading must match neutral wind assumption')
assert.equal(neutral.lastGapSeconds,calm.lastGapSeconds)
for(const race of [neutral,calm,crosswind]){
 assert.equal(race.riders,106)
 assert.equal(race.validation.deterministicCheckpointResume,true)
 assert.equal(race.validation.allRidersAssigned,true)
 assert.equal(race.validation.energyBounded,true)
 assert(race.sameTimeWinner>=1&&race.sameTimeWinner<=106)
}
assert.equal(mountain.riders,168)
assert.equal(mountain.engineeringIntegrity,'PASSED')
assert(mountain.tailGapSeconds>=0)
const largestPackAt=(r,pct)=>{
 const groups=r.progress.find(x=>x.pelotonPassingPct===pct)?.groups??[]
 if(!groups.length)return null
 const pack=[...groups].sort((a,b)=>b.riders-a.riders||a.rank-b.rank)[0]
 return {size:pack.riders,rankFromFront:pack.rank,metresBehindFront:pack.gapMeters}
}
const view=r=>({
 weather:r.weatherScenario,windAssumedCrosswindKph:r.windAssumedCrosswindKph,
 roadBearingVerified:r.roadBearingVerified,sameTimeWinner:r.sameTimeWinner,
 lastGapSeconds:r.lastGapSeconds,distinctOfficialGaps:r.distinctOfficialGaps,
 earlyLeadingPackSize:r.progress.find(x=>x.pelotonPassingPct===5)?.groups?.[0]?.riders??null,
 earlyLargestPhysicalPack:largestPackAt(r,5),
 halfwayLeadingPackSize:r.progress.find(x=>x.pelotonPassingPct===50)?.groups?.[0]?.riders??null,
 halfwayLargestPhysicalPack:largestPackAt(r,50),
 framesWithB1:r.physicalGroupAudit.framesWithB1,
})
const result={
 version:'v3_sensitivity_v1',dataStatus:'FROZEN_HISTORICAL_ROSTERS',
 routing:'RESEARCH_ONLY',legacyModified:false,officialResultWrites:false,
 engineeringIntegrity:'PASSED',sportingAcceptance:'NOT_APPROVED',
 windExposureData:'UNVERIFIED_ROAD_BEARINGS_FOR_DORDRECHT',
 dordrecht:{neutral:view(neutral),calm:view(calm),strongCrosswindSynthetic:view(crosswind),
  crosswindSameTimeSwing:Math.abs(neutral.sameTimeWinner-crosswind.sameTimeWinner),
  crosswindFrontGroupSizeSwing:Math.abs(view(neutral).earlyLeadingPackSize-view(crosswind).earlyLeadingPackSize),
  crosswindLargestPackSizeSwing:Math.abs(view(neutral).earlyLargestPhysicalPack.size-view(crosswind).earlyLargestPhysicalPack.size),
  crosswindTailGapSwingSeconds:Math.abs(neutral.lastGapSeconds-crosswind.lastGapSeconds)},
 guangxi:{riders:mountain.riders,sameTimeWinner:mountain.sameTimeWinner,tailGapSeconds:mountain.tailGapSeconds,
  sourceTotalAscentM:1718,sourceSparseAscentM:1000,missingAscentM:718,routeGeometryComplete:false},
 blockingProblems:[
  'No verified road bearing for Dordrecht wind exposure',
  'Breakaway and peloton physical cohesion not calibrated across independent road races',
  'Guangxi mountain terrain missing 718 m recorded ascent',
  'Realistic crosswind response and summit attrition not established',
 ],
}
assert.equal(view(neutral).earlyLargestPhysicalPack.size,97,'Neutral benchmark changed; investigate unexpected physics changes')
assert.equal(view(crosswind).earlyLargestPhysicalPack.size,89,'Synthetic stress-test benchmark changed; investigate physics change')
if(process.env.V3_AUDIT_OUT)writeFileSync(process.env.V3_AUDIT_OUT,JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
