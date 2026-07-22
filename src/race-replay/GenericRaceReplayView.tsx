/**
 * GenericRaceReplayView.tsx
 *
 * Presentation layer for an already-created ReplayStageModel.
 *
 * This component intentionally:
 * - uses the generic replay controller
 * - does not run the race engine
 * - does not access Supabase or the database
 * - does not estimate missing stamina, fatigue, gaps, ranking, or results
 * - reveals final classification only after playback reaches the finish
 */

import {
  useMemo,
  useState,
} from 'react'

import type {
  ReplayEvent,
  ReplayGroupType,
  ReplayPlaybackSpeed,
  ReplayStageModel,
} from './replayTypes'
import {
  useRaceReplayController,
} from './useRaceReplayController'

export interface GenericReplayStageMarker {
  readonly id: string
  readonly kilometre: number
  readonly label: string
  readonly kind:
    | 'start'
    | 'sprint'
    | 'kom'
    | 'finish'
    | 'other'
}

export interface GenericRaceReplayViewProps {
  readonly model: ReplayStageModel
  readonly displayMode?: 'modal' | 'page'
  readonly onClose?: () => void
  readonly raceName?: string
  readonly stageLabel?: string
  readonly stageMarkers?: readonly GenericReplayStageMarker[]
  readonly highlightedTeamIds?: readonly string[]
}

const SPEEDS: readonly ReplayPlaybackSpeed[] = [
  1,
  2,
  4,
  8,
]

const GROUP_BADGE_CLASSES:
  Readonly<Record<ReplayGroupType, string>> = {
    peloton:
      'border-sky-200 bg-sky-100 text-sky-800',
    breakaway:
      'border-amber-200 bg-amber-100 text-amber-800',
    chase:
      'border-violet-200 bg-violet-100 text-violet-800',
    dropped:
      'border-rose-200 bg-rose-100 text-rose-800',
    finished:
      'border-emerald-200 bg-emerald-100 text-emerald-800',
    time_trial:
      'border-indigo-200 bg-indigo-100 text-indigo-800',
  }

const GROUP_MARKER_FILL:
  Readonly<Record<ReplayGroupType, string>> = {
    peloton: '#0284c7',
    breakaway: '#d97706',
    chase: '#7c3aed',
    dropped: '#e11d48',
    finished: '#059669',
    time_trial: '#4f46e5',
  }

const EVENT_TITLE_BY_TYPE:
  Readonly<Record<string, string>> = {
    RACE_STARTED: 'Race started',
    ORDER_LOADED: 'Team order loaded',
    ORDER_ACCEPTED: 'Team order accepted',
    ORDER_REJECTED: 'Team order rejected',
    ORDER_SCHEDULED: 'Team order scheduled',
    ORDER_EXECUTED: 'Team order executed',
    ORDER_EXPIRED: 'Team order expired',
    ATTACK_STARTED: 'Attack started',
    RIDER_JOINED_GROUP: 'Rider joined group',
    GROUP_CREATED: 'New group formed',
    GROUP_CAUGHT: 'Group caught',
    SPRINT_STARTED: 'Sprint started',
    RIDER_FINISHED: 'Rider finished',
    RACE_COMPLETED: 'Race completed',
    SIMULATION_COMPLETED: 'Race completed',
  }

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(
    maximum,
    Math.max(minimum, value),
  )
}

function formatRaceClock(
  seconds: number,
): string {
  const total = Math.max(
    0,
    Math.round(seconds),
  )

  const hours = Math.floor(
    total / 3600,
  )

  const minutes = Math.floor(
    (total % 3600) / 60,
  )

  const remainingSeconds =
    total % 60

  return [
    hours,
    String(minutes).padStart(2, '0'),
    String(remainingSeconds).padStart(2, '0'),
  ].join(':')
}

function formatGap(
  seconds: number | null,
): string {
  if (seconds === null) {
    return '—'
  }

  const rounded = Math.max(
    0,
    Math.round(seconds),
  )

  if (rounded === 0) {
    return 'Leader'
  }

  if (rounded < 60) {
    return `+${rounded}s`
  }

  const minutes = Math.floor(
    rounded / 60,
  )

  const remainingSeconds =
    rounded % 60

  return `+${minutes}:${String(
    remainingSeconds,
  ).padStart(2, '0')}`
}

