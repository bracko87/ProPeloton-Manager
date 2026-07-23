/**
 * MainLayout.tsx
 * Layout used for in-game pages: retractable sidebar, header, content, and footer with game-time.
 *
 * FREE GAME ACCESS:
 * - Coin balance remains visible in the header.
 * - Coin status is refreshed for wallet display only.
 * - Gameplay is never blocked because of a low or zero coin balance.
 *
 * MAIN CLUB:
 * - The dashboard shell/header always loads the user's main club.
 * - The developing club is never used as the generic active club.
 * - The main club is persisted under ppm-main-club.
 *
 * INACTIVITY AUTO-LOGOUT:
 * - Warn the user after 29 minutes without real user interaction.
 * - Automatically sign out after 30 minutes of inactivity.
 * - Activity is shared across browser tabs through localStorage.
 *
 * ACTIVE CLUB AUTO-REPAIR:
 * - On layout mount, repair ppm-active-club from the user's true main club context.
 * - Broadcast a fresh club-updated event so listeners recover automatically.
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

  /*
   * Prevent an older request from overwriting a newer result when a browser
   * tab wakes after inactivity and several refresh triggers fire together.
   */
  const coinStatusRequestVersionRef = useRef(0)

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
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (requestVersion !== coinStatusRequestVersionRef.current) return

      if (sessionError) {
        console.warn(
          'Coin status session check failed; keeping last confirmed balance:',
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

      if (requestVersion !== coinStatusRequestVersionRef.current) return

      if (error) {
        console.warn(
          'Failed to refresh coin balance; keeping last confirmed balance:',
          error
        )
        return
      }

      const rawRow = Array.isArray(data) ? data[0] : data

      if (!rawRow || typeof rawRow !== 'object') {
        console.warn(
          'Coin status RPC returned no usable row; keeping last confirmed balance:',
          data
        )
        return
      }

      const row = rawRow as CoinStatusRow
      const parsedBalance = Number(row.balance)

      if (!Number.isFinite(parsedBalance)) {
        console.warn(
          'Coin status RPC returned an invalid balance; keeping last confirmed balance:',
          data
        )
        return
      }

      setCoinBalance(Math.max(parsedBalance, 0))
    } catch (error) {
      if (requestVersion !== coinStatusRequestVersionRef.current) return

      console.warn(
        'Unexpected coin balance refresh failure; keeping last confirmed balance:',
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
         * Invalidate requests still running for the old session.
         */
        coinStatusRequestVersionRef.current += 1
        setCoinBalance(0)
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


  const mainContent = useMemo(() => {
    if (children) return children

    if (isProPage) {
      return <ProPackagesPage />
    }

    return <Outlet />
  }, [children, isProPage])

  return (
    <div className="min-h-screen flex bg-gray-100">
      <Sidebar collapsed={collapsed} />

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

        <main className="p-6 lg:p-8 flex-1 overflow-auto">
          {mainContent}
        </main>

        <Footer />
      </div>

      {showInactivityWarning ? (
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

    </div>
  )
}