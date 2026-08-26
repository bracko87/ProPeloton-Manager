/**
 * TEAM LOGO CONSISTENCY FIX:
 * - public.clubs.logo_path is authoritative.
 * - Refreshes the current logo directly from public.clubs.
 * - Resolves club-logos storage paths before rendering.
 * - External URL logos continue to work unchanged.
 */

/**
 * TeamProfilePage.tsx
 * Full-page view for a club / team public profile inside the dashboard.
 *
 * Route intent:
 * - Intended for /dashboard/teams/:clubId (or similar), using react-router.
 *
 * Features:
 * - Fetches a single club profile from Supabase using the same popup view.
 * - Shows logo, country, competition tier, division, sponsors, kit preview, and public roster.
 * - Shows main sponsor logo and temporary last 5 races placeholder.
 * - Uses an existing ReportPlayerButton for moderation/reporting.
 * - Converts previously modal-based UI into a normal, scrollable page layout.
 */

import React, { useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import ReportPlayerButton from '../../components/dashboard/ReportPlayerButton'
import { normalizeGameDateValue } from '../../features/squad/utils/dates'
import { supabase } from '../../lib/supabase'

const RACE_PROFILE_RETURN_STORAGE_KEY = 'pro_peloton_race_profile_return_state_v1'

/**
 * ClubProfileRecord
 * Shape of a single club profile row from the public profile view.
 */
type ClubProfileRecord = {
  club_id: string
  club_name: string
  country_code: string
  country_name: string | null
  is_ai: boolean
  club_type: 'ai' | 'user'
  owner_user_id: string | null
  owner_display_name: string | null
  owner_username: string | null
  logo_path: string | null
  motto: string | null
  crest_style: string | null
  primary_color: string | null
  secondary_color: string | null
  club_tier: string | null
  world_tier: number | null
  reputation: number | null
  season_points: number | null
  world_rank: number | null
  tier2_division: string | null
  tier3_division: string | null
  amateur_division: string | null

  rider_count: number | null

  active_sponsor_count: number | null
  active_sponsor_monthly_total: string | number | null
  main_sponsor_name: string | null
  main_sponsor_monthly_amount: string | number | null
  main_sponsor_logo_url: string | null

  kit_id: string | null
  kit_name: string | null
  kit_config: unknown
  is_active: boolean
  created_at: string
  updated_at: string
}

type TeamRosterRow = {
  club_id: string
  rider_id: string
  display_name: string | null
  country_code: string | null
  role: string | null
  birth_date: string | null
}

type AiTeamKitPreviewRow = {
  club_id: string
  jersey_url: string | null
}

type TeamInternationalPointsSummary = {
  international_rank: number | string | null
  season_year: number | null
  team_id: string
  team_name_snapshot: string | null
  international_points: number | string | null
  oneday_finish_points: number | string | null
  stage_finish_points: number | string | null
  leader_day_points: number | string | null
  final_gc_points: number | string | null
  scoring_rows: number | string | null
  scoring_races: number | string | null
  scoring_stages: number | string | null
}

type ProfileReturnState = {
  returnTo?: string
  returnLabel?: string
  returnRaceId?: string
  returnScrollX?: number
  returnScrollY?: number
  scrollX?: number
  scrollY?: number
  restoreScrollX?: number
  restoreScrollY?: number
  raceInfoExpanded?: boolean
  raceInfoTab?: 'participants' | 'results'
}

type TeamRecentRaceRow = {
  race_id: string
  race_name: string
  race_country_code: string | null
  race_category: string | null
  race_start_date: string | null
  race_end_date: string | null
  race_date: string | null
  stage_count: number | null
  route_label: string | null
  team_position: number | null
  uci_points: number
  result_source: string | null
  squad_type: string | null
  parent_club_id: string | null
}

type PublicInactivityStatus = 'inactive' | 'season_end_removal_pending'

type ClubPublicInactivityRow = {
  club_id: string
  public_inactivity_status: PublicInactivityStatus | null
  inactivity_days_snapshot: number | null
  season_end_transition_pending: boolean | null
}

type ClubPublicInactivityUi = {
  status: PublicInactivityStatus | null
  days: number | null
  seasonEndTransitionPending: boolean
}

/**
 * TeamKitConfig
 * Partial type for kit configuration object that may contain preview URLs.
 */
type TeamKitConfig = {
  image_url?: string | null
  image_data_url?: string | null
  preview_url?: string | null
  public_url?: string | null
  generated_image_url?: string | null
  render_url?: string | null
  file_url?: string | null
}

/**
 * Map of known competition tier/division codes to stable translation keys.
 * Backend competition codes stay unchanged; only the displayed label is translated.
 */
const COMPETITION_LABEL_KEYS: Record<string, string> = {
  worldteam: 'competition.worldTeam',
  proteam: 'competition.proTeam',
  continental: 'competition.continental',
  amateur: 'competition.amateur',
  WORLDTEAM: 'competition.worldTeam',
  PROTEAM: 'competition.proTeam',
  CONTINENTAL: 'competition.continental',
  AMATEUR: 'competition.amateur',
  PRO_WEST: 'competition.proWest',
  PRO_EAST: 'competition.proEast',
  CONTINENTAL_EUROPE: 'competition.continentalEurope',
  CONTINENTAL_AMERICA: 'competition.continentalAmerica',
  CONTINENTAL_ASIA: 'competition.continentalAsia',
  CONTINENTAL_AFRICA: 'competition.continentalAfrica',
  CONTINENTAL_OCEANIA: 'competition.continentalOceania',
  NORTH_AMERICA: 'competition.northAmerica',
  SOUTH_AMERICA: 'competition.southAmerica',
  WESTERN_EUROPE: 'competition.westernEurope',
  CENTRAL_EUROPE: 'competition.centralEurope',
  SOUTHERN_BALKAN_EUROPE: 'competition.southernBalkanEurope',
  NORTHERN_EASTERN_EUROPE: 'competition.northernEasternEurope',
  WEST_NORTH_AFRICA: 'competition.westNorthAfrica',
  CENTRAL_SOUTH_AFRICA: 'competition.centralSouthAfrica',
  WEST_CENTRAL_ASIA: 'competition.westCentralAsia',
  SOUTH_ASIA: 'competition.southAsia',
  EAST_SOUTHEAST_ASIA: 'competition.eastSoutheastAsia',
  OCEANIA: 'competition.oceania',
}

/**
 * toTitleCase
 * Converts a phrase into Title Case.
 */
function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(' ')
}