function formatSpeed(
  speedKmh: number | null,
): string {
  if (speedKmh === null) {
    return '—'
  }

  return `${speedKmh.toFixed(1)} km/h`
}

function formatKilometre(
  kilometre: number,
): string {
  return `${kilometre.toFixed(1)} km`
}

function humanizeCode(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    )
}

function getEventTitle(
  event: ReplayEvent,
): string {
  return (
    event.title?.trim() ||
    EVENT_TITLE_BY_TYPE[event.type] ||
    humanizeCode(event.type)
  )
}

function getEventDescription(
  event: ReplayEvent,
  riderNameById: ReadonlyMap<string, string>,
): string {
  if (event.description?.trim()) {
    return event.description.trim()
  }

  const riderName =
    event.actorRiderId
      ? riderNameById.get(
          event.actorRiderId,
        ) ?? null
      : null

  switch (event.type) {
    case 'ATTACK_STARTED':
      return riderName
        ? `${riderName} launched an attack.`
        : 'An authoritative attack event was recorded.'

    case 'RIDER_JOINED_GROUP':
      return riderName
        ? `${riderName} joined another race group.`
        : 'A rider changed race group.'

    case 'GROUP_CREATED':
      return 'The deterministic replay created a new race group.'

    case 'GROUP_CAUGHT':
      return 'One race group was caught by another.'

    case 'SPRINT_STARTED':
      return 'The deterministic replay entered a sprint phase.'

    case 'RIDER_FINISHED':
      return riderName
        ? `${riderName} crossed the finish.`
        : 'A rider crossed the finish.'

    case 'RACE_STARTED':
      return 'The stage is underway.'

    case 'RACE_COMPLETED':
    case 'SIMULATION_COMPLETED':
      return 'All authoritative finish processing is complete.'

    default:
      return 'Authoritative deterministic replay event.'
  }
}

function getProfileElevationAtKilometre(
  model: ReplayStageModel,
  kilometre: number,
): number {
  const points = model.profilePoints

  if (points.length === 0) {
    return 0
  }

  if (
    kilometre <=
    points[0]!.kilometre
  ) {
    return points[0]!.elevationMetres
  }

  for (
    let index = 1;
    index < points.length;
    index += 1
  ) {
    const previous = points[index - 1]
    const next = points[index]

    if (!previous || !next) {
      continue
    }

    if (kilometre <= next.kilometre) {
      const distance =
        next.kilometre -
        previous.kilometre

      const fraction =
        distance > 0
          ? clamp(
              (
                kilometre -
                previous.kilometre
              ) / distance,
              0,
              1,
            )
          : 0

      return (
        previous.elevationMetres +
        (
          next.elevationMetres -
          previous.elevationMetres
        ) * fraction
      )
    }
  }

  return points[
    points.length - 1
  ]!.elevationMetres
}

function getMarkerFill(
  kind: GenericReplayStageMarker['kind'],
): string {
  switch (kind) {
    case 'start':
      return '#0284c7'
    case 'sprint':
      return '#16a34a'
    case 'kom':
      return '#dc2626'
    case 'finish':
      return '#1d4ed8'
    default:
      return '#475569'
  }
}

function PercentageMetric({
  label,
  value,
}: {
  readonly label: string
  readonly value: number | null
}): JSX.Element {
  const available =
    value !== null &&
    Number.isFinite(value)

  const clamped = available
    ? clamp(value, 0, 100)
    : 0

  return (
    <div
      title={
        available
          ? `${label}: ${Math.round(clamped)}%`
          : `${label}: unavailable from authoritative replay output`
      }
    >
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <span>{label}</span>
        <span>
          {available
            ? `${Math.round(clamped)}%`
            : 'N/A'}
        </span>
      </div>

      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className={
            available
              ? 'h-full rounded-full bg-emerald-500'
              : 'h-full rounded-full bg-slate-300'
          }
          style={{
            width: available
              ? `${clamped}%`
              : '100%',
          }}
        />
      </div>
    </div>
  )
}

