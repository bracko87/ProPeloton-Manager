import type { NotificationItem } from './notificationHelpers'
import type {
  NotificationActionTemplate,
  NotificationDetailRow,
} from './notificationTemplatesBase'
import {
  getNotificationActions as getBaseNotificationActions,
  getNotificationDetailRows as getBaseNotificationDetailRows,
  getNotificationExtraText as getBaseNotificationExtraText,
  getNotificationImageSrc as getBaseNotificationImageSrc,
  getNotificationIntroText as getBaseNotificationIntroText,
} from './notificationTemplatesBase'
import {
  localizeNotificationActionLabel,
  localizeNotificationDetailLabel,
  localizeNotificationValue,
} from './notificationLocalization'

export * from './notificationTemplatesBase'

const RICH_RACE_NOTIFICATION_CODES = new Set([
  'RACE_APPLICATION_WINDOW_OPEN',
  'RACE_APPLICATION_CLOSING_SOON',
  'RACE_APPLICATION_RULE_CHANGE',
  'RACE_TEAM_DISQUALIFIED_JERSEYS',
])

const RICH_RACE_IMAGES: Record<string, string> = {
  RACE_TEAM_DISQUALIFIED_JERSEYS:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Team%20removed%20from%20race.png',
  RACE_APPLICATION_CLOSING_SOON:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20aplication%20close%20in%203%20days.png',
  RACE_APPLICATION_WINDOW_OPEN:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Application%20are%20open.png',
  RACE_APPLICATION_RULE_CHANGE:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20apploicaiton%20deadline.png',
}

const PRESTART_DISQUALIFICATION_IMAGE =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Plan%20needs%20Antention.png'

function payloadOf(item: NotificationItem): Record<string, unknown> {
  const payload = item.payload_json
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {}
}

function readString(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readNumber(payload: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(payload[key])
    if (Number.isFinite(value)) return value
  }
  return null
}

function codeOf(item: NotificationItem): string {
  return String(item.type_code ?? '').trim().toUpperCase()
}

function isRichRaceNotification(item: NotificationItem): boolean {
  return RICH_RACE_NOTIFICATION_CODES.has(codeOf(item))
}

function isPrestartDisqualificationPenalty(item: NotificationItem): boolean {
  if (codeOf(item) !== 'RACE_PLAN_NEEDS_ATTENTION') return false
  const payload = payloadOf(item)
  return (
    readString(payload, 'event_type') === 'prestart_disqualification' &&
    readString(payload, 'reason_code') === 'mandatory_race_jersey_shortage'
  )
}

function raceNameFromTeamRemovalTitle(item: NotificationItem): string | null {
  const prefix = 'Team removed from '
  const title = String(item.title ?? '').trim()
  return title.startsWith(prefix) ? title.slice(prefix.length).trim() || null : null
}

function richRaceImage(item: NotificationItem): string | null {
  const payload = payloadOf(item)
  return readString(payload, 'image_url', 'image_src') || RICH_RACE_IMAGES[codeOf(item)] || null
}

function prestartDisqualificationImage(item: NotificationItem): string {
  return readString(payloadOf(item), 'image_url', 'image_src') || PRESTART_DISQUALIFICATION_IMAGE
}

function prestartDisqualificationIntro(item: NotificationItem): string {
  const payload = payloadOf(item)
  const race = readString(payload, 'race_name') || 'this race'
  const team = readString(payload, 'club_name', 'team_name') || 'Your team'
  const required = readNumber(payload, 'required_jersey_units')
  const available = readNumber(payload, 'available_jersey_units', 'effective_available_jersey_units')
  const missing = readNumber(payload, 'missing_jersey_units')
  const stock =
    required !== null && available !== null
      ? ` The eligibility check recorded ${required} required, ${available} eligible${missing !== null ? `, and ${missing} missing` : ''}.`
      : ''

  return `${team} was removed from ${race} at the mandatory pre-start eligibility check because it did not have enough eligible Race Jersey Kits.${stock} This is a club-controllable race-preparation failure, so the normal missed-start/no-show consequences were applied.`
}

