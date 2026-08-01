import type {
  RoadStageProfileInput,
} from './stageProfile'

export interface ProfilePoint {
  km: number
  elevationM: number
}

export interface StageInput {
  stageId: string
  raceId: string
  distanceKm: number
  profilePoints: ProfilePoint[]

  /**
   * Optional during the B1 compatibility period.
   * B2 road stages should provide the explicit generalized profile input.
   */
  roadStageProfile?: RoadStageProfileInput
}