function ReplayProfile({
  model,
  groups,
  markers,
  selectedGroupId,
  onSelectGroup,
}: {
  readonly model: ReplayStageModel
  readonly groups: ReturnType<
    typeof useRaceReplayController
  >['groups']
  readonly markers:
    readonly GenericReplayStageMarker[]
  readonly selectedGroupId: string | null
  readonly onSelectGroup: (
    groupId: string,
  ) => void
}): JSX.Element {
  const width = 1000
  const height = 260
  const paddingX = 42
  const paddingTop = 28
  const paddingBottom = 38
  const plotWidth =
    width - paddingX * 2
  const plotHeight =
    height - paddingTop - paddingBottom

  const elevations =
    model.profilePoints.map(
      (point) =>
        point.elevationMetres,
    )

  const minimumElevation =
    elevations.length > 0
      ? Math.min(...elevations)
      : 0

  const maximumElevation =
    elevations.length > 0
      ? Math.max(...elevations)
      : 1

  const elevationRange = Math.max(
    1,
    maximumElevation -
      minimumElevation,
  )

  const getX = (
    kilometre: number,
  ): number =>
    paddingX +
    clamp(
      kilometre /
        model.distanceKm,
      0,
      1,
    ) * plotWidth

  const getY = (
    elevation: number,
  ): number =>
    paddingTop +
    (
      1 -
      clamp(
        (
          elevation -
          minimumElevation
        ) / elevationRange,
        0,
        1,
      )
    ) * plotHeight

  const profileCoordinates =
    model.profilePoints.map(
      (point) => [
        getX(point.kilometre),
        getY(point.elevationMetres),
      ] as const,
    )

  const profileLine =
    profileCoordinates
      .map(
        ([x, y]) =>
          `${x},${y}`,
      )
      .join(' ')

  const areaPath =
    profileCoordinates.length > 0
      ? [
          `M ${profileCoordinates[0]![0]} ${height - paddingBottom}`,
          ...profileCoordinates.map(
            ([x, y]) =>
              `L ${x} ${y}`,
          ),
          `L ${profileCoordinates[
            profileCoordinates.length - 1
          ]![0]} ${height - paddingBottom}`,
          'Z',
        ].join(' ')
      : ''

  const visibleGroups = groups
    .filter(
      (group) =>
        group.active ||
        group.type === 'finished',
    )
    .slice(0, 16)

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Stage profile with deterministic replay group markers"
      >
        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill="#f8fafc"
        />

        {[0, 0.25, 0.5, 0.75, 1].map(
          (fraction) => {
            const x =
              paddingX +
              plotWidth * fraction

            return (
              <g key={fraction}>
                <line
                  x1={x}
                  y1={paddingTop}
                  x2={x}
                  y2={height - paddingBottom}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />

                <text
                  x={x}
                  y={height - 14}
                  textAnchor="middle"
                  fontSize="13"
                  fill="#64748b"
                >
                  {Math.round(
                    model.distanceKm *
                      fraction,
                  )}
                  {' km'}
                </text>
              </g>
            )
          },
        )}

        {areaPath ? (
          <path
            d={areaPath}
            fill="#dbeafe"
            opacity="0.75"
          />
        ) : null}

        {profileLine ? (
          <polyline
            points={profileLine}
            fill="none"
            stroke="#334155"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}

        {markers.map((marker) => {
          const x = getX(
            marker.kilometre,
          )

          const y = getY(
            getProfileElevationAtKilometre(
              model,
              marker.kilometre,
            ),
          )

          return (
            <g key={marker.id}>
              <line
                x1={x}
                y1={y - 34}
                x2={x}
                y2={y - 8}
                stroke={getMarkerFill(
                  marker.kind,
                )}
                strokeWidth="2"
              />

              <circle
                cx={x}
                cy={y - 39}
                r="7"
                fill={getMarkerFill(
                  marker.kind,
                )}
              />

              <text
                x={x}
                y={y - 51}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="#334155"
              >
                {marker.label}
              </text>
            </g>
          )
        })}

        {visibleGroups.map(
          (group, index) => {
            const x = getX(
              group.distanceKm,
            )

            const profileY = getY(
              getProfileElevationAtKilometre(
                model,
                group.distanceKm,
              ),
            )

            const markerY =
              profileY -
              12 -
              (index % 3) * 17

            const selected =
              selectedGroupId ===
              group.groupId

            return (
              <g
                key={group.groupId}
                role="button"
                tabIndex={0}
                onClick={() =>
                  onSelectGroup(
                    group.groupId,
                  )
                }
                onKeyDown={(event: { key: string }) => {
                  if (
                    event.key === 'Enter' ||
                    event.key === ' '
                  ) {
                    onSelectGroup(
                      group.groupId,
                    )
                  }
                }}
                style={{
                  cursor: 'pointer',
                }}
              >
                <line
                  x1={x}
                  y1={profileY}
                  x2={x}
                  y2={markerY}
                  stroke={
                    GROUP_MARKER_FILL[
                      group.type
                    ]
                  }
                  strokeWidth="2"
                  opacity="0.75"
                />

                <circle
                  cx={x}
                  cy={markerY}
                  r={selected ? 10 : 8}
                  fill={
                    GROUP_MARKER_FILL[
                      group.type
                    ]
                  }
                  stroke="#ffffff"
                  strokeWidth={selected ? 4 : 3}
                />

                <text
                  x={x}
                  y={markerY - 14}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill="#0f172a"
                >
                  {group.label}
                  {' · '}
                  {group.riderIds.length}
                </text>
              </g>
            )
          },
        )}
      </svg>
    </div>
  )
}

