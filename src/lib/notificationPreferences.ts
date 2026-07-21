/**
 * notificationPreferences.ts
 * Shared notification preference definitions and localStorage helpers.
 */

export const PREFERENCES_STORAGE_KEY = 'pro-peloton-preferences'

export const NOTIFICATION_PREFERENCE_GROUP_ORDER = [
  'raceInvitations',
  'raceApplicationResults',
  'races',
  'racePreparation',
  'stagePlanReminders',
  'raceWeather',
  'raceResults',
  'teamUpdates',
  'staffContracts',
  'staffCourses',
  'transferUpdates',
  'trainingCamps',
  'scoutingReports',
  'retirementUpdates',
  'financeAlerts',
  'walletRewards',
  'competitionRewards',
  'taxUpdates',
  'raceSupplies',
  'equipmentUpdates',
  'infrastructureUpdates',
  'systemMessages',
] as const

export type NotificationPreferenceGroup =
  (typeof NOTIFICATION_PREFERENCE_GROUP_ORDER)[number]

export type NotificationSettings = Record<NotificationPreferenceGroup, boolean>

export type NotificationPreferenceDefinition = {
  label: string
  description: string
  section: 'race' | 'team' | 'club' | 'account'
}

export const NOTIFICATION_PREFERENCE_GROUPS: Record<
  NotificationPreferenceGroup,
  NotificationPreferenceDefinition
> = {
  raceInvitations: {
    label: 'Race invitations',
    description: 'Show notifications when your team receives a race invitation.',
    section: 'race',
  },
  raceApplicationResults: {
    label: 'Race application results',
    description: 'Show notifications when your team is accepted or declined for a race.',
    section: 'race',
  },
  races: {
    label: 'Race day updates',
    description: 'Show startlist, missed-startlist, race-day, and race penalty updates.',
    section: 'race',
  },
  racePreparation: {
    label: 'Race preparation',
    description: 'Show notifications for race plan openings, deadlines, finalisation, and preparation attention.',
    section: 'race',
  },
  stagePlanReminders: {
    label: 'Stage plan reminders',
    description: 'Show notifications for stage plan locks, missing stage plans, and lock-soon reminders.',
    section: 'race',
  },
  raceWeather: {
    label: 'Race weather',
    description: 'Show notifications when stages, races, or race-related activities are affected by weather.',
    section: 'race',
  },
  raceResults: {
    label: 'Race results',
    description: 'Show notifications for finished races, stage results, classifications, and race summaries.',
    section: 'race',
  },
  teamUpdates: {
    label: 'Team updates',
    description: 'Show notifications related to riders, morale, health, contracts, staff, and internal team changes.',
    section: 'team',
  },
  staffContracts: {
    label: 'Staff contracts',
    description: 'Show notifications about expiring staff contracts and renewal timing.',
    section: 'team',
  },
  staffCourses: {
    label: 'Staff courses',
    description: 'Show notifications when a staff course is completed and gains are applied.',
    section: 'team',
  },
  transferUpdates: {
    label: 'Transfer updates',
    description: 'Show rider transfer, free agent, bid, offer, and negotiation notifications.',
    section: 'team',
  },
  trainingCamps: {
    label: 'Training camps',
    description: 'Show notifications for training camp starts, daily reports, weather warnings, and completions.',
    section: 'team',
  },
  scoutingReports: {
    label: 'Scouting reports',
    description: 'Show notifications when a scouting report is completed.',
    section: 'team',
  },
  retirementUpdates: {
    label: 'Retirement updates',
    description: 'Show notifications when riders or staff announce retirement and when retirements are finalized.',
    section: 'team',
  },
  financeAlerts: {
    label: 'Finance alerts',
    description: 'Show important finance warnings, sponsor objectives, emergency loans, payroll issues, and insolvency notices.',
    section: 'club',
  },
  walletRewards: {
    label: 'Coins & rewards',
    description: 'Show coin purchases, coin credits, birthday gifts, referral rewards, and wallet reward messages.',
    section: 'club',
  },
  competitionRewards: {
    label: 'Competition rewards',
    description: 'Show season rollover rewards for league and competition results.',
    section: 'club',
  },
  taxUpdates: {
    label: 'Tax updates',
    description: 'Show notifications for tax audits and tax-related finance events.',
    section: 'club',
  },
  raceSupplies: {
    label: 'Race supplies',
    description: 'Show notifications when race supplies are low, missing, or need restocking before events.',
    section: 'club',
  },
  equipmentUpdates: {
    label: 'Equipment updates',
    description: 'Show notifications for equipment maintenance, sales, discard actions, and equipment lifecycle updates.',
    section: 'club',
  },
  infrastructureUpdates: {
    label: 'Infrastructure updates',
    description: 'Show notifications for infrastructure orders, deliveries, repairs, sales, upgrades, and condition warnings.',
    section: 'club',
  },
  systemMessages: {
    label: 'System messages',
    description: 'Show welcome messages and general official game messages.',
    section: 'account',
  },
}

