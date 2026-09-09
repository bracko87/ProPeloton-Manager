import { Link } from 'react-router'
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
  translateNotificationKey,
} from './notificationLocalization'

export * from './notificationTemplatesBase'

const RICH_RACE_NOTIFICATION_CODES = new Set([
  'RACE_APPLICATION_WINDOW_OPEN',
  'RACE_APPLICATION_CLOSING_SOON',
  'RACE_APPLICATION_RULE_CHANGE',
  'RACE_TEAM_DISQUALIFIED_JERSEYS',
])

const RICH_DAILY_NOTIFICATION_CODES = new Set([
  'RACE_APPLICATION_DAILY_UPDATE',
  'RACE_PREPARATION_DAILY_REPORT',
  'STAGE_PLANNING_DAILY_REPORT',
  'RIDER_HEALTH_DAILY_REPORT',
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

const RICH_DAILY_IMAGES: Record<string, string> = {
  RACE_APPLICATION_DAILY_UPDATE:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Application%20are%20open.png',
  RACE_PREPARATION_DAILY_REPORT:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Plan%20needs%20Antention.png',
  STAGE_PLANNING_DAILY_REPORT:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stage%20plan%20open.png',
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

function readObjectArray(
  payload: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown>[] {
  for (const key of keys) {
    const value = payload[key]
    if (!Array.isArray(value)) continue
    return value.filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
    )
  }
  return []
}

function codeOf(item: NotificationItem): string {
  return String(item.type_code ?? '').trim().toUpperCase()
}

function isRichRaceNotification(item: NotificationItem): boolean {
  return RICH_RACE_NOTIFICATION_CODES.has(codeOf(item))
}

function isRichDailyNotification(item: NotificationItem): boolean {
  return RICH_DAILY_NOTIFICATION_CODES.has(codeOf(item))
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

function richDailyImage(item: NotificationItem): string | null {
  const payload = payloadOf(item)
  return readString(payload, 'image_url', 'image_src') || RICH_DAILY_IMAGES[codeOf(item)] || null
}

function prestartDisqualificationImage(item: NotificationItem): string {
  return readString(payloadOf(item), 'image_url', 'image_src') || PRESTART_DISQUALIFICATION_IMAGE
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function listWithRemainder(values: string[], max = 6): string {
  const cleaned = values.map(value => value.trim()).filter(Boolean)
  if (cleaned.length === 0) return translateNotificationKey('richReports.common.none')
  if (cleaned.length <= max) return cleaned.join(', ')
  return `${cleaned.slice(0, max).join(', ')} ${translateNotificationKey('richReports.common.more', { count: cleaned.length - max })}`
}

function formatShortGameDate(value: unknown): string | null {
  const text = String(value ?? '').trim()
  const match = text.match(/^\d{4}-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/)
  if (!match) return text || null
  const date = `${match[2]}.${match[1]}.`
  return match[3] && match[4] ? `${date} ${match[3]}:${match[4]}` : date
}

function raceLabel(row: Record<string, unknown>, options?: { deadline?: boolean }): string {
  const name = String(row.race_name ?? row.name ?? translateNotificationKey('richReports.common.raceFallback')).trim()
  if (!options?.deadline) return name

  const category = String(row.category ?? row.race_category ?? '').trim()
  if (category) return `${name} (${category})`

  const days = Number(row.days_until_close)
  if (Number.isFinite(days)) {
    if (days <= 0) return `${name} (${translateNotificationKey('richReports.common.closesToday')})`
    return `${name} (${days}d)`
  }
  const close = formatShortGameDate(row.applications_close)
  return close ? `${name} (${close})` : name
}

function raceInlineLinks(
  rows: Record<string, unknown>[],
  max = 8,
  prefix = ''
): string {
  const visible = rows.slice(0, max)
  if (visible.length === 0) return translateNotificationKey('richReports.common.none')

  return (
    <>
      {prefix}
      {visible.map((row, index) => {
        const raceId = String(row.race_id ?? row.id ?? '').trim()
        const label = raceLabel(row, { deadline: true })

        return (
          <span key={`${raceId || label}-${index}`}>
            {index > 0 ? ', ' : null}
            {raceId ? (
              <Link
                to={`/dashboard/races/${raceId}`}
                className="underline decoration-slate-400 underline-offset-2 hover:text-sky-700"
              >
                {label}
              </Link>
            ) : (
              label
            )}
          </span>
        )
      })}
      {rows.length > max ? ` ${translateNotificationKey('richReports.common.more', { count: rows.length - max })}` : null}
    </>
  ) as unknown as string
}

function prepRaceLabel(row: Record<string, unknown>): string {
  const name = String(row.race_name ?? translateNotificationKey('richReports.common.raceFallback')).trim()
  const deadline = formatShortGameDate(row.rider_deadline)
  return deadline
    ? `${name} — ${translateNotificationKey('richReports.common.riderDeadlineDate', { date: deadline })}`
    : name
}

function stageLabel(row: Record<string, unknown>): string {
  const race = String(row.race_name ?? translateNotificationKey('richReports.common.raceFallback')).trim()
  const stageNumber = Number(row.stage_number)
  const stageName = String(row.stage_name ?? '').trim()
  const stage = Number.isFinite(stageNumber)
    ? `${translateNotificationKey('richReports.common.stageNumber', { number: stageNumber })}${stageName && !/^stage\s+\d+$/i.test(stageName) ? `: ${stageName}` : ''}`
    : stageName || translateNotificationKey('richReports.common.stage')
  const lockAt = formatShortGameDate(row.lock_at)
  return `${race} — ${stage}${lockAt ? ` (${translateNotificationKey('richReports.common.lockDate', { date: lockAt })})` : ''}`
}

function healthRiderLabel(row: Record<string, unknown>): string {
  const name = String(row.rider_name ?? row.rider_full_name ?? translateNotificationKey('richReports.common.riderFallback')).trim()
  const normalizedStatus = String(row.status ?? row.event ?? '').toLowerCase().replace(/[-\s]+/g, '_').trim()
  const statusKeyByCode: Record<string, string> = {
    rider_injured: 'richReports.common.statusInjured', injured: 'richReports.common.statusInjured',
    rider_sick: 'richReports.common.statusSick', sick: 'richReports.common.statusSick',
    rider_not_fully_fit: 'richReports.common.statusNotFullyFit', not_fully_fit: 'richReports.common.statusNotFullyFit',
    rider_fit_again: 'richReports.common.statusRecovered', recovered: 'richReports.common.statusRecovered',
  }
  const statusKey = statusKeyByCode[normalizedStatus]
  const status = statusKey ? translateNotificationKey(statusKey) : ''
  const fatigue = Number(row.fatigue)
  const reasonRaw = String(row.unavailable_reason ?? '').trim()
  const reason = reasonRaw ? localizeNotificationValue(reasonRaw) : ''
  const extras = [
    status || null,
    Number.isFinite(fatigue) ? translateNotificationKey('richReports.common.fatigueValue', { value: fatigue }) : null,
    reason || null,
  ].filter(Boolean)
  return extras.length > 0 ? `${name} — ${extras.join(', ')}` : name
}

function prestartDisqualificationIntro(item: NotificationItem): string {
  const payload = payloadOf(item)
  const race = readString(payload, 'race_name') || translateNotificationKey('richReports.common.thisRace')
  const team = readString(payload, 'club_name', 'team_name') || translateNotificationKey('richReports.common.teamFallback')
  const required = readNumber(payload, 'required_jersey_units')
  const available = readNumber(payload, 'available_jersey_units', 'effective_available_jersey_units')
  const missing = readNumber(payload, 'missing_jersey_units')
  const missingPart = missing !== null
    ? translateNotificationKey('richReports.race.prestartMissing', { missing })
    : ''
  const stockPart = required !== null && available !== null
    ? translateNotificationKey('richReports.race.prestartStock', { required, available, missingPart })
    : ''

  return translateNotificationKey('richReports.race.prestart', { team, race, stockPart })
}

function richRaceIntro(item: NotificationItem): string | null {
  const code = codeOf(item)
  const payload = payloadOf(item)

  if (code === 'RACE_TEAM_DISQUALIFIED_JERSEYS') {
    const race = readString(payload, 'race_name') || raceNameFromTeamRemovalTitle(item) || translateNotificationKey('richReports.common.thisRace')
    const team = readString(payload, 'team_name') || translateNotificationKey('richReports.common.teamFallback')
    const stage = readNumber(payload, 'stage_number', 'disqualified_from_stage_number')
    const required = readNumber(payload, 'required_jersey_units')
    const available = readNumber(payload, 'available_jersey_units')
    const stagePart = stage !== null ? translateNotificationKey('richReports.race.stagePart', { stage }) : ''
    const stockPart = required !== null && available !== null
      ? translateNotificationKey('richReports.race.stockPart', { required, available })
      : ''
    return translateNotificationKey('richReports.race.teamRemoved', { team, race, stagePart, stockPart })
  }

  if (code === 'RACE_APPLICATION_WINDOW_OPEN') {
    const count = readNumber(payload, 'opened_count') ?? 0
    const races = readString(payload, 'race_name', 'sample_races')
    if (count === 1 && races) {
      return translateNotificationKey('richReports.race.windowOpenOne', { raceName: races })
    }
    return translateNotificationKey('richReports.race.windowOpenMany', {
      count,
      races: races ? `: ${races}` : '',
    })
  }

  if (code === 'RACE_APPLICATION_CLOSING_SOON') {
    const count = readNumber(payload, 'closing_count') ?? 0
    const races = readString(payload, 'sample_races')
    return translateNotificationKey(
      count === 1 ? 'richReports.race.closingSoonOne' : 'richReports.race.closingSoonMany',
      { count, races: races ? `: ${races}` : '' }
    )
  }

  if (code === 'RACE_APPLICATION_RULE_CHANGE') {
    const lateDays = readNumber(payload, 'late_january_close_days') ?? 3
    const standardDays = readNumber(payload, 'february_onward_close_days') ?? 7
    return translateNotificationKey('richReports.race.ruleChange', { lateDays, standardDays })
  }

  return null
}

function richDailyIntro(item: NotificationItem): string | null {
  const code = codeOf(item)
  const payload = payloadOf(item)

  if (code === 'RACE_APPLICATION_DAILY_UPDATE') {
    const open = readNumber(payload, 'opened_or_open_count', 'open_count') ?? 0
    const closing = readNumber(payload, 'closing_soon_count') ?? 0
    const pending = readNumber(payload, 'pending_count') ?? 0
    const closingRows = readObjectArray(payload, 'closing_soon_races')
    const closingNames = closing > 0 ? `: ${listWithRemainder(closingRows.map(row => raceLabel(row)), 5)}` : ''
    return translateNotificationKey('richReports.daily.application.intro', { open, closing, closingNames, pending })
  }

  if (code === 'RACE_PREPARATION_DAILY_REPORT') {
    const attention = readNumber(payload, 'attention_count') ?? 0
    const open = readNumber(payload, 'open_count') ?? 0
    const finalised = readNumber(payload, 'finalised_count') ?? 0
    const races = readObjectArray(payload, 'races')
    const attentionNames = races
      .filter(row => String(row.report_state ?? '') === 'attention')
      .map(row => String(row.race_name ?? translateNotificationKey('richReports.common.raceFallback')))
    const priority = attentionNames.length > 0
      ? translateNotificationKey('richReports.daily.preparation.priority', { items: listWithRemainder(attentionNames, 4) })
      : ''
    return translateNotificationKey('richReports.daily.preparation.intro', { attention, open, finalised, priority })
  }

  if (code === 'STAGE_PLANNING_DAILY_REPORT') {
    const missing = readNumber(payload, 'missing_at_lock_count') ?? 0
    const soon = readNumber(payload, 'lock_soon_count') ?? 0
    const open = readNumber(payload, 'open_count') ?? 0
    const locked = readNumber(payload, 'locked_count') ?? 0
    const stages = readObjectArray(payload, 'stages')
    const priorities = stages
      .filter(row => ['missing_at_lock', 'lock_soon'].includes(String(row.report_state ?? '')))
      .map(row => stageLabel(row))
    const priority = priorities.length > 0
      ? translateNotificationKey('richReports.daily.stage.priority', { items: listWithRemainder(priorities, 3) })
      : ''
    return translateNotificationKey('richReports.daily.stage.intro', { missing, soon, open, locked, priority })
  }

  if (code === 'RIDER_HEALTH_DAILY_REPORT') {
    const injured = readNumber(payload, 'injured_today') ?? 0
    const sick = readNumber(payload, 'sick_today') ?? 0
    const notFullyFit = readNumber(payload, 'not_fully_fit_today') ?? 0
    const recovered = readNumber(payload, 'recovered_today') ?? 0
    const issues = readNumber(payload, 'current_issue_count') ?? 0
    if (injured + sick + notFullyFit + recovered + issues === 0) {
      return translateNotificationKey('richReports.daily.health.noIssues')
    }
    return translateNotificationKey('richReports.daily.health.intro', {
      injured, sick, notFullyFit, recovered, issues,
    })
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
  const problem = readString(payload, 'problem_label') ? localizeNotificationValue(readString(payload, 'problem_label') || '') : translateNotificationKey('richReports.race.problemJerseys')
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
    { label: 'Race entry fee', value: translateNotificationKey('richReports.race.entryFeeRetained') },
    ...(cash !== null ? [{ label: 'Cash fine', value: cash.toLocaleString('en-US') }] : []),
    ...(score !== null ? [{ label: 'Race Commitment Score', value: score >= 0 ? `+${score}` : String(score) }] : []),
    { label: 'Outcome', value: translateNotificationKey('richReports.race.outcomeRemoved') },
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
      ...(stage !== null ? [{ label: 'Removed from', value: translateNotificationKey('richReports.common.stageNumber', { number: stage }) }] : []),
      ...(required !== null ? [{ label: 'Required Race Jersey Kits', value: String(required) }] : []),
      ...(available !== null ? [{ label: 'Available Race Jersey Kits', value: String(available) }] : []),
      ...(missing !== null ? [{ label: 'Missing Race Jersey Kits', value: String(missing) }] : []),
      { label: 'Race status', value: translateNotificationKey('richReports.race.removedRemaining') },
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
      { label: 'Deadline', value: translateNotificationKey('richReports.race.closesInDays', { days }) },
    ])
  }

  if (code === 'RACE_APPLICATION_RULE_CHANGE') {
    const lateJanuaryDays = readNumber(payload, 'late_january_close_days') ?? 3
    const standardDays = readNumber(payload, 'february_onward_close_days') ?? 7

    return localizeRows(item, [
      { label: 'Late-January races', value: translateNotificationKey('richReports.race.lateJanuaryRule', { days: lateJanuaryDays }) },
      { label: 'February onward', value: translateNotificationKey('richReports.race.februaryRule', { days: standardDays }) },
    ])
  }

  return []
}

function richDailyDetailRows(item: NotificationItem): NotificationDetailRow[] {
  const code = codeOf(item)
  const payload = payloadOf(item)

  if (code === 'RACE_APPLICATION_DAILY_UPDATE') {
    const open = readNumber(payload, 'opened_or_open_count', 'open_count') ?? 0
    const closing = readNumber(payload, 'closing_soon_count') ?? 0
    const pending = readNumber(payload, 'pending_count') ?? 0
    const openRows = readObjectArray(payload, 'open_races')
    const closingRows = readObjectArray(payload, 'closing_soon_races')
    const pendingRows = readObjectArray(payload, 'pending_applications')
    return [
      { label: translateNotificationKey('richReports.daily.application.open'), value: String(open) },
      { label: translateNotificationKey('richReports.daily.application.closing'), value: closing > 0 ? raceInlineLinks(closingRows, 8, `${closing} — `) : translateNotificationKey('richReports.common.none') },
      { label: translateNotificationKey('richReports.daily.application.next'), value: raceInlineLinks(openRows.slice(0, 8), 8) },
      { label: translateNotificationKey('richReports.daily.application.pending'), value: pending > 0 ? `${pending} — ${listWithRemainder(pendingRows.map(row => String(row.race_name ?? translateNotificationKey('richReports.common.raceFallback'))), 6)}` : translateNotificationKey('richReports.common.none') },
    ]
  }

  if (code === 'RACE_PREPARATION_DAILY_REPORT') {
    const races = readObjectArray(payload, 'races')
    const attention = races.filter(row => String(row.report_state ?? '') === 'attention')
    const open = races.filter(row => String(row.report_state ?? '') === 'open')
    const finalised = races.filter(row => String(row.report_state ?? '') === 'finalised')
    return [
      { label: translateNotificationKey('richReports.daily.preparation.attention'), value: listWithRemainder(attention.map(prepRaceLabel), 6) },
      { label: translateNotificationKey('richReports.daily.preparation.open'), value: listWithRemainder(open.map(prepRaceLabel), 6) },
      { label: translateNotificationKey('richReports.daily.preparation.finalised'), value: listWithRemainder(finalised.map(row => String(row.race_name ?? translateNotificationKey('richReports.common.raceFallback'))), 6) },
    ]
  }

  if (code === 'STAGE_PLANNING_DAILY_REPORT') {
    const stages = readObjectArray(payload, 'stages')
    const missing = stages.filter(row => String(row.report_state ?? '') === 'missing_at_lock')
    const soon = stages.filter(row => String(row.report_state ?? '') === 'lock_soon')
    const open = stages.filter(row => String(row.report_state ?? '') === 'open')
    const locked = stages.filter(row => String(row.report_state ?? '') === 'locked')
    return [
      { label: translateNotificationKey('richReports.daily.stage.missing'), value: listWithRemainder(missing.map(stageLabel), 5) },
      { label: translateNotificationKey('richReports.daily.stage.soon'), value: listWithRemainder(soon.map(stageLabel), 5) },
      { label: translateNotificationKey('richReports.daily.stage.open'), value: listWithRemainder(open.map(stageLabel), 6) },
      { label: translateNotificationKey('richReports.daily.stage.locked'), value: listWithRemainder(locked.map(stageLabel), 5) },
    ]
  }

  if (code === 'RIDER_HEALTH_DAILY_REPORT') {
    const changes = readObjectArray(payload, 'changes_today')
    const current = readObjectArray(payload, 'current_health_issues')
    const injuries = changes.filter(row => String(row.event ?? '') === 'rider_injured')
    const sickness = changes.filter(row => String(row.event ?? '') === 'rider_sick')
    const notFullyFit = changes.filter(row => String(row.event ?? '') === 'rider_not_fully_fit')
    const recovered = changes.filter(row => String(row.event ?? '') === 'rider_fit_again')
    return [
      { label: translateNotificationKey('richReports.daily.health.injuries'), value: listWithRemainder(injuries.map(healthRiderLabel), 6) },
      { label: translateNotificationKey('richReports.daily.health.sick'), value: listWithRemainder(sickness.map(healthRiderLabel), 6) },
      { label: translateNotificationKey('richReports.daily.health.notFullyFit'), value: listWithRemainder(notFullyFit.map(healthRiderLabel), 6) },
      { label: translateNotificationKey('richReports.daily.health.recovered'), value: listWithRemainder(recovered.map(healthRiderLabel), 6) },
      { label: translateNotificationKey('richReports.daily.health.current'), value: listWithRemainder(current.map(healthRiderLabel), 8) },
    ]
  }

  return []
}

function prestartDisqualificationExtraText(): string {
  return translateNotificationKey('richReports.race.extraPrestart')
}

function richRaceExtraText(item: NotificationItem): string | null {
  const code = codeOf(item)
  const payload = payloadOf(item)

  if (code === 'RACE_TEAM_DISQUALIFIED_JERSEYS') {
    return translateNotificationKey('richReports.race.extraRemoved')
  }
  if (code === 'RACE_APPLICATION_WINDOW_OPEN') {
    const count = readNumber(payload, 'opened_count') ?? 0
    return translateNotificationKey(count === 1 ? 'richReports.race.extraOpenOne' : 'richReports.race.extraOpenMany')
  }
  if (code === 'RACE_APPLICATION_CLOSING_SOON') return translateNotificationKey('richReports.race.extraClosing')
  if (code === 'RACE_APPLICATION_RULE_CHANGE') return translateNotificationKey('richReports.race.extraRule')
  return null
}

function richDailyExtraText(item: NotificationItem): string | null {
  const code = codeOf(item)
  if (code === 'RACE_APPLICATION_DAILY_UPDATE') return translateNotificationKey('richReports.daily.application.extra')
  if (code === 'RACE_PREPARATION_DAILY_REPORT') return translateNotificationKey('richReports.daily.preparation.extra')
  if (code === 'STAGE_PLANNING_DAILY_REPORT') return translateNotificationKey('richReports.daily.stage.extra')
  if (code === 'RIDER_HEALTH_DAILY_REPORT') return translateNotificationKey('richReports.daily.health.extra')
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

function richDailyAction(item: NotificationItem): { label: string; href: string } | null {
  const code = codeOf(item)

  if (code === 'RACE_APPLICATION_DAILY_UPDATE') {
    return { label: 'Open Calendar', href: '/dashboard/calendar' }
  }

  if (code === 'RACE_PREPARATION_DAILY_REPORT') {
    return {
      label: 'Open Race Preparation',
      href: '/dashboard/race-preparation?tab=acceptedRaces',
    }
  }

  if (code === 'STAGE_PLANNING_DAILY_REPORT') {
    return {
      label: 'Open Stage Plans',
      href: '/dashboard/race-preparation?tab=stagePlans',
    }
  }

  if (code === 'RIDER_HEALTH_DAILY_REPORT') {
    return { label: 'Open Squad', href: '/dashboard/squad' }
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

function singleNavigateAction(
  key: string,
  label: string,
  href: string
): NotificationActionTemplate[] {
  return [{
    key,
    label: localizeNotificationActionLabel(label),
    variant: 'primary',
    kind: 'navigate',
    getHref: () => href,
    show: () => true,
  }]
}

export function getNotificationImageSrc(item: NotificationItem): string | null {
  if (isPrestartDisqualificationPenalty(item)) return prestartDisqualificationImage(item)
  if (isRichDailyNotification(item)) return richDailyImage(item)
  if (isRichRaceNotification(item)) return richRaceImage(item)
  return getBaseNotificationImageSrc(item)
}

export function getNotificationIntroText(item: NotificationItem): string | null {
  if (isPrestartDisqualificationPenalty(item)) return prestartDisqualificationIntro(item)
  if (isRichDailyNotification(item)) return richDailyIntro(item)
  if (isRichRaceNotification(item)) return richRaceIntro(item)
  return getBaseNotificationIntroText(item)
}

export function getNotificationDetailRows(item: NotificationItem): NotificationDetailRow[] {
  if (isPrestartDisqualificationPenalty(item)) return prestartDisqualificationDetailRows(item)
  if (isRichDailyNotification(item)) return richDailyDetailRows(item)
  if (isRichRaceNotification(item)) return richRaceDetailRows(item)
  return getBaseNotificationDetailRows(item)
}

export function getNotificationExtraText(item: NotificationItem): string | null {
  if (isPrestartDisqualificationPenalty(item)) return prestartDisqualificationExtraText()
  if (isRichDailyNotification(item)) return richDailyExtraText(item)
  if (isRichRaceNotification(item)) return richRaceExtraText(item)
  return getBaseNotificationExtraText(item)
}

export function getNotificationActions(item: NotificationItem): NotificationActionTemplate[] {
  if (isPrestartDisqualificationPenalty(item)) return prestartDisqualificationActions(item)

  const daily = richDailyAction(item)
  if (daily) {
    return singleNavigateAction(
      `open-${codeOf(item).toLowerCase()}`,
      daily.label,
      daily.href
    )
  }

  const override = richRaceAction(item)
  if (!override) return getBaseNotificationActions(item)

  const baseActions = getBaseNotificationActions(item)
  if (baseActions.length === 0) {
    return singleNavigateAction(
      `open-${codeOf(item).toLowerCase()}`,
      override.label,
      override.href
    )
  }

  return baseActions.map(action => {
    if (action.kind !== 'navigate') return action

    return {
      ...action,
      label: localizeNotificationActionLabel(override.label),
      getHref: () => override.href,
      show: () => true,
    }
  })
}
