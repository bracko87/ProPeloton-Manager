/**
 * Equipment.tsx
 * High-level Equipment dashboard with tab navigation and club resolution.
 *
 * Responsibilities:
 * - Resolve the active club for the signed-in user.
 * - Render tab navigation for equipment sections.
 * - Delegate content rendering to tab components (overview, inventory, market, race supplies).
 */

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { EquipmentTabKey } from './equipment/types'
import EquipmentOverviewTab from './equipment/components/EquipmentOverviewTab'
import EquipmentInventoryTab from './equipment/components/EquipmentInventoryTab'
import EquipmentMarketTab from './equipment/components/EquipmentMarketTab'
import EquipmentRaceSuppliesTab from './equipment/components/EquipmentRaceSuppliesTab'

/**
 * ClubContext
 * Minimal club context needed by the Equipment module.
 */
type ClubContext = {
  id: string
  name: string | null
}

/**
 * tabs
 * Equipment dashboard tab configuration.
 */
const tabs: Array<{ key: EquipmentTabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'market', label: 'Market' },
  { key: 'race_supplies', label: 'Race Supplies' },
]

/**
 * TabButton
 * Matches the Finance page tab button design.
 */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-md text-sm font-medium transition ${
        active ? 'bg-yellow-400 text-black' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * EquipmentPage
 * Entry point for the Equipment dashboard inside the club dashboard shell.
 */
export default function EquipmentPage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<EquipmentTabKey>('overview')
  const [club, setClub] = useState<ClubContext | null>(null)
  const [loadingClub, setLoadingClub] = useState(true)
  const [clubError, setClubError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    /**
     * loadClub
     * Resolve the primary club for the authenticated user, falling back to main club ownership.
     */
    async function loadClub(): Promise<void> {
      setLoadingClub(true)
      setClubError(null)

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()

        if (authError) throw authError
        if (!authData.user) throw new Error('Not authenticated')

        let primaryClubId: string | null = null

        const { data: primaryClubData } = await supabase.rpc('get_my_primary_club_id')

        if (typeof primaryClubData === 'string') {
          primaryClubId = primaryClubData
        }

        if (primaryClubId) {
          const { data, error } = await supabase
            .from('clubs')
            .select('id, name')
            .eq('id', primaryClubId)
            .maybeSingle()

          if (error) throw error
          if (data && !cancelled) {
            setClub({ id: data.id, name: data.name })
            return
          }
        }

        const { data: fallbackClub, error: fallbackError } = await supabase
          .from('clubs')
          .select('id, name')
          .eq('owner_user_id', authData.user.id)
          .eq('club_type', 'main')
          .limit(1)
          .maybeSingle()

        if (fallbackError) throw fallbackError
        if (!fallbackClub) throw new Error('No main club found for this user')

        if (!cancelled) {
          setClub({ id: fallbackClub.id, name: fallbackClub.name })
        }
      } catch (error) {
        if (!cancelled) {
          setClubError(error instanceof Error ? error.message : 'Failed to load club')
        }
      } finally {
        if (!cancelled) {
          setLoadingClub(false)
        }
      }
    }

    void loadClub()

    return () => {
      cancelled = true
    }
  }, [])

  /**
   * activeContent
   * Memoized tab content based on the current tab and resolved club.
   */
  const activeContent = useMemo(() => {
    if (!club) return null

    if (activeTab === 'overview') {
      return <EquipmentOverviewTab clubId={club.id} />
    }

    if (activeTab === 'inventory') {
      return <EquipmentInventoryTab clubId={club.id} />
    }

    if (activeTab === 'market') {
      return <EquipmentMarketTab clubId={club.id} />
    }

    return <EquipmentRaceSuppliesTab clubId={club.id} />
  }, [activeTab, club])

  if (loadingClub) {
    return (
      <div className="w-full p-4">
        <div className="rounded-lg bg-white p-6 shadow-sm text-sm text-gray-600">
          Loading equipment...
        </div>
      </div>
    )
  }

  if (clubError || !club) {
    return (
      <div className="w-full p-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {clubError ?? 'Unable to load Equipment page.'}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Equipment</h2>
        <div className="mt-1 text-sm text-gray-500">
          Manage team equipment, default setup, inventory actions, market purchases, and race supplies.
        </div>
      </div>

      <div className="mb-5 inline-flex rounded-lg bg-white border border-gray-100 p-1 shadow-sm flex-wrap">
        {tabs.map(tab => (
          <TabButton
            key={tab.key}
            active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </TabButton>
        ))}
      </div>

      {activeContent}
    </div>
  )
}