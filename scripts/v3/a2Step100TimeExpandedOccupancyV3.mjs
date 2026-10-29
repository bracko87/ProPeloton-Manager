/** Step100: discrete time-expanded, coupled TWO-GATE occupancy feasibility screen.
 * Research only: this constructs necessary gate-cell appointments, NOT an A64
 * trajectory or a claim that path segments between those cells are safe.
 * Reaching a gate cell does not imply a safe continuous lateral crossing.
 */
const EPS=1e-8;
const finite=Number.isFinite;
const round=x=>Math.round(x*1e6)/1e6;
const min=(a,b)=>Math.min(a,b);
const max=(a,b)=>Math.max(a,b);
function distance(v,t,a,limit){
  const duration=a>0?max(0,(limit-v)/a):max(0,(v-limit)/(-a));
  const u=min(t,duration);
  return v*u+a*u*u/2+(t-u)*limit;
}
function bounds(s,t,p){
  return {lo:s.x+distance(s.v,t,-p.brakingMps2,p.minSpeedMps),
    hi:s.x+distance(s.v,t,p.accelerationMps2,p.maxSpeedMps)};
}
function uniqueById(states){
  const m=new Map();
  for(const s of states){
    if(!s||typeof s.id!=='string'||!s.id||m.has(s.id)||
       ![s.x,s.y,s.v].every(finite)||s.x<0||s.y<0||s.y>4.4||s.v<0||s.v>50)
      throw Error('A100 invalid unique achieved physical states');
    m.set(s.id,s);
  }
  return m;
}
function validate(states,gates,bookings,p){
  if(!Array.isArray(states)||states.length<2||states.length>168||
     !Array.isArray(gates)||gates.length!==2||
     !Array.isArray(bookings)||
     ![p.dt,p.horizonSeconds,p.minSpeedMps,p.maxSpeedMps,
       p.accelerationMps2,p.brakingMps2,p.lateralMps,
       p.bodyHalfWidthM,p.bodyClearanceM].every(finite)||
     p.dt!==.05||p.horizonSeconds<10||p.horizonSeconds>180||
     p.horizonSeconds/p.dt%1!==0||
     p.minSpeedMps<4.5||p.maxSpeedMps>50||p.maxSpeedMps<=p.minSpeedMps||
     p.accelerationMps2<=0||p.brakingMps2<=0||p.lateralMps<=0||
     p.bodyHalfWidthM<.3||p.bodyClearanceM<=.8)
    throw Error('A100 invalid bounded time-expanded research configuration');
  const ids=uniqueById(states);
  for(let i=0;i<2;i++){
    const g=gates[i];
    if(!g||typeof g.id!=='string'||!g.id||
      ![g.gateX,g.minY,g.maxY,g.capacity].every(finite)||
      g.gateX<=0||g.minY<0||g.maxY>4.4||
      g.maxY-g.minY<2*p.bodyHalfWidthM||
      !Number.isInteger(g.capacity)||g.capacity<1||g.capacity>5||
      (i===1&&g.gateX<=gates[0].gateX))
      throw Error('A100 invalid physical gate geometry');
  }
  const byGate=new Map(gates.map(g=>[g.id,new Map()]));
  for(const b of bookings){
    if(!b||!ids.has(b.id)||!byGate.has(b.gateId)||
       ![b.gateX,b.targetY].every(finite))
      throw Error('A100 invalid gate booking');
    const g=gates.find(g=>g.id===b.gateId);
    if(Math.abs(g.gateX-b.gateX)>EPS||
       b.targetY<g.minY+p.bodyHalfWidthM-EPS||
       b.targetY>g.maxY-p.bodyHalfWidthM+EPS||
       byGate.get(g.id).has(b.id))
      throw Error('A100 duplicate or geometrically impossible appointment');
    byGate.get(g.id).set(b.id,b);
  }
  if(gates.some(g=>byGate.get(g.id).size!==states.length))
    throw Error('A100 requires full two-gate rider demand');
  return {ids,byGate};
}
function firstReachTick(s,x,p,maxTick,edge){
  if(s.x>=x-EPS)return 0;
  for(let tick=1;tick<=maxTick;tick++){
    const b=bounds(s,tick*p.dt,p);
    if(b[edge]>=x-EPS)return tick;
  }
  return null;
}
function targetLanes(g,p){
  const left=g.minY+p.bodyHalfWidthM+.05;
  const right=g.maxY-p.bodyHalfWidthM-.05;
  if(g.capacity===1)return [round((left+right)/2)];
  const targets=Array.from({length:g.capacity},(_,i)=>
    round(left+(right-left)*i/(g.capacity-1)));
  for(let i=1;i<targets.length;i++)
    if(targets[i]-targets[i-1]<p.bodyClearanceM-EPS)
      throw Error('A100 requested gate lanes overlap physical bicycle widths');
  return targets;
}
const key=(gate,lane,tick)=>gate+'|'+lane+'|'+tick;
/**
 * The result is intentionally a necessary, discretized scheduling proposal.
 * It never claims a 2-D path is feasible, and never applies physical motion.
 */
