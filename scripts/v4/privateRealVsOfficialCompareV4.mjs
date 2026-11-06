/**
 * Private, stage-matched historical result comparison.
 * Never emits rider IDs, names, input, official result rows, or raw replay.
 * This is a historical OUTCOME comparison, not an identical-lock parity proof:
 * the research sidecar has its own deterministic seed and AI templates.
 */
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x)
const finite=x=>typeof x==='number'&&Number.isFinite(x)
const number=x=>finite(x)?x:null
const avg=x=>x.length?Math.round(x.reduce((a,b)=>a+b,0)/x.length*1000)/1000:null
const max=x=>x.length?Math.round(Math.max(...x)*1000)/1000:null
const rnd=x=>finite(x)?Math.round(x*1000)/1000:null
const sameNumber=(a,b)=>a===null&&b===null||
  finite(a)&&finite(b)&&Math.abs(a-b)<0.011
function index(rows,key,label){
 if(!Array.isArray(rows)||rows.length!==108)throw Error(label+'_COUNT_REJECTED')
 const m=new Map()
 for(const row of rows){
  const id=row?.[key]
  if(typeof id!=='string'||!id||m.has(id))throw Error(label+'_IDENTITY_REJECTED')
  m.set(id,row)
 }
 return m
}
const gap=row=>row.gapSeconds===null?null:number(row.gapSeconds)
const rank=row=>row.rank===null?null:number(row.rank)
const stageStatus=row=>String(row?.status??'')
function energyMap(rows,label){
 const m=index(rows,'riderId',label)
 for(const r of m.values())
  if(!finite(r.finishEnergy)||!finite(r.energySpent))
   throw Error(label+'_ENERGY_INCOMPLETE')
 return m
}
const calibration=result=>result?.calibrationSummary??{}
function races(result){
 const r=result?.roadRaceResolution??{}
 return {
  acceptedOpeningAttacks:Array.isArray(r.phase1Opening?.attackAttempts)?
   r.phase1Opening.attackAttempts.filter(x=>x.acceptedEscapeLaunch===true).length:null,
  openingBreakawaySize:number(calibration(result).openingBreakawaySize),
  peakBreakawayGapSeconds:number(calibration(result).maximumBreakawayGapSeconds),
  breakawayCaught:typeof calibration(result).breakawayCaught==='boolean'?
   calibration(result).breakawayCaught:null,
  breakawaySurvived:typeof calibration(result).breakawaySurvived==='boolean'?
   calibration(result).breakawaySurvived:null,
  finalGroupCount:number(calibration(result).finalGroupCount),
  replayCheckpoints:Array.isArray(result?.replayTimeline?.checkpoints)?
   result.replayTimeline.checkpoints.length:null,
  phase4BridgeGroups:Array.isArray(r.phase4Finish?.bridgeGroups)?
   r.phase4Finish.bridgeGroups.length:null
 }
}
export function comparePrivateV4WithOfficial(reference,v4){
 if(!obj(reference)||!obj(v4)||reference.status!=='completed'||
    reference.engineVersion!=='race_engine_ts_v1'||
    !reference.stageId||reference.stageId!==v4.stageId||
    !reference.raceId||reference.raceId!==v4.raceId||
    v4.validationPassed!==true||v4.replaySynchronization?.synchronized!==true)
  throw Error('STAGE_OR_REPLAY_REJECTED')
 const official=index(reference.officialRows,'riderId','OFFICIAL')
 const saved=index(reference.savedClassification,'riderId','SAVED')
 const current=index(v4.finishResolution?.classification,'riderId','V4')
 const officialEnergy=energyMap(reference.savedEnergyRows,'SAVED_ENERGY')
 const v4Energy=energyMap(v4.postStageUpdate?.riderUpdates,'V4_ENERGY')
 const ids=[...official.keys()]
 if(ids.some(id=>!saved.has(id)||!current.has(id)||!officialEnergy.has(id)||!v4Energy.has(id)))
  throw Error('RIDER_SET_REJECTED')
 // Verify persisted official rows against the archived official engine
 // BEFORE comparing V4 against either one.
 let officialDrift=0
 for(const id of ids){
  const a=official.get(id),b=saved.get(id)
  if(stageStatus(a)!==stageStatus(b)||rank(a)!==rank(b)||
     !sameNumber(gap(a),gap(b))||
     !sameNumber(number(a.elapsedSeconds),number(b.officialTimeSeconds)))
   officialDrift++
 }
 if(officialDrift!==0)throw Error('OFFICIAL_SAVED_OUTPUT_DRIFT_REJECTED')
 const ow=ids.find(id=>rank(official.get(id))===1&&stageStatus(official.get(id))==='finished')
 const vw=ids.find(id=>rank(current.get(id))===1&&stageStatus(current.get(id))==='finished')
 if(!ow||!vw)throw Error('WINNER_MISSING')
 const rankDelta=[],gapDelta=[],energyDelta=[],energyAbs=[],spentDelta=[],spentAbs=[]
 let statusChanged=0,rankChanged=0,gapChanged=0,identical=0
 for(const id of ids){
  const a=official.get(id),b=current.get(id)
  if(stageStatus(a)!==stageStatus(b))statusChanged++
  if(rank(a)!==rank(b))rankChanged++
  if(!sameNumber(gap(a),gap(b)))gapChanged++
  if(stageStatus(a)===stageStatus(b)&&rank(a)===rank(b)&&sameNumber(gap(a),gap(b)))
   identical++
  if(finite(rank(a))&&finite(rank(b)))rankDelta.push(Math.abs(rank(a)-rank(b)))
  if(finite(gap(a))&&finite(gap(b)))gapDelta.push(Math.abs(gap(a)-gap(b)))
  const oe=officialEnergy.get(id),ve=v4Energy.get(id)
  energyDelta.push(ve.finishEnergy-oe.finishEnergy)
  energyAbs.push(Math.abs(ve.finishEnergy-oe.finishEnergy))
  spentDelta.push(ve.energySpent-oe.energySpent)
  spentAbs.push(Math.abs(ve.energySpent-oe.energySpent))
 }
 const count=(m,s)=>[...m.values()].filter(x=>stageStatus(x)===s).length
 const wTime=number(official.get(ow)?.elapsedSeconds)
 const vTime=number(current.get(vw)?.officialTimeSeconds)
 if(!finite(wTime)||!finite(vTime))throw Error('WINNING_TIME_MISSING')
 const offRace=reference.savedRaceSummary
 const v4Race=races(v4)
 if(!obj(offRace)||!Number.isInteger(offRace.replayCheckpoints))
  throw Error('SAVED_RACE_SUMMARY_REJECTED')
 // Only aggregate values: no identifiers, absolute names, raw data or hashes.
 return {
  contract:'ppm.v4.private-official-outcome-comparison.v1',
  status:'V4_HISTORICAL_OUTCOMES_COMPARED',
  stageMatched:true,officialArchivedResultVerified:true,
  researchOnly:true,officialWrites:0,productionEnabled:false,
  productionParityVerified:false,
  comparisonScope:'same_historical_stage_not_identical_original_lock_or_seed',
  ridersCompared:ids.length,
  originalEngine:'race_engine_ts_v1',
  official:{finishers:count(official,'finished'),dnf:count(official,'dnf'),
   winnerTimeSeconds:wTime,maximumRiderGapSeconds:max([...official.values()].map(gap).filter(finite)),
   ...offRace},
  v4:{finishers:count(current,'finished'),dnf:count(current,'dnf'),
   winnerTimeSeconds:vTime,maximumRiderGapSeconds:max([...current.values()].map(gap).filter(finite)),
   ...v4Race},
  differences:{
   sameWinner:ow===vw,
   winningTimeDeltaSeconds:rnd(vTime-wTime),
   rankChangedRiders:rankChanged,
   statusChangedRiders:statusChanged,
   gapChangedRiders:gapChanged,
   identicalStatusRankGapRiders:identical,
   meanAbsoluteRankChange:avg(rankDelta),
   maximumAbsoluteRankChange:max(rankDelta),
   meanAbsoluteGapChangeSeconds:avg(gapDelta),
   maximumAbsoluteGapChangeSeconds:max(gapDelta),
   meanFinishEnergyDelta:avg(energyDelta),
   meanAbsoluteFinishEnergyDelta:avg(energyAbs),
   maximumAbsoluteFinishEnergyDelta:max(energyAbs),
   meanEnergySpentDelta:avg(spentDelta),
   meanAbsoluteEnergySpentDelta:avg(spentAbs)
  }
 }
}
