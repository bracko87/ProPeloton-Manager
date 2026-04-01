import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import ReportPlayerButton from '../../components/dashboard/ReportPlayerButton'
import { supabase } from '../../lib/supabase'
import { normalizeGameDateValue } from '../../features/squad/utils/dates'
import TeamStatisticsSection from '../../features/squad/components/TeamStatisticsSection'
import RiderStatisticsSection from '../../features/squad/components/RiderStatisticsSection'

type MainTab = 'teams' | 'riders'
type TeamSubTab = 'current' | 'history'
type RiderSubTab = 'rankings' | 'breakdown'
type TeamTypeFilter = 'all' | 'user' | 'ai'
type StatusFilter = 'all' | 'active' | 'inactive'
type RiderMetric =
  | 'season_points_overall'
  | 'season_points_sprint'
  | 'season_points_climbing'

type TeamCurrentRow = {
  id: string
  name: string
  country_code: string | null
  club_tier: string
  tier2_division: string | null
  tier3_division: string | null
  amateur_division: string | null
  season_points: number | null
  created_at: string
  logo_path: string | null
  is_ai: boolean
  is_active: boolean
}

type TeamWinnerRow = {
  id: string
  season_number: number
  division: string
  club_id: string
  club_name: string
  country_code: string
  points: number | null
}

type TeamSnapshotRow = {
  id: string
  season_number: number
  division: string
  club_id: string
  club_name: string
  country_code: string
  club_tier: string
  tier2_division: string | null
  tier3_division: string | null
  amateur_division: string | null
  points: number | null
  final_position: number
  is_ai: boolean
  is_active: boolean
}

type RiderBaseRow = {
  id: string
  display_name: string
  country_code: string | null
  role: string
  overall: number | null
  potential: number | null
  sprint: number | null
  climbing: number | null
  time_trial: number | null
  endurance: number | null
  flat: number | null
  recovery: number | null
  resistance: number | null
  race_iq: number | null
  teamwork: number | null
  morale: number | null
  birth_date: string | null
  market_value: number | null
  salary: number | null
  contract_expires_season: number | null
  availability_status: string | null
  fatigue: number | null
  image_url: string | null
}

type RiderStatsRow = RiderBaseRow & {
  club_id: string | null
  club_name: string | null
  club_country_code: string | null
  club_tier: string | null
  club_is_ai: boolean | null
  club_is_active: boolean | null
  age_years: number | null
  season_points_overall: number
  season_points_sprint: number
  season_points_climbing: number
}

type CountryRow = {
  code: string
  name: string
}

type ClubProfilePopupRecord = {
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
  club_cash_balance: string | number | null
  current_balance: string | number | null
  weekly_income: string | number | null
  weekly_expenses: string | number | null
  wage_total: string | number | null
  rider_count: number | null
  active_sponsor_count: number | null
  active_sponsor_monthly_total: string | number | null
  main_sponsor_name: string | null
  main_sponsor_monthly_amount: string | number | null
  hq_level: number | null
  training_center_level: number | null
  medical_center_level: number | null
  scouting_level: number | null
  equipment_level: number | null
  default_training_intensity: number | null
  ui_theme_variant: string | null
  kit_id: string | null
  kit_name: string | null
  kit_config: unknown
  is_active: boolean
  created_at: string
  updated_at: string
}

type TeamKitConfig = {
  image_url?: string | null
  image_data_url?: string | null
  preview_url?: string | null
  public_url?: string | null
  generated_image_url?: string | null
  render_url?: string | null
  file_url?: string | null
  mode?: string | null
  template?: string | null
}

type MyOwnedClubRecord = {
  id: string
  club_type: 'main' | 'developing' | string | null
}

type RiderBaseLookupRow = {
  id: string
  display_name: string | null
  country_code: string | null
  birth_date: string | null
  image_url: string | null
}

type ClubRosterMini = {
  id: string
  rider_id: string
  club_id: string
}

type ClubMini = {
  id: string
  name: string
  club_tier: string | null
  is_ai: boolean | null
  is_active: boolean | null
  country_code: string | null
}

const PAGE_SIZE = 20
const RIDER_TOP_LIMIT = 50

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const COMPETITION_LABELS: Record<string, string> = {
  worldteam: 'WorldTeam',
  proteam: 'ProTeam',
  continental: 'Continental',
  amateur: 'Amateur',
  WORLDTEAM: 'WorldTeam',
  PROTEAM: 'ProTeam',
  CONTINENTAL: 'Continental',
  AMATEUR: 'Amateur',
  PRO_WEST: 'ProTeam West',
  PRO_EAST: 'ProTeam East',
  CONTINENTAL_EUROPE: 'Continental Europe',
  CONTINENTAL_AMERICA: 'Continental America',
  CONTINENTAL_ASIA: 'Continental Asia',
  CONTINENTAL_AFRICA: 'Continental Africa',
  CONTINENTAL_OCEANIA: 'Continental Oceania',
  NORTH_AMERICA: 'North America',
  SOUTH_AMERICA: 'South America',
  WESTERN_EUROPE: 'Western Europe',
  CENTRAL_EUROPE: 'Central Europe',
  SOUTHERN_BALKAN_EUROPE: 'Southern & Balkan Europe',
  NORTHERN_EASTERN_EUROPE: 'Northern & Eastern Europe',
  WEST_NORTH_AFRICA: 'West & North Africa',
  CENTRAL_SOUTH_AFRICA: 'Central & South Africa',
  WEST_CENTRAL_ASIA: 'West & Central Asia',
  SOUTH_ASIA: 'South Asia',
  EAST_SOUTHEAST_ASIA: 'East & Southeast Asia',
  OCEANIA: 'Oceania',
}

