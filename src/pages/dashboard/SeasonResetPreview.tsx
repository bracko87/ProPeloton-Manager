/**
 * src/pages/dashboard/SeasonResetPreview.tsx
 *
 * Preview page for the team ranking season reset flow.
 */

import React, { useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { previewSeasonReset } from '../../services/teamRankingSeason.service'
import {
  CompetitionDivision,
  TeamRankingRecord,
  Tier3Division,
} from '../../constants/teamRanking'
import { SeasonResetResult, TeamMovement } from '../../utils/teamRanking.utils'

const DIVISION_TRANSLATION_KEYS: Record<CompetitionDivision, string> = {
  WORLD: 'divisions.world',
  PRO_WEST: 'divisions.proWest',
  PRO_EAST: 'divisions.proEast',
  CONTINENTAL_EUROPE: 'divisions.continentalEurope',
  CONTINENTAL_AMERICA: 'divisions.continentalAmerica',
  CONTINENTAL_ASIA: 'divisions.continentalAsia',
  CONTINENTAL_AFRICA: 'divisions.continentalAfrica',
  CONTINENTAL_OCEANIA: 'divisions.continentalOceania',
  NORTH_AMERICA: 'divisions.northAmerica',
  SOUTH_AMERICA: 'divisions.southAmerica',
  WESTERN_EUROPE: 'divisions.westernEurope',
  CENTRAL_EUROPE: 'divisions.centralEurope',
  SOUTHERN_BALKAN_EUROPE: 'divisions.southernBalkanEurope',
  NORTHERN_EASTERN_EUROPE: 'divisions.northernEasternEurope',
  WEST_NORTH_AFRICA: 'divisions.westNorthAfrica',
  CENTRAL_SOUTH_AFRICA: 'divisions.centralSouthAfrica',
  WEST_CENTRAL_ASIA: 'divisions.westCentralAsia',
  SOUTH_ASIA: 'divisions.southAsia',
  EAST_SOUTHEAST_ASIA: 'divisions.eastSoutheastAsia',
  OCEANIA: 'divisions.oceania',
}

const TIER_TRANSLATION_KEYS: Record<string, string> = {
  WORLD: 'tiers.world',
  PRO: 'tiers.pro',
  CONTINENTAL: 'tiers.continental',
  AMATEUR: 'tiers.amateur',
}

const MOVEMENT_REASON_TRANSLATION_KEYS: Record<TeamMovement['reason'], string> = {
  PROMOTED: 'reasons.promoted',
  RELEGATED: 'reasons.relegated',
  DIRECT_PROMOTION: 'reasons.directPromotion',
  PLAYOFF_PROMOTION: 'reasons.playoffPromotion',
  INACTIVE_REMOVED: 'reasons.inactiveRemoved',
}

function getFlagUrl(countryCode: string): string {
  return `https://flagcdn.com/24x18/${countryCode.trim().toLowerCase()}.png`
}

function formatDivisionLabel(
  division: CompetitionDivision | null,
  t: TFunction,
): string {
  if (!division) return '-'
  return t(DIVISION_TRANSLATION_KEYS[division] ?? division)
}

function formatTierLabel(tier: string | null, t: TFunction): string {
  if (!tier) return t('table.removed')
  return t(TIER_TRANSLATION_KEYS[tier] ?? tier)
}

function formatTeamDivision(team: TeamRankingRecord, t: TFunction): string {
  if (team.tier === 'WORLD') return t('divisions.world')
  if (team.tier === 'PRO' && team.tier2Division) {
    return formatDivisionLabel(team.tier2Division, t)
  }
  if (team.tier === 'CONTINENTAL' && team.tier3Division) {
    return formatDivisionLabel(team.tier3Division, t)
  }
  if (team.tier === 'AMATEUR' && team.amateurDivision) {
    return formatDivisionLabel(team.amateurDivision, t)
  }
  return formatTierLabel(team.tier, t)
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="bg-white rounded shadow overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="text-base font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function TeamListTable({
  teams,
  emptyText,
}: {
  teams: TeamRankingRecord[]
  emptyText: string
}): JSX.Element {
  const { t, i18n } = useTranslation('seasonReset')
  const displayLocale = i18n.resolvedLanguage?.startsWith('sr')
    ? 'sr-Latn-RS'
    : i18n.resolvedLanguage || 'en-US'

  if (teams.length === 0) {
    return <div className="text-sm text-slate-500">{emptyText}</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead className="bg-slate-50">
          <tr className="text-left">
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {t('table.team')}
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {t('table.country')}
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {t('table.division')}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
              {t('table.points')}
            </th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.id} className="border-b border-slate-200 last:border-b-0">
              <td className="px-3 py-2 text-sm font-medium text-slate-900">{team.name}</td>
              <td className="px-3 py-2 text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <img
                    src={getFlagUrl(team.country)}
                    alt={t('table.countryFlag', { country: team.country })}
                    className="h-4 w-6 rounded-sm border border-slate-200 object-cover"
                    loading="lazy"
                  />
                  <span>{team.country}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-sm text-slate-700">
                {formatTeamDivision(team, t)}
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold text-slate-900">
                {team.seasonPoints.toLocaleString(displayLocale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MovementTable({ movements }: { movements: TeamMovement[] }): JSX.Element {
  const { t } = useTranslation('seasonReset')

  if (movements.length === 0) {
    return <div className="text-sm text-slate-500">{t('empty.noMovements')}</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead className="bg-slate-50">
          <tr className="text-left">
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {t('table.team')}
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {t('table.country')}
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {t('table.from')}
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {t('table.to')}
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {t('table.reason')}
            </th>
          </tr>
        </thead>
        <tbody>
          {movements.map((movement) => (
            <tr
              key={`${movement.teamId}-${movement.toTier ?? 'REMOVED'}-${movement.reason}`}
              className="border-b border-slate-200 last:border-b-0"
            >
              <td className="px-3 py-2 text-sm font-medium text-slate-900">
                {movement.teamName}
              </td>
              <td className="px-3 py-2 text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <img
                    src={getFlagUrl(movement.country)}
                    alt={t('table.countryFlag', { country: movement.country })}
                    className="h-4 w-6 rounded-sm border border-slate-200 object-cover"
                    loading="lazy"
                  />
                  <span>{movement.country}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-sm text-slate-700">
                {formatTierLabel(movement.fromTier, t)}
                {movement.fromDivision
                  ? ` / ${formatDivisionLabel(movement.fromDivision, t)}`
                  : ''}
              </td>
              <td className="px-3 py-2 text-sm text-slate-700">
                {formatTierLabel(movement.toTier, t)}
                {movement.toDivision
                  ? ` / ${formatDivisionLabel(movement.toDivision, t)}`
                  : ''}
              </td>
              <td className="px-3 py-2 text-sm font-medium text-slate-900">
                {t(MOVEMENT_REASON_TRANSLATION_KEYS[movement.reason])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RegionPromotionSection({
  title,
  teams,
  emptyText,
}: {
  title: string
  teams: TeamRankingRecord[]
  emptyText: string
}): JSX.Element {
  return (
    <SectionCard title={title}>
      <TeamListTable teams={teams} emptyText={emptyText} />
    </SectionCard>
  )
}

export default function SeasonResetPreviewPage(): JSX.Element {
  const { t } = useTranslation('seasonReset')
  const [data, setData] = useState<SeasonResetResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    ;(async () => {
      try {
        const result = await previewSeasonReset()
        if (!mounted) return
        setData(result)
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : t('page.failed'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [t])

  const summary = useMemo(() => {
    if (!data) return null

    const totalPromotedFromAmateur = Object.values(data.movements.promotedFromAmateur).reduce(
      (sum, teams) => sum + teams.length,
      0,
    )

    const totalRelegatedFromTier3 = Object.values(data.movements.relegatedFromTier3).reduce(
      (sum, teams) => sum + teams.length,
      0,
    )

    return [
      {
        label: t('summary.promotedWorld'),
        value:
          data.movements.promotedToWorldDirect.length +
          data.movements.promotedToWorldPlayoff.length,
      },
      {
        label: t('summary.relegatedWorld'),
        value: data.movements.relegatedFromWorld.length,
      },
      {
        label: t('summary.promotedProWest'),
        value:
          data.movements.promotedToProWestDirect.length +
          data.movements.promotedToProWestPlayoff.length,
      },
      {
        label: t('summary.promotedProEast'),
        value:
          data.movements.promotedToProEastDirect.length +
          data.movements.promotedToProEastPlayoff.length,
      },
      {
        label: t('summary.relegatedPro'),
        value:
          data.movements.relegatedFromProWest.length +
          data.movements.relegatedFromProEast.length,
      },
      {
        label: t('summary.promotedAmateur'),
        value: totalPromotedFromAmateur,
      },
      {
        label: t('summary.relegatedTier3'),
        value: totalRelegatedFromTier3,
      },
      {
        label: t('summary.inactiveRemoved'),
        value: data.movements.removedInactiveTeams.length,
      },
    ]
  }, [data, t])

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold">{t('page.title')}</h2>
      <p className="mt-1 text-sm text-slate-600">{t('page.description')}</p>

      {loading ? (
        <div className="mt-4 bg-white rounded shadow p-6 text-sm text-slate-500">
          {t('page.loading')}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 bg-white rounded shadow p-6 text-sm text-red-600">{error}</div>
      ) : null}

      {!loading && !error && data ? (
        <div className="mt-4 space-y-4">
          <SectionCard title={t('summary.title')} subtitle={t('summary.subtitle')}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {summary?.map((item) => (
                <div key={item.label} className="rounded border border-slate-200 p-3 bg-slate-50">
                  <div className="text-xs uppercase tracking-wide text-slate-500">{item.label}</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900">{item.value}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <SectionCard title={t('sections.worldDirect')}>
              <TeamListTable
                teams={data.movements.promotedToWorldDirect}
                emptyText={t('empty.worldDirect')}
              />
            </SectionCard>

            <SectionCard title={t('sections.worldPlayoff')}>
              <TeamListTable
                teams={data.movements.promotedToWorldPlayoff}
                emptyText={t('empty.worldPlayoff')}
              />
            </SectionCard>

            <SectionCard title={t('sections.worldRelegated')}>
              <TeamListTable
                teams={data.movements.relegatedFromWorld}
                emptyText={t('empty.worldRelegated')}
              />
            </SectionCard>

            <SectionCard title={t('sections.proWestDirect')}>
              <TeamListTable
                teams={data.movements.promotedToProWestDirect}
                emptyText={t('empty.proWestDirect')}
              />
            </SectionCard>

            <SectionCard title={t('sections.proWestPlayoff')}>
              <TeamListTable
                teams={data.movements.promotedToProWestPlayoff}
                emptyText={t('empty.proWestPlayoff')}
              />
            </SectionCard>

            <SectionCard title={t('sections.proEastDirect')}>
              <TeamListTable
                teams={data.movements.promotedToProEastDirect}
                emptyText={t('empty.proEastDirect')}
              />
            </SectionCard>

            <SectionCard title={t('sections.proEastPlayoff')}>
              <TeamListTable
                teams={data.movements.promotedToProEastPlayoff}
                emptyText={t('empty.proEastPlayoff')}
              />
            </SectionCard>

            <SectionCard title={t('sections.proWestRelegated')}>
              <TeamListTable
                teams={data.movements.relegatedFromProWest}
                emptyText={t('empty.proWestRelegated')}
              />
            </SectionCard>

            <SectionCard title={t('sections.proEastRelegated')}>
              <TeamListTable
                teams={data.movements.relegatedFromProEast}
                emptyText={t('empty.proEastRelegated')}
              />
            </SectionCard>

            <SectionCard title={t('sections.inactive')}>
              <TeamListTable
                teams={data.movements.removedInactiveTeams}
                emptyText={t('empty.inactive')}
              />
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <RegionPromotionSection
              title={t('sections.amateurEurope')}
              teams={data.movements.promotedFromAmateur.CONTINENTAL_EUROPE}
              emptyText={t('empty.europe')}
            />

            <RegionPromotionSection
              title={t('sections.amateurAmerica')}
              teams={data.movements.promotedFromAmateur.CONTINENTAL_AMERICA}
              emptyText={t('empty.america')}
            />

            <RegionPromotionSection
              title={t('sections.amateurAsia')}
              teams={data.movements.promotedFromAmateur.CONTINENTAL_ASIA}
              emptyText={t('empty.asia')}
            />

            <RegionPromotionSection
              title={t('sections.amateurAfrica')}
              teams={data.movements.promotedFromAmateur.CONTINENTAL_AFRICA}
              emptyText={t('empty.africa')}
            />

            <RegionPromotionSection
              title={t('sections.amateurOceania')}
              teams={data.movements.promotedFromAmateur.CONTINENTAL_OCEANIA}
              emptyText={t('empty.oceania')}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {(Object.keys(data.movements.relegatedFromTier3) as Tier3Division[]).map((division) => {
              const divisionLabel = formatDivisionLabel(division, t)

              return (
                <SectionCard
                  key={division}
                  title={t('sections.relegatedDynamic', { division: divisionLabel })}
                >
                  <TeamListTable
                    teams={data.movements.relegatedFromTier3[division]}
                    emptyText={t('empty.relegatedDynamic', { division: divisionLabel })}
                  />
                </SectionCard>
              )
            })}
          </div>

          <SectionCard title={t('sections.all')} subtitle={t('sections.allSubtitle')}>
            <MovementTable movements={data.movements.allMovements} />
          </SectionCard>
        </div>
      ) : null}
    </div>
  )
}
