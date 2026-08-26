/**
 * SponsorsTab.tsx
 * Updated sponsor dashboard UI with:
 * - Main / technical logos shown when real logo_url exists
 * - Broken logos gracefully fall back to initials
 * - Secondary sponsors intentionally shown without logos and without country
 * - Contract coverage simplified to "Until end of Season X"
 * - Optional sponsor descriptions from metadata
 * - Main offer preview goals shown in modal
 * - Main sponsor hero uses one single large logo area with less empty space
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { supabase } from './supabase'

type SponsorKind = 'main' | 'secondary' | 'technical'
type FinanceT = TFunction<'finance'>

type SignedSponsor = {
  id: string
  company_id: string | null
  name: string
  sponsor_kind: SponsorKind
  slot_no: number | null
  status: string
  country_code: string | null
  logo_url: string | null
  season_number: number
  started_at: string | null
  ends_at: string | null
  signed_game_month: number
  coverage_months: number
  proration_factor: number | string
  full_season_guaranteed_amount: number | string
  full_season_bonus_pool_amount: number | string
  guaranteed_amount: number | string
  bonus_pool_amount: number | string
  monthly_amount: number | string
  technical_discount_pct: number | string | null
  metadata?: Record<string, unknown> | null
}

type SponsorOffer = {
  id: string
  company_id: string
  company_name: string
  company_country_code: string | null
  logo_url: string | null
  sponsor_kind: SponsorKind
  slot_no: number | null
  status: string
  season_number: number
  generated_game_month: number
  coverage_months: number
  proration_factor: number | string
  full_season_guaranteed_amount: number | string
  full_season_bonus_pool_amount: number | string
  guaranteed_amount: number | string
  bonus_pool_amount: number | string
  monthly_amount: number | string
  technical_discount_pct: number | string | null
  expires_at: string | null
  metadata?: Record<string, unknown> | null
}

type SponsorObjective = {
  id: string
  club_sponsor_id: string
  objective_code: string
  title: string
  reward_amount: number | string
  target_value: number
  current_value: number
  country_code: string | null
  status: string
  metadata?: Record<string, unknown> | null
}

type SponsorObjectiveUiRow = {
  club_id: string
  club_sponsor_id: string
  sponsor_name: string
  sponsor_kind: string
  sponsor_status: string
  main_sponsor_deal_type: string
  season_number: number | null

  objective_id: string
  objective_code: string
  objective_title: string
  reward_amount: number
  target_value: number
  current_value: number

  objective_status: string
  check_state: string
  objective_result_state: string
  objective_target_mode: string
  evaluation_mode: string
  progress_source: string | null

  target_race_id: string | null
  target_race_name: string | null
  target_race_country: string | null
  target_race_category: string | null
  target_race_type: string | null
  target_race_start_date: string | null
  target_race_end_date: string | null
  target_check_game_date: string | null

  eligible_from_game_date: string | null
  eligible_to_game_date: string | null
  eligible_country_code: string | null

  required_result: string
  user_visible_deadline_label: string

  checked_at: string | null
  failed_reason: string | null
  payout_transaction_id: string | null
  payout_status: string
  paid_amount: number | null

  display_status_label: string
  display_status_variant: 'success' | 'danger' | 'warning' | 'info' | 'muted' | string
  progress_text: string
  target_text: string
  result_text: string

  // Optional fields returned by newer objective-status RPCs.
  race_application_status?: string | null
  race_application_status_label?: string | null
  race_entry_status?: string | null
  race_status?: string | null
  race_status_label?: string | null

  metadata: Record<string, unknown>
}

type SponsorDashboard = {
  club_id: string
  season_number: number
  game_month: number
  needs_main_sponsor: boolean
  needs_technical_sponsor: boolean
  secondary_slots_used: number
  secondary_slots_total: number
  signed_sponsors: SignedSponsor[]
  offers: SponsorOffer[]
  objectives: SponsorObjective[]
}

type SignResult = {
  signed_sponsor_id: string
  payment_transaction_id: string | null
  accepted_offer_id: string
  signed_kind: SponsorKind
  assigned_slot_no: number | null
  created_objectives: number
}

type TechnicalSponsorBenefitPackage = {
  contract_value_cash: number | string
  cash_support_cash: number | string
  equipment_support_budget_cash: number | string
  raw_equipment_budget_cash?: number | string
  estimated_useful_equipment_budget_cash?: number | string
  category_count: number
  category_discounts_json: Record<string, number | string>
  notes?: string[]
}

type ActiveTechnicalSponsorSupport = {
  has_active_support: boolean
  benefit_id?: string
  club_sponsor_id?: string
  sponsor_company_id?: string
  sponsor_name?: string
  sponsor_logo_url?: string | null
  contract_value_cash?: number | string
  cash_support_cash?: number | string
  equipment_support_budget_cash?: number | string
  equipment_support_used_cash?: number | string
  equipment_support_remaining_cash?: number | string
  equipment_support_used_pct?: number | string
  category_discounts_json?: Record<string, number | string>
  starts_game_date?: string | null
  expires_game_date?: string | null
  status?: string
  notes?: string[]
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatMoney(n: number, currency: 'USD' | 'EUR' = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

function formatCashAmount(value: number | null | undefined): string {
  return `${new Intl.NumberFormat('en-US').format(value ?? 0)} cash`
}

function sponsorObjectiveBadgeClass(variant: string): string {
  switch (variant) {
    case 'success':
      return 'border-green-300 bg-green-50 text-green-800'
    case 'danger':
      return 'border-red-300 bg-red-50 text-red-700'
    case 'warning':
      return 'border-amber-300 bg-amber-50 text-amber-800'
    case 'info':
      return 'border-blue-300 bg-blue-50 text-blue-800'
    case 'muted':
    default:
      return 'border-gray-300 bg-gray-50 text-gray-600'
  }
}

function sponsorObjectiveRequiredResultLabel(value: string, t: FinanceT): string {
  switch (value) {
    case 'race_podium':
      return t('sponsors.racePodium')
    case 'race_win':
      return t('sponsors.raceWin')
    case 'race_top_5':
      return t('sponsors.raceTop5')
    case 'race_top_10':
      return t('sponsors.raceTop10')
    case 'gc_top_10':
      return t('sponsors.gcTop10')
    case 'gc_top_5':
      return t('sponsors.gcTop5')
    case 'stage_top_5':
      return t('sponsors.stageTop5')
    case 'stage_win':
      return t('sponsors.stageWin')
    case 'race_start':
      return t('sponsors.raceStart')
    case 'classification_visibility':
      return t('sponsors.classificationVisibility')
    default:
      return value || t('sponsors.objective')
  }
}

type SponsorObjectiveDisplayStatus = 'paid' | 'achieved' | 'missed' | 'checked' | 'scheduled'

function sponsorObjectiveDisplayStatus(
  objective: SponsorObjectiveUiRow
): SponsorObjectiveDisplayStatus | null {
  const normalizedResult = String(objective.objective_result_state || '').toLowerCase()
  const normalizedCheck = String(objective.check_state || '').toLowerCase()
  const normalizedStatus = String(
    objective.display_status_label || objective.objective_status || ''
  ).toLowerCase()
  const payoutStatus = String(objective.payout_status || '').toLowerCase()

  if (payoutStatus === 'paid' || normalizedResult === 'paid') return 'paid'
  if (['completed', 'complete', 'achieved', 'success'].includes(normalizedResult)) return 'achieved'
  if (['failed', 'missed', 'not_met'].includes(normalizedResult)) return 'missed'
  if (normalizedCheck === 'checked' && normalizedResult === 'pending') return 'checked'
  if (
    ['scheduled', 'pending', 'active'].includes(normalizedCheck) ||
    normalizedStatus.includes('scheduled')
  ) {
    return 'scheduled'
  }
  if (normalizedStatus.includes('failed') || normalizedStatus.includes('missed')) return 'missed'
  if (normalizedStatus.includes('completed') || normalizedStatus.includes('achieved')) return 'achieved'

  return null
}

function sponsorObjectiveDisplayLabel(objective: SponsorObjectiveUiRow, t: FinanceT): string {
  const status = sponsorObjectiveDisplayStatus(objective)

  switch (status) {
    case 'paid':
      return t('sponsors.paid')
    case 'achieved':
      return t('sponsors.achieved')
    case 'missed':
      return t('sponsors.missed')
    case 'checked':
      return t('sponsors.checked')
    case 'scheduled':
      return t('sponsors.scheduled')
    default:
      return objective.display_status_label || t('sponsors.scheduled')
  }
}

function sponsorObjectiveDisplayVariant(objective: SponsorObjectiveUiRow): string {
  const status = sponsorObjectiveDisplayStatus(objective)
  if (status === 'paid' || status === 'achieved') return 'success'
  if (status === 'missed') return 'danger'
  if (status === 'checked') return 'info'
  return objective.display_status_variant || 'info'
}

function sponsorObjectiveRacePath(objective: SponsorObjectiveUiRow): string | null {
  return objective.target_race_id
    ? `/dashboard/races/${objective.target_race_id}?raceId=${objective.target_race_id}`
    : null
}

function sponsorObjectiveCalendarPath(objective: SponsorObjectiveUiRow): string | null {
  if (!objective.target_race_id) return null

  const dateForMonth =
    objective.target_check_game_date ||
    objective.target_race_start_date ||
    objective.target_race_end_date ||
    null

  const parsedMonth = dateForMonth ? Number(dateForMonth.slice(5, 7)) : NaN
  const month = Number.isFinite(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
    ? parsedMonth
    : null

  const params = new URLSearchParams({
    view: 'races',
    raceId: objective.target_race_id,
    source: 'sponsor_objective',
  })

  if (month) params.set('month', String(month))

  return `/dashboard/calendar?${params.toString()}`
}

function sponsorObjectiveTitleSuffix(objective: SponsorObjectiveUiRow): string {
  const title = String(objective.objective_title || '').trim()
  const raceName = String(objective.target_race_name || '').trim()

  if (!title || !raceName) return title

  if (title.toLowerCase().startsWith(raceName.toLowerCase())) {
    return title.slice(raceName.length).replace(/^\s*[:–-]\s*/, '').trim()
  }

  return title
}

