/**
 * Preferences.tsx
 * Practical preferences page:
 * - In-game notification controls
 * - Developing Team purchase section
 * - Danger zone
 *
 * Uses shared notification preferences helper so types/keys are centralized.
 * "Shut Down Team" calls the shutdown-team Edge Function (server-side delete).
 *
 * Updated:
 * - Replaced native browser prompt/confirm/alert for shutdown flow
 *   with a custom in-page modal dialog.
 * - Shutdown now explicitly fetches the current session token and sends
 *   Authorization: Bearer <token> to the shutdown-team Edge Function.
 * - Added a user-facing guard when the session/token is missing.
 * - Added Developing Team purchase/status section wired to:
 *   - get_developing_team_status()
 *   - purchase_developing_team()
 * - Updated DevelopingTeamStatus to use the new backend shape.
 * - After successful Developing Team purchase, re-pin ppm-active-club
 *   to the MAIN club only using getMyClubContext().
 *
 * Note:
 * - The one-time repair / global protection for broken old localStorage
 *   belongs in the top-level dashboard layout, not here.
 * - This page only ensures the purchase flow does not incorrectly switch
 *   active club context to the newly created developing club.
 */

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getMyClubContext } from '@/lib/clubContext'
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

type DevelopingTeamStatus = {
  main_club_id: string | null
  main_club_name: string | null
  developing_club_id: string | null
  developing_club_name: string | null
  is_purchased: boolean
  real_days_played: number
  game_days_played: number
  time_requirement_met: boolean
  coin_balance: number
  coin_cost: number
  coin_requirement_met: boolean
  can_purchase: boolean
  movement_window_open: boolean
  current_window_label: string | null
  next_window_label: string | null
}

type MainClubContextClub = {
  id: string
  name: string
  country_code: string
  logo_path?: string | null
  primary_color?: string | null
  secondary_color?: string | null
}

