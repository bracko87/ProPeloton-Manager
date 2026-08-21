/**
 * Preferences.tsx
 * Practical preferences page:
 * - In-game notification controls
 * - Developing Team seasonal access management
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
 * - Developing Team seasonal access is wired to:
 *   - get_developing_team_status()
 *   - activate_developing_team_for_season_v1()
 *   - set_developing_team_auto_renew_v1()
 * - After successful first-time Developing Team activation, re-pin ppm-active-club
 *   to the MAIN club only using getMyClubContext().
 * - Restart Team now opens the shared RestartTeamModal and calls
 *   public.restart_my_team_v1 through that modal.
 *
 * Note:
 * - The one-time repair / global protection for broken old localStorage
 *   belongs in the top-level dashboard layout, not here.
 * - This page only ensures the activation flow does not incorrectly switch
 *   active club context to the newly created developing club.
 */

import React, { useEffect, useState } from 'react'
import RestartTeamModal from '@/components/team/RestartTeamModal'
import { supabase } from '@/lib/supabase'
import { getMyClubContext } from '@/lib/clubContext'
import {
  NotificationPreferenceGroup,
  NotificationSettings,
  NOTIFICATION_PREFERENCE_GROUP_ORDER,
  NOTIFICATION_PREFERENCE_GROUPS,
  NOTIFICATION_PREFERENCE_SECTIONS,
  ADVISOR_NOTIFICATION_CATEGORY_DEFINITIONS,
  ADVISOR_NOTIFICATION_CATEGORY_ORDER,
  type AdvisorNotificationCategoryKey,
  type AdvisorNotificationSettings,
  readAdvisorNotificationPreferences,
  writeAdvisorNotificationPreferences,
  readNotificationPreferences,
  writeNotificationPreferences,
} from '@/lib/notificationPreferences'

type ToggleRowProps = {
  title: string
  description: string
  checked: boolean
  onToggle: () => void
  disabled?: boolean
}

