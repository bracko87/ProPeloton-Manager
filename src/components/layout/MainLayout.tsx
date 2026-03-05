/**
 * MainLayout.tsx
 * Layout used for in-game pages: retractable sidebar, header, content, and footer with game-time.
 *
 * UPDATE:
 * - Adds coin-status check in dashboard load flow via supabase.rpc('get_my_coin_status')
 * - Stores coinBalance + canPlayToday in MainLayout state for app-wide gating
 * - Adds gameplay paywall modal + blocks interactions when canPlayToday is false
 */

import React, { useEffect, useState } from 'react'
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

/**
 * MainLayout
 * Wraps dashboard pages with consistent header, sidebar and footer.
 */
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

            if (publicData?.publicUrl) {
              logoUrl = publicData.publicUrl
            }
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

    const loadCoinStatus = async () => {
      const { data, error } = await supabase.rpc('get_my_coin_status')

      if (error) {
        console.error('Failed to load coin status:', error)

        if (!mounted) return

        setCoinBalance(0)
        setCanPlayToday(false)
        return
      }

      const row = ((data ?? []) as CoinStatusRow[])[0] ?? { balance: 0, can_play: false }

      if (!mounted) return

      setCoinBalance(Math.max(Number(row.balance ?? 0), 0))
      setCanPlayToday(Boolean(row.can_play))
    }

    void Promise.all([loadClubUi(), loadCoinStatus()])

    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="min-h-screen flex bg-gray-100">
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
        />

        <main className={`p-6 lg:p-8 flex-1 overflow-auto ${!canPlayToday ? 'pointer-events-none select-none' : ''}`}>
          {children ?? <Outlet />}
        </main>

        <Footer />
      </div>

      {!canPlayToday ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-black">You need more Coins to play today</h2>
            <p className="mt-2 text-sm text-gray-600">
              Your balance is <span className="font-semibold">◎ {coinBalance.toLocaleString()} Coins</span>.
            </p>
            <p className="mt-1 text-sm text-gray-600">
              At least <span className="font-semibold">{COINS_NEEDED_TO_PLAY} Coins</span> are required to continue
              gameplay.
            </p>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => navigate('/dashboard/pro')}
                className="rounded-md bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300"
              >
                Buy Coins
              </button>
              <button
                type="button"
                disabled
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-400 cursor-not-allowed"
              >
                Watch Video (Soon)
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}