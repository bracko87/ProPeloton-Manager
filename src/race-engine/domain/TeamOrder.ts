export type TeamOrderType =
  | 'attack'
  | 'join_breakaway'
  | 'chase'
  | 'protect'
  | 'hold_position'
  | 'leadout'
  | 'sprint'

export type TeamOrderStatus =
  | 'loaded'
  | 'accepted'
  | 'rejected'
  | 'scheduled'
  | 'executed'
  | 'expired'
  | 'completed'

export interface TeamOrderWindow {
  readonly startKm: number
  readonly endKm: number
}

export interface TeamOrder {
  readonly id: string
  readonly teamId: string
  readonly riderId: string
  readonly type: TeamOrderType
  readonly priority: number
  readonly window: TeamOrderWindow
  readonly status: TeamOrderStatus
  readonly rejectionReason?: string
  readonly executionRaceSecond?: number
}