type DevelopingTeamStatus = {
  main_club_id: string | null
  main_club_name: string | null
  developing_club_id: string | null
  developing_club_name: string | null

  team_exists: boolean
  access_status: 'active' | 'expired' | 'not_activated'
  is_active: boolean
  is_read_only: boolean

  current_season: number
  active_season: number | null
  expires_after_season: number | null
  next_renewal_season: number | null

  auto_renew: boolean
  activation_coin_cost: number
  renewal_coin_cost: number

  coin_balance: number
  coin_requirement_met: boolean
  activation_coin_requirement_met?: boolean
  renewal_coin_requirement_met?: boolean

  real_days_played: number
  game_days_played: number
  time_requirement_met: boolean

  can_activate: boolean
  can_reactivate: boolean
  can_change_auto_renew: boolean

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

// Display fallbacks only. get_developing_team_status() is the authoritative source.
const DEFAULT_DEVELOPING_TEAM_ACTIVATION_COIN_COST = 200
const DEFAULT_DEVELOPING_TEAM_RENEWAL_COIN_COST = 100

function normalizeCoinCost(value: unknown, fallback: number): number {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function ToggleRow({ title, description, checked, onToggle, disabled = false }: ToggleRowProps): JSX.Element {
  return (
    <label className={`flex items-start justify-between gap-4 py-3 ${disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}>
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900">{title}</div>
        <div className="mt-1 text-xs text-gray-500">{description}</div>
      </div>

      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 disabled:cursor-not-allowed"
      />
    </label>
  )
}

export default function PreferencesPage(): JSX.Element {
  const [notifications, setNotifications] = useState<NotificationSettings>(() =>
    readNotificationPreferences()
  )
  const [advisorNotifications, setAdvisorNotifications] = useState<AdvisorNotificationSettings>(() => readAdvisorNotificationPreferences())
  const [staffAdvisoryOverview, setStaffAdvisoryOverview] = useState<any[]>([])
  const [isLoadingStaffAdvisoryOverview, setIsLoadingStaffAdvisoryOverview] = useState(true)

  const [developingTeamStatus, setDevelopingTeamStatus] = useState<DevelopingTeamStatus | null>(null)
  const [isLoadingDevelopingTeamStatus, setIsLoadingDevelopingTeamStatus] = useState(true)
  const [developingTeamError, setDevelopingTeamError] = useState<string | null>(null)
  const [isActivatingDevelopingTeam, setIsActivatingDevelopingTeam] = useState(false)
  const [
    isUpdatingDevelopingTeamAutoRenew,
    setIsUpdatingDevelopingTeamAutoRenew,
  ] = useState(false)
  const [isDevelopingTeamActivationModalOpen, setIsDevelopingTeamActivationModalOpen] =
    useState(false)
  const [developingTeamSuccessMessage, setDevelopingTeamSuccessMessage] = useState<string | null>(
    null
  )

  const [isShuttingDown, setIsShuttingDown] = useState(false)
  const [isShutdownModalOpen, setIsShutdownModalOpen] = useState(false)
  const [isRestartModalOpen, setIsRestartModalOpen] = useState(false)
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
    let cancelled = false
    async function loadAdvisorOverview() {
      try {
        const context = (await getMyClubContext()) as { mainClub?: MainClubContextClub | null }
        const clubId = context?.mainClub?.id ?? null

        if (!clubId) {
          if (!cancelled) setStaffAdvisoryOverview([])
          return
        }

        const { data, error } = await supabase.rpc('staff_advisory_get_overview_v1', {
          p_club_id: clubId,
        })
        if (error) throw error
        if (!cancelled) setStaffAdvisoryOverview(Array.isArray(data) ? data : data ? [data] : [])
      } catch (error) {
        console.error('Failed to load Staff Advisory notification availability:', error)
        if (!cancelled) setStaffAdvisoryOverview([])
      } finally { if (!cancelled) setIsLoadingStaffAdvisoryOverview(false) }
    }
    void loadAdvisorOverview()
    return () => { cancelled = true }
  }, [])

  useEffect(() => { writeAdvisorNotificationPreferences(advisorNotifications) }, [advisorNotifications])

  useEffect(() => {
    writeNotificationPreferences(notifications)
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

  const toggleNotification = (key: NotificationPreferenceGroup): void => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleAdvisorNotificationCategory = (key: AdvisorNotificationCategoryKey): void => {
    const definition = ADVISOR_NOTIFICATION_CATEGORY_DEFINITIONS[key]
    const active = staffAdvisoryOverview.some(row => row.role_type === definition.requiredRole && row.advisory_status === 'active')
    if (!active) return
    setAdvisorNotifications(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleRestartTeam = (): void => {
    setIsRestartModalOpen(true)
  }

  const handleActivateDevelopingTeam = async (): Promise<void> => {
    if (isActivatingDevelopingTeam) return

    setDevelopingTeamError(null)
    setDevelopingTeamSuccessMessage(null)
    setIsActivatingDevelopingTeam(true)

    try {
      const { data, error } = await supabase.rpc(
        'activate_developing_team_for_season_v1'
      )

      if (error) {
        throw error
      }

      const normalized = Array.isArray(data) ? data[0] : data

      setDevelopingTeamSuccessMessage(
        normalized?.access_status === 'active'
          ? `Developing Team activated for Season ${
              normalized.active_season ?? normalized.current_season
            }. Automatic renewal is ${normalized.auto_renew === false ? 'off' : 'on'}.`
          : 'Developing Team activated successfully.'
      )

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
        console.error('Failed to re-pin active club to main club after activation:', contextError)
      }

      setIsDevelopingTeamActivationModalOpen(false)
      await loadDevelopingTeamStatus()
    } catch (error: any) {
      console.error('activate_developing_team_for_season_v1 failed:', error)
      setDevelopingTeamError(error?.message ?? 'Failed to activate Developing Team.')
    } finally {
      setIsActivatingDevelopingTeam(false)
    }
  }

  const handleDevelopingTeamAutoRenewChange = async (
    enabled: boolean
  ): Promise<void> => {
    if (isUpdatingDevelopingTeamAutoRenew) return

    setDevelopingTeamError(null)
    setDevelopingTeamSuccessMessage(null)
    setIsUpdatingDevelopingTeamAutoRenew(true)

    try {
      const { error } = await supabase.rpc(
        'set_developing_team_auto_renew_v1',
        {
          p_enabled: enabled,
        }
      )

      if (error) {
        throw error
      }

      setDevelopingTeamSuccessMessage(
        enabled
          ? 'Developing Team automatic renewal enabled.'
          : 'Developing Team automatic renewal disabled.'
      )

      await loadDevelopingTeamStatus()
    } catch (error: any) {
      console.error('set_developing_team_auto_renew_v1 failed:', error)
      setDevelopingTeamError(error?.message ?? 'Failed to update automatic renewal.')
    } finally {
      setIsUpdatingDevelopingTeamAutoRenew(false)
    }
  }

  const openDevelopingTeamActivationModal = (): void => {
    if (isActivatingDevelopingTeam) return
    setDevelopingTeamError(null)
    setDevelopingTeamSuccessMessage(null)
    setIsDevelopingTeamActivationModalOpen(true)
  }

  const closeDevelopingTeamActivationModal = (): void => {
    if (isActivatingDevelopingTeam) return
    setIsDevelopingTeamActivationModalOpen(false)
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

  const activationCoinCost = normalizeCoinCost(
    developingTeamStatus?.activation_coin_cost,
    DEFAULT_DEVELOPING_TEAM_ACTIVATION_COIN_COST
  )

  const renewalCoinCost = normalizeCoinCost(
    developingTeamStatus?.renewal_coin_cost,
    DEFAULT_DEVELOPING_TEAM_RENEWAL_COIN_COST
  )

  const movementWindowText = developingTeamStatus
    ? developingTeamStatus.movement_window_open
      ? `Movement window open now: ${developingTeamStatus.current_window_label ?? 'Current window'}`
      : `Movement window closed. Next window: ${developingTeamStatus.next_window_label ?? 'Unknown'}`
    : 'Movement window unavailable.'

  const developingTeamAccessStatus = developingTeamStatus?.access_status ?? 'not_activated'
  const developingTeamIsActive = developingTeamStatus?.is_active === true
  const developingTeamIsExpired = developingTeamAccessStatus === 'expired'
  const developingTeamIsNotActivated = developingTeamAccessStatus === 'not_activated'
  const developingTeamIsEligible = developingTeamStatus?.time_requirement_met === true
  const developingTeamTargetSeason = developingTeamStatus?.current_season ?? 1
  const developingTeamActionCost = developingTeamIsExpired
    ? renewalCoinCost
    : activationCoinCost
  const developingTeamHasEnoughCoins =
    Number(developingTeamStatus?.coin_balance ?? 0) >= developingTeamActionCost

  const coinProgressLabel = developingTeamStatus
    ? `${developingTeamStatus.coin_balance} / ${developingTeamActionCost}`
    : '—'

  const developingTeamActivationLabel = developingTeamIsExpired
    ? `Reactivate for Season ${developingTeamTargetSeason} — ${renewalCoinCost} Coins`
    : `Activate Developing Team — ${activationCoinCost} Coins`

  const developingTeamCanSubmitActivation = Boolean(
    developingTeamStatus &&
      developingTeamIsEligible &&
      developingTeamHasEnoughCoins &&
      !developingTeamIsActive &&
      (
        (developingTeamIsNotActivated && developingTeamStatus.can_activate) ||
        (developingTeamIsExpired && developingTeamStatus.can_reactivate)
      )
  )

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
              <p className="mt-1 text-xs text-gray-500">Core game notifications and paid Staff Advisor notifications are controlled separately.</p>

              <div className="mt-5">
                <h4 className="text-sm font-semibold text-gray-900">Core Notifications</h4>
                <p className="mt-1 text-xs text-gray-500">Normal game notifications that remain available without a paid Staff Advisor.</p>
                <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {NOTIFICATION_PREFERENCE_SECTIONS.map(section => {
                    const sectionGroups = NOTIFICATION_PREFERENCE_GROUP_ORDER.filter(groupCode => NOTIFICATION_PREFERENCE_GROUPS[groupCode].section === section.code)
                    const enabledCount = sectionGroups.filter(groupCode => notifications[groupCode] !== false).length
                    return (
                      <div key={section.code} className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50/60">
                        <div className="flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-4 py-3">
                          <div><h5 className="text-sm font-semibold text-gray-900">{section.title}</h5><p className="mt-1 text-xs text-gray-500">{section.description}</p></div>
                          <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{enabledCount}/{sectionGroups.length} on</span>
                        </div>
                        <div className="divide-y divide-gray-200 px-4">
                          {sectionGroups.map(groupCode => {
                            const group = NOTIFICATION_PREFERENCE_GROUPS[groupCode]
                            return <ToggleRow key={groupCode} title={group.label} description={group.description} checked={notifications[groupCode] !== false} onToggle={() => toggleNotification(groupCode)} />
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="mt-6 border-t border-gray-200 pt-5">
                <h4 className="text-sm font-semibold text-gray-900">Staff Advisor Notifications</h4>
                <p className="mt-1 text-xs text-gray-500">Paid advisor notifications grouped by topic. Each category controls all paid advisory notifications in that topic and unlocks only while the required Staff Advisor is active.</p>
                <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-gray-50/60">
                  <div className="divide-y divide-gray-200 px-4">
                    {ADVISOR_NOTIFICATION_CATEGORY_ORDER.map(key => {
                      const definition = ADVISOR_NOTIFICATION_CATEGORY_DEFINITIONS[key]
                      const active = staffAdvisoryOverview.some(row => row.role_type === definition.requiredRole && row.advisory_status === 'active')
                      return <ToggleRow key={key} title={definition.label} description={active ? definition.description : `${definition.description} Activate the required Staff Advisor to control this notification.`} checked={advisorNotifications[key] !== false} disabled={!active || isLoadingStaffAdvisoryOverview} onToggle={() => toggleAdvisorNotificationCategory(key)} />
                    })}
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">A Core notification and an Advisor notification may cover the same topic without being the same event. Example: Race Supplies Low remains Core, while Equipment & Workshop Review is paid analysis.</div>
              </div>
            </section>
          </div>

          <section className="w-full rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-semibold">Developing Team</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Build and manage a U23 development squad with seasonal coin access.
                </p>
              </div>

              <div className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600">
                {developingTeamIsActive || developingTeamIsExpired
                  ? `${renewalCoinCost} coins per renewal`
                  : `${activationCoinCost} coins to activate`}
              </div>
            </div>

            <p className="mt-3 text-sm text-gray-600">
              Available to Free and Premium players. First activation costs {activationCoinCost}{' '}
              coins. Each later season renewal or reactivation costs {renewalCoinCost} coins.
              Premium membership does not waive these service costs.
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
                    <div className="mt-1 text-lg font-semibold text-gray-900">
                      {coinProgressLabel}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {developingTeamIsExpired
                        ? `Reactivation price: ${renewalCoinCost} coins`
                        : developingTeamIsActive
                          ? `Next renewal: ${renewalCoinCost} coins`
                          : `First activation: ${activationCoinCost} coins`}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  Eligibility: 30 real-life days or 60 in-game days. First activation:{' '}
                  {activationCoinCost} coins. Renewal and reactivation: {renewalCoinCost} coins per
                  season.
                </div>

                {developingTeamIsActive ? (
                  <div className="mt-4 rounded-xl border border-green-200 bg-green-50/60 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-green-900">
                          Developing Team active
                        </div>
                        <div className="mt-1 text-sm text-green-800">
                          Access remains available until the end of Season{' '}
                          {developingTeamStatus?.expires_after_season ??
                            developingTeamStatus?.active_season ??
                            developingTeamStatus?.current_season}.
                        </div>
                      </div>

                      <span className="shrink-0 rounded-full border border-green-200 bg-white px-2.5 py-1 text-xs font-semibold text-green-700">
                        Active
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <div className="text-xs text-green-700">Current season</div>
                        <div className="mt-1 text-sm font-semibold text-green-950">
                          Season {developingTeamStatus?.current_season ?? '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-green-700">Access ends</div>
                        <div className="mt-1 text-sm font-semibold text-green-950">
                          End of Season{' '}
                          {developingTeamStatus?.expires_after_season ??
                            developingTeamStatus?.active_season ??
                            '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-green-700">Renewal price</div>
                        <div className="mt-1 text-sm font-semibold text-green-950">
                          {renewalCoinCost} coins
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-green-700">Next renewal</div>
                        <div className="mt-1 text-sm font-semibold text-green-950">
                          Start of Season{' '}
                          {developingTeamStatus?.next_renewal_season ??
                            (developingTeamStatus?.current_season ?? 0) + 1}
                        </div>
                      </div>
                    </div>

                    <label className="mt-5 flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-green-200 bg-white p-4">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          Automatically renew each season
                        </div>
                        <div className="mt-1 text-xs leading-5 text-gray-600">
                          When enabled, {renewalCoinCost} coins will be deducted at the beginning of
                          the next season. If your balance is too low, renewal will fail and the
                          Developing Team will become read-only.
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        checked={developingTeamStatus?.auto_renew === true}
                        disabled={
                          !developingTeamStatus?.can_change_auto_renew ||
                          isUpdatingDevelopingTeamAutoRenew
                        }
                        onChange={event => {
                          void handleDevelopingTeamAutoRenewChange(event.target.checked)
                        }}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300"
                      />
                    </label>
                  </div>
                ) : developingTeamIsExpired ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                    <div className="text-sm font-semibold text-amber-900">
                      Developing Team access expired
                    </div>
                    <p className="mt-2 text-sm leading-6 text-amber-800">
                      Your team, riders, contracts, results and history remain stored. The Developing
                      Team is currently read-only.
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={openDevelopingTeamActivationModal}
                        disabled={!developingTeamCanSubmitActivation || isActivatingDevelopingTeam}
                        className="inline-flex items-center rounded-md bg-yellow-400 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isActivatingDevelopingTeam
                          ? 'Reactivating...'
                          : developingTeamActivationLabel}
                      </button>

                      {!developingTeamHasEnoughCoins ? (
                        <a
                          href="#/dashboard/pro"
                          className="text-sm font-semibold text-yellow-700 hover:text-yellow-800"
                        >
                          Get coins
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : !developingTeamIsEligible ? (
                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-sm font-semibold text-gray-900">Not yet eligible</div>
                    <p className="mt-2 text-sm text-gray-600">
                      Developing Team becomes available after 30 real-life days or 60 in-game days.
                    </p>
                    <button
                      type="button"
                      disabled
                      className="mt-4 inline-flex cursor-not-allowed items-center rounded-md border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400"
                    >
                      Not yet eligible
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50/50 p-4">
                    <div className="text-sm font-semibold text-gray-900">
                      Activate for Season {developingTeamTargetSeason}
                    </div>
                    <p className="mt-2 text-sm text-gray-700">
                      {developingTeamStatus?.team_exists
                        ? 'Your existing Developing Team will be activated for this season.'
                        : 'A Developing Team will be created and activated for this season.'}{' '}
                      Access lasts until the end of the current in-game season. Automatic renewal is
                      enabled by default and can be switched off at any time.
                    </p>

                    {!developingTeamHasEnoughCoins ? (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-amber-800">
                        You need {activationCoinCost} coins to activate Developing Team access. Current
                        balance: {developingTeamStatus?.coin_balance ?? 0} coins.
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={openDevelopingTeamActivationModal}
                        disabled={!developingTeamCanSubmitActivation || isActivatingDevelopingTeam}
                        className="inline-flex items-center rounded-md bg-yellow-400 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isActivatingDevelopingTeam
                          ? 'Activating...'
                          : developingTeamActivationLabel}
                      </button>

                      {!developingTeamHasEnoughCoins ? (
                        <a
                          href="#/dashboard/pro"
                          className="text-sm font-semibold text-yellow-700 hover:text-yellow-800"
                        >
                          Get coins
                        </a>
                      ) : null}
                    </div>
                  </div>
                )}

                {developingTeamIsActive ? (
                  <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                    {movementWindowText}
                  </div>
                ) : null}

                <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  <div className="font-medium text-gray-900">Special rules</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>The team name will be your main club name plus U23.</li>
                    <li>This team can apply to races normally while seasonal access is active.</li>
                    <li>This team cannot be promoted above Continental level.</li>
                    <li>Maximum roster size: 8 riders.</li>
                    <li>Only riders aged 23 or younger are eligible.</li>
                    <li>Riders move between squads only during movement windows.</li>
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

                {developingTeamStatus?.team_exists &&
                developingTeamStatus.developing_club_name ? (
                  <div className="mt-4 text-xs text-gray-500">
                    Team: {developingTeamStatus.developing_club_name}
                  </div>
                ) : null}
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
                  Restart this club back to a fresh starter state while keeping the same club name,
                  logo, jersey, country, and competition slot.
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Current riders become free agents, season points reset to 0, and the team receives
                  a new starter squad based on its current tier.
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

      <RestartTeamModal
        isOpen={isRestartModalOpen}
        onClose={() => setIsRestartModalOpen(false)}
        redirectTo="/dashboard/overview"
      />

      {isDevelopingTeamActivationModalOpen && developingTeamStatus ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="developing-team-activation-modal-title"
        >
          <button
            type="button"
            aria-label="Close Developing Team activation confirmation"
            className="absolute inset-0 bg-black/40"
            onClick={closeDevelopingTeamActivationModal}
          />

          <div className="relative z-[91] w-full max-w-lg overflow-hidden rounded-2xl border border-yellow-200 bg-white shadow-2xl">
            <div className="border-b border-yellow-100 bg-yellow-50 px-6 py-5">
              <h3
                id="developing-team-activation-modal-title"
                className="text-lg font-semibold text-gray-900"
              >
                {developingTeamIsExpired ? 'Reactivate' : 'Activate'} Developing Team for Season{' '}
                {developingTeamTargetSeason}?
              </h3>
            </div>

            <div className="space-y-3 px-6 py-5 text-sm leading-6 text-gray-700">
              <p>{developingTeamActionCost} coins will be deducted from your wallet.</p>
              <p>Access lasts until the end of this in-game season.</p>
              <p>Automatic renewal will be enabled by default. You can switch it off at any time in Preferences or Premium &amp; Billing.</p>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDevelopingTeamActivationModal}
                disabled={isActivatingDevelopingTeam}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  void handleActivateDevelopingTeam()
                }}
                disabled={isActivatingDevelopingTeam}
                className="inline-flex items-center justify-center rounded-md bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isActivatingDevelopingTeam
                  ? 'Activating...'
                  : `${developingTeamIsExpired ? 'Reactivate' : 'Activate'} for ${developingTeamActionCost} Coins`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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