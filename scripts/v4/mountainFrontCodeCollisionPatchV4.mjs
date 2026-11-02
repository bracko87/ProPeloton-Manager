/** Research-only V4 group-label correction; physical lineages and gaps are untouched. */
const anchor="        displayCode: lineage.displayCode,\n        physicalLineageId: lineage.lineageId,"
export function patchV4MountainFrontCollisionSource(source){
 if(typeof source!=='string'||source.split(anchor).length!==2)
  throw Error('V4 mountain front display collision anchor drift: fail closed')
 const replacement=[
  "        displayCode: input.stage.terrainType === 'mountain' &&",
  "          stageDistanceKm >= 200 && leadingRiderIds.length > 0 &&",
  "          leadingDisplayCode === lineage.displayCode",
  "          ? 'F3' : lineage.displayCode,",
  "        physicalLineageId: lineage.lineageId,"
 ].join('\n')
 return source.replace(anchor,replacement)
}
