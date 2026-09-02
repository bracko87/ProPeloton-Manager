import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import type {
  ActiveJobView,
  FacilityJobCapacityRow,
  FacilityKey,
  FacilityUpgradeConfigRow,
  InfrastructureCancellationQuoteRow,
  InfrastructureItem,
} from './infrastructureTypes'
import {
  formatCash,
  formatGameDays,
  formatTimeRemaining,
} from './infrastructureHelpers'
import {
  getFacilityFallbackImage,
  getFacilityLevelImage,
} from './infrastructureVisuals'

type FacilityLevelConfig = FacilityUpgradeConfigRow & {
  monthly_maintenance_cash?: number | string | null
  staff_payroll_discount_bps?: number | string | null
  rider_payroll_discount_bps?: number | string | null
  operating_cost_rebate_bps?: number | string | null
  tax_rebate_bps?: number | string | null
}

function facilityLevel(item: InfrastructureItem): number {
  return Math.max(0, Math.floor(Number(item.currentValue) || 0))
}

function facilityMaxLevel(item: InfrastructureItem): number {
  return Math.max(facilityLevel(item), Math.floor(Number(item.maxValue) || 1), 1)
}

function formatUsd(raw: unknown): string {
  return formatCash(raw).replace('€', '$')
}

function formatSeasonDate(raw: string | null | undefined): string {
  if (!raw) return 'TBD'

  const trimmed = raw.trim()
  const canonicalMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  let year: number
  let month: number
  let day: number

  if (canonicalMatch) {
    year = Number(canonicalMatch[1])
    month = Number(canonicalMatch[2])
    day = Number(canonicalMatch[3])
  } else {
    const timestamp = Date.parse(trimmed)
    if (Number.isNaN(timestamp)) return trimmed
    const date = new Date(timestamp)
    year = date.getUTCFullYear()
    month = date.getUTCMonth() + 1
    day = date.getUTCDate()
  }

  const season = year - 1999
  if (season < 1 || month < 1 || month > 12 || day < 1 || day > 31) return trimmed

  const monthLabel = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]
  return `S${season} · ${monthLabel} ${day}`
}

const fallbackMonthlyMaintenance: Record<FacilityKey, number[]> = {
  club_house: [0, 1500, 3500, 6000, 10000, 15000],
  training_center: [0, 2000, 4000, 7000, 11000, 17000],
  medical_center: [0, 2500, 5000, 8000, 13000, 20000],
  youth_academy: [0, 15000, 40000],
  mechanics_workshop: [0, 8000, 20000, 45000, 80000],
  scouting_office: [0, 6000, 15000, 35000, 65000],
}

const levelZeroDetails: Record<FacilityKey, { unlock: string; effect: string }> = {
  club_house: {
    unlock: 'Basic club administration only.',
    effect: 'No Club House financial bonus is active.',
  },
  training_center: {
    unlock: 'Basic training facilities only.',
    effect: 'No Training Center development, coaching-effectiveness, fatigue-load or training-risk bonus is active.',
  },
  medical_center: {
    unlock: 'Base medical facility; one Team Doctor and one Physio slot are available once staff operations are unlocked.',
    effect: 'No Medical Center prevention, recovery-duration or rehabilitation fatigue-floor bonus is active.',
  },
  youth_academy: {
    unlock: 'No dedicated U23 academy infrastructure or U23 Head Coach slot.',
    effect: 'No academy-specific U23 training or development bonus is active.',
  },
  mechanics_workshop: {
    unlock: 'Basic technical support only; additional mechanic capacity remains locked.',
    effect: 'No workshop-based repair speed or maintenance-cost bonus is active.',
  },
  scouting_office: {
    unlock: 'Basic scouting setup only; additional scout capacity and higher report tiers remain locked.',
    effect: 'Scouting report quality remains at the basic facility cap.',
  },
}

function configForLevel(
  configs: FacilityLevelConfig[],
  item: InfrastructureItem,
  level: number,
): FacilityLevelConfig | null {
  return configs.find(row => row.facility_key === item.id && row.target_level === level) ?? null
}

