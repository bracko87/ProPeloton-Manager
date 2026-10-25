/** Offline operator fixture validation. Never publish source rider rows. */
export const privatePowerColumns = Object.freeze([
 'idx','startStamina','raceSharpness','recovery','morale',
 'equipmentStagePerformancePct','inStageEnergyCostMultiplier','resistance'
])
export function parsePrivatePowerSupplementV3(csv,expectedCount){
 if(!Number.isInteger(expectedCount)||expectedCount<1||expectedCount>260)throw Error('Invalid expected rider count')
 const lines=csv.trim().split(/\r?\n/)
 const names=lines.shift()?.split(',') ?? []
 if(names.length!==privatePowerColumns.length || privatePowerColumns.some((name,i)=>names[i]!==name))
   throw Error('Private source fixture must include idx, source resistance and all six source energy/preparation fields in the expected order')
 if(lines.length!==expectedCount)throw Error('Private source rider count mismatch')
 const records=new Map()
 for(const line of lines){
  const cells=line.split(',')
  if(cells.length!==names.length)throw Error('Incomplete private rider row')
  const values=Object.fromEntries(names.map((key,i)=>[key,Number(cells[i])]))
  const idx=values.idx
  if(!Number.isInteger(idx)||idx<1||idx>expectedCount||records.has(idx))throw Error('Nonsequential or duplicate de-identified rider index')
  const limits={startStamina:[0,100],raceSharpness:[0,100],recovery:[0,100],morale:[0,100],equipmentStagePerformancePct:[-15,15],inStageEnergyCostMultiplier:[.5,2],resistance:[0,100]}
  for(const [key,[a,b]] of Object.entries(limits)){
    if(cells[names.indexOf(key)]===''||!Number.isFinite(values[key])||values[key]<a||values[key]>b)throw Error('Invalid private source '+key)
  }
  records.set(idx,values)
 }
 for(let idx=1;idx<=expectedCount;idx++)if(!records.has(idx))throw Error('Missing de-identified source rider index')
 return records
}
