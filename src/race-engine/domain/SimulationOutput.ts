import type { GroupState } from './GroupState'
import type { RaceEvent } from './RaceEvent'
import type { RiderState } from './RiderState'

export interface ReplaySnapshot {
  readonly frameNumber: number
  readonly raceSecond: number
  readonly km: number
  readonly groupOrder: readonly string[]
  readonly groups: readonly GroupState[]
  readonly eventSequenceNumbers: readonly number[]
}

export interface SimulationOutput {
  readonly raceId: string
  readonly stageId: string
  readonly engineVersion: 'race_engine_ts_v1'
  readonly simulationMode: 'deterministic_road_race_v1'
  readonly seed: string
  readonly events: readonly RaceEvent[]
  readonly snapshots: readonly ReplaySnapshot[]
  readonly finalRiderStates: readonly RiderState[]
}
