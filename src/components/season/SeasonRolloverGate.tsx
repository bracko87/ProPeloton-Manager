import React from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

type SeasonRolloverGameState = {
  season: number
  month: number
  day: number
  hour: number
  minute: number
  paused: boolean
}

type SeasonRolloverStatus = {
  active: boolean
  phase: string | null
  source_season: number | null
  target_season: number | null
  run_id: string | null
  game: SeasonRolloverGameState | null
  started_at: string | null
  updated_at: string | null
  delayed: boolean
}

type SeasonRolloverGateProps = {
  children: React.ReactNode
}

const POLL_INTERVAL_MS = 20_000

function phaseTranslationKey(phase: string | null): string {
  switch (phase) {
    case 'source_frozen':
      return 'rollover.phases.sourceFrozen'
    case 'core_validated':
      return 'rollover.phases.coreValidated'
    case 'rewards_applied':
      return 'rollover.phases.rewardsApplied'
    case 'communication_done':
      return 'rollover.phases.communicationDone'
    case 'completed':
      return 'rollover.phases.finalizing'
    case 'starting':
    default:
      return 'rollover.phases.starting'
  }
}

function SeasonRolloverLoadingScreen({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className="h-9 w-9 animate-spin rounded-full border-2 border-yellow-400/30 border-t-yellow-400"
          aria-hidden="true"
        />
        <p className="text-sm text-slate-300">{label}</p>
      </div>
    </div>
  )
}

function SeasonRolloverStatusError({
  checking,
  onRetry,
}: {
  checking: boolean
  onRetry: () => void
}): JSX.Element {
  const { t } = useTranslation('appShell')

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-slate-100">
      <div className="w-full max-w-xl rounded-2xl border border-amber-400/20 bg-slate-900 p-7 text-center shadow-2xl shadow-black/30">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/10 text-xl text-amber-300">
          !
        </div>
        <h1 className="mt-5 text-xl font-semibold text-white">
          {t('rollover.statusCheckFailedTitle')}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {t('rollover.statusCheckFailedBody')}
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={checking}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {checking ? t('rollover.checking') : t('rollover.checkAgain')}
        </button>
      </div>
    </div>
  )
}

function SeasonRolloverScreen({
  status,
  checking,
  onRetry,
}: {
  status: SeasonRolloverStatus
  checking: boolean
  onRetry: () => void
}): JSX.Element {
  const { t } = useTranslation('appShell')
  const targetSeason = status.target_season ?? status.game?.season ?? 2
  const phaseLabel = t(phaseTranslationKey(status.phase))

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-5 py-12 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-14rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-yellow-400/10 blur-3xl" />
        <div className="absolute bottom-[-16rem] right-[-8rem] h-[32rem] w-[32rem] rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <main className="relative z-10 w-full max-w-2xl">
        <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-7 shadow-2xl shadow-black/40 backdrop-blur md:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-full border border-yellow-300/20 bg-yellow-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-yellow-300">
              {t('rollover.eyebrow')}
            </span>
            <span className="text-xs font-medium text-slate-400">
              {t('rollover.targetSeason', { season: targetSeason })}
            </span>
          </div>

          <div className="mt-7 flex items-start gap-4">
            <div
              className="mt-1 h-11 w-11 shrink-0 animate-spin rounded-full border-[3px] border-yellow-400/20 border-t-yellow-400"
              aria-hidden="true"
            />
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
                {t('rollover.title', { season: targetSeason })}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-300 md:text-base">
                {t('rollover.body')}
              </p>
            </div>
          </div>

          <div className="mt-7 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('rollover.currentPhase')}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-100">
                {phaseLabel}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('rollover.gameClock')}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-100">
                {t('rollover.frozenAtMidnight')}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-sky-400/15 bg-sky-400/5 p-4 text-sm leading-6 text-sky-100">
            {t('rollover.noAction')}
          </div>

          {status.delayed && (
            <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
              <div className="text-sm font-semibold text-amber-200">
                {t('rollover.delayedTitle')}
              </div>
              <p className="mt-1 text-sm leading-6 text-amber-100/80">
                {t('rollover.delayedBody')}
              </p>
            </div>
          )}

          <div className="mt-7 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-slate-500">
              {t('rollover.autoCheck')}
            </p>

            <div className="flex flex-wrap gap-2">
              <a
                href="#/"
                className="inline-flex items-center justify-center rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
              >
                {t('rollover.homepage')}
              </a>
              <button
                type="button"
                onClick={onRetry}
                disabled={checking}
                className="inline-flex items-center justify-center rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {checking ? t('rollover.checking') : t('rollover.checkAgain')}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function SeasonRolloverGate({
  children,
}: SeasonRolloverGateProps): JSX.Element {
  const { t } = useTranslation('appShell')
  const [status, setStatus] = React.useState<SeasonRolloverStatus | null>(null)
  const [checking, setChecking] = React.useState(true)
  const [statusError, setStatusError] = React.useState(false)
  const wasActiveRef = React.useRef(false)

  const loadStatus = React.useCallback(async () => {
    setChecking(true)

    try {
      const { data, error } = await supabase.rpc('get_season_rollover_status_v1')

      if (error) {
        throw new Error(error.message)
      }

      const nextStatus = data as SeasonRolloverStatus
      setStatus(nextStatus)
      setStatusError(false)
    } catch (error) {
      console.error('Failed to load season rollover status:', error)
      setStatusError(true)
    } finally {
      setChecking(false)
    }
  }, [])

  React.useEffect(() => {
    void loadStatus()

    const intervalId = window.setInterval(() => {
      void loadStatus()
    }, POLL_INTERVAL_MS)

    const handleFocus = () => {
      void loadStatus()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadStatus()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadStatus])

  React.useEffect(() => {
    const isActive = Boolean(status?.active)

    if (wasActiveRef.current && !isActive && status) {
      window.location.reload()
      return
    }

    wasActiveRef.current = isActive
  }, [status])

  if (checking && !status) {
    return <SeasonRolloverLoadingScreen label={t('rollover.checkingStatus')} />
  }

  if (statusError && !status) {
    return <SeasonRolloverStatusError checking={checking} onRetry={() => void loadStatus()} />
  }

  if (status?.active) {
    return (
      <SeasonRolloverScreen
        status={status}
        checking={checking}
        onRetry={() => void loadStatus()}
      />
    )
  }

  return <>{children}</>
}
