import React, { useEffect, useState } from 'react'

import type {
  ChartPoint,
  ClubHealthOverviewRow,
  RiderAvailabilityStatus,
} from '../types'

import {
  formatShortGameDate,
  getContractExpiryUi,
  getDaysRemaining,
} from '../utils/dates'

import {
  formatCaseStageLabel,
  formatHealthCaseCode,
  formatMoney,
  formatSeverityLabel,
  formatWeeklySalary,
  getCountryName,
} from '../utils/formatters'

import {
  getDefaultRiderAvailabilityStatus,
  getFatigueUi,
  getMoraleUi,
  getPotentialUi,
  getRiderStatusUi,
} from '../utils/rider-ui'

import { getFirstSquadMoveState } from '../utils/movement'

export type SquadListView = 'general' | 'financial' | 'skills' | 'form'

export type FirstSquadRiderRow = {
  rowNo: number
  id: string
  name: string
  countryCode?: string | null
  role: string
  age: number | null
  overall: number
  fatigue: number
  status: RiderAvailabilityStatus
  marketValue: number | null
  salary: number | null
  contractExpiresAt: string | null
  contractExpiresSeason: number | null
  sprint: number | null
  climbing: number | null
  timeTrial: number | null
  flat: number | null
  endurance: number | null
  recovery: number | null
  morale: number | null
  potential: number | null
  isTransferListed?: boolean
}

export type HealthOverviewDisplayRow = ClubHealthOverviewRow & {
  full_name: string
}

export type SquadDisplayRaceRow = {
  riderId: string
  riderName: string
  role: string | null
  position: number | null
  resultLabel: string
  points: number
}

export type SquadDisplaySelectionRow = {
  riderId: string
  riderName: string
  role: string | null
  raceName?: string | null
  stageLabel?: string | null
  raceSharpness?: number | null
  raceSharpnessLabel?: string | null
}

export type SquadDisplayRaceTypeRow = {
  label: string
  value: number
}

export type SquadDisplayData = {
  seasonTrend: ChartPoint[]
  podiumChart: ChartPoint[]
  summary: {
    wins: number
    podiums: number
    top10s: number
    bestGC: number
  }
  lastTeamRace?: {
    raceId?: string | null
    raceName: string | null
    raceCategory?: string | null
    raceCountryCode?: string | null
    stageDate?: string | null
    stageLabel: string | null
    routeLabel?: string | null
    stageCount?: number | null
    rows: SquadDisplayRaceRow[]
  }
  nextRaceSelection?: {
    raceId?: string | null
    raceName: string | null
    raceCategory?: string | null
    raceCountryCode?: string | null
    stageDate?: string | null
    stageLabel: string | null
    routeLabel?: string | null
    stageCount?: number | null
    rows: SquadDisplaySelectionRow[]
  }
  raceTypeSnapshot?: SquadDisplayRaceTypeRow[]
}