const RIDER_METRIC_LABELS: Record<RiderMetric, string> = {
  season_points_overall: 'Overall',
  season_points_sprint: 'Sprinting',
  season_points_climbing: 'Climbing',
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(' ')
    .map(word => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(' ')
}

function formatCompetitionLabel(value: string | null | undefined) {
  if (!value) return '—'
  if (COMPETITION_LABELS[value]) return COMPETITION_LABELS[value]
  if (COMPETITION_LABELS[value.toLowerCase()]) return COMPETITION_LABELS[value.toLowerCase()]
  return toTitleCase(value.replace(/_/g, ' '))
}

function formatRiderMetricLabel(metric: RiderMetric) {
  return RIDER_METRIC_LABELS[metric]
}

function getDivisionValue(team: TeamCurrentRow | TeamSnapshotRow) {
  return team.tier2_division || team.tier3_division || team.amateur_division || team.club_tier
}

function getDivisionLabel(team: TeamCurrentRow | TeamSnapshotRow) {
  return formatCompetitionLabel(getDivisionValue(team))
}

function getAgeYearsAtDate(birthDate: string | null, referenceDate: string | null) {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return null

  const now = referenceDate ? new Date(`${referenceDate}T00:00:00Z`) : new Date()
  if (Number.isNaN(now.getTime())) return null

  let age = now.getUTCFullYear() - birth.getUTCFullYear()
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age--
  return age
}

function getCountryName(code: string | null, countryNameByCode: Map<string, string>) {
  if (!code) return '—'
  return countryNameByCode.get(code) ?? code
}

function getDisplayedRiderCountryCode(
  row: Pick<RiderStatsRow, 'club_country_code' | 'country_code'>
) {
  return row.club_country_code ?? row.country_code ?? null
}

function formatNumberValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '-'
  const numericValue = Number(value)
  if (Number.isFinite(numericValue)) return numericValue.toLocaleString()
  return String(value)
}

