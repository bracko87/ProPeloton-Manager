import assert from 'node:assert/strict'
import {auditV4PostCatchWinnerTransfer as audit} from './mountainPostCatchTransferAuditV4.mjs'
const cp=(id,km,entries)=>({checkpointId:'synthetic|replay|'+id,
 raceProgress:{kmFromStart:km},
 groups:entries.map(([code,ids])=>({displayCode:code,riderIds:ids})),
 gaps:entries.map(([code,ids,gap])=>({displayCode:code,gapSeconds:gap})),
 riderStates:entries.flatMap(([code,ids])=>ids.map(riderId=>({riderId,displayCode:code})))})
const a=cp('early',219.99,[['C1',['SECRET_A'],8],['C2',['SECRET_B'],8]])
const b=cp('winner-finish',220,[['C3',['SECRET_A','SECRET_B'],8]])
const result=audit([a,b])
assert.equal(result.length,2)
assert(result.every(x=>x.membership==='JOIN'))
assert(result.every(x=>x.sourceGroupCount==='MULTIPLE'))
assert(result.every(x=>x.sourceGapSpread==='EQUAL'))
assert(result.every(x=>x.lastCheckpointDistance==='UNDER_100_METERS'))
assert(!JSON.stringify(result).includes('SECRET_A'))
console.log('V4_POST_CATCH_TRANSFER_AUDIT_UNIT PASS')