/**
 * formatCompetitionLabel
 * Normalizes competition/tier labels from codes into human-readable form.
 */
function formatCompetitionLabel(
  value: string | null | undefined,
  t: TFunction<'club'>,
): string {
  if (!value) return '—'

  const translationKey =
    COMPETITION_LABEL_KEYS[value] ?? COMPETITION_LABEL_KEYS[value.toLowerCase()]

  if (translationKey) return t(translationKey)

  return toTitleCase(value.replace(/_/g, ' '))
}

/**
 * formatNumberValue
 * Safely formats numeric values with thousands separators or returns a fallback.
 */
function formatNumberValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '-'
  const numericValue = Number(value)
  if (Number.isFinite(numericValue)) return numericValue.toLocaleString()
  return String(value)
}

async function loadPublicClubInactivityStatus(
  clubId: string,
): Promise<ClubPublicInactivityUi | null> {
  const { data, error } = await supabase.rpc('get_public_club_inactivity_statuses_v1', {
    p_club_ids: [clubId],
  })

  if (error) {
    console.warn('Could not load public inactivity status for team profile:', error.message)
    return null
  }

  const row = ((data ?? []) as ClubPublicInactivityRow[])[0]

  if (!row) return null

  return {
    status: row.public_inactivity_status ?? null,
    days: row.inactivity_days_snapshot ?? null,
    seasonEndTransitionPending: row.season_end_transition_pending === true,
  }
}

function normalizeRecentRaceNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return fallback
}

function normalizeRecentRaceNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizeRecentRaceString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function formatRecentRaceDate(value: string | null | undefined, locale?: string): string {
  if (!value) return '—'

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  })
}

function formatRecentRaceDateRange(race: TeamRecentRaceRow, locale?: string): string {
  const start = race.race_start_date ?? race.race_date
  const end = race.race_end_date ?? race.race_date ?? start

  if (!start && !end) return '—'

  const startLabel = formatRecentRaceDate(start, locale)
  const endLabel = formatRecentRaceDate(end, locale)

  if (!start || !end || start === end) return startLabel

  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)

  if (
    !Number.isNaN(startDate.getTime()) &&
    !Number.isNaN(endDate.getTime()) &&
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth()
  ) {
    const month = startDate.toLocaleDateString(locale, { month: 'short' })
    return `${month} ${startDate.getDate()}–${endDate.getDate()}`
  }

  return `${startLabel}–${endLabel}`
}

function getRecentRaceSubtitle(race: TeamRecentRaceRow, t: TFunction<'club'>): string {
  const parts: string[] = []

  if (race.stage_count && race.stage_count > 1) {
    parts.push(t('teamProfile.stages', { count: race.stage_count }))
  } else if (race.stage_count === 1) {
    parts.push(t('teamProfile.oneStage'))
  }

  if (race.route_label) {
    parts.push(race.route_label)
  }

  if (race.result_source === 'team_classification') {
    parts.push(t('teamProfile.teamClassification'))
  } else if (race.result_source === 'best_rider_final_gc') {
    parts.push(t('teamProfile.bestRiderGc'))
  } else if (race.result_source === 'best_stage_finish') {
    parts.push(t('teamProfile.bestStageFinish'))
  }

  return parts.join(' · ')
}

function formatTeamPosition(value?: number | null): string {
  return value === null || value === undefined ? '—' : String(value)
}

function buildRaceReturnState(currentPath: string, backLabel: string) {
  return {
    from: currentPath,
    returnTo: currentPath,
    returnLabel: backLabel,
    scrollX: typeof window !== 'undefined' ? window.scrollX : 0,
    scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
  }
}