export function step100TimeExpandedOccupancyV3(states,gates,bookings,opts={}){
  const p={dt:.05,horizonSeconds:180,minSpeedMps:6.5,maxSpeedMps:50,
    accelerationMps2:.45,brakingMps2:.85,lateralMps:.38,
    bodyHalfWidthM:.3,bodyClearanceM:.8001,...opts};
  const {ids,byGate}=validate(states,gates,bookings,p);
  const before=JSON.stringify([states,gates,bookings]);
  const maxTick=Math.round(p.horizonSeconds/p.dt);
  const allocations=[],unresolved=[],boundsByRider=new Map();
  const cells=new Set(),times=new Map();
  // Continuous A64 bodies need ~2.25m signed longitudinal clearance.
  // A .05s lattice requires at least seven cells at 6.5m/s, not one.
  const longitudinalClearanceTicks=Math.ceil(2.25/p.minSpeedMps/p.dt-EPS);
  const totals={timeExpandedRiderCells:0,
    checkedReachabilityBounds:0,checkedGateLaneCells:0,
    occupiedGateLaneCells:0,closeInitialRiderPairs:0,
    sameRowSlotTies:0,sameLanePrecedenceEdges:0,
    crossGateTransitEdges:0,potentialSweptPairTimeConstraints:0,
    potentiallyInteractingPairs:0,unreachableBySpeed:0,
    unreachableByLateralMotion:0,slotCapacityConflicts:0};
  // Each vertex (rider,t) contains an *interval* of kinematically reachable X.
  // These are optimistic envelopes, not fully reachable joint 2-D states.
  for(const s of states){
    const minX=[],maxX=[];
    for(let t=0;t<=maxTick;t++){
      const b=bounds(s,t*p.dt,p);
      minX.push(round(b.lo));maxX.push(round(b.hi));
      totals.checkedReachabilityBounds++;
      totals.timeExpandedRiderCells++;
    }
    boundsByRider.set(s.id,{minX,maxX});
  }
  for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++)
    if(Math.abs(states[i].x-states[j].x)<6&&
       Math.abs(states[i].y-states[j].y)<1.3)
      totals.closeInitialRiderPairs++;
  // Build coupled, time-indexed pair constraints for all bodies in the
  // first eight seconds. Overlapping *reachable tubes* are warnings, not
  // collisions: no trajectory is assigned within a tube yet.
  for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
    const a=states[i],b=states[j];
    if(Math.abs(a.x-b.x)>60)continue;
    const A=boundsByRider.get(a.id),B=boundsByRider.get(b.id);
    let interacted=false;
    for(let tick=0;tick<=Math.min(maxTick,160);tick+=10){
      const t=tick*p.dt, dy=p.lateralMps*t;
      const ay0=Math.max(0,a.y-dy),ay1=Math.min(4.4,a.y+dy);
      const by0=Math.max(0,b.y-dy),by1=Math.min(4.4,b.y+dy);
      if(A.minX[tick]-B.maxX[tick]>=2.25||
         B.minX[tick]-A.maxX[tick]>=2.25||
         ay0-by1>=.84||by0-ay1>=.84)continue;
      totals.potentialSweptPairTimeConstraints++;
      interacted=true;
    }
    if(interacted)totals.potentiallyInteractingPairs++;
  }
  const finalGateData=[];
  for(let k=0;k<2;k++){
    const g=gates[k],lanes=targetLanes(g,p),requests=[];
    const assignments=[];
    for(const s of states){
      const b=byGate.get(g.id).get(s.id);
      const first=firstReachTick(s,g.gateX,p,maxTick,'hi');
      const last=firstReachTick(s,g.gateX,p,maxTick,'lo');
      const lateralTick=Math.ceil(Math.abs(s.y-b.targetY)/p.lateralMps/p.dt-EPS);
      if(first===null){
        totals.unreachableBySpeed++;
        unresolved.push({gateId:g.id,riderId:s.id,reason:'NO_OPTIMISTIC_X_REACH'});
        continue;
      }
      const lo=Math.max(first,lateralTick);
      const hi=last===null?maxTick:last;
      if(lateralTick>hi){
        totals.unreachableByLateralMotion++;
        unresolved.push({gateId:g.id,riderId:s.id,reason:'NO_LATERAL_TIME'});
        continue;
      }
      const laneDistances=lanes.map((y,lane)=>({lane,d:Math.abs(y-b.targetY)}))
        .sort((a,b)=>a.d-b.d||a.lane-b.lane);
      // A center-line tie is not resolved using identity or left/right.
      const tied=laneDistances.length>1&&
        Math.abs(laneDistances[0].d-laneDistances[1].d)<EPS;
      requests.push({s,b,lo,hi,possibleLanes:tied?
        laneDistances.filter(o=>Math.abs(o.d-laneDistances[0].d)<EPS)
          .map(o=>o.lane):[laneDistances[0].lane],tied});
    }
    // Pure physical ordering: leading rows first, then closeness to requested
    // corridor. Equal geometry is deliberately marked unresolved, never ID-tied.
    requests.sort((a,b)=>b.s.x-a.s.x||
      Math.abs(a.s.y-a.b.targetY)-Math.abs(b.s.y-b.b.targetY)||
      a.lo-b.lo);
    const prevInLane=new Map();
    for(let i=0;i<requests.length;i++){
      const r=requests[i];
      if(i>0&&Math.abs(r.s.x-requests[i-1].s.x)<EPS&&
         Math.abs(r.s.y-requests[i-1].s.y)<EPS){
        totals.sameRowSlotTies++;
        unresolved.push({gateId:g.id,riderId:r.s.id,
          reason:'GEOMETRICALLY_IDENTICAL_UNORDERED_REQUESTS'});
        continue;
      }
      let earliest=r.lo,latest=r.hi;
      const prevTime=times.get(r.s.id);
      if(prevTime!==undefined){
        const lastGate=gates[k-1];
        const d=g.gateX-lastGate.gateX;
        // Cross-gate edge is an optimistic (not achieved) transit bound.
        const priorAt=prevTime*p.dt;
        const vAtMost=Math.min(p.maxSpeedMps,
          r.s.v+p.accelerationMps2*priorAt);
        let tick=0;
        while(tick<=maxTick&&
          distance(vAtMost,tick*p.dt,p.accelerationMps2,
            p.maxSpeedMps)<d-EPS)tick++;
        earliest=Math.max(earliest,prevTime+tick);
        const priorTarget=byGate.get(lastGate.id).get(r.s.id).targetY;
        const transitLateralTicks=Math.ceil(
          Math.abs(r.b.targetY-priorTarget)/p.lateralMps/p.dt-EPS);
        earliest=Math.max(earliest,prevTime+transitLateralTicks);
        latest=Math.min(latest,prevTime+
          Math.floor(d/p.minSpeedMps/p.dt+EPS));
        totals.crossGateTransitEdges++;
      }
      let chosen=null;
      for(let tick=earliest;tick<=latest&&!chosen;tick++){
        for(const lane of r.possibleLanes){
          totals.checkedGateLaneCells++;
          const lkey=g.id+'|'+lane;
          const prior=prevInLane.get(lkey);
          if(prior!==undefined&&tick<prior+longitudinalClearanceTicks){
            totals.sameLanePrecedenceEdges++;
            continue;
          }
          if(cells.has(key(g.id,lane,tick))){
            totals.slotCapacityConflicts++;
            continue;
          }
          chosen={id:r.s.id,gateId:g.id,lane,tick,
            atSeconds:round(tick*p.dt),targetY:lanes[lane],
            earliestSeconds:round(earliest*p.dt),
            latestSeconds:round(latest*p.dt),
            originalBookedAt:r.b.scheduledSeconds??null};
          break;
        }
      }
      if(!chosen){
        unresolved.push({gateId:g.id,riderId:r.s.id,
          reason:earliest>latest?'NO_CROSS_GATE_REACHABLE_TIME':'NO_FREE_DISCRETE_GATE_CELL',
          earliestSeconds:round(earliest*p.dt),
          latestSeconds:round(latest*p.dt)});
        continue;
      }
      cells.add(key(g.id,chosen.lane,chosen.tick));
      prevInLane.set(g.id+'|'+chosen.lane,chosen.tick);
      times.set(r.s.id,chosen.tick);
      assignments.push(chosen);allocations.push(chosen);
      totals.occupiedGateLaneCells++;
    }
    finalGateData.push({gateId:g.id,gateX:g.gateX,
      capacity:g.capacity,laneCenters:lanes,
      assigned:assignments.length,required:states.length,
      latestAssignedSeconds:assignments.length?
        Math.max(...assignments.map(a=>a.atSeconds)):null});
  }
  if(JSON.stringify([states,gates,bookings])!==before)
    throw Error('A100 mutated original physical states or gate data');
  const physicallyComplete=allocations.length===2*states.length;
  return {status:physicallyComplete?
      'DISCRETE_TWO_GATE_APPOINTMENTS_FOUND':'DISCRETE_GATE_APPOINTMENTS_UNRESOLVED',
    riderCount:states.length,requiredAppointments:states.length*2,
    appointmentCount:allocations.length,gateSummary:finalGateData,
    appointments:allocations,unresolved,metrics:totals,
    minMovingFloor:p.minSpeedMps,
    checkedTimeStepSeconds:p.dt,
    sameLaneMinimumClearanceTicks:longitudinalClearanceTicks,
    horizonSeconds:p.horizonSeconds,
    identityGeometryNeutral:true,
    discretizedNecessaryConditionsOnly:true,
    doesNotProveContinuousOccupancy:true,
    noA64PhysicalWitness:true,
    noAcceptedXyvOrEnergyModified:true,
    noProductionIntegration:true,officialWrites:0,
    sportingApproval:'NO_GO_PENDING_ORIGINAL_A64_180S'};
}
