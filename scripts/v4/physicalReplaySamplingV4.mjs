/**
 * Research-only snapshot plan for reconstructing replay from groupsAtKm.
 * Samples at regular distances AND both sides of phase boundaries.
 * The caller must supply physical groups directly, never published replay.
 */
export function planPhysicalReplaySamplesV4({distanceKm,phaseBoundariesKm=[],stepKm=5}={}){
 if(typeof distanceKm!=='number'||!Number.isFinite(distanceKm)||distanceKm<=0||
    typeof stepKm!=='number'||!Number.isFinite(stepKm)||stepKm<=0||
    !Array.isArray(phaseBoundariesKm)||phaseBoundariesKm.some(k=>
      typeof k!=='number'||!Number.isFinite(k)||k<0||k>distanceKm))
   throw Error('INVALID_REPLAY_SAMPLE_PLAN');
 const kmSet=new Set([0,distanceKm]);
 const count=Math.ceil(distanceKm/stepKm);
 if(count>10000)throw Error('REPLAY_SAMPLE_PLAN_TOO_LARGE');
 for(let i=1;i<count;i++)kmSet.add(Number(Math.min(distanceKm,i*stepKm).toFixed(6)));
 for(const boundary of phaseBoundariesKm){
   kmSet.add(Number(boundary.toFixed(6)));
   const offset=Math.min(0.001,Math.min(boundary,distanceKm-boundary)/2);
   if(offset>0){
     kmSet.add(Number((boundary-offset).toFixed(6)));
     kmSet.add(Number((boundary+offset).toFixed(6)));
   }
 }
 return [...kmSet].sort((a,b)=>a-b);
}
export function capturePhysicalReplaySamplesV4(kms,physicalGroupsAtKm){
 if(!Array.isArray(kms)||kms.length<2||typeof physicalGroupsAtKm!=='function')
   throw Error('INVALID_PHYSICAL_SAMPLE_CAPTURE');
 return kms.map(km=>({
   km,
   groups:physicalGroupsAtKm(km).map(group=>({
     riderIds:[...group.riderIds],
     gapSeconds:group.gapSeconds
   }))
 }));
}
