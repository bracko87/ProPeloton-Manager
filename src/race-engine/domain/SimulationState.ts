import type { GroupState } from './GroupState'
import type { RaceEvent } from './RaceEvent'
import type { RiderState } from './RiderState'
import type { StageInput } from './StageInput'
import type { TeamState } from './TeamState'

export interface SimulationState {
  readonly input: StageInput
  readonly raceSecond: number
  readonly currentKm: number
  readonly nextEventSequence: number
  readonly riders: Readonly<Record<string, RiderState>>
  readonly teams: Readonly<Record<string, TeamState>>
  readonly groups: Readonly<Record<string, GroupState>>
  readonly events: readonly RaceEvent[]
  readonly completed: boolean
}
