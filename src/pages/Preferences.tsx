/**
 * Preferences.tsx
 * Practical preferences page:
 * - In-game notification controls
 * - Danger zone
 */

import React, { useEffect, useState } from 'react'

type NotificationSettings = {
  raceInvitations: boolean
  raceApplicationResults: boolean
  transferUpdates: boolean
  teamUpdates: boolean
  financeAlerts: boolean
}

type StoredPreferences = {
  notifications: NotificationSettings
}

type ToggleRowProps = {
  title: string
  description: string
  checked: boolean
  onToggle: () => void
}

const STORAGE_KEY = 'pro-peloton-preferences'

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  raceInvitations: true,
  raceApplicationResults: true,
  transferUpdates: true,
  teamUpdates: true,
  financeAlerts: true,
}

function readStoredPreferences(): Partial<StoredPreferences> | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    return JSON.parse(raw) as Partial<StoredPreferences>
  } catch {
    return null
  }
}

function ToggleRow({
  title,
  description,
  checked,
  onToggle,
}: ToggleRowProps): JSX.Element {
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
  const [notifications, setNotifications] = useState<NotificationSettings>(() => {
    const stored = readStoredPreferences()

    return {
      ...DEFAULT_NOTIFICATIONS,
      ...(stored?.notifications ?? {}),
    }
  })

  useEffect(() => {
    try {
      const payload: StoredPreferences = {
        notifications,
      }

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Ignore local storage write errors
    }
  }, [notifications])

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
    // This should restore the current team to the same starting state
    // that a brand-new user gets when creating a team for the first time.

    window.alert('Restart Team button is ready. Connect it to the backend reset flow.')
  }

  const handleShutdownTeam = (): void => {
    const confirmed = window.confirm(
      'Shut Down Team will permanently delete this team and all of its data. This is a UI placeholder for now. Continue?'
    )

    if (!confirmed) return

    // TODO:
    // Connect this button to your backend delete logic.
    // After successful deletion, redirect the user to the homepage.
    // Example:
    // window.location.assign('/')

    window.alert('Shut Down Team button is ready. Connect it to the backend delete flow.')
  }

  return (
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
              These toggles should control which notifications are shown to the user inside the game UI.
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
                Permanently delete this user team and all of its related team data. After successful deletion,
                the user should be redirected to the homepage and can sign in again with the same email.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                This should delete only the current user team data, not other users or other teams.
              </p>

              <button
                type="button"
                onClick={handleShutdownTeam}
                className="mt-4 inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
              >
                Shut Down Team
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
  )
}