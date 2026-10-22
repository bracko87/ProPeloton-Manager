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
