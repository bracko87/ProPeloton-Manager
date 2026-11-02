/** Isolated V4 mountain chase-speed experiment. No production source or replay-validation edits. */
const paceAnchor="    const effectivePelotonPaceKmh = deterministicRound("
const multiplierAnchor="        unopposedPhysicalPelotonPaceKmh *\n          calculateBaselinePelotonCruiseMultiplierV1("
export function patchV4MountainChaseEfficiencyCandidateSource(source,{gain=0.0022}={}){
 if(!Number.isFinite(gain)||gain<0||gain>0.0088)throw Error('V4 research chase gain must be between 0 and 0.0088')
 const boundedGain=Number(gain.toFixed(4))
 if(typeof source!=='string'||source.split(paceAnchor).length!==2||
    source.split(multiplierAnchor).length!==2)
  throw Error('V4 mountain chase-efficiency anchor drift: fail closed')
 const addition=[
  "    // Research-only physical work gain: no target gap, forced catch or scripted outcome.",
  "    const v4MountainChaseEnergyFraction = effectiveExplicitChaserCount>1",
  "      ? clamp(average(explicitChasers.filter(row=>",
  "          !currentFrontRiderSet.has(row.riderId) &&",
  "          !bridgeRiderSet.has(row.riderId) &&",
  "          !riderHasLostContactByKm(row.riderId))",
  "          .map(row=>phase3EnergyByRiderId.get(row.riderId)??0))/75,0.4,1)",
  "      : 0",
  "    const v4MountainChaseEfficiency =",
  "      input.stage.terrainType === 'mountain' &&",
  "      input.stage.distanceKm >= 170 && currentGapSeconds>0",
  `        ? 1+Math.min(0.018,Math.max(0,effectiveExplicitChaserCount-1)*${boundedGain})`,
  "          *v4MountainChaseEnergyFraction",
  "        : 1",
 ].join('\n')
 return source.replace(paceAnchor,addition+'\n'+paceAnchor)
  .replace(multiplierAnchor,"        unopposedPhysicalPelotonPaceKmh * v4MountainChaseEfficiency *\n          calculateBaselinePelotonCruiseMultiplierV1(")
}
