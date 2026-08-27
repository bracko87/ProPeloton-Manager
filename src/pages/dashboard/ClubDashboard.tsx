/**
 * ClubDashboard.tsx
 * Dashboard top-level wrapper that applies MainLayout for all in-game pages.
 *
 * This file also blocks dashboard access for liquidated clubs.
 */

import React from 'react'
import { Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import MainLayout from '../../components/layout/MainLayout'
import SeasonRolloverGate from '../../components/season/SeasonRolloverGate'
import RestartTeamModal from '../../components/team/RestartTeamModal'
import { supabase } from '../../lib/supabase'
import { getMyClubContext } from '../../lib/clubContext'

type ClubAccessStatus = {
  ok?: boolean
  code?: string
  club_id?: string
  club_name?: string
  can_play?: boolean
  is_liquidated?: boolean
  insolvency_status?: string
  emergency_rescue_count?: number
  liquidated_at?: string | null
  liquidation_reason?: string | null
  message?: string
}

function clearCachedClubContext(): void {
  try {
    sessionStorage.removeItem('clubId')
    sessionStorage.removeItem('selectedClubId')
    localStorage.removeItem('clubId')
    localStorage.removeItem('selectedClubId')
    localStorage.removeItem('ppm-active-club')
  } catch {
    // Ignore storage cleanup errors
  }
}

function navigateToHashRoute(path: string): void {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const targetUrl = `${window.location.origin}${window.location.pathname}${window.location.search}#${normalizedPath}`

  if (window.location.href === targetUrl) {
    window.location.reload()
    return
  }

  window.location.replace(targetUrl)
}

function RestartWelcomeModal({
  onClose,
}: {
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation('club')

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restart-welcome-title"
    >
      <button
        type="button"
        aria-label={t('dashboardAccess.restartWelcomeCloseAria')}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        className="relative z-[101] w-full max-w-lg overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="border-b border-emerald-100 bg-emerald-50 px-6 py-5">
          <h3
            id="restart-welcome-title"
            className="text-lg font-semibold text-emerald-800"
          >
            {t('dashboardAccess.welcomeTitle')}
          </h3>

          <p className="mt-1 text-sm text-emerald-700">
            {t('dashboardAccess.welcomeSubtitle')}
          </p>
        </div>

        <div className="px-6 py-5 text-sm leading-6 text-gray-700">
          <p>{t('dashboardAccess.welcomeBodyOne')}</p>

          <p className="mt-3">{t('dashboardAccess.welcomeBodyTwo')}</p>

          <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-yellow-900">
            {t('dashboardAccess.welcomeGoodLuck')}
          </div>
        </div>

        <div className="flex justify-end border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {t('dashboardAccess.continueDashboard')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ClubLiquidatedScreen({
  status,
}: {
  status: ClubAccessStatus
}): JSX.Element {
  const { t } = useTranslation('club')
  const [isRestartModalOpen, setIsRestartModalOpen] = React.useState(false)

  return (
    <>
      <div className="w-full p-6">
        <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold uppercase tracking-wide text-red-600">
            {t('dashboardAccess.liquidatedLabel')}
          </div>

          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            {t('dashboardAccess.liquidatedTitle', {
              club: status.club_name ?? t('dashboardAccess.yourClub'),
            })}
          </h1>

          <p className="mt-3 text-sm leading-6 text-gray-600">
            {t('dashboardAccess.liquidatedDescription')}
          </p>

          <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
            <div>
              <strong>{t('dashboardAccess.rescuesUsed')}</strong>{' '}
              {status.emergency_rescue_count ?? 3} / 3
            </div>

            {status.liquidation_reason && (
              <div className="mt-1">
                <strong>{t('dashboardAccess.reason')}</strong>{' '}
                {status.liquidation_reason}
              </div>
            )}

            {status.liquidated_at && (
              <div className="mt-1">
                <strong>{t('dashboardAccess.closedAt')}</strong>{' '}
                {status.liquidated_at}
              </div>
            )}
          </div>

          <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm leading-6 text-yellow-900">
            {t('dashboardAccess.liquidatedAccountNote')}
          </div>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <div className="font-semibold">
              {t('dashboardAccess.restartKeepsIdentity')}
            </div>

            <div className="mt-1">
              {t('dashboardAccess.restartKeepsIdentityDescription')}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                clearCachedClubContext()
                navigateToHashRoute('/create-club')
              }}
              className="rounded-md bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300"
            >
              {t('dashboardAccess.createNewClub')}
            </button>

            <button
              type="button"
              onClick={() => setIsRestartModalOpen(true)}
              className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              {t('dashboardAccess.restartTeam')}
            </button>
          </div>
        </div>
      </div>

      <RestartTeamModal
        isOpen={isRestartModalOpen}
        onClose={() => setIsRestartModalOpen(false)}
        redirectTo="/dashboard/overview"
      />
    </>
  )
}

