/** Pure, multi-label, source-level comparison. Observations are NOT causal isolation. */
export function summarizePairedConstraintsV3(control,candidate){
 if(control.length!==candidate.length)throw Error('Different rider roster length')
 const b=new Map(candidate.map(x=>[x.riderId,x]))
 if(b.size!==candidate.length||new Set(control.map(x=>x.riderId)).size!==control.length||control.some(x=>!b.has(x.riderId)))throw Error('Different or duplicate rider roster')
 const metrics={compared:control.length,changedAchieved:0,changedRequested:0,changedShelter:0,changedAvailablePower:0,changedWheel:0,changedEnergyLimit:0,changedPassLimit:0,changedActualWatts:0,changedWPrime:0,changedDraftLeader:0,changedNearestSameLaneLeader:0,maxAdvanceDifferenceMeters:0}
 const comparisons=[]
 for(const a of control){
  const c=b.get(a.riderId),d=(k,eps=1e-7)=>Math.abs(a[k]-c[k])>eps
  const achieved=d('achievedMps',1e-5),requested=d('commandedMps',1e-5),shelter=d('shelterFraction',1e-6),available=d('availableWatts',1e-5),wheel=a.wheelLimited!==c.wheelLimited||d('preventedMeters',1e-5),energy=d('postEnergyRequestedMps',1e-5)&&!d('preEnergyRequestedMps',1e-5),passing=d('postPassRequestedMps',1e-5)&&!d('postEnergyRequestedMps',1e-5),watts=d('actualMechanicalWatts',1e-5),wprime=(a.wPrimeAfterJ!==null&&c.wPrimeAfterJ!==null)?d('wPrimeAfterJ',1e-5):false,draft=a.draftLeaderId!==c.draftLeaderId,lead=a.sameLaneLeaderId!==c.sameLaneLeaderId
  metrics.changedAchieved+=Number(achieved);metrics.changedRequested+=Number(requested);metrics.changedShelter+=Number(shelter);metrics.changedAvailablePower+=Number(available);metrics.changedWheel+=Number(wheel);metrics.changedEnergyLimit+=Number(energy);metrics.changedPassLimit+=Number(passing);metrics.changedActualWatts+=Number(watts);metrics.changedWPrime+=Number(wprime);metrics.changedDraftLeader+=Number(draft);metrics.changedNearestSameLaneLeader+=Number(lead)
  metrics.maxAdvanceDifferenceMeters=Math.max(metrics.maxAdvanceDifferenceMeters,Math.abs((c.metersAfter-c.metersBefore)-(a.metersAfter-a.metersBefore)))
  if(achieved||requested||shelter||available||wheel||energy||passing||watts||wprime||draft||lead)comparisons.push({riderId:a.riderId,achieved,requested,shelter,available,wheel,energy,passing,watts,wprime,draft,lead,control:a,perturbed:c})
 }
 return {metrics:{...metrics,maxAdvanceDifferenceMeters:Math.round(metrics.maxAdvanceDifferenceMeters*1e6)/1e6},differences:comparisons}
}
