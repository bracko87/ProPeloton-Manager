import type { ReactNode } from 'react'
import { Link } from 'react-router'

import type { NotificationItem } from './notificationHelpers'
import type { NotificationDetailRow } from './notificationTemplatesBase'
import {
  getNotificationActions as getLegacyNotificationActions,
  getNotificationDetailRows as getLegacyNotificationDetailRows,
  getNotificationExtraText as getLegacyNotificationExtraText,
  getNotificationImageSrc as getLegacyNotificationImageSrc,
  getNotificationIntroText as getLegacyNotificationIntroText,
} from './notificationTemplatesLegacy'
import { translateNotificationKey } from './notificationLocalization'

export * from './notificationTemplatesBase'

function payloadOf(item: NotificationItem): Record<string, unknown> {
  const payload = item.payload_json
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {}
}

function codeOf(item: NotificationItem): string {
  return String(item.type_code ?? '').trim().toUpperCase()
}

function readNumber(source: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(source[key])
    if (Number.isFinite(value)) return value
  }
  return null
}

function readString(source: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readObjectArray(
  source: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown>[] {
  for (const key of keys) {
    const value = source[key]
    if (!Array.isArray(value)) continue
    return value.filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
    )
  }
  return []
}

function formatOrdinal(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return ''
  const integer = Math.trunc(value)
  const absolute = Math.abs(integer)
  const mod100 = absolute % 100
  if (mod100 >= 11 && mod100 <= 13) return `${integer}th`
  if (absolute % 10 === 1) return `${integer}st`
  if (absolute % 10 === 2) return `${integer}nd`
  if (absolute % 10 === 3) return `${integer}rd`
  return `${integer}th`
}

function formatElapsedSeconds(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null
  const seconds = Math.max(0, Math.round(value))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function formatGapSeconds(value: number): string {
  const seconds = Math.max(0, Math.round(value))
  if (seconds < 60) return `${seconds}s`

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
  }

  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function cleanRiderName(row: Record<string, unknown>): string {
  const direct = readString(
    row,
    'rider_name_raw',
    'rider_full_name',
    'full_name',
    'name'
  )
  if (direct) return direct

  const fallback = readString(row, 'rider_name') || 'Rider'
  return fallback.split(' — ')[0]?.trim() || fallback
}

function raceResultTiming(
  row: Record<string, unknown>,
  winnerElapsedSeconds: number | null
): string {
  const position = readNumber(row, 'position', 'rank', 'place')
  const elapsed = readNumber(row, 'elapsed_seconds')
  const timeLabel = readString(row, 'time_label') || formatElapsedSeconds(elapsed)

  if (position === 1) return timeLabel || 'winner'

  const payloadGap = readNumber(row, 'gap_seconds')
  const calculatedGap =
    payloadGap !== null
      ? payloadGap
      : elapsed !== null && winnerElapsedSeconds !== null
        ? Math.max(0, elapsed - winnerElapsedSeconds)
        : null

  if (calculatedGap === null) return timeLabel || '—'
  if (calculatedGap <= 0) return 'same time'
  return `+${formatGapSeconds(calculatedGap)}`
}

function formatRaceResultLine(
  row: Record<string, unknown>,
  winnerElapsedSeconds: number | null,
  includeTeam: boolean
): string {
  const position = formatOrdinal(readNumber(row, 'position', 'rank', 'place'))
  const rider = cleanRiderName(row)
  const timing = raceResultTiming(row, winnerElapsedSeconds)
  const team = includeTeam ? readString(row, 'team_name', 'club_name') : null
  const prefix = position ? `${position} ` : ''
  return `${prefix}${rider} — ${timing}${team ? ` (${team})` : ''}`
}

function stackedValue(values: ReactNode[]): string {
  const cleaned = values.filter(value => value !== null && value !== undefined && value !== '')

  if (cleaned.length === 0) {
    return translateNotificationKey('richReports.common.none')
  }

  return (
    <span className="mt-1 flex flex-col gap-1.5">
      {cleaned.map((value, index) => (
        <span key={index} className="block leading-5">
          {value}
        </span>
      ))}
    </span>
  ) as unknown as string
}

function raceResultsDetailRows(item: NotificationItem): NotificationDetailRow[] {
  const payload = payloadOf(item)
  const topThree = readObjectArray(payload, 'top_10').slice(0, 3)
  const yourRiders = readObjectArray(payload, 'your_riders')
  const winnerElapsedSeconds =
    topThree.length > 0 ? readNumber(topThree[0], 'elapsed_seconds') : null

  const legacyRows = getLegacyNotificationDetailRows(item)
  const expandedResultRows = topThree.length + yourRiders.length
  const staticCount = Math.max(0, legacyRows.length - expandedResultRows)
  const staticRows = legacyRows.slice(0, staticCount)
  const topLabel = legacyRows[staticCount]?.label || 'Top 3'
  const yourLabel =
    legacyRows[staticCount + topThree.length]?.label || 'Your rider results'

  return [
    ...staticRows,
    ...(topThree.length > 0
      ? [
          {
            label: topLabel,
            value: stackedValue(
              topThree.map(row =>
                formatRaceResultLine(row, winnerElapsedSeconds, true)
              )
            ),
          },
        ]
      : []),
    ...(yourRiders.length > 0
      ? [
          {
            label: yourLabel,
            value: stackedValue(
              yourRiders.map(row =>
                formatRaceResultLine(row, winnerElapsedSeconds, false)
              )
            ),
          },
        ]
      : []),
  ]
}

function formatShortGameDate(value: unknown): string | null {
  const text = String(value ?? '').trim()
  const match = text.match(/^\d{4}-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/)
  if (!match) return text || null
  const date = `${match[2]}.${match[1]}.`
  return match[3] && match[4] ? `${date} ${match[3]}:${match[4]}` : date
}

function raceDeadlineLabel(row: Record<string, unknown>): string {
  const name = String(
    row.race_name ?? row.name ?? translateNotificationKey('richReports.common.raceFallback')
  ).trim()
  const category = String(row.category ?? row.race_category ?? '').trim()
  const close = formatShortGameDate(row.applications_close)
  const extras = [category, close].filter(Boolean)
  return extras.length > 0 ? `${name} (${extras.join(' · ')})` : name
}

function raceLink(row: Record<string, unknown>): ReactNode {
  const raceId = String(row.race_id ?? row.id ?? '').trim()
  const label = raceDeadlineLabel(row)

  if (!raceId) return label

  return (
    <Link
      to={`/dashboard/races/${raceId}`}
      className="underline decoration-slate-400 underline-offset-2 hover:text-sky-700"
    >
      {label}
    </Link>
  )
}

function stageLabel(row: Record<string, unknown>): string {
  const race = String(
    row.race_name ?? translateNotificationKey('richReports.common.raceFallback')
  ).trim()
  const stageNumber = Number(row.stage_number)
  const stageName = String(row.stage_name ?? '').trim()
  const stage = Number.isFinite(stageNumber)
    ? `${translateNotificationKey('richReports.common.stageNumber', { number: stageNumber })}${
        stageName && !/^stage\s+\d+$/i.test(stageName) ? `: ${stageName}` : ''
      }`
    : stageName || translateNotificationKey('richReports.common.stage')
  const lockAt = formatShortGameDate(row.lock_at)
  return `${race} — ${stage}${
    lockAt
      ? ` (${translateNotificationKey('richReports.common.lockDate', { date: lockAt })})`
      : ''
  }`
}

function withRemainder(values: ReactNode[], total: number, max: number): ReactNode[] {
  if (total <= max) return values
  return [
    ...values,
    <span key="remainder" className="font-medium text-slate-500">
      + {total - max} more
    </span>,
  ]
}

function raceApplicationDetailRows(item: NotificationItem): NotificationDetailRow[] {
  const payload = payloadOf(item)
  const open = readNumber(payload, 'opened_or_open_count', 'open_count') ?? 0
  const closing = readNumber(payload, 'closing_soon_count') ?? 0
  const pending = readNumber(payload, 'pending_count') ?? 0
  const openRows = readObjectArray(payload, 'open_races')
  const closingRows = readObjectArray(payload, 'closing_soon_races')
  const pendingRows = readObjectArray(payload, 'pending_applications')

  const closingVisible = closingRows.slice(0, 8).map(raceLink)
  const openVisible = openRows.slice(0, 8).map(raceLink)
  const pendingVisible = pendingRows.slice(0, 6).map(raceLink)

  return [
    {
      label: translateNotificationKey('richReports.daily.application.open'),
      value: String(open),
    },
    {
      label: translateNotificationKey('richReports.daily.application.closing'),
      value:
        closing > 0
          ? stackedValue(withRemainder(closingVisible, closingRows.length, 8))
          : translateNotificationKey('richReports.common.none'),
    },
    {
      label: translateNotificationKey('richReports.daily.application.next'),
      value:
        openRows.length > 0
          ? stackedValue(withRemainder(openVisible, openRows.length, 8))
          : translateNotificationKey('richReports.common.none'),
    },
    {
      label: translateNotificationKey('richReports.daily.application.pending'),
      value:
        pending > 0 && pendingRows.length > 0
          ? stackedValue(withRemainder(pendingVisible, pendingRows.length, 6))
          : translateNotificationKey('richReports.common.none'),
    },
  ]
}

function stagePlanningDetailRows(item: NotificationItem): NotificationDetailRow[] {
  const payload = payloadOf(item)
  const stages = readObjectArray(payload, 'stages')
  const missing = stages.filter(row => String(row.report_state ?? '') === 'missing_at_lock')
  const soon = stages.filter(row => String(row.report_state ?? '') === 'lock_soon')
  const open = stages.filter(row => String(row.report_state ?? '') === 'open')
  const locked = stages.filter(row => String(row.report_state ?? '') === 'locked')

  const rowsFor = (rows: Record<string, unknown>[], max: number): string =>
    rows.length > 0
      ? stackedValue(
          withRemainder(rows.slice(0, max).map(stageLabel), rows.length, max)
        )
      : translateNotificationKey('richReports.common.none')

  return [
    {
      label: translateNotificationKey('richReports.daily.stage.missing'),
      value: rowsFor(missing, 5),
    },
    {
      label: translateNotificationKey('richReports.daily.stage.soon'),
      value: rowsFor(soon, 5),
    },
    {
      label: translateNotificationKey('richReports.daily.stage.open'),
      value: rowsFor(open, 6),
    },
    {
      label: translateNotificationKey('richReports.daily.stage.locked'),
      value: rowsFor(locked, 5),
    },
  ]
}

function readableDailyIntro(item: NotificationItem): string | null {
  const payload = payloadOf(item)
  const code = codeOf(item)

  if (code === 'RACE_APPLICATION_DAILY_UPDATE') {
    const open = readNumber(payload, 'opened_or_open_count', 'open_count') ?? 0
    const closing = readNumber(payload, 'closing_soon_count') ?? 0
    const pending = readNumber(payload, 'pending_count') ?? 0
    return translateNotificationKey('richReports.daily.application.intro', {
      open,
      closing,
      closingNames: '',
      pending,
    })
  }

  if (code === 'STAGE_PLANNING_DAILY_REPORT') {
    const missing = readNumber(payload, 'missing_at_lock_count') ?? 0
    const soon = readNumber(payload, 'lock_soon_count') ?? 0
    const open = readNumber(payload, 'open_count') ?? 0
    const locked = readNumber(payload, 'locked_count') ?? 0
    return translateNotificationKey('richReports.daily.stage.intro', {
      missing,
      soon,
      open,
      locked,
      priority: '',
    })
  }

  return null
}

export function getNotificationImageSrc(item: NotificationItem): string | null {
  return getLegacyNotificationImageSrc(item)
}

export function getNotificationIntroText(item: NotificationItem): string | null {
  return readableDailyIntro(item) ?? getLegacyNotificationIntroText(item)
}

export function getNotificationDetailRows(item: NotificationItem): NotificationDetailRow[] {
  const code = codeOf(item)

  if (code === 'RACE_RESULTS_SUMMARY') return raceResultsDetailRows(item)
  if (code === 'RACE_APPLICATION_DAILY_UPDATE') return raceApplicationDetailRows(item)
  if (code === 'STAGE_PLANNING_DAILY_REPORT') return stagePlanningDetailRows(item)

  return getLegacyNotificationDetailRows(item)
}

export function getNotificationExtraText(item: NotificationItem): string | null {
  return getLegacyNotificationExtraText(item)
}

export function getNotificationActions(item: NotificationItem) {
  return getLegacyNotificationActions(item)
}
