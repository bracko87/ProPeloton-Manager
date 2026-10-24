/**
 * Authoritative Breakaway V1 release gate.
 *
 * Distinct from the shadow-opportunity candidate registry. Only expressly
 * approved stage UUIDs may use the complete experimental race core;
 * unapproved candidates remain ordinary universal road stages.
 * This list must never be inferred from terrain, race, country or calendar.
 */
import {
  selectBreakawayOpportunityStageV1,
  type BreakawayStageV1,
} from './breakawayOpportunityEngineV1.ts'

export const BREAKAWAY_OFFICIAL_PILOT_STAGE_IDS_V1: readonly string[] = [
  // Trka kroz Vojvodinu, Stage 1 — Bačka Plains Opener.
  '5523cf76-8fd4-4a12-ab28-7f285c9829ff',
  // Binche–Chimay–Binche / Mémorial Franco Vandenbroeck — Oct 7, hilly.
  '335708f7-d56a-4816-9068-38399e8f74e3',
  // Tacx Zeeland Classic / Ronde van Zeeland — Oct 12, flat 204.6 km.
  '7f69e552-b116-453c-bf55-16ef655ea021',
] as const

const pilotIds=new Set(BREAKAWAY_OFFICIAL_PILOT_STAGE_IDS_V1)
if(pilotIds.size!==BREAKAWAY_OFFICIAL_PILOT_STAGE_IDS_V1.length){
  throw new Error('Duplicate authoritative breakaway pilot stage ID')
}

/** An approved stage must ALSO retain its exact listed terrain/format. */
export function isBreakawayOfficialPilotStageV1(stage:BreakawayStageV1):boolean{
  return pilotIds.has(stage.stageId.toLowerCase()) &&
    selectBreakawayOpportunityStageV1(stage)!==null
}