function richRaceIntro(item: NotificationItem): string | null {
  const code = codeOf(item)
  const payload = payloadOf(item)

  if (code === 'RACE_TEAM_DISQUALIFIED_JERSEYS') {
    const race =
      readString(payload, 'race_name') || raceNameFromTeamRemovalTitle(item) || 'this race'
    const team = readString(payload, 'team_name') || 'Your team'
    const stage = readNumber(payload, 'stage_number', 'disqualified_from_stage_number')
    const required = readNumber(payload, 'required_jersey_units')
    const available = readNumber(payload, 'available_jersey_units')
    const stageLabel = stage !== null ? ` before Stage ${stage}` : ''
    const stockLabel =
      required !== null && available !== null
        ? ` Required: ${required}; available: ${available}.`
        : ''

    return `${team} was automatically removed from ${race} because the mandatory Race Jersey Kit requirement was not met${stageLabel}.${stockLabel} The removal applies to the affected stage and every remaining stage, so the team and its riders can no longer place or score points in this race.`
  }

  if (code === 'RACE_APPLICATION_WINDOW_OPEN') {
    const count = readNumber(payload, 'opened_count') ?? 0
    const races = readString(payload, 'race_name', 'sample_races')

    if (count === 1 && races) {
      return `${races} is now accepting applications. Check the race page for entry rules, route overview, application deadline, and squad readiness before submitting your team.`
    }

    return `${count > 0 ? count : 'New'} race application windows are now open${races ? `: ${races}` : ''}. Review the Calendar for entry rules, deadlines, and squad readiness before applying.`
  }

  if (code === 'RACE_APPLICATION_CLOSING_SOON') {
    const count = readNumber(payload, 'closing_count') ?? 0
    const races = readString(payload, 'sample_races')
    const subject = count === 1 ? 'One race application window is' : `${count || 'Several'} race application windows are`

    return `${subject} about to close in 3 days${races ? `: ${races}` : ''}. Review each race page, confirm your squad availability, check equipment readiness, and submit your entries before the deadline expires.`
  }

  if (code === 'RACE_APPLICATION_RULE_CHANGE') {
    const lateJanuaryDays = readNumber(payload, 'late_january_close_days') ?? 3
    const standardDays = readNumber(payload, 'february_onward_close_days') ?? 7

    return `Application timing rules have been updated. Current late-January races use a ${lateJanuaryDays}-day closing window, while February and later races use a ${standardDays}-day application deadline. Review your planning now so you do not miss future race entries.`
  }

  return null
}

function localizeRows(item: NotificationItem, rows: NotificationDetailRow[]): NotificationDetailRow[] {
  return rows.map(row => ({
    label: localizeNotificationDetailLabel(row.label, item),
    value: localizeNotificationValue(row.value, item),
  }))
}

function prestartDisqualificationDetailRows(item: NotificationItem): NotificationDetailRow[] {
  const payload = payloadOf(item)
  const race = readString(payload, 'race_name') || 'Race'
  const team = readString(payload, 'club_name', 'team_name') || 'Your team'
  const problem = readString(payload, 'problem_label') || 'Not enough eligible Race Jersey Kits'
  const required = readNumber(payload, 'required_jersey_units')
  const available = readNumber(payload, 'available_jersey_units', 'effective_available_jersey_units')
  const missing = readNumber(payload, 'missing_jersey_units')
  const cash = readNumber(payload, 'cash_penalty')
  const score = readNumber(payload, 'score_delta')

  return localizeRows(item, [
    { label: 'Race', value: race },
    { label: 'Team', value: team },
    { label: 'Problem', value: problem },
    ...(required !== null ? [{ label: 'Required Race Jersey Kits', value: String(required) }] : []),
    ...(available !== null ? [{ label: 'Eligible at start', value: String(available) }] : []),
    ...(missing !== null ? [{ label: 'Missing Race Jersey Kits', value: String(missing) }] : []),
    { label: 'Race entry fee', value: 'Retained (not refunded)' },
    ...(cash !== null ? [{ label: 'Cash fine', value: cash.toLocaleString('en-US') }] : []),
    ...(score !== null ? [{ label: 'Race Commitment Score', value: score >= 0 ? `+${score}` : String(score) }] : []),
    { label: 'Outcome', value: 'Removed before/at race start' },
  ])
}

