/**
 * MainLayout.tsx
 * Layout used for in-game pages: retractable sidebar, header, content, and footer with game-time.
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
  name: string
  countryCode: string
  countryName: string
  logoUrl: string | null
}

/**
 * MainLayout
 * Wraps dashboard pages with consistent header, sidebar and footer.
 */
export default function MainLayout({ children }: MainLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [clubUi, setClubUi] = useState<ClubUiState>({
    name: 'ProPeloton Manager',
    countryCode: '',
    countryName: '',
    logoUrl: null
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
        .select('name, country_code, logo_path')
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
        if (
          club.logo_path.startsWith('http://') ||
          club.logo_path.startsWith('https://')
        ) {
          logoUrl = club.logo_path
        } else {
          const { data: signedData, error: signedError } = await supabase.storage
            .from('club-logos')
            .createSignedUrl(club.logo_path, 60 * 60)

          if (!signedError && signedData?.signedUrl) {
            logoUrl = signedData.signedUrl
          } else {
            const { data: publicData } = supabase.storage
              .from('club-logos')
              .getPublicUrl(club.logo_path)

            if (publicData?.publicUrl) {
              logoUrl = publicData.publicUrl
            }
          }
        }
      }

      if (!mounted) return

      setClubUi({
        name: club.name,
        countryCode: club.country_code,
        countryName,
        logoUrl
      })
    }

    loadClubUi()

    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="min-h-screen flex bg-gray-100">
      <Sidebar collapsed={collapsed} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onToggle={() => setCollapsed(v => !v)}
          clubName={clubUi.name}
          clubCountryCode={clubUi.countryCode}
          clubCountryName={clubUi.countryName}
          clubLogoUrl={clubUi.logoUrl}
          onNavigate={(path) => navigate(path)}
        />

        <main className="p-6 lg:p-8 flex-1 overflow-auto">
          {children ?? <Outlet />}
        </main>

        <Footer />
      </div>
    </div>
  )
}