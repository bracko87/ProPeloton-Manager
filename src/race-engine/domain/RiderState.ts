export type RiderRole =
  | 'captain'
  | 'sprinter'
  | 'leadout'
  | 'domestique'
  | 'breakaway'
  | 'free_role'

export type RiderRaceStatus = 'not_started' | 'racing' | 'finished' | 'dnf' | 'dns'

export interface RiderAttributes {
  readonly flat: number
  readonly sprint: number
  readonly endurance: number
  readonly acceleration: number
  readonly resistance: number
  readonly recovery: number
}

export interface RiderState {
  readonly id: string
  readonly teamId: string
  readonly participationId: string
  readonly name: string
  readonly role: RiderRole
  readonly attributes: RiderAttributes
  readonly groupId: string
  readonly distanceKm: number
  readonly speedKmh: number
  readonly energy: number
  readonly attackAttempts: number
  readonly status: RiderRaceStatus
  readonly finishTimeSeconds?: number
  readonly finishPosition?: number
}