function richRaceDetailRows(item: NotificationItem): NotificationDetailRow[] {
  const code = codeOf(item)
  const payload = payloadOf(item)

  if (code === 'RACE_TEAM_DISQUALIFIED_JERSEYS') {
    const race =
      readString(payload, 'race_name') || raceNameFromTeamRemovalTitle(item) || 'Race'
    const team = readString(payload, 'team_name') || 'Your team'
    const stage = readNumber(payload, 'stage_number', 'disqualified_from_stage_number')
    const required = readNumber(payload, 'required_jersey_units')
    const available = readNumber(payload, 'available_jersey_units')
    const missing = readNumber(payload, 'missing_jersey_units')

    return localizeRows(item, [
      { label: 'Race', value: race },
      { label: 'Team', value: team },
      ...(stage !== null ? [{ label: 'Removed from', value: `Stage ${stage}` }] : []),
      ...(required !== null ? [{ label: 'Required Race Jersey Kits', value: String(required) }] : []),
      ...(available !== null ? [{ label: 'Available Race Jersey Kits', value: String(available) }] : []),
      ...(missing !== null ? [{ label: 'Missing Race Jersey Kits', value: String(missing) }] : []),
      { label: 'Race status', value: 'Removed for the remaining race' },
    ])
  }

  if (code === 'RACE_APPLICATION_WINDOW_OPEN') {
    const count = readNumber(payload, 'opened_count')
    const races = readString(payload, 'race_name', 'sample_races')

    return localizeRows(item, [
      ...(races ? [{ label: count === 1 ? 'Race' : 'Races', value: races }] : []),
      ...(count !== null ? [{ label: 'Application windows opened', value: String(count) }] : []),
      { label: 'Application status', value: 'Open' },
    ])
  }

  if (code === 'RACE_APPLICATION_CLOSING_SOON') {
    const count = readNumber(payload, 'closing_count')
    const races = readString(payload, 'sample_races')
    const days = readNumber(payload, 'days_until_close') ?? 3

    return localizeRows(item, [
      ...(races ? [{ label: 'Races affected', value: races }] : []),
      ...(count !== null ? [{ label: 'Application windows affected', value: String(count) }] : []),
      { label: 'Deadline', value: `Closes in ${days} days` },
    ])
  }

  if (code === 'RACE_APPLICATION_RULE_CHANGE') {
    const lateJanuaryDays = readNumber(payload, 'late_january_close_days') ?? 3
    const standardDays = readNumber(payload, 'february_onward_close_days') ?? 7

    return localizeRows(item, [
      { label: 'Late-January races', value: `Applications close ${lateJanuaryDays} days before the start` },
      { label: 'February onward', value: `Applications close ${standardDays} days before the start` },
    ])
  }

  return []
}

function prestartDisqualificationExtraText(): string {
  return 'The penalty has already been applied. Open the race for context, or go directly to Race Supplies to review your eligible race jerseys and avoid the same issue at a future start.'
}

function richRaceExtraText(item: NotificationItem): string | null {
  const code = codeOf(item)
  const payload = payloadOf(item)

  if (code === 'RACE_TEAM_DISQUALIFIED_JERSEYS') {
    return 'Open Equipment to review inventory and prevent the same issue in future races.'
  }

  if (code === 'RACE_APPLICATION_WINDOW_OPEN') {
    const count = readNumber(payload, 'opened_count') ?? 0
    return count === 1
      ? 'Open the race page now to review requirements and apply early.'
      : 'Open the Calendar now to review all newly opened races and apply early.'
  }

  if (code === 'RACE_APPLICATION_CLOSING_SOON') {
    return 'Open the Calendar now to compare races and apply before the application windows close.'
  }

  if (code === 'RACE_APPLICATION_RULE_CHANGE') {
    return 'Open the Calendar to review February races and adapt your application plan early.'
  }

  return null
}

