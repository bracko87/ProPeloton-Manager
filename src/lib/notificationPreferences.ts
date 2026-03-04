/**
 * src/lib/notificationPreferences.ts
 *
 * Reusable notification preference helpers.
 *
 * Purpose:
 * - Shared preference group codes/types used by UI + filtering.
 * - UI fallback metadata (labels/descriptions) for groups.
 * - Read saved preferences from localStorage with a safe fallback.
 * - canReceiveNotification(preferences, group)
 * - Resolve a notification's preference group:
 *    - Prefer DB-provided preference_group (best)
 *    - Fallback to typeCode/source heuristics (legacy transition)
 */

export const NOTIFICATION_PREFERENCE_GROUP_CODES = [
  'raceInvitations',
  'raceApplicationResults',
  'transferUpdates',
  'teamUpdates',
  'financeAlerts',
] as const

/**
 * NotificationType / NotificationPreferenceGroup
 * These keys must match:
 * - notification_types.preference_group values
 * - notification_preference_groups.code values (if you use that table)
 * - preference settings object keys
 */
export type NotificationType = (typeof NOTIFICATION_PREFERENCE_GROUP_CODES)[number]
export type NotificationPreferenceGroup = NotificationType

/**
 * UI fallback metadata.
 * If you want full DB-driven management, you can later replace this by fetching
 * rows from notification_preference_groups and rendering them in Preferences UI.
 */
export const NOTIFICATION_PREFERENCE_GROUPS: Record<
  NotificationPreferenceGroup,
  { label: string; description: string }
> = {
  raceInvitations: {
    label: 'Race invitations',
    description: 'Show notifications when your team receives a race invitation.',
  },
  raceApplicationResults: {
    label: 'Race application results',
    description: 'Show notifications when your team is accepted or declined for a race.',
  },
  transferUpdates: {
    label: 'Transfer updates',
    description: 'Show notifications for transfer offers, negotiations, and transfer activity.',
  },
  teamUpdates: {
    label: 'Team updates',
    description: 'Show notifications related to important team events and internal team changes.',
  },
  financeAlerts: {
    label: 'Finance alerts',
    description: 'Show notifications for important budget, cost, or income related updates.',
  },
}

/**
 * NotificationSettings
 * Stored preferences toggle values.
 */
export type NotificationSettings = Record<NotificationPreferenceGroup, boolean>

type StoredPreferences = {
  notifications?: Partial<NotificationSettings>
}

export const PREFERENCES_STORAGE_KEY = 'pro-peloton-preferences'

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  raceInvitations: true,
  raceApplicationResults: true,
  transferUpdates: true,
  teamUpdates: true,
  financeAlerts: true,
}

export function canReceiveNotification(
  preferences: NotificationSettings,
  type: NotificationPreferenceGroup
): boolean {
  return preferences[type] === true
}

export function readNotificationPreferences(): NotificationSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_NOTIFICATION_SETTINGS
  }

  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY)
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS

    const parsed = JSON.parse(raw) as StoredPreferences

    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(parsed.notifications ?? {}),
    }
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS
  }
}

/**
 * isNotificationPreferenceGroup
 * Validates DB-provided preference_group strings.
 */
export function isNotificationPreferenceGroup(value: unknown): value is NotificationPreferenceGroup {
  return (
    typeof value === 'string' &&
    (NOTIFICATION_PREFERENCE_GROUP_CODES as readonly string[]).includes(value)
  )
}

/**
 * resolvePreferenceGroupForNotification
 * The ONE function your UI should use to classify notifications.
 *
 * Preferred: use DB `preference_group` if present and valid.
 * Fallback: use legacy heuristic mapping from typeCode/source (temporary).
 */
export function resolvePreferenceGroupForNotification(params: {
  preferenceGroup?: string | null
  typeCode?: string | null
  source?: string | null
}): NotificationPreferenceGroup | null {
  const { preferenceGroup, typeCode, source } = params

  if (isNotificationPreferenceGroup(preferenceGroup)) return preferenceGroup

  // legacy fallback (remove later once RPC always returns preference_group)
  return getNotificationTypeFromEvent(typeCode, source)
}

/**
 * getNotificationTypeFromEvent (legacy fallback)
 * Keep only while you are transitioning to DB `preference_group`.
 */
export function getNotificationTypeFromEvent(
  typeCode?: string | null,
  source?: string | null
): NotificationPreferenceGroup | null {
  const key = `${source ?? ''} ${typeCode ?? ''}`.toLowerCase()

  if (key.includes('transfer')) return 'transferUpdates'
  if (key.includes('finance') || key.includes('budget') || key.includes('salary')) return 'financeAlerts'
  if (key.includes('application') && key.includes('race')) return 'raceApplicationResults'
  if (key.includes('invit') && key.includes('race')) return 'raceInvitations'
  if (key.includes('team') || key.includes('squad') || key.includes('club')) return 'teamUpdates'

  return null
}