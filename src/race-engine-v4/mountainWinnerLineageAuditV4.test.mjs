import assert from 'node:assert/strict'
import {auditV4WinnerGapCollisions,COLLISION_KINDS,COLLISION_MEMBERSHIP} from './mountainWinnerLineageAuditV4.mjs'
const group=(code,ids,lineage=null)=>({displayCode:code,riderIds:ids,physicalLineageId:lineage})
const checkpoint=(id,km,groups,values,visible=false)=>({
 checkpointId:'synthetic|replay|'+id,raceProgress:{kmFromStart:km},groups,
 gaps:groups.map((g,i)=>({displayCode:g.displayCode,gapSeconds:values[i]})),
 finalResultsVisible:visible
})
const previous=checkpoint('pre',219.9,[group('C1',['alpha']),group('C2',['beta'])],[4,9])
const winner=checkpoint('winner-finish',220,[group('C5',['alpha']),group('C6',['beta'])],[14,14])
const final=checkpoint('final-results',220,[group('C5',['alpha']),group('C6',['beta'])],[14,14],true)
let rows=auditV4WinnerGapCollisions([previous,winner,final])
assert.equal(rows.length,1)
assert.deepEqual(rows[0],{kind:'C_C',
 previousMembership:'DISTINCT_PREVIOUS_GROUPS',physicalLineage:'UNTAGGED_LINEAGE',
 finalOutcome:'PERSISTENT_SEPARATE_EQUAL_GAP',gapBand:'OVER_TEN_SECONDS'})
rows=auditV4WinnerGapCollisions([checkpoint('pre',219.9,[group('C0',['alpha','beta'])],[5]),winner,
 checkpoint('final-results',220,[group('P',['alpha','beta'])],[0],true)])
assert.equal(rows[0].previousMembership,'SAME_PREVIOUS_GROUP')
assert.equal(rows[0].finalOutcome,'PHYSICALLY_MERGED')
const tagged=checkpoint('winner-finish',220,
 [group('C1',['alpha'],'physical-a'),group('C2',['beta'],'physical-b')],[0,0])
rows=auditV4WinnerGapCollisions([previous,tagged])
assert.equal(rows[0].physicalLineage,'DISTINCT_TAGGED_LINEAGES')
assert.equal(rows[0].gapBand,'ZERO')
assert.equal(rows[0].finalOutcome,'NO_FINAL_CHECKPOINT')
assert.equal(auditV4WinnerGapCollisions([]).length,0)
assert.equal(COLLISION_KINDS.includes('C_C'),true)
assert.equal(COLLISION_MEMBERSHIP.includes('DISTINCT_PREVIOUS_GROUPS'),true)
assert(!JSON.stringify(rows).includes('alpha'))
assert(!JSON.stringify(rows).includes('beta'))
console.log('V4_MOUNTAIN_WINNER_LINEAGE_AUDIT_UNIT '+JSON.stringify({status:'PASS',syntheticOnly:true,officialWrites:0}))
