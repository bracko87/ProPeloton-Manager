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
    ])
  )
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

  if (directPath) return directPath

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
/* Template Registry                                                          */
/* -------------------------------------------------------------------------- */

export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
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
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Staff%20course%20completed.png',

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
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export function getNotificationTemplate(
  typeCode: string | null | undefined
): NotificationTemplate | null {
  if (!typeCode) return null
  return NOTIFICATION_TEMPLATES[typeCode] || null
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