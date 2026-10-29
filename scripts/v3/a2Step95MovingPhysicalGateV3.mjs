/**
 * V3 Step95: research-only physically swept moving-throughput admission.
 *
 * Distinguishes an original A64 collision from a SPORTING rejection:
 * preview states are A64 physically achieved, then inspected for crawling.
 * A failed preview is discarded; an actual original A64 first tick must
 * still be re-swept by the caller. No contact suppression or state repair.
 */
import {chooseThroughputGuardedTickV3} from './a2Step85ThroughputGuardV3.mjs';
const EPS=1e-7;
const isFiniteNumber=Number.isFinite;
export function step95AchievedMovingGateV3(physical,{
 upstreamEndX=680,upstreamFloorMps=6.5,
 downstreamFloorMps=4.5,stopFloorMps=1
}={}){
 if(!physical||!Array.isArray(physical.states)||
  physical.states.length<2||physical.states.length>168||
  !isFiniteNumber(physical.at)||physical.at<0||
  ![upstreamEndX,upstreamFloorMps,downstreamFloorMps,stopFloorMps]
   .every(isFiniteNumber)||upstreamEndX<400||upstreamEndX>900||
  upstreamFloorMps<5||upstreamFloorMps>11||
  downstreamFloorMps<2||downstreamFloorMps>7||
  downstreamFloorMps>upstreamFloorMps||
  stopFloorMps<0||stopFloorMps>2)
  throw Error('A95 invalid achieved physical moving gate');
 let upstreamSlow=0,downstreamSlow=0,nearStop=0;
 let minUpstream=Infinity,minDownstream=Infinity;
 for(const s of physical.states){
  if(!s||![s.x,s.y,s.v].every(isFiniteNumber)||s.v<0||
   s.v>50)throw Error('A95 invalid achieved rider');
  if(s.v<stopFloorMps-EPS)nearStop++;
  if(s.x<upstreamEndX-EPS){
   minUpstream=Math.min(minUpstream,s.v);
   if(s.v<upstreamFloorMps-EPS)upstreamSlow++;
  }else{
   minDownstream=Math.min(minDownstream,s.v);
   if(s.v<downstreamFloorMps-EPS)downstreamSlow++;
  }
 }
 return {
  admitted:upstreamSlow===0&&downstreamSlow===0&&nearStop===0,
  upstreamSlow,downstreamSlow,nearStop,
  minUpstreamMps:minUpstream===Infinity?null:minUpstream,
  minDownstreamMps:minDownstream===Infinity?null:minDownstream,
  thresholds:{upstreamEndX,upstreamFloorMps,
   downstreamFloorMps,stopFloorMps},
  stateIsFromOriginalSweptPhysics:true,officialWrites:0
 };
}
/**
 * Every A85 candidate and each future continuation first calls the REAL
 * unchanged A64. A physically accepted outcome below speed limits is
 * returned to A85 as a synthetic, clearly marked research-only rejected
 * preview. A85 cannot choose that candidate as a safe first movement.
 *
 * Caution: a valid first tick whose 2nd/3rd future tick crawls may rank
 * below a physically clean alternative; this is still bounded-horizon
 * research, not a proof of 180-second viability.
 */
export function chooseStep95MovingPhysicalTickV3(
 previous,firstPlans,makeFuture,originalA64,{
 upstreamEndX=680,upstreamFloorMps=6.5,
 downstreamFloorMps=4.5,minimumMovingSpeedMps=6.5,
 strictNoNearStops=true,clearanceFirst=false,depth=3,
 maxFirst=7,maxFuture=3
}={}){
 if(typeof originalA64!=='function'||typeof makeFuture!=='function'||
  !Array.isArray(firstPlans)||firstPlans.length===0)
  throw Error('A95 invalid original physical selector');
 const opts={upstreamEndX,upstreamFloorMps,downstreamFloorMps};
 const ledger={evaluated:0,physicallyAccepted:0,
  blockedMoving:0,blockedUpstream:0,blockedDownstream:0,
  blockedNearStop:0,originalPhysicalRejections:0};
 let firstMovingViolation=null;
 const checked=field=>{
  const result=originalA64(field);
  ledger.evaluated++;
  if(result?.reason){ledger.originalPhysicalRejections++;return result}
  ledger.physicallyAccepted++;
  const scan=step95AchievedMovingGateV3(result,opts);
  if(scan.admitted)return result;
  ledger.blockedMoving++;
  if(scan.upstreamSlow)ledger.blockedUpstream++;
  if(scan.downstreamSlow)ledger.blockedDownstream++;
  if(scan.nearStop)ledger.blockedNearStop++;
  if(firstMovingViolation===null)firstMovingViolation={
   at:result.at,scan};
  // This is not an original swept contact; it is a hypothetical
  // SPORTING failure and cannot be committed or reported as A64 contact.
  return {...result,reason:'A95_PREVIEW_CRAWL_REJECTED',
   a95PreviewRejected:true,a95MovingScan:scan};
 };
 const choice=chooseThroughputGuardedTickV3(
  previous,firstPlans,makeFuture,checked,{
   minimumMovingSpeedMps,strictNoNearStops,clearanceFirst,
   depth,maxFirst,maxFuture
  });
 const selected=choice.selectedPolicy;
 return {
  ...choice,
  status:selected?'PHYSICAL_MOVING_FIRST_TICK':
   ledger.blockedMoving?'A95_NO_MOVING_PHYSICAL_REQUEST':
   choice.status,
  // Expose only genuine first A64 rejections, not synthetic preview veto.
  firstRejected:choice.firstRejected?.a95PreviewRejected?
   null:choice.firstRejected,
  blockedMovingPreviewTicks:ledger.blockedMoving,
  previewLedger:ledger,
  firstMovingViolation,
  mustResweepSelectedFirstTickWithOriginalA64:true,
  originalA64Unmodified:true,
  forecastIsNot180SecondClearance:true,
  officialWrites:0,sportingApproval:'NO_GO'
 };
}