function getSeasonYearFromGameDate(value: string | null): number {
  if (!value) return 2000
  const year = Number(value.slice(0, 4))
  return Number.isFinite(year) && year > 0 ? year : 2000
}

function getAgeYearsAtDate(
  birthDate: string | null | undefined,
  referenceDate: string | null
): number | null {
  if (!birthDate) return null

  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return null

  const now = referenceDate ? new Date(`${referenceDate}T00:00:00Z`) : new Date()
  if (Number.isNaN(now.getTime())) return null

  let age = now.getUTCFullYear() - birth.getUTCFullYear()
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth()

  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) {
    age -= 1
  }

  return age
}

function formatRole(value: string | null | undefined, t: TFunction<'club'>): string {
  if (!value) return '—'

  const normalized = value.trim().toLowerCase()

  switch (normalized) {
    case 'tt':
    case 'time_trial':
    case 'time-trial':
      return 'TT'
    case 'gc':
      return 'GC'
    case 'all_rounder':
      return 'All-rounder'
    default:
      return formatCompetitionLabel(value, t)
  }
}

/**
 * getClubTierLabel
 * Returns a user-friendly label for a club tier code.
 */
function getClubTierLabel(clubTier: string | null, t: TFunction<'club'>): string {
  if (!clubTier) return '-'
  return formatCompetitionLabel(clubTier, t)
}

/**
 * getDivisionLabelFromProfile
 * Derives the division label from the profile's tier2/tier3/amateur division fields.
 */
function getDivisionLabelFromProfile(
  profile: ClubProfileRecord,
  t: TFunction<'club'>,
): string {
  if (profile.tier2_division) return formatCompetitionLabel(profile.tier2_division, t)
  if (profile.tier3_division) return formatCompetitionLabel(profile.tier3_division, t)
  if (profile.amateur_division) return formatCompetitionLabel(profile.amateur_division, t)
  return '-'
}

/**
 * isRecord
 * Type guard to check if a value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * getErrorMessage
 * Extracts useful messages from normal Error objects and Supabase/PostgREST error objects.
 */
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message

  if (isRecord(err) && typeof err.message === 'string') {
    return err.message
  }

  return 'Unable to load this team right now.'
}

/**
 * getKitPreviewSrc
 * Picks the best available preview URL from a kit configuration object.
 */
function getKitPreviewSrc(kitConfig: unknown): string | null {
  if (!isRecord(kitConfig)) return null

  const config = kitConfig as TeamKitConfig
  const candidates = [
    config.image_data_url,
    config.image_url,
    config.preview_url,
    config.public_url,
    config.generated_image_url,
    config.render_url,
    config.file_url,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate
    }
  }

  return null
}

function resolveClubLogoDisplayUrl(logoPath?: string | null): string | null {
  const value = typeof logoPath === 'string' ? logoPath.trim() : ''
  if (!value) return null

  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:') ||
    value.startsWith('blob:')
  ) {
    return value
  }

  if (value.startsWith('//')) {
    return `https:${value}`
  }

  const publicStorageMatch = value.match(
    /\/storage\/v1\/object\/public\/([^/?#]+)\/([^?#]+)/i
  )

  if (publicStorageMatch) {
    const bucket = decodeURIComponent(publicStorageMatch[1])
    const path = decodeURIComponent(publicStorageMatch[2])
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data?.publicUrl ?? null
  }

  const cleanValue = value
    .replace(/^public\//i, '')
    .replace(/^\/+/, '')

  // Create Club / Customize Team persist normal uploaded/generated logos
  // as paths inside the club-logos bucket.
  const { data } = supabase.storage.from('club-logos').getPublicUrl(cleanValue)
  return data?.publicUrl ?? null
}

/**
 * TeamLogo
 * Displays the team logo with a clean fallback if the image is missing or fails.
 */
function TeamLogo({
  src,
  teamName,
  className = 'h-16 w-16',
}: {
  src?: string | null
  teamName: string
  className?: string
}): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false)

  const resolvedSrc = useMemo(
    () => resolveClubLogoDisplayUrl(src),
    [src]
  )

  useEffect(() => {
    setImageFailed(false)
  }, [resolvedSrc])

  const showFallback = !resolvedSrc || imageFailed

  return (
    <div
      className={`flex shrink-0 ${className} items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm`}
    >
      {showFallback ? (
        <span className="text-center text-[10px] text-slate-400">No logo</span>
      ) : (
        <img
          src={resolvedSrc}
          alt={`${teamName} logo`}
          className="h-full w-full object-contain"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      )}
    </div>
  )
}

/**
 * safeCountryCode
 * Normalizes and validates a two-letter country code.
 */
function safeCountryCode(countryCode: string | null | undefined): string | null {
  const code = countryCode?.trim().toLowerCase()

  if (!code || !/^[a-z]{2}$/.test(code)) return null

  return code
}


function getLocalizedCountryName(
  countryCode: string | null | undefined,
  fallbackName: string | null | undefined,
  displayNames: Intl.DisplayNames | null,
): string {
  const safeCode = safeCountryCode(countryCode)

  if (safeCode && displayNames) {
    const localizedName = displayNames.of(safeCode.toUpperCase())
    if (localizedName) return localizedName
  }

  return fallbackName ?? safeCode?.toUpperCase() ?? '—'
}

