/**
 * Experimental mountain physics is an explicit, stage-ID-scoped pilot.
 *
 * Do not infer pilot eligibility from terrain, race category or date.
 * Only user-approved stage IDs may exercise this branch while the mountain
 * engine remains under separate acceptance review. All other stages keep
 * their established universal-engine behavior.
 *
 * Change this list through a reviewed PR; never rewrite already published
 * official results to exercise the pilot.
 */
export const MOUNTAIN_ENGINE_PILOT_V1 = 'mountain_engine_pilot_v1' as const

export const MOUNTAIN_ENGINE_PILOT_STAGE_IDS_V1: readonly string[] = [
  // Xingtai Stage 2: real post-deployment baseline (already completed).
  '62c7ca62-b6aa-470f-bf32-0822f64849c0',
  // Tour of Poyang Lakes Stage 7: general mountain finish.
  '9c329adc-ccbf-45cf-8b5f-5b07604b341a',
  // Trofeo Tessile & Moda Valdengo–Oropa: summit-finish acceptance.
  '0885f370-5082-4bbe-994f-3938f00b7b11',
  // Season 1 October 2026 decision: eight upcoming October mountain road stages.
  // October 16: Central American Road Championships.
  'e00c9ead-91fd-41ce-95f0-de3e4d241e16',
  // October 19: Tour of Guangxi — Yizhou to Nongla (summit).
  'dd6681d1-e565-43f3-8449-0bb203b0eb07',
  // October 22: Mauritius National Road Championship.
  'a448f8a2-7c9a-426f-8482-d098de506bdb',
  // October 26: International Tour of Guadeloupe — Stage 5.
  '1f651095-bea0-4e3b-a0f5-d45c9159de92',
  // October 28: International Tour of Guadeloupe — Stage 6.
  '17a68003-e433-4927-ab0b-c62c57aebc7b',
  // October 30: Black River Gorges Tour — Stage 2.
  'fbe8548d-19c6-4c1b-a8cb-dc8e2bf52dc9',
  // October 30: UAE National Qualification — Group 1 (summit).
  '8a320efa-36af-40ab-b106-0af6e4a9ff31',
  // October 31: UAE National Qualification — Group 2 (summit).
  'eb74b4c3-1930-4c90-9092-1cd964c138aa',
] as const

const pilotIds = new Set(MOUNTAIN_ENGINE_PILOT_STAGE_IDS_V1)

export interface MountainEnginePilotStageV1 {
  readonly stageId: string
  readonly stageFormat: string
  readonly terrainType: string
}

export function isMountainEnginePilotStageV1(
  stage: MountainEnginePilotStageV1,
): boolean {
  return stage.stageFormat === 'road_race' &&
    stage.terrainType === 'mountain' &&
    pilotIds.has(stage.stageId.toLowerCase())
}
