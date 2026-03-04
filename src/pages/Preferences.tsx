/**
 * Preferences.tsx
 * Practical preferences page:
 * - In-game notification controls
 * - Danger zone
 *
 * Uses shared notification preferences helper so types/keys are centralized.
 * "Shut Down Team" calls the shutdown-team Edge Function (server-side delete).
 *
 * Updated:
 * - Replaced native browser prompt/confirm/alert for shutdown flow
 *   with a custom in-page modal dialog.
 */

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  NotificationSettings,
  PREFERENCES_STORAGE_KEY,
  readNotificationPreferences,
} from '@/lib/notificationPreferences'

type StoredPreferences = {
  notifications: NotificationSettings
}

type ToggleRowProps = {
  title: string
  description: string
  checked: boolean
  onToggle: () => void
}

function ToggleRow({ title, description, checked, onToggle }: ToggleRowProps): JSX.Element {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900">{title}</div>
        <div className="mt-1 text-xs text-gray-500">{description}</div>
      </div>

      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300"
      />
    </label>
  )
}

export default function PreferencesPage(): JSX.Element {
  const [notifications, setNotifications] = useState<NotificationSettings>(() =>
    readNotificationPreferences()
  )

  const [isShuttingDown, setIsShuttingDown] = useState(false)
  const [isShutdownModalOpen, setIsShutdownModalOpen] = useState(false)
  const [shutdownConfirmText, setShutdownConfirmText] = useState('')
  const [shutdownError, setShutdownError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const payload: StoredPreferences = { notifications }
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Ignore local storage write errors
    }
  }, [notifications])

  useEffect(() => {
    if (!isShutdownModalOpen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !isShuttingDown) {
        closeShutdownModal()
      }
    }

    document.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isShutdownModalOpen, isShuttingDown])

  const toggleNotification = (key: keyof NotificationSettings): void => {
    setNotifications(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleRestartTeam = (): void => {
    const confirmed = window.confirm(
      'Restart Team will reset this team back to a fresh starter state. This is a UI placeholder for now. Continue?'
    )

    if (!confirmed) return

    // TODO:
    // Connect this button to your backend reset logic.
    window.alert('Restart Team button is ready. Connect it to the backend reset flow.')
  }

  const openShutdownModal = (): void => {
    if (isShuttingDown) return
    setShutdownConfirmText('')
    setShutdownError(null)
    setIsShutdownModalOpen(true)
  }

  const closeShutdownModal = (): void => {
    if (isShuttingDown) return
    setIsShutdownModalOpen(false)
    setShutdownConfirmText('')
    setShutdownError(null)
  }

  const confirmShutdownTeam = async (): Promise<void> => {
    if (isShuttingDown) return

    if (shutdownConfirmText.trim() !== 'DELETE') {
      setShutdownError('You must type DELETE exactly to confirm this action.')
      return
    }

    setShutdownError(null)
    setIsShuttingDown(true)

    try {
      const { error } = await supabase.functions.invoke('shutdown-team')

      if (error) {
        console.error('shutdown-team failed:', error)
        setShutdownError(error.message || 'Failed to shut down team.')
        setIsShuttingDown(false)
        return
      }

      try {
        await supabase.auth.signOut()
      } catch {
        // Ignore sign-out errors if auth user was already deleted
      }

      window.location.assign('/')
    } catch (e) {
      console.error('shutdown-team unexpected error:', e)
      setShutdownError('Failed to shut down team due to an unexpected error.')
      setIsShuttingDown(false)
    }
  }

  return (
    <>
      <div className="w-full h-full min-h-[calc(100vh-10rem)] text-gray-900">
        <div className="flex h-full flex-col gap-6">
          <div>
            <h2 className="text-xl font-semibold">Preferences</h2>
            <p className="mt-1 text-sm text-gray-500">
              Real usable settings: in-game notification control and team danger-zone actions.
            </p>
          </div>

          <div>
            <section className="w-full rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">In-Game Notifications</h3>
              <p className="mt-1 text-xs text-gray-500">
                These toggles control which notifications are shown to the user inside the game UI.
              </p>

              <div className="mt-4 divide-y divide-gray-100">
                <ToggleRow
                  title="Race invitations"
                  description="Show notifications when your team receives a race invitation."
                  checked={notifications.raceInvitations}
                  onToggle={() => toggleNotification('raceInvitations')}
                />

                <ToggleRow
                  title="Race application results"
                  description="Show notifications when your team is accepted or declined for a race."
                  checked={notifications.raceApplicationResults}
                  onToggle={() => toggleNotification('raceApplicationResults')}
                />

                <ToggleRow
                  title="Transfer updates"
                  description="Show notifications for transfer offers, negotiations, and transfer activity."
                  checked={notifications.transferUpdates}
                  onToggle={() => toggleNotification('transferUpdates')}
                />

                <ToggleRow
                  title="Team updates"
                  description="Show notifications related to important team events and internal team changes."
                  checked={notifications.teamUpdates}
                  onToggle={() => toggleNotification('teamUpdates')}
                />

                <ToggleRow
                  title="Finance alerts"
                  description="Show notifications for important budget, cost, or income related updates."
                  checked={notifications.financeAlerts}
                  onToggle={() => toggleNotification('financeAlerts')}
                />
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-red-200 bg-red-50 p-5 shadow-sm">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-base font-semibold text-red-700">Danger Zone</h3>
                <p className="mt-1 text-sm text-red-600">
                  These are destructive actions and should stay separated from normal preferences.
                </p>
              </div>

              <div className="text-xs font-semibold uppercase tracking-wide text-red-600">
                High-impact actions
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-md border border-amber-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-gray-900">Restart Team</h4>
                <p className="mt-2 text-sm text-gray-600">
                  Reset this team back to the same starter state a brand-new user gets when creating a team
                  for the first time.
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  This is a placeholder for the future full reset logic (riders, equipment, finances, etc.).
                </p>

                <button
                  type="button"
                  onClick={handleRestartTeam}
                  className="mt-4 inline-flex items-center rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                >
                  Restart Team
                </button>
              </div>

              <div className="rounded-md border border-red-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-gray-900">Shut Down Team</h4>
                <p className="mt-2 text-sm text-gray-600">
                  Permanently delete this user team AND the authentication account. After successful deletion,
                  you will be redirected to the homepage and may sign up again with the same email.
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  This should delete only the current user’s team data, not other users or other teams.
                </p>

                <button
                  type="button"
                  onClick={openShutdownModal}
                  disabled={isShuttingDown}
                  className="mt-4 inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
                >
                  {isShuttingDown ? 'Shutting down...' : 'Shut Down Team'}
                </button>
              </div>
            </div>
          </section>

          <div className="text-xs text-gray-500">
            The notification system should check these saved preferences before creating or showing each
            notification type.
          </div>
        </div>
      </div>

      {isShutdownModalOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shutdown-team-modal-title"
        >
          <button
            type="button"
            aria-label="Close shutdown team confirmation"
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={closeShutdownModal}
          />

          <div
            className="relative z-[91] w-full max-w-xl overflow-hidden rounded-2xl border border-red-200 bg-white shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="border-b border-red-100 bg-red-50 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3
                    id="shutdown-team-modal-title"
                    className="text-lg font-semibold text-red-700"
                  >
                    Confirm Team Shutdown
                  </h3>
                  <p className="mt-1 text-sm text-red-600">
                    This action is permanent and cannot be undone.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeShutdownModal}
                  disabled={isShuttingDown}
                  className="rounded-md px-2 py-1 text-sm text-gray-500 transition-colors hover:bg-white hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="rounded-lg border border-red-100 bg-red-50/50 p-4">
                <p className="text-sm text-gray-700">
                  You are about to permanently delete:
                </p>

                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  <li>Your current team</li>
                  <li>Your team riders, equipment, and team-related game data</li>
                  <li>Your authentication account for this email</li>
                </ul>

                <p className="mt-3 text-sm text-gray-700">
                  After successful deletion, you will be signed out and redirected to the homepage.
                  You may then register again with the same email address as a brand-new user.
                </p>
              </div>

              <div className="mt-5">
                <label
                  htmlFor="shutdown-confirm-input"
                  className="block text-sm font-medium text-gray-900"
                >
                  Type <span className="font-bold text-red-700">DELETE</span> to confirm
                </label>

                <input
                  id="shutdown-confirm-input"
                  type="text"
                  value={shutdownConfirmText}
                  onChange={event => {
                    setShutdownConfirmText(event.target.value)
                    if (shutdownError) {
                      setShutdownError(null)
                    }
                  }}
                  disabled={isShuttingDown}
                  autoFocus
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:bg-gray-100"
                  placeholder="Type DELETE here"
                />
              </div>

              {shutdownError ? (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {shutdownError}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={closeShutdownModal}
                disabled={isShuttingDown}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  void confirmShutdownTeam()
                }}
                disabled={isShuttingDown}
                className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isShuttingDown ? 'Shutting down...' : 'Permanently Shut Down Team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}