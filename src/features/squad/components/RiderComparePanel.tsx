/**
 * src/features/squad/components/RiderComparePanel.tsx
 *
 * Reusable rider comparison panel used by RiderProfilePage and the standalone
 * CompareRiders page. Responsibilities:
 * - Load left rider details by id
 * - Load squad/team riders for selection
 * - Allow comparing across the full club family (First Team + Developing/U23)
 * - Load right rider when selected
 * - Render side-by-side comparison with centered attributes and mirrored diff bars
 *
 * Note: This component only owns the comparison UI and data loading for the
 * two riders. It intentionally does not manage page layout, headers or routing.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { getAgeFromBirthDate } from '../utils/dates'
import { getRiderImageUrl } from '../utils/rider-ui'

interface RiderSummary {
  id: string
  display_name?: string | null
  first_name?: string | null
  last_name?: string | null
  country_code?: string | null
  birth_date?: string | null
  age_years?: number | null
  role?: string | null
  overall?: number | null
  potential?: number | null
  sprint?: number | null
  climbing?: number | null
  time_trial?: number | null
  endurance?: number | null
  flat?: number | null
  recovery?: number | null
  resistance?: number | null
  race_iq?: number | null
  teamwork?: number | null
  image_url?: string | null
  club_id?: string | null
}

interface RosterMembershipRow {
  rider_id: string
  display_name?: string | null
  age_years?: number | null
  overall?: number | null
  country_code?: string | null
  club_id?: string | null
}

interface FamilyClubRow {
  club_id: string
  club_name?: string | null
  team_label?: string | null
}

interface RiderOption {
  id: string
  label: string
}

interface RiderComparePanelProps {
  leftRiderId: string | null
  clubId?: string | null
  initialRightRiderId?: string | null
}

const SKILL_KEYS: Array<{
  key: keyof RiderSummary
  label: string
}> = [
  { key: 'overall', label: 'Overall' },
  { key: 'potential', label: 'Potential' },
  { key: 'sprint', label: 'Sprint' },
  { key: 'climbing', label: 'Climbing' },
  { key: 'time_trial', label: 'Time Trial' },
  { key: 'endurance', label: 'Endurance' },
  { key: 'flat', label: 'Flat' },
  { key: 'recovery', label: 'Recovery' },
  { key: 'resistance', label: 'Resistance' },
  { key: 'race_iq', label: 'Race IQ' },
  { key: 'teamwork', label: 'Teamwork' },
]

function displayNum(v?: number | null): string {
  if (v == null || Number.isNaN(v)) return '—'
  return String(v)
}

function diffClasses(a?: number | null, b?: number | null): {
  leftClass: string
  rightClass: string
} {
  if (a == null && b == null) {
    return { leftClass: 'text-slate-800', rightClass: 'text-slate-800' }
  }
  if (a == null) {
    return { leftClass: 'text-slate-800', rightClass: 'text-emerald-700' }
  }
  if (b == null) {
    return { leftClass: 'text-emerald-700', rightClass: 'text-slate-800' }
  }
  if (a === b) {
    return { leftClass: 'text-slate-800', rightClass: 'text-slate-800' }
  }
  return a > b
    ? { leftClass: 'text-emerald-700', rightClass: 'text-rose-600' }
    : { leftClass: 'text-rose-600', rightClass: 'text-emerald-700' }
}

function getRiderLabel(rider: RiderSummary | null): string {
  if (!rider) return '—'
  const displayName = rider.display_name?.trim() || ''
  const computedName = `${rider.first_name ?? ''} ${rider.last_name ?? ''}`.trim()
  return displayName || computedName || '—'
}

function getResolvedRiderAge(rider: RiderSummary | null): number | null {
  if (!rider) return null
  const derivedAge = getAgeFromBirthDate(rider.birth_date ?? null, null)
  if (derivedAge != null) return derivedAge
  return rider.age_years ?? null
}

function formatSignedDiff(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (value === 0) return '0'
  return `${value > 0 ? '+' : ''}${value}`
}

function getBarWidthPercent(value: number | null, maxAbsDiff: number): number {
  if (value == null || maxAbsDiff <= 0) return 0
  if (value === 0) return 10
  return Math.max(18, Math.round((Math.abs(value) / maxAbsDiff) * 100))
}

function buildOptionLabel(displayName: string | null | undefined, teamLabel?: string | null): string {
  const base = displayName?.trim() || 'Unknown'
  return teamLabel ? `${base} · ${teamLabel}` : base
}

export default function RiderComparePanel({
  leftRiderId,
  clubId,
  initialRightRiderId = null,
}: RiderComparePanelProps): JSX.Element {
  const [leftRider, setLeftRider] = useState<RiderSummary | null>(null)
  const [rightRider, setRightRider] = useState<RiderSummary | null>(null)
  const [options, setOptions] = useState<RiderOption[]>([])
  const [selectedRightId, setSelectedRightId] = useState<string | null>(initialRightRiderId)
  const [loadingLeft, setLoadingLeft] = useState(false)
  const [loadingRight, setLoadingRight] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelectedRightId(initialRightRiderId ?? null)
  }, [initialRightRiderId])

  async function loadRiderById(riderId: string): Promise<RiderSummary | null> {
    const { data: riderData, error: riderError } = await supabase
      .from('riders')
      .select(
        `
        id,
        display_name,
        first_name,
        last_name,
        country_code,
        birth_date,
        role,
        overall,
        potential,
        sprint,
        climbing,
        time_trial,
        endurance,
        flat,
        recovery,
        resistance,
        race_iq,
        teamwork,
        image_url
      `
      )
      .eq('id', riderId)
      .maybeSingle()

    if (riderError) throw riderError

    const { data: rosterData, error: rosterError } = await supabase
      .from('club_roster')
      .select(
        `
        rider_id,
        display_name,
        age_years,
        overall,
        country_code,
        club_id
      `
      )
      .eq('rider_id', riderId)
      .maybeSingle()

    if (rosterError) throw rosterError

    if (!riderData && !rosterData) {
      return null
    }

    const rider = (riderData ?? {}) as Partial<RiderSummary>
    const roster = (rosterData ?? null) as RosterMembershipRow | null

    return {
      id: rider.id ?? roster?.rider_id ?? riderId,
      display_name: rider.display_name ?? roster?.display_name ?? null,
      first_name: rider.first_name ?? null,
      last_name: rider.last_name ?? null,
      country_code: rider.country_code ?? roster?.country_code ?? null,
      birth_date: rider.birth_date ?? null,
      age_years: roster?.age_years ?? null,
      role: rider.role ?? null,
      overall: rider.overall ?? roster?.overall ?? null,
      potential: rider.potential ?? null,
      sprint: rider.sprint ?? null,
      climbing: rider.climbing ?? null,
      time_trial: rider.time_trial ?? null,
      endurance: rider.endurance ?? null,
      flat: rider.flat ?? null,
      recovery: rider.recovery ?? null,
      resistance: rider.resistance ?? null,
      race_iq: rider.race_iq ?? null,
      teamwork: rider.teamwork ?? null,
      image_url: rider.image_url ?? null,
      club_id: roster?.club_id ?? null,
    }
  }

  async function getFamilyClubScope(baseClubId?: string | null): Promise<{
    clubIds: string[]
    teamLabelsByClubId: Map<string, string>
  }> {
    if (!baseClubId) {
      return {
        clubIds: [],
        teamLabelsByClubId: new Map<string, string>(),
      }
    }

    try {
      const { data, error } = await supabase.rpc('get_club_family_ids', {
        p_club_id: baseClubId,
      })

      if (error) throw error

      const rows = (Array.isArray(data) ? data : []) as FamilyClubRow[]
      if (rows.length === 0) {
        return {
          clubIds: [baseClubId],
          teamLabelsByClubId: new Map<string, string>(),
        }
      }

      const uniqueIds = Array.from(
        new Set(rows.map((row) => row.club_id).filter((value): value is string => !!value))
      )

      const teamLabelsByClubId = new Map<string, string>()
      for (const row of rows) {
        if (!row.club_id) continue
        if (row.team_label) {
          teamLabelsByClubId.set(row.club_id, row.team_label)
        } else if (row.club_name) {
          teamLabelsByClubId.set(row.club_id, row.club_name)
        }
      }

      return {
        clubIds: uniqueIds.length > 0 ? uniqueIds : [baseClubId],
        teamLabelsByClubId,
      }
    } catch {
      return {
        clubIds: [baseClubId],
        teamLabelsByClubId: new Map<string, string>(),
      }
    }
  }

  async function loadOptions(forClubId?: string | null, excludeId?: string | null) {
    setLoadingOptions(true)

    try {
      if (!forClubId) {
        setOptions([])
        return
      }

      const familyScope = await getFamilyClubScope(forClubId)
      if (familyScope.clubIds.length === 0) {
        setOptions([])
        return
      }

      const { data, error: rosterError } = await supabase
        .from('club_roster')
        .select('rider_id, display_name, club_id')
        .in('club_id', familyScope.clubIds)
        .order('display_name', { ascending: true })
        .limit(1000)

      if (rosterError) throw rosterError

      const nextOptions =
        (data ?? [])
          .map((row: any) => ({
            id: String(row.rider_id ?? ''),
            label: buildOptionLabel(
              row.display_name ?? 'Unknown',
              familyScope.teamLabelsByClubId.get(String(row.club_id ?? '')) ?? null
            ),
          }))
          .filter((row) => row.id && row.id !== excludeId) ?? []

      setOptions(nextOptions)
    } catch (e: any) {
      setOptions([])
      setError(e?.message ?? 'Could not load roster options.')
    } finally {
      setLoadingOptions(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!leftRiderId) {
        setLeftRider(null)
        setRightRider(null)
        setOptions([])
        setSelectedRightId(initialRightRiderId ?? null)
        setLoadingLeft(false)
        setLoadingOptions(false)
        setError(null)
        return
      }

      setLoadingLeft(true)
      setError(null)
      setLeftRider(null)
      setRightRider(null)

      try {
        const rider = await loadRiderById(leftRiderId)
        if (cancelled) return

        setLeftRider(rider)

        const effectiveClubId = clubId ?? rider?.club_id ?? null
        await loadOptions(effectiveClubId, leftRiderId)

        if (cancelled) return
        setSelectedRightId(initialRightRiderId ?? null)
      } catch (e: any) {
        if (cancelled) return
        setLeftRider(null)
        setOptions([])
        setError(e?.message ?? 'Could not load left rider.')
      } finally {
        if (cancelled) return
        setLoadingLeft(false)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [leftRiderId, clubId, initialRightRiderId])

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!selectedRightId) {
        setRightRider(null)
        setLoadingRight(false)
        return
      }

      setLoadingRight(true)
      setError(null)

      try {
        const rider = await loadRiderById(selectedRightId)
        if (cancelled) return
        setRightRider(rider)
      } catch (e: any) {
        if (cancelled) return
        setRightRider(null)
        setError(e?.message ?? 'Could not load comparison rider.')
      } finally {
        if (cancelled) return
        setLoadingRight(false)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [selectedRightId])

  const emptyState = !leftRiderId ? (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
      No left rider selected.
    </div>
  ) : loadingLeft ? (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
      Loading rider…
    </div>
  ) : !leftRider ? (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
      Left rider not found.
    </div>
  ) : null

  const comparisonRows = useMemo(() => {
    return SKILL_KEYS.map((entry) => {
      const leftVal = leftRider ? (leftRider[entry.key] as number | null | undefined) : null
      const rightVal = rightRider ? (rightRider[entry.key] as number | null | undefined) : null
      const classes = diffClasses(leftVal, rightVal)
      const leftDiff =
        leftVal == null || rightVal == null ? null : Number(leftVal) - Number(rightVal)
      const rightDiff =
        leftVal == null || rightVal == null ? null : Number(rightVal) - Number(leftVal)

      return {
        key: String(entry.key),
        label: entry.label,
        leftVal,
        rightVal,
        leftDiff,
        rightDiff,
        classes,
      }
    })
  }, [leftRider, rightRider])

  const maxAbsDiff = useMemo(() => {
    const values = comparisonRows
      .flatMap((row) => [row.leftDiff, row.rightDiff])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .map((value) => Math.abs(value))

    return values.length > 0 ? Math.max(...values) : 1
  }, [comparisonRows])

  function RiderCard({ rider }: { rider: RiderSummary | null }) {
    const age = getResolvedRiderAge(rider)

    return (
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-slate-100">
          {rider ? (
            <img
              src={getRiderImageUrl(rider.image_url)}
              alt={getRiderLabel(rider)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              —
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">
            {getRiderLabel(rider)}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Age {age ?? '—'} · {rider?.country_code ?? '—'}
          </div>
        </div>
      </div>
    )
  }

  function DiffBar({
    value,
    align,
  }: {
    value: number | null
    align: 'left' | 'right'
  }) {
    if (value == null) {
      return <div className="h-8" />
    }

    const isNeutral = value === 0
    const positive = value > 0
    const widthPercent = getBarWidthPercent(value, maxAbsDiff)

    const barClass = isNeutral
      ? 'bg-slate-300 text-slate-700'
      : positive
        ? 'bg-emerald-500 text-emerald-950'
        : 'bg-rose-500 text-rose-950'

    const wrapperClass =
      align === 'left'
        ? 'flex h-8 items-center justify-end'
        : 'flex h-8 items-center justify-start'

    return (
      <div className={wrapperClass}>
        <div
          className={`inline-flex h-7 items-center rounded-full px-2 text-xs font-bold ${barClass}`}
          style={{ width: `${widthPercent}%` }}
          title={`Difference ${formatSignedDiff(value)}`}
        >
          <span className={align === 'left' ? 'ml-auto' : 'mr-auto'}>
            {formatSignedDiff(value)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      {error ? (
        <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {emptyState}

      {leftRider ? (
        <>
          <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
              <RiderCard rider={leftRider} />
              <div className="text-sm text-slate-500">vs</div>
              <RiderCard rider={rightRider} />
            </div>

            <div className="w-full xl:w-80">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Compare against
              </label>

              <div className="flex gap-2">
                <select
                  value={selectedRightId ?? ''}
                  onChange={(e) => setSelectedRightId(e.target.value || null)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-yellow-400"
                  disabled={loadingOptions}
                >
                  <option value="">-- Select rider --</option>
                  {options.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedRightId(null)
                    setRightRider(null)
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Clear
                </button>
              </div>

              {loadingOptions ? (
                <div className="mt-2 text-xs text-slate-500">
                  Loading First Team and Developing riders…
                </div>
              ) : null}
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[980px] overflow-hidden rounded-lg border border-slate-100">
              <div className="grid grid-cols-[96px_minmax(180px,1fr)_180px_minmax(180px,1fr)_96px] gap-4 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                <div className="text-left">Left</div>
                <div className="text-center">Diff</div>
                <div className="text-center">Attribute</div>
                <div className="text-center">Diff</div>
                <div className="text-right">Right</div>
              </div>

              <div className="divide-y divide-slate-100 bg-white px-4 py-3 text-sm">
                {comparisonRows.map((row) => (
                  <div
                    key={row.key}
                    className="grid grid-cols-[96px_minmax(180px,1fr)_180px_minmax(180px,1fr)_96px] items-center gap-4 py-3"
                  >
                    <div className={`text-left text-base font-semibold ${row.classes.leftClass}`}>
                      {displayNum(row.leftVal)}
                    </div>

                    <DiffBar value={row.leftDiff} align="left" />

                    <div className="text-center font-semibold text-slate-700">
                      {row.label}
                    </div>

                    <DiffBar value={row.rightDiff} align="right" />

                    <div className={`text-right text-base font-semibold ${row.classes.rightClass}`}>
                      {loadingRight ? 'Loading…' : displayNum(row.rightVal)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Values are shown on the outside, attributes are centered, and mirrored bars show the
            difference for each rider. Green means higher, red means lower.
          </div>
        </>
      ) : null}
    </div>
  )
}