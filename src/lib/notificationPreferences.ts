/**
 * notificationPreferences.ts
 *
 * Shared frontend source of truth for in-game notification preferences.
 *
 * Database remains authoritative for notification_types.preference_group.
 * The frontend uses preference_group directly when available and only falls
 * back to exact-code/legacy classification for older RPC payloads.
 */

export const PREFERENCES_STORAGE_KEY = 'pro-peloton-preferences'


export const ADVISOR_NOTIFICATION_PREFERENCES_STORAGE_KEY =
  'ppm:staff-advisor-notification-category-preferences-v3'

export type StaffAdvisoryRoleType =
  | 'head_coach'
  | 'sport_director'
  | 'team_doctor'
  | 'mechanic'
  | 'scout_analyst'

export const ADVISOR_NOTIFICATION_CATEGORY_DEFINITIONS = {
  trainingReadiness: {
    label: 'Training & Rider Readiness',
    description:
      'Training load, fatigue, rider availability, training gaps, squad readiness and rider development advisories.',
    requiredRole: 'head_coach',
  },
  raceProgrammePreparation: {
    label: 'Race Programme & Preparation',
    description:
      'Race programme reviews and gaps, missing race preparation and preparation-ready advisories.',
    requiredRole: 'sport_director',
  },
  startlistStagePlans: {
    label: 'Startlist & Stage Plans',
    description:
      'Startlist deadline alerts plus missing or incomplete stage-plan advisories.',
    requiredRole: 'sport_director',
  },
  medicalRecovery: {
    label: 'Medical & Recovery',
    description:
      'Medical reports, injury and illness treatment plans, recovery changes and medical-clearance advisories.',
    requiredRole: 'team_doctor',
  },
  equipmentWorkshopSupplies: {
    label: 'Equipment, Workshop & Race Supplies',
    description:
      'Equipment condition, workshop readiness and analytical race-supply review advisories.',
    requiredRole: 'mechanic',
  },
  scoutingRecruitment: {
    label: 'Scouting & Recruitment',
    description:
      'Recruitment intelligence, scouting review and priority-prospect advisories.',
    requiredRole: 'scout_analyst',
  },
} as const

export type AdvisorNotificationCategoryKey =
  keyof typeof ADVISOR_NOTIFICATION_CATEGORY_DEFINITIONS
export type AdvisorNotificationSettings = Record<
  AdvisorNotificationCategoryKey,
  boolean
>

export const ADVISOR_NOTIFICATION_CATEGORY_ORDER = Object.keys(
  ADVISOR_NOTIFICATION_CATEGORY_DEFINITIONS
) as AdvisorNotificationCategoryKey[]

export const DEFAULT_ADVISOR_NOTIFICATION_SETTINGS =
  ADVISOR_NOTIFICATION_CATEGORY_ORDER.reduce((settings, key) => {
    settings[key] = true
    return settings
  }, {} as AdvisorNotificationSettings)

export function readAdvisorNotificationPreferences(): AdvisorNotificationSettings {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_ADVISOR_NOTIFICATION_SETTINGS }
  }

  try {
    const raw = window.localStorage.getItem(
      ADVISOR_NOTIFICATION_PREFERENCES_STORAGE_KEY
    )
    if (!raw) return { ...DEFAULT_ADVISOR_NOTIFICATION_SETTINGS }

    const parsed = JSON.parse(raw) as Partial<AdvisorNotificationSettings>
    return { ...DEFAULT_ADVISOR_NOTIFICATION_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_ADVISOR_NOTIFICATION_SETTINGS }
  }
}

export function writeAdvisorNotificationPreferences(
  settings: AdvisorNotificationSettings
): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      ADVISOR_NOTIFICATION_PREFERENCES_STORAGE_KEY,
      JSON.stringify(settings)
    )
    window.dispatchEvent(
      new CustomEvent('notification-preferences-updated', {
        detail: { advisorNotifications: settings },
      })
    )
  } catch {
    // Ignore unavailable/blocked localStorage.
  }
}

function getAdvisorPayload(item: unknown): Record<string, unknown> | null {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>

  if (row.payload_json && typeof row.payload_json === 'object') {
    return row.payload_json as Record<string, unknown>
  }
  if (row.metadata && typeof row.metadata === 'object') {
    return row.metadata as Record<string, unknown>
  }

  return null
}

