'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  Archive,
  ChevronRight,
  Mountain,
  Route,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type HiddenRaceRow = {
  pool_id: string
  race_id: string
  name: string
  short_name?: string | null
  country_code?: string | null
  country_name?: string | null
  host_city?: string | null
  category?: string | null
  race_type?: string | null
  stage_count?: number | null
  status?: string | null
  active?: boolean | null
  is_calendar_public?: boolean | null
  pool_key?: string | null
  intended_uses?: string[] | null
  difficulty?: string | null
  pool_notes?: string | null
  start_date?: string | null
  end_date?: string | null
  stage_id?: string | null
  stage_name?: string | null
  stage_number?: number | null
  start_city?: string | null
  finish_city?: string | null
  distance_km?: number | string | null
  terrain_type?: string | null
  profile_type?: string | null
  stage_format?: string | null
  elevation_gain_m?: number | string | null
  flat_pct?: number | string | null
  hilly_pct?: number | string | null
  mountain_pct?: number | string | null
  route_label?: string | null
  created_at?: string | null
  updated_at?: string | null
}

function asRows(value: unknown): HiddenRaceRow[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is HiddenRaceRow =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as HiddenRaceRow).race_id === 'string'
  )
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').trim()
}

function titleCase(value: string | null | undefined): string {
  const normalized = normalizeText(value)
  if (!normalized) return '—'

  return normalized
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function numberValue(value: number | string | null | undefined): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDistance(value: number | string | null | undefined): string {
  const parsed = numberValue(value)
  if (parsed === null) return '—'
  return `${parsed.toFixed(parsed % 1 === 0 ? 0 : 1)} km`
}

function formatElevation(value: number | string | null | undefined): string {
  const parsed = numberValue(value)
  if (parsed === null) return '—'
  return `${Math.round(parsed).toLocaleString('en-US')} m`
}

function countryFlagUrl(code: string | null | undefined): string | null {
  const normalized = normalizeText(code).toLowerCase()
  return /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w40/${normalized}.png`
    : null
}

function useLabel(value: string): string {
  switch (value) {
    case 'national_championship':
      return 'National Championship'
    case 'national_association':
      return 'National Association'
    case 'qualification':
      return 'Qualification'
    case 'final':
      return 'Final'
    case 'general_reserve':
      return 'General reserve'
    case 'youth_eligible':
      return 'Youth eligible'
    default:
      return titleCase(value)
  }
}

export default function HiddenRacesPage(): JSX.Element {
  const [rows, setRows] = useState<HiddenRaceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [countryFilter, setCountryFilter] = useState('all')
  const [terrainFilter, setTerrainFilter] = useState('all')

  useEffect(() => {
    let alive = true

    const load = async (): Promise<void> => {
      setLoading(true)
      setErrorMessage(null)

      const { data, error } = await supabase.rpc('get_hidden_reserve_races_v1')

      if (!alive) return

      if (error) {
        setRows([])
        setErrorMessage(error.message)
        setLoading(false)
        return
      }

      setRows(asRows(data))
      setLoading(false)
    }

    void load()

    return () => {
      alive = false
    }
  }, [])

  const countryOptions = useMemo(() => {
    const byCode = new Map<string, string>()

    rows.forEach(row => {
      const code = normalizeText(row.country_code).toUpperCase()
      if (!code) return
      byCode.set(code, normalizeText(row.country_name) || code)
    })

    return [...byCode.entries()].sort((left, right) =>
      left[1].localeCompare(right[1])
    )
  }, [rows])

  const terrainOptions = useMemo(
    () =>
      [...new Set(rows.map(row => normalizeText(row.terrain_type)).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right)),
    [rows]
  )

  const filteredRows = useMemo(() => {
    const search = searchValue.trim().toLowerCase()

    return rows.filter(row => {
      const code = normalizeText(row.country_code).toUpperCase()
      const terrain = normalizeText(row.terrain_type)

      if (countryFilter !== 'all' && code !== countryFilter) return false
      if (terrainFilter !== 'all' && terrain !== terrainFilter) return false

      if (!search) return true

      return [
        row.name,
        row.country_name,
        row.country_code,
        row.host_city,
        row.start_city,
        row.finish_city,
        row.route_label,
        row.terrain_type,
        row.profile_type,
      ]
        .map(value => normalizeText(value).toLowerCase())
        .some(value => value.includes(search))
    })
  }, [countryFilter, rows, searchValue, terrainFilter])

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-950">Hidden Races</h1>
          <span className="rounded-full border border-yellow-300 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-800">
            Test view
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Reserve race templates with no scheduled calendar date. They stay outside the
          normal Race Calendar until a National Championship, National Association or
          another approved competition explicitly uses the route.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-slate-950 p-2 text-yellow-400">
            <Archive size={18} />
          </div>
          <div>
            <div className="font-medium text-slate-950">Reserve pool rules</div>
            <div className="mt-1 text-sm leading-6 text-slate-600">
              These records use the same race, stage and elevation-profile structure as
              regular races. The difference is that the race and stage have no scheduled
              date and the reserve registry explicitly excludes them from the public
              calendar.
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Hidden Race Pool</h2>
              <p className="mt-1 text-sm text-slate-500">
                {loading
                  ? 'Loading reserve routes...'
                  : `${filteredRows.length} of ${rows.length} reserve races shown`}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={searchValue}
                  onChange={event => setSearchValue(event.target.value)}
                  placeholder="Search hidden races..."
                  className="h-10 w-64 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-yellow-400"
                />
              </div>

              <select
                value={countryFilter}
                onChange={event => setCountryFilter(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-yellow-400"
              >
                <option value="all">All countries</option>
                {countryOptions.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={terrainFilter}
                onChange={event => setTerrainFilter(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-yellow-400"
              >
                <option value="all">All profiles</option>
                {terrainOptions.map(terrain => (
                  <option key={terrain} value={terrain}>
                    {titleCase(terrain)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {errorMessage ? (
          <div className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Could not load the hidden race pool: {errorMessage}
          </div>
        ) : null}

        {!loading && !errorMessage && filteredRows.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Archive size={32} className="mx-auto text-slate-300" />
            <div className="mt-3 font-medium text-slate-800">
              No hidden races created yet
            </div>
            <div className="mt-1 text-sm text-slate-500">
              The reserve architecture is ready. New country routes will appear here as
              soon as we start creating them.
            </div>
          </div>
        ) : null}

        <div className="divide-y divide-slate-100">
          {filteredRows.map(row => {
            const flagUrl = countryFlagUrl(row.country_code)
            const uses = Array.isArray(row.intended_uses) ? row.intended_uses : []
            const routeLabel =
              normalizeText(row.route_label) ||
              [normalizeText(row.start_city), normalizeText(row.finish_city)]
                .filter(Boolean)
                .join(' → ')

            return (
              <div
                key={row.pool_id || row.race_id}
                className="grid gap-4 px-5 py-5 lg:grid-cols-[115px_minmax(0,1fr)_auto]"
              >
                <div>
                  <div className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-yellow-300">
                    Reserve
                  </div>
                  <div className="mt-2 text-xs text-slate-500">No date</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {row.active === false ? 'Inactive' : 'Active'}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {flagUrl ? (
                      <img
                        src={flagUrl}
                        alt=""
                        className="h-4 w-6 rounded-sm object-cover ring-1 ring-slate-200"
                      />
                    ) : null}
                    <div className="text-base font-semibold text-slate-950">
                      {row.name}
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {normalizeText(row.country_name) ||
                        normalizeText(row.country_code) ||
                        'Country'}
                    </span>
                  </div>

                  <div className="mt-1 text-sm text-slate-500">
                    {routeLabel || 'Route details will be added with the stage.'}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
                      <Route size={13} />
                      {formatDistance(row.distance_km)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
                      <Mountain size={13} />
                      {formatElevation(row.elevation_gain_m)}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                      {titleCase(row.terrain_type)}
                    </span>
                    {normalizeText(row.profile_type) ? (
                      <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs text-violet-700">
                        {titleCase(row.profile_type)}
                      </span>
                    ) : null}
                    {normalizeText(row.difficulty) ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
                        {titleCase(row.difficulty)}
                      </span>
                    ) : null}
                  </div>

                  {uses.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <ShieldCheck size={14} className="text-slate-400" />
                      {uses.map(use => (
                        <span
                          key={use}
                          className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700"
                        >
                          {useLabel(use)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-end">
                  <Link
                    to={`/dashboard/races/${row.race_id}?source=hidden-races`}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Open race
                    <ChevronRight size={16} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
