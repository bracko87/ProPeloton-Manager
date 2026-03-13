import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  AmateurDivision,
  AMATEUR_DIVISIONS,
  CompetitionDivision,
  DIVISION_LABELS,
  TeamRankingRecord,
  TEAM_TIERS,
  Tier2Division,
  TIER2_DIVISIONS,
  Tier3Division,
  TIER3_DIVISIONS,
} from '../../constants/teamRanking'
import { supabase } from '../../lib/supabase'
import { getTeamRankingTeams } from '../../services/teamRanking.service'
import {
  getAmateurDivisionStandings,
  getTier2DivisionStandings,
  getTier3DivisionStandings,
  getWorldStandings,
} from '../../utils/teamRanking.utils'

type StandingType = 'WORLD' | 'TIER2' | 'TIER3' | 'AMATEUR'

type StandingOption = {
  key: string
  label: string
  type: StandingType
  division: CompetitionDivision
  promotionLabel?: string
  playoffLabel?: string
  relegationLabel?: string
}

type StandingRow = {
  id: string
  position: number
  teamName: string
  countryCode: string
  points: number
  logoPath?: string | null
  isActive: boolean
}

type TierOption = {
  value: TeamRankingRecord['tier']
  label: string
}

type DivisionSelectOption = {
  value: CompetitionDivision
  label: string
}