function formatDateValue(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function getClubTierLabel(clubTier: string | null): string {
  if (!clubTier) return '-'
  switch (clubTier) {
    case 'worldteam':
      return 'WorldTeam'
    case 'proteam':
      return 'ProTeam'
    case 'continental':
      return 'Continental'
    case 'amateur':
      return 'Amateur'
    default:
      return formatCompetitionLabel(clubTier)
  }
}

function getDivisionLabelFromProfile(profile: ClubProfilePopupRecord): string {
  if (profile.tier2_division) return formatCompetitionLabel(profile.tier2_division)
  if (profile.tier3_division) return formatCompetitionLabel(profile.tier3_division)
  if (profile.amateur_division) return formatCompetitionLabel(profile.amateur_division)
  return '-'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function resolveStringValue(raw: Record<string, unknown>, aliases: string[]) {
  for (const key of aliases) {
    const value = raw[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return null
}

function resolveNumberValue(raw: Record<string, unknown>, aliases: string[]) {
  for (const key of aliases) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }
  return null
}

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

function StatsTabGroup({
  items,
  activeKey,
  onChange,
}: {
  items: Array<{ key: string; label: string }>
  activeKey: string
  onChange: (key: string) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={cx(
            'rounded-md px-4 py-2 text-sm font-medium transition',
            activeKey === item.key ? 'bg-yellow-400 text-black' : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function TeamLogo({
  src,
  teamName,
  className = 'h-8 w-8',
}: {
  src?: string | null
  teamName: string
  className?: string
}) {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [src])

  const hasValidSrc = typeof src === 'string' && src.trim().length > 0
  const showFallback = !hasValidSrc || imageFailed

  return (
    <div
      className={`flex shrink-0 ${className} items-center justify-center overflow-hidden rounded border border-slate-200 bg-white p-1`}
    >
      {showFallback ? (
        <span className="text-[10px] text-slate-400">No logo</span>
      ) : (
        <img
          src={src}
          alt={`${teamName} logo`}
          className="h-full w-full object-contain"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      )}
    </div>
  )
}

function DetailItem({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function TeamJerseyPreview({
  clubName,
  kitName,
  kitConfig,
  primaryColor,
  secondaryColor,
}: {
  clubName: string
  kitName: string | null
  kitConfig: unknown
  primaryColor: string | null
  secondaryColor: string | null
}) {
  const [imageFailed, setImageFailed] = useState(false)

  const previewSrc = useMemo(() => getKitPreviewSrc(kitConfig), [kitConfig])

  useEffect(() => {
    setImageFailed(false)
  }, [previewSrc])

  const hasPreview = typeof previewSrc === 'string' && previewSrc.trim().length > 0 && !imageFailed

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <h5 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Team jersey</h5>

        {kitName ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {kitName}
          </span>
        ) : null}
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
        {hasPreview ? (
          <div className="flex min-h-[280px] items-center justify-center">
            <img
              src={previewSrc}
              alt={`${clubName} jersey`}
              className="max-h-[280px] max-w-full object-contain"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          </div>
        ) : (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-white px-6 py-8 text-center">
            <div className="mb-4 flex gap-3">
              <div
                className="h-10 w-10 rounded-lg border border-slate-200"
                style={{ backgroundColor: primaryColor ?? '#e2e8f0' }}
                title={primaryColor ?? 'Primary color'}
              />
              <div
                className="h-10 w-10 rounded-lg border border-slate-200"
                style={{ backgroundColor: secondaryColor ?? '#f8fafc' }}
                title={secondaryColor ?? 'Secondary color'}
              />
            </div>

            <div className="text-sm font-semibold text-slate-900">Jersey preview unavailable</div>
            <div className="mt-1 text-sm text-slate-500">
              The kit exists, but no public preview image is available yet.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ClubProfileModal({
  clubId,
  isOpen,
  onClose,
  isMyTeam,
  myClubId,
}: {
  clubId: string | null
  isOpen: boolean
  onClose: () => void
  isMyTeam: boolean
  myClubId: string | null
}) {
  const navigate = useNavigate()
  const [club, setClub] = useState<ClubProfilePopupRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null)
    })
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen || !clubId) return

    let cancelled = false

    async function loadClubProfile() {
      try {
        setLoading(true)
        setError(null)

        const { data, error: queryError } = await supabase
          .from('club_profile_popup_view')
          .select('*')
          .eq('club_id', clubId)
          .single()

        if (cancelled) return
        if (queryError) throw queryError

        setClub(data as ClubProfilePopupRecord)
      } catch (err) {
        console.error('Failed to load club profile:', err)
        if (!cancelled) {
          setClub(null)
          setError('Failed to load team profile.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadClubProfile()

    return () => {
      cancelled = true
    }
  }, [clubId, isOpen])

  const canSendMessage =
    !!club &&
    !!currentUserId &&
    !club.is_ai &&
    !!club.owner_user_id &&
    club.owner_user_id !== currentUserId

  const canReportPlayer =
    !!club &&
    !!currentUserId &&
    !club.is_ai &&
    !!club.owner_user_id &&
    club.owner_user_id !== currentUserId

  const handleSendMessage = () => {
    if (!club?.owner_user_id) return

    sessionStorage.setItem(
      'inbox_compose_target',
      JSON.stringify({
        userId: club.owner_user_id,
        displayName:
          club.owner_display_name || club.owner_username || club.club_name || 'Player',
        clubName: club.club_name || '',
      })
    )

    onClose()
    navigate('/dashboard/inbox')
  }

  if (!isOpen || !clubId) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Team profile</h3>
            <p className="mt-1 text-sm text-slate-600">Overview of this club’s key information.</p>
          </div>

          <div className="flex items-center gap-3">
            {canReportPlayer && club && (
              <ReportPlayerButton
                reportedUserId={club.owner_user_id!}
                reportedClubId={club.club_id}
                reportedClubName={club.club_name}
                reportedDisplayName={
                  club.owner_display_name || club.owner_username || club.club_name || 'Player'
                }
                currentPageLabel="Statistics"
                currentPath={window.location.pathname}
                reporterClubId={myClubId}
              />
            )}

            {canSendMessage ? (
              <button
                type="button"
                onClick={handleSendMessage}
                className="inline-flex items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Send Message
              </button>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading team profile...</div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {!loading && !error && club ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <TeamLogo
                    src={club.logo_path}
                    teamName={club.club_name}
                    className="h-[72px] w-[72px]"
                  />

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-2xl font-semibold text-slate-900">{club.club_name}</h4>

                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          club.club_type === 'ai'
                            ? 'bg-slate-200 text-slate-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {club.club_type === 'ai' ? 'AI Team' : 'User Team'}
                      </span>

                      {isMyTeam ? (
                        <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                          Your team
                        </span>
                      ) : null}

                      {!club.is_active ? (
                        <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          Inactive
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <img
                          src={`https://flagcdn.com/24x18/${club.country_code.toLowerCase()}.png`}
                          alt={`${club.country_code} flag`}
                          className="h-5 w-7 rounded-sm border border-slate-200 object-cover"
                          loading="lazy"
                        />
                        <span>{club.country_name ?? club.country_code}</span>
                      </div>

                      <span>•</span>
                      <span>{getClubTierLabel(club.club_tier)}</span>

                      {getDivisionLabelFromProfile(club) !== '-' ? (
                        <>
                          <span>•</span>
                          <span>{getDivisionLabelFromProfile(club)}</span>
                        </>
                      ) : null}
                    </div>

                    {club.motto ? (
                      <p className="mt-3 max-w-2xl text-sm italic text-slate-700">“{club.motto}”</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex gap-2">
                  {club.primary_color ? (
                    <div className="rounded-lg border border-slate-200 p-2">
                      <div
                        className="h-8 w-8 rounded"
                        style={{ backgroundColor: club.primary_color }}
                        title={`Primary: ${club.primary_color}`}
                      />
                    </div>
                  ) : null}

                  {club.secondary_color ? (
                    <div className="rounded-lg border border-slate-200 p-2">
                      <div
                        className="h-8 w-8 rounded"
                        style={{ backgroundColor: club.secondary_color }}
                        title={`Secondary: ${club.secondary_color}`}
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DetailItem label="World rank" value={formatNumberValue(club.world_rank)} />
                <DetailItem label="Season points" value={formatNumberValue(club.season_points)} />
                <DetailItem label="World tier" value={formatNumberValue(club.world_tier)} />
                <DetailItem label="Created" value={formatDateValue(club.created_at)} />
                <DetailItem label="Riders" value={formatNumberValue(club.rider_count)} />
                <DetailItem
                  label="Manager"
                  value={club.owner_display_name ?? (club.is_ai ? 'AI Team' : '-')}
                />
                <DetailItem
                  label="Main sponsor"
                  value={club.main_sponsor_name ?? 'No active sponsor'}
                />
                <DetailItem label="Updated" value={formatDateValue(club.updated_at)} />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <TeamJerseyPreview
                  clubName={club.club_name}
                  kitName={club.kit_name}
                  kitConfig={club.kit_config}
                  primaryColor={club.primary_color}
                  secondaryColor={club.secondary_color}
                />

                <div className="rounded-xl border border-slate-200 p-4">
                  <h5 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                    This season
                  </h5>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <DetailItem
                      label="Current world rank"
                      value={formatNumberValue(club.world_rank)}
                    />
                    <DetailItem label="Season points" value={formatNumberValue(club.season_points)} />
                    <DetailItem label="Squad size" value={formatNumberValue(club.rider_count)} />
                    <DetailItem label="Division" value={getDivisionLabelFromProfile(club)} />
                  </div>

                  <div className="mt-5 space-y-3 text-sm text-slate-700">
                    <p>
                      <span className="font-semibold text-slate-900">{club.club_name}</span> is
                      currently{' '}
                      <span className="font-semibold text-slate-900">
                        #{formatNumberValue(club.world_rank)}
                      </span>{' '}
                      in the global ranking with{' '}
                      <span className="font-semibold text-slate-900">
                        {formatNumberValue(club.season_points)}
                      </span>{' '}
                      points this season.
                    </p>

                    <p>
                      The team competes as a{' '}
                      <span className="font-semibold text-slate-900">
                        {getClubTierLabel(club.club_tier)}
                      </span>
                      {getDivisionLabelFromProfile(club) !== '-' ? (
                        <>
                          {' '}
                          club in{' '}
                          <span className="font-semibold text-slate-900">
                            {getDivisionLabelFromProfile(club)}
                          </span>
                        </>
                      ) : null}
                      .
                    </p>

                    <p>
                      Current squad size is{' '}
                      <span className="font-semibold text-slate-900">
                        {formatNumberValue(club.rider_count)}
                      </span>
                      {club.main_sponsor_name ? (
                        <>
                          , with{' '}
                          <span className="font-semibold text-slate-900">
                            {club.main_sponsor_name}
                          </span>{' '}
                          as the main sponsor.
                        </>
                      ) : (
                        '.'
                      )}
                    </p>

                    <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Detailed season stats like wins, podiums, second places, and best rider can
                      be shown here once those fields are added to the backend view.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function StatisticsPage() {
  const navigate = useNavigate()
  const [mainTab, setMainTab] = useState<MainTab>('teams')
  const [teamSubTab, setTeamSubTab] = useState<TeamSubTab>('current')
  const [riderSubTab, setRiderSubTab] = useState<RiderSubTab>('rankings')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentSeasonNumber, setCurrentSeasonNumber] = useState<number>(1)

  const [teamRows, setTeamRows] = useState<TeamCurrentRow[]>([])
  const [winnerRows, setWinnerRows] = useState<TeamWinnerRow[]>([])
  const [snapshotRows, setSnapshotRows] = useState<TeamSnapshotRow[]>([])
  const [riderRows, setRiderRows] = useState<RiderStatsRow[]>([])
  const [countries, setCountries] = useState<CountryRow[]>([])

  const [myClubIds, setMyClubIds] = useState<string[]>([])
  const [myMainClubId, setMyMainClubId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [seasonFilter, setSeasonFilter] = useState<string>('all')
  const [teamTypeFilter, setTeamTypeFilter] = useState<TeamTypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [tierFilter, setTierFilter] = useState('all')
  const [divisionFilter, setDivisionFilter] = useState('all')
  const [countryFilter, setCountryFilter] = useState('all')
  const [riderMetric, setRiderMetric] = useState<RiderMetric>('season_points_overall')
  const [riderTableMetric, setRiderTableMetric] = useState<RiderMetric>('season_points_overall')

  const [selectedTeamProfileId, setSelectedTeamProfileId] = useState<string | null>(null)
  const [teamCurrentPage, setTeamCurrentPage] = useState(1)
  const [teamHistoryPage, setTeamHistoryPage] = useState(1)
  const [ridersPage, setRidersPage] = useState(1)

  function openTeamProfile(teamId: string) {
    setSelectedTeamProfileId(teamId)
  }

  function closeTeamProfile() {
    setSelectedTeamProfileId(null)
  }

  function openRiderProfile(rider: Pick<RiderStatsRow, 'id' | 'club_id'> | null | undefined) {
    const riderId = rider?.id?.trim()

    if (!riderId) {
      console.error('Statistics rider has no resolved riders.id:', rider)
      return
    }

    const isMyRider = !!rider?.club_id && myClubIds.includes(rider.club_id)

    navigate(
      isMyRider
        ? `/dashboard/my-riders/${riderId}`
        : `/dashboard/external-riders/${riderId}`
    )
  }

  useEffect(() => {
    let cancelled = false

    async function loadMyClubs() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        const userId = authData.user?.id ?? null

        if (!userId || cancelled) {
          if (!cancelled) {
            setMyClubIds([])
            setMyMainClubId(null)
          }
          return
        }

        const { data, error: queryError } = await supabase
          .from('clubs')
          .select('id, club_type')
          .eq('owner_user_id', userId)
          .in('club_type', ['main', 'developing'])

        if (cancelled) return
        if (queryError) throw queryError

        const ownedClubs = (data ?? []) as MyOwnedClubRecord[]
        const mainClub = ownedClubs.find(club => club.club_type === 'main') ?? null

        setMyClubIds(ownedClubs.map(club => club.id))
        setMyMainClubId(mainClub?.id ?? null)
      } catch (err) {
        console.error('Failed to load my clubs for statistics page:', err)
      }
    }

    void loadMyClubs()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    async function loadAll() {
      try {
        setLoading(true)
        setError(null)

        const [
          teamRankingsRes,
          winnersRes,
          snapshotsRes,
          ridersRes,
          riderBaseRes,
          clubRosterRes,
          clubsRes,
          countriesRes,
          currentSeasonRes,
          currentGameDateRes,
        ] = await Promise.all([
          supabase.from('team_rankings_view').select('*'),
          supabase.from('team_ranking_past_winners').select('*'),
          supabase.from('team_ranking_season_snapshots').select('*'),
          supabase.from('rider_statistics_view').select('*'),
          supabase.from('riders').select('id, display_name, country_code, birth_date, image_url'),
          supabase.from('club_riders').select('id, rider_id, club_id'),
          supabase.from('clubs').select('id, name, club_tier, is_ai, is_active, country_code'),
          supabase.from('countries').select('code, name'),
          supabase.rpc('get_current_season_number'),
          supabase.rpc('get_current_game_date'),
        ])

        const firstError =
          teamRankingsRes.error ||
          winnersRes.error ||
          snapshotsRes.error ||
          ridersRes.error ||
          clubRosterRes.error ||
          clubsRes.error

        if (firstError) throw firstError

        const teams = (teamRankingsRes.data ?? []) as TeamCurrentRow[]
        const winners = (winnersRes.data ?? []) as TeamWinnerRow[]
        const snapshots = (snapshotsRes.data ?? []) as TeamSnapshotRow[]
        const riders = (ridersRes.data ?? []) as Record<string, unknown>[]
        const riderBaseRows = riderBaseRes.error
          ? []
          : ((riderBaseRes.data ?? []) as RiderBaseLookupRow[])
        const clubRoster = (clubRosterRes.data ?? []) as ClubRosterMini[]
        const clubs = (clubsRes.data ?? []) as ClubMini[]
        const countryRows = countriesRes.error ? [] : ((countriesRes.data ?? []) as CountryRow[])
        const currentSeason =
          currentSeasonRes.error ||
          currentSeasonRes.data === null ||
          currentSeasonRes.data === undefined
            ? 1
            : Number(currentSeasonRes.data)
        const normalizedGameDate = currentGameDateRes.error
          ? null
          : normalizeGameDateValue(currentGameDateRes.data)

        const riderBaseById = new Map(riderBaseRows.map(rider => [rider.id, rider]))
        const clubById = new Map(clubs.map(club => [club.id, club]))
        const rosterByRosterId = new Map(clubRoster.map(row => [row.id, row]))
        const rosterByRiderId = new Map(clubRoster.map(row => [row.rider_id, row.club_id]))
        const teamCountryByClubId = new Map(teams.map(team => [team.id, team.country_code]))

        const mergedRiders: RiderStatsRow[] = riders.map(riderRaw => {
          const rawStatsId =
            resolveStringValue(riderRaw, ['id']) ??
            (riderRaw['id'] !== undefined && riderRaw['id'] !== null
              ? String(riderRaw['id'])
              : null)

          const rawRealRiderId =
            resolveStringValue(riderRaw, ['rider_id', 'riders_id', 'player_id', 'person_id']) ??
            (riderRaw['rider_id'] !== undefined && riderRaw['rider_id'] !== null
              ? String(riderRaw['rider_id'])
              : null)

          const rawRosterId =
            resolveStringValue(riderRaw, ['club_rider_id', 'club_riders_id', 'roster_id']) ??
            rawStatsId

          const rosterMatch = rawRosterId ? rosterByRosterId.get(rawRosterId) : undefined

          const candidateRiderIds = [rawRealRiderId, rosterMatch?.rider_id, rawStatsId].filter(
            (value): value is string => typeof value === 'string' && value.trim() !== ''
          )

          const riderId =
            candidateRiderIds.find(candidateId => riderBaseById.has(candidateId)) ?? ''

          if (!riderId) {
            console.warn('Unresolved statistics rider row:', {
              availableKeys: Object.keys(riderRaw),
              rawStatsId,
              rawRealRiderId,
              rawRosterId,
              riderRaw,
            })
          }

          const baseRider = riderId ? riderBaseById.get(riderId) : undefined

          const displayName =
            resolveStringValue(riderRaw, ['display_name', 'name']) ??
            baseRider?.display_name ??
            'Unknown rider'

          const rawCountryCode =
            resolveStringValue(riderRaw, ['country_code', 'nationality_code', 'country']) ?? null

          const rawBirthDate =
            resolveStringValue(riderRaw, ['birth_date', 'dob', 'date_of_birth']) ?? null

          const clubId =
            resolveStringValue(riderRaw, ['club_id']) ??
            rosterMatch?.club_id ??
            (riderId ? rosterByRiderId.get(riderId) ?? null : null)

          const club = clubId ? clubById.get(clubId) : undefined

          const finalRiderCountryCode = rawCountryCode ?? baseRider?.country_code ?? null

          const clubCountryCode =
            resolveStringValue(riderRaw, ['club_country_code', 'team_country_code']) ??
            (clubId ? teamCountryByClubId.get(clubId) ?? club?.country_code ?? null : null)

          const finalBirthDate = rawBirthDate ?? baseRider?.birth_date ?? null

          const resolvedImageUrl =
            resolveStringValue(riderRaw, ['image_url']) ?? baseRider?.image_url ?? null

          const resolvedAgeYears =
            getAgeYearsAtDate(finalBirthDate, normalizedGameDate) ??
            resolveNumberValue(riderRaw, ['age_years', 'age', 'rider_age'])

          const clubIsAiRaw = riderRaw.club_is_ai
          const clubIsActiveRaw = riderRaw.club_is_active

          return {
            id: riderId,
            display_name: displayName,
            country_code: finalRiderCountryCode,
            club_country_code: clubCountryCode,
            role: resolveStringValue(riderRaw, ['role']) ?? '',
            overall: resolveNumberValue(riderRaw, ['overall']),
            potential: resolveNumberValue(riderRaw, ['potential']),
            sprint: resolveNumberValue(riderRaw, ['sprint']),
            climbing: resolveNumberValue(riderRaw, ['climbing']),
            time_trial: resolveNumberValue(riderRaw, ['time_trial']),
            endurance: resolveNumberValue(riderRaw, ['endurance']),
            flat: resolveNumberValue(riderRaw, ['flat']),
            recovery: resolveNumberValue(riderRaw, ['recovery']),
            resistance: resolveNumberValue(riderRaw, ['resistance']),
            race_iq: resolveNumberValue(riderRaw, ['race_iq']),
            teamwork: resolveNumberValue(riderRaw, ['teamwork']),
            morale: resolveNumberValue(riderRaw, ['morale']),
            birth_date: finalBirthDate,
            market_value: resolveNumberValue(riderRaw, ['market_value']),
            salary: resolveNumberValue(riderRaw, ['salary']),
            contract_expires_season: resolveNumberValue(riderRaw, ['contract_expires_season']),
            availability_status: resolveStringValue(riderRaw, ['availability_status']) ?? 'fit',
            fatigue: resolveNumberValue(riderRaw, ['fatigue']),
            image_url: resolvedImageUrl,
            club_id: clubId,
            club_name: resolveStringValue(riderRaw, ['club_name']) ?? club?.name ?? null,
            club_tier: resolveStringValue(riderRaw, ['club_tier']) ?? club?.club_tier ?? null,
            club_is_ai: typeof clubIsAiRaw === 'boolean' ? clubIsAiRaw : (club?.is_ai ?? null),
            club_is_active:
              typeof clubIsActiveRaw === 'boolean' ? clubIsActiveRaw : (club?.is_active ?? null),
            age_years: resolvedAgeYears ?? null,
            season_points_overall: resolveNumberValue(riderRaw, ['season_points_overall']) ?? 0,
            season_points_sprint: resolveNumberValue(riderRaw, ['season_points_sprint']) ?? 0,
            season_points_climbing:
              resolveNumberValue(riderRaw, ['season_points_climbing']) ?? 0,
          }
        })

        setCurrentSeasonNumber(Number.isFinite(currentSeason) && currentSeason > 0 ? currentSeason : 1)
        setTeamRows(teams)
        setWinnerRows(winners)
        setSnapshotRows(snapshots)
        setRiderRows(mergedRiders)
        setCountries(countryRows)
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load statistics.')
      } finally {
        setLoading(false)
      }
    }

    void loadAll()
  }, [])

  const countryNameByCode = useMemo(() => {
    return new Map(countries.map(country => [country.code, country.name]))
  }, [countries])

  const historicalWinnerRows = useMemo(() => {
    return winnerRows.filter(row => row.season_number > 0 && row.season_number < currentSeasonNumber)
  }, [winnerRows, currentSeasonNumber])

  const historicalSnapshotRows = useMemo(() => {
    return snapshotRows.filter(row => row.season_number > 0 && row.season_number < currentSeasonNumber)
  }, [snapshotRows, currentSeasonNumber])

  const availableSeasons = useMemo(() => {
    return Array.from(new Set(historicalSnapshotRows.map(row => row.season_number))).sort(
      (a, b) => b - a
    )
  }, [historicalSnapshotRows])

  const availableTeamCountries = useMemo(() => {
    const codes = Array.from(new Set(teamRows.map(row => row.country_code).filter(Boolean)))
    return codes.sort((a, b) =>
      getCountryName(a, countryNameByCode).localeCompare(getCountryName(b, countryNameByCode))
    )
  }, [teamRows, countryNameByCode])

  const availableHistoryCountries = useMemo(() => {
    const codes = Array.from(
      new Set(
        [
          ...historicalWinnerRows.map(row => row.country_code),
          ...historicalSnapshotRows.map(row => row.country_code),
        ].filter(Boolean)
      )
    )
    return codes.sort((a, b) =>
      getCountryName(a, countryNameByCode).localeCompare(getCountryName(b, countryNameByCode))
    )
  }, [historicalWinnerRows, historicalSnapshotRows, countryNameByCode])

  const availableRiderCountries = useMemo(() => {
    const codes = Array.from(
      new Set(
        riderRows
          .map(row => getDisplayedRiderCountryCode(row))
          .filter((code): code is string => Boolean(code))
      )
    )

    return codes.sort((a, b) =>
      getCountryName(a, countryNameByCode).localeCompare(getCountryName(b, countryNameByCode))
    )
  }, [riderRows, countryNameByCode])

  const availableTiers = useMemo(() => {
    const teamTiers = teamRows.map(row => row.club_tier)
    const riderTiers = riderRows.map(row => row.club_tier).filter(Boolean) as string[]
    return Array.from(new Set([...teamTiers, ...riderTiers])).sort((a, b) =>
      formatCompetitionLabel(a).localeCompare(formatCompetitionLabel(b))
    )
  }, [teamRows, riderRows])

  const availableDivisions = useMemo(() => {
    const currentDivisions = teamRows.map(row => getDivisionValue(row))
    const historyDivisions = historicalSnapshotRows.map(row => row.division)
    return Array.from(
      new Set([...currentDivisions, ...historyDivisions].filter(Boolean) as string[])
    ).sort((a, b) => formatCompetitionLabel(a).localeCompare(formatCompetitionLabel(b)))
  }, [teamRows, historicalSnapshotRows])

  const filteredTeamCurrent = useMemo(() => {
    let rows = [...teamRows]

    if (teamTypeFilter === 'ai') rows = rows.filter(row => row.is_ai)
    if (teamTypeFilter === 'user') rows = rows.filter(row => !row.is_ai)

    if (statusFilter === 'active') rows = rows.filter(row => row.is_active)
    if (statusFilter === 'inactive') rows = rows.filter(row => !row.is_active)

    if (tierFilter !== 'all') rows = rows.filter(row => row.club_tier === tierFilter)
    if (divisionFilter !== 'all') rows = rows.filter(row => getDivisionValue(row) === divisionFilter)
    if (countryFilter !== 'all') rows = rows.filter(row => row.country_code === countryFilter)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(row => row.name.toLowerCase().includes(q))
    }

    return rows.sort((a, b) => (b.season_points ?? 0) - (a.season_points ?? 0))
  }, [teamRows, teamTypeFilter, statusFilter, tierFilter, divisionFilter, countryFilter, search])

  const filteredWinners = useMemo(() => {
    let rows = [...historicalWinnerRows]

    if (seasonFilter !== 'all') rows = rows.filter(row => String(row.season_number) === seasonFilter)
    if (divisionFilter !== 'all') rows = rows.filter(row => row.division === divisionFilter)

    if (tierFilter !== 'all') {
      rows = rows.filter(row => {
        if (tierFilter === 'worldteam') {
          return row.division === 'WORLDTEAM' || row.division === 'worldteam'
        }
        if (tierFilter === 'proteam') {
          return row.division === 'PRO_WEST' || row.division === 'PRO_EAST'
        }
        if (tierFilter === 'continental') {
          return row.division.startsWith('CONTINENTAL_')
        }
        if (tierFilter === 'amateur') {
          return (
            !row.division.startsWith('CONTINENTAL_') &&
            row.division !== 'PRO_WEST' &&
            row.division !== 'PRO_EAST' &&
            row.division !== 'WORLDTEAM'
          )
        }
        return true
      })
    }

    if (countryFilter !== 'all') rows = rows.filter(row => row.country_code === countryFilter)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(row => row.club_name.toLowerCase().includes(q))
    }

    return rows.sort((a, b) => b.season_number - a.season_number)
  }, [historicalWinnerRows, seasonFilter, divisionFilter, tierFilter, countryFilter, search])

  const filteredSnapshots = useMemo(() => {
    let rows = [...historicalSnapshotRows]

    if (seasonFilter !== 'all') rows = rows.filter(row => String(row.season_number) === seasonFilter)
    if (tierFilter !== 'all') rows = rows.filter(row => row.club_tier === tierFilter)
    if (divisionFilter !== 'all') rows = rows.filter(row => row.division === divisionFilter)
    if (countryFilter !== 'all') rows = rows.filter(row => row.country_code === countryFilter)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(row => row.club_name.toLowerCase().includes(q))
    }

    return rows.sort((a, b) => {
      if (b.season_number !== a.season_number) return b.season_number - a.season_number
      return a.final_position - b.final_position
    })
  }, [historicalSnapshotRows, seasonFilter, tierFilter, divisionFilter, countryFilter, search])

  const filteredRiders = useMemo(() => {
    let rows = [...riderRows]

    if (teamTypeFilter === 'ai') rows = rows.filter(row => row.club_is_ai === true)
    if (teamTypeFilter === 'user') rows = rows.filter(row => row.club_is_ai === false)

    if (statusFilter === 'active') {
      rows = rows.filter(row => (row.availability_status ?? 'fit') === 'fit')
    }
    if (statusFilter === 'inactive') {
      rows = rows.filter(row => (row.availability_status ?? 'fit') !== 'fit')
    }

    if (countryFilter !== 'all') {
      rows = rows.filter(row => getDisplayedRiderCountryCode(row) === countryFilter)
    }

    if (tierFilter !== 'all') rows = rows.filter(row => row.club_tier === tierFilter)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(
        row =>
          row.display_name.toLowerCase().includes(q) ||
          (row.club_name ?? '').toLowerCase().includes(q)
      )
    }

    return rows.sort((a, b) => Number(b[riderMetric] ?? 0) - Number(a[riderMetric] ?? 0))
  }, [riderRows, teamTypeFilter, statusFilter, countryFilter, tierFilter, search, riderMetric])

  const topRiderTableRows = useMemo(() => {
    return [...filteredRiders]
      .sort((a, b) => Number(b[riderTableMetric] ?? 0) - Number(a[riderTableMetric] ?? 0))
      .slice(0, RIDER_TOP_LIMIT)
  }, [filteredRiders, riderTableMetric])

  const teamsByCountry = useMemo(() => {
    const counts = new Map<string, number>()
    filteredTeamCurrent.forEach(row => {
      const label = getCountryName(row.country_code, countryNameByCode)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [filteredTeamCurrent, countryNameByCode])

  const teamTitles = useMemo(() => {
    const map = new Map<string, { club_name: string; country_code: string; titles: number }>()
    filteredWinners.forEach(row => {
      const key = row.club_id
      const existing = map.get(key)
      if (existing) {
        existing.titles += 1
      } else {
        map.set(key, {
          club_name: row.club_name,
          country_code: row.country_code,
          titles: 1,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => b.titles - a.titles).slice(0, 8)
  }, [filteredWinners])

  const riderRoles = useMemo(() => {
    const counts = new Map<string, number>()
    filteredRiders.forEach(row => {
      const label = formatCompetitionLabel(row.role)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [filteredRiders])

  const riderAgeBuckets = useMemo(() => {
    const buckets = [
      { label: '18–21', min: 18, max: 21, value: 0 },
      { label: '22–25', min: 22, max: 25, value: 0 },
      { label: '26–29', min: 26, max: 29, value: 0 },
      { label: '30–33', min: 30, max: 33, value: 0 },
      { label: '34+', min: 34, max: 99, value: 0 },
    ]

    filteredRiders.forEach(row => {
      const age = row.age_years ?? -1
      const bucket = buckets.find(item => age >= item.min && age <= item.max)
      if (bucket) bucket.value += 1
    })

    return buckets.map(({ label, value }) => ({ label, value }))
  }, [filteredRiders])

  const paginatedTeamCurrent = useMemo(() => {
    const start = (teamCurrentPage - 1) * PAGE_SIZE
    return filteredTeamCurrent.slice(start, start + PAGE_SIZE)
  }, [filteredTeamCurrent, teamCurrentPage])

  const paginatedTeamHistory = useMemo(() => {
    const start = (teamHistoryPage - 1) * PAGE_SIZE
    return filteredSnapshots.slice(start, start + PAGE_SIZE)
  }, [filteredSnapshots, teamHistoryPage])

  const paginatedRiders = useMemo(() => {
    const start = (ridersPage - 1) * PAGE_SIZE
    return topRiderTableRows.slice(start, start + PAGE_SIZE)
  }, [topRiderTableRows, ridersPage])

  useEffect(() => {
    setTeamCurrentPage(1)
  }, [search, teamTypeFilter, statusFilter, tierFilter, divisionFilter, countryFilter, mainTab, teamSubTab])

  useEffect(() => {
    setTeamHistoryPage(1)
  }, [search, seasonFilter, tierFilter, divisionFilter, countryFilter, mainTab, teamSubTab])

  useEffect(() => {
    setRidersPage(1)
  }, [search, teamTypeFilter, statusFilter, tierFilter, countryFilter, riderMetric, riderTableMetric, mainTab, riderSubTab])

  const topCurrentTeam = filteredTeamCurrent[0]
  const latestWinner = filteredWinners[0]
  const topOverallPointsRider = [...filteredRiders].sort(
    (a, b) => (b.season_points_overall ?? 0) - (a.season_points_overall ?? 0)
  )[0]
  const topSprintPointsRider = [...filteredRiders].sort(
    (a, b) => (b.season_points_sprint ?? 0) - (a.season_points_sprint ?? 0)
  )[0]
  const topClimbingPointsRider = [...filteredRiders].sort(
    (a, b) => (b.season_points_climbing ?? 0) - (a.season_points_climbing ?? 0)
  )[0]

  return (
    <>
      <div className="w-full space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Statistics</h2>
            <p className="mt-1 text-sm text-slate-600">
              Team and rider statistics across your cycling world. Rider rankings here are global,
              so they compare the best riders from all teams in the game.
            </p>
          </div>

          <div className="shrink-0 self-start md:self-start">
            <StatsTabGroup
              items={[
                { key: 'teams', label: 'Teams' },
                { key: 'riders', label: 'Riders' },
              ]}
              activeKey={mainTab}
              onChange={key => setMainTab(key as MainTab)}
            />
          </div>
        </div>

        {mainTab === 'teams' ? (
          <TeamStatisticsSection
            teamSubTab={teamSubTab}
            setTeamSubTab={setTeamSubTab}
            loading={loading}
            error={error}
            search={search}
            setSearch={setSearch}
            seasonFilter={seasonFilter}
            setSeasonFilter={setSeasonFilter}
            teamTypeFilter={teamTypeFilter}
            setTeamTypeFilter={setTeamTypeFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            tierFilter={tierFilter}
            setTierFilter={setTierFilter}
            divisionFilter={divisionFilter}
            setDivisionFilter={setDivisionFilter}
            countryFilter={countryFilter}
            setCountryFilter={setCountryFilter}
            availableSeasons={availableSeasons}
            availableTiers={availableTiers}
            availableDivisions={availableDivisions}
            availableTeamCountries={availableTeamCountries}
            availableHistoryCountries={availableHistoryCountries}
            countryNameByCode={countryNameByCode}
            filteredTeamCurrent={filteredTeamCurrent}
            filteredWinners={filteredWinners}
            filteredSnapshots={filteredSnapshots}
            paginatedTeamCurrent={paginatedTeamCurrent}
            paginatedTeamHistory={paginatedTeamHistory}
            teamsByCountry={teamsByCountry}
            teamTitles={teamTitles}
            topCurrentTeam={topCurrentTeam}
            latestWinner={latestWinner}
            teamCurrentPage={teamCurrentPage}
            setTeamCurrentPage={setTeamCurrentPage}
            teamHistoryPage={teamHistoryPage}
            setTeamHistoryPage={setTeamHistoryPage}
            pageSize={PAGE_SIZE}
            openTeamProfile={openTeamProfile}
            formatCompetitionLabel={formatCompetitionLabel}
            getDivisionLabel={getDivisionLabel}
            getCountryName={getCountryName}
          />
        ) : (
          <RiderStatisticsSection
            riderSubTab={riderSubTab}
            setRiderSubTab={setRiderSubTab}
            loading={loading}
            error={error}
            search={search}
            setSearch={setSearch}
            teamTypeFilter={teamTypeFilter}
            setTeamTypeFilter={setTeamTypeFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            tierFilter={tierFilter}
            setTierFilter={setTierFilter}
            riderMetric={riderMetric}
            setRiderMetric={setRiderMetric}
            riderTableMetric={riderTableMetric}
            setRiderTableMetric={setRiderTableMetric}
            countryFilter={countryFilter}
            setCountryFilter={setCountryFilter}
            availableTiers={availableTiers}
            availableRiderCountries={availableRiderCountries}
            countryNameByCode={countryNameByCode}
            filteredRiders={filteredRiders}
            topRiderTableRows={topRiderTableRows}
            paginatedRiders={paginatedRiders}
            riderRoles={riderRoles}
            riderAgeBuckets={riderAgeBuckets}
            topOverallPointsRider={topOverallPointsRider}
            topSprintPointsRider={topSprintPointsRider}
            topClimbingPointsRider={topClimbingPointsRider}
            ridersPage={ridersPage}
            setRidersPage={setRidersPage}
            pageSize={PAGE_SIZE}
            openRiderProfile={openRiderProfile}
            openTeamProfile={openTeamProfile}
            formatCompetitionLabel={formatCompetitionLabel}
            formatRiderMetricLabel={formatRiderMetricLabel}
            getCountryName={getCountryName}
            getDisplayedRiderCountryCode={getDisplayedRiderCountryCode}
            moneyFormatter={moneyFormatter}
          />
        )}
      </div>

      <ClubProfileModal
        clubId={selectedTeamProfileId}
        isOpen={!!selectedTeamProfileId}
        onClose={closeTeamProfile}
        isMyTeam={selectedTeamProfileId ? myClubIds.includes(selectedTeamProfileId) : false}
        myClubId={myMainClubId}
      />
    </>
  )
}