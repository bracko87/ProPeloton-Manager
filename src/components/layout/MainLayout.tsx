/**
 * MainLayout.tsx
 * Layout used for in-game pages: retractable sidebar, header, content, and footer with game-time.
 *
 * LOCK FLOW (corrected):
 * - When user has <2 coins:
 *   - Show a modal first (do NOT auto-redirect)
 *   - Modal offers: Buy Coins / Log out
 * - When user clicks Buy Coins:
 *   - Navigate to /dashboard/pro
 *   - Pro page remains interactive so user can purchase
 * - While locked on /dashboard/pro:
 *   - UI should still be usable (Buy now buttons)
 *   - Sidebar should be restricted (pass locked prop to Sidebar)
 * - When balance becomes >=2:
 *   - Unlock and restore normal navigation
 *
 * RESTORE PATCH:
 * - If the current path is /dashboard/pro or /dashboard/pro-packages,
 *   render ProPackagesPage directly from MainLayout.
 * - This helps restore the page even if nested routing/outlet wiring was broken.
 *
 * UPDATE: Removed forced redirect after unlock
 * - Users are no longer auto-redirected away from /dashboard/pro after coin status
 *   changes to unlocked.
 * - This fixes the issue where Buy Coins / Pro Packages appeared to "do nothing"
 *   or bounce back immediately.
 *
 * MAIN CLUB FIX:
 * - The dashboard shell/header must always load the user's MAIN club only.
 * - Never use the developing club as a generic "active club".
 * - Persist only the main club under the dedicated storage key: ppm-main-club.
 *
 * FALSE COIN-LOCK FIX:
 * - Temporary RPC/network/token-refresh failures no longer overwrite the user's
 *   real balance with 0 or mark gameplay as locked.
 * - The lock modal appears only after a successful response confirms a real lock.
 * - Refreshes are protected against stale overlapping responses after inactivity.
 *
 * INACTIVITY AUTO-LOGOUT:
 * - Warn the user after 29 minutes without real user interaction.
 * - Automatically sign out after 30 minutes of inactivity.
 * - Activity is shared across browser tabs through localStorage.
 * - Mouse, pointer, keyboard, touch, wheel, focus, and visibility activity reset
 *   the timer without generating excessive storage writes.
 *
 * UPDATE: Active club auto-repair
 * - On layout mount, repair ppm-active-club from the user's true main club context.
 * - Broadcast a fresh club-updated event so listeners recover automatically.
 * - This fixes:
 *   - Mornar Bar BK broken state
 *   - future users after Developing Team purchase
 *   - stale localStorage after reload/sign-in
 */

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router'
import Sidebar from './Sidebar'
import Header from './Header'
import Footer from './Footer'
import ProPackagesPage from '../../pages/ProPackages'
import { getMyClubContext } from '@/lib/clubContext'
import { supabase } from '@/lib/supabase'

interface MainLayoutProps {
  children?: React.ReactNode
}

interface ClubUiState {
  id?: string
  name: string
  countryCode: string
  countryName: string
  logoUrl: string | null
}

interface CoinStatusRow {
  balance?: number | string | null
  can_play?: boolean | null
}

interface MainClubRow {
  id: string
  owner_user_id: string
  name: string
  country_code: string
  logo_path: string | null
  primary_color?: string | null
  secondary_color?: string | null
  club_type: 'main' | 'developing' | string
}

const COINS_NEEDED_TO_PLAY = 2
const PRO_PAGE_PATH = '/dashboard/pro'
const PRO_PAGE_ALIASES = new Set<string>(['/dashboard/pro', '/dashboard/pro-packages'])
const MAIN_CLUB_STORAGE_KEY = 'ppm-main-club'

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000
const INACTIVITY_WARNING_MS = 29 * 60 * 1000
const INACTIVITY_CHECK_INTERVAL_MS = 15 * 1000
const INACTIVITY_ACTIVITY_WRITE_THROTTLE_MS = 5 * 1000
const LAST_ACTIVITY_STORAGE_KEY = 'ppm-last-user-activity'