export function resolveAdvisorNotificationCategory(
  item: unknown
): AdvisorNotificationCategoryKey | null {
  if (!item || typeof item !== 'object') return null

  const row = item as Record<string, unknown>
  const typeCode = String(row.type_code ?? '').toUpperCase()
  const preferenceGroup = String(row.preference_group ?? '')
  const payload = getAdvisorPayload(item)

  if (
    !(
      preferenceGroup === 'staffAdvisory' ||
      typeCode.startsWith('ADVISOR_') ||
      payload?.advisor_report === true
    )
  ) {
    return null
  }

  const reportCode = String(payload?.report_code ?? '')
  const variant = String(payload?.report_variant ?? '')

  // Head Coach: all training/readiness analysis belongs to one user category.
  if (
    typeCode === 'ADVISOR_HEAD_COACH_REPORT' ||
    reportCode.startsWith('hc_') ||
    reportCode === 'weekly_training_readiness'
  ) {
    return 'trainingReadiness'
  }

  // Sports Director is intentionally split into two user-facing categories.
  if (
    reportCode === 'sd_startlist_deadline_alert' ||
    reportCode === 'sd_stage_plans_missing' ||
    reportCode === 'sd_stage_plans_incomplete' ||
    variant === 'startlist_deadline_alert' ||
    variant === 'stage_plans_missing' ||
    variant === 'stage_plans_incomplete'
  ) {
    return 'startlistStagePlans'
  }

  if (
    typeCode === 'ADVISOR_SPORT_DIRECTOR_REPORT' ||
    reportCode === 'weekly_race_programme' ||
    reportCode === 'sd_race_programme_gap' ||
    reportCode === 'sd_race_programme_continuity_gap' ||
    reportCode === 'sd_race_preparation_missing' ||
    variant === 'race_programme_gap' ||
    variant === 'programme_continuity' ||
    variant === 'long_programme_break' ||
    variant === 'programme_empty' ||
    variant === 'race_preparation_missing' ||
    variant === 'race_preparation_ready'
  ) {
    return 'raceProgrammePreparation'
  }

  if (
    typeCode === 'ADVISOR_TEAM_DOCTOR_REPORT' ||
    reportCode === 'weekly_medical_treatment' ||
    reportCode.startsWith('td_')
  ) {
    return 'medicalRecovery'
  }

  if (
    typeCode === 'ADVISOR_CHIEF_MECHANIC_REPORT' ||
    reportCode === 'weekly_equipment_workshop_review' ||
    reportCode.startsWith('mechanic_')
  ) {
    return 'equipmentWorkshopSupplies'
  }

  if (
    typeCode === 'ADVISOR_SCOUT_REPORT' ||
    reportCode === 'weekly_recruitment_review' ||
    reportCode.startsWith('scout_')
  ) {
    return 'scoutingRecruitment'
  }

  return null
}

export function canReceiveAdvisorNotification(
  item: unknown,
  _settings: AdvisorNotificationSettings = readAdvisorNotificationPreferences()
): boolean {
  // Advisor category preferences now control FUTURE delivery server-side by
  // bulk-writing exact report-code mute states. Existing notifications remain
  // visible by design, including cards used to selectively unmute one subtype
  // while its broader Preferences category remains OFF.
  //
  // Therefore the frontend must not hide already-delivered advisor
  // notifications merely because the grouped category checkbox is OFF.
  return true
}

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

export type NotificationPreferenceGroupDefinition = {
  label: string
  description: string
  section: 'race' | 'team' | 'club' | 'account'
}