/**
 * getCountryFlagUrl
 * Returns the same rectangular FlagCDN PNG style used on the Transfer page.
 */
function getCountryFlagUrl(countryCode: string): string {
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
}

/**
 * CountryFlagBadge
 * Renders a small rectangular country flag based on a two-letter country code.
 */
function CountryFlagBadge({
  countryCode,
  className = '',
}: {
  countryCode: string | null | undefined
  className?: string
}): JSX.Element | null {
  const safeCode = safeCountryCode(countryCode)
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [safeCode])

  const imageClassName = [
    'h-4 w-6 shrink-0 rounded-sm border border-slate-200 object-cover',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const fallbackClassName = [
    'inline-block h-4 w-6 shrink-0 rounded-sm border border-slate-200 bg-slate-100',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (!safeCode || imageFailed) {
    return (
      <span
        className={fallbackClassName}
        title="Unknown country"
        aria-label="Unknown country"
      />
    )
  }

  const displayCode = safeCode.toUpperCase()

  return (
    <img
      src={getCountryFlagUrl(safeCode)}
      alt={`${displayCode} flag`}
      title={displayCode}
      className={imageClassName}
      loading="lazy"
      onError={() => setImageFailed(true)}
    />
  )
}

/**
 * ProfileHeaderStat
 * Clean stat item for the banner/header section without card boxes.
 */
function ProfileHeaderStat({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}): JSX.Element {
  return (
    <div className="min-w-0 px-4 first:pl-0 last:pr-0">
      <div className="truncate whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 truncate whitespace-nowrap text-lg font-semibold leading-tight text-slate-900">
        {value}
      </div>
    </div>
  )
}

/**
 * SponsorLogo
 * Displays the main sponsor logo with a clean fallback.
 */
function SponsorLogo({
  src,
  sponsorName,
}: {
  src?: string | null
  sponsorName: string | null
}): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [src])

  const hasValidSrc = typeof src === 'string' && src.trim().length > 0 && !imageFailed

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      {hasValidSrc ? (
        <div className="flex min-h-[180px] items-center justify-center">
          <img
            src={src}
            alt={sponsorName ? `${sponsorName} logo` : 'Sponsor logo'}
            className="max-h-[150px] max-w-full object-contain"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        </div>
      ) : (
        <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
          No sponsor logo available
        </div>
      )}
    </div>
  )
}

/**
 * SponsorsPanel
 * Displays sponsor information as a reusable panel so it can be reordered for AI teams.
 */
function SponsorsPanel({
  mainSponsorName,
  mainSponsorLogoUrl,
}: {
  mainSponsorName: string | null
  mainSponsorLogoUrl: string | null
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Sponsors</h2>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Main sponsor:
        </span>
        <span className="text-lg font-semibold text-slate-900">{mainSponsorName ?? '—'}</span>
      </div>

      <SponsorLogo src={mainSponsorLogoUrl} sponsorName={mainSponsorName} />
    </section>
  )
}

/**
 * TeamJerseyPreview
 * Shows either the generated jersey image or a color-based placeholder.
 */
