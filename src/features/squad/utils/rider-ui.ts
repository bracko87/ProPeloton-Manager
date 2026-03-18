/**
 * src/features/squad/utils/rider-ui.ts
 *
 * Shared rider UI/domain mapping helpers.
 *
 * Purpose:
 * - Convert raw rider backend values into UI-safe labels, colors and messages.
 * - Keep badge/status/potential/morale/fatigue logic out of page components.
 * - Reuse the same behavior across Squad.tsx, DevelopingTeam.tsx and modals.
 */

import type {
  FatigueUiLabel,
  MoraleUiLabel,
  PotentialUiLabel,
  RiderAvailabilityStatus,
  RiderDetails,
} from '../types'

const DEFAULT_RIDER_IMAGE_URL =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Others/Default%20Profile.png'

const POTENTIAL_BONUS_MAX_AGE = 28

/**
 * hexToRgba
 * Convert a hex color to rgba for subtle badge backgrounds/borders.
 */
export function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized

  const int = Number.parseInt(value, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * getMoraleUi
 * Translate backend morale (0..100) into UI label + exact colors.
 */
export function getMoraleUi(morale?: number | null): {
  label: MoraleUiLabel
  color: string
  bgColor: string
  borderColor: string
  dotColor: string
} {
  const value = Math.max(0, Math.min(100, morale ?? 0))

  if (value <= 19) {
    const color = '#DC2626'
    return {
      label: 'Bad',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
    }
  }

  if (value <= 39) {
    const color = '#F97316'
    return {
      label: 'Low',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
    }
  }

  if (value <= 59) {
    const color = '#EAB308'
    return {
      label: 'Okay',
      color,
      bgColor: hexToRgba(color, 0.14),
      borderColor: hexToRgba(color, 0.24),
      dotColor: color,
    }
  }

  if (value <= 79) {
    const color = '#84CC16'
    return {
      label: 'Good',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
    }
  }

  const color = '#16A34A'
  return {
    label: 'Great',
    color,
    bgColor: hexToRgba(color, 0.12),
    borderColor: hexToRgba(color, 0.22),
    dotColor: color,
  }
}

/**
 * getFatigueUi
 * Translate backend fatigue (0..100) into UI label + exact colors.
 */
export function getFatigueUi(fatigue?: number | null): {
  label: FatigueUiLabel
  color: string
  bgColor: string
  borderColor: string
  dotColor: string
} {
  const value = Math.max(0, Math.min(100, fatigue ?? 0))

  if (value <= 19) {
    const color = '#16A34A'
    return {
      label: 'Fresh',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
    }
  }

  if (value <= 39) {
    const color = '#84CC16'
    return {
      label: 'Normal',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
    }
  }

  if (value <= 59) {
    const color = '#EAB308'
    return {
      label: 'Tired',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
    }
  }

  if (value <= 79) {
    const color = '#F97316'
    return {
      label: 'Very Tired',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
    }
  }

  const color = '#DC2626'
  return {
    label: 'Exhausted',
    color,
    bgColor: hexToRgba(color, 0.12),
    borderColor: hexToRgba(color, 0.22),
    dotColor: color,
  }
}

/**
 * hasActivePotentialBonus
 * Potential growth bonus remains active through age 28.
 */
export function hasActivePotentialBonus(age?: number | null) {
  return typeof age === 'number' && age <= POTENTIAL_BONUS_MAX_AGE
}

/**
 * getPotentialDevelopmentBonus
 * Return the development bonus value based on potential and age.
 */
export function getPotentialDevelopmentBonus(
  potential?: number | null,
  age?: number | null
) {
  if (!hasActivePotentialBonus(age)) {
    return 0
  }

  const value = Math.max(0, Math.min(100, potential ?? 0))

  if (value <= 19) return 0
  if (value <= 39) return 0.25
  if (value <= 59) return 0.5
  if (value <= 79) return 0.75
  return 1
}

/**
 * getPotentialUi
 * Translate backend potential (0..100) into UI label + exact colors.
 */
export function getPotentialUi(potential?: number | null): {
  label: PotentialUiLabel
  color: string
  bgColor: string
  borderColor: string
  dotColor: string
  tier: 1 | 2 | 3 | 4 | 5
  developmentBonus: number
} {
  const value = Math.max(0, Math.min(100, potential ?? 0))

  if (value <= 19) {
    const color = '#6B7280'
    return {
      label: 'Limited',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
      tier: 1,
      developmentBonus: 0,
    }
  }

  if (value <= 39) {
    const color = '#0F766E'
    return {
      label: 'Average',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
      tier: 2,
      developmentBonus: 0.25,
    }
  }

  if (value <= 59) {
    const color = '#0284C7'
    return {
      label: 'Promising',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
      tier: 3,
      developmentBonus: 0.5,
    }
  }

  if (value <= 79) {
    const color = '#7C3AED'
    return {
      label: 'High',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
      tier: 4,
      developmentBonus: 0.75,
    }
  }

  const color = '#16A34A'
  return {
    label: 'Elite',
    color,
    bgColor: hexToRgba(color, 0.12),
    borderColor: hexToRgba(color, 0.22),
    dotColor: color,
    tier: 5,
    developmentBonus: 1,
  }
}

/**
 * getDefaultRiderAvailabilityStatus
 * Null-safe fallback for rider availability status.
 */
export function getDefaultRiderAvailabilityStatus(): RiderAvailabilityStatus {
  return 'fit'
}

/**
 * getRiderStatusUi
 * UI representation for rider current status / availability.
 */
export function getRiderStatusUi(status?: RiderAvailabilityStatus | null): {
  label: string
  icon: string
  color: string
  bgColor: string
  borderColor: string
} {
  const safeStatus = status ?? getDefaultRiderAvailabilityStatus()

  if (safeStatus === 'injured') {
    const color = '#DC2626'
    return {
      label: 'Injured',
      icon: '✚',
      color,
      bgColor: hexToRgba(color, 0.1),
      borderColor: hexToRgba(color, 0.2),
    }
  }

  if (safeStatus === 'not_fully_fit') {
    const color = '#C2410C'
    return {
      label: 'Not fully fit',
      icon: '♥',
      color,
      bgColor: hexToRgba(color, 0.1),
      borderColor: hexToRgba(color, 0.2),
    }
  }

  if (safeStatus === 'sick') {
    const color = '#7C3AED'
    return {
      label: 'Sick',
      icon: '✚',
      color,
      bgColor: hexToRgba(color, 0.1),
      borderColor: hexToRgba(color, 0.2),
    }
  }

  const color = '#16A34A'
  return {
    label: 'Fit',
    icon: '♥',
    color,
    bgColor: hexToRgba(color, 0.1),
    borderColor: hexToRgba(color, 0.2),
  }
}

/**
 * getHealthPanelNote
 * Human-readable rider health summary for the profile modal.
 */
export function getHealthPanelNote(rider: RiderDetails) {
  const status = rider.availability_status ?? 'fit'
  const fatigueLabel = getFatigueUi(rider.fatigue).label

  if (status === 'injured') {
    return rider.unavailable_until
      ? 'Rider is unavailable due to injury and cannot be selected for races.'
      : 'Rider is currently injured and unavailable for selection.'
  }

  if (status === 'sick') {
    return rider.unavailable_until
      ? 'Rider is unavailable due to sickness and cannot be selected for races.'
      : 'Rider is currently sick and unavailable for selection.'
  }

  if (status === 'not_fully_fit') {
    return `Rider is carrying fatigue and is not fully recovered. Current condition: ${fatigueLabel}.`
  }

  return 'No active health issue.'
}

/**
 * getDiffClass
 * Color helper for compare modal diff values.
 */
export function getDiffClass(diff: number) {
  if (diff > 0) return 'text-green-600'
  if (diff < 0) return 'text-red-600'
  return 'text-gray-500'
}

/**
 * getLeftValueClass
 * Color helper for left rider values in compare modal.
 */
export function getLeftValueClass(diff: number) {
  if (diff > 0) return 'text-green-600'
  if (diff < 0) return 'text-red-600'
  return 'text-gray-700'
}

/**
 * getRightValueClass
 * Color helper for right rider values in compare modal.
 */
export function getRightValueClass(diff: number) {
  if (diff > 0) return 'text-red-600'
  if (diff < 0) return 'text-green-600'
  return 'text-gray-700'
}

/**
 * formatDiff
 * Format compare modal diff values.
 */
export function formatDiff(diff: number) {
  if (diff > 0) return `+${diff}`
  return `${diff}`
}

/**
 * getRiderImageUrl
 * Return a safe image URL for rider thumbnails.
 */
export function getRiderImageUrl(imageUrl?: string | null) {
  if (!imageUrl || imageUrl.trim() === '') {
    return DEFAULT_RIDER_IMAGE_URL
  }

  return imageUrl
}

/**
 * getRenewalErrorMessage
 * Normalize backend renewal negotiation errors into UI-friendly text.
 */
export function getRenewalErrorMessage(message?: string | null) {
  const text = (message ?? '').toLowerCase()

  if (text.includes('salary') || text.includes('minimum')) {
    return 'Rider refused the offer because the salary is below his current expectations.'
  }

  if (text.includes('contract length') || text.includes('duration')) {
    return 'Rider refused the offer because he is not happy with the proposed contract length.'
  }

  if (text.includes('cooldown') || text.includes('72 hour') || text.includes('72 hours')) {
    return 'Negotiations have collapsed. This rider will not discuss a new contract for 72 hours, and morale dropped by 10.'
  }

  if (text.includes('recent form') || text.includes('morale')) {
    return 'Rider refused the offer because recent form and morale increase his demands.'
  }

  if (text.includes('open negotiation not found')) {
    return 'This negotiation is no longer active. Open a new contract talk after the cooldown expires.'
  }

  if (text.includes('result type')) {
    return 'Renewal logic returned an invalid backend response. The SQL function needs to be fixed.'
  }

  return message ?? 'The rider refused the offer.'
}