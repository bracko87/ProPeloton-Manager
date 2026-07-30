/**
 * RaceEvent.ts
 *
 * Canonical event contract used by the active deterministic engine.
 *
 * The engine producers, state validator, SimulationOutput adapter, and replay
 * adapter use eventType, kmMarker, relatedRiderIds, and commentaryText.
 */

export type RaceEventType =
  | 'SIMULATION_STARTED'
  | 'RACE_STARTED'
  | 'ORDER_LOADED'
  | 'ORDER_ACCEPTED'
  | 'ORDER_REJECTED'
  | 'ORDER_SCHEDULED'
  | 'ORDER_EXECUTED'
  | 'ORDER_EXPIRED'
  | 'ATTACK_STARTED'
  | 'RIDER_JOINED_GROUP'
  | 'GROUP_CREATED'
  | 'GROUP_CAUGHT'
  | 'SPRINT_STARTED'
  | 'RIDER_CRASHED'
  | 'GROUP_CRASHED'
  | 'RIDER_TECHNICAL_INCIDENT'
  | 'RIDER_FINISHED'
  | 'SIMULATION_COMPLETED'
  | 'RACE_COMPLETED'

export interface RaceEvent {
  readonly sequenceNumber: number
  readonly eventType: RaceEventType
  readonly raceSecond: number
  readonly kmMarker: number

  readonly actorRiderId: string | null
  readonly teamId: string | null
  readonly sourceGroupId: string | null
  readonly targetGroupId: string | null

  readonly relatedRiderIds: readonly string[]
  readonly payload: Readonly<Record<string, unknown>>
  readonly commentaryText: string | null
}
