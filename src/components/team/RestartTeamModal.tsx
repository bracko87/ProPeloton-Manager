import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'

type RestartTeamModalProps = {
  isOpen: boolean
  onClose: () => void
  redirectTo?: string
}

function clearCachedClubContext(): void {
  try {
    window.localStorage.removeItem('ppm-active-club')
    window.sessionStorage.removeItem('clubId')
    window.sessionStorage.removeItem('selectedClubId')
    window.localStorage.removeItem('clubId')
    window.localStorage.removeItem('selectedClubId')
  } catch {
    // Ignore storage cleanup errors
  }
}

function saveRestartSuccessMessage(data: unknown): void {
  try {
    window.sessionStorage.setItem(
      'ppm-team-restart-success',
      JSON.stringify({
        shown: false,
        restartedAt: Date.now(),
        data,
      }),
    )
  } catch {
    // Ignore session storage errors
  }
}

export default function RestartTeamModal({
  isOpen,
  onClose,
  redirectTo = '/dashboard/overview',
}: RestartTeamModalProps): JSX.Element | null {
  const navigate = useNavigate()
  const { t } = useTranslation('appShell')

  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isRestarting, setIsRestarting] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !isRestarting) {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, isRestarting])

  useEffect(() => {
    if (!isOpen) {
      setConfirmText('')
      setError(null)
      setIsRestarting(false)
    }
  }, [isOpen])

  function handleClose(): void {
    if (isRestarting) return
    setConfirmText('')
    setError(null)
    onClose()
  }

  async function confirmRestartTeam(): Promise<void> {
    if (isRestarting) return

    if (confirmText.trim() !== 'RESTART') {
      setError(t('restartModal.confirmExact'))
      return
    }

    setError(null)
    setIsRestarting(true)

    try {
      const { data, error: rpcError } = await supabase.rpc('restart_my_team_v1', {
        p_confirm: 'RESTART',
      })

      if (rpcError) {
        console.error('Failed to restart team', rpcError)
        setError(t('restartModal.failed'))
        setIsRestarting(false)
        return
      }

      clearCachedClubContext()
      saveRestartSuccessMessage(data)

      window.dispatchEvent(new CustomEvent('club-updated', { detail: data }))
      window.dispatchEvent(new CustomEvent('team-restarted', { detail: data }))

      onClose()

      /**
       * Use React Router navigation first.
       * This avoids the blank/stuck external host page caused by direct browser URL navigation.
       */
      navigate(redirectTo, { replace: true })

      /**
       * Light fallback: refresh the current in-app route after React Router changes page.
       * This makes getMyClubContext/get_club_access_status reload cleanly after liquidation restart.
       */
      window.setTimeout(() => {
        window.location.reload()
      }, 150)
    } catch (e: any) {
      console.error('Unexpected restart team error', e)
      setError(t('restartModal.unexpected'))
      setIsRestarting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restart-team-modal-title"
    >
      <button
        type="button"
        aria-label={t('restartModal.close')}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={handleClose}
      />

      <div
        className="relative z-[96] w-full max-w-2xl overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="border-b border-amber-100 bg-amber-50 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="restart-team-modal-title" className="text-lg font-semibold text-amber-800">
                {t('restartModal.title')}
              </h3>
              <p className="mt-1 text-sm text-amber-700">
                {t('restartModal.subtitle')}
              </p>
            </div>

            <button
              type="button"
              onClick={handleClose}
              disabled={isRestarting}
              className="rounded-md px-2 py-1 text-sm text-gray-500 transition-colors hover:bg-white hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-4 text-sm text-gray-700">
            <p>
              {t('restartModal.intro')}
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="font-semibold text-gray-900">{t('restartModal.keep')}</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>{t('restartModal.keepAccount')}</li>
                  <li>{t('restartModal.keepClubId')}</li>
                  <li>{t('restartModal.keepName')}</li>
                  <li>{t('restartModal.keepLogo')}</li>
                  <li>{t('restartModal.keepJersey')}</li>
                  <li>{t('restartModal.keepCountry')}</li>
                  <li>{t('restartModal.keepCompetition')}</li>
                </ul>
              </div>

              <div>
                <div className="font-semibold text-gray-900">{t('restartModal.lose')}</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>{t('restartModal.losePoints')}</li>
                  <li>{t('restartModal.loseRanking')}</li>
                  <li>{t('restartModal.loseRiders')}</li>
                  <li>{t('restartModal.loseStaff')}</li>
                  <li>{t('restartModal.loseSponsors')}</li>
                  <li>{t('restartModal.loseEquipment')}</li>
                  <li>{t('restartModal.loseInfrastructure')}</li>
                  <li>{t('restartModal.loseGameplay')}</li>
                  <li>{t('restartModal.loseNotifications')}</li>
                  <li>{t('restartModal.loseLiquidation')}</li>
                </ul>
              </div>
            </div>

            <p className="mt-4">
              {t('restartModal.after')}
            </p>
          </div>

          <label className="mt-5 block text-sm font-medium text-gray-700">
            {t('restartModal.typeConfirm')}
          </label>

          <input
            value={confirmText}
            onChange={event => {
              setConfirmText(event.target.value)
              if (error) setError(null)
            }}
            disabled={isRestarting}
            className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:cursor-not-allowed disabled:bg-gray-100"
            placeholder="RESTART"
          />

          {error ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={isRestarting}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('restartModal.cancel')}
          </button>

          <button
            type="button"
            onClick={() => {
              void confirmRestartTeam()
            }}
            disabled={isRestarting}
            className="inline-flex items-center rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRestarting ? t('restartModal.restarting') : t('restartModal.restart')}
          </button>
        </div>
      </div>
    </div>
  )
}