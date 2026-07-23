/**
 * GroupState.ts
 *
 * Canonical deterministic race-group state.
 *
 * These field names match the group objects created by createInitialState()
 * and consumed throughout the active multi-group simulation.
 */

export type GroupType =
  | 'peloton'
  | 'breakaway'
  | 'chase'
  | 'dropped'
  | 'finished'

export interface GroupState {
  readonly groupId: string
  readonly groupType: GroupType

  readonly riderIds: readonly string[]

  readonly distanceKm: number
  readonly speedKmh: number
  readonly gapFromLeaderSeconds: number

  readonly createdAtRaceSecond: number
  readonly createdAtKm: number

  readonly active: boolean
}