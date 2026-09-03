/**
 * src/pages/dashboard/NotificationsPage.tsx
 *
 * Full-page notification center for the dashboard.
 *
 * Purpose:
 * - Show the user's game/admin notifications in a dedicated page.
 * - Provide Unread/Read tabs.
 * - Provide search by notification title/message/type.
 * - Provide category filtering via dropdown.
 * - Provide full pagination controls: first / previous / next / last.
 * - Reuse the same Supabase RPCs and preference rules as the header inbox.
 *
 * Notes:
 * - The current get_my_notifications RPC does not return total_count.
 * - To support page count and last-page navigation, this page loads a larger batch
 *   and paginates locally.
 * - If you expect more than 500 notifications per tab, increase MAX_FETCH_SIZE
 *   or later create a dedicated RPC that supports search/filter/total_count.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import {
  canReceiveNotificationItem,
  readNotificationPreferences,
} from '@/lib/notificationPreferences'
import {
  type NotificationItem,
  formatNotificationTime,
  getResolvedNotificationActionUrl,
} from '@/features/notifications/notificationHelpers'
import { localizeNotificationTypeCodeLabel } from '@/features/notifications/notificationLocalization'
import {
  applyNotificationTemplates,
  getNotificationActionHref,
  getNotificationActions,
  getNotificationDetailRows,
  getNotificationExtraText,
  getNotificationImageSrc,
  getNotificationIntroText,
  type NotificationActionTemplate,
} from '@/features/notifications/notificationTemplates'

type NotificationTab = 'unread' | 'read'

const PAGE_SIZE = 10
const MAX_FETCH_SIZE = 500

const OVERVIEW_OPENED_ATTENTION_STORAGE_KEY = 'ppm:overview-opened-attention-keys-v1'
const OVERVIEW_ATTENTION_DISMISSED_EVENT = 'ppm:overview-attention-dismissed-v1'

function normalizeOverviewAttentionDismissalValue(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/#/g, '')
    .replace(/['"`´’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeOverviewAttentionDismissalHref(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  let normalized = raw

  if (normalized.startsWith('#')) {
    normalized = normalized.slice(1)
  }

  try {
    if (/^https?:\/\//i.test(normalized)) {
      const url = new URL(normalized)
      normalized = `${url.pathname}${url.search}${url.hash}`
    }
  } catch {
    // Keep original normalized value.
  }

  normalized = normalized.replace(/^#/, '')

  if (normalized.startsWith('/#')) {
    normalized = normalized.slice(2)
  }

  normalized = normalized.replace(/\/+$/, '')

  return normalizeOverviewAttentionDismissalValue(normalized)
}

function getOverviewAttentionDismissalTopic(text: string): string | null {
  if (!text) return null
  if (text.includes('stage plan')) return 'stage_plan'
  if (text.includes('race plan')) return 'race_plan'
  if (text.includes('race result') || text.includes('stage result')) return 'race_result'
  if (text.includes('race application') || text.includes('application')) return 'race_application'
  if (text.includes('contract')) return 'contract'
  if (text.includes('equipment') || text.includes('repair')) return 'equipment'
  if (text.includes('scout')) return 'scouting'
  if (text.includes('finance') || text.includes('loan')) return 'finance'
  if (text.includes('sick') || text.includes('injured') || text.includes('health')) return 'health'
  return null
}

function buildOverviewAttentionSemanticDismissalKey(value: unknown): string | null {
  const normalized = normalizeOverviewAttentionDismissalValue(value)
  const topic = getOverviewAttentionDismissalTopic(normalized)
  if (!topic) return null

  const subject = normalized
    .replace(/\brace plan\b/g, ' ')
    .replace(/\bstage plan\b/g, ' ')
    .replace(/\brace result(s)?\b/g, ' ')
    .replace(/\bstage result(s)?\b/g, ' ')
    .replace(/\brace application\b/g, ' ')
    .replace(/\b(open|opened|deadline|reminder|soon|missing|review|available|submitted|locked|lock|today|for|the|a|an|is|are|has|have|stage|race|plan|results?|classic|tour)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Do not create generic semantic keys like "race_plan" or "stage_plan".
  // A semantic key must contain a real event/race/stage subject.
  if (!subject || subject.length < 6 || subject.split(' ').length < 2) return null

  return `semantic:${topic}:${subject}`
}

function isSpecificOverviewAttentionHrefKey(value: string): boolean {
  // Generic routes like /dashboard/race-preparation must not dismiss all race-plan notifications.
  return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(value)
}

function readOverviewAttentionDismissalKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set()

  try {
    const raw = window.localStorage.getItem(OVERVIEW_OPENED_ATTENTION_STORAGE_KEY)
    const values = raw ? JSON.parse(raw) : []

    return new Set(
      Array.isArray(values)
        ? values.filter((value): value is string => typeof value === 'string')
        : []
    )
  } catch {
    return new Set()
  }
}

function persistOverviewAttentionDismissalKeys(keys: Set<string>) {
  if (typeof window === 'undefined') return

  try {
    const values = Array.from(keys).slice(-250)
    window.localStorage.setItem(OVERVIEW_OPENED_ATTENTION_STORAGE_KEY, JSON.stringify(values))
    window.dispatchEvent(new CustomEvent(OVERVIEW_ATTENTION_DISMISSED_EVENT))
  } catch {
    // Local persistence is only a UI convenience. Ignore storage errors.
  }
}

function getNotificationDismissalMetadataValues(item: NotificationItem): string[] {
  const record = item as unknown as Record<string, unknown>
  const metadata = (record.metadata && typeof record.metadata === 'object'
    ? record.metadata
    : null) as Record<string, unknown> | null

  if (!metadata) return []

  const keys = [
    'attention_key',
    'attentionKey',
    'race_id',
    'raceId',
    'stage_id',
    'stageId',
    'related_id',
    'relatedId',
    'target_id',
    'targetId',
  ]

  return keys
    .map(key => metadata[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

function buildOverviewAttentionDismissalKeysForNotification(
  item: NotificationItem,
  actionUrl?: string | null
): string[] {
  const keys = new Set<string>()
  const record = item as unknown as Record<string, unknown>

  const url = actionUrl ?? getResolvedNotificationActionUrl(item)
  const hrefKey = normalizeOverviewAttentionDismissalHref(url)
  if (hrefKey && isSpecificOverviewAttentionHrefKey(hrefKey)) keys.add(`href:${hrefKey}`)

  for (const rawId of [
    record.user_notification_id,
    record.notification_id,
    record.id,
    ...getNotificationDismissalMetadataValues(item),
  ]) {
    const idKey = normalizeOverviewAttentionDismissalValue(rawId)
    if (idKey) keys.add(`id:${idKey}`)
  }

  // Only title/message are specific enough for cross-dismissal.
  // Do not use type_code/source/preference_group here because those are category-wide
  // and can accidentally hide all unread notifications in that category.
  for (const rawText of [
    item.title,
    item.message,
    `${item.title ?? ''} ${item.message ?? ''}`,
  ]) {
    const labelKey = normalizeOverviewAttentionDismissalValue(rawText)
    if (labelKey && labelKey.length >= 8) keys.add(`label:${labelKey}`)

    const semanticKey = buildOverviewAttentionSemanticDismissalKey(rawText)
    if (semanticKey) keys.add(semanticKey)
  }

  return Array.from(keys)
}

function dismissMatchingOverviewAttentionForNotification(
  item: NotificationItem,
  actionUrl?: string | null
) {
  const dismissalKeys = buildOverviewAttentionDismissalKeysForNotification(item, actionUrl)
  if (dismissalKeys.length === 0) return

  const existingKeys = readOverviewAttentionDismissalKeys()
  dismissalKeys.forEach(key => existingKeys.add(key))
  persistOverviewAttentionDismissalKeys(existingKeys)
}

function isNotificationDismissedByOverviewAttention(
  item: NotificationItem,
  actionUrl?: string | null
): boolean {
  const dismissalKeys = buildOverviewAttentionDismissalKeysForNotification(item, actionUrl)
  if (dismissalKeys.length === 0) return false

  const existingKeys = readOverviewAttentionDismissalKeys()
  return dismissalKeys.some(key => existingKeys.has(key))
}

async function markDismissedUnreadNotificationsRead(
  items: NotificationItem[]
): Promise<number> {
  let markedCount = 0

  for (const item of items) {
    if (item.status !== 'unread') continue

    try {
      const { data, error } = await supabase.rpc('mark_my_notification_read', {
        p_user_notification_id: item.user_notification_id,
      })

      if (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to auto-mark dismissed notification as read:', error)
        continue
      }

      if (data === true) markedCount += 1
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to auto-mark dismissed notification as read:', err)
    }
  }

  return markedCount
}


type CategoryOption = {
  value: string
  label: string
}

function normalizeSearchValue(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .trim()
}

function formatCategoryLabel(raw: string): string {
  const cleaned = String(raw || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  if (!cleaned) return 'Other'

  return cleaned
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getNotificationCategoryValue(item: NotificationItem): string {
  const preferenceGroup = String((item.preference_group as any) ?? '').trim()
  if (preferenceGroup) return `preference:${preferenceGroup}`

  const source = String(item.source ?? '').trim()
  if (source) return `source:${source}`

  const typeCode = String(item.type_code ?? '').trim()
  if (typeCode) return `type:${typeCode}`

  return 'other'
}

function getNotificationCategoryLabel(
  item: NotificationItem,
  t: (key: string) => string
): string {
  const stableCategoryKeys: Record<string, string> = {
    game: 'categories.game',
    admin: 'categories.admin',
    system: 'categories.system',
    staffadvisory: 'categories.staffAdvisory',
    race: 'categories.race',
    races: 'categories.races',
    finance: 'categories.finance',
    transfers: 'categories.transfers',
    training: 'categories.training',
    equipment: 'categories.equipment',
    infrastructure: 'categories.infrastructure',
    sponsors: 'categories.sponsors',
    staff: 'categories.staff',
    squad: 'categories.squad',
    health: 'categories.health',
    scouting: 'categories.scouting',
    raceinvitations: 'categories.raceInvitations',
    raceapplicationresults: 'categories.raceApplicationResults',
    racepreparation: 'categories.racePreparation',
    stageplanreminders: 'categories.stagePlanReminders',
    raceweather: 'categories.raceWeather',
    raceresults: 'categories.raceResults',
    teamupdates: 'categories.teamUpdates',
    staffcontracts: 'categories.staffContracts',
    staffcourses: 'categories.staffCourses',
    transferupdates: 'categories.transferUpdates',
    trainingcamps: 'categories.trainingCamps',
    scoutingreports: 'categories.scoutingReports',
    retirementupdates: 'categories.retirementUpdates',
    financealerts: 'categories.financeAlerts',
    walletrewards: 'categories.walletRewards',
    competitionrewards: 'categories.competitionRewards',
    taxupdates: 'categories.taxUpdates',
    racesupplies: 'categories.raceSupplies',
    equipmentupdates: 'categories.equipmentUpdates',
    infrastructureupdates: 'categories.infrastructureUpdates',
    systemmessages: 'categories.systemMessages',
    other: 'categories.other',
  }

  const localize = (raw: string): string => {
    const normalized = raw.replace(/[_-]+/g, '').replace(/\s+/g, '').toLowerCase()
    const key = stableCategoryKeys[normalized]
    return key ? t(key) : formatCategoryLabel(raw)
  }

  const preferenceGroup = String((item.preference_group as any) ?? '').trim()
  if (preferenceGroup) return localize(preferenceGroup)

  const source = String(item.source ?? '').trim()
  if (source) return localize(source)

  const typeCode = String(item.type_code ?? '').trim()
  if (typeCode) return localize(typeCode)

  return t('categories.other')
}

function matchesSearch(item: NotificationItem, query: string): boolean {
  const q = normalizeSearchValue(query)
  if (!q) return true

  const haystack = [
    item.title,
    item.message,
    item.type_code,
    item.source,
    item.preference_group,
    item.notification_created_at,
  ]
    .map(normalizeSearchValue)
    .join(' ')

  return haystack.includes(q)
}


type AdvisorNotificationFilter = {
  advisorStaffId: string
  advisorRole: string | null
}

function readAdvisorNotificationFilterFromHash(): AdvisorNotificationFilter | null {
  if (typeof window === 'undefined') return null

  const hash = window.location.hash || ''
  const queryIndex = hash.indexOf('?')
  if (queryIndex < 0) return null

  const params = new URLSearchParams(hash.slice(queryIndex + 1))
  if (params.get('mode') !== 'advisor') return null

  const advisorStaffId = String(params.get('advisor_staff_id') ?? '').trim()
  if (!advisorStaffId) return null

  const advisorRole = String(params.get('advisor_role') ?? '').trim() || null

  return {
    advisorStaffId,
    advisorRole,
  }
}

function mapAdvisorNotificationRow(row: Record<string, unknown>): NotificationItem {
  return {
    user_notification_id: Number(row.user_notification_id),
    notification_id: Number(row.notification_id),
    status: String(row.status ?? 'unread'),
    read_at: (row.read_at as string | null | undefined) ?? null,
    assigned_at: (row.assigned_at as string | null | undefined) ?? null,
    title: String(row.title ?? ''),
    message: String(row.message ?? ''),
    action_url: (row.action_url as string | null | undefined) ?? null,
    metadata: (row.payload_json as Record<string, unknown> | null | undefined) ?? {},
    payload_json: (row.payload_json as Record<string, unknown> | null | undefined) ?? {},
    notification_created_at: String(row.notification_created_at ?? ''),
    type_code: String(row.type_code ?? ''),
    source: 'game',
    preference_group: 'staffAdvisory',
  } as NotificationItem
}


type StaffAdvisoryPayload = {
  advisor_report?: boolean
  advisor_role?: string
  advisor_staff_name?: string
  report_code?: string
  report_variant?: string
  summary?: string
  snapshot?: Record<string, unknown>
  data?: Record<string, unknown>
  attention_riders?: Array<Record<string, unknown>>
  recommendations?: unknown[]
  actions?: Array<{ label?: string; target?: string }>
  visual_key?: string
  management_priorities?: Array<Record<string, unknown>>
  health_cases?: Array<Record<string, unknown>>
  equipment_needing_attention?: Array<Record<string, unknown>>
  equipment_categories?: Array<Record<string, unknown>>
  race_supplies?: Array<Record<string, unknown>>
  missing_stage_analysis?: Record<string, unknown>
  next_missing_stage?: Record<string, unknown>
  staff?: {
    id?: string
    name?: string
    role?: string
  }
}

function getAdvisorPayload(item: NotificationItem): StaffAdvisoryPayload | null {
  const record = item as unknown as Record<string, unknown>

  const payload =
    record.payload_json && typeof record.payload_json === 'object'
      ? (record.payload_json as StaffAdvisoryPayload)
      : record.metadata && typeof record.metadata === 'object'
        ? (record.metadata as StaffAdvisoryPayload)
        : null

  if (!payload || payload.advisor_report !== true) return null
  return payload
}

function getNotificationPayloadRecord(
  item: NotificationItem
): Record<string, unknown> {
  const record = item as unknown as Record<string, unknown>

  if (
    record.payload_json &&
    typeof record.payload_json === 'object' &&
    !Array.isArray(record.payload_json)
  ) {
    return record.payload_json as Record<string, unknown>
  }

  if (
    record.metadata &&
    typeof record.metadata === 'object' &&
    !Array.isArray(record.metadata)
  ) {
    return record.metadata as Record<string, unknown>
  }

  return {}
}

function getNotificationRiderDefaultScope(
  item: NotificationItem
): AdvisorRiderScope {
  const payload = getNotificationPayloadRecord(item)
  const explicitScope = String(payload.rider_scope ?? '').trim().toLowerCase()

  if (explicitScope === 'external') return 'external'
  if (explicitScope === 'internal') return 'internal'

  const profilePath = String(
    payload.rider_profile_path ??
      payload.external_rider_profile_path ??
      payload.my_rider_profile_path ??
      ''
  ).trim()

  if (profilePath.startsWith('/dashboard/external-riders/')) return 'external'
  if (profilePath.startsWith('/dashboard/my-riders/')) return 'internal'

  return String(item.type_code ?? '').toUpperCase() === 'SCOUT_REPORT_COMPLETED'
    ? 'external'
    : 'internal'
}

function formatAdvisorValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1)
  return String(value)
}

function formatAdvisorAvailability(value: unknown): string {
  const normalized = String(value ?? '').trim().replace(/_/g, ' ')
  if (!normalized) return '—'
  return normalized.replace(/\b\w/g, letter => letter.toUpperCase())
}


function formatAdvisorDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'

  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(1)
  }

  const text = String(value).trim()
  if (!text) return '—'

  // Keep dates, times, UUIDs, URLs and already-formatted text unchanged.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return text
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return text
  if (/^https?:\/\//i.test(text)) return text

  // Backend enum/code values should never be exposed as raw snake_case.
  const normalized = text.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()

  // Title-case short enum/status/code-style values, but do not alter full sentences.
  const looksLikeUiValue =
    text.includes('_') ||
    text.includes('-') ||
    (text === text.toLowerCase() && normalized.split(' ').length <= 5 && normalized.length <= 50)

  if (!looksLikeUiValue) return text

  return normalized
    .toLowerCase()
    .replace(/\b\w/g, letter => letter.toUpperCase())
}


function formatAdvisorDisplayText(value: unknown): string {
  return formatAdvisorDisplayValue(value)
}

function getAdvisorCountryFlagUrl(value: unknown): string | null {
  const code = String(value ?? '').trim().toLowerCase()
  if (!/^[a-z]{2}$/.test(code)) return null
  return `https://flagcdn.com/24x18/${code}.png`
}

function formatAdvisorGameDateTime(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return '—'

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?/)
  if (!match) return formatAdvisorDisplayText(value)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return formatAdvisorDisplayText(value)
  }

  const seasonNumber = year >= 2000 ? year - 1999 : year
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthLabel = monthNames[month - 1] ?? String(month).padStart(2, '0')
  const dateLabel = `${day}. ${monthLabel}`

  const hour = match[4]
  const minute = match[5]
  const timeLabel = hour && minute ? ` - ${hour}:${minute}` : ''

  return `Season ${seasonNumber} - ${dateLabel}${timeLabel}`
}

function getAdvisorRiderDisplayName(
  value: unknown,
  source?: Record<string, unknown>
): string {
  const candidates = [
    source?.rider_full_name,
    source?.full_rider_name,
    source?.full_name,
    source?.name,
    source?.first_name && source?.last_name
      ? `${String(source.first_name).trim()} ${String(source.last_name).trim()}`
      : null,
    source?.rider_first_name && source?.rider_last_name
      ? `${String(source.rider_first_name).trim()} ${String(source.rider_last_name).trim()}`
      : null,
    value,
  ]

  for (const candidate of candidates) {
    if (candidate !== null && candidate !== undefined && String(candidate).trim() !== '') {
      return formatAdvisorDisplayText(candidate)
    }
  }

  return '—'
}


type AdvisorRiderScope = 'internal' | 'external'

function getAdvisorCountryCode(value: unknown): string {
  const code = String(value ?? '').trim().toLowerCase()
  return /^[a-z]{2}$/.test(code) ? code : ''
}

function getAdvisorRiderHref(
  source?: Record<string, unknown>,
  defaultScope: AdvisorRiderScope = 'internal'
): string {
  const explicitPath = String(
    source?.rider_profile_path ?? source?.rider_path ?? source?.profile_path ?? ''
  ).trim()
  if (explicitPath) return explicitPath

  const riderId = String(source?.rider_id ?? source?.id ?? '').trim()
  if (!riderId) return ''

  const explicitScope = String(source?.rider_scope ?? '').trim().toLowerCase()
  const useExternal = explicitScope === 'external' || defaultScope === 'external'

  return useExternal
    ? `/dashboard/external-riders/${riderId}`
    : `/dashboard/my-riders/${riderId}`
}

type AdvisorResolvedRiderIdentity = {
  rider_id: string
  rider_first_name: string | null
  rider_last_name: string | null
  rider_full_name: string | null
  rider_country_code: string | null
}

const advisorRiderIdentityCache = new Map<string, AdvisorResolvedRiderIdentity | null>()
const advisorRiderIdentityPending = new Map<
  string,
  Promise<AdvisorResolvedRiderIdentity | null>
>()

async function loadAdvisorResolvedRiderIdentity(
  riderId: string
): Promise<AdvisorResolvedRiderIdentity | null> {
  const normalizedId = riderId.trim()
  if (!normalizedId) return null

  if (advisorRiderIdentityCache.has(normalizedId)) {
    return advisorRiderIdentityCache.get(normalizedId) ?? null
  }

  const existingRequest = advisorRiderIdentityPending.get(normalizedId)
  if (existingRequest) return existingRequest

  const request = (async (): Promise<AdvisorResolvedRiderIdentity | null> => {
    const { data, error } = await supabase
      .from('riders')
      .select('id, first_name, last_name, display_name, country_code')
      .eq('id', normalizedId)
      .maybeSingle()

    if (error || !data) {
      advisorRiderIdentityCache.set(normalizedId, null)
      return null
    }

    const firstName = String(data.first_name ?? '').trim()
    const lastName = String(data.last_name ?? '').trim()
    const databaseDisplayName = String(data.display_name ?? '').trim()
    const fullName =
      [firstName, lastName].filter(Boolean).join(' ').trim() ||
      databaseDisplayName ||
      null

    const resolved: AdvisorResolvedRiderIdentity = {
      rider_id: String(data.id ?? normalizedId),
      rider_first_name: firstName || null,
      rider_last_name: lastName || null,
      rider_full_name: fullName,
      rider_country_code: String(data.country_code ?? '').trim() || null,
    }

    advisorRiderIdentityCache.set(normalizedId, resolved)
    return resolved
  })().finally(() => {
    advisorRiderIdentityPending.delete(normalizedId)
  })

  advisorRiderIdentityPending.set(normalizedId, request)
  return request
}

function AdvisorRiderIdentity({
  value,
  source,
  navigate,
  defaultScope = 'internal',
  showFlag = true,
  wrapperClassName = '',
  textClassName = 'font-medium text-slate-900',
}: {
  value: unknown
  source?: Record<string, unknown>
  navigate: ReturnType<typeof useNavigate>
  defaultScope?: AdvisorRiderScope
  showFlag?: boolean
  wrapperClassName?: string
  textClassName?: string
}): JSX.Element {
  const riderId = String(source?.rider_id ?? source?.id ?? '').trim()
  const [resolvedIdentity, setResolvedIdentity] =
    useState<AdvisorResolvedRiderIdentity | null>(() =>
      riderId ? advisorRiderIdentityCache.get(riderId) ?? null : null
    )

  useEffect(() => {
    let cancelled = false

    if (!riderId) {
      setResolvedIdentity(null)
      return () => {
        cancelled = true
      }
    }

    const cached = advisorRiderIdentityCache.get(riderId)
    if (cached !== undefined) {
      setResolvedIdentity(cached)
      return () => {
        cancelled = true
      }
    }

    void loadAdvisorResolvedRiderIdentity(riderId).then(result => {
      if (!cancelled) setResolvedIdentity(result)
    })

    return () => {
      cancelled = true
    }
  }, [riderId])

  const mergedSource: Record<string, unknown> = {
    ...(source ?? {}),
    ...(resolvedIdentity
      ? {
          rider_first_name: resolvedIdentity.rider_first_name,
          rider_last_name: resolvedIdentity.rider_last_name,
          rider_full_name: resolvedIdentity.rider_full_name,
          rider_country_code: resolvedIdentity.rider_country_code,
        }
      : {}),
  }

  const riderName = getAdvisorRiderDisplayName(value, mergedSource)
  const riderHref = getAdvisorRiderHref(mergedSource, defaultScope)
  const countryCode = getAdvisorCountryCode(
    mergedSource.rider_country_code ??
      mergedSource.country_code ??
      mergedSource.country
  )
  const flagUrl = getAdvisorCountryFlagUrl(countryCode)

  const content = (
    <span className={`inline-flex max-w-full items-center gap-2 ${wrapperClassName}`.trim()}>
      {showFlag && flagUrl ? (
        <img
          src={flagUrl}
          alt={countryCode.toUpperCase()}
          title={countryCode.toUpperCase()}
          className="h-3.5 w-5 shrink-0 rounded-[2px] border border-black/10 object-cover"
          loading="lazy"
        />
      ) : null}
      <span className={`${textClassName} truncate`.trim()}>{riderName}</span>
    </span>
  )

  if (!riderHref) return content

  return (
    <button
      type="button"
      onClick={() => navigate(riderHref)}
      className="inline-flex max-w-full items-center text-left hover:underline underline-offset-2"
      title={riderName}
    >
      {content}
    </button>
  )
}

function renderAdvisorRiderIdentity(options: {
  value: unknown
  source?: Record<string, unknown>
  navigate: ReturnType<typeof useNavigate>
  defaultScope?: AdvisorRiderScope
  showFlag?: boolean
  wrapperClassName?: string
  textClassName?: string
}) {
  return <AdvisorRiderIdentity {...options} />
}

export default function NotificationsPage(): JSX.Element {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation('notifications')
  const translateDetailActionLabel = useCallback(
    (labelValue: unknown): string => {
      const label = String(labelValue ?? '').trim()
      const keyByLabel: Record<string, string> = {
        Open: 'details.open',
        'Open rider': 'details.openRider',
        'Open squad': 'details.openSquad',
        Races: 'details.races',
        Race: 'details.race',
        'Race Preparation': 'details.racePreparation',
        'Mark as read': 'details.markRead',
        'Open staff': 'details.openStaff',
        'Team page': 'details.teamPage',
        'Open staff profile': 'details.openStaffProfile',
        'Open staff page': 'details.openStaffPage',
        'Open transfers': 'details.openTransfers',
        'Open negotiation': 'details.openNegotiation',
        'Review transfer': 'details.reviewTransfer',
        'Check offer': 'details.checkOffer',
        'Open free agents': 'details.openFreeAgents',
        'Pro Packages': 'details.proPackages',
        'Open sponsors': 'details.openSponsors',
        'Race supplies': 'details.raceSupplies',
        'Open stage': 'details.openStage',
        'Open race': 'details.openRace',
        'Open equipment': 'details.openEquipment',
        'Open infrastructure': 'details.openInfrastructure',
        'Open finance': 'details.openFinance',
        'Open scouting': 'details.openScouting',
        'Review sponsor offers': 'details.reviewSponsorOffers',
        Sponsors: 'details.sponsors',
        Team: 'details.team',
        'View results': 'details.viewResults',
      }
      const key = keyByLabel[label]
      return key ? t(key) : label
    },
    [t]
  )
  const [advisorFilter, setAdvisorFilter] = useState<AdvisorNotificationFilter | null>(() =>
    readAdvisorNotificationFilterFromHash()
  )

  const [activeTab, setActiveTab] = useState<NotificationTab>('unread')

  const [unreadItems, setUnreadItems] = useState<NotificationItem[]>([])
  const [readItems, setReadItems] = useState<NotificationItem[]>([])

  const [unreadCount, setUnreadCount] = useState(0)

  const [isLoadingUnread, setIsLoadingUnread] = useState(false)
  const [isLoadingRead, setIsLoadingRead] = useState(false)
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false)

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [retainedReadUnreadId, setRetainedReadUnreadId] = useState<number | null>(null)
  const retainedReadUnreadItemRef = useRef<NotificationItem | null>(null)
  const suppressNextLocalAttentionRefreshRef = useRef(false)

  const [pageByTab, setPageByTab] = useState<Record<NotificationTab, number>>({
    unread: 1,
    read: 1,
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const [mutedAdvisorReportCodes, setMutedAdvisorReportCodes] =
    useState<Set<string>>(() => new Set())
  const [advisorMuteBusyCode, setAdvisorMuteBusyCode] = useState<string | null>(null)
  const [advisorMuteError, setAdvisorMuteError] = useState<string | null>(null)

  const loadAdvisorNotificationMutes = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      'get_my_staff_advisory_notification_mutes_v1'
    )

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load Staff Advisory notification mutes:', error)
      return
    }

    const nextMuted = new Set<string>()

    for (const row of data ?? []) {
      const reportCode = String(
        (row as Record<string, unknown>).report_code ?? ''
      )
        .trim()
        .toLowerCase()

      const isMuted =
        (row as Record<string, unknown>).is_muted === true

      if (reportCode && isMuted) {
        nextMuted.add(reportCode)
      }
    }

    setMutedAdvisorReportCodes(nextMuted)
  }, [])

  const handleToggleAdvisorReportMute = useCallback(
    async (reportCodeValue: unknown) => {
      const reportCode = String(reportCodeValue ?? '')
        .trim()
        .toLowerCase()

      if (!reportCode || advisorMuteBusyCode) return

      const wasMuted = mutedAdvisorReportCodes.has(reportCode)
      const nextMuted = !wasMuted

      setAdvisorMuteError(null)
      setAdvisorMuteBusyCode(reportCode)

      setMutedAdvisorReportCodes(prev => {
        const next = new Set(prev)
        if (nextMuted) next.add(reportCode)
        else next.delete(reportCode)
        return next
      })

      const { data, error } = await supabase.rpc(
        'set_my_staff_advisory_notification_mute_v1',
        {
          p_report_code: reportCode,
          p_muted: nextMuted,
        }
      )

      if (error) {
        setMutedAdvisorReportCodes(prev => {
          const next = new Set(prev)
          if (wasMuted) next.add(reportCode)
          else next.delete(reportCode)
          return next
        })
        setAdvisorMuteError(
          t(nextMuted ? 'mute.errorMute' : 'mute.errorUnmute')
        )
        // eslint-disable-next-line no-console
        console.error(
          `Failed to ${nextMuted ? 'mute' : 'unmute'} advisor notification type ${reportCode}:`,
          error
        )
        setAdvisorMuteBusyCode(null)
        return
      }

      const savedRow = Array.isArray(data) ? data[0] : data
      const savedMuted =
        (savedRow as Record<string, unknown> | null)?.is_muted === true

      setMutedAdvisorReportCodes(prev => {
        const next = new Set(prev)
        if (savedMuted) next.add(reportCode)
        else next.delete(reportCode)
        return next
      })

      setAdvisorMuteBusyCode(null)
    },
    [advisorMuteBusyCode, mutedAdvisorReportCodes, t]
  )

  const renderAdvisorMuteButton = useCallback(
    (payload: StaffAdvisoryPayload) => {
      const reportCode = String(payload.report_code ?? '')
        .trim()
        .toLowerCase()

      if (!reportCode) return null

      const isMuted = mutedAdvisorReportCodes.has(reportCode)
      const isBusy = advisorMuteBusyCode === reportCode

      return (
        <button
          type="button"
          onClick={() => {
            void handleToggleAdvisorReportMute(reportCode)
          }}
          disabled={isBusy}
          title={
            isMuted
              ? t('mute.unmuteTitle')
              : t('mute.muteTitle')
          }
          className={
            isMuted
              ? 'rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50'
              : 'rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50'
          }
        >
          {isBusy
            ? t('mute.saving')
            : isMuted
              ? t('mute.unmute')
              : t('mute.mute')}
        </button>
      )
    },
    [
      advisorMuteBusyCode,
      handleToggleAdvisorReportMute,
      mutedAdvisorReportCodes,
      t,
    ]
  )

  useEffect(() => {
    void loadAdvisorNotificationMutes()
  }, [loadAdvisorNotificationMutes])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const syncAdvisorFilter = () => {
      setAdvisorFilter(readAdvisorNotificationFilterFromHash())
      setExpandedId(null)
      setSearchQuery('')
      setCategoryFilter('all')
      setPageByTab({
        unread: 1,
        read: 1,
      })
    }

    window.addEventListener('hashchange', syncAdvisorFilter)

    return () => {
      window.removeEventListener('hashchange', syncAdvisorFilter)
    }
  }, [])

  const shouldDisplayNotification = useCallback((item: NotificationItem): boolean => {
    const preferences = readNotificationPreferences()
    return canReceiveNotificationItem(preferences, item as any)
  }, [])

  const loadUnreadCount = useCallback(async () => {
    if (advisorFilter) {
      const { data, error } = await supabase.rpc('get_my_advisor_notifications_v1', {
        p_advisor_staff_id: advisorFilter.advisorStaffId,
        p_status: 'unread',
        p_limit: MAX_FETCH_SIZE,
        p_offset: 0,
      })

      if (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load advisor unread notification count:', error)
        return
      }

      setUnreadCount((data ?? []).length)
      return
    }

    const { data, error } = await supabase.rpc('get_my_notifications', {
      p_status: 'unread',
      p_page: 1,
      p_page_size: MAX_FETCH_SIZE,
    })

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load unread notification count:', error)
      return
    }

    const templatedItems = applyNotificationTemplates((data ?? []) as NotificationItem[])
    const unread = templatedItems.filter(shouldDisplayNotification)

    // Important: do not hide/auto-read notifications on page load only because a
    // local Overview attention key exists. That can be too broad after old cached
    // keys. Only explicit open/mark actions should change notification read state.
    setUnreadCount(unread.length)
  }, [advisorFilter, shouldDisplayNotification])

  const loadNotifications = useCallback(
    async (tab: NotificationTab) => {
      const setLoading = tab === 'unread' ? setIsLoadingUnread : setIsLoadingRead
      const setItems = tab === 'unread' ? setUnreadItems : setReadItems

      setLoading(true)

      if (advisorFilter) {
        const { data, error } = await supabase.rpc('get_my_advisor_notifications_v1', {
          p_advisor_staff_id: advisorFilter.advisorStaffId,
          p_status: tab,
          p_limit: MAX_FETCH_SIZE,
          p_offset: 0,
        })

        if (error) {
          // eslint-disable-next-line no-console
          console.error(`Failed to load ${tab} advisor notifications:`, error)
          setLoading(false)
          return
        }

        const advisorItems = (data ?? []).map(row =>
          mapAdvisorNotificationRow(row as Record<string, unknown>)
        )

        if (tab === 'unread') {
          const retainedItem = retainedReadUnreadItemRef.current
          if (
            retainedItem &&
            !advisorItems.some(
              existing =>
                existing.user_notification_id === retainedItem.user_notification_id
            )
          ) {
            setItems([retainedItem, ...advisorItems])
          } else {
            setItems(advisorItems)
          }
        } else {
          setItems(advisorItems)
        }

        setLoading(false)
        return
      }

      const { data, error } = await supabase.rpc('get_my_notifications', {
        p_status: tab,
        p_page: 1,
        p_page_size: MAX_FETCH_SIZE,
      })

      if (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to load ${tab} notifications:`, error)
        setLoading(false)
        return
      }

      const templatedItems = applyNotificationTemplates((data ?? []) as NotificationItem[])
      const displayableItems = templatedItems.filter(shouldDisplayNotification)

      // Do not filter unread notifications using old local dismissal keys.
      // Matching notifications are marked read by explicit actions:
      // - opening/marking a notification
      // - opening an Overview attention bubble
      if (tab === 'unread') {
        const retainedItem = retainedReadUnreadItemRef.current
        if (
          retainedItem &&
          !displayableItems.some(
            existing =>
              existing.user_notification_id === retainedItem.user_notification_id
          )
        ) {
          setItems([retainedItem, ...displayableItems])
        } else {
          setItems(displayableItems)
        }
      } else {
        setItems(displayableItems)
      }

      setLoading(false)
    },
    [advisorFilter, shouldDisplayNotification]
  )

  const handleTabChange = useCallback((tab: NotificationTab) => {
    const retainedId = retainedReadUnreadItemRef.current?.user_notification_id ?? null
    if (retainedId !== null) {
      setUnreadItems(prev =>
        prev.filter(n => n.user_notification_id !== retainedId)
      )
    }
    retainedReadUnreadItemRef.current = null
    setRetainedReadUnreadId(null)
    setActiveTab(tab)
    setExpandedId(null)
    setPageByTab(prev => ({
      ...prev,
      [tab]: 1,
    }))
  }, [])

  const resetActivePage = useCallback(() => {
    const retainedId = retainedReadUnreadItemRef.current?.user_notification_id ?? null
    if (retainedId !== null) {
      setUnreadItems(prev =>
        prev.filter(n => n.user_notification_id !== retainedId)
      )
    }
    retainedReadUnreadItemRef.current = null
    setRetainedReadUnreadId(null)
    setExpandedId(null)
    setPageByTab(prev => ({
      ...prev,
      [activeTab]: 1,
    }))
  }, [activeTab])

  const markNotificationReadWithoutClosing = useCallback(
    async (item: NotificationItem) => {
      if (item.status !== 'unread') return

      const { data, error } = await supabase.rpc('mark_my_notification_read', {
        p_user_notification_id: item.user_notification_id,
      })

      if (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to auto-mark opened notification as read:', error)
        return
      }

      if (data === true) {
        const readItem: NotificationItem = {
          ...item,
          status: 'read',
          read_at: new Date().toISOString(),
        }

        // Keep the opened notification in its current Unread-list shape while
        // the user is reading it. We record the backend read state separately.
        // This prevents the current filter from removing the item immediately.
        retainedReadUnreadItemRef.current = item
        setRetainedReadUnreadId(item.user_notification_id)

        setReadItems(prev => {
          const withoutDuplicate = prev.filter(
            n => n.user_notification_id !== item.user_notification_id
          )
          return [readItem, ...withoutDuplicate]
        })

        setUnreadCount(prev => Math.max(0, prev - 1))

        // dismissMatchingOverviewAttentionForNotification dispatches a same-window
        // event that normally refreshes the whole notification list. For this
        // local Open = Read action, that refresh is unnecessary and causes a
        // visible flicker. Keep the local UI stable and suppress this one refresh.
        suppressNextLocalAttentionRefreshRef.current = true
        dismissMatchingOverviewAttentionForNotification(item)
      }
    },
    []
  )

  const flushRetainedReadUnread = useCallback(
    (exceptId?: number | null) => {
      setRetainedReadUnreadId(currentRetainedId => {
        if (
          currentRetainedId === null ||
          currentRetainedId === exceptId
        ) {
          return currentRetainedId
        }

        setUnreadItems(prev =>
          prev.filter(
            n => n.user_notification_id !== currentRetainedId
          )
        )

        retainedReadUnreadItemRef.current = null
        return null
      })
    },
    []
  )

  const handleToggleNotificationDetails = useCallback(
    async (item: NotificationItem) => {
      const isCurrentlyExpanded =
        expandedId === item.user_notification_id

      if (isCurrentlyExpanded) {
        // Closing the notification means the user has finished viewing it.
        setExpandedId(null)
        flushRetainedReadUnread(null)
        return
      }

      // Moving to another notification removes the previously opened/read
      // notification from the Unread list first.
      flushRetainedReadUnread(item.user_notification_id)

      // Universal notification rule:
      // opening/expanding any notification means the user has read it.
      setExpandedId(item.user_notification_id)

      if (
        item.status === 'unread' &&
        retainedReadUnreadId !== item.user_notification_id
      ) {
        await markNotificationReadWithoutClosing(item)
      }
    },
    [
      expandedId,
      flushRetainedReadUnread,
      markNotificationReadWithoutClosing,
      retainedReadUnreadId,
    ]
  )

  const handleOpenNotification = useCallback(
    async (item: NotificationItem, overrideUrl?: string | null) => {
      const url = overrideUrl ?? getResolvedNotificationActionUrl(item)

      if (item.status === 'unread') {
        const { data, error } = await supabase.rpc('mark_my_notification_read', {
          p_user_notification_id: item.user_notification_id,
        })

        if (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to mark notification as read:', error)
          return
        }

        if (data === true) {
          const readItem: NotificationItem = {
            ...item,
            status: 'read',
            read_at: new Date().toISOString(),
          }

          setUnreadItems(prev =>
            prev.filter(n => n.user_notification_id !== item.user_notification_id)
          )
          setReadItems(prev => [readItem, ...prev])
          setUnreadCount(prev => Math.max(0, prev - 1))
        }
      }

      dismissMatchingOverviewAttentionForNotification(item, url)

      if (url) {
        navigate(url)
      }
    },
    [navigate]
  )

  const handleTemplateAction = useCallback(
    async (item: NotificationItem, action: NotificationActionTemplate) => {
      // Standalone "Mark as read" actions are intentionally no longer used.
      // Opening the notification detail box is now the universal read action.
      if (action.kind === 'markRead') return

      const href = getNotificationActionHref(action, item)
      if (!href) return

      await handleOpenNotification(item, href)
    },
    [handleOpenNotification]
  )

  const handleMarkAllAsRead = useCallback(async () => {
    setIsMarkingAllRead(true)

    if (advisorFilter) {
      const advisorUnreadItems = unreadItems.filter(item => item.status === 'unread')

      for (const item of advisorUnreadItems) {
        const { error } = await supabase.rpc('mark_my_notification_read', {
          p_user_notification_id: item.user_notification_id,
        })

        if (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to mark advisor notification as read:', error)
        }
      }
    } else {
      const { error } = await supabase.rpc('mark_all_my_notifications_read')

      if (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to mark all notifications as read:', error)
        setIsMarkingAllRead(false)
        return
      }
    }

    await Promise.all([
      loadUnreadCount(),
      loadNotifications('unread'),
      loadNotifications('read'),
    ])

    setIsMarkingAllRead(false)
    retainedReadUnreadItemRef.current = null
    setRetainedReadUnreadId(null)
    setExpandedId(null)
    setPageByTab({
      unread: 1,
      read: 1,
    })
  }, [advisorFilter, loadNotifications, loadUnreadCount, unreadItems])

  useEffect(() => {
    void loadUnreadCount()
  }, [loadUnreadCount])

  useEffect(() => {
    void loadNotifications(activeTab)
  }, [activeTab, loadNotifications])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const refreshAfterAttentionDismissal = () => {
      if (suppressNextLocalAttentionRefreshRef.current) {
        suppressNextLocalAttentionRefreshRef.current = false
        return
      }

      void loadUnreadCount()
      void loadNotifications(activeTab)
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === OVERVIEW_OPENED_ATTENTION_STORAGE_KEY) {
        refreshAfterAttentionDismissal()
      }
    }

    window.addEventListener(OVERVIEW_ATTENTION_DISMISSED_EVENT, refreshAfterAttentionDismissal)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener(OVERVIEW_ATTENTION_DISMISSED_EVENT, refreshAfterAttentionDismissal)
      window.removeEventListener('storage', handleStorage)
    }
  }, [activeTab, loadNotifications, loadUnreadCount])

  const allActiveItems = activeTab === 'unread' ? unreadItems : readItems

  const advisorDisplay = useMemo(() => {
    if (!advisorFilter) return null

    const combined = [...unreadItems, ...readItems]
    const first = combined[0] as unknown as Record<string, unknown> | undefined
    const payload =
      first?.payload_json && typeof first.payload_json === 'object'
        ? (first.payload_json as Record<string, unknown>)
        : first?.metadata && typeof first.metadata === 'object'
          ? (first.metadata as Record<string, unknown>)
          : null

    const advisorName = String(payload?.advisor_staff_name ?? '').trim()
    const advisorRole = String(
      payload?.advisor_role ?? advisorFilter.advisorRole ?? ''
    )
      .replace(/_/g, ' ')
      .trim()

    const roleKeyByCode: Record<string, string> = {
      assigned_advisor: 'roles.assignedAdvisor',
      assignedadvisor: 'roles.assignedAdvisor',
      staff_advisor: 'roles.staffAdvisor',
      staffadvisor: 'roles.staffAdvisor',
      head_coach: 'roles.headCoach',
      headcoach: 'roles.headCoach',
      sports_director: 'roles.sportsDirector',
      sportsdirector: 'roles.sportsDirector',
      team_doctor: 'roles.teamDoctor',
      teamdoctor: 'roles.teamDoctor',
      chief_mechanic: 'roles.chiefMechanic',
      chiefmechanic: 'roles.chiefMechanic',
      scout: 'roles.scout',
    }
    const normalizedRole = advisorRole.toLowerCase().replace(/\s+/g, '_')
    const compactRole = normalizedRole.replace(/_/g, '')
    const roleKey = roleKeyByCode[normalizedRole] ?? roleKeyByCode[compactRole]

    return {
      name: advisorName || t('roles.assignedAdvisor'),
      role: roleKey
        ? t(roleKey)
        : advisorRole
          ? advisorRole.replace(/\b\w/g, letter => letter.toUpperCase())
          : t('roles.staffAdvisor'),
    }
  }, [advisorFilter, readItems, t, unreadItems])
  const isActiveTabLoading = activeTab === 'unread' ? isLoadingUnread : isLoadingRead

  const categoryOptions = useMemo<CategoryOption[]>(() => {
    const map = new Map<string, string>()

    for (const item of allActiveItems) {
      const value = getNotificationCategoryValue(item)
      const label = getNotificationCategoryLabel(item, t)
      map.set(value, label)
    }

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, i18n.language))
  }, [allActiveItems, i18n.language, t])

  const filteredItems = useMemo(() => {
    return allActiveItems.filter(item => {
      if (!matchesSearch(item, searchQuery)) return false

      if (categoryFilter !== 'all') {
        return getNotificationCategoryValue(item) === categoryFilter
      }

      return true
    })
  }, [allActiveItems, categoryFilter, searchQuery])

  const activePage = pageByTab[activeTab]
  const totalItems = filteredItems.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))

  const safeActivePage = Math.min(activePage, totalPages)
  const startIndex = (safeActivePage - 1) * PAGE_SIZE
  const endIndex = startIndex + PAGE_SIZE
  const visibleItems = filteredItems.slice(startIndex, endIndex)

  const canGoPrevious = safeActivePage > 1
  const canGoNext = safeActivePage < totalPages

  useEffect(() => {
    if (activePage > totalPages) {
      setPageByTab(prev => ({
        ...prev,
        [activeTab]: totalPages,
      }))
    }
  }, [activePage, activeTab, totalPages])

  return (
    <div className="w-full px-6 py-6">
      <div className="w-full space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {advisorFilter ? t('page.advisorTitle') : t('page.title')}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {advisorFilter && advisorDisplay
                ? t('page.advisorSubtitle', { name: advisorDisplay.name, role: advisorDisplay.role })
                : t('page.subtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start">
            <button
              type="button"
              onClick={() => navigate('/dashboard/preferences')}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('page.preferences')}
            </button>

            {advisorFilter ? (
              <button
                type="button"
                onClick={() => navigate('/dashboard/notifications')}
                className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('page.showAll')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleTabChange('unread')
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    activeTab === 'unread'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t('tabs.unread')}
                  {unreadCount > 0 ? (
                    <span className="ml-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-white/15 px-1 text-[10px]">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleTabChange('read')
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    activeTab === 'read'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t('tabs.read')}
                </button>

                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleMarkAllAsRead()
                    }}
                    disabled={isMarkingAllRead}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-60"
                  >
                    {isMarkingAllRead ? t('tabs.marking') : t('tabs.markAll')}
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={event => {
                    setSearchQuery(event.target.value)
                    resetActivePage()
                  }}
                  placeholder={t('filters.search')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500 sm:w-72"
                />
                {!advisorFilter ? (

                <select
                  value={categoryFilter}
                  onChange={event => {
                    setCategoryFilter(event.target.value)
                    resetActivePage()
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 sm:w-56"
                >
                  <option value="all">{t('filters.allCategories')}</option>
                  {categoryOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                ) : null}
                {(searchQuery || categoryFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      setCategoryFilter('all')
                      resetActivePage()
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t('filters.clear')}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              {t('summary.showing', {
                start: visibleItems.length === 0 ? 0 : startIndex + 1,
                end: Math.min(endIndex, totalItems),
                total: totalItems,
                state: t(activeTab === 'unread' ? 'summary.unread' : 'summary.read'),
                kind: t(advisorFilter ? 'summary.advisorReports' : 'summary.notifications'),
              })}
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {isActiveTabLoading ? (
              <div className="px-4 py-10 text-sm text-slate-500">{t('empty.loading')}</div>
            ) : visibleItems.length === 0 ? (
              <div className="px-4 py-10 text-sm text-slate-500">
                {searchQuery || (!advisorFilter && categoryFilter !== 'all')
                  ? t('empty.noMatch')
                  : advisorFilter
                    ? activeTab === 'unread'
                      ? t('empty.advisorUnread')
                      : t('empty.advisorRead')
                    : activeTab === 'unread'
                      ? t('empty.unread')
                      : t('empty.read')}
              </div>
            ) : (
              <>
                {advisorMuteError ? (
                  <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                    {advisorMuteError}
                  </div>
                ) : null}

                <div className="divide-y divide-slate-100">
                {visibleItems.map(item => {
                  const isUnread = item.status === 'unread'
                  const isExpanded = expandedId === item.user_notification_id
                  const isSeasonStartNotice = item.type_code === 'SEASON_STARTED'
                  const imageSrc = getNotificationImageSrc(item)
                  const introText = getNotificationIntroText(item)
                  const detailRows = getNotificationDetailRows(item)
                  const extraText = getNotificationExtraText(item)
                  const templateActions = getNotificationActions(item).filter(
                    action => action.kind !== 'markRead'
                  )

                  return (
                    <div
                      key={item.user_notification_id}
                      className={`px-4 py-4 transition-colors ${
                        isUnread ? 'bg-slate-50' : 'bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          void handleToggleNotificationDetails(item)
                        }}
                        className="flex w-full items-start gap-3 text-left"
                      >
                        <span
                          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                            isUnread ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div
                              className={`text-sm ${
                                isUnread
                                  ? 'font-semibold text-slate-900'
                                  : 'font-medium text-slate-900'
                              }`}
                            >
                              {item.title}
                            </div>

                            <div className="shrink-0 text-xs text-slate-500">
                              {formatNotificationTime(item.notification_created_at, { t, locale: i18n.resolvedLanguage ?? i18n.language })}
                            </div>
                          </div>

                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                            {item.message}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            {advisorFilter ? (
                              <>
                                <span>{t('details.staffAdvisory')}</span>
                                <span>•</span>
                                <span>{isExpanded ? t('details.hideReport') : t('details.showReport')}</span>
                              </>
                            ) : (
                              <>
                                <span>{item.source === 'game' ? t('categories.game') : item.source === 'admin' ? t('categories.admin') : item.source === 'system' ? t('categories.system') : item.source}</span>
                                <span>•</span>
                                <span>{localizeNotificationTypeCodeLabel(item.type_code)}</span>
                                <span>•</span>
                                <span>{getNotificationCategoryLabel(item, t)}</span>
                                <span>•</span>
                                <span>{isExpanded ? t('details.hideDetails') : t('details.showDetails')}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>

                      {isExpanded && (() => {
                        const advisorPayload = getAdvisorPayload(item)
                        const isHeadCoachAdvisor =
                          advisorPayload?.advisor_role === 'head_coach'

                        if (isHeadCoachAdvisor && advisorPayload) {
                          const snapshot = advisorPayload.snapshot ?? {}
                          const attentionRiders = Array.isArray(advisorPayload.attention_riders)
                            ? advisorPayload.attention_riders
                            : []
                          const recommendations = Array.isArray(advisorPayload.recommendations)
                            ? advisorPayload.recommendations
                            : []
                          const advisorActions = Array.isArray(advisorPayload.actions)
                            ? advisorPayload.actions
                            : []

                          const headCoachPayloadRecord =
                            advisorPayload as unknown as Record<string, unknown>
                          const headCoachVariant = String(
                            advisorPayload.report_variant ??
                              headCoachPayloadRecord.report_variant ??
                              ''
                          ).trim()
                          const isRiderSkillChange =
                            headCoachVariant === 'rider_skill_change' ||
                            String(headCoachPayloadRecord.report_code ?? '').trim() ===
                              'hc_rider_skill_change'

                          const skillRiderName =
                            String(
                              headCoachPayloadRecord.rider_full_name ??
                                headCoachPayloadRecord.rider_name ??
                                ''
                            ).trim() || t('common.rider')
                          const skillLabel = String(
                            headCoachPayloadRecord.skill_label ??
                              headCoachPayloadRecord.skill_name ??
                              ''
                          ).trim()
                          const skillOldValue =
                            headCoachPayloadRecord.old_value ??
                            headCoachPayloadRecord.previous_value
                          const skillNewValue =
                            headCoachPayloadRecord.new_value ??
                            headCoachPayloadRecord.current_value
                          const skillDelta =
                            headCoachPayloadRecord.delta ??
                            headCoachPayloadRecord.skill_delta

                          const skillChangeSummary =
                            isRiderSkillChange &&
                            skillLabel &&
                            skillOldValue !== undefined &&
                            skillOldValue !== null &&
                            skillNewValue !== undefined &&
                            skillNewValue !== null
                              ? t(
                                  Number(skillDelta ?? 0) < 0
                                    ? 'headCoach.decreased'
                                    : 'headCoach.improved',
                                  {
                                    rider: skillRiderName,
                                    skill: skillLabel,
                                    old: formatAdvisorValue(skillOldValue),
                                    new: formatAdvisorValue(skillNewValue),
                                    delta: `${Number(skillDelta ?? 0) > 0 ? '+' : ''}${formatAdvisorValue(skillDelta)}`,
                                  }
                                )
                              : null

                          const snapshotEntries = (
                            isRiderSkillChange
                              ? [
                                  [t('common.rider'), skillRiderName],
                                  [t('headCoach.skill'), skillLabel],
                                  [t('headCoach.previousValue'), skillOldValue],
                                  [t('headCoach.newValue'), skillNewValue],
                                  [t('headCoach.change'), Number(skillDelta ?? 0) > 0 ? `+${formatAdvisorValue(skillDelta)}` : formatAdvisorValue(skillDelta)],
                                ]
                              : [
                                  [t('headCoach.squadRiders'), snapshot.squad_riders],
                                  [t('headCoach.highFatigue'), snapshot.high_fatigue ?? snapshot.affected_riders],
                                  [t('headCoach.elevatedFatigue'), snapshot.elevated_fatigue],
                                  [t('headCoach.notFullyFit'), snapshot.not_fully_fit],
                                  [t('headCoach.unavailable'), snapshot.unavailable],
                                  [
                                    t('headCoach.plannedSessions'),
                                    snapshot.planned_training_sessions_next_3_game_days ??
                                      snapshot.planned_sessions,
                                  ],
                                  [
                                    t('headCoach.manualOverrides'),
                                    snapshot.manual_training_overrides_next_3_game_days ??
                                      snapshot.manual_overrides,
                                  ],
                                  [t('headCoach.highestFatigue'), snapshot.highest_fatigue],
                                  [t('headCoach.windowStart'), formatAdvisorGameDateTime(snapshot.window_start)],
                                  [t('headCoach.windowEnd'), formatAdvisorGameDateTime(snapshot.window_end)],
                                ]
                          ).filter(([, value]) => value !== undefined && value !== null && value !== '')

                          return (
                            <div className="ml-5 mt-4 overflow-hidden rounded-xl border border-slate-300 bg-slate-50 shadow-sm">
                              <div className="border-b border-slate-300 bg-white px-4 py-3">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-900">
                                      {item.title}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {advisorPayload.staff?.name ??
                                        advisorPayload.advisor_staff_name ??
                                        t('roles.headCoach')}{' '}
                                      · {t('roles.headCoach')}
                                    </div>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {String(advisorPayload.report_variant ?? '')
                                      .replace(/_/g, ' ')
                                      .replace(/\b\w/g, letter => letter.toUpperCase())}
                                  </div>
                                </div>
                              </div>

                              <div className="px-4 py-4">
                                <div
                                  className={`grid gap-6 ${
                                    imageSrc
                                      ? 'lg:grid-cols-[minmax(0,1fr)_340px]'
                                      : 'grid-cols-1'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm leading-6 text-slate-700">
                                      {skillChangeSummary || advisorPayload.summary || item.message}
                                    </p>

                                    {snapshotEntries.length > 0 ? (
                                      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                                        {snapshotEntries.map(([label, value]) => (
                                          <div
                                            key={String(label)}
                                            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                                          >
                                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                              {label}
                                            </div>
                                            <div className="mt-1 text-lg font-semibold text-slate-900">
                                              {label === t('common.rider') && isRiderSkillChange
                                                ? renderAdvisorRiderIdentity({
                                                    value,
                                                    source: headCoachPayloadRecord,
                                                    navigate,
                                                    defaultScope: 'internal',
                                                  })
                                                : formatAdvisorValue(value)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}

                                    {attentionRiders.length > 0 ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          {t('headCoach.ridersAttention')}
                                        </div>
                                        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                          <div className="grid grid-cols-[minmax(0,1fr)_90px_150px_minmax(160px,1fr)] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                            <span>{t('common.rider')}</span>
                                            <span>{t('headCoach.fatigue')}</span>
                                            <span>{t('common.availability')}</span>
                                            <span>{t('common.reason')}</span>
                                          </div>
                                          {attentionRiders.map((rider, index) => (
                                            <div
                                              key={`${String(rider.rider_id ?? rider.name ?? index)}-${index}`}
                                              className="grid grid-cols-[minmax(0,1fr)_90px_150px_minmax(160px,1fr)] gap-3 border-b border-slate-100 px-3 py-2.5 text-sm last:border-b-0"
                                            >
                                              <span className="min-w-0">
                                                {renderAdvisorRiderIdentity({
                                                  value: rider.name,
                                                  source: rider as Record<string, unknown>,
                                                  navigate,
                                                  defaultScope: 'internal',
                                                })}
                                              </span>
                                              <span className="text-slate-700">
                                                {formatAdvisorValue(rider.fatigue)}
                                              </span>
                                              <span className="text-slate-700">
                                                {formatAdvisorAvailability(rider.availability)}
                                              </span>
                                              <span className="text-slate-700">
                                                {formatAdvisorValue(rider.flag_reason)}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}

                                    {recommendations.length > 0 ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          {t('headCoach.recommendations')}
                                        </div>
                                        <ul className="mt-2 space-y-2">
                                          {recommendations.map((recommendation, index) => (
                                            <li
                                              key={`${String(recommendation)}-${index}`}
                                              className="flex gap-2 text-sm leading-6 text-slate-700"
                                            >
                                              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                                              <span>{String(recommendation)}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : null}
                                  </div>

                                  {imageSrc ? (
                                    <div className="flex items-start justify-center lg:justify-end">
                                      <img
                                        src={imageSrc}
                                        alt={item.title}
                                        className="w-full max-w-[340px] rounded-xl object-cover shadow-sm"
                                        draggable={false}
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              <div className="border-t border-slate-300 bg-white px-4 py-3">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  {renderAdvisorMuteButton(advisorPayload)}
                                  {advisorActions.map((action, index) => (
                                    <button
                                      key={`${action.label ?? 'action'}-${index}`}
                                      type="button"
                                      onClick={() => {
                                        const target = String(action.target ?? '').trim()
                                        if (target) navigate(target)
                                      }}
                                      className={
                                        index === 0
                                          ? 'rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800'
                                          : 'rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100'
                                      }
                                    >
                                      {translateDetailActionLabel(action.label || t('details.open'))}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        }


                        const isSportDirectorAdvisor =
                          advisorPayload?.advisor_role === 'sport_director'
                        const isTeamDoctorAdvisor =
                          advisorPayload?.advisor_role === 'team_doctor'
                        const isMechanicAdvisor =
                          advisorPayload?.advisor_role === 'mechanic'
                        const isScoutAdvisor =
                          advisorPayload?.advisor_role === 'scout_analyst'

                        if (isSportDirectorAdvisor && advisorPayload) {
                          const sportData =
                            advisorPayload.data ?? advisorPayload.snapshot ?? {}
                          const recommendations = Array.isArray(advisorPayload.recommendations)
                            ? advisorPayload.recommendations
                            : []
                          const advisorActions = Array.isArray(advisorPayload.actions)
                            ? advisorPayload.actions
                            : []
                          const managementPriorities = Array.isArray(
                            advisorPayload.management_priorities ??
                              (sportData as Record<string, unknown>).management_priorities
                          )
                            ? ((advisorPayload.management_priorities ??
                                (sportData as Record<string, unknown>).management_priorities) as Array<Record<string, unknown>>)
                            : []
                          const missingStageAnalysis =
                            (advisorPayload.missing_stage_analysis as Record<string, unknown> | undefined) ??
                            ((sportData as Record<string, unknown>).missing_stage_analysis as Record<string, unknown> | undefined) ??
                            null
                          const missingStages = Array.isArray(missingStageAnalysis?.missing_stages)
                            ? (missingStageAnalysis?.missing_stages as Array<Record<string, unknown>>)
                            : []

                          const sportPayloadRecord = advisorPayload as unknown as Record<string, unknown>
                          const sportDataRecord = sportData as Record<string, unknown>

                          const directRaceId = String(
                            sportDataRecord.current_focus_race_id ??
                              sportDataRecord.race_id ??
                              sportDataRecord.next_race_id ??
                              sportDataRecord.next_future_race_id ??
                              sportPayloadRecord.current_focus_race_id ??
                              sportPayloadRecord.race_id ??
                              sportPayloadRecord.next_race_id ??
                              sportPayloadRecord.next_future_race_id ??
                              ''
                          ).trim()

                          const directRacePreparationId = String(
                            sportDataRecord.race_preparation_id ??
                              sportPayloadRecord.race_preparation_id ??
                              ''
                          ).trim()

                          const directRaceHref = directRaceId
                            ? `/dashboard/races/${directRaceId}`
                            : '/dashboard/races'

                          const directRacePreparationHref = directRaceId
                            ? `/dashboard/race-preparation?raceId=${encodeURIComponent(directRaceId)}${
                                directRacePreparationId
                                  ? `&racePreparationId=${encodeURIComponent(directRacePreparationId)}`
                                  : ''
                              }`
                            : '/dashboard/race-preparation'

                          const resolveSportDirectorActionTarget = (
                            labelValue: unknown,
                            targetValue: unknown
                          ): string => {
                            const label = String(labelValue ?? '').trim().toLowerCase()
                            const target = String(targetValue ?? '').trim()

                            if (
                              label === 'races' ||
                              label === 'race' ||
                              target === '/dashboard/races'
                            ) {
                              return directRaceHref
                            }

                            if (
                              label.includes('race preparation') ||
                              target === '/dashboard/race-preparation'
                            ) {
                              return directRacePreparationHref
                            }

                            return target
                          }

                          const sportSummaryEntries = [
                            [t('details.race'), (sportData as Record<string, unknown>).current_focus_race_name ?? (sportData as Record<string, unknown>).current_focus_race ?? (sportData as Record<string, unknown>).active_race_name ?? (sportData as Record<string, unknown>).race_name ?? (sportData as Record<string, unknown>).next_race_name],
                            [t('sportDirector.raceTiming'), (sportData as Record<string, unknown>).current_focus_race_timing ?? (sportData as Record<string, unknown>).race_urgency ?? (sportData as Record<string, unknown>).urgency],
                            [t('sportDirector.raceStart'), formatAdvisorGameDateTime((sportData as Record<string, unknown>).current_focus_race_start_date ?? (sportData as Record<string, unknown>).race_start_date ?? (sportData as Record<string, unknown>).start_date)],
                            [t('sportDirector.raceEnd'), formatAdvisorGameDateTime((sportData as Record<string, unknown>).current_focus_race_end_date ?? (sportData as Record<string, unknown>).race_end_date ?? (sportData as Record<string, unknown>).end_date)],
                            [t('sportDirector.raceLocation'), (sportData as Record<string, unknown>).race_location ?? (sportData as Record<string, unknown>).location_name ?? (sportData as Record<string, unknown>).country_name ?? (sportData as Record<string, unknown>).country_code],
                            [t('sportDirector.preparation'), (sportData as Record<string, unknown>).race_preparation_status ?? (sportData as Record<string, unknown>).preparation_status],
                            [t('sportDirector.startlist'), (sportData as Record<string, unknown>).startlist_status],
                            [t('sportDirector.deadline'), formatAdvisorGameDateTime((sportData as Record<string, unknown>).rider_submission_deadline_on ?? (sportData as Record<string, unknown>).submission_deadline ?? (sportData as Record<string, unknown>).deadline)],
                            [t('common.stage'), (sportData as Record<string, unknown>).stage_number],
                            [t('sportDirector.stageDate'), formatAdvisorGameDateTime((sportData as Record<string, unknown>).stage_date)],
                            [t('sportDirector.stageStart'), (sportData as Record<string, unknown>).stage_start_time_label ?? (sportData as Record<string, unknown>).start_time_label],
                            [t('sportDirector.programme'), (sportData as Record<string, unknown>).programme_status],
                            [t('sportDirector.futureRaces'), (sportData as Record<string, unknown>).future_accepted_races_next_30_game_days ?? (sportData as Record<string, unknown>).accepted_races_next_30_game_days],
                            [t('sportDirector.managementPriorities'), (sportData as Record<string, unknown>).management_priority_count ?? managementPriorities.length],
                            [t('sportDirector.missingStagePlans'), (sportData as Record<string, unknown>).actionable_missing_stage_plans ?? (sportData as Record<string, unknown>).missing_stage_plans],
                            [t('sportDirector.incompleteStagePlans'), (sportData as Record<string, unknown>).actionable_problem_stage_plans ?? (sportData as Record<string, unknown>).problem_stage_plans],
                            [t('sportDirector.programmeGap'), (sportData as Record<string, unknown>).programme_gap_days],
                            [t('sportDirector.nextAcceptedRace'), (sportData as Record<string, unknown>).next_future_race ?? (sportData as Record<string, unknown>).next_future_race_name],
                            [t('sportDirector.nextRaceDate'), formatAdvisorGameDateTime((sportData as Record<string, unknown>).next_future_race_start_date)],
                          ].filter(([, value]) => value !== undefined && value !== null && value !== '')

                          return (
                            <div className="ml-5 mt-4 overflow-hidden rounded-xl border border-slate-300 bg-slate-50 shadow-sm">
                              <div className="border-b border-slate-300 bg-white px-4 py-3">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-900">
                                      {item.title}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {advisorPayload.staff?.name ??
                                        advisorPayload.advisor_staff_name ??
                                        t('roles.sportsDirector')}{' '}
                                      · {t('roles.sportsDirector')}
                                    </div>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {String(advisorPayload.report_variant ?? '')
                                      .replace(/_/g, ' ')
                                      .replace(/\b\w/g, letter => letter.toUpperCase())}
                                  </div>
                                </div>
                              </div>

                              <div className="px-4 py-4">
                                <div
                                  className={`grid gap-6 ${
                                    imageSrc
                                      ? 'lg:grid-cols-[minmax(0,1fr)_340px]'
                                      : 'grid-cols-1'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm leading-6 text-slate-700">
                                      {advisorPayload.summary || item.message}
                                    </p>

                                    {sportSummaryEntries.length > 0 ? (
                                      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                                        {sportSummaryEntries.map(([label, value]) => (
                                          <div
                                            key={String(label)}
                                            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                                          >
                                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                              {label}
                                            </div>
                                            <div className="mt-1 text-lg font-semibold text-slate-900">
                                              {label === t('common.rider') ? renderAdvisorRiderIdentity({
                                                value,
                                                source: sportData as Record<string, unknown>,
                                                navigate,
                                                defaultScope: 'internal',
                                              }) : formatAdvisorDisplayValue(value)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}

                                    {managementPriorities.length > 0 ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          {t('sportDirector.managementPriorities')}
                                        </div>
                                        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                          <div className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_80px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                            <span>{t('common.priority')}</span>
                                            <span>{t('common.detail')}</span>
                                            <span>{t('common.rank')}</span>
                                          </div>
                                          {managementPriorities.map((priority, index) => (
                                            <div
                                              key={`${String(priority.code ?? priority.label ?? index)}-${index}`}
                                              className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_80px] gap-3 border-b border-slate-100 px-3 py-2.5 text-sm last:border-b-0"
                                            >
                                              <span className="font-medium text-slate-900">
                                                {formatAdvisorDisplayValue(priority.label ?? priority.code)}
                                              </span>
                                              <span className="text-slate-700">
                                                {formatAdvisorDisplayValue(priority.detail)}
                                              </span>
                                              <span className="text-slate-700">
                                                {formatAdvisorDisplayValue(priority.priority)}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}

                                    {missingStages.length > 0 ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          {t('sportDirector.missingPlans')}
                                        </div>
                                        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                          <div className="grid grid-cols-[90px_120px_90px_100px_minmax(0,1fr)] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                            <span>{t('common.stage')}</span>
                                            <span>{t('common.date')}</span>
                                            <span>{t('common.start')}</span>
                                            <span>{t('sportDirector.urgency')}</span>
                                            <span>{t('common.status')}</span>
                                          </div>
                                          {missingStages.map((stage, index) => (
                                            <div
                                              key={`${String(stage.stage_id ?? stage.stage_number ?? index)}-${index}`}
                                              className="grid grid-cols-[90px_120px_90px_100px_minmax(0,1fr)] gap-3 border-b border-slate-100 px-3 py-2.5 text-sm last:border-b-0"
                                            >
                                              <span className="font-medium text-slate-900">
                                                {t('common.stageValue', { stage: formatAdvisorValue(stage.stage_number) })}
                                              </span>
                                              <span className="text-slate-700">
                                                {formatAdvisorGameDateTime(stage.stage_date)}
                                              </span>
                                              <span className="text-slate-700">
                                                {formatAdvisorValue(stage.stage_start_time_label)}
                                              </span>
                                              <span className="text-slate-700">
                                                {formatAdvisorAvailability(stage.urgency)}
                                              </span>
                                              <span className="text-slate-700">
                                                {formatAdvisorAvailability(stage.stage_plan_status)}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}

                                    {recommendations.length > 0 ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          {t('sportDirector.recommendations')}
                                        </div>
                                        <ul className="mt-2 space-y-2">
                                          {recommendations.map((recommendation, index) => (
                                            <li
                                              key={`${String(recommendation)}-${index}`}
                                              className="flex gap-2 text-sm leading-6 text-slate-700"
                                            >
                                              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                                              <span>{String(recommendation)}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : null}
                                  </div>

                                  {imageSrc ? (
                                    <div className="flex items-start justify-center lg:justify-end">
                                      <img
                                        src={imageSrc}
                                        alt={item.title}
                                        className="w-full max-w-[340px] rounded-xl object-cover shadow-sm"
                                        draggable={false}
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              <div className="border-t border-slate-300 bg-white px-4 py-3">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  {renderAdvisorMuteButton(advisorPayload)}
                                  {(advisorActions.length > 0
                                    ? advisorActions.map((action, index) => ({
                                        key: `${action.label ?? 'action'}-${index}`,
                                        label: translateDetailActionLabel(action.label || t('details.open')),
                                        index,
                                        onClick: () => {
                                          const target = resolveSportDirectorActionTarget(
                                            action.label,
                                            action.target
                                          )
                                          if (target) navigate(target)
                                        },
                                      }))
                                    : templateActions.map(action => ({
                                        key: action.key,
                                        label: translateDetailActionLabel(action.label),
                                        index: action.variant === 'primary' ? 0 : 1,
                                        onClick: () => {
                                          if (
                                            action.label.toLowerCase() === 'races' ||
                                            action.label.toLowerCase() === 'race'
                                          ) {
                                            navigate(directRaceHref)
                                            return
                                          }

                                          if (action.label.toLowerCase().includes('race preparation')) {
                                            navigate(directRacePreparationHref)
                                            return
                                          }

                                          void handleTemplateAction(item, action)
                                        },
                                      }))).map(action => (
                                    <button
                                      key={action.key}
                                      type="button"
                                      onClick={action.onClick}
                                      className={
                                        action.index === 0
                                          ? 'rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800'
                                          : 'rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100'
                                      }
                                    >
                                      {translateDetailActionLabel(action.label)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        }

                        if (isTeamDoctorAdvisor && advisorPayload) {
                          const doctorData =
                            advisorPayload.data ?? advisorPayload.snapshot ?? {}
                          const recommendations = Array.isArray(advisorPayload.recommendations)
                            ? advisorPayload.recommendations
                            : []
                          const advisorActions = Array.isArray(advisorPayload.actions)
                            ? advisorPayload.actions
                            : []
                          const healthCases = Array.isArray(
                            advisorPayload.health_cases ??
                              (doctorData as Record<string, unknown>).health_cases
                          )
                            ? ((advisorPayload.health_cases ??
                                (doctorData as Record<string, unknown>).health_cases) as Array<Record<string, unknown>>)
                            : []

                          const singleMedicalCase =
                            (doctorData as Record<string, unknown>).rider_id ||
                            (doctorData as Record<string, unknown>).health_case_id
                              ? (doctorData as Record<string, unknown>)
                              : null

                          const displayedHealthCases =
                            healthCases.length > 0
                              ? healthCases
                              : singleMedicalCase
                                ? [singleMedicalCase]
                                : []

                          const directMedicalRiderId = String(
                            (doctorData as Record<string, unknown>).rider_id ??
                              displayedHealthCases[0]?.rider_id ??
                              ''
                          ).trim()

                          const directMedicalRiderHref = directMedicalRiderId
                            ? `/dashboard/my-riders/${directMedicalRiderId}`
                            : '/dashboard/squad'

                          const doctorSummaryEntries = [
                            [t('common.rider'), (doctorData as Record<string, unknown>).rider_name],
                            [t('doctor.medicalCase'), (doctorData as Record<string, unknown>).case_label ?? (doctorData as Record<string, unknown>).case_code ?? (doctorData as Record<string, unknown>).case_type],
                            [t('doctor.severity'), (doctorData as Record<string, unknown>).severity],
                            [t('doctor.bodyPart'), (doctorData as Record<string, unknown>).body_part],
                            [t('doctor.injuredRiders'), (doctorData as Record<string, unknown>).injured_riders],
                            [t('doctor.sickRiders'), (doctorData as Record<string, unknown>).sick_riders],
                            [t('doctor.activeCases'), (doctorData as Record<string, unknown>).active_health_cases ?? (doctorData as Record<string, unknown>).active_or_recovering_health_cases],
                            [t('doctor.baseRecoveryDays'), (doctorData as Record<string, unknown>).total_selected_base_recovery_days ?? (doctorData as Record<string, unknown>).selected_base_days],
                            [t('doctor.adjustedRecoveryDays'), (doctorData as Record<string, unknown>).total_adjusted_recovery_days ?? (doctorData as Record<string, unknown>).final_recovery_days],
                            [t('doctor.fullDaysSaved'), (doctorData as Record<string, unknown>).total_recovery_days_saved ?? (doctorData as Record<string, unknown>).recovery_days_saved],
                            [t('doctor.staffReduction'), (doctorData as Record<string, unknown>).medical_staff_reduction_pct],
                            [t('doctor.centerReduction'), (doctorData as Record<string, unknown>).infrastructure_reduction_pct],
                            [t('doctor.totalReduction'), (doctorData as Record<string, unknown>).total_reduction_pct ?? (doctorData as Record<string, unknown>).max_recovery_reduction_pct],
                            [t('doctor.expectedReturn'), formatAdvisorGameDateTime((doctorData as Record<string, unknown>).expected_full_recovery_on ?? (doctorData as Record<string, unknown>).unavailable_until)],
                          ].filter(([, value]) => value !== undefined && value !== null && value !== '')

                          return (
                            <div className="ml-5 mt-4 overflow-hidden rounded-xl border border-slate-300 bg-slate-50 shadow-sm">
                              <div className="border-b border-slate-300 bg-white px-4 py-3">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-900">
                                      {item.title}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {advisorPayload.staff?.name ??
                                        advisorPayload.advisor_staff_name ??
                                        t('roles.teamDoctor')}{' '}
                                      · {t('roles.teamDoctor')}
                                    </div>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {String(advisorPayload.report_variant ?? '')
                                      .replace(/_/g, ' ')
                                      .replace(/\b\w/g, letter => letter.toUpperCase())}
                                  </div>
                                </div>
                              </div>

                              <div className="px-4 py-4">
                                <div
                                  className={`grid gap-6 ${
                                    imageSrc
                                      ? 'lg:grid-cols-[minmax(0,1fr)_340px]'
                                      : 'grid-cols-1'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm leading-6 text-slate-700">
                                      {advisorPayload.summary || item.message}
                                    </p>

                                    {doctorSummaryEntries.length > 0 ? (
                                      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                                        {doctorSummaryEntries.map(([label, value]) => (
                                          <div
                                            key={String(label)}
                                            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                                          >
                                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                              {label}
                                            </div>
                                            <div className="mt-1 text-lg font-semibold text-slate-900">
                                              {label === 'Rider'
                                                ? renderAdvisorRiderIdentity({
                                                    value,
                                                    source: doctorData as Record<string, unknown>,
                                                    navigate,
                                                    defaultScope: 'internal',
                                                  })
                                                : formatAdvisorDisplayValue(value)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}

                                    {displayedHealthCases.length > 0 ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          {t('doctor.cases')}
                                        </div>
                                        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                          <div className="grid min-w-[1040px] grid-cols-[minmax(150px,1fr)_150px_100px_100px_90px_90px_110px_110px_130px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                            <span>{t('common.rider')}</span>
                                            <span>{t('doctor.medicalCase')}</span>
                                            <span>{t('doctor.severity')}</span>
                                            <span>{t('doctor.bodyPart')}</span>
                                            <span>{t('doctor.base')}</span>
                                            <span>{t('doctor.adjusted')}</span>
                                            <span>{t('doctor.staffEffect')}</span>
                                            <span>{t('doctor.facilityEffect')}</span>
                                            <span>{t('doctor.expectedReturn')}</span>
                                          </div>
                                          {displayedHealthCases.map((healthCase, index) => (
                                            <div
                                              key={`${String(healthCase.health_case_id ?? healthCase.rider_id ?? index)}-${index}`}
                                              className="grid min-w-[1040px] grid-cols-[minmax(150px,1fr)_150px_100px_100px_90px_90px_110px_110px_130px] gap-3 border-b border-slate-100 px-3 py-2.5 text-sm last:border-b-0"
                                            >
                                              <span className="min-w-0">
                                                {renderAdvisorRiderIdentity({
                                                  value: healthCase.rider_name,
                                                  source: healthCase as Record<string, unknown>,
                                                  navigate,
                                                  defaultScope: 'internal',
                                                })}
                                              </span>
                                              <span className="text-slate-700">
                                                {formatAdvisorDisplayValue(healthCase.case_label ?? healthCase.case_code ?? healthCase.case_type)}
                                              </span>
                                              <span className="text-slate-700">
                                                {formatAdvisorAvailability(healthCase.severity)}
                                              </span>
                                              <span className="text-slate-700">
                                                {formatAdvisorAvailability(healthCase.body_part)}
                                              </span>
                                              <span className="text-slate-700">
                                                {healthCase.selected_base_days !== undefined ? `${formatAdvisorValue(healthCase.selected_base_days)} d` : '—'}
                                              </span>
                                              <span className="text-slate-700">
                                                {healthCase.final_recovery_days !== undefined ? `${formatAdvisorValue(healthCase.final_recovery_days)} d` : '—'}
                                              </span>
                                              <span className="text-slate-700">
                                                {healthCase.medical_staff_reduction_pct !== undefined ? `${formatAdvisorValue(healthCase.medical_staff_reduction_pct)}%` : '—'}
                                              </span>
                                              <span className="text-slate-700">
                                                {healthCase.infrastructure_reduction_pct !== undefined ? `${formatAdvisorValue(healthCase.infrastructure_reduction_pct)}%` : '—'}
                                              </span>
                                              <span className="text-slate-700">
                                                {formatAdvisorGameDateTime(healthCase.expected_full_recovery_on ?? healthCase.unavailable_until)}
                                              </span>
                                            </div>
                                          ))}
                                        </div>

                                        {displayedHealthCases.map((healthCase, index) =>
                                          healthCase.treatment_impact ? (
                                            <div
                                              key={`treatment-impact-${index}`}
                                              className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700"
                                            >
                                              <span className="font-medium text-slate-900">
                                                {renderAdvisorRiderIdentity({
                                                  value: healthCase.rider_name,
                                                  source: healthCase as Record<string, unknown>,
                                                  navigate,
                                                  defaultScope: 'internal',
                                                })}
                                                :
                                              </span>{' '}
                                              {formatAdvisorValue(healthCase.treatment_impact)}
                                            </div>
                                          ) : null
                                        )}
                                      </div>
                                    ) : null}

                                    {recommendations.length > 0 ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          {t('doctor.recommendations')}
                                        </div>
                                        <ul className="mt-2 space-y-2">
                                          {recommendations.map((recommendation, index) => (
                                            <li
                                              key={`${String(recommendation)}-${index}`}
                                              className="flex gap-2 text-sm leading-6 text-slate-700"
                                            >
                                              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                                              <span>{String(recommendation)}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : null}
                                  </div>

                                  {imageSrc ? (
                                    <div className="flex items-start justify-center lg:justify-end">
                                      <img
                                        src={imageSrc}
                                        alt={item.title}
                                        className="w-full max-w-[340px] rounded-xl object-cover shadow-sm"
                                        draggable={false}
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              <div className="border-t border-slate-300 bg-white px-4 py-3">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  {renderAdvisorMuteButton(advisorPayload)}
                                  {(advisorActions.length > 0
                                    ? advisorActions.map((action, index) => ({
                                        key: `${action.label ?? 'action'}-${index}`,
                                        label: translateDetailActionLabel(action.label || t('details.open')),
                                        index,
                                        onClick: () => {
                                          const label = String(action.label ?? '').trim().toLowerCase()
                                          const target = String(action.target ?? '').trim()

                                          if (
                                            directMedicalRiderId &&
                                            (label === 'open squad' || label === 'squad' || target === '/dashboard/squad')
                                          ) {
                                            navigate(directMedicalRiderHref)
                                            return
                                          }

                                          if (target) navigate(target)
                                        },
                                      }))
                                    : templateActions.map(action => ({
                                        key: action.key,
                                        label: translateDetailActionLabel(action.label),
                                        index: action.variant === 'primary' ? 0 : 1,
                                        onClick: () => {
                                          void handleTemplateAction(item, action)
                                        },
                                      }))).map(action => (
                                    <button
                                      key={action.key}
                                      type="button"
                                      onClick={action.onClick}
                                      className={
                                        action.index === 0
                                          ? 'rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800'
                                          : 'rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100'
                                      }
                                    >
                                      {translateDetailActionLabel(action.label)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        }


                        if (isMechanicAdvisor && advisorPayload) {
                          const mechanicData = advisorPayload.data ?? advisorPayload.snapshot ?? {}
                          const recommendations = Array.isArray(advisorPayload.recommendations)
                            ? advisorPayload.recommendations
                            : []
                          const advisorActions = Array.isArray(advisorPayload.actions)
                            ? advisorPayload.actions
                            : []

                          const attentionRaw =
                            advisorPayload.equipment_needing_attention ??
                            mechanicData.equipment_needing_attention
                          const equipmentNeedingAttention = Array.isArray(attentionRaw)
                            ? (attentionRaw as Array<Record<string, unknown>>)
                            : []

                          const categoriesRaw =
                            advisorPayload.equipment_categories ?? mechanicData.equipment_categories
                          const equipmentCategories = Array.isArray(categoriesRaw)
                            ? (categoriesRaw as Array<Record<string, unknown>>)
                            : []

                          const suppliesRaw =
                            advisorPayload.race_supplies ?? mechanicData.race_supplies
                          const raceSupplies = Array.isArray(suppliesRaw)
                            ? (suppliesRaw as Array<Record<string, unknown>>)
                            : []

                          const mechanicSummaryEntries: Array<[string, unknown, string?]> = [
                            [t('mechanic.equipmentItems'), mechanicData.total_items],
                            [t('mechanic.readyItems'), mechanicData.ready_items],
                            [t('mechanic.averageCondition'), mechanicData.average_condition_percent, '%'],
                            [t('mechanic.needsAttention'), mechanicData.maintenance_needed ?? mechanicData.equipment_needing_attention_count],
                            [t('mechanic.criticalItems'), mechanicData.critical_items],
                            [t('mechanic.pendingMaintenance'), mechanicData.pending_maintenance_jobs],
                            [t('mechanic.emptySupplies'), mechanicData.empty_supply_types],
                            [t('mechanic.lowSupplies'), mechanicData.low_supply_types],
                          ].filter(([, value]) => value !== undefined && value !== null && value !== '')

                          return (
                            <div className="ml-5 mt-4 overflow-hidden rounded-xl border border-slate-300 bg-slate-50 shadow-sm">
                              <div className="border-b border-slate-300 bg-white px-4 py-3">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {advisorPayload.staff?.name ?? advisorPayload.advisor_staff_name ?? t('roles.chiefMechanic')} · {t('roles.chiefMechanic')}
                                    </div>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {t(`reportVariants.${String(advisorPayload.report_variant ?? '')}`, { defaultValue: formatAdvisorDisplayText(advisorPayload.report_variant) })}
                                  </div>
                                </div>
                              </div>

                              <div className="px-4 py-4">
                                <div className={`grid gap-6 ${imageSrc ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1'}`}>
                                  <div className="min-w-0">
                                    <p className="text-sm leading-6 text-slate-700">
                                      {advisorPayload.summary || item.message}
                                    </p>

                                    {mechanicSummaryEntries.length > 0 ? (
                                      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                                        {mechanicSummaryEntries.map(([label, value, suffix]) => (
                                          <div key={label} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
                                            <div className="mt-1 text-lg font-semibold text-slate-900">
                                              {formatAdvisorValue(value)}{suffix ?? ''}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}

                                    {equipmentNeedingAttention.length > 0 ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('mechanic.attentionTitle')}</div>
                                        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                          <div className="min-w-[860px]">
                                            <div className="grid grid-cols-[minmax(180px,1fr)_130px_110px_120px_110px_120px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                              <span>{t('mechanic.equipment')}</span><span>{t('mechanic.category')}</span><span>{t('mechanic.condition')}</span><span>{t('common.status')}</span><span>{t('common.priority')}</span><span>{t('mechanic.lastUsed')}</span>
                                            </div>
                                            {equipmentNeedingAttention.map((equipment, index) => (
                                              <div key={`${String(equipment.equipment_id ?? index)}-${index}`} className="grid grid-cols-[minmax(180px,1fr)_130px_110px_120px_110px_120px] gap-3 border-b border-slate-100 px-3 py-2.5 text-sm last:border-b-0">
                                                <span className="font-medium text-slate-900">{formatAdvisorDisplayText(equipment.display_name)}</span>
                                                <span className="text-slate-700">{formatAdvisorDisplayText(equipment.category_label ?? equipment.equipment_category)}</span>
                                                <span className="text-slate-700">{formatAdvisorValue(equipment.condition_percent)}%</span>
                                                <span className="text-slate-700">{formatAdvisorDisplayText(equipment.status_label ?? equipment.status)}</span>
                                                <span className="text-slate-700">{formatAdvisorDisplayText(equipment.priority)}</span>
                                                <span className="text-slate-700">{formatAdvisorGameDateTime(equipment.last_used_game_date)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    ) : null}

                                    {equipmentCategories.length > 0 ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('mechanic.equipmentCategories')}</div>
                                        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                          <div className="grid grid-cols-[minmax(0,1fr)_100px_100px_110px_120px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                            <span>{t('mechanic.category')}</span><span>{t('mechanic.owned')}</span><span>{t('mechanic.ready')}</span><span>{t('mechanic.attention')}</span><span>{t('mechanic.avgCondition')}</span>
                                          </div>
                                          {equipmentCategories.map((category, index) => (
                                            <div key={`${String(category.equipment_category ?? index)}-${index}`} className="grid grid-cols-[minmax(0,1fr)_100px_100px_110px_120px] gap-3 border-b border-slate-100 px-3 py-2.5 text-sm last:border-b-0">
                                              <span className="font-medium text-slate-900">{formatAdvisorDisplayText(category.display_name ?? category.equipment_category)}</span>
                                              <span>{formatAdvisorValue(category.owned_count)}</span>
                                              <span>{formatAdvisorValue(category.ready_count)}</span>
                                              <span>{formatAdvisorValue(category.attention_count)}</span>
                                              <span>{formatAdvisorValue(category.average_condition_percent)}%</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}

                                    {raceSupplies.length > 0 ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('mechanic.raceSupplies')}</div>
                                        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                          <div className="grid grid-cols-[minmax(0,1fr)_100px_100px_100px_120px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                            <span>{t('mechanic.supply')}</span><span>{t('mechanic.available')}</span><span>{t('mechanic.threshold')}</span><span>{t('common.status')}</span><span>{t('mechanic.lastUsed')}</span>
                                          </div>
                                          {raceSupplies.map((supply, index) => (
                                            <div key={`${String(supply.supply_key ?? index)}-${index}`} className="grid grid-cols-[minmax(0,1fr)_100px_100px_100px_120px] gap-3 border-b border-slate-100 px-3 py-2.5 text-sm last:border-b-0">
                                              <span className="font-medium text-slate-900">{formatAdvisorDisplayText(supply.display_name ?? supply.supply_key)}</span>
                                              <span>{formatAdvisorValue(supply.quantity_available)}</span>
                                              <span>{formatAdvisorValue(supply.warning_threshold)}</span>
                                              <span>{formatAdvisorDisplayText(supply.stock_status_label ?? supply.stock_status)}</span>
                                              <span>{formatAdvisorGameDateTime(supply.last_used_game_date)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}

                                    {recommendations.length > 0 ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('mechanic.recommendations')}</div>
                                        <ul className="mt-2 space-y-2">
                                          {recommendations.map((recommendation, index) => (
                                            <li key={`${String(recommendation)}-${index}`} className="flex gap-2 text-sm leading-6 text-slate-700">
                                              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                                              <span>{String(recommendation)}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : null}
                                  </div>

                                  {imageSrc ? (
                                    <div className="flex items-start justify-center lg:justify-end">
                                      <img src={imageSrc} alt={item.title} className="w-full max-w-[340px] rounded-xl object-cover shadow-sm" draggable={false} />
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              <div className="border-t border-slate-300 bg-white px-4 py-3">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  {renderAdvisorMuteButton(advisorPayload)}
                                  {(advisorActions.length > 0 ? advisorActions.map((action, index) => ({
                                    key: `${action.label ?? 'action'}-${index}`,
                                    label: translateDetailActionLabel(action.label || t('details.open')),
                                    index,
                                    onClick: () => { const target = String(action.target ?? '').trim(); if (target) navigate(target) },
                                  })) : templateActions.map(action => ({
                                    key: action.key,
                                    label: translateDetailActionLabel(action.label),
                                    index: action.variant === 'primary' ? 0 : 1,
                                    onClick: () => { void handleTemplateAction(item, action) },
                                  }))).map(action => (
                                    <button key={action.key} type="button" onClick={action.onClick} className={action.index === 0 ? 'rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800' : 'rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100'}>
                                      {translateDetailActionLabel(action.label)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        }


                        if (isScoutAdvisor && advisorPayload) {
                          const scoutData = advisorPayload.data ?? advisorPayload.snapshot ?? {}

                          const recommendations = Array.isArray(advisorPayload.recommendations)
                            ? advisorPayload.recommendations
                            : []

                          const advisorActions = Array.isArray(advisorPayload.actions)
                            ? advisorPayload.actions
                            : []

                          const recentReports = Array.isArray(scoutData.recent_known_reports)
                            ? (scoutData.recent_known_reports as Array<Record<string, unknown>>)
                            : []

                          const activeTasks = Array.isArray(scoutData.active_tasks)
                            ? (scoutData.active_tasks as Array<Record<string, unknown>>)
                            : []

                          const isPriorityProspect =
                            advisorPayload.report_variant === 'priority_prospect'

                          const scoutSummaryEntries: Array<[string, unknown]> = isPriorityProspect
                            ? [
                                [t('common.rider'), getAdvisorRiderDisplayName(scoutData.rider_name as unknown, scoutData as Record<string, unknown>)],
                                [t('common.country'), scoutData.rider_country_code ?? scoutData.country_code],
                                [t('scout.overall'), scoutData.overall_exact ?? scoutData.overall_label],
                                [t('scout.potential'), scoutData.potential_label],
                                [t('scout.potentialScore'), scoutData.potential_exact],
                                [t('scout.precision'), scoutData.precision_score],
                                [t('scout.precisionTier'), scoutData.precision_tier],
                                [t('scout.reviewStatus'), scoutData.review_status],
                              ].filter(([, value]) => value !== undefined && value !== null && value !== '')
                            : [
                                [t('scout.completedReports'), scoutData.completed_reports],
                                [t('scout.reports7Days'), scoutData.reports_last_7_real_days],
                                [t('scout.highElite'), scoutData.high_or_elite_potential_reports],
                                [t('scout.activeAssignments'), scoutData.active_scouting_tasks],
                              ].filter(([, value]) => value !== undefined && value !== null && value !== '')

                          const priorityStrengths = Array.isArray(scoutData.strengths)
                            ? scoutData.strengths
                            : []

                          return (
                            <div className="ml-5 mt-4 overflow-hidden rounded-xl border border-slate-300 bg-slate-50 shadow-sm">
                              <div className="border-b border-slate-300 bg-white px-4 py-3">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-900">
                                      {item.title}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {advisorPayload.staff?.name ??
                                        advisorPayload.advisor_staff_name ??
                                        t('roles.scout')}{' '}
                                      · {t('roles.scout')}
                                    </div>
                                  </div>

                                  <div className="text-xs text-slate-500">
                                    {t(`reportVariants.${String(advisorPayload.report_variant ?? '')}`, {
                                      defaultValue: formatAdvisorDisplayText(advisorPayload.report_variant),
                                    })}
                                  </div>
                                </div>
                              </div>

                              <div className="px-4 py-4">
                                <div
                                  className={`grid gap-6 ${
                                    imageSrc
                                      ? 'lg:grid-cols-[minmax(0,1fr)_340px]'
                                      : 'grid-cols-1'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm leading-6 text-slate-700">
                                      {advisorPayload.summary || item.message}
                                    </p>

                                    {scoutSummaryEntries.length > 0 ? (
                                      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                                        {scoutSummaryEntries.map(([label, value]) => (
                                          <div
                                            key={label}
                                            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                                          >
                                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                              {label}
                                            </div>
                                            <div className="mt-1 text-lg font-semibold text-slate-900">
                                              {label === t('common.rider') ? renderAdvisorRiderIdentity({
                                                value,
                                                source: scoutData as Record<string, unknown>,
                                                navigate,
                                                defaultScope: 'external',
                                              }) : label === t('common.country') && getAdvisorCountryFlagUrl(value) ? (
                                                <img
                                                  src={getAdvisorCountryFlagUrl(value) ?? undefined}
                                                  alt={String(value ?? t('common.country'))}
                                                  title={String(value ?? '')}
                                                  className="h-[18px] w-6 rounded-[2px] object-cover ring-1 ring-slate-200"
                                                  loading="lazy"
                                                />
                                              ) : (
                                                formatAdvisorDisplayText(value)
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}

                                    {isPriorityProspect && priorityStrengths.length > 0 ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          {t('scout.reportedStrengths')}
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {priorityStrengths.map((strength, index) => (
                                            <span
                                              key={`${String(strength)}-${index}`}
                                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-800"
                                            >
                                              {formatAdvisorDisplayText(strength)}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}

                                    {isPriorityProspect && scoutData.notes ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          {t('scout.notes')}
                                        </div>
                                        <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-700">
                                          {String(scoutData.notes)}
                                        </div>
                                      </div>
                                    ) : null}

                                    {!isPriorityProspect && recentReports.length > 0 ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          {t('scout.recentIntelligence')}
                                        </div>

                                        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                          <div className="min-w-[1040px]">
                                            <div className="grid grid-cols-[minmax(130px,1fr)_80px_90px_110px_100px_100px_140px_minmax(180px,1fr)] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                              <span>{t('common.rider')}</span>
                                              <span>{t('common.country')}</span>
                                              <span>{t('scout.overall')}</span>
                                              <span>{t('scout.potential')}</span>
                                              <span>{t('scout.precision')}</span>
                                              <span>{t('common.status')}</span>
                                              <span>{t('scout.completed')}</span>
                                              <span>{t('scout.strengths')}</span>
                                            </div>

                                            {recentReports.map((report, index) => {
                                              const strengths = Array.isArray(report.strengths)
                                                ? report.strengths
                                                : []

                                              const riderId = String(report.rider_id ?? '').trim()
                                              const riderPath =
                                                String(report.rider_profile_path ?? '').trim() ||
                                                (riderId
                                                  ? `/dashboard/external-riders/${riderId}`
                                                  : '')

                                              return (
                                                <button
                                                  key={`${String(report.report_id ?? riderId ?? index)}-${index}`}
                                                  type="button"
                                                  disabled={!riderPath}
                                                  onClick={() => {
                                                    if (riderPath) navigate(riderPath)
                                                  }}
                                                  className="grid w-full grid-cols-[minmax(130px,1fr)_80px_90px_110px_100px_100px_140px_minmax(180px,1fr)] gap-3 border-b border-slate-100 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-white"
                                                >
                                                  <span className="min-w-0">
                                                    {renderAdvisorRiderIdentity({
                                                      value: report.rider_name,
                                                      source: report as Record<string, unknown>,
                                                      navigate,
                                                      defaultScope: 'external',
                                                    })}
                                                  </span>
                                                  <span className="flex items-center text-slate-700">
                                                    {getAdvisorCountryFlagUrl(report.rider_country_code ?? report.country_code) ? (
                                                      <img
                                                        src={getAdvisorCountryFlagUrl(report.rider_country_code ?? report.country_code) ?? undefined}
                                                        alt={String(report.rider_country_code ?? report.country_code ?? '')}
                                                        title={String(report.rider_country_code ?? report.country_code ?? '')}
                                                        className="h-[18px] w-6 rounded-[2px] object-cover ring-1 ring-slate-200"
                                                        loading="lazy"
                                                      />
                                                    ) : (
                                                      '—'
                                                    )}
                                                  </span>
                                                  <span className="text-slate-700">
                                                    {formatAdvisorDisplayText(
                                                      report.overall_exact ?? report.overall_label
                                                    )}
                                                  </span>
                                                  <span className="text-slate-700">
                                                    {formatAdvisorDisplayText(report.potential_label)}
                                                    {report.potential_exact !== undefined &&
                                                    report.potential_exact !== null
                                                      ? ` · ${formatAdvisorValue(report.potential_exact)}`
                                                      : ''}
                                                  </span>
                                                  <span className="text-slate-700">
                                                    {formatAdvisorValue(report.precision_score)}
                                                  </span>
                                                  <span className="text-slate-700">
                                                    {formatAdvisorDisplayText(report.review_status)}
                                                  </span>
                                                  <span className="text-slate-700">
                                                    {formatAdvisorGameDateTime(
                                                      report.completed_game_at ??
                                                        report.scouted_on_game_date
                                                    )}
                                                  </span>
                                                  <span className="text-slate-700">
                                                    {strengths.length > 0
                                                      ? strengths
                                                          .map(value =>
                                                            formatAdvisorDisplayText(value)
                                                          )
                                                          .join(', ')
                                                      : '—'}
                                                  </span>
                                                </button>
                                              )
                                            })}
                                          </div>
                                        </div>
                                      </div>
                                    ) : null}

                                    {!isPriorityProspect && activeTasks.length > 0 ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          {t('scout.activeScouting')}
                                        </div>

                                        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                          <div className="min-w-[780px]">
                                            <div className="grid grid-cols-[minmax(140px,1fr)_90px_110px_100px_140px_100px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                              <span>{t('common.rider')}</span>
                                              <span>{t('common.country')}</span>
                                              <span>{t('common.status')}</span>
                                              <span>{t('scout.precision')}</span>
                                              <span>{t('scout.completes')}</span>
                                              <span>{t('scout.paid')}</span>
                                            </div>

                                            {activeTasks.map((task, index) => (
                                              <div
                                                key={`${String(task.task_id ?? task.rider_id ?? index)}-${index}`}
                                                className="grid grid-cols-[minmax(140px,1fr)_90px_110px_100px_140px_100px] gap-3 border-b border-slate-100 px-3 py-2.5 text-sm last:border-b-0"
                                              >
                                                <span className="min-w-0">
                                                  {renderAdvisorRiderIdentity({
                                                    value: task.rider_name,
                                                    source: task as Record<string, unknown>,
                                                    navigate,
                                                    defaultScope: 'external',
                                                  })}
                                                </span>
                                                <span className="flex items-center">
                                                  {getAdvisorCountryFlagUrl(task.rider_country_code ?? task.country_code) ? (
                                                    <img
                                                      src={getAdvisorCountryFlagUrl(task.rider_country_code ?? task.country_code) ?? undefined}
                                                      alt={String(task.rider_country_code ?? task.country_code ?? '')}
                                                      title={String(task.rider_country_code ?? task.country_code ?? '')}
                                                      className="h-[18px] w-6 rounded-[2px] object-cover ring-1 ring-slate-200"
                                                      loading="lazy"
                                                    />
                                                  ) : (
                                                    '—'
                                                  )}
                                                </span>
                                                <span>{formatAdvisorDisplayText(task.status)}</span>
                                                <span>{formatAdvisorValue(task.precision_score)}</span>
                                                <span>{formatAdvisorGameDateTime(task.completes_at_game_ts)}</span>
                                                <span>
                                                  {task.is_paid === true
                                                    ? `${t('common.yes')}${task.coin_cost ? ` · ${t('common.coins', { count: Number(task.coin_cost) })}` : ''}`
                                                    : t('common.no')}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    ) : null}

                                    {recommendations.length > 0 ? (
                                      <div className="mt-5">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          {t('scout.recommendations')}
                                        </div>
                                        <ul className="mt-2 space-y-2">
                                          {recommendations.map((recommendation, index) => (
                                            <li
                                              key={`${String(recommendation)}-${index}`}
                                              className="flex gap-2 text-sm leading-6 text-slate-700"
                                            >
                                              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                                              <span>{String(recommendation)}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : null}
                                  </div>

                                  {imageSrc ? (
                                    <div className="flex items-start justify-center lg:justify-end">
                                      <img
                                        src={imageSrc}
                                        alt={item.title}
                                        className="w-full max-w-[340px] rounded-xl object-cover shadow-sm"
                                        draggable={false}
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              <div className="border-t border-slate-300 bg-white px-4 py-3">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  {renderAdvisorMuteButton(advisorPayload)}
                                  {isPriorityProspect && scoutData.rider_profile_path ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        navigate(String(scoutData.rider_profile_path))
                                      }
                                      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                                    >
                                      {t('details.openRider')}
                                    </button>
                                  ) : null}

                                  {(advisorActions.length > 0
                                    ? advisorActions.map((action, index) => ({
                                        key: `${action.label ?? 'action'}-${index}`,
                                        label: translateDetailActionLabel(action.label || t('details.open')),
                                        index:
                                          isPriorityProspect || index > 0
                                            ? index + 1
                                            : index,
                                        onClick: () => {
                                          const target = String(action.target ?? '').trim()
                                          if (target) navigate(target)
                                        },
                                      }))
                                    : templateActions.map(action => ({
                                        key: action.key,
                                        label: translateDetailActionLabel(action.label),
                                        index:
                                          action.variant === 'primary' &&
                                          !isPriorityProspect
                                            ? 0
                                            : 1,
                                        onClick: () => {
                                          void handleTemplateAction(item, action)
                                        },
                                      }))).map(action => (
                                    <button
                                      key={action.key}
                                      type="button"
                                      onClick={action.onClick}
                                      className={
                                        action.index === 0
                                          ? 'rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800'
                                          : 'rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100'
                                      }
                                    >
                                      {translateDetailActionLabel(action.label)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        }


                        return (
                          <div className="ml-5 mt-4 overflow-hidden rounded-xl border border-slate-300 bg-slate-50 shadow-sm">
                            <div className="border-b border-slate-300 bg-white px-4 py-3">
                              <div className="text-sm font-semibold text-slate-900">
                                {item.title}
                              </div>
                            </div>

                            <div className="px-4 py-4">
                              <div
                                className={`grid gap-6 ${
                                  imageSrc
                                    ? 'lg:grid-cols-[minmax(0,1fr)_340px]'
                                    : 'grid-cols-1'
                                }`}
                              >
                                <div className="min-w-0">
                                  {introText ? (
                                    <p
                                      className={
                                        isSeasonStartNotice
                                          ? 'rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm leading-6 text-slate-700'
                                          : 'text-sm leading-6 text-slate-700'
                                      }
                                    >
                                      {introText}
                                    </p>
                                  ) : null}

                                  {detailRows.length > 0 ? (
                                    <div
                                      className={
                                        isSeasonStartNotice
                                          ? 'mt-4 grid gap-3 sm:grid-cols-2'
                                          : 'mt-4 space-y-2'
                                      }
                                    >
                                      {detailRows.map((row, index) => (
                                        <div
                                          key={`${item.user_notification_id}-${row.label}-${index}`}
                                          className={
                                            isSeasonStartNotice
                                              ? 'rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm'
                                              : 'text-sm leading-6 text-slate-700'
                                          }
                                        >
                                          {isSeasonStartNotice ? (
                                            <>
                                              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                                {row.label}
                                              </div>
                                              <div className="mt-1 text-sm font-semibold leading-5 text-slate-900">
                                                {row.value}
                                              </div>
                                            </>
                                          ) : (
                                            <>
                                              <span className="text-slate-600">{row.label}: </span>
                                              {String(row.label).trim().toLowerCase() === 'rider' ? (
                                                renderAdvisorRiderIdentity({
                                                  value: row.value,
                                                  source: getNotificationPayloadRecord(item),
                                                  navigate,
                                                  defaultScope:
                                                    getNotificationRiderDefaultScope(item),
                                                  showFlag: true,
                                                  textClassName:
                                                    'font-semibold text-slate-900',
                                                })
                                              ) : (
                                                <strong className="font-semibold text-slate-900">
                                                  {row.value}
                                                </strong>
                                              )}
                                            </>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}

                                  {extraText ? (
                                    <p
                                      className={
                                        isSeasonStartNotice
                                          ? 'mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900'
                                          : 'mt-4 text-sm leading-6 text-slate-600'
                                      }
                                    >
                                      {extraText}
                                    </p>
                                  ) : null}
                                </div>

                                {imageSrc ? (
                                  <div className="flex items-start justify-center lg:justify-end">
                                    <img
                                      src={imageSrc}
                                      alt={item.title}
                                      className="w-full max-w-[340px] rounded-xl object-cover shadow-sm"
                                      draggable={false}
                                    />
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="border-t border-slate-300 bg-white px-4 py-3">
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                {templateActions.map(action => (
                                  <button
                                    key={action.key}
                                    type="button"
                                    onClick={() => {
                                      void handleTemplateAction(item, action)
                                    }}
                                    className={
                                      action.variant === 'primary'
                                        ? 'rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800'
                                        : 'rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100'
                                    }
                                  >
                                    {translateDetailActionLabel(action.label)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500">
              {t('summary.page', { page: safeActivePage, total: totalPages })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!canGoPrevious) return
                  const retainedId =
                    retainedReadUnreadItemRef.current?.user_notification_id ?? null
                  if (retainedId !== null) {
                    setUnreadItems(prev =>
                      prev.filter(n => n.user_notification_id !== retainedId)
                    )
                  }
                  retainedReadUnreadItemRef.current = null
                  setRetainedReadUnreadId(null)
                  setExpandedId(null)
                  setPageByTab(prev => ({
                    ...prev,
                    [activeTab]: 1,
                  }))
                }}
                disabled={!canGoPrevious}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('details.first')}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!canGoPrevious) return
                  const retainedId =
                    retainedReadUnreadItemRef.current?.user_notification_id ?? null
                  if (retainedId !== null) {
                    setUnreadItems(prev =>
                      prev.filter(n => n.user_notification_id !== retainedId)
                    )
                  }
                  retainedReadUnreadItemRef.current = null
                  setRetainedReadUnreadId(null)
                  setExpandedId(null)
                  setPageByTab(prev => ({
                    ...prev,
                    [activeTab]: Math.max(1, prev[activeTab] - 1),
                  }))
                }}
                disabled={!canGoPrevious}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('details.previous')}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!canGoNext) return
                  const retainedId =
                    retainedReadUnreadItemRef.current?.user_notification_id ?? null
                  if (retainedId !== null) {
                    setUnreadItems(prev =>
                      prev.filter(n => n.user_notification_id !== retainedId)
                    )
                  }
                  retainedReadUnreadItemRef.current = null
                  setRetainedReadUnreadId(null)
                  setExpandedId(null)
                  setPageByTab(prev => ({
                    ...prev,
                    [activeTab]: Math.min(totalPages, prev[activeTab] + 1),
                  }))
                }}
                disabled={!canGoNext}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('details.next')}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!canGoNext) return
                  const retainedId =
                    retainedReadUnreadItemRef.current?.user_notification_id ?? null
                  if (retainedId !== null) {
                    setUnreadItems(prev =>
                      prev.filter(n => n.user_notification_id !== retainedId)
                    )
                  }
                  retainedReadUnreadItemRef.current = null
                  setRetainedReadUnreadId(null)
                  setExpandedId(null)
                  setPageByTab(prev => ({
                    ...prev,
                    [activeTab]: totalPages,
                  }))
                }}
                disabled={!canGoNext}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('details.last')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