type ActiveClubPayload = {
  id: string
  owner_user_id: string
  name: string
  country_code: string
  logo_path: string | null
  primary_color?: string | undefined
  secondary_color?: string | undefined
  club_type: 'main'
  updated_at_ms: number
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

  const [developingTeamStatus, setDevelopingTeamStatus] = useState<DevelopingTeamStatus | null>(null)
  const [isLoadingDevelopingTeamStatus, setIsLoadingDevelopingTeamStatus] = useState(true)
  const [developingTeamError, setDevelopingTeamError] = useState<string | null>(null)
  const [isPurchasingDevelopingTeam, setIsPurchasingDevelopingTeam] = useState(false)
  const [developingTeamSuccessMessage, setDevelopingTeamSuccessMessage] = useState<string | null>(
    null
  )

  const [isShuttingDown, setIsShuttingDown] = useState(false)
  const [isShutdownModalOpen, setIsShutdownModalOpen] = useState(false)
  const [shutdownConfirmText, setShutdownConfirmText] = useState('')
  const [shutdownError, setShutdownError] = useState<string | null>(null)

  const loadDevelopingTeamStatus = async (): Promise<void> => {
    setIsLoadingDevelopingTeamStatus(true)
    setDevelopingTeamError(null)

    try {
      const { data, error } = await supabase.rpc('get_developing_team_status')

      if (error) {
        throw error
      }

      const normalized = Array.isArray(data) ? data[0] : data
      setDevelopingTeamStatus((normalized ?? null) as DevelopingTeamStatus | null)
    } catch (e: any) {
      console.error('loadDevelopingTeamStatus failed:', e)
      setDevelopingTeamError(e?.message ?? 'Failed to load Developing Team status.')
    } finally {
      setIsLoadingDevelopingTeamStatus(false)
    }
  }

  useEffect(() => {
    void loadDevelopingTeamStatus()
  }, [])

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

  const handlePurchaseDevelopingTeam = async (): Promise<void> => {
    if (isPurchasingDevelopingTeam) return

    setDevelopingTeamError(null)
    setDevelopingTeamSuccessMessage(null)
    setIsPurchasingDevelopingTeam(true)

    try {
      const { data, error } = await supabase.rpc('purchase_developing_team')

      if (error) {
        throw error
      }

      const normalized = Array.isArray(data) ? data[0] : data

      setDevelopingTeamSuccessMessage(
        normalized?.developing_club_name
          ? `${normalized.developing_club_name} has been created successfully.`
          : 'Developing Team purchased successfully.'
      )

      /**
       * IMPORTANT:
       * After successful purchase, force the active club payload back to MAIN club.
       * Do NOT build ppm-active-club from the newly created developing club.
       */
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError) {
          throw authError
        }

        const user = authData.user ?? null
        if (user) {
          const context = (await getMyClubContext()) as { mainClub?: MainClubContextClub | null }
          const mainClub = context?.mainClub ?? null

          if (mainClub) {
            const payload: ActiveClubPayload = {
              id: mainClub.id,
              owner_user_id: user.id,
              name: mainClub.name,
              country_code: mainClub.country_code,
              logo_path: mainClub.logo_path ?? null,
              primary_color: mainClub.primary_color ?? undefined,
              secondary_color: mainClub.secondary_color ?? undefined,
              club_type: 'main',
              updated_at_ms: Date.now(),
            }

            window.localStorage.setItem('ppm-active-club', JSON.stringify(payload))
            window.dispatchEvent(new CustomEvent('club-updated', { detail: payload }))
          }
        }
      } catch (contextError) {
        console.error('Failed to re-pin active club to main club after purchase:', contextError)
      }

      await loadDevelopingTeamStatus()
    } catch (e: any) {
      console.error('purchase_developing_team failed:', e)
      setDevelopingTeamError(e?.message ?? 'Failed to purchase Developing Team.')
    } finally {
      setIsPurchasingDevelopingTeam(false)
    }
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
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token

      if (sessionError || !accessToken) {
        setShutdownError('Your session is missing. Please sign in again and retry.')
        setIsShuttingDown(false)
        return
      }

      const { error } = await supabase.functions.invoke('shutdown-team', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

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

  const realDaysProgressLabel = developingTeamStatus
    ? `${developingTeamStatus.real_days_played} / 30`
    : '—'

  const gameDaysProgressLabel = developingTeamStatus
    ? `${developingTeamStatus.game_days_played} / 60`
    : '—'

  const coinProgressLabel = developingTeamStatus
    ? `${developingTeamStatus.coin_balance} / ${developingTeamStatus.coin_cost}`
    : '—'

  const movementWindowText = developingTeamStatus
    ? developingTeamStatus.movement_window_open
      ? `Movement window open now: ${developingTeamStatus.current_window_label ?? 'Current window'}`
      : `Movement window closed. Next window: ${developingTeamStatus.next_window_label ?? 'Unknown'}`
    : 'Movement window unavailable.'

  const developingTeamButtonLabel = developingTeamStatus?.is_purchased
    ? 'Already Unlocked'
    : isPurchasingDevelopingTeam
      ? 'Purchasing...'
      : 'Purchase Developing Team'

  const developingTeamBlockedReason = !developingTeamStatus
    ? null
    : developingTeamStatus.is_purchased
      ? 'Developing Team already unlocked.'
      : !developingTeamStatus.time_requirement_met
        ? 'You must first reach 30 real-life days or 60 in-game days.'
        : !developingTeamStatus.coin_requirement_met
          ? 'You need at least 50 coins.'
          : null

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

          <section className="w-full rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold">Developing Team</h3>
            <p className="mt-1 text-xs text-gray-500">
              Unlock a U23 team for your club. This team can race normally, but it cannot be promoted
              above Continental level.
            </p>

            {isLoadingDevelopingTeamStatus ? (
              <div className="mt-4 text-sm text-gray-500">Loading Developing Team status...</div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-md border border-gray-200 p-3">
                    <div className="text-xs text-gray-500">Real-life progress</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900">
                      {realDaysProgressLabel}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">Minimum 30 days required</div>
                  </div>

                  <div className="rounded-md border border-gray-200 p-3">
                    <div className="text-xs text-gray-500">In-game progress</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900">
                      {gameDaysProgressLabel}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">Minimum 60 days required</div>
                  </div>

                  <div className="rounded-md border border-gray-200 p-3">
                    <div className="text-xs text-gray-500">Coins</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900">{coinProgressLabel}</div>
                    <div className="mt-1 text-xs text-gray-500">Cost: 50 coins</div>
                  </div>
                </div>

                <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                  {movementWindowText}
                </div>

                <div className="mt-4 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                  Requirements: 30 real-life days or 60 in-game days, plus 50 coins. Maximum roster
                  size: 8 riders. Only riders aged 23 or younger are eligible. Riders can move between
                  First Squad and Developing Team only during movement windows.
                </div>

                <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  <div className="font-medium text-gray-900">Special rules</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>The team name will be your main club name plus U23.</li>
                    <li>This team can apply to races normally.</li>
                    <li>This team cannot be promoted above Continental level.</li>
                    <li>Riders in this team are still part of the main club structure.</li>
                  </ul>
                </div>

                {developingTeamError ? (
                  <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {developingTeamError}
                  </div>
                ) : null}

                {developingTeamSuccessMessage ? (
                  <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                    {developingTeamSuccessMessage}
                  </div>
                ) : null}

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      void handlePurchaseDevelopingTeam()
                    }}
                    disabled={
                      !!developingTeamStatus?.is_purchased ||
                      !developingTeamStatus?.can_purchase ||
                      isPurchasingDevelopingTeam
                    }
                    className="inline-flex items-center rounded-md bg-yellow-400 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {developingTeamButtonLabel}
                  </button>

                  {developingTeamBlockedReason ? (
                    <div className="mt-2 text-xs text-gray-500">{developingTeamBlockedReason}</div>
                  ) : null}

                  {developingTeamStatus?.is_purchased && developingTeamStatus.developing_club_name ? (
                    <div className="mt-2 text-xs text-gray-500">
                      Unlocked: {developingTeamStatus.developing_club_name}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </section>

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
                  Reset this team back to the same starter state a brand-new user gets when creating a
                  team for the first time.
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  This is a placeholder for the future full reset logic (riders, equipment, finances,
                  etc.).
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
                  Permanently delete this user team AND the authentication account. After successful
                  deletion, you will be redirected to the homepage and may sign up again with the same
                  email.
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
                  <h3 id="shutdown-team-modal-title" className="text-lg font-semibold text-red-700">
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
                <p className="text-sm text-gray-700">You are about to permanently delete:</p>

                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  <li>Your current team</li>
                  <li>Your team riders, equipment, and team-related game data</li>
                  <li>Your authentication account for this email</li>
                </ul>

                <p className="mt-3 text-sm text-gray-700">
                  After successful deletion, you will be signed out and redirected to the homepage. You
                  may then register again with the same email address as a brand-new user.
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