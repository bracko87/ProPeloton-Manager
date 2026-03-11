/**
 * src/pages/dashboard/SeasonResetPreview.tsx
 *
 * Preview page for the team ranking season reset flow.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { previewSeasonReset } from '../../services/teamRankingSeason.service'
import {
  CompetitionDivision,
  DIVISION_LABELS,
  TeamRankingRecord,
  Tier3Division,
} from '../../constants/teamRanking'
import { SeasonResetResult, TeamMovement } from '../../utils/teamRanking.utils'

function getFlagUrl(countryCode: string): string {
  return `https://flagcdn.com/24x18/${countryCode.trim().toLowerCase()}.png`
}

function formatDivisionLabel(division: CompetitionDivision | null): string {
  if (!division) return '-'
  return DIVISION_LABELS[division] ?? division
}

function formatTeamDivision(team: TeamRankingRecord): string {
  if (team.tier === 'WORLD') return DIVISION_LABELS.WORLD
  if (team.tier === 'PRO' && team.tier2Division) return DIVISION_LABELS[team.tier2Division]
  if (team.tier === 'CONTINENTAL' && team.tier3Division) {
    return DIVISION_LABELS[team.tier3Division]
  }
  if (team.tier === 'AMATEUR' && team.amateurDivision) {
    return DIVISION_LABELS[team.amateurDivision]
  }
  return team.tier
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
  if (teams.length === 0) {
    return <div className="text-sm text-slate-500">{emptyText}</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead className="bg-slate-50">
          <tr className="text-left">
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Team
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Country
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Division
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
              Points
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
                    alt={`${team.country} flag`}
                    className="h-4 w-6 rounded-sm border border-slate-200 object-cover"
                    loading="lazy"
                  />
                  <span>{team.country}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-sm text-slate-700">{formatTeamDivision(team)}</td>
              <td className="px-3 py-2 text-right text-sm font-semibold text-slate-900">
                {team.seasonPoints.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MovementTable({ movements }: { movements: TeamMovement[] }): JSX.Element {
  if (movements.length === 0) {
    return <div className="text-sm text-slate-500">No season movements calculated.</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead className="bg-slate-50">
          <tr className="text-left">
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Team
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Country
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              From
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              To
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Reason
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
                    alt={`${movement.country} flag`}
                    className="h-4 w-6 rounded-sm border border-slate-200 object-cover"
                    loading="lazy"
                  />
                  <span>{movement.country}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-sm text-slate-700">
                {movement.fromTier}
                {movement.fromDivision ? ` / ${formatDivisionLabel(movement.fromDivision)}` : ''}
              </td>
              <td className="px-3 py-2 text-sm text-slate-700">
                {movement.toTier ?? 'REMOVED'}
                {movement.toDivision ? ` / ${formatDivisionLabel(movement.toDivision)}` : ''}
              </td>
              <td className="px-3 py-2 text-sm font-medium text-slate-900">{movement.reason}</td>
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
        setError(err instanceof Error ? err.message : 'Failed to preview season reset.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

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
        label: 'Promoted to World',
        value:
          data.movements.promotedToWorldDirect.length +
          data.movements.promotedToWorldPlayoff.length,
      },
      { label: 'Relegated from World', value: data.movements.relegatedFromWorld.length },
      {
        label: 'Promoted to Pro West',
        value:
          data.movements.promotedToProWestDirect.length +
          data.movements.promotedToProWestPlayoff.length,
      },
      {
        label: 'Promoted to Pro East',
        value:
          data.movements.promotedToProEastDirect.length +
          data.movements.promotedToProEastPlayoff.length,
      },
      {
        label: 'Relegated from Pro',
        value:
          data.movements.relegatedFromProWest.length +
          data.movements.relegatedFromProEast.length,
      },
      { label: 'Promoted from Amateur', value: totalPromotedFromAmateur },
      { label: 'Relegated from Tier 3', value: totalRelegatedFromTier3 },
      { label: 'Inactive removed', value: data.movements.removedInactiveTeams.length },
    ]
  }, [data])

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold">Season Reset Preview</h2>
      <p className="mt-1 text-sm text-slate-600">
        Review promotion and relegation movements before applying the season rollover.
      </p>

      {loading ? (
        <div className="mt-4 bg-white rounded shadow p-6 text-sm text-slate-500">
          Loading season reset preview...
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 bg-white rounded shadow p-6 text-sm text-red-600">{error}</div>
      ) : null}

      {!loading && !error && data ? (
        <div className="mt-4 space-y-4">
          <SectionCard title="Summary" subtitle="Calculated movements for the current standings.">
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
            <SectionCard title="Promoted to World — Direct">
              <TeamListTable
                teams={data.movements.promotedToWorldDirect}
                emptyText="No direct promotions to World."
              />
            </SectionCard>

            <SectionCard title="Promoted to World — Playoff">
              <TeamListTable
                teams={data.movements.promotedToWorldPlayoff}
                emptyText="No playoff promotions to World."
              />
            </SectionCard>

            <SectionCard title="Relegated from World">
              <TeamListTable
                teams={data.movements.relegatedFromWorld}
                emptyText="No teams relegated from World."
              />
            </SectionCard>

            <SectionCard title="Promoted to Pro West — Direct">
              <TeamListTable
                teams={data.movements.promotedToProWestDirect}
                emptyText="No direct promotions to Pro West."
              />
            </SectionCard>

            <SectionCard title="Promoted to Pro West — Playoff">
              <TeamListTable
                teams={data.movements.promotedToProWestPlayoff}
                emptyText="No playoff promotions to Pro West."
              />
            </SectionCard>

            <SectionCard title="Promoted to Pro East — Direct">
              <TeamListTable
                teams={data.movements.promotedToProEastDirect}
                emptyText="No direct promotions to Pro East."
              />
            </SectionCard>

            <SectionCard title="Promoted to Pro East — Playoff">
              <TeamListTable
                teams={data.movements.promotedToProEastPlayoff}
                emptyText="No playoff promotions to Pro East."
              />
            </SectionCard>

            <SectionCard title="Relegated from Pro West">
              <TeamListTable
                teams={data.movements.relegatedFromProWest}
                emptyText="No teams relegated from Pro West."
              />
            </SectionCard>

            <SectionCard title="Relegated from Pro East">
              <TeamListTable
                teams={data.movements.relegatedFromProEast}
                emptyText="No teams relegated from Pro East."
              />
            </SectionCard>

            <SectionCard title="Inactive Clubs Removed">
              <TeamListTable
                teams={data.movements.removedInactiveTeams}
                emptyText="No inactive clubs removed."
              />
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <RegionPromotionSection
              title="Promoted from Amateur to Continental Europe"
              teams={data.movements.promotedFromAmateur.CONTINENTAL_EUROPE}
              emptyText="No promotions to Continental Europe."
            />

            <RegionPromotionSection
              title="Promoted from Amateur to Continental America"
              teams={data.movements.promotedFromAmateur.CONTINENTAL_AMERICA}
              emptyText="No promotions to Continental America."
            />

            <RegionPromotionSection
              title="Promoted from Amateur to Continental Asia"
              teams={data.movements.promotedFromAmateur.CONTINENTAL_ASIA}
              emptyText="No promotions to Continental Asia."
            />

            <RegionPromotionSection
              title="Promoted from Amateur to Continental Africa"
              teams={data.movements.promotedFromAmateur.CONTINENTAL_AFRICA}
              emptyText="No promotions to Continental Africa."
            />

            <RegionPromotionSection
              title="Promoted from Amateur to Continental Oceania"
              teams={data.movements.promotedFromAmateur.CONTINENTAL_OCEANIA}
              emptyText="No promotions to Continental Oceania."
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {(Object.keys(data.movements.relegatedFromTier3) as Tier3Division[]).map((division) => (
              <SectionCard key={division} title={`Relegated from ${DIVISION_LABELS[division]}`}>
                <TeamListTable
                  teams={data.movements.relegatedFromTier3[division]}
                  emptyText={`No teams relegated from ${DIVISION_LABELS[division]}.`}
                />
              </SectionCard>
            ))}
          </div>

          <SectionCard title="All Movements" subtitle="Full list of promotions, relegations and removals.">
            <MovementTable movements={data.movements.allMovements} />
          </SectionCard>
        </div>
      ) : null}
    </div>
  )
}