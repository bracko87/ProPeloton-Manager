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

export type TeamOrderMetadata =
  Readonly<
    Record<
      string,
      unknown
    >
  >

export interface TeamOrder {
  readonly orderId: string

  readonly teamId: string

  readonly riderId: string

  readonly type:
    TeamOrderType

  readonly status:
    TeamOrderStatus

  readonly eligibleFromKm:
    number

  readonly eligibleUntilKm:
    number

  readonly priority:
    number

  /**
   * Optional rider affected by the order.
   *
   * Examples:
   * - the protected leader;
   * - the sprinter receiving a lead-out;
   * - another rider associated with a coordinated instruction.
   */
  readonly targetRiderId?:
    string | null

  /**
   * Optional maximum number of riders allowed to follow or participate in the
   * order.
   */
  readonly maximumFollowers?:
    number | null

  /**
   * Immutable source and diagnostic information.
   *
   * This may later retain the original Stage Plan command, phase identifier,
   * label, and other pre-race evidence without affecting execution directly.
   */
  readonly metadata?:
    TeamOrderMetadata

  readonly rejectionReason?:
    string

  readonly executionRaceSecond?:
    number
}