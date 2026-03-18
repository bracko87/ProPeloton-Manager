/**
 * MainLayout.tsx
 * Layout used for in-game pages: retractable sidebar, header, content, and footer with game-time.
 *
 * LOCK FLOW (corrected):
 * - When user has <2 coins:
 *   - Show a modal first (do NOT auto-redirect)
 *   - Modal offers: Buy Coins / Watch Video (disabled) / Log out
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
 * UPDATE: Active club auto-repair
 * - On layout mount, repair ppm-active-club from the user's true main club context.
 * - Broadcast a fresh club-updated event so listeners recover automatically.
 * - This fixes:
 *   - Mornar Bar BK broken state
 *   - future users after Developing Team purchase
 *   - stale localStorage after reload/sign-in
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react'
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
  balance: number
  can_play: boolean
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

export default function MainLayout({ children }: MainLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [coinBalance, setCoinBalance] = useState(0)
  const [canPlayToday, setCanPlayToday] = useState(true)

  // Controls whether the "locked" modal is currently shown.
  // We only show it when locked AND not on pro pages.
  const [showLockModal, setShowLockModal] = useState(false)

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
    const { data, error } = await supabase.rpc('get_my_coin_status')
    if (error) {
      console.error('Failed to load coin status:', error)
      setCoinBalance(0)
      setCanPlayToday(false)
      return
    }

    const row = ((data ?? []) as CoinStatusRow[])[0] ?? { balance: 0, can_play: false }
    setCoinBalance(Math.max(Number(row.balance ?? 0), 0))
    setCanPlayToday(Boolean(row.can_play))
  }, [])

  const handleLogoutAndHome = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } finally {
      clearMainClubStorage()

      if (typeof window !== 'undefined') {
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

    const intervalId = window.setInterval(() => {
      void loadCoinStatus()
    }, 15000)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void loadCoinStatus()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      mounted = false
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [clearMainClubStorage, loadCoinStatus, persistMainClubToStorage])

  /**
   * Lock behavior:
   * - If locked and not on pro page: show modal.
   * - If locked and on pro page: do NOT show modal (allow buying).
   * - If unlocked: hide modal and allow normal browsing (including staying on pro page).
   */
  useEffect(() => {
    if (!canPlayToday) {
      if (!isProPage) {
        setShowLockModal(true)
      } else {
        setShowLockModal(false)
      }
      return
    }

    setShowLockModal(false)
  }, [canPlayToday, isProPage])

  // When locked, block everything EXCEPT pro pages. This is the key fix.
  const shouldBlockMain = !canPlayToday && !isProPage

  const mainContent = useMemo(() => {
    if (children) return children

    if (isProPage) {
      return <ProPackagesPage />
    }

    return <Outlet />
  }, [children, isProPage])

  return (
    <div className="min-h-screen flex bg-gray-100">
      <Sidebar collapsed={collapsed} locked={!canPlayToday} />

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

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                disabled
                className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-400 cursor-not-allowed"
                title="Reward videos are coming soon"
              >
                Watch Video (Soon)
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