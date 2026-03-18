/**
 * src/features/squad/utils/movement.ts
 *
 * Shared squad/developing-team movement rules.
 *
 * Purpose:
 * - Keep roster movement business rules in one place.
 * - Reuse the same validation/messages across Squad.tsx and DevelopingTeam.tsx.
 * - Prevent the two pages from drifting into different movement logic.
 */

const FIRST_SQUAD_MAX = 18

/**
 * getFirstSquadMoveState
 * Rules for moving a rider from First Squad to Developing Team.
 */
export function getFirstSquadMoveState({
  hasDevelopingTeam,
  movementWindowOpen,
  riderAge,
}: {
  hasDevelopingTeam: boolean
  movementWindowOpen: boolean
  riderAge: number | null
}) {
  if (!hasDevelopingTeam) {
    return {
      enabled: false,
      reason: 'Unlock Developing Team in Preferences first.',
    }
  }

  if (!movementWindowOpen) {
    return {
      enabled: false,
      reason: 'Movement window is closed.',
    }
  }

  if (riderAge !== null && riderAge > 23) {
    return {
      enabled: false,
      reason: 'Only riders aged 23 or younger can join the Developing Team.',
    }
  }

  return {
    enabled: true,
    reason: 'Move to Developing Team',
  }
}

/**
 * getDevelopingTeamMoveState
 * Rules for moving a rider from Developing Team to First Squad.
 */
export function getDevelopingTeamMoveState({
  hasFirstSquad,
  movementWindowOpen,
  firstSquadRiderCount,
}: {
  hasFirstSquad: boolean
  movementWindowOpen: boolean
  firstSquadRiderCount: number
}) {
  if (!hasFirstSquad) {
    return {
      enabled: false,
      reason: 'First Squad is unavailable.',
    }
  }

  if (!movementWindowOpen) {
    return {
      enabled: false,
      reason: 'Movement window is closed.',
    }
  }

  if (firstSquadRiderCount >= FIRST_SQUAD_MAX) {
    return {
      enabled: false,
      reason: `First Squad is full (${FIRST_SQUAD_MAX}/${FIRST_SQUAD_MAX}).`,
    }
  }

  return {
    enabled: true,
    reason: 'Move to First Squad',
  }
}

/**
 * getDevelopingTeamAgeWarning
 * Warning badge state for riders who have aged out of Developing Team eligibility.
 */
export function getDevelopingTeamAgeWarning(
  age?: number | null,
  movementWindowOpen?: boolean
) {
  if (age === null || age === undefined || age < 24) return null

  if (movementWindowOpen) {
    return {
      label: 'Action required now',
      className:
        'inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700',
    }
  }

  return {
    label: 'Must move next window',
    className:
      'inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700',
  }
}