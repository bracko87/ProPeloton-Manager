import assert from 'node:assert/strict'
import {assessRouteFidelityV3} from '../../src/race-engine-v3/routeFidelityV3.ts'
import {derivePhysicalGroupsV3} from '../../src/race-engine-v3/physicalGroupsV3.ts'
const pts=[[0,115],[18,140],[36,170],[52,130],[60,140],[72,270],[84,110],[96,130],[110,160],[124,240],[134.2,430],[142,165],[154,190],[158,220],[160.8,275],[162.6,415],[165.8,650]].map(([km,elevationM])=>({km,elevationM}))
const climbs=[{finishKm:72,lengthKm:4.9,averageGradientPercent:4.7},{finishKm:134.2,lengthKm:3,averageGradientPercent:4.8},{finishKm:165.8,lengthKm:3.2,averageGradientPercent:6.8}]
const audit=assessRouteFidelityV3(pts,165.8,1718,climbs)
assert.equal(audit.profiledPositiveGainM,1000)
assert.equal(audit.missingGainM,718)
assert.equal(audit.profileIncomplete,true)
assert.throws(()=>assessRouteFidelityV3([{km:4,elevationM:0},{km:2,elevationM:100}],5,100))
console.log('PASS Guangxi source profile deficit identified; no invented gradients',audit.missingGainM)
const start={elapsedSeconds:0,riders:[{riderId:'lead',meters:0},{riderId:'p1',meters:0},{riderId:'p2',meters:0}]}
const open={elapsedSeconds:40,riders:[{riderId:'lead',meters:500},{riderId:'p1',meters:100},{riderId:'p2',meters:98}]}
const catchFrame={elapsedSeconds:80,riders:[{riderId:'lead',meters:650},{riderId:'p1',meters:641},{riderId:'p2',meters:635}]}
const g1=derivePhysicalGroupsV3(open,start,1000)
const g2=derivePhysicalGroupsV3(catchFrame,open,1000)
assert.deepEqual(g1.groups.map(g=>g.code),['B1','P'])
assert.equal(g1.groups[0].riderIds[0],'lead')
assert(g1.groups[0].gapToPelotonSeconds<0)
assert.equal(g1.assignments.length,3)
assert.deepEqual(g2.groups.map(g=>g.code),['P'])
assert.equal(g2.assignments.length,3)
assert.equal(new Set(g2.assignments.map(a=>a.riderId)).size,3)
assert.throws(()=>derivePhysicalGroupsV3({...open,riders:[open.riders[0],open.riders[0]]},null,1000))
console.log('PASS B1 catch merges into physical peloton without duplicated riders or scripted time gaps')