/** Existing-design replay surface backed only by ReplayStageModel. */
export function GenericRaceReplayView({
  model,
  displayMode = 'page',
  onClose,
  raceName,
  stageLabel,
  stageMarkers = [],
  highlightedTeamIds = [],
}: GenericRaceReplayViewProps): JSX.Element {
  const controller =
    useRaceReplayController(
      model,
      {
        pauseWhenDocumentHidden: true,
        resumeAfterDocumentVisible: false,
      },
    )

  const [
    selectedGroupId,
    setSelectedGroupId,
  ] = useState<string | null>(
    null,
  )

  const highlightedTeamIdSet =
    useMemo(
      () =>
        new Set(
          highlightedTeamIds,
        ),
      [highlightedTeamIds],
    )

  const riderNameById = useMemo(
    () =>
      new Map(
        model.frames[0]!.riders.map(
          (rider) => [
            rider.riderId,
            rider.riderName,
          ] as const,
        ),
      ),
    [model],
  )

  const defaultMarkers = useMemo(
    (): readonly GenericReplayStageMarker[] => [
      {
        id: 'generic-stage-start',
        kilometre: 0,
        label: 'Start',
        kind: 'start',
      },
      {
        id: 'generic-stage-finish',
        kilometre: model.distanceKm,
        label: 'Finish',
        kind: 'finish',
      },
    ],
    [model.distanceKm],
  )

  const markers = useMemo(
    () => {
      const byId = new Map<
        string,
        GenericReplayStageMarker
      >()

      for (const marker of [
        ...defaultMarkers,
        ...stageMarkers,
      ]) {
        if (
          Number.isFinite(
            marker.kilometre,
          ) &&
          marker.kilometre >= 0 &&
          marker.kilometre <=
            model.distanceKm
        ) {
          byId.set(
            marker.id,
            marker,
          )
        }
      }

      return Array.from(
        byId.values(),
      ).sort(
        (left, right) =>
          left.kilometre -
          right.kilometre,
      )
    }, [
      defaultMarkers,
      stageMarkers,
      model.distanceKm,
    ],
  )

  const effectiveSelectedGroupId =
    controller.groups.some(
      (group) =>
        group.groupId ===
        selectedGroupId,
    )
      ? selectedGroupId
      : controller.groups[0]
          ?.groupId ?? null

  const selectedGroup =
    effectiveSelectedGroupId
      ? controller.groups.find(
          (group) =>
            group.groupId ===
            effectiveSelectedGroupId,
        ) ?? null
      : null

  const selectedGroupRiders =
    selectedGroup
      ? controller.riders.filter(
          (rider) =>
            selectedGroup.riderIds.includes(
              rider.riderId,
            ),
        )
      : []

  const groupOrderById = new Map(
    controller.groups.map(
      (group) => [
        group.groupId,
        group.order,
      ] as const,
    ),
  )

  const currentRiders = [
    ...controller.riders,
  ].sort((left, right) => {
    const leftFinish =
      left.finishPosition ??
      Number.POSITIVE_INFINITY

    const rightFinish =
      right.finishPosition ??
      Number.POSITIVE_INFINITY

    if (
      leftFinish !==
      rightFinish
    ) {
      return leftFinish -
        rightFinish
    }

    const leftOrder =
      left.fromGroupId
        ? groupOrderById.get(
            left.fromGroupId,
          ) ??
          Number.POSITIVE_INFINITY
        : Number.POSITIVE_INFINITY

    const rightOrder =
      right.fromGroupId
        ? groupOrderById.get(
            right.fromGroupId,
          ) ??
          Number.POSITIVE_INFINITY
        : Number.POSITIVE_INFINITY

    if (leftOrder !== rightOrder) {
      return leftOrder -
        rightOrder
    }

    return left.riderName.localeCompare(
      right.riderName,
    )
  })

  const visibleCommentary =
    controller.visibleEvents.slice(
      -60,
    )

  const leaderGroup =
    controller.groups
      .slice()
      .sort(
        (left, right) =>
          left.order -
          right.order,
      )[0] ?? null

  const finishedRiderCount =
    controller.riders.filter(
      (rider) =>
        rider.status ===
        'finished',
    ).length

  const rootClass =
    displayMode === 'page'
      ? 'min-h-screen bg-slate-50 p-4 sm:p-6'
      : 'fixed inset-0 z-50 overflow-auto bg-slate-950/70 p-4'

  const surfaceClass =
    displayMode === 'page'
      ? 'mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1500px] flex-col overflow-hidden rounded-3xl bg-white shadow-xl'
      : 'mx-auto flex min-h-full max-w-[1500px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl'

  return (
    <div className={rootClass}>
      <div className={surfaceClass}>
        <header className="grid grid-cols-1 gap-4 border-b border-slate-200 px-5 py-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Race replay
            </div>

            <h1 className="mt-1 truncate text-2xl font-semibold text-slate-950">
              {raceName?.trim() ||
                model.stageName}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              {stageLabel?.trim() ||
                model.stageName}
              {' · '}
              {model.distanceKm.toFixed(0)}
              {' km · '}
              {humanizeCode(
                model.stageFormat,
              )}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Generic deterministic replay
              {' · '}
              {model.frames.length}
              {' snapshots · '}
              {model.events.length}
              {' events'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <span
              className={[
                'rounded-full border px-3 py-1.5 text-xs font-semibold',
                controller.completed
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : controller.playing
                    ? 'border-sky-200 bg-sky-50 text-sky-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600',
              ].join(' ')}
            >
              {controller.completed
                ? 'Finished'
                : controller.playing
                  ? 'Playing'
                  : 'Paused'}
            </span>

            {controller.pausedByVisibility ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                Paused in background
              </span>
            ) : null}

            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {displayMode === 'page'
                  ? '← Back'
                  : 'Close'}
              </button>
            ) : null}
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 sm:p-5">
          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-950">
                  Stage profile replay
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Authoritative groups move between deterministic snapshots.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={
                    controller.togglePlaying
                  }
                  className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  {controller.playing
                    ? 'Pause'
                    : controller.completed
                      ? 'Replay'
                      : 'Play'}
                </button>

                <button
                  type="button"
                  onClick={
                    controller.previousFrame
                  }
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Previous
                </button>

                <button
                  type="button"
                  onClick={
                    controller.nextFrameStep
                  }
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Next
                </button>

                {SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() =>
                      controller.setSpeed(
                        speed,
                      )
                    }
                    className={[
                      'rounded-full border px-3 py-2 text-xs font-semibold',
                      controller.speed ===
                      speed
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {speed}x
                  </button>
                ))}

                <button
                  type="button"
                  onClick={controller.finish}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Finish replay
                </button>

                <button
                  type="button"
                  onClick={controller.reset}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Reset
                </button>
              </div>
            </div>

            <ReplayProfile
              model={model}
              groups={controller.groups}
              markers={markers}
              selectedGroupId={
                effectiveSelectedGroupId
              }
              onSelectGroup={
                setSelectedGroupId
              }
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Race clock
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-950">
                  {formatRaceClock(
                    controller.displayRaceSecond,
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Distance
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-950">
                  {formatKilometre(
                    controller.displayLeaderDistanceKm,
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Leader speed
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-950">
                  {formatSpeed(
                    leaderGroup?.speedKmh ??
                      null,
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Groups
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-950">
                  {controller.groups.length}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Finished riders
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-950">
                  {finishedRiderCount}
                  {' / '}
                  {controller.riders.length}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
                <span>
                  {(
                    controller.displayProgress *
                    100
                  ).toFixed(1)}%
                </span>
                <span>
                  Frame{' '}
                  {controller.currentFrameIndex + 1}
                  {' / '}
                  {model.frames.length}
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={1}
                step="any"
                value={
                  controller.progress
                }
                onChange={(event: { target: { value: string } }) =>
                  controller.seekToProgress(
                    Number(
                      event.target.value,
                    ),
                  )
                }
                className="mt-2 w-full accent-slate-950"
                aria-label="Replay timeline"
              />
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {controller.groups.map(
                (group) => (
                  <button
                    key={group.groupId}
                    type="button"
                    onClick={() =>
                      setSelectedGroupId(
                        group.groupId,
                      )
                    }
                    className={[
                      'rounded-2xl border p-3 text-left transition',
                      GROUP_BADGE_CLASSES[
                        group.type
                      ],
                      effectiveSelectedGroupId ===
                      group.groupId
                        ? 'ring-2 ring-slate-950 ring-offset-2'
                        : '',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">
                          {group.label}
                        </div>
                        <div className="mt-1 text-xs opacity-80">
                          {group.riderIds.length}
                          {' riders'}
                        </div>
                      </div>

                      <div className="text-right text-xs font-semibold">
                        <div>
                          {formatGap(
                            group.gapToLeaderSeconds,
                          )}
                        </div>
                        <div className="mt-1 opacity-80">
                          {formatSpeed(
                            group.speedKmh,
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ),
              )}
            </div>

            {selectedGroup ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Rider markers
                    </div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {selectedGroup.label}
                    </div>
                  </div>

                  <div className="text-xs font-semibold text-slate-500">
                    {formatKilometre(
                      selectedGroup.distanceKm,
                    )}
                    {' · '}
                    {formatGap(
                      selectedGroup.gapToLeaderSeconds,
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedGroupRiders.map(
                    (rider) => (
                      <span
                        key={rider.riderId}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                        title={`${rider.teamName} · ${formatKilometre(rider.distanceKm)}`}
                      >
                        {rider.riderName}
                      </span>
                    ),
                  )}
                </div>
              </div>
            ) : null}
          </section>

          <section className="grid min-h-[430px] gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Live commentary
              </div>

              <div className="max-h-[620px] divide-y divide-slate-100 overflow-auto">
                {visibleCommentary.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-slate-500">
                    {controller.currentRaceSecond <= 0
                      ? 'Press Play to begin the deterministic replay.'
                      : 'No authoritative event has been reached yet.'}
                  </div>
                ) : (
                  visibleCommentary.map(
                    (event) => (
                      <article
                        key={event.id}
                        className="grid grid-cols-[82px_minmax(0,1fr)] gap-3 px-4 py-3 text-sm"
                      >
                        <div>
                          <div className="font-semibold text-slate-500">
                            {formatKilometre(
                              event.kilometre,
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-400">
                            {formatRaceClock(
                              event.raceSecond,
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="font-semibold text-slate-950">
                            {getEventTitle(
                              event,
                            )}
                          </div>
                          <p className="mt-1 leading-5 text-slate-600">
                            {getEventDescription(
                              event,
                              riderNameById,
                            )}
                          </p>
                        </div>
                      </article>
                    ),
                  )
                )}
              </div>
            </div>

            <aside className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Stage standing · riders
                </div>
                <div className="text-xs font-semibold text-slate-500">
                  {formatRaceClock(
                    controller.displayRaceSecond,
                  )}
                </div>
              </div>

              <div className="max-h-[620px] overflow-auto">
                <table className="w-full min-w-[900px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">
                        Pos
                      </th>
                      <th className="px-3 py-2">
                        Rider
                      </th>
                      <th className="px-3 py-2">
                        Group
                      </th>
                      <th className="px-3 py-2 text-right">
                        Gap
                      </th>
                      <th className="px-3 py-2 text-right">
                        Speed
                      </th>
                      <th className="w-32 px-3 py-2">
                        Stamina
                      </th>
                      <th className="w-32 px-3 py-2">
                        Fatigue
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {currentRiders.map(
                      (rider) => {
                        const group =
                          rider.fromGroupId
                            ? controller.groups.find(
                                (candidate) =>
                                  candidate.groupId ===
                                  rider.fromGroupId,
                              ) ?? null
                            : null

                        const highlighted =
                          highlightedTeamIdSet.has(
                            rider.teamId,
                          )

                        return (
                          <tr
                            key={rider.riderId}
                            className={
                              highlighted
                                ? 'bg-yellow-50'
                                : 'bg-white'
                            }
                          >
                            <td className="px-3 py-2 font-semibold text-slate-700">
                              {rider.finishPosition ??
                                rider.position ??
                                '—'}
                            </td>

                            <td className="px-3 py-2">
                              <div className="font-semibold text-slate-950">
                                {rider.riderName}
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                {rider.teamName}
                              </div>
                            </td>

                            <td className="px-3 py-2">
                              {group ? (
                                <span
                                  className={[
                                    'inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold',
                                    GROUP_BADGE_CLASSES[
                                      group.type
                                    ],
                                  ].join(' ')}
                                >
                                  {group.label}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>

                            <td className="px-3 py-2 text-right font-semibold text-slate-700">
                              {formatGap(
                                rider.gapToLeaderSeconds,
                              )}
                            </td>

                            <td className="px-3 py-2 text-right font-semibold text-slate-700">
                              {formatSpeed(
                                rider.speedKmh,
                              )}
                            </td>

                            <td className="px-3 py-2">
                              <PercentageMetric
                                label="Stamina"
                                value={
                                  rider.staminaPercent
                                }
                              />
                            </td>

                            <td className="px-3 py-2">
                              <PercentageMetric
                                label="Fatigue"
                                value={
                                  rider.fatiguePercent
                                }
                              />
                            </td>
                          </tr>
                        )
                      },
                    )}
                  </tbody>
                </table>
              </div>
            </aside>
          </section>

          {controller.completed ? (
            <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm">
              <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  Final classification
                </div>
                <div className="mt-1 text-sm text-emerald-800">
                  Revealed only after the replay reaches the authoritative finish.
                </div>
              </div>

              <div className="max-h-[520px] overflow-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">
                        Pos
                      </th>
                      <th className="px-4 py-3">
                        Rider
                      </th>
                      <th className="px-4 py-3">
                        Team
                      </th>
                      <th className="px-4 py-3 text-right">
                        Time
                      </th>
                      <th className="px-4 py-3 text-right">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {model.finalResults.map(
                      (result) => (
                        <tr key={result.riderId}>
                          <td className="px-4 py-3 font-semibold text-slate-950">
                            {result.finishPosition ??
                              '—'}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-950">
                            {result.riderName}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {result.teamName}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-700">
                            {result.finishTimeSeconds !==
                            null
                              ? formatRaceClock(
                                  result.finishTimeSeconds,
                                )
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {humanizeCode(
                              result.status,
                            )}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  )
}

export default GenericRaceReplayView
