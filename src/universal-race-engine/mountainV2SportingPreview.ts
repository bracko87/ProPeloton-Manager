/**
 * Synthetic sporting-event reconciliation preview for Mountain V2.
 * DNF, incidents and time bonuses are represented explicitly, but this
 * module does not create authoritative race results or payouts.
 */
import type { MountainV2SyntheticFinish } from './mountainV2SyntheticFinishReplay.ts'

export interface MountainV2SyntheticSportingEvents {
  readonly nonFinisherIds: readonly string[]
  readonly incidents: readonly {readonly riderId:string;readonly penaltySeconds:number}[]
  readonly bonuses: readonly {readonly riderId:string;readonly bonusSeconds:number}[]
}
export interface MountainV2SportingPreview {
  readonly authority:'synthetic_only'
  readonly classified: readonly { readonly riderId:string;readonly rank:number;readonly physicalElapsedSeconds:number;readonly adjustedSeconds:number }[]
  readonly nonFinishers: readonly string[]
  readonly incidentPenaltiesSeconds:Readonly<Record<string,number>>
  readonly timeBonusesSeconds:Readonly<Record<string,number>>
}
/** Physical finish order is never rewritten by GC adjustments. */
export function buildMountainV2SportingPreview(
  physicalFinish: readonly MountainV2SyntheticFinish[],
  events: MountainV2SyntheticSportingEvents,
): MountainV2SportingPreview {
  const ids=physicalFinish.map(r=>r.riderId)
  const active=new Set(ids)
  if(active.size!==ids.length||ids.length===0)throw new Error('Invalid synthetic finish membership')
  const dnf=new Set(events.nonFinisherIds)
  if(dnf.size!==events.nonFinisherIds.length||[...dnf].some(id=>!active.has(id))){
    throw new Error('Invalid synthetic nonfinisher membership')
  }
  const penalties:Record<string,number>={}
  const bonuses:Record<string,number>={}
  for(const e of events.incidents){
    if(!active.has(e.riderId)||dnf.has(e.riderId)||!Number.isFinite(e.penaltySeconds)||e.penaltySeconds<0||
      Object.hasOwn(penalties,e.riderId))throw new Error('Invalid synthetic incident penalty')
    penalties[e.riderId]=e.penaltySeconds
  }
  for(const e of events.bonuses){
    if(!active.has(e.riderId)||dnf.has(e.riderId)||!Number.isFinite(e.bonusSeconds)||e.bonusSeconds<0||
      Object.hasOwn(bonuses,e.riderId))throw new Error('Invalid synthetic time bonus')
    bonuses[e.riderId]=e.bonusSeconds
  }
  const finishers=physicalFinish.filter(r=>!dnf.has(r.riderId))
  if(finishers.some(r=>!Number.isFinite(r.elapsedSeconds)||r.elapsedSeconds<0||!Number.isFinite(r.rank)||
    r.rank<1))throw new Error('Invalid synthetic physical classification')
  const classified=finishers.map((r,index)=>({
    riderId:r.riderId,rank:index+1,physicalElapsedSeconds:r.elapsedSeconds,
    adjustedSeconds:r.elapsedSeconds+(penalties[r.riderId]??0)-(bonuses[r.riderId]??0),
  }))
  if(classified.some(r=>!Number.isFinite(r.adjustedSeconds)||r.adjustedSeconds<0))throw new Error('Invalid adjusted sporting time')
  return {authority:'synthetic_only',classified,nonFinishers:[...dnf],incidentPenaltiesSeconds:penalties,timeBonusesSeconds:bonuses}
}