export const NOTIFICATION_PREFERENCE_GROUPS: Record<
  NotificationPreferenceGroup,
  NotificationPreferenceGroupDefinition
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
    label: 'Race preparation status',
    description:
      'Show Core status and consequence notifications for race preparation. Proactive rider-deadline advice belongs to Sports Director Advisory.',
    section: 'race',
  },
  stagePlanReminders: {
    label: 'Stage plan status',
    description:
      'Show Core stage-plan opening and lock-state notifications. Missing-plan advice belongs to Sports Director Advisory.',
    section: 'race',
  },
  raceWeather: {
    label: 'Race weather',
    description:
      'Show notifications when stages, races, or race-related activities are affected by weather.',
    section: 'race',
  },
  raceResults: {
    label: 'Race results',
    description:
      'Show notifications for finished races, stage results, classifications, and race summaries.',
    section: 'race',
  },
  teamUpdates: {
    label: 'Team updates',
    description:
      'Show notifications related to riders, morale, health, contracts, staff, and internal team changes.',
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
    description:
      'Show notifications for training camp starts, daily reports, weather warnings, and completions.',
    section: 'team',
  },
  scoutingReports: {
    label: 'Scouting reports',
    description: 'Show notifications when a scouting report is completed.',
    section: 'team',
  },
  retirementUpdates: {
    label: 'Retirement updates',
    description:
      'Show notifications when riders or staff announce retirement and when retirements are finalized.',
    section: 'team',
  },
  financeAlerts: {
    label: 'Finance alerts',
    description:
      'Show important finance warnings, sponsor objectives, emergency loans, tax alerts, payroll issues, and insolvency notices.',
    section: 'club',
  },
  walletRewards: {
    label: 'Coins & rewards',
    description:
      'Show coin purchases, coin credits, birthday gifts, referral rewards, and wallet reward messages.',
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
    description:
      'Show notifications when race supplies are low, missing, or need restocking before events.',
    section: 'club',
  },
  equipmentUpdates: {
    label: 'Equipment updates',
    description:
      'Show notifications for equipment maintenance, sales, discard actions, and equipment lifecycle updates.',
    section: 'club',
  },
  infrastructureUpdates: {
    label: 'Infrastructure updates',
    description:
      'Show notifications for infrastructure orders, deliveries, repairs, sales, upgrades, and condition warnings.',
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
    code: 'race' as const,
    title: 'Race notifications',
    description: 'Invitations, preparation, weather, stage plans, race-day issues, and results.',
  },
  {
    code: 'team' as const,
    title: 'Team & rider notifications',
    description: 'Riders, staff, transfers, training camps, scouting, and retirements.',
  },
  {
    code: 'club' as const,
    title: 'Club management notifications',
    description: 'Finance, coins, rewards, supplies, equipment, tax, and infrastructure.',
  },
  {
    code: 'account' as const,
    title: 'Account & system notifications',
    description: 'Official game messages and onboarding information.',
  },
] as const

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings =
  NOTIFICATION_PREFERENCE_GROUP_ORDER.reduce((settings, group) => {
    settings[group] = true
    return settings
  }, {} as NotificationSettings)

type StoredPreferences = {
  notifications?: Partial<NotificationSettings>
}

const RETIRED_CORE_ADVISORY_OVERLAP_TYPES = new Set([
  'RACE_PLAN_DEADLINE_REMINDER',
  'STAGE_PLAN_MISSING_REMINDER',
])

const EXACT_TYPE_GROUPS: Record<string, NotificationPreferenceGroup> = {
  RACE_APPLICATION_ACCEPTED: 'raceApplicationResults',
  RACE_APPLICATION_DECLINED: 'raceApplicationResults',
  RACE_PLAN_FINALISED: 'racePreparation',
  RACE_PLAN_NEEDS_ATTENTION: 'racePreparation',
  RACE_PLAN_OPEN: 'racePreparation',
  STAGE_PLAN_LOCK_REMINDER: 'stagePlanReminders',
  STAGE_PLAN_LOCKED: 'stagePlanReminders',
  STAGE_PLAN_MISSING_AT_LOCK: 'stagePlanReminders',
  STAGE_PLANS_OPEN: 'stagePlanReminders',
  RACE_STAGE_WEATHER_CANCELLED: 'raceWeather',
  RACE_WEATHER_CANCELLED: 'raceWeather',
  RACE_RESULTS_SUMMARY: 'raceResults',
  race_missed_startlist: 'races',
  RACE_SUPPLIES_LOW: 'raceSupplies',
  RACE_SUPPLIES_LOW_STOCK: 'raceSupplies',
  STAFF_CONTRACT_EXPIRING: 'staffContracts',
  STAFF_COURSE_COMPLETED: 'staffCourses',
  SCOUT_REPORT_COMPLETED: 'scoutingReports',
  RETIREMENT_ANNOUNCED: 'retirementUpdates',
  SEASON_RETIREMENTS_CONFIRMED: 'retirementUpdates',
  TRAINING_CAMP_WEATHER_WARNING: 'trainingCamps',
  TAX_AUDIT_COMPLETED: 'taxUpdates',
  COMPETITION_REWARD_GRANTED: 'competitionRewards',
  BIRTHDAY_GIFT_10_COINS: 'walletRewards',
  COIN_PURCHASE_COMPLETED: 'walletRewards',
  REFERRAL_REWARD_GRANTED: 'walletRewards',
  ADMIN_MESSAGE: 'systemMessages',
  WELCOME_MESSAGE: 'systemMessages',
}

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

    const parsed = JSON.parse(raw) as StoredPreferences | Partial<NotificationSettings>
    const stored =
      parsed && typeof parsed === 'object' && 'notifications' in parsed
        ? parsed.notifications
        : parsed

    const normalized = { ...DEFAULT_NOTIFICATION_SETTINGS }

    for (const group of NOTIFICATION_PREFERENCE_GROUP_ORDER) {
      if (typeof stored?.[group] === 'boolean') {
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
        detail: { notifications: settings },
      })
    )
  } catch {
    // Ignore unavailable/blocked localStorage.
  }
}

