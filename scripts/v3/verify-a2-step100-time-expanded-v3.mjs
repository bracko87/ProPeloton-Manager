import assert from 'node:assert/strict';
import {step100TimeExpandedOccupancyV3} from './a2Step100TimeExpandedOccupancyV3.mjs';
const states=[];
for(let row=0;row<4;row++)for(let lane=0;lane<5;lane++)
  states.push({id:'r'+row+'_'+lane,x:600-row*5.2,
    y:.3+lane*.95,v:9});
const gates=[
  {id:'gate-1',gateX:780,minY:1.1,maxY:3.3,capacity:2},
  {id:'gate-2',gateX:1400,minY:1.1,maxY:3.3,capacity:2}
];
const bookings=states.flatMap(s=>gates.map(g=>({id:s.id,gateId:g.id,
  gateX:g.gateX,targetY:s.y<2.2?1.45:s.y>2.2?2.95:2.95,
  scheduledSeconds:0})));
const copy=JSON.stringify([states,gates,bookings]);
const a=step100TimeExpandedOccupancyV3(states,gates,bookings);
assert.equal(a.status,'DISCRETE_TWO_GATE_APPOINTMENTS_FOUND');
assert.equal(a.appointmentCount,40);
assert.equal(a.noA64PhysicalWitness,true);
assert.equal(a.discretizedNecessaryConditionsOnly,true);
assert.equal(a.checkedTimeStepSeconds,.05);
assert.equal(a.sameLaneMinimumClearanceTicks,7);
const q=a.appointments.map(x=>x.id+'/'+x.gateId+':'+x.atSeconds);
const reversed=step100TimeExpandedOccupancyV3([...states].reverse(),
  gates,[...bookings].reverse());
assert.deepEqual(q.sort(),reversed.appointments.map(x=>
  x.id+'/'+x.gateId+':'+x.atSeconds).sort());
const renamed=step100TimeExpandedOccupancyV3(states.map(s=>({...s,id:'new'+s.id})),
  gates,bookings.map(b=>({...b,id:'new'+b.id})));
assert.deepEqual(a.appointments.map(x=>x.atSeconds).sort((a,b)=>a-b),
  renamed.appointments.map(x=>x.atSeconds).sort((a,b)=>a-b));
const mirror=step100TimeExpandedOccupancyV3(states.map(s=>({...s,y:4.4-s.y})),
  gates.map(g=>({...g,minY:4.4-g.maxY,maxY:4.4-g.minY})),
  bookings.map(b=>({...b,targetY:4.4-b.targetY})));
assert.deepEqual(a.appointments.map(x=>x.atSeconds).sort((a,b)=>a-b),
  mirror.appointments.map(x=>x.atSeconds).sort((a,b)=>a-b));
assert.equal(JSON.stringify([states,gates,bookings]),copy);
const far=gates.map(g=>({...g,gateX:g.gateX+800}));
const farBookings=bookings.map(b=>({...b,gateX:b.gateX+800}));
const impossible=step100TimeExpandedOccupancyV3(states,far,farBookings,
  {horizonSeconds:10});
assert(impossible.unresolved.length>0);
assert.equal(impossible.noA64PhysicalWitness,true);
assert.equal(impossible.status,'DISCRETE_GATE_APPOINTMENTS_UNRESOLVED');
const bad=structuredClone(bookings);bad[0].targetY=-1;
assert.throws(()=>step100TimeExpandedOccupancyV3(states,gates,bad));
console.log(JSON.stringify({study:'A100_TIME_EXPANDED_TWO_GATE_OCCUPANCY',
status:'PASS',appointments:a.appointmentCount,
latticeRiderCells:a.metrics.timeExpandedRiderCells,
clearanceTicks:a.sameLaneMinimumClearanceTicks,
mirrored:true,renamed:true,permuted:true,invalidRejected:true,
knownImpossibleHorizonNotMisrepresented:true,
noPhysicalGoClaim:true,officialWrites:0}));