function TeamJerseyPreview({
  clubName,
  kitName,
  kitConfig,
  primaryColor,
  secondaryColor,
  aiKitPreviewUrl,
  t,
}: {
  clubName: string
  kitName: string | null
  kitConfig: unknown
  primaryColor: string | null
  secondaryColor: string | null
  aiKitPreviewUrl?: string | null
  t: TFunction<'club'>
}): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false)

  const kitConfigPreviewSrc = useMemo(() => getKitPreviewSrc(kitConfig), [kitConfig])

  const previewSrc = useMemo(() => {
    const aiUrl = aiKitPreviewUrl?.trim()
    if (aiUrl) return aiUrl
    return kitConfigPreviewSrc
  }, [aiKitPreviewUrl, kitConfigPreviewSrc])

  useEffect(() => {
    setImageFailed(false)
  }, [previewSrc])

  const hasPreview =
    typeof previewSrc === 'string' && previewSrc.trim().length > 0 && !imageFailed

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{t('teamProfile.jersey')}</h3>
          <p className="mt-1 text-sm text-slate-500">{t('teamProfile.jerseyDescription')}</p>
        </div>

        {kitName ? (
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
            {kitName}
          </span>
        ) : null}
      </div>

      <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-white p-4">
        {hasPreview ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <img
              src={previewSrc ?? undefined}
              alt={`${clubName} jersey`}
              className="max-h-[320px] max-w-full object-contain"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          </div>
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
            <div className="mb-4 flex gap-3">
              <div
                className="h-12 w-12 rounded-xl border border-slate-200"
                style={{ backgroundColor: primaryColor ?? '#e2e8f0' }}
                title={primaryColor ?? 'Primary color'}
              />
              <div
                className="h-12 w-12 rounded-xl border border-slate-200"
                style={{ backgroundColor: secondaryColor ?? '#f8fafc' }}
                title={secondaryColor ?? 'Secondary color'}
              />
            </div>

            <div className="text-sm font-semibold text-slate-900">Jersey preview unavailable</div>
            <div className="mt-1 max-w-md text-sm text-slate-500">
              The kit exists, but no public preview image is available yet.
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function TeamRosterTable({
  riders,
  currentGameDate,
  t,
}: {
  riders: TeamRosterRow[]
  currentGameDate: string | null
  t: TFunction<'club'>
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{t('teamProfile.roster')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('teamProfile.rosterDescription')}</p>
      </div>

      {riders.length === 0 ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          {t('teamProfile.noRiders')}
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('teamProfile.rider')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('teamProfile.country')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('teamProfile.role')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('teamProfile.age')}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {riders.map((rider) => {
                const age = getAgeYearsAtDate(rider.birth_date, currentGameDate)

                return (
                  <tr key={rider.rider_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/dashboard/external-riders/${rider.rider_id}`}
                        className="font-semibold text-slate-900 hover:text-yellow-600 hover:underline"
                      >
                        {rider.display_name ?? 'Unknown rider'}
                      </Link>
                    </td>

                    <td className="px-4 py-3">
                      {rider.country_code ? (
                        <CountryFlagBadge countryCode={rider.country_code} />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-700">{formatRole(rider.role, t)}</td>

                    <td className="px-4 py-3 text-slate-700">{age ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function LastFiveRacesPanel({
  races,
  currentPath,
  loading,
  locale,
  t,
}: {
  races: TeamRecentRaceRow[]
  currentPath: string
  loading: boolean
  locale: string
  t: TFunction<'club'>
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{t('teamProfile.lastFiveRaces')}</h2>
      <p className="mt-1 text-sm text-slate-500">
        Finished races only · exact squad participation only
      </p>

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            {t('teamProfile.loadingRaces')}
          </div>
        ) : races.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            No finished races found for this exact team/squad yet.
          </div>
        ) : (
          races.map((race) => {
            const subtitle = getRecentRaceSubtitle(race, t)
            const raceTitle = subtitle ? `${race.race_name} · ${subtitle}` : race.race_name

            return (
              <div
                key={race.race_id}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-sm"
                title={raceTitle}
              >
                <div className="w-[56px] shrink-0 whitespace-nowrap text-xs font-semibold text-slate-900">
                  {formatRecentRaceDateRange(race, locale)}
                </div>

                <div className="h-7 w-px shrink-0 bg-emerald-400" />

                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  <CountryFlagBadge countryCode={race.race_country_code} />

                  <Link
                    to={`/dashboard/races/${race.race_id}`}
                    state={buildRaceReturnState(currentPath, t('common.back'))}
                    title={raceTitle}
                    className="min-w-0 flex-1 truncate font-semibold text-slate-900 hover:text-yellow-600 hover:underline"
                  >
                    {race.race_name}
                  </Link>

                  {race.race_category ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      {race.race_category}
                    </span>
                  ) : null}
                </div>

                <div className="ml-auto flex shrink-0 items-center divide-x divide-slate-300 border-l border-slate-300 pl-3 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  <div className="pr-3">
                    {t('teamProfile.teamPosition')}:{' '}
                    <span className="tracking-normal text-slate-900">
                      {formatTeamPosition(race.team_position)}
                    </span>
                  </div>

                  <div className="pl-3">
                    {t('teamProfile.uciPoints')}:{' '}
                    <span className="tracking-normal text-slate-900">
                      {formatNumberValue(race.uci_points)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function PublicInactivityProfileNotice({
  inactivity,
  t,
}: {
  inactivity: ClubPublicInactivityUi | null
  t: TFunction<'club'>
}): JSX.Element | null {
  if (!inactivity?.status) return null

  if (inactivity.status === 'season_end_removal_pending') {
    return (
      <div className="rounded-2xl border border-slate-300 bg-slate-50 px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              {t('teamProfile.inactiveManager')}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              This team remains visible until the end of the season. If the manager does not return,
              the team place can be replaced by an AI pool team after season end.
            </p>
          </div>

          <span className="mt-2 inline-flex w-fit rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 sm:mt-0">
            {t('teamProfile.seasonEndReview')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-300 bg-slate-50 px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            {t('teamProfile.inactiveManager')}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            This team is currently inactive, but it remains in standings, race history, results,
            and calendar.
          </p>
        </div>

        <span className="mt-2 inline-flex w-fit rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 sm:mt-0">
          {t('teamProfile.inactive')}
        </span>
      </div>
    </div>
  )
}

/**
 * TeamProfilePage
 * Top-level page component that renders a club profile by :clubId route param.
 */
export default function TeamProfilePage(): JSX.Element {
  const { t, i18n } = useTranslation('club')
  const navigate = useNavigate()
  const location = useLocation()
  const { clubId } = useParams<{ clubId: string }>()

  const [profile, setProfile] = useState<ClubProfileRecord | null>(null)
  const [rosterRows, setRosterRows] = useState<TeamRosterRow[]>([])
  const [internationalPointsSummary, setInternationalPointsSummary] =
    useState<TeamInternationalPointsSummary | null>(null)
  const [lastFiveRaces, setLastFiveRaces] = useState<TeamRecentRaceRow[]>([])
  const [lastFiveRacesLoading, setLastFiveRacesLoading] = useState(false)
  const [publicInactivityStatus, setPublicInactivityStatus] =
    useState<ClubPublicInactivityUi | null>(null)
  const [aiKitPreviewUrl, setAiKitPreviewUrl] = useState<string | null>(null)
  const [myMainClubId, setMyMainClubId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentGameDate, setCurrentGameDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const displayLocale = i18n.resolvedLanguage?.startsWith('sr')
    ? 'sr-Latn-RS'
    : i18n.resolvedLanguage || 'en'

  const regionDisplayNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([displayLocale], { type: 'region' })
    } catch {
      return null
    }
  }, [displayLocale])

  useEffect(() => {
    let cancelled = false

    async function loadCurrentUser(): Promise<void> {
      const { data } = await supabase.auth.getUser()

      if (!cancelled) {
        setCurrentUserId(data.user?.id ?? null)
      }
    }

    void loadCurrentUser()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadMyMainClubId(): Promise<void> {
      try {
        const { data, error: rpcError } = await supabase.rpc('get_my_club_id')

        if (rpcError) {
          console.warn('Failed to load reporter club id:', rpcError)
          return
        }

        if (isMounted && typeof data === 'string') {
          setMyMainClubId(data)
        }
      } catch (err) {
        console.warn('Failed to load reporter club id:', err)
      }
    }

    void loadMyMainClubId()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!clubId) {
      setError('No club specified.')
      setLoading(false)
      setProfile(null)
      setRosterRows([])
      setInternationalPointsSummary(null)
      setLastFiveRaces([])
      setLastFiveRacesLoading(false)
      setPublicInactivityStatus(null)
      setAiKitPreviewUrl(null)
      setCurrentGameDate(null)
      return () => {
        cancelled = true
      }
    }

    /**
     * loadProfile
     * Fetches the club profile from the same view used by the working popup,
     * then fetches public roster rows for the confirmed club id.
     */
    async function loadProfile(): Promise<void> {
      try {
        setLoading(true)
        setError(null)
        setProfile(null)
        setRosterRows([])
        setInternationalPointsSummary(null)
        setLastFiveRaces([])
        setLastFiveRacesLoading(false)
        setPublicInactivityStatus(null)
        setAiKitPreviewUrl(null)
        setCurrentGameDate(null)

        const { data, error: queryError } = await supabase
          .from('club_profile_popup_view')
          .select('*')
          .eq('club_id', clubId)
          .single()

        if (queryError) {
          throw queryError
        }

        let profileRow = data as ClubProfileRecord

        // public.clubs.logo_path is the current source of truth for branding.
        // The profile view can contain an older/null snapshot, so refresh the
        // logo directly before rendering the page.
        const { data: currentClubBranding, error: currentClubBrandingError } = await supabase
          .from('clubs')
          .select('logo_path')
          .eq('id', profileRow.club_id)
          .maybeSingle()

        if (currentClubBrandingError) {
          console.warn(
            'Could not refresh current club logo for team profile:',
            currentClubBrandingError.message
          )
        } else if (currentClubBranding) {
          profileRow = {
            ...profileRow,
            logo_path: currentClubBranding.logo_path ?? null,
          }
        }

        setProfile(profileRow)

        const publicInactivity = await loadPublicClubInactivityStatus(profileRow.club_id)

        if (!cancelled) {
          setPublicInactivityStatus(publicInactivity)
        }

        if (profileRow.is_ai) {
          const { data: aiKitData, error: aiKitError } = await supabase
            .from('ai_team_kit_previews')
            .select('club_id, jersey_url')
            .eq('club_id', profileRow.club_id)
            .eq('is_active', true)
            .maybeSingle()

          if (aiKitError) {
            console.warn('Failed to load AI team jersey preview:', aiKitError)
            setAiKitPreviewUrl(null)
          } else {
            setAiKitPreviewUrl((aiKitData as AiTeamKitPreviewRow | null)?.jersey_url ?? null)
          }
        }

        const { data: currentGameDateRaw, error: currentGameDateError } = await supabase.rpc(
          'get_current_game_date'
        )

        if (currentGameDateError) {
          throw currentGameDateError
        }

        const normalizedGameDate = normalizeGameDateValue(currentGameDateRaw)
        setCurrentGameDate(normalizedGameDate)

        const { data: internationalPointsData, error: internationalPointsError } =
          await supabase.rpc('get_team_international_points_summary_v1', {
            p_team_id: profileRow.club_id,
            p_season_year: getSeasonYearFromGameDate(normalizedGameDate),
          })

        if (internationalPointsError) {
          console.warn('Failed to load team international points:', internationalPointsError)
          setInternationalPointsSummary(null)
        } else {
          setInternationalPointsSummary(
            ((Array.isArray(internationalPointsData)
              ? internationalPointsData[0]
              : internationalPointsData) ?? null) as TeamInternationalPointsSummary | null
          )
        }

        setLastFiveRacesLoading(true)

        const { data: lastFiveRacesData, error: lastFiveRacesError } = await supabase.rpc(
          'get_team_last_five_races',
          {
            p_team_id: profileRow.club_id,
            p_limit: 5,
          }
        )

        if (lastFiveRacesError) {
          console.warn('Failed to load team last five races:', lastFiveRacesError)
          setLastFiveRaces([])
        } else {
          const rows = Array.isArray(lastFiveRacesData) ? lastFiveRacesData : []

          setLastFiveRaces(
            rows.map((raceRow) => {
              const row = raceRow as Record<string, unknown>

              return {
                race_id: normalizeRecentRaceString(row.race_id) ?? '',
                race_name: normalizeRecentRaceString(row.race_name) ?? 'Unknown race',
                race_country_code: normalizeRecentRaceString(row.race_country_code),
                race_category: normalizeRecentRaceString(row.race_category),
                race_start_date: normalizeRecentRaceString(row.race_start_date),
                race_end_date: normalizeRecentRaceString(row.race_end_date),
                race_date: normalizeRecentRaceString(row.race_date),
                stage_count: normalizeRecentRaceNullableNumber(row.stage_count),
                route_label: normalizeRecentRaceString(row.route_label),
                team_position: normalizeRecentRaceNullableNumber(row.team_position),
                uci_points: normalizeRecentRaceNumber(row.uci_points),
                result_source: normalizeRecentRaceString(row.result_source),
                squad_type: normalizeRecentRaceString(row.squad_type),
                parent_club_id: normalizeRecentRaceString(row.parent_club_id),
              }
            }).filter((raceRow) => raceRow.race_id)
          )
        }

        setLastFiveRacesLoading(false)

        const { data: rosterData, error: rosterError } = await supabase
          .from('club_profile_roster_view')
          .select('club_id, rider_id, display_name, country_code, role, birth_date')
          .eq('club_id', profileRow.club_id)
          .order('display_name', { ascending: true })

        if (rosterError) {
          console.error('Failed to load team roster:', rosterError)
          setRosterRows([])
        } else {
          setRosterRows((rosterData ?? []) as TeamRosterRow[])
        }
      } catch (err) {
        console.error('Failed to load team profile:', err)
        setError(getErrorMessage(err))
        setProfile(null)
        setRosterRows([])
        setInternationalPointsSummary(null)
        setLastFiveRaces([])
        setLastFiveRacesLoading(false)
        setPublicInactivityStatus(null)
        setAiKitPreviewUrl(null)
        setCurrentGameDate(null)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [clubId])

  const ownerLabel = useMemo(() => {
    if (!profile) return '—'
    if (profile.owner_display_name) return profile.owner_display_name
    if (profile.owner_username) return `@${profile.owner_username}`
    if (profile.is_ai) return 'AIT'
    return 'Unknown owner'
  }, [profile])

  const canSendMessage =
    !!profile &&
    !!currentUserId &&
    !profile.is_ai &&
    !!profile.owner_user_id &&
    profile.owner_user_id !== currentUserId

  const currentPath = `${location.pathname}${location.search}${location.hash}`
  const clubName = profile?.club_name ?? 'Team'
  const returnState = (location.state ?? null) as ProfileReturnState | null

  function getReturnNumber(...values: Array<number | undefined>): number | undefined {
    return values.find((value) => typeof value === 'number' && Number.isFinite(value))
  }

  function handleBackNavigation(): void {
    const returnTo = typeof returnState?.returnTo === 'string' ? returnState.returnTo : null

    if (returnTo) {
      const restoreScrollX = getReturnNumber(
        returnState?.returnScrollX,
        returnState?.scrollX,
        returnState?.restoreScrollX
      )
      const restoreScrollY = getReturnNumber(
        returnState?.returnScrollY,
        returnState?.scrollY,
        returnState?.restoreScrollY
      )

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          RACE_PROFILE_RETURN_STORAGE_KEY,
          JSON.stringify({
            returnTo,
            returnRaceId: returnState?.returnRaceId,
            restoreScrollX,
            restoreScrollY,
            raceInfoExpanded: returnState?.raceInfoExpanded,
            raceInfoTab: returnState?.raceInfoTab,
          })
        )
      }

      navigate(returnTo, {
        replace: true,
        state: {
          from: 'profile_back',
          restoreScrollX,
          restoreScrollY,
          restoreRaceInfoExpanded: returnState?.raceInfoExpanded,
          raceInfoExpanded: returnState?.raceInfoExpanded,
          raceInfoTab: returnState?.raceInfoTab,
        },
      })
      return
    }

    navigate(-1)
  }

  const backButtonLabel = t('common.back')

  const sponsorPanel = profile ? (
    <SponsorsPanel
      mainSponsorName={profile.main_sponsor_name}
      mainSponsorLogoUrl={profile.main_sponsor_logo_url}
    />
  ) : null

  const teamJerseyPanel = profile ? (
    <TeamJerseyPreview
      clubName={clubName}
      kitName={profile.kit_name}
      kitConfig={profile.kit_config}
      primaryColor={profile.primary_color}
      secondaryColor={profile.secondary_color}
      aiKitPreviewUrl={aiKitPreviewUrl}
      t={t}
    />
  ) : null

  function handleSendMessage(): void {
    if (!profile?.owner_user_id) return

    sessionStorage.setItem(
      'inbox_compose_target',
      JSON.stringify({
        userId: profile.owner_user_id,
        displayName:
          profile.owner_display_name ||
          profile.owner_username ||
          profile.club_name ||
          'Player',
        clubName: profile.club_name || '',
      })
    )

    navigate('/dashboard/inbox')
  }

  return (
    <div className="w-full px-4 pb-10 pt-4">
      <div className="mb-4">
        <button
          type="button"
          onClick={handleBackNavigation}
          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          {backButtonLabel}
        </button>
      </div>

      <div className="w-full rounded-b-3xl rounded-t-none border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className="space-y-6">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600 shadow-sm">
              Loading team profile...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
              {error}
            </div>
          ) : profile ? (
            <>
              {/* Team profile banner / header */}
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="p-6 md:p-8">
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                          {profile.club_name}
                        </h1>
                        <CountryFlagBadge countryCode={profile.country_code} className="h-5 w-7" />
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        <span className="font-medium">{getClubTierLabel(profile.club_tier, t)}</span>
                        {profile.world_tier ? <span>· World tier {profile.world_tier}</span> : null}
                        <span>·</span>
                        <span>{getDivisionLabelFromProfile(profile, t)}</span>
                      </div>

                      <div className="mt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
                            {profile.is_ai ? t('teamProfile.aiControlled') : t('teamProfile.playerControlled')}
                          </span>
                        </div>

                        {profile.motto ? (
                          <div className="mt-1 text-sm italic text-slate-500">“{profile.motto}”</div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-center">
                      {canSendMessage ? (
                        <button
                          type="button"
                          onClick={handleSendMessage}
                          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                          Send Message
                        </button>
                      ) : null}

                      {profile &&
                      currentUserId &&
                      !profile.is_ai &&
                      profile.owner_user_id &&
                      profile.owner_user_id !== currentUserId ? (
                        <ReportPlayerButton
                          reportedUserId={profile.owner_user_id}
                          reportedClubId={profile.club_id}
                          reportedClubName={profile.club_name}
                          reportedDisplayName={
                            profile.owner_display_name ||
                            profile.owner_username ||
                            profile.club_name ||
                            'Player'
                          }
                          currentPageLabel="Team profile"
                          currentPath={currentPath}
                          reporterClubId={myMainClubId}
                        />
                      ) : null}
                    </div>

                    <div className="flex justify-start lg:justify-end">
                      <TeamLogo
                        src={profile.logo_path}
                        teamName={profile.club_name}
                        className="h-28 w-48 md:h-32 md:w-56"
                      />
                    </div>
                  </div>

                  <div className="mt-6 border-t border-slate-200/80 pt-5">
                    <div className="grid grid-cols-6 divide-x divide-slate-200">
                      <ProfileHeaderStat
                        label={t('teamProfile.country')}
                        value={getLocalizedCountryName(profile.country_code, profile.country_name, regionDisplayNames)}
                      />
                      <ProfileHeaderStat label={t('teamProfile.owner')} value={ownerLabel} />
                      <ProfileHeaderStat
                        label={t('teamProfile.riders')}
                        value={profile.rider_count !== null ? formatNumberValue(profile.rider_count) : '—'}
                      />
                      <ProfileHeaderStat
                        label={t('teamProfile.reputation')}
                        value={profile.reputation !== null ? formatNumberValue(profile.reputation) : '—'}
                      />
                      <ProfileHeaderStat
                        label={t('teamProfile.internationalRank')}
                        value={
                          internationalPointsSummary?.international_rank !== null &&
                          internationalPointsSummary?.international_rank !== undefined
                            ? `#${formatNumberValue(internationalPointsSummary.international_rank)}`
                            : profile.world_rank !== null
                              ? `#${formatNumberValue(profile.world_rank)}`
                              : '—'
                        }
                      />
                      <ProfileHeaderStat
                        label={t('teamProfile.internationalPoints')}
                        value={
                          internationalPointsSummary?.international_points !== null &&
                          internationalPointsSummary?.international_points !== undefined
                            ? formatNumberValue(internationalPointsSummary.international_points)
                            : profile.season_points !== null
                              ? formatNumberValue(profile.season_points)
                              : '—'
                        }
                      />
                    </div>
                  </div>
                </div>
              </section>

              <PublicInactivityProfileNotice inactivity={publicInactivityStatus} t={t} />

              {/* Public roster + AI/user ordered right column */}
              <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)]">
                <TeamRosterTable riders={rosterRows} currentGameDate={currentGameDate} t={t} />

                <div className="space-y-4">
                  {profile.is_ai ? (
                    <>
                      {teamJerseyPanel}
                      {sponsorPanel}
                    </>
                  ) : (
                    <>
                      {sponsorPanel}
                      {teamJerseyPanel}
                    </>
                  )}

                  <LastFiveRacesPanel
                    races={lastFiveRaces}
                    currentPath={currentPath}
                    loading={lastFiveRacesLoading}
                    locale={displayLocale}
                    t={t}
                  />
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
