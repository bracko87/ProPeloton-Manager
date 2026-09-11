from pathlib import Path

path = Path('src/pages/dashboard/RaceDetailPage.tsx')
text = path.read_text()

old_types = '''type RaceClassificationRow = {
  classification_type: ClassificationView | string
  entity_type: 'rider' | 'team' | string
  rank: number | null
  previous_rank: number | null
  rider_id: string | null
  team_id: string | null
  display_name_snapshot: string | null
  team_name_snapshot: string | null
  total_time_seconds: number | null
  gap_seconds: number | null
  points: number | null
}


type ReplayPreStageStanding = {'''
new_types = '''type RaceClassificationRow = {
  classification_type: ClassificationView | string
  entity_type: 'rider' | 'team' | string
  rank: number | null
  previous_rank: number | null
  rider_id: string | null
  team_id: string | null
  display_name_snapshot: string | null
  team_name_snapshot: string | null
  total_time_seconds: number | null
  gap_seconds: number | null
  points: number | null
}

type RaceFullStandingRow = {
  rider_id: string | null
  team_id: string | null
  rider_name_snapshot: string | null
  team_name_snapshot: string | null
  country_code_snapshot: string | null
  start_number: number | null
  rank: number | null
  previous_rank: number | null
  total_time_seconds: number | null
  gap_seconds: number | null
  status: string
  status_from_stage_number: number | null
  status_reason_code: string | null
  required_jersey_units: number | null
  available_jersey_units: number | null
  missing_jersey_units: number | null
  last_result_stage_number: number | null
  last_result_rank: number | null
  last_result_status: string | null
  last_result_elapsed_seconds: number | null
  last_result_gap_seconds: number | null
}

type RaceFieldSummary = {
  started: number
  active: number
  dsq: number
  dnf: number
  dns: number
  otl: number
  not_classified: number
}

type FullRaceStandingsPayload = {
  race_id?: string | null
  stage_id?: string | null
  stage_number?: number | null
  rows: RaceFullStandingRow[]
  summary: RaceFieldSummary
}


type ReplayPreStageStanding = {'''
if text.count(old_types) != 1:
    raise SystemExit(f'Expected one classification type block, found {text.count(old_types)}')
text = text.replace(old_types, new_types, 1)

old_payload = '''type RaceResultsViewPayload = {
  race_id?: string | null
  stage_id?: string | null
  stage_results: RaceStageResultRow[]
  point_results: RacePointResultRow[]
  classifications: RaceClassificationRow[]
  leader_snapshot: Record<string, unknown>
}'''
new_payload = '''type RaceResultsViewPayload = {
  race_id?: string | null
  stage_id?: string | null
  stage_results: RaceStageResultRow[]
  point_results: RacePointResultRow[]
  classifications: RaceClassificationRow[]
  leader_snapshot: Record<string, unknown>
  full_race_standings?: RaceFullStandingRow[]
  field_summary?: RaceFieldSummary | null
}'''
if text.count(old_payload) != 1:
    raise SystemExit(f'Expected one results payload type, found {text.count(old_payload)}')
text = text.replace(old_payload, new_payload, 1)