function formatOrdinal(value?: number | null): string {
  if (value === null || value === undefined || value <= 0) return '—'

  const mod10 = value % 10
  const mod100 = value % 100

  if (mod10 === 1 && mod100 !== 11) return `${value}st`
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`

  return `${value}th`
}

function formatBestGcValue(value: number): string {
  return value > 0 ? formatOrdinal(value) : '—'
}

function parseDateOnlyMs(value?: string | null): number | null {
  if (!value) return null

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  return Date.UTC(year, month - 1, day)
}

function isDateAfter(left?: string | null, right?: string | null): boolean {
  const leftMs = parseDateOnlyMs(left)
  const rightMs = parseDateOnlyMs(right)

  if (leftMs === null || rightMs === null) return false

  return leftMs > rightMs
}

function getStageNumberFromLabel(stageLabel?: string | null): number | null {
  const match = /\bstage\s+(\d+)\b/i.exec(String(stageLabel ?? ''))
  if (!match) return null

  const stageNumber = Number(match[1])
  return Number.isFinite(stageNumber) && stageNumber > 0 ? stageNumber : null
}

function isStageSliceForMultiStageRace(race?: {
  stageLabel?: string | null
  stageCount?: number | null
} | null): boolean {
  const stageNumber = getStageNumberFromLabel(race?.stageLabel)
  const stageCount = Number(race?.stageCount ?? 0)

  return Boolean(stageNumber && stageCount > 1)
}

function isLaterStageInsideAlreadyStartedRace(race?: {
  stageLabel?: string | null
  stageCount?: number | null
} | null): boolean {
  const stageNumber = getStageNumberFromLabel(race?.stageLabel)
  const stageCount = Number(race?.stageCount ?? 0)

  return Boolean(stageNumber && stageNumber > 1 && stageCount > 1)
}

function getVisibleLastTeamRace<T extends {
  raceName?: string | null
  stageLabel?: string | null
  stageCount?: number | null
}>(race?: T | null): T | undefined {
  if (!race?.raceName) return undefined

  /*
   * Last Team Race must be a finished whole race, not the latest completed
   * stage inside an active stage race. If the payload still says "Stage 4"
   * of an 11-stage race, hide it until the backend sends final race-level
   * classification data.
   */
  if (isStageSliceForMultiStageRace(race)) return undefined

  return race
}

function getVisibleNextRaceSelection<T extends {
  raceName?: string | null
  stageDate?: string | null
  stageLabel?: string | null
  stageCount?: number | null
}>(race: T | undefined | null, gameDate: string | null): T | undefined {
  if (!race?.raceName) return undefined

  /*
   * Next Team Race means a submitted race plan for a race that has not
   * started yet. A future stage inside an already-started race, such as
   * Stage 5 tomorrow, is a current race continuation, not the next race.
   */
  if (isLaterStageInsideAlreadyStartedRace(race)) return undefined

  if (gameDate && race.stageDate && !isDateAfter(race.stageDate, gameDate)) {
    return undefined
  }

  return race
}


function getRaceSummarySubtitle(raceName?: string | null, stageLabel?: string | null): string {
  const parts = [raceName, stageLabel].filter((value): value is string => Boolean(value))
  return parts.length > 0 ? parts.join(' · ') : 'No race found yet'
}

function getRaceTypeSnapshotMax(rows: SquadDisplayRaceTypeRow[]): number {
  return Math.max(...rows.map((row) => row.value), 1)
}

function RaceSummaryHeader({
  title,
  raceName,
  stageLabel,
}: {
  title: string
  raceName?: string | null
  stageLabel?: string | null
}) {
  return (
    <div className="mb-4">
      <div className="text-base font-semibold text-gray-800">{title}</div>
      <div className="mt-1 text-sm text-gray-500">
        {getRaceSummarySubtitle(raceName, stageLabel)}
      </div>
    </div>
  )
}

function RacePreviewStrip({
  raceName,
  raceCountryCode,
  raceCategory,
  stageDate,
  stageLabel,
  routeLabel,
  stageCount,
  emptyLabel = 'No race found yet',
}: {
  raceName?: string | null
  raceCountryCode?: string | null
  raceCategory?: string | null
  stageDate?: string | null
  stageLabel?: string | null
  routeLabel?: string | null
  stageCount?: number | null
  emptyLabel?: string
}) {
  if (!raceName) {
    return (
      <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        {emptyLabel}
      </div>
    )
  }

  const details = [
    stageLabel,
    stageCount && stageCount > 1 ? `${stageCount} stages` : null,
    routeLabel,
  ].filter((value): value is string => Boolean(value))

  return (
    <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-sm">
      <div className="w-[68px] shrink-0 whitespace-nowrap text-xs font-semibold text-slate-900">
        {stageDate ? formatShortGameDate(stageDate) : '—'}
      </div>

      <div className="h-7 w-px shrink-0 bg-emerald-400" />

      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <CountryFlag countryCode={raceCountryCode} />

        <div className="min-w-0 flex-1 truncate font-semibold text-slate-900">
          {raceName}
        </div>

        {raceCategory ? (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            {raceCategory}
          </span>
        ) : null}

        {details.length > 0 ? (
          <span className="min-w-0 truncate text-xs text-slate-500">
            · {details.join(' · ')}
          </span>
        ) : null}
      </div>
    </div>
  )
}

const SQUAD_LIST_VIEW_OPTIONS: Array<{ value: SquadListView; label: string }> = [
  { value: 'general', label: 'General View' },
  { value: 'financial', label: 'Financial View' },
  { value: 'skills', label: 'Skills View' },
  { value: 'form', label: 'Form & Development' },
]

function getBestRiderSkillValue(rider: {
  sprint?: number | null
  climbing?: number | null
  timeTrial?: number | null
  flat?: number | null
  endurance?: number | null
  recovery?: number | null
}) {
  const values = [
    rider.sprint,
    rider.climbing,
    rider.timeTrial,
    rider.flat,
    rider.endurance,
    rider.recovery,
  ].filter((value): value is number => typeof value === 'number')

  return values.length > 0 ? Math.max(...values) : null
}

function safeCountryCode(countryCode?: string | null) {
  const code = countryCode?.trim().toLowerCase()

  if (!code || !/^[a-z]{2}$/.test(code)) return null

  return code
}

function getCountryFlagUrl(countryCode: string) {
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
}

function CountryFlag({
  countryCode,
  className = '',
}: {
  countryCode?: string | null
  className?: string
}) {
  const safeCode = safeCountryCode(countryCode)
  const countryName = getCountryName(safeCode?.toUpperCase())
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [safeCode])

  const imageClassName = [
    'h-4 w-6 shrink-0 rounded-sm border border-gray-200 object-cover',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const placeholderClassName = [
    'inline-block h-4 w-6 shrink-0 rounded-sm border border-gray-200 bg-gray-100',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (!safeCode || hasError) {
    return <span className={placeholderClassName} title={countryName} aria-label={countryName} />
  }

  return (
    <img
      src={getCountryFlagUrl(safeCode)}
      alt={countryName}
      title={countryName}
      className={imageClassName}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  )
}

function RiderStatusBadge({
  status,
  className = '',
  compact = false,
}: {
  status?: RiderAvailabilityStatus | null
  className?: string
  compact?: boolean
}) {
  const ui = getRiderStatusUi(status)

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border font-medium ${
        compact ? 'gap-1.5 px-2.5 py-1 text-xs' : 'gap-2 px-3 py-1 text-sm'
      } ${className}`}
      title={`Status: ${ui.label}`}
      style={{
        color: ui.color,
        backgroundColor: ui.bgColor,
        borderColor: ui.borderColor,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: ui.color,
          lineHeight: 1,
          fontSize: compact ? '0.8rem' : '0.9rem',
        }}
      >
        {ui.icon}
      </span>
      <span>{ui.label}</span>
    </span>
  )
}