type TeamLogoProps = {
  src?: string | null
  teamName: string
  className?: string
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
  tier2_division: Tier2Division | null
  tier3_division: Tier3Division | null
  amateur_division: AmateurDivision | null
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

type PastWinnerRecord = {
  season_number: number
  club_id: string
  club_name: string
  country_code: string
  points: number
  logo_path: string | null
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

const TIER_OPTIONS: TierOption[] = [
  { value: TEAM_TIERS.WORLD, label: 'WorldTeam' },
  { value: TEAM_TIERS.PRO, label: 'ProTeam' },
  { value: TEAM_TIERS.CONTINENTAL, label: 'Continental' },
  { value: TEAM_TIERS.AMATEUR, label: 'Amateur' },
]

function TeamLogo({ src, teamName, className = 'h-8 w-8' }: TeamLogoProps): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [src])

  const hasValidSrc = typeof src === 'string' && src.trim().length > 0
  const showFallback = !hasValidSrc || imageFailed

  return (
    <div
      className={`flex ${className} items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-100`}
    >
      {showFallback ? (
        <span className="text-[10px] text-slate-400">No logo</span>
      ) : (
        <img
          src={src}
          alt={`${teamName} logo`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      )}
    </div>
  )
}

function isEuropeanAmateurDivision(division: CompetitionDivision): boolean {
  return (
    division === 'WESTERN_EUROPE' ||
    division === 'CENTRAL_EUROPE' ||
    division === 'SOUTHERN_BALKAN_EUROPE' ||
    division === 'NORTHERN_EASTERN_EUROPE'
  )
}

function getAmateurStandingDetails(
  division: CompetitionDivision,
): Pick<StandingOption, 'promotionLabel' | 'playoffLabel'> {
  if (division === 'OCEANIA') {
    return {
      promotionLabel: 'Top 3 promoted directly',
    }
  }

  if (isEuropeanAmateurDivision(division)) {
    return {
      promotionLabel: 'Winner promoted directly',
      playoffLabel: '2nd-3rd enter promotion playoff',
    }
  }

  return {
    promotionLabel: 'Winner promoted directly',
    playoffLabel: '2nd-4th enter promotion playoff',
  }
}

function getStandingOption(
  tier: TeamRankingRecord['tier'],
  division: CompetitionDivision | null,
): StandingOption | null {
  if (tier === TEAM_TIERS.WORLD) {
    return {
      key: 'world',
      label: DIVISION_LABELS.WORLD,
      type: 'WORLD',
      division: 'WORLD',
      relegationLabel: 'Bottom 5 relegated',
    }
  }

  if (tier === TEAM_TIERS.PRO) {
    if (division === 'PRO_WEST') {
      return {
        key: 'pro-west',
        label: DIVISION_LABELS.PRO_WEST,
        type: 'TIER2',
        division: 'PRO_WEST',
        promotionLabel: 'Winner promoted directly',
        playoffLabel: '2nd-4th enter World playoff',
        relegationLabel: 'Bottom 5 relegated',
      }
    }

    if (division === 'PRO_EAST') {
      return {
        key: 'pro-east',
        label: DIVISION_LABELS.PRO_EAST,
        type: 'TIER2',
        division: 'PRO_EAST',
        promotionLabel: 'Winner promoted directly',
        playoffLabel: '2nd-4th enter World playoff',
        relegationLabel: 'Bottom 5 relegated',
      }
    }

    return null
  }

  if (tier === TEAM_TIERS.CONTINENTAL) {
    const standingMap: Record<Tier3Division, StandingOption> = {
      CONTINENTAL_EUROPE: {
        key: 'cont-europe',
        label: DIVISION_LABELS.CONTINENTAL_EUROPE,
        type: 'TIER3',
        division: 'CONTINENTAL_EUROPE',
        promotionLabel: 'Winner promoted directly',
        playoffLabel: '2nd-4th enter Pro West playoff',
        relegationLabel: 'Bottom 6 relegated',
      },
      CONTINENTAL_AMERICA: {
        key: 'cont-america',
        label: DIVISION_LABELS.CONTINENTAL_AMERICA,
        type: 'TIER3',
        division: 'CONTINENTAL_AMERICA',
        promotionLabel: 'Winner promoted directly',
        playoffLabel: '2nd-4th enter Pro West playoff',
        relegationLabel: 'Bottom 5 relegated',
      },
      CONTINENTAL_ASIA: {
        key: 'cont-asia',
        label: DIVISION_LABELS.CONTINENTAL_ASIA,
        type: 'TIER3',
        division: 'CONTINENTAL_ASIA',
        promotionLabel: 'Winner promoted directly',
        playoffLabel: '2nd-4th enter Pro East playoff',
        relegationLabel: 'Bottom 6 relegated',
      },
      CONTINENTAL_AFRICA: {
        key: 'cont-africa',
        label: DIVISION_LABELS.CONTINENTAL_AFRICA,
        type: 'TIER3',
        division: 'CONTINENTAL_AFRICA',
        promotionLabel: 'Winner promoted directly',
        playoffLabel: '2nd-4th enter Pro East playoff',
        relegationLabel: 'Bottom 5 relegated',
      },
      CONTINENTAL_OCEANIA: {
        key: 'cont-oceania',
        label: DIVISION_LABELS.CONTINENTAL_OCEANIA,
        type: 'TIER3',
        division: 'CONTINENTAL_OCEANIA',
        promotionLabel: 'Winner promoted directly',
        playoffLabel: '2nd-4th enter Pro East playoff',
        relegationLabel: 'Bottom 3 relegated',
      },
    }

    if (division && division in standingMap) {
      return standingMap[division as Tier3Division]
    }

    return null
  }

  if (tier === TEAM_TIERS.AMATEUR) {
    if (!division) return null

    const amateurDetails = getAmateurStandingDetails(division)

    return {
      key: `amateur-${division}`,
      label: `Amateur: ${DIVISION_LABELS[division as AmateurDivision]}`,
      type: 'AMATEUR',
      division,
      promotionLabel: amateurDetails.promotionLabel,
      playoffLabel: amateurDetails.playoffLabel,
    }
  }

  return null
}

function getDivisionOptions(tier: TeamRankingRecord['tier']): DivisionSelectOption[] {
  if (tier === TEAM_TIERS.WORLD) {
    return []
  }

  if (tier === TEAM_TIERS.PRO) {
    return Object.values(TIER2_DIVISIONS).map((division) => ({
      value: division,
      label: DIVISION_LABELS[division],
    }))
  }

  if (tier === TEAM_TIERS.CONTINENTAL) {
    return Object.values(TIER3_DIVISIONS).map((division) => ({
      value: division,
      label: DIVISION_LABELS[division],
    }))
  }

  return Object.values(AMATEUR_DIVISIONS).map((division) => ({
    value: division,
    label: DIVISION_LABELS[division],
  }))
}

function toStandingRows(teams: TeamRankingRecord[]): StandingRow[] {
  return teams.map((team, index) => ({
    id: team.id,
    position: team.divisionRank ?? team.tierRank ?? team.overallRank ?? index + 1,
    teamName: team.name,
    countryCode: team.country,
    points: team.seasonPoints,
    logoPath: team.logoPath ?? null,
    isActive: team.isActive !== false,
  }))
}

function getRowClass(
  row: StandingRow,
  totalRows: number,
  option: StandingOption,
  isMyTeam: boolean,
): string {
  const classes = ['border-b', 'border-slate-200']

  const relegationCountMap: Record<string, number> = {
    WORLD: 5,
    PRO_WEST: 5,
    PRO_EAST: 5,
    CONTINENTAL_EUROPE: 6,
    CONTINENTAL_AMERICA: 5,
    CONTINENTAL_ASIA: 6,
    CONTINENTAL_AFRICA: 5,
    CONTINENTAL_OCEANIA: 3,
  }

  const relegationCount = relegationCountMap[option.division] ?? 0

  let isDirectPromotion = false
  let isPlayoffPromotion = false

  if (option.type === 'TIER2' || option.type === 'TIER3') {
    if (row.position === 1) {
      isDirectPromotion = true
    } else if (row.position >= 2 && row.position <= 4) {
      isPlayoffPromotion = true
    }
  }

  if (option.type === 'AMATEUR') {
    if (option.division === 'OCEANIA') {
      if (row.position >= 1 && row.position <= 3) {
        isDirectPromotion = true
      }
    } else if (isEuropeanAmateurDivision(option.division)) {
      if (row.position === 1) {
        isDirectPromotion = true
      } else if (row.position >= 2 && row.position <= 3) {
        isPlayoffPromotion = true
      }
    } else {
      if (row.position === 1) {
        isDirectPromotion = true
      } else if (row.position >= 2 && row.position <= 4) {
        isPlayoffPromotion = true
      }
    }
  }

  if (isDirectPromotion) {
    classes.push('bg-green-50')
  } else if (isPlayoffPromotion) {
    classes.push('bg-blue-50')
  }

  if (relegationCount > 0 && row.position > totalRows - relegationCount) {
    classes.push('bg-red-50')
  }

  if (!row.isActive) {
    classes.push('opacity-70')
  }

  if (isMyTeam) {
    classes.push('ring-1', 'ring-yellow-400', 'bg-yellow-50')
  }

  return classes.join(' ')
}

function formatNumberValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '-'

  const numericValue = Number(value)
  if (Number.isFinite(numericValue)) {
    return numericValue.toLocaleString()
  }

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
      return clubTier
  }
}