export default function MainLayout({ children }: MainLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [coinBalance, setCoinBalance] = useState(0)
  const [canPlayToday, setCanPlayToday] = useState(true)

  /*
   * The modal must never open while the coin status is unknown.
   * It may open only after a successful server response confirms a lock.
   */
  const [coinStatusResolved, setCoinStatusResolved] = useState(false)

  /*
   * Prevent an older request from overwriting a newer result when a browser
   * tab wakes after inactivity and several refresh triggers fire together.
   */
  const coinStatusRequestVersionRef = useRef(0)

  // Controls whether the "locked" modal is currently shown.
  // We only show it when locked AND not on pro pages.
  const [showLockModal, setShowLockModal] = useState(false)

  /*
   * Inactivity warning appears during the final minute before automatic logout.
   * The timestamp itself lives in localStorage so activity in any open game tab
   * keeps the complete signed-in session active.
   */
  const [showInactivityWarning, setShowInactivityWarning] = useState(false)
  const inactivityLogoutStartedRef = useRef(false)
  const lastActivityWriteRef = useRef(0)

  const [clubUi, setClubUi] = useState<ClubUiState>({
    id: undefined,
    name: 'ProPeloton Manager',
    countryCode: '',
    countryName: '',
    logoUrl: null,
  })

  const navigate = useNavigate()
  const location = useLocation()

  const isProPage = useMemo(() => {
    return PRO_PAGE_ALIASES.has(location.pathname)
  }, [location.pathname])

  /*
   * Unknown status is not a lock. Only a successfully resolved response that
   * confirms the user cannot play may block the dashboard.
   */
  const isCoinLockConfirmed = coinStatusResolved && !canPlayToday

  const persistMainClubToStorage = useCallback(
    (club: MainClubRow, countryName: string, logoUrl: string | null) => {
      if (typeof window === 'undefined') return

      const payload = {
        id: club.id,
        owner_user_id: club.owner_user_id,
        name: club.name,
        country_code: club.country_code,
        country_name: countryName,
        logo_path: club.logo_path ?? null,
        primary_color: club.primary_color ?? undefined,
        secondary_color: club.secondary_color ?? undefined,
        club_type: 'main' as const,
        updated_at_ms: Date.now(),
      }

      window.localStorage.setItem(MAIN_CLUB_STORAGE_KEY, JSON.stringify(payload))
    },
    []
  )

  const clearMainClubStorage = useCallback(() => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(MAIN_CLUB_STORAGE_KEY)
  }, [])

  const loadCoinStatus = useCallback(async () => {
    const requestVersion = ++coinStatusRequestVersionRef.current

    try {
      /*
       * After an inactive tab wakes, Supabase may briefly be refreshing the
       * authentication token. Do not interpret that temporary state as zero
       * coins or a gameplay lock.
       */
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (requestVersion !== coinStatusRequestVersionRef.current) return

      if (sessionError) {
        console.warn(
          'Coin status session check failed; keeping last confirmed state:',
          sessionError
        )
        return
      }

      if (!session?.user?.id) {
        console.warn(
          'Coin status was not refreshed because no active session was available.'
        )
        return
      }

      const { data, error } = await supabase.rpc('get_my_coin_status')

      /*
       * A newer request has already started. Ignore this older response,
       * regardless of whether it succeeded or failed.
       */
      if (requestVersion !== coinStatusRequestVersionRef.current) return

      if (error) {
        /*
         * This is the core false-lock fix:
         * keep the last confirmed balance/access state on temporary failures.
         */
        console.warn(
          'Failed to refresh coin status; keeping last confirmed state:',
          error
        )
        return
      }

      /*
       * Support either common Supabase RPC shape:
       *   [{ balance, can_play }]
       *   { balance, can_play }
       */
      const rawRow = Array.isArray(data) ? data[0] : data

      if (!rawRow || typeof rawRow !== 'object') {
        console.warn(
          'Coin status RPC returned no usable row; keeping last confirmed state:',
          data
        )
        return
      }

      const row = rawRow as CoinStatusRow
      const parsedBalance = Number(row.balance)

      if (!Number.isFinite(parsedBalance)) {
        console.warn(
          'Coin status RPC returned an invalid balance; keeping last confirmed state:',
          data
        )
        return
      }

      const nextBalance = Math.max(parsedBalance, 0)

      /*
       * Fail safely when balance and can_play disagree:
       * a balance of 2+ coins or explicit can_play=true keeps gameplay open.
       * Real paid actions should still be enforced by the backend.
       */
      const nextCanPlay =
        nextBalance >= COINS_NEEDED_TO_PLAY || row.can_play === true

      if (
        typeof row.can_play === 'boolean' &&
        row.can_play !== (nextBalance >= COINS_NEEDED_TO_PLAY)
      ) {
        console.warn(
          'Coin status RPC returned inconsistent balance/can_play values. ' +
            'Using the unlocked result when either value permits play.',
          data
        )
      }

      setCoinBalance(nextBalance)
      setCanPlayToday(nextCanPlay)
      setCoinStatusResolved(true)
    } catch (error) {
      if (requestVersion !== coinStatusRequestVersionRef.current) return

      /*
       * An unexpected refresh failure is still an unknown state, not a
       * confirmed zero balance.
       */
      console.warn(
        'Unexpected coin status refresh failure; keeping last confirmed state:',
        error
      )
    }
  }, [])

  const markUserActive = useCallback((force = false) => {
    if (typeof window === 'undefined') return
    if (inactivityLogoutStartedRef.current) return

    const now = Date.now()

    /*
     * Mouse movement can fire hundreds of times per second. Most activity
     * events therefore write at most once every five seconds. Explicit actions
     * such as "Stay logged in", focus, or a newly visible tab use force=true.
     */
    if (
      !force &&
      now - lastActivityWriteRef.current <
        INACTIVITY_ACTIVITY_WRITE_THROTTLE_MS
    ) {
      return
    }

    lastActivityWriteRef.current = now
    window.localStorage.setItem(
      LAST_ACTIVITY_STORAGE_KEY,
      String(now)
    )
    setShowInactivityWarning(false)
  }, [])

  const handleLogoutAndHome = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } finally {
      clearMainClubStorage()

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY)
        window.localStorage.removeItem('ppm-active-club')
        window.location.href = '/'
      } else {
        navigate('/')
      }
    }
  }, [clearMainClubStorage, navigate])

  const handleNavigate = useCallback(
    (path: string) => {
      if (path === '/dashboard/pro-packages') {
        navigate(PRO_PAGE_PATH)
        return
      }
      navigate(path)
    },
    [navigate]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    /*
     * Mounting/reloading the authenticated dashboard is user activity.
     * Reset here so a timestamp left from an older browser session can never
     * cause an immediate logout after a fresh login or page reload.
     */
    inactivityLogoutStartedRef.current = false
    markUserActive(true)

    const readLastActivity = (): number => {
      const storedValue = Number(
        window.localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY)
      )

      return Number.isFinite(storedValue) && storedValue > 0
        ? storedValue
        : Date.now()
    }

    const performAutomaticLogout = async () => {
      if (inactivityLogoutStartedRef.current) return

      inactivityLogoutStartedRef.current = true
      setShowInactivityWarning(false)

      try {
        await handleLogoutAndHome()
      } catch (error) {
        /*
         * handleLogoutAndHome already redirects in its finally block, but keep
         * a diagnostic in case a browser blocks navigation unexpectedly.
         */
        console.error('Automatic inactivity logout failed:', error)
      }
    }

    const checkInactivity = () => {
      if (inactivityLogoutStartedRef.current) return

      const inactiveFor = Date.now() - readLastActivity()

      if (inactiveFor >= INACTIVITY_TIMEOUT_MS) {
        void performAutomaticLogout()
        return
      }

      setShowInactivityWarning(
        inactiveFor >= INACTIVITY_WARNING_MS
      )
    }

    const handleUserActivity = () => {
      markUserActive(false)
    }

    const handleFocus = () => {
      /*
       * Returning focus is a real user action. Reset the timer immediately.
       */
      markUserActive(true)
    }

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return

      /*
       * Check first. If the tab has already exceeded the timeout, log out.
       * Otherwise, becoming visible counts as renewed activity.
       */
      const inactiveFor = Date.now() - readLastActivity()

      if (inactiveFor >= INACTIVITY_TIMEOUT_MS) {
        void performAutomaticLogout()
        return
      }

      markUserActive(true)
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LAST_ACTIVITY_STORAGE_KEY) return

      /*
       * Activity in another tab refreshes this tab's warning state too.
       */
      if (event.newValue) {
        setShowInactivityWarning(false)
      }
    }

    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'touchstart',
      'wheel',
      'mousemove',
    ]

    activityEvents.forEach(eventName => {
      window.addEventListener(eventName, handleUserActivity, {
        passive: true,
      })
    })

    window.addEventListener('focus', handleFocus)
    window.addEventListener('storage', handleStorage)
    document.addEventListener('visibilitychange', handleVisibility)

    const intervalId = window.setInterval(
      checkInactivity,
      INACTIVITY_CHECK_INTERVAL_MS
    )

    checkInactivity()

    return () => {
      window.clearInterval(intervalId)

      activityEvents.forEach(eventName => {
        window.removeEventListener(eventName, handleUserActivity)
      })

      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('storage', handleStorage)
      document.removeEventListener(
        'visibilitychange',
        handleVisibility
      )
    }
  }, [handleLogoutAndHome, markUserActive])

  useEffect(() => {
    let cancelled = false

    async function repairActiveClubContext(): Promise<void> {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()

        if (authError || !user?.id || cancelled) return

        const { mainClub } = await getMyClubContext()
        if (!mainClub || cancelled) return

        const payload = {
          id: mainClub.id,
          owner_user_id: user.id,
          name: mainClub.name,
          country_code: mainClub.country_code,
          logo_path: mainClub.logo_path ?? null,
          primary_color: mainClub.primary_color ?? undefined,
          secondary_color: mainClub.secondary_color ?? undefined,
          club_type: 'main' as const,
          updated_at_ms: Date.now(),
        }

        window.localStorage.setItem('ppm-active-club', JSON.stringify(payload))
        window.dispatchEvent(new CustomEvent('club-updated', { detail: payload }))
      } catch (error) {
        console.error('Failed to repair active club context:', error)
      }
    }

    void repairActiveClubContext()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const loadClubUi = async () => {
      const { data: userResult, error: userError } = await supabase.auth.getUser()
      if (userError || !userResult.user) {
        clearMainClubStorage()
        return
      }

      const user = userResult.user

      const { data: mainClub, error } = await supabase
        .from('clubs')
        .select(`
          id,
          owner_user_id,
          name,
          country_code,
          logo_path,
          primary_color,
          secondary_color,
          club_type
        `)
        .eq('owner_user_id', user.id)
        .eq('club_type', 'main')
        .single()

      if (error || !mainClub) {
        console.error('Failed to load main club for layout/header:', error)
        clearMainClubStorage()
        return
      }

      let countryName = mainClub.country_code || ''

      const { data: country } = await supabase
        .from('countries')
        .select('name')
        .eq('code', mainClub.country_code)
        .maybeSingle()

      if (country?.name) countryName = country.name

      let logoUrl: string | null = null

      if (mainClub.logo_path) {
        if (mainClub.logo_path.startsWith('http://') || mainClub.logo_path.startsWith('https://')) {
          logoUrl = mainClub.logo_path
        } else {
          const { data: signedData, error: signedError } = await supabase.storage
            .from('club-logos')
            .createSignedUrl(mainClub.logo_path, 60 * 60)

          if (!signedError && signedData?.signedUrl) {
            logoUrl = signedData.signedUrl
          } else {
            const { data: publicData } = supabase.storage
              .from('club-logos')
              .getPublicUrl(mainClub.logo_path)

            if (publicData?.publicUrl) logoUrl = publicData.publicUrl
          }
        }
      }

      persistMainClubToStorage(mainClub as MainClubRow, countryName, logoUrl)

      if (!mounted) return

      setClubUi({
        id: mainClub.id,
        name: mainClub.name,
        countryCode: mainClub.country_code,
        countryName,
        logoUrl,
      })
    }

    void Promise.all([loadClubUi(), loadCoinStatus()])

    const refreshCoinStatusWhenActive = () => {
      const isVisible = document.visibilityState === 'visible'
      const isOnline =
        typeof navigator === 'undefined' || navigator.onLine

      if (isVisible && isOnline) {
        void loadCoinStatus()
      }
    }

    /*
     * Poll only while the tab is active and online. This avoids creating a
     * burst of failed requests while the browser is sleeping.
     */
    const intervalId = window.setInterval(() => {
      refreshCoinStatusWhenActive()
    }, 15000)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadCoinStatus()
      }
    }

    const onFocus = () => {
      void loadCoinStatus()
    }

    const onOnline = () => {
      void loadCoinStatus()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') {
        /*
         * Invalidate requests still running for the old session and make sure
         * an unresolved signed-out state cannot display the lock modal.
         */
        coinStatusRequestVersionRef.current += 1
        setCoinBalance(0)
        setCanPlayToday(true)
        setCoinStatusResolved(false)
        setShowLockModal(false)
        setShowInactivityWarning(false)
        inactivityLogoutStartedRef.current = false

        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY)
        }

        return
      }

      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        if (event === 'SIGNED_IN') {
          inactivityLogoutStartedRef.current = false
          markUserActive(true)
        }

        /*
         * Schedule the RPC outside the auth callback to avoid nested Supabase
         * operations while the auth event is still being handled.
         */
        window.setTimeout(() => {
          void loadCoinStatus()
        }, 0)
      }
    })

    return () => {
      mounted = false

      /*
       * Ignore any response that completes after this layout unmounts.
       */
      coinStatusRequestVersionRef.current += 1

      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      authSubscription.unsubscribe()
    }
  }, [
    clearMainClubStorage,
    loadCoinStatus,
    markUserActive,
    persistMainClubToStorage,
  ])

  /**
   * Lock behavior:
   * - Unknown/unresolved status: never show the modal.
   * - Confirmed locked and not on a Pro page: show the modal.
   * - Confirmed locked on a Pro page: hide the modal so buying remains possible.
   * - Confirmed unlocked: hide the modal.
   */
  useEffect(() => {
    if (!coinStatusResolved) {
      setShowLockModal(false)
      return
    }

    if (isCoinLockConfirmed && !isProPage) {
      setShowLockModal(true)
      return
    }

    setShowLockModal(false)
  }, [coinStatusResolved, isCoinLockConfirmed, isProPage])

  // Block normal gameplay only after a successful response confirms the lock.
  const shouldBlockMain = isCoinLockConfirmed && !isProPage

  const mainContent = useMemo(() => {
    if (children) return children

    if (isProPage) {
      return <ProPackagesPage />
    }

    return <Outlet />
  }, [children, isProPage])

  return (
    <div className="min-h-screen flex bg-gray-100">
      <Sidebar collapsed={collapsed} locked={isCoinLockConfirmed} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onToggle={() => setCollapsed(v => !v)}
          clubId={clubUi.id}
          clubName={clubUi.name}
          clubCountryCode={clubUi.countryCode}
          clubCountryName={clubUi.countryName}
          clubLogoUrl={clubUi.logoUrl}
          onNavigate={handleNavigate}
          coinBalance={coinBalance}
        />

        <main
          className={`p-6 lg:p-8 flex-1 overflow-auto ${
            shouldBlockMain ? 'pointer-events-none select-none' : ''
          }`}
        >
          {mainContent}
        </main>

        <Footer />
      </div>

      {showInactivityWarning && !showLockModal ? (
        <div className="fixed bottom-6 right-6 z-[130] w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-amber-300 bg-white p-5 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl text-amber-700">
              ⏱
            </div>

            <div className="min-w-0">
              <div className="text-base font-bold text-slate-900">
                You will be logged out soon
              </div>

              <p className="mt-1 text-sm leading-6 text-slate-600">
                Your game has been inactive for almost 30 minutes.
                You will be logged out automatically in approximately
                one minute.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => markUserActive(true)}
            className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Stay logged in
          </button>
        </div>
      ) : null}

      {showLockModal ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 backdrop-blur-[3px] p-4 pointer-events-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-black/10 bg-white p-8 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="shrink-0 mt-1 h-12 w-12 rounded-full bg-red-100 flex items-center justify-center text-red-700 text-2xl">
                ⚠️
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-extrabold text-red-700">
                  Coins required — gameplay is locked
                </h2>

                <p className="mt-2 text-base text-gray-700">
                  Your balance is{' '}
                  <span className="font-bold text-black">◎ {coinBalance.toLocaleString()} Coins</span>
                  .
                </p>

                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  You need at least <span className="font-semibold">{COINS_NEEDED_TO_PLAY} Coins</span>{' '}
                  to continue playing today. Buy coins to unlock your club, or log out and return to
                  the home page.
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowLockModal(false)
                  navigate(PRO_PAGE_PATH)
                }}
                className="rounded-lg bg-yellow-400 px-4 py-3 text-sm font-semibold text-black hover:bg-yellow-300"
              >
                Buy Coins
              </button>

              <button
                type="button"
                onClick={() => {
                  void handleLogoutAndHome()
                }}
                className="rounded-lg border border-red-300 bg-white px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Log out & Home
              </button>
            </div>

            <div className="mt-4 text-xs text-gray-500">
              Tip: Once you have {COINS_NEEDED_TO_PLAY}+ coins again, you’ll be able to continue
              playing automatically.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}