function InlineStatusText({
  label,
  color,
  className = '',
}: {
  label: string
  color?: string
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center text-sm font-medium ${className}`}
      style={color ? { color } : undefined}
    >
      {label}
    </span>
  )
}

function CompactValueTile({
  label,
  value,
  valueClassName = '',
  subvalue,
  subvalueClassName = '',
  children,
}: {
  label: string
  value: string
  valueClassName?: string
  subvalue?: string
  subvalueClassName?: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/90 p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </div>

      <div
        className={`mt-3 font-semibold tracking-tight text-slate-900 ${
          valueClassName || 'text-2xl leading-tight'
        }`}
      >
        {value}
      </div>

      {subvalue ? (
        <div
          className={`mt-2 text-xs leading-relaxed ${
            subvalueClassName || 'text-slate-500'
          }`}
        >
          {subvalue}
        </div>
      ) : null}

      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  )
}

function LineChart({ data }: { data: ChartPoint[] }) {
  const width = 760
  const height = 240
  const padLeft = 34
  const padRight = 20
  const padTop = 18
  const padBottom = 34

  const maxValue = Math.max(...data.map((d) => d.value), 10)
  const usableWidth = width - padLeft - padRight
  const usableHeight = height - padTop - padBottom

  const points = data.map((point, index) => {
    const x = padLeft + (index * usableWidth) / Math.max(1, data.length - 1)
    const y = padTop + usableHeight - (point.value / maxValue) * usableHeight
    return { ...point, x, y }
  })

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ')
  const areaPoints = `${padLeft},${padTop + usableHeight} ${polylinePoints} ${
    padLeft + usableWidth
  },${padTop + usableHeight}`

  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-50/70 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
        {[0.25, 0.5, 0.75, 1].map((line) => {
          const y = padTop + usableHeight - usableHeight * line
          return (
            <g key={line}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              <text x={6} y={y + 4} fontSize="10" fill="#6b7280">
                {Math.round(maxValue * line)}
              </text>
            </g>
          )
        })}

        <polygon points={areaPoints} fill="#fde68a" opacity="0.45" />
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#eab308"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="4" fill="#ca8a04" />
            <text
              x={point.x}
              y={height - 12}
              textAnchor="middle"
              fontSize="10"
              fill="#6b7280"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function VerticalBarChart({ data }: { data: ChartPoint[] }) {
  const width = 420
  const height = 240
  const padTop = 18
  const padBottom = 40
  const padLeft = 18
  const padRight = 18

  const maxValue = Math.max(...data.map((d) => d.value), 1)
  const chartWidth = width - padLeft - padRight
  const chartHeight = height - padTop - padBottom
  const barWidth = chartWidth / Math.max(data.length, 1) - 18

  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-50/70 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
        <line
          x1={padLeft}
          y1={padTop + chartHeight}
          x2={width - padRight}
          y2={padTop + chartHeight}
          stroke="#d1d5db"
          strokeWidth="1"
        />

        {data.map((item, index) => {
          const x = padLeft + index * (barWidth + 18) + 10
          const barHeight = (item.value / maxValue) * chartHeight
          const y = padTop + chartHeight - barHeight

          return (
            <g key={item.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx="8"
                fill={index < 3 ? '#facc15' : '#9ca3af'}
              />
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize="11"
                fill="#374151"
              >
                {item.value}
              </text>
              <text
                x={x + barWidth / 2}
                y={height - 14}
                textAnchor="middle"
                fontSize="10"
                fill="#6b7280"
              >
                {item.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function HorizontalMetricBar({
  label,
  value,
  max,
}: {
  label: string
  value: number
  max: number
}) {
  const width = max > 0 ? (value / max) * 100 : 0

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-800">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-yellow-400" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

type FirstSquadTabProps = {
  loading: boolean
  error: string | null
  riders: FirstSquadRiderRow[]
  gameDate: string | null
  listView: SquadListView
  onListViewChange: (value: SquadListView) => void
  squadMax: number
  hasDevelopingTeam: boolean
  movementWindowOpen: boolean
  movementWindowSummary: string
  developingTeamStatusError: string | null
  moveActionMessage: string | null
  movingRiderId: string | null
  onMoveToDevelopingTeam: (riderId: string) => void | Promise<void>
  onOpenRiderProfile: (riderId: string) => void | Promise<void>
  healthOverviewDisplayRows: HealthOverviewDisplayRow[]
  squadDisplayData: SquadDisplayData
}

export default function FirstSquadTab({
  loading,
  error,
  riders,
  gameDate,
  listView,
  onListViewChange,
  squadMax,
  hasDevelopingTeam,
  movementWindowOpen,
  movementWindowSummary,
  developingTeamStatusError,
  moveActionMessage,
  movingRiderId,
  onMoveToDevelopingTeam,
  onOpenRiderProfile,
  healthOverviewDisplayRows,
  squadDisplayData,
}: FirstSquadTabProps) {
  const squadTableClassName = [
    'w-full text-sm',
    listView === 'skills' ? 'table-fixed' : '',
    listView === 'financial'
      ? 'min-w-[980px]'
      : listView === 'form'
        ? 'min-w-[1020px]'
        : listView === 'general'
          ? 'min-w-[900px]'
          : '',
  ]
    .filter(Boolean)
    .join(' ')

  const squadTableColSpan =
    listView === 'skills'
      ? 11
      : listView === 'financial'
        ? 8
        : listView === 'form'
          ? 9
          : 9

  const currentViewLabel =
    SQUAD_LIST_VIEW_OPTIONS.find((option) => option.value === listView)?.label ?? 'General View'

  const visibleLastTeamRace = getVisibleLastTeamRace(squadDisplayData.lastTeamRace)
  const visibleNextRaceSelection = getVisibleNextRaceSelection(
    squadDisplayData.nextRaceSelection,
    gameDate
  )

  return (
    <>
      <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="text-base font-semibold text-gray-800">First Squad</div>
        <div className="text-sm text-gray-500">
          Riders: <span className="font-medium text-gray-700">{riders.length}/{squadMax}</span>
        </div>
      </div>

      {riders.length >= squadMax && (
        <div className="mb-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
          Squad is full ({squadMax} riders). Transfers, signings and promotions must respect the
          squad cap.
        </div>
      )}

      {loading && (
        <div className="w-full rounded-lg bg-white p-4 text-sm text-gray-600 shadow">
          Loading squad…
        </div>
      )}

      {!loading && error && (
        <div className="w-full rounded-lg bg-white p-4 shadow">
          <div className="text-sm font-medium text-red-600">Could not load squad</div>
          <div className="mt-1 text-sm text-gray-600">{error}</div>
        </div>
      )}

      {!loading && !error && (
        <>
          {hasDevelopingTeam && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              {movementWindowSummary}
            </div>
          )}

          {developingTeamStatusError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {developingTeamStatusError}
            </div>
          )}

          {moveActionMessage && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {moveActionMessage}
            </div>
          )}

          <div className="w-full rounded-lg bg-white p-4 shadow">
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-base font-semibold text-gray-800">First Squad</div>
                <div className="mt-1 text-sm text-gray-500">
                  {currentViewLabel} · Riders{' '}
                  <span className="font-medium text-gray-700">
                    {riders.length}/{squadMax}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="squad-list-view" className="text-sm font-medium text-gray-600">
                  View
                </label>
                <select
                  id="squad-list-view"
                  value={listView}
                  onChange={(e) => onListViewChange(e.target.value as SquadListView)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-yellow-400"
                >
                  {SQUAD_LIST_VIEW_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className={squadTableClassName}>
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className={`p-2 ${listView === 'skills' ? 'w-[42px]' : ''}`}>#</th>
                    <th className={`p-2 ${listView === 'skills' ? 'w-[190px]' : ''}`}>Name</th>
                    <th className={`p-2 ${listView === 'skills' ? 'w-[110px]' : ''}`}>Country</th>
                    <th className={`p-2 ${listView === 'skills' ? 'w-[130px]' : ''}`}>Role</th>

                    {listView === 'general' && (
                      <>
                        <th className="p-2">Age</th>
                        <th className="p-2">Overall</th>
                        <th className="p-2 w-[160px]">Status</th>
                        <th className="p-2 w-[90px] text-center">Move</th>
                      </>
                    )}

                    {listView === 'financial' && (
                      <>
                        <th className="p-2">Value</th>
                        <th className="p-2">Wage</th>
                        <th className="p-2">Contract Expires</th>
                      </>
                    )}

                    {listView === 'skills' && (
                      <>
                        <th className="p-2 w-[64px] text-center">SP</th>
                        <th className="p-2 w-[64px] text-center">CL</th>
                        <th className="p-2 w-[64px] text-center">TT</th>
                        <th className="p-2 w-[64px] text-center">FL</th>
                        <th className="p-2 w-[64px] text-center">EN</th>
                        <th className="p-2 w-[64px] text-center">RC</th>
                      </>
                    )}

                    {listView === 'form' && (
                      <>
                        <th className="p-2">Potential</th>
                        <th className="p-2">Morale</th>
                        <th className="p-2">Fatigue</th>
                        <th className="p-2">Health</th>
                      </>
                    )}

                    <th
                      className={`p-2 text-right ${listView === 'skills' ? 'w-[72px]' : 'w-[90px]'}`}
                    >
                      View
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {riders.map((r, index) => {
                    const contractExpiryUi = getContractExpiryUi(
                      r.contractExpiresAt,
                      gameDate ?? null,
                      r.contractExpiresSeason
                    )

                    const bestSkillValue = getBestRiderSkillValue(r)

                    const financialContractDisplay =
                      contractExpiryUi.sublabel || contractExpiryUi.label || '—'

                    const potentialUi = getPotentialUi(r.potential)
                    const moraleUi = getMoraleUi(r.morale)
                    const fatigueUi = getFatigueUi(r.fatigue)
                    const healthUi = getRiderStatusUi(r.status)
                    const displayedCountryCode = safeCountryCode(r.countryCode)?.toUpperCase() ?? '—'

                    const renderSkillCell = (value?: number | null) => {
                      const isBest =
                        value != null && bestSkillValue != null && value === bestSkillValue

                      return (
                        <td
                          className={`p-2 text-center ${
                            isBest ? 'font-bold text-gray-900' : 'font-medium text-gray-700'
                          }`}
                        >
                          {value ?? '—'}
                        </td>
                      )
                    }

                    return (
                      <tr key={r.id} className="border-t align-top">
                        <td className="p-2">{r.rowNo}</td>

                        <td
                          className={`p-2 font-medium text-gray-800 ${
                            listView === 'skills'
                              ? 'truncate whitespace-nowrap'
                              : 'whitespace-nowrap'
                          }`}
                          title={r.name}
                        >
                          <div className="inline-flex items-center gap-2">
                            <span>{r.name}</span>
                            {r.isTransferListed ? (
                              <span
                                title="Rider is on the transfer list"
                                className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 text-xs font-bold text-emerald-700"
                              >
                                $
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="p-2">
                          <div
                            className={`flex items-center gap-2 ${listView === 'skills' ? 'whitespace-nowrap' : ''}`}
                            title={getCountryName(
                              displayedCountryCode === '—' ? undefined : displayedCountryCode
                            )}
                          >
                            <CountryFlag countryCode={r.countryCode} />
                            <span className="text-gray-700">{displayedCountryCode}</span>
                          </div>
                        </td>

                        <td
                          className={`p-2 ${listView === 'skills' ? 'truncate' : ''}`}
                          title={r.role}
                        >
                          {r.role}
                        </td>

                        {listView === 'general' && (
                          <>
                            <td className="p-2">{r.age ?? '—'}</td>
                            <td className="p-2">{r.overall}%</td>
                            <td className="p-2">
                              <RiderStatusBadge status={r.status} compact />
                            </td>

                            <td className="p-2 text-center">
                              {(() => {
                                const moveState = getFirstSquadMoveState({
                                  hasDevelopingTeam,
                                  movementWindowOpen,
                                  riderAge: r.age ?? null,
                                })

                                const isBusy = movingRiderId === r.id

                                return (
                                  <button
                                    type="button"
                                    disabled={!moveState.enabled || isBusy}
                                    title={moveState.reason}
                                    onClick={() => {
                                      if (!moveState.enabled || isBusy) return
                                      void onMoveToDevelopingTeam(r.id)
                                    }}
                                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm transition ${
                                      moveState.enabled && !isBusy
                                        ? 'border-yellow-400 bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                                        : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                                    }`}
                                  >
                                    {isBusy ? '…' : '⇄'}
                                  </button>
                                )
                              })()}
                            </td>
                          </>
                        )}

                        {listView === 'financial' && (
                          <>
                            <td className="p-2">
                              <div className="text-gray-800">
                                {r.marketValue == null ? '—' : formatMoney(r.marketValue)}
                              </div>
                            </td>

                            <td className="p-2">
                              <div className="text-gray-800">
                                {r.salary == null ? '—' : formatWeeklySalary(r.salary)}
                              </div>
                            </td>

                            <td className="p-2">
                              <div className="whitespace-nowrap text-gray-800">
                                {financialContractDisplay}
                              </div>
                            </td>
                          </>
                        )}

                        {listView === 'skills' && (
                          <>
                            {renderSkillCell(r.sprint)}
                            {renderSkillCell(r.climbing)}
                            {renderSkillCell(r.timeTrial)}
                            {renderSkillCell(r.flat)}
                            {renderSkillCell(r.endurance)}
                            {renderSkillCell(r.recovery)}
                          </>
                        )}

                        {listView === 'form' && (
                          <>
                            <td className="p-2">
                              {r.potential == null ? (
                                <span className="text-gray-400">—</span>
                              ) : (
                                <InlineStatusText label={potentialUi.label} color={potentialUi.color} />
                              )}
                            </td>

                            <td className="p-2">
                              {r.morale == null ? (
                                <span className="text-gray-400">—</span>
                              ) : (
                                <InlineStatusText label={moraleUi.label} color={moraleUi.color} />
                              )}
                            </td>

                            <td className="p-2">
                              <InlineStatusText label={fatigueUi.label} color={fatigueUi.color} />
                            </td>

                            <td className="p-2">
                              <InlineStatusText label={healthUi.label} color={healthUi.color} />
                            </td>
                          </>
                        )}

                        <td className="p-2 text-right">
                          <button
                            type="button"
                            data-tutorial-target={
                              index === 0 ? 'squad-rider-view-button' : undefined
                            }
                            onClick={() => onOpenRiderProfile(r.id)}
                            className="text-sm font-medium text-yellow-600 hover:text-yellow-700"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    )
                  })}

                  {riders.length === 0 && (
                    <tr className="border-t">
                      <td className="p-2 text-gray-500" colSpan={squadTableColSpan}>
                        No riders found for this club yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 rounded-lg bg-white p-4 shadow">
            <div className="mb-4">
              <div className="text-base font-semibold text-gray-800">Health Report</div>
              <div className="mt-1 text-sm text-gray-500">
                Current injured, sick, and recovering first squad riders
              </div>
            </div>

            {healthOverviewDisplayRows.length === 0 ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                No active health concerns in the squad right now.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="py-2 pr-4">Rider</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Case</th>
                      <th className="py-2 pr-4">Stage</th>
                      <th className="py-2 pr-4">Severity</th>
                      <th className="py-2 pr-4">Fatigue</th>
                      <th className="py-2">Expected Recovery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {healthOverviewDisplayRows.map((row) => (
                      <tr key={row.rider_id} className="border-b border-gray-100 last:border-0">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <CountryFlag countryCode={row.country_code} />
                            <span className="font-medium text-gray-800">{row.full_name}</span>
                          </div>
                        </td>

                        <td className="py-3 pr-4">
                          <RiderStatusBadge
                            status={row.availability_status ?? getDefaultRiderAvailabilityStatus()}
                            compact
                          />
                        </td>

                        <td className="py-3 pr-4 text-gray-700">
                          {formatHealthCaseCode(row.case_code) ?? 'Fatigue'}
                        </td>

                        <td className="py-3 pr-4 text-gray-700">
                          {formatCaseStageLabel(row.case_status) ?? '—'}
                        </td>

                        <td className="py-3 pr-4 text-gray-700">
                          {formatSeverityLabel(row.severity) ?? '—'}
                        </td>

                        <td className="py-3 pr-4 text-gray-700">{row.fatigue}/100</td>

                        <td className="py-3 text-gray-700">
                          {row.expected_full_recovery_on
                            ? `${formatShortGameDate(row.expected_full_recovery_on)}${
                                getDaysRemaining(row.expected_full_recovery_on, gameDate ?? null) !==
                                null
                                  ? ` (${getDaysRemaining(row.expected_full_recovery_on, gameDate ?? null)}d)`
                                  : ''
                              }`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <CompactValueTile label="Season Wins" value={`${squadDisplayData.summary.wins}`} />
            <CompactValueTile label="Season Podiums" value={`${squadDisplayData.summary.podiums}`} />
            <CompactValueTile label="Top 10 Results" value={`${squadDisplayData.summary.top10s}`} />
            <CompactValueTile label="Best GC" value={formatBestGcValue(squadDisplayData.summary.bestGC)} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="mb-4">
                <div className="text-base font-semibold text-gray-800">Last Team Race</div>
                <RacePreviewStrip
                  raceName={visibleLastTeamRace?.raceName}
                  raceCountryCode={visibleLastTeamRace?.raceCountryCode}
                  raceCategory={visibleLastTeamRace?.raceCategory}
                  stageDate={visibleLastTeamRace?.stageDate}
                  stageLabel={visibleLastTeamRace?.stageLabel}
                  routeLabel={visibleLastTeamRace?.routeLabel}
                  stageCount={visibleLastTeamRace?.stageCount}
                  emptyLabel="No finished full-race classification found for this squad yet."
                />
              </div>

              {visibleLastTeamRace?.rows?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="py-2 pr-4">Rider</th>
                        <th className="py-2 pr-4">Role</th>
                        <th className="py-2 pr-4">Result</th>
                        <th className="py-2 text-right">Int. pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLastTeamRace.rows.map((row) => (
                        <tr key={row.riderId} className="border-b border-gray-100 last:border-0">
                          <td className="py-3 pr-4 font-medium text-gray-800">{row.riderName}</td>
                          <td className="py-3 pr-4 text-gray-600">{row.role ?? '—'}</td>
                          <td className="py-3 pr-4 text-gray-700">
                            {row.resultLabel || formatOrdinal(row.position)}
                          </td>
                          <td className="py-3 text-right font-semibold text-slate-900">
                            {row.points.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-sm text-gray-600">
                  No finished full-race classification found for this squad yet.
                </div>
              )}
            </div>

            <div className="rounded-lg bg-white p-4 shadow">
              <div className="mb-4">
                <div className="text-base font-semibold text-gray-800">Next Team Race</div>
                <RacePreviewStrip
                  raceName={visibleNextRaceSelection?.raceName}
                  raceCountryCode={visibleNextRaceSelection?.raceCountryCode}
                  raceCategory={visibleNextRaceSelection?.raceCategory}
                  stageDate={visibleNextRaceSelection?.stageDate}
                  stageLabel={visibleNextRaceSelection?.stageLabel}
                  routeLabel={visibleNextRaceSelection?.routeLabel}
                  stageCount={visibleNextRaceSelection?.stageCount}
                  emptyLabel="No next not-started submitted race plan found for this squad yet."
                />
              </div>

              {visibleNextRaceSelection?.rows?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="py-2 pr-4">Rider</th>
                        <th className="py-2 pr-4">Role</th>
                        <th className="py-2 text-right">Sharpness</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleNextRaceSelection.rows.map((row) => (
                        <tr key={row.riderId} className="border-b border-gray-100 last:border-0">
                          <td className="py-3 pr-4 font-medium text-gray-800">{row.riderName}</td>
                          <td className="py-3 pr-4 text-gray-600">{row.role ?? '—'}</td>
                          <td className="py-3 text-right font-semibold text-emerald-700">
                            {row.raceSharpness !== null && row.raceSharpness !== undefined
                              ? `${Math.round(row.raceSharpness)}/100`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-sm text-gray-600">
                  No next not-started submitted race plan found for this squad yet.
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-lg bg-white p-4 shadow xl:col-span-2">
              <div className="text-base font-semibold text-gray-800">Team Results This Season</div>
              <div className="mt-4">
                <LineChart data={squadDisplayData.seasonTrend} />
              </div>
            </div>

            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-base font-semibold text-gray-800">Podiums & Placings</div>
              <div className="mt-4">
                <VerticalBarChart data={squadDisplayData.podiumChart} />
              </div>
            </div>

            <div className="rounded-lg bg-white p-4 shadow xl:col-span-3">
              <div className="text-base font-semibold text-gray-800">Race Type Snapshot</div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {(squadDisplayData.raceTypeSnapshot ?? []).map((item) => (
                  <HorizontalMetricBar
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    max={getRaceTypeSnapshotMax(squadDisplayData.raceTypeSnapshot ?? [])}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}