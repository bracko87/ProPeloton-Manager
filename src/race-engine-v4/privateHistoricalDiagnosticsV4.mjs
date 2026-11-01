/** Fixed-category, identity-free retrospective V2/V4 research diagnostics. */
export const HISTORICAL_TERRAINS=Object.freeze(['flat','hilly','mountain','cobbled','unknown'])
export const HISTORICAL_PARITY_REASONS=Object.freeze([
 'RIDER_COUNT','RIDER_IDENTITY','RANK','STATUS','GAP','OFFICIAL_TIME'
])
export const HISTORICAL_ERROR_TYPES=Object.freeze([
 'TYPE_ERROR','RANGE_ERROR','SYNTAX_ERROR','OTHER_ERROR','NON_ERROR_THROW'
])
const equalNumber=(a,b)=>a===null||b===null?a===b:
 Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=0.01

/** Reasons are fixed labels only; never publish rider identity or raw values. */
export function explainHistoricalClassificationParity(saved,current){
 if(!Array.isArray(saved)||!Array.isArray(current))
  throw Error('INVALID_CLASSIFICATION_DIAGNOSTIC')
 const found=new Set()
 if(saved.length!==current.length)found.add('RIDER_COUNT')
 else for(let i=0;i<saved.length;i++){
  const a=saved[i],b=current[i]
  if(a.id!==b.id)found.add('RIDER_IDENTITY')
  if(a.rank!==b.rank)found.add('RANK')
  if(a.status!==b.status)found.add('STATUS')
  if(!equalNumber(a.gap,b.gap))found.add('GAP')
  if(!equalNumber(a.time,b.time))found.add('OFFICIAL_TIME')
 }
 const reasons=HISTORICAL_PARITY_REASONS.filter(x=>found.has(x))
 return {equal:reasons.length===0,reasons}
}
export function safeHistoricalErrorType(error){
 if(error instanceof TypeError)return 'TYPE_ERROR'
 if(error instanceof RangeError)return 'RANGE_ERROR'
 if(error instanceof SyntaxError)return 'SYNTAX_ERROR'
 if(error instanceof Error)return 'OTHER_ERROR'
 return 'NON_ERROR_THROW'
}
export function safeHistoricalTerrain(raw){
 const terrain=raw?.input_snapshot_json?.stage?.terrainType
 return HISTORICAL_TERRAINS.slice(0,4).includes(terrain)?terrain:'unknown'
}
