// MainLayout.tsx
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
 *   - Unlock and restore navigation
 *   - Optional: return to the last page the user was on before locking
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router'
import Sidebar from './Sidebar'
import Header from './Header'
import Footer from './Footer'
import { supabase } from '../../lib/supabase'

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

const COINS_NEEDED_TO_PLAY = 2

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
    return (
      location.pathname === '/dashboard/pro' ||
      location.pathname === '/dashboard/pro-packages'
    )
  }, [location.pathname])

  // Remember where the user was before lock, so we can optionally send them back after top-up.
  const lastNonProPathRef = useRef<string>('/dashboard/overview')

  // Update the ref whenever the user is on a non-pro page
  useEffect(() => {
    if (!isProPage) {
      lastNonProPathRef.current = location.pathname + (location.search ?? '') + (location.hash ?? '')
    }
  }, [isProPage, location.pathname, location.search, location.hash])

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
      // Works with HashRouter and normal SPA hosting
      if (typeof window !== 'undefined') {
        window.location.href = '/'
      } else {
        navigate('/')
      }
    }
  }, [navigate])

  useEffect(() => {
    let mounted = true

    const loadClubUi = async () => {
      const { data: userResult } = await supabase.auth.getUser()
      if (!userResult.user) return

      const { data: clubId, error: clubIdError } = await supabase.rpc('get_my_club_id')
      if (clubIdError || !clubId) return

      const { data: club, error: clubError } = await supabase
        .from('clubs')
        .select('id, name, country_code, logo_path')
        .eq('id', clubId)
        .single()

      if (clubError || !club) return

      let countryName = club.country_code || ''

      const { data: country } = await supabase
        .from('countries')
        .select('name')
        .eq('code', club.country_code)
        .maybeSingle()

      if (country?.name) countryName = country.name

      let logoUrl: string | null = null

      if (club.logo_path) {
        if (club.logo_path.startsWith('http://') || club.logo_path.startsWith('https://')) {
          logoUrl = club.logo_path
        } else {
          const { data: signedData, error: signedError } = await supabase.storage
            .from('club-logos')
            .createSignedUrl(club.logo_path, 60 * 60)

          if (!signedError && signedData?.signedUrl) {
            logoUrl = signedData.signedUrl
          } else {
            const { data: publicData } = supabase.storage.from('club-logos').getPublicUrl(club.logo_path)
            if (publicData?.publicUrl) logoUrl = publicData.publicUrl
          }
        }
      }

      if (!mounted) return

      setClubUi({
        id: club.id,
        name: club.name,
        countryCode: club.country_code,
        countryName,
        logoUrl,
      })
    }

    void Promise.all([loadClubUi(), loadCoinStatus()])

    // refresh coin status periodically (important after tick + after purchase webhook)
    const intervalId = window.setInterval(() => {
      void loadCoinStatus()
    }, 15000)

    // also refresh when user returns from Stripe tab/window
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void loadCoinStatus()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      mounted = false
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loadCoinStatus])

  /**
   * Lock behavior:
   * - If locked and not on pro page: show modal.
   * - If locked and on pro page: do NOT show modal (allow buying).
   * - If unlocked: hide modal and optionally restore last non-pro page if user is on pro page.
   */
  useEffect(() => {
    if (!canPlayToday) {
      // Locked
      if (!isProPage) {
        setShowLockModal(true)
      } else {
        setShowLockModal(false)
      }
      return
    }

    // Unlocked
    setShowLockModal(false)

    // Optional: if user topped up while on /dashboard/pro, send them back to last page.
    // If you prefer to keep them on pro page, remove this block.
    if (isProPage) {
      const backTo = lastNonProPathRef.current || '/dashboard/overview'
      navigate(backTo, { replace: true })
    }
  }, [canPlayToday, isProPage, navigate])

  // When locked, block everything EXCEPT pro pages. This is the key fix.
  const shouldBlockMain = !canPlayToday && !isProPage

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Sidebar: pass locked so it can restrict navigation (only Buy Coins + Sign Out) */}
      <Sidebar collapsed={collapsed} locked={!canPlayToday} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onToggle={() => setCollapsed((v) => !v)}
          clubId={clubUi.id}
          clubName={clubUi.name}
          clubCountryCode={clubUi.countryCode}
          clubCountryName={clubUi.countryName}
          clubLogoUrl={clubUi.logoUrl}
          onNavigate={(path) => navigate(path)}
          coinBalance={coinBalance}
        />

        {/* Main content blocked ONLY when locked and not on pro page */}
        <main className={`p-6 lg:p-8 flex-1 overflow-auto ${shouldBlockMain ? 'pointer-events-none select-none' : ''}`}>
          {children ?? <Outlet />}
        </main>

        <Footer />
      </div>

      {/* Paywall modal shown ONLY when locked and NOT on pro page */}
      {showLockModal ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 backdrop-blur-[3px] p-4 pointer-events-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-black/10 bg-white p-8 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="shrink-0 mt-1 h-12 w-12 rounded-full bg-red-100 flex items-center justify-center text-red-700 text-2xl">
                ⚠️
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-extrabold text-red-700">Coins required — gameplay is locked</h2>

                <p className="mt-2 text-base text-gray-700">
                  Your balance is <span className="font-bold text-black">◎ {coinBalance.toLocaleString()} Coins</span>.
                </p>

                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  You need at least <span className="font-semibold">{COINS_NEEDED_TO_PLAY} Coins</span> to continue playing
                  today. Buy coins to unlock your club, or log out and return to the home page.
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowLockModal(false)
                  navigate('/dashboard/pro')
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
              Tip: Once you have {COINS_NEEDED_TO_PLAY}+ coins again, you’ll be able to continue playing automatically.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}