function maintenanceFor(
  item: InfrastructureItem,
  level: number,
  configs: FacilityLevelConfig[],
): number {
  const config = configForLevel(configs, item, level)
  const configured = Number(config?.monthly_maintenance_cash)
  if (Number.isFinite(configured) && configured >= 0 && config?.monthly_maintenance_cash != null) {
    return configured
  }

  const values = fallbackMonthlyMaintenance[item.id as FacilityKey] ?? [0]
  return values[Math.min(Math.max(level, 0), values.length - 1)] ?? 0
}

function levelDetail(
  item: InfrastructureItem,
  level: number,
  configs: FacilityLevelConfig[],
): { unlock: string; effect: string; maintenance: number } {
  const key = item.id as FacilityKey
  const config = configForLevel(configs, item, level)
  const zero = levelZeroDetails[key]

  return {
    unlock: level === 0
      ? zero.unlock
      : config?.unlock_summary || 'No additional unlock at this level.',
    effect: level === 0
      ? zero.effect
      : config?.effect_summary || 'No additional effect is configured for this level.',
    maintenance: level === 0 ? 0 : maintenanceFor(item, level, configs),
  }
}

function EffectList({ text }: { text: string }): JSX.Element {
  const parts = text
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)

  if (parts.length <= 1) return <span>{text}</span>

  return (
    <ul className="mt-1 space-y-1 pl-4">
      {parts.map((part, index) => (
        <li key={`${part}:${index}`} className="list-disc">{part}</li>
      ))}
    </ul>
  )
}

function FacilityVisual({
  item,
  className,
  eager = false,
}: {
  item: InfrastructureItem
  className: string
  eager?: boolean
}): JSX.Element {
  const level = facilityLevel(item)
  const maxLevel = facilityMaxLevel(item)
  const key = item.id as FacilityKey
  const fallback = getFacilityFallbackImage(key, level, maxLevel)

  return (
    <img
      src={getFacilityLevelImage(key, level, maxLevel)}
      alt={`${item.name} — Level ${level} of ${maxLevel}`}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={className}
      onError={event => {
        const image = event.currentTarget
        if (image.dataset.levelFallback === 'true') return
        image.dataset.levelFallback = 'true'
        image.src = fallback
      }}
    />
  )
}