old_normalize_anchor = '''function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function normalizeRaceResultsPayload(value: unknown): RaceResultsViewPayload {'''
new_normalize_anchor = '''function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

const EMPTY_RACE_FIELD_SUMMARY: RaceFieldSummary = {
  started: 0,
  active: 0,
  dsq: 0,
  dnf: 0,
  dns: 0,
  otl: 0,
  not_classified: 0,
}

function normalizeRaceFieldSummary(value: unknown): RaceFieldSummary {
  const record = getRecord(value)
  const count = (key: keyof RaceFieldSummary) => {
    const parsed = Number(record[key])
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0
  }

  return {
    started: count('started'),
    active: count('active'),
    dsq: count('dsq'),
    dnf: count('dnf'),
    dns: count('dns'),
    otl: count('otl'),
    not_classified: count('not_classified'),
  }
}

function normalizeFullRaceStandingsPayload(value: unknown): FullRaceStandingsPayload {
  const record = getRecord(value)
  const stageNumber = Number(record.stage_number)

  return {
    race_id: typeof record.race_id === 'string' ? record.race_id : null,
    stage_id: typeof record.stage_id === 'string' ? record.stage_id : null,
    stage_number: Number.isFinite(stageNumber) ? stageNumber : null,
    rows: arrayOrEmpty<RaceFullStandingRow>(record.rows),
    summary: normalizeRaceFieldSummary(record.summary),
  }
}

function normalizeRaceResultsPayload(value: unknown): RaceResultsViewPayload {'''
if text.count(old_normalize_anchor) != 1:
    raise SystemExit(f'Expected one normalizer anchor, found {text.count(old_normalize_anchor)}')
text = text.replace(old_normalize_anchor, new_normalize_anchor, 1)

old_load = '''      const { data, error } = await raceDetailReadRpc('get_race_results_view_v1', {
        p_race_id: race.id,
        p_after_stage_id: classificationResultsStageId,
      })

      if (!mounted) return

      if (error) {
        setClassificationPayload(null)
        setClassificationError(error.message)
      } else {
        const normalizedClassificationPayload =
          await hydrateRaceResultsPayloadDisplayNames(
            normalizeRaceResultsPayload(data)
          )

        if (!mounted) return

        setClassificationPayload(normalizedClassificationPayload)
      }

      setClassificationLoading(false)'''
new_load = '''      const [classificationResponse, fullStandingResponse] = await Promise.all([
        raceDetailReadRpc('get_race_results_view_v1', {
          p_race_id: race.id,
          p_after_stage_id: classificationResultsStageId,
        }),
        raceDetailReadRpc('get_full_race_standings_v1', {
          p_race_id: race.id,
          p_after_stage_id: classificationResultsStageId,
        }),
      ])

      if (!mounted) return

      if (classificationResponse.error) {
        setClassificationPayload(null)
        setClassificationError(classificationResponse.error.message)
      } else {
        const normalizedClassificationPayload =
          await hydrateRaceResultsPayloadDisplayNames(
            normalizeRaceResultsPayload(classificationResponse.data)
          )
        const normalizedFullStandings = fullStandingResponse.error
          ? null
          : normalizeFullRaceStandingsPayload(fullStandingResponse.data)

        if (!mounted) return

        if (fullStandingResponse.error) {
          console.error(
            'Could not load roster-based full race standings:',
            fullStandingResponse.error
          )
        }

        setClassificationPayload({
          ...normalizedClassificationPayload,
          full_race_standings: normalizedFullStandings?.rows ?? [],
          field_summary: normalizedFullStandings?.summary ?? null,
        })
      }

      setClassificationLoading(false)'''
if text.count(old_load) != 1:
    raise SystemExit(f'Expected one classification RPC load block, found {text.count(old_load)}')
text = text.replace(old_load, new_load, 1)