function ClubAccessFailedScreen({
  message,
}: {
  message: string
}): JSX.Element {
  const { t } = useTranslation('club')

  return (
    <div className="w-full p-6">
      <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-6 shadow-sm">
        <div className="text-sm font-semibold text-red-600">
          {t('dashboardAccess.accessCheckFailed')}
        </div>

        <p className="mt-2 text-sm text-gray-600">{message}</p>
      </div>
    </div>
  )
}

/**
 * ClubDashboard
 * Wraps child dashboard routes inside MainLayout and blocks liquidated clubs.
 */
export default function ClubDashboard(): JSX.Element {
  const { t } = useTranslation('club')
  const [accessStatus, setAccessStatus] =
    React.useState<ClubAccessStatus | null>(null)

  const [loadingAccess, setLoadingAccess] = React.useState(true)
  const [showRestartWelcome, setShowRestartWelcome] = React.useState(false)

  React.useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem('ppm-team-restart-success')
      if (!raw) return

      window.sessionStorage.removeItem('ppm-team-restart-success')
      setShowRestartWelcome(true)
    } catch {
      // Ignore session storage errors
    }
  }, [])

  React.useEffect(() => {
    let alive = true

    async function loadAccessStatus() {
      try {
        setLoadingAccess(true)

        const { mainClub } = await getMyClubContext()
        const clubId = mainClub?.id ?? null

        if (!clubId) {
          if (!alive) return

          setAccessStatus({
            ok: false,
            code: 'NO_CLUB',
            can_play: false,
            message: t('dashboardAccess.noActiveClub'),
          })

          return
        }

        const { data, error } = await supabase.rpc('get_club_access_status', {
          p_club_id: clubId,
        })

        if (error) {
          throw new Error(error.message)
        }

        if (!alive) return

        setAccessStatus(data as ClubAccessStatus)
      } catch (err) {
        if (!alive) return

        setAccessStatus({
          ok: false,
          code: 'ACCESS_CHECK_FAILED',
          can_play: false,
          message:
            err instanceof Error
              ? err.message
              : t('dashboardAccess.accessStatusFailed'),
        })
      } finally {
        if (alive) {
          setLoadingAccess(false)
        }
      }
    }

    void loadAccessStatus()

    return () => {
      alive = false
    }
  }, [t])

  let content: React.ReactNode

  if (loadingAccess) {
    content = (
      <div className="w-full p-6">
        <div className="rounded-lg border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow-sm">
          {t('dashboardAccess.checkingStatus')}
        </div>
      </div>
    )
  } else if (
    accessStatus?.is_liquidated ||
    accessStatus?.insolvency_status === 'liquidated'
  ) {
    content = <ClubLiquidatedScreen status={accessStatus} />
  } else if (accessStatus?.can_play === false) {
    content = (
      <ClubAccessFailedScreen
        message={accessStatus.message ?? t('dashboardAccess.cannotPlay')}
      />
    )
  } else {
    content = <Outlet />
  }

  return (
    <SeasonRolloverGate>
      <MainLayout>
        {content}

        {showRestartWelcome && (
          <RestartWelcomeModal onClose={() => setShowRestartWelcome(false)} />
        )}
      </MainLayout>
    </SeasonRolloverGate>
  )
}
