export type GroupType = 'peloton' | 'breakaway' | 'chase' | 'dropped' | 'finished'

export interface GroupState {
  readonly id: string
  readonly type: GroupType
  readonly riderIds: readonly string[]
  readonly distanceKm: number
  readonly speedKmh: number
  readonly gapFromLeaderSeconds: number
  readonly createdRaceSecond: number
  readonly createdKm: number
  readonly active: boolean
}