old_extra = '''  const fullRaceStandingExtraRows = useMemo(
    () => {
      const rankedRiderIds = new Set(
        fullGeneralClassificationRows
          .map((row) => row.rider_id)
          .filter((value): value is string => Boolean(value))
      )

      return sortRankedRows(stageResultsPayload?.stage_results ?? []).filter((row) => {
        const riderId = row.rider_id ?? null
        if (!riderId || rankedRiderIds.has(riderId)) return false
        return isDnsLikeStatus(row.status)
      })
    },
    [fullGeneralClassificationRows, stageResultsPayload]
  )
'''
new_extra = '''  const fullRaceStandingRows = useMemo<RaceFullStandingRow[]>(() => {
    const rosterRows = classificationPayload?.full_race_standings ?? []
    if (rosterRows.length > 0) return rosterRows

    return fullGeneralClassificationRows.map((row) => ({
      rider_id: row.rider_id,
      team_id: row.team_id,
      rider_name_snapshot: row.display_name_snapshot,
      team_name_snapshot: row.team_name_snapshot,
      country_code_snapshot: null,
      start_number: null,
      rank: row.rank,
      previous_rank: row.previous_rank,
      total_time_seconds: row.total_time_seconds,
      gap_seconds: row.gap_seconds,
      status: 'active',
      status_from_stage_number: null,
      status_reason_code: null,
      required_jersey_units: null,
      available_jersey_units: null,
      missing_jersey_units: null,
      last_result_stage_number: null,
      last_result_rank: null,
      last_result_status: null,
      last_result_elapsed_seconds: null,
      last_result_gap_seconds: null,
    }))
  }, [classificationPayload, fullGeneralClassificationRows])

  const fullRaceFieldSummary = useMemo<RaceFieldSummary>(() => {
    if (classificationPayload?.field_summary) {
      return classificationPayload.field_summary
    }

    const started = participantTeams.reduce(
      (total, team) => total + team.riders.length,
      0
    )
    const active = fullGeneralClassificationRows.length

    return {
      ...EMPTY_RACE_FIELD_SUMMARY,
      started,
      active,
      not_classified: Math.max(0, started - active),
    }
  }, [classificationPayload, fullGeneralClassificationRows, participantTeams])
'''
if text.count(old_extra) != 1:
    raise SystemExit(f'Expected one legacy full-standing extra-row block, found {text.count(old_extra)}')
text = text.replace(old_extra, new_extra, 1)

old_title = '''                <h3 className="mt-1 text-xl font-bold text-slate-950">
                  {fullStandingModal === 'race' ? t('results.fullRaceStanding') : t('results.fullStageStanding')}
                </h3>'''
new_title = '''                <h3 className="mt-1 text-xl font-bold text-slate-950">
                  {fullStandingModal === 'race' ? t('results.fullRaceStanding') : t('results.fullStageStanding')}
                </h3>
                {fullStandingModal === 'race' ? (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">Started {fullRaceFieldSummary.started}</span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Active {fullRaceFieldSummary.active}</span>
                    {fullRaceFieldSummary.dsq > 0 ? <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">DSQ {fullRaceFieldSummary.dsq}</span> : null}
                    {fullRaceFieldSummary.dnf > 0 ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">DNF {fullRaceFieldSummary.dnf}</span> : null}
                    {fullRaceFieldSummary.dns > 0 ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">DNS {fullRaceFieldSummary.dns}</span> : null}
                    {fullRaceFieldSummary.otl > 0 ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">OTL {fullRaceFieldSummary.otl}</span> : null}
                  </div>
                ) : null}'''
if text.count(old_title) != 1:
    raise SystemExit(f'Expected one full-standing modal title, found {text.count(old_title)}')
text = text.replace(old_title, new_title, 1)

start_marker = '''              {fullStandingModal === 'race' ? (
                <table className="min-w-[820px] w-full text-sm">'''
end_marker = '''              ) : (
                <table className="min-w-[940px] w-full text-sm">'''
if text.count(start_marker) != 1 or text.count(end_marker) != 1:
    raise SystemExit('Could not identify full-race modal table boundaries')