function getDivisionLabelFromProfile(profile: ClubProfilePopupRecord): string {
  if (profile.tier2_division) {
    return DIVISION_LABELS[profile.tier2_division]
  }

  if (profile.tier3_division) {
    return DIVISION_LABELS[profile.tier3_division]
  }

  if (profile.amateur_division) {
    return DIVISION_LABELS[profile.amateur_division]
  }

  return '-'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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

function DetailItem({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}): JSX.Element {
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
}): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false)

  const previewSrc = useMemo(() => getKitPreviewSrc(kitConfig), [kitConfig])

  useEffect(() => {
    setImageFailed(false)
  }, [previewSrc])

  const hasPreview = typeof previewSrc === 'string' && previewSrc.trim().length > 0 && !imageFailed

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <h5 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Team jersey
        </h5>

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
}: {
  clubId: string | null
  isOpen: boolean
  onClose: () => void
  isMyTeam: boolean
}): JSX.Element | null {
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
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen || !clubId) return

    let cancelled = false

    async function loadClubProfile(): Promise<void> {
      try {
        setLoading(true)
        setError(null)

        const { data, error: queryError } = await supabase
          .from('club_profile_popup_view')
          .select('*')
          .eq('club_id', clubId)
          .single()

        if (cancelled) return

        if (queryError) {
          throw queryError
        }

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

  const handleSendMessage = () => {
    if (!club?.owner_user_id) return

    sessionStorage.setItem(
      'inbox_compose_target',
      JSON.stringify({
        userId: club.owner_user_id,
        displayName:
          club.owner_display_name || club.owner_username || club.club_name || 'Player',
        clubName: club.club_name || '',
      }),
    )

    onClose()
    navigate('/dashboard/inbox')
  }

  if (!isOpen || !clubId) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Team profile</h3>
            <p className="mt-1 text-sm text-slate-600">
              Overview of this club’s key information.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {canSendMessage && (
              <button
                type="button"
                onClick={handleSendMessage}
                className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Send Message
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium"
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
                  <TeamLogo src={club.logo_path} teamName={club.club_name} className="h-16 w-16" />

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
                        <span className="rounded-full bg-yellow-200 px-2.5 py-1 text-xs font-semibold text-yellow-900">
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
                          className="h-4 w-6 rounded-sm border border-slate-200 object-cover"
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

function PastWinnersModal({
  isOpen,
  onClose,
  division,
  standingLabel,
}: {
  isOpen: boolean
  onClose: () => void
  division: CompetitionDivision | null
  standingLabel: string | null
}): JSX.Element | null {
  const [winners, setWinners] = useState<PastWinnerRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen || !division) return

    let cancelled = false

    async function loadPastWinners(): Promise<void> {
      try {
        setLoading(true)
        setError(null)
        setWinners([])

        const { data, error: queryError } = await supabase.rpc(
          'get_team_ranking_past_winners',
          { p_division: division },
        )

        if (cancelled) return

        if (queryError) {
          throw queryError
        }

        setWinners((data ?? []) as PastWinnerRecord[])
      } catch (err) {
        console.error('Failed to load past winners:', err)
        if (!cancelled) {
          setError('Failed to load past winners.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadPastWinners()

    return () => {
      cancelled = true
    }
  }, [isOpen, division])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Past winners</h3>
            <p className="mt-1 text-sm text-slate-600">
              {standingLabel
                ? `${standingLabel} champions from previous seasons.`
                : 'Previous season champions.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="px-6 py-6">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading past winners...</div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {!loading && !error && winners.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center">
              <div className="text-base font-semibold text-slate-900">No past winners yet</div>
              <div className="mt-2 text-sm text-slate-600">
                Season 1 is still in progress, so there are no previous champions to show.
              </div>
            </div>
          ) : null}

          {!loading && !error && winners.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Season
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Team
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Country
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Points
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {winners.map((winner) => (
                    <tr
                      key={`${winner.season_number}-${winner.club_id}`}
                      className="border-t border-slate-200"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        Season {winner.season_number}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-900">
                        <div className="flex items-center gap-3">
                          <TeamLogo src={winner.logo_path} teamName={winner.club_name} />
                          <span className="font-medium">{winner.club_name}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        <img
                          src={`https://flagcdn.com/24x18/${winner.country_code.toLowerCase()}.png`}
                          alt={`${winner.country_code} flag`}
                          className="h-4 w-6 rounded-sm border border-slate-200 object-cover"
                          loading="lazy"
                        />
                      </td>

                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                        {winner.points.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function TeamRankingPage(): JSX.Element {
  const [teams, setTeams] = useState<TeamRankingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTier, setSelectedTier] = useState<TeamRankingRecord['tier']>(TEAM_TIERS.WORLD)
  const [selectedDivision, setSelectedDivision] = useState<CompetitionDivision | null>(null)
  const [myClubId, setMyClubId] = useState<string | null>(null)
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [isClubProfileOpen, setIsClubProfileOpen] = useState(false)
  const [isPastWinnersOpen, setIsPastWinnersOpen] = useState(false)

  useEffect(() => {
    let mounted = true

    async function load(): Promise<void> {
      try {
        const [{ data: myClubData, error: myClubError }, teamsResult] = await Promise.all([
          supabase.rpc('get_my_club_id'),
          getTeamRankingTeams(),
        ])

        if (!mounted) return

        if (myClubError) {
          throw myClubError
        }

        setMyClubId(myClubData ?? null)
        setTeams(teamsResult)
      } catch (error) {
        console.error('Failed to load team ranking page:', error)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void load()

    const onFocus = () => {
      void load()
    }

    window.addEventListener('focus', onFocus)

    return () => {
      mounted = false
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const myTeam = useMemo(
    () => teams.find((team) => team.id === myClubId) ?? null,
    [teams, myClubId],
  )

  useEffect(() => {
    if (!myTeam) return

    if (myTeam.tier === TEAM_TIERS.WORLD) {
      setSelectedTier(TEAM_TIERS.WORLD)
      setSelectedDivision(null)
      return
    }

    if (myTeam.tier === TEAM_TIERS.PRO) {
      setSelectedTier(TEAM_TIERS.PRO)
      setSelectedDivision(myTeam.tier2Division ?? null)
      return
    }

    if (myTeam.tier === TEAM_TIERS.CONTINENTAL) {
      setSelectedTier(TEAM_TIERS.CONTINENTAL)
      setSelectedDivision(myTeam.tier3Division ?? null)
      return
    }

    if (myTeam.tier === TEAM_TIERS.AMATEUR) {
      setSelectedTier(TEAM_TIERS.AMATEUR)
      setSelectedDivision(myTeam.amateurDivision ?? null)
    }
  }, [myTeam])

  const divisionOptions = useMemo(() => getDivisionOptions(selectedTier), [selectedTier])

  const selectedStanding = useMemo(
    () => getStandingOption(selectedTier, selectedDivision),
    [selectedTier, selectedDivision],
  )

  const selectedRows = useMemo(() => {
    if (!selectedStanding) {
      return []
    }

    if (selectedStanding.type === 'WORLD') {
      return toStandingRows(getWorldStandings(teams))
    }

    if (selectedStanding.type === 'TIER2') {
      return toStandingRows(
        getTier2DivisionStandings(teams, selectedStanding.division as Tier2Division),
      )
    }

    if (selectedStanding.type === 'TIER3') {
      return toStandingRows(
        getTier3DivisionStandings(teams, selectedStanding.division as Tier3Division),
      )
    }

    return toStandingRows(
      getAmateurDivisionStandings(teams, selectedStanding.division as AmateurDivision),
    )
  }, [selectedStanding, teams])

  const handleTierChange = (value: TeamRankingRecord['tier']) => {
    setSelectedTier(value)

    if (value === TEAM_TIERS.WORLD) {
      setSelectedDivision(null)
      return
    }

    setSelectedDivision(null)
  }

  const openClubProfile = (clubId: string) => {
    setSelectedClubId(clubId)
    setIsClubProfileOpen(true)
  }

  const closeClubProfile = () => {
    setIsClubProfileOpen(false)
  }

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold">Team Ranking</h2>
      <p className="mt-1 text-sm text-slate-600">
        View current standings, compare divisions, and track promotion or relegation zones.
      </p>

      <div className="mt-4 rounded bg-white p-4 shadow">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid w-full gap-4 md:grid-cols-2 lg:max-w-2xl">
            <div>
              <label htmlFor="tier-select" className="mb-2 block text-sm font-medium text-slate-700">
                Select tier
              </label>
              <select
                id="tier-select"
                value={selectedTier}
                onChange={(e) => handleTierChange(e.target.value as TeamRankingRecord['tier'])}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                {TIER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="division-select"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Select division
              </label>
              <select
                id="division-select"
                value={selectedDivision ?? ''}
                onChange={(e) => setSelectedDivision(e.target.value as CompetitionDivision)}
                disabled={selectedTier === TEAM_TIERS.WORLD}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">
                  {selectedTier === TEAM_TIERS.WORLD
                    ? 'No division selection needed'
                    : 'Choose division'}
                </option>
                {divisionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedStanding?.promotionLabel ? (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                {selectedStanding.promotionLabel}
              </span>
            ) : null}
            {selectedStanding?.playoffLabel ? (
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800">
                {selectedStanding.playoffLabel}
              </span>
            ) : null}
            {selectedStanding?.relegationLabel ? (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
                {selectedStanding.relegationLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded bg-white shadow">
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {selectedStanding?.label ?? 'Select a tier and division'}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {selectedStanding
                  ? 'Current season standings based on points collected across all competitions.'
                  : 'Choose a tier and division to view the standings.'}
              </p>
            </div>

            {selectedStanding ? (
              <button
                type="button"
                onClick={() => setIsPastWinnersOpen(true)}
                className="self-start text-sm font-medium text-yellow-700 underline decoration-yellow-500 underline-offset-4 hover:text-yellow-800"
              >
                Past winners
              </button>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Pos
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Team
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Country
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Points
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                    Loading standings...
                  </td>
                </tr>
              ) : null}

              {!loading &&
                selectedStanding &&
                selectedRows.map((row) => {
                  const isMyTeam = row.id === myClubId

                  return (
                    <tr
                      key={row.id}
                      className={getRowClass(
                        row,
                        selectedRows.length,
                        selectedStanding,
                        isMyTeam,
                      )}
                    >
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                        {row.position}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-900">
                        <button
                          type="button"
                          onClick={() => openClubProfile(row.id)}
                          className="flex w-full items-center gap-3 rounded-md text-left transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                        >
                          <TeamLogo src={row.logoPath} teamName={row.teamName} />

                          <div className="flex items-center gap-2">
                            <span className="font-medium hover:underline">{row.teamName}</span>

                            {!row.isActive ? (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                Inactive
                              </span>
                            ) : null}

                            {isMyTeam ? (
                              <span className="rounded-full bg-yellow-200 px-2 py-0.5 text-[11px] font-semibold text-yellow-900">
                                Your team
                              </span>
                            ) : null}
                          </div>
                        </button>
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        <img
                          src={`https://flagcdn.com/24x18/${row.countryCode.toLowerCase()}.png`}
                          alt={`${row.countryCode} flag`}
                          className="h-4 w-6 rounded-sm border border-slate-200 object-cover"
                          loading="lazy"
                        />
                      </td>

                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                        {row.points.toLocaleString()}
                      </td>
                    </tr>
                  )
                })}

              {!loading && !selectedStanding ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                    Select a tier and division to view standings.
                  </td>
                </tr>
              ) : null}

              {!loading && selectedStanding && selectedRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                    No teams available for this standing yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-4 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-green-300 bg-green-100" />
            <span>Direct promotion</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-blue-300 bg-blue-100" />
            <span>Playoff places</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-red-300 bg-red-100" />
            <span>Relegation places</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-yellow-300 bg-yellow-100" />
            <span>Your team</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-slate-300 bg-slate-100" />
            <span>Inactive team</span>
          </div>
        </div>
      </div>

      <ClubProfileModal
        clubId={selectedClubId}
        isOpen={isClubProfileOpen}
        onClose={closeClubProfile}
        isMyTeam={selectedClubId === myClubId}
      />

      <PastWinnersModal
        isOpen={isPastWinnersOpen}
        onClose={() => setIsPastWinnersOpen(false)}
        division={selectedStanding?.division ?? null}
        standingLabel={selectedStanding?.label ?? null}
      />
    </div>
  )
}
