// MainLayout.tsx
/**
 * MainLayout.tsx
 * Layout used for in-game pages: retractable sidebar, header, content, and footer with game-time.
 *
 * UPDATE:
 * - Loads coin status via supabase.rpc('get_my_coin_status')
 * - Passes coinBalance to <Header />
 * - Blocks gameplay when canPlayToday is false
 * - Shows paywall modal with stronger warning styling + logout button
 */

import React, { useEffect, useState, useCallback } from 'react'
import { Outlet, useNavigate } from 'react-router'
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
  const [clubUi, setClubUi] = useState<ClubUiState>({
    id: undefined,
    name: 'ProPeloton Manager',
    countryCode: '',
    countryName: '',
    logoUrl: null,
  })

  const navigate = useNavigate()

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

      if (country?.name) {
        countryName = country.name
      }

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

    // Refresh coin status periodically (useful after tick / later after purchases)
    const intervalId = window.setInterval(() => {
      void loadCoinStatus()
    }, 30000)

    return () => {
      mounted = false
      window.clearInterval(intervalId)
    }
  }, [loadCoinStatus])

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Lock the entire interactive UI (sidebar + header + main) when out of coins */}
      <div className={`flex min-h-screen w-full ${!canPlayToday ? 'pointer-events-none select-none' : ''}`}>
        <Sidebar collapsed={collapsed} />

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

          <main className="p-6 lg:p-8 flex-1 overflow-auto">
            {children ?? <Outlet />}
          </main>

          <Footer />
        </div>
      </div>

      {/* Paywall modal (bigger + stronger red warning + logout button) */}
      {!canPlayToday ? (
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
                  <span className="font-bold text-black">◎ {coinBalance.toLocaleString()} Coins</span>.
                </p>

                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  You need at least <span className="font-semibold">{COINS_NEEDED_TO_PLAY} Coins</span> to continue
                  playing today. Buy coins to unlock your club, or log out and return to the home page.
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => navigate('/dashboard/pro')}
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
              Tip: Once you have {COINS_NEEDED_TO_PLAY}+ coins again, refresh and you’ll be able to continue playing.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}