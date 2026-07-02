/**
 * ClubDashboard.tsx
 * Dashboard top-level wrapper that applies MainLayout for all in-game pages.
 *
 * This file also blocks dashboard access for liquidated clubs.
 */

import React from 'react'
import { Outlet } from 'react-router'
import MainLayout from '../../components/layout/MainLayout'
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
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restart-welcome-title"
    >
      <button
        type="button"
        aria-label="Close restart welcome"
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
            Welcome back to your restarted team
          </h3>

          <p className="mt-1 text-sm text-emerald-700">
            Your club has been given a fresh start.
          </p>
        </div>

        <div className="px-6 py-5 text-sm leading-6 text-gray-700">
          <p>
            Your team is active again with a new starter squad, starter
            equipment, starter finances, and 0 season points.
          </p>

          <p className="mt-3">
            Your club name, logo, jersey, country, and competition slot have
            been preserved. The old riders were released as free agents, and the
            club is ready for a new beginning.
          </p>

          <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-yellow-900">
            Good luck this time. Build carefully, manage the budget, and bring
            your club back stronger.
          </div>
        </div>

        <div className="flex justify-end border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Continue to dashboard
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
  const [isRestartModalOpen, setIsRestartModalOpen] = React.useState(false)

  return (
    <>
      <div className="w-full p-6">
        <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold uppercase tracking-wide text-red-600">
            Club Liquidated
          </div>

          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            {status.club_name ?? 'Your club'} has been liquidated
          </h1>

          <p className="mt-3 text-sm leading-6 text-gray-600">
            This club used all 3 lifetime emergency rescues and then failed to
            cover another mandatory obligation. No further emergency loans are
            available, and this team can no longer perform game actions.
          </p>

          <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
            <div>
              <strong>Rescues used:</strong>{' '}
              {status.emergency_rescue_count ?? 3} / 3
            </div>

            {status.liquidation_reason && (
              <div className="mt-1">
                <strong>Reason:</strong> {status.liquidation_reason}
              </div>
            )}

            {status.liquidated_at && (
              <div className="mt-1">
                <strong>Closed at:</strong> {status.liquidated_at}
              </div>
            )}
          </div>

          <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm leading-6 text-yellow-900">
            Your user account and coins are still active. Only this club is
            closed. You can create a completely new club in the next available
            free spot, or restart this team in the same competition slot with a
            fresh squad, no staff, and 0 points.
          </div>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <div className="font-semibold">
              Restart Team keeps your club identity.
            </div>

            <div className="mt-1">
              Your club ID, owner account, team name, logo, jersey, country, and
              tier/division slot stay the same. Current riders are released to
              the free-agent market, all season points are reset to 0, and the
              club receives a new starter squad based on its current competition
              tier.
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
              Create new club
            </button>

            <button
              type="button"
              onClick={() => setIsRestartModalOpen(true)}
              className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              Restart team
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
  return (
    <div className="w-full p-6">
      <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-6 shadow-sm">
        <div className="text-sm font-semibold text-red-600">
          Could not check club access
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
            message: 'No active club was found for this account.',
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
              : 'Could not check club access status.',
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
  }, [])

  let content: React.ReactNode

  if (loadingAccess) {
    content = (
      <div className="w-full p-6">
        <div className="rounded-lg border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Checking club status...
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
        message={accessStatus.message ?? 'This club cannot be played right now.'}
      />
    )
  } else {
    content = <Outlet />
  }

  return (
    <MainLayout>
      {content}

      {showRestartWelcome && (
        <RestartWelcomeModal onClose={() => setShowRestartWelcome(false)} />
      )}
    </MainLayout>
  )
}