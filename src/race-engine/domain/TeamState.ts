import type { TeamOrder } from './TeamOrder'

export interface TeamState {
  readonly id: string
  readonly name: string
  readonly riderIds: readonly string[]
  readonly captainRiderId: string
  readonly activeOrderIds: readonly string[]
  readonly orders: readonly TeamOrder[]
}