function richRaceAction(item: NotificationItem): { label: string; href: string } | null {
  const code = codeOf(item)
  const payload = payloadOf(item)

  if (code === 'RACE_TEAM_DISQUALIFIED_JERSEYS') {
    return { label: 'Open Equipment', href: '/dashboard/equipment' }
  }

  if (code === 'RACE_APPLICATION_WINDOW_OPEN') {
    const count = readNumber(payload, 'opened_count') ?? 0
    const raceId = readString(payload, 'race_id')
    const racePath = readString(payload, 'race_path')

    if (count === 1 && (racePath || raceId)) {
      return {
        label: 'Open Race Page',
        href: racePath || `/dashboard/races/${raceId}`,
      }
    }

    return { label: 'Open Calendar', href: '/dashboard/calendar' }
  }

  if (code === 'RACE_APPLICATION_CLOSING_SOON') {
    return { label: 'Open Calendar', href: '/dashboard/calendar' }
  }

  if (code === 'RACE_APPLICATION_RULE_CHANGE') {
    return { label: 'Review Calendar', href: '/dashboard/calendar' }
  }

  return null
}

function prestartDisqualificationActions(item: NotificationItem): NotificationActionTemplate[] {
  const payload = payloadOf(item)
  const raceId = readString(payload, 'race_id')
  const raceHref = readString(payload, 'race_page_path') || (raceId ? `/dashboard/races/${raceId}` : null)
  const suppliesHref = readString(payload, 'race_supplies_path') || '/dashboard/equipment?tab=race-supplies'
  const actions: NotificationActionTemplate[] = []

  if (raceHref) {
    actions.push({
      key: 'open-race',
      label: localizeNotificationActionLabel('Open Race'),
      variant: 'primary',
      kind: 'navigate',
      getHref: () => raceHref,
      show: () => true,
    })
  }

  actions.push({
    key: 'open-race-supplies',
    label: localizeNotificationActionLabel('Open Race Supplies'),
    variant: raceHref ? 'secondary' : 'primary',
    kind: 'navigate',
    getHref: () => suppliesHref,
    show: () => true,
  })

  return actions
}

export function getNotificationImageSrc(item: NotificationItem): string | null {
  if (isPrestartDisqualificationPenalty(item)) return prestartDisqualificationImage(item)
  if (isRichRaceNotification(item)) return richRaceImage(item)
  return getBaseNotificationImageSrc(item)
}

export function getNotificationIntroText(item: NotificationItem): string | null {
  if (isPrestartDisqualificationPenalty(item)) return prestartDisqualificationIntro(item)
  if (isRichRaceNotification(item)) return richRaceIntro(item)
  return getBaseNotificationIntroText(item)
}

export function getNotificationDetailRows(item: NotificationItem): NotificationDetailRow[] {
  if (isPrestartDisqualificationPenalty(item)) return prestartDisqualificationDetailRows(item)
  if (isRichRaceNotification(item)) return richRaceDetailRows(item)
  return getBaseNotificationDetailRows(item)
}

export function getNotificationExtraText(item: NotificationItem): string | null {
  if (isPrestartDisqualificationPenalty(item)) return prestartDisqualificationExtraText()
  if (isRichRaceNotification(item)) return richRaceExtraText(item)
  return getBaseNotificationExtraText(item)
}

export function getNotificationActions(item: NotificationItem): NotificationActionTemplate[] {
  if (isPrestartDisqualificationPenalty(item)) return prestartDisqualificationActions(item)

  const override = richRaceAction(item)
  if (!override) return getBaseNotificationActions(item)

  return getBaseNotificationActions(item).map(action => {
    if (action.kind !== 'navigate') return action

    return {
      ...action,
      label: localizeNotificationActionLabel(override.label),
      getHref: () => override.href,
      show: () => true,
    }
  })
}
