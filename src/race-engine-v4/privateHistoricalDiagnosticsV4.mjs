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

/**
 * Research-only physical front-gap peak. Unlike the official V2 calibration
 * summary, also includes interior main-front trajectory points across phases.
 * Secondary-front distance is intentionally separate from the primary escape.
 */
export function historicalPhysicalGapAudit(result){
 const road=result?.roadRaceResolution
 const published=result?.calibrationSummary?.maximumBreakawayGapSeconds
 const publishedMaximum=typeof published==='number'&&Number.isFinite(published)&&published>=0?published:null
 if(!road||road.active!==true)
  return {publishedMaximum,observedPeak:null,omittedPeakSeconds:null}
 const p1=road.phase1Opening,p2=road.phase2Development
 const p3=road.phase3Decisive,p4=road.phase4Finish
 const values=[]
 const add=n=>{if(typeof n==='number'&&Number.isFinite(n)&&n>=0)values.push(n)}
 for(const p of [p1,p2,p3,p4]){
  if(!p)continue
  for(const point of Array.isArray(p.physicalGapTrajectory)?p.physicalGapTrajectory:[])
   add(point?.gapSeconds)
 }
 add(p1?.initialGapSeconds)
 add(p2?.startGapSeconds);add(p2?.endGapSeconds)
 add(p3?.physicalStartGapSeconds);add(p3?.physicalEndGapSeconds)
 add(p4?.startGapSeconds);add(p4?.endGapSeconds)
 for(const step of Array.isArray(p4?.chaseSteps)?p4.chaseSteps:[]){
  add(step?.startGapSeconds);add(step?.endGapSeconds)
 }
 const observedPeak=values.length?Number(Math.max(...values).toFixed(6)):null
 const omittedPeakSeconds=publishedMaximum!==null&&observedPeak!==null?
  Number(Math.max(0,observedPeak-publishedMaximum).toFixed(6)):null
 return {publishedMaximum,observedPeak,omittedPeakSeconds}
}
