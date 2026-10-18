import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import appI18n from '../../../i18n'
import { supabase } from '../../../lib/supabase'
import { estimateRiderPower, type RiderPowerEstimate, type RiderPowerSkills } from '../../../lib/riderPower'

type RiderDevelopment = {
  rider_id: string
  display_name: string
  country_code: string | null
  role: string | null
  overall: number | null
  potential: number | null
  fatigue: number | null
  morale: number | null
  availability_status: string | null
  latest_net_change: number | null
  latest_overall_delta: number | null
  development_8w: number
  overall_delta_8w: number
  weeks_recorded: number
  ui_state?: string | null
  ui_label?: string | null
}

type WorkspacePayload = {
  rider_development?: RiderDevelopment[]
}

function humanize(value: string | null | undefined): string {
  if (!value) return '—'
  const key = `premiumCenter:values.${value}`
  if (appI18n.exists(key)) return appI18n.t(key)
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  const safe = Number(value ?? 0)
  return new Intl.NumberFormat(appI18n.resolvedLanguage || appI18n.language || undefined, {
    maximumFractionDigits: digits,
  }).format(Number.isFinite(safe) ? safe : 0)
}

function formatDelta(value: number | null | undefined): string {
  const safe = Number(value ?? 0)
  const formatted = formatNumber(safe)
  return safe > 0 ? `+${formatted}` : formatted
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getFlagUrl(code: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w40/${normalized}.png`
    : null
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string
  value: React.ReactNode
  helper?: string
}): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
      {helper ? <div className="mt-1 text-xs text-slate-500">{helper}</div> : null}
    </div>
  )
}

export default function PremiumRiderDevelopmentPanel({
  clubId,
}: {
  clubId: string
}): JSX.Element {
  const { t } = useTranslation('premiumCenter')
  const [rows, setRows] = useState<RiderDevelopment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [potentialRiderIds, setPotentialRiderIds] = useState<string[]>([])
  const [showPotentialRiderEditor, setShowPotentialRiderEditor] = useState(false)
  const [powerSummaries, setPowerSummaries] = useState<Array<{ id: string; name: string; power: RiderPowerEstimate }>>([])
  const [selectedPowerRiderId, setSelectedPowerRiderId] = useState('')

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      setLoading(true)
      setError(null)

      const { data, error: loadError } = await supabase.rpc('premium_get_command_center_v1', {
        p_club_id: clubId,
      })

      if (!active) return

      if (loadError) {
        setError(loadError.message)
        setRows([])
      } else {
        const payload = (data ?? {}) as WorkspacePayload
        // The legacy summary table is empty in production. Request genuine recorded
        // weekly skill differences using the premium-gated snapshots RPC instead.
        const sourceRows = Array.isArray(payload.rider_development) ? payload.rider_development : []
        const { data: history, error: historyError } = await supabase.rpc(
          'premium_get_rider_skill_history_v1',
          { p_club_id: clubId },
        )
        if (!active) return
        if (historyError) {
          setError(historyError.message)
          setRows(sourceRows)
        } else {
          const byRider = new Map(
            ((history ?? []) as Array<{
              rider_id: string
              development_8w: number
              weeks_recorded: number
            }>).map(row => [row.rider_id, row]),
          )
          setRows(sourceRows.map(row => {
            const recorded = byRider.get(row.rider_id)
            return {
              ...row,
              development_8w: Number(recorded?.development_8w ?? 0),
              weeks_recorded: Number(recorded?.weeks_recorded ?? 0),
              // The source snapshots contain skill values, not historical
              // overall rating: do not display an invented overall delta.
              overall_delta_8w: 0,
            }
          }))
        }
      }

      setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [clubId])

  // Premium power profiles reuse real rider skills; never invent historical watts.
  useEffect(() => {
    let active = true
    const ids = rows.map(row => row.rider_id).slice(0, 50)
    if (!ids.length) { setPowerSummaries([]); return () => { active = false } }
    void Promise.all([
      supabase.from('riders').select('id,sprint,climbing,time_trial,endurance,flat,resistance').in('id',ids),
      supabase.rpc('get_rider_physiques_v1',{ p_rider_ids: ids }),
    ]).then(([skillsResult, physiqueResult]) => {
      if (!active) return
      if (skillsResult.error || physiqueResult.error) { setPowerSummaries([]); return }
      const physiques = new Map(
        ((physiqueResult.data ?? []) as Array<{rider_id:string;weight_kg:number}>)
          .map(row => [row.rider_id,row.weight_kg])
      )
      const names = new Map(rows.map(row => [row.rider_id,row.display_name]))
      const summaries = ((skillsResult.data ?? []) as Array<RiderPowerSkills & {id:string}>)
        .flatMap(rider => {
          const estimate=estimateRiderPower(rider,physiques.get(rider.id))
          return estimate ? [{id:rider.id,name:names.get(rider.id) || rider.id,power:estimate}] : []
        })
        .sort((a,b) => b.power.wPerKg-a.power.wPerKg)
      setPowerSummaries(summaries)
    })
    return () => { active = false }
  }, [rows])

  const displayedPowerRider = powerSummaries.find(row => row.id===selectedPowerRiderId) ?? powerSummaries[0]

  const roles = useMemo(
    () => Array.from(new Set(rows.map(row => row.role).filter((value): value is string => Boolean(value)))).sort(),
    [rows],
  )

  const statuses = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map(row => row.availability_status)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [rows],
  )

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return rows.filter(row => {
      if (normalizedSearch && !row.display_name.toLowerCase().includes(normalizedSearch)) return false
      if (roleFilter !== 'all' && row.role !== roleFilter) return false
      if (statusFilter !== 'all' && row.availability_status !== statusFilter) return false
      return true
    })
  }, [roleFilter, rows, search, statusFilter])

  useEffect(() => {
    if (rows.length === 0) {
      setPotentialRiderIds([])
      return
    }

    const defaultIds = rows
      .slice()
      .sort(
        (a, b) =>
          Number(b.potential ?? 0) -
          Number(b.overall ?? 0) -
          (Number(a.potential ?? 0) - Number(a.overall ?? 0)),
      )
      .slice(0, Math.min(8, rows.length))
      .map(row => row.rider_id)

    setPotentialRiderIds(current => {
      const validCurrent = current.filter(id => rows.some(row => row.rider_id === id))
      const next = [...validCurrent]

      defaultIds.forEach(id => {
        if (next.length < Math.min(8, rows.length) && !next.includes(id)) {
          next.push(id)
        }
      })

      return next.slice(0, Math.min(8, rows.length))
    })
  }, [rows])

  const metrics = useMemo(() => {
    const overall = rows.map(row => Number(row.overall ?? 0)).filter(value => value > 0)
    const potential = rows.map(row => Number(row.potential ?? 0)).filter(value => value > 0)
    const fatigue = rows.map(row => Number(row.fatigue ?? 0))
    const totalDevelopment = rows.reduce((sum, row) => sum + Number(row.development_8w || 0), 0)
    const improving = rows.filter(row => Number(row.development_8w || 0) > 0).length
    const coverage = rows.length
      ? Math.round((rows.filter(row => Number(row.weeks_recorded || 0) > 0).length / rows.length) * 100)
      : 0

    return {
      averageOverall: average(overall),
      averagePotential: average(potential),
      averageFatigue: average(fatigue),
      totalDevelopment,
      improving,
      coverage,
    }
  }, [rows])

  const developmentLeaders = useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => Number(b.development_8w) - Number(a.development_8w))
        .slice(0, 8)
        .map(row => ({
          name: row.display_name,
          development: Number(row.development_8w || 0),
          overallChange: Number(row.overall_delta_8w || 0),
        })),
    [rows],
  )

  const potentialComparison = useMemo(
    () =>
      potentialRiderIds
        .map(id => rows.find(row => row.rider_id === id))
        .filter((row): row is RiderDevelopment => Boolean(row))
        .map(row => ({
          riderId: row.rider_id,
          name: row.display_name,
          overall: Number(row.overall ?? 0),
          potential: Number(row.potential ?? 0),
        })),
    [potentialRiderIds, rows],
  )

  function replacePotentialChartRider(slotIndex: number, riderId: string): void {
    setPotentialRiderIds(current => {
      if (current.some((id, index) => id === riderId && index !== slotIndex)) {
        return current
      }

      return current.map((id, index) => (index === slotIndex ? riderId : id))
    })
  }

  const prospects = useMemo(
    () =>
      rows
        .filter(row => Number(row.potential ?? 0) - Number(row.overall ?? 0) >= 5)
        .sort(
          (a, b) =>
            Number(b.potential ?? 0) -
            Number(b.overall ?? 0) -
            (Number(a.potential ?? 0) - Number(a.overall ?? 0)),
        )
        .slice(0, 5),
    [rows],
  )

  const fatigueWatch = useMemo(
    () =>
      rows
        .filter(row => Number(row.fatigue ?? 0) >= 60)
        .sort((a, b) => Number(b.fatigue ?? 0) - Number(a.fatigue ?? 0))
        .slice(0, 5),
    [rows],
  )

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-slate-950">{t('development.title')}</h3>
              <span className="rounded-full border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-800">
                Premium
              </span>
            </div>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
              {t('development.description')}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {t('development.coverage')}: {metrics.coverage}%
          </div>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map(key => (
            <div key={key} className="h-28 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-base font-semibold text-slate-900">{t('power.title')}</div>
            <p className="mt-1 text-xs leading-5 text-slate-600">{t('power.explanation')}</p>
            {displayedPowerRider ? (
              <>
                <label className="mt-3 block text-xs font-semibold text-slate-600" htmlFor="premium-power-rider">{t('power.selectRider')}</label>
                <select id="premium-power-rider" value={displayedPowerRider.id}
                  onChange={event => setSelectedPowerRiderId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm sm:max-w-md">
                  {powerSummaries.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {([
                    [t('power.ftp'), `${displayedPowerRider.power.ftp} W`],
                    [t('power.wkg'), `${displayedPowerRider.power.wPerKg.toFixed(2)} W/kg`],
                    [t('power.peak'), `${displayedPowerRider.power.fiveSeconds} W`],
                    [t('power.fiveMin'), `${displayedPowerRider.power.fiveMinutes} W`],
                  ] as [string,string][]).map(([label,value]) =>
                    <div key={label} className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">{label}</div>
                      <div className="mt-1 font-semibold text-slate-900">{value}</div>
                    </div>
                  )}
                </div>
                <div className="mt-4 h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      {duration:t('power.fiveSec'),watts:displayedPowerRider.power.fiveSeconds},
                      {duration:t('power.oneMin'),watts:displayedPowerRider.power.oneMinute},
                      {duration:t('power.fiveMin'),watts:displayedPowerRider.power.fiveMinutes},
                      {duration:t('power.ftp'),watts:displayedPowerRider.power.ftp},
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="duration" tick={{fontSize:11}} />
                      <YAxis tick={{fontSize:11}} />
                      <Tooltip formatter={(value:number) => [`${value} W`,t('power.estimated')]} />
                      <Bar dataKey="watts" fill="#0f766e" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : <p className="mt-3 text-sm text-slate-500">{t('power.unavailable')}</p>}
            <p className="mt-2 text-xs leading-5 text-slate-500">{t('power.noEngineChange')}</p>
          </section>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <StatCard label={t('development.avgOverall')} value={formatNumber(metrics.averageOverall)} />
            <StatCard label={t('development.avgPotential')} value={formatNumber(metrics.averagePotential)} />
            <StatCard label={t('development.totalEightWeek')} value={formatDelta(metrics.totalDevelopment)} />
            <StatCard label={t('development.improvingRiders')} value={metrics.improving} helper={t('development.ofRiders', { count: rows.length })} />
            <StatCard label={t('development.avgFatigue')} value={formatNumber(metrics.averageFatigue, 0)} />
            <StatCard label={t('development.coverage')} value={`${metrics.coverage}%`} />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-base font-semibold text-slate-900">{t('development.leaders')}</div>
              <div className="mt-1 text-sm text-slate-500">{t('development.leadersHint')}</div>
{!developmentLeaders.some(row => Math.abs(row.development) > 0) ? (
                <div className="flex h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                  <p className="text-sm font-semibold text-slate-700">
                    {metrics.coverage > 0 ? t('development.noProgressTitle') : t('development.noHistoryTitle')}
                  </p>
                  <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">
                    {metrics.coverage > 0 ? t('development.noProgressDescription') : t('development.noHistoryDescription')}
                  </p>
                </div>
              ) : (
                            <div className="mt-4 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={developmentLeaders} layout="vertical" margin={{ left: 18, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={105} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="development" name={t('development.eightWeekDevelopment')} fill="#eab308" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              )}            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-slate-900">{t('development.potentialVsOverall')}</div>
                  <div className="mt-1 text-sm text-slate-500">{t('development.potentialVsOverallHint')}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPotentialRiderEditor(current => !current)}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {showPotentialRiderEditor
                    ? t('development.doneEditingRiders')
                    : t('development.editChartRiders')}
                </button>
              </div>

              {showPotentialRiderEditor ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-xs text-slate-500">
                    {t('development.editChartRidersHint')}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {potentialRiderIds.map((riderId, slotIndex) => (
                      <label key={`${slotIndex}:${riderId}`} className="flex items-center gap-2">
                        <span className="w-5 shrink-0 text-[11px] text-slate-400">
                          {slotIndex + 1}
                        </span>
                        <select
                          value={riderId}
                          onChange={event =>
                            replacePotentialChartRider(slotIndex, event.target.value)
                          }
                          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
                        >
                          {rows
                            .slice()
                            .sort((a, b) => a.display_name.localeCompare(b.display_name))
                            .filter(
                              rider =>
                                rider.rider_id === riderId ||
                                !potentialRiderIds.includes(rider.rider_id),
                            )
                            .map(rider => (
                              <option key={rider.rider_id} value={rider.rider_id}>
                                {rider.display_name}
                              </option>
                            ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={potentialComparison} margin={{ left: 4, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={72} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="overall" name={t('development.overall')} fill="#334155" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="potential" name={t('development.potential')} fill="#eab308" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-base font-semibold text-slate-900">{t('development.prospectWatch')}</div>
              <div className="mt-3 space-y-2">
                {prospects.length ? prospects.map(rider => (
                  <Link
                    key={rider.rider_id}
                    to={`/dashboard/my-riders/${rider.rider_id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-white"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{rider.display_name}</div>
                      <div className="text-xs text-slate-500">{humanize(rider.role)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-900">{rider.overall ?? '—'} → {rider.potential ?? '—'}</div>
                      <div className="text-xs text-slate-500">{formatDelta(Number(rider.potential ?? 0) - Number(rider.overall ?? 0))}</div>
                    </div>
                  </Link>
                )) : <div className="text-sm text-slate-500">{t('development.noWatchItems')}</div>}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-base font-semibold text-slate-900">{t('development.fatigueWatch')}</div>
              <div className="mt-3 space-y-2">
                {fatigueWatch.length ? fatigueWatch.map(rider => (
                  <Link
                    key={rider.rider_id}
                    to={`/dashboard/my-riders/${rider.rider_id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-white"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{rider.display_name}</div>
                      <div className="text-xs text-slate-500">{humanize(rider.availability_status)}</div>
                    </div>
                    <div className="text-sm font-semibold text-amber-700">{rider.fatigue ?? 0}/100</div>
                  </Link>
                )) : <div className="text-sm text-slate-500">{t('development.noFatigueRisk')}</div>}
              </div>
            </section>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-base font-semibold text-slate-900">{t('development.riderDetail')}</div>
                <div className="mt-1 text-sm text-slate-500">{t('development.riderDetailHint')}</div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder={t('development.searchRiders')}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  value={roleFilter}
                  onChange={event => setRoleFilter(event.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="all">{t('development.allRoles')}</option>
                  {roles.map(role => <option key={role} value={role}>{humanize(role)}</option>)}
                </select>
                <select
                  value={statusFilter}
                  onChange={event => setStatusFilter(event.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="all">{t('development.allStatuses')}</option>
                  {statuses.map(status => <option key={status} value={status}>{humanize(status)}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <th className="px-4 py-3">{t('development.rider')}</th>
                    <th className="px-4 py-3">{t('development.role')}</th>
                    <th className="px-4 py-3">{t('development.overall')}</th>
                    <th className="px-4 py-3">{t('development.potential')}</th>
                    <th className="px-4 py-3">{t('development.eightWeekDevelopment')}</th>
                    <th className="px-4 py-3">{t('development.overallChange')}</th>
                    <th className="px-4 py-3">{t('development.latestWeek')}</th>
                    <th className="px-4 py-3">{t('development.fatigue')}</th>
                    <th className="px-4 py-3">{t('development.availability')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows
                    .slice()
                    .sort((a, b) => Number(b.development_8w) - Number(a.development_8w))
                    .map(rider => {
                      const flagUrl = getFlagUrl(rider.country_code)
                      return (
                        <tr key={rider.rider_id} className="border-t border-slate-100">
                          <td className="px-4 py-3">
                            <Link
                              to={`/dashboard/my-riders/${rider.rider_id}`}
                              className="inline-flex items-center gap-2 font-medium text-slate-900 hover:text-yellow-700"
                            >
                              {flagUrl ? <img src={flagUrl} alt="" className="h-3.5 w-5 rounded-sm object-cover" /> : null}
                              {rider.display_name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{humanize(rider.role)}</td>
                          <td className="px-4 py-3 text-slate-900">{rider.overall ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{rider.potential ?? '—'}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{formatDelta(rider.development_8w)}</td>
                          <td className="px-4 py-3 text-slate-700">{formatDelta(rider.overall_delta_8w)}</td>
                          <td className="px-4 py-3 text-slate-700">{formatDelta(rider.latest_net_change)}</td>
                          <td className="px-4 py-3 text-slate-700">{rider.fatigue ?? 0}</td>
                          <td className="px-4 py-3 text-slate-600">{humanize(rider.availability_status)}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
