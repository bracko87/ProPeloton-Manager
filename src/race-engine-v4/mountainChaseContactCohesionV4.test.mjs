import assert from 'node:assert/strict'
import {reconcileV4WinnerChaseContact as reconcile} from './mountainChaseContactCohesionV4.mjs'
const c=(code,members,gap,extra={})=>({groupCode:'chasing_group',displayCode:code,physicalPosition:'behind_peloton',physicalLineageId:null,groupOrder:1,riderIds:members,gapSeconds:gap,...extra})
const previous=[c('C125',['a','b','c'],6)]
const winner=[c('C125',['a','b'],6),c('C128',['c'],6.078),c('C200',['z'],25)]
const final=[c('C1',['a','b','c','d'],5.54),c('C2',['z'],25)]
const out=reconcile(previous,winner,final,5)
assert.equal(out.length,2)
assert.deepEqual(out.find(x=>x.displayCode==='C125')?.riderIds,['a','b','c'])
assert.deepEqual(out.find(x=>x.displayCode==='C200')?.riderIds,['z'])
assert.deepEqual(winner[0].riderIds,['a','b'],'input snapshots remain unchanged')
assert.equal(reconcile(previous,winner,[c('C1',['a','b'],5.5),c('C2',['c'],6)],5).length,3,'distinct official groups must not be joined')
assert.deepEqual(reconcile(previous,[c('C125',['a','b'],6),c('C128',['c'],12)],final,5).map(g=>g.displayCode),['C125','C128'],'gap beyond contact tolerance must remain separate')
assert.deepEqual(reconcile(previous,[c('C125',['a','b'],6),c('C128',['c'],6.078,{physicalLineageId:'different'})],final,5).map(g=>g.displayCode),['C125','C128'],'tagged physical lineages must not be joined')
assert.equal(reconcile(previous,[c('C125',['a','b'],6),c('C128',['c','z'],6.078)],final,5).length,2,'mixed parent membership must not be joined')
assert.throws(()=>reconcile(null,winner,final,5),/invalid V4 contact/)
console.log('V4_CHASE_CONTACT_COHESION_UNIT '+JSON.stringify({status:'PASS',isolated:true,officialWrites:0}))
