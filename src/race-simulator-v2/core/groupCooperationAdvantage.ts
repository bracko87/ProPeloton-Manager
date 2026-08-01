/**
 * groupCooperationAdvantage.ts
 *
 * Pure deterministic drafting and cooperation calculation for B1.6.
 *
 * The calculation intentionally remains small and transparent:
 * - a solo rider receives no group benefit;
 * - drafting grows logarithmically with group size;
 * - cooperation adds a capped benefit according to group size and organization;
 * - equal-strength, equally organized larger groups receive a greater advantage;
 * - temporary attack advantages can still remain when the breakaway starts with
 *   a higher base speed.
 */

const SPEED_PRECISION = 1_000
const PERCENT_PRECISION = 1_000_000

export const MAX_DRAFTING_BONUS_PERCENT = 0.025
export const MAX_COOPERATION_BONUS_PERCENT = 0.015
export const DRAFTING_PERCENT_PER_LOG2_RIDER = 0.006
export const COOPERATION_PERCENT_PER_ADDITIONAL_RIDER = 0.002

export interface GroupCooperationAdvantageInput {
  baseSpeedKmh: number
  riderCount: number
  cooperationLevel: number
}

export interface GroupCooperationAdvantageResult {
  baseSpeedKmh: number
  riderCount: number
  cooperationLevel: number
  draftingBonusPercent: number
  cooperationBonusPercent: number
  draftingBonusKmh: number
  cooperationBonusKmh: number
  totalBonusKmh: number
  effectiveSpeedKmh: number
}

function roundSpeedKmh(value: number): number {
  return Math.round(value * SPEED_PRECISION) / SPEED_PRECISION
}

function roundPercent(value: number): number {
  return Math.round(value * PERCENT_PRECISION) / PERCENT_PRECISION
}

function validateInput(input: GroupCooperationAdvantageInput): void {
  if (!Number.isFinite(input.baseSpeedKmh) || input.baseSpeedKmh <= 0) {
    throw new Error('baseSpeedKmh must be a positive finite number')
  }

  if (!Number.isInteger(input.riderCount) || input.riderCount < 1) {
    throw new Error('riderCount must be a positive integer')
  }

  if (
    !Number.isFinite(input.cooperationLevel) ||
    input.cooperationLevel < 0 ||
    input.cooperationLevel > 1
  ) {
    throw new Error('cooperationLevel must be between 0 and 1')
  }
}

/**
 * Calculate the deterministic speed advantage produced by group shelter and
 * cooperation.
 */
export function calculateGroupCooperationAdvantage(
  input: GroupCooperationAdvantageInput,
): GroupCooperationAdvantageResult {
  validateInput(input)

  const additionalRiderCount = Math.max(0, input.riderCount - 1)
  const draftingBonusPercent = roundPercent(
    Math.min(
      MAX_DRAFTING_BONUS_PERCENT,
      Math.log2(input.riderCount) * DRAFTING_PERCENT_PER_LOG2_RIDER,
    ),
  )
  const cooperationBonusPercent = roundPercent(
    Math.min(
      MAX_COOPERATION_BONUS_PERCENT,
      input.cooperationLevel *
        additionalRiderCount *
        COOPERATION_PERCENT_PER_ADDITIONAL_RIDER,
    ),
  )
  const draftingBonusKmh = roundSpeedKmh(
    input.baseSpeedKmh * draftingBonusPercent,
  )
  const cooperationBonusKmh = roundSpeedKmh(
    input.baseSpeedKmh * cooperationBonusPercent,
  )
  const totalBonusKmh = roundSpeedKmh(
    draftingBonusKmh + cooperationBonusKmh,
  )
  const effectiveSpeedKmh = roundSpeedKmh(
    input.baseSpeedKmh + totalBonusKmh,
  )

  return {
    baseSpeedKmh: roundSpeedKmh(input.baseSpeedKmh),
    riderCount: input.riderCount,
    cooperationLevel: input.cooperationLevel,
    draftingBonusPercent,
    cooperationBonusPercent,
    draftingBonusKmh,
    cooperationBonusKmh,
    totalBonusKmh,
    effectiveSpeedKmh,
  }
}
