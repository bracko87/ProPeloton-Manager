/**
 * stageResult.ts
 *
 * Final deterministic rider-result types for the B1 flat-stage vertical slice.
 */

export type StageResultStatus = 'finished'
export type StageResultOutcome = 'caught' | 'survived'

/**
 * Stable controlled attributes used to order riders who receive the same
 * physical finishing time.
 */
export type StageResultTieBreakAttribute =
  | 'sprint'
  | 'flat'
  | 'endurance'
  | 'startingFreshness'
  | 'climbing'

export interface RiderStageResult {
  rank: number
  riderId: string
  displayName: string
  status: StageResultStatus
  finishTimeSeconds: number
  gapSecondsToWinner: number
  finishingGroupId: string
  finishingGroupRank: number
}

export interface DeterministicStageResults {
  stageId: string
  raceId: string
  outcome: StageResultOutcome
  winnerRiderId: string
  winnerFinishTimeSeconds: number
  results: RiderStageResult[]
}
