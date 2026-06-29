/**
 * Equipment.tsx
 * High-level Equipment dashboard with tab navigation and club resolution.
 *
 * Responsibilities:
 * - Resolve the active club for the signed-in user.
 * - Render tab navigation for equipment sections.
 * - Read the active equipment tab from the URL.
 * - Delegate content rendering to tab components (overview, inventory, market, race supplies).
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import TutorialOverlay from '../../components/tutorial/TutorialOverlay'
import {
  equipmentTutorialSteps,
  equipmentWelcomeTutorial,
} from '../../lib/tutorials'
import {
  getTutorialProgress,
  saveTutorialProgress,
} from '../../lib/tutorialProgress'
import EquipmentOverviewTab from './equipment/components/EquipmentOverviewTab'
import EquipmentInventoryTab from './equipment/components/EquipmentInventoryTab'
import EquipmentMarketTab from './equipment/components/EquipmentMarketTab'
import EquipmentRaceSuppliesTab from './equipment/components/EquipmentRaceSuppliesTab'

/**
 * EquipmentTabKey
 * URL-safe equipment tab keys.
 */
type EquipmentTabKey =
  | 'overview'
  | 'inventory'
  | 'market'
  | 'race-supplies'

/**
 * ClubContext
 * Minimal club context needed by the Equipment module.
 */
type ClubContext = {
  id: string
  name: string | null
}

/**
 * normalizeEquipmentTab
 * Converts URL/state tab values into the internal Equipment tab key.
 */
function normalizeEquipmentTab(value: unknown): EquipmentTabKey | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim()
  if (!normalized) return null

  switch (normalized) {
    case 'overview':
      return 'overview'

    case 'inventory':
      return 'inventory'

    case 'market':
      return 'market'

    case 'race-supplies':
    case 'raceSupplies':
    case 'race_supplies':
    case 'race supplies':
    case 'supplies':
    case 'race-supply':
    case 'raceSupply':
    case 'race_supply':
      return 'race-supplies'

    default:
      return null
  }
}

/**
 * getTabFromSearchParams
 * Reads supported tab params from URLSearchParams.
 */
function getTabFromSearchParams(params: URLSearchParams): EquipmentTabKey | null {
  return (
    normalizeEquipmentTab(params.get('tab')) ||
    normalizeEquipmentTab(params.get('section')) ||
    normalizeEquipmentTab(params.get('subTab')) ||
    normalizeEquipmentTab(params.get('sub_tab')) ||
    normalizeEquipmentTab(params.get('equipmentTab')) ||
    null
  )
}

/**
 * getTabFromPathname
 * Supports route-style URLs such as:
 * - /dashboard/equipment/race-supplies
 */
function getTabFromPathname(pathname: string): EquipmentTabKey | null {
  const parts = pathname
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)

  const lastPart = parts[parts.length - 1]

  return normalizeEquipmentTab(lastPart)
}

/**
 * getEquipmentTabFromUrl
 * Resolves the active Equipment tab from supported URL params.
 *
 * Supported examples:
 * - /dashboard/equipment?tab=race-supplies
 * - /dashboard/equipment?tab=raceSupplies
 * - /dashboard/equipment?tab=race_supplies
 * - /dashboard/equipment?section=supplies
 * - /dashboard/equipment/race-supplies
 */
function getEquipmentTabFromUrl(): EquipmentTabKey {
  if (typeof window === 'undefined') return 'overview'

  const searchTab = getTabFromSearchParams(
    new URLSearchParams(window.location.search)
  )

  if (searchTab) return searchTab

  const hash = window.location.hash || ''
  const hashQueryIndex = hash.indexOf('?')

  if (hashQueryIndex >= 0) {
    const hashTab = getTabFromSearchParams(
      new URLSearchParams(hash.slice(hashQueryIndex + 1))
    )

    if (hashTab) return hashTab
  }

  const pathTab = getTabFromPathname(window.location.pathname)
  if (pathTab) return pathTab

  return 'overview'
}

/**
 * setEquipmentTabInUrl
 * Keeps the URL in sync when the user changes tabs manually.
 */
