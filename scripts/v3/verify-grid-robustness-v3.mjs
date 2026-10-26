import assert from 'node:assert/strict'
import {compareGridExperimentsV3,checkNeutralGridV3} from './gridRobustnessV3.mjs'
const make=(ord)=>({officialWrites:0,sportingApproval:'NOT_APPROVED',finish:ord.map((r,i)=>({riderId:r,rank:i+1,finishSeconds:100+i*10,gapSeconds:i*10,energy:.6}))})
const a=make(['a','b','c']),b=make(['b','a','c']),c=make(['c','b','a'])
const out=compareGridExperimentsV3(a,[b,c]);assert.equal(out.roster,3);assert.equal(out.races,3);assert.equal(out.distinctWinners,3);assert.equal(out.maxRankRange,2);assert.equal(out.top10AlwaysCount,3);assert.equal(out.transitions[1].discordantPairs,1);assert.equal(out.transitions[2].discordantPairs,3)
assert.deepEqual(compareGridExperimentsV3(a,[a]).transitions.map(x=>x.discordantPairs),[0,0]);assert.throws(()=>compareGridExperimentsV3(a,[]),/Missing/)
assert.throws(()=>compareGridExperimentsV3(a,[{...b,officialWrites:1}]),/approval gate/)
assert.throws(()=>compareGridExperimentsV3(a,[make(['a','b','b'])]),/Missing or duplicate|Unmatched|duplicated/)
const grids=[[{riderId:'a',lane:0,meters:0},{riderId:'b',lane:1,meters:0}],[{riderId:'a',lane:1,meters:0},{riderId:'b',lane:0,meters:0}]]
assert.deepEqual(checkNeutralGridV3(grids),{fields:2,roster:2,uniqueLayouts:2});assert.throws(()=>checkNeutralGridV3([grids[0],[grids[0][0],grids[0][0]]]),/Grid rider set|Overlapping/)
console.log('PASS grid robustness: rank comparisons, stable seeds, finish changes, safety gates')
