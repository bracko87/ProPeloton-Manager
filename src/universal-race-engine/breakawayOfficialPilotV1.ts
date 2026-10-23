/**
 * Authoritative Breakaway V1 release gate.
 *
 * Distinct from the THREE shadow-opportunity candidates. Only the explicit
 * first-stage controlled pilot may use the complete experimental race core;
 * all other registered candidates remain ordinary universal road stages.
 * This list must never be inferred from terrain, race, country or calendar.
 */
import {
  selectBreakawayOpportunityStageV1,
  type BreakawayStageV1,
} from './breakawayOpportunityEngineV1.ts'

export const BREAKAWAY_OFFICIAL_PILOT_STAGE_IDS_V1: readonly string[] = [
  // Trka kroz Vojvodinu, Stage 1 — Bačka Plains Opener.
  '5523cf76-8fd4-4a12-ab28-7f285c9829ff',
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
