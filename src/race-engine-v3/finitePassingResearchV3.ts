/** Three-tick passing option. STRICTLY OFFLINE RESEARCH, never official. */
export interface FinitePassReservationV3 {readonly riderId:string;readonly fromLane:number;readonly toLane:number;readonly remainingTicks:number;readonly requiredTicks:number}
export interface FinitePassingResearchStateV3 {pending:FinitePassReservationV3|null;lastStartTick:number;attempts:number;completed:number;rejected:number;cumulativeExtraMechanicalJoules:number}
export interface PassingWheelV3 {readonly riderId:string;readonly meters:number;readonly lane:number}
export interface PassingMotionV3 extends PassingWheelV3 {readonly oldMeters:number;readonly wheelLimited:boolean}
function check(v:boolean,m:string):asserts v {if(!v)throw Error(m)}
export function initializeFinitePassingV3():FinitePassingResearchStateV3{return {pending:null,lastStartTick:-9999,attempts:0,completed:0,rejected:0,cumulativeExtraMechanicalJoules:0}}
export function validateFinitePassingV3(state:FinitePassingResearchStateV3,ids:readonly string[],lanes:number,durationTicks=3):void{
 check(Number.isInteger(durationTicks)&&durationTicks>=2&&durationTicks<=4,'Invalid passing duration')
 check(!!state&&Number.isInteger(state.lastStartTick)&&Number.isInteger(state.attempts)&&Number.isInteger(state.completed)&&Number.isInteger(state.rejected)&&Number.isFinite(state.cumulativeExtraMechanicalJoules)&&state.attempts>=0&&state.completed>=0&&state.rejected>=0&&state.cumulativeExtraMechanicalJoules>=0&&state.completed+state.rejected<=state.attempts,'Invalid passing checkpoint counters')
 if(state.pending){const p=state.pending;check(ids.includes(p.riderId)&&p.fromLane>=0&&p.fromLane<lanes&&p.toLane>=0&&p.toLane<lanes&&Number.isInteger(p.fromLane)&&Number.isInteger(p.toLane)&&Math.abs(p.fromLane-p.toLane)===1&&p.requiredTicks===durationTicks&&Number.isInteger(p.remainingTicks)&&p.remainingTicks>=1&&p.remainingTicks<=durationTicks,'Invalid pending passing checkpoint')}
}
export function capFinitePassSpeedV3(requested:number,watts:number,demand:(v:number)=>number,extraWatts=35):number{
 check(Number.isFinite(requested)&&requested>=0&&requested<=30&&Number.isFinite(watts)&&watts>=0&&Number.isFinite(extraWatts)&&extraWatts>=0&&extraWatts<=100,'Invalid passing power budget')
 const budget=Math.max(0,watts-extraWatts),zero=demand(0),top=demand(requested)
 check(Number.isFinite(zero)&&Number.isFinite(top)&&zero>=0&&top>=zero,'Invalid passing road-power curve')
 if(top<=budget)return requested
 if(zero>budget)return 0
 let lo=0,hi=requested
 for(let i=0;i<44;i++){const m=(lo+hi)/2,w=demand(m);check(Number.isFinite(w)&&w>=0,'Invalid intermediate power');if(w<=budget)lo=m;else hi=m}
 return Math.max(0,Math.floor(lo*1e6)/1e6-.000002)
}
export function startFinitePassV3(s:FinitePassingResearchStateV3,choice:{riderId:string;fromLane:number;lane:number;meters:number},moves:readonly PassingMotionV3[],tick:number,durationTicks=3):FinitePassingResearchStateV3{
 check(Number.isInteger(durationTicks)&&durationTicks>=2&&durationTicks<=4,'Invalid passing duration')
 check(s.pending===null&&Number.isInteger(tick)&&tick-s.lastStartTick>=8,'Parallel or early passing')
 const r=moves.find(m=>m.riderId===choice.riderId)
 check(!!r&&r.wheelLimited&&r.lane===choice.fromLane&&Math.abs(r.meters-choice.meters)<.00001&&Math.abs(choice.lane-choice.fromLane)===1,'Stale pass choice')
 check(!moves.some(x=>x.riderId!==choice.riderId&&x.lane===choice.lane&&Math.abs(x.meters-r.meters)<1.8-1e-5),'Unsafe destination')
 return {...s,pending:{riderId:r.riderId,fromLane:r.lane,toLane:choice.lane,remainingTicks:durationTicks,requiredTicks:durationTicks},lastStartTick:tick,attempts:s.attempts+1}
}
export function stepFinitePassV3(s:FinitePassingResearchStateV3,before:readonly PassingWheelV3[],moves:readonly PassingMotionV3[],dt:number,extra=35):{state:FinitePassingResearchStateV3;commitLane:{riderId:string;toLane:number}|null;chargedRiderId:string|null}{
 check(Number.isFinite(dt)&&dt>0&&dt<=20&&Number.isFinite(extra)&&extra>=0&&extra<=100,'Invalid passing cost')
 const p=s.pending
 if(!p)return {state:s,commitLane:null,chargedRiderId:null}
 const a=before.find(x=>x.riderId===p.riderId),b=moves.find(x=>x.riderId===p.riderId)
 check(!!a&&!!b&&a.lane===p.fromLane&&b.lane===p.fromLane&&b.meters>=a.meters-1e-5,'Passing rider left reservation')
 let safe=true
 for(const other of before){if(other.riderId===p.riderId)continue
  const next=moves.find(x=>x.riderId===other.riderId)
  if(!next)throw Error('Missing swept-corridor traffic')
  if(other.lane!==p.toLane&&next.lane!==p.toLane)continue
  const d0=a.meters-other.meters,d1=b.meters-next.meters
  if(d0*d1<0||Math.min(Math.abs(d0),Math.abs(d1))<1.8-1e-6){safe=false;break}
 }
 const charged={...s,cumulativeExtraMechanicalJoules:s.cumulativeExtraMechanicalJoules+extra*dt}
 if(!safe)return {state:{...charged,pending:null,rejected:s.rejected+1},commitLane:null,chargedRiderId:p.riderId}
 if(p.remainingTicks>1)return {state:{...charged,pending:{...p,remainingTicks:p.remainingTicks-1}},commitLane:null,chargedRiderId:p.riderId}
 return {state:{...charged,pending:null,completed:s.completed+1},commitLane:{riderId:p.riderId,toLane:p.toLane},chargedRiderId:p.riderId}
}
