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
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import ReportPlayerButton from '../../components/dashboard/ReportPlayerButton'
import { normalizeGameDateValue } from '../../features/squad/utils/dates'
import { supabase } from '../../lib/supabase'

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
 * Map of known competition tier/division codes to human-readable labels.
 */
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
function formatCompetitionLabel(value: string | null | undefined): string {
  if (!value) return '—'
  if (COMPETITION_LABELS[value]) return COMPETITION_LABELS[value]
  if (COMPETITION_LABELS[value.toLowerCase()]) return COMPETITION_LABELS[value.toLowerCase()]
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

function formatRole(value: string | null | undefined): string {
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
      return formatCompetitionLabel(value)
  }
}

/**
 * getClubTierLabel
 * Returns a user-friendly label for a club tier code.
 */
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

/**
 * getDivisionLabelFromProfile
 * Derives the division label from the profile's tier2/tier3/amateur division fields.
 */
function getDivisionLabelFromProfile(profile: ClubProfileRecord): string {
  if (profile.tier2_division) return formatCompetitionLabel(profile.tier2_division)
  if (profile.tier3_division) return formatCompetitionLabel(profile.tier3_division)
  if (profile.amateur_division) return formatCompetitionLabel(profile.amateur_division)
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

  useEffect(() => {
    setImageFailed(false)
  }, [src])

  const hasValidSrc = typeof src === 'string' && src.trim().length > 0
  const showFallback = !hasValidSrc || imageFailed

  return (
    <div
      className={`flex shrink-0 ${className} items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-2`}
    >
      {showFallback ? (
        <span className="text-center text-[10px] text-slate-400">No logo</span>
      ) : (
        <img
          src={src ?? undefined}
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
 * CountryFlagBadge
 * Renders a small country flag badge based on a two-letter country code.
 */
function CountryFlagBadge({
  countryCode,
}: {
  countryCode: string | null | undefined
}): JSX.Element | null {
  if (!countryCode) return null

  const normalizedCode = countryCode.trim().toLowerCase()

  return (
    <div className="inline-flex h-7 w-10 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm">
      <img
        src={`https://flagcdn.com/24x18/${normalizedCode}.png`}
        alt={`${countryCode} flag`}
        className="h-4 w-6 rounded-[2px] object-cover"
        loading="lazy"
      />
    </div>
  )
}

/**
 * DetailItem
 * Card-style key-value display for stats and profile attributes.
 */
function DetailItem({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold leading-tight text-slate-900">{value}</div>
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
 * TeamJerseyPreview
 * Shows either the generated jersey image or a color-based placeholder.
 */
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
}): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false)

  const previewSrc = useMemo(() => getKitPreviewSrc(kitConfig), [kitConfig])

  useEffect(() => {
    setImageFailed(false)
  }, [previewSrc])

  const hasPreview =
    typeof previewSrc === 'string' && previewSrc.trim().length > 0 && !imageFailed

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Team jersey</h3>
          <p className="mt-1 text-sm text-slate-500">Public kit preview for this team.</p>
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
}: {
  riders: TeamRosterRow[]
  currentGameDate: string | null
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Team roster</h2>
        <p className="mt-1 text-sm text-slate-500">Current riders registered to this team.</p>
      </div>

      {riders.length === 0 ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No riders found for this team.
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Rider
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Country
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Age
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

                    <td className="px-4 py-3 text-slate-700">{formatRole(rider.role)}</td>

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

function LastFiveRacesPanel(): JSX.Element {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Last 5 races</h2>
      <p className="mt-1 text-sm text-slate-500">
        Recent race history for this team will appear here.
      </p>

      <div className="mt-4 space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400"
          >
            Race slot {index + 1}
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * TeamProfilePage
 * Top-level page component that renders a club profile by :clubId route param.
 */
export default function TeamProfilePage(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { clubId } = useParams<{ clubId: string }>()

  const [profile, setProfile] = useState<ClubProfileRecord | null>(null)
  const [rosterRows, setRosterRows] = useState<TeamRosterRow[]>([])
  const [myMainClubId, setMyMainClubId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentGameDate, setCurrentGameDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    if (!clubId) {
      setError('No club specified.')
      setLoading(false)
      setProfile(null)
      setRosterRows([])
      setCurrentGameDate(null)
      return
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
        setCurrentGameDate(null)

        const { data, error: queryError } = await supabase
          .from('club_profile_popup_view')
          .select('*')
          .eq('club_id', clubId)
          .single()

        if (queryError) {
          throw queryError
        }

        const profileRow = data as ClubProfileRecord
        setProfile(profileRow)

        const { data: currentGameDateRaw, error: currentGameDateError } = await supabase.rpc(
          'get_current_game_date'
        )

        if (currentGameDateError) {
          throw currentGameDateError
        }

        setCurrentGameDate(normalizeGameDateValue(currentGameDateRaw))

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
        setCurrentGameDate(null)
      } finally {
        setLoading(false)
      }
    }

    void loadProfile()
  }, [clubId])

  const ownerLabel = useMemo(() => {
    if (!profile) return '—'
    if (profile.owner_display_name) return profile.owner_display_name
    if (profile.owner_username) return `@${profile.owner_username}`
    if (profile.is_ai) return 'AI-controlled team'
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
      <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className="space-y-6">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600 shadow-sm">
              Loading team profile...
            </div>
          ) : error ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                ← Back
              </button>

              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                {error}
              </div>
            </div>
          ) : profile ? (
            <>
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    ← Back
                  </button>

                  <div className="flex items-center gap-3">
                    <TeamLogo src={profile.logo_path} teamName={profile.club_name} />

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-lg font-semibold text-slate-900">
                          {profile.club_name}
                        </h1>
                        <CountryFlagBadge countryCode={profile.country_code} />
                      </div>

                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>
                          {getClubTierLabel(profile.club_tier)}
                          {profile.world_tier ? ` · World tier ${profile.world_tier}` : ''}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span>{getDivisionLabelFromProfile(profile)}</span>
                      </div>

                      {profile.motto ? (
                        <div className="mt-1 text-xs italic text-slate-500">
                          “{profile.motto}”
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
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
              </div>

              {/* Overview cards */}
              <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <DetailItem
                  label="Country"
                  value={profile.country_name ?? profile.country_code ?? '—'}
                />
                <DetailItem label="Owner" value={ownerLabel} />
                <DetailItem
                  label="Riders"
                  value={profile.rider_count !== null ? formatNumberValue(profile.rider_count) : '—'}
                />
                <DetailItem
                  label="Reputation"
                  value={profile.reputation !== null ? formatNumberValue(profile.reputation) : '—'}
                />
                <DetailItem
                  label="World ranking"
                  value={
                    profile.world_rank !== null ? `#${formatNumberValue(profile.world_rank)}` : '—'
                  }
                />
                <DetailItem
                  label="Season points"
                  value={
                    profile.season_points !== null ? formatNumberValue(profile.season_points) : '—'
                  }
                />
              </section>

              {/* Public roster + sponsors / jersey / last 5 races placeholder */}
              <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)]">
                <TeamRosterTable riders={rosterRows} currentGameDate={currentGameDate} />

                <div className="space-y-4">
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-sm font-semibold text-slate-900">Sponsors</h2>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Main sponsor:
                      </span>
                      <span className="text-lg font-semibold text-slate-900">
                        {profile.main_sponsor_name ?? '—'}
                      </span>
                    </div>

                    <SponsorLogo
                      src={profile.main_sponsor_logo_url}
                      sponsorName={profile.main_sponsor_name}
                    />
                  </section>

                  <TeamJerseyPreview
                    clubName={clubName}
                    kitName={profile.kit_name}
                    kitConfig={profile.kit_config}
                    primaryColor={profile.primary_color}
                    secondaryColor={profile.secondary_color}
                  />

                  <LastFiveRacesPanel />
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}