export const NOTIFICATION_PREFERENCE_SECTIONS = [
  {
    code: 'race',
    title: 'Race notifications',
    description: 'Invitations, preparation, weather, stage plans, race-day issues, and results.',
  },
  {
    code: 'team',
    title: 'Team & rider notifications',
    description: 'Riders, staff, transfers, training camps, scouting, and retirements.',
  },
  {
    code: 'club',
    title: 'Club management notifications',
    description: 'Finance, coins, rewards, supplies, equipment, tax, and infrastructure.',
  },
  {
    code: 'account',
    title: 'Account & system notifications',
    description: 'Official game messages and onboarding information.',
  },
] as const

const DEFAULT_NOTIFICATION_SETTINGS = NOTIFICATION_PREFERENCE_GROUP_ORDER.reduce(
  (settings, group) => {
    settings[group] = true
    return settings
  },
  {} as NotificationSettings
)

export function isNotificationPreferenceGroup(
  value: unknown
): value is NotificationPreferenceGroup {
  return (
    typeof value === 'string' &&
    (NOTIFICATION_PREFERENCE_GROUP_ORDER as readonly string[]).includes(value)
  )
}

export function readNotificationPreferences(): NotificationSettings {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_NOTIFICATION_SETTINGS }
  }

  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS }

    const parsed = JSON.parse(raw) as {
      notifications?: Partial<Record<NotificationPreferenceGroup, unknown>>
    }

    const stored = parsed?.notifications ?? {}
    const normalized = { ...DEFAULT_NOTIFICATION_SETTINGS }

    for (const group of NOTIFICATION_PREFERENCE_GROUP_ORDER) {
      if (typeof stored[group] === 'boolean') {
        normalized[group] = stored[group] as boolean
      }
    }

    return normalized
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS }
  }
}

export function writeNotificationPreferences(settings: NotificationSettings): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ notifications: settings })
    )

    window.dispatchEvent(
      new CustomEvent('notification-preferences-updated', {
        detail: settings,
      })
    )
  } catch {
    // Ignore localStorage write errors.
  }
}

export function canReceiveNotification(
  preferences: NotificationSettings,
  group: NotificationPreferenceGroup
): boolean {
  return preferences[group] !== false
}

/**
 * Legacy fallback used only when an RPC row does not yet include preference_group.
 */
export function getNotificationTypeFromEvent(
  typeCode?: string | null,
  source?: string | null
): NotificationPreferenceGroup | null {
  const code = String(typeCode ?? '').toUpperCase()
  const sourceValue = String(source ?? '').toUpperCase()
  const value = `${code} ${sourceValue}`

  if (code === 'RACE_RESULTS_SUMMARY' || value.includes('CLASSIFICATION')) return 'raceResults'
  if (code.includes('RACE_APPLICATION_ACCEPTED') || code.includes('RACE_APPLICATION_DECLINED')) return 'raceApplicationResults'
  if (code.includes('RACE_SUPPLIES') || code.includes('RACE_SUPPLY')) return 'raceSupplies'
  if (code.includes('RACE_WEATHER') || code.includes('WEATHER_CANCELLED')) return 'raceWeather'
  if (code.includes('STAGE_PLAN')) return 'stagePlanReminders'
  if (code.includes('RACE_PLAN')) return 'racePreparation'
  if (code === 'RACE_MISSED_STARTLIST' || code === 'RACE_MISSED_STARTLIST'.toLowerCase()) return 'races'
  if (code.includes('RACE_INVITATION')) return 'raceInvitations'

  if (code.includes('INFRASTRUCTURE')) return 'infrastructureUpdates'
  if (code.includes('EQUIPMENT')) return 'equipmentUpdates'
  if (code.includes('TRAINING_CAMP')) return 'trainingCamps'
  if (code.includes('SCOUT')) return 'scoutingReports'
  if (code.includes('RETIREMENT')) return 'retirementUpdates'
  if (code.includes('STAFF_CONTRACT')) return 'staffContracts'
  if (code.includes('STAFF_COURSE')) return 'staffCourses'
  if (code.includes('TRANSFER') || code.includes('FREE_AGENT') || code.includes('NEGOTIATION')) return 'transferUpdates'
  if (code.includes('RIDER') || code.includes('STAFF_HIRED') || code.includes('DEVELOPING_')) return 'teamUpdates'

  if (code.includes('COIN') || code.includes('BIRTHDAY_GIFT') || code.includes('REFERRAL_REWARD')) return 'walletRewards'
  if (code.includes('COMPETITION_REWARD')) return 'competitionRewards'
  if (code.includes('TAX')) return 'taxUpdates'
  if (code.includes('FINANCE') || code.includes('SPONSOR') || code.includes('LOAN') || code.includes('LIQUIDAT')) return 'financeAlerts'
  if (code.includes('WELCOME') || code.includes('ADMIN_MESSAGE')) return 'systemMessages'

  return null
}
