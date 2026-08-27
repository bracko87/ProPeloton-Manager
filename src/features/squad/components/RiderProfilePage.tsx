/**
 * RiderProfilePage.tsx
 *
 * Latest update:
 * - Unified transfer-list active statuses across loaders
 * - Release is blocked while a rider is transfer listed
 * - Transfer-list state is visible in the header area
 * - Added optional roster refresh and compare callbacks
 * - Compare now behaves like an in-page tab instead of navigating away
 * - Generalized the medical report card so both injuries and sicknesses show full details
 * - Localized rendered rider-profile UI through riderProfile resources
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import appI18n from '../../../i18n'
import { supabase } from '../../../lib/supabase'
import RiderComparePanel from './RiderComparePanel'

import type {
  RenewalNegotiationData,
  RiderCurrentHealthCase,
  RiderDetails,
} from '../types'
import type { TeamType } from '../types'

import {
  formatShortGameDate,
  getAgeFromBirthDate,
  getContractExpiryUi,
  getDaysRemaining,
  getMovementWindowInfo,
  getRenewalStartLabel,
  isFutureDateTime,
} from '../utils/dates'

import {
  formatCaseStageLabel,
  formatHealthCaseCode,
  formatMoney,
  formatSalary,
  formatSeverityLabel,
  formatUnavailableReason,
  formatWeeklySalary,
  getCountryName,
  getSeasonWage,
} from '../utils/formatters'

import {
  getDefaultRiderAvailabilityStatus,
  getFatigueUi,
  getHealthPanelNote,
  getMoraleUi,
  getPotentialUi,
  getRenewalErrorMessage,
  getRiderImageUrl,
  getRiderStatusUi,
} from '../utils/rider-ui'

type RiderProfileTab = 'overview' | 'contract' | 'training' | 'analysis' | 'compare' | 'history'

const RIDER_PROFILE_TABS: RiderProfileTab[] = [
  'overview',
  'contract',
  'training',
  'analysis',
  'compare',
  'history',
]

function rp(key: string, options?: Record<string, unknown>): string {
  return String(appI18n.t(`riderProfile:${key}`, options))
}

function getRiderProfileLocale(): string {
  const language = appI18n.resolvedLanguage ?? appI18n.language ?? 'en'
  return language.startsWith('sr') ? 'sr-Latn-RS' : 'en-GB'
}

function localizeKnownStatusLabel(label?: string | null): string {
  if (!label) return '—'

  const normalized = label.trim().toLowerCase().replace(/[\s-]+/g, '_')
  const keyByLabel: Record<string, string> = {
    fit: 'statusLabels.fit',
    injured: 'statusLabels.injured',
    sick: 'statusLabels.sick',
    not_fully_fit: 'statusLabels.notFullyFit',
    fresh: 'statusLabels.fresh',
    normal: 'statusLabels.normal',
    tired: 'statusLabels.tired',
    very_tired: 'statusLabels.veryTired',
    exhausted: 'statusLabels.exhausted',
    bad: 'statusLabels.bad',
    low: 'statusLabels.low',
    okay: 'statusLabels.okay',
    good: 'statusLabels.good',
    great: 'statusLabels.great',
    limited: 'statusLabels.limited',
    average: 'statusLabels.average',
    promising: 'statusLabels.promising',
    high: 'statusLabels.high',
    elite: 'statusLabels.elite',
    active: 'statusLabels.active',
    recovering: 'statusLabels.recovering',
    resolved: 'statusLabels.resolved',
    blocked: 'statusLabels.blocked',
    allowed: 'statusLabels.allowed',
    injury: 'statusLabels.injury',
    sickness: 'statusLabels.sickness',
  }

  return keyByLabel[normalized] ? rp(keyByLabel[normalized]) : label
}

function getRequestedRiderProfileTab(search: string): RiderProfileTab {
  const requestedTab = new URLSearchParams(search).get('tab')

  return RIDER_PROFILE_TABS.includes(requestedTab as RiderProfileTab)
    ? (requestedTab as RiderProfileTab)
    : 'overview'
}
type OfferExtensionValue = '1' | '2'

type PremiumStatusRow = {
  is_premium: boolean
  stripe_status?: string | null
  access_until?: string | null
}

type RiderPerformanceAnalysis = {
  rider_id: string
  generated_at: string
  development_stage: string
  recommended_roles: Array<{
    role: string
    score: number
  }>
  race_suitability: Array<{
    race_type: string
    score: number
    rating: string
  }>
  strengths: Array<{
    key: string
    label: string
    value: number
  }>
  weaknesses: Array<{
    key: string
    label: string
    value: number
  }>
  training_recommendation: {
    focus: string
    intensity: string
    reason: string
  } | null
  performance_trend: {
    direction: string
    recent_races_used: number
  } | null
  coach_note: string | null
}
type RiderSkillViewMode = 'basic' | 'modern'

const RIDER_SKILL_VIEW_MODE_STORAGE_KEY = 'ppm:rider-profile.skill-attributes-view-mode'

function getStoredRiderSkillViewMode(): RiderSkillViewMode {
  if (typeof window === 'undefined') return 'modern'

  try {
    const storedValue = window.localStorage.getItem(RIDER_SKILL_VIEW_MODE_STORAGE_KEY)
    return storedValue === 'basic' || storedValue === 'modern' ? storedValue : 'modern'
  } catch {
    return 'modern'
  }
}

function saveStoredRiderSkillViewMode(mode: RiderSkillViewMode) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(RIDER_SKILL_VIEW_MODE_STORAGE_KEY, mode)
  } catch {
    // Ignore storage errors. The in-page state still changes.
  }
}

type RiderSkillAttributeCode =
  | 'sprint'
  | 'climbing'
  | 'time_trial'
  | 'endurance'
  | 'flat'
  | 'recovery'
  | 'resistance'
  | 'race_iq'
  | 'teamwork'

type RiderSkillDeltaRow = {
  rider_id: string
  attribute_code: RiderSkillAttributeCode
  current_value: number
  old_value: number | null
  new_value: number | null
  delta_value: number | null
  delta_label: string | null
  delta_direction: 'positive' | 'negative' | null
  primary_source: string | null
  week_start_date: string | null
  week_end_date: string | null
  has_visible_delta: boolean
}

type RiderSkillDeltaMap = Partial<Record<RiderSkillAttributeCode, RiderSkillDeltaRow>>

type RiderSkillProgressPoint = {
  week_start_date: string
  week_label: string
  sprint: number
  climbing: number
  time_trial: number
  endurance: number
  flat: number
  recovery: number
  resistance: number
  race_iq: number
  teamwork: number
}

type RiderCareerHistoryRow = {
  season: number | null
  season_label: string
  team_name: string
  points: number
  is_current_season: boolean
  club_id?: string | null
}

type RiderSeasonOverview = {
  points: number
  podiums: number
  jerseys: number
}

type RiderSeasonStatsBox = {
  races: number
  wins: number
  podiums: number
  top10: number
  points: number
}

type RiderMonthlyPointsRow = {
  month_start: string
  month_label: string
  international_points: number
  sprint_points: number
  climb_points: number
}

type RiderRecentRaceRow = {
  race_id?: string | null
  race_name: string
  race_country_code?: string | null
  race_category?: string | null
  race_start_date?: string | null
  race_end_date?: string | null
  race_date: string | null
  stage_count?: number | null
  route_label?: string | null
  finish_position: number | null
  ci_points?: number | null
  result_source?: string | null
}

type RiderCareerHonourRow = {
  id: string
  dateLabel: string
  raceId: string
  raceName: string
  raceCountryCode: string | null
  raceCategory: string | null
  achievementLabel: string
}

type RiderRaceSharpnessUiRow = {
  rider_id: string
  rider_name: string
  club_id: string | null
  club_name: string | null
  race_sharpness: number | string
  race_sharpness_percent: number | string
  race_sharpness_label: string
  race_sharpness_status: string
  badge_tone: 'success' | 'info' | 'warning' | 'danger' | string
  last_raced_on: string | null
  race_days_last_14: number | string
  race_days_last_30: number | string
  total_race_days: number | string
  last_stage_sharpness_delta: number | string
  overload_penalty: number | string
  overload_warning: boolean
  race_sharpness_message: string
}

type AvailabilityStatus = 'fit' | 'not_fully_fit' | 'injured' | 'sick'

type FamilyClub = {
  club_id: string
  club_name: string
  team_label: 'First Team' | 'U23'
}

type ClubRegularTrainingDefaultRow = {
  club_id: string
  team_scope: string
  focus_code: string
  intensity: 'light' | 'normal' | 'hard'
  auto_when_free: boolean
  updated_at?: string
  created_at?: string
}

type RiderRegularTrainingPlanRow = {
  rider_id: string
  club_id: string
  focus_code: string
  intensity: 'light' | 'normal' | 'hard'
  is_active: boolean
  auto_when_free: boolean
  preferred_days: number[] | null
  updated_at?: string
  created_at?: string
}

type FocusedTrainingRider = {
  club_id: string
  rider_id: string
  display_name: string
  assigned_role: string | null
  age_years: number | null
  overall: number | null
  country_code: string | null
  availability_status: AvailabilityStatus
  fatigue: number | null
  source_club_name?: string
  source_club_full_display_name?: string
  team_label?: 'First Team' | 'U23'
}

type RiderTrainingSessionPoint = {
  label: string
  value: number
  focus: string
  intensity: string
  source: string
  date: string | null
  participated: boolean
}

type RiderRecentActivityDay = {
  date: string | null
  label: string
  source: string
  activityType: string
  intensity: string
  fatigueLoad: number
  recoveryBonus: number
  focus: string
  developmentValue: number
  participated: boolean
  raceId: string | null
  raceName: string | null
  stageName: string | null
  stageNumber: number | null
  campName: string | null
  campCity: string | null
  campCountryCode: string | null
  campType: string | null
  campEndDate: string | null
}

type ActiveTransferListing = {
  id: string
  rider_id: string
  seller_club_id: string
  asking_price: number
  listed_on_game_date: string | null
  expires_on_game_date: string | null
  status: string
}

type ReleaseOwnedRiderResult = {
  free_agent_id: string
  rider_id: string
  released_from_club_id: string
  release_cost: number
  remaining_weeks: number
  remaining_salary: number
  expires_on_game_date: string | null
  finance_transaction_id: string | null
}

type RiderReleasePreview = {
  rider_id: string
  main_club_id: string
  weekly_salary: number
  contract_expires_on: string | null
  remaining_days: number
  remaining_weeks: number
  remaining_salary: number
  release_cost: number
  transfer_listed: boolean
  transfer_listing_id: string | null
  blocked_reason: string | null
  season_end_game_date: string | null
  free_agent_expires_on_game_date: string | null
  current_balance: number
  balance_after_release: number
  can_afford: boolean
  can_release: boolean
}

type RiderProfilePageProps = {
  riderId: string
  gameDate?: string | null
  currentTeamType?: TeamType
  trainingPagePath?: string
  onBack: () => void
  onRosterChanged?: () => Promise<void> | void
  onCompareRider?: (payload: {
    riderId: string
    riderName: string
    currentTeamType: TeamType
  }) => void
}

const REGULAR_TRAINING_FOCUS_OPTIONS = [
  'general',
  'recovery',
  'sprint',
  'climbing',
  'flat',
  'time_trial',
  'endurance',
  'resistance',
  'race_iq',
  'teamwork',
] as const

const REGULAR_TRAINING_INTENSITY_OPTIONS: Array<'light' | 'normal' | 'hard'> = [
  'light',
  'normal',
  'hard',
]

const ACTIVE_TRANSFER_LISTING_STATUSES = ['listed', 'active', 'open'] as const

function formatCompactMoneyValue(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'

  const absoluteValue = Math.abs(value)
  const prefix = value < 0 ? '-$' : '$'
  const formatOneDecimal = (amount: number) =>
    new Intl.NumberFormat(getRiderProfileLocale(), {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(amount)

  if (absoluteValue >= 1_000_000_000) {
    return `${prefix}${formatOneDecimal(absoluteValue / 1_000_000_000)}b`
  }

  if (absoluteValue >= 1_000_000) {
    return `${prefix}${formatOneDecimal(absoluteValue / 1_000_000)}m`
  }

  if (absoluteValue >= 100_000) {
    return `${prefix}${Math.floor(absoluteValue / 1_000)}k`
  }

  if (absoluteValue >= 1_000) {
    return `${prefix}${formatOneDecimal(absoluteValue / 1_000)}k`
  }

  return `${prefix}${new Intl.NumberFormat(getRiderProfileLocale()).format(Math.round(absoluteValue))}`
}

function formatSkillDeltaSource(source?: string | null) {
  switch (source) {
    case 'training_camp':
      return rp('skills.trainingCamp')
    case 'regular_training':
      return rp('skills.regularTraining')
    case 'age_decline':
      return rp('skills.ageDecline')
    case 'inactivity_decay':
      return rp('skills.inactivity')
    case 'race_experience':
      return rp('skills.raceExperience')
    default:
      return null
  }
}

function normalizeNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function titleCaseFromSnake(value: string | null | undefined): string {
  if (!value) return '—'
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatTrainingFocusLabel(value: string): string {
  const keyByValue: Record<string, string> = {
    general: 'skills.general',
    recovery: 'skills.recovery',
    sprint: 'skills.sprint',
    climbing: 'skills.climbing',
    flat: 'skills.flat',
    time_trial: 'skills.timeTrial',
    endurance: 'skills.endurance',
    resistance: 'skills.resistance',
    race_iq: 'skills.raceIq',
    teamwork: 'skills.teamwork',
  }
  return keyByValue[value] ? rp(keyByValue[value]) : titleCaseFromSnake(value)
}

function formatTrainingIntensityLabel(value: 'light' | 'normal' | 'hard'): string {
  return rp(`skills.${value}`)
}

function getSkillAccentStyle(attribute: RiderSkillAttributeCode) {
  switch (attribute) {
    case 'sprint':
      return { soft: 'rgba(245, 158, 11, 0.18)' }
    case 'climbing':
      return { soft: 'rgba(16, 185, 129, 0.18)' }
    case 'time_trial':
      return { soft: 'rgba(59, 130, 246, 0.18)' }
    case 'endurance':
      return { soft: 'rgba(139, 92, 246, 0.18)' }
    case 'flat':
      return { soft: 'rgba(6, 182, 212, 0.18)' }
    case 'recovery':
      return { soft: 'rgba(34, 197, 94, 0.18)' }
    case 'resistance':
      return { soft: 'rgba(239, 68, 68, 0.18)' }
    case 'race_iq':
      return { soft: 'rgba(99, 102, 241, 0.18)' }
    case 'teamwork':
      return { soft: 'rgba(236, 72, 153, 0.18)' }
    default:
      return { soft: 'rgba(148, 163, 184, 0.18)' }
  }
}

function formatChartAxisLabel(value: number): string {
  if (value >= 1) return value.toFixed(1).replace(/\.0$/, '')
  if (value >= 0.1) return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function safeCountryCode(countryCode?: string | null) {
  const code = countryCode?.trim().toLowerCase()

  if (!code || !/^[a-z]{2}$/.test(code)) return null

  return code
}

function getCountryFlagUrl(countryCode: string) {
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
}

function CountryFlag({
  countryCode,
  className = '',
}: {
  countryCode?: string | null
  className?: string
}) {
  const safeCode = safeCountryCode(countryCode)
  const countryName = getCountryName(safeCode?.toUpperCase())
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [safeCode])

  const imageClassName = [
    'h-4 w-6 shrink-0 rounded-sm border border-gray-200 object-cover',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const placeholderClassName = [
    'inline-block h-4 w-6 shrink-0 rounded-sm border border-gray-200 bg-gray-100',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (!safeCode || hasError) {
    return <span className={placeholderClassName} title={countryName} aria-label={countryName} />
  }

  return (
    <img
      src={getCountryFlagUrl(safeCode)}
      alt={countryName}
      title={countryName}
      className={imageClassName}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  )
}

function getRecentRaceDatePart(value?: string | null): {
  day: string
  month: string
  year: number
} | null {
  if (!value) return null

  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null

  return {
    day: String(parsed.getUTCDate()).padStart(2, '0'),
    month: parsed.toLocaleDateString(getRiderProfileLocale(), {
      month: 'short',
      timeZone: 'UTC',
    }),
    year: parsed.getUTCFullYear(),
  }
}

function formatRecentRaceDateRange(race: RiderRecentRaceRow): string {
  const startDate = race.race_start_date ?? race.race_date ?? null
  const endDate = race.race_end_date ?? race.race_date ?? null

  const start = getRecentRaceDatePart(startDate)
  const end = getRecentRaceDatePart(endDate)

  if (!start && !end) return '—'
  if (start && !end) return `${start.month} ${start.day}`
  if (!start && end) return `${end.month} ${end.day}`
  if (!start || !end) return '—'

  const sameDate =
    start.day === end.day && start.month === end.month && start.year === end.year

  if (sameDate) return `${start.month} ${start.day}`

  if (start.month === end.month && start.year === end.year) {
    return `${start.month} ${start.day}–${end.day}`
  }

  return `${start.month} ${start.day}–${end.month} ${end.day}`
}

function getRecentRaceSubtitle(race: RiderRecentRaceRow): string {
  const parts: string[] = []

  if (race.route_label) parts.push(race.route_label)
  if (race.stage_count && race.stage_count > 1) {
    parts.push(rp('ownedProfile.stages', { count: race.stage_count }))
  }
  if (race.race_category) parts.push(race.race_category)

  return parts.length > 0 ? parts.join(' · ') : rp('ownedAnalysis.finishedRace')
}

function formatGcPosition(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return String(value)
}

type InjuryCaseCatalogueEntry = {
  code: string
  label: string
  caseType: 'injury' | 'sickness'
  likelyBodyParts: string[]
  minorDays: string
  moderateDays: string
  majorDays: string
  notes: string
}

type InjuryDescriptor = {
  injuryLabel: string
  specificLocationLabel: string
  likelyBodyParts: string[]
  isSpecific: boolean
  typicalRecoveryLabel: string
  catalogueEntry: InjuryCaseCatalogueEntry | null
}

type RiderMedicalSupportImpact = {
  club_id: string
  staff_name: string | null
  specialization: string | null
  risk_multiplier: number | null
  recovery_duration_multiplier: number | null
  daily_recovery_bonus: number | null
  fatigue_floor_reduction: number | null
  risk_reduction_pct: number | null
  recovery_duration_reduction_pct: number | null
  medical_center_level: number | null
  infrastructure_recovery_bonus_pct: number | null
}

const HEALTH_CASE_CATALOGUE: InjuryCaseCatalogueEntry[] = [
  {
    code: 'fracture',
    label: 'Fracture',
    caseType: 'injury',
    likelyBodyParts: ['collarbone', 'wrist/hand', 'ribs', 'shoulder', 'ankle', 'hip/femur'],
    minorDays: '14–28 days',
    moderateDays: '28–56 days',
    majorDays: '56–84 days',
    notes: 'Cycling fractures are often collarbone, wrist/hand, ribs, shoulder or ankle. The exact body part must come from backend case notes if you want one fixed location.',
  },
  {
    code: 'concussion',
    label: 'Concussion',
    caseType: 'injury',
    likelyBodyParts: ['head'],
    minorDays: '7–14 days',
    moderateDays: '14–28 days',
    majorDays: '28–56 days',
    notes: 'Requires cautious return-to-race timing because symptoms can return under effort.',
  },
  {
    code: 'road_rash',
    label: 'Road rash',
    caseType: 'injury',
    likelyBodyParts: ['shoulder', 'elbow', 'hip', 'knee', 'forearm'],
    minorDays: '2–5 days',
    moderateDays: '5–10 days',
    majorDays: '10–18 days',
    notes: 'Usually from crashes. It may not block all training after the acute phase.',
  },
  {
    code: 'muscle_strain',
    label: 'Muscle strain',
    caseType: 'injury',
    likelyBodyParts: ['hamstring', 'calf', 'quadriceps', 'lower back'],
    minorDays: '4–8 days',
    moderateDays: '8–21 days',
    majorDays: '21–42 days',
    notes: 'Often linked to overload, fatigue and hard training blocks.',
  },
  {
    code: 'knee_pain',
    label: 'Knee pain',
    caseType: 'injury',
    likelyBodyParts: ['knee'],
    minorDays: '3–7 days',
    moderateDays: '7–21 days',
    majorDays: '21–45 days',
    notes: 'Can come from overuse, bike fit issues or repeated climbing load.',
  },
  {
    code: 'ankle_sprain',
    label: 'Ankle sprain',
    caseType: 'injury',
    likelyBodyParts: ['ankle', 'foot'],
    minorDays: '5–10 days',
    moderateDays: '10–28 days',
    majorDays: '28–56 days',
    notes: 'More common after crashes or off-bike incidents.',
  },
  {
    code: 'wrist_sprain',
    label: 'Wrist sprain',
    caseType: 'injury',
    likelyBodyParts: ['wrist', 'hand'],
    minorDays: '4–8 days',
    moderateDays: '8–21 days',
    majorDays: '21–42 days',
    notes: 'Often caused by bracing during a crash.',
  },
  {
    code: 'tendonitis',
    label: 'Tendonitis',
    caseType: 'injury',
    likelyBodyParts: ['Achilles', 'knee tendon', 'patellar tendon'],
    minorDays: '7–14 days',
    moderateDays: '14–35 days',
    majorDays: '35–70 days',
    notes: 'Overuse condition. Recovery improves with reduced load and medical support.',
  },
  {
    code: 'saddle_sore',
    label: 'Saddle sore',
    caseType: 'injury',
    likelyBodyParts: ['saddle area', 'groin/hip contact area'],
    minorDays: '2–4 days',
    moderateDays: '4–10 days',
    majorDays: '10–21 days',
    notes: 'Common cycling-specific issue; usually shorter than fractures or muscle tears.',
  },
  {
    code: 'flu',
    label: 'Flu',
    caseType: 'sickness',
    likelyBodyParts: ['whole body', 'respiratory system'],
    minorDays: '3–5 days',
    moderateDays: '5–10 days',
    majorDays: '10–18 days',
    notes: 'Sickness affects the whole body, energy, recovery and training availability.',
  },
  {
    code: 'cold',
    label: 'Cold',
    caseType: 'sickness',
    likelyBodyParts: ['respiratory system'],
    minorDays: '2–4 days',
    moderateDays: '4–7 days',
    majorDays: '7–12 days',
    notes: 'Usually shorter than flu but still reduces training/racing readiness.',
  },
  {
    code: 'stomach_bug',
    label: 'Stomach bug',
    caseType: 'sickness',
    likelyBodyParts: ['stomach', 'digestive system'],
    minorDays: '2–4 days',
    moderateDays: '4–7 days',
    majorDays: '7–12 days',
    notes: 'Can sharply reduce hydration and energy for a few game days.',
  },
  {
    code: 'food_poisoning',
    label: 'Food poisoning',
    caseType: 'sickness',
    likelyBodyParts: ['stomach', 'digestive system'],
    minorDays: '1–3 days',
    moderateDays: '3–6 days',
    majorDays: '6–10 days',
    notes: 'Short but can temporarily block racing and hard training.',
  },
  {
    code: 'respiratory_infection',
    label: 'Respiratory infection',
    caseType: 'sickness',
    likelyBodyParts: ['lungs', 'respiratory system'],
    minorDays: '5–8 days',
    moderateDays: '8–21 days',
    majorDays: '21–35 days',
    notes: 'Longer illness that should strongly affect race readiness.',
  },
  {
    code: 'heat_exhaustion',
    label: 'Heat exhaustion / dehydration',
    caseType: 'sickness',
    likelyBodyParts: ['whole body', 'hydration system'],
    minorDays: '1–3 days',
    moderateDays: '3–7 days',
    majorDays: '7–14 days',
    notes: 'Often linked to heat, poor hydration, race load or insufficient recovery.',
  },
]

function normalizeHealthCaseCode(value?: string | null): string {
  return value?.toLowerCase().trim().replace(/[\s-]+/g, '_') ?? ''
}

function getCatalogueEntryForCaseCode(caseCode?: string | null): InjuryCaseCatalogueEntry | null {
  const normalized = normalizeHealthCaseCode(caseCode)
  if (!normalized) return null

  return (
    HEALTH_CASE_CATALOGUE.find((entry) => normalized === entry.code) ??
    HEALTH_CASE_CATALOGUE.find((entry) => normalized.includes(entry.code)) ??
    HEALTH_CASE_CATALOGUE.find((entry) => entry.code.includes(normalized)) ??
    null
  )
}

function getHealthCaseNotesSearchText(
  healthCase: RiderCurrentHealthCase | null
): string {
  if (!healthCase) return ''

  const rawCase = healthCase as unknown as Record<string, unknown>
  const notes = rawCase.notes

  const directValues = [
    rawCase.body_part,
    rawCase.injured_part,
    rawCase.injury_location,
    rawCase.location,
    rawCase.affected_area,
  ]

  if (notes && typeof notes === 'object' && !Array.isArray(notes)) {
    const record = notes as Record<string, unknown>

    directValues.push(
      record.body_part,
      record.injured_part,
      record.injury_location,
      record.location,
      record.affected_area,
      record.specific_body_part,
      record.body_area
    )
  }

  return directValues
    .map((value) => (value === null || value === undefined ? '' : String(value)))
    .filter(Boolean)
    .join(' ')
}

function getInjuryKeywordSource(
  rider: RiderDetails | null,
  healthCase: RiderCurrentHealthCase | null
): string {
  return [
    rider?.unavailable_reason ?? '',
    healthCase?.case_code ?? '',
    getHealthCaseNotesSearchText(healthCase),
    formatUnavailableReason(rider?.unavailable_reason),
    formatHealthCaseCode(healthCase?.case_code),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function shouldShowHealthCaseReport(
  rider: RiderDetails | null,
  healthCase: RiderCurrentHealthCase | null
): boolean {
  if (!rider) return false

  if (rider.availability_status === 'injured' || rider.availability_status === 'sick') {
    return true
  }

  if (healthCase?.health_case_id && healthCase.case_status !== 'resolved') {
    return true
  }

  const source = getInjuryKeywordSource(rider, healthCase)
  return /(injur|sick|illness|flu|cold|infection|stomach|poison|heat exhaustion|fracture|broken|sprain|strain|tear|bruise|wound|laceration|disloc|crack|pain)/i.test(
    source
  )
}

function getRecoveryRangeForSeverity(
  entry: InjuryCaseCatalogueEntry | null,
  severity?: string | null
): string {
  if (!entry) return rp('ownedMedical.dependsRecovery')

  switch (severity?.toLowerCase()) {
    case 'minor':
      return entry.minorDays
    case 'moderate':
      return entry.moderateDays
    case 'major':
      return entry.majorDays
    default:
      return rp('ownedMedical.minorRange', {
        minor: entry.minorDays,
        moderate: entry.moderateDays,
        major: entry.majorDays,
      })
  }
}

function detectSpecificBodyPartFromText(source: string): string | null {
  const checks: Array<[RegExp, string]> = [
    [/(collarbone|clavicle)/i, 'Collarbone'],
    [/(shoulder)/i, 'Shoulder'],
    [/(wrist)/i, 'Wrist'],
    [/(hand|finger|thumb)/i, 'Hand'],
    [/(rib|chest)/i, 'Ribs / chest'],
    [/(head|concussion|skull|face|jaw)/i, 'Head / face'],
    [/(neck)/i, 'Neck'],
    [/(back|spine|lumbar)/i, 'Back'],
    [/(hip|groin|pelvis)/i, 'Hip / groin'],
    [/(knee|patella)/i, 'Knee'],
    [/(ankle|achilles)/i, 'Ankle / Achilles'],
    [/(foot|toe|heel)/i, 'Foot'],
    [/(hamstring)/i, 'Hamstring'],
    [/(calf)/i, 'Calf'],
    [/(quad|quadricep)/i, 'Quadriceps'],
    [/(leg|tibia|fibula|shin)/i, 'Leg'],
    [/(elbow|arm|forearm)/i, 'Arm / elbow'],
    [/(stomach|digestive|food)/i, 'Stomach / digestive system'],
    [/(lung|respiratory|flu|cold|bronch)/i, 'Respiratory system'],
  ]

  for (const [regex, label] of checks) {
    if (regex.test(source)) return label
  }

  return null
}

function getInjuryDescriptor(
  rider: RiderDetails | null,
  healthCase: RiderCurrentHealthCase | null
): InjuryDescriptor {
  const catalogueEntry = getCatalogueEntryForCaseCode(healthCase?.case_code)
  const injuryLabel =
    formatHealthCaseCode(healthCase?.case_code) ??
    formatUnavailableReason(rider?.unavailable_reason) ??
    rp('owned.injury')

  const source = getInjuryKeywordSource(rider, healthCase)
  const specificBodyPart = detectSpecificBodyPartFromText(source)
  const likelyBodyParts =
    catalogueEntry?.likelyBodyParts ??
    (specificBodyPart ? [specificBodyPart] : [rp('ownedMedical.bodyNotStored')])

  const isSpecific = Boolean(specificBodyPart)

  return {
    injuryLabel,
    specificLocationLabel: specificBodyPart ?? rp('ownedMedical.exactBodyNotSpecified'),
    likelyBodyParts,
    isSpecific,
    typicalRecoveryLabel: getRecoveryRangeForSeverity(catalogueEntry, healthCase?.severity),
    catalogueEntry,
  }
}

function getHealthCaseStatusSummary(
  healthCase: RiderCurrentHealthCase | null,
  isSickness: boolean
): string {
  const caseNoun = isSickness ? rp('owned.illness').toLowerCase() : rp('owned.injury').toLowerCase()

  if (!healthCase?.health_case_id) {
    return rp('ownedMedical.unavailableCase', { case: caseNoun })
  }

  if (healthCase.case_status === 'active') {
    return isSickness ? rp('ownedMedical.activeIllness') : rp('ownedMedical.activeInjury')
  }

  if (healthCase.case_status === 'recovering') {
    return isSickness ? rp('ownedMedical.recoveringIllness') : rp('ownedMedical.recoveringInjury')
  }

  if (healthCase.case_status === 'resolved') {
    return rp('ownedMedical.resolved', { case: caseNoun })
  }

  return rp('ownedMedical.monitoring')
}

function getRecoveryTimelineText(
  recoveryDate: string | null | undefined,
  gameDate: string | null | undefined
): string {
  if (!recoveryDate) return rp('ownedMedical.noRecoveryDate')

  const label = formatShortGameDate(recoveryDate)
  const days = getDaysRemaining(recoveryDate, gameDate ?? null)

  if (days === null) return label
  if (days <= 0) return rp('ownedMedical.fitToday', { date: label })
  return rp(days === 1 ? 'ownedMedical.recoveryDay' : 'ownedMedical.recoveryDays', {
    date: label,
    count: days,
  })
}

function getMedicalCenterRecoveryBonusPct(level: number | null | undefined): number | null {
  if (level === null || level === undefined || !Number.isFinite(level)) return null

  if (level >= 5) return 8
  if (level === 4) return 6.5
  if (level === 3) return 5
  if (level === 2) return 3
  if (level === 1) return 1.5

  return 0
}

function formatReductionPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'

  return `${Math.round(value * 10) / 10}%`
}

function getHealthCaseContextString(
  healthCase: RiderCurrentHealthCase | null,
  key: string
): string | null {
  if (!healthCase) return null

  const record = healthCase as unknown as Record<string, unknown>
  const value = record[key]

  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  return null
}

function getHealthCaseContextNumber(
  healthCase: RiderCurrentHealthCase | null,
  key: string
): number | null {
  if (!healthCase) return null

  const record = healthCase as unknown as Record<string, unknown>
  const value = record[key]

  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function formatHealthCaseSourceLabel(value?: string | null): string {
  switch (value) {
    case 'race':
      return rp('ownedMedical.race')
    case 'training':
      return rp('ownedMedical.training')
    case 'daily_life':
      return rp('ownedMedical.dailyLife')
    case 'travel':
      return rp('ownedMedical.travel')
    case 'weather':
      return rp('ownedMedical.weather')
    case 'manual':
      return rp('ownedMedical.manual')
    case 'unknown':
      return rp('ownedMedical.unknownSource')
    default:
      return value ? titleCaseFromSnake(value) : rp('ownedMedical.unknownSource')
  }
}

function formatOptionalDays(value: number | null): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  return rp(rounded === 1 ? 'ownedMedical.day' : 'ownedMedical.days', { count: rounded })
}

function SectionCard({
  title,
  subtitle,
  children,
  className = '',
  headerAction,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
  headerAction?: React.ReactNode
}) {
  return (
    <div className={`rounded-lg bg-white p-4 shadow ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-slate-500">{subtitle}</div> : null}
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      {children}
    </div>
  )
}

function DetailRow({
  label,
  value,
  valueClassName = '',
}: {
  label: string
  value: React.ReactNode
  valueClassName?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`text-right text-sm font-medium text-slate-800 ${valueClassName}`}>
        {value}
      </div>
    </div>
  )
}

function PremiumLockedPanel({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          {rp('common.premium')}
        </span>
        <span aria-hidden="true" className="text-sm text-slate-500">
          🔒
        </span>
      </div>

      <div className="mt-3 text-base font-semibold text-slate-900">{title}</div>
      <div className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{description}</div>

      <button
        type="button"
        onClick={() => {
          if (typeof window !== 'undefined') {
            window.location.hash = '#/dashboard/pro'
          }
        }}
        className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
      >
        {rp('common.unlockPremium')}
      </button>
    </div>
  )
}

function RiderPerformanceAnalysisPanel({
  analysis,
  loading,
  error,
}: {
  analysis: RiderPerformanceAnalysis | null
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return (
      <SectionCard
        title={rp('owned.performanceAnalysis')}
        subtitle={rp('owned.performanceAnalysisPremium')}
      >
        <div className="text-sm text-slate-500">{rp('owned.loadingAnalysis')}</div>
      </SectionCard>
    )
  }

  if (error) {
    return (
      <SectionCard
        title={rp('owned.performanceAnalysis')}
        subtitle={rp('owned.performanceAnalysisPremium')}
      >
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      </SectionCard>
    )
  }

  if (!analysis) {
    return (
      <SectionCard
        title={rp('owned.performanceAnalysis')}
        subtitle={rp('owned.performanceAnalysisPremium')}
      >
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {rp('owned.noAnalysis')}
        </div>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title={rp('owned.performanceAnalysis')}
      subtitle={rp('owned.analysisSubtitle')}
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {rp('owned.developmentStage')}
            </div>
            <div className="mt-1 text-base font-semibold text-slate-900">
              {titleCaseFromSnake(analysis.development_stage)}
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-900">{rp('owned.strengths')}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {analysis.strengths.map((item) => (
                <span
                  key={item.key}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800"
                >
                  {item.label}: {item.value}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-900">
              {rp('owned.developmentPriorities')}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {analysis.weaknesses.map((item) => (
                <span
                  key={item.key}
                  className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800"
                >
                  {item.label}: {item.value}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              {rp('owned.recommendedRoles')}
            </div>
            <div className="mt-2 space-y-2">
              {analysis.recommended_roles.map((item) => (
                <div
                  key={item.role}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <span>{item.role}</span>
                  <span className="font-semibold text-slate-900">{item.score}/100</span>
                </div>
              ))}
            </div>
          </div>

          {analysis.training_recommendation ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                {rp('owned.trainingRecommendation')}
              </div>
              <div className="mt-1 text-sm font-semibold text-blue-950">
                {formatTrainingFocusLabel(analysis.training_recommendation.focus)} ·{' '}
                {titleCaseFromSnake(analysis.training_recommendation.intensity)}
              </div>
              <div className="mt-2 text-sm leading-6 text-blue-900">
                {analysis.training_recommendation.reason}
              </div>
            </div>
          ) : null}

          {analysis.coach_note ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {rp('owned.coachNote')}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-700">
                {analysis.coach_note}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  )
}

function PerformanceRadarChart({
  items,
}: {
  items: Array<{ label: string; value: number }>
}) {
  const size = 320
  const center = size / 2
  const radius = 112
  const levels = [0.25, 0.5, 0.75, 1]
  const safeItems = items.slice(0, 8)
  const count = Math.max(safeItems.length, 3)

  const pointFor = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2
    const r = radius * Math.max(0, Math.min(100, value)) / 100
    return {
      x: center + Math.cos(angle) * r,
      y: center + Math.sin(angle) * r,
    }
  }

  const polygonPoints = safeItems
    .map((item, index) => {
      const point = pointFor(index, item.value)
      return `${point.x},${point.y}`
    })
    .join(' ')

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto h-auto w-full max-w-[360px]"
        role="img"
        aria-label={rp('owned.radarAria')}
      >
        {levels.map((level) => {
          const points = Array.from({ length: count }, (_, index) => {
            const point = pointFor(index, level * 100)
            return `${point.x},${point.y}`
          }).join(' ')

          return (
            <polygon
              key={level}
              points={points}
              fill="none"
              stroke="#cbd5e1"
              strokeWidth="1"
            />
          )
        })}

        {safeItems.map((item, index) => {
          const outer = pointFor(index, 100)
          const label = pointFor(index, 119)
          const anchor =
            label.x < center - 10
              ? 'end'
              : label.x > center + 10
                ? 'start'
                : 'middle'

          return (
            <g key={item.label}>
              <line
                x1={center}
                y1={center}
                x2={outer.x}
                y2={outer.y}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text
                x={label.x}
                y={label.y}
                textAnchor={anchor}
                dominantBaseline="middle"
                className="fill-slate-600 text-[10px]"
              >
                {item.label}
              </text>
            </g>
          )
        })}

        <polygon
          points={polygonPoints}
          fill="rgba(250, 204, 21, 0.28)"
          stroke="#eab308"
          strokeWidth="3"
        />

        {safeItems.map((item, index) => {
          const point = pointFor(index, item.value)
          return (
            <g key={`${item.label}-point`}>
              <circle cx={point.x} cy={point.y} r="4" fill="#111827" />
              <circle cx={point.x} cy={point.y} r="8" fill="transparent">
                <title>
                  {item.label}: {item.value}
                </title>
              </circle>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function MultiLineTrendChart({
  series,
  labels,
  height = 280,
  yMin,
  yMax,
  yTickCount = 5,
  showVerticalGridLines = false,
  selectableSeries = false,
  lineWidth = 3,
  dotRadius = 4.5,
}: {
  series: Array<{
    name: string
    values: Array<number | null>
    strokeClass: string
  }>
  labels: string[]
  height?: number
  yMin?: number
  yMax?: number
  yTickCount?: number
  showVerticalGridLines?: boolean
  selectableSeries?: boolean
  lineWidth?: number
  dotRadius?: number
}) {
  const [hiddenSeriesNames, setHiddenSeriesNames] = useState<Set<string>>(
    () => new Set(),
  )

  useEffect(() => {
    setHiddenSeriesNames((current) => {
      const availableNames = new Set(series.map((item) => item.name))
      const next = new Set(
        [...current].filter((name) => availableNames.has(name)),
      )

      return next.size === current.size ? current : next
    })
  }, [series])

  const width = 760
  const paddingX = 52
  const paddingTop = 24
  const paddingBottom = 38
  const plotWidth = width - paddingX * 2
  const plotHeight = height - paddingTop - paddingBottom
  const maxLength = Math.max(
    2,
    labels.length,
    ...series.map((item) => item.values.length),
  )

  const visibleSeries = series.filter(
    (item) => !hiddenSeriesNames.has(item.name),
  )

  const numericValues = visibleSeries.flatMap((item) =>
    item.values.filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value),
    ),
  )

  const resolvedMin =
    typeof yMin === 'number'
      ? yMin
      : numericValues.length > 0
        ? Math.min(...numericValues)
        : 0

  const resolvedMax =
    typeof yMax === 'number'
      ? yMax
      : numericValues.length > 0
        ? Math.max(...numericValues)
        : 100

  const range = Math.max(1, resolvedMax - resolvedMin)

  const xFor = (index: number) =>
    paddingX + (index / Math.max(maxLength - 1, 1)) * plotWidth

  const yFor = (value: number) =>
    paddingTop +
    plotHeight -
    ((value - resolvedMin) / range) * plotHeight

  const gridValues = Array.from(
    { length: Math.max(2, yTickCount) },
    (_, index) =>
      resolvedMin +
      (range / Math.max(yTickCount - 1, 1)) * index,
  )

  const buildSegments = (values: Array<number | null>) => {
    const segments: Array<Array<{ index: number; value: number }>> = []
    let current: Array<{ index: number; value: number }> = []

    values.forEach((value, index) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        current.push({ index, value })
      } else if (current.length > 0) {
        segments.push(current)
        current = []
      }
    })

    if (current.length > 0) segments.push(current)
    return segments
  }

  const labelStep = labels.length > 12 ? Math.ceil(labels.length / 10) : 1

  const toggleSeries = (seriesName: string) => {
    if (!selectableSeries) return

    setHiddenSeriesNames((current) => {
      const next = new Set(current)

      if (next.has(seriesName)) {
        next.delete(seriesName)
      } else if (series.length - next.size > 1) {
        next.add(seriesName)
      }

      return next
    })
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[680px] w-full"
        role="img"
        aria-label={rp('owned.trendAria')}
      >
        <rect x="0" y="0" width={width} height={height} rx="16" fill="#f8fafc" />

        {showVerticalGridLines
          ? labels.slice(0, maxLength).map((label, index) => {
              const x = xFor(index)
              return (
                <line
                  key={`vertical-grid-${label}-${index}`}
                  x1={x}
                  x2={x}
                  y1={paddingTop}
                  y2={paddingTop + plotHeight}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                />
              )
            })
          : null}

        {gridValues.map((value) => {
          const y = yFor(value)
          return (
            <g key={value}>
              <line
                x1={paddingX}
                x2={width - paddingX}
                y1={y}
                y2={y}
                stroke="#edf2f7"
                strokeWidth="1"
              />
              <text
                x={paddingX - 12}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-slate-400 text-[10px]"
              >
                {Math.round(value)}
              </text>
            </g>
          )
        })}

        {labels.slice(0, maxLength).map((label, index) => {
          const shouldShow =
            index === 0 || index === labels.length - 1 || index % labelStep === 0
          if (!shouldShow) return null
          return (
            <text
              key={`${label}-${index}`}
              x={xFor(index)}
              y={height - 10}
              textAnchor="middle"
              className="fill-slate-400 text-[10px]"
            >
              {label}
            </text>
          )
        })}

        {visibleSeries.map((item) => {
          const segments = buildSegments(item.values)
          return (
            <g key={item.name}>
              {segments.map((segment, segmentIndex) => {
                const points = segment
                  .map(({ index, value }) => `${xFor(index)},${yFor(value)}`)
                  .join(' ')

                if (segment.length === 1) {
                  const point = segment[0]
                  const x = xFor(point.index)
                  const y = yFor(point.value)
                  return (
                    <line
                      key={`${item.name}-single-${segmentIndex}`}
                      x1={Math.max(paddingX, x - 6)}
                      x2={Math.min(width - paddingX, x + 6)}
                      y1={y}
                      y2={y}
                      className={item.strokeClass}
                      strokeWidth={lineWidth}
                      strokeLinecap="round"
                    />
                  )
                }

                return (
                  <polyline
                    key={`${item.name}-segment-${segmentIndex}`}
                    points={points}
                    fill="none"
                    className={item.strokeClass}
                    strokeWidth={lineWidth}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )
              })}

              {item.values.map((value, index) => {
                if (typeof value !== 'number' || !Number.isFinite(value)) return null
                return (
                  <circle
                    key={`${item.name}-${index}`}
                    cx={xFor(index)}
                    cy={yFor(value)}
                    r={dotRadius}
                    className={item.strokeClass.replace('stroke-', 'fill-')}
                  >
                    <title>
                      {item.name}: {value}
                    </title>
                  </circle>
                )
              })}
            </g>
          )
        })}
      </svg>

      <div className="mt-3 flex flex-wrap gap-x-2 gap-y-2">
        {series.map((item) => {
          const isHidden = hiddenSeriesNames.has(item.name)

          if (!selectableSeries) {
            return (
              <div
                key={item.name}
                className="inline-flex items-center gap-2 text-xs text-slate-600"
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${item.strokeClass.replace('stroke-', 'bg-')}`}
                />
                {item.name}
              </div>
            )
          }

          return (
            <button
              key={item.name}
              type="button"
              onClick={() => toggleSeries(item.name)}
              aria-pressed={!isHidden}
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition ${
                isHidden
                  ? 'border-slate-200 bg-white text-slate-400 opacity-60 hover:opacity-100'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
              title={rp(isHidden ? 'ownedAnalysis.showSeries' : 'ownedAnalysis.hideSeries', {
                name: item.name,
              })}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${item.strokeClass.replace('stroke-', 'bg-')}`}
              />
              {item.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SkillHeatmap({ items }: { items: Array<{ label: string; value: number }> }) {
  function tone(value: number) {
    if (value >= 85) return 'bg-emerald-600 text-white'
    if (value >= 78) return 'bg-emerald-400 text-emerald-950'
    if (value >= 70) return 'bg-yellow-300 text-yellow-950'
    if (value >= 60) return 'bg-amber-200 text-amber-950'
    return 'bg-rose-200 text-rose-950'
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className={`rounded-xl p-4 ${tone(item.value)}`}>
          <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
            {item.label}
          </div>
          <div className="mt-2 text-2xl font-semibold">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

function CircularGauge({
  label,
  value,
  note,
}: {
  label: string
  value: number
  note?: string
}) {
  const clamped = Math.max(0, Math.min(100, value))
  const degrees = clamped * 3.6

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
      <div
        className="mx-auto flex h-28 w-28 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(#facc15 0deg ${degrees}deg, #e2e8f0 ${degrees}deg 360deg)`,
        }}
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white">
          <div>
            <div className="text-2xl font-semibold text-slate-950">{clamped}</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">/100</div>
          </div>
        </div>
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-900">{label}</div>
      {note ? <div className="mt-1 text-xs text-slate-500">{note}</div> : null}
    </div>
  )
}

function RichRiderPerformanceAnalysisPage({
  rider,
  analysis,
  analysisLoading,
  analysisError,
  skillRows,
  seasonOverview,
  seasonStats,
  recentRaces,
  monthlyPointsHistory,
  recentTrainingSessions,
  skillProgressHistory,
  careerHistory,
  raceSharpness,
  profileAge,
  gameDate,
}: {
  rider: RiderDetails
  analysis: RiderPerformanceAnalysis | null
  analysisLoading: boolean
  analysisError: string | null
  skillRows: Array<{
    label: string
    key: RiderSkillAttributeCode
    value?: number | null
  }>
  seasonOverview: RiderSeasonOverview
  seasonStats: RiderSeasonStatsBox
  recentRaces: RiderRecentRaceRow[]
  monthlyPointsHistory: RiderMonthlyPointsRow[]
  recentTrainingSessions: RiderTrainingSessionPoint[]
  skillProgressHistory: RiderSkillProgressPoint[]
  careerHistory: RiderCareerHistoryRow[]
  raceSharpness: RiderRaceSharpnessUiRow | null
  profileAge: number | null
  gameDate?: string | null
}) {
  const [skillHistoryWeeks, setSkillHistoryWeeks] = useState<26 | 52>(52)
  const [showInternationalPoints, setShowInternationalPoints] = useState(true)
  const [showSprintPoints, setShowSprintPoints] = useState(false)
  const [showClimbPoints, setShowClimbPoints] = useState(false)

  const sortedSkills = [...skillRows].sort(
    (a, b) => normalizeNumber(b.value) - normalizeNumber(a.value),
  )
  const strongestSkill = sortedSkills[0] ?? null
  const weakestSkill = sortedSkills[sortedSkills.length - 1] ?? null
  const averageSkill =
    skillRows.length > 0
      ? Math.round(
          skillRows.reduce((sum, item) => sum + normalizeNumber(item.value), 0) /
            skillRows.length,
        )
      : 0

  const racePositions = recentRaces
    .map((race) => race.finish_position)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  const averageFinish =
    racePositions.length > 0
      ? Math.round(
          (racePositions.reduce((sum, value) => sum + value, 0) / racePositions.length) * 10,
        ) / 10
      : null

  const bestRecentFinish = racePositions.length > 0 ? Math.min(...racePositions) : null
  const totalRecentPoints = recentRaces.reduce(
    (sum, race) => sum + normalizeNumber(race.ci_points),
    0,
  )

  const trainingValues = recentTrainingSessions.map((item) => normalizeNumber(item.value))
  const trainingTrend =
    trainingValues.length >= 2 ? trainingValues[trainingValues.length - 1] - trainingValues[0] : 0

  const careerRows = [...careerHistory]
    .filter((row) => Number.isFinite(row.points))
    .reverse()

  const maxRacePosition = Math.max(1, ...racePositions)

  const sharpnessPercent = raceSharpness
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(normalizeNumber(raceSharpness.race_sharpness_percent, 50)),
        ),
      )
    : null

  const ageStage =
    analysis?.development_stage ??
    (profileAge == null
      ? 'stable'
      : profileAge <= 23
        ? 'developing'
        : profileAge >= 35
          ? 'declining'
          : profileAge >= 31
            ? 'near_peak'
            : 'stable')

  const valuePerOverall =
    rider.market_value && rider.overall
      ? rider.market_value / Math.max(rider.overall, 1)
      : null

  const radarItems = skillRows.map((item) => ({
    label: item.label,
    value: normalizeNumber(item.value),
  }))

  const currentSeasonNumber =
    parseSeasonNumber(careerRows.find((row) => row.is_current_season)?.season_label) ??
    parseSeasonNumber(careerRows[careerRows.length - 1]?.season_label) ??
    1

  const currentGameDate = parseGameDate(gameDate)

  const visibleSkillHistory = [...skillProgressHistory]
    .filter((row) => parseGameDate(row.week_start_date).getTime() <= currentGameDate.getTime())
    .sort(
      (a, b) =>
        parseGameDate(a.week_start_date).getTime() - parseGameDate(b.week_start_date).getTime(),
    )
    .slice(-skillHistoryWeeks)

  const skillHistoryLabels = visibleSkillHistory.map((row) => {
    if (row.week_label?.trim()) return row.week_label
    const snapshotDate = parseGameDate(row.week_start_date)
    return snapshotDate.toLocaleDateString(getRiderProfileLocale(), {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    })
  })

  const skillHistorySeries = [
    { name: rp('skills.sprint'), key: 'sprint', strokeClass: 'stroke-amber-500' },
    { name: rp('skills.climbing'), key: 'climbing', strokeClass: 'stroke-emerald-500' },
    { name: rp('skills.timeTrial'), key: 'time_trial', strokeClass: 'stroke-blue-500' },
    { name: rp('skills.endurance'), key: 'endurance', strokeClass: 'stroke-violet-500' },
    { name: rp('skills.flat'), key: 'flat', strokeClass: 'stroke-cyan-500' },
    { name: rp('skills.recovery'), key: 'recovery', strokeClass: 'stroke-green-600' },
    { name: rp('skills.resistance'), key: 'resistance', strokeClass: 'stroke-rose-500' },
    { name: rp('skills.raceIq'), key: 'race_iq', strokeClass: 'stroke-indigo-500' },
    { name: rp('skills.teamwork'), key: 'teamwork', strokeClass: 'stroke-pink-500' },
  ].map((series) => ({
    name: series.name,
    strokeClass: series.strokeClass,
    values: visibleSkillHistory.map((row) =>
      normalizeNumber(row[series.key as keyof RiderSkillProgressPoint]),
    ),
  }))

  const loadedSkillSnapshotCount = visibleSkillHistory.length

  const monthlyCareerTrendLabels = monthlyPointsHistory.map((row) =>
    formatGameMonthSeasonLabel(row.month_start, gameDate, currentSeasonNumber),
  )

  const monthlyCareerTrendSeries = [
    showInternationalPoints
      ? {
          name: rp('ownedAnalysis.internationalPoints'),
          values: monthlyPointsHistory.map((row) => row.international_points),
          strokeClass: 'stroke-slate-800',
        }
      : null,
    showSprintPoints
      ? {
          name: rp('ownedAnalysis.sprintPoints'),
          values: monthlyPointsHistory.map((row) => row.sprint_points),
          strokeClass: 'stroke-emerald-500',
        }
      : null,
    showClimbPoints
      ? {
          name: rp('ownedAnalysis.climbPoints'),
          values: monthlyPointsHistory.map((row) => row.climb_points),
          strokeClass: 'stroke-rose-500',
        }
      : null,
  ].filter(
    (
      series,
    ): series is {
      name: string
      values: number[]
      strokeClass: string
    } => Boolean(series),
  )

  const seasonCareerRows = careerRows.slice(-10)
  const seasonCareerTrendLabels = seasonCareerRows.map((row) => row.season_label)
  const seasonCareerTrendSeries = [
    {
      name: rp('ownedAnalysis.seasonPoints'),
      values: seasonCareerRows.map((row) => normalizeNumber(row.points)),
      strokeClass: 'stroke-violet-500',
    },
  ]

  const raceLabels = recentRaces
    .slice(0, 5)
    .map((race, index) => race.race_name?.slice(0, 10) || `R${index + 1}`)
  const raceSeries = [
    {
      name: rp('ownedAnalysis.finishPosition'),
      values: recentRaces.slice(0, 5).map((race) => normalizeNumber(race.finish_position, 0)),
      strokeClass: 'stroke-emerald-500',
    },
    {
      name: rp('ownedAnalysis.racePoints'),
      values: recentRaces.slice(0, 5).map((race) => normalizeNumber(race.ci_points, 0)),
      strokeClass: 'stroke-amber-500',
    },
  ]

  const localizedAgeStage =
    ageStage === 'developing'
      ? rp('owned.developing')
      : ageStage === 'declining'
        ? rp('owned.declining')
        : ageStage === 'stable'
          ? rp('owned.stable')
          : titleCaseFromSnake(ageStage)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-yellow-300 bg-yellow-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-yellow-800">
                {rp('common.premium')}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {rp('ownedAnalysis.performanceCentre')}
              </span>
            </div>

            <h3 className="mt-3 text-2xl font-semibold text-slate-950">
              {rp('ownedAnalysis.riderPerformanceCentre')}
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              {rp('ownedAnalysis.centreDescription', {
                rider: rider.display_name ?? `${rider.first_name} ${rider.last_name}`,
              })}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AnalysisMetric
              label={rp('common.overall')}
              value={`${rider.overall ?? '—'}%`}
              note={rp('ownedAnalysis.averageSkill', { value: averageSkill })}
            />
            <AnalysisMetric
              label={rp('owned.development')}
              value={localizedAgeStage}
              note={rp('ownedAnalysis.age', { age: profileAge ?? '—' })}
            />
            <AnalysisMetric
              label={rp('ownedProfile.raceSharpness')}
              value={sharpnessPercent == null ? '—' : `${sharpnessPercent}/100`}
              note={raceSharpness?.race_sharpness_label ?? rp('ownedAnalysis.noData')}
            />
            <AnalysisMetric
              label={rp('owned.marketValue')}
              value={formatCompactMoneyValue(rider.market_value)}
              note={
                valuePerOverall == null
                  ? rp('ownedAnalysis.noRatioAvailable')
                  : rp('ownedAnalysis.perOvrPoint', {
                      value: formatCompactMoneyValue(valuePerOverall),
                    })
              }
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <AnalysisCard
          title={rp('ownedAnalysis.performanceRadar')}
          subtitle={rp('ownedAnalysis.performanceRadarSubtitle')}
        >
          <PerformanceRadarChart items={radarItems} />
        </AnalysisCard>

        <AnalysisCard
          title={rp('ownedAnalysis.gauges')}
          subtitle={rp('ownedAnalysis.gaugesSubtitle')}
        >
          <div className="grid grid-cols-2 gap-4">
            <CircularGauge
              label={rp('ownedAnalysis.overallQuality')}
              value={normalizeNumber(rider.overall)}
              note={rp('ownedAnalysis.currentOvr')}
            />
            <CircularGauge
              label={rp('ownedAnalysis.raceReadiness')}
              value={sharpnessPercent ?? 50}
              note={raceSharpness?.race_sharpness_label ?? rp('ownedAnalysis.estimated')}
            />
            <CircularGauge
              label={rp('ownedAnalysis.developmentRoom')}
              value={Math.max(
                0,
                Math.min(
                  100,
                  normalizeNumber(rider.potential) - normalizeNumber(rider.overall) + 50,
                ),
              )}
              note={rp('ownedAnalysis.potentialVsCurrent')}
            />
            <CircularGauge
              label={rp('ownedAnalysis.squadValue')}
              value={Math.max(
                0,
                Math.min(
                  100,
                  valuePerOverall == null ? 50 : Math.round(100 - valuePerOverall / 300),
                ),
              )}
              note={rp('ownedAnalysis.simpleValueEfficiency')}
            />
          </div>
        </AnalysisCard>
      </div>

      <AnalysisCard
        title={rp('ownedAnalysis.attributeHeatmap')}
        subtitle={rp('ownedAnalysis.attributeHeatmapSubtitle')}
      >
        <SkillHeatmap items={radarItems} />
      </AnalysisCard>

      {analysisLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-500">{rp('ownedAnalysis.loadingPremium')}</div>
        </div>
      ) : analysisError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          {analysisError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <AnalysisCard
          title={rp('ownedAnalysis.recentRacePerformance')}
          subtitle={rp('ownedAnalysis.recentRaceSubtitle')}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AnalysisMetric
              label={rp('ownedAnalysis.racesUsed')}
              value={String(recentRaces.length)}
              note={rp('ownedAnalysis.latestResults')}
            />
            <AnalysisMetric
              label={rp('ownedAnalysis.averageFinish')}
              value={averageFinish == null ? '—' : String(averageFinish)}
              note={rp('ownedAnalysis.lowerBetter')}
            />
            <AnalysisMetric
              label={rp('ownedAnalysis.bestFinish')}
              value={bestRecentFinish == null ? '—' : String(bestRecentFinish)}
              note={rp('ownedAnalysis.recentSample')}
            />
            <AnalysisMetric
              label={rp('ownedAnalysis.recentPoints')}
              value={String(totalRecentPoints)}
              note={rp('ownedAnalysis.fromLoadedRaces')}
            />
          </div>

          {recentRaces.length > 0 ? (
            <>
              <div className="mt-5">
                <MultiLineTrendChart series={raceSeries} labels={raceLabels} height={300} />
              </div>
              <div className="mt-5 space-y-3">
                {recentRaces.slice(0, 5).map((race, index) => {
                  const position = race.finish_position
                  const width =
                    position == null
                      ? 0
                      : Math.max(8, 100 - (Math.max(position, 1) / maxRacePosition) * 85)

                  return (
                    <div
                      key={`${race.race_id ?? race.race_name}-${index}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <CountryFlag
                              countryCode={race.race_country_code}
                              className="h-3.5 w-5"
                            />
                            <div className="truncate text-sm font-semibold text-slate-900">
                              {race.race_name}
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {formatRecentRaceDateRange(race)} · {getRecentRaceSubtitle(race)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold text-slate-950">
                            P{position ?? '—'}
                          </div>
                          <div className="text-xs text-slate-500">
                            {rp('ownedAnalysis.pointsShort', {
                              count: normalizeNumber(race.ci_points),
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              {rp('ownedAnalysis.noRecentData')}
            </div>
          )}
        </AnalysisCard>

        <AnalysisCard
          title={rp('ownedAnalysis.careerPointsTrend')}
          subtitle={rp('ownedAnalysis.careerPointsSubtitle')}
        >
          <div>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {rp('ownedAnalysis.monthlyPoints')}
                </div>
                <div className="mt-1 text-xs text-slate-500">{rp('ownedAnalysis.rolling12')}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={showInternationalPoints}
                    onChange={(event) => setShowInternationalPoints(event.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-800" />
                  {rp('owned.international')}
                </label>

                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={showSprintPoints}
                    onChange={(event) => setShowSprintPoints(event.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  {rp('skills.sprint')}
                </label>

                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={showClimbPoints}
                    onChange={(event) => setShowClimbPoints(event.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  {rp('owned.climb')}
                </label>
              </div>
            </div>

            {monthlyCareerTrendSeries.length > 0 ? (
              <MultiLineTrendChart
                series={monthlyCareerTrendSeries}
                labels={monthlyCareerTrendLabels}
                height={280}
                yMin={0}
              />
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                {rp('owned.selectPointClassification')}
              </div>
            )}
          </div>

          <div className="mt-7 border-t border-slate-200 pt-6">
            <div className="mb-3">
              <div className="text-sm font-semibold text-slate-900">{rp('owned.seasonPoints')}</div>
              <div className="mt-1 text-xs text-slate-500">{rp('owned.latest10Seasons')}</div>
            </div>

            {seasonCareerTrendSeries[0].values.length > 0 ? (
              <MultiLineTrendChart
                series={seasonCareerTrendSeries}
                labels={seasonCareerTrendLabels}
                height={260}
                yMin={0}
              />
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                {rp('owned.seasonHistoryPending')}
              </div>
            )}
          </div>
        </AnalysisCard>
      </div>

      <div id="training-and-skill-development" className="scroll-mt-24">
        <AnalysisCard
          title={rp('owned.trainingDevelopment')}
          subtitle={rp('owned.trainingDevelopmentSubtitle')}
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">{rp('skills.skillProgression')}</div>
              <div className="mt-1 text-sm text-slate-500">
                {rp('skills.skillProgressionDescription')}
              </div>
            </div>

            <div className="inline-flex self-start rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setSkillHistoryWeeks(26)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  skillHistoryWeeks === 26
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {rp('skills.last26Weeks')}
              </button>
              <button
                type="button"
                onClick={() => setSkillHistoryWeeks(52)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  skillHistoryWeeks === 52
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {rp('skills.last52Weeks')}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <MultiLineTrendChart
              series={skillHistorySeries}
              labels={skillHistoryLabels}
              height={320}
              yMin={0}
              yMax={100}
              yTickCount={11}
              showVerticalGridLines
              selectableSeries
              lineWidth={1.5}
              dotRadius={2.25}
            />

            {loadedSkillSnapshotCount <= 1 ? (
              <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
                {loadedSkillSnapshotCount === 1 ? rp('owned.oneSnapshot') : rp('owned.noSnapshot')}
              </div>
            ) : null}
          </div>
        </AnalysisCard>

        <AnalysisCard
          title={rp('owned.performanceMatrix')}
          subtitle={rp('owned.performanceMatrixSubtitle')}
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
            <AnalysisMetric
              label={rp('owned.technical')}
              value={String(
                Math.round(
                  (normalizeNumber(rider.sprint) +
                    normalizeNumber(rider.climbing) +
                    normalizeNumber(rider.time_trial) +
                    normalizeNumber(rider.flat)) /
                    4,
                ),
              )}
              note={rp('owned.coreRacingSkills')}
            />
            <AnalysisMetric
              label={rp('owned.physical')}
              value={String(
                Math.round(
                  (normalizeNumber(rider.endurance) +
                    normalizeNumber(rider.recovery) +
                    normalizeNumber(rider.resistance)) /
                    3,
                ),
              )}
              note={rp('owned.durabilityProfile')}
            />
            <AnalysisMetric
              label={rp('owned.tactical')}
              value={String(
                Math.round((normalizeNumber(rider.race_iq) + normalizeNumber(rider.teamwork)) / 2),
              )}
              note={rp('owned.raceIqTeamwork')}
            />
            <AnalysisMetric
              label={rp('owned.recentForm')}
              value={
                averageFinish == null
                  ? '—'
                  : averageFinish <= 10
                    ? rp('owned.strong')
                    : averageFinish <= 30
                      ? rp('owned.solid')
                      : rp('owned.developing')
              }
              note={
                averageFinish == null
                  ? rp('owned.noSample')
                  : rp('ownedAnalysis.averagePosition', { value: averageFinish })
              }
            />
            <AnalysisMetric
              label={rp('owned.development')}
              value={localizedAgeStage}
              note={rp('ownedAnalysis.age', { age: profileAge ?? '—' })}
            />
            <AnalysisMetric
              label={rp('owned.value')}
              value={
                valuePerOverall == null
                  ? '—'
                  : valuePerOverall < 10000
                    ? rp('owned.efficient')
                    : valuePerOverall < 15000
                      ? rp('owned.fair')
                      : rp('owned.expensive')
              }
              note={valuePerOverall == null ? rp('owned.noRatio') : formatCompactMoneyValue(valuePerOverall)}
            />
          </div>
        </AnalysisCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <AnalysisCard
          title={rp('owned.financialIntelligence')}
          subtitle={rp('owned.financialIntelligenceSubtitle')}
        >
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <CircularGauge
                label={rp('owned.valueEfficiency')}
                value={Math.max(
                  0,
                  Math.min(
                    100,
                    valuePerOverall == null ? 50 : Math.round(100 - valuePerOverall / 300),
                  ),
                )}
                note={rp('owned.marketRelativeOvr')}
              />
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-500">{rp('owned.marketValue')}</span>
                  <span className="text-xl font-semibold text-slate-950">
                    {formatCompactMoneyValue(rider.market_value)}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-500">{rp('owned.askingPrice')}</span>
                  <span className="text-xl font-semibold text-slate-950">
                    {formatCompactMoneyValue(rider.asking_price)}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-500">{rp('owned.valuePerOvr')}</span>
                  <span className="text-xl font-semibold text-slate-950">
                    {valuePerOverall == null ? '—' : formatCompactMoneyValue(valuePerOverall)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-yellow-200 bg-yellow-50 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-yellow-800">
              {rp('owned.valuationSignal')}
            </div>
            <div className="mt-2 text-lg font-semibold text-yellow-950">
              {valuePerOverall == null
                ? rp('owned.insufficientFinancial')
                : valuePerOverall < 10000
                  ? rp('owned.strongValue')
                  : valuePerOverall < 15000
                    ? rp('owned.balancedValue')
                    : rp('owned.premiumPriced')}
            </div>
            <div className="mt-2 text-sm leading-6 text-yellow-900">
              {rider.market_value && rider.overall
                ? rider.market_value / Math.max(rider.overall, 1) > 12_000
                  ? rp('owned.highValuationNote')
                  : rp('owned.reasonableValuationNote')
                : rp('owned.moreDataNote')}
            </div>
          </div>
        </AnalysisCard>

        <AnalysisCard
          title={rp('owned.coachIntelligence')}
          subtitle={rp('owned.coachIntelligenceSubtitle')}
        >
          <div className="grid grid-cols-2 gap-4">
            <CircularGauge
              label={rp('owned.technicalProfile')}
              value={Math.round(
                (normalizeNumber(rider.sprint) +
                  normalizeNumber(rider.climbing) +
                  normalizeNumber(rider.time_trial) +
                  normalizeNumber(rider.flat)) /
                  4,
              )}
              note={rp('owned.coreRaceSkills')}
            />
            <CircularGauge
              label={rp('owned.physicalProfile')}
              value={Math.round(
                (normalizeNumber(rider.endurance) +
                  normalizeNumber(rider.recovery) +
                  normalizeNumber(rider.resistance)) /
                  3,
              )}
              note={rp('owned.durabilityRecovery')}
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AnalysisMetric
              label={rp('owned.primaryStrength')}
              value={strongestSkill?.label ?? '—'}
              note={strongestSkill ? `${normalizeNumber(strongestSkill.value)}/100` : '—'}
            />
            <AnalysisMetric
              label={rp('owned.priorityArea')}
              value={weakestSkill?.label ?? '—'}
              note={weakestSkill ? `${normalizeNumber(weakestSkill.value)}/100` : '—'}
            />
            <AnalysisMetric
              label={rp('owned.recentRacing')}
              value={
                averageFinish == null
                  ? rp('owned.noSample')
                  : rp('ownedAnalysis.averagePositionValue', { value: averageFinish })
              }
              note={rp('ownedAnalysis.racesUsedNote', {
                count: Math.min(recentRaces.length, 5),
              })}
            />
            <AnalysisMetric
              label={rp('owned.trainingDirection')}
              value={
                trainingValues.length < 2
                  ? rp('owned.noSample')
                  : trainingTrend > 0
                    ? rp('owned.improving')
                    : trainingTrend < 0
                      ? rp('owned.declining')
                      : rp('owned.stable')
              }
              note={rp('ownedAnalysis.sessionsUsed', { count: recentTrainingSessions.length })}
            />
          </div>
        </AnalysisCard>
      </div>
    </div>
  )
}

function AnalysisCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <div className="text-lg font-semibold text-slate-950">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-500">{subtitle}</div> : null}
      </div>
      {children}
    </div>
  )
}

function AnalysisMetric({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-slate-950">{value}</div>
      {note ? <div className="mt-1 text-xs leading-5 text-slate-500">{note}</div> : null}
    </div>
  )
}

function HealthCaseReportCard({
  rider,
  healthCase,
  gameDate,
  medicalSupport,
  medicalSupportLoading,
}: {
  rider: RiderDetails
  healthCase: RiderCurrentHealthCase | null
  gameDate: string | null
  medicalSupport: RiderMedicalSupportImpact | null
  medicalSupportLoading: boolean
}) {
  if (!shouldShowHealthCaseReport(rider, healthCase)) return null

  const descriptor = getInjuryDescriptor(rider, healthCase)
  const rawHealthUi = getRiderStatusUi(rider.availability_status)
  const healthUi = { ...rawHealthUi, label: localizeKnownStatusLabel(rawHealthUi.label) }
  const severityLabel = formatSeverityLabel(healthCase?.severity) ?? rp('owned.notSpecified')
  const stageLabel = localizeKnownStatusLabel(
    formatCaseStageLabel(healthCase?.case_status) ?? rp('owned.monitoring'),
  )
  const catalogueEntry = getCatalogueEntryForCaseCode(healthCase?.case_code)
  const isSickness =
    healthCase?.case_type === 'sickness' ||
    catalogueEntry?.caseType === 'sickness' ||
    rider.availability_status === 'sick'
  const caseLabel =
    formatHealthCaseCode(healthCase?.case_code) ??
    (isSickness ? rp('owned.illness') : rp('owned.injury'))
  const recoveryDate = healthCase?.expected_full_recovery_on ?? rider.unavailable_until ?? null
  const recoveryTimeline = getRecoveryTimelineText(recoveryDate, gameDate)
  const statusSummary = getHealthCaseStatusSummary(healthCase, isSickness)
  const unavailableReasonLabel = rider.unavailable_reason
    ? formatUnavailableReason(rider.unavailable_reason)
    : isSickness
      ? rp('owned.illnessUnavailable')
      : rp('owned.injuryUnavailable')

  const sourceType =
    getHealthCaseContextString(healthCase, 'source_type') ?? healthCase?.source ?? 'unknown'
  const sourceLabel = formatHealthCaseSourceLabel(sourceType)
  const bodyPart = getHealthCaseContextString(healthCase, 'body_part')
  const exactLocationLabel =
    bodyPart ??
    (descriptor.isSpecific
      ? descriptor.specificLocationLabel
      : rp('ownedMedical.exactLocationMissing'))

  const baseMinDays = getHealthCaseContextNumber(healthCase, 'base_min_days')
  const baseMaxDays = getHealthCaseContextNumber(healthCase, 'base_max_days')
  const selectedBaseDays = getHealthCaseContextNumber(healthCase, 'selected_base_days')
  const finalRecoveryDays = getHealthCaseContextNumber(healthCase, 'final_recovery_days')
  const medicalStaffReductionPct = getHealthCaseContextNumber(
    healthCase,
    'medical_staff_reduction_pct',
  )
  const infrastructureReductionPct = getHealthCaseContextNumber(
    healthCase,
    'infrastructure_reduction_pct',
  )
  const totalReductionPct = getHealthCaseContextNumber(healthCase, 'total_reduction_pct')

  const baseRangeLabel =
    baseMinDays !== null && baseMaxDays !== null
      ? `${Math.round(baseMinDays)}–${Math.round(baseMaxDays)} ${rp('ownedMedical.days', {
          count: '',
        }).trim()}`
      : null
  const selectedBaseLabel = formatOptionalDays(selectedBaseDays)
  const finalRecoveryLabel = formatOptionalDays(finalRecoveryDays)

  const medicalCenterLevelLabel =
    medicalSupport?.medical_center_level === null || medicalSupport?.medical_center_level === undefined
      ? null
      : rp('ownedMedical.centerLevel', { level: medicalSupport.medical_center_level })

  const panelTitle = isSickness
    ? rp('ownedMedical.illnessOverview')
    : rp('ownedMedical.injuryOverview')
  const panelSubtitle = isSickness
    ? rp('ownedMedical.illnessSubtitle')
    : rp('ownedMedical.injurySubtitle')
  const panelBorderClass = isSickness ? 'border border-amber-200' : 'border border-rose-200'
  const heroClass = isSickness
    ? 'rounded-xl border border-amber-200 bg-amber-50 px-4 py-4'
    : 'rounded-xl border border-rose-200 bg-rose-50 px-4 py-4'
  const eyebrowClass = isSickness
    ? 'text-xs font-semibold uppercase tracking-[0.18em] text-amber-700'
    : 'text-xs font-semibold uppercase tracking-[0.18em] text-rose-700'
  const statusBadgeClass = isSickness
    ? 'inline-flex rounded-full border border-amber-200 bg-white px-3 py-1 text-sm font-semibold'
    : 'inline-flex rounded-full border border-rose-200 bg-white px-3 py-1 text-sm font-semibold'
  const locationLabel = isSickness
    ? rp('ownedMedical.affectedSystem')
    : rp('ownedMedical.location')
  const locationValue = isSickness
    ? bodyPart ?? descriptor.specificLocationLabel
    : exactLocationLabel

  return (
    <SectionCard title={panelTitle} subtitle={panelSubtitle} className={panelBorderClass}>
      <div className="space-y-4">
        <div className={heroClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className={eyebrowClass}>
                {isSickness ? rp('ownedMedical.currentIllness') : rp('ownedMedical.currentInjury')}
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{caseLabel}</div>
              <div className="mt-1 text-sm text-slate-600">{unavailableReasonLabel}</div>
              <div className="mt-2 text-sm text-slate-700">
                <span className="font-semibold">{locationLabel}:</span> {locationValue}
              </div>
              <div className="mt-1 text-sm text-slate-700">
                <span className="font-semibold">{rp('ownedMedical.source')}</span> {sourceLabel}
              </div>
            </div>

            <span className={statusBadgeClass} style={{ color: healthUi.color }}>
              {healthUi.label}
            </span>
          </div>

          <div className="mt-3 text-sm leading-6 text-slate-700">{statusSummary}</div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {rp('ownedMedical.currentStatus')}
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{stageLabel}</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {rp('ownedMedical.severity')}
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{severityLabel}</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {rp('ownedMedical.baseDuration')}
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {selectedBaseLabel ?? baseRangeLabel ?? '—'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {rp('ownedMedical.fitAgain')}
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{recoveryTimeline}</div>
            {finalRecoveryLabel ? (
              <div className="mt-1 text-xs text-slate-500">
                {rp('ownedMedical.finalDuration', { duration: finalRecoveryLabel })}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              {rp('ownedMedical.medicalTeamHelp')}
            </div>

            <div className="mt-2 space-y-1 text-sm leading-6 text-emerald-900">
              {medicalStaffReductionPct !== null ? (
                <div>
                  <span className="font-semibold">{rp('ownedMedical.appliedCase')}</span>{' '}
                  {rp('ownedMedical.shorterRecovery', {
                    value: formatReductionPercent(medicalStaffReductionPct),
                  })}
                </div>
              ) : null}

              {medicalSupportLoading ? (
                <div>{rp('ownedMedical.loadingSupport')}</div>
              ) : medicalSupport ? (
                <>
                  <div>
                    <span className="font-semibold">{rp('ownedMedical.effectiveGroup')}</span>{' '}
                    {medicalSupport.staff_name ?? rp('ownedMedical.defaultGroup')}
                  </div>
                  <div>
                    <span className="font-semibold">{rp('ownedMedical.riskPrevention')}</span>{' '}
                    {rp('ownedMedical.riskReduction', {
                      value: formatReductionPercent(medicalSupport.risk_reduction_pct),
                    })}
                  </div>
                  <div>
                    <span className="font-semibold">{rp('ownedMedical.dailyRecovery')}</span>{' '}
                    +{medicalSupport.daily_recovery_bonus ?? 0}
                  </div>
                  <div>
                    <span className="font-semibold">{rp('ownedMedical.fatigueFloor')}</span>{' '}
                    -{medicalSupport.fatigue_floor_reduction ?? 0}
                  </div>
                </>
              ) : medicalStaffReductionPct !== null ? (
                <div>{rp('ownedMedical.storedStaffReduction')}</div>
              ) : (
                <div>{rp('ownedMedical.staffUnavailable')}</div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
              {rp('ownedMedical.infrastructureHelp')}
            </div>

            <div className="mt-2 space-y-1 text-sm leading-6 text-blue-900">
              {infrastructureReductionPct !== null ? (
                <div>
                  <span className="font-semibold">{rp('ownedMedical.appliedCase')}</span>{' '}
                  {rp('ownedMedical.shorterRecovery', {
                    value: formatReductionPercent(infrastructureReductionPct),
                  })}
                </div>
              ) : null}

              {medicalSupportLoading ? (
                <div>{rp('ownedMedical.loadingInfrastructure')}</div>
              ) : medicalSupport ? (
                <>
                  <div>
                    <span className="font-semibold">
                      {medicalCenterLevelLabel ?? rp('ownedMedical.centerNotFound')}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold">{rp('ownedMedical.currentInfrastructure')}</span>{' '}
                    {formatReductionPercent(medicalSupport.infrastructure_recovery_bonus_pct)}
                  </div>
                </>
              ) : infrastructureReductionPct !== null ? (
                <div>{rp('ownedMedical.storedInfrastructureReduction')}</div>
              ) : (
                <div>{rp('ownedMedical.infrastructureUnavailable')}</div>
              )}

              {totalReductionPct !== null ? (
                <div className="mt-2 rounded-lg border border-blue-200 bg-white/70 px-3 py-2 text-blue-900">
                  <span className="font-semibold">{rp('ownedMedical.totalReduction')}</span>{' '}
                  {formatReductionPercent(totalReductionPct)}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}

function getRaceSharpnessBadgeClass(sharpness: RiderRaceSharpnessUiRow | null): string {
  if (!sharpness) return 'border-slate-200 bg-slate-50 text-slate-500'

  const percent = Math.max(
    0,
    Math.min(100, Math.round(normalizeNumber(sharpness.race_sharpness_percent, 50))),
  )

  if (sharpness.overload_warning || sharpness.badge_tone === 'danger') {
    return 'border-rose-200 bg-rose-50 text-rose-700'
  }
  if (percent >= 80) return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  if (percent >= 65) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (percent >= 50) return 'border-lime-200 bg-lime-50 text-lime-700'
  if (percent >= 40) return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-rose-200 bg-rose-50 text-rose-700'
}

function formatRaceSharpnessShort(sharpness: RiderRaceSharpnessUiRow | null): string {
  if (!sharpness) return '—'
  const percent = Math.max(
    0,
    Math.min(100, Math.round(normalizeNumber(sharpness.race_sharpness_percent, 50))),
  )
  return `${percent}/100 · ${sharpness.race_sharpness_label}`
}

function RaceSharpnessInlineBadge({ sharpness }: { sharpness: RiderRaceSharpnessUiRow | null }) {
  if (!sharpness) return <span className="text-sm font-medium text-slate-500">—</span>

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${getRaceSharpnessBadgeClass(
        sharpness,
      )}`}
      title={sharpness.race_sharpness_message}
    >
      {formatRaceSharpnessShort(sharpness)}
    </span>
  )
}

function SimpleInfoRow({
  label,
  value,
  note,
}: {
  label: string
  value: React.ReactNode
  note?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm text-slate-500">{label}</div>
        <div className="text-right text-sm font-medium text-slate-900">{value}</div>
      </div>
      {note ? <div className="mt-1 text-sm text-slate-600">{note}</div> : null}
    </div>
  )
}

function getSkillDeltaBadgeClasses(deltaDirection?: 'positive' | 'negative' | null) {
  return deltaDirection === 'positive'
    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
    : deltaDirection === 'negative'
      ? 'border-rose-300 bg-rose-50 text-rose-700'
      : 'border-slate-200 bg-slate-100 text-slate-500'
}

function SimpleAttributeRow({
  label,
  attributeCode,
  value,
  deltaLabel,
  deltaDirection,
  sourceLabel,
}: {
  label: string
  attributeCode: RiderSkillAttributeCode
  value: number
  deltaLabel?: string | null
  deltaDirection?: 'positive' | 'negative' | null
  sourceLabel?: string | null
}) {
  const safeValue = Math.max(0, Math.min(100, value))
  const accent = getSkillAccentStyle(attributeCode)
  const deltaClasses = getSkillDeltaBadgeClasses(deltaDirection)

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${Math.max(12, safeValue)}%`,
          background: `linear-gradient(90deg, ${accent.soft} 0%, ${accent.soft} 88%, rgba(255,255,255,0) 100%)`,
        }}
      />
      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0 text-sm font-medium text-slate-700">{label}</div>
        <div className="flex shrink-0 items-center gap-2">
          {deltaLabel ? (
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${deltaClasses}`}
              title={sourceLabel ?? undefined}
            >
              {deltaLabel}
            </span>
          ) : null}
          <div className="w-10 text-right text-base font-semibold text-slate-900">{safeValue}</div>
        </div>
      </div>
    </div>
  )
}

function RenewalFeedbackBox({
  type,
  message,
}: {
  type: 'success' | 'error' | 'info' | null
  message: string | null
}) {
  if (!message) return null
  const classes =
    type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : type === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-slate-200 bg-slate-50 text-slate-600'
  return <div className={`rounded-lg border px-4 py-3 text-sm ${classes}`}>{message}</div>
}

function getRiderActivityBadge(activity: RiderRecentActivityDay): {
  label: string
  className: string
} {
  switch (activity.source) {
    case 'race':
      return { label: rp('ownedActivity.race'), className: 'border-blue-200 bg-blue-50 text-blue-700' }
    case 'training_camp':
      return {
        label: rp('ownedActivity.trainingCamp'),
        className: 'border-amber-200 bg-amber-50 text-amber-700',
      }
    case 'regular_training':
      return {
        label: rp('ownedActivity.training'),
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      }
    case 'recovery':
      return {
        label: rp('ownedActivity.recovery'),
        className: 'border-violet-200 bg-violet-50 text-violet-700',
      }
    default:
      return {
        label: titleCaseFromSnake(activity.activityType || activity.source || 'activity'),
        className: 'border-slate-200 bg-slate-50 text-slate-600',
      }
  }
}

function getRiderActivityMainText(activity: RiderRecentActivityDay): string {
  if (activity.source === 'race') return activity.raceName ?? rp('ownedActivity.raceParticipation')
  if (activity.source === 'training_camp') return activity.campName ?? rp('ownedActivity.trainingCamp')
  if (activity.source === 'regular_training') {
    return rp('ownedActivity.trainingMain', { focus: formatTrainingFocusLabel(activity.focus) })
  }
  return titleCaseFromSnake(activity.activityType || activity.source)
}

function getRiderActivitySecondaryText(activity: RiderRecentActivityDay): string | null {
  if (activity.source === 'race') {
    if (activity.stageName) return activity.stageName
    if (activity.stageNumber !== null) return rp('ownedActivity.stage', { number: activity.stageNumber })
    return rp('ownedActivity.participatedRace')
  }

  if (activity.source === 'training_camp') {
    const parts = [
      activity.campCity,
      activity.campType
        ? rp('ownedActivity.camp', { type: formatTrainingFocusLabel(activity.campType) })
        : null,
      activity.campEndDate
        ? rp('ownedActivity.until', { date: formatShortGameDate(activity.campEndDate) })
        : null,
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : null
  }

  if (activity.source === 'regular_training') {
    return rp('ownedActivity.intensityValue', {
      intensity: formatTrainingIntensityLabel(
        (['light', 'normal', 'hard'].includes(activity.intensity)
          ? activity.intensity
          : 'normal') as 'light' | 'normal' | 'hard',
      ),
    })
  }

  return null
}

function RiderRecentActivityList({ activities }: { activities: RiderRecentActivityDay[] }) {
  const rows = activities.slice(0, 5)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="hidden grid-cols-[100px_130px_minmax(220px,1fr)_120px_130px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
        <div>{rp('ownedActivity.date')}</div>
        <div>{rp('ownedActivity.activity')}</div>
        <div>{rp('ownedActivity.details')}</div>
        <div>{rp('ownedActivity.intensity')}</div>
        <div>{rp('ownedActivity.development')}</div>
      </div>

      <div className="divide-y divide-slate-200">
        {rows.map((activity, index) => {
          const badge = getRiderActivityBadge(activity)
          const mainText = getRiderActivityMainText(activity)
          const secondaryText = getRiderActivitySecondaryText(activity)
          const isTraining =
            activity.source === 'regular_training' || activity.source === 'training_camp'

          return (
            <div
              key={`${activity.date ?? 'unknown'}-${activity.source}-${index}`}
              className="grid gap-3 px-4 py-3 md:grid-cols-[100px_130px_minmax(220px,1fr)_120px_130px] md:items-center"
            >
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 md:hidden">
                  {rp('ownedActivity.date')}
                </div>
                <div className="text-sm font-medium text-slate-800">
                  {activity.date ? formatShortGameDate(activity.date) : activity.label}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 md:hidden">
                  {rp('ownedActivity.activity')}
                </div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
                  {badge.label}
                </span>
              </div>

              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 md:hidden">
                  {rp('ownedActivity.details')}
                </div>
                <div className="truncate text-sm font-semibold text-slate-900" title={mainText}>
                  {mainText}
                </div>
                {secondaryText ? (
                  <div className="mt-0.5 truncate text-xs text-slate-500" title={secondaryText}>
                    {secondaryText}
                  </div>
                ) : null}
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 md:hidden">
                  {rp('ownedActivity.intensity')}
                </div>
                <div className="text-sm text-slate-700">
                  {isTraining
                    ? formatTrainingIntensityLabel(
                        (['light', 'normal', 'hard'].includes(activity.intensity)
                          ? activity.intensity
                          : 'normal') as 'light' | 'normal' | 'hard',
                      )
                    : '—'}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 md:hidden">
                  {rp('ownedActivity.development')}
                </div>
                <div className="text-sm font-medium text-slate-800">
                  {isTraining ? formatChartAxisLabel(activity.developmentValue) : '—'}
                </div>
                {isTraining && activity.fatigueLoad !== 0 ? (
                  <div className="mt-0.5 text-xs text-slate-500">
                    {rp('ownedActivity.fatigue', {
                      value: `${activity.fatigueLoad > 0 ? '+' : ''}${activity.fatigueLoad}`,
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

async function fetchRiderDetailsById(riderId: string): Promise<RiderDetails> {
  const { data, error } = await supabase
    .from('riders')
    .select(
      `
      id,
      country_code,
      first_name,
      last_name,
      display_name,
      role,
      sprint,
      climbing,
      time_trial,
      endurance,
      flat,
      recovery,
      resistance,
      race_iq,
      teamwork,
      morale,
      potential,
      fatigue,
      overall,
      birth_date,
      image_url,
      salary,
      contract_expires_at,
      contract_expires_season,
      market_value,
      asking_price,
      asking_price_manual,
      availability_status,
      unavailable_until,
      unavailable_reason
    `,
    )
    .eq('id', riderId)
    .single()

  if (error) throw error
  const rider = data as RiderDetails
  return {
    ...rider,
    availability_status: rider.availability_status ?? getDefaultRiderAvailabilityStatus(),
  }
}

async function fetchRiderCurrentHealthCaseById(
  riderId: string,
): Promise<RiderCurrentHealthCase | null> {
  const { data, error } = await supabase.rpc('get_rider_current_health_case', {
    p_rider_id: riderId,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return (row ?? null) as RiderCurrentHealthCase | null
}

async function fetchMedicalCenterLevelForClub(clubId: string): Promise<number | null> {
  const tableCandidates = [
    'club_facilities',
    'club_infrastructure_facilities',
    'club_facility_levels',
    'facilities',
  ]

  for (const tableName of tableCandidates) {
    try {
      const { data, error } = await supabase.from(tableName).select('*').eq('club_id', clubId).limit(50)
      if (error || !Array.isArray(data)) continue

      const medicalRow = data.find((row: any) => {
        const code = String(
          row.facility_type ??
            row.facility_code ??
            row.facility_key ??
            row.code ??
            row.type ??
            row.name ??
            '',
        )
          .toLowerCase()
          .replace(/[\s-]+/g, '_')
        return code.includes('medical') || code.includes('health')
      }) as any | undefined

      const rawLevel =
        medicalRow?.level ??
        medicalRow?.facility_level ??
        medicalRow?.current_level ??
        medicalRow?.upgrade_level ??
        null
      const level = normalizeNumber(rawLevel, NaN)
      if (Number.isFinite(level)) return Math.max(0, Math.round(level))
    } catch {
      // Try next table candidate.
    }
  }

  return null
}

async function resolveRiderMedicalSupportClubId(
  riderId: string,
  knownClubId?: string | null,
): Promise<string | null> {
  if (knownClubId?.trim()) return knownClubId.trim()

  const riderClubTableCandidates = [
    'rider_contracts',
    'club_riders',
    'club_rosters',
    'rider_rosters',
    'riders',
  ]

  for (const tableName of riderClubTableCandidates) {
    try {
      const { data, error } = await supabase.from(tableName).select('*').eq('rider_id', riderId).limit(5)
      if (error || !Array.isArray(data)) continue

      const activeRow =
        data.find((row: any) =>
          ['active', 'current', 'signed'].includes(String(row.status ?? '').toLowerCase()),
        ) ?? data[0]
      const clubId =
        activeRow?.club_id ??
        activeRow?.team_id ??
        activeRow?.current_club_id ??
        activeRow?.owner_club_id ??
        activeRow?.parent_club_id ??
        null

      if (typeof clubId === 'string' && clubId.trim() !== '') return clubId.trim()
    } catch {
      // Try next source.
    }
  }

  try {
    const { data, error } = await supabase.rpc('get_my_primary_club_id')
    if (!error && typeof data === 'string' && data.trim() !== '') return data.trim()
  } catch {
    // No fallback.
  }

  return null
}

async function fetchRiderMedicalSupportImpactByClubId(
  clubId: string,
): Promise<RiderMedicalSupportImpact | null> {
  if (!clubId) return null
  let medicalEffectRow: any | null = null

  try {
    const { data, error } = await supabase.rpc('get_team_doctor_effects', { p_club_id: clubId })
    if (!error) medicalEffectRow = Array.isArray(data) ? data[0] ?? null : data ?? null
  } catch {
    medicalEffectRow = null
  }

  const medicalCenterLevel = await fetchMedicalCenterLevelForClub(clubId)
  if (!medicalEffectRow && medicalCenterLevel === null) return null

  const riskMultiplier = normalizeNumber(medicalEffectRow?.risk_multiplier, NaN)
  const recoveryDurationMultiplier = normalizeNumber(
    medicalEffectRow?.recovery_duration_multiplier,
    NaN,
  )
  const dailyRecoveryBonus = normalizeNumber(medicalEffectRow?.daily_recovery_bonus, 0)
  const fatigueFloorReduction = normalizeNumber(medicalEffectRow?.fatigue_floor_reduction, 0)

  return {
    club_id: clubId,
    staff_name: medicalEffectRow?.staff_name ?? null,
    specialization: medicalEffectRow?.specialization ?? null,
    risk_multiplier: Number.isFinite(riskMultiplier) ? riskMultiplier : null,
    recovery_duration_multiplier: Number.isFinite(recoveryDurationMultiplier)
      ? recoveryDurationMultiplier
      : null,
    daily_recovery_bonus: dailyRecoveryBonus,
    fatigue_floor_reduction: fatigueFloorReduction,
    risk_reduction_pct: Number.isFinite(riskMultiplier) ? Math.max(0, (1 - riskMultiplier) * 100) : null,
    recovery_duration_reduction_pct: Number.isFinite(recoveryDurationMultiplier)
      ? Math.max(0, (1 - recoveryDurationMultiplier) * 100)
      : null,
    medical_center_level: medicalCenterLevel,
    infrastructure_recovery_bonus_pct: getMedicalCenterRecoveryBonusPct(medicalCenterLevel),
  }
}

async function fetchRiderMedicalSupportImpact(
  riderId: string,
  knownClubId?: string | null,
): Promise<RiderMedicalSupportImpact | null> {
  const clubId = await resolveRiderMedicalSupportClubId(riderId, knownClubId)
  if (!clubId) return null
  return fetchRiderMedicalSupportImpactByClubId(clubId)
}

type ClubDisplayNameRpcRow = {
  club_id: string
  display_name: string | null
  original_name: string | null
  full_display_name: string | null
}

async function loadClubHistoryDisplayNameMap(
  clubIds: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const uniqueClubIds = Array.from(
    new Set(
      clubIds
        .map((clubId) => clubId?.trim())
        .filter((clubId): clubId is string => Boolean(clubId)),
    ),
  )

  if (uniqueClubIds.length === 0) return {}

  const { data, error } = await supabase.rpc('get_club_display_names_v1', {
    p_club_ids: uniqueClubIds,
  })

  if (error) {
    console.warn('Failed to load club history display names:', error)
    return {}
  }

  const rows = (Array.isArray(data) ? data : []) as ClubDisplayNameRpcRow[]
  return rows.reduce<Record<string, string>>((acc, row) => {
    if (!row?.club_id) return acc
    const label = row.full_display_name?.trim() || row.display_name?.trim()
    if (label) acc[row.club_id] = label
    return acc
  }, {})
}

async function hydrateRiderCareerHistoryRowsForDisplay(
  rows: RiderCareerHistoryRow[],
): Promise<RiderCareerHistoryRow[]> {
  const historyNameByClubId = await loadClubHistoryDisplayNameMap(rows.map((row) => row.club_id))
  return rows.map((row) => {
    const historyDisplayName = row.club_id ? historyNameByClubId[row.club_id] : null
    return historyDisplayName ? { ...row, team_name: historyDisplayName } : row
  })
}

async function fetchRiderCareerHistoryById(riderId: string): Promise<RiderCareerHistoryRow[]> {
  function normalizeRows(rows: any[]): RiderCareerHistoryRow[] {
    const normalized = rows
      .map((row) => {
        const seasonValueRaw =
          row.season ?? row.season_number ?? row.season_id ?? row.year ?? row.current_season ?? null
        const seasonValue =
          typeof seasonValueRaw === 'number'
            ? seasonValueRaw
            : typeof seasonValueRaw === 'string' && seasonValueRaw.trim() !== ''
              ? Number(seasonValueRaw)
              : null

        const seasonLabel =
          row.season_label ??
          row.season_name ??
          (seasonValue !== null && Number.isFinite(seasonValue)
            ? rp('external.seasonLabel', { number: seasonValue })
            : rp('external.unknownSeason'))

        const pointsRaw =
          row.points ??
          row.season_points ??
          row.total_points ??
          row.rider_points ??
          row.points_total ??
          row.current_points ??
          0
        const points =
          typeof pointsRaw === 'number'
            ? pointsRaw
            : typeof pointsRaw === 'string' && pointsRaw.trim() !== ''
              ? Number(pointsRaw)
              : 0

        const isCurrentSeason = Boolean(
          row.is_current_season ??
            row.is_current ??
            row.current_season_flag ??
            row.is_current_team ??
            false,
        )

        const clubIdRaw =
          row.club_id ??
          row.team_id ??
          row.current_club_id ??
          row.source_club_id ??
          row.parent_club_id ??
          null
        const clubId =
          typeof clubIdRaw === 'string' && clubIdRaw.trim() !== '' ? clubIdRaw.trim() : null

        return {
          season: seasonValue !== null && Number.isFinite(seasonValue) ? seasonValue : null,
          season_label: seasonLabel,
          team_name:
            row.team_name ??
            row.club_name ??
            row.team_label ??
            row.club_label ??
            row.squad_name ??
            row.club_display_name ??
            row.team ??
            rp('external.unknownTeam'),
          points: Number.isFinite(points) ? points : 0,
          is_current_season: isCurrentSeason,
          club_id: clubId,
        } as RiderCareerHistoryRow
      })
      .filter((row) => row.team_name || row.season_label)

    return normalized.sort((a, b) => {
      if (a.is_current_season !== b.is_current_season) return a.is_current_season ? -1 : 1
      const aSeason = a.season ?? -1
      const bSeason = b.season ?? -1
      if (aSeason !== bSeason) return bSeason - aSeason
      return a.team_name.localeCompare(b.team_name)
    })
  }

  try {
    const { data, error } = await supabase.rpc('get_rider_career_history', { p_rider_id: riderId })
    if (!error && Array.isArray(data) && data.length > 0) {
      return hydrateRiderCareerHistoryRowsForDisplay(normalizeRows(data))
    }
  } catch {
    // fallback below
  }

  const tableCandidates = [
    'v_rider_career_history',
    'rider_career_history',
    'v_rider_season_history',
    'rider_season_history',
    'v_rider_history',
  ]

  for (const tableName of tableCandidates) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('rider_id', riderId)
        .order('season', { ascending: false })
      if (!error && Array.isArray(data) && data.length > 0) {
        return hydrateRiderCareerHistoryRowsForDisplay(normalizeRows(data))
      }
    } catch {
      // try next source
    }
  }

  return []
}

async function fetchRiderSeasonOverviewById(riderId: string): Promise<RiderSeasonOverview> {
  const normalizeRow = (row: any): RiderSeasonOverview => ({
    points: normalizeNumber(
      row.international_points ?? row.season_points_overall ?? row.points ?? row.season_points ?? row.total_points,
      0,
    ),
    podiums: normalizeNumber(row.podiums ?? row.podium_count ?? row.podium_finishes, 0),
    jerseys: normalizeNumber(row.jerseys ?? row.jersey_count ?? row.special_jerseys, 0),
  })

  try {
    const { data, error } = await supabase
      .from('rider_statistics_page_international_v1')
      .select('international_points, season_points_overall, podiums, jerseys')
      .eq('rider_id', riderId)
      .eq('season_year', 2000)
      .maybeSingle()
    if (!error && data) return normalizeRow(data)
  } catch {
    // fallback below
  }

  try {
    const { data, error } = await supabase.rpc('get_rider_international_points_summary_v1', {
      p_rider_id: riderId,
      p_season_year: 2000,
    })
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data
      if (row) return normalizeRow(row)
    }
  } catch {
    // fallback below
  }

  try {
    const { data, error } = await supabase.rpc('get_rider_season_overview', { p_rider_id: riderId })
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data
      if (row) return normalizeRow(row)
    }
  } catch {
    // fallback below
  }

  for (const tableName of [
    'v_rider_season_overview',
    'rider_season_stats',
    'v_rider_stats_current_season',
    'rider_season_summary',
  ]) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('rider_id', riderId)
        .limit(1)
        .maybeSingle()
      if (!error && data) return normalizeRow(data)
    } catch {
      // try next source
    }
  }

  return { points: 0, podiums: 0, jerseys: 0 }
}

async function fetchRiderSeasonStatsById(riderId: string): Promise<RiderSeasonStatsBox> {
  const normalizeRow = (row: any): RiderSeasonStatsBox => ({
    races: normalizeNumber(row.races ?? row.races_count ?? row.total_races, 0),
    wins: normalizeNumber(row.wins ?? row.win_count ?? row.victories ?? row.stage_wins, 0),
    podiums: normalizeNumber(row.podiums ?? row.podium_count ?? row.podium_finishes, 0),
    top10: normalizeNumber(row.top10 ?? row.top_10 ?? row.top_ten_count, 0),
    points: normalizeNumber(
      row.international_points ?? row.season_points_overall ?? row.points ?? row.season_points ?? row.total_points,
      0,
    ),
  })

  try {
    const { data, error } = await supabase
      .from('rider_statistics_page_international_v1')
      .select('international_points, season_points_overall, stage_wins, podiums')
      .eq('rider_id', riderId)
      .eq('season_year', 2000)
      .maybeSingle()
    if (!error && data) return { ...normalizeRow(data), races: 0, top10: 0 }
  } catch {
    // fallback below
  }

  try {
    const { data, error } = await supabase.rpc('get_rider_international_points_summary_v1', {
      p_rider_id: riderId,
      p_season_year: 2000,
    })
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data
      if (row) return normalizeRow(row)
    }
  } catch {
    // fallback below
  }

  try {
    const { data, error } = await supabase.rpc('get_rider_season_stats_box', { p_rider_id: riderId })
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data
      if (row) return normalizeRow(row)
    }
  } catch {
    // fallback below
  }

  for (const tableName of [
    'v_rider_season_stats_box',
    'rider_season_stats',
    'v_rider_stats_current_season',
    'rider_season_summary',
  ]) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('rider_id', riderId)
        .limit(1)
        .maybeSingle()
      if (!error && data) return normalizeRow(data)
    } catch {
      // try next source
    }
  }

  return { races: 0, wins: 0, podiums: 0, top10: 0, points: 0 }
}

function parseGameDate(value?: string | null): Date {
  if (!value) return new Date()
  const parsed = new Date(value.length <= 10 ? `${value.slice(0, 10)}T00:00:00Z` : value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function parseSeasonNumber(value?: string | null): number | null {
  if (!value) return null
  const match = value.match(/(\d+)/)
  return match ? Number(match[1]) : null
}

function formatGameMonthSeasonLabel(
  dateValue: string | Date,
  currentGameDate: string | null | undefined,
  currentSeasonNumber: number,
): string {
  const date =
    dateValue instanceof Date
      ? dateValue
      : new Date(`${String(dateValue).slice(0, 10)}T00:00:00Z`)
  const gameDate = parseGameDate(currentGameDate)
  if (Number.isNaN(date.getTime())) return ''

  const seasonNumber = Math.max(
    1,
    currentSeasonNumber - (gameDate.getUTCFullYear() - date.getUTCFullYear()),
  )
  const month = date.toLocaleDateString(getRiderProfileLocale(), {
    month: 'short',
    timeZone: 'UTC',
  })
  return `${month} S${seasonNumber}`
}

function buildLastTwelveMonthPointBuckets(gameDate?: string | null): RiderMonthlyPointsRow[] {
  const currentGameDate = parseGameDate(gameDate)
  return Array.from({ length: 12 }, (_, index) => {
    const target = new Date(currentGameDate)
    target.setUTCHours(0, 0, 0, 0)
    target.setUTCDate(1)
    target.setUTCMonth(target.getUTCMonth() - (11 - index))
    return {
      month_start: target.toISOString().slice(0, 10),
      month_label: target.toLocaleDateString(getRiderProfileLocale(), {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      }),
      international_points: 0,
      sprint_points: 0,
      climb_points: 0,
    }
  })
}

function normalizeLastTwelveMonthPointRows(
  rows: any[],
  gameDate?: string | null,
): RiderMonthlyPointsRow[] {
  const buckets = buildLastTwelveMonthPointBuckets(gameDate)
  const bucketMap = new Map(buckets.map((bucket) => [bucket.month_start.slice(0, 7), bucket]))

  for (const row of rows) {
    const rawDate =
      row.month_start ??
      row.race_end_date ??
      row.race_start_date ??
      row.race_date ??
      row.event_date ??
      row.date ??
      row.completed_at ??
      null
    if (!rawDate) continue

    const rawDateText = String(rawDate)
    const parsed = new Date(
      rawDateText.length <= 10 ? `${rawDateText.slice(0, 10)}T00:00:00Z` : rawDateText,
    )
    if (Number.isNaN(parsed.getTime())) continue

    const monthKey = `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`
    const bucket = bucketMap.get(monthKey)
    if (!bucket) continue

    bucket.international_points += normalizeNumber(
      row.international_points ??
        row.ci_points ??
        row.rider_points ??
        row.ranking_points ??
        row.classification_points,
      0,
    )
    bucket.sprint_points += normalizeNumber(
      row.sprint_points ?? row.points_sprint ?? row.sprint_classification_points ?? row.green_jersey_points,
      0,
    )
    bucket.climb_points += normalizeNumber(
      row.climb_points ??
        row.climbing_points ??
        row.points_climb ??
        row.kom_points ??
        row.mountain_points ??
        row.climb_classification_points,
      0,
    )
  }

  return buckets
}

function buildMonthlyPointsFromRecentRaces(
  races: RiderRecentRaceRow[],
  gameDate?: string | null,
): RiderMonthlyPointsRow[] {
  return normalizeLastTwelveMonthPointRows(
    races.map((race) => ({
      race_end_date: race.race_end_date ?? race.race_date ?? race.race_start_date,
      international_points: race.ci_points ?? 0,
      sprint_points: 0,
      climb_points: 0,
    })),
    gameDate,
  )
}

async function fetchRiderLastTwelveMonthPointsById(
  riderId: string,
  gameDate?: string | null,
): Promise<RiderMonthlyPointsRow[] | null> {
  try {
    const { data, error } = await supabase.rpc('get_rider_last_12_month_points_v1', {
      p_rider_id: riderId,
      p_game_date: gameDate ?? null,
    })
    if (error) return null
    if (!Array.isArray(data)) return null
    return normalizeLastTwelveMonthPointRows(data, gameDate)
  } catch {
    return null
  }
}

async function fetchRiderLastFiveRacesById(riderId: string): Promise<RiderRecentRaceRow[]> {
  const normalizeRows = (rows: any[]): RiderRecentRaceRow[] =>
    rows
      .map((row) => {
        const startCity = row.start_city ?? row.start_city_name ?? row.start_location ?? row.start_town ?? null
        const finishCity = row.finish_city ?? row.finish_city_name ?? row.finish_location ?? row.finish_town ?? null
        const routeLabel =
          row.route_label ??
          row.route_name ??
          row.race_route_label ??
          (startCity && finishCity ? `${startCity} → ${finishCity}` : null)

        return {
          race_id: row.race_id ?? row.id ?? null,
          race_name:
            row.race_name ?? row.event_name ?? row.race_label ?? row.stage_name ?? rp('external.unknownRace'),
          race_country_code:
            row.race_country_code ?? row.country_code ?? row.country ?? row.host_country_code ?? null,
          race_category: row.race_category ?? row.category ?? row.race_class ?? null,
          race_start_date:
            row.race_start_date ?? row.start_date ?? row.race_date ?? row.event_date ?? row.date ?? null,
          race_end_date:
            row.race_end_date ?? row.end_date ?? row.race_date ?? row.event_date ?? row.date ?? null,
          race_date: row.race_date ?? row.event_date ?? row.date ?? row.end_date ?? null,
          stage_count: normalizeNumber(row.stage_count ?? row.stages_count ?? row.total_stages, 0) || null,
          route_label: routeLabel,
          finish_position:
            normalizeNumber(
              row.finish_position ?? row.position ?? row.final_position ?? row.result_position,
              0,
            ) || null,
          ci_points:
            normalizeNumber(
              row.ci_points ??
                row.international_points ??
                row.rider_points ??
                row.ranking_points ??
                row.classification_points,
              0,
            ) || null,
          result_source: row.result_source ?? row.source_type ?? null,
        }
      })
      .slice(0, 5)

  try {
    const { data, error } = await supabase.rpc('get_rider_last_five_races', {
      p_rider_id: riderId,
      p_limit: 5,
    })
    if (!error && Array.isArray(data) && data.length > 0) return normalizeRows(data)
  } catch {
    // fallback below
  }

  for (const tableName of [
    'v_rider_recent_results',
    'rider_race_results',
    'race_results',
    'v_rider_results',
  ]) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('rider_id', riderId)
        .order('race_date', { ascending: false })
        .limit(5)
      if (!error && Array.isArray(data) && data.length > 0) return normalizeRows(data)
    } catch {
      // try next source
    }
  }

  return []
}

async function fetchRiderCareerHonoursById(riderId: string): Promise<RiderCareerHonourRow[]> {
  const { data, error } = await supabase.rpc('get_rider_top_historical_results_v1', {
    p_rider_id: riderId,
    p_limit: 5,
  })
  if (error) throw error

  return (Array.isArray(data) ? data : []).map(
    (row: Record<string, unknown>, index): RiderCareerHonourRow => ({
      id: String(row.id ?? row.achievement_id ?? `honour:${index}`),
      dateLabel: typeof row.date_label === 'string' ? row.date_label : '—',
      raceId: typeof row.race_id === 'string' ? row.race_id : '',
      raceName: typeof row.race_name === 'string' ? row.race_name : rp('external.unknownRace'),
      raceCountryCode: typeof row.race_country_code === 'string' ? row.race_country_code : null,
      raceCategory: typeof row.race_category === 'string' ? row.race_category : null,
      achievementLabel:
        typeof row.achievement_label === 'string' ? row.achievement_label : rp('external.careerResult'),
    }),
  )
}

function RiderCareerHonoursCard({
  rows,
  loading,
  raceLinkState,
}: {
  rows: RiderCareerHonourRow[]
  loading: boolean
  raceLinkState: Record<string, unknown>
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <SectionCard
      title={rp('history.careerHonours')}
      subtitle={rp('history.careerHonoursSubtitle')}
      headerAction={
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          aria-expanded={expanded}
        >
          {expanded ? rp('common.collapse') : rp('common.expand')}
          <span aria-hidden="true" className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>
            ⌄
          </span>
        </button>
      }
    >
      {!expanded ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {rp('history.honoursCollapsed')}
        </div>
      ) : loading ? (
        <div className="text-sm text-slate-500">{rp('history.loadingHonours')}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {rp('history.noHonours')}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((item) => (
            <Link
              key={item.id}
              to={`/dashboard/races/${item.raceId}`}
              state={raceLinkState}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-sm transition hover:bg-white"
            >
              <div className="w-[58px] shrink-0 whitespace-nowrap text-xs font-semibold text-slate-900">
                {item.dateLabel}
              </div>
              <div className="h-7 w-px shrink-0 bg-emerald-400" />
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                <CountryFlag countryCode={item.raceCountryCode} />
                <div className="min-w-0 flex-1 truncate font-semibold text-slate-900" title={item.raceName}>
                  {item.raceName}
                </div>
                {item.raceCategory ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    {item.raceCategory}
                  </span>
                ) : null}
                <span className="min-w-0 truncate text-xs text-slate-500">· {item.achievementLabel}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

async function fetchRiderRaceSharpnessById(riderId: string): Promise<RiderRaceSharpnessUiRow | null> {
  const { data, error } = await supabase.rpc('get_rider_race_sharpness_ui_v1', {
    p_club_id: null,
    p_rider_id: riderId,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return (row ?? null) as RiderRaceSharpnessUiRow | null
}

function TransferListModal({
  open,
  onClose,
  rider,
  onUpdated,
  onTransferListingChanged,
}: {
  open: boolean
  onClose: () => void
  rider: RiderDetails | null
  onUpdated: (updatedRider: RiderDetails) => void
  onTransferListingChanged?: () => Promise<void> | void
}) {
  const [askingPriceInput, setAskingPriceInput] = useState('')
  const [defaultAskingPrice, setDefaultAskingPrice] = useState<number | null>(null)
  const [loadingSuggestedPrice, setLoadingSuggestedPrice] = useState(false)
  const [savingPrice, setSavingPrice] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadSuggestedPrice() {
      if (!rider?.id) return
      setLoadingSuggestedPrice(true)
      setMessage(null)
      setMessageType(null)
      setAskingPriceInput(rider.asking_price != null ? String(rider.asking_price) : '')

      try {
        const { data, error } = await supabase.rpc('calculate_rider_default_asking_price', {
          p_rider_id: rider.id,
        })
        if (error) throw error
        if (!mounted) return
        setDefaultAskingPrice(typeof data === 'number' ? data : null)
      } catch (e: any) {
        if (!mounted) return
        setDefaultAskingPrice(null)
        setMessage(e?.message ?? rp('ownedTransfer.suggestedLoadFailed'))
        setMessageType('error')
      } finally {
        if (mounted) setLoadingSuggestedPrice(false)
      }
    }

    if (open && rider?.id) void loadSuggestedPrice()
    else {
      setAskingPriceInput('')
      setDefaultAskingPrice(null)
      setLoadingSuggestedPrice(false)
      setSavingPrice(false)
      setMessage(null)
      setMessageType(null)
    }

    return () => {
      mounted = false
    }
  }, [open, rider?.id, rider?.asking_price])

  async function handlePlaceOnTransferList() {
    if (!rider?.id) return
    const price = Math.round(Number(askingPriceInput))
    if (!Number.isFinite(price) || price < 1000) {
      setMessage(rp('ownedTransfer.minimumPrice'))
      setMessageType('error')
      return
    }

    setSavingPrice(true)
    setMessage(null)
    setMessageType(null)

    try {
      const { error } = await supabase.rpc('list_rider_for_transfer', {
        p_rider_id: rider.id,
        p_asking_price: price,
        p_duration_days: 7,
      })
      if (error) throw error

      const refreshedRider = await fetchRiderDetailsById(rider.id)
      onUpdated(refreshedRider)
      if (onTransferListingChanged) await onTransferListingChanged()
      setAskingPriceInput(refreshedRider.asking_price != null ? String(refreshedRider.asking_price) : '')
      setMessage(rp('ownedTransfer.listedSuccess'))
      setMessageType('success')
    } catch (e: any) {
      setMessage(e?.message ?? rp('ownedTransfer.listedFailed'))
      setMessageType('error')
    } finally {
      setSavingPrice(false)
    }
  }

  async function handleResetToSuggested() {
    if (!rider?.id) return
    setSavingPrice(true)
    setMessage(null)
    setMessageType(null)

    try {
      const { error } = await supabase.rpc('clear_rider_asking_price', { p_rider_id: rider.id })
      if (error) throw error
      const refreshedRider = await fetchRiderDetailsById(rider.id)
      onUpdated(refreshedRider)
      if (onTransferListingChanged) await onTransferListingChanged()
      setAskingPriceInput(refreshedRider.asking_price != null ? String(refreshedRider.asking_price) : '')
      setMessage(rp('ownedTransfer.resetSuccess'))
      setMessageType('success')
    } catch (e: any) {
      setMessage(e?.message ?? rp('ownedTransfer.resetFailed'))
      setMessageType('error')
    } finally {
      setSavingPrice(false)
    }
  }

  if (!open || !rider) return null

  const riderName = rider.display_name ?? `${rider.first_name} ${rider.last_name}`
  const currentAskingPriceDisplay =
    rider.asking_price == null ? '—' : formatCompactMoneyValue(rider.asking_price)
  const suggestedAskingPriceDisplay = loadingSuggestedPrice
    ? rp('ownedTransfer.loading')
    : defaultAskingPrice == null
      ? '—'
      : formatCompactMoneyValue(defaultAskingPrice)
  const pricingModeLabel = rider.asking_price_manual
    ? rp('ownedTransfer.manualPrice')
    : rp('ownedTransfer.suggestedPriceMode')

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
          <div>
            <div className="text-2xl font-semibold text-gray-900">{rp('ownedTransfer.title')}</div>
            <div className="mt-1 text-sm text-gray-500">
              {rp('ownedTransfer.subtitle', { rider: riderName })}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {rp('common.close')}
          </button>
        </div>

        <div className="p-6">
          <div className="space-y-3">
            <DetailRow label={rp('ownedProfile.marketValue')} value={formatCompactMoneyValue(rider.market_value)} />
            <DetailRow label={rp('ownedTransfer.currentAskingPrice')} value={currentAskingPriceDisplay} />
            <DetailRow label={rp('ownedTransfer.suggestedAskingPrice')} value={suggestedAskingPriceDisplay} />
            <DetailRow label={rp('ownedTransfer.pricingMode')} value={pricingModeLabel} />
          </div>

          <div className="mt-6">
            <label className="mb-2 block text-sm font-semibold text-gray-800">
              {rp('ownedTransfer.transferAskingPrice')}
            </label>
            <div className="mb-2 text-sm text-gray-500">{rp('ownedTransfer.setPriceHelp')}</div>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-500">$</span>
              <input
                type="number"
                min={1000}
                value={askingPriceInput}
                onChange={(e) => {
                  setAskingPriceInput(e.target.value)
                  if (message) {
                    setMessage(null)
                    setMessageType(null)
                  }
                }}
                disabled={savingPrice}
                className="w-full rounded-lg border-2 border-yellow-400 bg-yellow-50 py-3 pl-8 pr-4 text-base font-medium text-gray-900 outline-none focus:border-yellow-500 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                placeholder={rp('ownedTransfer.enterPrice')}
              />
            </div>

            {message ? (
              <div
                className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                  messageType === 'success'
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {message}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={handleResetToSuggested}
            disabled={savingPrice}
            className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingPrice ? rp('common.working') : rp('ownedTransfer.resetSuggested')}
          </button>
          <button
            type="button"
            onClick={handlePlaceOnTransferList}
            disabled={savingPrice}
            className="rounded-lg bg-yellow-400 px-5 py-2.5 text-sm font-medium text-black hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingPrice ? rp('common.working') : rp('ownedTransfer.placeOnList')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReleaseRiderModal({
  open,
  rider,
  preview,
  loading,
  busy,
  onClose,
  onConfirm,
  onCancelTransferListing,
}: {
  open: boolean
  rider: RiderDetails | null
  preview: RiderReleasePreview | null
  loading: boolean
  busy: boolean
  onClose: () => void
  onConfirm: () => void
  onCancelTransferListing: () => void
}) {
  if (!open || !rider) return null
  const riderName = rider.display_name ?? `${rider.first_name} ${rider.last_name}`

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="text-2xl font-semibold text-slate-900">{rp('ownedRelease.title')}</div>
          <div className="mt-1 text-sm text-slate-500">
            {rp('ownedRelease.subtitle', { rider: riderName })}
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-sm text-slate-600">{rp('ownedRelease.loading')}</div>
          ) : !preview ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {rp('ownedRelease.previewFailed')}
            </div>
          ) : (
            <div className="space-y-4">
              {preview.blocked_reason ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <div className="font-semibold">{rp('ownedRelease.blocked')}</div>
                  <div className="mt-1">{preview.blocked_reason}</div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <SimpleInfoRow label={rp('ownedRelease.weeklyWage')} value={formatWeeklySalary(preview.weekly_salary)} />
                <SimpleInfoRow label={rp('ownedRelease.contractEnds')} value={formatShortGameDate(preview.contract_expires_on)} />
                <SimpleInfoRow label={rp('ownedRelease.remainingWeeks')} value={`${preview.remaining_weeks}`} />
                <SimpleInfoRow label={rp('ownedRelease.remainingSalary')} value={formatMoney(preview.remaining_salary)} />
                <SimpleInfoRow
                  label={rp('ownedRelease.compensation')}
                  value={<span className="font-bold text-rose-700">{formatMoney(preview.release_cost)}</span>}
                />
                <SimpleInfoRow label={rp('ownedRelease.freeAgentUntil')} value={formatShortGameDate(preview.free_agent_expires_on_game_date)} />
                <SimpleInfoRow label={rp('ownedRelease.currentBalance')} value={formatMoney(preview.current_balance)} />
                <SimpleInfoRow
                  label={rp('ownedRelease.balanceAfter')}
                  value={
                    <span className={preview.balance_after_release < 0 ? 'text-rose-700' : 'text-slate-900'}>
                      {formatMoney(preview.balance_after_release)}
                    </span>
                  }
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {rp('common.cancel')}
          </button>
          {preview?.transfer_listed ? (
            <button
              type="button"
              onClick={onCancelTransferListing}
              className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
            >
              {rp('ownedContract.cancelListingFirst')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || busy || !preview?.can_release}
            className="rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? rp('ownedContract.releasing') : rp('ownedRelease.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RiderProfilePage({
  riderId,
  gameDate,
  currentTeamType = 'first',
  trainingPagePath: _trainingPagePath = '/training',
  onBack,
  onRosterChanged,
}: RiderProfilePageProps) {
  const { t, i18n } = useTranslation('riderProfile')
  const location = useLocation()
  const navigate = useNavigate()
  const uiLocale = i18n.resolvedLanguage?.startsWith('sr') ? 'sr-Latn-RS' : 'en-GB'

  function getRaceDetailReturnState() {
    const currentPath = `${location.pathname}${location.search}${location.hash}`
    return {
      from: 'rider_profile',
      returnTo: currentPath,
      returnLabel: t('external.backToProfile'),
      returnScrollY: typeof window === 'undefined' ? 0 : window.scrollY,
      returnScrollX: typeof window === 'undefined' ? 0 : window.scrollX,
    }
  }

  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [selectedRider, setSelectedRider] = useState<RiderDetails | null>(null)
  const [currentHealthCase, setCurrentHealthCase] = useState<RiderCurrentHealthCase | null>(null)
  const [medicalSupportImpact, setMedicalSupportImpact] = useState<RiderMedicalSupportImpact | null>(null)
  const [medicalSupportLoading, setMedicalSupportLoading] = useState(false)
  const [skillDeltaMap, setSkillDeltaMap] = useState<RiderSkillDeltaMap>({})
  const [skillProgressHistory, setSkillProgressHistory] = useState<RiderSkillProgressPoint[]>([])
  const [activeTab, setActiveTab] = useState<RiderProfileTab>(() => getRequestedRiderProfileTab(location.search))
  const [isPremium, setIsPremium] = useState(false)
  const [premiumStatusLoading, setPremiumStatusLoading] = useState(true)
  const [performanceAnalysis, setPerformanceAnalysis] = useState<RiderPerformanceAnalysis | null>(null)
  const [performanceAnalysisLoading, setPerformanceAnalysisLoading] = useState(false)
  const [performanceAnalysisError, setPerformanceAnalysisError] = useState<string | null>(null)
  const [skillViewMode, setSkillViewMode] = useState<RiderSkillViewMode>(() => getStoredRiderSkillViewMode())
  const [contractActionMessage, setContractActionMessage] = useState<string | null>(null)

  useEffect(() => {
    setActiveTab(getRequestedRiderProfileTab(location.search))
  }, [location.search, riderId])

  useEffect(() => {
    if (!location.hash || activeTab !== 'analysis' || profileLoading) return
    const targetId = location.hash.replace(/^#/, '')
    if (!targetId) return

    let cancelled = false
    let attempt = 0
    const maxAttempts = 12
    const scrollToTarget = () => {
      if (cancelled) return
      const target = document.getElementById(targetId)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      attempt += 1
      if (attempt < maxAttempts) window.setTimeout(scrollToTarget, 100)
    }
    window.setTimeout(scrollToTarget, 0)
    return () => {
      cancelled = true
    }
  }, [activeTab, location.hash, profileLoading, selectedRider?.id])

  const [seasonOverview, setSeasonOverview] = useState<RiderSeasonOverview>({ points: 0, podiums: 0, jerseys: 0 })
  const [seasonStats, setSeasonStats] = useState<RiderSeasonStatsBox>({ races: 0, wins: 0, podiums: 0, top10: 0, points: 0 })
  const [recentRaces, setRecentRaces] = useState<RiderRecentRaceRow[]>([])
  const [monthlyPointsHistory, setMonthlyPointsHistory] = useState<RiderMonthlyPointsRow[]>([])
  const [careerHonours, setCareerHonours] = useState<RiderCareerHonourRow[]>([])
  const [raceSharpness, setRaceSharpness] = useState<RiderRaceSharpnessUiRow | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)

  const [imageUrlInput, setImageUrlInput] = useState('')
  const [imageSaving, setImageSaving] = useState(false)
  const [imageSaveMessage, setImageSaveMessage] = useState<string | null>(null)

  const [renewalBusy, setRenewalBusy] = useState(false)
  const [renewalModalOpen, setRenewalModalOpen] = useState(false)
  const [renewalData, setRenewalData] = useState<RenewalNegotiationData | null>(null)
  const [offerSalaryInput, setOfferSalaryInput] = useState('')
  const [offerExtensionInput, setOfferExtensionInput] = useState<OfferExtensionValue>('1')
  const [renewalResultType, setRenewalResultType] = useState<'success' | 'error' | 'info' | null>(null)
  const [renewalResultMessage, setRenewalResultMessage] = useState<string | null>(null)

  const [transferListOpen, setTransferListOpen] = useState(false)
  const [activeTransferListing, setActiveTransferListing] = useState<ActiveTransferListing | null>(null)
  const [activeTransferOfferCount, setActiveTransferOfferCount] = useState(0)
  const [transferListingBusy, setTransferListingBusy] = useState(false)
  const [releaseBusy, setReleaseBusy] = useState(false)
  const [releaseModalOpen, setReleaseModalOpen] = useState(false)
  const [releasePreview, setReleasePreview] = useState<RiderReleasePreview | null>(null)
  const [releasePreviewLoading, setReleasePreviewLoading] = useState(false)
  const [pageToast, setPageToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)

  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyRows, setHistoryRows] = useState<RiderCareerHistoryRow[]>([])
  const [currentSeasonNumber, setCurrentSeasonNumber] = useState<number | null>(null)

  const [trainingLoading, setTrainingLoading] = useState(false)
  const [trainingError, setTrainingError] = useState<string | null>(null)
  const [trainingMessage, setTrainingMessage] = useState<string | null>(null)
  const [familyClubs, setFamilyClubs] = useState<FamilyClub[]>([])
  const [regularDefaults, setRegularDefaults] = useState<ClubRegularTrainingDefaultRow[]>([])
  const [regularPlans, setRegularPlans] = useState<RiderRegularTrainingPlanRow[]>([])
  const [focusedTrainingRider, setFocusedTrainingRider] = useState<FocusedTrainingRider | null>(null)
  const [regularSavingRiderId, setRegularSavingRiderId] = useState<string | null>(null)
  const [recentTrainingSessions, setRecentTrainingSessions] = useState<RiderTrainingSessionPoint[]>([])
  const [recentActivityDays, setRecentActivityDays] = useState<RiderRecentActivityDay[]>([])
  const [trainingSessionsLoading, setTrainingSessionsLoading] = useState(false)
  const [trainingActivityError, setTrainingActivityError] = useState<string | null>(null)
  const [compareClubId, setCompareClubId] = useState<string | null>(null)

  const regularDefaultsByClubId = useMemo(() => new Map(regularDefaults.map((row) => [row.club_id, row])), [regularDefaults])
  const regularPlansByRiderId = useMemo(() => new Map(regularPlans.map((row) => [row.rider_id, row])), [regularPlans])

  useEffect(() => {
    let mounted = true
    async function loadPremiumStatus() {
      setPremiumStatusLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_my_premium_status')
        if (error) throw error
        const row = (Array.isArray(data) ? data[0] : data) as PremiumStatusRow | null
        if (mounted) setIsPremium(Boolean(row?.is_premium))
      } catch {
        if (mounted) setIsPremium(false)
      } finally {
        if (mounted) setPremiumStatusLoading(false)
      }
    }
    void loadPremiumStatus()
    const handlePremiumStatusChanged = () => void loadPremiumStatus()
    window.addEventListener('premium-status-changed', handlePremiumStatusChanged)
    return () => {
      mounted = false
      window.removeEventListener('premium-status-changed', handlePremiumStatusChanged)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    async function loadPerformanceAnalysis() {
      if (!isPremium || !selectedRider?.id || !focusedTrainingRider?.rider_id) {
        setPerformanceAnalysis(null)
        setPerformanceAnalysisError(null)
        setPerformanceAnalysisLoading(false)
        return
      }
      setPerformanceAnalysisLoading(true)
      setPerformanceAnalysisError(null)
      try {
        const { data, error } = await supabase.rpc('get_my_rider_performance_analysis_v1', { p_rider_id: selectedRider.id })
        if (error) throw error
        if (!mounted) return
        const row = Array.isArray(data) ? data[0] : data
        setPerformanceAnalysis((row ?? null) as RiderPerformanceAnalysis | null)
      } catch (error: any) {
        if (!mounted) return
        setPerformanceAnalysis(null)
        setPerformanceAnalysisError(error?.message ?? t('owned.noAnalysis'))
      } finally {
        if (mounted) setPerformanceAnalysisLoading(false)
      }
    }
    void loadPerformanceAnalysis()
    return () => {
      mounted = false
    }
  }, [isPremium, selectedRider?.id, focusedTrainingRider?.rider_id, t])

  useEffect(() => {
    const riderIdForMedicalSupport = selectedRider?.id ?? null
    const selectedRiderRecord = selectedRider as unknown as Record<string, unknown> | null
    const knownClubId =
      focusedTrainingRider?.club_id ??
      (selectedRiderRecord?.club_id as string | null | undefined) ??
      (selectedRiderRecord?.current_club_id as string | null | undefined) ??
      null
    if (!riderIdForMedicalSupport) {
      setMedicalSupportImpact(null)
      setMedicalSupportLoading(false)
      return
    }

    let mounted = true
    async function loadMedicalSupportImpact() {
      setMedicalSupportLoading(true)
      try {
        const nextImpact = await fetchRiderMedicalSupportImpact(riderIdForMedicalSupport, knownClubId)
        if (mounted) setMedicalSupportImpact(nextImpact)
      } catch {
        if (mounted) setMedicalSupportImpact(null)
      } finally {
        if (mounted) setMedicalSupportLoading(false)
      }
    }
    void loadMedicalSupportImpact()
    return () => {
      mounted = false
    }
  }, [selectedRider?.id, focusedTrainingRider?.club_id])

  function upsertRegularPlanLocal(nextRow: RiderRegularTrainingPlanRow): void {
    setRegularPlans((current) => {
      const existingIndex = current.findIndex((row) => row.rider_id === nextRow.rider_id)
      if (existingIndex === -1) return [...current, nextRow]
      const copy = [...current]
      copy[existingIndex] = nextRow
      return copy
    })
  }

  function buildPlanRowForRider(rider: FocusedTrainingRider): RiderRegularTrainingPlanRow {
    const existing = regularPlansByRiderId.get(rider.rider_id)
    if (existing) return existing
    const defaultRow = regularDefaultsByClubId.get(rider.club_id)
    return {
      rider_id: rider.rider_id,
      club_id: rider.club_id,
      focus_code: defaultRow?.focus_code ?? 'general',
      intensity: defaultRow?.intensity ?? 'normal',
      is_active: true,
      auto_when_free: true,
      preferred_days: null,
    }
  }

  function getEffectiveRegularTraining(rider: FocusedTrainingRider): {
    source: 'override' | 'default' | 'none'
    focus_code: string | null
    intensity: 'light' | 'normal' | 'hard' | null
    auto_when_free: boolean
    is_active: boolean
  } {
    const plan = regularPlansByRiderId.get(rider.rider_id)
    if (plan && plan.is_active) {
      return {
        source: 'override',
        focus_code: plan.focus_code,
        intensity: plan.intensity,
        auto_when_free: plan.auto_when_free,
        is_active: plan.is_active,
      }
    }
    const defaultRow = regularDefaultsByClubId.get(rider.club_id)
    if (defaultRow) {
      return {
        source: 'default',
        focus_code: defaultRow.focus_code,
        intensity: defaultRow.intensity,
        auto_when_free: defaultRow.auto_when_free,
        is_active: true,
      }
    }
    return { source: 'none', focus_code: null, intensity: null, auto_when_free: false, is_active: false }
  }

  function updateRegularPlanDraft(rider: FocusedTrainingRider, patch: Partial<RiderRegularTrainingPlanRow>): void {
    const base = buildPlanRowForRider(rider)
    upsertRegularPlanLocal({ ...base, ...patch, rider_id: rider.rider_id, club_id: rider.club_id })
  }

  async function loadRegularTrainingConfig(familyClubIds: string[]): Promise<void> {
    if (familyClubIds.length === 0) {
      setRegularDefaults([])
      setRegularPlans([])
      return
    }
    const [defaultsRes, plansRes] = await Promise.all([
      supabase.from('club_regular_training_defaults').select('*').in('club_id', familyClubIds),
      supabase.from('rider_regular_training_plans').select('*').in('club_id', familyClubIds),
    ])
    if (defaultsRes.error) throw defaultsRes.error
    if (plansRes.error) throw plansRes.error
    setRegularDefaults((defaultsRes.data ?? []) as ClubRegularTrainingDefaultRow[])
    setRegularPlans((plansRes.data ?? []) as RiderRegularTrainingPlanRow[])
  }

  async function saveRegularTrainingPlan(rider: FocusedTrainingRider): Promise<void> {
    const row = buildPlanRowForRider(rider)
    setRegularSavingRiderId(rider.rider_id)
    setTrainingMessage(null)
    setTrainingError(null)
    try {
      const payload = {
        rider_id: row.rider_id,
        club_id: row.club_id,
        focus_code: row.focus_code,
        intensity: row.intensity,
        is_active: row.is_active,
        auto_when_free: row.auto_when_free,
        preferred_days: row.preferred_days,
      }
      const { error } = await supabase.from('rider_regular_training_plans').upsert(payload, { onConflict: 'rider_id' })
      if (error) throw error
      await loadRegularTrainingConfig(familyClubs.map((item) => item.club_id))
      setTrainingMessage(t('ownedTraining.saveSuccess', { rider: rider.display_name }))
    } catch (err) {
      setTrainingError(err instanceof Error ? err.message : t('ownedTraining.saveFailed'))
    } finally {
      setRegularSavingRiderId(null)
    }
  }

  async function loadActiveTransferListing(targetRiderId: string) {
    const { data: listingRows, error: listingError } = await supabase
      .from('rider_transfer_listings')
      .select('id, rider_id, seller_club_id, asking_price, listed_on_game_date, expires_on_game_date, status')
      .eq('rider_id', targetRiderId)
      .in('status', [...ACTIVE_TRANSFER_LISTING_STATUSES])
      .order('listed_on_game_date', { ascending: false })
      .limit(1)
    if (listingError) throw listingError
    const listing = listingRows?.[0]
    if (!listing) {
      setActiveTransferListing(null)
      setActiveTransferOfferCount(0)
      return
    }
    const { count, error: offersError } = await supabase
      .from('rider_transfer_offers')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listing.id)
      .eq('status', 'open')
    if (offersError) throw offersError
    setActiveTransferListing(listing as ActiveTransferListing)
    setActiveTransferOfferCount(count ?? 0)
  }

  async function loadReleasePreview(targetRiderId: string) {
    setReleasePreviewLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_rider_release_preview', { p_rider_id: targetRiderId })
      if (error) throw error
      setReleasePreview((Array.isArray(data) ? data[0] : data) as RiderReleasePreview | null)
    } catch (e: any) {
      setReleasePreview(null)
      setContractActionMessage(e?.message ?? t('ownedContract.releasePreviewFailed'))
    } finally {
      setReleasePreviewLoading(false)
    }
  }

  async function handleOpenReleaseModal() {
    if (!selectedRider?.id) return
    setPageToast(null)
    setReleaseModalOpen(true)
    setReleasePreview(null)
    await loadReleasePreview(selectedRider.id)
  }

  useEffect(() => {
    let mounted = true
    async function loadRider() {
      setProfileLoading(true)
      setProfileError(null)
      setSelectedRider(null)
      setCurrentHealthCase(null)
      setMedicalSupportImpact(null)
      setMedicalSupportLoading(false)
      setSkillDeltaMap({})
      setContractActionMessage(null)
      setRenewalBusy(false)
      setRenewalModalOpen(false)
      setRenewalData(null)
      setOfferSalaryInput('')
      setOfferExtensionInput('1')
      setRenewalResultType(null)
      setRenewalResultMessage(null)
      setTransferListOpen(false)
      setActiveTransferListing(null)
      setActiveTransferOfferCount(0)
      setTransferListingBusy(false)
      setReleaseBusy(false)
      setReleaseModalOpen(false)
      setReleasePreview(null)
      setReleasePreviewLoading(false)
      setPageToast(null)
      setHistoryLoading(false)
      setHistoryError(null)
      setHistoryRows([])
      setActiveTab(getRequestedRiderProfileTab(location.search))
      setSeasonOverview({ points: 0, podiums: 0, jerseys: 0 })
      setSeasonStats({ races: 0, wins: 0, podiums: 0, top10: 0, points: 0 })
      setRecentRaces([])
      setRaceSharpness(null)
      setImageUrlInput('')
      setImageSaveMessage(null)
      setCurrentSeasonNumber(null)
      setRecentTrainingSessions([])
      setRecentActivityDays([])
      setTrainingSessionsLoading(false)
      setTrainingActivityError(null)
      setCompareClubId(null)

      try {
        const [nextRider, nextHealthCase, deltaResult, gameDatePartsResult] = await Promise.all([
          fetchRiderDetailsById(riderId),
          fetchRiderCurrentHealthCaseById(riderId),
          supabase
            .from('v_rider_skill_card_deltas')
            .select(`rider_id, attribute_code, current_value, old_value, new_value, delta_value, delta_label, delta_direction, primary_source, week_start_date, week_end_date, has_visible_delta`)
            .eq('rider_id', riderId),
          supabase.rpc('get_current_game_date_parts'),
        ])
        if (!mounted) return
        setSelectedRider(nextRider)
        setCurrentHealthCase(nextHealthCase)
        setImageUrlInput(nextRider.image_url ?? '')
        await loadActiveTransferListing(riderId)
        if (deltaResult.error) throw deltaResult.error
        if (gameDatePartsResult.error) throw gameDatePartsResult.error
        const gameDateParts = Array.isArray(gameDatePartsResult.data) ? gameDatePartsResult.data[0] : gameDatePartsResult.data
        setCurrentSeasonNumber(typeof gameDateParts?.season_number === 'number' ? gameDateParts.season_number : null)
        const nextDeltaMap: RiderSkillDeltaMap = {}
        for (const row of (deltaResult.data ?? []) as RiderSkillDeltaRow[]) nextDeltaMap[row.attribute_code] = row
        setSkillDeltaMap(nextDeltaMap)
      } catch (e: any) {
        if (mounted) setProfileError(e?.message ?? t('wrapper.loadFailed'))
      } finally {
        if (mounted) setProfileLoading(false)
      }
    }
    void loadRider()
    return () => {
      mounted = false
    }
  }, [riderId, location.search, t])

  useEffect(() => {
    let mounted = true
    async function loadOverviewExtras() {
      if (!selectedRider?.id) return
      setOverviewLoading(true)
      const targetRiderId = selectedRider.id
      const [overviewResult, statsResult, racesResult, monthlyPointsResult, sharpnessResult, honoursResult] = await Promise.allSettled([
        fetchRiderSeasonOverviewById(targetRiderId),
        fetchRiderSeasonStatsById(targetRiderId),
        fetchRiderLastFiveRacesById(targetRiderId),
        fetchRiderLastTwelveMonthPointsById(targetRiderId, gameDate),
        fetchRiderRaceSharpnessById(targetRiderId),
        fetchRiderCareerHonoursById(targetRiderId),
      ])
      if (!mounted) return
      const loadedRaces = racesResult.status === 'fulfilled' ? racesResult.value : []
      if (overviewResult.status === 'fulfilled') setSeasonOverview(overviewResult.value)
      if (statsResult.status === 'fulfilled') setSeasonStats(statsResult.value)
      if (racesResult.status === 'fulfilled') setRecentRaces(loadedRaces)
      const authoritativeMonthlyPoints = monthlyPointsResult.status === 'fulfilled' ? monthlyPointsResult.value : null
      setMonthlyPointsHistory(authoritativeMonthlyPoints ?? buildMonthlyPointsFromRecentRaces(loadedRaces, gameDate))
      if (sharpnessResult.status === 'fulfilled') setRaceSharpness(sharpnessResult.value)
      if (honoursResult.status === 'fulfilled') setCareerHonours(honoursResult.value)
      setOverviewLoading(false)
    }
    void loadOverviewExtras()
    return () => {
      mounted = false
    }
  }, [selectedRider?.id, gameDate])

  useEffect(() => {
    let mounted = true
    async function loadTrainingConfig() {
      if (!selectedRider?.id) return
      setTrainingLoading(true)
      setTrainingError(null)
      setTrainingMessage(null)
      setFocusedTrainingRider(null)
      setFamilyClubs([])
      setRegularDefaults([])
      setRegularPlans([])

      try {
        const { data: myClubId, error: clubError } = await supabase.rpc('get_my_primary_club_id')
        if (clubError) throw clubError
        if (!myClubId) throw new Error(t('ownedTraining.noClub'))
        if (mounted) setCompareClubId(String(myClubId))

        const familyRes = await supabase.rpc('get_club_family_ids', { p_club_id: myClubId })
        if (familyRes.error) throw familyRes.error
        const nextFamilyClubs = (familyRes.data ?? []) as FamilyClub[]
        const familyClubIds = nextFamilyClubs.map((row) => row.club_id)
        const historyDisplayNameByClubId = await loadClubHistoryDisplayNameMap(familyClubIds)
        const familyClubMap = new Map(
          nextFamilyClubs.map((row) => [
            row.club_id,
            {
              club_name: row.club_name,
              history_display_name: historyDisplayNameByClubId[row.club_id] ?? row.club_name,
              team_label: row.team_label,
            },
          ]),
        )

        const [rosterRes] = await Promise.all([
          supabase
            .from('club_roster')
            .select('club_id, rider_id, display_name, assigned_role, age_years, overall, country_code, availability_status, fatigue')
            .in('club_id', familyClubIds)
            .eq('rider_id', selectedRider.id)
            .maybeSingle(),
          loadRegularTrainingConfig(familyClubIds),
        ])
        if (rosterRes.error) throw rosterRes.error
        if (!mounted) return
        setFamilyClubs(nextFamilyClubs)

        if (rosterRes.data) {
          const row = rosterRes.data as FocusedTrainingRider
          const source = familyClubMap.get(row.club_id)
          setFocusedTrainingRider({
            ...row,
            source_club_name: source?.history_display_name ?? source?.club_name ?? t('common.unknownClub'),
            source_club_full_display_name: source?.history_display_name ?? source?.club_name ?? t('common.unknownClub'),
            team_label: (source?.team_label ?? 'First Team') as 'First Team' | 'U23',
          })
        } else setFocusedTrainingRider(null)
      } catch (e: any) {
        if (mounted) setTrainingError(e?.message ?? t('ownedTraining.loadFailed'))
      } finally {
        if (mounted) setTrainingLoading(false)
      }
    }
    void loadTrainingConfig()
    return () => {
      mounted = false
    }
  }, [selectedRider?.id, t])

  useEffect(() => {
    let mounted = true
    async function loadSkillProgressHistory() {
      if (!focusedTrainingRider?.rider_id || !isPremium) {
        setSkillProgressHistory([])
        return
      }
      try {
        const { data, error } = await supabase.rpc('get_rider_skill_progress_history_v1', {
          p_rider_id: focusedTrainingRider.rider_id,
          p_weeks: 60,
          p_game_date: gameDate ?? null,
        })
        if (error) throw error
        if (!mounted) return
        setSkillProgressHistory(
          (Array.isArray(data) ? data : []).map((row: any) => ({
            week_start_date: String(row.week_start_date),
            week_label: String(row.week_label ?? ''),
            sprint: normalizeNumber(row.sprint),
            climbing: normalizeNumber(row.climbing),
            time_trial: normalizeNumber(row.time_trial),
            endurance: normalizeNumber(row.endurance),
            flat: normalizeNumber(row.flat),
            recovery: normalizeNumber(row.recovery),
            resistance: normalizeNumber(row.resistance),
            race_iq: normalizeNumber(row.race_iq),
            teamwork: normalizeNumber(row.teamwork),
          })),
        )
      } catch {
        // Keep prior graph when unavailable.
      }
    }
    void loadSkillProgressHistory()
    return () => {
      mounted = false
    }
  }, [focusedTrainingRider?.rider_id, isPremium, gameDate])

  useEffect(() => {
    let mounted = true
    async function loadRecentTrainingActivity() {
      if (!focusedTrainingRider?.rider_id) {
        setRecentTrainingSessions([])
        setRecentActivityDays([])
        setTrainingActivityError(null)
        setTrainingSessionsLoading(false)
        return
      }
      setTrainingSessionsLoading(true)
      setTrainingActivityError(null)
      try {
        const { data, error } = await supabase.rpc('get_rider_recent_activity_v1', {
          p_rider_id: focusedTrainingRider.rider_id,
          p_limit: 20,
        })
        if (error) throw error
        if (!mounted) return
        const normalizedActivities: RiderRecentActivityDay[] = (Array.isArray(data) ? data : []).map(
          (row: any, index: number) => ({
            date: row.activity_date ?? null,
            label: row.activity_date
              ? new Date(`${row.activity_date}T00:00:00Z`).toLocaleDateString(uiLocale, {
                  day: '2-digit',
                  month: '2-digit',
                  timeZone: 'UTC',
                })
              : t('ownedActivity.day', { number: index + 1 }),
            source: String(row.source ?? row.activity_type ?? 'activity'),
            activityType: String(row.activity_type ?? row.source ?? 'activity'),
            intensity: String(row.intensity ?? 'normal'),
            fatigueLoad: Number(row.fatigue_load ?? 0),
            recoveryBonus: Number(row.recovery_bonus ?? 0),
            focus: String(row.focus_code ?? 'general'),
            developmentValue: Number(row.development_value_base ?? 0),
            participated: Boolean(row.session_participated ?? true),
            raceId: row.race_id ? String(row.race_id) : null,
            raceName: row.race_name ? String(row.race_name) : null,
            stageName: row.stage_name ? String(row.stage_name) : null,
            stageNumber: row.stage_number == null ? null : Number(row.stage_number),
            campName: row.camp_name ? String(row.camp_name) : null,
            campCity: row.camp_city ? String(row.camp_city) : null,
            campCountryCode: row.camp_country_code ? String(row.camp_country_code) : null,
            campType: row.camp_type ? String(row.camp_type) : null,
            campEndDate: row.camp_end_date ? String(row.camp_end_date) : null,
          }),
        )
        setRecentActivityDays(normalizedActivities.slice(0, 5))
        setRecentTrainingSessions(
          normalizedActivities
            .filter((activity) => activity.source === 'regular_training' || activity.source === 'training_camp')
            .map((activity) => ({
              label: activity.label,
              value: activity.developmentValue,
              focus: activity.focus,
              intensity: activity.intensity,
              source: activity.source,
              date: activity.date,
              participated: activity.participated,
            }))
            .reverse(),
        )
      } catch (error: any) {
        if (!mounted) return
        setRecentTrainingSessions([])
        setRecentActivityDays([])
        setTrainingActivityError(error?.message ?? t('ownedTraining.activityLoadFailed'))
      } finally {
        if (mounted) setTrainingSessionsLoading(false)
      }
    }
    void loadRecentTrainingActivity()
    return () => {
      mounted = false
    }
  }, [focusedTrainingRider?.rider_id, t, uiLocale])

  useEffect(() => {
    let mounted = true
    async function loadHistory() {
      if (activeTab !== 'history' || !selectedRider?.id || !isPremium) return
      setHistoryLoading(true)
      setHistoryError(null)
      try {
        const rows = await fetchRiderCareerHistoryById(selectedRider.id)
        if (mounted) setHistoryRows(rows)
      } catch (e: any) {
        if (mounted) {
          setHistoryError(e?.message ?? t('external.loadingCareer'))
          setHistoryRows([])
        }
      } finally {
        if (mounted) setHistoryLoading(false)
      }
    }
    void loadHistory()
    return () => {
      mounted = false
    }
  }, [activeTab, selectedRider?.id, isPremium, t])

  async function applyImageChange() {
    if (!selectedRider) return
    setImageSaving(true)
    setImageSaveMessage(null)
    try {
      const nextImageUrl = imageUrlInput.trim()
      if (!/^https?:\/\//i.test(nextImageUrl)) throw new Error(t('ownedProfile.imageInvalid'))
      const { data, error } = await supabase.rpc('update_owned_rider_image_with_coins_v1', {
        p_rider_id: selectedRider.id,
        p_image_url: nextImageUrl,
      })
      if (error) throw error
      const result = Array.isArray(data) ? data[0] : data
      const savedImageUrl = String(result?.image_url ?? nextImageUrl)
      setSelectedRider({ ...selectedRider, image_url: savedImageUrl })
      setImageUrlInput(savedImageUrl)
      setImageSaveMessage(t('ownedProfile.imageUpdated', { coins: Number(result?.coins_charged ?? 5) }))
      window.dispatchEvent(new CustomEvent('coin-balance-changed'))
    } catch (e: any) {
      setImageSaveMessage(e?.message ?? t('ownedProfile.imageUpdateFailed'))
    } finally {
      setImageSaving(false)
    }
  }

  async function handleNewContract() {
    if (!selectedRider) return
    setRenewalBusy(true)
    setContractActionMessage(null)
    setRenewalResultType(null)
    setRenewalResultMessage(null)
    try {
      const { data: openData, error: openError } = await supabase.rpc('open_contract_renewal_negotiation', {
        p_rider_id: selectedRider.id,
      })
      if (openError) throw openError
      const negotiation = Array.isArray(openData) ? openData[0] : openData
      if (!negotiation) throw new Error(t('ownedRenewal.openFailed'))
      const normalized: RenewalNegotiationData = {
        ...negotiation,
        current_contract_expires_at: negotiation.current_contract_expires_at ?? selectedRider.contract_expires_at ?? null,
        attempt_count: negotiation.attempt_count ?? 0,
        max_attempts: negotiation.max_attempts ?? 5,
        cooldown_until: negotiation.cooldown_until ?? null,
      }
      setRenewalData(normalized)
      setOfferSalaryInput(String(normalized.expected_salary_weekly))
      setOfferExtensionInput(normalized.requested_extension_seasons === 2 ? '2' : '1')
      setRenewalModalOpen(true)
    } catch (e: any) {
      const rawMessage = e?.message ?? t('ownedRenewal.openFailed')
      setContractActionMessage(
        rawMessage.includes('No main club found for current user')
          ? t('ownedRenewal.mainClubBackend')
          : getRenewalErrorMessage(rawMessage),
      )
    } finally {
      setRenewalBusy(false)
    }
  }

  const renewalCurrentContractExpiresAt = renewalData?.current_contract_expires_at ?? selectedRider?.contract_expires_at
  const renewalCurrentContractEndSeason = renewalData?.current_contract_end_season ?? selectedRider?.contract_expires_season
  const renewalCurrentStartLabel = getRenewalStartLabel(renewalCurrentContractExpiresAt)
  const renewalDaysRemaining = getDaysRemaining(renewalCurrentContractExpiresAt, gameDate ?? null)

  async function handleSubmitRenewalOffer() {
    if (!renewalData || !selectedRider) return
    setRenewalBusy(true)
    setRenewalResultType(null)
    setRenewalResultMessage(null)
    try {
      const offerSalary = Math.round(Number(offerSalaryInput))
      const offerExtension: 1 | 2 = offerExtensionInput === '2' ? 2 : 1
      if (!Number.isFinite(offerSalary) || offerSalary <= 0) throw new Error(t('ownedRenewal.validSalary'))
      const { data: submitData, error: submitError } = await supabase.rpc('submit_contract_renewal_offer', {
        p_negotiation_id: renewalData.negotiation_id,
        p_offer_salary_weekly: offerSalary,
        p_offer_extension_seasons: offerExtension,
      })
      if (submitError) throw submitError
      const result = Array.isArray(submitData) ? submitData[0] : submitData
      if (!result) throw new Error(t('ownedRenewal.noResult'))

      if (result.accepted) {
        setRenewalResultType('success')
        setRenewalResultMessage(
          result.message ??
            t(offerExtension === 1 ? 'ownedRenewal.extendedOne' : 'ownedRenewal.extendedMany', {
              count: offerExtension,
              date: renewalCurrentStartLabel,
            }),
        )
        setSelectedRider((prev) =>
          prev
            ? {
                ...prev,
                salary: result.new_salary_weekly,
                contract_expires_season: result.new_contract_end_season,
                contract_expires_at: result.new_contract_expires_at ?? prev.contract_expires_at,
                morale: result.new_morale ?? prev.morale,
              }
            : prev,
        )
        setRenewalData((prev) =>
          prev
            ? {
                ...prev,
                attempt_count: result.attempt_count ?? prev.attempt_count,
                current_contract_expires_at: result.new_contract_expires_at ?? prev.current_contract_expires_at,
                current_contract_end_season: result.new_contract_end_season ?? prev.current_contract_end_season,
              }
            : prev,
        )
      } else {
        setRenewalResultType('error')
        setRenewalResultMessage(getRenewalErrorMessage(result.message ?? t('ownedRenewal.riderRejected')))
        setRenewalData((prev) =>
          prev
            ? {
                ...prev,
                attempt_count: result.attempt_count ?? prev.attempt_count,
                cooldown_until: result.cooldown_until ?? prev.cooldown_until ?? null,
              }
            : prev,
        )
        if (typeof result.new_morale === 'number') {
          setSelectedRider((prev) => (prev ? { ...prev, morale: result.new_morale } : prev))
        }
      }
    } catch (e: any) {
      const rawMessage = e?.message ?? t('ownedRenewal.submitFailed')
      const rawDetails = [e?.message, e?.details, e?.hint].filter(Boolean).join(' | ')
      setRenewalResultType('error')
      setRenewalResultMessage(
        e?.code === '23514' || rawDetails.includes('rider_contracts_duration_chk')
          ? t('ownedRenewal.durationBackend')
          : rawMessage,
      )
    } finally {
      setRenewalBusy(false)
    }
  }

  async function handleCancelTransferListing() {
    if (!activeTransferListing?.id || !selectedRider?.id) return
    setTransferListingBusy(true)
    setContractActionMessage(null)
    try {
      const { error } = await supabase.rpc('cancel_rider_transfer_listing', {
        p_listing_id: activeTransferListing.id,
      })
      if (error) throw error
      await loadActiveTransferListing(selectedRider.id)
      setSelectedRider(await fetchRiderDetailsById(selectedRider.id))
      if (releaseModalOpen) await loadReleasePreview(selectedRider.id)
      setContractActionMessage(t('ownedContract.removedFromList'))
    } catch (e: any) {
      setContractActionMessage(e?.message ?? t('ownedContract.cancelListingFailed'))
    } finally {
      setTransferListingBusy(false)
    }
  }

  async function handleReleaseRider() {
    if (!selectedRider?.id) return
    setReleaseBusy(true)
    setContractActionMessage(null)
    try {
      const { data, error } = await supabase.rpc('release_owned_rider', { p_rider_id: selectedRider.id })
      if (error) throw error
      const result = (Array.isArray(data) ? data[0] : data) as ReleaseOwnedRiderResult | null
      if (!result) throw new Error(t('ownedRelease.failed'))
      setPageToast({
        type: 'success',
        message: t('ownedRelease.released', {
          rider: selectedRider.display_name,
          cost: formatMoney(result.release_cost),
        }),
      })
      setReleaseModalOpen(false)
      await onRosterChanged?.()
      window.setTimeout(() => onBack(), 1200)
    } catch (e: any) {
      const message = e?.message ?? t('ownedRelease.failed')
      setContractActionMessage(message)
      setPageToast({ type: 'error', message })
    } finally {
      setReleaseBusy(false)
    }
  }

  const contractExpiryUi = getContractExpiryUi(
    selectedRider?.contract_expires_at,
    gameDate ?? null,
    selectedRider?.contract_expires_season,
  )
  const profileAge = getAgeFromBirthDate(selectedRider?.birth_date, gameDate ?? null)
  const movementWindowInfo = getMovementWindowInfo(gameDate)
  const isU23Ineligible = currentTeamType === 'developing' && profileAge !== null && profileAge >= 24
  const u23WarningMessage = isU23Ineligible
    ? movementWindowInfo.isOpen
      ? t('ownedContract.u23Open')
      : t('ownedContract.u23Closed')
    : null

  const renewalLocked =
    !!renewalData &&
    (renewalData.attempt_count >= renewalData.max_attempts || isFutureDateTime(renewalData.cooldown_until))

  const askingPriceDisplay =
    selectedRider?.asking_price == null ? '—' : formatCompactMoneyValue(selectedRider.asking_price)

  const rawPotentialUi = getPotentialUi(selectedRider?.potential)
  const potentialUi = { ...rawPotentialUi, label: localizeKnownStatusLabel(rawPotentialUi.label) }
  const rawMoraleUi = getMoraleUi(selectedRider?.morale)
  const moraleUi = { ...rawMoraleUi, label: localizeKnownStatusLabel(rawMoraleUi.label) }
  const rawFatigueUi = getFatigueUi(selectedRider?.fatigue)
  const fatigueUi = { ...rawFatigueUi, label: localizeKnownStatusLabel(rawFatigueUi.label) }
  const rawHealthUi = getRiderStatusUi(selectedRider?.availability_status)
  const healthUi = { ...rawHealthUi, label: localizeKnownStatusLabel(rawHealthUi.label) }

  const healthCaseName = formatHealthCaseCode(currentHealthCase?.case_code)
  const healthSeverityLabel = formatSeverityLabel(currentHealthCase?.severity)
  const healthStageLabel = localizeKnownStatusLabel(formatCaseStageLabel(currentHealthCase?.case_status))
  const healthExpectedRecoveryLabel = formatShortGameDate(currentHealthCase?.expected_full_recovery_on)
  const healthExpectedRecoveryDays = getDaysRemaining(currentHealthCase?.expected_full_recovery_on, gameDate ?? null)
  const showAvailabilityMedicalHealthCaseRows = selectedRider?.availability_status !== 'injured'

  const transferDaysRemaining = activeTransferListing?.expires_on_game_date
    ? getDaysRemaining(activeTransferListing.expires_on_game_date, gameDate ?? null)
    : null
  const transferTimeLabel = !activeTransferListing
    ? t('external.notListedLower')
    : activeTransferListing.expires_on_game_date
      ? transferDaysRemaining === null
        ? t('external.listedUntil', { date: formatShortGameDate(activeTransferListing.expires_on_game_date) })
        : transferDaysRemaining <= 0
          ? t('external.endsToday', { date: formatShortGameDate(activeTransferListing.expires_on_game_date) })
          : t(transferDaysRemaining === 1 ? 'external.dayLeft' : 'external.daysLeft', { count: transferDaysRemaining })
      : t('external.listedNoExpiry')

  const isTransferListed = !!activeTransferListing
  const tabButtonClass = (tab: RiderProfileTab) =>
    `border-b-2 px-4 py-3 text-sm font-medium transition ${
      activeTab === tab
        ? 'border-yellow-500 text-slate-900'
        : 'border-transparent text-slate-500 hover:text-slate-700'
    }`

  function handleSkillViewModeChange(nextMode: RiderSkillViewMode) {
    setSkillViewMode(nextMode)
    saveStoredRiderSkillViewMode(nextMode)
  }

  const skillRows = [
    { label: t('skills.sprint'), key: 'sprint' as const, value: selectedRider?.sprint },
    { label: t('skills.climbing'), key: 'climbing' as const, value: selectedRider?.climbing },
    { label: t('skills.timeTrial'), key: 'time_trial' as const, value: selectedRider?.time_trial },
    { label: t('skills.endurance'), key: 'endurance' as const, value: selectedRider?.endurance },
    { label: t('skills.flat'), key: 'flat' as const, value: selectedRider?.flat },
    { label: t('skills.recovery'), key: 'recovery' as const, value: selectedRider?.recovery },
    { label: t('skills.resistance'), key: 'resistance' as const, value: selectedRider?.resistance },
    { label: t('skills.raceIq'), key: 'race_iq' as const, value: selectedRider?.race_iq },
    { label: t('skills.teamwork'), key: 'teamwork' as const, value: selectedRider?.teamwork },
  ]
  const skillRowMidpoint = Math.ceil(skillRows.length / 2)
  const skillRowColumns = [skillRows.slice(0, skillRowMidpoint), skillRows.slice(skillRowMidpoint)]

  const focusedTrainingDraft = focusedTrainingRider ? buildPlanRowForRider(focusedTrainingRider) : null
  const focusedTrainingEffective = focusedTrainingRider ? getEffectiveRegularTraining(focusedTrainingRider) : null
  const teamDefaultForFocusedRider = focusedTrainingRider ? regularDefaultsByClubId.get(focusedTrainingRider.club_id) ?? null : null
  const focusedHasOverride = focusedTrainingRider != null && regularPlansByRiderId.has(focusedTrainingRider.rider_id)

  const displayHistoryRows = useMemo(() => {
    const currentSeasonRow =
      currentSeasonNumber == null
        ? null
        : {
            season: currentSeasonNumber,
            season_label: t('external.seasonLabel', { number: currentSeasonNumber }),
            team_name:
              focusedTrainingRider?.source_club_full_display_name ??
              focusedTrainingRider?.source_club_name ??
              historyRows.find((row) => row.is_current_season)?.team_name ??
              t('external.currentTeamFallback'),
            points: seasonOverview.points,
            is_current_season: true,
          }

    const filteredRows = historyRows.filter((row) => {
      if (currentSeasonRow == null) return true
      if (row.is_current_season) return false
      if (row.season != null && row.season === currentSeasonRow.season) return row.team_name !== currentSeasonRow.team_name
      return true
    })
    return currentSeasonRow ? [currentSeasonRow, ...filteredRows] : historyRows
  }, [currentSeasonNumber, focusedTrainingRider, historyRows, seasonOverview.points, t])

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          {t('common.back')}
        </button>
      </div>

      {pageToast ? (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            pageToast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : pageToast.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-blue-200 bg-blue-50 text-blue-700'
          }`}
        >
          {pageToast.message}
        </div>
      ) : null}

      <div className="mb-6 rounded-xl border border-yellow-500 bg-yellow-400 p-6 shadow">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-3xl font-semibold tracking-tight text-slate-950">
              {selectedRider ? `${selectedRider.first_name} ${selectedRider.last_name}` : t('ownedProfile.title')}
            </h2>

            {selectedRider ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-yellow-600/25 bg-white/55 px-3 py-1.5 text-sm font-bold text-slate-950">
                  <CountryFlag countryCode={selectedRider.country_code} />
                  <span>{getCountryName(selectedRider.country_code)}</span>
                </span>
                <span className="rounded-full border border-yellow-600/25 bg-white/55 px-3 py-1.5 text-sm font-bold text-slate-950">
                  {selectedRider.role || '—'}
                </span>
                <span className="rounded-full border border-yellow-600/25 bg-white/55 px-3 py-1.5 text-sm font-bold text-slate-950">
                  {t('ownedProfile.age', { age: profileAge ?? '—' })}
                </span>
                <span className="rounded-full border border-yellow-600/25 bg-white/55 px-3 py-1.5 text-sm font-bold text-slate-950">
                  {t('skills.ovr')} {selectedRider.overall ?? '—'}%
                </span>
                {isTransferListed ? (
                  <span className="rounded-full border border-emerald-700/20 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-800">
                    {t('ownedProfile.transferListed')}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="w-full lg:max-w-xl">
            <div className="flex items-center justify-end rounded-2xl px-2">
              {[
                { label: t('common.points'), value: seasonOverview.points },
                { label: t('common.podiums'), value: seasonOverview.podiums },
                { label: t('common.jerseys'), value: seasonOverview.jerseys },
              ].map((item, index) => (
                <React.Fragment key={item.label}>
                  {index > 0 ? <div className="mx-6 h-12 w-px bg-black/25" /> : null}
                  <div className="min-w-[120px] text-center">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-900/80">{item.label}</div>
                    <div className="mt-2 text-4xl font-semibold leading-none text-slate-950">{item.value}</div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isTransferListed ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="font-semibold">{t('ownedProfile.transferBanner')}</div>
          <div className="mt-1">
            {t('ownedProfile.askingPriceSummary', {
              price: formatCompactMoneyValue(activeTransferListing?.asking_price),
              time: transferTimeLabel,
            })}
            {activeTransferOfferCount > 0
              ? ` · ${t(activeTransferOfferCount === 1 ? 'ownedProfile.openOffer' : 'ownedProfile.openOffers', {
                  count: activeTransferOfferCount,
                })}`
              : ''}
          </div>
          <div className="mt-1">{t('ownedProfile.releaseBlockedByListing')}</div>
        </div>
      ) : null}

      <div className="mb-6 border-b border-slate-200">
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setActiveTab('overview')} className={tabButtonClass('overview')}>{t('tabs.overview')}</button>
          <button type="button" onClick={() => setActiveTab('contract')} className={tabButtonClass('contract')}>{t('tabs.contract')}</button>
          <button type="button" onClick={() => setActiveTab('training')} className={tabButtonClass('training')}>{t('tabs.training')}</button>
          <button type="button" onClick={() => setActiveTab('analysis')} className={tabButtonClass('analysis')}>
            {t('ownedProfile.performanceTab')} {!premiumStatusLoading && !isPremium ? '🔒' : ''}
          </button>
          <button type="button" onClick={() => setActiveTab('compare')} className={tabButtonClass('compare')}>
            {t('tabs.compare')} {!premiumStatusLoading && !isPremium ? '🔒' : ''}
          </button>
          <button type="button" onClick={() => setActiveTab('history')} className={tabButtonClass('history')}>
            {t('tabs.history')} {!premiumStatusLoading && !isPremium ? '🔒' : ''}
          </button>
        </div>
      </div>

      {profileLoading ? (
        <div className="rounded-lg bg-white p-4 shadow"><div className="text-sm text-slate-600">{t('wrapper.loading')}</div></div>
      ) : profileError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-4">
          <div className="text-sm font-medium text-rose-700">{t('wrapper.couldNotLoad')}</div>
          <div className="mt-1 text-sm text-rose-600">{profileError}</div>
        </div>
      ) : !selectedRider ? (
        <div className="rounded-lg bg-white p-4 shadow"><div className="text-sm text-slate-600">{t('wrapper.riderNotFound')}</div></div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-4">
                <SectionCard title={t('ownedProfile.riderImage')} subtitle={t('ownedProfile.imageCostSubtitle')}>
                  <div className="flex h-[340px] items-center justify-center rounded-lg bg-slate-100 p-4">
                    <img src={getRiderImageUrl(selectedRider.image_url)} alt={selectedRider.display_name ?? t('common.rider')} className="h-full w-full object-contain" />
                  </div>
                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold text-slate-800">{t('ownedProfile.imageUrl')}</label>
                    <input
                      type="text"
                      value={imageUrlInput}
                      onChange={(e) => setImageUrlInput(e.target.value)}
                      placeholder={t('ownedProfile.imagePlaceholder')}
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-3 text-sm text-slate-800 outline-none transition focus:border-yellow-400 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={applyImageChange}
                      disabled={imageSaving}
                      className="mt-3 w-full rounded-lg bg-yellow-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {imageSaving ? t('ownedProfile.savingImage') : t('ownedProfile.saveImage')}
                    </button>
                    {imageSaveMessage ? <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{imageSaveMessage}</div> : null}
                  </div>
                </SectionCard>

                <SectionCard title={t('ownedProfile.formStatus')} subtitle={t('ownedProfile.formStatusSubtitle')}>
                  <div className="space-y-3">
                    {[
                      [t('ownedProfile.availability'), healthUi.label, healthUi.color],
                      [t('ownedProfile.fatigue'), `${fatigueUi.label}${selectedRider.fatigue != null ? ` (${selectedRider.fatigue}/100)` : ''}`, fatigueUi.color],
                      [t('ownedProfile.potential'), potentialUi.label, potentialUi.color],
                      [t('ownedProfile.morale'), moraleUi.label, moraleUi.color],
                    ].map(([label, value, color]) => (
                      <div key={String(label)} className="flex items-center justify-between gap-4">
                        <div className="text-sm text-slate-500">{label}</div>
                        <div className="text-sm font-semibold" style={{ color: String(color) }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {currentHealthCase?.health_case_id
                      ? currentHealthCase.case_status === 'recovering'
                        ? t('ownedProfile.recoveringNote')
                        : currentHealthCase.case_status === 'active'
                          ? t('ownedProfile.activeMedicalNote')
                          : getHealthPanelNote(selectedRider)
                      : getHealthPanelNote(selectedRider)}
                  </div>
                </SectionCard>

                <SectionCard title={t('ownedProfile.seasonStats')} subtitle={t('ownedProfile.seasonStatsSubtitle')}>
                  {overviewLoading ? (
                    <div className="text-sm text-slate-500">{t('ownedProfile.loadingSeasonStats')}</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      <DetailRow label={t('common.races')} value={seasonStats.races} />
                      <DetailRow label={t('common.wins')} value={seasonStats.wins} />
                      <DetailRow label={t('common.podiums')} value={seasonStats.podiums} />
                      <DetailRow label={t('common.top10')} value={seasonStats.top10} />
                      <DetailRow label={t('common.points')} value={seasonStats.points} />
                      <DetailRow label={t('common.jerseys')} value={seasonOverview.jerseys} />
                    </div>
                  )}
                </SectionCard>
              </div>

              <div className="space-y-4">
                <SectionCard title={t('ownedProfile.basicInformation')}>
                  <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
                    <div className="divide-y divide-slate-100">
                      <DetailRow label={t('common.country')} value={<span className="inline-flex items-center gap-2"><CountryFlag countryCode={selectedRider.country_code} /><span>{getCountryName(selectedRider.country_code)}</span></span>} />
                      <DetailRow label={t('common.role')} value={selectedRider.role || '—'} />
                      <DetailRow label={t('common.age')} value={profileAge ?? '—'} />
                      <DetailRow label={t('common.overall')} value={`${selectedRider.overall ?? '—'}%`} />
                      <DetailRow label={t('common.potential')} value={potentialUi.label} />
                    </div>
                    <div className="divide-y divide-slate-100">
                      <DetailRow label={t('ownedProfile.weeklyWage')} value={formatWeeklySalary(selectedRider.salary)} />
                      <DetailRow label={t('ownedProfile.marketValue')} value={formatCompactMoneyValue(selectedRider.market_value)} />
                      <DetailRow label={t('ownedProfile.askingPrice')} value={askingPriceDisplay} />
                      <DetailRow label={t('ownedProfile.contractEnd')} value={contractExpiryUi.label} valueClassName={contractExpiryUi.valueClassName} />
                      <DetailRow label={t('ownedProfile.availability')} value={healthUi.label} />
                    </div>
                  </div>
                </SectionCard>

                <HealthCaseReportCard rider={selectedRider} healthCase={currentHealthCase} gameDate={gameDate ?? null} medicalSupport={medicalSupportImpact} medicalSupportLoading={medicalSupportLoading} />

                <SectionCard title={t('ownedProfile.availabilityMedical')}>
                  <div className="divide-y divide-slate-100">
                    <DetailRow label={t('common.status')} value={healthUi.label} />
                    <DetailRow label={t('ownedProfile.fatigueScore')} value={`${selectedRider.fatigue ?? 0}/100`} />
                    <DetailRow label={t('ownedProfile.raceSharpness')} value={<RaceSharpnessInlineBadge sharpness={raceSharpness} />} />
                    {showAvailabilityMedicalHealthCaseRows && healthCaseName ? <DetailRow label={t('ownedProfile.case')} value={healthCaseName} /> : null}
                    {showAvailabilityMedicalHealthCaseRows && healthSeverityLabel ? <DetailRow label={t('ownedProfile.severity')} value={healthSeverityLabel} /> : null}
                    {showAvailabilityMedicalHealthCaseRows && healthStageLabel ? <DetailRow label={t('ownedProfile.stage')} value={healthStageLabel} /> : null}
                    {showAvailabilityMedicalHealthCaseRows && selectedRider.unavailable_reason ? <DetailRow label={t('ownedProfile.reason')} value={formatUnavailableReason(selectedRider.unavailable_reason)} /> : null}
                    {showAvailabilityMedicalHealthCaseRows && currentHealthCase?.expected_full_recovery_on ? (
                      <DetailRow
                        label={t('ownedProfile.expectedRecovery')}
                        value={<>{healthExpectedRecoveryLabel}{healthExpectedRecoveryDays !== null ? ` (${t(healthExpectedRecoveryDays === 1 ? 'ownedProfile.dayRemaining' : 'ownedProfile.daysRemaining', { count: healthExpectedRecoveryDays })})` : ''}</>}
                      />
                    ) : null}
                  </div>

                  {currentHealthCase?.health_case_id ? (
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">{t('ownedProfile.selection')}: <span className="font-semibold">{currentHealthCase.selection_blocked ? t('statusLabels.blocked') : t('statusLabels.allowed')}</span></div>
                      <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">{t('tabs.training')}: <span className="font-semibold">{currentHealthCase.training_blocked ? t('statusLabels.blocked') : t('statusLabels.allowed')}</span></div>
                      <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">{t('ownedProfile.development')}: <span className="font-semibold">{currentHealthCase.development_blocked ? t('statusLabels.blocked') : t('statusLabels.allowed')}</span></div>
                    </div>
                  ) : null}
                </SectionCard>

                <SectionCard
                  title={t('skills.skillAttributes')}
                  headerAction={
                    <div className="inline-flex overflow-hidden rounded-full border border-slate-200 bg-slate-50 p-1">
                      {(['basic', 'modern'] as RiderSkillViewMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => handleSkillViewModeChange(mode)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${skillViewMode === mode ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          {mode === 'basic' ? t('skills.basicView') : t('skills.modernView')}
                        </button>
                      ))}
                    </div>
                  }
                >
                  {skillViewMode === 'basic' ? (
                    <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
                      {skillRowColumns.map((column, columnIndex) => (
                        <div key={columnIndex} className="divide-y divide-slate-100">
                          {column.map((stat) => {
                            const delta = skillDeltaMap[stat.key]
                            const showDelta = Boolean(delta?.has_visible_delta && delta.delta_label)
                            return (
                              <DetailRow
                                key={stat.key}
                                label={stat.label}
                                value={<span className="inline-flex min-w-[84px] items-center justify-end gap-2 whitespace-nowrap"><span className="w-8 text-right">{stat.value ?? 0}</span>{showDelta ? <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${getSkillDeltaBadgeClasses(delta?.delta_direction)}`} title={formatSkillDeltaSource(delta?.primary_source) ?? undefined}>{delta?.delta_label}</span> : null}</span>}
                              />
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {skillRows.map((stat) => {
                        const delta = skillDeltaMap[stat.key]
                        return <SimpleAttributeRow key={stat.key} attributeCode={stat.key} label={stat.label} value={stat.value ?? 0} deltaLabel={delta?.has_visible_delta ? delta.delta_label : null} deltaDirection={delta?.has_visible_delta ? delta.delta_direction : null} sourceLabel={delta?.has_visible_delta ? formatSkillDeltaSource(delta.primary_source) : null} />
                      })}
                    </div>
                  )}
                </SectionCard>

                {isPremium ? (
                  <SectionCard title={t('ownedProfile.lastFiveRaces')} subtitle={t('ownedProfile.lastFiveSubtitle')}>
                    {overviewLoading ? <div className="text-sm text-slate-500">{t('ownedProfile.loadingRecentRaces')}</div> : recentRaces.length === 0 ? <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{t('ownedProfile.noRecentRaces')}</div> : (
                      <div className="space-y-1.5">
                        {recentRaces.map((race, index) => {
                          const dateLabel = formatRecentRaceDateRange(race)
                          return (
                            <div key={`${race.race_id ?? race.race_name}-${race.race_date ?? index}`} className="flex min-h-[38px] min-w-0 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                              <div className="w-16 shrink-0 whitespace-nowrap text-center text-xs font-semibold leading-none text-slate-900" title={dateLabel}>{dateLabel}</div>
                              <div className="h-6 w-px shrink-0 bg-emerald-400" />
                              <CountryFlag countryCode={race.race_country_code} />
                              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap">
                                {race.race_id ? (
                                  <Link
                                    to={`/dashboard/races/${race.race_id}`}
                                    state={getRaceDetailReturnState()}
                                    onClick={(event) => {
                                      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return
                                      event.preventDefault()
                                      navigate(`/dashboard/races/${race.race_id}`, { state: getRaceDetailReturnState() })
                                    }}
                                    className="truncate text-sm font-semibold text-slate-900 hover:text-yellow-700 hover:underline"
                                    title={race.race_name}
                                  >{race.race_name}</Link>
                                ) : <span className="truncate text-sm font-semibold text-slate-900" title={race.race_name}>{race.race_name}</span>}
                                {race.race_category ? <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{race.race_category}</span> : null}
                                {race.stage_count && race.stage_count > 1 ? <span className="shrink-0 text-xs text-slate-400">· {t('ownedProfile.stages', { count: race.stage_count })}</span> : null}
                                {race.route_label ? <span className="min-w-0 truncate text-xs text-slate-400">· {race.route_label}</span> : null}
                              </div>
                              <div className="ml-auto flex shrink-0 items-center text-[10px] leading-none text-slate-500">
                                <div className="border-l border-slate-300 px-3 text-right"><span className="uppercase tracking-[0.12em] text-slate-400">{t('ownedProfile.position')}</span>{' '}<span className="font-normal text-slate-900">{formatGcPosition(race.finish_position)}</span></div>
                                <div className="border-l border-slate-300 pl-3 text-right"><span className="uppercase tracking-[0.12em] text-slate-400">{t('ownedProfile.uciPoints')}</span>{' '}<span className="font-normal text-slate-900">{formatGcPosition(race.ci_points)}</span></div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </SectionCard>
                ) : (
                  <SectionCard title={t('ownedProfile.lastFiveRaces')} subtitle={t('ownedProfile.recentPremiumSubtitle')}>
                    <PremiumLockedPanel title={t('ownedProfile.premiumRaceHistory')} description={t('ownedProfile.premiumRaceHistoryDescription')} />
                  </SectionCard>
                )}
              </div>
            </div>
          )}

          {activeTab === 'contract' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <SectionCard title={t('ownedContract.details')} subtitle={t('ownedContract.detailsSubtitle')}>
                  <div className="divide-y divide-slate-100">
                    <DetailRow label={t('ownedProfile.weeklyWage')} value={formatWeeklySalary(selectedRider.salary)} />
                    <DetailRow label={t('ownedContract.seasonWage')} value={formatMoney(getSeasonWage(selectedRider.salary))} />
                    <DetailRow label={t('ownedProfile.contractEnd')} value={contractExpiryUi.label} valueClassName={contractExpiryUi.valueClassName} />
                    {contractExpiryUi.sublabel ? <DetailRow label={t('ownedContract.contractNote')} value={contractExpiryUi.sublabel} /> : null}
                    <DetailRow label={t('ownedProfile.marketValue')} value={formatCompactMoneyValue(selectedRider.market_value)} />
                    <DetailRow label={t('ownedProfile.askingPrice')} value={askingPriceDisplay} />
                    <DetailRow label={t('ownedContract.pricingMode')} value={selectedRider.asking_price_manual ? t('ownedContract.manual') : t('ownedContract.suggested')} />
                  </div>
                  <div className="mt-4 space-y-3">
                    <SimpleInfoRow label={t('ownedContract.transferMarket')} value={activeTransferListing ? <span className="font-semibold text-amber-700">{t('ownedContract.listed')}</span> : t('ownedContract.notListed')} note={activeTransferListing ? `${formatCompactMoneyValue(activeTransferListing.asking_price)} · ${transferTimeLabel}` : t('ownedContract.noActiveListing')} />
                    {activeTransferListing ? <SimpleInfoRow label={t('ownedContract.openOffers')} value={`${activeTransferOfferCount}`} note={activeTransferOfferCount === 1 ? t('ownedContract.oneOpenOfferNote') : t('ownedContract.openOffersNote', { count: activeTransferOfferCount })} /> : null}
                  </div>
                  {activeTransferListing ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <div className="font-semibold">{t('ownedContract.riderListed')}</div>
                      <div className="mt-1">{t('ownedProfile.askingPriceSummary', { price: formatCompactMoneyValue(activeTransferListing.asking_price), time: transferTimeLabel })} · {t(activeTransferOfferCount === 1 ? 'ownedProfile.openOffer' : 'ownedProfile.openOffers', { count: activeTransferOfferCount })}.</div>
                    </div>
                  ) : null}
                  {u23WarningMessage ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><div className="font-semibold">{t('ownedContract.u23Warning')}</div><div className="mt-1">{u23WarningMessage}</div></div> : null}
                  {contractActionMessage ? <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{contractActionMessage}</div> : null}
                </SectionCard>

                <SectionCard title={t('ownedContract.actions')} subtitle={t('ownedContract.actionsSubtitle')}>
                  <div className="space-y-3">
                    <button type="button" onClick={handleNewContract} disabled={renewalBusy} className="w-full rounded-lg bg-yellow-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60">{renewalBusy ? t('common.processing') : t('ownedContract.extend')}</button>
                    <button type="button" onClick={() => { if (activeTransferListing) void handleCancelTransferListing(); else setTransferListOpen(true) }} disabled={transferListingBusy || releaseBusy} className={`w-full rounded-xl border px-4 py-3 text-sm font-medium transition ${activeTransferListing ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'} disabled:cursor-not-allowed disabled:opacity-60`}>{transferListingBusy ? t('common.working') : activeTransferListing ? t('ownedContract.cancelListing') : t('ownedContract.placeOnList')}</button>
                    <button type="button" onClick={() => void handleOpenReleaseModal()} disabled={releaseBusy || transferListingBusy} className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${isTransferListed ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-rose-700 bg-rose-600 text-white hover:bg-rose-700'}`}>{releaseBusy ? t('ownedContract.releasing') : isTransferListed ? t('ownedContract.cancelListingFirst') : t('ownedContract.release')}</button>
                  </div>
                </SectionCard>
              </div>
            </div>
          )}

          {activeTab === 'training' && (
            <div className="space-y-4">
              <SectionCard title={t('ownedTraining.title')} subtitle={t('ownedTraining.subtitle')}>
                {trainingLoading ? <div className="text-sm text-slate-600">{t('ownedTraining.loadingConfig')}</div> : trainingError ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{trainingError}</div> : !focusedTrainingRider || !focusedTrainingDraft || !focusedTrainingEffective ? <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{t('ownedTraining.notInScope')}</div> : (
                  <div className="space-y-4">
                    {trainingMessage ? <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{trainingMessage}</div> : null}
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-slate-900">{selectedRider ? `${selectedRider.first_name} ${selectedRider.last_name}` : focusedTrainingRider.display_name}</div>
                        {focusedTrainingRider.team_label === 'U23' ? <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">U23</span> : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">{t('ownedTraining.firstTeam')}</span>}
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">{t('skills.ovr')} {focusedTrainingRider.overall ?? '-'}</span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">{t('ownedTraining.fatigue', { value: focusedTrainingRider.fatigue ?? 0 })}</span>
                      </div>
                      <div className="mt-3 text-sm text-slate-700">{t('ownedTraining.effectiveToday')}{' '}<span className="font-semibold">{focusedTrainingEffective.focus_code ? `${formatTrainingFocusLabel(focusedTrainingEffective.focus_code)} · ${focusedTrainingEffective.intensity ? formatTrainingIntensityLabel(focusedTrainingEffective.intensity) : '-'}` : t('ownedTraining.noPlan')}</span>{' · '}{focusedTrainingEffective.auto_when_free ? t('ownedTraining.autoWhenFree') : t('ownedTraining.manualOnly')}</div>
                      <div className="mt-1 text-xs text-slate-500">{t('ownedTraining.source', { source: focusedTrainingEffective.source === 'override' ? t('ownedTraining.overrideOn') : focusedTrainingEffective.source === 'default' ? t('ownedTraining.firstTeam') : t('ownedTraining.noPlan') })}</div>
                      {teamDefaultForFocusedRider ? <div className="mt-3 text-sm text-slate-600">{t('ownedTraining.teamDefault')}{' '}<span className="font-medium text-slate-800">{formatTrainingFocusLabel(teamDefaultForFocusedRider.focus_code)}</span>{' · '}<span className="font-medium text-slate-800">{formatTrainingIntensityLabel(teamDefaultForFocusedRider.intensity)}</span>{' · '}{teamDefaultForFocusedRider.auto_when_free ? t('ownedTraining.autoWhenFree') : t('ownedTraining.manualOnly')}</div> : null}
                    </div>

                    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                      <div className="self-start overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div><div className="text-base font-semibold text-slate-900">{t('ownedTraining.settings')}</div><div className="mt-1 text-xs leading-5 text-slate-500">{t('ownedTraining.settingsSubtitle')}</div></div>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${focusedTrainingDraft.is_active ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>{focusedTrainingDraft.is_active ? t('ownedTraining.overrideOn') : t('ownedTraining.teamDefault').replace(':', '')}</span>
                          </div>
                        </div>
                        <div className="p-5">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t('ownedTraining.trainingFocus')}</span><select value={focusedTrainingDraft.focus_code} onChange={(event) => updateRegularPlanDraft(focusedTrainingRider, { focus_code: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">{REGULAR_TRAINING_FOCUS_OPTIONS.map((option) => <option key={option} value={option}>{formatTrainingFocusLabel(option)}</option>)}</select></label>
                            <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t('ownedTraining.intensity')}</span><select value={focusedTrainingDraft.intensity} onChange={(event) => updateRegularPlanDraft(focusedTrainingRider, { intensity: event.target.value as 'light' | 'normal' | 'hard' })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">{REGULAR_TRAINING_INTENSITY_OPTIONS.map((option) => <option key={option} value={option}>{formatTrainingIntensityLabel(option)}</option>)}</select></label>
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition ${focusedTrainingDraft.is_active ? 'border-blue-200 bg-blue-50/70' : 'border-slate-200 bg-slate-50'}`}><input type="checkbox" checked={focusedTrainingDraft.is_active} onChange={(event) => updateRegularPlanDraft(focusedTrainingRider, { is_active: event.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" /><span><span className="block text-sm font-semibold text-slate-900">{t('ownedTraining.overrideActive')}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{t('ownedTraining.overrideActiveHelp')}</span></span></label>
                            <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition ${focusedTrainingDraft.auto_when_free ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-slate-50'}`}><input type="checkbox" checked={focusedTrainingDraft.auto_when_free} onChange={(event) => updateRegularPlanDraft(focusedTrainingRider, { auto_when_free: event.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" /><span><span className="block text-sm font-semibold text-slate-900">{t('ownedTraining.autoWhenFree')}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{t('ownedTraining.autoWhenFreeHelp')}</span></span></label>
                          </div>
                          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><div className="text-xs leading-5 text-slate-500">{t('ownedTraining.changesRegularOnly')}</div><button type="button" onClick={() => void saveRegularTrainingPlan(focusedTrainingRider)} disabled={regularSavingRiderId === focusedTrainingRider.rider_id} className="min-w-[150px] rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300">{regularSavingRiderId === focusedTrainingRider.rider_id ? t('common.saving') : focusedHasOverride ? t('ownedTraining.saveOverride') : t('ownedTraining.createOverride')}</button></div>
                        </div>
                      </div>

                      <div className="rounded-lg bg-white p-5 shadow">
                        <div className="text-lg font-semibold text-slate-900">{t('ownedTraining.activityTitle')}</div>
                        <div className="mt-1 text-sm text-slate-500">{t('ownedTraining.activitySubtitle')}</div>
                        {trainingSessionsLoading ? <div className="mt-6 text-sm text-slate-500">{t('ownedTraining.loadingActivity')}</div> : trainingActivityError ? <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{trainingActivityError}</div> : recentActivityDays.length === 0 ? <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">{t('ownedTraining.noActivity')}</div> : <div className="mt-5"><RiderRecentActivityList activities={recentActivityDays} /></div>}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm font-semibold text-slate-900">{t('ownedTraining.syncTitle')}</div>
                      <div className="mt-3 text-sm leading-relaxed text-slate-600">{t('ownedTraining.syncText')}</div>
                      <div className="mt-4 text-sm leading-relaxed text-slate-600">{t('ownedTraining.syncBackendText')}</div>
                    </div>
                  </div>
                )}
              </SectionCard>
            </div>
          )}

          {activeTab === 'analysis' && (
            <div className="space-y-4">
              {!isPremium ? (
                <SectionCard title={t('ownedAnalysis.premiumCentreTitle')} subtitle={t('ownedAnalysis.premiumCentreSubtitle')}>
                  <PremiumLockedPanel title={t('ownedAnalysis.premiumCentreLockTitle')} description={t('ownedAnalysis.premiumCentreLockDescription')} />
                </SectionCard>
              ) : (
                <RichRiderPerformanceAnalysisPage rider={selectedRider} analysis={performanceAnalysis} analysisLoading={performanceAnalysisLoading} analysisError={performanceAnalysisError} skillRows={skillRows} seasonOverview={seasonOverview} seasonStats={seasonStats} recentRaces={recentRaces} monthlyPointsHistory={monthlyPointsHistory} recentTrainingSessions={recentTrainingSessions} skillProgressHistory={skillProgressHistory} careerHistory={displayHistoryRows} raceSharpness={raceSharpness} profileAge={profileAge} gameDate={gameDate} />
              )}
            </div>
          )}

          {activeTab === 'compare' && (
            <div className="space-y-4">
              {!isPremium ? (
                <SectionCard title={t('tabs.compare')} subtitle={t('ownedAnalysis.compareSubtitle')}><PremiumLockedPanel title={t('ownedAnalysis.compareLockTitle')} description={t('ownedAnalysis.compareLockDescription')} /></SectionCard>
              ) : !compareClubId ? (
                <SectionCard title={t('tabs.compare')} subtitle={t('ownedAnalysis.compareLoadingSubtitle')}><div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{t('ownedAnalysis.loadingCompare')}</div></SectionCard>
              ) : <RiderComparePanel leftRiderId={riderId} clubId={compareClubId} />}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              {!isPremium ? (
                <SectionCard title={t('tabs.history')} subtitle={t('ownedAnalysis.historySubtitle')}><PremiumLockedPanel title={t('external.premiumHistory')} description={t('ownedAnalysis.historyLockDescription')} /></SectionCard>
              ) : (
                <>
                  <SectionCard title={t('tabs.history')} subtitle={t('external.historySubtitle')}>
                    {historyLoading ? <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{t('external.loadingCareer')}</div> : historyError ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{historyError}</div> : displayHistoryRows.length === 0 ? <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{t('external.noCareer')}</div> : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-sm">
                          <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-3 pr-4">{t('history.season')}</th><th className="py-3 pr-4">{t('history.team')}</th><th className="py-3 text-right">{t('history.points')}</th></tr></thead>
                          <tbody>{displayHistoryRows.map((row, index) => <tr key={`${row.season_label}-${row.team_name}-${index}`} className="border-b border-slate-100 last:border-0"><td className="py-3 pr-4 font-medium text-slate-800"><div className="flex items-center gap-2"><span>{row.season_label}</span>{row.is_current_season ? <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-800">{t('history.current')}</span> : null}</div></td><td className="py-3 pr-4 text-slate-700">{row.team_name}</td><td className="py-3 text-right font-semibold text-slate-900">{row.points}</td></tr>)}</tbody>
                        </table>
                      </div>
                    )}
                  </SectionCard>
                  <RiderCareerHonoursCard rows={careerHonours} loading={overviewLoading} raceLinkState={getRaceDetailReturnState()} />
                </>
              )}
            </div>
          )}
        </>
      )}

      {transferListOpen && selectedRider ? <TransferListModal open={transferListOpen} onClose={() => setTransferListOpen(false)} rider={selectedRider} onUpdated={setSelectedRider} onTransferListingChanged={async () => { if (selectedRider?.id) await loadActiveTransferListing(selectedRider.id) }} /> : null}

      <ReleaseRiderModal open={releaseModalOpen} rider={selectedRider} preview={releasePreview} loading={releasePreviewLoading} busy={releaseBusy} onClose={() => setReleaseModalOpen(false)} onConfirm={() => void handleReleaseRider()} onCancelTransferListing={() => void handleCancelTransferListing()} />

      {renewalModalOpen && renewalData && selectedRider ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setRenewalModalOpen(false)}>
          <div className="w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
              <div><div className="text-2xl font-semibold text-gray-900">{t('ownedRenewal.title')}</div><div className="mt-1 text-sm text-gray-500">{t('ownedRenewal.subtitle', { rider: selectedRider.display_name })}</div></div>
              <button type="button" onClick={() => setRenewalModalOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">{t('common.close')}</button>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                <DetailRow label={t('ownedRenewal.currentSalary')} value={formatSalary(renewalData.current_salary_weekly)} />
                <DetailRow label={t('ownedRenewal.expectedSalary')} value={formatSalary(renewalData.expected_salary_weekly)} />
                <DetailRow label={t('ownedRenewal.likelyMinimum')} value={formatSalary(renewalData.min_acceptable_salary_weekly)} />
                <DetailRow label={t('ownedRenewal.currentContractEnds')} value={t('ownedRenewal.seasonDate', { season: renewalCurrentContractEndSeason ?? '—', date: formatShortGameDate(renewalCurrentContractExpiresAt) })} valueClassName={renewalDaysRemaining !== null && renewalDaysRemaining < 90 ? 'text-red-600' : ''} />
              </div>
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div><label className="mb-2 block text-sm font-semibold text-gray-800">{t('ownedRenewal.salaryOffer')}</label><div className="relative"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-500">$</span><input type="number" min={1} value={offerSalaryInput} onChange={(e) => setOfferSalaryInput(e.target.value)} disabled={renewalBusy || renewalLocked} className="w-full rounded-lg border-2 border-yellow-400 bg-yellow-50 py-3 pl-8 pr-4 text-base font-medium text-gray-900 outline-none focus:border-yellow-500 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60" placeholder={t('ownedRenewal.salaryPlaceholder')} /></div></div>
                <div><div className="mb-2 flex flex-nowrap items-center gap-2"><label className="text-sm font-semibold text-gray-800">{t('ownedRenewal.extensionLength')}</label><span className="whitespace-nowrap text-xs text-gray-500 sm:text-sm">{t('ownedRenewal.startsFrom', { date: renewalCurrentStartLabel })}</span></div><select value={offerExtensionInput} onChange={(e) => setOfferExtensionInput(e.target.value === '2' ? '2' : '1')} disabled={renewalBusy || renewalLocked} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none focus:border-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"><option value="1">{t('ownedRenewal.oneSeason')}</option><option value="2">{t('ownedRenewal.twoSeasons')}</option></select></div>
              </div>
              <div className="mt-5"><RenewalFeedbackBox type={renewalResultType} message={renewalResultMessage} /></div>
              {renewalData.cooldown_until && isFutureDateTime(renewalData.cooldown_until) ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t('ownedRenewal.blockedUntil', { date: new Date(renewalData.cooldown_until).toLocaleString(uiLocale) })}</div> : null}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4"><button type="button" onClick={() => setRenewalModalOpen(false)} className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">{t('common.cancel')}</button><button type="button" onClick={handleSubmitRenewalOffer} disabled={renewalBusy || renewalLocked} className="rounded-lg bg-yellow-400 px-5 py-2.5 text-sm font-medium text-black hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60">{renewalBusy ? t('common.submitting') : t('ownedRenewal.submitOffer')}</button></div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
