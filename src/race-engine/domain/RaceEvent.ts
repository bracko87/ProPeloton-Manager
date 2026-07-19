export type RaceEventType =
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
  | 'RIDER_FINISHED'
  | 'RACE_COMPLETED'

export interface RaceEvent {
  readonly id: string
  readonly sequenceNumber: number
  readonly type: RaceEventType
  readonly raceSecond: number
  readonly km: number
  readonly actorRiderId?: string
  readonly teamId?: string
  readonly sourceGroupId?: string
  readonly targetGroupId?: string
  readonly riderIds?: readonly string[]
  readonly payload: Readonly<Record<string, unknown>>
}