function LevelBadge({ item, dark = false }: { item: InfrastructureItem; dark?: boolean }): JSX.Element {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${dark ? 'bg-black/65 text-white backdrop-blur-sm' : 'bg-gray-100 text-gray-700'}`}>
      Level {facilityLevel(item)} / {facilityMaxLevel(item)}
    </span>
  )
}

function ActiveJobsPanel({
  jobs,
  nowMs,
  facilityCapacity,
  cancellationQuotesByJobId,
  processingKey,
  onCancelJob,
}: {
  jobs: ActiveJobView[]
  nowMs: number
  facilityCapacity: FacilityJobCapacityRow | null
  cancellationQuotesByJobId: Record<string, InfrastructureCancellationQuoteRow>
  processingKey: string | null
  onCancelJob: (jobId: string) => void
}): JSX.Element {
  const { t } = useTranslation('infrastructure')

  if (jobs.length === 0) {
    return (
      <div className="mb-5 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-gray-500">{t('facilities.activeJobs')}</div>
            <div className="mt-1 text-base font-semibold text-gray-900">{t('facilities.noJobs')}</div>
            {facilityCapacity && (
              <div className="mt-1 text-xs text-gray-500">
                {t('facilities.constructionSlots')} {facilityCapacity.active_facility_jobs} / {facilityCapacity.max_active_facility_jobs} {t('facilities.active')} · {facilityCapacity.open_facility_job_slots} {t('facilities.open')}
              </div>
            )}
          </div>
          <div className="text-sm text-gray-400">{t('common.allClear')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-5 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <div className="text-sm text-gray-500">{t('facilities.activeJobs')}</div>
        <div className="mt-1 text-base font-semibold text-gray-900">
          {jobs.length === 1
            ? t('facilities.jobInProgress', { count: jobs.length })
            : t('facilities.jobsInProgress', { count: jobs.length })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {jobs.map(job => {
          const quote = cancellationQuotesByJobId[job.id]
          const isCancelling = processingKey === `cancel:${job.id}`

          return (
            <div key={job.id} className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-yellow-900">{job.name}</div>
                  <div className="mt-1 text-sm text-yellow-800">{job.summary}</div>
                </div>
                <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                  {job.type === 'facility_upgrade' ? t('common.upgrade') : t('common.delivery')}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-yellow-800 sm:grid-cols-3">
                <span>{t('facilities.gameDuration')} {formatGameDays(job.durationGameDays)}</span>
                <span>{t('common.completes')}: {formatSeasonDate(job.completeGameDate)}</span>
                <span>{t('facilities.paid')} {formatUsd(job.costCash)}</span>
              </div>

              {!job.completeGameDate && (
                <div className="mt-2 text-xs text-yellow-700">
                  {t('facilities.realTimeRemaining')} {formatTimeRemaining(job.completeAt, nowMs)}
                </div>
              )}

              {quote && <div className="mt-2 text-xs text-yellow-700">{quote.reason}</div>}

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => onCancelJob(job.id)}
                  disabled={isCancelling || (quote ? !quote.can_cancel : false)}
                  className={`rounded-md px-3 py-2 text-xs font-semibold ${isCancelling || (quote ? !quote.can_cancel : false) ? 'cursor-not-allowed bg-gray-200 text-gray-500' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                >
                  {isCancelling ? t('facilities.cancelling') : t('facilities.cancelJob')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LevelInfoPanel({
  item,
  level,
  configs,
  tone,
  active,
  showUpgradeMeta = false,
}: {
  item: InfrastructureItem
  level: number
  configs: FacilityLevelConfig[]
  tone: 'current' | 'next'
  active?: boolean
  showUpgradeMeta?: boolean
}): JSX.Element {
  const detail = levelDetail(item, level, configs)
  const isCurrent = tone === 'current'

  return (
    <div className={`flex h-[272px] flex-col overflow-y-auto rounded-lg border p-3 ${isCurrent ? 'border-blue-100 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className={`text-sm font-semibold ${isCurrent ? 'text-blue-950' : 'text-gray-900'}`}>
          {isCurrent ? 'Current' : 'Next'} Level {level}
        </div>
        {active && <span className="text-xs font-medium text-blue-700">Active now</span>}
      </div>

      <div className="mt-3 space-y-2 text-sm leading-5 text-gray-700">
        <div><span className="font-semibold text-gray-900">Unlocks:</span> {detail.unlock}</div>
        <div>
          <span className="font-semibold text-gray-900">Effects:</span>{' '}
          <EffectList text={detail.effect} />
        </div>
        <div>
          <span className="font-semibold text-gray-900">Monthly maintenance:</span>{' '}
          {formatUsd(detail.maintenance)} / game month
        </div>
      </div>

      {showUpgradeMeta && (
        <div className="mt-auto grid grid-cols-1 gap-2 border-t border-gray-200 pt-3 text-xs text-gray-600 sm:grid-cols-3">
          <div>
            <span className="block text-gray-400">Upgrade cost</span>
            <span className="font-medium text-gray-900">{formatUsd(item.previewCostCash)}</span>
          </div>
          <div>
            <span className="block text-gray-400">Construction time</span>
            <span className="font-medium text-gray-900">{formatGameDays(item.previewDurationGameDays)}</span>
          </div>
          <div>
            <span className="block whitespace-nowrap text-gray-400">Est. completion</span>
            <span className="whitespace-nowrap font-medium text-gray-900">{formatSeasonDate(item.previewCompleteGameDate)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function FacilityDetailsModal({
  item,
  configs,
  isProcessing,
  onClose,
  onAction,
  nowMs,
}: {
  item: InfrastructureItem
  configs: FacilityLevelConfig[]
  isProcessing: boolean
  onClose: () => void
  onAction: (item: InfrastructureItem) => void
  nowMs: number
}): JSX.Element {
  const { t } = useTranslation('infrastructure')
  const currentLevel = facilityLevel(item)
  const maxLevel = facilityMaxLevel(item)
  const levels = Array.from({ length: maxLevel + 1 }, (_, index) => index)
  const isDisabled = isProcessing || !item.canAct

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <button type="button" aria-label={t('common.close')} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative z-10 max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-4 sm:p-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">Facility level guide</div>
            <h3 className="mt-1 text-xl font-semibold text-gray-900">{item.name}</h3>
            <p className="mt-1 text-sm text-gray-500">{item.description}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-600 hover:bg-gray-50">
            {t('common.close')}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-sm">
              <FacilityVisual item={item} eager className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4 pt-12">
                <div className="flex items-end justify-between gap-3">
                  <div className="text-sm font-semibold text-white">{item.name}</div>
                  <LevelBadge item={item} dark />
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-sm text-gray-500">Current status</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{item.valueLabel}</div>
              <div className="mt-2 text-xs text-gray-500">
                Status: <span className="font-medium text-gray-700">{item.badgeLabel}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 lg:col-span-3">
            {item.longDescription && (
              <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm leading-6 text-gray-600 shadow-sm">
                {item.longDescription}
              </div>
            )}

            <div className="text-sm font-semibold text-gray-900">What every level provides</div>

            {levels.map(level => {
              const detail = levelDetail(item, level, configs)
              const cfg = configForLevel(configs, item, level)

              return (
                <div
                  key={`${item.id}:level:${level}`}
                  className={`rounded-xl border p-4 ${level === currentLevel ? 'border-blue-200 bg-blue-50' : level < currentLevel ? 'border-green-100 bg-green-50/50' : 'border-gray-100 bg-white'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-gray-900">Level {level}</div>
                    <div className="text-xs text-gray-500">
                      {level === currentLevel ? 'Current level' : level < currentLevel ? 'Unlocked' : 'Future level'}
                    </div>
                  </div>

                  <div className="mt-2 space-y-2 text-sm text-gray-700">
                    <div><span className="font-semibold">Unlocks:</span> {detail.unlock}</div>
                    <div>
                      <span className="font-semibold">Effects:</span>{' '}
                      <EffectList text={detail.effect} />
                    </div>
                    <div>
                      <span className="font-semibold">Monthly maintenance:</span>{' '}
                      {formatUsd(detail.maintenance)} / game month
                    </div>
                    {cfg && (
                      <div className="mt-1 text-xs text-gray-500">
                        Upgrade to this level: {formatUsd(cfg.cost_cash)} · {formatGameDays(cfg.duration_game_days)}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {item.pendingJob && (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                {item.pendingSummary} · {formatTimeRemaining(item.pendingJob.complete_at, nowMs)}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-end sm:p-5">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onAction(item)}
            disabled={isDisabled}
            className={`rounded-md px-4 py-2 text-sm font-medium ${isDisabled ? 'cursor-not-allowed bg-gray-200 text-gray-500' : 'bg-yellow-400 text-black hover:bg-yellow-300'}`}
          >
            {isProcessing ? t('common.starting') : item.actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function InfrastructureCard({
  item,
  configs,
  isProcessing,
  onAction,
  onDetails,
  nowMs,
}: {
  item: InfrastructureItem
  configs: FacilityLevelConfig[]
  isProcessing: boolean
  onAction: (item: InfrastructureItem) => void
  onDetails: (item: InfrastructureItem) => void
  nowMs: number
}): JSX.Element {
  const { t } = useTranslation('infrastructure')
  const currentLevel = facilityLevel(item)
  const nextLevel = Math.min(currentLevel + 1, facilityMaxLevel(item))
  const badgeClasses = item.pendingJob
    ? 'bg-yellow-100 text-yellow-800'
    : item.owned
      ? 'bg-green-100 text-green-700'
      : 'bg-gray-100 text-gray-600'

  return (
    <article className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => onDetails(item)}
        className="group relative block aspect-[16/8] w-full overflow-hidden bg-gray-100 text-left sm:aspect-[16/7]"
        aria-label={`${item.name} ${t('common.details')}`}
      >
        <FacilityVisual item={item} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.015]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
        <div className="absolute left-3 top-3 sm:left-4 sm:top-4"><LevelBadge item={item} dark /></div>
        <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm sm:right-4 sm:top-4 ${badgeClasses}`}>
          {item.badgeLabel}
        </span>
        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
          <h3 className="text-base font-semibold text-white sm:text-lg">{item.name}</h3>
          <p className="mt-1 line-clamp-2 text-xs text-white/85 sm:text-sm">{item.description}</p>
        </div>
      </button>

      <div className="p-4">
        <div className="mb-4 space-y-2">
          <p className="text-sm leading-5 text-gray-600">{item.description}</p>
          {item.longDescription && <p className="text-sm leading-6 text-gray-600">{item.longDescription}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <LevelInfoPanel item={item} level={currentLevel} configs={configs} tone="current" active />
          {!item.pendingJob && currentLevel < facilityMaxLevel(item) ? (
            <LevelInfoPanel item={item} level={nextLevel} configs={configs} tone="next" showUpgradeMeta />
          ) : (
            <div className="flex h-[272px] items-center justify-center rounded-lg border border-gray-100 bg-gray-50 p-4 text-center text-sm text-gray-500">
              {item.pendingJob ? item.pendingSummary : 'Maximum facility level reached.'}
            </div>
          )}
        </div>

        {item.pendingJob && (
          <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <div className="text-sm font-medium text-yellow-800">{item.pendingSummary}</div>
            <div className="mt-1 text-xs text-yellow-700">
              {t('facilities.gameDuration')} {formatGameDays(item.pendingJob.duration_game_days)} · {t('common.completes')}: {formatSeasonDate(item.pendingJob.complete_game_date)}
            </div>
            {!item.pendingJob.complete_game_date && (
              <div className="mt-1 text-xs text-yellow-700">
                {t('facilities.realTimeRemaining')} {formatTimeRemaining(item.pendingJob.complete_at, nowMs)}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onDetails(item)}
            className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            {t('common.details')}
          </button>
          <button
            type="button"
            onClick={() => onAction(item)}
            disabled={isProcessing || !item.canAct}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${isProcessing || !item.canAct ? 'cursor-not-allowed bg-gray-200 text-gray-500' : 'bg-yellow-400 text-black hover:bg-yellow-300'}`}
          >
            {isProcessing ? t('common.starting') : item.actionLabel}
          </button>
        </div>
      </div>
    </article>
  )
}

export function FacilitiesSection({
  activeJobs,
  nowMs,
  facilityCapacity,
  cancellationQuotesByJobId,
  processingKey,
  facilities,
  selectedItem,
  onCancelJob,
  onFacilityAction,
  onOpenDetails,
  onCloseDetails,
}: {
  activeJobs: ActiveJobView[]
  nowMs: number
  facilityCapacity: FacilityJobCapacityRow | null
  cancellationQuotesByJobId: Record<string, InfrastructureCancellationQuoteRow>
  processingKey: string | null
  facilities: InfrastructureItem[]
  selectedItem: InfrastructureItem | null
  onCancelJob: (jobId: string) => void
  onFacilityAction: (item: InfrastructureItem) => void
  onOpenDetails: (item: InfrastructureItem) => void
  onCloseDetails: () => void
}): JSX.Element {
  const [configs, setConfigs] = useState<FacilityLevelConfig[]>([])

  useEffect(() => {
    let cancelled = false

    void supabase
      .from('infrastructure_facility_upgrade_config')
      .select('facility_key,target_level,cost_cash,duration_game_days,unlock_summary,effect_summary,monthly_maintenance_cash,staff_payroll_discount_bps,rider_payroll_discount_bps,operating_cost_rebate_bps,tax_rebate_bps')
      .then(({ data, error }) => {
        if (!cancelled && !error && Array.isArray(data)) {
          setConfigs(data as FacilityLevelConfig[])
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const sortedConfigs = useMemo(
    () => [...configs].sort((a, b) => a.facility_key.localeCompare(b.facility_key) || a.target_level - b.target_level),
    [configs],
  )

  return (
    <>
      <ActiveJobsPanel
        jobs={activeJobs}
        nowMs={nowMs}
        facilityCapacity={facilityCapacity}
        cancellationQuotesByJobId={cancellationQuotesByJobId}
        processingKey={processingKey}
        onCancelJob={onCancelJob}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {facilities.map(item => (
          <InfrastructureCard
            key={`${item.type}:${item.id}`}
            item={item}
            configs={sortedConfigs}
            onAction={onFacilityAction}
            onDetails={onOpenDetails}
            isProcessing={processingKey === `${item.type}:${item.id}`}
            nowMs={nowMs}
          />
        ))}
      </div>

      {selectedItem && selectedItem.type === 'facility' && (
        <FacilityDetailsModal
          item={selectedItem}
          configs={sortedConfigs}
          isProcessing={processingKey === `${selectedItem.type}:${selectedItem.id}`}
          onClose={onCloseDetails}
          onAction={onFacilityAction}
          nowMs={nowMs}
        />
      )}
    </>
  )
}
