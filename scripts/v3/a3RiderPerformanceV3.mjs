/**
 * Research-only deterministic individual racing characteristics for the
 * ALTERNATE discrete lane engine. No A64 change and no production writes.
 *
 * Attacks are individual rider decisions; peloton membership comes from
 * observed 8-second gaps, never from a shared group speed. Drafting is
 * permitted only behind a rider in the SAME current occupancy lane.
 */
const cap=(v,a,b)=>Math.max(a,Math.min(b,v));
const q=v=>Math.round(v*1e6)/1e6;
const TYPES=['climber','sprinter','rouleur','all_rounder','domestique','puncheur'];
export function a3RiderProfileV3(ordinal){
 if(!Number.isInteger(ordinal)||ordinal<0||ordinal>200)
  throw Error('A3 invalid rider ordinal');
 const type=TYPES[ordinal%TYPES.length];
 const climb={climber:.96,sprinter:.31,rouleur:.43,all_rounder:.71,
   domestique:.55,puncheur:.79}[type];
 const endurance={climber:.77,sprinter:.53,rouleur:.89,all_rounder:.82,
   domestique:.94,puncheur:.67}[type];
 return {type,climb,endurance,
   attack:.55+((ordinal*7)%13)/20,
   basePace:q(.05*((ordinal%5)-2)),
   fatigueEnergyJ:17000+endurance*1600};
}
export function a3GradientV3(layout,x){
 if(!['staged','double'].includes(layout)||!Number.isFinite(x))
  throw Error('A3 invalid grade query');
 // Two synthetic uphills, same positions but second slope differs.
 if(x>=740&&x<925)return .035;
 if(x>=1190&&x<1430)return layout==='staged'?.055:.075;
 if(x>=925&&x<1010)return -.018;
 return 0;
}
export function a3DraftFractionV3(rider,leader){
 if(!rider||!leader||rider.id===leader.id)return 0;
 if(rider.phase!==leader.phase||
   (rider.phase==='middle'||rider.phase==='wide'?
     rider.lane!==leader.lane:rider.channel!==leader.channel))
   return 0;
 const gap=leader.x-rider.x;
 if(gap<1.85||gap>13)return 0;
 return q(cap(.41-(gap-1.85)*.027,0,.41));
}
export function a3AttackStateV3(state,rider){
 const selected=state.attackScenario==='leader_surge'&&
   (rider.ordinal===0||rider.ordinal===3);
 if(!selected||rider.phase==='wide')return 'none';
 if(state.time>=49&&state.time<91)return 'attacking';
 if(state.time>=91&&state.time<158)return 'recovering';
 return 'none';
}
export function a3PerformanceIntentV3(state,rider,draft=0){
 if(state.performanceMode!=='profiles_v1')
  throw Error('A3 performance not enabled');
 const p=rider.performance;
 if(!p||!Number.isFinite(draft)||draft<0||draft>.41)
  throw Error('A3 invalid individual athlete profile');
 const grade=a3GradientV3(state.layout,rider.x);
 const attack=a3AttackStateV3(state,rider);
 const baseline=(rider.channel===0?10.35:8.95)+p.basePace;
 // A stronger climber loses less nominal speed on steeper grades.
 const hillLoss=Math.max(0,grade)*27*(1.22-p.climb*.7);
 const downhillGain=grade<0?.28:0;
 const fatigue=Math.max(0,p.fatigueEnergyJ-rider.energyJ)/5700;
 const draftingHelp=.23*draft/.41;
 const attackGain=attack==='attacking'?2.05+p.attack*.65:0;
 const recoveryLoss=attack==='recovering'?1.65:0;
 return {target:q(cap(baseline-hillLoss+downhillGain-fatigue+
      draftingHelp+attackGain-recoveryLoss,6.5,13.65)),
   grade,attack,draft,bodyType:p.type,fatiguePenalty:q(fatigue)};
}
export function a3EnergyStepV3(rider,{
 speed,grade,draft,attack
},dt=.1){
 if(!rider?.performance||![speed,grade,draft,dt].every(Number.isFinite)||
   dt<=0||dt>.5)
  throw Error('A3 invalid energy research step');
 const p=rider.performance;
 // Deliberately synthetic manager-game energy units (not calibrated W').
 // Cycling faster and on steeper gradients costs more; shelter reduces
 // effort, with gradual recovery on easier riding.
 const work=(17+Math.max(0,speed-8.5)*22+
    Math.max(0,grade)*360*(1.25-.6*p.climb)+
    (attack==='attacking'?46:0))*(1-.5*draft);
 const recovery=speed<9?21*(9-speed)/2:0;
 const drain=Math.max(0,work-recovery)*dt/(.8+.4*p.endurance);
 return q(cap(rider.energyJ-drain,0,23000));
}
