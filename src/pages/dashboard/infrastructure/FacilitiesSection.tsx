/**
 * FacilitiesSection.tsx
 *
 * Facilities UI with visual progression by infrastructure level.
 * Existing build/upgrade/cancel callbacks remain owned by Infrastructure.tsx;
 * this file only changes presentation and level-aware image rendering.
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ActiveJobView,
  FacilityJobCapacityRow,
  FacilityKey,
  InfrastructureCancellationQuoteRow,
  InfrastructureItem,
} from './infrastructureTypes'
import {
  formatCash,
  formatGameDate,
  formatGameDays,
  formatTimeRemaining,
  toNumber,
} from './infrastructureHelpers'
import {
  getFacilityFallbackImage,
  getFacilityLevelImage,
} from './infrastructureVisuals'

function facilityLevel(item: InfrastructureItem): number {
  return Math.max(0, Math.floor(Number(item.currentValue) || 0))
}

function facilityMaxLevel(item: InfrastructureItem): number {
  return Math.max(facilityLevel(item), Math.floor(Number(item.maxValue) || 1), 1)
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
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        dark ? 'bg-black/65 text-white backdrop-blur-sm' : 'bg-gray-100 text-gray-700'
      }`}
    >
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
                {t('facilities.constructionSlots')}{' '}
                {facilityCapacity.active_facility_jobs} / {facilityCapacity.max_active_facility_jobs}{' '}
                {t('facilities.active')} · {facilityCapacity.open_facility_job_slots} {t('facilities.open')}
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
        {facilityCapacity && (
          <div className="mt-1 text-xs text-gray-500">
            {t('facilities.constructionSlots')}{' '}
            {facilityCapacity.active_facility_jobs} / {facilityCapacity.max_active_facility_jobs}{' '}
            {t('facilities.active')} · {facilityCapacity.open_facility_job_slots} {t('facilities.open')}
          </div>
        )}
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
                <span>{t('common.completes')}: {formatGameDate(job.completeGameDate)}</span>
                <span>{t('facilities.paid')} {formatCash(job.costCash)}</span>
              </div>

              {!job.completeGameDate && (
                <div className="mt-2 text-xs text-yellow-700">
                  {t('facilities.realTimeRemaining')} {formatTimeRemaining(job.completeAt, nowMs)}
                </div>
              )}

              {quote && (
                <div className="mt-3 rounded-lg border border-yellow-200 bg-white/70 p-3">
                  <div className="grid grid-cols-1 gap-2 text-xs text-yellow-900 sm:grid-cols-3">
                    <div>
                      <span className="block text-yellow-700">{t('facilities.refundNow')}</span>
                      <span className="font-semibold">{formatCash(quote.refund_cash)}</span>
                    </div>
                    <div>
                      <span className="block text-yellow-700">{t('facilities.refundPercent')}</span>
                      <span className="font-semibold">{toNumber(quote.refund_percent, 0).toFixed(2)}%</span>
                    </div>
                    <div>
                      <span className="block text-yellow-700">{t('facilities.cancellationCost')}</span>
                      <span className="font-semibold">{formatCash(quote.cancellation_cost_cash)}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-yellow-700">{quote.reason}</div>
                </div>
              )}

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => onCancelJob(job.id)}
                  disabled={isCancelling || (quote ? !quote.can_cancel : false)}
                  className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                    isCancelling || (quote ? !quote.can_cancel : false)
                      ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                      : 'bg-red-100 text-red-700 hover:bg-red-200'
                  }`}
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

function FacilityDetailsModal({
  item,
  isProcessing,
  onClose,
  onAction,
  nowMs,
}: {
  item: InfrastructureItem
  isProcessing: boolean
  onClose: () => void
  onAction: (item: InfrastructureItem) => void
  nowMs: number
}): JSX.Element {
  const { t } = useTranslation('infrastructure')
  const isDisabled = isProcessing || !item.canAct

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      <div className="relative z-10 max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-4 sm:p-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">{t('facilities.detailsTitle')}</div>
            <h3 className="mt-1 text-xl font-semibold text-gray-900">{item.name}</h3>
            <p className="mt-1 text-sm text-gray-500">{item.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
          >
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
              <div className="text-sm text-gray-500">{t('facilities.currentStatus')}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{item.valueLabel}</div>
              <div className="mt-2 text-xs text-gray-500">
                {t('facilities.status')} <span className="font-medium text-gray-700">{item.badgeLabel}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4 lg:col-span-3">
            {item.longDescription && (
              <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm leading-6 text-gray-600 shadow-sm">
                {item.longDescription}
              </div>
            )}

            {item.impactLines && item.impactLines.length > 0 && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <div className="text-sm font-semibold text-blue-900">{t('facilities.currentImpact')}</div>
                <div className="mt-2 space-y-1">
                  {item.impactLines.map((line, index) => (
                    <div key={`${item.id}:impact:${index}`} className="text-sm text-blue-800">{line}</div>
                  ))}
                </div>
              </div>
            )}

            {!item.pendingJob && item.nextValueLabel && (
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900">{t('facilities.nextLevel')}</div>
                  {facilityLevel(item) < facilityMaxLevel(item) && (
                    <span className="text-xs font-medium text-gray-500">
                      Level {facilityLevel(item)} → {facilityLevel(item) + 1}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm text-gray-700">{item.nextValueLabel}</div>
                {item.unlockSummary && (
                  <div className="mt-3 text-sm text-gray-700">
                    <span className="font-semibold">{t('facilities.unlock')}</span> {item.unlockSummary}
                  </div>
                )}
                {item.effectSummary && (
                  <div className="mt-2 text-sm text-gray-700">
                    <span className="font-semibold">{t('facilities.effect')}</span> {item.effectSummary}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="text-xs text-gray-400">{t('common.cost')}</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{formatCash(item.previewCostCash)}</div>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="text-xs text-gray-400">{t('facilities.constructionTime')}</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{formatGameDays(item.previewDurationGameDays)}</div>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="text-xs text-gray-400">{t('facilities.estimatedCompletion')}</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{formatGameDate(item.previewCompleteGameDate)}</div>
                  </div>
                </div>
              </div>
            )}

            {item.pendingJob && (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                <div className="text-sm font-semibold text-yellow-900">{t('facilities.jobProgress')}</div>
                <div className="mt-2 text-sm text-yellow-800">{item.pendingSummary}</div>
                <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-yellow-800 sm:grid-cols-3">
                  <div>
                    <span className="block text-yellow-700">{t('common.duration')}</span>
                    <span className="font-semibold">{formatGameDays(item.pendingJob.duration_game_days)}</span>
                  </div>
                  <div>
                    <span className="block text-yellow-700">{t('common.completes')}</span>
                    <span className="font-semibold">{formatGameDate(item.pendingJob.complete_game_date)}</span>
                  </div>
                  <div>
                    <span className="block text-yellow-700">{t('common.costPaid')}</span>
                    <span className="font-semibold">{formatCash(item.pendingJob.cost_cash)}</span>
                  </div>
                </div>
                {!item.pendingJob.complete_game_date && (
                  <div className="mt-2 text-xs text-yellow-700">
                    {t('facilities.fallbackRemaining')} {formatTimeRemaining(item.pendingJob.complete_at, nowMs)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="text-xs text-gray-400">
            {item.pendingJob
              ? t('facilities.lockedDuringConstruction')
              : item.canAct
                ? t('facilities.costCharged')
                : t('facilities.noUpgrade')}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => onAction(item)}
              disabled={isDisabled}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                isDisabled
                  ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                  : 'bg-yellow-400 text-black hover:bg-yellow-300'
              }`}
            >
              {isProcessing ? t('common.starting') : item.actionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfrastructureCard({
  item,
  isProcessing,
  onAction,
  onDetails,
  nowMs,
}: {
  item: InfrastructureItem
  isProcessing: boolean
  onAction: (item: InfrastructureItem) => void
  onDetails: (item: InfrastructureItem) => void
  nowMs: number
}): JSX.Element {
  const { t } = useTranslation('infrastructure')
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
        <FacilityVisual
          item={item}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.015]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
        <div className="absolute left-3 top-3 sm:left-4 sm:top-4">
          <LevelBadge item={item} dark />
        </div>
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
          {item.longDescription && (
            <p className="text-sm leading-6 text-gray-600">{item.longDescription}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-gray-700">{item.valueLabel}</div>
          {facilityLevel(item) < facilityMaxLevel(item) && !item.pendingJob && (
            <div className="text-xs text-gray-400">Level {facilityLevel(item)} → {facilityLevel(item) + 1}</div>
          )}
        </div>

        {!item.pendingJob && item.canAct && (
          <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
            {item.nextValueLabel && <div className="text-sm font-semibold text-gray-800">{item.nextValueLabel}</div>}
            <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-gray-600 sm:grid-cols-3">
              <div>
                <span className="block text-gray-400">{t('common.cost')}</span>
                <span className="font-medium text-gray-800">{formatCash(item.previewCostCash)}</span>
              </div>
              <div>
                <span className="block text-gray-400">{t('facilities.constructionTime')}</span>
                <span className="font-medium text-gray-800">{formatGameDays(item.previewDurationGameDays)}</span>
              </div>
              <div>
                <span className="block text-gray-400">{t('facilities.estimatedCompletion')}</span>
                <span className="font-medium text-gray-800">{formatGameDate(item.previewCompleteGameDate)}</span>
              </div>
            </div>
          </div>
        )}

        {item.pendingJob && (
          <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <div className="text-sm font-medium text-yellow-800">{item.pendingSummary}</div>
            <div className="mt-1 text-xs text-yellow-700">
              {t('facilities.gameDuration')} {formatGameDays(item.pendingJob.duration_game_days)}
              {' · '}{t('common.completes')}: {formatGameDate(item.pendingJob.complete_game_date)}
            </div>
            {!item.pendingJob.complete_game_date && (
              <div className="mt-1 text-xs text-yellow-700">
                {t('facilities.realTimeRemaining')} {formatTimeRemaining(item.pendingJob.complete_at, nowMs)}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
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
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              isProcessing || !item.canAct
                ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                : 'bg-yellow-400 text-black hover:bg-yellow-300'
            }`}
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
          isProcessing={processingKey === `${selectedItem.type}:${selectedItem.id}`}
          onClose={onCloseDetails}
          onAction={onFacilityAction}
          nowMs={nowMs}
        />
      )}
    </>
  )
}