function setEquipmentTabInUrl(tab: EquipmentTabKey): void {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)

  if (tab === 'overview') {
    url.searchParams.delete('tab')
  } else {
    url.searchParams.set('tab', tab)
  }

  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`
  )
}

/**
 * getEquipmentTabForTutorialStepKey
 * Maps tutorial step keys to the Equipment tab that should be visible.
 */
function getEquipmentTabForTutorialStepKey(
  stepKey?: string | null,
): EquipmentTabKey {
  switch (stepKey) {
    case 'equipment-inventory':
      return 'inventory'
    case 'equipment-market':
      return 'market'
    case 'equipment-race-supplies':
      return 'race-supplies'
    case 'equipment-overview':
    default:
      return 'overview'
  }
}

/**
 * tabs
 * Equipment dashboard tab configuration.
 */
const tabs: Array<{ key: EquipmentTabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'market', label: 'Market' },
  { key: 'race-supplies', label: 'Race Supplies' },
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
  const [activeTab, setActiveTab] = useState<EquipmentTabKey>(() =>
    getEquipmentTabFromUrl()
  )
  const [club, setClub] = useState<ClubContext | null>(null)
  const [loadingClub, setLoadingClub] = useState(true)
  const [clubError, setClubError] = useState<string | null>(null)

  const navigate = useNavigate()

  const [tutorialLoading, setTutorialLoading] = useState(true)
  const [tutorialMode, setTutorialMode] = useState<
    'closed' | 'invite' | 'steps'
  >('closed')
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0)

  /**
   * Sync active tab when browser URL changes.
   * This is important for notification buttons such as:
   * /dashboard/equipment?tab=race-supplies
   */
  useEffect(() => {
    const syncTabFromUrl = () => {
      const nextTab = getEquipmentTabFromUrl()

      setActiveTab((currentTab) =>
        currentTab === nextTab ? currentTab : nextTab
      )
    }

    syncTabFromUrl()

    window.addEventListener('popstate', syncTabFromUrl)
    window.addEventListener('hashchange', syncTabFromUrl)

    return () => {
      window.removeEventListener('popstate', syncTabFromUrl)
      window.removeEventListener('hashchange', syncTabFromUrl)
    }
  }, [])

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
        const { data: authData, error: authError } =
          await supabase.auth.getUser()

        if (authError) throw authError
        if (!authData.user) throw new Error('Not authenticated')

        let primaryClubId: string | null = null

        const { data: primaryClubData } = await supabase.rpc(
          'get_my_primary_club_id'
        )

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

  useEffect(() => {
    let alive = true

    async function loadEquipmentTutorialProgress() {
      setTutorialLoading(true)

      const autoStartTutorial =
        window.sessionStorage.getItem('ppm:auto-start-tutorial') === 'equipment'

      if (autoStartTutorial) {
        window.sessionStorage.removeItem('ppm:auto-start-tutorial')

        const firstStep = equipmentTutorialSteps[0]

        await saveTutorialProgress('equipment', 'started', firstStep?.key ?? null)

        if (!alive) return

        setActiveTab('overview')
        setEquipmentTabInUrl('overview')
        setTutorialStepIndex(0)
        setTutorialMode('steps')
        setTutorialLoading(false)
        return
      }

      const progress = await getTutorialProgress('equipment')

      if (!alive) return

      if (progress?.status === 'started') {
        const savedStepIndex = equipmentTutorialSteps.findIndex(
          (step) => step.key === progress.last_step_key,
        )

        const nextStepIndex = savedStepIndex >= 0 ? savedStepIndex : 0
        const nextStep = equipmentTutorialSteps[nextStepIndex]

        setActiveTab(getEquipmentTabForTutorialStepKey(nextStep?.key))
        setEquipmentTabInUrl(getEquipmentTabForTutorialStepKey(nextStep?.key))
        setTutorialStepIndex(nextStepIndex)
        setTutorialMode('steps')
      } else {
        setTutorialMode('closed')
      }

      setTutorialLoading(false)
    }

    void loadEquipmentTutorialProgress()

    return () => {
      alive = false
    }
  }, [])

  /**
   * handleTabChange
   * Switch active Equipment tab and keep URL query aligned.
   */
  function handleTabChange(tab: EquipmentTabKey): void {
    setActiveTab(tab)
    setEquipmentTabInUrl(tab)
  }

  async function handleStartEquipmentTutorial() {
    const firstStep = equipmentTutorialSteps[0]

    await saveTutorialProgress('equipment', 'started', firstStep?.key ?? null)

    setActiveTab('overview')
    setEquipmentTabInUrl('overview')
    setTutorialStepIndex(0)
    setTutorialMode('steps')
  }

  async function handleSkipEquipmentTutorial() {
    await saveTutorialProgress('equipment', 'skipped', null)
    setTutorialMode('closed')
  }

  async function handleNextEquipmentTutorialStep() {
    const currentStep = equipmentTutorialSteps[tutorialStepIndex]
    const isLastStep = tutorialStepIndex >= equipmentTutorialSteps.length - 1

    if (!isLastStep) {
      const nextIndex = tutorialStepIndex + 1
      const nextStep = equipmentTutorialSteps[nextIndex]
      const nextTab = getEquipmentTabForTutorialStepKey(nextStep.key)

      setActiveTab(nextTab)
      setEquipmentTabInUrl(nextTab)

      await saveTutorialProgress('equipment', 'started', nextStep.key)

      setTutorialStepIndex(nextIndex)
      return
    }

    await saveTutorialProgress('equipment', 'completed', currentStep?.key ?? null)

    window.sessionStorage.setItem('ppm:auto-start-tutorial', 'facilities')
    navigate('/dashboard/infrastructure')
  }

  async function handleFinishEquipmentTutorialForNow() {
    const currentStep = equipmentTutorialSteps[tutorialStepIndex]

    await saveTutorialProgress('equipment', 'completed', currentStep?.key ?? null)

    setTutorialMode('closed')
  }

  async function handleCloseEquipmentTutorial() {
    const currentStep = equipmentTutorialSteps[tutorialStepIndex]

    if (tutorialMode === 'invite') {
      await saveTutorialProgress('equipment', 'skipped', null)
      setTutorialMode('closed')
      return
    }

    if (tutorialMode === 'steps') {
      await saveTutorialProgress(
        'equipment',
        'started',
        currentStep?.key ?? null,
      )
    }

    setTutorialMode('closed')
  }

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

    if (activeTab === 'race-supplies') {
      return <EquipmentRaceSuppliesTab clubId={club.id} />
    }

    return <EquipmentOverviewTab clubId={club.id} />
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
        {tabs.map((tab) => (
          <TabButton
            key={tab.key}
            active={activeTab === tab.key}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </TabButton>
        ))}
      </div>

      {activeContent}

      {!tutorialLoading && tutorialMode === 'invite' ? (
        <TutorialOverlay
          open
          variant="invite"
          title={equipmentWelcomeTutorial.title}
          body={equipmentWelcomeTutorial.body}
          primaryAction={equipmentWelcomeTutorial.primaryAction}
          secondaryAction={equipmentWelcomeTutorial.secondaryAction}
          onPrimary={handleStartEquipmentTutorial}
          onSecondary={handleSkipEquipmentTutorial}
          onClose={handleCloseEquipmentTutorial}
        />
      ) : null}

      {!tutorialLoading && tutorialMode === 'steps' ? (
        <TutorialOverlay
          open
          variant="panel"
          title={equipmentTutorialSteps[tutorialStepIndex].title}
          body={equipmentTutorialSteps[tutorialStepIndex].body}
          stepLabel={`${tutorialStepIndex + 1}/${equipmentTutorialSteps.length}`}
          primaryAction={
            equipmentTutorialSteps[tutorialStepIndex].primaryAction ?? 'Next'
          }
          secondaryAction={
            tutorialStepIndex === equipmentTutorialSteps.length - 1
              ? equipmentTutorialSteps[tutorialStepIndex].secondaryAction
              : 'Skip tutorial'
          }
          onPrimary={handleNextEquipmentTutorialStep}
          onSecondary={
            tutorialStepIndex === equipmentTutorialSteps.length - 1
              ? handleFinishEquipmentTutorialForNow
              : handleSkipEquipmentTutorial
          }
          onClose={handleCloseEquipmentTutorial}
        />
      ) : null}
    </div>
  )
}