function getCountryName(
  countryCode: string | null | undefined,
  resolvedLanguage: string | undefined
): string {
  if (!countryCode) return 'Unknown country'

  const displayLocale = resolvedLanguage?.startsWith('sr')
    ? 'sr-Latn-RS'
    : resolvedLanguage || 'en'

  try {
    const displayNames = new Intl.DisplayNames([displayLocale], { type: 'region' })
    return displayNames.of(countryCode.toUpperCase()) ?? countryCode.toUpperCase()
  } catch {
    return countryCode.toUpperCase()
  }
}

function getLocalFlagUrl(countryCode: string | null | undefined): string | null {
  if (!countryCode || countryCode.length !== 2) return null
  return `/flags/${countryCode.toLowerCase()}.svg`
}

function getMetadataValue(
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function getMetadataStringArray(
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string[] {
  const value = metadata?.[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function getSponsorDescription(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  return getMetadataValue(metadata, 'description')
}

function getSponsorPreviewGoals(
  metadata: Record<string, unknown> | null | undefined
): string[] {
  return getMetadataStringArray(metadata, 'preview_focus')
}

type MainSponsorObjectiveExplanation = {
  title: string
  description: string
  rewardLabel?: string
}

function getMainSponsorPreviewObjectives(
  metadata: Record<string, unknown> | null | undefined
): MainSponsorObjectiveExplanation[] {
  const raw = metadata?.preview_objectives
  if (!Array.isArray(raw)) return []

  return raw
    .map((item): MainSponsorObjectiveExplanation | null => {
      if (!item || typeof item !== 'object') return null

      const record = item as Record<string, unknown>
      const title = typeof record.title === 'string' ? record.title.trim() : ''
      const description = typeof record.description === 'string' ? record.description.trim() : ''
      const rewardAmount = toNumber(record.estimated_reward_amount)
      const rewardLabel =
        typeof record.reward_label === 'string' && record.reward_label.trim().length > 0
          ? record.reward_label.trim()
          : rewardAmount > 0
            ? formatCashAmount(rewardAmount)
            : undefined

      if (!title && !description) return null

      return {
        title: title || 'Sponsor objective',
        description: description || 'This objective is checked after the relevant race result is finalized.',
        rewardLabel,
      }
    })
    .filter((item): item is MainSponsorObjectiveExplanation => item !== null)
}

function explainMainSponsorObjective(goal: string): MainSponsorObjectiveExplanation {
  const normalizedGoal = goal.toLowerCase()

  if (normalizedGoal.includes('start')) {
    return {
      title: 'Sponsor-market race starts',
      description:
        'The sponsor wants visible participation in races connected to its country, region, or global market. This is normally checked through accepted race entries and completed starts.',
    }
  }

  if (normalizedGoal.includes('podium') || normalizedGoal.includes('win')) {
    return {
      title: 'High-profile result target',
      description:
        'The sponsor expects a headline result such as a win, podium, or strong GC finish in a race connected to its market or prestige calendar.',
    }
  }

  if (normalizedGoal.includes('top-5') || normalizedGoal.includes('top 5')) {
    return {
      title: 'Multiple top-5 results',
      description:
        'The sponsor wants repeatable sporting visibility, usually several top-5 stage or race results instead of one single lucky result.',
    }
  }

  if (normalizedGoal.includes('top 10') || normalizedGoal.includes('top-10')) {
    return {
      title: 'Top-10 performance target',
      description:
        'The sponsor expects a reliable competitive result, normally a top-10 placing in a race, stage, or general classification tied to its market.',
    }
  }

  if (normalizedGoal.includes('visibility')) {
    return {
      title: 'Market visibility objective',
      description:
        'The sponsor wants exposure in its home market through participation, branding, and realistic competitive presence during the season.',
    }
  }

  return {
    title: goal,
    description:
      'This bonus objective is checked against your race participation or final results after the relevant race has been completed.',
  }
}

function getMainSponsorObjectiveExplanations(
  metadata: Record<string, unknown> | null | undefined
): MainSponsorObjectiveExplanation[] {
  const structuredObjectives = getMainSponsorPreviewObjectives(metadata)
  if (structuredObjectives.length > 0) return structuredObjectives

  const goals = getSponsorPreviewGoals(metadata)

  if (goals.length === 0) {
    return [
      {
        title: 'Season visibility',
        description:
          'The sponsor expects your team to appear in races that matter for its market and brand exposure.',
      },
      {
        title: 'Sporting results',
        description:
          'Bonus money is tied to race results such as wins, podiums, top-5 finishes, top-10 finishes, or GC targets.',
      },
      {
        title: 'Checked after races',
        description:
          'Objectives are evaluated only after the target race or stage result is finalized, then bonuses are paid through the finance ledger.',
      },
    ]
  }

  return goals.map(explainMainSponsorObjective)
}

function countryCodeToEmoji(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode.length !== 2) return '🏳️'

  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
}

function getMainSponsorDealType(
  metadata: Record<string, unknown> | null | undefined
): 'standard' | 'naming_rights' {
  const rawDealType =
    getMetadataValue(metadata, 'main_sponsor_deal_type') ??
    getMetadataValue(metadata, 'deal_type') ??
    getMetadataValue(metadata, 'main_deal_type')

  const requiresNameChange = metadata?.requires_team_name_change === true

  if (rawDealType === 'naming_rights' || requiresNameChange) {
    return 'naming_rights'
  }

  return 'standard'
}

function getMainSponsorDealLabel(
  metadata: Record<string, unknown> | null | undefined,
  t: FinanceT
): string {
  return getMainSponsorDealType(metadata) === 'naming_rights'
    ? t('sponsors.namingRights')
    : t('sponsors.standardMainDeal')
}

function getMainSponsorDealPillClass(
  metadata: Record<string, unknown> | null | undefined
): string {
  return getMainSponsorDealType(metadata) === 'naming_rights'
    ? 'border-purple-300 bg-purple-50 text-purple-800'
    : 'border-blue-300 bg-blue-50 text-blue-800'
}

function getMainSponsorTeamNamePreview(offer: SponsorOffer): string | null {
  const metadata = offer.metadata

  const explicitSeasonDisplayName =
    getMetadataValue(metadata, 'season_display_name') ??
    getMetadataValue(metadata, 'naming_rights_display_name')

  if (explicitSeasonDisplayName) return explicitSeasonDisplayName

  if (getMainSponsorDealType(metadata) !== 'naming_rights') return null

  return `${offer.company_name} Team`
}

function getMainSponsorHistoryNamePreview(
  offer: SponsorOffer,
  currentClubName = 'BK Novi Beograd'
): string | null {
  const metadata = offer.metadata

  const explicitFullDisplayName =
    getMetadataValue(metadata, 'full_display_name') ??
    getMetadataValue(metadata, 'team_name_preview')

  if (explicitFullDisplayName) return explicitFullDisplayName

  const seasonName = getMainSponsorTeamNamePreview(offer)
  if (!seasonName) return null

  return `${seasonName} (${currentClubName})`
}

function getSponsorLogoUrl(
  sponsorKind: SponsorKind,
  directLogoUrl?: string | null,
  metadata?: Record<string, unknown> | null
): string | null {
  if (sponsorKind === 'secondary') return null

  const metadataLogo = getMetadataValue(metadata, 'logo_url')
  const finalUrl = directLogoUrl || metadataLogo
  if (!finalUrl || finalUrl.trim().length === 0) return null
  return finalUrl
}

function CountryFlagLabel({
  countryCode,
  imageWidth = 22,
  className = '',
}: {
  countryCode: string | null | undefined
  imageWidth?: number
  className?: string
}): JSX.Element {
  const { i18n } = useTranslation('finance')
  const [failed, setFailed] = React.useState(false)
  const src = getLocalFlagUrl(countryCode)
  const countryName = getCountryName(countryCode, i18n.resolvedLanguage)

  return (
    <div className={`flex items-center gap-2 text-sm text-gray-600 ${className}`}>
      {!failed && src ? (
        <img
          src={src}
          alt={countryName}
          width={imageWidth}
          className="rounded-sm border object-cover shrink-0"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : null}
      <span>{countryName}</span>
    </div>
  )
}

function CountryFlagOnly({
  countryCode,
  imageWidth = 28,
  className = '',
}: {
  countryCode: string | null | undefined
  imageWidth?: number
  className?: string
}): JSX.Element | null {
  const { i18n } = useTranslation('finance')
  const [failed, setFailed] = React.useState(false)
  const src = getLocalFlagUrl(countryCode)
  const countryName = getCountryName(countryCode, i18n.resolvedLanguage)

  if (!src || failed) return null

  return (
    <span
      title={countryName}
      className={`inline-flex items-center justify-center rounded-sm ${className}`}
      aria-label={countryName}
    >
      <img
        src={src}
        alt={countryName}
        width={imageWidth}
        className="rounded-sm border object-cover shrink-0"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

function formatContractCoverage(
  seasonNumber: number | null | undefined,
  t: FinanceT
): string {
  return t('sponsors.coverageSeason', { season: seasonNumber ?? 1 })
}

function formatEquipmentCategoryLabel(category: string, t: FinanceT): string {
  const labels: Record<string, string> = {
    frame: t('sponsors.frames'),
    wheelset: t('sponsors.wheelsets'),
    tires: t('sponsors.tires'),
    groupset: t('sponsors.groupsets'),
    helmet: t('sponsors.helmets'),
    shoes: t('sponsors.shoes'),
  }

  return labels[category] ?? category
}

function getOfferContractValueCash(offer: SponsorOffer): number {
  return toNumber(offer.guaranteed_amount)
}

async function calculateTechnicalSponsorBenefitPackagesBatch(
  offers: Array<{
    offerId: string
    sponsorCompanyId: string
    contractValueCash: number
  }>
): Promise<Record<string, TechnicalSponsorBenefitPackage>> {
  if (offers.length === 0) return {}

  const { data, error } = await supabase.rpc(
    'calculate_technical_sponsor_benefit_packages_batch',
    {
      p_offers: offers.map((offer) => ({
        offer_id: offer.offerId,
        sponsor_company_id: offer.sponsorCompanyId,
        contract_value_cash: offer.contractValueCash,
      })),
    }
  )

  if (error) throw error

  return (data ?? {}) as Record<string, TechnicalSponsorBenefitPackage>
}

function sponsorKindLabel(kind: SponsorKind, t: FinanceT): string {
  switch (kind) {
    case 'main':
      return t('sponsors.mainSponsor')
    case 'secondary':
      return t('sponsors.secondarySponsor')
    case 'technical':
      return t('sponsors.technicalSponsor')
    default:
      return kind
  }
}

function LogoPlaceholder({
  name,
  logoUrl,
  size = 'md',
}: {
  name: string
  logoUrl?: string | null
  size?: 'sm' | 'md' | 'lg' | 'offer' | 'hero'
}): JSX.Element {
  const [failed, setFailed] = React.useState(false)

  const initials = name
    .split(' ')
    .map((p) => p.trim()[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const sizeClass =
    size === 'hero'
      ? 'w-full h-full text-7xl rounded-none'
      : size === 'offer'
        ? 'w-80 h-48 text-3xl rounded-xl'
        : size === 'lg'
          ? 'w-24 h-24 text-xl rounded-xl'
        : size === 'sm'
          ? 'w-10 h-10 text-xs rounded-md'
          : 'w-14 h-14 text-sm rounded-xl'

  const paddingClass =
    size === 'hero'
      ? 'p-4 md:p-6'
      : size === 'offer'
        ? 'p-0'
        : size === 'lg'
          ? 'p-3'
          : 'p-2'

  const showImage = !!logoUrl && !failed

  return (
    <div
      className={[
        sizeClass,
        size === 'offer' ? 'bg-white border-0' : 'bg-gray-100 border',
        'flex items-center justify-center overflow-hidden shrink-0',
      ].join(' ')}
    >
      {showImage ? (
        <img
          src={logoUrl}
          alt={name}
          className={`w-full h-full object-contain ${paddingClass}`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="font-semibold text-gray-600">{initials}</span>
      )}
    </div>
  )
}

function StatusPill({
  label,
  tone = 'gray',
}: {
  label: string
  tone?: 'gray' | 'green' | 'yellow' | 'blue' | 'red'
}): JSX.Element {
  const classes =
    tone === 'green'
      ? 'bg-green-50 text-green-700 border-green-200'
      : tone === 'yellow'
        ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
        : tone === 'blue'
          ? 'bg-blue-50 text-blue-700 border-blue-200'
          : tone === 'red'
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-gray-50 text-gray-700 border-gray-200'

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${classes}`}>
      {label}
    </span>
  )
}

function ActionButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'px-3 py-2 rounded-md text-sm font-semibold transition border shadow-sm',
        disabled
          ? 'bg-yellow-100 text-yellow-700 border-yellow-200 cursor-not-allowed opacity-70'
          : 'bg-yellow-400 text-gray-950 border-yellow-500 hover:bg-yellow-300',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function ProgressBar({
  value,
  tone = 'blue',
}: {
  value: number
  tone?: 'blue' | 'green' | 'yellow'
}): JSX.Element {
  const fillClass =
    tone === 'green'
      ? 'bg-green-500'
      : tone === 'yellow'
        ? 'bg-yellow-500'
        : 'bg-blue-500'

  return (
    <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
      <div className={`h-full ${fillClass}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

function StatCard({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}): JSX.Element {
  return (
    <div className="rounded-lg bg-gray-50 border p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="font-semibold text-gray-900 mt-1">{value}</div>
    </div>
  )
}

function OfferModal({
  open,
  kind,
  offers,
  currency,
  signingOfferId,
  technicalBenefitPackages,
  onClose,
  onSign,
}: {
  open: boolean
  kind: SponsorKind | null
  offers: SponsorOffer[]
  currency: 'USD' | 'EUR'
  signingOfferId: string | null
  technicalBenefitPackages: Record<string, TechnicalSponsorBenefitPackage>
  onClose: () => void
  onSign: (offerId: string) => Promise<void>
}): JSX.Element | null {
  const { t } = useTranslation('finance')
  if (!open || !kind) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 p-2 md:p-4 overflow-y-auto">
        <div className="w-[min(98vw,1720px)] mx-auto bg-white rounded-2xl shadow-2xl border overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b bg-gray-50">
            <div>
              <div className="text-lg font-semibold">
                {t('sponsors.offersTitle', { kind: sponsorKindLabel(kind, t) })}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {t('sponsors.offersDescription')}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-md bg-white border text-sm hover:bg-gray-50"
            >
              Close
            </button>
          </div>

          <div className="p-6">
            {offers.length === 0 ? (
              <div className="text-sm text-gray-600">
                {t('sponsors.noOffers')}
              </div>
            ) : (
              <div className="space-y-4">
                {offers.map((offer) => {
                  const guaranteed = toNumber(offer.guaranteed_amount)
                  const bonus = toNumber(offer.bonus_pool_amount)
                  const monthly = toNumber(offer.monthly_amount)
                  const discount =
                    offer.technical_discount_pct !== null
                      ? Number(offer.technical_discount_pct)
                      : null

                  const description = getSponsorDescription(offer.metadata)
                  const objectiveExplanations = getMainSponsorObjectiveExplanations(offer.metadata)
                  const resolvedLogoUrl = getSponsorLogoUrl(
                    offer.sponsor_kind,
                    offer.logo_url,
                    offer.metadata
                  )

                  const technicalPackage =
                    offer.sponsor_kind === 'technical'
                      ? technicalBenefitPackages[offer.id] ?? null
                      : null

                  const technicalDiscounts =
                    technicalPackage?.category_discounts_json ?? {}

                  const mainSponsorDealLabel = getMainSponsorDealLabel(offer.metadata, t)
                  const mainSponsorDealType = getMainSponsorDealType(offer.metadata)
                  const teamNamePreview = getMainSponsorTeamNamePreview(offer)
                  const teamNameHistoryPreview = getMainSponsorHistoryNamePreview(offer)

                  return (
                    <div key={offer.id} className="border rounded-xl p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 min-w-0">
                          {offer.sponsor_kind !== 'secondary' && (
                            <LogoPlaceholder
                              name={offer.company_name}
                              logoUrl={resolvedLogoUrl}
                              size="offer"
                            />
                          )}

                          <div className="min-w-0">
                            <div className="font-semibold text-lg truncate">
                              {offer.company_name}
                            </div>

                            <div className="text-sm text-gray-600 mt-2 flex flex-wrap items-center gap-2">
                              {offer.sponsor_kind !== 'secondary' && (
                                <CountryFlagOnly
                                  countryCode={offer.company_country_code}
                                  imageWidth={30}
                                />
                              )}

                              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-700">
                                {sponsorKindLabel(offer.sponsor_kind, t)}
                              </span>

                              {offer.sponsor_kind === 'main' && (
                                <span
                                  className={[
                                    'rounded-full border px-2 py-1 text-xs font-semibold',
                                    getMainSponsorDealPillClass(offer.metadata),
                                  ].join(' ')}
                                >
                                  {mainSponsorDealLabel}
                                </span>
                              )}
                            </div>

                            {description && offer.sponsor_kind !== 'secondary' && (
                              <div className="text-sm text-gray-500 mt-2">
                                {description}
                              </div>
                            )}

                            <div className="flex flex-wrap gap-2 mt-3">
                              <StatusPill label={`${t('common.season')} ${offer.season_number}`} tone="blue" />
                              <StatusPill
                                label={t('sponsors.factor', { value: toNumber(offer.proration_factor).toFixed(2) })}
                              />
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => void onSign(offer.id)}
                          disabled={signingOfferId === offer.id}
                          className="px-4 py-2 rounded-md bg-gray-900 text-white text-sm hover:bg-black disabled:opacity-60"
                        >
                          {signingOfferId === offer.id ? t('sponsors.signing') : t('sponsors.signOffer')}
                        </button>
                      </div>

                      {offer.sponsor_kind === 'technical' && technicalPackage ? (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-5">
                            <StatCard
                              label={t('sponsors.totalValue')}
                              value={formatMoney(
                                toNumber(technicalPackage.contract_value_cash),
                                currency
                              )}
                            />
                            <StatCard
                              label={t('sponsors.cashPaidNow')}
                              value={formatMoney(
                                toNumber(technicalPackage.cash_support_cash),
                                currency
                              )}
                            />
                            <StatCard
                              label={t('sponsors.equipmentFund')}
                              value={formatMoney(
                                toNumber(technicalPackage.equipment_support_budget_cash),
                                currency
                              )}
                            />
                            <StatCard
                              label={t('sponsors.contractCoverage')}
                              value={formatContractCoverage(offer.season_number, t)}
                            />
                          </div>

                          <div className="mt-4 rounded-lg bg-green-50 border border-green-100 p-4 text-sm text-green-900">
                            <div className="font-medium">{t('sponsors.technicalPackage')}</div>

                            <div className="mt-3">
                              <div className="text-xs uppercase tracking-wide text-green-700 font-semibold">
                                {t('sponsors.discounts')}
                              </div>

                              <div className="mt-2 flex flex-wrap gap-2">
                                {Object.entries(technicalDiscounts).map(
                                  ([category, value]) => (
                                    <span
                                      key={category}
                                      className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-green-200"
                                    >
                                      {formatEquipmentCategoryLabel(category, t)}:{' '}
                                      {toNumber(value).toFixed(0)}%
                                    </span>
                                  )
                                )}
                              </div>
                            </div>

                            <div className="mt-3 text-xs text-green-800">
                              {t('sponsors.equipmentSupportNotCashLong')}
                            </div>
                          </div>

                          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs text-amber-800">
                            {t('sponsors.unusedSupportExpires')}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-5">
                            <StatCard label={t('sponsors.guaranteed')} value={formatMoney(guaranteed, currency)} />
                            <StatCard
                              label={
                                offer.sponsor_kind === 'main'
                                  ? t('sponsors.bonusPool')
                                  : t('sponsors.monthlyEquivalent')
                              }
                              value={
                                offer.sponsor_kind === 'main'
                                  ? formatMoney(bonus, currency)
                                  : formatMoney(monthly, currency)
                              }
                            />
                            <StatCard
                              label={t('sponsors.contractCoverage')}
                              value={formatContractCoverage(offer.season_number, t)}
                            />
                            <StatCard
                              label={
                                offer.sponsor_kind === 'technical'
                                  ? t('sponsors.discount')
                                  : offer.sponsor_kind === 'main'
                                    ? t('sponsors.dealType')
                                    : t('sponsors.details')
                              }
                              value={
                                offer.sponsor_kind === 'technical'
                                  ? discount !== null
                                    ? `${discount.toFixed(2)}%`
                                    : t('sponsors.calculatingPackage')
                                  : offer.sponsor_kind === 'secondary'
                                    ? t('sponsors.supportingSponsor')
                                    : mainSponsorDealType === 'naming_rights'
                                      ? t('sponsors.namingRights')
                                      : t('sponsors.standard')
                              }
                            />
                          </div>

                          {offer.sponsor_kind === 'technical' && (
                            <div className="mt-4 rounded-lg bg-gray-50 border p-4 text-sm text-gray-700">
                              {t('sponsors.calculatingPackage')}
                            </div>
                          )}
                        </>
                      )}

                      {offer.sponsor_kind === 'main' && (
                        <div className="mt-4 rounded-lg bg-white border border-gray-200 p-4 text-sm text-blue-900">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium">{t('sponsors.mainPackage')}</div>
                            <span
                              className={[
                                'rounded-full border px-2 py-0.5 text-xs font-semibold',
                                getMainSponsorDealPillClass(offer.metadata),
                              ].join(' ')}
                            >
                              {mainSponsorDealLabel}
                            </span>
                          </div>

                          <div className="mt-2 text-sm leading-6 text-blue-900">
                            {t('sponsors.mainPackageDescription')}
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                            <div className="rounded-lg border border-blue-100 bg-white/70 px-3 py-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                                {t('sponsors.guaranteedMoney')}
                              </div>
                              <div className="mt-1 font-semibold">
                                {t('sponsors.paidWhenSigned', { amount: formatMoney(guaranteed, currency) })}
                              </div>
                            </div>

                            <div className="rounded-lg border border-blue-100 bg-white/70 px-3 py-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                                {t('sponsors.bonusPool')}
                              </div>
                              <div className="mt-1 font-semibold">
                                {t('sponsors.availableObjectives', { amount: formatMoney(bonus, currency) })}
                              </div>
                            </div>
                          </div>

                          {teamNamePreview && (
                            <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-purple-900">
                              <div className="text-xs font-semibold uppercase tracking-wide text-purple-700">
                                {t('sponsors.namingIdentity')}
                              </div>
                              <div className="mt-1 text-lg font-semibold">{teamNamePreview}</div>
                              <div className="mt-1 text-xs text-purple-800">
                                {t('sponsors.namingIdentityDescription')}
                              </div>
                              {teamNameHistoryPreview && teamNameHistoryPreview !== teamNamePreview ? (
                                <div className="mt-2 rounded-md bg-white/70 px-2 py-1 text-xs text-purple-800">
                                  {t('sponsors.historyLabel', { name: teamNameHistoryPreview })}
                                </div>
                              ) : null}
                            </div>
                          )}

                          <div className="mt-4">
                            <div className="font-medium mb-2">{t('sponsors.expectedObjectives')}</div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              {objectiveExplanations.slice(0, 6).map((objective, index) => (
                                <div
                                  key={`${offer.id}-objective-${index}`}
                                  className="rounded-lg border border-blue-100 bg-white/75 px-3 py-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="text-sm font-semibold text-blue-950">
                                      {objective.title}
                                    </div>
                                    {objective.rewardLabel ? (
                                      <div className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
                                        {objective.rewardLabel}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="mt-1 text-xs leading-5 text-blue-800">
                                    {objective.description}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {offer.sponsor_kind === 'secondary' && (
                        <div className="mt-4 rounded-lg bg-gray-50 border p-4 text-sm text-gray-700">
                          {t('sponsors.secondaryNoObjectives')}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SponsorObjectiveCards({
  objectives,
  loading,
  error,
  onOpenRace,
  onShowInCalendar,
}: {
  objectives: SponsorObjectiveUiRow[]
  loading: boolean
  error: string | null
  onOpenRace: (objective: SponsorObjectiveUiRow) => void
  onShowInCalendar: (objective: SponsorObjectiveUiRow) => void
}): JSX.Element {
  const { t } = useTranslation('finance')
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{t('sponsors.objectives')}</h3>
          <p className="text-sm text-gray-500">
            {t('sponsors.objectivesDescription')}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          {t('sponsors.loadingObjectives')}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : objectives.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          {t('sponsors.noObjectives')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {objectives.map((objective) => (
            <div
              key={objective.objective_id}
              className="rounded-xl border border-gray-200 bg-gray-50 p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  {objective.target_race_id && objective.target_race_name && sponsorObjectiveRacePath(objective) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenRace(objective)}
                        className="text-left text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                      >
                        {objective.target_race_name}
                      </button>
                      {sponsorObjectiveTitleSuffix(objective) ? (
                        <div className="mt-0.5 text-xs font-semibold text-gray-700">
                          {sponsorObjectiveTitleSuffix(objective)}
                        </div>
                      ) : null}
                      {sponsorObjectiveCalendarPath(objective) ? (
                        <button
                          type="button"
                          onClick={() => onShowInCalendar(objective)}
                          className="mt-1 inline-flex text-[11px] font-semibold text-gray-500 hover:text-gray-900 hover:underline"
                        >
                          {t('sponsors.showCalendar')}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <div className="text-sm font-semibold text-gray-900">
                      {objective.objective_title}
                    </div>
                  )}
                </div>

                <div
                  className={[
                    'shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold',
                    sponsorObjectiveBadgeClass(sponsorObjectiveDisplayVariant(objective)),
                  ].join(' ')}
                >
                  {sponsorObjectiveDisplayLabel(objective, t)}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">{t('sponsors.reward')}</span>
                  <span className="font-semibold text-gray-900">
                    {formatMoney(toNumber(objective.reward_amount))}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">{t('sponsors.progress')}</span>
                  <span className="font-semibold text-gray-900">
                    {objective.progress_text}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">{t('sponsors.requiredResult')}</span>
                  <span className="font-semibold text-gray-900">
                    {sponsorObjectiveRequiredResultLabel(objective.required_result, t)}
                  </span>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MainSponsorHero({
  sponsor,
  canOpenOffers,
  onOpenOffers,
  currency,
}: {
  sponsor: SignedSponsor | null
  canOpenOffers: boolean
  onOpenOffers: () => void
  currency: 'USD' | 'EUR'
}): JSX.Element {
  const { t } = useTranslation('finance')
  const resolvedLogoUrl = sponsor
    ? getSponsorLogoUrl(sponsor.sponsor_kind, sponsor.logo_url, sponsor.metadata)
    : null

  const description = sponsor ? getSponsorDescription(sponsor.metadata) : null
  const signedMainDealType = sponsor ? getMainSponsorDealType(sponsor.metadata) : 'standard'
  const signedMainDealLabel =
    signedMainDealType === 'naming_rights'
      ? t('sponsors.namingRights')
      : t('sponsors.standardMainDeal')
  const activeSeasonTeamName = sponsor
    ? getMetadataValue(sponsor.metadata, 'season_display_name') ??
      getMetadataValue(sponsor.metadata, 'naming_rights_display_name') ??
      (signedMainDealType === 'naming_rights'
        ? `${sponsor.name} Team`
        : t('sponsors.clubNameUnchanged'))
    : null
  const historyDisplayName = sponsor
    ? getMetadataValue(sponsor.metadata, 'full_display_name') ??
      getMetadataValue(sponsor.metadata, 'history_display_name')
    : null

  return (
    <div className="bg-white rounded-xl shadow border overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b bg-gray-50">
        <div>
          <div className="font-semibold text-lg">{t('sponsors.mainSponsor')}</div>
          <div className="text-sm text-gray-500 mt-1">
            {t('sponsors.mainDescription')}
          </div>
        </div>

        <ActionButton label={t('sponsors.viewOffers')} disabled={!canOpenOffers} onClick={onOpenOffers} />
      </div>

      <div className="p-5">
        {sponsor ? (
          <div className="h-full">
            <div>
              <div className="text-2xl font-bold text-gray-900">{sponsor.name}</div>

              <CountryFlagLabel
                countryCode={sponsor.country_code}
                imageWidth={24}
                className="mt-3"
              />

              {description && (
                <div className="text-sm text-gray-500 mt-3">{description}</div>
              )}

              <div className="flex flex-wrap gap-2 mt-4">
                <StatusPill
                  label={sponsor.status === 'signed' ? t('common.signed') : sponsor.status}
                  tone="green"
                />
                <StatusPill
                  label={signedMainDealLabel}
                  tone={signedMainDealType === 'naming_rights' ? 'yellow' : 'blue'}
                />
                <StatusPill label={`${t('common.season')} ${sponsor.season_number}`} tone="blue" />
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-yellow-200 bg-yellow-50/60 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide text-yellow-800">
                    {t('sponsors.contractSummary')}
                  </div>
                  <div className="mt-1 text-xs text-yellow-900/80">
                    {t('sponsors.contractSummaryDescription')}
                  </div>
                </div>

                <span className="inline-flex w-fit rounded-full border border-yellow-300 bg-white px-2.5 py-1 text-xs font-semibold text-yellow-800">
                  {t('sponsors.activeContract')}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 mt-4 md:grid-cols-2 xl:grid-cols-5">
                <StatCard
                  label={t('sponsors.guaranteedPayment')}
                  value={formatMoney(toNumber(sponsor.guaranteed_amount), currency)}
                />
                <StatCard
                  label={t('sponsors.bonusPoolTitle')}
                  value={formatMoney(toNumber(sponsor.bonus_pool_amount), currency)}
                />
                <StatCard
                  label={t('sponsors.contractCoverage')}
                  value={formatContractCoverage(sponsor.season_number, t)}
                />
                <StatCard
                  label={t('sponsors.dealTypeTitle')}
                  value={signedMainDealLabel}
                />
                <StatCard
                  label={
                    signedMainDealType === 'naming_rights'
                      ? t('sponsors.seasonTeamName')
                      : t('sponsors.teamIdentity')
                  }
                  value={activeSeasonTeamName ?? t('sponsors.clubNameUnchanged')}
                />
              </div>

              {historyDisplayName && signedMainDealType === 'naming_rights' ? (
                <div className="mt-3 rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs text-purple-900">
                  {t('sponsors.historyLabel', { name: historyDisplayName })}
                </div>
              ) : null}
            </div>

            <div className="mt-5 rounded-2xl border bg-gradient-to-br from-gray-50 to-white overflow-hidden">
              <div className="h-[320px] md:h-[420px]">
                {resolvedLogoUrl ? (
                  <img
                    src={resolvedLogoUrl}
                    alt={sponsor.name}
                    className="w-full h-full object-contain p-4 md:p-6"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <div className="text-7xl md:text-8xl font-semibold text-gray-500">
                      {sponsor.name
                        .split(' ')
                        .map((part) => part.trim()[0] ?? '')
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col justify-center rounded-xl border border-dashed p-6 bg-gray-50">
            <div className="text-lg font-semibold text-gray-900">{t('sponsors.noMain')}</div>
            <div className="text-sm text-gray-600 mt-2">
              {t('sponsors.noMainDescription')}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SecondarySponsorPanel({
  signedSponsors,
  usedSlots,
  totalSlots,
  canOpenOffers,
  onOpenOffers,
  currency,
}: {
  signedSponsors: SignedSponsor[]
  usedSlots: number
  totalSlots: number
  canOpenOffers: boolean
  onOpenOffers: () => void
  currency: 'USD' | 'EUR'
}): JSX.Element {
  const { t } = useTranslation('finance')
  const progress = totalSlots > 0 ? (usedSlots / totalSlots) * 100 : 0

  return (
    <div className="bg-white rounded-xl shadow border overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b bg-gray-50">
        <div>
          <div className="font-semibold text-lg">{t('sponsors.secondarySponsors')}</div>
          <div className="text-sm text-gray-500 mt-1">
            {t('sponsors.secondaryDescription')}
          </div>
        </div>

        <ActionButton label={t('sponsors.viewOffers')} disabled={!canOpenOffers} onClick={onOpenOffers} />
      </div>

      <div className="p-5">
        <div className="rounded-xl border bg-gray-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-gray-700">{t('sponsors.slotUsage')}</div>
            <StatusPill label={t('sponsors.slotsFilled', { used: usedSlots, total: totalSlots })} tone={usedSlots > 0 ? 'blue' : 'gray'} />
          </div>
          <div className="mt-3">
            <ProgressBar value={progress} tone="blue" />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-5">
          {[1, 2, 3].map((slot) => {
            const sponsor = signedSponsors.find((s) => s.slot_no === slot)

            return (
              <div key={slot} className="rounded-xl border p-4 bg-white">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-gray-900">{t('sponsors.slot', { slot })}</div>
                  {sponsor ? (
                    <StatusPill
                      label={sponsor.status === 'signed' ? t('common.signed') : sponsor.status}
                      tone="green"
                    />
                  ) : (
                    <StatusPill label="Empty" />
                  )}
                </div>

                {sponsor ? (
                  <div className="mt-4">
                    <div className="min-w-0">
                      <div className="font-semibold">{sponsor.name}</div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 mt-4">
                      <StatCard
                        label={t('sponsors.guaranteed')}
                        value={formatMoney(toNumber(sponsor.guaranteed_amount), currency)}
                      />
                      <StatCard
                        label={t('sponsors.contractCoverage')}
                        value={formatContractCoverage(sponsor.season_number, t)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed bg-gray-50 p-4 text-sm text-gray-600">
                    {t('sponsors.noSlotSponsor')}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TechnicalSponsorPanel({
  sponsor,
  technicalSupport,
  canOpenOffers,
  onOpenOffers,
  currency,
}: {
  sponsor: SignedSponsor | null
  technicalSupport: ActiveTechnicalSponsorSupport | null
  canOpenOffers: boolean
  onOpenOffers: () => void
  currency: 'USD' | 'EUR'
}): JSX.Element {
  const { t } = useTranslation('finance')
  const resolvedLogoUrl = sponsor
    ? getSponsorLogoUrl(sponsor.sponsor_kind, sponsor.logo_url, sponsor.metadata)
    : null

  const description = sponsor ? getSponsorDescription(sponsor.metadata) : null

  const support =
    technicalSupport?.has_active_support && sponsor
      ? technicalSupport
      : null

  const discountEntries = Object.entries(support?.category_discounts_json ?? {})
  const usedSupport = toNumber(support?.equipment_support_used_cash)
  const totalSupport = toNumber(support?.equipment_support_budget_cash)
  const remainingSupport = toNumber(support?.equipment_support_remaining_cash)
  const usedPct =
    totalSupport > 0 ? Math.max(0, Math.min(100, (usedSupport / totalSupport) * 100)) : 0

  return (
    <div className="bg-white rounded-xl shadow border overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b bg-gray-50">
        <div>
          <div className="font-semibold text-lg">{t('sponsors.technicalSponsor')}</div>
          <div className="text-sm text-gray-500 mt-1">
            {t('sponsors.technicalDescription')}
          </div>
        </div>

        <ActionButton label={t('sponsors.viewOffers')} disabled={!canOpenOffers} onClick={onOpenOffers} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5">
        <div className="xl:col-span-3 p-5">
          {sponsor ? (
            <div>
              <div className="flex items-start gap-4">
                <LogoPlaceholder name={sponsor.name} logoUrl={resolvedLogoUrl} size="lg" />
                <div>
                  <div className="text-xl font-bold text-gray-900">{sponsor.name}</div>
                  <CountryFlagLabel
                    countryCode={sponsor.country_code}
                    imageWidth={24}
                    className="mt-2"
                  />

                  {description && (
                    <div className="text-sm text-gray-500 mt-3">{description}</div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-4">
                    <StatusPill
                      label={sponsor.status === 'signed' ? t('common.signed') : sponsor.status}
                      tone="green"
                    />
                    {discountEntries.length > 0 ? (
                      discountEntries.map(([category, discount]) => (
                        <StatusPill
                          key={category}
                          label={`${formatEquipmentCategoryLabel(category, t)} ${toNumber(discount).toFixed(0)}%`}
                          tone="blue"
                        />
                      ))
                    ) : (
                      <StatusPill label={t('sponsors.noActiveFund')} tone="yellow" />
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-5">
                <StatCard
                  label={t('sponsors.cashSupport')}
                  value={
                    support
                      ? formatMoney(toNumber(support.cash_support_cash), currency)
                      : formatMoney(toNumber(sponsor.guaranteed_amount), currency)
                  }
                />
                <StatCard
                  label={t('sponsors.equipmentFund')}
                  value={
                    support
                      ? `${formatMoney(usedSupport, currency)} / ${formatMoney(totalSupport, currency)}`
                      : t('sponsors.notCreated')
                  }
                />
                <StatCard
                  label={t('sponsors.remaining')}
                  value={
                    support
                      ? formatMoney(remainingSupport, currency)
                      : '—'
                  }
                />
                <StatCard
                  label={t('sponsors.contractCoverage')}
                  value={formatContractCoverage(sponsor.season_number, t)}
                />
              </div>

              {support && (
                <div className="mt-5">
                  <ProgressBar value={usedPct} tone="green" />
                  <div className="mt-2 text-xs text-gray-500">
                    {t('sponsors.supportUsed', { percent: usedPct.toFixed(1) })}
                  </div>
                </div>
              )}

              {support && (
                <div className="mt-4 rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs text-amber-800">
                  {t('sponsors.equipmentSupportNotCash')}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-6 bg-gray-50">
              <div className="text-lg font-semibold text-gray-900">{t('sponsors.noTechnical')}</div>
              <div className="text-sm text-gray-600 mt-2">
                {t('sponsors.noTechnicalDescription')}
              </div>
            </div>
          )}
        </div>

        <div className="xl:col-span-2 border-t xl:border-t-0 xl:border-l bg-gray-50/70 p-5">
          <div className="font-semibold">{t('sponsors.supportStatus')}</div>
          <div className="text-sm text-gray-500 mt-1">
            {t('sponsors.supportStatusDescription')}
          </div>

          <div className="space-y-3 mt-4">
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{t('sponsors.cashSupportTitle')}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {t('sponsors.cashSupportDescription')}
                  </div>
                </div>
                <StatusPill label={sponsor ? t('sponsors.paid') : 'Locked'} tone={sponsor ? 'green' : 'gray'} />
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{t('sponsors.equipmentSupportFund')}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {t('sponsors.equipmentSupportFundDescription')}
                  </div>
                </div>
                <StatusPill label={support ? 'Active' : 'Missing'} tone={support ? 'green' : 'yellow'} />
              </div>

              {support && (
                <div className="mt-4">
                  <ProgressBar value={usedPct} tone="green" />
                  <div className="mt-2 text-xs text-gray-500">
                    {t('sponsors.remainingAmount', { amount: formatMoney(remainingSupport, currency) })}
                  </div>
                </div>
              )}
            </div>

            {support && discountEntries.length > 0 && (
              <div className="rounded-xl border bg-white p-4">
                <div className="font-medium">{t('sponsors.discounts')}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {discountEntries.map(([category, discount]) => (
                    <span
                      key={category}
                      className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-green-200"
                    >
                      {formatEquipmentCategoryLabel(category, t)}: {toNumber(discount).toFixed(0)}%
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SponsorsTab({
  clubId,
  currency = 'USD',
}: {
  clubId: string
  currency?: 'USD' | 'EUR'
}): JSX.Element {
  const { t } = useTranslation('finance')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [dashboard, setDashboard] = useState<SponsorDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signingOfferId, setSigningOfferId] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [offersModalKind, setOffersModalKind] = useState<SponsorKind | null>(null)
  const [technicalBenefitPackages, setTechnicalBenefitPackages] = useState<
    Record<string, TechnicalSponsorBenefitPackage>
  >({})
  const [activeTechnicalSupport, setActiveTechnicalSupport] =
    useState<ActiveTechnicalSponsorSupport | null>(null)
  const [sponsorObjectives, setSponsorObjectives] = useState<SponsorObjectiveUiRow[]>([])
  const [sponsorObjectivesLoading, setSponsorObjectivesLoading] = useState(false)
  const [sponsorObjectivesError, setSponsorObjectivesError] = useState<string | null>(null)

  const location = useLocation()
  const navigate = useNavigate()

  function getSponsorReturnState(extra?: Record<string, unknown>) {
    return {
      from: 'sponsor_objective',
      returnTo: `${location.pathname}${location.search}`,
      returnScrollY: window.scrollY,
      restoreSponsorTab: true,
      restoreSponsorScrollY: window.scrollY,
      ...extra,
    }
  }

  function handleOpenSponsorObjectiveRace(objective: SponsorObjectiveUiRow): void {
    if (!objective.target_race_id) return

    navigate(`/dashboard/races/${objective.target_race_id}?raceId=${objective.target_race_id}`, {
      state: getSponsorReturnState({
        returnSponsorObjectiveId: objective.objective_id,
        returnSponsorRaceId: objective.target_race_id,
      }),
    })
  }

  function handleShowSponsorObjectiveInCalendar(objective: SponsorObjectiveUiRow): void {
    const path = sponsorObjectiveCalendarPath(objective)
    if (!path) return

    navigate(path, {
      state: getSponsorReturnState({
        returnSponsorObjectiveId: objective.objective_id,
        returnSponsorRaceId: objective.target_race_id,
      }),
    })
  }

  useEffect(() => {
    const state = location.state as
      | { restoreSponsorTab?: boolean; restoreSponsorScrollY?: number; returnScrollY?: number }
      | null

    if (!state?.restoreSponsorTab && typeof state?.restoreSponsorScrollY !== 'number') return

    const scrollY =
      typeof state.restoreSponsorScrollY === 'number'
        ? state.restoreSponsorScrollY
        : typeof state.returnScrollY === 'number'
          ? state.returnScrollY
          : null

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (typeof scrollY === 'number') {
          window.scrollTo({ top: scrollY, behavior: 'auto' })
        }

        navigate(`${location.pathname}${location.search}`, {
          replace: true,
          state: null,
        })
      })
    })
  }, [location.pathname, location.search, location.state, navigate])

  const loadSponsorObjectives = useCallback(async (mainClubId: string): Promise<void> => {
    try {
      setSponsorObjectivesLoading(true)
      setSponsorObjectivesError(null)

      const { data, error: objectivesError } = await supabase.rpc(
        'get_club_sponsor_objectives_ui_v1',
        {
          p_club_id: mainClubId,
        }
      )

      if (objectivesError) throw objectivesError

      setSponsorObjectives((data ?? []) as SponsorObjectiveUiRow[])
    } catch (err) {
      setSponsorObjectivesError(
        err instanceof Error ? err.message : 'Failed to load sponsor objectives.'
      )
      setSponsorObjectives([])
    } finally {
      setSponsorObjectivesLoading(false)
    }
  }, [])

  const loadDashboard = useCallback(async (): Promise<void> => {
    setError(null)

    const refreshRes = await supabase.rpc('sponsor_refresh_daily_offers', {
      p_club_id: clubId,
    })

    if (refreshRes.error) {
      setDashboard(null)
      setError(refreshRes.error.message ?? 'Failed to refresh sponsor offers.')
      return
    }

    const dashboardRes = await supabase.rpc('sponsor_get_dashboard', {
      p_club_id: clubId,
    })

    if (dashboardRes.error) {
      setDashboard(null)
      setError(dashboardRes.error.message ?? 'Failed to load sponsor dashboard.')
      return
    }

    setDashboard((dashboardRes.data ?? null) as SponsorDashboard | null)

    const supportRes = await supabase.rpc(
      'equipment_get_active_technical_sponsor_support',
      {
        p_club_id: clubId,
      }
    )

    if (!supportRes.error) {
      setActiveTechnicalSupport(
        (supportRes.data ?? null) as ActiveTechnicalSponsorSupport | null
      )
    } else {
      setActiveTechnicalSupport(null)
    }
  }, [clubId])

  const generateIfNeeded = useCallback(async (): Promise<void> => {
    setGenerating(true)
    setError(null)

    const genRes = await supabase.rpc('sponsor_generate_offers', {
      p_club_id: clubId,
      p_force: false,
    })

    setGenerating(false)

    if (genRes.error) {
      setError(genRes.error.message ?? 'Failed to generate sponsor offers.')
      return
    }

    await loadDashboard()
  }, [clubId, loadDashboard])

  useEffect(() => {
    let mounted = true

    ;(async () => {
      setLoading(true)
      setBanner(null)
      await loadDashboard()
      if (!mounted) return
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [loadDashboard])

  useEffect(() => {
    if (!clubId) return

    void loadSponsorObjectives(clubId)
  }, [clubId, loadSponsorObjectives])

  useEffect(() => {
    if (!dashboard) return

    const shouldGenerate =
      dashboard.signed_sponsors.length === 0 && dashboard.offers.length === 0 && !generating

    if (shouldGenerate) {
      void generateIfNeeded()
    }
  }, [dashboard, generateIfNeeded, generating])

  const signedMain = useMemo(
    () => dashboard?.signed_sponsors.find((s) => s.sponsor_kind === 'main') ?? null,
    [dashboard]
  )

  const signedTechnical = useMemo(
    () => dashboard?.signed_sponsors.find((s) => s.sponsor_kind === 'technical') ?? null,
    [dashboard]
  )

  const signedSecondary = useMemo(
    () =>
      [...(dashboard?.signed_sponsors ?? [])]
        .filter((s) => s.sponsor_kind === 'secondary')
        .sort((a, b) => (a.slot_no ?? 99) - (b.slot_no ?? 99)),
    [dashboard]
  )

  const mainOffers = useMemo(
    () => dashboard?.offers.filter((o) => o.sponsor_kind === 'main') ?? [],
    [dashboard]
  )

  const secondaryOffers = useMemo(
    () => dashboard?.offers.filter((o) => o.sponsor_kind === 'secondary') ?? [],
    [dashboard]
  )

  const technicalOffers = useMemo(
    () => dashboard?.offers.filter((o) => o.sponsor_kind === 'technical') ?? [],
    [dashboard]
  )

  useEffect(() => {
    let cancelled = false

    async function loadTechnicalPackages(): Promise<void> {
      if (offersModalKind !== 'technical' || technicalOffers.length === 0) {
        if (!cancelled && offersModalKind !== 'technical') {
          setTechnicalBenefitPackages({})
        }
        return
      }

      try {
        const packages = await calculateTechnicalSponsorBenefitPackagesBatch(
          technicalOffers
            .map((offer) => ({
              offerId: offer.id,
              sponsorCompanyId: offer.company_id,
              contractValueCash: getOfferContractValueCash(offer),
            }))
            .filter(
              (offer) =>
                offer.offerId &&
                offer.sponsorCompanyId &&
                offer.contractValueCash > 0
            )
        )

        if (!cancelled) {
          setTechnicalBenefitPackages(packages)
        }
      } catch (err) {
        if (!cancelled) {
          setTechnicalBenefitPackages({})
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to calculate technical sponsor packages.'
          )
        }
      }
    }

    void loadTechnicalPackages()

    return () => {
      cancelled = true
    }
  }, [offersModalKind, technicalOffers])

  const modalOffers = useMemo(() => {
    if (offersModalKind === 'main') return mainOffers
    if (offersModalKind === 'secondary') return secondaryOffers
    if (offersModalKind === 'technical') return technicalOffers
    return []
  }, [offersModalKind, mainOffers, secondaryOffers, technicalOffers])

  const canOpenMainOffers = !!dashboard && dashboard.needs_main_sponsor && mainOffers.length > 0
  const canOpenSecondaryOffers =
    !!dashboard &&
    dashboard.secondary_slots_used < dashboard.secondary_slots_total &&
    secondaryOffers.length > 0
  const canOpenTechnicalOffers =
    !!dashboard && dashboard.needs_technical_sponsor && technicalOffers.length > 0

  async function handleSignOffer(offerId: string): Promise<void> {
    setSigningOfferId(offerId)
    setError(null)
    setBanner(null)

    const res = await supabase.rpc('sponsor_sign_offer', {
      p_offer_id: offerId,
    })

    setSigningOfferId(null)

    if (res.error) {
      setError(res.error.message ?? 'Failed to sign sponsor offer.')
      return
    }

    const row = Array.isArray(res.data)
      ? ((res.data[0] ?? null) as SignResult | null)
      : ((res.data ?? null) as SignResult | null)

    if (row) {
      if (row.signed_kind === 'main') {
        setBanner(t('sponsors.mainSignedBanner', { count: row.created_objectives }))
      } else if (row.signed_kind === 'secondary') {
        setBanner(t('sponsors.secondarySignedBanner', { slot: row.assigned_slot_no ?? '—' }))
      } else {
        setBanner(t('sponsors.technicalSignedBanner'))
      }
    } else {
      setBanner(t('sponsors.contractSignedBanner'))
    }

    setOffersModalKind(null)
    await loadDashboard()
    await loadSponsorObjectives(clubId)
  }

  return (
    <div className="space-y-4">
      <OfferModal
        open={offersModalKind !== null}
        kind={offersModalKind}
        offers={modalOffers}
        currency={currency}
        signingOfferId={signingOfferId}
        technicalBenefitPackages={technicalBenefitPackages}
        onClose={() => setOffersModalKind(null)}
        onSign={handleSignOffer}
      />

      {loading && (
        <div className="bg-white p-4 rounded shadow text-sm text-gray-600">
          {t('sponsors.loadingDashboard')}
        </div>
      )}

      {!loading && error && (
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm font-semibold text-red-600">Error</div>
          <div className="text-sm text-gray-700 mt-1">{error}</div>
        </div>
      )}

      {!loading && banner && (
        <div className="bg-white p-4 rounded shadow border border-green-200">
          <div className="text-sm font-semibold text-green-700">Updated</div>
          <div className="text-sm text-gray-700 mt-1">{banner}</div>
        </div>
      )}

      {!loading && !error && dashboard && (
        <>
          <div className="bg-white p-4 rounded shadow">
            <div className="font-semibold">{t('sponsors.sponsorStatus')}</div>
            <div className="text-sm text-gray-500 mt-1">
              {t('sponsors.seasonMonth', {
                season: dashboard.season_number,
                month: dashboard.game_month,
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-sm">
              <div className="rounded-xl bg-gray-50 border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-gray-500">{t('sponsors.mainSponsor')}</div>
                    <div className="font-semibold mt-2">
                      {dashboard.needs_main_sponsor ? 'Needed' : t('common.signed')}
                    </div>
                  </div>
                  <div
                    className={[
                      'flex h-11 w-11 items-center justify-center rounded-full border text-lg font-bold',
                      dashboard.needs_main_sponsor
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-green-200 bg-green-50 text-green-700',
                    ].join(' ')}
                    aria-label={
                      dashboard.needs_main_sponsor
                        ? t('sponsors.mainNeededAria')
                        : t('sponsors.mainSignedAria')
                    }
                  >
                    {dashboard.needs_main_sponsor ? '!' : '✓'}
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-gray-500">{t('sponsors.secondarySponsors')}</div>
                    <div className="font-semibold mt-2">
                      {dashboard.secondary_slots_used}/{dashboard.secondary_slots_total}
                    </div>
                  </div>
                  <div className="flex h-11 min-w-[2.75rem] items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700">
                    {dashboard.secondary_slots_used}/{dashboard.secondary_slots_total}
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-gray-500">{t('sponsors.technicalSponsor')}</div>
                    <div className="font-semibold mt-2">
                      {dashboard.needs_technical_sponsor ? 'Needed' : t('common.signed')}
                    </div>
                  </div>
                  <div
                    className={[
                      'flex h-11 w-11 items-center justify-center rounded-full border text-lg font-bold',
                      dashboard.needs_technical_sponsor
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-green-200 bg-green-50 text-green-700',
                    ].join(' ')}
                    aria-label={
                      dashboard.needs_technical_sponsor
                        ? t('sponsors.technicalNeededAria')
                        : t('sponsors.technicalSignedAria')
                    }
                  >
                    {dashboard.needs_technical_sponsor ? '!' : '✓'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <MainSponsorHero
            sponsor={signedMain}
            currency={currency}
            canOpenOffers={canOpenMainOffers}
            onOpenOffers={() => setOffersModalKind('main')}
          />

          <SponsorObjectiveCards
            objectives={
              signedMain
                ? sponsorObjectives.filter(
                    (objective) => objective.club_sponsor_id === signedMain.id
                  )
                : []
            }
            loading={signedMain ? sponsorObjectivesLoading : false}
            error={signedMain ? sponsorObjectivesError : null}
            onOpenRace={handleOpenSponsorObjectiveRace}
            onShowInCalendar={handleShowSponsorObjectiveInCalendar}
          />

          <SecondarySponsorPanel
            signedSponsors={signedSecondary}
            usedSlots={dashboard.secondary_slots_used}
            totalSlots={dashboard.secondary_slots_total}
            currency={currency}
            canOpenOffers={canOpenSecondaryOffers}
            onOpenOffers={() => setOffersModalKind('secondary')}
          />

          <TechnicalSponsorPanel
            sponsor={signedTechnical}
            technicalSupport={activeTechnicalSupport}
            currency={currency}
            canOpenOffers={canOpenTechnicalOffers}
            onOpenOffers={() => setOffersModalKind('technical')}
          />

          {dashboard.offers.length === 0 && dashboard.signed_sponsors.length === 0 && !generating && (
            <div className="bg-white p-4 rounded shadow">
              <div className="font-semibold">Sponsors</div>
              <div className="text-sm text-gray-600 mt-2">
                {t('sponsors.noSponsors')}
              </div>
            </div>
          )}

          {generating && (
            <div className="bg-white p-4 rounded shadow text-sm text-gray-600">
              {t('sponsors.generating')}
            </div>
          )}
        </>
      )}
    </div>
  )
}
