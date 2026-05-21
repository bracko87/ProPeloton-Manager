/**
 * FacilitiesSection.tsx
 *
 * Facilities tab UI for the Infrastructure dashboard.
 * Contains:
 * - ActiveJobsPanel: shows active facility jobs and cancellation quotes.
 * - FacilityDetailsModal: rich detail view for a single facility.
 * - InfrastructureCard: summary card for each facility.
 * - FacilitiesSection: thin wrapper that composes these pieces together.
 */

import React from 'react'
import type {
  ActiveJobView,
  FacilityJobCapacityRow,
  InfrastructureCancellationQuoteRow,
  InfrastructureItem,
} from './infrastructureTypes'
import {
  formatCash,
  formatGameDate,
  formatGameDays,
  formatTimeRemaining,
  toNumber,
} from './infrastructureUtils'

/**
 * ActiveJobsPanel
 * Minimal full-width panel showing currently active infrastructure jobs
 * with optional cancellation quotes and actions.
 */
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
  if (jobs.length === 0) {
    return (
      <div className="mb-5 rounded-xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-gray-500">Active Jobs</div>
            <div className="text-base font-semibold text-gray-900 mt-1">
              No facility construction jobs in progress
            </div>

            {facilityCapacity && (
              <div className="text-xs text-gray-500 mt-1">
                Facility construction slots: {facilityCapacity.active_facility_jobs} /{' '}
                {facilityCapacity.max_active_facility_jobs} active ·{' '}
                {facilityCapacity.open_facility_job_slots} open
              </div>
            )}
          </div>

          <div className="text-sm text-gray-400">All clear</div>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-5 rounded-xl bg-white border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-sm text-gray-500">Active Jobs</div>
          <div className="text-base font-semibold text-gray-900 mt-1">
            {jobs.length} infrastructure {jobs.length === 1 ? 'job' : 'jobs'} in progress
          </div>

          {facilityCapacity && (
            <div className="text-xs text-gray-500 mt-1">
              Facility construction slots: {facilityCapacity.active_facility_jobs} /{' '}
              {facilityCapacity.max_active_facility_jobs} active ·{' '}
              {facilityCapacity.open_facility_job_slots} open
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {jobs.map(job => {
          const quote = cancellationQuotesByJobId[job.id]
          const isCancelling = processingKey === `cancel:${job.id}`

          return (
            <div key={job.id} className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-yellow-900">{job.name}</div>
                  <div className="text-sm text-yellow-800 mt-1">{job.summary}</div>
                </div>

                <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 font-medium">
                  {job.type === 'facility_upgrade' ? 'Upgrade' : 'Delivery'}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-yellow-800">
                <span>Game duration: {formatGameDays(job.durationGameDays)}</span>
                <span>Completes: {formatGameDate(job.completeGameDate)}</span>
                <span>Paid: {formatCash(job.costCash)}</span>
              </div>

              {!job.completeGameDate && (
                <div className="mt-2 text-xs text-yellow-700">
                  Real-time remaining: {formatTimeRemaining(job.completeAt, nowMs)}
                </div>
              )}

              {quote && (
                <div className="mt-3 rounded-lg border border-yellow-200 bg-white/70 p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-yellow-900">
                    <div>
                      <span className="block text-yellow-700">Refund now</span>
                      <span className="font-semibold">{formatCash(quote.refund_cash)}</span>
                    </div>

                    <div>
                      <span className="block text-yellow-700">Refund percent</span>
                      <span className="font-semibold">
                        {toNumber(quote.refund_percent, 0).toFixed(2)}%
                      </span>
                    </div>

                    <div>
                      <span className="block text-yellow-700">Cancellation cost</span>
                      <span className="font-semibold">
                        {formatCash(quote.cancellation_cost_cash)}
                      </span>
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
                  className={`px-3 py-2 rounded-md text-xs font-semibold transition ${
                    isCancelling || (quote ? !quote.can_cancel : false)
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-red-100 text-red-700 hover:bg-red-200'
                  }`}
                >
                  {isCancelling ? 'Cancelling...' : 'Cancel Job'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * FacilityDetailsModal
 * Full-screen modal with detailed information and upgrade preview for a facility.
 */
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
  const isDisabled = isProcessing || !item.canAct

  const buttonClasses = isDisabled
    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
    : 'bg-yellow-400 hover:bg-yellow-300 text-black'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close infrastructure details"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      <div className="relative z-10 w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-gray-100">
        <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Infrastructure Details
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mt-1">{item.name}</h3>
            <p className="text-sm text-gray-500 mt-1">{item.description}</p>

            {item.longDescription && (
              <p className="text-sm text-gray-500 mt-2 leading-6">{item.longDescription}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1">
            <div className="aspect-[4/3] rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-center p-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-600">Image placeholder</div>
                    <div className="text-xs text-gray-400 mt-1">
                      Add {item.name} image here later.
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-sm text-gray-500">Current status</div>
              <div className="text-lg font-semibold text-gray-900 mt-1">{item.valueLabel}</div>
              <div className="mt-2 text-xs text-gray-500">
                Status: <span className="font-medium text-gray-700">{item.badgeLabel}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {item.impactLines && item.impactLines.length > 0 && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <div className="text-sm font-semibold text-blue-900">
                  Current connected impact
                </div>
                <div className="mt-2 space-y-1">
                  {item.impactLines.map((line, index) => (
                    <div
                      key={`${item.id}:modal-impact:${index}`}
                      className="text-sm text-blue-800"
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!item.pendingJob && item.nextValueLabel && (
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-gray-900">Next level</div>

                <div className="mt-2 text-sm text-gray-700">{item.nextValueLabel}</div>

                {item.unlockSummary && (
                  <div className="mt-3 text-sm text-gray-700">
                    <span className="font-semibold">Unlock:</span> {item.unlockSummary}
                  </div>
                )}

                {item.effectSummary && (
                  <div className="mt-2 text-sm text-gray-700">
                    <span className="font-semibold">Effect:</span> {item.effectSummary}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                    <div className="text-xs text-gray-400">Cost</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">
                      {formatCash(item.previewCostCash)}
                    </div>
                  </div>

                  <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                    <div className="text-xs text-gray-400">Construction time</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">
                      {formatGameDays(item.previewDurationGameDays)}
                    </div>
                  </div>

                  <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                    <div className="text-xs text-gray-400">Estimated completion</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">
                      {formatGameDate(item.previewCompleteGameDate)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {item.pendingJob && (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                <div className="text-sm font-semibold text-yellow-900">Job in progress</div>
                <div className="mt-2 text-sm text-yellow-800">{item.pendingSummary}</div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-yellow-800">
                  <div>
                    <span className="block text-yellow-700">Duration</span>
                    <span className="font-semibold">
                      {formatGameDays(item.pendingJob.duration_game_days)}
                    </span>
                  </div>

                  <div>
                    <span className="block text-yellow-700">Completes</span>
                    <span className="font-semibold">
                      {formatGameDate(item.pendingJob.complete_game_date)}
                    </span>
                  </div>

                  <div>
                    <span className="block text-yellow-700">Cost paid</span>
                    <span className="font-semibold">
                      {formatCash(item.pendingJob.cost_cash)}
                    </span>
                  </div>
                </div>

                {!item.pendingJob.complete_game_date && (
                  <div className="mt-2 text-xs text-yellow-700">
                    Real-time fallback remaining:{' '}
                    {formatTimeRemaining(item.pendingJob.complete_at, nowMs)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-400">
            {item.pendingJob
              ? 'This facility is locked while construction is in progress.'
              : item.canAct
                ? 'Construction cost is charged immediately when the job starts.'
                : 'No upgrade is currently available.'}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => onAction(item)}
              disabled={isDisabled}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${buttonClasses}`}
            >
              {isProcessing ? 'Starting...' : item.actionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * InfrastructureCard
 * Compact facility card used in the grid for the Facilities tab.
 */
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
  const badgeClasses = item.pendingJob
    ? 'bg-yellow-100 text-yellow-700'
    : item.owned
      ? 'bg-green-100 text-green-700'
      : 'bg-gray-100 text-gray-600'

  const isDisabled = isProcessing || !item.canAct

  const buttonClasses = isDisabled
    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
    : 'bg-yellow-400 hover:bg-yellow-300 text-black'

  return (
    <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-base text-gray-900">{item.name}</h3>
          <p className="text-sm text-gray-500 mt-1">{item.description}</p>

          {item.longDescription && (
            <p className="text-sm text-gray-500 mt-2 leading-6">{item.longDescription}</p>
          )}
        </div>

        <span className={`text-xs px-2 py-1 rounded-full font-medium ${badgeClasses}`}>
          {item.badgeLabel}
        </span>
      </div>

      <div className="mt-4 text-sm text-gray-500">{item.valueLabel}</div>

      {!item.pendingJob && item.canAct && (
        <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
          {item.nextValueLabel && (
            <div className="text-sm font-semibold text-gray-800">{item.nextValueLabel}</div>
          )}

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-600">
            <div>
              <span className="block text-gray-400">Cost</span>
              <span className="font-medium text-gray-800">
                {formatCash(item.previewCostCash)}
              </span>
            </div>

            <div>
              <span className="block text-gray-400">Construction time</span>
              <span className="font-medium text-gray-800">
                {formatGameDays(item.previewDurationGameDays)}
              </span>
            </div>

            <div>
              <span className="block text-gray-400">Estimated completion</span>
              <span className="font-medium text-gray-800">
                {formatGameDate(item.previewCompleteGameDate)}
              </span>
            </div>
          </div>
        </div>
      )}

      {item.pendingJob && (
        <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
          <div className="text-sm font-medium text-yellow-800">{item.pendingSummary}</div>

          <div className="text-xs text-yellow-700 mt-1">
            Game duration: {formatGameDays(item.pendingJob.duration_game_days)}
          </div>

          <div className="text-xs text-yellow-700 mt-1">
            Completes: {formatGameDate(item.pendingJob.complete_game_date)}
          </div>

          <div className="text-xs text-yellow-700 mt-1">
            Cost paid: {formatCash(item.pendingJob.cost_cash)}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onDetails(item)}
          className="px-4 py-2 rounded-md text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition"
        >
          Details
        </button>

        <button
          type="button"
          onClick={() => onAction(item)}
          disabled={isDisabled}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${buttonClasses}`}
        >
          {isProcessing ? 'Starting...' : item.actionLabel}
        </button>
      </div>
    </div>
  )
}

/**
 * FacilitiesSection
 * Wrapper that renders active jobs, facility cards, and the facility details modal.
 */
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
        jobs={activeJobs.filter(job => job.type === 'facility_upgrade')}
        nowMs={nowMs}
        facilityCapacity={facilityCapacity}
        cancellationQuotesByJobId={cancellationQuotesByJobId}
        processingKey={processingKey}
        onCancelJob={onCancelJob}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
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

      {selectedItem && (
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