start = text.index(start_marker)
end = text.index(end_marker, start)
new_race_table = '''              {fullStandingModal === 'race' ? (
                <table className="min-w-[1120px] w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3">#</th>
                      <th className="px-3 py-3">{t('results.country')}</th>
                      <th className="px-3 py-3">{t('results.rider')}</th>
                      <th className="px-3 py-3">{t('results.team')}</th>
                      <th className="px-3 py-3 text-right">{t('results.time')}</th>
                      <th className="px-3 py-3 text-right">{t('results.gap')}</th>
                      <th className="px-3 py-3">{t('results.status')}</th>
                      <th className="px-3 py-3">History</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fullRaceStandingRows.map((row) => {
                      const participantRider = row.rider_id
                        ? fullStandingParticipantRiderById.get(row.rider_id)
                        : null
                      const riderName =
                        participantRider?.rider_full_name?.trim() ||
                        row.rider_name_snapshot?.trim() ||
                        participantRider?.rider_name_snapshot?.trim() ||
                        '—'
                      const countryCode =
                        row.country_code_snapshot ||
                        participantRider?.country_code_snapshot ||
                        participantRider?.country_code ||
                        null
                      const normalizedStatus = String(row.status || 'not_classified').trim().toLowerCase()
                      const isActive = normalizedStatus === 'active'
                      const statusLabel = isActive
                        ? 'Active'
                        : normalizedStatus === 'not_classified'
                          ? 'Not classified'
                          : normalizedStatus.toUpperCase()
                      const reasonLabel = row.status_reason_code
                        ? row.status_reason_code
                            .replace(/_/g, ' ')
                            .replace(/^./, (value) => value.toUpperCase())
                        : null
                      const jerseyDetail =
                        row.required_jersey_units !== null &&
                        row.available_jersey_units !== null
                          ? `${row.required_jersey_units} required, ${row.available_jersey_units} available`
                          : null
                      const lastResultLabel = row.last_result_stage_number
                        ? [
                            `Stage ${row.last_result_stage_number}`,
                            row.last_result_rank ? `#${row.last_result_rank}` : null,
                            row.last_result_elapsed_seconds !== null
                              ? formatRaceClock(row.last_result_elapsed_seconds)
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : null

                      return (
                        <tr
                          key={`full-race-${row.rider_id ?? row.start_number ?? riderName}`}
                          className={`border-b border-slate-100 ${isActive ? '' : 'bg-slate-50/60'}`}
                        >
                          <td className="px-3 py-3 font-semibold">{isActive ? row.rank ?? '—' : '—'}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <SmallCountryFlag code={countryCode} />
                              <span>{normalizeCountryCode(countryCode) ?? '—'}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 font-semibold text-slate-950">{riderName}</td>
                          <td className="px-3 py-3 text-slate-600">{row.team_name_snapshot ?? '—'}</td>
                          <td className="px-3 py-3 text-right font-semibold">
                            {isActive ? formatRaceClock(row.total_time_seconds) : '—'}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-600">
                            {isActive ? formatClassificationGap(row.gap_seconds) : '—'}
                          </td>
                          <td className="px-3 py-3 font-semibold text-slate-700">
                            <div>{statusLabel}</div>
                            {!isActive && row.status_from_stage_number ? (
                              <div className="mt-0.5 text-xs font-medium text-slate-500">
                                From Stage {row.status_from_stage_number}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-xs leading-5 text-slate-600">
                            {!isActive && reasonLabel ? (
                              <div className="font-semibold text-slate-700">
                                {reasonLabel}{jerseyDetail ? ` (${jerseyDetail})` : ''}
                              </div>
                            ) : null}
                            {!isActive && lastResultLabel ? (
                              <div>Last result: {lastResultLabel}</div>
                            ) : null}
                            {isActive ? '—' : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
'''
text = text[:start] + new_race_table + text[end + len('              ) : (\n'):]

for forbidden in ('Austral Coast Tour', 'HNS Hrvatska'):
    if forbidden in text:
        raise SystemExit(f'Race-specific Phase 3 logic is forbidden: {forbidden}')
if 'fullRaceStandingExtraRows' in text:
    raise SystemExit('Legacy selected-stage extra-row workaround still present')
if "get_full_race_standings_v1" not in text:
    raise SystemExit('Roster-based standings RPC is not wired into Race Detail')
if 'fullRaceStandingRows.map' not in text:
    raise SystemExit('Full Race Standings is not rendering roster-based rows')

path.write_text(text)