/**
 * Transitional fallback for older notification RPC payloads.
 * Prefer resolveNotificationPreferenceGroup() with preference_group supplied.
 */
export function getNotificationTypeFromEvent(
  typeCode?: string | null,
  source?: string | null
): NotificationPreferenceGroup {
  const rawCode = typeCode?.trim() ?? ''
  const upper = rawCode.toUpperCase()
  const normalizedSource = source?.trim().toLowerCase() ?? ''

  // Retired Core/advisor overlaps are filtered by canReceiveNotificationItem.
  // Keep this fallback deterministic if called directly elsewhere.
  if (RETIRED_CORE_ADVISORY_OVERLAP_TYPES.has(upper)) {
    return 'racePreparation'
  }

  if (EXACT_TYPE_GROUPS[rawCode]) return EXACT_TYPE_GROUPS[rawCode]
  if (EXACT_TYPE_GROUPS[upper]) return EXACT_TYPE_GROUPS[upper]

  if (upper.startsWith('INFRASTRUCTURE_')) return 'infrastructureUpdates'
  if (upper.startsWith('EQUIPMENT_')) return 'equipmentUpdates'
  if (upper.startsWith('TRAINING_CAMP') || rawCode === 'training_camp') {
    return 'trainingCamps'
  }
  if (upper.includes('TRANSFER') || upper.includes('FREE_AGENT') || upper.includes('NEGOTIATION')) {
    return 'transferUpdates'
  }
  if (upper.startsWith('RIDER_') || upper.startsWith('DEVELOPING_') || upper === 'STAFF_HIRED') {
    return 'teamUpdates'
  }
  if (upper.includes('SPONSOR') || upper.includes('FINANCE') || upper.includes('LIQUIDAT')) {
    return 'financeAlerts'
  }
  if (upper.includes('RACE_SUPPL')) return 'raceSupplies'
  if (upper.includes('WEATHER')) return 'raceWeather'
  if (upper.includes('RESULT') || upper.includes('CLASSIFICATION')) return 'raceResults'
  if (upper.includes('STAGE_PLAN')) return 'stagePlanReminders'
  if (upper.includes('RACE_PLAN')) return 'racePreparation'
  if (upper.includes('APPLICATION')) return 'raceApplicationResults'
  if (upper.includes('INVITATION')) return 'raceInvitations'
  if (upper.includes('COIN') || upper.includes('REWARD')) return 'walletRewards'
  if (normalizedSource === 'admin' || upper.includes('WELCOME') || upper.includes('ADMIN')) {
    return 'systemMessages'
  }

  return 'teamUpdates'
}

export function resolveNotificationPreferenceGroup(
  preferenceGroup?: string | null,
  typeCode?: string | null,
  source?: string | null
): NotificationPreferenceGroup {
  if (isNotificationPreferenceGroup(preferenceGroup)) {
    return preferenceGroup
  }

  return getNotificationTypeFromEvent(typeCode, source)
}


export function canReceiveNotificationItem(
  preferences: NotificationSettings,
  item: { preference_group?: string | null; type_code?: string | null; source?: string | null; payload_json?: unknown; metadata?: unknown }
): boolean {
  const group = String(item.preference_group ?? '')
  const typeCode = String(item.type_code ?? '').toUpperCase()

  // These proactive Core reminders were retired because the paid Sports
  // Director now owns the same information. Keep stale historical rows hidden
  // even if an older RPC still returns them.
  if (RETIRED_CORE_ADVISORY_OVERLAP_TYPES.has(typeCode)) return false

  if (group === 'staffAdvisory' || typeCode.startsWith('ADVISOR_')) {
    return canReceiveAdvisorNotification(item)
  }

  return canReceiveNotification(
    preferences,
    resolveNotificationPreferenceGroup(
      item.preference_group,
      item.type_code,
      item.source
    )
  )
}

export function canReceiveNotification(
  preferences: NotificationSettings,
  group: NotificationPreferenceGroup | string | null | undefined
): boolean {
  if (!isNotificationPreferenceGroup(group)) {
    return true
  }

  return preferences[group] !== false
}
