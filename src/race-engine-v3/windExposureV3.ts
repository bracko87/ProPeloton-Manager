/**
 * Isolated V3 wind-direction geometry. Weather direction is FROM, route heading
 * is TO. Without a verified road bearing there is deliberately no exposure
 * estimate: assigning a fixed fraction of forecast wind as crosswind would be
 * fabricated physical data.
 */
export type CardinalWindV3 =
  | 'N' | 'NNE' | 'NE' | 'ENE' | 'E' | 'ESE' | 'SE' | 'SSE'
  | 'S' | 'SSW' | 'SW' | 'WSW' | 'W' | 'WNW' | 'NW' | 'NNW'

export interface WindExposureV3 {
  readonly roadHeadingDegrees: number
  readonly windFromDegrees: number
  readonly headwindKph: number
  readonly crosswindKph: number
  readonly tailwindKph: number
  readonly lateralWindKph: number
}
const bearings: readonly CardinalWindV3[] = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
const round6 = (n: number) => Math.round(n * 1e6) / 1e6
const normalize = (degrees:number) => ((degrees % 360) + 360) % 360
export function windFromBearingV3(from: string | number): number {
  if(typeof from==='number'){
    if(!Number.isFinite(from))throw Error('Invalid wind-from bearing')
    return normalize(from)
  }
  const direction=from.trim().toUpperCase()
  const i=bearings.indexOf(direction as CardinalWindV3)
  if(i<0)throw Error('Unknown wind-from compass direction')
  return i*22.5
}
/** Returns null instead of inventing geometry for an unknown route heading. */
export function calculateWindExposureV3(
  forecastWindKph:number, windFrom:string|number, roadHeadingDegrees:number|null,
):WindExposureV3|null {
  if(!Number.isFinite(forecastWindKph)||forecastWindKph<0||forecastWindKph>200)
    throw Error('Invalid forecast wind speed')
  const bearing=windFromBearingV3(windFrom)
  if(roadHeadingDegrees===null)return null
  if(!Number.isFinite(roadHeadingDegrees))throw Error('Invalid road heading')
  const heading=normalize(roadHeadingDegrees)
  const radians=(bearing-heading)*Math.PI/180
  // 'FROM' SW, travelling SW => +headwind; travelling NE => -headwind.
  const head=forecastWindKph*Math.cos(radians)
  const lateral=forecastWindKph*Math.sin(radians)
  return {
    roadHeadingDegrees:heading,windFromDegrees:bearing,
    headwindKph:round6(head),crosswindKph:round6(Math.abs(lateral)),
    tailwindKph:round6(Math.max(0,-head)),lateralWindKph:round6(lateral),
  }
}
