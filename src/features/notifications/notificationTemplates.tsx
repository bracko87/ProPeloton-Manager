/** 
 * src/features/notifications/notificationTemplates.tsx
 *
 * Purpose:
 * - Provide a richer registry of notification templates keyed by type_code.
 * - Allow the app to normalize / enrich raw NotificationItem objects
 *   with default titles/messages where the backend payload is sparse.
 * - Provide per-type configuration for:
 *   - intro text
 *   * - detail rows
 *   - extra text
 *   - image support
 *   - action buttons
 *
 * Notes:
 * - Backend-provided title/message still win.
 * - This file does not render UI; it provides normalized template metadata
 *   that the notification center can consume.
 */

import type { NotificationItem } from './notificationHelpers'

export type NotificationActionTemplate = {
  key: string
  label: string
  variant?: 'primary' | 'secondary'
  kind: 'navigate' | 'markRead'
  getHref?: (item: NotificationItem) => string | null
  show?: (item: NotificationItem) => boolean
}

export type NotificationDetailRow = {
  label: string
  value: string
}

export interface NotificationTemplate {
  defaultTitle?: string
  defaultMessage?: string
  enrich?: (item: NotificationItem) => NotificationItem

  imageSrc?: string
  getImageSrc?: (item: NotificationItem) => string | null

  getIntroText?: (item: NotificationItem) => string | null
  getDetailRows?: (item: NotificationItem) => NotificationDetailRow[]
  getExtraText?: (item: NotificationItem) => string | null

  actions?: NotificationActionTemplate[]
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readStringArray(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim()

      const record = asRecord(item)
      if (!record) return ''

      return (
        readString(record.display_name) ||
        readString(record.full_name) ||
        readString(record.rider_full_name) ||
        readString(record.rider_name) ||
        readString(record.staff_name) ||
        readString(record.employee_name) ||
        readString(record.person_name) ||
        readString(record.name) ||
        ''
      )
    })
    .filter(Boolean)
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return null
}

function getPayload(item: NotificationItem): Record<string, unknown> | null {
  return asRecord((item as NotificationItem & { payload_json?: unknown }).payload_json)
}

function pickFirstString(
  source: Record<string, unknown> | null,
  keys: string[]
): string | null {
  if (!source) return null

  for (const key of keys) {
    const value = readString(source[key])
    if (value) return value
  }

  return null
}

function pickStringArray(
  source: Record<string, unknown> | null,
  keys: string[]
): string[] {
  if (!source) return []

  for (const key of keys) {
    const values = readStringArray(source[key])
    if (values.length > 0) return values
  }

  return []
}

function pickFirstNumber(
  source: Record<string, unknown> | null,
  keys: string[]
): number | null {
  if (!source) return null

  for (const key of keys) {
    const value = readNumber(source[key])
    if (value !== null) return value
  }

  return null
}

function pickFirstBoolean(
  source: Record<string, unknown> | null,
  keys: string[]
): boolean | null {
  if (!source) return null

  for (const key of keys) {
    const value = readBoolean(source[key])
    if (value !== null) return value
  }

  return null
}

function getItemFieldString(item: NotificationItem, key: string): string | null {
  const value = (item as unknown as Record<string, unknown>)[key]
  return readString(value)
}

function getItemFieldNumber(item: NotificationItem, key: string): number | null {
  const value = (item as unknown as Record<string, unknown>)[key]
  return readNumber(value)
}

function getItemFieldBoolean(item: NotificationItem, key: string): boolean | null {
  const value = (item as unknown as Record<string, unknown>)[key]
  return readBoolean(value)
}

function formatCurrency(value: number | null): string | null {
  if (value === null) return null

  try {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return String(Math.round(value))
  }
}

function formatCurrencyLabel(
  value: number | null,
  prefix = ''
): string | null {
  const formatted = formatCurrency(value)
  return formatted ? `${prefix}${formatted}` : null
}

function formatCurrencyOrZero(value: number | null, prefix = '$'): string {
  return formatCurrencyLabel(value ?? 0, prefix) || `${prefix}0`
}

function formatDateLabel(value: string | null): string | null {
  if (!value) return null

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(parsed)
  } catch {
    return value
  }
}

function formatLabel(value: string | null): string | null {
  if (!value) return null

  const normalized = value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return null

  return normalized
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatCountryName(value?: string | null): string | null {
  if (!value) return null

  const trimmed = String(value).trim()
  if (!trimmed) return null

  if (/^[a-z]{2}$/i.test(trimmed)) {
    const code = trimmed.toUpperCase()

    try {
      const displayName = new Intl.DisplayNames(['en'], {
        type: 'region',
      }).of(code)

      return displayName || code
    } catch {
      return code
    }
  }

  return formatLabel(trimmed) || trimmed
}

function compactRows(
  rows: Array<NotificationDetailRow | null | undefined>
): NotificationDetailRow[] {
  return rows.filter((row): row is NotificationDetailRow => {
    return Boolean(row && row.label && row.value)
  })
}

function detailRow(
  label: string,
  value: string | null
): NotificationDetailRow | null {
  return value ? { label, value } : null
}

function joinPersonName(
  firstName: string | null,
  lastName: string | null
): string | null {
  const parts = [firstName, lastName].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}

function getPreferredRiderName(item: NotificationItem): string | null {
  const payload = getPayload(item)

  const firstName = pickFirstString(payload, [
    'rider_first_name',
    'rider_firstname',
    'first_name',
    'firstname',
    'given_name',
    'rider_given_name',
    'target_first_name',
  ])

  const lastName = pickFirstString(payload, [
    'rider_last_name',
    'rider_lastname',
    'last_name',
    'lastname',
    'family_name',
    'rider_family_name',
    'target_last_name',
  ])

  const fullName = pickFirstString(payload, [
    'rider_full_name',
    'rider_fullname',
    'full_name',
    'fullname',
    'display_name',
    'rider_display_name',
    'public_name',
    'rider_public_name',
    'target_rider_name',
    'target_rider_full_name',
    'transfer_target_name',
  ])

  return (
    joinPersonName(firstName, lastName) ||
    fullName ||
    pickFirstString(payload, ['rider_name', 'athlete_name', 'name']) ||
    null
  )
}

function scoutReportRiderName(item: NotificationItem): string | null {
  const payload = getPayload(item)

  return (
    getPreferredRiderName(item) ||
    pickFirstString(payload, [
      'rider_name',
      'scouted_rider_name',
      'target_rider_name',
      'report_rider_name',
      'name',
    ])
  )
}

function getPrimaryEntityName(item: NotificationItem): string | null {
  const payload = getPayload(item)

  return (
    getPreferredRiderName(item) ||
    pickFirstString(payload, [
      'staff_name',
      'sponsor_name',
      'facility_name',
      'asset_name',
      'club_name',
      'name',
      'entity_name',
      'subject_name',
    ]) ||
    getItemFieldString(item, 'title')
  )
}

function getActionHrefFromItem(item: NotificationItem): string | null {
  const payload = getPayload(item)

  return (
    getItemFieldString(item, 'action_url') ||
    getItemFieldString(item, 'href') ||
    pickFirstString(payload, [
      'action_url',
      'href',
      'url',
      'route',
      'path',
      'link',
      'deep_link',
      'navigation_url',
    ])
  )
}

function getImageSrcFromItem(item: NotificationItem): string | null {
  const payload = getPayload(item)

  return (
    getItemFieldString(item, 'image_url') ||
    getItemFieldString(item, 'image_src') ||
    pickFirstString(payload, [
      'image_url',
      'image_src',
      'image',
      'photo_url',
      'thumbnail_url',
      'avatar_url',
      'logo_url',
      'banner_url',
      'race_logo_url',
      'race_profile_image_url',
      'profile_image_url',
    ])
  )
}


function formatOrdinal(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null

  const integer = Math.trunc(value)
  const absolute = Math.abs(integer)
  const mod100 = absolute % 100

  if (mod100 >= 11 && mod100 <= 13) return `${integer}th`

  switch (absolute % 10) {
    case 1:
      return `${integer}st`
    case 2:
      return `${integer}nd`
    case 3:
      return `${integer}rd`
    default:
      return `${integer}th`
  }
}

type RaceResultEntry = {
  position: number | null
  riderName: string | null
  teamName: string | null
}

function getRaceResultEntries(
  payload: Record<string, unknown> | null,
  key: string
): RaceResultEntry[] {
  if (!payload) return []

  const raw = payload[key]
  if (!Array.isArray(raw)) return []

  return raw
    .map((entry): RaceResultEntry => {
      const record = asRecord(entry)

      if (!record) {
        return {
          position: null,
          riderName: null,
          teamName: null,
        }
      }

      return {
        position:
          readNumber(record.position) ??
          readNumber(record.rank) ??
          readNumber(record.place),
        riderName:
          readString(record.rider_name) ||
          readString(record.riderName) ||
          readString(record.rider_full_name) ||
          readString(record.full_name) ||
          readString(record.name),
        teamName:
          readString(record.team_name) ||
          readString(record.teamName) ||
          readString(record.club_name) ||
          readString(record.clubName),
      }
    })
    .filter((entry) => entry.position !== null || entry.riderName || entry.teamName)
}

function formatRaceResultEntry(
  entry: RaceResultEntry,
  includeTeam = false
): string | null {
  const positionLabel = formatOrdinal(entry.position)
  const riderLabel = entry.riderName
  const teamLabel = includeTeam ? entry.teamName : null

  if (positionLabel && riderLabel && teamLabel) {
    return `${positionLabel} ${riderLabel} (${teamLabel})`
  }

  if (positionLabel && riderLabel) {
    return `${positionLabel} ${riderLabel}`
  }

  if (riderLabel && teamLabel) {
    return `${riderLabel} (${teamLabel})`
  }

  return riderLabel || teamLabel || positionLabel
}

function normalizeRaceHref(href: string | null): string | null {
  if (!href) return null
  if (href.startsWith('/races/')) return `/dashboard${href}`
  return href
}

function getRacePageHref(item: NotificationItem): string | null {
  const payload = getPayload(item)

  const directHref = normalizeRaceHref(
    pickFirstString(payload, [
      'action_url',
      'race_url',
      'race_path',
      'race_profile_path',
      'race_detail_path',
      'calendar_race_path',
    ]) || getActionHrefFromItem(item)
  )

  if (directHref) return directHref

  const raceId = pickFirstString(payload, ['race_id'])
  return raceId ? `/dashboard/races/${raceId}` : null
}


function isUnread(item: NotificationItem): boolean {
  const status = getItemFieldString(item, 'status')
  const readAt = getItemFieldString(item, 'read_at')

  if (status) return status === 'unread'
  return !readAt
}

function buildIntroFromMessage(item: NotificationItem): string | null {
  return readString(item.message)
}

function withFallbackHref(
  label: string,
  fallbackHref: string
): NotificationActionTemplate {
  return {
    key: `navigate:${label}:${fallbackHref}`,
    label,
    variant: 'primary',
    kind: 'navigate',
    getHref: (item) => getActionHrefFromItem(item) || fallbackHref,
    show: (item) => Boolean(getActionHrefFromItem(item) || fallbackHref),
  }
}

const MARK_READ_ACTION: NotificationActionTemplate = {
  key: 'mark-read',
  label: 'Mark as read',
  variant: 'secondary',
  kind: 'markRead',
  show: (item) => isUnread(item),
}

const GENERIC_OPEN_ACTION: NotificationActionTemplate = {
  key: 'open',
  label: 'Open',
  variant: 'primary',
  kind: 'navigate',
  getHref: (item) => getActionHrefFromItem(item),
  show: (item) => Boolean(getActionHrefFromItem(item)),
}

/* -------------------------------------------------------------------------- */
/* Template-specific detail builders                                          */
/* -------------------------------------------------------------------------- */

function getSponsorSelectionRows(item: NotificationItem): NotificationDetailRow[] {
  const payload = getPayload(item)

  return compactRows([
    detailRow(
      'Offers available',
      pickFirstNumber(payload, ['offers_count', 'offer_count', 'count'])?.toString() || null
    ),
    detailRow(
      'Best annual value',
      formatCurrencyLabel(
        pickFirstNumber(payload, ['best_offer_amount', 'best_value', 'best_annual_value']),
        '$'
      )
    ),
    detailRow(
      'Decision deadline',
      formatDateLabel(
        pickFirstString(payload, ['expires_at', 'deadline_at', 'decision_deadline'])
      )
    ),
  ])
}

function getInfrastructureRows(item: NotificationItem): NotificationDetailRow[] {
  const payload = getPayload(item)

  return compactRows([
    detailRow(
      'Facility',
      pickFirstString(payload, ['facility_name', 'asset_name', 'name'])
    ),
    detailRow(
      'New level',
      pickFirstNumber(payload, ['new_level', 'level', 'upgraded_level'])?.toString() || null
    ),
    detailRow(
      'Completed on',
      formatDateLabel(
        pickFirstString(payload, ['completed_at', 'delivered_at', 'finished_at'])
      )
    ),
  ])
}

function getTransferOfferRows(item: NotificationItem): NotificationDetailRow[] {
  const payload = getPayload(item)

  return compactRows([
    detailRow('Rider', getPreferredRiderName(item)),
    detailRow(
      'From club',
      pickFirstString(payload, ['seller_club_name', 'from_club_name', 'club_name'])
    ),
    detailRow(
      'To club',
      pickFirstString(payload, ['buyer_club_name', 'to_club_name'])
    ),
    detailRow(
      'Offer value',
      formatCurrencyLabel(
        pickFirstNumber(payload, ['offered_price', 'offer_value', 'transfer_fee']),
        '$'
      )
    ),
    detailRow(
      'Expires',
      formatDateLabel(
        pickFirstString(payload, ['expires_at', 'offer_expires_at', 'deadline_at'])
      )
    ),
  ])
}

function getNegotiationRows(item: NotificationItem): NotificationDetailRow[] {
  const payload = getPayload(item)

  return compactRows([
    detailRow('Rider', getPreferredRiderName(item)),
    detailRow(
      'Club',
      pickFirstString(payload, ['buyer_club_name', 'club_name', 'team_name'])
    ),
    detailRow(
      'Weekly salary',
      formatCurrencyLabel(
        pickFirstNumber(payload, ['offer_salary_weekly', 'salary_weekly', 'weekly_salary']),
        '$'
      )
    ),
    detailRow(
      'Duration',
      (() => {
        const value = pickFirstNumber(payload, [
          'offer_duration_seasons',
          'duration_seasons',
          'contract_years',
        ])
        return value !== null ? `${value} season${value === 1 ? '' : 's'}` : null
      })()
    ),
    detailRow(
      'Expires',
      formatDateLabel(
        pickFirstString(payload, ['expires_at', 'negotiation_expires_at', 'deadline_at'])
      )
    ),
  ])
}

function getFreeAgentRows(item: NotificationItem): NotificationDetailRow[] {
  const payload = getPayload(item)

  return compactRows([
    detailRow('Rider', getPreferredRiderName(item)),
    detailRow(
      'Weekly salary',
      formatCurrencyLabel(
        pickFirstNumber(payload, ['salary_weekly', 'offer_salary_weekly', 'weekly_salary']),
        '$'
      )
    ),
    detailRow(
      'Contract',
      (() => {
        const value = pickFirstNumber(payload, [
          'duration_seasons',
          'offer_duration_seasons',
          'contract_years',
        ])
        return value !== null ? `${value} season${value === 1 ? '' : 's'}` : null
      })()
    ),
    detailRow(
      'Signed for',
      pickFirstString(payload, ['club_name', 'buyer_club_name', 'team_name'])
    ),
  ])
}

function getRiderProfileHref(item: NotificationItem): string | null {
  const payload = getPayload(item)

  const directPath = pickFirstString(payload, [
    'my_rider_profile_path',
    'my_rider_path',
    'rider_profile_path',
    'rider_profile_url',
    'external_rider_profile_path',
    'external_rider_path',
    'public_rider_profile_path',
  ])

  const genericRiderFallbackPaths = new Set([
    '/dashboard',
    '/dashboard/overview',
    '/dashboard/squad',
    '/dashboard/notifications',
    '#',
  ])

  if (directPath && !genericRiderFallbackPaths.has(directPath)) return directPath

  const riderId = pickFirstString(payload, ['rider_id'])
  if (!riderId) return null

  const typeCode = item.type_code || ''
  const category = pickFirstString(payload, ['category'])

  const shouldUseOwnRiderProfile =
    category === 'rider_status' ||
    [
      'RIDER_SICK',
      'RIDER_NOT_FULLY_FIT',
      'RIDER_INJURED',
      'RIDER_FIT_AGAIN',
      'FREE_AGENT_SIGNED',
      'TRANSFER_COMPLETED',
      'RETIREMENT_ANNOUNCED',
      'RIDER_CONTRACT_EXPIRING',
      'RIDER_WANTS_MORE_RACE_SELECTION',
      'RIDER_REQUESTS_RELEASE',
    ].includes(typeCode)

  return shouldUseOwnRiderProfile
    ? `/dashboard/my-riders/${riderId}`
    : `/dashboard/external-riders/${riderId}`
}

function getTeamSquadHref(item: NotificationItem): string {
  const payload = getPayload(item)

  return (
    pickFirstString(payload, ['team_squad_path', 'squad_path']) ||
    '/dashboard/squad'
  )
}

function getStaffProfileHref(item: NotificationItem): string | null {
  const payload = getPayload(item)

  const directPath = pickFirstString(payload, [
    'staff_profile_path',
    'staff_path',
  ])

  if (directPath) return directPath

  const staffId = pickFirstString(payload, ['staff_id', 'club_staff_id'])
  return staffId ? `/dashboard/staff?staffId=${staffId}` : null
}

function formatContractSeasonLabel(value: string | null): string | null {
  if (!value) return null

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  const seasonNumber = parsed.getUTCFullYear() - 1999
  const day = String(parsed.getUTCDate()).padStart(2, '0')

  let month = ''
  try {
    month = new Intl.DateTimeFormat('en-GB', {
      month: 'short',
      timeZone: 'UTC',
    }).format(parsed)
  } catch {
    month = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  }

  if (seasonNumber > 0) {
    return `Season ${seasonNumber} - ${day} ${month}`
  }

  return `${day} ${month}`
}

function formatGameDateTimeLabel(
  dateValue: string | null,
  timeLabel?: string | null
): string | null {
  const dateLabel = formatContractSeasonLabel(dateValue)

  if (dateLabel && timeLabel) {
    return `${dateLabel} · ${timeLabel}`
  }

  return dateLabel || timeLabel || null
}

function getTransferCompletedIntro(item: NotificationItem): string | null {
  const payload = getPayload(item)

  const riderName = getPreferredRiderName(item)
  const buyerClubName = pickFirstString(payload, ['buyer_club_name', 'club_name', 'to_club_name'])
  const sellerClubName = pickFirstString(payload, ['seller_club_name', 'from_club_name'])

  if (riderName && buyerClubName && sellerClubName) {
    return `${riderName} has joined ${buyerClubName} from ${sellerClubName}.`
  }

  if (riderName && buyerClubName) {
    return `${riderName} has joined ${buyerClubName}.`
  }

  return 'A rider transfer has been completed successfully.'
}

function getTransferCompletedRows(item: NotificationItem): NotificationDetailRow[] {
  const payload = getPayload(item)

  const buyerClubName = pickFirstString(payload, [
    'buyer_club_name',
    'to_club_name',
    'club_name',
  ])

  const sellerClubName = pickFirstString(payload, [
    'seller_club_name',
    'from_club_name',
  ])

  const transferFee = pickFirstNumber(payload, [
    'transfer_fee',
    'fee_received',
    'fee_paid',
    'offered_price',
    'offer_value',
  ])

  const weeklySalary = pickFirstNumber(payload, [
    'salary_weekly',
    'offer_salary_weekly',
    'weekly_salary',
  ])

  const signingBonus = pickFirstNumber(payload, [
    'signing_bonus',
    'signing_bonus_paid',
    'offered_signing_bonus',
    'signing_bonus_amount',
    'signing_bonus_total',
    'bonus_amount',
    'bonus',
  ])

  const agentFee = pickFirstNumber(payload, [
    'agent_fee',
    'agent_fee_paid',
    'offered_agent_fee',
    'agent_fee_amount',
    'agency_fee',
    'agent_commission',
  ])

  const durationSeasons = pickFirstNumber(payload, [
    'duration_seasons',
    'offer_duration_seasons',
    'contract_years',
  ])

  return compactRows([
    detailRow('New club', buyerClubName),
    detailRow('Previous club', sellerClubName),
    detailRow('Transfer fee', formatCurrencyLabel(transferFee, '$')),
    detailRow(
      'Weekly salary',
      weeklySalary !== null ? `${formatCurrencyLabel(weeklySalary, '$')}/week` : null
    ),
    detailRow('Signing bonus', formatCurrencyOrZero(signingBonus, '$')),
    detailRow('Agent fee', formatCurrencyOrZero(agentFee, '$')),
    detailRow(
      'Contract',
      durationSeasons !== null
        ? `${durationSeasons} season${durationSeasons === 1 ? '' : 's'}`
        : null
    ),
  ])
}

function pickNestedNumber(
  source: Record<string, unknown> | null,
  paths: string[][]
): number | null {
  if (!source) return null

  for (const path of paths) {
    let current: unknown = source

    for (const key of path) {
      if (
        current === null ||
        typeof current !== 'object' ||
        Array.isArray(current)
      ) {
        current = null
        break
      }

      current = (current as Record<string, unknown>)[key]
    }

    const value = readNumber(current)
    if (value !== null) return value
  }

  return null
}

function getNegotiationTransferFee(item: NotificationItem): number | null {
  const payload = getPayload(item)

  return (
    pickFirstNumber(payload, [
      'offer_value',
      'accepted_offer_value',
      'accepted_price',
      'offered_price',
      'transfer_fee',
      'agreed_transfer_fee',
      'agreed_fee',
      'fee_paid',
      'transfer_price',
      'agreed_price',
      'price',
      'listing_price',
    ]) ??
    pickNestedNumber(payload, [
      ['offer', 'offer_value'],
      ['offer', 'offered_price'],
      ['offer', 'price'],
      ['accepted_offer', 'offer_value'],
      ['accepted_offer', 'offered_price'],
      ['accepted_offer', 'price'],
      ['transfer_offer', 'offer_value'],
      ['transfer_offer', 'offered_price'],
      ['transfer_offer', 'price'],
      ['negotiation', 'offer_value'],
      ['negotiation', 'offered_price'],
      ['transfer', 'offer_value'],
      ['transfer', 'price'],
    ]) ??
    getItemFieldNumber(item, 'offer_value') ??
    getItemFieldNumber(item, 'offered_price') ??
    getItemFieldNumber(item, 'transfer_fee') ??
    null
  )
}

/* -------------------------------------------------------------------------- */
/* Head Coach / Staff Advisory                                                */
/* -------------------------------------------------------------------------- */

const HEAD_COACH_ADVISORY_IMAGE =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Head%20Coach%20Advisory.png'

function getHeadCoachSnapshot(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  return payload ? asRecord(payload.snapshot) : null
}

function getHeadCoachAttentionRiders(
  payload: Record<string, unknown> | null
): Array<Record<string, unknown>> {
  if (!payload || !Array.isArray(payload.attention_riders)) return []

  return payload.attention_riders
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
}

function getHeadCoachRecommendations(payload: Record<string, unknown> | null): string[] {
  if (!payload || !Array.isArray(payload.recommendations)) return []

  return payload.recommendations
    .map((value) => readString(value))
    .filter((value): value is string => Boolean(value))
}

function getHeadCoachVariant(payload: Record<string, unknown> | null): string {
  return (
    pickFirstString(payload, ['report_variant', 'event_variant', 'variant']) ||
    'training_readiness'
  )
}

const HEAD_COACH_TRAINING_READINESS_ADVISORY_TEMPLATE: NotificationTemplate = {
  defaultTitle: 'Head Coach Advisory — Training & Readiness',
  defaultMessage:
    'Your Head Coach has prepared a new advisory update using the current squad and training data.',

  imageSrc: HEAD_COACH_ADVISORY_IMAGE,

  // All paid Head Coach advisory variants use the same dedicated image.
  getImageSrc: () => HEAD_COACH_ADVISORY_IMAGE,

  enrich: (item) => {
    const payload = getPayload(item) ?? {}

    return {
      ...item,
      title:
        item.title ||
        pickFirstString(payload, ['title', 'report_title', 'advisory_title']) ||
        'Head Coach Advisory — Training & Readiness',
      message:
        item.message ||
        pickFirstString(payload, ['summary', 'report_summary', 'advisory_summary']) ||
        'Your Head Coach has prepared a new advisory update using the current squad and training data.',
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    return (
      pickFirstString(payload, [
        'summary',
        'advisory_summary',
        'report_summary',
        'briefing_summary',
        'intro_text',
      ]) ||
      readString(item.message) ||
      'Your Head Coach has reviewed the current squad and training situation.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)
    const snapshot = getHeadCoachSnapshot(payload)

    const advisorName =
      pickFirstString(payload, [
        'advisor_staff_name',
        'advisor_name',
        'head_coach_name',
        'coach_name',
        'staff_name',
        'staff_full_name',
        'full_name',
        'display_name',
      ]) ||
      pickFirstString(asRecord(payload?.staff), ['name', 'staff_name'])

    const variant = getHeadCoachVariant(payload)

    const skillRiderName = pickFirstString(payload, [
      'rider_name',
      'rider_display_name',
    ])
    const skillLabel = pickFirstString(payload, ['skill_label', 'skill_name'])
    const skillOldValue = pickFirstNumber(payload, ['old_value', 'previous_value'])
    const skillNewValue = pickFirstNumber(payload, ['new_value', 'current_value'])
    const skillDelta = pickFirstNumber(payload, ['delta', 'skill_delta'])

    const attentionRiders = getHeadCoachAttentionRiders(payload)
    const attentionNames = attentionRiders
      .map((rider) =>
        readString(rider.name) ||
        readString(rider.rider_name) ||
        readString(rider.display_name)
      )
      .filter((name): name is string => Boolean(name))

    const currentGameDate =
      pickFirstString(snapshot, ['current_game_date', 'game_date']) ||
      pickFirstString(payload, [
        'current_game_date',
        'report_game_date',
        'advisory_game_date',
        'game_date',
      ])

    const squadRiders = pickFirstNumber(snapshot, ['squad_riders', 'total_riders'])
    const highFatigue = pickFirstNumber(snapshot, ['high_fatigue', 'high_fatigue_riders'])
    const elevatedFatigue = pickFirstNumber(snapshot, ['elevated_fatigue', 'elevated_fatigue_riders'])
    const notFullyFit = pickFirstNumber(snapshot, ['not_fully_fit', 'not_fully_fit_riders'])
    const unavailable = pickFirstNumber(snapshot, ['unavailable', 'unavailable_riders', 'affected_riders'])
    const plannedSessions = pickFirstNumber(snapshot, [
      'planned_training_sessions_next_3_game_days',
      'planned_sessions_next_3_game_days',
      'planned_sessions',
    ])
    const manualOverrides = pickFirstNumber(snapshot, [
      'manual_training_overrides_next_3_game_days',
      'manual_overrides_next_3_game_days',
      'manual_overrides',
    ])
    const highestFatigue = pickFirstNumber(snapshot, ['highest_fatigue'])
    const windowStart = pickFirstString(snapshot, ['window_start'])
    const windowEnd = pickFirstString(snapshot, ['window_end'])

    return compactRows([
      detailRow('Advisor', advisorName),
      detailRow('Role', 'Head Coach'),
      detailRow('Advisory', formatLabel(variant)),
      detailRow('Rider', skillRiderName),
      detailRow('Skill', skillLabel ? formatLabel(skillLabel) : null),
      detailRow(
        'Previous value',
        skillOldValue !== null ? `${skillOldValue}` : null
      ),
      detailRow(
        'New value',
        skillNewValue !== null ? `${skillNewValue}` : null
      ),
      detailRow(
        'Change',
        skillDelta !== null
          ? `${skillDelta > 0 ? '+' : ''}${skillDelta}`
          : null
      ),
      detailRow('Squad riders', squadRiders !== null ? `${squadRiders}` : null),
      detailRow('High fatigue', highFatigue !== null ? `${highFatigue}` : null),
      detailRow('Elevated fatigue', elevatedFatigue !== null ? `${elevatedFatigue}` : null),
      detailRow('Not fully fit', notFullyFit !== null ? `${notFullyFit}` : null),
      detailRow('Affected / unavailable', unavailable !== null ? `${unavailable}` : null),
      detailRow('Highest fatigue', highestFatigue !== null ? `${highestFatigue}` : null),
      detailRow(
        'Planned sessions · next 3 game days',
        plannedSessions !== null ? `${plannedSessions}` : null
      ),
      detailRow(
        'Manual overrides · next 3 game days',
        manualOverrides !== null ? `${manualOverrides}` : null
      ),
      detailRow(
        'Riders needing attention',
        attentionNames.length > 0 ? attentionNames.join(', ') : null
      ),
      detailRow(
        'Training window',
        windowStart && windowEnd ? `${windowStart} – ${windowEnd}` : null
      ),
      detailRow(
        'Game date',
        currentGameDate ? formatContractSeasonLabel(currentGameDate) : null
      ),
    ])
  },

  getExtraText: (item) => {
    const payload = getPayload(item)
    const recommendations = getHeadCoachRecommendations(payload)
    const attentionRiders = getHeadCoachAttentionRiders(payload)

    const variant = getHeadCoachVariant(payload)
    const riderName = pickFirstString(payload, ['rider_name', 'rider_display_name'])
    const skillLabel = pickFirstString(payload, ['skill_label', 'skill_name'])
    const oldValue = pickFirstNumber(payload, ['old_value', 'previous_value'])
    const newValue = pickFirstNumber(payload, ['new_value', 'current_value'])
    const delta = pickFirstNumber(payload, ['delta', 'skill_delta'])

    if (
      variant === 'rider_skill_change' &&
      riderName &&
      skillLabel &&
      oldValue !== null &&
      newValue !== null
    ) {
      const direction = delta !== null && delta < 0 ? 'decreased' : 'increased'
      return `${riderName}'s ${formatLabel(skillLabel) || skillLabel} has ${direction} from ${oldValue} to ${newValue}${delta !== null ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}. Open the rider profile or Training page to review current development.`
    }

    const riderDetails = attentionRiders
      .slice(0, 5)
      .map((rider) => {
        const name = readString(rider.name) || readString(rider.rider_name) || 'Rider'
        const fatigue = readNumber(rider.fatigue)
        const availability = formatLabel(readString(rider.availability))
        const reason = readString(rider.flag_reason)

        const details = [
          fatigue !== null ? `fatigue ${fatigue}` : null,
          availability,
          reason,
        ].filter(Boolean)

        return details.length > 0 ? `${name}: ${details.join(' · ')}` : name
      })

    const parts: string[] = []

    if (riderDetails.length > 0) {
      parts.push(`Riders: ${riderDetails.join('; ')}.`)
    }

    if (recommendations.length > 0) {
      parts.push(`Head Coach recommendation: ${recommendations.join(' ')}`)
    }

    return (
      parts.join(' ') ||
      'Review the current squad and training situation before changing workload or race preparation.'
    )
  },

  actions: [
    {
      key: 'open-staff-briefing-centre',
      label: 'Staff Briefing Centre',
      variant: 'primary',
      kind: 'navigate',
      getHref: () => '/dashboard/overview',
      show: () => true,
    },
    {
      key: 'open-training-page',
      label: 'Training page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/training',
      show: () => true,
    },
    {
      key: 'open-team-squad',
      label: 'Team squad',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/squad',
      show: () => true,
    },
    {
      key: 'open-staff-page',
      label: 'Staff page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/staff',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
}

function isHeadCoachTrainingReadinessAdvisoryType(
  typeCode: string | null | undefined
): boolean {
  if (!typeCode) return false

  const normalized = typeCode.toUpperCase()

  return (
    normalized === 'HEAD_COACH_ADVISORY' ||
    normalized === 'HEAD_COACH_ADVISORY_READY' ||
    normalized === 'HEAD_COACH_TRAINING_READINESS_ADVISORY' ||
    normalized === 'STAFF_ADVISORY_READY' ||
    normalized === 'STAFF_ADVISORY_REPORT_READY' ||
    normalized === 'TRAINING_READINESS_ADVISORY' ||
    normalized === 'TRAINING_AND_READINESS_ADVISORY' ||
    ((normalized.includes('HEAD_COACH') || normalized.includes('STAFF')) &&
      normalized.includes('ADVISOR')) ||
    ((normalized.includes('HEAD_COACH') || normalized.includes('STAFF')) &&
      normalized.includes('ADVISORY')) ||
    (normalized.includes('TRAINING') &&
      normalized.includes('READINESS') &&
      (normalized.includes('ADVISOR') || normalized.includes('ADVISORY')))
  )
}


const SPORT_DIRECTOR_ADVISORY_IMAGE =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Sport%20Director%20Advisory.png'

function getSportDirectorData(
  payload: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!payload) return null
  return asRecord(payload.data) || asRecord(payload.snapshot) || null
}

function getSportDirectorRecommendations(
  payload: Record<string, unknown> | null
): string[] {
  if (!payload || !Array.isArray(payload.recommendations)) return []

  return payload.recommendations
    .map((value) => readString(value))
    .filter((value): value is string => Boolean(value))
}

function getSportDirectorVariant(payload: Record<string, unknown> | null): string {
  return (
    pickFirstString(payload, ['report_variant', 'event_variant', 'variant']) ||
    'race_programme'
  )
}

const SPORT_DIRECTOR_ADVISORY_TEMPLATE: NotificationTemplate = {
  defaultTitle: 'Sports Director Advisory — Race Programme',
  defaultMessage:
    'Your Sports Director has prepared a new race-programme advisory.',

  imageSrc: SPORT_DIRECTOR_ADVISORY_IMAGE,

  // All Sports Director advisory variants use the same dedicated image.
  getImageSrc: () => SPORT_DIRECTOR_ADVISORY_IMAGE,

  enrich: (item) => {
    const payload = getPayload(item) ?? {}

    return {
      ...item,
      title:
        item.title ||
        pickFirstString(payload, ['title', 'report_title', 'advisory_title']) ||
        'Sports Director Advisory — Race Programme',
      message:
        item.message ||
        pickFirstString(payload, ['summary', 'report_summary', 'advisory_summary']) ||
        'Your Sports Director has prepared a new race-programme advisory.',
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    return (
      pickFirstString(payload, [
        'summary',
        'advisory_summary',
        'report_summary',
        'briefing_summary',
        'intro_text',
      ]) ||
      readString(item.message) ||
      'Your Sports Director has reviewed the current race programme and preparation situation.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)
    const data = getSportDirectorData(payload)

    const advisorName =
      pickFirstString(payload, [
        'advisor_staff_name',
        'advisor_name',
        'sports_director_name',
        'sport_director_name',
        'staff_name',
        'staff_full_name',
        'full_name',
        'display_name',
      ]) ||
      pickFirstString(asRecord(payload?.staff), ['name', 'staff_name'])

    const variant = getSportDirectorVariant(payload)

    const nextRaceName = pickFirstString(data, ['next_race_name'])
    const nextRaceDate = pickFirstString(data, ['next_race_start_date'])
    const acceptedRaces = pickFirstNumber(data, ['accepted_races_next_30_game_days'])
    const prepStatus = pickFirstString(data, ['race_preparation_status'])
    const startlistStatus = pickFirstString(data, ['startlist_status'])
    const deadline = pickFirstString(data, ['rider_submission_deadline_on'])
    const missingStagePlans = pickFirstNumber(data, ['missing_stage_plans'])
    const problemStagePlans = pickFirstNumber(data, ['problem_stage_plans'])
    const readinessStatus = pickFirstString(data, ['readiness_status'])
    const currentGameDate = pickFirstString(data, ['current_game_date'])
    const programmeStatus = pickFirstString(data, ['programme_status'])
    const activeRaceName = pickFirstString(data, ['active_race_name'])
    const nextFutureRaceName = pickFirstString(data, ['next_future_race_name'])
    const nextFutureRaceStart = pickFirstString(data, ['next_future_race_start_date'])
    const programmeGapDays = pickFirstNumber(data, ['programme_gap_days'])
    const futureAcceptedRaces = pickFirstNumber(data, [
      'future_accepted_races_next_30_game_days',
    ])
    const actionableMissing = pickFirstNumber(data, [
      'actionable_missing_stage_plans',
    ])
    const actionableProblem = pickFirstNumber(data, [
      'actionable_problem_stage_plans',
    ])
    const priorityCount = pickFirstNumber(data, ['management_priority_count'])

    return compactRows([
      detailRow('Advisor', advisorName),
      detailRow('Role', 'Sports Director'),
      detailRow('Advisory', formatLabel(variant)),
      detailRow('Current race', activeRaceName),
      detailRow('Next race', nextRaceName),
      detailRow('Next accepted future race', nextFutureRaceName),
      detailRow(
        'Next future race date',
        nextFutureRaceStart ? formatContractSeasonLabel(nextFutureRaceStart) : null
      ),
      detailRow(
        'Programme status',
        programmeStatus ? formatLabel(programmeStatus) : null
      ),
      detailRow(
        'Programme gap',
        programmeGapDays !== null ? `${programmeGapDays} game days` : null
      ),
      detailRow(
        'Future accepted races · next 30 game days',
        futureAcceptedRaces !== null ? `${futureAcceptedRaces}` : null
      ),
      detailRow(
        'Management priorities',
        priorityCount !== null ? `${priorityCount}` : null
      ),
      detailRow(
        'Race date',
        nextRaceDate ? formatContractSeasonLabel(nextRaceDate) : null
      ),
      detailRow(
        'Accepted races · next 30 game days',
        acceptedRaces !== null ? `${acceptedRaces}` : null
      ),
      detailRow(
        'Preparation status',
        prepStatus ? formatLabel(prepStatus) : null
      ),
      detailRow(
        'Startlist status',
        startlistStatus ? formatLabel(startlistStatus) : null
      ),
      detailRow(
        'Submission deadline',
        deadline ? formatContractSeasonLabel(deadline) : null
      ),
      detailRow(
        'Missing stage plans',
        missingStagePlans !== null ? `${missingStagePlans}` : null
      ),
      detailRow(
        'Actionable missing plans',
        actionableMissing !== null ? `${actionableMissing}` : null
      ),
      detailRow(
        'Problem stage plans',
        problemStagePlans !== null ? `${problemStagePlans}` : null
      ),
      detailRow(
        'Actionable incomplete plans',
        actionableProblem !== null ? `${actionableProblem}` : null
      ),
      detailRow(
        'Readiness',
        readinessStatus ? formatLabel(readinessStatus) : null
      ),
      detailRow(
        'Game date',
        currentGameDate ? formatContractSeasonLabel(currentGameDate) : null
      ),
    ])
  },

  getExtraText: (item) => {
    const payload = getPayload(item)
    const recommendations = getSportDirectorRecommendations(payload)

    if (recommendations.length > 0) {
      return `Sports Director recommendation: ${recommendations.join(' ')}`
    }

    return 'Review the current race programme, preparation package, startlist and stage-plan status.'
  },

  actions: [
    {
      key: 'open-staff-briefing-centre',
      label: 'Staff Briefing Centre',
      variant: 'primary',
      kind: 'navigate',
      getHref: () => '/dashboard/overview',
      show: () => true,
    },
    {
      key: 'open-race-preparation-page',
      label: 'Race Preparation',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/race-preparation',
      show: () => true,
    },
    {
      key: 'open-races-page',
      label: 'Races',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/races',
      show: () => true,
    },
    {
      key: 'open-staff-page',
      label: 'Staff page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/staff',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
}

function isSportDirectorAdvisoryType(
  typeCode: string | null | undefined
): boolean {
  if (!typeCode) return false
  const normalized = typeCode.toUpperCase()

  return (
    normalized === 'ADVISOR_SPORT_DIRECTOR_REPORT' ||
    normalized === 'SPORT_DIRECTOR_ADVISORY' ||
    normalized === 'SPORTS_DIRECTOR_ADVISORY' ||
    normalized === 'SPORT_DIRECTOR_REPORT' ||
    (normalized.includes('SPORT') &&
      normalized.includes('DIRECTOR') &&
      (normalized.includes('ADVISORY') || normalized.includes('ADVISOR')))
  )
}


/* -------------------------------------------------------------------------- */
/* Template Registry                                                          */
/* -------------------------------------------------------------------------- */

export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {

  RACE_PLAN_NEEDS_ATTENTION: {
    defaultTitle: 'Race plan needs attention',

    getImageSrc: (item) => {
      const payload = getPayload(item)
      const eventType = pickFirstString(payload, ['event_type'])

      if (eventType === 'missed_startlist') {
        return 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Startlist%20missed.png'
      }

      return getImageSrcFromItem(item)
    },

    getIntroText: (item) => {
      const payload = getPayload(item) ?? {}
      const eventType = pickFirstString(payload, ['event_type'])

      if (eventType !== 'missed_startlist') {
        return item.message || null
      }

      const raceName =
        pickFirstString(payload, ['race_name']) || 'the affected race'
      const teamName =
        pickFirstString(payload, ['team_name', 'club_name']) || 'Your team'
      const scoreDelta = pickFirstNumber(payload, ['score_delta'])
      const cashPenalty = pickFirstNumber(payload, ['cash_penalty'])
      const deadline = formatContractSeasonLabel(
        pickFirstString(payload, ['rider_deadline'])
      )

      const penaltyText = [
        scoreDelta !== null
          ? `Commitment score ${scoreDelta >= 0 ? '+' : ''}${scoreDelta}`
          : null,
        cashPenalty !== null
          ? `cash fine $${Math.round(cashPenalty).toLocaleString('en-US')}`
          : null,
      ]
        .filter(Boolean)
        .join(' and ')

      return `${teamName} missed the rider submission deadline${
        deadline ? ` (${deadline})` : ''
      } for ${raceName}. No valid Race Plan was submitted in time${
        penaltyText ? `; ${penaltyText} were applied` : ''
      }. Review the missed preparation and the affected race before the next planning deadline.`
    },

    getDetailRows: (item) => {
      const payload = getPayload(item) ?? {}
      const eventType = pickFirstString(payload, ['event_type'])

      if (eventType !== 'missed_startlist') return []

      const scoreBefore = pickFirstNumber(payload, ['score_before'])
      const scoreDelta = pickFirstNumber(payload, ['score_delta'])
      const scoreAfter = pickFirstNumber(payload, ['score_after'])
      const cashPenalty = pickFirstNumber(payload, ['cash_penalty'])
      const riderDeadline = formatContractSeasonLabel(
        pickFirstString(payload, ['rider_deadline'])
      )

      return compactRows([
        detailRow(
          'Team',
          pickFirstString(payload, ['team_name', 'club_name'])
        ),
        detailRow('Race', pickFirstString(payload, ['race_name'])),
        detailRow('Race class', pickFirstString(payload, ['race_class_code'])),
        detailRow('Rider deadline', riderDeadline),
        detailRow('Status', 'Startlist missed'),
        detailRow(
          'Commitment before',
          scoreBefore !== null ? String(scoreBefore) : null
        ),
        detailRow(
          'Commitment penalty',
          scoreDelta !== null
            ? `${scoreDelta >= 0 ? '+' : ''}${scoreDelta}`
            : null
        ),
        detailRow(
          'Commitment after',
          scoreAfter !== null ? String(scoreAfter) : null
        ),
        detailRow(
          'Cash fine',
          cashPenalty !== null
            ? `$${Math.round(cashPenalty).toLocaleString('en-US')}`
            : null
        ),
        detailRow('Submission', 'No valid Race Plan submitted'),
      ])
    },

    getExtraText: (item) => {
      const payload = getPayload(item) ?? {}
      const eventType = pickFirstString(payload, ['event_type'])

      if (eventType !== 'missed_startlist') return null

      return 'The deadline has already passed and the recorded penalties have been applied. Open Race Preparation to review the missed submission, then open the Race Page to inspect the affected event. Check your other accepted races as well so another rider deadline is not missed.'
    },

    actions: [
      {
        key: 'open-missed-race-preparation',
        label: 'Race Preparation',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)
          if (pickFirstString(payload, ['event_type']) !== 'missed_startlist') {
            return null
          }

          return (
            pickFirstString(payload, ['race_preparation_path']) ||
            (() => {
              const raceId = pickFirstString(payload, ['race_id'])
              return raceId
                ? `/dashboard/race-preparation?tab=acceptedRaces&raceId=${raceId}`
                : '/dashboard/race-preparation'
            })()
          )
        },
        show: (item) => {
          const payload = getPayload(item)
          return pickFirstString(payload, ['event_type']) === 'missed_startlist'
        },
      },
      {
        key: 'open-missed-race-page',
        label: 'Race Page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)
          if (pickFirstString(payload, ['event_type']) !== 'missed_startlist') {
            return null
          }

          const direct = pickFirstString(payload, [
            'race_path',
            'race_page_path',
            'race_detail_path',
          ])
          if (direct) return direct

          const raceId = pickFirstString(payload, ['race_id'])
          return raceId ? `/dashboard/races/${raceId}` : null
        },
        show: (item) => {
          const payload = getPayload(item)
          return (
            pickFirstString(payload, ['event_type']) === 'missed_startlist' &&
            Boolean(
              pickFirstString(payload, [
                'race_path',
                'race_page_path',
                'race_detail_path',
                'race_id',
              ])
            )
          )
        },
      },
    ],
  },

  RACE_JERSEYS_MANDATORY_WARNING: {
    defaultTitle: 'Mandatory Race Jersey Kits missing',
    defaultMessage:
      'Your team does not have enough usable Race Jersey Kits for an upcoming stage. Resupply before the stage eligibility check to avoid race removal.',

    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/mandatory%20race%20jersey.png',

    // This dedicated image is used only for the mandatory jersey-shortage event.
    getImageSrc: () =>
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/mandatory%20race%20jersey.png',

    getIntroText: (item) => {
      const payload = getPayload(item) ?? {}
      const raceName =
        pickFirstString(payload, ['race_name']) || 'the upcoming race'
      const stageNumber = pickFirstNumber(payload, ['stage_number'])
      const missing = pickFirstNumber(payload, ['missing_jersey_units'])
      const available = pickFirstNumber(payload, ['available_jersey_units'])
      const required = pickFirstNumber(payload, ['required_jersey_units'])

      const stageLabel =
        stageNumber !== null ? `Stage ${stageNumber}` : 'the upcoming stage'

      if (missing !== null && available !== null && required !== null) {
        return `Critical supply shortage for ${raceName} — ${stageLabel}. You currently have ${available} usable Race Jersey Kit${available === 1 ? '' : 's'}, but ${required} are required. Buy ${missing} additional kit${missing === 1 ? '' : 's'} before the eligibility check.`
      }

      return (
        item.message ||
        'Your team does not have enough usable Race Jersey Kits for the upcoming stage. Resupply before the eligibility check.'
      )
    },

    getDetailRows: (item) => {
      const payload = getPayload(item) ?? {}

      const raceName = pickFirstString(payload, ['race_name'])
      const teamName = pickFirstString(payload, ['team_name'])
      const stageNumber = pickFirstNumber(payload, ['stage_number'])
      const required = pickFirstNumber(payload, ['required_jersey_units'])
      const available = pickFirstNumber(payload, ['available_jersey_units'])
      const missing = pickFirstNumber(payload, ['missing_jersey_units'])

      return compactRows([
        detailRow('Team', teamName),
        detailRow('Race', raceName),
        detailRow(
          'Stage',
          stageNumber !== null ? `Stage ${stageNumber}` : null
        ),
        detailRow(
          'Required kits',
          required !== null ? String(required) : null
        ),
        detailRow(
          'Usable kits',
          available !== null ? String(available) : null
        ),
        detailRow(
          'Missing kits',
          missing !== null ? String(missing) : null
        ),
        detailRow(
          'Supply status',
          missing !== null && missing > 0 ? 'Critical shortage' : 'Ready'
        ),
        detailRow(
          'If unresolved',
          'Team removed from this stage and all remaining stages'
        ),
      ])
    },

    getExtraText: (item) => {
      const payload = getPayload(item) ?? {}
      const missing = pickFirstNumber(payload, ['missing_jersey_units'])

      if (missing !== null && missing > 0) {
        return `Immediate action required: purchase at least ${missing} additional usable Race Jersey Kit${missing === 1 ? '' : 's'}. The eligibility guard checks usable supply, so worn-out or unavailable kits do not satisfy the requirement.`
      }

      return 'Open Race Supplies to verify your usable Race Jersey Kit stock before the stage eligibility check.'
    },

    actions: [
      {
        key: 'resupply-race-jerseys',
        label: 'Resupply Now',
        variant: 'primary',
        kind: 'navigate',
        getHref: () => '/dashboard/equipment?tab=race-supplies',
        show: () => true,
      },
      {
        key: 'open-race',
        label: 'Open Race',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)
          const raceId = pickFirstString(payload, ['race_id'])
          return raceId ? `/dashboard/races/${raceId}` : null
        },
        show: (item) => {
          const payload = getPayload(item)
          return Boolean(pickFirstString(payload, ['race_id']))
        },
      },
    ],
  },


  RIDER_UNHAPPY: {
    defaultTitle: 'Rider morale is low',
    defaultMessage:
      'A rider is unhappy. Review morale, race selection, training load, and team situation.',

    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/rider%20morale%20is%20low.png',

    getImageSrc: (item) =>
      getImageSrcFromItem(item) ||
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/rider%20morale%20is%20low.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}
      const riderName = getPreferredRiderName(item) || 'A rider'

      const moraleScore = pickFirstNumber(payload, [
        'morale_score',
        'morale',
        'current_morale',
        'morale_value',
      ])

      const moraleLabel =
        moraleScore !== null ? `${moraleScore}/100` : 'below the safe level'

      return {
        ...item,
        title:
          riderName !== 'A rider'
            ? `Rider morale is low: ${riderName}`
            : item.title || 'Rider morale is low',
        message:
          riderName !== 'A rider'
            ? `${riderName} is unhappy. His morale is ${moraleLabel}. Review recent race selection, training load, team role, contract situation, and upcoming race opportunities before morale drops further.`
            : item.message ||
              'A rider is unhappy. Review recent race selection, training load, team role, contract situation, and upcoming race opportunities before morale drops further.',
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)
      const riderName = getPreferredRiderName(item) || 'This rider'

      const moraleScore = pickFirstNumber(payload, [
        'morale_score',
        'morale',
        'current_morale',
        'morale_value',
      ])

      const missedSelections = pickFirstNumber(payload, [
        'missed_selection_days',
        'days_without_race_selection',
        'days_since_last_selection',
        'no_selection_days',
      ])

      if (moraleScore !== null && missedSelections !== null) {
        return `${riderName}'s morale is low at ${moraleScore}/100 after ${missedSelections} day${missedSelections === 1 ? '' : 's'} without enough race selection. Review his role, recent workload, upcoming races, and squad situation.`
      }

      if (moraleScore !== null) {
        return `${riderName}'s morale is low at ${moraleScore}/100. Review his role, recent workload, race selection, contract situation, and squad plans.`
      }

      return `${riderName} is unhappy. Review his morale, recent race selection, training load, role expectations, and team situation before this becomes a bigger problem.`
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const moraleScore = pickFirstNumber(payload, [
        'morale_score',
        'morale',
        'current_morale',
        'morale_value',
      ])

      const previousMorale = pickFirstNumber(payload, [
        'previous_morale',
        'morale_before',
        'old_morale',
      ])

      const moraleDelta = pickFirstNumber(payload, [
        'morale_delta',
        'delta',
        'morale_change',
      ])

      const missedSelections = pickFirstNumber(payload, [
        'missed_selection_days',
        'days_without_race_selection',
        'days_since_last_selection',
        'no_selection_days',
      ])

      return compactRows([
        detailRow('Rider', getPreferredRiderName(item)),
        detailRow(
          'Morale',
          moraleScore !== null ? `${moraleScore}/100` : null
        ),
        detailRow(
          'Previous morale',
          previousMorale !== null ? `${previousMorale}/100` : null
        ),
        detailRow(
          'Morale change',
          moraleDelta !== null
            ? `${moraleDelta > 0 ? '+' : ''}${moraleDelta}`
            : null
        ),
        detailRow(
          'Morale status',
          formatLabel(
            pickFirstString(payload, [
              'morale_status',
              'morale_state',
              'status',
              'rider_status',
            ])
          ) || 'Low morale'
        ),
        detailRow(
          'Reason',
          pickFirstString(payload, [
            'morale_reason',
            'reason',
            'trigger_reason',
            'unhappy_reason',
          ])
        ),
        detailRow(
          'Days without selection',
          missedSelections !== null ? `${missedSelections}` : null
        ),
        detailRow(
          'Last race',
          pickFirstString(payload, [
            'last_race_name',
            'recent_race_name',
            'last_selected_race_name',
          ])
        ),
        detailRow(
          'Rider role',
          formatLabel(
            pickFirstString(payload, [
              'rider_role',
              'role',
              'team_role',
            ])
          )
        ),
        detailRow(
          'Club',
          pickFirstString(payload, [
            'club_name',
            'team_name',
          ])
        ),
        detailRow(
          'Contract ends',
          formatContractSeasonLabel(
            pickFirstString(payload, [
              'contract_expires_on',
              'contract_until',
              'expires_on_game_date',
            ])
          )
        ),
      ])
    },

    getExtraText: (item) => {
      const riderName = getPreferredRiderName(item) || 'this rider'

      return `Low morale can reduce commitment and may later lead to stronger complaints or a release request. Open ${riderName}'s profile and the morale page to plan race selection, training load, and squad role adjustments.`
    },

    actions: [
      {
        key: 'open-rider-profile',
        label: 'Open rider',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)

          return (
            pickFirstString(payload, [
              'my_rider_profile_path',
              'rider_profile_path',
              'profile_path',
            ]) ||
            (() => {
              const riderId = pickFirstString(payload, ['rider_id'])
              return riderId ? `/dashboard/my-riders/${riderId}` : null
            })() ||
            getRiderProfileHref(item)
          )
        },
        show: (item) => {
          const payload = getPayload(item)

          return Boolean(
            pickFirstString(payload, [
              'my_rider_profile_path',
              'rider_profile_path',
              'profile_path',
              'rider_id',
            ]) || getRiderProfileHref(item)
          )
        },
      },
      {
        key: 'open-morale-page',
        label: 'Morale page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)
          const riderId = pickFirstString(payload, ['rider_id'])

          return (
            pickFirstString(payload, [
              'qr_page_path',
              'morale_page_path',
              'team_morale_path',
              'team_squad_path',
            ]) ||
            (riderId
              ? `/dashboard/squad?focus=morale&riderId=${riderId}`
              : '/dashboard/squad?focus=morale')
          )
        },
        show: () => true,
      },
      {
        key: 'open-team-squad',
        label: 'Team squad',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)

          return (
            pickFirstString(payload, [
              'team_squad_path',
              'squad_path',
            ]) || getTeamSquadHref(item)
          )
        },
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },


  RIDER_CONTRACT_EXPIRING: {
    defaultTitle: 'Rider contract expiring',
    defaultMessage:
      'A rider contract is close to expiring. Review renewal plans before the deadline.',

    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20contract%20expiring.png',

    getImageSrc: (item) =>
      getImageSrcFromItem(item) ||
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20contract%20expiring.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}
      const riderName = getPreferredRiderName(item) || 'A rider'

      const daysRemaining = pickFirstNumber(payload, [
        'days_left',
        'days_remaining',
        'days_until_expiry',
        'expires_in_days',
        'contract_days_remaining',
      ])

      const contractEnd =
        pickFirstString(payload, [
          'contract_season_label',
          'contract_end_season_label',
          'season_label',
        ]) ||
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'contract_expires_at',
            'contract_end_date',
            'expires_at',
            'expires_on',
            'contract_expires_on',
          ])
        )

      const title =
        riderName !== 'A rider'
          ? `Rider contract expiring: ${riderName}`
          : 'Rider contract expiring'

      const message = (() => {
        if (riderName !== 'A rider' && daysRemaining !== null && contractEnd) {
          return `${riderName}'s contract expires in ${daysRemaining} in-game day${daysRemaining === 1 ? '' : 's'} (${contractEnd}). Review renewal terms, rider role, salary, and squad plans before the deadline.`
        }

        if (riderName !== 'A rider' && daysRemaining !== null) {
          return `${riderName}'s contract expires in ${daysRemaining} in-game day${daysRemaining === 1 ? '' : 's'}. Review renewal terms, rider role, salary, and squad plans before the deadline.`
        }

        if (riderName !== 'A rider') {
          return `${riderName}'s contract is close to expiring. Review renewal terms and squad plans before the deadline.`
        }

        return 'A rider contract is close to expiring. Review renewal plans before the deadline.'
      })()

      return {
        ...item,
        title,
        message,
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)
      const riderName = getPreferredRiderName(item) || 'This rider'

      const daysRemaining = pickFirstNumber(payload, [
        'days_left',
        'days_remaining',
        'days_until_expiry',
        'expires_in_days',
        'contract_days_remaining',
      ])

      const salaryWeekly = pickFirstNumber(payload, [
        'salary_weekly',
        'weekly_salary',
        'current_salary_weekly',
        'contract_salary_weekly',
        'salary',
      ])

      if (daysRemaining !== null && salaryWeekly !== null) {
        return `${riderName}'s contract expires in ${daysRemaining} in-game day${daysRemaining === 1 ? '' : 's'}. Current weekly salary: ${formatCurrencyLabel(salaryWeekly, '$')}. Decide soon whether to renew or plan a replacement.`
      }

      if (daysRemaining !== null) {
        return `${riderName}'s contract expires in ${daysRemaining} in-game day${daysRemaining === 1 ? '' : 's'}. Review renewal terms and your squad plan before the deadline.`
      }

      return `${riderName}'s contract is close to expiring. Review renewal terms and squad planning.`
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const daysRemaining = pickFirstNumber(payload, [
        'days_left',
        'days_remaining',
        'days_until_expiry',
        'expires_in_days',
        'contract_days_remaining',
      ])

      const salaryWeekly = pickFirstNumber(payload, [
        'salary_weekly',
        'weekly_salary',
        'current_salary_weekly',
        'contract_salary_weekly',
        'salary',
      ])

      const contractEnd =
        pickFirstString(payload, [
          'contract_season_label',
          'contract_end_season_label',
          'season_label',
        ]) ||
        (() => {
          const seasonNumber = pickFirstNumber(payload, [
            'contract_expires_season',
            'contract_end_season',
            'season_number',
          ])

          if (seasonNumber !== null) return `Season ${seasonNumber}`

          return formatContractSeasonLabel(
            pickFirstString(payload, [
              'contract_expires_at',
              'contract_end_date',
              'expires_at',
              'expires_on',
              'contract_expires_on',
            ])
          )
        })()

      return compactRows([
        detailRow('Rider', getPreferredRiderName(item)),
        detailRow(
          'Role',
          (() => {
            const role = pickFirstString(payload, [
              'rider_role',
              'role',
              'team_role',
              'specialty',
            ])
            return role ? formatLabel(role) : null
          })()
        ),
        detailRow(
          'Current weekly salary',
          salaryWeekly !== null ? `${formatCurrencyLabel(salaryWeekly, '$')}/week` : null
        ),
        detailRow('Contract end', contractEnd),
        detailRow(
          'Days remaining',
          daysRemaining !== null
            ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`
            : null
        ),
        detailRow(
          'Club',
          pickFirstString(payload, ['club_name', 'team_name'])
        ),
        detailRow(
          'Warning window',
          (() => {
            const windowDays = pickFirstNumber(payload, [
              'warning_window_days',
              'notification_window_days',
            ])
            return windowDays !== null
              ? `${windowDays} day${windowDays === 1 ? '' : 's'}`
              : '60 days'
          })()
        ),
      ])
    },

    getExtraText: (item) => {
      const riderName = getPreferredRiderName(item) || 'this rider'

      return `Open ${riderName}'s profile to review contract terms, salary, and future role. If you do not plan to renew, use the remaining time to prepare a replacement and protect your squad depth.`
    },

    actions: [
      {
        key: 'open-rider-profile',
        label: 'Open rider',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)

          return (
            pickFirstString(payload, [
              'my_rider_profile_path',
              'rider_profile_path',
              'profile_path',
            ]) || getRiderProfileHref(item)
          )
        },
        show: (item) => {
          const payload = getPayload(item)

          return Boolean(
            pickFirstString(payload, [
              'my_rider_profile_path',
              'rider_profile_path',
              'profile_path',
              'rider_id',
            ]) || getRiderProfileHref(item)
          )
        },
      },
      {
        key: 'open-team-squad',
        label: 'Team squad',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)

          return (
            pickFirstString(payload, [
              'team_squad_path',
              'squad_path',
            ]) || '/dashboard/squad'
          )
        },
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  RACE_WEATHER_CANCELLED: {
    defaultTitle: 'Race cancelled due to weather',
    defaultMessage:
      'The race was cancelled because the weather conditions were unsafe.',

    getImageSrc: (item) => {
      const payload = getPayload(item)

      return (
        pickFirstString(payload, [
          'event_image_url',
          'weather_cancelled_image_url',
          'race_weather_cancelled_image_url',
          'image_url',
          'race_logo_url',
          'race_profile_image_url',
          'profile_image_url',
        ]) || getImageSrcFromItem(item)
      )
    },

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const raceName =
        pickFirstString(payload, [
          'race_name',
          'race_title',
          'name',
        ]) || 'Race'

      const reasonLabel =
        pickFirstString(payload, [
          'reason_label',
          'weather_reason_label',
          'cancellation_reason_label',
        ]) || 'unsafe weather conditions'

      const cancelledStageCount = pickFirstNumber(payload, [
        'cancelled_stage_count',
        'weather_cancelled_stage_count',
      ])

      const totalStageCount = pickFirstNumber(payload, [
        'total_stage_count',
        'weather_total_stage_count',
        'stage_count',
      ])

      const isAllStageRace =
        totalStageCount !== null &&
        totalStageCount > 1 &&
        cancelledStageCount !== null &&
        cancelledStageCount >= totalStageCount

      return {
        ...item,
        title: `Race cancelled due to weather: ${raceName}`,
        message:
          item.message ||
          (isAllStageRace
            ? `${raceName} was cancelled because all ${totalStageCount} stages were cancelled by weather. Reason: ${reasonLabel}. No results, points, prize money, fatigue, or replay will be generated for the cancelled race.`
            : `${raceName} was cancelled because of ${reasonLabel}. No results, points, prize money, fatigue, or replay will be generated for this race.`),
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const raceName =
        pickFirstString(payload, [
          'race_name',
          'race_title',
          'name',
        ]) || 'this race'

      const reasonLabel =
        pickFirstString(payload, [
          'reason_label',
          'weather_reason_label',
          'cancellation_reason_label',
        ]) || 'unsafe weather conditions'

      const cancelledStageCount = pickFirstNumber(payload, [
        'cancelled_stage_count',
        'weather_cancelled_stage_count',
      ])

      const totalStageCount = pickFirstNumber(payload, [
        'total_stage_count',
        'weather_total_stage_count',
        'stage_count',
      ])

      if (
        cancelledStageCount !== null &&
        totalStageCount !== null &&
        totalStageCount > 1 &&
        cancelledStageCount >= totalStageCount
      ) {
        return `${raceName} has been cancelled because all ${totalStageCount} stages were cancelled by weather. Reason: ${reasonLabel}.`
      }

      return `${raceName} has been cancelled because the weather conditions were unsafe. Reason: ${reasonLabel}.`
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const stageNumber = pickFirstNumber(payload, ['stage_number'])

      return compactRows([
        detailRow(
          'Race',
          pickFirstString(payload, [
            'race_name',
            'race_title',
            'name',
          ])
        ),
        detailRow(
          'Race status',
          formatLabel(
            pickFirstString(payload, [
              'race_status',
              'weather_cancellation_status',
            ])
          ) || 'Cancelled'
        ),
        detailRow(
          'Reason',
          pickFirstString(payload, [
            'reason_label',
            'weather_reason_label',
            'cancellation_reason_label',
            'reason',
          ])
        ),
        detailRow(
          'Affected stage',
          stageNumber !== null
            ? `Stage ${stageNumber}`
            : pickFirstString(payload, ['stage_name', 'stage_title'])
        ),
        detailRow(
          'Stage date',
          formatContractSeasonLabel(
            pickFirstString(payload, [
              'stage_date',
              'race_date',
              'cancelled_stage_date',
            ])
          )
        ),
        detailRow(
          'Cancelled stages',
          (() => {
            const cancelledStageCount = pickFirstNumber(payload, [
              'cancelled_stage_count',
              'weather_cancelled_stage_count',
            ])
            const totalStageCount = pickFirstNumber(payload, [
              'total_stage_count',
              'weather_total_stage_count',
              'stage_count',
            ])

            if (cancelledStageCount !== null && totalStageCount !== null) {
              return `${cancelledStageCount} / ${totalStageCount}`
            }

            return cancelledStageCount !== null ? `${cancelledStageCount}` : null
          })()
        ),
        detailRow('Results', 'No results'),
        detailRow('Points', 'No points'),
        detailRow('Prize money', 'No prize money'),
        detailRow('Fatigue', 'No fatigue'),
      ])
    },

    getExtraText: (item) => {
      const payload = getPayload(item)
      const raceName =
        pickFirstString(payload, [
          'race_name',
          'race_title',
          'name',
        ]) || 'this race'

      return `${raceName} is treated as cancelled. Open the race page to review the calendar entry, affected stage information, and weather cancellation details.`
    },

    actions: [
      {
        key: 'open-race',
        label: 'Open race',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)

          const directPath = pickFirstString(payload, [
            'race_path',
            'race_url',
            'race_detail_path',
            'action_url',
          ])

          if (directPath) return directPath

          const raceId = pickFirstString(payload, ['race_id'])
          return raceId ? `/dashboard/races/${raceId}` : getActionHrefFromItem(item)
        },
        show: () => true,
      },
      {
        key: 'open-stage',
        label: 'Open stage',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)

          const directPath = pickFirstString(payload, [
            'stage_path',
            'stage_url',
            'stage_detail_path',
          ])

          if (directPath) return directPath

          const raceId = pickFirstString(payload, ['race_id'])
          const stageId = pickFirstString(payload, ['stage_id'])

          return raceId && stageId
            ? `/dashboard/races/${raceId}?stageId=${stageId}`
            : null
        },
        show: (item) => {
          const payload = getPayload(item)
          return Boolean(
            pickFirstString(payload, [
              'stage_path',
              'stage_url',
              'stage_detail_path',
              'stage_id',
            ])
          )
        },
      },
      MARK_READ_ACTION,
    ],
  },

  RACE_STAGE_WEATHER_CANCELLED: {
    defaultTitle: 'Stage cancelled due to weather',
    defaultMessage:
      'A race stage was cancelled because the weather conditions were unsafe.',

    getImageSrc: (item) => {
      const payload = getPayload(item)

      return (
        pickFirstString(payload, [
          'event_image_url',
          'stage_weather_cancelled_image_url',
          'weather_cancelled_image_url',
          'image_url',
          'stage_profile_image_url',
          'race_logo_url',
          'race_profile_image_url',
          'profile_image_url',
        ]) || getImageSrcFromItem(item)
      )
    },

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const raceName =
        pickFirstString(payload, [
          'race_name',
          'race_title',
          'name',
        ]) || 'Race'

      const stageNumber = pickFirstNumber(payload, ['stage_number'])
      const stageName = pickFirstString(payload, ['stage_name', 'stage_title'])

      const stageLabel =
        stageNumber !== null && stageName
          ? `Stage ${stageNumber}: ${stageName}`
          : stageNumber !== null
            ? `Stage ${stageNumber}`
            : stageName || 'A stage'

      const reasonLabel =
        pickFirstString(payload, [
          'reason_label',
          'weather_reason_label',
          'cancellation_reason_label',
        ]) || 'unsafe weather conditions'

      return {
        ...item,
        title: `Stage cancelled due to weather: ${raceName}`,
        message:
          item.message ||
          `${stageLabel} of ${raceName} was cancelled because of ${reasonLabel}. The race can continue if other stages are still active. No results, points, prize money, fatigue, or replay will be generated for this cancelled stage.`,
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const raceName =
        pickFirstString(payload, [
          'race_name',
          'race_title',
          'name',
        ]) || 'this race'

      const stageNumber = pickFirstNumber(payload, ['stage_number'])
      const stageName = pickFirstString(payload, ['stage_name', 'stage_title'])

      const stageLabel =
        stageNumber !== null && stageName
          ? `Stage ${stageNumber}: ${stageName}`
          : stageNumber !== null
            ? `Stage ${stageNumber}`
            : stageName || 'This stage'

      const reasonLabel =
        pickFirstString(payload, [
          'reason_label',
          'weather_reason_label',
          'cancellation_reason_label',
        ]) || 'unsafe weather conditions'

      return `${stageLabel} of ${raceName} was cancelled because of ${reasonLabel}. The stage is neutralized: no results, points, prize money, fatigue, or replay are generated for it.`
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)
      const stageNumber = pickFirstNumber(payload, ['stage_number'])

      return compactRows([
        detailRow(
          'Race',
          pickFirstString(payload, [
            'race_name',
            'race_title',
            'name',
          ])
        ),
        detailRow(
          'Stage',
          stageNumber !== null
            ? `Stage ${stageNumber}`
            : pickFirstString(payload, ['stage_name', 'stage_title'])
        ),
        detailRow(
          'Stage name',
          pickFirstString(payload, ['stage_name', 'stage_title'])
        ),
        detailRow(
          'Stage date',
          formatContractSeasonLabel(
            pickFirstString(payload, [
              'stage_date',
              'cancelled_stage_date',
            ])
          )
        ),
        detailRow(
          'Reason',
          pickFirstString(payload, [
            'reason_label',
            'weather_reason_label',
            'cancellation_reason_label',
            'reason',
          ])
        ),
        detailRow(
          'Race continues',
          pickFirstBoolean(payload, ['race_fully_cancelled', 'race_cancelled']) === false
            ? 'Yes'
            : null
        ),
        detailRow('Stage results', 'No results'),
        detailRow('Stage points', 'No points'),
        detailRow('Prize money', 'No prize money'),
        detailRow('Fatigue', 'No fatigue'),
      ])
    },

    getExtraText: () =>
      'This is a stage-only cancellation. The race can continue if at least one other stage remains active. Open the stage or race page to review the updated race status.',

    actions: [
      {
        key: 'open-stage',
        label: 'Open stage',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)

          const directPath = pickFirstString(payload, [
            'stage_path',
            'stage_url',
            'stage_detail_path',
          ])

          if (directPath) return directPath

          const raceId = pickFirstString(payload, ['race_id'])
          const stageId = pickFirstString(payload, ['stage_id'])

          if (raceId && stageId) return `/dashboard/races/${raceId}?stageId=${stageId}`
          if (raceId) return `/dashboard/races/${raceId}`
          return getActionHrefFromItem(item)
        },
        show: () => true,
      },
      {
        key: 'open-race',
        label: 'Open race',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)

          const directPath = pickFirstString(payload, [
            'race_path',
            'race_url',
            'race_detail_path',
            'action_url',
          ])

          if (directPath) return directPath

          const raceId = pickFirstString(payload, ['race_id'])
          return raceId ? `/dashboard/races/${raceId}` : null
        },
        show: (item) => {
          const payload = getPayload(item)
          return Boolean(
            pickFirstString(payload, [
              'race_path',
              'race_url',
              'race_detail_path',
              'action_url',
              'race_id',
            ])
          )
        },
      },
      MARK_READ_ACTION,
    ],
  },

  RACE_RESULTS_SUMMARY: {
    defaultTitle: 'Race results available',
    defaultMessage:
      'Race results are available. Open the race page to review the standings and your riders.',

    getImageSrc: (item) => {
      const payload = getPayload(item)

      return (
        pickFirstString(payload, [
          'race_logo_url',
          'image_url',
          'logo_url',
          'race_profile_image_url',
          'profile_image_url',
        ]) || getImageSrcFromItem(item)
      )
    },

    enrich: (item) => {
      const payload = getPayload(item)

      const raceName =
        pickFirstString(payload, [
          'race_name',
          'race_title',
          'name',
        ]) || 'Race'

      const stageName = pickFirstString(payload, [
        'stage_name',
        'stage_title',
        'result_stage_name',
      ])

      const stageNumber = pickFirstNumber(payload, [
        'stage_number',
        'result_stage_number',
      ])

      const bestResultPosition = pickFirstNumber(payload, [
        'best_result_position',
        'best_position',
        'top_result_position',
      ])

      const bestResultLabel = formatOrdinal(bestResultPosition)

      const stageLabel =
        stageName ||
        (stageNumber !== null ? `Stage ${stageNumber}` : null)

      return {
        ...item,
        title: `Race results: ${raceName}`,
        message:
          item.message ||
          (stageLabel && bestResultLabel
            ? `${stageLabel} results are available for ${raceName}. Your best result was ${bestResultLabel}. Open the race page to review the standings and your riders.`
            : stageLabel
              ? `${stageLabel} results are available for ${raceName}. Open the race page to review the standings and your riders.`
              : bestResultLabel
                ? `Results are available for ${raceName}. Your best result was ${bestResultLabel}. Open the race page to review the standings and your riders.`
                : `Results are available for ${raceName}. Open the race page to review the standings and your riders.`),
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const raceName =
        pickFirstString(payload, [
          'race_name',
          'race_title',
          'name',
        ]) || 'this race'

      const stageName = pickFirstString(payload, [
        'stage_name',
        'stage_title',
        'result_stage_name',
      ])

      const stageNumber = pickFirstNumber(payload, [
        'stage_number',
        'result_stage_number',
      ])

      const bestResultPosition = pickFirstNumber(payload, [
        'best_result_position',
        'best_position',
        'top_result_position',
      ])

      const bestResultLabel = formatOrdinal(bestResultPosition)

      const stageLabel =
        stageName ||
        (stageNumber !== null ? `Stage ${stageNumber}` : null)

      if (stageLabel && bestResultLabel) {
        return `${stageLabel} results are now available for ${raceName}. Your best placed rider finished ${bestResultLabel}. Open the race page to review the full standings, top finishers, and your team results.`
      }

      if (stageLabel) {
        return `${stageLabel} results are now available for ${raceName}. Open the race page to review the full standings, top finishers, and your team results.`
      }

      if (bestResultLabel) {
        return `Results are now available for ${raceName}. Your best placed rider finished ${bestResultLabel}. Open the race page to review the full standings, top finishers, and your team results.`
      }

      return `Results are now available for ${raceName}. Open the race page to review the full standings, top finishers, and your team results.`
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const raceName = pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ])

      const stageName = pickFirstString(payload, [
        'stage_name',
        'stage_title',
        'result_stage_name',
      ])

      const stageNumber = pickFirstNumber(payload, [
        'stage_number',
        'result_stage_number',
      ])

      const bestResultPosition = pickFirstNumber(payload, [
        'best_result_position',
        'best_position',
        'top_result_position',
      ])

      const participantsCount = pickFirstNumber(payload, [
        'participants_count',
        'your_riders_count',
        'team_riders_count',
      ])

      const topTen = getRaceResultEntries(payload, 'top_10')
      const yourRiders = getRaceResultEntries(payload, 'your_riders')

      const topThreeLabel = topTen
        .slice(0, 3)
        .map((resultEntry) => formatRaceResultEntry(resultEntry, true))
        .filter(Boolean)
        .join(' • ')

      const yourRidersLabel = yourRiders
        .slice(0, 5)
        .map((resultEntry) => formatRaceResultEntry(resultEntry, false))
        .filter(Boolean)
        .join(' • ')

      return compactRows([
        detailRow('Race', raceName),
        detailRow(
          'Stage',
          stageName || (stageNumber !== null ? `Stage ${stageNumber}` : null)
        ),
        detailRow(
          'Race class',
          pickFirstString(payload, [
            'race_class_code',
            'race_class',
            'class_code',
            'category',
          ])
        ),
        detailRow('Best team result', formatOrdinal(bestResultPosition)),
        detailRow(
          'Your riders listed',
          participantsCount !== null ? String(participantsCount) : null
        ),
        detailRow('Top 3', topThreeLabel || null),
        detailRow('Your rider results', yourRidersLabel || null),
      ])
    },

    getExtraText: (item) => {
      const payload = getPayload(item)

      const raceName =
        pickFirstString(payload, [
          'race_name',
          'race_title',
          'name',
        ]) || 'this race'

      return `Open the race page for ${raceName} to review the complete classification, your rider placements, and the full result details.`
    },

    actions: [
      {
        key: 'open-race-page',
        label: 'Open race',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => getRacePageHref(item) || '/dashboard/calendar',
        show: () => true,
      },
      {
        key: 'open-calendar',
        label: 'Calendar',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/calendar',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  SPONSOR_SELECTION_REQUIRED: {
    defaultTitle: 'Sponsor selection required',
    defaultMessage:
      'New sponsor offers are available for your club. Review them before the selection deadline.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Sponsor%20Selection%20requer.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const seasonNumber = pickFirstNumber(payload, [
        'season_number',
        'season',
        'target_season',
      ])

      return {
        ...item,
        title: 'Sponsor selection required',
        message:
          seasonNumber !== null
            ? `Sponsor offers for Season ${seasonNumber} are ready for review.`
            : 'New sponsor offers are ready for review.',
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const seasonNumber = pickFirstNumber(payload, [
        'season_number',
        'season',
        'target_season',
      ])

      return seasonNumber !== null
        ? `Your club has received new sponsor offers for Season ${seasonNumber}.`
        : 'Your club has received new sponsor offers.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const seasonNumber = pickFirstNumber(payload, [
        'season_number',
        'season',
        'target_season',
      ])

      const insertedCount = pickFirstNumber(payload, [
        'inserted_count',
        'offers_count',
        'offer_count',
        'count',
      ])

      const coverageMonths = pickFirstNumber(payload, [
        'coverage_months',
        'contract_months',
        'duration_months',
      ])

      return compactRows([
        detailRow(
          'Season',
          seasonNumber !== null ? `Season ${seasonNumber}` : null
        ),
        detailRow(
          'Available offers',
          insertedCount !== null ? `${insertedCount}` : null
        ),
        detailRow(
          'Contract length',
          coverageMonths !== null
            ? `${coverageMonths} month${coverageMonths === 1 ? '' : 's'}`
            : null
        ),
      ])
    },

    getExtraText: () =>
      'Choose carefully. Sponsor deals can affect your budget, stability, and season planning.',

    actions: [
      {
        key: 'open-sponsors-tab',
        label: 'Open sponsor offers',
        variant: 'primary',
        kind: 'navigate',
        getHref: () => '/dashboard/finance?tab=sponsors',
        show: () => true,
      },
      {
        key: 'open-finance',
        label: 'Finance page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/finance',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  SPONSOR_DEAL_SIGNED: {
    defaultTitle: 'Sponsor deal signed',
    defaultMessage:
      'A new sponsor agreement has been signed and added to your club finances.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Sponsor%20Deal%20singed.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const sponsorName = pickFirstString(payload, [
        'company_name',
        'sponsor_name',
        'partner_name',
        'name',
      ])

      const sponsorKind = pickFirstString(payload, [
        'sponsor_kind',
        'sponsor_type',
        'kind',
        'type',
      ])

      return {
        ...item,
        title: sponsorName
          ? `Sponsor deal signed: ${sponsorName}`
          : item.title || 'Sponsor deal signed',
        message:
          sponsorName && sponsorKind
            ? `${formatLabel(sponsorKind)} sponsor deal signed with ${sponsorName}.`
            : sponsorName
              ? `Sponsor deal signed with ${sponsorName}.`
              : item.message || 'A new sponsor agreement has been signed.',
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const sponsorName = pickFirstString(payload, [
        'company_name',
        'sponsor_name',
        'partner_name',
        'name',
      ])

      const sponsorKind = pickFirstString(payload, [
        'sponsor_kind',
        'sponsor_type',
        'kind',
        'type',
      ])

      if (sponsorName && sponsorKind) {
        return `${formatLabel(sponsorKind)} sponsor agreement with ${sponsorName} has been finalized.`
      }

      if (sponsorName) {
        return `Sponsor agreement with ${sponsorName} has been finalized.`
      }

      return 'A new sponsor agreement has been finalized for your club.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const guaranteedAmount = pickFirstNumber(payload, [
        'guaranteed_amount',
        'guaranteed_payment',
        'annual_value',
        'deal_value',
        'contract_value',
      ])

      const bonusPoolAmount = pickFirstNumber(payload, [
        'bonus_pool_amount',
        'bonus_pool',
        'bonus_amount',
      ])

      return compactRows([
        detailRow(
          'Sponsor',
          pickFirstString(payload, [
            'company_name',
            'sponsor_name',
            'partner_name',
            'name',
          ])
        ),
        detailRow(
          'Sponsor type',
          (() => {
            const type = pickFirstString(payload, [
              'sponsor_kind',
              'sponsor_type',
              'kind',
              'type',
            ])
            return type ? formatLabel(type) : null
          })()
        ),
        detailRow(
          'Season',
          (() => {
            const season = pickFirstNumber(payload, ['season_number', 'season'])
            return season !== null ? `Season ${season}` : null
          })()
        ),
        detailRow('Guaranteed payment', formatCurrencyLabel(guaranteedAmount, '$')),
        detailRow('Bonus pool', formatCurrencyLabel(bonusPoolAmount, '$')),
      ])
    },

    getExtraText: () =>
      'You can review the signed sponsor agreement, payment details, and bonus objectives from the Finance Sponsors tab.',

    actions: [
      {
        key: 'open-sponsor-tab',
        label: 'Open sponsor tab',
        variant: 'primary',
        kind: 'navigate',
        getHref: () => '/dashboard/finance?tab=sponsors',
        show: () => true,
      },
      {
        key: 'open-finance',
        label: 'Finance page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/finance',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  INFRASTRUCTURE_UPGRADE_COMPLETED: {
    defaultTitle: 'Infrastructure upgrade completed',
    defaultMessage:
      'One of your facilities has finished upgrading and is now available at its new level.',
    getIntroText: (item) =>
      buildIntroFromMessage(item) ||
      'One of your infrastructure projects has been completed successfully.',
    getDetailRows: getInfrastructureRows,
    getExtraText: () =>
      'You can now review the improved facility effects and plan the next development step.',
    getImageSrc: (item) => getImageSrcFromItem(item),
    actions: [
      withFallbackHref('Open infrastructure', '/dashboard/infrastructure'),
      MARK_READ_ACTION,
    ],
  },

  INFRASTRUCTURE_ASSET_DELIVERED: {
    defaultTitle: 'Infrastructure asset delivered',
    defaultMessage:
      'A purchased asset has been delivered and is now available in your infrastructure.',
    getIntroText: (item) =>
      buildIntroFromMessage(item) ||
      'A newly purchased infrastructure asset has been delivered to your club.',
    getDetailRows: getInfrastructureRows,
    getExtraText: () =>
      'Check where the asset is assigned and whether it unlocks new operational benefits.',
    getImageSrc: (item) => getImageSrcFromItem(item),
    actions: [
      withFallbackHref('Open infrastructure', '/dashboard/infrastructure'),
      MARK_READ_ACTION,
    ],
  },

  TRANSFER_OFFER_RECEIVED: {
    defaultTitle: 'Transfer offer received',
    defaultMessage:
      'Another club has submitted a transfer offer. Review the proposal before it expires.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Transfer%20offer%20received.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const riderName = getPreferredRiderName(item)
      const sellerClubName = pickFirstString(payload, [
        'seller_club_name',
        'from_club_name',
        'club_name',
      ])
      const buyerClubName = pickFirstString(payload, [
        'buyer_club_name',
        'offering_club_name',
        'team_name',
      ])

      const title =
        riderName
          ? `Transfer offer received: ${riderName}`
          : item.title || 'Transfer offer received'

      const message =
        buyerClubName && riderName
          ? `${buyerClubName} submitted an offer for ${riderName}.`
          : sellerClubName && riderName
            ? `${sellerClubName} submitted an offer for ${riderName}.`
            : item.message || 'A new transfer offer is waiting for your decision.'

      return {
        ...item,
        title,
        message,
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)
      const riderName = getPreferredRiderName(item)
      const buyerClubName = pickFirstString(payload, [
        'buyer_club_name',
        'offering_club_name',
        'team_name',
      ])

      if (buyerClubName && riderName) {
        return `${buyerClubName} has submitted a transfer offer for ${riderName}.`
      }

      if (riderName) {
        return `A new transfer offer has been submitted for ${riderName}.`
      }

      return buildIntroFromMessage(item) || 'A new transfer offer is waiting for your decision.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const offerValue = pickFirstNumber(payload, [
        'offer_value',
        'offered_price',
        'transfer_fee',
        'price',
      ])

      const askingPrice = pickFirstNumber(payload, [
        'asking_price',
        'list_price',
        'listing_price',
      ])

      return compactRows([
        detailRow('Rider', getPreferredRiderName(item)),
        detailRow(
          'Offering club',
          pickFirstString(payload, [
            'buyer_club_name',
            'offering_club_name',
            'team_name',
          ])
        ),
        detailRow(
          'Seller club',
          pickFirstString(payload, [
            'seller_club_name',
            'from_club_name',
            'club_name',
          ])
        ),
        detailRow('Offer value', formatCurrencyLabel(offerValue, '$')),
        detailRow('Asking price', formatCurrencyLabel(askingPrice, '$')),
        detailRow(
          'Expires',
          formatDateLabel(
            pickFirstString(payload, [
              'expires_at',
              'offer_expires_at',
              'deadline_at',
            ])
          )
        ),
      ])
    },

    getExtraText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `Review the offer for ${riderName} carefully before deciding whether to accept, reject, or continue negotiating.`
        : 'Review the offer carefully before deciding whether to accept, reject, or continue negotiating.'
    },

    actions: [
      {
        key: 'open-rider',
        label: 'Open rider',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => getRiderProfileHref(item),
        show: (item) => Boolean(getRiderProfileHref(item)),
      },
      {
        key: 'review-offer',
        label: 'Review offer',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => getActionHrefFromItem(item) || '/dashboard/transfers',
        show: () => true,
      },
      {
        key: 'open-transfers-page',
        label: 'Transfers page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/transfers',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  RIDER_NEGOTIATION_OPENED: {
    defaultTitle: 'Negotiation active',
    defaultMessage:
      'A rider contract negotiation is now active and awaiting your response.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20Negotiation%20Open.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const riderName = getPreferredRiderName(item)
      const buyerClubName = pickFirstString(payload, [
        'buyer_club_name',
        'club_name',
        'team_name',
      ])

      const title =
        riderName
          ? `Negotiation active: ${riderName}`
          : item.title || 'Negotiation active'

      const message =
        item.message ||
        (riderName && buyerClubName
          ? `${riderName} has started contract negotiations with ${buyerClubName}.`
          : riderName
            ? `${riderName} has started contract negotiations with your club.`
            : 'A rider contract negotiation is now active and awaiting your response.')

      return {
        ...item,
        title,
        message,
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)
      const riderName = getPreferredRiderName(item)
      const buyerClubName = pickFirstString(payload, [
        'buyer_club_name',
        'club_name',
        'team_name',
      ])
      const sellerClubName = pickFirstString(payload, [
        'seller_club_name',
        'from_club_name',
      ])

      if (riderName && buyerClubName && sellerClubName) {
        return `${riderName} has entered negotiations with ${buyerClubName} after movement from ${sellerClubName}.`
      }

      if (riderName && buyerClubName) {
        return `${riderName} is now negotiating contract terms with ${buyerClubName}.`
      }

      if (riderName) {
        return `${riderName} is now negotiating contract terms with your club.`
      }

      return buildIntroFromMessage(item) || 'A rider contract negotiation is now active.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const expectedSalary = pickFirstNumber(payload, [
        'expected_salary_weekly',
        'salary_weekly',
        'weekly_salary',
      ])

      const minAcceptableSalary = pickFirstNumber(payload, [
        'min_acceptable_salary_weekly',
        'minimum_salary_weekly',
        'minimum_weekly_salary',
      ])

      const preferredDuration = pickFirstNumber(payload, [
        'preferred_duration_seasons',
        'offer_duration_seasons',
        'duration_seasons',
        'contract_years',
      ])

      const transferFee = getNegotiationTransferFee(item)

      return compactRows([
        detailRow('Rider', getPreferredRiderName(item)),
        detailRow(
          'Buyer club',
          pickFirstString(payload, ['buyer_club_name', 'club_name', 'team_name'])
        ),
        detailRow(
          'Seller club',
          pickFirstString(payload, ['seller_club_name', 'from_club_name'])
        ),
        detailRow(
          'Transfer fee',
          formatCurrencyLabel(transferFee, '$')
        ),
        detailRow(
          'Expected salary',
          expectedSalary !== null
            ? `${formatCurrencyLabel(expectedSalary, '$')}/week`
            : null
        ),
        detailRow(
          'Minimum acceptable salary',
          minAcceptableSalary !== null
            ? `${formatCurrencyLabel(minAcceptableSalary, '$')}/week`
            : null
        ),
        detailRow(
          'Preferred contract',
          preferredDuration !== null
            ? `${preferredDuration} season${preferredDuration === 1 ? '' : 's'}`
            : null
        ),
        detailRow(
          'Expires',
          formatDateLabel(
            pickFirstString(payload, [
              'expires_at',
              'negotiation_expires_at',
              'deadline_at',
            ])
          )
        ),
      ])
    },

    getExtraText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `Review the negotiation carefully. ${riderName} can be opened directly from the rider profile, and you can continue this process from Transfers.`
        : 'Review the negotiation carefully and continue from the Transfers page.'
    },

    actions: [
      {
        key: 'open-rider',
        label: 'Open rider',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => getRiderProfileHref(item),
        show: (item) => Boolean(getRiderProfileHref(item)),
      },
      {
        key: 'review-negotiation',
        label: 'Review negotiation',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) =>
          getActionHrefFromItem(item) || '/dashboard/transfers',
        show: () => true,
      },
      {
        key: 'open-transfers-page',
        label: 'Transfers page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/transfers',
        show: () => true,
      },
      {
        key: 'open-team-squad',
        label: 'Team squad',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => getTeamSquadHref(item),
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  RIDER_NEGOTIATION_DECLINED: {
    defaultTitle: 'Rider negotiation declined',
    defaultMessage:
      'A rider has declined the proposed contract terms.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20Negotiation%20Declined.png',

    enrich: (item) => {
      const riderName = getPreferredRiderName(item)

      return {
        ...item,
        title: riderName
          ? `Negotiation declined: ${riderName}`
          : item.title || 'Negotiation declined',
        message: riderName
          ? `${riderName} declined the proposed contract terms.`
          : item.message || 'A rider declined the proposed contract terms.',
      }
    },

    getIntroText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `${riderName} has declined your contract proposal.`
        : 'The rider has declined your contract proposal.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const salaryWeekly = pickFirstNumber(payload, [
        'offer_salary_weekly',
        'salary_weekly',
        'weekly_salary',
      ])

      const durationSeasons = pickFirstNumber(payload, [
        'offer_duration_seasons',
        'duration_seasons',
        'contract_years',
      ])

      return compactRows([
        detailRow('Rider', getPreferredRiderName(item)),
        detailRow(
          'Club',
          pickFirstString(payload, ['buyer_club_name', 'club_name', 'team_name'])
        ),
        detailRow(
          'Proposed salary',
          salaryWeekly !== null ? `${formatCurrencyLabel(salaryWeekly, '$')}/week` : null
        ),
        detailRow(
          'Proposed contract',
          durationSeasons !== null
            ? `${durationSeasons} season${durationSeasons === 1 ? '' : 's'}`
            : null
        ),
        detailRow(
          'Status',
          formatLabel(pickFirstString(payload, ['status', 'negotiation_status']))
        ),
      ])
    },

    getExtraText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `Review your transfer strategy after ${riderName}'s decision. You may need to improve future terms or target another rider.`
        : 'Review your transfer strategy. You may need to improve future terms or target another rider.'
    },

    actions: [
      {
        key: 'open-rider',
        label: 'Open rider',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => getRiderProfileHref(item),
        show: (item) => Boolean(getRiderProfileHref(item)),
      },
      {
        key: 'open-transfers-page',
        label: 'Transfers page',
        variant: 'primary',
        kind: 'navigate',
        getHref: () => '/dashboard/transfers',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  RIDER_NEGOTIATION_COUNTERED: {
    defaultTitle: 'Rider negotiation countered',
    defaultMessage:
      'A rider has responded with counter terms for the contract negotiation.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20Negotiation%20Open.png',

    enrich: (item) => {
      const riderName = getPreferredRiderName(item)

      return {
        ...item,
        title: riderName
          ? `Counter offer received: ${riderName}`
          : item.title || 'Counter offer received',
        message: riderName
          ? `${riderName} responded with counter terms.`
          : item.message || 'A rider responded with counter terms.',
      }
    },

    getIntroText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `${riderName} has sent a counter offer for the contract negotiation.`
        : 'A rider has sent a counter offer for the contract negotiation.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const salaryWeekly = pickFirstNumber(payload, [
        'counter_salary_weekly',
        'requested_salary_weekly',
        'offer_salary_weekly',
        'salary_weekly',
        'weekly_salary',
      ])

      const durationSeasons = pickFirstNumber(payload, [
        'counter_duration_seasons',
        'requested_duration_seasons',
        'offer_duration_seasons',
        'duration_seasons',
        'contract_years',
      ])

      const signingBonus = pickFirstNumber(payload, [
        'counter_signing_bonus',
        'requested_signing_bonus',
        'signing_bonus',
        'signing_bonus_amount',
      ])

      const agentFee = pickFirstNumber(payload, [
        'counter_agent_fee',
        'requested_agent_fee',
        'agent_fee',
        'agent_fee_amount',
      ])

      return compactRows([
        detailRow('Rider', getPreferredRiderName(item)),
        detailRow(
          'Club',
          pickFirstString(payload, ['buyer_club_name', 'club_name', 'team_name'])
        ),
        detailRow(
          'Requested salary',
          salaryWeekly !== null ? `${formatCurrencyLabel(salaryWeekly, '$')}/week` : null
        ),
        detailRow(
          'Requested contract',
          durationSeasons !== null
            ? `${durationSeasons} season${durationSeasons === 1 ? '' : 's'}`
            : null
        ),
        detailRow('Signing bonus', formatCurrencyOrZero(signingBonus, '$')),
        detailRow('Agent fee', formatCurrencyOrZero(agentFee, '$')),
        detailRow(
          'Status',
          formatLabel(pickFirstString(payload, ['status', 'negotiation_status']))
        ),
      ])
    },

    getExtraText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `Review ${riderName}'s counter terms and decide whether to accept, improve, or walk away.`
        : 'Review the counter terms and decide whether to accept, improve, or walk away.'
    },

    actions: [
      {
        key: 'open-rider',
        label: 'Open rider',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => getRiderProfileHref(item),
        show: (item) => Boolean(getRiderProfileHref(item)),
      },
      {
        key: 'review-negotiation',
        label: 'Review negotiation',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => getActionHrefFromItem(item) || '/dashboard/transfers',
        show: () => true,
      },
      {
        key: 'open-transfers-page',
        label: 'Transfers page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/transfers',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  TRANSFER_OFFER_REJECTED: {
    defaultTitle: 'Transfer offer rejected',
    defaultMessage:
      'One of your transfer offers has been rejected. Review the details and decide next steps.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Transfer%20Offer%20rejected.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}
      const riderName = getPreferredRiderName(item)
      const sellerClubName = pickFirstString(payload, [
        'seller_club_name',
        'from_club_name',
        'club_name',
      ])

      return {
        ...item,
        title: riderName
          ? `Transfer offer rejected: ${riderName}`
          : item.title || 'Transfer offer rejected',
        message:
          riderName && sellerClubName
            ? `${sellerClubName} rejected your transfer offer for ${riderName}.`
            : riderName
              ? `Your transfer offer for ${riderName} was rejected.`
              : item.message || 'One of your transfer offers was rejected.',
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)
      const riderName = getPreferredRiderName(item)
      const sellerClubName = pickFirstString(payload, [
        'seller_club_name',
        'from_club_name',
        'club_name',
      ])

      if (riderName && sellerClubName) {
        return `${sellerClubName} has rejected your transfer offer for ${riderName}.`
      }

      if (riderName) {
        return `Your transfer offer for ${riderName} has been rejected.`
      }

      return 'One of your transfer offers has been rejected.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const rejectedOffer = pickFirstNumber(payload, [
        'offered_price',
        'offer_value',
        'rejected_offer_value',
        'transfer_fee',
        'price',
      ])

      return compactRows([
        detailRow('Rider', getPreferredRiderName(item)),
        detailRow(
          'Seller club',
          pickFirstString(payload, [
            'seller_club_name',
            'from_club_name',
            'club_name',
          ])
        ),
        detailRow(
          'Buyer club',
          pickFirstString(payload, [
            'buyer_club_name',
            'to_club_name',
            'team_name',
          ])
        ),
        detailRow('Rejected offer', formatCurrencyLabel(rejectedOffer, '$')),
        detailRow(
          'Status',
          formatLabel(pickFirstString(payload, ['status', 'offer_status']))
        ),
      ])
    },

    getExtraText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `You can review the market again, increase your offer, or move on to another target.`
        : 'You can review the market again, increase your offer, or move on to another target.'
    },

    actions: [
      {
        key: 'open-rider',
        label: 'Open rider',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => getRiderProfileHref(item),
        show: (item) => Boolean(getRiderProfileHref(item)),
      },
      {
        key: 'open-transfers-page',
        label: 'Transfers page',
        variant: 'primary',
        kind: 'navigate',
        getHref: () => '/dashboard/transfers',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  TRANSFER_OFFER_EXPIRED: {
    defaultTitle: 'Transfer offer expired',
    defaultMessage:
      'A transfer offer has expired without being completed.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Transfer%20offer%20expired.png',

    enrich: (item) => {
      const riderName = getPreferredRiderName(item)

      return {
        ...item,
        title: riderName
          ? `Transfer offer expired: ${riderName}`
          : item.title || 'Transfer offer expired',
        message: riderName
          ? `The transfer offer for ${riderName} has expired.`
          : item.message || 'A transfer offer has expired.',
      }
    },

    getIntroText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `The transfer offer involving ${riderName} expired before it was completed.`
        : 'A transfer offer expired before it was completed.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const offerValue = pickFirstNumber(payload, [
        'offered_price',
        'offer_value',
        'expired_offer_value',
        'transfer_fee',
        'price',
      ])

      return compactRows([
        detailRow('Rider', getPreferredRiderName(item)),
        detailRow(
          'Buyer club',
          pickFirstString(payload, [
            'buyer_club_name',
            'to_club_name',
            'team_name',
          ])
        ),
        detailRow(
          'Seller club',
          pickFirstString(payload, [
            'seller_club_name',
            'from_club_name',
            'club_name',
          ])
        ),
        detailRow('Offer value', formatCurrencyLabel(offerValue, '$')),
        detailRow(
          'Expired on',
          formatDateLabel(
            pickFirstString(payload, [
              'expired_on_game_date',
              'expires_on_game_date',
              'expires_at',
              'offer_expires_at',
              'deadline_at',
            ])
          )
        ),
        detailRow(
          'Status',
          formatLabel(pickFirstString(payload, ['status', 'offer_status']))
        ),
      ])
    },

    getExtraText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `You can return to the transfer market and decide whether to submit a new offer for ${riderName}.`
        : 'You can return to the transfer market and decide whether to submit a new offer.'
    },

    actions: [
      {
        key: 'open-rider',
        label: 'Open rider',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => getRiderProfileHref(item),
        show: (item) => Boolean(getRiderProfileHref(item)),
      },
      {
        key: 'open-transfers-page',
        label: 'Transfers page',
        variant: 'primary',
        kind: 'navigate',
        getHref: () => '/dashboard/transfers',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  TRANSFER_OFFER_ACCEPTED: {
    defaultTitle: 'Transfer offer accepted',
    defaultMessage:
      'A transfer offer has been accepted. Continue the rider negotiation to complete the deal.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Transfr%20Offer%20accepted.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const riderName = getPreferredRiderName(item)
      const sellerClubName = pickFirstString(payload, [
        'seller_club_name',
        'from_club_name',
      ])

      return {
        ...item,
        title: riderName
          ? `Transfer offer accepted: ${riderName}`
          : item.title || 'Transfer offer accepted',
        message:
          riderName && sellerClubName
            ? `Your transfer offer for ${riderName} was accepted by ${sellerClubName}.`
            : riderName
              ? `Your transfer offer for ${riderName} was accepted.`
              : item.message || 'A transfer offer has been accepted.',
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)
      const riderName = getPreferredRiderName(item)
      const sellerClubName = pickFirstString(payload, [
        'seller_club_name',
        'from_club_name',
      ])

      if (riderName && sellerClubName) {
        return `${sellerClubName} has accepted your transfer offer for ${riderName}.`
      }

      if (riderName) {
        return `Your transfer offer for ${riderName} has been accepted.`
      }

      return 'A transfer offer has been accepted and the rider negotiation can continue.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const offerValue = pickFirstNumber(payload, [
        'offer_value',
        'offered_price',
        'transfer_fee',
        'accepted_offer_value',
        'accepted_price',
      ])

      return compactRows([
        detailRow('Rider', getPreferredRiderName(item)),
        detailRow(
          'Seller club',
          pickFirstString(payload, ['seller_club_name', 'from_club_name'])
        ),
        detailRow(
          'Buyer club',
          pickFirstString(payload, ['buyer_club_name', 'club_name', 'team_name'])
        ),
        detailRow('Transfer fee', formatCurrencyLabel(offerValue, '$')),
        detailRow(
          'Negotiation status',
          formatLabel(pickFirstString(payload, ['status', 'negotiation_status']))
        ),
      ])
    },

    getExtraText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `${riderName} must still agree contract terms before the transfer is fully completed.`
        : 'The rider must still agree contract terms before the transfer is fully completed.'
    },

    actions: [
      {
        key: 'open-rider',
        label: 'Open rider',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => getRiderProfileHref(item),
        show: (item) => Boolean(getRiderProfileHref(item)),
      },
      {
        key: 'review-negotiation',
        label: 'Review negotiation',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => getActionHrefFromItem(item) || '/dashboard/transfers',
        show: () => true,
      },
      {
        key: 'open-transfers-page',
        label: 'Transfers page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/transfers',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  TRANSFER_COMPLETED: {
    defaultTitle: 'Transfer completed',
    defaultMessage:
      'A rider transfer has been finalized. Review the transfer details and update your squad plans.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Transfer%20completed%20notification.png',
    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const riderName = getPreferredRiderName(item)

      const buyerClubName =
        typeof payload.buyer_club_name === 'string' && payload.buyer_club_name.trim()
          ? payload.buyer_club_name
          : null

      const sellerClubName =
        typeof payload.seller_club_name === 'string' && payload.seller_club_name.trim()
          ? payload.seller_club_name
          : null

      const title =
        riderName ? `Transfer completed: ${riderName}` : item.title || 'Transfer completed'

      const message =
        riderName && buyerClubName && sellerClubName
          ? `${riderName} has joined ${buyerClubName} from ${sellerClubName}.`
          : riderName && buyerClubName
            ? `${riderName} has joined ${buyerClubName}.`
            : item.message || 'A rider transfer has been completed.'

      return {
        ...item,
        title,
        message,
      }
    },
    getIntroText: getTransferCompletedIntro,
    getDetailRows: getTransferCompletedRows,
    getExtraText: (item) => {
      const payload = getPayload(item)
      const riderName = getPreferredRiderName(item)

      const direction = pickFirstString(payload, [
        'transfer_direction',
        'direction',
        'activity_direction',
      ])

      const isIncoming =
        direction === 'incoming' ||
        pickFirstBoolean(payload, ['is_incoming', 'incoming']) === true

      const isOutgoing =
        direction === 'outgoing' ||
        pickFirstBoolean(payload, ['is_outgoing', 'outgoing']) === true

      if (isIncoming) {
        return riderName
          ? `${riderName} is available immediately in your Team Squad page.`
          : 'This rider is available immediately in your Team Squad page.'
      }

      if (isOutgoing) {
        return riderName
          ? `${riderName} has left your squad. Review your roster and transfer plans if you need a replacement.`
          : 'This rider has left your squad. Review your roster and transfer plans if you need a replacement.'
      }

      return 'Review the completed transfer details and update your squad plans if needed.'
    },
    actions: [
      {
        key: 'open-rider',
        label: 'Open rider',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => getRiderProfileHref(item),
        show: (item) => Boolean(getRiderProfileHref(item)),
      },
      {
        key: 'open-team-squad',
        label: 'Team squad',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => getTeamSquadHref(item),
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  FREE_AGENT_SIGNED: {
    defaultTitle: 'Free agent signed',
    defaultMessage:
      'A free agent has joined your squad from the free agent market.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Free%20Agent%20signed.png',

    enrich: (item) => {
      const riderName = getPreferredRiderName(item)

      return {
        ...item,
        title: riderName ? `Free agent signed: ${riderName}` : item.title || 'Free agent signed',
        message:
          item.message ||
          (riderName
            ? `${riderName} has joined your squad from the free agent market.`
            : 'A free agent has joined your squad from the free agent market.'),
      }
    },

    getIntroText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `${riderName} has joined your squad after signing from the free agent market.`
        : buildIntroFromMessage(item) ||
            'A rider has joined your squad after signing from the free agent market.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const salaryWeekly = pickFirstNumber(payload, [
        'salary_weekly',
        'offer_salary_weekly',
        'weekly_salary',
      ])

      const durationSeasons = pickFirstNumber(payload, [
        'duration_seasons',
        'offer_duration_seasons',
        'contract_years',
      ])

      const signingBonus = pickFirstNumber(payload, [
        'signing_bonus',
        'signing_bonus_paid',
        'offered_signing_bonus',
        'signing_bonus_amount',
        'bonus_amount',
        'bonus',
      ])

      const agentFee = pickFirstNumber(payload, [
        'agent_fee',
        'agent_fee_paid',
        'offered_agent_fee',
        'agent_fee_amount',
        'agency_fee',
        'agent_commission',
      ])

      return compactRows([
        detailRow('Rider', getPreferredRiderName(item)),
        detailRow('Source', 'Free agent market'),
        detailRow(
          'Weekly salary',
          salaryWeekly !== null ? `${formatCurrencyLabel(salaryWeekly, '$')}/week` : null
        ),
        detailRow(
          'Signing bonus',
          formatCurrencyOrZero(signingBonus, '$')
        ),
        detailRow(
          'Agent fee',
          formatCurrencyOrZero(agentFee, '$')
        ),
        detailRow(
          'Contract',
          durationSeasons !== null
            ? `${durationSeasons} season${durationSeasons === 1 ? '' : 's'}`
            : null
        ),
      ])
    },

    getExtraText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `${riderName} is now available in your squad and can be selected for future race plans.`
        : 'The new rider is now available in your squad and can be selected for future race plans.'
    },

    actions: [
      {
        key: 'open-rider',
        label: 'Open rider',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => getRiderProfileHref(item),
        show: (item) => Boolean(getRiderProfileHref(item)),
      },
      {
        key: 'open-team-squad',
        label: 'Open squad',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => getTeamSquadHref(item),
        show: () => true,
      },
      {
        key: 'open-free-agents',
        label: 'Free agents page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/transfers?subTab=free_agents',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  STAFF_HIRED: {
    defaultTitle: 'Staff hired',
    defaultMessage:
      'A new staff member has joined your club and is now available for team operations.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Staff%20signed.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const staffName = pickFirstString(payload, [
        'staff_name',
        'full_name',
        'display_name',
        'name',
      ])

      const role = pickFirstString(payload, [
        'role_type',
        'staff_role',
        'role',
        'specialization',
      ])

      const title = staffName
        ? `Staff hired: ${staffName}`
        : item.title || 'Staff hired'

      const message =
        item.message ||
        (staffName && role
          ? `${staffName} has joined your club as ${formatLabel(role)}.`
          : staffName
            ? `${staffName} has joined your club.`
            : 'A new staff member has joined your club.')

      return {
        ...item,
        title,
        message,
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const staffName = pickFirstString(payload, [
        'staff_name',
        'full_name',
        'display_name',
        'name',
      ])

      const role = pickFirstString(payload, [
        'role_type',
        'staff_role',
        'role',
        'specialization',
      ])

      if (staffName && role) {
        return `${staffName} has joined your club as ${formatLabel(role)}.`
      }

      if (staffName) {
        return `${staffName} has joined your club.`
      }

      return buildIntroFromMessage(item) || 'A new staff member has joined your club.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const salaryWeekly = pickFirstNumber(payload, [
        'salary_weekly',
        'weekly_salary',
        'wage_weekly',
        'staff_salary_weekly',
      ])

      return compactRows([
        detailRow(
          'Staff member',
          pickFirstString(payload, [
            'staff_name',
            'full_name',
            'display_name',
            'name',
          ])
        ),
        detailRow(
          'Role',
          (() => {
            const role = pickFirstString(payload, [
              'role_type',
              'staff_role',
              'role',
            ])
            return role ? formatLabel(role) : null
          })()
        ),
        detailRow(
          'Specialization',
          (() => {
            const specialization = pickFirstString(payload, [
              'specialization',
              'staff_specialization',
            ])
            return specialization ? formatLabel(specialization) : null
          })()
        ),
        detailRow(
          'Weekly wage',
          salaryWeekly !== null ? `${formatCurrencyLabel(salaryWeekly, '$')}/week` : null
        ),
        detailRow(
          'Contract duration',
          pickFirstString(payload, [
            'contract_duration_label',
            'contract_duration',
            'contract_expires_label',
            'contract_end_label',
          ]) ||
            (() => {
              const contractDays = pickFirstNumber(payload, [
                'contract_days',
                'duration_days',
              ])

              if (contractDays === null) return null
              if (contractDays <= 370) return 'End of this season'
              return 'End of next season'
            })()
        ),
        detailRow(
          'Country',
          pickFirstString(payload, ['country_name', 'country_code'])
        ),
      ])
    },

    getExtraText: () =>
      'You can review this staff member from your staff or team management area.',

    actions: [
      {
        key: 'open-staff',
        label: 'Open staff',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) =>
          getActionHrefFromItem(item) || '/dashboard/staff',
        show: () => true,
      },
      {
        key: 'open-team',
        label: 'Team page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/squad',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  STAFF_CONTRACT_EXPIRING: {
    defaultTitle: 'Staff contract expiring',
    defaultMessage:
      'A staff member contract is close to expiring. Review extension options before season end.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Staff%20contract%20expire.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const staffName = pickFirstString(payload, [
        'staff_name',
        'full_name',
        'display_name',
        'name',
      ])

      const title = staffName
        ? `Staff contract expiring: ${staffName}`
        : item.title || 'Staff contract expiring'

      const message =
        item.message ||
        (staffName
          ? `${staffName}'s contract is close to expiring. Review extension options before season end.`
          : 'A staff member contract is close to expiring. Review extension options before season end.')

      return {
        ...item,
        title,
        message,
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const staffName = pickFirstString(payload, [
        'staff_name',
        'full_name',
        'display_name',
        'name',
      ])

      const role = pickFirstString(payload, [
        'role_type',
        'staff_role',
        'role',
        'specialization',
      ])

      const daysRemaining = pickFirstNumber(payload, [
        'days_remaining',
        'days_until_expiry',
        'expires_in_days',
        'contract_days_remaining',
      ])

      if (staffName && role && daysRemaining !== null) {
        return `${staffName}'s ${formatLabel(role)} contract expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`
      }

      if (staffName && daysRemaining !== null) {
        return `${staffName}'s contract expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`
      }

      return buildIntroFromMessage(item) || 'A staff contract is close to expiring.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const daysRemaining = pickFirstNumber(payload, [
        'days_remaining',
        'days_until_expiry',
        'expires_in_days',
        'contract_days_remaining',
      ])

      const salaryWeekly = pickFirstNumber(payload, [
        'salary_weekly',
        'weekly_salary',
        'wage_weekly',
        'staff_salary_weekly',
        'current_salary_weekly',
        'current_weekly_wage',
      ])

      const contractSeason =
        pickFirstString(payload, [
          'contract_season_label',
          'contract_end_season_label',
          'season_label',
        ]) ||
        (() => {
          const seasonNumber = pickFirstNumber(payload, [
            'contract_expires_season',
            'contract_end_season',
            'season_number',
          ])

          if (seasonNumber !== null) return `Season ${seasonNumber}`

          return formatContractSeasonLabel(
            pickFirstString(payload, [
              'contract_expires_at',
              'contract_end_date',
              'expires_at',
              'expires_on',
            ])
          )
        })()

      return compactRows([
        detailRow(
          'Staff member',
          pickFirstString(payload, [
            'staff_name',
            'full_name',
            'display_name',
            'name',
          ])
        ),
        detailRow(
          'Role',
          (() => {
            const role = pickFirstString(payload, [
              'role_type',
              'staff_role',
              'role',
              'specialization',
            ])
            return role ? formatLabel(role) : null
          })()
        ),
        detailRow(
          'Current weekly salary',
          salaryWeekly !== null ? `${formatCurrencyLabel(salaryWeekly, '$')}/week` : null
        ),
        detailRow(
          'Contract end',
          contractSeason
        ),
        detailRow(
          'Days remaining',
          daysRemaining !== null
            ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`
            : null
        ),
      ])
    },

    getExtraText: () =>
      'Decide whether to extend this staff member or prepare a replacement before the contract expires.',

    actions: [
      {
        key: 'open-staff-profile',
        label: 'Open staff profile',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => getStaffProfileHref(item),
        show: (item) => Boolean(getStaffProfileHref(item)),
      },
      {
        key: 'open-staff',
        label: 'Open staff page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => getActionHrefFromItem(item) || '/dashboard/staff',
        show: () => true,
      },
      {
        key: 'open-transfers-staff',
        label: 'Staff market',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/transfers?tab=staff',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  STAFF_COURSE_COMPLETED: {
    defaultTitle: 'Staff course completed',
    defaultMessage:
      'A staff member has successfully completed a training course.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Staff%20Course%20Completed.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const staffName = pickFirstString(payload, [
        'staff_name',
        'full_name',
        'display_name',
        'name',
      ])

      const courseName = pickFirstString(payload, [
        'course_name',
        'course_title',
        'title',
      ])

      return {
        ...item,
        title: staffName
          ? `Course completed: ${staffName}`
          : item.title || 'Staff course completed',
        message:
          staffName && courseName
            ? `${staffName} has completed the ${courseName} course.`
            : staffName
              ? `${staffName} has completed a training course.`
              : item.message || 'A staff member has completed a training course.',
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const staffName = pickFirstString(payload, [
        'staff_name',
        'full_name',
        'display_name',
        'name',
      ])

      const courseName = pickFirstString(payload, [
        'course_name',
        'course_title',
        'title',
      ])

      if (staffName && courseName) {
        return `${staffName} has successfully completed the ${courseName} course.`
      }

      if (staffName) {
        return `${staffName} has successfully completed a training course.`
      }

      return 'A staff member has completed a training course.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const completedAt = pickFirstString(payload, [
        'completed_at',
        'completed_on',
        'finished_at',
      ])

      return compactRows([
        detailRow(
          'Staff member',
          pickFirstString(payload, [
            'staff_name',
            'full_name',
            'display_name',
            'name',
          ])
        ),
        detailRow(
          'Course',
          pickFirstString(payload, [
            'course_name',
            'course_title',
            'title',
          ])
        ),
        detailRow(
          'Focus',
          formatLabel(
            pickFirstString(payload, [
              'focus',
              'focus_label',
              'course_focus',
            ])
          )
        ),
        detailRow(
          'Expertise gain',
          (() => {
            const val = pickFirstNumber(payload, ['expertise_gain'])
            return val !== null ? `+${val}` : null
          })()
        ),
        detailRow(
          'Experience gain',
          (() => {
            const val = pickFirstNumber(payload, ['experience_gain'])
            return val !== null ? `+${val}` : null
          })()
        ),
        detailRow(
          'Leadership gain',
          (() => {
            const val = pickFirstNumber(payload, ['leadership_gain'])
            return val !== null ? `+${val}` : null
          })()
        ),
        detailRow(
          'Efficiency gain',
          (() => {
            const val = pickFirstNumber(payload, ['efficiency_gain'])
            return val !== null ? `+${val}` : null
          })()
        ),
        detailRow(
          'Completed on',
          formatDateLabel(completedAt)
        ),
      ])
    },

    getExtraText: () =>
      'The staff member has improved their abilities. Review their profile to see updated attributes.',

    actions: [
      {
        key: 'open-staff-profile',
        label: 'Open staff profile',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => getStaffProfileHref(item),
        show: (item) => Boolean(getStaffProfileHref(item)),
      },
      {
        key: 'open-staff-page',
        label: 'Staff page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/staff',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  RETIREMENT_ANNOUNCED: {
    defaultTitle: 'Retirement announced',
    defaultMessage:
      'An employee has announced retirement at the end of the season.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Employee%20Retirmetn%20annoucment.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const subjectType = pickFirstString(payload, [
        'subject_type',
        'entity_type',
        'retirement_type',
        'person_type',
      ])

      const personName =
        getPreferredRiderName(item) ||
        pickFirstString(payload, [
          'staff_name',
          'employee_name',
          'person_name',
          'display_name',
          'full_name',
          'name',
        ])

      const seasonNumber = pickFirstNumber(payload, [
        'retirement_season',
        'season_number',
        'end_season_number',
      ])

      const label =
        subjectType === 'staff'
          ? 'Staff retirement announced'
          : subjectType === 'rider'
            ? 'Rider retirement announced'
            : 'Retirement announced'

      return {
        ...item,
        title: personName ? `${label}: ${personName}` : item.title || label,
        message:
          personName && seasonNumber !== null
            ? `${personName} has decided to retire at the end of Season ${seasonNumber}.`
            : personName
              ? `${personName} has decided to retire at the end of the season.`
              : item.message || 'An employee has announced retirement at the end of the season.',
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const personName =
        getPreferredRiderName(item) ||
        pickFirstString(payload, [
          'staff_name',
          'employee_name',
          'person_name',
          'display_name',
          'full_name',
          'name',
        ])

      const seasonNumber = pickFirstNumber(payload, [
        'retirement_season',
        'season_number',
        'end_season_number',
      ])

      if (personName && seasonNumber !== null) {
        return `${personName} will retire at the end of Season ${seasonNumber}.`
      }

      if (personName) {
        return `${personName} will retire at the end of the season.`
      }

      return buildIntroFromMessage(item) || 'An employee will retire at the end of the season.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const subjectType = pickFirstString(payload, [
        'subject_type',
        'entity_type',
        'retirement_type',
        'person_type',
      ])

      const role = pickFirstString(payload, [
        'role_label',
        'role_type',
        'staff_role',
        'rider_role',
        'role',
        'specialization',
      ])

      const seasonNumber = pickFirstNumber(payload, [
        'retirement_season',
        'season_number',
        'end_season_number',
      ])

      const age = pickFirstNumber(payload, [
        'age_years',
        'age',
      ])

      return compactRows([
        detailRow(
          subjectType === 'staff' ? 'Staff member' : subjectType === 'rider' ? 'Rider' : 'Employee',
          getPreferredRiderName(item) ||
            pickFirstString(payload, [
              'staff_name',
              'employee_name',
              'person_name',
              'display_name',
              'full_name',
              'name',
            ])
        ),
        detailRow(
          'Type',
          subjectType ? formatLabel(subjectType) : null
        ),
        detailRow(
          'Role',
          role ? formatLabel(role) : null
        ),
        detailRow(
          'Age',
          age !== null ? `${age}` : null
        ),
        detailRow(
          'Retirement timing',
          seasonNumber !== null ? `End of Season ${seasonNumber}` : 'End of season'
        ),
      ])
    },

    getExtraText: (item) => {
      const payload = getPayload(item)

      const subjectType = pickFirstString(payload, [
        'subject_type',
        'entity_type',
        'retirement_type',
        'person_type',
      ])

      if (subjectType === 'staff') {
        return 'Plan ahead for a replacement or adjust your staff structure before the season ends.'
      }

      if (subjectType === 'rider') {
        return 'Plan ahead for squad depth, contracts, and replacement options before the rider retires.'
      }

      return 'Review your team plans before the retirement takes effect.'
    },

    actions: [
      {
        key: 'open-rider-or-staff',
        label: 'Open profile',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)

          const subjectType = pickFirstString(payload, [
            'subject_type',
            'entity_type',
            'retirement_type',
            'person_type',
          ])

          if (subjectType === 'staff') {
            return getStaffProfileHref(item) || '/dashboard/staff'
          }

          if (subjectType === 'rider') {
            return getRiderProfileHref(item) || '/dashboard/squad'
          }

          return getActionHrefFromItem(item) || '/dashboard/squad'
        },
        show: () => true,
      },
      {
        key: 'open-team-page',
        label: 'Team page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/squad',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  SEASON_RETIREMENTS_CONFIRMED: {
    defaultTitle: 'Season retirements confirmed',
    defaultMessage:
      'Season retirements have been finalized. Review retired riders and staff.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/End%20of%20Season%20Retirement%20confirmation.png',

    enrich: (item) => {
      const payload = getPayload(item)

      const seasonNumber = pickFirstNumber(payload, [
        'season_number',
        'retirement_season',
        'end_season_number',
      ])

      const retiredRidersCount = pickFirstNumber(payload, [
        'retired_riders_count',
        'retired_rider_count',
        'rider_count',
        'riders_count',
      ])

      const retiredStaffCount = pickFirstNumber(payload, [
        'retired_staff_count',
        'staff_count',
      ])

      const countSummary =
        retiredRidersCount !== null || retiredStaffCount !== null
          ? [
              retiredRidersCount !== null
                ? `${retiredRidersCount} rider${retiredRidersCount === 1 ? '' : 's'}`
                : null,
              retiredStaffCount !== null
                ? `${retiredStaffCount} staff member${retiredStaffCount === 1 ? '' : 's'}`
                : null,
            ]
              .filter(Boolean)
              .join(' and ')
          : null

      return {
        ...item,
        title: 'Season retirements confirmed',
        message:
          seasonNumber !== null && countSummary
            ? `Season ${seasonNumber} retirements have been finalized: ${countSummary}.`
            : seasonNumber !== null
              ? `Season ${seasonNumber} retirements have been finalized. Review retired riders and staff.`
              : 'Season retirements have been finalized. Review retired riders and staff.',
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const seasonNumber = pickFirstNumber(payload, [
        'season_number',
        'retirement_season',
        'end_season_number',
      ])

      return seasonNumber !== null
        ? `All Season ${seasonNumber} retirements have now been finalized.`
        : 'All season retirements have now been finalized.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const seasonNumber = pickFirstNumber(payload, [
        'season_number',
        'retirement_season',
        'end_season_number',
      ])

      const retiredRiderNames = pickStringArray(payload, [
        'retired_rider_names',
        'rider_names',
        'retired_riders',
        'riders',
      ])

      const retiredStaffNames = pickStringArray(payload, [
        'retired_staff_names',
        'staff_names',
        'retired_staff',
        'staff',
      ])

      const retiredRidersCount =
        pickFirstNumber(payload, [
          'retired_riders_count',
          'retired_rider_count',
          'rider_count',
          'riders_count',
        ]) ?? (retiredRiderNames.length > 0 ? retiredRiderNames.length : null)

      const retiredStaffCount =
        pickFirstNumber(payload, [
          'retired_staff_count',
          'staff_count',
        ]) ?? (retiredStaffNames.length > 0 ? retiredStaffNames.length : null)

      return compactRows([
        detailRow(
          'Season',
          seasonNumber !== null ? `Season ${seasonNumber}` : null
        ),
        detailRow(
          'Retired riders count',
          retiredRidersCount !== null ? `${retiredRidersCount}` : null
        ),
        detailRow(
          'Retired staff count',
          retiredStaffCount !== null ? `${retiredStaffCount}` : null
        ),
        detailRow(
          'Retired riders',
          retiredRiderNames.length > 0 ? retiredRiderNames.join(', ') : null
        ),
        detailRow(
          'Retired staff',
          retiredStaffNames.length > 0 ? retiredStaffNames.join(', ') : null
        ),
      ])
    },

    getExtraText: () =>
      'Review your squad and staff pages to plan replacements for the new season.',

    actions: [
      {
        key: 'open-team-page',
        label: 'Team page',
        variant: 'primary',
        kind: 'navigate',
        getHref: () => '/dashboard/squad',
        show: () => true,
      },
      {
        key: 'open-staff-page',
        label: 'Staff page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/staff',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  TAX_AUDIT_COMPLETED: {
    defaultTitle: 'Tax audit completed',
    defaultMessage: 'A tax audit has been completed for your club finances.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Tax%20audit%20completed.png',

    enrich: (item) => {
      return {
        ...item,
        title: 'Tax audit completed',
        message: 'A tax audit has been completed for your club finances.',
      }
    },

    getIntroText: () =>
      'A tax audit has been completed for your club finances.',

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const taxableIncome = pickFirstNumber(payload, [
        'taxable_income',
        'income_taxable',
        'taxableIncome',
      ])

      const adjustment = pickFirstNumber(payload, [
        'adjustment_amount',
        'tax_adjustment',
        'adjustment',
        'audit_adjustment',
      ])

      return compactRows([
        detailRow(
          'Period start',
          formatDateLabel(
            pickFirstString(payload, [
              'period_start',
              'start_date',
              'from_date',
              'tax_period_start',
            ])
          )
        ),
        detailRow(
          'Period end',
          formatDateLabel(
            pickFirstString(payload, [
              'period_end',
              'end_date',
              'to_date',
              'tax_period_end',
            ])
          )
        ),
        detailRow(
          'Adjustment',
          adjustment !== null ? formatCurrencyLabel(adjustment, '$') : '$0'
        ),
        detailRow(
          'Taxable income',
          formatCurrencyLabel(taxableIncome, '$')
        ),
      ])
    },

    getExtraText: () =>
      'You can review tax details from the finance tax tab.',

    actions: [
      {
        key: 'open-tax-tab',
        label: 'Open tax tab',
        variant: 'primary',
        kind: 'navigate',
        getHref: () => '/dashboard/finance?tab=tax',
        show: () => true,
      },
      {
        key: 'open-finance',
        label: 'Finance page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/finance',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  SCOUT_REPORT_COMPLETED: {
    defaultTitle: 'Scout report completed',
    defaultMessage:
      'A scouting report has been completed and is ready for review.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Scout%20report%20completed.png',

    enrich: (item) => {
      const riderName = scoutReportRiderName(item)

      const title = riderName
        ? `Scout report completed: ${riderName}`
        : item.title || 'Scout report completed'

      const message = riderName
        ? `A scout report for ${riderName} is now ready.`
        : item.message || 'A scouting report has been completed and is ready for review.'

      return {
        ...item,
        title,
        message,
      }
    },

    getIntroText: (item) => {
      const riderName = scoutReportRiderName(item)

      return riderName
        ? `Your scout has completed a new report on ${riderName}. The report may reveal improved attributes, potential, and scouting notes.`
        : 'Your scout has completed a new rider report with updated attributes, potential, and scouting notes.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const overallRating = pickFirstNumber(payload, [
        'overall_rating',
        'overall',
        'rating',
        'current_rating',
      ])

      const potentialRating = pickFirstNumber(payload, [
        'potential_rating',
        'potential',
        'future_rating',
      ])

      const scoutName = pickFirstString(payload, [
        'scout_name',
        'staff_name',
        'report_author',
      ])

      const bestAttribute = pickFirstString(payload, [
        'best_attribute',
        'best_skill',
        'primary_strength',
        'strength',
      ])

      return compactRows([
        detailRow('Rider', scoutReportRiderName(item)),
        detailRow('Scout', scoutName),
        detailRow(
          'Overall rating',
          overallRating !== null ? `${overallRating}` : null
        ),
        detailRow(
          'Potential',
          potentialRating !== null ? `${potentialRating}` : null
        ),
        detailRow(
          'Best attribute',
          bestAttribute ? formatLabel(bestAttribute) : null
        ),
        detailRow(
          'Report date',
          formatDateLabel(
            pickFirstString(payload, [
              'report_completed_at',
              'completed_at',
              'created_at',
              'report_date',
            ])
          )
        ),
      ])
    },

    getExtraText: (item) => {
      const riderName = scoutReportRiderName(item)

      return riderName
        ? `Review ${riderName}'s report before deciding whether to shortlist, monitor, train, or approach the rider.`
        : 'Review this scouting report before deciding whether to shortlist, monitor, train, or approach the rider.'
    },

    actions: [
      {
        key: 'open-rider',
        label: 'Open rider',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => getRiderProfileHref(item),
        show: (item) => Boolean(getRiderProfileHref(item)),
      },
      {
        key: 'open-scouting',
        label: 'Scouting page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/scouting',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  TRAINING_CAMP_START: {
    defaultTitle: 'Training camp started',
    defaultMessage:
      'Your training camp has started. Review participating riders and assigned staff.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Training%20Camp%20Started.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const locationName = pickFirstString(payload, [
        'city_snapshot',
        'city_name',
        'location_name',
        'location',
        'camp_location',
        'camp_name',
        'name',
      ])

      return {
        ...item,
        title: 'Training camp started',
        message: locationName
          ? `Your training camp in ${locationName} has started.`
          : 'Your training camp has started.',
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const locationName = pickFirstString(payload, [
        'city_snapshot',
        'city_name',
        'location_name',
        'location',
        'camp_location',
        'camp_name',
        'name',
      ])

      return locationName
        ? `Your training camp in ${locationName} has started.`
        : 'Your training camp has started.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      return compactRows([
        detailRow(
          'Location',
          pickFirstString(payload, [
            'city_snapshot',
            'city_name',
            'location_name',
            'location',
            'camp_location',
            'camp_name',
            'name',
          ])
        ),
        detailRow(
          'Runs until',
          formatContractSeasonLabel(
            pickFirstString(payload, [
              'ends_on_game_date',
              'end_game_date',
              'ends_on',
              'end_date',
            ])
          )
        ),
        detailRow(
          'Riders',
          pickFirstString(payload, [
            'rider_full_names',
            'riders_full_names',
            'participant_full_names',
            'participant_names',
            'rider_names',
            'riders_text',
            'participants_text',
            'participants',
          ])
        ),
        detailRow(
          'Staff',
          pickFirstString(payload, [
            'staff_full_names',
            'assigned_staff_full_names',
            'staff_names',
            'staff_text',
            'assigned_staff_text',
            'assigned_staff',
          ])
        ),
      ])
    },

    getExtraText: () =>
      'Open the current camp page to review participating riders, assigned staff, and daily progress.',

    actions: [
      {
        key: 'open-current-training-camp',
        label: 'Current camp',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)

          const campId = pickFirstString(payload, [
            'booking_id',
            'camp_id',
            'training_camp_id',
            'active_camp_id',
          ])

          return campId
            ? `/dashboard/training/current-camp/${campId}`
            : '/dashboard/training/current-camp'
        },
        show: () => true,
      },
      {
        key: 'open-training-camps-tab',
        label: 'Training camps',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/training?tab=training-camps',
        show: () => true,
      },
      {
        key: 'open-team-page',
        label: 'Team page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/squad',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  TRAINING_CAMP_DAILY_REPORT: {
    defaultTitle: 'Training camp daily report',
    defaultMessage:
      'A new daily report is available from your training camp.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Training%20Camp%20Daily%20Report.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const locationName = pickFirstString(payload, [
        'location_name',
        'location',
        'camp_location',
        'city_name',
        'name',
      ])

      const dayNumber = pickFirstNumber(payload, [
        'day_number',
        'camp_day',
        'current_day',
      ])

      const totalDays = pickFirstNumber(payload, [
        'total_days',
        'duration_days',
        'camp_duration_days',
      ])

      return {
        ...item,
        title: 'Training camp daily report',
        message:
          dayNumber !== null && totalDays !== null && locationName
            ? `Day ${dayNumber}/${totalDays} report from your training camp in ${locationName} is ready.`
            : 'A new daily training camp report is ready.',
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const locationName = pickFirstString(payload, [
        'location_name',
        'location',
        'camp_location',
        'city_name',
        'name',
      ])

      const dayNumber = pickFirstNumber(payload, [
        'day_number',
        'camp_day',
        'current_day',
      ])

      const totalDays = pickFirstNumber(payload, [
        'total_days',
        'duration_days',
        'camp_duration_days',
      ])

      if (dayNumber !== null && totalDays !== null && locationName) {
        return `Day ${dayNumber}/${totalDays} of your training camp in ${locationName} has been completed.`
      }

      if (dayNumber !== null && locationName) {
        return `Day ${dayNumber} of your training camp in ${locationName} has been completed.`
      }

      return 'A new daily report is available from your training camp.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const dayNumber = pickFirstNumber(payload, [
        'day_number',
        'camp_day',
        'current_day',
      ])

      const totalDays = pickFirstNumber(payload, [
        'total_days',
        'duration_days',
        'camp_duration_days',
      ])

      const locationName = pickFirstString(payload, [
        'location_name',
        'location',
        'camp_location',
        'city_name',
        'name',
      ])

      const reportGameDate = pickFirstString(payload, [
        'report_game_date',
        'game_date',
        'camp_game_date',
        'date',
      ])

      const seasonNumber = pickFirstNumber(payload, [
        'season_number',
        'season',
      ])

      const dayLabel =
        dayNumber !== null
          ? totalDays !== null
            ? `${dayNumber}/${totalDays}`
            : `${dayNumber}`
          : null

      const dateLabel =
        seasonNumber !== null
          ? `Season ${seasonNumber}`
          : reportGameDate
            ? formatContractSeasonLabel(reportGameDate)
            : null

      const unavailableNames = pickFirstString(payload, [
        'unavailable_rider_names',
        'unavailable_names',
        'missed_training_names',
        'blocked_rider_names',
      ])

      const injuredNames = pickFirstString(payload, [
        'injured_rider_names',
        'injured_names',
      ])

      const sickNames = pickFirstString(payload, [
        'sick_rider_names',
        'sick_names',
      ])

      const notFullyFitNames = pickFirstString(payload, [
        'not_fully_fit_rider_names',
        'not_fully_fit_names',
      ])

      const unavailableCount = pickFirstNumber(payload, [
        'unavailable_count',
        'unavailable_riders_count',
        'missed_training_count',
        'missed_riders_count',
      ])

      const injuredCount = pickFirstNumber(payload, [
        'injured_count',
        'injuries_count',
        'injured_riders_count',
      ])

      const sickCount = pickFirstNumber(payload, [
        'sick_count',
        'sick_riders_count',
      ])

      const notFullyFitCount = pickFirstNumber(payload, [
        'not_fully_fit_count',
        'not_fully_fit_riders_count',
      ])

      const hasExplicitHealthData =
        unavailableCount !== null ||
        injuredCount !== null ||
        sickCount !== null ||
        notFullyFitCount !== null ||
        Boolean(unavailableNames || injuredNames || sickNames || notFullyFitNames)

      const hasAnyIssue =
        (unavailableCount ?? 0) > 0 ||
        (injuredCount ?? 0) > 0 ||
        (sickCount ?? 0) > 0 ||
        (notFullyFitCount ?? 0) > 0 ||
        Boolean(unavailableNames || injuredNames || sickNames || notFullyFitNames)

      const healthStatus = hasExplicitHealthData
        ? hasAnyIssue
          ? 'Some riders could not train normally because of injury, sickness, or reduced fitness.'
          : 'All riders trained normally. No injuries, sickness, or accidents were reported.'
        : 'Rider health status was not included in this report payload. Open the current camp page for live rider availability.'

      return compactRows([
        detailRow('Day', dayLabel),
        detailRow('Date', dateLabel),
        detailRow('Location', locationName),
        detailRow('Daily status', healthStatus),
        detailRow('Unavailable riders', unavailableNames),
        detailRow('Injured riders', injuredNames),
        detailRow('Sick riders', sickNames),
        detailRow('Not fully fit riders', notFullyFitNames),
        detailRow(
          'Focus',
          formatLabel(
            pickFirstString(payload, [
              'focus',
              'focus_label',
              'training_focus',
              'camp_focus',
            ])
          )
        ),
        detailRow(
          'Riders assigned',
          pickFirstNumber(payload, [
            'riders_assigned',
            'assigned_riders_count',
            'participant_count',
            'participants_count',
          ])?.toString() || null
        ),
      ])
    },
    getExtraText: (item) => {
      const payload = getPayload(item)

      const locationName = pickFirstString(payload, [
        'location_name',
        'location',
        'camp_location',
        'city_name',
        'name',
      ])

      return locationName
        ? `Review the current training camp page to check rider progress, staff support, and daily development in ${locationName}.`
        : 'Review the current training camp page to check rider progress, staff support, and daily development.'
    },

    actions: [
      {
        key: 'open-current-training-camp',
        label: 'Current camp',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)

          const campId = pickFirstString(payload, [
            'camp_id',
            'training_camp_id',
            'active_camp_id',
          ])

          return campId
            ? `/dashboard/training/current-camp/${campId}`
            : '/dashboard/training/current-camp'
        },
        show: () => true,
      },
      {
        key: 'open-training-camps-tab',
        label: 'Training camps',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/training?tab=training-camps',
        show: () => true,
      },
      {
        key: 'open-team-page',
        label: 'Team page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/squad',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  TRAINING_CAMP_FINISHED: {
    defaultTitle: 'Training camp finished',
    defaultMessage:
      'Your training camp has finished. Review the final progress and team development.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Training%20Camp%20Completed.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const locationName = pickFirstString(payload, [
        'location_name',
        'location',
        'camp_location',
        'city_name',
        'name',
      ])

      return {
        ...item,
        title: locationName
          ? `Training camp finished: ${locationName}`
          : item.title || 'Training camp finished',
        message: locationName
          ? `Your training camp in ${locationName} has finished.`
          : item.message || 'Your training camp has finished.',
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const locationName = pickFirstString(payload, [
        'location_name',
        'location',
        'camp_location',
        'city_name',
        'name',
      ])

      return locationName
        ? `Your training camp in ${locationName} has been completed.`
        : 'Your training camp has been completed.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const totalDays = pickFirstNumber(payload, [
        'total_days',
        'duration_days',
        'camp_duration_days',
      ])

      const ridersCount = pickFirstNumber(payload, [
        'riders_assigned',
        'assigned_riders_count',
        'participant_count',
        'participants_count',
      ])

      const averageGain = pickFirstNumber(payload, [
        'average_gain',
        'avg_gain',
        'team_average_gain',
        'total_average_gain',
      ])

      return compactRows([
        detailRow(
          'Location',
          pickFirstString(payload, [
            'location_name',
            'location',
            'camp_location',
            'city_name',
            'name',
          ])
        ),
        detailRow(
          'Duration',
          totalDays !== null ? `${totalDays} day${totalDays === 1 ? '' : 's'}` : null
        ),
        detailRow(
          'Riders assigned',
          ridersCount !== null ? `${ridersCount}` : null
        ),
        detailRow(
          'Average improvement',
          averageGain !== null ? `+${averageGain}` : null
        ),
        detailRow(
          'Final status',
          formatLabel(
            pickFirstString(payload, [
              'status',
              'camp_status',
              'final_status',
            ])
          )
        ),
      ])
    },

    getExtraText: () =>
      'Review the camp results and update your training plans, squad preparation, and future race schedule.',

    actions: [
      {
        key: 'open-current-training-camp',
        label: 'Current camp',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)

          const campId = pickFirstString(payload, [
            'camp_id',
            'training_camp_id',
            'active_camp_id',
          ])

          return campId
            ? `/dashboard/training/current-camp/${campId}`
            : '/dashboard/training/current-camp'
        },
        show: () => true,
      },
      {
        key: 'open-training-camps-tab',
        label: 'Training camps',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/training?tab=training-camps',
        show: () => true,
      },
      {
        key: 'open-team-page',
        label: 'Team page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/squad',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  TRAINING_CAMP_WEATHER_WARNING: {
    defaultTitle: 'Training camp weather warning',
    defaultMessage:
      'Weather conditions may affect your training camp.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Training%20camp%20Weather%20warning.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const locationName = pickFirstString(payload, [
        'city_snapshot',
        'city_name',
        'location_name',
        'location',
        'camp_location',
        'camp_name',
        'name',
      ])

      return {
        ...item,
        title: 'Training camp weather warning',
        message: locationName
          ? `Weather conditions may affect your training camp in ${locationName}.`
          : 'Weather conditions may affect your training camp.',
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const locationName = pickFirstString(payload, [
        'city_snapshot',
        'city_name',
        'location_name',
        'location',
        'camp_location',
        'camp_name',
        'name',
      ])

      return locationName
        ? `Weather conditions may affect the training camp in ${locationName}.`
        : 'Weather conditions may affect this training camp.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const dayNumber = pickFirstNumber(payload, [
        'day_number',
        'camp_day',
        'current_day',
      ])

      const totalDays = pickFirstNumber(payload, [
        'total_days',
        'duration_days',
        'camp_duration_days',
      ])

      return compactRows([
        detailRow(
          'Location',
          pickFirstString(payload, [
            'city_snapshot',
            'city_name',
            'location_name',
            'location',
            'camp_location',
            'camp_name',
            'name',
          ])
        ),
        detailRow(
          'Camp day',
          dayNumber !== null
            ? totalDays !== null
              ? `${dayNumber}/${totalDays}`
              : `${dayNumber}`
            : null
        ),
        detailRow(
          'Weather',
          formatLabel(
            pickFirstString(payload, [
              'weather_state',
              'weather',
              'weather_label',
              'condition',
              'conditions',
            ])
          )
        ),
        detailRow(
          'Training impact',
          pickFirstString(payload, [
            'impact_text',
            'training_impact',
            'effect_summary',
            'summary',
            'message',
          ])
        ),
        detailRow(
          'Warning date',
          formatContractSeasonLabel(
            pickFirstString(payload, [
              'warning_game_date',
              'game_date',
              'report_game_date',
              'date',
            ])
          )
        ),
      ])
    },

    getExtraText: () =>
      'Review the current camp and consider adjusting training intensity, rider workload, or recovery plans.',

    actions: [
      {
        key: 'open-current-training-camp',
        label: 'Current camp',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)

          const campId = pickFirstString(payload, [
            'booking_id',
            'camp_booking_id',
            'camp_id',
            'training_camp_id',
            'active_camp_id',
          ])

          return campId
            ? `/dashboard/training/current-camp/${campId}`
            : '/dashboard/training/current-camp'
        },
        show: () => true,
      },
      {
        key: 'open-training-camps-tab',
        label: 'Training camps',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/training?tab=training-camps',
        show: () => true,
      },
      {
        key: 'open-team-page',
        label: 'Team page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/squad',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  RIDER_SICK: {
    defaultTitle: 'Rider sick',
    defaultMessage:
      'A rider is sick and may be unavailable for training or racing.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20is%20sick.png',

    enrich: (item) => {
      const riderName = getPreferredRiderName(item)

      return {
        ...item,
        title: riderName
          ? `Rider sick: ${riderName}`
          : item.title || 'Rider sick',
        message: riderName
          ? `${riderName} is sick and may be unavailable for training or racing.`
          : 'A rider is sick and may be unavailable for training or racing.',
      }
    },

    getIntroText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `${riderName} is currently sick and may need time away from full training or racing.`
        : 'A rider is currently sick and may need time away from full training or racing.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const unavailableDays = pickFirstNumber(payload, [
        'unavailable_days',
        'days_unavailable',
        'recovery_days',
        'expected_days_out',
        'days_out',
      ])

      const conditionLabel =
        formatLabel(
          pickFirstString(payload, [
            'condition',
            'condition_label',
            'sickness_type',
            'illness_type',
            'health_status',
            'availability_status',
            'new_status',
            'status',
          ])
        ) || 'Sick'

      const expectedReturn = pickFirstString(payload, [
        'expected_recovery_game_date',
        'recovery_game_date',
        'available_on_game_date',
        'fit_again_game_date',
        'expected_return_game_date',
        'unavailable_until',
        'ends_on_game_date',
      ])

      return compactRows([
        detailRow('Rider', getPreferredRiderName(item)),
        detailRow('Condition', conditionLabel),
        detailRow(
          'Unavailable for',
          unavailableDays !== null
            ? `${unavailableDays} day${unavailableDays === 1 ? '' : 's'}`
            : null
        ),
        detailRow(
          'Sick since',
          formatContractSeasonLabel(
            pickFirstString(payload, [
              'sick_on_game_date',
              'started_on_game_date',
              'health_event_game_date',
              'event_game_date',
              'processed_date',
              'game_date',
              'created_game_date',
            ])
          )
        ),
        detailRow(
          'Expected return',
          formatContractSeasonLabel(expectedReturn)
        ),
        detailRow(
          'Training impact',
          pickFirstString(payload, [
            'impact_text',
            'training_impact',
            'race_impact',
            'summary',
            'notes',
          ])
        ),
      ])
    },

    getExtraText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `Monitor ${riderName}'s recovery before assigning intense training, training camps, or race participation.`
        : 'Monitor the rider recovery before assigning intense training, training camps, or race participation.'
    },

    actions: [
      {
        key: 'open-rider',
        label: 'Open rider',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => getRiderProfileHref(item),
        show: (item) => Boolean(getRiderProfileHref(item)),
      },
      {
        key: 'open-team-page',
        label: 'Team page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/squad',
        show: () => true,
      },
      {
        key: 'open-training-page',
        label: 'Training page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/training',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  RIDER_NOT_FULLY_FIT: {
    defaultTitle: 'Rider not fully fit',
    defaultMessage:
      'A rider is not fully fit and may need reduced workload or recovery time.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20is%20not%20fully%20fit.png',

    enrich: (item) => {
      const riderName = getPreferredRiderName(item)

      return {
        ...item,
        title: riderName
          ? `Rider not fully fit: ${riderName}`
          : item.title || 'Rider not fully fit',
        message: riderName
          ? `${riderName} is not fully fit and may need reduced training or recovery time.`
          : item.message || 'A rider is not fully fit and may need reduced workload or recovery time.',
      }
    },

    getIntroText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `${riderName} is currently below full fitness. Consider reducing workload until the rider recovers.`
        : 'A rider is currently below full fitness. Consider reducing workload until recovery improves.'
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const fitnessPercent = pickFirstNumber(payload, [
        'fitness_percent',
        'fitness_pct',
        'current_fitness',
        'fitness',
        'condition_percent',
        'condition_pct',
      ])

      const fatigue = pickFirstNumber(payload, [
        'fatigue',
        'fatigue_level',
        'current_fatigue',
        'fatigue_load',
      ])

      const recoveryDays = pickFirstNumber(payload, [
        'recovery_days',
        'days_to_full_fitness',
        'days_until_fit',
        'expected_days_to_recover',
        'expected_days_out',
      ])

      return compactRows([
        detailRow('Rider', getPreferredRiderName(item)),
        detailRow(
          'Fitness',
          fitnessPercent !== null ? `${fitnessPercent}%` : null
        ),
        detailRow(
          'Fatigue',
          fatigue !== null ? `${fatigue}` : null
        ),
        detailRow(
          'Expected recovery',
          recoveryDays !== null
            ? `${recoveryDays} day${recoveryDays === 1 ? '' : 's'}`
            : null
        ),
        detailRow(
          'Status',
          formatLabel(
            pickFirstString(payload, [
              'status',
              'availability_status',
              'fitness_status',
              'condition',
              'condition_label',
            ])
          ) || 'Not fully fit'
        ),
        detailRow(
          'Reported on',
          formatContractSeasonLabel(
            pickFirstString(payload, [
              'reported_on_game_date',
              'fitness_event_game_date',
              'event_game_date',
              'game_date',
              'created_game_date',
            ])
          )
        ),
        detailRow(
          'Training impact',
          pickFirstString(payload, [
            'impact_text',
            'training_impact',
            'race_impact',
            'summary',
            'notes',
          ])
        ),
      ])
    },

    getExtraText: (item) => {
      const riderName = getPreferredRiderName(item)

      return riderName
        ? `Monitor ${riderName}'s fitness before assigning hard training, training camps, or important race days.`
        : 'Monitor the rider fitness before assigning hard training, training camps, or important race days.'
    },

    actions: [
      {
        key: 'open-rider',
        label: 'Open rider',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => getRiderProfileHref(item),
        show: (item) => Boolean(getRiderProfileHref(item)),
      },
      {
        key: 'open-team-page',
        label: 'Team page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/squad',
        show: () => true,
      },
      {
        key: 'open-training-page',
        label: 'Training page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/training',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },
  RIDER_INJURED: {
  defaultTitle: 'Rider injured',
  defaultMessage:
    'A rider has suffered an injury and may be unavailable for training or racing.',
  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20Injured.png',

  enrich: (item) => {
    const riderName = getPreferredRiderName(item)

    return {
      ...item,
      title: riderName
        ? `Rider injured: ${riderName}`
        : item.title || 'Rider injured',
      message: riderName
        ? `${riderName} has suffered an injury and may be unavailable for training or racing.`
        : 'A rider has suffered an injury and may be unavailable for training or racing.',
    }
  },

  getIntroText: (item) => {
    const riderName = getPreferredRiderName(item)

    return riderName
      ? `${riderName} is currently injured and needs time away from full training and racing.`
      : 'A rider is currently injured and needs time away from full training and racing.'
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const unavailableDays = pickFirstNumber(payload, [
      'unavailable_days',
      'days_unavailable',
      'active_days',
      'recovery_days',
      'expected_days_out',
      'days_out',
    ])

    const injuryNature =
      formatLabel(
        pickFirstString(payload, [
          'injury_type',
          'injury_code',
          'injury_name',
          'case_code',
          'health_case_code',
          'condition',
          'condition_label',
          'unavailable_reason',
        ])
      ) || 'Injury'

    const severity =
      formatLabel(
        pickFirstString(payload, [
          'severity',
          'injury_severity',
          'case_severity',
          'health_severity',
        ])
      )

    const expectedReturn = pickFirstString(payload, [
      'expected_recovery_game_date',
      'recovery_game_date',
      'available_on_game_date',
      'fit_again_game_date',
      'expected_return_game_date',
      'unavailable_until',
      'ends_on_game_date',
    ])

    return compactRows([
      detailRow('Rider', getPreferredRiderName(item)),
      detailRow('Nature of injury', injuryNature),
      detailRow('Severity', severity),
      detailRow(
        'Unavailable for',
        unavailableDays !== null
          ? `${unavailableDays} day${unavailableDays === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Injured since',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'injured_on_game_date',
            'started_on_game_date',
            'health_event_game_date',
            'event_game_date',
            'processed_date',
            'game_date',
            'created_game_date',
          ])
        )
      ),
      detailRow(
        'Expected return',
        formatContractSeasonLabel(expectedReturn)
      ),
      detailRow(
        'Status',
        formatLabel(
          pickFirstString(payload, [
            'availability_status',
            'new_status',
            'status',
          ])
        ) || 'Injured'
      ),
      detailRow(
        'Training impact',
        pickFirstString(payload, [
          'impact_text',
          'training_impact',
          'race_impact',
          'summary',
          'notes',
        ]) ||
          'The rider should avoid training camps, hard training, and race participation until recovered.'
      ),
    ])
  },

  getExtraText: (item) => {
    const riderName = getPreferredRiderName(item)

    return riderName
      ? `Monitor ${riderName}'s recovery before assigning training, training camps, or race participation.`
      : 'Monitor the rider recovery before assigning training, training camps, or race participation.'
  },

  actions: [
    {
      key: 'open-rider',
      label: 'Open rider',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        const directPath = pickFirstString(payload, [
          'my_rider_profile_path',
          'rider_profile_path',
        ])

        if (directPath) return directPath

        const riderId = pickFirstString(payload, ['rider_id'])
        return riderId ? `/dashboard/my-riders/${riderId}` : null
      },
      show: (item) => {
        const payload = getPayload(item)
        return Boolean(
          pickFirstString(payload, [
            'my_rider_profile_path',
            'rider_profile_path',
            'rider_id',
          ])
        )
      },
    },
    {
      key: 'open-team-page',
      label: 'Team page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/squad',
      show: () => true,
    },
    {
      key: 'open-training-page',
      label: 'Training page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/training',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  RIDER_FIT_AGAIN: {
  defaultTitle: 'Rider fit again',
  defaultMessage:
    'A rider has recovered and is available again for training and racing.',
  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20fit%20again.png',

  enrich: (item) => {
    const riderName = getPreferredRiderName(item)
    const payload = getPayload(item)

    const oldStatus = pickFirstString(payload, [
      'old_status',
      'previous_status',
      'recovered_from',
      'unavailable_reason',
    ])

    const recoveredFrom =
      oldStatus === 'injured' || oldStatus === 'injury'
        ? 'injury'
        : oldStatus === 'sick' || oldStatus === 'sickness'
          ? 'sickness'
          : oldStatus === 'not_fully_fit'
            ? 'fatigue'
            : 'health issue'

    return {
      ...item,
      title: riderName
        ? `Rider fit again: ${riderName}`
        : item.title || 'Rider fit again',
      message: riderName
        ? `${riderName} has recovered from ${recoveredFrom} and is available again.`
        : 'A rider has recovered and is available again.',
    }
  },

  getIntroText: (item) => {
    const riderName = getPreferredRiderName(item)
    const payload = getPayload(item)

    const oldStatus = pickFirstString(payload, [
      'old_status',
      'previous_status',
      'recovered_from',
      'unavailable_reason',
    ])

    if (oldStatus === 'injured' || oldStatus === 'injury') {
      return riderName
        ? `${riderName} has recovered from injury and is available again.`
        : 'A rider has recovered from injury and is available again.'
    }

    if (oldStatus === 'sick' || oldStatus === 'sickness') {
      return riderName
        ? `${riderName} has recovered from sickness and is available again.`
        : 'A rider has recovered from sickness and is available again.'
    }

    if (oldStatus === 'not_fully_fit') {
      return riderName
        ? `${riderName} has recovered from fatigue and is fully fit again.`
        : 'A rider has recovered from fatigue and is fully fit again.'
    }

    return riderName
      ? `${riderName} is fit again and available for selection.`
      : 'A rider is fit again and available for selection.'
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const oldStatus = pickFirstString(payload, [
      'old_status',
      'previous_status',
      'recovered_from',
      'unavailable_reason',
    ])

    const recoveredFrom =
      oldStatus === 'injured' || oldStatus === 'injury'
        ? 'Injury'
        : oldStatus === 'sick' || oldStatus === 'sickness'
          ? 'Sickness'
          : oldStatus === 'not_fully_fit'
            ? 'Fatigue'
            : formatLabel(oldStatus) || 'Health issue'

    return compactRows([
      detailRow('Rider', getPreferredRiderName(item)),
      detailRow('Recovered from', recoveredFrom),
      detailRow(
        'Recovered on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'fit_again_game_date',
            'recovered_on_game_date',
            'resolved_on',
            'processed_date',
            'event_game_date',
            'game_date',
            'created_game_date',
          ])
        )
      ),
      detailRow(
        'Current status',
        formatLabel(
          pickFirstString(payload, [
            'new_status',
            'availability_status',
            'status',
          ])
        ) || 'Fit'
      ),
      detailRow(
        'Fatigue',
        (() => {
          const fatigue = pickFirstNumber(payload, [
            'fatigue',
            'current_fatigue',
            'fatigue_level',
          ])

          return fatigue !== null ? `${fatigue}/100` : null
        })()
      ),
      detailRow(
        'Selection status',
        'Available for training and racing'
      ),
    ])
  },

  getExtraText: (item) => {
    const riderName = getPreferredRiderName(item)

    return riderName
      ? `${riderName} can now be considered again for training, training camps, and race selection.`
      : 'The rider can now be considered again for training, training camps, and race selection.'
  },

  actions: [
    {
      key: 'open-rider',
      label: 'Open rider',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        const directPath = pickFirstString(payload, [
          'my_rider_profile_path',
          'rider_profile_path',
        ])

        if (directPath) return directPath

        const riderId = pickFirstString(payload, ['rider_id'])
        return riderId ? `/dashboard/my-riders/${riderId}` : null
      },
      show: (item) => {
        const payload = getPayload(item)

        return Boolean(
          pickFirstString(payload, [
            'my_rider_profile_path',
            'rider_profile_path',
            'rider_id',
          ])
        )
      },
    },
    {
      key: 'open-team-page',
      label: 'Team page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/squad',
      show: () => true,
    },
    {
      key: 'open-training-page',
      label: 'Training page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/training',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  BIRTHDAY_GIFT_10_COINS: {
  defaultTitle: 'Happy birthday, ProPeloton!',
  defaultMessage:
    'Your birthday gift is here. We added 10 coins to your ProPeloton Manager account.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Happy%20Birthday.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Happy%20Birthday.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const coinsAmount =
      pickFirstNumber(payload, [
        'gift_coins',
        'coins_awarded',
        'coins_added',
        'coins_reward',
        'reward_coins',
        'coins_amount',
        'coin_amount',
        'amount_coins',
      ]) ?? 10

    return {
      ...item,
      title: item.title || 'Happy birthday, ProPeloton!',
      message:
        item.message ||
        `Your birthday gift is here. We added ${coinsAmount} coins to your ProPeloton Manager account.`,
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const coinsAmount =
      pickFirstNumber(payload, [
        'gift_coins',
        'coins_awarded',
        'coins_added',
        'coins_reward',
        'reward_coins',
        'coins_amount',
        'coin_amount',
        'amount_coins',
      ]) ?? 10

    return (
      buildIntroFromMessage(item) ||
      `Happy birthday from ProPeloton Manager. Your account has been credited with ${coinsAmount} bonus coins as a birthday gift.`
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const coinsAmount =
      pickFirstNumber(payload, [
        'gift_coins',
        'coins_awarded',
        'coins_added',
        'coins_reward',
        'reward_coins',
        'coins_amount',
        'coin_amount',
        'amount_coins',
      ]) ?? 10

    return compactRows([
      detailRow('Gift', 'Birthday bonus'),
      detailRow('Coins added', `${coinsAmount} coins`),
      detailRow(
        'Granted on',
        formatDateLabel(
          pickFirstString(payload, [
            'granted_at',
            'gift_created_at',
            'reward_created_at',
            'created_at',
          ]) || getItemFieldString(item, 'notification_created_at')
        )
      ),
      detailRow(
        'Account',
        pickFirstString(payload, ['account_name', 'wallet_name']) ||
          'ProPeloton Manager account'
      ),
    ])
  },

  getExtraText: () =>
    'Enjoy your birthday reward. You can use these coins for eligible in-game features, and you can open Pro Packages if you want to add more coins or review available package options.',

  actions: [
    {
      key: 'open-pro-packages',
      label: 'Pro Packages',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        return (
          pickFirstString(payload, [
            'pro_packages_path',
            'pro_packages_url',
            'coin_packages_path',
            'shop_path',
          ]) || '/dashboard/pro-packages'
        )
      },
      show: () => true,
    },
    {
      key: 'open-dashboard',
      label: 'Dashboard',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  WELCOME_MESSAGE: {
  defaultTitle: 'Welcome',
  defaultMessage:
    'Welcome to your cycling manager career. Start by reviewing the game manual, FAQ, and support options if you need help.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Welcome%20Message.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Welcome%20Message.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const clubName = pickFirstString(payload, [
      'club_name',
      'team_name',
      'manager_club_name',
    ])

    return {
      ...item,
      title: item.title || 'Welcome',
      message:
        item.message ||
        (clubName
          ? `Welcome to ${clubName}. Your cycling manager career has started.`
          : 'Welcome to your cycling manager career. Your club is ready to begin.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const clubName = pickFirstString(payload, [
      'club_name',
      'team_name',
      'manager_club_name',
    ])

    if (clubName) {
      return `Welcome to ${clubName}. Your cycling manager career is ready to begin.`
    }

    return (
      buildIntroFromMessage(item) ||
      'Welcome to your cycling manager career. Start by reviewing your club, squad, and first plans.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    return compactRows([
      detailRow(
        'Club',
        pickFirstString(payload, [
          'club_name',
          'team_name',
          'manager_club_name',
        ])
      ),
      detailRow(
        'Country',
        pickFirstString(payload, [
          'country_name',
          'country_code',
        ])
      ),
      detailRow(
        'Club tier',
        formatLabel(
          pickFirstString(payload, [
            'club_tier',
            'world_tier',
            'tier',
          ])
        )
      ),
      detailRow(
        'Starting balance',
        formatCurrencyLabel(
          pickFirstNumber(payload, [
            'cash_balance',
            'starting_cash',
            'club_cash',
          ]),
          '$'
        )
      ),
      detailRow(
        'Career start',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'created_game_date',
            'career_start_game_date',
            'start_game_date',
            'game_date',
          ])
        )
      ),
    ])
  },

  getExtraText: () =>
    'New managers should check the game manual and FAQ first. The forum is useful for community tips, and the contact page can be used if you need direct support.',

  actions: [
  {
    key: 'open-game-manual',
    label: 'Game manual',
    variant: 'primary',
    kind: 'navigate',
    getHref: () => '/dashboard/help',
    show: () => true,
  },
  {
    key: 'open-faq',
    label: 'FAQ',
    variant: 'secondary',
    kind: 'navigate',
    getHref: () => '/dashboard/help',
    show: () => true,
  },
  {
    key: 'open-forum',
    label: 'Forum',
    variant: 'secondary',
    kind: 'navigate',
    getHref: () => '/dashboard/forum',
    show: () => true,
  },
  {
    key: 'open-contact-us',
    label: 'Contact us',
    variant: 'secondary',
    kind: 'navigate',
    getHref: () => '/dashboard/contact-us',
    show: () => true,
  },
  MARK_READ_ACTION,
],
},
  ADMIN_MESSAGE: {
  defaultTitle: 'Admin message',
  defaultMessage:
    'You have received a message from the game administration team.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Admin%20Message.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Admin%20Message.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const adminTitle = pickFirstString(payload, [
      'admin_title',
      'message_title',
      'headline',
      'subject',
    ])

    const adminMessage = pickFirstString(payload, [
      'admin_message',
      'message_text',
      'body',
      'content',
      'description',
      'details',
    ])

    return {
      ...item,
      title: item.title || adminTitle || 'Admin message',
      message:
        item.message ||
        adminMessage ||
        'You have received a message from the game administration team.',
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    return (
      pickFirstString(payload, [
        'intro_text',
        'admin_message',
        'message_text',
        'body',
        'content',
        'description',
      ]) ||
      buildIntroFromMessage(item) ||
      'You have received a message from the game administration team.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    return compactRows([
      detailRow(
        'Category',
        formatLabel(
          pickFirstString(payload, [
            'category',
            'message_category',
            'admin_category',
            'topic',
          ])
        )
      ),
      detailRow(
        'Sender',
        pickFirstString(payload, [
          'sender_name',
          'admin_name',
          'sent_by',
          'from',
        ]) || 'Game administration'
      ),
      detailRow(
        'Priority',
        formatLabel(
          pickFirstString(payload, [
            'priority',
            'message_priority',
            'importance',
          ])
        )
      ),
      detailRow(
        'Sent on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'sent_on_game_date',
            'created_game_date',
            'message_game_date',
            'game_date',
          ])
        )
      ),
    ])
  },

  getExtraText: (item) => {
    const payload = getPayload(item)

    return (
      pickFirstString(payload, [
        'extra_text',
        'footer_text',
        'support_text',
        'note',
      ]) ||
      'Review this message carefully. If it includes an action button, open it to continue.'
    )
  },

  actions: [
    {
      key: 'open-admin-message',
      label: 'Open',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => getActionHrefFromItem(item),
      show: (item) => Boolean(getActionHrefFromItem(item)),
    },
    {
      key: 'open-dashboard',
      label: 'Dashboard',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard',
      show: () => true,
    },
    {
      key: 'open-help',
      label: 'Help',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/help',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  COIN_PURCHASE_COMPLETED: {
  defaultTitle: 'Coin purchase completed',
  defaultMessage:
    'Your coin purchase has been completed and the coins have been added to your account.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Coins%20Purchase%20Completed.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Coins%20Purchase%20Completed.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const totalCoins = pickFirstNumber(payload, [
      'total_coins',
      'coins_total',
      'coins_received',
      'coins_amount',
      'coin_amount',
      'amount_coins',
    ])

    return {
      ...item,
      title: item.title || 'Coin purchase completed',
      message:
        item.message ||
        (totalCoins !== null
          ? `Your purchase of ${formatCurrency(totalCoins)} coins has been completed.`
          : 'Your coin purchase has been completed and the coins have been added to your account.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const totalCoins = pickFirstNumber(payload, [
      'total_coins',
      'coins_total',
      'coins_received',
      'coins_amount',
      'coin_amount',
      'amount_coins',
    ])

    if (totalCoins !== null) {
      return `Your purchase of ${formatCurrency(totalCoins)} coins has been completed successfully.`
    }

    return (
      buildIntroFromMessage(item) ||
      'Your coin purchase has been completed successfully.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const purchasedCoins = pickFirstNumber(payload, [
      'purchased_coins',
      'base_coins',
      'coins_purchased',
      'coin_amount',
      'coins_amount',
    ])

    const bonusCoins = pickFirstNumber(payload, [
      'bonus_coins',
      'coins_bonus',
      'bonus_amount',
    ])

    const totalCoins = pickFirstNumber(payload, [
      'total_coins',
      'coins_total',
      'coins_received',
      'amount_coins',
    ])

    const amountPaid = pickFirstNumber(payload, [
      'amount_paid',
      'paid_amount',
      'price',
      'purchase_amount',
      'payment_amount',
      'gross_amount',
    ])

    return compactRows([
      detailRow(
        'Coins purchased',
        purchasedCoins !== null ? formatCurrency(purchasedCoins) : null
      ),
      detailRow(
        'Bonus coins',
        bonusCoins !== null ? formatCurrency(bonusCoins) : null
      ),
      detailRow(
        'Total coins received',
        totalCoins !== null ? formatCurrency(totalCoins) : null
      ),
      detailRow(
        'Amount paid',
        formatCurrencyLabel(amountPaid, '$')
      ),
      detailRow(
        'Payment status',
        formatLabel(
          pickFirstString(payload, [
            'payment_status',
            'status',
            'purchase_status',
            'transaction_status',
          ])
        ) || 'Completed'
      ),
      detailRow(
        'Provider',
        formatLabel(
          pickFirstString(payload, [
            'payment_provider',
            'provider',
            'gateway',
            'payment_gateway',
          ])
        )
      ),
      detailRow(
        'Purchased on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'purchased_on_game_date',
            'purchase_game_date',
            'completed_on_game_date',
            'created_game_date',
            'game_date',
          ])
        )
      ),
    ])
  },

  getExtraText: () =>
    'The purchased coins are now available on your account and can be used for eligible in-game actions or services.',

  actions: [
    {
      key: 'open-purchase-details',
      label: 'Open details',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => getActionHrefFromItem(item),
      show: (item) => Boolean(getActionHrefFromItem(item)),
    },
    {
      key: 'open-finance-page',
      label: 'Finance page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/finance',
      show: () => true,
    },
    {
      key: 'open-dashboard',
      label: 'Dashboard',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  REFERRAL_REWARD_GRANTED: {
  defaultTitle: 'Referral reward granted',
  defaultMessage:
    'Your referral reward has been granted and added to your account.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Referral%20Reward%20Granted.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Referral%20Reward%20Granted.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const referredName = pickFirstString(payload, [
      'referred_user_name',
      'referred_manager_name',
      'friend_name',
      'new_user_name',
      'user_name',
    ])

    const coinsReward = pickFirstNumber(payload, [
      'coins_reward',
      'coin_reward',
      'reward_coins',
      'coins_amount',
      'coin_amount',
      'amount_coins',
    ])

    const cashReward = pickFirstNumber(payload, [
      'cash_reward',
      'reward_cash',
      'cash_amount',
      'money_reward',
      'reward_amount',
    ])

    return {
      ...item,
      title: item.title || 'Referral reward granted',
      message:
        item.message ||
        (referredName && coinsReward !== null
          ? `Your referral reward for inviting ${referredName} has been granted: ${formatCurrency(coinsReward)} coins.`
          : referredName && cashReward !== null
            ? `Your referral reward for inviting ${referredName} has been granted: ${formatCurrencyLabel(cashReward, '$')}.`
            : referredName
              ? `Your referral reward for inviting ${referredName} has been granted.`
              : 'Your referral reward has been granted and added to your account.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const referredName = pickFirstString(payload, [
      'referred_user_name',
      'referred_manager_name',
      'friend_name',
      'new_user_name',
      'user_name',
    ])

    if (referredName) {
      return `Your referral for ${referredName} was successful, and your reward has been added to your account.`
    }

    return (
      buildIntroFromMessage(item) ||
      'Your referral was successful, and your reward has been added to your account.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const coinsReward = pickFirstNumber(payload, [
      'coins_reward',
      'coin_reward',
      'reward_coins',
      'coins_amount',
      'coin_amount',
      'amount_coins',
    ])

    const cashReward = pickFirstNumber(payload, [
      'cash_reward',
      'reward_cash',
      'cash_amount',
      'money_reward',
      'reward_amount',
    ])

    const reputationReward = pickFirstNumber(payload, [
      'reputation_reward',
      'reward_reputation',
      'reputation_gain',
    ])

    return compactRows([
      detailRow(
        'Referred manager',
        pickFirstString(payload, [
          'referred_user_name',
          'referred_manager_name',
          'friend_name',
          'new_user_name',
          'user_name',
        ])
      ),
      detailRow(
        'Referral code',
        pickFirstString(payload, [
          'referral_code',
          'invite_code',
          'code',
        ])
      ),
      detailRow(
        'Coins reward',
        coinsReward !== null ? `${formatCurrency(coinsReward)} coins` : null
      ),
      detailRow(
        'Cash reward',
        formatCurrencyLabel(cashReward, '$')
      ),
      detailRow(
        'Reputation reward',
        reputationReward !== null ? `+${reputationReward}` : null
      ),
      detailRow(
        'Reward status',
        formatLabel(
          pickFirstString(payload, [
            'reward_status',
            'status',
            'grant_status',
          ])
        ) || 'Granted'
      ),
      detailRow(
        'Granted on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'granted_on_game_date',
            'reward_game_date',
            'created_game_date',
            'game_date',
          ])
        )
      ),
    ])
  },

  getExtraText: () =>
    'Referral rewards help your account progress faster. Share your referral code with other managers to invite more players.',

  actions: [
    {
      key: 'open-referral-details',
      label: 'Open details',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => getActionHrefFromItem(item),
      show: (item) => Boolean(getActionHrefFromItem(item)),
    },
    {
      key: 'open-finance-page',
      label: 'Finance page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/finance',
      show: () => true,
    },
    {
      key: 'open-dashboard',
      label: 'Dashboard',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  SPONSOR_DEAL_EXPIRED: {
  defaultTitle: 'Sponsor deal expired',
  defaultMessage:
    'One of your sponsor agreements has expired. Review your sponsor options and finances.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Sponsor%20deal%20Expired.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Sponsor%20deal%20Expired.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const sponsorName = pickFirstString(payload, [
      'sponsor_name',
      'partner_name',
      'company_name',
      'name',
    ])

    return {
      ...item,
      title: sponsorName
        ? `Sponsor deal expired: ${sponsorName}`
        : item.title || 'Sponsor deal expired',
      message:
        item.message ||
        (sponsorName
          ? `Your sponsor agreement with ${sponsorName} has expired.`
          : 'One of your sponsor agreements has expired.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const sponsorName = pickFirstString(payload, [
      'sponsor_name',
      'partner_name',
      'company_name',
      'name',
    ])

    return sponsorName
      ? `Your sponsor agreement with ${sponsorName} has expired. Review your sponsor situation and decide the next step.`
      : buildIntroFromMessage(item) ||
          'One of your sponsor agreements has expired. Review your sponsor situation and decide the next step.'
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const annualValue = pickFirstNumber(payload, [
      'annual_value',
      'deal_value',
      'contract_value',
      'sponsor_value',
      'yearly_value',
    ])

    const totalValue = pickFirstNumber(payload, [
      'total_value',
      'total_contract_value',
      'contract_total',
    ])

    return compactRows([
      detailRow(
        'Sponsor',
        pickFirstString(payload, [
          'sponsor_name',
          'partner_name',
          'company_name',
          'name',
        ])
      ),
      detailRow(
        'Annual value',
        formatCurrencyLabel(annualValue, '$')
      ),
      detailRow(
        'Total value',
        formatCurrencyLabel(totalValue, '$')
      ),
      detailRow(
        'Contract status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'deal_status',
            'contract_status',
          ])
        ) || 'Expired'
      ),
      detailRow(
        'Expired on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'expired_on_game_date',
            'expires_on_game_date',
            'expires_at',
            'expired_at',
            'end_game_date',
            'contract_end_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'Next step',
        pickFirstString(payload, [
          'next_step',
          'recommendation',
          'action_required_text',
        ]) || 'Review available sponsor offers.'
      ),
    ])
  },

  getExtraText: () =>
    'An expired sponsor deal can reduce future income. Open the sponsor tab in Finance to review available offers or prepare a replacement deal.',

  actions: [
    {
      key: 'open-sponsor-tab',
      label: 'Open sponsor tab',
      variant: 'primary',
      kind: 'navigate',
      getHref: () => '/dashboard/finance?tab=sponsors',
      show: () => true,
    },
    {
      key: 'open-finance-page',
      label: 'Finance page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/finance',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  FREE_AGENT_NEGOTIATION_STARTED: {
  defaultTitle: 'Free agent negotiation started',
  defaultMessage:
    'A free agent contract negotiation has started. Review the proposed terms before it expires.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Free%20Agent%20Negotiation%20Started.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Free%20Agent%20Negotiation%20Started.png',

  enrich: (item) => {
    const riderName = getPreferredRiderName(item)

    return {
      ...item,
      title: riderName
        ? `Free agent negotiation: ${riderName}`
        : item.title || 'Free agent negotiation started',
      message:
        item.message ||
        (riderName
          ? `${riderName} has entered free agent contract negotiations with your club.`
          : 'A free agent contract negotiation has started.'),
    }
  },

  getIntroText: (item) => {
    const riderName = getPreferredRiderName(item)

    return riderName
      ? `${riderName} is negotiating contract terms with your club from the free agent market.`
      : buildIntroFromMessage(item) ||
          'A free agent is negotiating contract terms with your club.'
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const weeklySalary = pickFirstNumber(payload, [
      'offer_salary_weekly',
      'salary_weekly',
      'weekly_salary',
      'proposed_salary_weekly',
      'expected_salary_weekly',
    ])

    const minAcceptableSalary = pickFirstNumber(payload, [
      'min_acceptable_salary_weekly',
      'minimum_salary_weekly',
      'minimum_weekly_salary',
    ])

    const signingBonus = pickFirstNumber(payload, [
      'signing_bonus',
      'offered_signing_bonus',
      'signing_bonus_amount',
      'bonus_amount',
    ])

    const agentFee = pickFirstNumber(payload, [
      'agent_fee',
      'offered_agent_fee',
      'agent_fee_amount',
      'agency_fee',
      'agent_commission',
    ])

    const durationSeasons = pickFirstNumber(payload, [
      'offer_duration_seasons',
      'duration_seasons',
      'contract_years',
      'proposed_duration_seasons',
      'preferred_duration_seasons',
    ])

    return compactRows([
      detailRow('Rider', getPreferredRiderName(item)),
      detailRow('Source', 'Free agent market'),
      detailRow(
        'Club',
        pickFirstString(payload, [
          'buyer_club_name',
          'club_name',
          'team_name',
        ])
      ),
      detailRow(
        'Offered salary',
        weeklySalary !== null ? `${formatCurrencyLabel(weeklySalary, '$')}/week` : null
      ),
      detailRow(
        'Minimum acceptable salary',
        minAcceptableSalary !== null
          ? `${formatCurrencyLabel(minAcceptableSalary, '$')}/week`
          : null
      ),
      detailRow(
        'Signing bonus',
        signingBonus !== null ? formatCurrencyLabel(signingBonus, '$') : null
      ),
      detailRow(
        'Agent fee',
        agentFee !== null ? formatCurrencyLabel(agentFee, '$') : null
      ),
      detailRow(
        'Contract duration',
        durationSeasons !== null
          ? `${durationSeasons} season${durationSeasons === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Negotiation status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'negotiation_status',
          ])
        ) || 'Active'
      ),
      detailRow(
        'Expires',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'expires_on_game_date',
            'negotiation_expires_on_game_date',
            'expires_at',
            'deadline_at',
            'deadline_game_date',
            'game_date',
          ])
        )
      ),
    ])
  },

  getExtraText: (item) => {
    const riderName = getPreferredRiderName(item)

    return riderName
      ? `Review ${riderName}'s contract expectations before the negotiation expires. Free agents do not require a transfer fee, but salary, signing bonus, and agent fee can still affect your budget.`
      : 'Review the contract expectations before the negotiation expires. Free agents do not require a transfer fee, but salary, signing bonus, and agent fee can still affect your budget.'
  },

  actions: [
    {
      key: 'open-rider-profile',
      label: 'Rider profile',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        const directProfilePath = pickFirstString(payload, [
          'external_rider_profile_path',
          'public_rider_profile_path',
          'rider_profile_path',
          'rider_path',
          'profile_path',
        ])

        if (
          directProfilePath &&
          !/negotiation/i.test(directProfilePath) &&
          !/transfers\/negotiations/i.test(directProfilePath) &&
          !/activity=/i.test(directProfilePath)
        ) {
          return directProfilePath
        }

        const riderId = pickFirstString(payload, ['rider_id'])
        return riderId ? `/dashboard/external-riders/${riderId}` : null
      },
      show: (item) => {
        const payload = getPayload(item)

        return Boolean(
          pickFirstString(payload, [
            'external_rider_profile_path',
            'public_rider_profile_path',
            'rider_profile_path',
            'rider_path',
            'profile_path',
            'rider_id',
          ])
        )
      },
    },
    {
      key: 'review-negotiation',
      label: 'Review negotiation',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) =>
        pickFirstString(getPayload(item), [
          'negotiation_path',
          'free_agent_negotiation_path',
          'contract_negotiation_path',
        ]) ||
        getActionHrefFromItem(item) ||
        '/dashboard/transfers?subTab=free_agents',
      show: () => true,
    },
    {
      key: 'open-free-agents-page',
      label: 'Free agents page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/transfers?subTab=free_agents',
      show: () => true,
    },
    {
      key: 'open-transfers-page',
      label: 'Transfers page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/transfers',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  FREE_AGENT_EXPIRED: {
  defaultTitle: 'Free agent expired',
  defaultMessage:
    'A free agent opportunity has expired. Review the market for other available riders.',

  imageSrc:
    'PASTE_FREE_AGENT_EXPIRED_IMAGE_URL_HERE',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'PASTE_FREE_AGENT_EXPIRED_IMAGE_URL_HERE',

  enrich: (item) => {
    const riderName = getPreferredRiderName(item)

    return {
      ...item,
      title: riderName
        ? `Free agent expired: ${riderName}`
        : item.title || 'Free agent expired',
      message:
        item.message ||
        (riderName
          ? `${riderName} is no longer available as a free agent.`
          : 'A free agent opportunity has expired.'),
    }
  },

  getIntroText: (item) => {
    const riderName = getPreferredRiderName(item)

    return riderName
      ? `${riderName} is no longer available on the free agent market.`
      : buildIntroFromMessage(item) ||
          'A free agent opportunity has expired and is no longer available.'
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const weeklySalary = pickFirstNumber(payload, [
      'salary_weekly',
      'weekly_salary',
      'expected_salary_weekly',
      'offer_salary_weekly',
      'proposed_salary_weekly',
    ])

    const signingBonus = pickFirstNumber(payload, [
      'signing_bonus',
      'offered_signing_bonus',
      'signing_bonus_amount',
      'bonus_amount',
    ])

    const agentFee = pickFirstNumber(payload, [
      'agent_fee',
      'offered_agent_fee',
      'agent_fee_amount',
      'agency_fee',
      'agent_commission',
    ])

    const durationSeasons = pickFirstNumber(payload, [
      'duration_seasons',
      'offer_duration_seasons',
      'contract_years',
      'proposed_duration_seasons',
      'preferred_duration_seasons',
    ])

    return compactRows([
      detailRow('Rider', getPreferredRiderName(item)),
      detailRow('Source', 'Free agent market'),
      detailRow(
        'Expected salary',
        weeklySalary !== null
          ? `${formatCurrencyLabel(weeklySalary, '$')}/week`
          : null
      ),
      detailRow(
        'Signing bonus',
        signingBonus !== null ? formatCurrencyLabel(signingBonus, '$') : null
      ),
      detailRow(
        'Agent fee',
        agentFee !== null ? formatCurrencyLabel(agentFee, '$') : null
      ),
      detailRow(
        'Contract duration',
        durationSeasons !== null
          ? `${durationSeasons} season${durationSeasons === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'free_agent_status',
            'negotiation_status',
          ])
        ) || 'Expired'
      ),
      detailRow(
        'Expired on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'expired_on_game_date',
            'expires_on_game_date',
            'free_agent_expires_on_game_date',
            'negotiation_expires_on_game_date',
            'expires_at',
            'expired_at',
            'deadline_at',
            'deadline_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'Next step',
        pickFirstString(payload, [
          'next_step',
          'recommendation',
          'action_required_text',
        ]) || 'Review the free agent market for other available riders.'
      ),
    ])
  },

  getExtraText: (item) => {
    const riderName = getPreferredRiderName(item)

    return riderName
      ? `${riderName} can no longer be signed from the free agent market. Check available free agents or look for another transfer target.`
      : 'This rider can no longer be signed from the free agent market. Check available free agents or look for another transfer target.'
  },

  actions: [
    {
      key: 'open-rider-profile',
      label: 'Rider profile',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        const directProfilePath = pickFirstString(payload, [
          'external_rider_profile_path',
          'public_rider_profile_path',
          'rider_profile_path',
          'rider_path',
          'profile_path',
        ])

        if (
          directProfilePath &&
          !/negotiation/i.test(directProfilePath) &&
          !/transfers\/negotiations/i.test(directProfilePath) &&
          !/activity=/i.test(directProfilePath)
        ) {
          return directProfilePath
        }

        const riderId = pickFirstString(payload, ['rider_id'])
        return riderId ? `/dashboard/external-riders/${riderId}` : null
      },
      show: (item) => {
        const payload = getPayload(item)

        return Boolean(
          pickFirstString(payload, [
            'external_rider_profile_path',
            'public_rider_profile_path',
            'rider_profile_path',
            'rider_path',
            'profile_path',
            'rider_id',
          ])
        )
      },
    },
    {
      key: 'open-free-agents-page',
      label: 'Free agents page',
      variant: 'primary',
      kind: 'navigate',
      getHref: () => '/dashboard/transfers?subTab=free_agents',
      show: () => true,
    },
    {
      key: 'open-transfers-page',
      label: 'Transfers page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/transfers',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  FREE_AGENT_EXPIRED: {
  defaultTitle: 'Free agent expired',
  defaultMessage:
    'A free agent opportunity has expired. Review the market for other available riders.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Free%20Agent%20Expired.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Free%20Agent%20Expired.png',

  enrich: (item) => {
    const riderName = getPreferredRiderName(item)

    return {
      ...item,
      title: riderName
        ? `Free agent expired: ${riderName}`
        : item.title || 'Free agent expired',
      message:
        item.message ||
        (riderName
          ? `${riderName} is no longer available as a free agent.`
          : 'A free agent opportunity has expired.'),
    }
  },

  getIntroText: (item) => {
    const riderName = getPreferredRiderName(item)

    return riderName
      ? `${riderName} is no longer available on the free agent market.`
      : buildIntroFromMessage(item) ||
          'A free agent opportunity has expired and is no longer available.'
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const weeklySalary = pickFirstNumber(payload, [
      'salary_weekly',
      'weekly_salary',
      'expected_salary_weekly',
      'offer_salary_weekly',
      'proposed_salary_weekly',
    ])

    const signingBonus = pickFirstNumber(payload, [
      'signing_bonus',
      'offered_signing_bonus',
      'signing_bonus_amount',
      'bonus_amount',
    ])

    const agentFee = pickFirstNumber(payload, [
      'agent_fee',
      'offered_agent_fee',
      'agent_fee_amount',
      'agency_fee',
      'agent_commission',
    ])

    const durationSeasons = pickFirstNumber(payload, [
      'duration_seasons',
      'offer_duration_seasons',
      'contract_years',
      'proposed_duration_seasons',
      'preferred_duration_seasons',
    ])

    return compactRows([
      detailRow('Rider', getPreferredRiderName(item)),
      detailRow('Source', 'Free agent market'),
      detailRow(
        'Expected salary',
        weeklySalary !== null
          ? `${formatCurrencyLabel(weeklySalary, '$')}/week`
          : null
      ),
      detailRow(
        'Signing bonus',
        signingBonus !== null ? formatCurrencyLabel(signingBonus, '$') : null
      ),
      detailRow(
        'Agent fee',
        agentFee !== null ? formatCurrencyLabel(agentFee, '$') : null
      ),
      detailRow(
        'Contract duration',
        durationSeasons !== null
          ? `${durationSeasons} season${durationSeasons === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'free_agent_status',
            'negotiation_status',
          ])
        ) || 'Expired'
      ),
      detailRow(
        'Expired on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'expired_on_game_date',
            'expires_on_game_date',
            'free_agent_expires_on_game_date',
            'negotiation_expires_on_game_date',
            'expires_at',
            'expired_at',
            'deadline_at',
            'deadline_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'Next step',
        pickFirstString(payload, [
          'next_step',
          'recommendation',
          'action_required_text',
        ]) || 'Review the free agent market for other available riders.'
      ),
    ])
  },

  getExtraText: (item) => {
    const riderName = getPreferredRiderName(item)

    return riderName
      ? `${riderName} can no longer be signed from the free agent market. Check available free agents or look for another transfer target.`
      : 'This rider can no longer be signed from the free agent market. Check available free agents or look for another transfer target.'
  },

  actions: [
    {
      key: 'open-rider-profile',
      label: 'Rider profile',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        const directProfilePath = pickFirstString(payload, [
          'external_rider_profile_path',
          'public_rider_profile_path',
          'rider_profile_path',
          'rider_path',
          'profile_path',
        ])

        if (
          directProfilePath &&
          !/negotiation/i.test(directProfilePath) &&
          !/transfers\/negotiations/i.test(directProfilePath) &&
          !/activity=/i.test(directProfilePath)
        ) {
          return directProfilePath
        }

        const riderId = pickFirstString(payload, ['rider_id'])
        return riderId ? `/dashboard/external-riders/${riderId}` : null
      },
      show: (item) => {
        const payload = getPayload(item)

        return Boolean(
          pickFirstString(payload, [
            'external_rider_profile_path',
            'public_rider_profile_path',
            'rider_profile_path',
            'rider_path',
            'profile_path',
            'rider_id',
          ])
        )
      },
    },
    {
      key: 'open-free-agents-page',
      label: 'Free agents page',
      variant: 'primary',
      kind: 'navigate',
      getHref: () => '/dashboard/transfers?subTab=free_agents',
      show: () => true,
    },
    {
      key: 'open-transfers-page',
      label: 'Transfers page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/transfers',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  INFRASTRUCTURE_UPGRADE_COMPLETED: {
  defaultTitle: 'Infrastructure upgrade completed',
  defaultMessage:
    'One of your facilities has finished upgrading and is now available at its new level.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Infrastructure%20upgdare%20completed.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Infrastructure%20upgdare%20completed.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const facilityName = pickFirstString(payload, [
      'facility_name',
      'facility_label',
      'upgrade_name',
      'name',
    ])

    const newLevel = pickFirstNumber(payload, [
      'new_level',
      'level',
      'upgraded_level',
      'target_level',
    ])

    return {
      ...item,
      title: facilityName
        ? `Upgrade completed: ${facilityName}`
        : item.title || 'Infrastructure upgrade completed',
      message:
        item.message ||
        (facilityName && newLevel !== null
          ? `${facilityName} has reached level ${newLevel}.`
          : facilityName
            ? `${facilityName} has finished upgrading.`
            : 'One of your facilities has finished upgrading.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const facilityName = pickFirstString(payload, [
      'facility_name',
      'facility_label',
      'upgrade_name',
      'name',
    ])

    const newLevel = pickFirstNumber(payload, [
      'new_level',
      'level',
      'upgraded_level',
      'target_level',
    ])

    if (facilityName && newLevel !== null) {
      return `${facilityName} has been upgraded successfully and is now available at level ${newLevel}.`
    }

    if (facilityName) {
      return `${facilityName} has been upgraded successfully and is now available.`
    }

    return (
      buildIntroFromMessage(item) ||
      'One of your infrastructure upgrades has been completed successfully.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const previousLevel = pickFirstNumber(payload, [
      'previous_level',
      'old_level',
      'from_level',
      'level_before',
    ])

    const newLevel = pickFirstNumber(payload, [
      'new_level',
      'level',
      'upgraded_level',
      'target_level',
      'to_level',
      'level_after',
    ])

    const upgradeCost = pickFirstNumber(payload, [
      'upgrade_cost',
      'cost_cash',
      'cash_cost',
      'price',
      'upgrade_price',
    ])

    return compactRows([
      detailRow(
        'Facility',
        pickFirstString(payload, [
          'facility_name',
          'facility_label',
          'upgrade_name',
          'name',
        ])
      ),
      detailRow(
        'Previous level',
        previousLevel !== null ? `${previousLevel}` : null
      ),
      detailRow(
        'New level',
        newLevel !== null ? `${newLevel}` : null
      ),
      detailRow(
        'Upgrade cost',
        formatCurrencyLabel(upgradeCost, '$')
      ),
      detailRow(
        'Completed on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'completed_on_game_date',
            'completed_game_date',
            'completed_at',
            'finished_at',
            'finished_on_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'Status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'upgrade_status',
            'job_status',
          ])
        ) || 'Completed'
      ),
      detailRow(
        'Effect',
        pickFirstString(payload, [
          'effect_summary',
          'bonus_summary',
          'upgrade_effect',
          'benefit_text',
          'description',
        ])
      ),
    ])
  },

  getExtraText: () =>
    'Review your infrastructure page to see the new facility effects and decide your next upgrade step.',

  actions: [
    {
      key: 'open-infrastructure-facilities',
      label: 'Open infrastructure',
      variant: 'primary',
      kind: 'navigate',
      getHref: () => '/dashboard/infrastructure?tab=facilities',
      show: () => true,
    },
    {
      key: 'open-infrastructure-page',
      label: 'Infrastructure page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/infrastructure',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  FINANCE_EMERGENCY_LOAN_GRANTED: {
  defaultTitle: 'Emergency loan granted',
  defaultMessage:
    'Your club has received an emergency loan because it could not cover a mandatory obligation.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Emergency%20loan%20granted.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Emergency%20loan%20granted.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const principalAmount = pickFirstNumber(payload, [
      'principal_amount',
      'loan_amount',
      'amount',
      'emergency_loan_amount',
    ])

    const clubName = pickFirstString(payload, [
      'club_name',
      'team_name',
    ])

    return {
      ...item,
      title:
        principalAmount !== null
          ? `Emergency loan granted: ${formatCurrencyLabel(principalAmount, '$')}`
          : item.title || 'Emergency loan granted',
      message:
        item.message ||
        (clubName && principalAmount !== null
          ? `${clubName} received an emergency loan of ${formatCurrencyLabel(principalAmount, '$')} because it could not cover a mandatory obligation.`
          : principalAmount !== null
            ? `Your club received an emergency loan of ${formatCurrencyLabel(principalAmount, '$')}.`
            : 'Your club has received an emergency loan because it could not cover a mandatory obligation.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const clubName = pickFirstString(payload, [
      'club_name',
      'team_name',
    ])

    const principalAmount = pickFirstNumber(payload, [
      'principal_amount',
      'loan_amount',
      'amount',
      'emergency_loan_amount',
    ])

    const reasonLabel =
      pickFirstString(payload, [
        'reason_label',
        'reason',
        'obligation_reason',
      ]) || 'mandatory obligation'

    if (clubName && principalAmount !== null) {
      return `${clubName} received an emergency loan of ${formatCurrencyLabel(principalAmount, '$')} because it could not cover ${reasonLabel}.`
    }

    if (principalAmount !== null) {
      return `Your club received an emergency loan of ${formatCurrencyLabel(principalAmount, '$')} because it could not cover ${reasonLabel}.`
    }

    return (
      buildIntroFromMessage(item) ||
      'Your club received an emergency loan because it could not cover a mandatory obligation.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const principalAmount = pickFirstNumber(payload, [
      'principal_amount',
      'loan_amount',
      'amount',
      'emergency_loan_amount',
    ])

    const outstandingPrincipal = pickFirstNumber(payload, [
      'outstanding_principal',
      'remaining_principal',
    ])

    const weeklyTotalDue = pickFirstNumber(payload, [
      'weekly_total_due',
      'weekly_repayment',
      'weekly_due',
    ])

    const weeklyPrincipalDue = pickFirstNumber(payload, [
      'weekly_principal_due',
      'weekly_principal',
    ])

    const weeklyInterestDue = pickFirstNumber(payload, [
      'weekly_interest_due',
      'weekly_interest',
    ])

    const totalInterest = pickFirstNumber(payload, [
      'total_interest',
      'interest_total',
    ])

    const totalRepayment = pickFirstNumber(payload, [
      'total_repayment',
      'repayment_total',
      'total_due',
    ])

    const repaymentWeeks = pickFirstNumber(payload, [
      'repayment_weeks',
      'weeks',
      'loan_weeks',
    ])

    const rescueNumber = pickFirstNumber(payload, [
      'rescue_number',
      'rescues_used_lifetime',
      'rescues_used',
    ])

    const maxRescues = pickFirstNumber(payload, [
      'max_lifetime_rescues',
      'max_rescues',
      'rescue_limit',
    ])

    return compactRows([
      detailRow(
        'Club',
        pickFirstString(payload, [
          'club_name',
          'team_name',
        ])
      ),
      detailRow(
        'Reason',
        formatLabel(
          pickFirstString(payload, [
            'reason_label',
            'reason',
            'obligation_reason',
          ])
        )
      ),
      detailRow(
        'Loan amount',
        formatCurrencyLabel(principalAmount, '$')
      ),
      detailRow(
        'Outstanding principal',
        formatCurrencyLabel(outstandingPrincipal, '$')
      ),
      detailRow(
        'Weekly repayment',
        formatCurrencyLabel(weeklyTotalDue, '$')
      ),
      detailRow(
        'Weekly principal',
        formatCurrencyLabel(weeklyPrincipalDue, '$')
      ),
      detailRow(
        'Weekly emergency interest',
        formatCurrencyLabel(weeklyInterestDue, '$')
      ),
      detailRow(
        'Repayment period',
        repaymentWeeks !== null
          ? `${repaymentWeeks} week${repaymentWeeks === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Total interest',
        formatCurrencyLabel(totalInterest, '$')
      ),
      detailRow(
        'Total repayment',
        formatCurrencyLabel(totalRepayment, '$')
      ),
      detailRow(
        'First due date',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'first_due_game_date',
            'first_due_date',
            'next_due_game_date',
          ])
        )
      ),
      detailRow(
        'Final due date',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'final_due_game_date',
            'final_due_date',
            'due_game_date',
          ])
        )
      ),
      detailRow(
        'Issued on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'issued_game_date',
            'issued_on_game_date',
            'created_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'Emergency rescues used',
        rescueNumber !== null && maxRescues !== null
          ? `${rescueNumber} of ${maxRescues}`
          : rescueNumber !== null
            ? `${rescueNumber}`
            : null
      ),
      detailRow(
        'Status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'loan_status',
            'repayment_status',
          ])
        ) || 'Granted'
      ),
    ])
  },

  getExtraText: (item) => {
    const payload = getPayload(item)

    const rescueNumber = pickFirstNumber(payload, [
      'rescue_number',
      'rescues_used_lifetime',
      'rescues_used',
    ])

    const maxRescues = pickFirstNumber(payload, [
      'max_lifetime_rescues',
      'max_rescues',
      'rescue_limit',
    ])

    const liquidationRule = pickFirstString(payload, [
      'liquidation_rule',
      'liquidation_warning',
    ])

    const optionalRule = pickFirstString(payload, [
      'optional_spending_rule',
      'optional_purchase_rule',
    ])

    if (rescueNumber !== null && maxRescues !== null && rescueNumber >= maxRescues) {
      return liquidationRule ||
        `This was emergency rescue ${rescueNumber} of ${maxRescues}. If the club fails another mandatory obligation, liquidation may be triggered. Optional purchases and upgrades should be controlled carefully.`
    }

    return (
      optionalRule ||
      'Emergency loans are only used for mandatory obligations. Review your finances and upcoming repayments to avoid further rescue loans.'
    )
  },

  actions: [
    {
      key: 'open-finance-transactions',
      label: 'Open transactions',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) =>
        getActionHrefFromItem(item) ||
        '/dashboard/finance?tab=transactions',
      show: () => true,
    },
    {
      key: 'open-finance-page',
      label: 'Finance page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/finance',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  FINANCE_EMERGENCY_LOAN_REPAID: {
  defaultTitle: 'Emergency loan repaid',
  defaultMessage:
    'Your club has fully repaid an emergency loan. The repayment obligation is now closed.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Emergancy%20Loan%20repaid.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Emergancy%20Loan%20repaid.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const clubName = pickFirstString(payload, [
      'club_name',
      'team_name',
    ])

    const totalRepaid = pickFirstNumber(payload, [
      'total_repaid',
      'total_repayment',
      'repaid_amount',
      'amount_repaid',
      'total_paid',
    ])

    return {
      ...item,
      title:
        totalRepaid !== null
          ? `Emergency loan repaid: ${formatCurrencyLabel(totalRepaid, '$')}`
          : item.title || 'Emergency loan repaid',
      message:
        item.message ||
        (clubName && totalRepaid !== null
          ? `${clubName} has fully repaid an emergency loan totaling ${formatCurrencyLabel(totalRepaid, '$')}.`
          : totalRepaid !== null
            ? `Your club has fully repaid an emergency loan totaling ${formatCurrencyLabel(totalRepaid, '$')}.`
            : 'Your club has fully repaid an emergency loan.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const clubName = pickFirstString(payload, [
      'club_name',
      'team_name',
    ])

    const totalRepaid = pickFirstNumber(payload, [
      'total_repaid',
      'total_repayment',
      'repaid_amount',
      'amount_repaid',
      'total_paid',
    ])

    if (clubName && totalRepaid !== null) {
      return `${clubName} has fully repaid its emergency loan. Total repayment: ${formatCurrencyLabel(totalRepaid, '$')}.`
    }

    if (totalRepaid !== null) {
      return `Your club has fully repaid its emergency loan. Total repayment: ${formatCurrencyLabel(totalRepaid, '$')}.`
    }

    return (
      buildIntroFromMessage(item) ||
      'Your club has fully repaid its emergency loan. The repayment obligation is now closed.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const principalAmount = pickFirstNumber(payload, [
      'principal_amount',
      'loan_amount',
      'original_principal',
      'emergency_loan_amount',
    ])

    const principalRepaid = pickFirstNumber(payload, [
      'principal_repaid',
      'repaid_principal',
      'principal_paid',
    ])

    const interestPaid = pickFirstNumber(payload, [
      'interest_paid',
      'total_interest',
      'interest_total',
      'emergency_interest_paid',
    ])

    const totalRepaid = pickFirstNumber(payload, [
      'total_repaid',
      'total_repayment',
      'repaid_amount',
      'amount_repaid',
      'total_paid',
    ])

    const repaymentWeeks = pickFirstNumber(payload, [
      'repayment_weeks',
      'weeks',
      'loan_weeks',
      'paid_weeks',
    ])

    const rescueNumber = pickFirstNumber(payload, [
      'rescue_number',
      'rescues_used_lifetime',
      'rescues_used',
    ])

    const maxRescues = pickFirstNumber(payload, [
      'max_lifetime_rescues',
      'max_rescues',
      'rescue_limit',
    ])

    return compactRows([
      detailRow(
        'Club',
        pickFirstString(payload, [
          'club_name',
          'team_name',
        ])
      ),
      detailRow(
        'Original loan amount',
        formatCurrencyLabel(principalAmount, '$')
      ),
      detailRow(
        'Principal repaid',
        formatCurrencyLabel(principalRepaid, '$')
      ),
      detailRow(
        'Interest paid',
        formatCurrencyLabel(interestPaid, '$')
      ),
      detailRow(
        'Total repaid',
        formatCurrencyLabel(totalRepaid, '$')
      ),
      detailRow(
        'Repayment period',
        repaymentWeeks !== null
          ? `${repaymentWeeks} week${repaymentWeeks === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'First due date',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'first_due_game_date',
            'first_due_date',
          ])
        )
      ),
      detailRow(
        'Final due date',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'final_due_game_date',
            'final_due_date',
            'due_game_date',
          ])
        )
      ),
      detailRow(
        'Repaid on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'repaid_on_game_date',
            'repaid_game_date',
            'completed_game_date',
            'closed_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'Emergency rescue',
        rescueNumber !== null && maxRescues !== null
          ? `${rescueNumber} of ${maxRescues}`
          : rescueNumber !== null
            ? `${rescueNumber}`
            : null
      ),
      detailRow(
        'Loan status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'loan_status',
            'repayment_status',
          ])
        ) || 'Repaid'
      ),
    ])
  },

  getExtraText: () =>
    'This emergency loan is now closed. No further weekly repayments are due for this loan, but previous emergency rescues still count toward the lifetime rescue limit.',

  actions: [
    {
      key: 'open-finance-transactions',
      label: 'Open transactions',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) =>
        getActionHrefFromItem(item) ||
        '/dashboard/finance?tab=transactions',
      show: () => true,
    },
    {
      key: 'open-finance-page',
      label: 'Finance page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/finance',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  FINANCE_LIQUIDATION_FINAL_WARNING: {
  defaultTitle: 'Final liquidation warning',
  defaultMessage:
    'Your club is at risk of liquidation because all emergency rescues have already been used.',

  imageSrc:    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Liquidation%20Final%20Warning.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Liquidation%20Final%20Warning.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const clubName = pickFirstString(payload, [
      'club_name',
      'team_name',
    ])

    const shortfallAmount = pickFirstNumber(payload, [
      'shortfall_amount',
      'missing_amount',
      'amount_short',
      'unpaid_amount',
      'required_amount',
      'obligation_amount',
    ])

    return {
      ...item,
      title: clubName
        ? `Final liquidation warning: ${clubName}`
        : item.title || 'Final liquidation warning',
      message:
        item.message ||
        (clubName && shortfallAmount !== null
          ? `${clubName} is at risk of liquidation because it cannot cover ${formatCurrencyLabel(shortfallAmount, '$')} after all emergency rescues have been used.`
          : clubName
            ? `${clubName} is at risk of liquidation because all emergency rescues have already been used.`
            : 'Your club is at risk of liquidation because all emergency rescues have already been used.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const clubName = pickFirstString(payload, [
      'club_name',
      'team_name',
    ])

    const reasonLabel =
      pickFirstString(payload, [
        'reason_label',
        'reason',
        'obligation_reason',
        'liquidation_reason',
      ]) || 'mandatory obligation'

    if (clubName) {
      return `${clubName} has reached the final liquidation warning. The club could not cover ${reasonLabel}, and no further emergency rescues are available.`
    }

    return (
      buildIntroFromMessage(item) ||
      'Your club has reached the final liquidation warning. No further emergency rescues are available.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const availableCash = pickFirstNumber(payload, [
      'available_cash',
      'cash_balance',
      'club_cash',
      'current_cash',
    ])

    const obligationAmount = pickFirstNumber(payload, [
      'obligation_amount',
      'required_amount',
      'mandatory_amount',
      'amount_due',
    ])

    const shortfallAmount = pickFirstNumber(payload, [
      'shortfall_amount',
      'missing_amount',
      'amount_short',
      'unpaid_amount',
    ])

    const rescuesUsed = pickFirstNumber(payload, [
      'rescues_used_lifetime',
      'rescues_used',
      'rescue_number',
    ])

    const maxRescues = pickFirstNumber(payload, [
      'max_lifetime_rescues',
      'max_rescues',
      'rescue_limit',
    ])

    return compactRows([
      detailRow(
        'Club',
        pickFirstString(payload, [
          'club_name',
          'team_name',
        ])
      ),
      detailRow(
        'Reason',
        formatLabel(
          pickFirstString(payload, [
            'reason_label',
            'reason',
            'obligation_reason',
            'liquidation_reason',
          ])
        )
      ),
      detailRow(
        'Available cash',
        formatCurrencyLabel(availableCash, '$')
      ),
      detailRow(
        'Mandatory obligation',
        formatCurrencyLabel(obligationAmount, '$')
      ),
      detailRow(
        'Shortfall',
        formatCurrencyLabel(shortfallAmount, '$')
      ),
      detailRow(
        'Emergency rescues used',
        rescuesUsed !== null && maxRescues !== null
          ? `${rescuesUsed} of ${maxRescues}`
          : rescuesUsed !== null
            ? `${rescuesUsed}`
            : null
      ),
      detailRow(
        'Warning date',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'warning_game_date',
            'issued_game_date',
            'created_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'Deadline',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'deadline_game_date',
            'liquidation_deadline_game_date',
            'final_due_game_date',
            'due_game_date',
          ])
        )
      ),
      detailRow(
        'Status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'finance_status',
            'warning_status',
          ])
        ) || 'Final warning'
      ),
    ])
  },

  getExtraText: (item) => {
    const payload = getPayload(item)

    return (
      pickFirstString(payload, [
        'liquidation_rule',
        'liquidation_warning',
        'warning_text',
      ]) ||
      'This is the final warning before liquidation. Emergency rescues have already been used, so the next unpaid mandatory obligation can liquidate the club. Review finances immediately and avoid new optional spending.'
    )
  },

  actions: [
    {
      key: 'open-finance-transactions',
      label: 'Open transactions',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) =>
        getActionHrefFromItem(item) ||
        '/dashboard/finance?tab=transactions',
      show: () => true,
    },
    {
      key: 'open-finance-page',
      label: 'Finance page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/finance',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  FINANCE_CLUB_LIQUIDATED: {
  defaultTitle: 'Club liquidated',
  defaultMessage:
    'A club has been liquidated because it could not cover a mandatory obligation after all emergency rescues were used.',

  imageSrc:   'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Club%20Liquidated.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Club%20Liquidated.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const clubName = pickFirstString(payload, [
      'club_name',
      'team_name',
    ])

    return {
      ...item,
      title: clubName
        ? `Club liquidated: ${clubName}`
        : item.title || 'Club liquidated',
      message:
        item.message ||
        (clubName
          ? `${clubName} has been liquidated because no further emergency rescues were available.`
          : 'A club has been liquidated because no further emergency rescues were available.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const clubName = pickFirstString(payload, [
      'club_name',
      'team_name',
    ])

    const reason =
      pickFirstString(payload, [
        'liquidation_reason',
        'reason_label',
        'reason',
        'obligation_reason',
      ]) || 'an unpaid mandatory obligation'

    if (clubName) {
      return `${clubName} has been liquidated after failing to cover ${reason}. No further emergency rescues were available.`
    }

    return (
      buildIntroFromMessage(item) ||
      'The club has been liquidated after failing to cover a mandatory obligation. No further emergency rescues were available.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const availableCash = pickFirstNumber(payload, [
      'available_cash',
      'cash_balance',
      'club_cash',
      'current_cash',
    ])

    const obligationAmount = pickFirstNumber(payload, [
      'obligation_amount',
      'required_amount',
      'mandatory_amount',
      'amount_due',
      'unpaid_amount',
    ])

    const shortfallAmount = pickFirstNumber(payload, [
      'shortfall_amount',
      'missing_amount',
      'amount_short',
    ])

    const rescuesUsed = pickFirstNumber(payload, [
      'rescues_used_lifetime',
      'rescues_used',
      'rescue_number',
    ])

    const maxRescues = pickFirstNumber(payload, [
      'max_lifetime_rescues',
      'max_rescues',
      'rescue_limit',
    ])

    return compactRows([
      detailRow(
        'Club',
        pickFirstString(payload, [
          'club_name',
          'team_name',
        ])
      ),
      detailRow(
        'Liquidation reason',
        formatLabel(
          pickFirstString(payload, [
            'liquidation_reason',
            'reason_label',
            'reason',
            'obligation_reason',
          ])
        )
      ),
      detailRow(
        'Available cash',
        formatCurrencyLabel(availableCash, '$')
      ),
      detailRow(
        'Unpaid obligation',
        formatCurrencyLabel(obligationAmount, '$')
      ),
      detailRow(
        'Shortfall',
        formatCurrencyLabel(shortfallAmount, '$')
      ),
      detailRow(
        'Emergency rescues used',
        rescuesUsed !== null && maxRescues !== null
          ? `${rescuesUsed} of ${maxRescues}`
          : rescuesUsed !== null
            ? `${rescuesUsed}`
            : null
      ),
      detailRow(
        'Liquidated on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'liquidated_on_game_date',
            'liquidation_game_date',
            'processed_game_date',
            'created_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'Club status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'club_status',
            'finance_status',
          ])
        ) || 'Liquidated'
      ),
    ])
  },

  getExtraText: (item) => {
    const payload = getPayload(item)

    return (
      pickFirstString(payload, [
        'liquidation_rule',
        'liquidation_warning',
        'rule_text',
      ]) ||
      'After all lifetime emergency rescues are used, the next unpaid mandatory obligation can liquidate the club. Optional purchases, upgrades, transfers, staff courses, scouting, and camps should be blocked when funds are insufficient.'
    )
  },

  actions: [
    {
      key: 'open-finance-page',
      label: 'Finance page',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) =>
        getActionHrefFromItem(item) ||
        '/dashboard/finance',
      show: () => true,
    },
    {
      key: 'open-transactions',
      label: 'Transactions',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/finance?tab=transactions',
      show: () => true,
    },
    {
      key: 'open-dashboard',
      label: 'Dashboard',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
INFRASTRUCTURE_ASSET_DELIVERED: {
  defaultTitle: 'Asset delivered',
  defaultMessage:
    'A new infrastructure asset has been delivered and is now available for your club.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Infrastructure%20assets%20Delivered.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Infrastructure%20assets%20Delivered.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'target_key',
          'asset_key',
          'key',
        ])
      )

    const quantity = pickFirstNumber(payload, [
      'asset_quantity',
      'quantity',
      'count',
    ])

    return {
      ...item,
      title: assetLabel
        ? `Asset delivered: ${assetLabel}${quantity && quantity > 1 ? ` x${quantity}` : ''}`
        : item.title || 'Asset delivered',
      message:
        item.message ||
        (assetLabel
          ? `${assetLabel}${quantity && quantity > 1 ? ` x${quantity}` : ''} has been delivered and is now available.`
          : 'A new infrastructure asset has been delivered and is now available.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'target_key',
          'asset_key',
          'key',
        ])
      )

    const quantity = pickFirstNumber(payload, [
      'asset_quantity',
      'quantity',
      'count',
    ])

    if (assetLabel) {
      return `${assetLabel}${quantity && quantity > 1 ? ` x${quantity}` : ''} has been delivered to your club and can now be used.`
    }

    return (
      buildIntroFromMessage(item) ||
      'A new infrastructure asset has been delivered to your club and can now be used.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'target_key',
          'asset_key',
          'key',
        ])
      )

    const quantity = pickFirstNumber(payload, [
      'asset_quantity',
      'quantity',
      'count',
    ])

    const assetLevel = pickFirstNumber(payload, [
      'asset_level',
      'level',
      'tier',
    ])

    const durationDays = pickFirstNumber(payload, [
      'duration_game_days',
      'delivery_days',
      'duration_days',
    ])

    return compactRows([
      detailRow('Asset', assetLabel),
      detailRow(
        'Quantity',
        quantity !== null ? `${quantity}` : null
      ),
      detailRow(
        'Asset level',
        assetLevel !== null ? `${assetLevel}` : null
      ),
      detailRow(
        'Ordered on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'started_game_date',
            'ordered_on_game_date',
            'order_game_date',
            'created_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'Delivered on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'complete_game_date',
            'delivered_on_game_date',
            'delivery_game_date',
            'completed_game_date',
          ])
        )
      ),
      detailRow(
        'Delivery time',
        durationDays !== null
          ? `${durationDays} day${durationDays === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'job_status',
            'delivery_status',
          ])
        ) || 'Delivered'
      ),
    ])
  },

  getExtraText: () =>
    'Open the infrastructure assets page to review the delivered asset and decide how it should be used in your club operations.',

  actions: [
    {
      key: 'open-infrastructure-assets',
      label: 'Open assets',
      variant: 'primary',
      kind: 'navigate',
      getHref: () => '/dashboard/infrastructure?tab=assets',
      show: () => true,
    },
    {
      key: 'open-infrastructure-page',
      label: 'Infrastructure page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/infrastructure',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  INFRASTRUCTURE_ASSET_CONDITION_LOW: {
  defaultTitle: 'Asset condition low',
  defaultMessage:
    'One of your infrastructure assets has dropped below the recommended condition threshold and should be repaired.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Infrastructure%20assets%20Condition%20low.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Infrastructure%20assets%20Condition%20low.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])
      )

    const conditionPercent = pickFirstNumber(payload, [
      'condition_percent',
      'current_condition_percent',
      'condition',
    ])

    return {
      ...item,
      title: assetLabel
        ? `Low condition: ${assetLabel}`
        : item.title || 'Asset condition low',
      message:
        item.message ||
        (assetLabel && conditionPercent !== null
          ? `${assetLabel} condition has dropped to ${conditionPercent}% and should be repaired.`
          : assetLabel
            ? `${assetLabel} condition is low and should be repaired.`
            : 'One of your infrastructure assets has low condition and should be repaired.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])
      )

    const conditionPercent = pickFirstNumber(payload, [
      'condition_percent',
      'current_condition_percent',
      'condition',
    ])

    const thresholdPercent = pickFirstNumber(payload, [
      'threshold_percent',
      'low_condition_threshold',
      'condition_threshold',
    ])

    if (assetLabel && conditionPercent !== null && thresholdPercent !== null) {
      return `${assetLabel} has dropped to ${conditionPercent}% condition, below the ${thresholdPercent}% warning threshold. Repair is recommended before the asset is used again.`
    }

    if (assetLabel && conditionPercent !== null) {
      return `${assetLabel} has dropped to ${conditionPercent}% condition. Repair is recommended before the asset is used again.`
    }

    if (assetLabel) {
      return `${assetLabel} is now in low condition. Repair is recommended before the asset is used again.`
    }

    return (
      buildIntroFromMessage(item) ||
      'One of your infrastructure assets is now in low condition. Repair is recommended before it is used again.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])
      )

    const assetLevel = pickFirstNumber(payload, [
      'asset_level',
      'level',
      'tier',
    ])

    const garageSlot = pickFirstNumber(payload, [
      'garage_slot',
      'slot',
      'garage_position',
    ])

    const oldConditionPercent = pickFirstNumber(payload, [
      'old_condition_percent',
      'previous_condition_percent',
      'condition_before',
    ])

    const conditionPercent = pickFirstNumber(payload, [
      'condition_percent',
      'current_condition_percent',
      'condition',
    ])

    const thresholdPercent = pickFirstNumber(payload, [
      'threshold_percent',
      'low_condition_threshold',
      'condition_threshold',
    ])

    return compactRows([
      detailRow('Asset', assetLabel),
      detailRow(
        'Asset type',
        formatLabel(
          pickFirstString(payload, [
            'asset_key',
            'target_key',
            'key',
          ])
        )
      ),
      detailRow(
        'Display name',
        pickFirstString(payload, [
          'display_name',
          'garage_name',
          'label',
        ])
      ),
      detailRow(
        'Asset level',
        assetLevel !== null ? `${assetLevel}` : null
      ),
      detailRow(
        'Garage slot',
        garageSlot !== null ? `${garageSlot}` : null
      ),
      detailRow(
        'Previous condition',
        oldConditionPercent !== null ? `${oldConditionPercent}%` : null
      ),
      detailRow(
        'Current condition',
        conditionPercent !== null ? `${conditionPercent}%` : null
      ),
      detailRow(
        'Warning threshold',
        thresholdPercent !== null ? `${thresholdPercent}%` : null
      ),
      detailRow(
        'Recommended action',
        formatLabel(
          pickFirstString(payload, [
            'recommended_action',
            'action_required',
            'next_action',
          ])
        ) || 'Repair'
      ),
      detailRow(
        'Asset status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'asset_status',
          ])
        )
      ),
    ])
  },

  getExtraText: () =>
    'Open the infrastructure assets page to review this asset and start a repair if it is available for maintenance.',

  actions: [
    {
      key: 'open-infrastructure-asset',
      label: 'Open asset',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        const assetKey = pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])

        const assetId = pickFirstString(payload, [
          'asset_id',
          'infrastructure_asset_id',
          'garage_asset_id',
        ])

        const params = new URLSearchParams()
        params.set('tab', 'assets')

        if (assetKey) {
          params.set('assetKey', assetKey)
        }

        if (assetId) {
          params.set('assetId', assetId)
        }

        return `/dashboard/infrastructure?${params.toString()}`
      },
      show: () => true,
    },
    {
      key: 'open-infrastructure-page',
      label: 'Infrastructure page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/infrastructure',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  INFRASTRUCTURE_ASSET_REPAIR_STARTED: {
  defaultTitle: 'Asset repair started',
  defaultMessage:
    'Repair work has started on one of your infrastructure assets.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Infrastructure%20assets%20Repair%20Started.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Infrastructure%20assets%20Repair%20Started.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])
      )

    const conditionPercent = pickFirstNumber(payload, [
      'condition_percent',
      'current_condition_percent',
      'condition',
    ])

    return {
      ...item,
      title: assetLabel
        ? `Repair started: ${assetLabel}`
        : item.title || 'Asset repair started',
      message:
        item.message ||
        (assetLabel && conditionPercent !== null
          ? `${assetLabel} repair has started. Current condition is ${conditionPercent}%.`
          : assetLabel
            ? `${assetLabel} repair has started.`
            : 'Repair work has started on one of your infrastructure assets.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])
      )

    const conditionPercent = pickFirstNumber(payload, [
      'condition_percent',
      'current_condition_percent',
      'condition',
    ])

    if (assetLabel && conditionPercent !== null) {
      return `${assetLabel} has entered repair. Its current condition is ${conditionPercent}%, and it should not be treated as fully available until the repair is complete.`
    }

    if (assetLabel) {
      return `${assetLabel} has entered repair and should not be treated as fully available until the repair is complete.`
    }

    return (
      buildIntroFromMessage(item) ||
      'One of your infrastructure assets has entered repair and should not be treated as fully available until the repair is complete.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])
      )

    const assetLevel = pickFirstNumber(payload, [
      'asset_level',
      'level',
      'tier',
    ])

    const garageSlot = pickFirstNumber(payload, [
      'garage_slot',
      'slot',
      'garage_position',
    ])

    const oldConditionPercent = pickFirstNumber(payload, [
      'old_condition_percent',
      'previous_condition_percent',
      'condition_before',
    ])

    const conditionPercent = pickFirstNumber(payload, [
      'condition_percent',
      'current_condition_percent',
      'condition',
    ])

    const repairCost = pickFirstNumber(payload, [
      'repair_cost_cash',
      'repair_cost',
      'cost_cash',
      'cash_cost',
    ])

    const repairDurationDays = pickFirstNumber(payload, [
      'repair_duration_game_days',
      'duration_game_days',
      'repair_days',
      'duration_days',
    ])

    return compactRows([
      detailRow('Asset', assetLabel),
      detailRow(
        'Asset type',
        formatLabel(
          pickFirstString(payload, [
            'asset_key',
            'target_key',
            'key',
          ])
        )
      ),
      detailRow(
        'Display name',
        pickFirstString(payload, [
          'display_name',
          'garage_name',
          'label',
        ])
      ),
      detailRow(
        'Asset level',
        assetLevel !== null ? `${assetLevel}` : null
      ),
      detailRow(
        'Garage slot',
        garageSlot !== null ? `${garageSlot}` : null
      ),
      detailRow(
        'Previous condition',
        oldConditionPercent !== null ? `${oldConditionPercent}%` : null
      ),
      detailRow(
        'Current condition',
        conditionPercent !== null ? `${conditionPercent}%` : null
      ),
      detailRow(
        'Repair cost',
        formatCurrencyLabel(repairCost, '$')
      ),
      detailRow(
        'Repair time',
        repairDurationDays !== null
          ? `${repairDurationDays} day${repairDurationDays === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Repair started',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'repair_started_game_date',
            'started_game_date',
            'started_on_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'Repair complete',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'repair_complete_game_date',
            'repair_complete',
            'complete_game_date',
            'completed_game_date',
          ])
        )
      ),
      detailRow(
        'Previous status',
        formatLabel(
          pickFirstString(payload, [
            'old_status',
            'previous_status',
          ])
        )
      ),
      detailRow(
        'Current status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'asset_status',
          ])
        ) || 'In repair'
      ),
    ])
  },

  getExtraText: () =>
    'Open the infrastructure assets page to review the repair status and monitor when the asset becomes available again.',

  actions: [
    {
      key: 'open-infrastructure-asset',
      label: 'Open asset',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        const assetKey = pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])

        const assetId = pickFirstString(payload, [
          'asset_id',
          'infrastructure_asset_id',
          'garage_asset_id',
        ])

        const params = new URLSearchParams()
        params.set('tab', 'assets')

        if (assetKey) {
          params.set('assetKey', assetKey)
        }

        if (assetId) {
          params.set('assetId', assetId)
        }

        return `/dashboard/infrastructure?${params.toString()}`
      },
      show: () => true,
    },
    {
      key: 'open-infrastructure-page',
      label: 'Infrastructure page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/infrastructure',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  INFRASTRUCTURE_ASSET_SOLD: {
  defaultTitle: 'Asset sold',
  defaultMessage:
    'One of your infrastructure assets has been sold and removed from your club inventory.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Infrastructure%20assets%20Sold.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Infrastructure%20assets%20Sold.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])
      )

    const salePrice = pickFirstNumber(payload, [
      'sale_price',
      'sold_price',
      'sell_price',
      'cash_received',
      'amount',
      'value',
    ])

    return {
      ...item,
      title: assetLabel
        ? `Asset sold: ${assetLabel}`
        : item.title || 'Asset sold',
      message:
        item.message ||
        (assetLabel && salePrice !== null
          ? `${assetLabel} has been sold for $${salePrice}.`
          : assetLabel
            ? `${assetLabel} has been sold and removed from your club inventory.`
            : 'One of your infrastructure assets has been sold and removed from your club inventory.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])
      )

    const salePrice = pickFirstNumber(payload, [
      'sale_price',
      'sold_price',
      'sell_price',
      'cash_received',
      'amount',
      'value',
    ])

    if (assetLabel && salePrice !== null) {
      return `${assetLabel} has been sold from your club inventory for $${salePrice}.`
    }

    if (assetLabel) {
      return `${assetLabel} has been sold from your club inventory.`
    }

    return (
      buildIntroFromMessage(item) ||
      'One of your infrastructure assets has been sold from your club inventory.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])
      )

    const assetLevel = pickFirstNumber(payload, [
      'asset_level',
      'level',
      'tier',
    ])

    const garageSlot = pickFirstNumber(payload, [
      'garage_slot',
      'slot',
      'garage_position',
    ])

    const conditionPercent = pickFirstNumber(payload, [
      'condition_percent',
      'current_condition_percent',
      'condition',
    ])

    const salePrice = pickFirstNumber(payload, [
      'sale_price',
      'sold_price',
      'sell_price',
      'cash_received',
      'amount',
      'value',
    ])

    return compactRows([
      detailRow('Asset', assetLabel),
      detailRow(
        'Asset type',
        formatLabel(
          pickFirstString(payload, [
            'asset_key',
            'target_key',
            'key',
          ])
        )
      ),
      detailRow(
        'Display name',
        pickFirstString(payload, [
          'display_name',
          'garage_name',
          'label',
        ])
      ),
      detailRow(
        'Asset level',
        assetLevel !== null ? `${assetLevel}` : null
      ),
      detailRow(
        'Garage slot',
        garageSlot !== null ? `${garageSlot}` : null
      ),
      detailRow(
        'Condition at sale',
        conditionPercent !== null ? `${conditionPercent}%` : null
      ),
      detailRow(
        'Sale price',
        salePrice !== null ? `$${salePrice}` : null
      ),
      detailRow(
        'Sold on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'sold_game_date',
            'sold_on_game_date',
            'sale_game_date',
            'complete_game_date',
            'completed_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'Previous status',
        formatLabel(
          pickFirstString(payload, [
            'old_status',
            'previous_status',
          ])
        )
      ),
      detailRow(
        'Current status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'asset_status',
          ])
        ) || 'Sold'
      ),
    ])
  },

  getExtraText: () =>
    'Open the infrastructure assets page to review your remaining assets and club equipment inventory.',

  actions: [
    {
      key: 'open-infrastructure-asset',
      label: 'Open assets',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        const assetKey = pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])

        const assetId = pickFirstString(payload, [
          'asset_id',
          'infrastructure_asset_id',
          'garage_asset_id',
        ])

        const params = new URLSearchParams()
        params.set('tab', 'assets')

        if (assetKey) {
          params.set('assetKey', assetKey)
        }

        if (assetId) {
          params.set('assetId', assetId)
        }

        return `/dashboard/infrastructure?${params.toString()}`
      },
      show: () => true,
    },
    {
      key: 'open-infrastructure-page',
      label: 'Infrastructure page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/infrastructure',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
RIDER_TRANSFER_LISTING_EXPIRED: {
  defaultTitle: 'Transfer listing expired',
  defaultMessage:
    'A rider transfer listing expired without a completed transfer.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20Transfer%20Time%20expired.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20Transfer%20Time%20expired.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const riderName =
      pickFirstString(payload, [
        'rider_full_name',
        'rider_name',
        'display_name',
        'full_name',
        'name',
      ]) || 'Rider'

    return {
      ...item,
      title: `Transfer listing expired: ${riderName}`,
      message:
        item.message ||
        `${riderName} was not transferred before the deadline and has returned to your team roster.`,
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const riderName =
      pickFirstString(payload, [
        'rider_full_name',
        'rider_name',
        'display_name',
        'full_name',
        'name',
      ]) || 'This rider'

    return `No club signed ${riderName} before the transfer deadline. The rider has returned to your active team roster.`
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const riderName =
      pickFirstString(payload, [
        'rider_full_name',
        'rider_name',
        'display_name',
        'full_name',
        'name',
      ]) || null

    const sellerClub =
      pickFirstString(payload, [
        'seller_club_name',
        'club_name',
        'team_name',
      ]) || null

    const askingPrice = pickFirstNumber(payload, [
      'asking_price',
      'price',
      'transfer_fee',
      'value',
    ])

    return compactRows([
      detailRow('Rider', riderName),
      detailRow('Club', sellerClub),
      detailRow(
        'Asking price',
        formatCurrencyLabel(askingPrice, '$')
      ),
      detailRow(
        'Listed on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'listed_on_game_date',
            'opened_on_game_date',
            'created_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'Visible until',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'expires_on_game_date',
            'expiry_game_date',
            'expires_at_game_date',
          ])
        )
      ),
      detailRow(
        'Expired on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'expired_on_game_date',
            'closed_on_game_date',
            'status_changed_game_date',
          ])
        )
      ),
      detailRow(
        'Status',
        formatLabel(
          pickFirstString(payload, [
            'status',
          ])
        ) || 'Expired'
      ),
      detailRow(
        'Result',
        formatLabel(
          pickFirstString(payload, [
            'result',
          ])
        ) || 'Returned to team roster'
      ),
    ])
  },

  getExtraText: () =>
    'The rider was not transferred before the deadline and is now available again in your squad. You can keep the rider, relist him later, or review other transfer options.',

  actions: [
    {
      key: 'open-rider-profile',
      label: 'Rider profile',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        return (
          pickFirstString(payload, [
            'rider_profile_path',
            'my_rider_profile_path',
          ]) ||
          `/dashboard/my-riders/${pickFirstString(payload, ['rider_id']) || ''}`
        )
      },
      show: (item) => {
        const payload = getPayload(item)

        return Boolean(
          pickFirstString(payload, [
            'rider_profile_path',
            'my_rider_profile_path',
            'rider_id',
          ])
        )
      },
    },
    {
      key: 'open-transfers',
      label: 'Open transfers',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        return (
          pickFirstString(payload, ['transfers_path']) ||
          '/dashboard/transfers'
        )
      },
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  RIDER_RELEASED_TO_FREE_AGENTS: {
  defaultTitle: 'Rider released to free agents',
  defaultMessage:
    'A rider has been released from your team and moved to the free-agent market.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20Relesad%20to%20free%20agent.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20Relesad%20to%20free%20agent.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const riderName =
      pickFirstString(payload, [
        'rider_full_name',
        'rider_name',
        'display_name',
        'full_name',
        'name',
      ]) || 'Rider'

    return {
      ...item,
      title: `Rider released: ${riderName}`,
      message:
        item.message ||
        `${riderName} has been released from your team and is now available as a free agent.`,
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const riderName =
      pickFirstString(payload, [
        'rider_full_name',
        'rider_name',
        'display_name',
        'full_name',
        'name',
      ]) || 'This rider'

    const clubName = pickFirstString(payload, [
      'club_name',
      'team_name',
      'seller_club_name',
      'previous_club_name',
    ])

    if (clubName) {
      return `${riderName} has been released by ${clubName} and moved to the free-agent market.`
    }

    return `${riderName} has been released from your team and moved to the free-agent market.`
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const riderName =
      pickFirstString(payload, [
        'rider_full_name',
        'rider_name',
        'display_name',
        'full_name',
        'name',
      ]) || null

    const clubName =
      pickFirstString(payload, [
        'club_name',
        'team_name',
        'seller_club_name',
        'previous_club_name',
      ]) || null

    const marketValue = pickFirstNumber(payload, [
      'market_value',
      'rider_market_value',
      'value',
    ])

    const releaseCost = pickFirstNumber(payload, [
      'release_cost',
      'release_fee',
      'contract_release_cost',
      'compensation_cost',
    ])

    const salaryWeekly = pickFirstNumber(payload, [
      'salary_weekly',
      'weekly_salary',
      'previous_salary_weekly',
    ])

    return compactRows([
      detailRow('Rider', riderName),
      detailRow('Previous club', clubName),
      detailRow(
        'Market value',
        formatCurrencyLabel(marketValue, '$')
      ),
      detailRow(
        'Previous weekly salary',
        formatCurrencyLabel(salaryWeekly, '$')
      ),
      detailRow(
        'Release cost',
        formatCurrencyLabel(releaseCost, '$')
      ),
      detailRow(
        'Released on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'released_on_game_date',
            'release_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'New status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'new_status',
            'rider_status',
          ])
        ) || 'Free agent'
      ),
      detailRow(
        'Result',
        formatLabel(
          pickFirstString(payload, [
            'result',
          ])
        ) || 'Moved to free-agent market'
      ),
    ])
  },

  getExtraText: () =>
    'The rider is no longer part of your team roster. You can review the free-agent market or open the rider profile from this notification.',

  actions: [
    {
      key: 'open-rider-profile',
      label: 'Rider profile',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        return (
          pickFirstString(payload, [
            'rider_profile_path',
            'external_rider_profile_path',
            'profile_path',
          ]) ||
          `/dashboard/external-riders/${pickFirstString(payload, ['rider_id']) || ''}`
        )
      },
      show: (item) => {
        const payload = getPayload(item)

        return Boolean(
          pickFirstString(payload, [
            'rider_profile_path',
            'external_rider_profile_path',
            'profile_path',
            'rider_id',
          ])
        )
      },
    },
    {
      key: 'open-free-agents',
      label: 'Free agents',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        return (
          pickFirstString(payload, [
            'free_agents_path',
            'transfers_path',
          ]) || '/dashboard/transfers?subTab=free_agents'
        )
      },
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  DEVELOPING_TEAM_WINDOW_OPEN: {
  defaultTitle: 'Developing team window open',
  defaultMessage:
    'The movement window is now open for your developing team.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Developing%20Team%20Window%20Open.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Developing%20Team%20Window%20Open.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const clubName =
      pickFirstString(payload, [
        'club_name',
        'team_name',
      ]) || 'your team'

    return {
      ...item,
      title: 'Developing team window open',
      message:
        item.message ||
        `The movement window is now open for ${clubName}. You can move eligible riders between your first team and developing team.`,
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const clubName =
      pickFirstString(payload, [
        'club_name',
        'team_name',
      ]) || 'your club'

    return `The developing team movement window is now open for ${clubName}. During this period, you can promote or move eligible riders between your main squad and developing team.`
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    return compactRows([
      detailRow(
        'Window opens',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'window_opens_on_game_date',
            'window_start_game_date',
            'opens_on_game_date',
            'start_game_date',
          ])
        )
      ),
      detailRow(
        'Window closes',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'window_closes_on_game_date',
            'window_end_game_date',
            'closes_on_game_date',
            'end_game_date',
          ])
        )
      ),
      detailRow(
        'Club',
        pickFirstString(payload, [
          'club_name',
          'team_name',
        ])
      ),
      detailRow(
        'Window type',
        formatLabel(
          pickFirstString(payload, [
            'window_type',
            'movement_window_type',
          ])
        ) || 'Developing team movement'
      ),
      detailRow(
        'Action required',
        pickFirstString(payload, [
          'action_required_label',
          'action_required',
        ]) || 'Review eligible riders'
      ),
    ])
  },

  getExtraText: () =>
    'Use this window to review your developing team, promote riders who are ready, and move eligible riders before the window closes.',

  actions: [
    {
      key: 'open-squad',
      label: 'Open squad',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        return (
          pickFirstString(payload, [
            'squad_path',
            'action_path',
          ]) || '/dashboard/squad'
        )
      },
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  DEVELOPING_RIDER_AGE_LIMIT_REACHED: {
  defaultTitle: 'Developing rider age limit reached',
  defaultMessage:
    'A developing-team rider has reached the age limit and must be moved out during the next movement window.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Developing%20rider%20age%20limit%20reached.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Developing%20rider%20age%20limit%20reached.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const riderName =
      pickFirstString(payload, [
        'rider_full_name',
        'rider_name',
        'display_name',
        'full_name',
        'name',
      ]) || 'Rider'

    return {
      ...item,
      title: `Age limit reached: ${riderName}`,
      message:
        item.message ||
        `${riderName} has reached the developing-team age limit and must be moved out during the next movement window.`,
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const riderName =
      pickFirstString(payload, [
        'rider_full_name',
        'rider_name',
        'display_name',
        'full_name',
        'name',
      ]) || 'This rider'

    return `${riderName} has reached the developing-team age limit. Move the rider out of the developing team during the next available movement window.`
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const riderName =
      pickFirstString(payload, [
        'rider_full_name',
        'rider_name',
        'display_name',
        'full_name',
        'name',
      ]) || null

    const ageYears = pickFirstNumber(payload, [
      'age_years',
      'age',
      'current_age',
    ])

    const ageLimit = pickFirstNumber(payload, [
      'age_limit_years',
      'limit_age_years',
    ])

    const maxDevelopingAge = pickFirstNumber(payload, [
      'max_developing_age',
      'developing_team_max_age',
    ])

    const overall = pickFirstNumber(payload, ['overall'])
    const potential = pickFirstNumber(payload, ['potential'])
    const salaryWeekly = pickFirstNumber(payload, ['salary_weekly'])
    const marketValue = pickFirstNumber(payload, ['market_value'])

    return compactRows([
      detailRow('Rider', riderName),
      detailRow(
        'Club',
        pickFirstString(payload, [
          'club_name',
          'team_name',
        ])
      ),
      detailRow(
        'Country',
        pickFirstString(payload, [
          'country_code',
          'nationality',
        ])
      ),
      detailRow(
        'Role',
        formatLabel(
          pickFirstString(payload, [
            'role',
            'rider_role',
          ])
        )
      ),
      detailRow(
        'Current age',
        ageYears !== null ? `${ageYears}` : null
      ),
      detailRow(
        'Age limit',
        ageLimit !== null
          ? `${ageLimit}+`
          : maxDevelopingAge !== null
            ? `Over ${maxDevelopingAge}`
            : null
      ),
      detailRow(
        'Current squad',
        formatLabel(
          pickFirstString(payload, [
            'current_squad',
            'squad',
          ])
        ) || 'Developing team'
      ),
      detailRow(
        'Overall / Potential',
        overall !== null || potential !== null
          ? `${overall ?? '—'} / ${potential ?? '—'}`
          : null
      ),
      detailRow(
        'Weekly salary',
        formatCurrencyLabel(salaryWeekly, '$')
      ),
      detailRow(
        'Market value',
        formatCurrencyLabel(marketValue, '$')
      ),
      detailRow(
        'Reached on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'age_limit_reached_on_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'Movement window opens',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'required_window_start_game_date',
            'window_opens_on_game_date',
            'window_start_game_date',
          ])
        )
      ),
      detailRow(
        'Movement window closes',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'required_window_end_game_date',
            'window_closes_on_game_date',
            'window_end_game_date',
          ])
        )
      ),
      detailRow(
        'Required action',
        pickFirstString(payload, [
          'action_required_label',
          'required_action_label',
        ]) ||
          formatLabel(
            pickFirstString(payload, [
              'required_action',
              'action_required',
            ])
          ) ||
          'Move rider out of developing team'
      ),
    ])
  },

  getExtraText: () =>
    'This rider can no longer remain in the developing team after the movement window. Open the rider profile or developing team page to decide the next step.',

  actions: [
    {
      key: 'open-rider-profile',
      label: 'Rider profile',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        return (
          pickFirstString(payload, [
            'rider_profile_path',
            'my_rider_profile_path',
            'profile_path',
          ]) ||
          `/dashboard/my-riders/${pickFirstString(payload, ['rider_id']) || ''}`
        )
      },
      show: (item) => {
        const payload = getPayload(item)

        return Boolean(
          pickFirstString(payload, [
            'rider_profile_path',
            'my_rider_profile_path',
            'profile_path',
            'rider_id',
          ])
        )
      },
    },
    {
      key: 'open-developing-team',
      label: 'Developing team',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        return (
          pickFirstString(payload, [
            'developing_team_path',
            'squad_path',
          ]) || '/dashboard/squad?tab=developing'
        )
      },
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  INFRASTRUCTURE_ASSET_REPAIRED: {
  defaultTitle: 'Asset repaired',
  defaultMessage:
    'One of your infrastructure assets has been repaired and is available again.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Infrastructure%20assets%20Repaired.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Infrastructure%20assets%20Repaired.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])
      )

    const conditionPercent = pickFirstNumber(payload, [
      'condition_percent',
      'current_condition_percent',
      'condition',
    ])

    return {
      ...item,
      title: assetLabel
        ? `Repair complete: ${assetLabel}`
        : item.title || 'Asset repaired',
      message:
        item.message ||
        (assetLabel && conditionPercent !== null
          ? `${assetLabel} has been repaired and is available again at ${conditionPercent}% condition.`
          : assetLabel
            ? `${assetLabel} has been repaired and is available again.`
            : 'One of your infrastructure assets has been repaired and is available again.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])
      )

    const conditionPercent = pickFirstNumber(payload, [
      'condition_percent',
      'current_condition_percent',
      'condition',
    ])

    if (assetLabel && conditionPercent !== null) {
      return `${assetLabel} has been successfully repaired and is now available again with ${conditionPercent}% condition.`
    }

    if (assetLabel) {
      return `${assetLabel} has been successfully repaired and is now available again for club operations.`
    }

    return (
      buildIntroFromMessage(item) ||
      'One of your infrastructure assets has been successfully repaired and is now available again for club operations.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])
      )

    const assetLevel = pickFirstNumber(payload, [
      'asset_level',
      'level',
      'tier',
    ])

    const garageSlot = pickFirstNumber(payload, [
      'garage_slot',
      'slot',
      'garage_position',
    ])

    const oldConditionPercent = pickFirstNumber(payload, [
      'old_condition_percent',
      'previous_condition_percent',
      'condition_before',
    ])

    const conditionPercent = pickFirstNumber(payload, [
      'condition_percent',
      'current_condition_percent',
      'condition',
    ])

    return compactRows([
      detailRow('Asset', assetLabel),
      detailRow(
        'Asset type',
        formatLabel(
          pickFirstString(payload, [
            'asset_key',
            'target_key',
            'key',
          ])
        )
      ),
      detailRow(
        'Display name',
        pickFirstString(payload, [
          'display_name',
          'garage_name',
          'label',
        ])
      ),
      detailRow(
        'Asset level',
        assetLevel !== null ? `${assetLevel}` : null
      ),
      detailRow(
        'Garage slot',
        garageSlot !== null ? `${garageSlot}` : null
      ),
      detailRow(
        'Condition before repair',
        oldConditionPercent !== null ? `${oldConditionPercent}%` : null
      ),
      detailRow(
        'Condition after repair',
        conditionPercent !== null ? `${conditionPercent}%` : null
      ),
      detailRow(
        'Repair completed on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'repair_completed_game_date',
            'repaired_on_game_date',
            'complete_game_date',
            'completed_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'Previous status',
        formatLabel(
          pickFirstString(payload, [
            'old_status',
            'previous_status',
          ])
        )
      ),
      detailRow(
        'Current status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'asset_status',
          ])
        ) || 'Available'
      ),
    ])
  },

  getExtraText: () =>
    'Open the infrastructure assets page to review the repaired asset and use it again in your club operations.',

  actions: [
    {
      key: 'open-infrastructure-asset',
      label: 'Open asset',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        const assetKey = pickFirstString(payload, [
          'asset_key',
          'target_key',
          'key',
        ])

        const assetId = pickFirstString(payload, [
          'asset_id',
          'infrastructure_asset_id',
          'garage_asset_id',
        ])

        const params = new URLSearchParams()
        params.set('tab', 'assets')

        if (assetKey) {
          params.set('assetKey', assetKey)
        }

        if (assetId) {
          params.set('assetId', assetId)
        }

        return `/dashboard/infrastructure?${params.toString()}`
      },
      show: () => true,
    },
    {
      key: 'open-infrastructure-page',
      label: 'Infrastructure page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/infrastructure',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  STAGE_PLANS_OPEN: {
  defaultTitle: 'Stage plans open',
  defaultMessage:
    'Stage-by-stage planning is now available for this race.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stage%20plan%20open.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stage%20plan%20open.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || 'Race'

    return {
      ...item,
      title: `Stage plans open: ${raceName}`,
      message:
        item.message ||
        `Stage-by-stage planning is now available for ${raceName}. Set rider roles, tactics and stage objectives before the race starts.`,
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || 'This race'

    return `${raceName} is now open for stage-by-stage planning. Review each stage and set rider roles, protection, sprint/KOM focus and tactical instructions.`
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || null

    const stageCount = pickFirstNumber(payload, [
      'stage_count',
      'stages_count',
      'number_of_stages',
    ])

    return compactRows([
      detailRow('Race', raceName),
      detailRow(
        'Race class',
        pickFirstString(payload, [
          'race_class',
          'class',
          'category',
          'race_category',
        ])
      ),
      detailRow(
        'Country',
        formatCountryName(
          pickFirstString(payload, [
            'country_name',
            'host_country_name',
            'country',
            'host_country',
            'country_code',
          ])
        )
      ),
      detailRow(
        'Race starts',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'race_start_date',
            'start_date',
            'starts_on_game_date',
          ])
        )
      ),
      detailRow(
        'First stage',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'first_stage_date',
            'stage_plans_open_on',
            'race_start_date',
            'start_date',
          ])
        )
      ),
      detailRow(
        'Stages to plan',
        stageCount !== null
          ? `${stageCount} stage${stageCount === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Status',
        formatLabel(
          pickFirstString(payload, [
            'stage_plan_status',
            'stage_plans_status',
            'status',
          ])
        ) || 'Open'
      ),
    ])
  },

  getExtraText: () =>
    'Open stage plans to assign rider roles and stage tactics. You can still open the race page to review route details before deciding your plan.',

  actions: [
    {
      key: 'open-stage-plans',
      label: 'Stage plans',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const raceId = pickFirstString(payload, ['race_id'])

        return (
          pickFirstString(payload, [
            'stage_plans_path',
            'stage_plan_path',
          ]) ||
          (raceId
            ? `/dashboard/race-preparation?tab=stagePlans&raceId=${raceId}`
            : '/dashboard/race-preparation?tab=stagePlans')
        )
      },
      show: () => true,
    },
    {
      key: 'open-race-preparation',
      label: 'Race preparation',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const raceId = pickFirstString(payload, ['race_id'])

        return (
          pickFirstString(payload, [
            'race_plan_path',
            'race_preparation_path',
            'action_path',
          ]) ||
          (raceId
            ? `/dashboard/race-preparation?tab=racePlan&raceId=${raceId}`
            : '/dashboard/race-preparation')
        )
      },
      show: () => true,
    },
    {
      key: 'open-race-page',
      label: 'Open race page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const raceId = pickFirstString(payload, ['race_id'])

        if (raceId) {
          return `/dashboard/races/${raceId}`
        }

        return (
          pickFirstString(payload, [
            'race_profile_path',
            'race_detail_path',
            'calendar_race_path',
          ]) || '/dashboard/calendar'
        )
      },
      show: (item) => {
        const payload = getPayload(item)

        return Boolean(
          pickFirstString(payload, [
            'race_id',
            'race_profile_path',
            'race_detail_path',
            'calendar_race_path',
          ])
        )
      },
    },
    {
      key: 'open-calendar',
      label: 'Team calendar',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        return (
          pickFirstString(payload, [
            'calendar_path',
            'team_calendar_path',
          ]) || '/dashboard/calendar'
        )
      },
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  STAGE_PLAN_LOCK_REMINDER: {
  defaultTitle: 'Stage plan lock reminder',
  defaultMessage:
    'Stage plans will lock soon. Review and finalise your stage tactics before the lock date.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stgae%20Plan%20lock%20reminder.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stgae%20Plan%20lock%20reminder.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || 'Race'

    return {
      ...item,
      title: `Stage plans lock soon: ${raceName}`,
      message:
        item.message ||
        `Stage plans for ${raceName} will lock soon. Review and finalise your stage tactics before the lock date.`,
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || 'This race'

    return `${raceName} stage plans will lock soon. Finalise rider roles, tactics, protection, sprint/KOM focus and stage objectives before the lock date.`
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || null

    const stageCount = pickFirstNumber(payload, [
      'stage_count',
      'stages_count',
      'number_of_stages',
    ])

    const daysUntilLock = pickFirstNumber(payload, [
      'days_until_lock',
      'days_left',
      'days_remaining',
    ])

    return compactRows([
      detailRow('Race', raceName),
      detailRow(
        'Race class',
        pickFirstString(payload, [
          'race_class',
          'class',
          'category',
          'race_category',
        ])
      ),
      detailRow(
        'Country',
        formatCountryName(
          pickFirstString(payload, [
            'country_name',
            'host_country_name',
            'country',
            'host_country',
            'country_code',
          ])
        )
      ),
      detailRow(
        'Stage',
        (() => {
          const stageNumber = pickFirstNumber(payload, [
            'stage_number',
            'selected_stage_number',
          ])

          return stageNumber !== null ? `Stage ${stageNumber}` : null
        })()
      ),
      detailRow(
        'Stage start',
        formatGameDateTimeLabel(
          pickFirstString(payload, [
            'stage_start_at',
            'stage_start_datetime',
            'stage_date',
            'first_stage_date',
            'race_start_date',
          ]),
          pickFirstString(payload, [
            'stage_start_time_label',
            'planned_start_time_label',
          ])
        )
      ),
      detailRow(
        'Stage plans opened',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'stage_plans_open_on',
            'stage_plan_open_on',
          ])
        )
      ),
      detailRow(
        'Stage plan lock',
        formatGameDateTimeLabel(
          pickFirstString(payload, [
            'stage_plan_lock_at',
            'stage_plan_lock_datetime',
            'stage_plan_lock_on',
            'stage_plans_lock_on',
            'lock_on',
          ]),
          pickFirstString(payload, [
            'stage_plan_lock_time_label',
            'lock_time_label',
          ])
        )
      ),
      detailRow(
        'Days until lock',
        daysUntilLock !== null
          ? `${daysUntilLock} day${daysUntilLock === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Stages to finalise',
        stageCount !== null
          ? `${stageCount} stage${stageCount === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Status',
        formatLabel(
          pickFirstString(payload, [
            'stage_plan_status',
            'stage_plans_status',
            'status',
          ])
        ) || 'Lock approaching'
      ),
    ])
  },

  getExtraText: () =>
    'Open stage plans to review and finalise your tactical setup before the plans lock.',

  actions: [
    {
      key: 'open-stage-plans',
      label: 'Stage plans',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const raceId = pickFirstString(payload, ['race_id'])

        return (
          pickFirstString(payload, [
            'stage_plans_path',
            'stage_plan_path',
          ]) ||
          (raceId
            ? `/dashboard/race-preparation?tab=stagePlans&raceId=${raceId}`
            : '/dashboard/race-preparation?tab=stagePlans')
        )
      },
      show: () => true,
    },
    {
      key: 'open-race-preparation',
      label: 'Race preparation',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const raceId = pickFirstString(payload, ['race_id'])

        return (
          pickFirstString(payload, [
            'race_plan_path',
            'race_preparation_path',
            'action_path',
          ]) ||
          (raceId
            ? `/dashboard/race-preparation?tab=racePlan&raceId=${raceId}`
            : '/dashboard/race-preparation')
        )
      },
      show: () => true,
    },
    {
      key: 'open-race-page',
      label: 'Open race page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const raceId = pickFirstString(payload, ['race_id'])

        if (raceId) {
          return `/dashboard/races/${raceId}`
        }

        return (
          pickFirstString(payload, [
            'race_profile_path',
            'race_detail_path',
            'calendar_race_path',
          ]) || '/dashboard/calendar'
        )
      },
      show: (item) => {
        const payload = getPayload(item)

        return Boolean(
          pickFirstString(payload, [
            'race_id',
            'race_profile_path',
            'race_detail_path',
            'calendar_race_path',
          ])
        )
      },
    },
    {
      key: 'open-calendar',
      label: 'Team calendar',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        return (
          pickFirstString(payload, [
            'calendar_path',
            'team_calendar_path',
          ]) || '/dashboard/calendar'
        )
      },
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  RACE_APPLICATION_ACCEPTED: {
  defaultTitle: 'Race application accepted',
  defaultMessage:
    'Your team has been accepted to participate in a race.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20application%20accepted.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20application%20accepted.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || 'Race'

    const clubName =
      pickFirstString(payload, [
        'club_name',
        'team_name',
        'accepted_team_name',
      ]) || 'Your team'

    return {
      ...item,
      title: `Race application accepted: ${raceName}`,
      message:
        item.message ||
        `${clubName} has been accepted to participate in ${raceName}.`,
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || 'this race'

    const clubName =
      pickFirstString(payload, [
        'club_name',
        'team_name',
        'accepted_team_name',
      ]) || 'Your team'

    return `${clubName} has been accepted to participate in ${raceName}. You can now review the race page and prepare for the upcoming event.`
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || null

    const stageCount = pickFirstNumber(payload, [
      'stage_count',
      'stages_count',
      'number_of_stages',
    ])

    return compactRows([
      detailRow('Race', raceName),
      detailRow(
        'Race class',
        pickFirstString(payload, [
          'race_class',
          'class',
          'category',
          'race_category',
        ])
      ),
      detailRow(
        'Country',
        formatCountryName(
          pickFirstString(payload, [
            'country_name',
            'host_country_name',
            'country',
            'host_country',
            'country_code',
          ])
        )
      ),
      detailRow(
        'Host city',
        pickFirstString(payload, [
          'host_city',
          'city_name',
          'start_city',
        ])
      ),
      detailRow(
        'Race starts',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'race_start_date',
            'start_date',
            'starts_on_game_date',
          ])
        )
      ),
      detailRow(
        'Race ends',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'race_end_date',
            'end_date',
            'ends_on_game_date',
          ])
        )
      ),
      detailRow(
        'Stages',
        stageCount !== null
          ? `${stageCount} stage${stageCount === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Application status',
        formatLabel(
          pickFirstString(payload, [
            'application_status',
            'entry_status',
            'status',
          ])
        ) || 'Accepted'
      ),
    ])
  },

  getExtraText: () =>
    'Open the race page to review the route, race details, stage information and planning requirements.',

  actions: [
    {
      key: 'open-race-page',
      label: 'Open race page',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const raceId = pickFirstString(payload, ['race_id'])

        if (raceId) {
          return `/dashboard/races/${raceId}`
        }

        return (
          pickFirstString(payload, [
            'race_profile_path',
            'race_detail_path',
            'calendar_race_path',
          ]) || '/dashboard/calendar'
        )
      },
      show: (item) => {
        const payload = getPayload(item)

        return Boolean(
          pickFirstString(payload, [
            'race_id',
            'race_profile_path',
            'race_detail_path',
            'calendar_race_path',
          ])
        )
      },
    },
    {
      key: 'open-calendar',
      label: 'Team calendar',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        return (
          pickFirstString(payload, [
            'calendar_path',
            'team_calendar_path',
          ]) || '/dashboard/calendar'
        )
      },
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  RACE_APPLICATION_DECLINED: {
  defaultTitle: 'Race application declined',
  defaultMessage:
    'Your team was not accepted to participate in a race.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20application%20declined.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20application%20declined.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || 'Race'

    const clubName =
      pickFirstString(payload, [
        'club_name',
        'team_name',
        'declined_team_name',
      ]) || 'Your team'

    return {
      ...item,
      title: `Race application declined: ${raceName}`,
      message:
        item.message ||
        `${clubName} was not accepted to participate in ${raceName}.`,
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || 'this race'

    const clubName =
      pickFirstString(payload, [
        'club_name',
        'team_name',
        'declined_team_name',
      ]) || 'Your team'

    return `${clubName} was not accepted to participate in ${raceName}. You can still review the race page and continue planning for other events.`
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || null

    const stageCount = pickFirstNumber(payload, [
      'stage_count',
      'stages_count',
      'number_of_stages',
    ])

    return compactRows([
      detailRow('Race', raceName),
      detailRow(
        'Race class',
        pickFirstString(payload, [
          'race_class',
          'class',
          'category',
          'race_category',
        ])
      ),
      detailRow(
        'Country',
        formatCountryName(
          pickFirstString(payload, [
            'country_name',
            'host_country_name',
            'country',
            'host_country',
            'country_code',
          ])
        )
      ),
      detailRow(
        'Host city',
        pickFirstString(payload, [
          'host_city',
          'city_name',
          'start_city',
        ])
      ),
      detailRow(
        'Race starts',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'race_start_date',
            'start_date',
            'starts_on_game_date',
          ])
        )
      ),
      detailRow(
        'Race ends',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'race_end_date',
            'end_date',
            'ends_on_game_date',
          ])
        )
      ),
      detailRow(
        'Stages',
        stageCount !== null
          ? `${stageCount} stage${stageCount === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Application status',
        formatLabel(
          pickFirstString(payload, [
            'application_status',
            'entry_status',
            'status',
          ])
        ) || 'Declined'
      ),
      detailRow(
        'Reason',
        pickFirstString(payload, [
          'decline_reason',
          'rejection_reason',
          'reason',
        ])
      ),
    ])
  },

  getExtraText: () =>
    'Open the race page to review the race details, or use the team calendar to prepare for another available race.',

  actions: [
    {
      key: 'open-race-page',
      label: 'Open race page',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const raceId = pickFirstString(payload, ['race_id'])

        if (raceId) {
          return `/dashboard/races/${raceId}`
        }

        return (
          pickFirstString(payload, [
            'race_profile_path',
            'race_detail_path',
            'calendar_race_path',
          ]) || '/dashboard/calendar'
        )
      },
      show: (item) => {
        const payload = getPayload(item)

        return Boolean(
          pickFirstString(payload, [
            'race_id',
            'race_profile_path',
            'race_detail_path',
            'calendar_race_path',
          ])
        )
      },
    },
    {
      key: 'open-calendar',
      label: 'Team calendar',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        return (
          pickFirstString(payload, [
            'calendar_path',
            'team_calendar_path',
          ]) || '/dashboard/calendar'
        )
      },
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  RACE_PLAN_DEADLINE_REMINDER: {
  defaultTitle: 'Race plan deadline reminder',
  defaultMessage:
    'A race plan deadline is approaching. Review your selection and submit before the deadline.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Plan%20Deadline%20Reminder.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Plan%20Deadline%20Reminder.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || 'Race'

    return {
      ...item,
      title: `Race plan deadline reminder: ${raceName}`,
      message:
        item.message ||
        `${raceName} is approaching its rider submission deadline. Review your riders, staff and assets before the deadline passes.`,
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || 'This race'

    return `${raceName} is approaching its race-plan deadline. Make sure your riders, staff and assets are reviewed and submitted before the rider submission deadline.`
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || null

    const daysLeft = pickFirstNumber(payload, [
      'days_left',
      'days_until_deadline',
      'deadline_days_left',
      'days_remaining',
    ])

    return compactRows([
      detailRow('Race', raceName),
      detailRow(
        'Race class',
        pickFirstString(payload, [
          'race_class',
          'class',
          'category',
          'race_category',
        ])
      ),
      detailRow(
        'Country',
        formatCountryName(
          pickFirstString(payload, [
            'country_name',
            'host_country_name',
            'country',
            'host_country',
            'country_code',
          ])
        )
      ),
      detailRow(
        'Race date',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'race_start_date',
            'start_date',
            'starts_on_game_date',
          ])
        )
      ),
      detailRow(
        'Rider submission deadline',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'rider_submission_deadline',
            'rider_submission_deadline_game_date',
            'rider_deadline_on',
            'lineup_deadline_game_date',
          ])
        )
      ),
      detailRow(
        'Time remaining',
        daysLeft !== null
          ? `${daysLeft} day${daysLeft === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'application_status',
            'race_plan_status',
          ])
        ) || 'Deadline approaching'
      ),
    ])
  },

  getExtraText: () =>
    'Open race preparation to complete or review your lineup, or open the race page to review route details and final requirements.',

  actions: [
    {
      key: 'open-race-preparation',
      label: 'Race preparation',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const raceId = pickFirstString(payload, ['race_id'])

        return (
          pickFirstString(payload, [
            'race_plan_path',
            'race_preparation_path',
            'action_path',
          ]) ||
          (raceId
            ? `/dashboard/race-preparation?tab=racePlan&raceId=${raceId}`
            : '/dashboard/race-preparation')
        )
      },
      show: () => true,
    },
    {
      key: 'open-race-page',
      label: 'Open race page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const raceId = pickFirstString(payload, ['race_id'])

        if (raceId) {
          return `/dashboard/races/${raceId}`
        }

        return (
          pickFirstString(payload, [
            'race_profile_path',
            'race_detail_path',
            'calendar_race_path',
          ]) || '/dashboard/calendar'
        )
      },
      show: (item) => {
        const payload = getPayload(item)

        return Boolean(
          pickFirstString(payload, [
            'race_id',
            'race_profile_path',
            'race_detail_path',
            'calendar_race_path',
          ])
        )
      },
    },
    {
      key: 'open-calendar',
      label: 'Team calendar',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        return (
          pickFirstString(payload, [
            'calendar_path',
            'team_calendar_path',
          ]) || '/dashboard/calendar'
        )
      },
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
   race_missed_startlist: {
    defaultTitle: 'Missed rider submission deadline',
    defaultMessage:
      'Your team missed the rider submission deadline for a race. Review the race and prepare future rider submissions earlier.',
    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Missed%20rider%20submission%20deadline.png',

    enrich: (item) => {
      const payload = getPayload(item) ?? {}

      const raceName = pickFirstString(payload, [
        'race_name',
        'race_title',
        'event_name',
        'name',
      ])

      const requiredRiders = pickFirstNumber(payload, [
        'required_riders',
        'min_riders',
        'minimum_riders',
      ])

      const assignedRiders = pickFirstNumber(payload, [
        'assigned_riders',
        'submitted_riders',
        'selected_riders',
      ])

      return {
        ...item,
        title: raceName
          ? `Missed rider submission deadline: ${raceName}`
          : item.title || 'Missed rider submission deadline',
        message:
          raceName && requiredRiders !== null && assignedRiders !== null
            ? `Your team missed the rider submission deadline for ${raceName}. Required ${requiredRiders} riders, assigned ${assignedRiders}.`
            : item.message ||
              'Your team missed a rider submission deadline for an upcoming race.',
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const raceName = pickFirstString(payload, [
        'race_name',
        'race_title',
        'event_name',
        'name',
      ])

      if (raceName) {
        return `Your team did not submit enough riders before the deadline for ${raceName}.`
      }

      return (
        buildIntroFromMessage(item) ||
        'Your team missed a rider submission deadline.'
      )
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const requiredRiders = pickFirstNumber(payload, [
        'required_riders',
        'min_riders',
        'minimum_riders',
      ])

      const assignedRiders = pickFirstNumber(payload, [
        'assigned_riders',
        'submitted_riders',
        'selected_riders',
      ])

      const penaltyCash = pickFirstNumber(payload, [
        'cash_penalty',
        'penalty_cash',
        'fine_cash',
        'fine_amount',
      ])

      const commitmentPenalty = pickFirstNumber(payload, [
        'score_delta',
        'commitment_score_penalty',
        'race_commitment_score_penalty',
        'commitment_penalty',
      ])

      return compactRows([
        detailRow(
          'Race',
          pickFirstString(payload, [
            'race_name',
            'race_title',
            'event_name',
            'name',
          ])
        ),
        detailRow(
          'Required riders',
          requiredRiders !== null ? `${requiredRiders}` : null
        ),
        detailRow(
          'Assigned riders',
          assignedRiders !== null ? `${assignedRiders}` : null
        ),
        detailRow(
          'Cash penalty',
          penaltyCash !== null ? formatCurrencyLabel(penaltyCash, '$') : null
        ),
        detailRow(
          'Commitment score penalty',
          commitmentPenalty !== null ? `${commitmentPenalty}` : null
        ),
      ])
    },

    getExtraText: () =>
      'Missing this deadline can block your team from starting the race and may affect race commitment. Use the race page or Race Preparation page to review what happened and prepare future rider submissions earlier.',

    actions: [
      {
        key: 'open-race',
        label: 'Open race',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)

          const raceId = pickFirstString(payload, ['race_id'])
          if (raceId) return `/dashboard/races/${raceId}`

          const directHref =
            getActionHrefFromItem(item) ||
            pickFirstString(payload, [
              'race_path',
              'race_url',
              'action_url',
              'href',
            ])

          if (!directHref) return null

          if (directHref.startsWith('/races/')) {
            return `/dashboard${directHref}`
          }

          return directHref
        },
        show: (item) => {
          const payload = getPayload(item)

          return Boolean(
            pickFirstString(payload, ['race_id']) ||
              getActionHrefFromItem(item) ||
              pickFirstString(payload, [
                'race_path',
                'race_url',
                'action_url',
                'href',
              ])
          )
        },
      },
      {
        key: 'open-race-preparation',
        label: 'Race preparation',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/race-preparation',
        show: () => true,
      },
      {
        key: 'open-calendar',
        label: 'Calendar',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/calendar',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  }, 
RACE_PLAN_OPEN: {
  defaultTitle: 'Race plan open',
  defaultMessage:
    'A race is now open for planning and applications.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Plan%20Open.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Plan%20Open.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || 'Race'

    return {
      ...item,
      title: `Race plan open: ${raceName}`,
      message:
        item.message ||
        `${raceName} is now open for planning. Review the race details and submit your race plan before the rider deadline.`,
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || 'This race'

    return `${raceName} is now open for planning and applications. Review the race page, check the race dates, and submit your race plan before the rider deadline.`
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || null

    return compactRows([
      detailRow('Race', raceName),
      detailRow(
        'Race class',
        pickFirstString(payload, [
          'race_class',
          'class',
          'category',
          'race_category',
        ])
      ),
      detailRow(
        'Country',
        formatCountryName(
          pickFirstString(payload, [
            'country_name',
            'host_country_name',
            'country',
            'host_country',
            'country_code',
          ])
        )
      ),
      detailRow(
        'Region',
        pickFirstString(payload, [
          'region',
          'race_region',
          'market_region',
        ])
      ),
      detailRow(
        'Race starts',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'race_start_date',
            'start_date',
            'starts_on_game_date',
          ])
        )
      ),
      detailRow(
        'Race ends',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'race_end_date',
            'end_date',
            'ends_on_game_date',
          ])
        )
      ),
      detailRow(
        'Applications open',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'applications_open',
            'applications_open_game_date',
            'application_window_start_game_date',
          ])
        )
      ),
      detailRow(
        'Applications close',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'applications_close',
            'applications_close_game_date',
            'application_deadline_game_date',
          ])
        )
      ),
      detailRow(
        'Rider submission deadline',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'rider_submission_deadline',
            'rider_submission_deadline_game_date',
            'rider_deadline_on',
            'lineup_deadline_game_date',
          ])
        )
      ),
      detailRow(
        'Status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'application_status',
            'race_plan_status',
          ])
        ) || 'Open'
      ),
    ])
  },

  getExtraText: () =>
    'Open race preparation to select riders, staff and assets, or open the race page to review route details and requirements.',

  actions: [
    {
      key: 'open-race-preparation',
      label: 'Race preparation',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const raceId = pickFirstString(payload, ['race_id'])

        return (
          pickFirstString(payload, [
            'race_plan_path',
            'race_preparation_path',
            'action_path',
          ]) ||
          (raceId
            ? `/dashboard/race-preparation?tab=racePlan&raceId=${raceId}`
            : '/dashboard/race-preparation')
        )
      },
      show: () => true,
    },
    {
      key: 'open-race-page',
      label: 'Open race page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const raceId = pickFirstString(payload, ['race_id'])

        if (raceId) {
          return `/dashboard/races/${raceId}`
        }

        return (
          pickFirstString(payload, [
            'race_profile_path',
            'race_detail_path',
            'calendar_race_path',
          ]) || '/dashboard/calendar'
        )
      },
      show: (item) => {
        const payload = getPayload(item)

        return Boolean(
          pickFirstString(payload, [
            'race_id',
            'race_profile_path',
            'race_detail_path',
            'calendar_race_path',
          ])
        )
      },
    },
    {
      key: 'open-calendar',
      label: 'Team calendar',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        return (
          pickFirstString(payload, [
            'calendar_path',
            'team_calendar_path',
          ]) || '/dashboard/calendar'
        )
      },
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
  STAGE_PLAN_LOCKED: {
  defaultTitle: 'Stage plan locked',
  defaultMessage:
    'A stage plan is now locked and can no longer be changed.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stage%20Plan%20Locked.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stage%20Plan%20Locked.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || 'Race'

    const stageNumber = pickFirstNumber(payload, [
      'stage_number',
      'selected_stage_number',
    ])

    return {
      ...item,
      title:
        stageNumber !== null
          ? `Stage plan locked: ${raceName} Stage ${stageNumber}`
          : `Stage plan locked: ${raceName}`,
      message:
        item.message ||
        `The stage plan for ${raceName} is now locked and can no longer be changed.`,
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || 'This race'

    const stageNumber = pickFirstNumber(payload, [
      'stage_number',
      'selected_stage_number',
    ])

    if (stageNumber !== null) {
      return `Stage ${stageNumber} plan for ${raceName} is now locked. Rider roles, tactics and stage setup can no longer be changed for this stage.`
    }

    return `${raceName} stage plan is now locked. Rider roles, tactics and stage setup can no longer be changed.`
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || null

    const stageNumber = pickFirstNumber(payload, [
      'stage_number',
      'selected_stage_number',
    ])

    const startCity = pickFirstString(payload, [
      'start_city',
      'stage_start_city',
    ])

    const finishCity = pickFirstString(payload, [
      'finish_city',
      'stage_finish_city',
    ])

    return compactRows([
      detailRow('Race', raceName),
      detailRow(
        'Stage',
        stageNumber !== null ? `Stage ${stageNumber}` : null
      ),
      detailRow(
        'Route',
        startCity && finishCity ? `${startCity} → ${finishCity}` : null
      ),
      detailRow(
        'Race class',
        pickFirstString(payload, [
          'race_class',
          'class',
          'category',
          'race_category',
        ])
      ),
      detailRow(
        'Country',
        formatCountryName(
          pickFirstString(payload, [
            'country_name',
            'host_country_name',
            'country',
            'host_country',
            'country_code',
          ])
        )
      ),
      detailRow(
        'Stage start',
        formatGameDateTimeLabel(
          pickFirstString(payload, [
            'stage_start_at',
            'stage_start_datetime',
            'stage_date',
            'first_stage_date',
            'race_start_date',
          ]),
          pickFirstString(payload, [
            'stage_start_time_label',
            'planned_start_time_label',
          ])
        )
      ),
      detailRow(
        'Locked at',
        formatGameDateTimeLabel(
          pickFirstString(payload, [
            'stage_plan_locked_at',
            'locked_at',
            'stage_plan_lock_at',
            'stage_plan_lock_datetime',
            'stage_plan_lock_on',
            'stage_plans_lock_on',
          ]),
          pickFirstString(payload, [
            'stage_plan_lock_time_label',
            'lock_time_label',
          ])
        )
      ),
      detailRow(
        'Status',
        formatLabel(
          pickFirstString(payload, [
            'stage_plan_status',
            'stage_plans_status',
            'status',
          ])
        ) || 'Locked'
      ),
    ])
  },

  getExtraText: () =>
    'This stage plan is now final. You can still open the stage plan page to review the locked setup.',

  actions: [
    {
      key: 'open-stage-plans',
      label: 'Stage plans',
      variant: 'primary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const raceId = pickFirstString(payload, ['race_id'])
        const stageId = pickFirstString(payload, ['stage_id'])

        return (
          pickFirstString(payload, [
            'stage_plans_path',
            'stage_plan_path',
          ]) ||
          (raceId
            ? `/dashboard/race-preparation?tab=stagePlans&raceId=${raceId}${stageId ? `&stageId=${stageId}` : ''}`
            : '/dashboard/race-preparation?tab=stagePlans')
        )
      },
      show: () => true,
    },
    {
      key: 'open-race-preparation',
      label: 'Race preparation',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const raceId = pickFirstString(payload, ['race_id'])

        return (
          pickFirstString(payload, [
            'race_plan_path',
            'race_preparation_path',
            'action_path',
          ]) ||
          (raceId
            ? `/dashboard/race-preparation?tab=racePlan&raceId=${raceId}`
            : '/dashboard/race-preparation')
        )
      },
      show: () => true,
    },
    {
      key: 'open-race-page',
      label: 'Open race page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const raceId = pickFirstString(payload, ['race_id'])

        if (raceId) {
          return `/dashboard/races/${raceId}`
        }

        return (
          pickFirstString(payload, [
            'race_profile_path',
            'race_detail_path',
            'calendar_race_path',
          ]) || '/dashboard/calendar'
        )
      },
      show: (item) => {
        const payload = getPayload(item)

        return Boolean(
          pickFirstString(payload, [
            'race_id',
            'race_profile_path',
            'race_detail_path',
            'calendar_race_path',
          ])
        )
      },
    },
    {
      key: 'open-calendar',
      label: 'Team calendar',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)

        return (
          pickFirstString(payload, [
            'calendar_path',
            'team_calendar_path',
          ]) || '/dashboard/calendar'
        )
      },
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},

  RIDER_WANTS_MORE_RACE_SELECTION: {
    defaultTitle: 'Rider wants more race selection',
    defaultMessage:
      'A rider wants more race opportunities. Review race selection and keep morale stable before the situation gets worse.',

    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20wants%20more%20race%20selection.png',

    getImageSrc: (item) =>
      getImageSrcFromItem(item) ||
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20wants%20more%20race%20selection.png',

    enrich: (item) => {
      const payload = getPayload(item)
      const riderName = getPreferredRiderName(item) || pickFirstString(payload, ['rider_name', 'name'])

      return {
        ...item,
        title: riderName
          ? `Rider wants more race selection: ${riderName}`
          : item.title || 'Rider wants more race selection',
        message:
          item.message ||
          (riderName
            ? `${riderName} wants more chances to race. Review upcoming races and add the rider to suitable selections before morale drops further.`
            : 'A rider wants more race opportunities. Review upcoming races and add the rider to suitable selections before morale drops further.'),
      }
    },

    getIntroText: (item) => {
      const riderName = getPreferredRiderName(item) || 'This rider'

      return (
        buildIntroFromMessage(item) ||
        `${riderName} is asking for more race days. A fair race calendar helps protect morale and reduces the risk of release requests later in the season.`
      )
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      return compactRows([
        detailRow('Rider', getPreferredRiderName(item) || pickFirstString(payload, ['rider_name', 'name'])),
        detailRow('Current morale', pickFirstNumber(payload, ['morale', 'morale_score', 'current_morale']) !== null ? `${pickFirstNumber(payload, ['morale', 'morale_score', 'current_morale'])}` : null),
        detailRow('Recent race days', pickFirstNumber(payload, ['recent_race_days', 'race_days_recent', 'recent_participation_count']) !== null ? `${pickFirstNumber(payload, ['recent_race_days', 'race_days_recent', 'recent_participation_count'])}` : null),
        detailRow('Requested action', 'Review upcoming race selection'),
      ])
    },

    getExtraText: () =>
      'Open the rider profile to check morale and role expectations, then review upcoming race preparation to find a suitable race slot.',

    actions: [
      {
        key: 'open-rider',
        label: 'Open rider',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => getRiderProfileHref(item) || getTeamSquadHref(item),
        show: () => true,
      },
      {
        key: 'open-race-selection',
        label: 'Race planning',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)
          return (
            pickFirstString(payload, [
              'race_selection_path',
              'race_preparation_path',
              'planning_path',
            ]) || '/dashboard/race-preparation'
          )
        },
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  RIDER_REQUESTS_RELEASE: {
    defaultTitle: 'Rider requests release',
    defaultMessage:
      'A rider has formally asked to leave the team. Review the rider profile and decide how to respond.',

    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20request%20release.png',

    getImageSrc: (item) =>
      getImageSrcFromItem(item) ||
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20request%20release.png',

    enrich: (item) => {
      const payload = getPayload(item)
      const riderName = getPreferredRiderName(item) || pickFirstString(payload, ['rider_name', 'name'])

      return {
        ...item,
        title: riderName
          ? `Rider requests release: ${riderName}`
          : item.title || 'Rider requests release',
        message:
          item.message ||
          (riderName
            ? `${riderName} has asked to leave the team. Review morale, contract status, and recent race selection before making a decision.`
            : 'A rider has asked to leave the team. Review morale, contract status, and recent race selection before making a decision.'),
      }
    },

    getIntroText: (item) => {
      const riderName = getPreferredRiderName(item) || 'This rider'

      return (
        buildIntroFromMessage(item) ||
        `${riderName} has escalated the situation and requested a release. This should be handled quickly because it can affect squad stability and long-term planning.`
      )
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      return compactRows([
        detailRow('Rider', getPreferredRiderName(item) || pickFirstString(payload, ['rider_name', 'name'])),
        detailRow('Current morale', pickFirstNumber(payload, ['morale', 'morale_score', 'current_morale']) !== null ? `${pickFirstNumber(payload, ['morale', 'morale_score', 'current_morale'])}` : null),
        detailRow('Days unhappy', pickFirstNumber(payload, ['days_unhappy', 'consecutive_unhappy_days', 'low_morale_days']) !== null ? `${pickFirstNumber(payload, ['days_unhappy', 'consecutive_unhappy_days', 'low_morale_days'])}` : null),
        detailRow('Contract status', formatLabel(pickFirstString(payload, ['contract_status', 'release_status']))),
      ])
    },

    getExtraText: () =>
      'Open the rider profile first. Then review squad planning and transfer/contract options before deciding whether to repair morale or allow the rider to leave.',

    actions: [
      {
        key: 'open-rider',
        label: 'Open rider',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => getRiderProfileHref(item) || getTeamSquadHref(item),
        show: () => true,
      },
      {
        key: 'open-release-options',
        label: 'Release options',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)
          return (
            pickFirstString(payload, [
              'release_action_path',
              'contract_path',
              'transfers_path',
            ]) || '/dashboard/transfers'
          )
        },
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  COINS_LOW_WARNING: {
    defaultTitle: 'Coins are running low',
    defaultMessage:
      'Your coin balance is low. Add more coins before your balance reaches zero.',

    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Coins%20Low%20Warning.png',

    getImageSrc: (item) =>
      getImageSrcFromItem(item) ||
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Coins%20Low%20Warning.png',

    enrich: (item) => {
      const payload = getPayload(item)
      const balance = pickFirstNumber(payload, ['coin_balance', 'coins_balance', 'coins', 'balance'])
      return {
        ...item,
        title: item.title || 'Coins are running low',
        message:
          item.message ||
          (balance !== null
            ? `Your coin balance is down to ${balance} coin${balance === 1 ? '' : 's'}. Add more coins before your balance reaches zero.`
            : 'Your coin balance is low. Add more coins before your balance reaches zero.'),
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)
      const balance = pickFirstNumber(payload, ['coin_balance', 'coins_balance', 'coins', 'balance'])

      return (
        buildIntroFromMessage(item) ||
        (balance !== null
          ? `Your account currently has ${balance} coin${balance === 1 ? '' : 's'} left. Review Pro Packages now so gameplay is not interrupted later.`
          : 'Your account coin balance is low. Review Pro Packages now so gameplay is not interrupted later.')
      )
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)
      const balance = pickFirstNumber(payload, ['coin_balance', 'coins_balance', 'coins', 'balance'])
      const threshold = pickFirstNumber(payload, ['threshold', 'warning_threshold', 'low_coin_threshold'])

      return compactRows([
        detailRow('Current balance', balance !== null ? `${balance} coin${balance === 1 ? '' : 's'}` : null),
        detailRow('Warning threshold', threshold !== null ? `${threshold} coin${threshold === 1 ? '' : 's'}` : null),
        detailRow('Recommended action', 'Open Pro Packages'),
      ])
    },

    getExtraText: () =>
      'Coins are used for eligible game access and premium actions. Top up before the balance reaches zero.',

    actions: [
      {
        key: 'open-pro-packages',
        label: 'Pro Packages',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)
          return (
            pickFirstString(payload, [
              'pro_packages_path',
              'coin_packages_path',
              'shop_path',
            ]) || '/dashboard/pro-packages'
          )
        },
        show: () => true,
      },
      {
        key: 'open-dashboard',
        label: 'Dashboard',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  RACE_SUPPLIES_LOW_STOCK: {
    defaultTitle: 'Race supplies low stock',
    defaultMessage:
      'Some race supplies are running low. Restock before upcoming races.',

    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Supplies%20low.png',

    getImageSrc: (item) =>
      getImageSrcFromItem(item) ||
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Supplies%20low.png',

    enrich: (item) => {
      const payload = getPayload(item)
      const lowCount = pickFirstNumber(payload, ['low_stock_count', 'low_supply_count', 'item_count', 'count'])

      return {
        ...item,
        title:
          lowCount !== null
            ? `Race supplies low stock: ${lowCount} item${lowCount === 1 ? '' : 's'}`
            : item.title || 'Race supplies low stock',
        message:
          item.message ||
          'Some race supplies are below the recommended stock level. Restock early so upcoming race preparation is not blocked.',
      }
    },

    getIntroText: (item) =>
      buildIntroFromMessage(item) ||
      'Some race supplies are below the recommended stock level. This is not yet a critical shortage, but restocking early protects your next race preparation.',

    getDetailRows: (item) => {
      const payload = getPayload(item)
      const lowCount = pickFirstNumber(payload, ['low_stock_count', 'low_supply_count', 'item_count', 'count'])

      return compactRows([
        detailRow('Low-stock items', lowCount !== null ? `${lowCount}` : null),
        detailRow('Supply status', pickFirstString(payload, ['low_stock_summary', 'supplies_summary', 'stock_summary'])),
        detailRow('Recommended action', 'Open Race Supplies and restock'),
      ])
    },

    getExtraText: () =>
      'Low stock is an early warning. Critical supply shortage notifications appear when your team may not have enough supplies for upcoming race preparation.',

    actions: [
      {
        key: 'open-race-supplies',
        label: 'Race supplies',
        variant: 'primary',
        kind: 'navigate',
        getHref: () => '/dashboard/equipment?tab=race-supplies',
        show: () => true,
      },
      {
        key: 'open-equipment',
        label: 'Equipment page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/equipment',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },
RACE_SUPPLIES_LOW: {
  defaultTitle: 'Race supplies low',
  defaultMessage:
    'Your race supplies are low. Review stock levels and restock before the next race.',

  imageSrc:
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Supplies%20low.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Supplies%20low.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || null

    const criticalCount = pickFirstNumber(payload, [
      'critical_count',
      'critical_items_count',
      'low_supply_count',
      'shortage_count',
    ])

    return {
      ...item,
      title: raceName
        ? `Race supplies low: ${raceName}`
        : criticalCount !== null
          ? `Race supplies critically low: ${criticalCount} item${criticalCount === 1 ? '' : 's'}`
          : item.title || 'Race supplies low',
      message:
        item.message ||
        (raceName
          ? `Your club does not currently have enough race supplies for ${raceName}. Review shortages and restock before the race deadline.`
          : 'Some race supplies are critically low. Review stock levels and restock before your next race preparation.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || null

    if (raceName) {
      return `${raceName} requires more race supplies than your club currently has available. Open Race Supplies and restock the missing items before the race.`
    }

    return 'Your race supplies stock is critically low. Restock consumables and durable race supplies before preparing for the next race.'
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const raceName =
      pickFirstString(payload, [
        'race_name',
        'race_title',
        'name',
      ]) || null

    const shortageCount = pickFirstNumber(payload, [
      'shortage_count',
      'missing_items_count',
      'low_supply_count',
      'critical_count',
      'critical_items_count',
    ])

    const shortageSummary =
      pickFirstString(payload, [
        'shortage_summary',
        'supplies_summary',
        'missing_supplies_summary',
        'critical_summary',
        'low_stock_summary',
      ]) ||
      (() => {
        const rows = Array.isArray(payload?.shortages)
          ? payload.shortages
          : Array.isArray(payload?.critical_items)
            ? payload.critical_items
            : Array.isArray(payload?.low_items)
              ? payload.low_items
              : []

        if (!Array.isArray(rows) || rows.length === 0) {
          return null
        }

        return rows
          .map((item) => {
            const row =
              item !== null && typeof item === 'object' && !Array.isArray(item)
                ? (item as Record<string, unknown>)
                : null

            if (!row) return null

            const supplyName =
              readString(row.supply_name) ||
              readString(row.display_name) ||
              readString(row.name) ||
              formatLabel(readString(row.supply_key)) ||
              'Supply item'

            const required =
              readNumber(row.required_quantity) ??
              readNumber(row.required_qty) ??
              readNumber(row.required)

            const available =
              readNumber(row.available_quantity) ??
              readNumber(row.available_qty) ??
              readNumber(row.available) ??
              readNumber(row.stock_now) ??
              readNumber(row.current_stock)

            const missing =
              readNumber(row.missing_quantity) ??
              readNumber(row.missing_qty) ??
              readNumber(row.missing)

            const threshold =
              readNumber(row.threshold) ??
              readNumber(row.critical_threshold) ??
              readNumber(row.low_stock_threshold)

            if (required !== null && available !== null && missing !== null) {
              return `${supplyName}: missing ${missing} (${available}/${required} available)`
            }

            if (available !== null && threshold !== null) {
              return `${supplyName}: ${available} left, threshold ${threshold}`
            }

            if (available !== null) {
              return `${supplyName}: ${available} left`
            }

            return supplyName
          })
          .filter(Boolean)
          .join(', ')
      })()

    return compactRows([
      detailRow('Race', raceName),
      detailRow(
        'Race date',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'race_start_date',
            'start_date',
            'starts_on_game_date',
            'stage_date',
          ])
        )
      ),
      detailRow(
        'Critical items',
        shortageCount !== null ? `${shortageCount}` : null
      ),
      detailRow('Supply status', shortageSummary),
      detailRow(
        'Bidons / Water Bottles',
        (() => {
          const stock = pickFirstNumber(payload, [
            'bidons_available',
            'water_bottles_available',
            'bidons_stock',
            'water_bottles_stock',
          ])

          const required = pickFirstNumber(payload, [
            'bidons_required',
            'water_bottles_required',
          ])

          if (stock !== null && required !== null) {
            return `${stock}/${required} available`
          }

          return stock !== null ? `${stock} available` : null
        })()
      ),
      detailRow(
        'Energy Gels',
        (() => {
          const stock = pickFirstNumber(payload, [
            'energy_gels_available',
            'gels_available',
            'energy_gels_stock',
            'gels_stock',
          ])

          const required = pickFirstNumber(payload, [
            'energy_gels_required',
            'gels_required',
          ])

          if (stock !== null && required !== null) {
            return `${stock}/${required} available`
          }

          return stock !== null ? `${stock} available` : null
        })()
      ),
      detailRow(
        'Nutrition Packs',
        (() => {
          const stock = pickFirstNumber(payload, [
            'nutrition_packs_available',
            'nutrition_available',
            'nutrition_packs_stock',
            'nutrition_stock',
          ])

          const required = pickFirstNumber(payload, [
            'nutrition_packs_required',
            'nutrition_required',
          ])

          if (stock !== null && required !== null) {
            return `${stock}/${required} available`
          }

          return stock !== null ? `${stock} available` : null
        })()
      ),
      detailRow(
        'Race Jersey Complete',
        (() => {
          const stock = pickFirstNumber(payload, [
            'race_jersey_complete_available',
            'race_jersey_available',
            'jersey_available',
            'race_jersey_complete_stock',
            'race_jersey_stock',
            'jersey_stock',
          ])

          const required = pickFirstNumber(payload, [
            'race_jersey_complete_required',
            'race_jersey_required',
            'jersey_required',
          ])

          if (stock !== null && required !== null) {
            return `${stock}/${required} available`
          }

          return stock !== null ? `${stock} available` : null
        })()
      ),
      detailRow(
        'Rain Jackets',
        (() => {
          const stock = pickFirstNumber(payload, [
            'rain_jackets_available',
            'rain_jackets_stock',
          ])

          const required = pickFirstNumber(payload, [
            'rain_jackets_required',
          ])

          if (stock !== null && required !== null) {
            return `${stock}/${required} available`
          }

          return stock !== null ? `${stock} available` : null
        })()
      ),
      detailRow(
        'Status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'supply_status',
            'stock_status',
          ])
        ) || 'Restock required'
      ),
    ])
  },

  getExtraText: () =>
    'Consumables are used once. Race Jersey Complete and Rain Jackets are durable reusable supplies with stage-use limits. Restock before race preparation to avoid missing supplies.',

  actions: [
    {
      key: 'open-race-supplies',
      label: 'Race supplies',
      variant: 'primary',
      kind: 'navigate',
      getHref: () => '/dashboard/equipment?tab=race-supplies',
      show: () => true,
    },
    {
      key: 'open-equipment',
      label: 'Equipment page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/equipment',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},
STAGE_PLAN_MISSING_AT_LOCK: {
    defaultTitle: 'Stage plan missing',
    defaultMessage:
      'A stage plan was missing when the stage locked. Review the race preparation page.',

    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stage%20Plan%20Locked.png',

    getImageSrc: (item) =>
      getImageSrcFromItem(item) ||
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stage%20Plan%20Locked.png',

    enrich: (item) => {
      const payload = getPayload(item)

      const raceName =
        pickFirstString(payload, [
          'race_name',
          'race_title',
          'name',
        ]) || 'Race'

      const stageNumber = pickFirstString(payload, ['stage_number'])
      const stageLabel = stageNumber ? ` Stage ${stageNumber}` : ''

      return {
        ...item,
        title: `Stage plan missing: ${raceName}${stageLabel}`,
        message:
          item.message ||
          `No stage plan was found for ${raceName}${stageLabel} after the lock time.`,
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const raceName =
        pickFirstString(payload, [
          'race_name',
          'race_title',
          'name',
        ]) || 'this race'

      const stageNumber = pickFirstString(payload, ['stage_number'])
      const stageLabel = stageNumber ? ` Stage ${stageNumber}` : ''

      return `No stage plan was found for ${raceName}${stageLabel} when the stage locked. The team may race with a weaker/default setup unless a fallback plan is generated.`
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const stageNumber = pickFirstString(payload, ['stage_number'])

      return compactRows([
        detailRow(
          'Race',
          pickFirstString(payload, [
            'race_name',
            'race_title',
            'name',
          ])
        ),
        detailRow(
          'Stage',
          stageNumber ? `Stage ${stageNumber}` : null
        ),
        detailRow(
          'Stage date',
          formatContractSeasonLabel(
            pickFirstString(payload, [
              'stage_date',
              'race_stage_date',
              'starts_on_game_date',
            ])
          )
        ),
        detailRow(
          'Start',
          pickFirstString(payload, [
            'start_city',
            'stage_start_city',
          ])
        ),
        detailRow(
          'Finish',
          pickFirstString(payload, [
            'finish_city',
            'stage_finish_city',
          ])
        ),
        detailRow(
          'Reason',
          formatLabel(
            pickFirstString(payload, [
              'missing_reason',
              'reason',
            ])
          ) || 'No stage plan found after lock'
        ),
        detailRow(
          'Fine applied',
          pickFirstString(payload, ['fine_applied']) === 'true'
            ? 'Yes'
            : 'No'
        ),
        detailRow(
          'Fine status',
          formatLabel(
            pickFirstString(payload, [
              'fine_status',
              'penalty_status',
            ])
          )
        ),
      ])
    },

    getExtraText: () =>
      'Open Stage Plans to review what happened. Fine logic is not applied yet; it should be connected later through the finance ledger model.',

    actions: [
      {
        key: 'open-stage-plans',
        label: 'Stage plans',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)
          const raceId = pickFirstString(payload, ['race_id'])
          const stageId = pickFirstString(payload, ['stage_id'])

          return (
            pickFirstString(payload, [
              'stage_plans_path',
              'stage_plan_path',
            ]) ||
            (raceId
              ? `/dashboard/race-preparation?tab=stagePlans&raceId=${raceId}${stageId ? `&stageId=${stageId}` : ''}`
              : '/dashboard/race-preparation?tab=stagePlans')
          )
        },
        show: () => true,
      },
      {
        key: 'open-race-page',
        label: 'Open race page',
        variant: 'secondary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)
          const raceId = pickFirstString(payload, ['race_id'])

          return raceId
            ? `/dashboard/races/${raceId}`
            : pickFirstString(payload, [
                'race_profile_path',
                'race_detail_path',
                'race_page_path',
              ]) || '/dashboard/calendar'
        },
        show: () => true,
      },
      {
        key: 'open-calendar',
        label: 'Team calendar',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/calendar',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  MAIN_SPONSOR_OBJECTIVE_ACHIEVED: {
    defaultTitle: 'Main sponsor objective achieved',
    defaultMessage:
      'Your team achieved a main sponsor objective. Review sponsor progress and bonus details.',

    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Main%20sponsor%20objecitve%20achived.png',

    getImageSrc: (item) =>
      getImageSrcFromItem(item) ||
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Main%20sponsor%20objecitve%20achived.png',

    enrich: (item) => {
      const payload = getPayload(item)
      const objectiveName = pickFirstString(payload, ['objective_name', 'goal_name', 'target_name'])
      const sponsorName = pickFirstString(payload, ['sponsor_name', 'company_name', 'main_sponsor_name']) || 'Main sponsor'
      const bonus = pickFirstNumber(payload, ['bonus_amount_cash', 'bonus_cash', 'bonus_amount', 'reward_cash'])

      return {
        ...item,
        title: objectiveName
          ? `Sponsor objective achieved: ${objectiveName}`
          : item.title || 'Main sponsor objective achieved',
        message:
          item.message ||
          (bonus !== null
            ? `${sponsorName} confirmed the objective and awarded ${formatCurrencyOrZero(bonus)}.`
            : `${sponsorName} confirmed that your team achieved the objective.`),
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)
      const sponsorName = pickFirstString(payload, ['sponsor_name', 'company_name', 'main_sponsor_name']) || 'Your main sponsor'

      return (
        buildIntroFromMessage(item) ||
        `${sponsorName} is satisfied with your progress. The objective is complete and any related bonus or sponsor impact can now be reviewed.`
      )
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)
      const bonus = pickFirstNumber(payload, ['bonus_amount_cash', 'bonus_cash', 'bonus_amount', 'reward_cash'])

      return compactRows([
        detailRow('Sponsor', pickFirstString(payload, ['sponsor_name', 'company_name', 'main_sponsor_name'])),
        detailRow('Objective', pickFirstString(payload, ['objective_name', 'goal_name', 'target_name'])),
        detailRow('Bonus paid', formatCurrencyLabel(bonus, '$')),
        detailRow('Result', 'Achieved'),
      ])
    },

    getExtraText: () =>
      'Open Sponsors to review the completed objective, bonus details, and remaining season targets.',

    actions: [
      {
        key: 'open-sponsors',
        label: 'Open sponsors',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)
          return (
            pickFirstString(payload, [
              'finance_sponsor_path',
              'finance_sponsors_path',
              'sponsor_path',
              'sponsors_path',
              'objectives_path',
            ]) || '/dashboard/finance?tab=sponsors'
          )
        },
        show: () => true,
      },
      {
        key: 'open-dashboard',
        label: 'Dashboard',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/overview',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  MAIN_SPONSOR_OBJECTIVE_FAILED: {
    defaultTitle: 'Main sponsor objective failed',
    defaultMessage:
      'Your team failed a main sponsor objective. Review the missed target and sponsor impact.',

    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Main%20sponsor%20objecitve%20faild.png',

    getImageSrc: (item) =>
      getImageSrcFromItem(item) ||
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Main%20sponsor%20objecitve%20faild.png',

    enrich: (item) => {
      const payload = getPayload(item)
      const objectiveName = pickFirstString(payload, ['objective_name', 'goal_name', 'target_name'])
      const sponsorName = pickFirstString(payload, ['sponsor_name', 'company_name', 'main_sponsor_name']) || 'Main sponsor'
      const missedBonus = pickFirstNumber(payload, ['bonus_amount_cash', 'bonus_cash', 'missed_bonus_cash', 'missed_bonus_amount'])

      return {
        ...item,
        title: objectiveName
          ? `Sponsor objective failed: ${objectiveName}`
          : item.title || 'Main sponsor objective failed',
        message:
          item.message ||
          (missedBonus !== null
            ? `${sponsorName} marked the objective as failed, so the ${formatCurrencyOrZero(missedBonus)} bonus was not paid.`
            : `${sponsorName} marked this objective as failed. Review the missed target and sponsor impact.`),
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)
      const sponsorName = pickFirstString(payload, ['sponsor_name', 'company_name', 'main_sponsor_name']) || 'Your main sponsor'

      return (
        buildIntroFromMessage(item) ||
        `${sponsorName} marked an objective as missed. Review what failed, which bonus was lost, and which remaining objectives can still protect sponsor satisfaction.`
      )
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)
      const missedBonus = pickFirstNumber(payload, ['bonus_amount_cash', 'bonus_cash', 'missed_bonus_cash', 'missed_bonus_amount'])

      return compactRows([
        detailRow('Sponsor', pickFirstString(payload, ['sponsor_name', 'company_name', 'main_sponsor_name'])),
        detailRow('Objective', pickFirstString(payload, ['objective_name', 'goal_name', 'target_name'])),
        detailRow('Missed bonus', formatCurrencyLabel(missedBonus, '$')),
        detailRow('Reason', pickFirstString(payload, ['reason', 'failure_reason', 'missed_reason'])),
        detailRow('Result', 'Failed'),
      ])
    },

    getExtraText: () =>
      'Open Sponsors to review the failed objective and decide which remaining targets should become the priority.',

    actions: [
      {
        key: 'open-sponsors',
        label: 'Open sponsors',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)
          return (
            pickFirstString(payload, [
              'finance_sponsor_path',
              'finance_sponsors_path',
              'sponsor_path',
              'sponsors_path',
              'objectives_path',
            ]) || '/dashboard/finance?tab=sponsors'
          )
        },
        show: () => true,
      },
      {
        key: 'open-dashboard',
        label: 'Dashboard',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/overview',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },
  INFRASTRUCTURE_ASSET_ORDERED: {
  defaultTitle: 'Asset ordered',
  defaultMessage:
    'A new infrastructure asset has been ordered and is now waiting for delivery.',

  imageSrc:    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Asset%20Order.png',

  getImageSrc: (item) =>
    getImageSrcFromItem(item) ||    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Asset%20Order.png',

  enrich: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'target_key',
          'asset_key',
          'key',
        ])
      )

    const quantity = pickFirstNumber(payload, [
      'asset_quantity',
      'quantity',
      'count',
    ])

    return {
      ...item,
      title: assetLabel
        ? `Asset ordered: ${assetLabel}${quantity && quantity > 1 ? ` x${quantity}` : ''}`
        : item.title || 'Asset ordered',
      message:
        item.message ||
        (assetLabel
          ? `${assetLabel}${quantity && quantity > 1 ? ` x${quantity}` : ''} has been ordered and is waiting for delivery.`
          : 'A new infrastructure asset has been ordered and is waiting for delivery.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'target_key',
          'asset_key',
          'key',
        ])
      )

    const quantity = pickFirstNumber(payload, [
      'asset_quantity',
      'quantity',
      'count',
    ])

    if (assetLabel) {
      return `${assetLabel}${quantity && quantity > 1 ? ` x${quantity}` : ''} has been ordered for your club. Delivery is now scheduled.`
    }

    return (
      buildIntroFromMessage(item) ||
      'A new infrastructure asset has been ordered for your club. Delivery is now scheduled.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)

    const assetLabel =
      pickFirstString(payload, [
        'asset_name',
        'display_name',
        'asset_label',
        'name',
      ]) ||
      formatLabel(
        pickFirstString(payload, [
          'target_key',
          'asset_key',
          'key',
        ])
      )

    const quantity = pickFirstNumber(payload, [
      'asset_quantity',
      'quantity',
      'count',
    ])

    const assetLevel = pickFirstNumber(payload, [
      'asset_level',
      'level',
      'tier',
    ])

    const costCash = pickFirstNumber(payload, [
      'cost_cash',
      'asset_cost',
      'purchase_cost',
      'price',
      'cash_cost',
    ])

    const durationDays = pickFirstNumber(payload, [
      'duration_game_days',
      'delivery_days',
      'duration_days',
    ])

    return compactRows([
      detailRow('Asset', assetLabel),
      detailRow(
        'Quantity',
        quantity !== null ? `${quantity}` : null
      ),
      detailRow(
        'Asset level',
        assetLevel !== null ? `${assetLevel}` : null
      ),
      detailRow(
        'Order cost',
        formatCurrencyLabel(costCash, '$')
      ),
      detailRow(
        'Ordered on',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'started_game_date',
            'ordered_on_game_date',
            'order_game_date',
            'created_game_date',
            'game_date',
          ])
        )
      ),
      detailRow(
        'Planned delivery',
        formatContractSeasonLabel(
          pickFirstString(payload, [
            'complete_game_date',
            'delivery_game_date',
            'planned_delivery_game_date',
            'delivers_on_game_date',
          ])
        )
      ),
      detailRow(
        'Delivery time',
        durationDays !== null
          ? `${durationDays} day${durationDays === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Status',
        formatLabel(
          pickFirstString(payload, [
            'status',
            'job_status',
            'delivery_status',
          ])
        ) || 'Ordered'
      ),
    ])
  },

  getExtraText: () =>
    'Open the infrastructure assets page to review the delivery queue and check when the ordered asset will become available.',

  actions: [
    {
      key: 'open-infrastructure-assets',
      label: 'Open assets',
      variant: 'primary',
      kind: 'navigate',
      getHref: () => '/dashboard/infrastructure?tab=assets',
      show: () => true,
    },
    {
      key: 'open-infrastructure-page',
      label: 'Infrastructure page',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) =>
        getActionHrefFromItem(item) || '/dashboard/infrastructure',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
},


  STAFF_CONTRACT_EXPIRED: {
    defaultTitle: 'Staff contract expired',
    defaultMessage:
      'A staff contract has expired. Review your staffing situation and decide whether a replacement is needed.',

    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Staff%20contract%20expired.png',

    getImageSrc: (item) =>
      getImageSrcFromItem(item) ||
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Staff%20contract%20expired.png',

    enrich: (item) => {
      const payload = getPayload(item)

      const staffName =
        pickFirstString(payload, [
          'staff_name',
          'employee_name',
          'person_name',
          'full_name',
          'name',
        ]) || null

      const role =
        formatLabel(
          pickFirstString(payload, [
            'staff_role',
            'role',
            'role_code',
            'staff_type',
          ])
        ) || null

      return {
        ...item,
        title: staffName
          ? `Staff contract expired: ${staffName}`
          : item.title || 'Staff contract expired',
        message:
          item.message ||
          (staffName && role
            ? `${staffName}'s contract as ${role} has expired. The staff member is no longer under contract with your club.`
            : staffName
              ? `${staffName}'s contract has expired. The staff member is no longer under contract with your club.`
              : 'A staff contract has expired. The staff member is no longer under contract with your club.'),
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const staffName =
        pickFirstString(payload, [
          'staff_name',
          'employee_name',
          'person_name',
          'full_name',
          'name',
        ]) || null

      const role =
        formatLabel(
          pickFirstString(payload, [
            'staff_role',
            'role',
            'role_code',
            'staff_type',
          ])
        ) || null

      if (staffName && role) {
        return `${staffName}'s contract as ${role} has now expired. The staff member has left your contracted staff structure, so review the vacancy and decide whether the role should be filled again.`
      }

      if (staffName) {
        return `${staffName}'s contract has now expired. Review your staff structure and decide whether a replacement is required.`
      }

      return (
        buildIntroFromMessage(item) ||
        'A staff contract has expired. Review your staff structure and decide whether a replacement is required.'
      )
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const contractLength =
        pickFirstNumber(payload, [
          'contract_length_seasons',
          'contract_seasons',
          'duration_seasons',
        ])

      return compactRows([
        detailRow(
          'Staff member',
          pickFirstString(payload, [
            'staff_name',
            'employee_name',
            'person_name',
            'full_name',
            'name',
          ])
        ),
        detailRow(
          'Role',
          formatLabel(
            pickFirstString(payload, [
              'staff_role',
              'role',
              'role_code',
              'staff_type',
            ])
          )
        ),
        detailRow(
          'Club',
          pickFirstString(payload, [
            'club_name',
            'team_name',
          ])
        ),
        detailRow(
          'Contract length',
          contractLength !== null
            ? `${contractLength} season${contractLength === 1 ? '' : 's'}`
            : null
        ),
        detailRow(
          'Expired on',
          formatContractSeasonLabel(
            pickFirstString(payload, [
              'expired_on_game_date',
              'contract_end_game_date',
              'contract_end_date',
              'end_game_date',
              'game_date',
            ])
          )
        ),
        detailRow(
          'Status',
          formatLabel(
            pickFirstString(payload, [
              'status',
              'contract_status',
              'staff_status',
            ])
          ) || 'Contract expired'
        ),
      ])
    },

    getExtraText: () =>
      'The expired contract is no longer active. Open the Staff page to review your current structure, or use the Staff Market to search for a replacement.',

    actions: [
      {
        key: 'open-staff-page',
        label: 'Staff page',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => getActionHrefFromItem(item) || '/dashboard/staff',
        show: () => true,
      },
      {
        key: 'open-staff-market',
        label: 'Staff market',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/transfers?tab=staff',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  RIDER_CONTRACT_EXPIRED: {
    defaultTitle: 'Rider contract expired',
    defaultMessage:
      'A rider contract has expired. Review your squad and plan the next roster move.',

    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20contract%20expired.png',

    getImageSrc: (item) =>
      getImageSrcFromItem(item) ||
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20contract%20expired.png',

    enrich: (item) => {
      const payload = getPayload(item)
      const riderName = getPreferredRiderName(item)

      const role =
        formatLabel(
          pickFirstString(payload, [
            'rider_role',
            'role',
            'team_role',
          ])
        ) || null

      return {
        ...item,
        title: riderName
          ? `Rider contract expired: ${riderName}`
          : item.title || 'Rider contract expired',
        message:
          item.message ||
          (riderName && role
            ? `${riderName}'s contract as ${role} has expired. The rider is no longer contracted to your club.`
            : riderName
              ? `${riderName}'s contract has expired. The rider is no longer contracted to your club.`
              : 'A rider contract has expired. The rider is no longer contracted to your club.'),
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)
      const riderName = getPreferredRiderName(item)

      const destination =
        pickFirstString(payload, [
          'new_status',
          'destination_status',
          'rider_status',
        ]) || null

      if (riderName && destination) {
        return `${riderName}'s contract has expired and the rider is now ${formatLabel(destination)}. Review your squad depth and decide whether you need a replacement.`
      }

      if (riderName) {
        return `${riderName}'s contract has now expired. The rider is no longer under contract with your club, so review your squad and plan the next roster move.`
      }

      return (
        buildIntroFromMessage(item) ||
        'A rider contract has expired. Review your squad and plan the next roster move.'
      )
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const weeklySalary =
        pickFirstNumber(payload, [
          'salary_weekly',
          'weekly_salary',
          'contract_salary_weekly',
        ])

      const contractLength =
        pickFirstNumber(payload, [
          'contract_length_seasons',
          'contract_seasons',
          'duration_seasons',
        ])

      return compactRows([
        detailRow('Rider', getPreferredRiderName(item)),
        detailRow(
          'Role',
          formatLabel(
            pickFirstString(payload, [
              'rider_role',
              'role',
              'team_role',
            ])
          )
        ),
        detailRow(
          'Club',
          pickFirstString(payload, [
            'club_name',
            'team_name',
          ])
        ),
        detailRow(
          'Previous weekly salary',
          weeklySalary !== null
            ? `${formatCurrencyLabel(weeklySalary, '$')}/week`
            : null
        ),
        detailRow(
          'Contract length',
          contractLength !== null
            ? `${contractLength} season${contractLength === 1 ? '' : 's'}`
            : null
        ),
        detailRow(
          'Expired on',
          formatContractSeasonLabel(
            pickFirstString(payload, [
              'expired_on_game_date',
              'contract_end_game_date',
              'contract_end_date',
              'end_game_date',
              'game_date',
            ])
          )
        ),
        detailRow(
          'New status',
          formatLabel(
            pickFirstString(payload, [
              'new_status',
              'destination_status',
              'rider_status',
              'status',
            ])
          ) || 'Contract expired'
        ),
      ])
    },

    getExtraText: () =>
      'The rider is no longer part of your active contracted squad. Review your current roster and use the transfer or free-agent market if you need a replacement.',

    actions: [
      {
        key: 'open-squad',
        label: 'Open squad',
        variant: 'primary',
        kind: 'navigate',
        getHref: () => '/dashboard/squad',
        show: () => true,
      },
      {
        key: 'open-transfers',
        label: 'Transfer market',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/transfers',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  NEW_SEASON_STARTED: {
    defaultTitle: 'New season started',
    defaultMessage:
      'A new season has begun. Your club is ready for the next year of competition.',

    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/new%20season%20started.png',

    getImageSrc: (item) =>
      getImageSrcFromItem(item) ||
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/new%20season%20started.png',

    enrich: (item) => {
      const payload = getPayload(item)

      const seasonNumber = pickFirstNumber(payload, [
        'season_number',
        'season',
        'new_season_number',
        'current_season',
      ])

      const clubName =
        pickFirstString(payload, [
          'club_name',
          'team_name',
        ]) || null

      return {
        ...item,
        title:
          seasonNumber !== null
            ? `Season ${seasonNumber} has started`
            : item.title || 'New season started',
        message:
          item.message ||
          (clubName && seasonNumber !== null
            ? `A new chapter begins for ${clubName}. Season ${seasonNumber} is now underway.`
            : seasonNumber !== null
              ? `Season ${seasonNumber} is now underway. Review your club and prepare for the year ahead.`
              : 'A new season is now underway. Review your club and prepare for the year ahead.'),
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)

      const seasonNumber = pickFirstNumber(payload, [
        'season_number',
        'season',
        'new_season_number',
        'current_season',
      ])

      const clubName =
        pickFirstString(payload, [
          'club_name',
          'team_name',
        ]) || 'Your club'

      if (seasonNumber !== null) {
        return `Welcome to Season ${seasonNumber}! ${clubName} begins a fresh campaign with new objectives, a new race calendar and another opportunity to build toward long-term success.`
      }

      return (
        buildIntroFromMessage(item) ||
        `A new season has started. ${clubName} begins a fresh campaign with new objectives, a new race calendar and another opportunity to build toward long-term success.`
      )
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)

      const seasonNumber = pickFirstNumber(payload, [
        'season_number',
        'season',
        'new_season_number',
        'current_season',
      ])

      return compactRows([
        detailRow(
          'Season',
          seasonNumber !== null ? `Season ${seasonNumber}` : null
        ),
        detailRow(
          'Club',
          pickFirstString(payload, [
            'club_name',
            'team_name',
          ])
        ),
        detailRow(
          'Season start',
          formatContractSeasonLabel(
            pickFirstString(payload, [
              'season_start_game_date',
              'started_on_game_date',
              'start_game_date',
              'game_date',
            ])
          )
        ),
        detailRow(
          'Status',
          formatLabel(
            pickFirstString(payload, [
              'season_status',
              'status',
            ])
          ) || 'Season active'
        ),
      ])
    },

    getExtraText: (item) => {
      const payload = getPayload(item)
      const seasonNumber = pickFirstNumber(payload, [
        'season_number',
        'season',
        'new_season_number',
        'current_season',
      ])

      return seasonNumber !== null
        ? `Season ${seasonNumber} is officially underway. Review your squad, staff, finances, sponsors and calendar before the first major decisions of the new campaign.`
        : 'The new season is officially underway. Review your squad, staff, finances, sponsors and calendar before the first major decisions of the new campaign.'
    },

    actions: [
      {
        key: 'open-overview',
        label: 'Season overview',
        variant: 'primary',
        kind: 'navigate',
        getHref: () => '/dashboard/overview',
        show: () => true,
      },
      {
        key: 'open-calendar',
        label: 'Season calendar',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/calendar',
        show: () => true,
      },
      {
        key: 'open-club',
        label: 'Review club',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

  COMPETITION_REWARD_GRANTED: {
    defaultTitle: 'Competition reward granted',
    defaultMessage:
      'Your club has earned a competition reward. The prize has been credited to your club.',

    imageSrc:
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/competation%20reward.png',

    getImageSrc: (item) =>
      getImageSrcFromItem(item) ||
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/competation%20reward.png',

    enrich: (item) => {
      const payload = getPayload(item)

      const titleText = readString(item.title) || ''
      const messageText = readString(item.message) || ''

      const clubName =
        pickFirstString(payload, [
          'club_name',
          'team_name',
          'recipient_club_name',
          'rewarded_club_name',
        ]) ||
        messageText.match(/^Your club\s+(.+?)\s+earned\b/i)?.[1]?.trim() ||
        null

      const competitionName =
        pickFirstString(payload, [
          'competition_name',
          'competition_title',
          'competition',
          'competition_code',
          'category_name',
          'category',
        ]) ||
        titleText.match(/\bin\s+(.+)$/i)?.[1]?.trim() ||
        null

      const position =
        pickFirstNumber(payload, [
          'position',
          'place',
          'rank',
          'competition_position',
          'final_position',
        ]) ??
        (() => {
          const match = titleText.match(
            /(?:reward:\s*)?(\d+)(?:st|nd|rd|th)?\s+place\b/i
          )
          return match ? Number(match[1]) : null
        })()

      const seasonNumber =
        pickFirstNumber(payload, [
          'season_number',
          'season',
          'season_no',
          'competition_season',
        ]) ??
        (() => {
          const match = messageText.match(/\bseason\s+(\d+)\b/i)
          return match ? Number(match[1]) : null
        })()

      const cashReward =
        pickFirstNumber(payload, [
          'cash_reward',
          'reward_cash',
          'cash_amount',
          'money_reward',
          'reward_amount',
          'prize_money',
          'money',
        ]) ??
        (() => {
          const match = messageText.match(/\$([\d,.]+)/)
          if (!match) return null
          const parsed = Number(match[1].replace(/,/g, ''))
          return Number.isFinite(parsed) ? parsed : null
        })()

      const coinsReward =
        pickFirstNumber(payload, [
          'coins_reward',
          'coin_reward',
          'reward_coins',
          'coins_awarded',
          'coins_amount',
          'coin_amount',
          'coins',
        ]) ??
        (() => {
          const match = messageText.match(/\b([\d,.]+)\s+coins?\b/i)
          if (!match) return null
          const parsed = Number(match[1].replace(/,/g, ''))
          return Number.isFinite(parsed) ? parsed : null
        })()

      const positionLabel = formatOrdinal(position)

      const title =
        positionLabel && competitionName
          ? `Competition reward: ${positionLabel} place in ${competitionName}`
          : competitionName
            ? `Competition reward: ${competitionName}`
            : item.title || 'Competition reward granted'

      const rewardParts = [
        cashReward !== null ? formatCurrencyLabel(cashReward, '$') : null,
        coinsReward !== null
          ? `${formatCurrency(coinsReward)} coin${coinsReward === 1 ? '' : 's'}`
          : null,
      ].filter(Boolean)

      const achievementParts = [
        clubName || 'Your club',
        positionLabel ? `finished ${positionLabel}` : 'earned a reward',
        competitionName ? `in ${competitionName}` : null,
        seasonNumber !== null ? `for Season ${seasonNumber}` : null,
      ].filter(Boolean)

      return {
        ...item,
        title,
        message:
          rewardParts.length > 0
            ? `${achievementParts.join(' ')}. Reward: ${rewardParts.join(' and ')}.`
            : item.message ||
              `${achievementParts.join(' ')}. Your competition reward has been granted.`,
      }
    },

    getIntroText: (item) => {
      const payload = getPayload(item)
      const titleText = readString(item.title) || ''
      const messageText = readString(item.message) || ''

      const clubName =
        pickFirstString(payload, [
          'club_name',
          'team_name',
          'recipient_club_name',
          'rewarded_club_name',
        ]) ||
        messageText.match(/^Your club\s+(.+?)\s+earned\b/i)?.[1]?.trim() ||
        null

      const competitionName =
        pickFirstString(payload, [
          'competition_name',
          'competition_title',
          'competition',
          'competition_code',
          'category_name',
          'category',
        ]) ||
        titleText.match(/\bin\s+(.+)$/i)?.[1]?.trim() ||
        null

      const position =
        pickFirstNumber(payload, [
          'position',
          'place',
          'rank',
          'competition_position',
          'final_position',
        ]) ??
        (() => {
          const match = titleText.match(
            /(?:reward:\s*)?(\d+)(?:st|nd|rd|th)?\s+place\b/i
          )
          return match ? Number(match[1]) : null
        })()

      const seasonNumber =
        pickFirstNumber(payload, [
          'season_number',
          'season',
          'season_no',
          'competition_season',
        ]) ??
        (() => {
          const match = messageText.match(/\bseason\s+(\d+)\b/i)
          return match ? Number(match[1]) : null
        })()

      const positionLabel = formatOrdinal(position)
      const subject = clubName || 'Your club'

      if (positionLabel && competitionName && seasonNumber !== null) {
        return `Congratulations! ${subject} finished ${positionLabel} in the ${competitionName} competition for Season ${seasonNumber}. The achievement has been officially rewarded and the prize has already been credited to your club.`
      }

      if (positionLabel && competitionName) {
        return `Congratulations! ${subject} finished ${positionLabel} in the ${competitionName} competition. The achievement has been officially rewarded and the prize has already been credited to your club.`
      }

      if (competitionName) {
        return `Congratulations! ${subject} earned a reward in the ${competitionName} competition. The prize has already been credited to your club.`
      }

      return (
        buildIntroFromMessage(item) ||
        'Congratulations! Your club earned a competition reward. The prize has already been credited to your club.'
      )
    },

    getDetailRows: (item) => {
      const payload = getPayload(item)
      const titleText = readString(item.title) || ''
      const messageText = readString(item.message) || ''

      const clubName =
        pickFirstString(payload, [
          'club_name',
          'team_name',
          'recipient_club_name',
          'rewarded_club_name',
        ]) ||
        messageText.match(/^Your club\s+(.+?)\s+earned\b/i)?.[1]?.trim() ||
        null

      const competitionName =
        pickFirstString(payload, [
          'competition_name',
          'competition_title',
          'competition',
          'competition_code',
          'category_name',
          'category',
        ]) ||
        titleText.match(/\bin\s+(.+)$/i)?.[1]?.trim() ||
        null

      const position =
        pickFirstNumber(payload, [
          'position',
          'place',
          'rank',
          'competition_position',
          'final_position',
        ]) ??
        (() => {
          const match = titleText.match(
            /(?:reward:\s*)?(\d+)(?:st|nd|rd|th)?\s+place\b/i
          )
          return match ? Number(match[1]) : null
        })()

      const seasonNumber =
        pickFirstNumber(payload, [
          'season_number',
          'season',
          'season_no',
          'competition_season',
        ]) ??
        (() => {
          const match = messageText.match(/\bseason\s+(\d+)\b/i)
          return match ? Number(match[1]) : null
        })()

      const cashReward =
        pickFirstNumber(payload, [
          'cash_reward',
          'reward_cash',
          'cash_amount',
          'money_reward',
          'reward_amount',
          'prize_money',
          'money',
        ]) ??
        (() => {
          const match = messageText.match(/\$([\d,.]+)/)
          if (!match) return null
          const parsed = Number(match[1].replace(/,/g, ''))
          return Number.isFinite(parsed) ? parsed : null
        })()

      const coinsReward =
        pickFirstNumber(payload, [
          'coins_reward',
          'coin_reward',
          'reward_coins',
          'coins_awarded',
          'coins_amount',
          'coin_amount',
          'coins',
        ]) ??
        (() => {
          const match = messageText.match(/\b([\d,.]+)\s+coins?\b/i)
          if (!match) return null
          const parsed = Number(match[1].replace(/,/g, ''))
          return Number.isFinite(parsed) ? parsed : null
        })()

      return compactRows([
        detailRow('Club', clubName),
        detailRow('Competition', competitionName),
        detailRow(
          'Final position',
          position !== null ? `${formatOrdinal(position)} place` : null
        ),
        detailRow(
          'Season',
          seasonNumber !== null ? `Season ${seasonNumber}` : null
        ),
        detailRow(
          'Prize money',
          formatCurrencyLabel(cashReward, '$')
        ),
        detailRow(
          'Coins',
          coinsReward !== null
            ? `${formatCurrency(coinsReward)} coin${coinsReward === 1 ? '' : 's'}`
            : null
        ),
        detailRow(
          'Reward status',
          formatLabel(
            pickFirstString(payload, [
              'reward_status',
              'status',
              'grant_status',
            ])
          ) || 'Granted'
        ),
      ])
    },

    getExtraText: (item) => {
      const payload = getPayload(item)

      const cashReward = pickFirstNumber(payload, [
        'cash_reward',
        'reward_cash',
        'cash_amount',
        'money_reward',
        'reward_amount',
        'prize_money',
        'money',
      ])

      const coinsReward = pickFirstNumber(payload, [
        'coins_reward',
        'coin_reward',
        'reward_coins',
        'coins_awarded',
        'coins_amount',
        'coin_amount',
        'coins',
      ])

      if (cashReward !== null && coinsReward !== null) {
        return 'The prize money has been added directly to your club finances, while the coins have been credited to your club balance. A fantastic result for the club — keep building on this success in the new season!'
      }

      if (cashReward !== null) {
        return 'The prize money has been added directly to your club finances. A fantastic result for the club — keep building on this success in the new season!'
      }

      if (coinsReward !== null) {
        return 'The coins have been credited to your club balance. A fantastic result for the club — keep building on this success in the new season!'
      }

      return 'Your competition reward has already been credited. A fantastic result for the club — keep building on this success in the new season!'
    },

    actions: [
      {
        key: 'view-competition',
        label: 'View competition',
        variant: 'primary',
        kind: 'navigate',
        getHref: (item) => {
          const payload = getPayload(item)

          return (
            pickFirstString(payload, [
              'competition_path',
              'competition_url',
              'competition_page_path',
              'standings_path',
              'competition_standings_path',
              'rewards_path',
            ]) ||
            getActionHrefFromItem(item)
          )
        },
        show: (item) => {
          const payload = getPayload(item)

          return Boolean(
            pickFirstString(payload, [
              'competition_path',
              'competition_url',
              'competition_page_path',
              'standings_path',
              'competition_standings_path',
              'rewards_path',
            ]) ||
              getActionHrefFromItem(item)
          )
        },
      },
      {
        key: 'open-club-finances',
        label: 'Club finances',
        variant: 'secondary',
        kind: 'navigate',
        getHref: () => '/dashboard/finance',
        show: () => true,
      },
      MARK_READ_ACTION,
    ],
  },

}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */



// ============================================================================
// STAFF ADVISORY — TEAM DOCTOR
// Added after Head Coach + Sports Director advisory implementation.
// Common image for every paid Team Doctor advisory:
// https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Team%20Doctor%20Advisory.png
// ============================================================================

const TEAM_DOCTOR_ADVISORY_IMAGE =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Team%20Doctor%20Advisory.png'

const TEAM_DOCTOR_ADVISORY_TEMPLATE: NotificationTemplate = {
  defaultTitle: 'Team Doctor Advisory — Medical & Treatment Report',
  defaultMessage:
    'Your Team Doctor has prepared a medical treatment and recovery advisory.',

  imageSrc: TEAM_DOCTOR_ADVISORY_IMAGE,

  getImageSrc: () => TEAM_DOCTOR_ADVISORY_IMAGE,

  enrich: (item) => {
    const payload = getPayload(item)
    const advisorName = pickFirstString(payload, [
      'advisor_staff_name',
      'advisor_name',
      'team_doctor_name',
      'doctor_name',
      'staff_name',
    ])

    return {
      ...item,
      title:
        item.title ||
        pickFirstString(payload, ['title', 'report_title', 'advisory_title']) ||
        'Team Doctor Advisory',
      message:
        item.message ||
        pickFirstString(payload, [
          'summary',
          'report_summary',
          'advisory_summary',
          'message',
        ]) ||
        (advisorName
          ? `${advisorName} has prepared a medical treatment and recovery advisory.`
          : 'Your Team Doctor has prepared a medical treatment and recovery advisory.'),
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)
    return (
      pickFirstString(payload, [
        'summary',
        'report_summary',
        'advisory_summary',
        'intro_text',
      ]) ||
      buildIntroFromMessage(item) ||
      'Review the latest medical-case, treatment, and recovery information from your Team Doctor.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)
    const data =
      payload && typeof payload.data === 'object' && payload.data !== null
        ? (payload.data as Record<string, unknown>)
        : payload

    const advisorName = pickFirstString(payload, [
      'advisor_staff_name',
      'advisor_name',
      'team_doctor_name',
      'doctor_name',
      'staff_name',
    ])

    const riderName = pickFirstString(data, [
      'rider_name',
      'display_name',
      'rider_display_name',
    ])

    const caseType = formatLabel(
      pickFirstString(data, ['case_type', 'health_case_type'])
    )

    const caseCode = formatLabel(
      pickFirstString(data, [
        'case_code',
        'health_case_code',
        'injury_code',
        'sickness_type',
        'condition',
      ])
    )

    const severity = formatLabel(
      pickFirstString(data, [
        'severity',
        'case_severity',
        'health_severity',
      ])
    )

    const bodyPart = formatLabel(
      pickFirstString(data, ['body_part', 'injury_body_part'])
    )

    const baseRecoveryDays = pickFirstNumber(data, [
      'selected_base_days',
      'base_recovery_days',
      'expected_base_days',
    ])

    const adjustedRecoveryDays = pickFirstNumber(data, [
      'final_recovery_days',
      'adjusted_recovery_days',
      'expected_days_out',
      'recovery_days',
    ])

    const recoveryDaysSaved = pickFirstNumber(data, [
      'recovery_days_saved',
      'days_saved',
      'treatment_days_saved',
    ])

    const medicalReduction = pickFirstNumber(data, [
      'medical_staff_reduction_pct',
      'medical_reduction_pct',
    ])

    const infrastructureReduction = pickFirstNumber(data, [
      'infrastructure_reduction_pct',
      'facility_reduction_pct',
    ])

    const totalReduction = pickFirstNumber(data, [
      'total_reduction_pct',
      'recovery_reduction_pct',
    ])

    const expectedReturn = pickFirstString(data, [
      'expected_full_recovery_on',
      'expected_return_game_date',
      'unavailable_until',
      'recovery_until',
    ])

    const previousExpectedReturn = pickFirstString(data, [
      'previous_expected_full_recovery_on',
      'previous_expected_return_game_date',
    ])

    const injuredCount = pickFirstNumber(data, [
      'injured_riders',
      'injured_count',
    ])

    const sickCount = pickFirstNumber(data, [
      'sick_riders',
      'sick_count',
    ])

    const activeCases = pickFirstNumber(data, [
      'active_or_recovering_health_cases',
      'active_health_cases',
      'active_cases',
    ])

    const totalSaved = pickFirstNumber(data, [
      'total_recovery_days_saved',
      'recovery_days_saved_total',
    ])

    return compactRows([
      detailRow('Advisor', advisorName),
      detailRow('Rider', riderName),
      detailRow('Medical case', caseCode || caseType),
      detailRow('Case type', caseType),
      detailRow('Severity', severity),
      detailRow('Body part', bodyPart),

      detailRow(
        'Base recovery',
        baseRecoveryDays !== null
          ? `${baseRecoveryDays} game day${baseRecoveryDays === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Adjusted recovery',
        adjustedRecoveryDays !== null
          ? `${adjustedRecoveryDays} game day${adjustedRecoveryDays === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Recovery time saved',
        recoveryDaysSaved !== null
          ? `${recoveryDaysSaved} game day${recoveryDaysSaved === 1 ? '' : 's'}`
          : null
      ),
      detailRow(
        'Medical staff effect',
        medicalReduction !== null ? `${medicalReduction}% reduction` : null
      ),
      detailRow(
        'Medical Center effect',
        infrastructureReduction !== null
          ? `${infrastructureReduction}% reduction`
          : null
      ),
      detailRow(
        'Total recovery reduction',
        totalReduction !== null ? `${totalReduction}%` : null
      ),
      detailRow(
        'Expected return',
        expectedReturn ? formatContractSeasonLabel(expectedReturn) : null
      ),
      detailRow(
        'Previous expected return',
        previousExpectedReturn
          ? formatContractSeasonLabel(previousExpectedReturn)
          : null
      ),

      detailRow(
        'Injured riders',
        injuredCount !== null ? `${injuredCount}` : null
      ),
      detailRow('Sick riders', sickCount !== null ? `${sickCount}` : null),
      detailRow(
        'Active medical cases',
        activeCases !== null ? `${activeCases}` : null
      ),
      detailRow(
        'Total recovery time saved',
        totalSaved !== null
          ? `${totalSaved} game day${totalSaved === 1 ? '' : 's'}`
          : null
      ),
    ])
  },

  getExtraText: (item) => {
    const payload = getPayload(item)
    const variant = pickFirstString(payload, [
      'report_variant',
      'variant',
      'event_code',
    ])

    if (variant === 'medical_clearance') {
      return 'The rider is medically available again. Sporting workload and race selection can now be managed normally.'
    }

    if (variant === 'recovery_setback') {
      return 'The recovery estimate has worsened. Review the current medical case before planning a return to full training or racing.'
    }

    if (variant === 'recovery_improvement') {
      return 'The recovery outlook has improved. Continue treatment and reassess the rider before restoring full workload.'
    }

    return 'Review the medical case and expected recovery before assigning the rider to hard training, training camps, or races.'
  },

  actions: [
    {
      key: 'open-team-page',
      label: 'Open squad',
      variant: 'primary',
      kind: 'navigate',
      getHref: () => '/dashboard/squad',
      show: () => true,
    },
    {
      key: 'open-staff-page',
      label: 'Open staff',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/staff',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
}



// ============================================================================
// STAFF ADVISORY — CHIEF MECHANIC
// ============================================================================
const CHIEF_MECHANIC_ADVISORY_IMAGE =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Chief%20Mechanic%20Advisory.png'

const CHIEF_MECHANIC_ADVISORY_TEMPLATE: NotificationTemplate = {
  defaultTitle: 'Chief Mechanic Advisory — Equipment & Workshop Review',
  defaultMessage:
    'Your Chief Mechanic has prepared an equipment and workshop advisory.',

  imageSrc: CHIEF_MECHANIC_ADVISORY_IMAGE,
  getImageSrc: () => CHIEF_MECHANIC_ADVISORY_IMAGE,

  enrich: (item) => {
    const payload = getPayload(item) ?? {}
    return {
      ...item,
      title:
        item.title ||
        pickFirstString(payload, ['title', 'report_title', 'advisory_title']) ||
        'Chief Mechanic Advisory — Equipment & Workshop Review',
      message:
        item.message ||
        pickFirstString(payload, ['summary', 'report_summary', 'advisory_summary']) ||
        'Your Chief Mechanic has prepared an equipment and workshop advisory.',
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)
    return (
      pickFirstString(payload, ['summary', 'advisory_summary', 'report_summary']) ||
      buildIntroFromMessage(item) ||
      'Review the current equipment condition, maintenance queue, workshop status, and race-supply stock.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)
    const data = asRecord(payload?.data) || asRecord(payload?.snapshot)
    const advisorName =
      pickFirstString(payload, [
        'advisor_staff_name',
        'advisor_name',
        'chief_mechanic_name',
        'mechanic_name',
        'staff_name',
      ]) || pickFirstString(asRecord(payload?.staff), ['name', 'staff_name'])

    return compactRows([
      detailRow('Advisor', advisorName),
      detailRow('Role', 'Chief Mechanic'),
      detailRow(
        'Advisory',
        formatLabel(pickFirstString(payload, ['report_variant', 'variant']))
      ),
      detailRow(
        'Equipment items',
        pickFirstNumber(data, ['total_items'])?.toString() || null
      ),
      detailRow(
        'Ready items',
        pickFirstNumber(data, ['ready_items'])?.toString() || null
      ),
      detailRow(
        'Average condition',
        (() => {
          const value = pickFirstNumber(data, ['average_condition_percent'])
          return value !== null ? `${value}%` : null
        })()
      ),
      detailRow(
        'Needs attention',
        pickFirstNumber(data, [
          'maintenance_needed',
          'equipment_needing_attention_count',
        ])?.toString() || null
      ),
      detailRow(
        'Critical items',
        pickFirstNumber(data, ['critical_items'])?.toString() || null
      ),
      detailRow(
        'Pending maintenance',
        pickFirstNumber(data, ['pending_maintenance_jobs'])?.toString() || null
      ),
      detailRow(
        'Empty supply types',
        pickFirstNumber(data, ['empty_supply_types'])?.toString() || null
      ),
      detailRow(
        'Low supply types',
        pickFirstNumber(data, ['low_supply_types'])?.toString() || null
      ),
    ])
  },

  getExtraText: () =>
    'Review the listed equipment and supply priorities before committing assets to the next race preparation.',

  actions: [
    {
      key: 'open-staff-briefing-centre',
      label: 'Staff Briefing Centre',
      variant: 'primary',
      kind: 'navigate',
      getHref: () => '/dashboard/overview',
      show: () => true,
    },
    {
      key: 'open-equipment',
      label: 'Equipment',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/equipment',
      show: () => true,
    },
    {
      key: 'open-maintenance',
      label: 'Maintenance',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/equipment?tab=maintenance',
      show: () => true,
    },
    {
      key: 'open-race-supplies',
      label: 'Race Supplies',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/equipment?tab=race-supplies',
      show: () => true,
    },
    MARK_READ_ACTION,
  ],
}



// ============================================================================
// STAFF ADVISORY — SCOUT / CHIEF SCOUT
// ============================================================================
const SCOUT_ADVISORY_IMAGE =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Chief%20Scout%20Advisory.png'

const SCOUT_ADVISORY_TEMPLATE: NotificationTemplate = {
  defaultTitle: 'Scout Advisory — Recruitment & Scouting Review',
  defaultMessage:
    'Your Scout has prepared a recruitment and scouting advisory.',

  imageSrc: SCOUT_ADVISORY_IMAGE,
  getImageSrc: () => SCOUT_ADVISORY_IMAGE,

  enrich: (item) => {
    const payload = getPayload(item) ?? {}

    return {
      ...item,
      title:
        item.title ||
        pickFirstString(payload, ['title', 'report_title', 'advisory_title']) ||
        'Scout Advisory — Recruitment & Scouting Review',
      message:
        item.message ||
        pickFirstString(payload, ['summary', 'report_summary', 'advisory_summary']) ||
        'Your Scout has prepared a recruitment and scouting advisory.',
    }
  },

  getIntroText: (item) => {
    const payload = getPayload(item)

    return (
      pickFirstString(payload, [
        'summary',
        'advisory_summary',
        'report_summary',
        'intro_text',
      ]) ||
      buildIntroFromMessage(item) ||
      'Review the latest scouting intelligence, active assignments, and recruitment priorities.'
    )
  },

  getDetailRows: (item) => {
    const payload = getPayload(item)
    const data = asRecord(payload?.data) || asRecord(payload?.snapshot)

    const advisorName =
      pickFirstString(payload, [
        'advisor_staff_name',
        'advisor_name',
        'scout_name',
        'chief_scout_name',
        'staff_name',
      ]) || pickFirstString(asRecord(payload?.staff), ['name', 'staff_name'])

    const riderName = pickFirstString(data, ['rider_name'])
    const country = formatCountryName(
      pickFirstString(data, ['rider_country_code', 'country_code'])
    )

    return compactRows([
      detailRow('Advisor', advisorName),
      detailRow('Role', 'Scout'),
      detailRow(
        'Advisory',
        formatLabel(pickFirstString(payload, ['report_variant', 'variant']))
      ),
      detailRow('Rider', riderName),
      detailRow('Country', country),
      detailRow(
        'Overall',
        (() => {
          const exact = pickFirstNumber(data, ['overall_exact'])
          const label = pickFirstString(data, ['overall_label'])
          if (exact !== null && label) return `${exact} (${label})`
          if (exact !== null) return `${exact}`
          return label
        })()
      ),
      detailRow(
        'Potential',
        (() => {
          const exact = pickFirstNumber(data, ['potential_exact'])
          const label = pickFirstString(data, ['potential_label'])
          if (exact !== null && label) return `${label} (${exact})`
          if (exact !== null) return `${exact}`
          return label
        })()
      ),
      detailRow(
        'Precision',
        (() => {
          const score = pickFirstNumber(data, ['precision_score'])
          return score !== null ? `${score}` : null
        })()
      ),
      detailRow(
        'Completed reports',
        pickFirstNumber(data, ['completed_reports'])?.toString() || null
      ),
      detailRow(
        'Reports · last 7 real days',
        pickFirstNumber(data, ['reports_last_7_real_days'])?.toString() || null
      ),
      detailRow(
        'High / Elite prospects',
        pickFirstNumber(data, ['high_or_elite_potential_reports'])?.toString() || null
      ),
      detailRow(
        'Active scouting assignments',
        pickFirstNumber(data, ['active_scouting_tasks'])?.toString() || null
      ),
    ])
  },

  getExtraText: (item) => {
    const payload = getPayload(item)
    const data = asRecord(payload?.data)
    const riderName = pickFirstString(data, ['rider_name'])
    const variant = pickFirstString(payload, ['report_variant', 'variant'])

    if (variant === 'priority_prospect' && riderName) {
      return `Review ${riderName} against your squad needs before making a recruitment decision.`
    }

    return 'Use the Scouting page to review the complete report, compare prospects, and assign the next scouting target.'
  },

  actions: [
    {
      key: 'open-staff-briefing-centre',
      label: 'Staff Briefing Centre',
      variant: 'primary',
      kind: 'navigate',
      getHref: () => '/dashboard/overview',
      show: () => true,
    },
    {
      key: 'open-scouting',
      label: 'Scouting',
      variant: 'secondary',
      kind: 'navigate',
      getHref: () => '/dashboard/scouting',
      show: () => true,
    },
    {
      key: 'open-scouted-rider',
      label: 'Open rider',
      variant: 'secondary',
      kind: 'navigate',
      getHref: (item) => {
        const payload = getPayload(item)
        const data = asRecord(payload?.data)

        return (
          pickFirstString(data, ['rider_profile_path']) ||
          (() => {
            const riderId = pickFirstString(data, ['rider_id'])
            return riderId ? `/dashboard/external-riders/${riderId}` : null
          })()
        )
      },
      show: (item) => {
        const payload = getPayload(item)
        const data = asRecord(payload?.data)
        return Boolean(
          pickFirstString(data, ['rider_profile_path', 'rider_id'])
        )
      },
    },
    MARK_READ_ACTION,
  ],
}

export function getNotificationTemplate(
  typeCode: string | null | undefined
): NotificationTemplate | null {

  if (typeCode === 'ADVISOR_SCOUT_REPORT') {
    return SCOUT_ADVISORY_TEMPLATE
  }

  if (typeCode === 'ADVISOR_CHIEF_MECHANIC_REPORT') {
    return CHIEF_MECHANIC_ADVISORY_TEMPLATE
  }



  if (typeCode === 'ADVISOR_TEAM_DOCTOR_REPORT') {
    return TEAM_DOCTOR_ADVISORY_TEMPLATE
  }

  if (!typeCode) return null

  const exactTemplate = NOTIFICATION_TEMPLATES[typeCode]
  if (exactTemplate) return exactTemplate

  if (isHeadCoachTrainingReadinessAdvisoryType(typeCode)) {
    return HEAD_COACH_TRAINING_READINESS_ADVISORY_TEMPLATE
  }

  if (isSportDirectorAdvisoryType(typeCode)) {
    return SPORT_DIRECTOR_ADVISORY_TEMPLATE
  }

  return null
}

/**
 * applyNotificationTemplate
 * Merge a raw NotificationItem with any matching template defaults.
 *
 * Rules:
 * - Backend-provided title/message always take precedence.
 * - Templates only fill in missing values or optionally enrich them.
 */
export function applyNotificationTemplate(item: NotificationItem): NotificationItem {
  const template = getNotificationTemplate(item.type_code)
  if (!template) return item

  const enriched = template.enrich ? template.enrich(item) : item

  return {
    ...enriched,
    title: enriched.title || template.defaultTitle || enriched.title,
    message: enriched.message || template.defaultMessage || enriched.message,
  }
}

/**
 * applyNotificationTemplates
 * Convenience helper for normalizing a list of notifications.
 */
export function applyNotificationTemplates(
  items: NotificationItem[]
): NotificationItem[] {
  return items.map(applyNotificationTemplate)
}

export function getNotificationImageSrc(item: NotificationItem): string | null {
  const template = getNotificationTemplate(item.type_code)
  if (!template) return getImageSrcFromItem(item)

  if (template.getImageSrc) return template.getImageSrc(item)
  return template.imageSrc || getImageSrcFromItem(item)
}

export function getNotificationIntroText(item: NotificationItem): string | null {
  const template = getNotificationTemplate(item.type_code)
  return template?.getIntroText?.(item) || buildIntroFromMessage(item)
}

export function getNotificationDetailRows(
  item: NotificationItem
): NotificationDetailRow[] {
  const template = getNotificationTemplate(item.type_code)
  return template?.getDetailRows?.(item) || []
}

export function getNotificationExtraText(item: NotificationItem): string | null {
  const template = getNotificationTemplate(item.type_code)
  return template?.getExtraText?.(item) || null
}

export function getNotificationActions(
  item: NotificationItem
): NotificationActionTemplate[] {
  const template = getNotificationTemplate(item.type_code)
  const actions = template?.actions || [GENERIC_OPEN_ACTION, MARK_READ_ACTION]

  return actions.filter((action) => {
    if (action.kind === 'navigate') {
      const visible = action.show ? action.show(item) : true
      const href = action.getHref ? action.getHref(item) : null
      return visible && Boolean(href)
    }

    return action.show ? action.show(item) : true
  })
}

/**
 * Useful helper when rendering action buttons.
 */
export function getNotificationActionHref(
  action: NotificationActionTemplate,
  item: NotificationItem
): string | null {
  if (action.kind !== 'navigate') return null
  return action.getHref ? action.getHref(item) : null
}

/**
 * Optional generic enrich helper pattern for future template additions.
 * Currently unused, but kept here because the system is expected to grow.
 */
export function withFallbackTitleMessage(
  item: NotificationItem,
  fallbackTitle: string,
  fallbackMessage: string
): NotificationItem {
  return {
    ...item,
    title: item.title || fallbackTitle,
    message: item.message || fallbackMessage,
  }
}

/**
 * Convenience export for components that want a simple boolean.
 */
export function notificationHasRichContent(item: NotificationItem): boolean {
  return Boolean(
    getNotificationImageSrc(item) ||
      getNotificationIntroText(item) ||
      getNotificationDetailRows(item).length > 0 ||
      getNotificationExtraText(item) ||
      getNotificationActions(item).length > 0
  )
}

/**
 * Optional convenience export if the UI wants a strong candidate headline
 * for the expanded section when the backend title is generic.
 */
export function getNotificationEntityName(item: NotificationItem): string | null {
  return getPrimaryEntityName(item)
}

/**
 * Optional convenience export if the UI wants to decide whether the expanded
 * section should render the two-column text/image layout.
 */
export function notificationSupportsImage(item: NotificationItem): boolean {
  return Boolean(getNotificationImageSrc(item))
}
