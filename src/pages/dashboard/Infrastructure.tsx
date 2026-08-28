/**
 * Infrastructure.tsx
 *
 * Queue-aware infrastructure page.
 *
 * Current responsibilities:
 * - Resolve MAIN club automatically.
 * - Read final infrastructure state from public.club_infrastructure.
 * - Read pending jobs from public.club_infrastructure_jobs.
 * - Read real facility upgrade config from public.infrastructure_facility_upgrade_config.
 * - Read asset config from public.infrastructure_asset_config.
 * - Read staff capacity from get_staff_role_capacity_overview_for_club.
 * - Read effective coaching / medical group effects.
 * - Start facility upgrades through Supabase Edge Function:
 *   UI Button -> Supabase Edge Function -> Database RPC / triggers.
 * - Cancel facility upgrade jobs through Supabase Edge Function:
 *   UI Button -> Supabase Edge Function -> Database RPC / triggers.
 * - Start supported asset delivery through Supabase Edge Function:
 *   UI Button -> Supabase Edge Function -> Database RPC / triggers.
 * - Cancel pending asset delivery through Supabase Edge Function:
 *   UI Button -> Supabase Edge Function -> Database RPC / triggers.
 * - Quote team car / team bus repair through Database RPC before confirmation.
 * - Confirm team car / team bus repair through Supabase Edge Function:
 *   UI Button -> Supabase Edge Function -> Database RPC / triggers.
 * - Quote team car / team bus sale through Database RPC before confirmation.
 * - Confirm team car / team bus sale through Supabase Edge Function:
 *   UI Button -> Supabase Edge Function -> Database RPC / triggers.
 * - Show real costs, game-day durations, connected staff unlocks/effects,
 *   pending game-time completion dates, cancellation refunds, and facility job slots.
 *
 * Image behavior:
 * - Exactly one image per facility.
 * - Images do not change by level.
 * - Modal uses item.imageUrl.
 *
 * Split behavior:
 * - This file stays as the page controller.
 * - Facilities UI lives in ./infrastructure/FacilitiesSection.
 * - Assets UI lives in ./infrastructure/AssetsSection.
 * - Shared config/types/utils live in ./infrastructure/*.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import TutorialOverlay from '../../components/tutorial/TutorialOverlay'
import TutorialTargetFrame from '../../components/tutorial/TutorialTargetFrame'
import {
  facilitiesTutorialSteps,
  facilitiesWelcomeTutorial,
} from '../../lib/tutorials'
import {
  getTutorialProgress,
  saveTutorialProgress,
} from '../../lib/tutorialProgress'
import { getMyClubContext } from '@/lib/clubContext'

import { FacilitiesSection } from './infrastructure/FacilitiesSection'
import { AssetsSection } from './infrastructure/AssetsSection'

import {
  assetConfig,
  assetNameMap,
  facilityConfig,
  facilityImageUrls,
  facilityNameMap,
} from './infrastructure/infrastructureConfig'

import {
  addGameDays,
  buildFacilityImpactLines,
  formatCash,
  formatGameDate,
  formatGameDays,
  normalizeSingleRow,
  toNumber,
} from './infrastructure/infrastructureHelpers'

import type {
  ActiveJobView,
  AssetDeliveryResponse,
  AssetKey,
  AssetSubTabKey,
  AssetActionAlert,
  ClubInfrastructureRow,
  CoachingEffectRow,
  EquipmentVanGarageSummaryRow,
  EquipmentVanRosterRow,
  FacilityJobCapacityRow,
  FacilityKey,
  FacilityUpgradeConfigRow,
  InfrastructureAssetActionTarget,
  InfrastructureAssetConfigRow,
  InfrastructureAssetRepairQuoteRow,
  InfrastructureAssetSaleQuoteRow,
  InfrastructureAssetSlotAccessMap,
  InfrastructureAssetRpcKey,
  InfrastructureCancellationQuoteRow,
  InfrastructureItem,
  InfrastructureJobRow,
  MedicalEffectRow,
  MedicalVanGarageSummaryRow,
  MedicalVanRosterRow,
  MobileWorkshopGarageSummaryRow,
  MobileWorkshopRosterRow,
  StaffCapacityRow,
  StaffRole,
  TabKey,
  TeamBusGarageSummaryRow,
  TeamBusRosterRow,
  TeamCarGarageSummaryRow,
  TeamCarRosterRow,
} from './infrastructure/infrastructureTypes'

type DeliverableAssetKey =
  | 'team_car'
  | 'team_bus'
  | 'equipment_van'
  | 'mobile_workshop'
  | 'medical_van'

const facilityTranslationKeysByName = {
  'Club House': {
    name: 'facilityNames.clubHouse',
    short: 'facilityDescriptions.clubHouseShort',
    long: 'facilityDescriptions.clubHouseLong',
  },
  'Training Center': {
    name: 'facilityNames.trainingCenter',
    short: 'facilityDescriptions.trainingCenterShort',
    long: 'facilityDescriptions.trainingCenterLong',
  },
  'Medical Center': {
    name: 'facilityNames.medicalCenter',
    short: 'facilityDescriptions.medicalCenterShort',
    long: 'facilityDescriptions.medicalCenterLong',
  },
  'Youth Academy': {
    name: 'facilityNames.youthAcademy',
    short: 'facilityDescriptions.youthAcademyShort',
    long: 'facilityDescriptions.youthAcademyLong',
  },
  'Mechanics Workshop': {
    name: 'facilityNames.mechanicsWorkshop',
    short: 'facilityDescriptions.mechanicsWorkshopShort',
    long: 'facilityDescriptions.mechanicsWorkshopLong',
  },
  'Scouting Office': {
    name: 'facilityNames.scoutingOffice',
    short: 'facilityDescriptions.scoutingOfficeShort',
    long: 'facilityDescriptions.scoutingOfficeLong',
  },
} as const

const assetTranslationKeysByName = {
  'Team Cars': 'assets.teamCars',
  'Team Car': 'assets.teamCar',
  'Team Car Fleet': 'assets.teamCarFleet',
  'Team Bus': 'assets.teamBus',
  'Equipment Van': 'assets.equipmentVan',
  'Mobile Workshop': 'assets.mobileWorkshop',
  'Medical Van': 'assets.medicalVan',
} as const

function getInfrastructureTabFromUrl(): TabKey {
  if (typeof window === 'undefined') return 'facilities'

  const hash = window.location.hash
  const hashQueryIndex = hash.indexOf('?')
  const hashQuery =
    hashQueryIndex >= 0 ? hash.slice(hashQueryIndex + 1) : ''

  const searchQuery = window.location.search.startsWith('?')
    ? window.location.search.slice(1)
    : window.location.search

  const params = new URLSearchParams(hashQuery || searchQuery)
  const tab = params.get('tab')

  return tab === 'assets' ? 'assets' : 'facilities'
}


function getAssetSubTabFromUrl(): AssetSubTabKey {
  if (typeof window === 'undefined') return 'team_cars'

  const hash = window.location.hash
  const hashQueryIndex = hash.indexOf('?')
  const hashQuery =
    hashQueryIndex >= 0 ? hash.slice(hashQueryIndex + 1) : ''

  const searchQuery = window.location.search.startsWith('?')
    ? window.location.search.slice(1)
    : window.location.search

  const params = new URLSearchParams(hashQuery || searchQuery)

  const assetKey =
    params.get('assetKey') ||
    params.get('asset_key') ||
    params.get('target_key')

  switch (assetKey) {
    case 'team_car':
      return 'team_cars'
    case 'team_bus':
      return 'team_bus'
    case 'equipment_van':
      return 'equipment_van'
    case 'mobile_workshop':
      return 'mobile_workshop'
    case 'medical_van':
      return 'medical_van'
    default:
      return 'team_cars'
  }
}

function updateInfrastructureTabUrl(nextTab: TabKey) {
  if (typeof window === 'undefined') return

  const hash = window.location.hash

  if (hash) {
    const rawHash = hash.startsWith('#') ? hash.slice(1) : hash
    const [hashPath, hashQuery = ''] = rawHash.split('?')
    const params = new URLSearchParams(hashQuery)

    params.set('tab', nextTab)

    const nextHash = `#${hashPath}?${params.toString()}`
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`

    window.history.replaceState(null, '', nextUrl)
    return
  }

  const params = new URLSearchParams(window.location.search)
  params.set('tab', nextTab)

  const nextUrl = `${window.location.pathname}?${params.toString()}`
  window.history.replaceState(null, '', nextUrl)
}

function AssetActionConfirmModal({
  modal,
  isProcessing,
  onClose,
  onConfirm,
}: {
  modal: {
    action: 'repair' | 'sell'
    target: InfrastructureAssetActionTarget
    loading: boolean
    error: string | null
    repairQuote: InfrastructureAssetRepairQuoteRow | null
    saleQuote: InfrastructureAssetSaleQuoteRow | null
  }
  isProcessing: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation('infrastructure')
  const isRepair = modal.action === 'repair'
  const repairQuote = modal.repairQuote
  const saleQuote = modal.saleQuote

  const canConfirm = isRepair
    ? !!repairQuote?.can_repair
    : !!saleQuote?.can_sell

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t('assetModal.closeAria')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      <div className="relative z-10 w-full max-w-xl rounded-2xl bg-white border border-gray-100 shadow-2xl">
        <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">
              {isRepair ? t('assetModal.repairAsset') : t('assetModal.sellAsset')}
            </div>

            <h3 className="text-xl font-semibold text-gray-900 mt-1">
              {modal.target.displayName}
            </h3>

            <p className="text-sm text-gray-500 mt-1">
              {t('assetModal.levelAsset', {
                level: modal.target.assetLevel,
                asset: modal.target.assetName,
              })}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
          >
            {t('common.close')}
          </button>
        </div>

        <div className="p-5">
          {modal.loading && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
              {t('assetModal.calculating')}
            </div>
          )}

          {modal.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {modal.error}
            </div>
          )}

          {!modal.loading && !modal.error && isRepair && repairQuote && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-900">
                  {t('assetModal.repairQuote')}
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-gray-400">{t('assetModal.currentCondition')}</div>
                    <div className="font-semibold text-gray-900">
                      {toNumber(repairQuote.condition_percent, 0).toFixed(0)}%
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-400">{t('assetModal.repairCost')}</div>
                    <div className="font-semibold text-gray-900">
                      {formatCash(repairQuote.repair_cost_cash)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-400">{t('assetModal.repairTime')}</div>
                    <div className="font-semibold text-gray-900">
                      {formatGameDays(repairQuote.duration_game_days)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-gray-500">
                  {repairQuote.reason}
                </div>
              </div>
            </div>
          )}

          {!modal.loading && !modal.error && !isRepair && saleQuote && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-900">
                  {t('assetModal.saleQuote')}
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-gray-400">{t('assetModal.purchaseCost')}</div>
                    <div className="font-semibold text-gray-900">
                      {formatCash(saleQuote.purchase_cost_cash)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-400">{t('common.condition')}</div>
                    <div className="font-semibold text-gray-900">
                      {toNumber(saleQuote.condition_percent, 0).toFixed(0)}%
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-400">{t('assetModal.moneyReceived')}</div>
                    <div className="font-semibold text-green-700">
                      {formatCash(saleQuote.sale_value_cash)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-gray-500">
                  {saleQuote.reason}
                </div>
              </div>

              <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700">
                {t('assetModal.sellingNotice')}
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={modal.loading || isProcessing || !canConfirm}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition ${
              modal.loading || isProcessing || !canConfirm
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : isRepair
                  ? 'bg-yellow-400 hover:bg-yellow-300 text-black'
                  : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
          >
            {isProcessing
              ? isRepair
                ? t('assetModal.startingRepair')
                : t('assetModal.selling')
              : isRepair
                ? t('assetModal.confirmRepair')
                : t('assetModal.confirmSale')}
          </button>
        </div>
      </div>
    </div>
  )
}

function getInfrastructureTabForTutorialStepKey(
  stepKey?: string | null,
): TabKey {
  switch (stepKey) {
    case 'facilities-assets':
      return 'assets'
    case 'facilities-buildings':
    case 'facilities-projects':
    default:
      return 'facilities'
  }
}

export default function InfrastructurePage({ clubId }: { clubId?: string }) {
  const { t } = useTranslation('infrastructure')
  const navigate = useNavigate()

  const [tutorialLoading, setTutorialLoading] = useState(true)
  const [tutorialMode, setTutorialMode] = useState<'closed' | 'invite' | 'steps'>('closed')
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0)

  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    getInfrastructureTabFromUrl(),
  )
  const [activeAssetSubTab, setActiveAssetSubTab] = useState<AssetSubTabKey>(() =>
    getAssetSubTabFromUrl(),
  )
  const [resolvedClubId, setResolvedClubId] = useState<string | null>(clubId ?? null)

  const [infrastructure, setInfrastructure] = useState<ClubInfrastructureRow | null>(null)
  const [pendingJobs, setPendingJobs] = useState<InfrastructureJobRow[]>([])
  const [facilityUpgradeConfig, setFacilityUpgradeConfig] = useState<FacilityUpgradeConfigRow[]>([])
  const [currentGameDate, setCurrentGameDate] = useState<string | null>(null)

  const [facilityJobCapacity, setFacilityJobCapacity] =
    useState<FacilityJobCapacityRow | null>(null)

  const [cancellationQuotesByJobId, setCancellationQuotesByJobId] = useState<
    Record<string, InfrastructureCancellationQuoteRow>
  >({})

  const [teamCarConfigRows, setTeamCarConfigRows] = useState<InfrastructureAssetConfigRow[]>([])
  const [teamCarRosterRows, setTeamCarRosterRows] = useState<TeamCarRosterRow[]>([])
  const [teamCarGarageSummary, setTeamCarGarageSummary] =
    useState<TeamCarGarageSummaryRow | null>(null)

  const [teamBusConfigRows, setTeamBusConfigRows] = useState<InfrastructureAssetConfigRow[]>([])
  const [teamBusRosterRows, setTeamBusRosterRows] = useState<TeamBusRosterRow[]>([])
  const [teamBusGarageSummary, setTeamBusGarageSummary] =
    useState<TeamBusGarageSummaryRow | null>(null)

  const [equipmentVanConfigRows, setEquipmentVanConfigRows] =
    useState<InfrastructureAssetConfigRow[]>([])
  const [equipmentVanRosterRows, setEquipmentVanRosterRows] =
    useState<EquipmentVanRosterRow[]>([])
  const [equipmentVanGarageSummary, setEquipmentVanGarageSummary] =
    useState<EquipmentVanGarageSummaryRow | null>(null)

  const [mobileWorkshopConfigRows, setMobileWorkshopConfigRows] =
    useState<InfrastructureAssetConfigRow[]>([])
  const [mobileWorkshopRosterRows, setMobileWorkshopRosterRows] =
    useState<MobileWorkshopRosterRow[]>([])
  const [mobileWorkshopGarageSummary, setMobileWorkshopGarageSummary] =
    useState<MobileWorkshopGarageSummaryRow | null>(null)

  const [medicalVanConfigRows, setMedicalVanConfigRows] =
    useState<InfrastructureAssetConfigRow[]>([])
  const [medicalVanRosterRows, setMedicalVanRosterRows] =
    useState<MedicalVanRosterRow[]>([])
  const [medicalVanGarageSummary, setMedicalVanGarageSummary] =
    useState<MedicalVanGarageSummaryRow | null>(null)


  const [assetSlotAccessByKey, setAssetSlotAccessByKey] =
    useState<InfrastructureAssetSlotAccessMap>({})
  const [unlockingAssetSlotKey, setUnlockingAssetSlotKey] =
    useState<string | null>(null)

  const [capacityRows, setCapacityRows] = useState<StaffCapacityRow[]>([])
  const [coachingEffect, setCoachingEffect] = useState<CoachingEffectRow | null>(null)
  const [medicalEffect, setMedicalEffect] = useState<MedicalEffectRow | null>(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [staffContextError, setStaffContextError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [assetActionAlert, setAssetActionAlert] = useState<AssetActionAlert | null>(null)

  const [assetActionModal, setAssetActionModal] = useState<{
    action: 'repair' | 'sell'
    target: InfrastructureAssetActionTarget
    loading: boolean
    error: string | null
    repairQuote: InfrastructureAssetRepairQuoteRow | null
    saleQuote: InfrastructureAssetSaleQuoteRow | null
  } | null>(null)

  const [assetActionProcessing, setAssetActionProcessing] = useState(false)

  const [processingKey, setProcessingKey] = useState<string | null>(null)
  const [cancelProcessingJobId, setCancelProcessingJobId] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(Date.now())

  const [selectedItemKey, setSelectedItemKey] = useState<{
    type: 'facility' | 'asset'
    id: FacilityKey | AssetKey
  } | null>(null)

  const lastZeroRefreshRef = useRef<number>(0)

  useEffect(() => {
    function syncTabFromUrl() {
      const nextTab = getInfrastructureTabFromUrl()

      setActiveTab(nextTab)

      if (nextTab === 'assets') {
        setActiveAssetSubTab(getAssetSubTabFromUrl())
      }
    }

    syncTabFromUrl()

    window.addEventListener('popstate', syncTabFromUrl)
    window.addEventListener('hashchange', syncTabFromUrl)

    return () => {
      window.removeEventListener('popstate', syncTabFromUrl)
      window.removeEventListener('hashchange', syncTabFromUrl)
    }
  }, [])

  function handleInfrastructureTabChange(nextTab: TabKey) {
    setActiveTab(nextTab)
    updateInfrastructureTabUrl(nextTab)
  }

  async function resolveClubId(): Promise<string | null> {
    if (clubId) {
      const { data: passedClub, error: passedClubError } = await supabase
        .from('clubs')
        .select('id, club_type, parent_club_id')
        .eq('id', clubId)
        .maybeSingle()

      if (passedClubError) throw new Error(passedClubError.message)

      if (passedClub) {
        if (passedClub.club_type === 'developing' && passedClub.parent_club_id) {
          return passedClub.parent_club_id
        }

        return passedClub.id
      }
    }

    const { mainClub } = await getMyClubContext()
    return mainClub?.id ?? null
  }

  async function fetchCurrentGameDate() {
    const { data, error } = await supabase.rpc('get_current_game_date_date')

    if (error) throw new Error(error.message)

    setCurrentGameDate((data as string | null) ?? null)
  }

  async function fetchFacilityUpgradeConfig() {
    const { data, error } = await supabase
      .from('infrastructure_facility_upgrade_config')
      .select(`
        facility_key,
        target_level,
        cost_cash,
        duration_game_days,
        unlock_summary,
        effect_summary
      `)
      .order('facility_key', { ascending: true })
      .order('target_level', { ascending: true })

    if (error) throw new Error(error.message)

    setFacilityUpgradeConfig((data ?? []) as FacilityUpgradeConfigRow[])
  }

  async function fetchAssetConfig(
    assetKey: DeliverableAssetKey,
    setter: React.Dispatch<React.SetStateAction<InfrastructureAssetConfigRow[]>>,
  ) {
    const { data, error } = await supabase
      .from('infrastructure_asset_config')
      .select(`
        asset_key,
        asset_level,
        asset_name,
        cost_cash,
        delivery_game_days,
        support_value,
        max_total_quantity,
        unlock_summary,
        effect_summary,
        condition_loss_per_race_day,
        repair_cost_per_condition_point,
        repair_points_per_game_day,
        min_assign_condition_percent,
        max_assigned_per_event
      `)
      .eq('asset_key', assetKey)
      .order('asset_level', { ascending: true })

    if (error) throw new Error(error.message)

    setter((data ?? []) as InfrastructureAssetConfigRow[])
  }

  async function fetchTeamCarContext(targetClubId: string) {
    const [rosterResult, summaryResult] = await Promise.all([
      supabase.rpc('get_club_team_car_roster', {
        p_club_id: targetClubId,
      }),
      supabase.rpc('get_club_team_car_garage_summary', {
        p_club_id: targetClubId,
      }),
    ])

    if (rosterResult.error) throw new Error(rosterResult.error.message)
    if (summaryResult.error) throw new Error(summaryResult.error.message)

    setTeamCarRosterRows((rosterResult.data ?? []) as TeamCarRosterRow[])
    setTeamCarGarageSummary(normalizeSingleRow<TeamCarGarageSummaryRow>(summaryResult.data))
  }

  async function handleRenameTeamCar(
    carId: string,
    displayName: string,
  ): Promise<void> {
    if (!resolvedClubId) {
      throw new Error('Club context is not available.')
    }

    const nextName = displayName.trim()

    if (!nextName) {
      throw new Error('Enter a Team Car name.')
    }

    const { error } = await supabase.rpc('rename_club_team_car_v1', {
      p_car_id: carId,
      p_display_name: nextName,
    })

    if (error) {
      throw new Error(error.message)
    }

    await fetchTeamCarContext(resolvedClubId)
  }


  async function handleRenameAsset(
    assetKey: 'team_bus' | 'equipment_van' | 'mobile_workshop' | 'medical_van',
    assetId: string,
    displayName: string,
  ): Promise<void> {
    if (!resolvedClubId) {
      throw new Error('Club context is not available.')
    }

    const nextName = displayName.trim()

    if (!nextName) {
      throw new Error('Enter an asset name.')
    }

    const { error } = await supabase.rpc('rename_club_asset_v1', {
      p_asset_key: assetKey,
      p_asset_id: assetId,
      p_display_name: nextName,
    })

    if (error) {
      throw new Error(error.message)
    }

    if (assetKey === 'team_bus') {
      await fetchTeamBusContext(resolvedClubId)
      return
    }

    if (assetKey === 'equipment_van') {
      await fetchEquipmentVanContext(resolvedClubId)
      return
    }

    if (assetKey === 'mobile_workshop') {
      await fetchMobileWorkshopContext(resolvedClubId)
      return
    }

    await fetchMedicalVanContext(resolvedClubId)
  }

  async function fetchTeamBusContext(targetClubId: string) {
    const [rosterResult, summaryResult] = await Promise.all([
      supabase.rpc('get_club_team_bus_roster', {
        p_club_id: targetClubId,
      }),
      supabase.rpc('get_club_team_bus_garage_summary', {
        p_club_id: targetClubId,
      }),
    ])

    if (rosterResult.error) throw new Error(rosterResult.error.message)
    if (summaryResult.error) throw new Error(summaryResult.error.message)

    setTeamBusRosterRows((rosterResult.data ?? []) as TeamBusRosterRow[])
    setTeamBusGarageSummary(normalizeSingleRow<TeamBusGarageSummaryRow>(summaryResult.data))
  }

  async function fetchEquipmentVanContext(targetClubId: string) {
    const [rosterResult, summaryResult] = await Promise.all([
      supabase.rpc('get_club_equipment_van_roster', {
        p_club_id: targetClubId,
      }),
      supabase.rpc('get_club_equipment_van_garage_summary', {
        p_club_id: targetClubId,
      }),
    ])

    if (rosterResult.error) throw new Error(rosterResult.error.message)
    if (summaryResult.error) throw new Error(summaryResult.error.message)

    setEquipmentVanRosterRows((rosterResult.data ?? []) as EquipmentVanRosterRow[])
    setEquipmentVanGarageSummary(
      normalizeSingleRow<EquipmentVanGarageSummaryRow>(summaryResult.data),
    )
  }

  async function fetchMobileWorkshopContext(targetClubId: string) {
    const [rosterResult, summaryResult] = await Promise.all([
      supabase.rpc('get_club_mobile_workshop_roster', {
        p_club_id: targetClubId,
      }),
      supabase.rpc('get_club_mobile_workshop_garage_summary', {
        p_club_id: targetClubId,
      }),
    ])

    if (rosterResult.error) throw new Error(rosterResult.error.message)
    if (summaryResult.error) throw new Error(summaryResult.error.message)

    setMobileWorkshopRosterRows((rosterResult.data ?? []) as MobileWorkshopRosterRow[])
    setMobileWorkshopGarageSummary(
      normalizeSingleRow<MobileWorkshopGarageSummaryRow>(summaryResult.data),
    )
  }

  async function fetchMedicalVanContext(targetClubId: string) {
    const [rosterResult, summaryResult] = await Promise.all([
      supabase.rpc('get_club_medical_van_roster', {
        p_club_id: targetClubId,
      }),
      supabase.rpc('get_club_medical_van_garage_summary', {
        p_club_id: targetClubId,
      }),
    ])

    if (rosterResult.error) throw new Error(rosterResult.error.message)
    if (summaryResult.error) throw new Error(summaryResult.error.message)

    setMedicalVanRosterRows((rosterResult.data ?? []) as MedicalVanRosterRow[])
    setMedicalVanGarageSummary(
      normalizeSingleRow<MedicalVanGarageSummaryRow>(summaryResult.data),
    )
  }

  async function fetchAssetSlotAccess(targetClubId: string) {
    const { data, error } = await supabase.rpc(
      'infrastructure_get_asset_slot_access_v1',
      {
        p_club_id: targetClubId,
      },
    )

    if (error) throw new Error(error.message)

    const payload = Array.isArray(data) ? data[0] : data
    const rows =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? ((payload as { assets?: unknown }).assets ?? [])
        : []

    const nextMap: InfrastructureAssetSlotAccessMap = {}

    if (Array.isArray(rows)) {
      rows.forEach(rawRow => {
        if (!rawRow || typeof rawRow !== 'object') return
        const row = rawRow as Record<string, unknown>
        const assetKey = row.asset_key as InfrastructureAssetRpcKey

        if (
          assetKey !== 'team_car' &&
          assetKey !== 'team_bus' &&
          assetKey !== 'equipment_van' &&
          assetKey !== 'mobile_workshop' &&
          assetKey !== 'medical_van'
        ) {
          return
        }

        nextMap[assetKey] = {
          asset_key: assetKey,
          free_slots: Number(row.free_slots ?? 0),
          premium_slots: Number(row.premium_slots ?? 0),
          absolute_max_slots: Number(row.absolute_max_slots ?? 0),
          effective_slots: Number(row.effective_slots ?? 0),
          highest_permanent_slot: Number(row.highest_permanent_slot ?? 0),
          permanently_unlocked_slots: Array.isArray(row.permanently_unlocked_slots)
            ? row.permanently_unlocked_slots.map(value => Number(value))
            : [],
          is_premium: Boolean(row.is_premium),
          coin_balance: Number(row.coin_balance ?? 0),
          coin_cost: Number(row.coin_cost ?? 20),
        }
      })
    }

    setAssetSlotAccessByKey(nextMap)
  }

  async function handleUnlockAssetSlot(
    assetKey: InfrastructureAssetRpcKey,
    slotNumber: number,
  ) {
    if (!resolvedClubId) return

    const unlockKey = `${assetKey}:${slotNumber}`

    try {
      setUnlockingAssetSlotKey(unlockKey)
      setActionError(null)
      setSuccessMessage(null)

      const { error } = await supabase.rpc(
        'infrastructure_unlock_asset_slot_v1',
        {
          p_club_id: resolvedClubId,
          p_asset_key: assetKey,
          p_slot_number: slotNumber,
        },
      )

      if (error) throw new Error(error.message)

      await fetchAssetSlotAccess(resolvedClubId)
      setSuccessMessage(
        `${assetNameMap[
          assetKey === 'team_car'
            ? 'team_car_fleet'
            : assetKey
        ] ?? 'Asset'} slot ${slotNumber} unlocked permanently.`,
      )

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('coin-balance-changed'))
      }
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Failed to unlock the garage slot.',
      )
    } finally {
      setUnlockingAssetSlotKey(null)
    }
  }

  async function fetchInfrastructure(targetClubId: string) {
    const { data, error } = await supabase
      .from('club_infrastructure')
      .select(`
        club_id,
        hq_level,
        training_center_level,
        medical_center_level,
        scouting_level,
        youth_academy_level,
        mechanics_workshop_level,
        team_car_fleet_quantity,
        team_bus_quantity,
        equipment_van_quantity,
        logistics_truck_quantity,
        mobile_workshop_quantity,
        medical_van_quantity
      `)
      .eq('club_id', targetClubId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) throw new Error('No infrastructure data found for this club')

    setInfrastructure(data as ClubInfrastructureRow)
  }

  async function fetchPendingJobs(targetClubId: string): Promise<InfrastructureJobRow[]> {
    const { data, error } = await supabase
      .from('club_infrastructure_jobs')
      .select(`
        id,
        club_id,
        job_type,
        target_key,
        status,
        facility_target_level,
        asset_quantity,
        asset_level,
        cost_cash,
        finance_transaction_id,
        started_at,
        complete_at,
        completed_at,
        created_at,
        duration_game_days,
        started_game_date,
        complete_game_date,
        metadata
      `)
      .eq('club_id', targetClubId)
      .eq('status', 'pending')
      .order('complete_game_date', { ascending: true, nullsFirst: false })
      .order('complete_at', { ascending: true })

    if (error) throw new Error(error.message)

    const rows = (data ?? []) as InfrastructureJobRow[]
    setPendingJobs(rows)
    return rows
  }

  async function fetchFacilityJobCapacity(targetClubId: string) {
    const { data, error } = await supabase.rpc('get_infrastructure_facility_job_capacity', {
      p_club_id: targetClubId,
    })

    if (error) throw new Error(error.message)

    setFacilityJobCapacity(normalizeSingleRow<FacilityJobCapacityRow>(data))
  }

  async function fetchCancellationQuotesForJobs(jobs: InfrastructureJobRow[]) {
    const facilityJobs = jobs.filter(
      job => job.job_type === 'facility_upgrade' && job.status === 'pending',
    )

    if (facilityJobs.length === 0) {
      setCancellationQuotesByJobId({})
      return
    }

    const results = await Promise.all(
      facilityJobs.map(async job => {
        const { data, error } = await supabase.rpc('quote_infrastructure_job_cancellation', {
          p_job_id: job.id,
        })

        if (error) {
          return null
        }

        const quote = normalizeSingleRow<InfrastructureCancellationQuoteRow>(data)
        return quote
      }),
    )

    const nextQuotes: Record<string, InfrastructureCancellationQuoteRow> = {}

    results.forEach(quote => {
      if (quote?.job_id) {
        nextQuotes[quote.job_id] = quote
      }
    })

    setCancellationQuotesByJobId(nextQuotes)
  }

  async function fetchStaffContext(targetClubId: string) {
    try {
      setStaffContextError(null)

      const [capacityResult, coachingResult, medicalResult] = await Promise.all([
        supabase.rpc('get_staff_role_capacity_overview_for_club', {
          p_club_id: targetClubId,
        }),
        supabase.rpc('get_head_coach_effects', {
          p_club_id: targetClubId,
        }),
        supabase.rpc('get_team_doctor_effects', {
          p_club_id: targetClubId,
        }),
      ])

      if (capacityResult.error) throw new Error(capacityResult.error.message)
      if (coachingResult.error) throw new Error(coachingResult.error.message)
      if (medicalResult.error) throw new Error(medicalResult.error.message)

      setCapacityRows((capacityResult.data ?? []) as StaffCapacityRow[])
      setCoachingEffect(normalizeSingleRow<CoachingEffectRow>(coachingResult.data))
      setMedicalEffect(normalizeSingleRow<MedicalEffectRow>(medicalResult.data))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load staff impact context'

      setCapacityRows([])
      setCoachingEffect(null)
      setMedicalEffect(null)
      setStaffContextError(message)
    }
  }

  async function fetchAllData(targetClubId: string) {
    const fetchResults = await Promise.all([
      fetchCurrentGameDate(),
      fetchFacilityUpgradeConfig(),
      fetchAssetConfig('team_car', setTeamCarConfigRows),
      fetchAssetConfig('team_bus', setTeamBusConfigRows),
      fetchAssetConfig('equipment_van', setEquipmentVanConfigRows),
      fetchAssetConfig('mobile_workshop', setMobileWorkshopConfigRows),
      fetchAssetConfig('medical_van', setMedicalVanConfigRows),
      fetchInfrastructure(targetClubId),
      fetchPendingJobs(targetClubId),
      fetchFacilityJobCapacity(targetClubId),
      fetchAssetSlotAccess(targetClubId),
    ])

    const jobs = fetchResults[8] as InfrastructureJobRow[]

    await Promise.all([
      fetchStaffContext(targetClubId),
      fetchTeamCarContext(targetClubId),
      fetchTeamBusContext(targetClubId),
      fetchEquipmentVanContext(targetClubId),
      fetchMobileWorkshopContext(targetClubId),
      fetchMedicalVanContext(targetClubId),
      fetchCancellationQuotesForJobs(jobs),
    ])
  }

  async function refreshPageData() {
    if (!resolvedClubId) return

    try {
      setRefreshing(true)
      setActionError(null)
      setAssetActionAlert(null)
      await fetchAllData(resolvedClubId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh infrastructure'
      setActionError(message)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    setAssetActionAlert(null)
    setAssetActionModal(null)
  }, [clubId])

  useEffect(() => {
    setAssetActionAlert(null)
    setAssetActionModal(null)
  }, [resolvedClubId])

  useEffect(() => {
    setAssetActionAlert(null)
    setAssetActionModal(null)
  }, [activeAssetSubTab])

  useEffect(() => {
    let isMounted = true

    async function loadPage() {
      try {
        setLoading(true)
        setLoadError(null)
        setActionError(null)
        setAssetActionAlert(null)
        setAssetActionModal(null)

        const currentClubId = await resolveClubId()

        if (!isMounted) return

        if (!currentClubId) {
          setResolvedClubId(null)
          setInfrastructure(null)
          setPendingJobs([])
          setFacilityJobCapacity(null)
          setCancellationQuotesByJobId({})
          setTeamCarRosterRows([])
          setTeamCarGarageSummary(null)
          setTeamBusRosterRows([])
          setTeamBusGarageSummary(null)
          setEquipmentVanConfigRows([])
          setEquipmentVanRosterRows([])
          setEquipmentVanGarageSummary(null)
          setMobileWorkshopConfigRows([])
          setMobileWorkshopRosterRows([])
          setMobileWorkshopGarageSummary(null)
          setMedicalVanConfigRows([])
          setMedicalVanRosterRows([])
          setMedicalVanGarageSummary(null)
          setAssetSlotAccessByKey({})
          setLoadError('No club found for current user')
          setLoading(false)
          return
        }

        setResolvedClubId(currentClubId)
        await fetchAllData(currentClubId)

        if (!isMounted) return
        setLoading(false)
      } catch (err) {
        if (!isMounted) return

        const message = err instanceof Error ? err.message : 'Failed to load infrastructure'

        setInfrastructure(null)
        setPendingJobs([])
        setFacilityJobCapacity(null)
        setCancellationQuotesByJobId({})
        setTeamCarRosterRows([])
        setTeamCarGarageSummary(null)
        setTeamBusRosterRows([])
        setTeamBusGarageSummary(null)
        setEquipmentVanConfigRows([])
        setEquipmentVanRosterRows([])
        setEquipmentVanGarageSummary(null)
        setMobileWorkshopConfigRows([])
        setMobileWorkshopRosterRows([])
        setMobileWorkshopGarageSummary(null)
        setMedicalVanConfigRows([])
        setMedicalVanRosterRows([])
        setMedicalVanGarageSummary(null)
        setLoadError(message)
        setLoading(false)
      }
    }

    void loadPage()

    return () => {
      isMounted = false
    }
  }, [clubId])

  useEffect(() => {
    let alive = true

    async function loadFacilitiesTutorialProgress() {
      setTutorialLoading(true)

      const autoStartTutorial =
        window.sessionStorage.getItem('ppm:auto-start-tutorial') === 'facilities'

      if (autoStartTutorial) {
        window.sessionStorage.removeItem('ppm:auto-start-tutorial')

        const firstStep = facilitiesTutorialSteps[0]

        await saveTutorialProgress('facilities', 'started', firstStep?.key ?? null)

        if (!alive) return

        setActiveTab('facilities')
        updateInfrastructureTabUrl('facilities')
        setTutorialStepIndex(0)
        setTutorialMode('steps')
        setTutorialLoading(false)
        return
      }

      const progress = await getTutorialProgress('facilities')

      if (!alive) return

      if (progress?.status === 'started') {
        const savedStepIndex = facilitiesTutorialSteps.findIndex(
          (step) => step.key === progress.last_step_key,
        )

        const nextStepIndex = savedStepIndex >= 0 ? savedStepIndex : 0
        const nextStep = facilitiesTutorialSteps[nextStepIndex]
        const nextTab = getInfrastructureTabForTutorialStepKey(nextStep?.key)

        setActiveTab(nextTab)
        updateInfrastructureTabUrl(nextTab)
        setTutorialStepIndex(nextStepIndex)
        setTutorialMode('steps')
      } else {
        setTutorialMode('closed')
      }

      setTutorialLoading(false)
    }

    void loadFacilitiesTutorialProgress()

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (!resolvedClubId) return

    const intervalId = window.setInterval(async () => {
      try {
        await fetchAllData(resolvedClubId)
      } catch {
        // Keep current UI state if background refresh fails.
      }
    }, 15000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [resolvedClubId])

  useEffect(() => {
    if (!resolvedClubId || pendingJobs.length === 0 || refreshing) return

    const hasOldDueJob = pendingJobs.some(job => {
      if (job.complete_game_date) return false
      return new Date(job.complete_at).getTime() <= nowMs
    })

    if (!hasOldDueJob) return

    const now = Date.now()
    if (now - lastZeroRefreshRef.current < 5000) return

    lastZeroRefreshRef.current = now
    void refreshPageData()
  }, [nowMs, pendingJobs, refreshing, resolvedClubId])

  const capacityByRole = useMemo(() => {
    const map = new Map<StaffRole, StaffCapacityRow>()
    capacityRows.forEach(row => map.set(row.role_type, row))
    return map
  }, [capacityRows])

  const facilityConfigsByKeyLevel = useMemo(() => {
    const map = new Map<string, FacilityUpgradeConfigRow>()

    facilityUpgradeConfig.forEach(row => {
      map.set(`${row.facility_key}:${row.target_level}`, row)
    })

    return map
  }, [facilityUpgradeConfig])

  const pendingFacilityJobsByKey = useMemo(() => {
    const map = new Map<FacilityKey, InfrastructureJobRow>()

    pendingJobs.forEach(job => {
      if (job.job_type === 'facility_upgrade') {
        map.set(job.target_key as FacilityKey, job)
      }
    })

    return map
  }, [pendingJobs])

  const pendingAssetJobsByKey = useMemo(() => {
    const map = new Map<AssetKey, InfrastructureJobRow>()

    pendingJobs.forEach(job => {
      if (job.job_type === 'asset_delivery') {
        map.set(job.target_key as AssetKey, job)
      }
    })

    return map
  }, [pendingJobs])

  const pendingTeamCarJobsByLevel = useMemo(() => {
    const map = new Map<number, InfrastructureJobRow[]>()

    pendingJobs.forEach(job => {
      if (
        job.job_type === 'asset_delivery' &&
        job.target_key === 'team_car' &&
        job.asset_level
      ) {
        const current = map.get(job.asset_level) ?? []
        current.push(job)
        map.set(job.asset_level, current)
      }
    })

    return map
  }, [pendingJobs])

  const pendingTeamCarJobs = useMemo(() => {
    return pendingJobs
      .filter(
        job =>
          job.job_type === 'asset_delivery' &&
          job.target_key === 'team_car' &&
          job.status === 'pending',
      )
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
  }, [pendingJobs])

  const pendingTeamCarQuantity = useMemo(() => {
    return pendingJobs.reduce((total, job) => {
      if (job.job_type === 'asset_delivery' && job.target_key === 'team_car') {
        return total + (job.asset_quantity ?? 1)
      }

      return total
    }, 0)
  }, [pendingJobs])

  const pendingTeamBusJobs = useMemo(() => {
    return pendingJobs
      .filter(
        job =>
          job.job_type === 'asset_delivery' &&
          job.target_key === 'team_bus' &&
          job.status === 'pending',
      )
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
  }, [pendingJobs])

  const pendingTeamBusJobsByLevel = useMemo(() => {
    const map = new Map<number, InfrastructureJobRow[]>()

    pendingTeamBusJobs.forEach(job => {
      const level = job.asset_level ?? 1
      const rows = map.get(level) ?? []
      rows.push(job)
      map.set(level, rows)
    })

    return map
  }, [pendingTeamBusJobs])

  const pendingTeamBusQuantity = useMemo(() => {
    return pendingTeamBusJobs.reduce((sum, job) => sum + (job.asset_quantity ?? 1), 0)
  }, [pendingTeamBusJobs])

  const pendingEquipmentVanJobs = useMemo(() => {
    return pendingJobs
      .filter(
        job =>
          job.job_type === 'asset_delivery' &&
          job.target_key === 'equipment_van' &&
          job.status === 'pending',
      )
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
  }, [pendingJobs])

  const pendingEquipmentVanJobsByLevel = useMemo(() => {
    const map = new Map<number, InfrastructureJobRow[]>()

    pendingEquipmentVanJobs.forEach(job => {
      const level = job.asset_level ?? 1
      const rows = map.get(level) ?? []
      rows.push(job)
      map.set(level, rows)
    })

    return map
  }, [pendingEquipmentVanJobs])

  const pendingEquipmentVanQuantity = useMemo(() => {
    return pendingEquipmentVanJobs.reduce(
      (sum, job) => sum + (job.asset_quantity ?? 1),
      0,
    )
  }, [pendingEquipmentVanJobs])

  const pendingMobileWorkshopJobs = useMemo(() => {
    return pendingJobs
      .filter(
        job =>
          job.job_type === 'asset_delivery' &&
          job.target_key === 'mobile_workshop' &&
          job.status === 'pending',
      )
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
  }, [pendingJobs])

  const pendingMobileWorkshopJobsByLevel = useMemo(() => {
    const map = new Map<number, InfrastructureJobRow[]>()

    pendingMobileWorkshopJobs.forEach(job => {
      const level = job.asset_level ?? 1
      const rows = map.get(level) ?? []
      rows.push(job)
      map.set(level, rows)
    })

    return map
  }, [pendingMobileWorkshopJobs])

  const pendingMobileWorkshopQuantity = useMemo(() => {
    return pendingMobileWorkshopJobs.reduce(
      (sum, job) => sum + (job.asset_quantity ?? 1),
      0,
    )
  }, [pendingMobileWorkshopJobs])

  const pendingMedicalVanJobs = useMemo(() => {
    return pendingJobs
      .filter(
        job =>
          job.job_type === 'asset_delivery' &&
          job.target_key === 'medical_van' &&
          job.status === 'pending',
      )
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
  }, [pendingJobs])

  const pendingMedicalVanJobsByLevel = useMemo(() => {
    const map = new Map<number, InfrastructureJobRow[]>()

    pendingMedicalVanJobs.forEach(job => {
      const level = job.asset_level ?? 1
      const rows = map.get(level) ?? []
      rows.push(job)
      map.set(level, rows)
    })

    return map
  }, [pendingMedicalVanJobs])

  const pendingMedicalVanQuantity = useMemo(() => {
    return pendingMedicalVanJobs.reduce(
      (sum, job) => sum + (job.asset_quantity ?? 1),
      0,
    )
  }, [pendingMedicalVanJobs])

  const activeJobs = useMemo<ActiveJobView[]>(() => {
    return pendingJobs.map(job => {
      if (job.job_type === 'facility_upgrade') {
        const rawFacilityName = facilityNameMap[job.target_key as FacilityKey] ?? job.target_key
        const facilityTranslation =
          rawFacilityName in facilityTranslationKeysByName
            ? facilityTranslationKeysByName[
                rawFacilityName as keyof typeof facilityTranslationKeysByName
              ]
            : null
        const facilityName = facilityTranslation
          ? t(facilityTranslation.name)
          : rawFacilityName

        return {
          id: job.id,
          name: facilityName,
          summary: t('facilities.upgradingTo', {
            level: job.facility_target_level ?? '?',
          }),
          completeAt: job.complete_at,
          completeGameDate: job.complete_game_date,
          durationGameDays: job.duration_game_days,
          costCash: job.cost_cash,
          type: job.job_type,
        }
      }

      const metadataAssetName =
        typeof job.metadata?.asset_name === 'string' ? job.metadata.asset_name : null

      const assetName =
        job.target_key === 'team_car'
          ? metadataAssetName ?? `${t('assets.teamCar')} ${t('common.level')} ${job.asset_level ?? '?'}`
          : job.target_key === 'team_bus'
            ? metadataAssetName ?? `${t('assets.teamBus')} ${t('common.level')} ${job.asset_level ?? '?'}`
            : job.target_key === 'equipment_van'
              ? metadataAssetName ?? `${t('assets.equipmentVan')} ${t('common.level')} ${job.asset_level ?? '?'}`
              : job.target_key === 'mobile_workshop'
                ? metadataAssetName ?? `${t('assets.mobileWorkshop')} ${t('common.level')} ${job.asset_level ?? '?'}`
                : job.target_key === 'medical_van'
                  ? metadataAssetName ?? `${t('assets.medicalVan')} ${t('common.level')} ${job.asset_level ?? '?'}`
                  : assetNameMap[job.target_key as AssetKey] ?? job.target_key

      return {
        id: job.id,
        name: assetName,
        summary:
          job.target_key === 'team_car'
            ? `${t('common.delivery')} x${job.asset_quantity ?? 1} · ${t('common.level')} ${job.asset_level ?? '?'}`
            : job.target_key === 'team_bus'
              ? `${t('common.delivery')} x${job.asset_quantity ?? 1} · ${t('common.level')} ${job.asset_level ?? '?'}`
              : job.target_key === 'equipment_van'
                ? `${t('common.delivery')} x${job.asset_quantity ?? 1} · ${t('common.level')} ${job.asset_level ?? '?'}`
                : job.target_key === 'mobile_workshop'
                  ? `${t('common.delivery')} x${job.asset_quantity ?? 1} · ${t('common.level')} ${job.asset_level ?? '?'}`
                  : job.target_key === 'medical_van'
                    ? `${t('common.delivery')} x${job.asset_quantity ?? 1} · ${t('common.level')} ${job.asset_level ?? '?'}`
                    : `${t('common.delivery')} x${job.asset_quantity ?? 1}`,
        completeAt: job.complete_at,
        completeGameDate: job.complete_game_date,
        durationGameDays: job.duration_game_days,
        costCash: job.cost_cash,
        type: job.job_type,
      }
    })
  }, [pendingJobs, t])

  const facilities = useMemo<InfrastructureItem[]>(() => {
    if (!infrastructure) return []

    const hasFacilitySlot = facilityJobCapacity?.can_start_facility_job ?? true

    return facilityConfig.map(item => {
      const level = item.getValue(infrastructure)
      const maxLevel = item.maxValue
      const isMaxed = level >= maxLevel
      const pendingJob = pendingFacilityJobsByKey.get(item.id) ?? null
      const nextLevel = Math.min(level + 1, maxLevel)

      const nextConfig =
        !pendingJob && !isMaxed
          ? facilityConfigsByKeyLevel.get(`${item.id}:${nextLevel}`) ?? null
          : null

      const facilityTranslation =
        item.name in facilityTranslationKeysByName
          ? facilityTranslationKeysByName[
              item.name as keyof typeof facilityTranslationKeysByName
            ]
          : null

      return {
        type: 'facility',
        id: item.id,
        name: facilityTranslation ? t(facilityTranslation.name) : item.name,
        description: facilityTranslation ? t(facilityTranslation.short) : item.description,
        longDescription: facilityTranslation ? t(facilityTranslation.long) : item.longDescription,
        imageUrl: facilityImageUrls[item.id] ?? null,
        currentValue: level,
        maxValue: maxLevel,
        owned: level > 0,
        canAct: !pendingJob && !isMaxed && !!nextConfig && hasFacilitySlot,
        actionLabel: pendingJob
          ? t('common.inProgress')
          : isMaxed
            ? t('common.maxLevel')
            : !hasFacilitySlot
              ? t('common.slotsFull')
              : nextConfig
                ? level > 0
                  ? t('common.upgrade')
                  : t('common.build')
                : t('common.configMissing'),
        badgeLabel: pendingJob
          ? t('common.inProgress')
          : level > 0
            ? t('common.built')
            : t('common.notBuilt'),
        valueLabel: t('facilities.currentLevel', { level, max: maxLevel }),
        pendingJob,
        pendingSummary: pendingJob
          ? t('facilities.queuedUpgrade', {
              level: pendingJob.facility_target_level ?? level + 1,
            })
          : null,
        previewCostCash: nextConfig?.cost_cash ?? null,
        previewDurationGameDays: nextConfig?.duration_game_days ?? null,
        previewCompleteGameDate: nextConfig
          ? addGameDays(currentGameDate, nextConfig.duration_game_days)
          : null,
        nextValueLabel: !pendingJob && !isMaxed
          ? t('facilities.nextLevelValue', { level: nextLevel })
          : null,
        unlockSummary: nextConfig
          ? t(`facilityUpgrades.${item.id}.level${nextLevel}.unlock`, {
              defaultValue: nextConfig.unlock_summary ?? '',
            })
          : null,
        effectSummary: nextConfig
          ? t(`facilityUpgrades.${item.id}.level${nextLevel}.effect`, {
              defaultValue: nextConfig.effect_summary ?? '',
            })
          : null,
        impactKind: item.impactKind,
        impactLines: buildFacilityImpactLines({
          kind: item.impactKind,
          level,
          capacityByRole,
          coachingEffect,
          medicalEffect,
        }),
      }
    })
  }, [
    infrastructure,
    pendingFacilityJobsByKey,
    facilityConfigsByKeyLevel,
    currentGameDate,
    capacityByRole,
    coachingEffect,
    medicalEffect,
    facilityJobCapacity,
    t,
  ])

  const assets = useMemo<InfrastructureItem[]>(() => {
    if (!infrastructure) return []

    return assetConfig.map(item => {
      const quantity = item.getValue(infrastructure)
      const pendingJob = pendingAssetJobsByKey.get(item.id) ?? null

      const assetTranslationKey =
        item.name in assetTranslationKeysByName
          ? assetTranslationKeysByName[item.name as keyof typeof assetTranslationKeysByName]
          : null

      return {
        type: 'asset',
        id: item.id,
        name: assetTranslationKey ? t(assetTranslationKey) : item.name,
        description: item.description,
        imageUrl: null,
        currentValue: quantity,
        owned: quantity > 0,
        canAct: false,
        actionLabel: 'Coming Later',
        badgeLabel: pendingJob ? 'Delivering' : quantity > 0 ? t('common.owned') : 'Planned',
        valueLabel: `Qty ${quantity}`,
        pendingJob,
        pendingSummary: pendingJob ? `Queued delivery x${pendingJob.asset_quantity ?? 1}` : null,
        previewCostCash: null,
        previewDurationGameDays: null,
        previewCompleteGameDate: null,
        nextValueLabel: 'Assets will be balanced after facility infrastructure is complete.',
      }
    })
  }, [infrastructure, pendingAssetJobsByKey, t])

  const selectedItem = useMemo(() => {
    if (!selectedItemKey) return null

    const allItems = [...facilities, ...assets]

    return (
      allItems.find(
        item => item.type === selectedItemKey.type && item.id === selectedItemKey.id,
      ) ?? null
    )
  }, [selectedItemKey, facilities, assets])

  async function startInfrastructureJob(item: InfrastructureItem) {
    if (!resolvedClubId) return

    if (item.type === 'asset') {
      throw new Error('Assets are disabled for now. Finish facility infrastructure first.')
    }

    const payload = {
      club_id: resolvedClubId,
      item_type: item.type,
      target_key: item.id,
    }

    const { data, error } = await supabase.functions.invoke('start-infrastructure-job', {
      body: payload,
    })

    if (error) {
      console.error('start-infrastructure-job invoke error:', error)
      throw new Error(error.message || 'Failed to send a request to the Edge Function')
    }

    if (data && typeof data === 'object' && 'error' in data && data.error) {
      throw new Error(String(data.error))
    }
  }

  async function handleItemAction(item: InfrastructureItem) {
    if (!resolvedClubId) return
    if (!item.canAct) return

    try {
      setProcessingKey(`${item.type}:${item.id}`)
      setActionError(null)
      setAssetActionAlert(null)
      setSuccessMessage(null)

      await startInfrastructureJob(item)
      await fetchAllData(resolvedClubId)

      setSuccessMessage(`${item.name} ${item.type === 'facility' ? 'upgrade/build' : 'delivery'} started.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start infrastructure job'
      setActionError(message)
    } finally {
      setProcessingKey(null)
    }
  }

  async function handleCancelInfrastructureJob(jobId: string) {
    if (!resolvedClubId) return

    try {
      setProcessingKey(`cancel:${jobId}`)
      setActionError(null)
      setAssetActionAlert(null)
      setSuccessMessage(null)

      const { data, error } = await supabase.functions.invoke('cancel-infrastructure-job', {
        body: {
          job_id: jobId,
        },
      })

      if (error) {
        console.error('cancel-infrastructure-job invoke error:', error)
        throw new Error(error.message || 'Failed to send cancellation request')
      }

      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error))
      }

      await fetchAllData(resolvedClubId)
      setSuccessMessage('Infrastructure job cancelled and refund processed.')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to cancel infrastructure job'

      setActionError(message)
    } finally {
      setProcessingKey(null)
    }
  }

  async function handleCancelDelivery(job: InfrastructureJobRow) {
    if (!resolvedClubId) return

    try {
      setCancelProcessingJobId(job.id)
      setActionError(null)
      setAssetActionAlert(null)
      setSuccessMessage(null)

      const { data, error } = await supabase.functions.invoke('cancel-infrastructure-job', {
        body: {
          job_id: job.id,
        },
      })

      if (error) {
        console.error('cancel-infrastructure-job delivery invoke error:', error)
        throw new Error(error.message || 'Failed to cancel delivery')
      }

      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error))
      }

      await fetchAllData(resolvedClubId)
      setSuccessMessage('Delivery cancelled. Full refund returned to the club.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel delivery'
      setActionError(message)
    } finally {
      setCancelProcessingJobId(null)
    }
  }

  async function handleOpenAssetRepair(target: InfrastructureAssetActionTarget) {
    try {
      setActionError(null)
      setSuccessMessage(null)
      setAssetActionAlert(null)

      setAssetActionModal({
        action: 'repair',
        target,
        loading: true,
        error: null,
        repairQuote: null,
        saleQuote: null,
      })

      const { data, error } = await supabase.rpc('quote_infrastructure_asset_repair', {
        p_asset_key: target.assetKey,
        p_asset_id: target.assetId,
      })

      if (error) throw new Error(error.message)

      const quote = normalizeSingleRow<InfrastructureAssetRepairQuoteRow>(data)

      setAssetActionModal({
        action: 'repair',
        target,
        loading: false,
        error: null,
        repairQuote: quote,
        saleQuote: null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to quote asset repair'

      setAssetActionModal(prev =>
        prev
          ? {
              ...prev,
              loading: false,
              error: message,
            }
          : null,
      )
    }
  }

  async function handleOpenAssetSell(target: InfrastructureAssetActionTarget) {
    try {
      setActionError(null)
      setSuccessMessage(null)
      setAssetActionAlert(null)

      setAssetActionModal({
        action: 'sell',
        target,
        loading: true,
        error: null,
        repairQuote: null,
        saleQuote: null,
      })

      const { data, error } = await supabase.rpc('quote_infrastructure_asset_sale', {
        p_asset_key: target.assetKey,
        p_asset_id: target.assetId,
      })

      if (error) throw new Error(error.message)

      const quote = normalizeSingleRow<InfrastructureAssetSaleQuoteRow>(data)

      setAssetActionModal({
        action: 'sell',
        target,
        loading: false,
        error: null,
        repairQuote: null,
        saleQuote: quote,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to quote asset sale'

      setAssetActionModal(prev =>
        prev
          ? {
              ...prev,
              loading: false,
              error: message,
            }
          : null,
      )
    }
  }

  async function handleConfirmAssetAction() {
    if (!resolvedClubId || !assetActionModal) return

    const { action, target } = assetActionModal

    try {
      setAssetActionProcessing(true)
      setActionError(null)
      setSuccessMessage(null)
      setAssetActionAlert(null)

      const functionName =
        action === 'repair'
          ? 'repair-infrastructure-asset'
          : 'sell-infrastructure-asset'

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          assetKey: target.assetKey,
          assetId: target.assetId,

          // Also send snake_case so the Edge Function works even if it expects DB-style names.
          asset_key: target.assetKey,
          asset_id: target.assetId,
        },
      })

      if (error) {
        console.error(`${functionName} invoke error:`, error)
        throw new Error(error.message || 'Failed to send a request to the Edge Function')
      }

      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error))
      }

      if (data && typeof data === 'object' && 'ok' in data && data.ok === false) {
        const message =
          'message' in data && data.message
            ? String(data.message)
            : 'Asset action was rejected by the server'

        throw new Error(message)
      }

      await fetchAllData(resolvedClubId)

      setSuccessMessage(
        action === 'repair'
          ? `${target.displayName} repair started.`
          : `${target.displayName} sold and removed from garage.`,
      )

      setAssetActionModal(null)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : assetActionModal.action === 'repair'
            ? 'Failed to start asset repair'
            : 'Failed to sell asset'

      setActionError(message)
    } finally {
      setAssetActionProcessing(false)
    }
  }

  async function handleStartAssetRepair({
    assetKey,
    assetId,
    assetLabel,
  }: {
    assetKey: 'team_car' | 'team_bus'
    assetId: string
    assetLabel: string
  }) {
    if (!resolvedClubId) return

    try {
      setProcessingKey(`repair:${assetKey}:${assetId}`)
      setActionError(null)
      setAssetActionAlert(null)
      setSuccessMessage(null)

      const { data, error } = await supabase.functions.invoke('repair-infrastructure-asset', {
        body: {
          assetKey,
          assetId,
        },
      })

      if (error) {
        console.error('repair-infrastructure-asset invoke error:', error)
        throw new Error(error.message || 'Failed to send repair request')
      }

      if (data && typeof data === 'object' && 'ok' in data && !data.ok) {
        throw new Error(String(data.error || 'Repair could not be started'))
      }

      await fetchAllData(resolvedClubId)

      setSuccessMessage(`${assetLabel} repair started.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start asset repair'
      setActionError(message)
    } finally {
      setProcessingKey(null)
    }
  }

  async function handleAssetAcquire({
    assetKey,
    assetLabel,
    assetLevel,
  }: {
    assetKey: 'team_car' | 'team_bus' | 'equipment_van' | 'mobile_workshop' | 'medical_van'
    assetLabel: string
    assetLevel: number
  }) {
    if (!resolvedClubId) return

    const currentClubId = resolvedClubId
    const quantity = 1

    try {
      setAssetActionAlert(null)
      setProcessingKey(`asset:${assetKey}:${assetLevel}`)
      setActionError(null)
      setSuccessMessage(null)

      const payload = {
        clubId: currentClubId,
        assetKey,
        assetLevel,
        quantity,
      }

      console.log('start-club-asset-delivery frontend payload', payload)

      const { data, error } = await supabase.functions.invoke<AssetDeliveryResponse>(
        'start-club-asset-delivery',
        {
          body: payload,
        },
      )

      if (error) {
        console.error('start-club-asset-delivery invoke error:', error)

        setAssetActionAlert({
          clubId: currentClubId,
          assetKey,
          code: 'SERVICE_UNAVAILABLE',
          title: 'Asset delivery service unavailable',
          message: 'Could not contact the asset delivery service. Please try again.',
        })
        return
      }

      if (!data?.ok) {
        const debugMessage =
          data?.technical_message
            ? `${data?.message || 'This asset cannot be acquired right now.'} Technical detail: ${data.technical_message}`
            : data?.message || 'This asset cannot be acquired right now.'

        setAssetActionAlert({
          clubId: currentClubId,
          assetKey,
          code: data?.code,
          title: data?.title || 'Asset acquisition blocked',
          message: debugMessage,
        })

        console.log('start-club-asset-delivery failed response', {
          data,
          currentClubId,
          assetKey,
          assetLevel,
          quantity,
        })

        return
      }

      setAssetActionAlert(null)

      await fetchAllData(currentClubId)
      setSuccessMessage(`${assetLabel} Level ${assetLevel} delivery started.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to start ${assetLabel} delivery`

      setAssetActionAlert({
        clubId: currentClubId,
        assetKey,
        code: 'ASSET_ACQUISITION_ERROR',
        title: 'Asset acquisition blocked',
        message,
      })
    } finally {
      setProcessingKey(null)
    }
  }

  async function handleTeamCarAcquire(assetLevel: number) {
    await handleAssetAcquire({
      assetKey: 'team_car',
      assetLabel: t('assets.teamCar'),
      assetLevel,
    })
  }

  async function handleTeamBusAcquire(assetLevel: number) {
    await handleAssetAcquire({
      assetKey: 'team_bus',
      assetLabel: t('assets.teamBus'),
      assetLevel,
    })
  }

  async function handleEquipmentVanAcquire(assetLevel: number) {
    await handleAssetAcquire({
      assetKey: 'equipment_van',
      assetLabel: t('assets.equipmentVan'),
      assetLevel,
    })
  }

  async function handleMobileWorkshopAcquire(assetLevel: number) {
    await handleAssetAcquire({
      assetKey: 'mobile_workshop',
      assetLabel: t('assets.mobileWorkshop'),
      assetLevel,
    })
  }

  async function handleMedicalVanAcquire(assetLevel: number) {
    await handleAssetAcquire({
      assetKey: 'medical_van',
      assetLabel: t('assets.medicalVan'),
      assetLevel,
    })
  }

  async function handleStartFacilitiesTutorial() {
    const firstStep = facilitiesTutorialSteps[0]

    await saveTutorialProgress('facilities', 'started', firstStep?.key ?? null)

    setActiveTab('facilities')
    updateInfrastructureTabUrl('facilities')
    setTutorialStepIndex(0)
    setTutorialMode('steps')
  }

  async function handleSkipFacilitiesTutorial() {
    await saveTutorialProgress('facilities', 'skipped', null)
    setTutorialMode('closed')
  }

  async function handleNextFacilitiesTutorialStep() {
    const currentStep = facilitiesTutorialSteps[tutorialStepIndex]
    const isLastStep = tutorialStepIndex >= facilitiesTutorialSteps.length - 1

    if (!isLastStep) {
      const nextIndex = tutorialStepIndex + 1
      const nextStep = facilitiesTutorialSteps[nextIndex]
      const nextTab = getInfrastructureTabForTutorialStepKey(nextStep.key)

      setActiveTab(nextTab)
      updateInfrastructureTabUrl(nextTab)

      await saveTutorialProgress('facilities', 'started', nextStep.key)

      setTutorialStepIndex(nextIndex)
      return
    }

    await saveTutorialProgress('facilities', 'completed', currentStep?.key ?? null)

    window.sessionStorage.setItem('ppm:auto-start-tutorial', 'calendar')
    navigate('/dashboard/calendar')
  }

  async function handleFinishFacilitiesTutorialForNow() {
    const currentStep = facilitiesTutorialSteps[tutorialStepIndex]

    await saveTutorialProgress('facilities', 'completed', currentStep?.key ?? null)

    setTutorialMode('closed')
  }

  async function handleCloseFacilitiesTutorial() {
    const currentStep = facilitiesTutorialSteps[tutorialStepIndex]

    if (tutorialMode === 'invite') {
      await saveTutorialProgress('facilities', 'skipped', null)
      setTutorialMode('closed')
      return
    }

    if (tutorialMode === 'steps') {
      await saveTutorialProgress(
        'facilities',
        'started',
        currentStep?.key ?? null,
      )
    }

    setTutorialMode('closed')
  }

  if (loading) {
    return (
      <div className="w-full">
        <div className="bg-white rounded-lg p-6 shadow border border-gray-100 text-sm text-gray-500">
          {t('page.loading')}
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="w-full">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          {loadError}
        </div>
      </div>
    )
  }

  if (!infrastructure) {
    return (
      <div className="w-full">
        <div className="bg-white rounded-lg p-6 shadow border border-gray-100 text-sm text-gray-500">
          {t('page.noData')}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{t('page.title')}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {t('page.description')}
          </p>

          {currentGameDate && (
            <p className="text-xs text-gray-400 mt-1">
              {t('page.currentGameDate')} {formatGameDate(currentGameDate)}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center self-start">
          <button
            type="button"
            onClick={refreshPageData}
            disabled={refreshing}
            className="px-4 py-2 rounded-lg bg-white border border-gray-100 shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {refreshing ? t('page.refreshing') : t('page.refresh')}
          </button>

          <div className="inline-flex rounded-lg bg-white border border-gray-100 p-1 shadow-sm">
            <button
              type="button"
              onClick={() => handleInfrastructureTabChange('facilities')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                activeTab === 'facilities'
                  ? 'bg-yellow-400 text-black'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t('page.facilities')}
            </button>

            <button
              type="button"
              onClick={() => handleInfrastructureTabChange('assets')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                activeTab === 'assets'
                  ? 'bg-yellow-400 text-black'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t('page.assets')}
            </button>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {assetActionAlert && assetActionAlert.clubId === resolvedClubId && (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold">
            {assetActionAlert.title}
          </div>

          <div className="mt-1 leading-6">
            {assetActionAlert.message}
          </div>
        </div>
      )}

      {successMessage && (
        <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      {staffContextError && (
        <div className="mb-5 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          Infrastructure loaded, but staff impact context could not be loaded: {staffContextError}
        </div>
      )}

      {activeTab === 'facilities' && (
        <div data-tutorial-target="facilities-buildings">
          <FacilitiesSection
          activeJobs={activeJobs}
          nowMs={nowMs}
          facilityCapacity={facilityJobCapacity}
          cancellationQuotesByJobId={cancellationQuotesByJobId}
          processingKey={processingKey}
          facilities={facilities}
          selectedItem={selectedItem}
          onCancelJob={handleCancelInfrastructureJob}
          onFacilityAction={handleItemAction}
          onOpenDetails={clickedItem =>
            setSelectedItemKey({
              type: clickedItem.type,
              id: clickedItem.id,
            })
          }
          onCloseDetails={() => setSelectedItemKey(null)}
        />
        </div>
      )}

      {activeTab === 'assets' && (
        <div data-tutorial-target="facilities-assets">
          <AssetsSection
          activeAssetSubTab={activeAssetSubTab}
          setActiveAssetSubTab={setActiveAssetSubTab}

          teamCarConfigRows={teamCarConfigRows}
          teamCarRosterRows={teamCarRosterRows}
          teamCarGarageSummary={teamCarGarageSummary}
          pendingTeamCarJobs={pendingTeamCarJobs}
          pendingTeamCarJobsByLevel={pendingTeamCarJobsByLevel}
          pendingTeamCarQuantity={pendingTeamCarQuantity}

          teamBusConfigRows={teamBusConfigRows}
          teamBusRosterRows={teamBusRosterRows}
          teamBusGarageSummary={teamBusGarageSummary}
          pendingTeamBusJobs={pendingTeamBusJobs}
          pendingTeamBusJobsByLevel={pendingTeamBusJobsByLevel}
          pendingTeamBusQuantity={pendingTeamBusQuantity}

          equipmentVanConfigRows={equipmentVanConfigRows}
          equipmentVanRosterRows={equipmentVanRosterRows}
          equipmentVanGarageSummary={equipmentVanGarageSummary}
          pendingEquipmentVanJobs={pendingEquipmentVanJobs}
          pendingEquipmentVanJobsByLevel={pendingEquipmentVanJobsByLevel}
          pendingEquipmentVanQuantity={pendingEquipmentVanQuantity}

          mobileWorkshopConfigRows={mobileWorkshopConfigRows}
          mobileWorkshopRosterRows={mobileWorkshopRosterRows}
          mobileWorkshopGarageSummary={mobileWorkshopGarageSummary}
          pendingMobileWorkshopJobs={pendingMobileWorkshopJobs}
          pendingMobileWorkshopJobsByLevel={pendingMobileWorkshopJobsByLevel}
          pendingMobileWorkshopQuantity={pendingMobileWorkshopQuantity}

          medicalVanConfigRows={medicalVanConfigRows}
          medicalVanRosterRows={medicalVanRosterRows}
          medicalVanGarageSummary={medicalVanGarageSummary}
          pendingMedicalVanJobs={pendingMedicalVanJobs}
          pendingMedicalVanJobsByLevel={pendingMedicalVanJobsByLevel}
          pendingMedicalVanQuantity={pendingMedicalVanQuantity}

          processingKey={processingKey}
          cancelProcessingJobId={cancelProcessingJobId}
          onTeamCarAcquire={handleTeamCarAcquire}
          onTeamBusAcquire={handleTeamBusAcquire}
          onEquipmentVanAcquire={handleEquipmentVanAcquire}
          onMobileWorkshopAcquire={handleMobileWorkshopAcquire}
          onMedicalVanAcquire={handleMedicalVanAcquire}
          onCancelDelivery={handleCancelDelivery}
          onStartAssetRepair={handleStartAssetRepair}
          onOpenAssetRepair={handleOpenAssetRepair}
          onOpenAssetSell={handleOpenAssetSell}
          onRenameTeamCar={handleRenameTeamCar}
          onRenameAsset={handleRenameAsset}
          assetSlotAccessByKey={assetSlotAccessByKey}
          unlockingSlotKey={unlockingAssetSlotKey}
          onUnlockAssetSlot={handleUnlockAssetSlot}
        />
        </div>
      )}

      {!tutorialLoading && tutorialMode === 'invite' ? (
        <TutorialOverlay
          open
          variant="invite"
          title={facilitiesWelcomeTutorial.title}
          body={facilitiesWelcomeTutorial.body}
          primaryAction={facilitiesWelcomeTutorial.primaryAction}
          secondaryAction={facilitiesWelcomeTutorial.secondaryAction}
          onPrimary={handleStartFacilitiesTutorial}
          onSecondary={handleSkipFacilitiesTutorial}
          onClose={handleCloseFacilitiesTutorial}
        />
      ) : null}

      {!tutorialLoading && tutorialMode === 'steps' ? (
        <>
          <TutorialTargetFrame
            target={facilitiesTutorialSteps[tutorialStepIndex].target ?? null}
          />

          <TutorialOverlay
            open
            variant="panel"
            title={facilitiesTutorialSteps[tutorialStepIndex].title}
            body={facilitiesTutorialSteps[tutorialStepIndex].body}
            stepLabel={`${tutorialStepIndex + 1}/${facilitiesTutorialSteps.length}`}
            primaryAction={
              facilitiesTutorialSteps[tutorialStepIndex].primaryAction ?? 'Next'
            }
            secondaryAction={
              tutorialStepIndex === facilitiesTutorialSteps.length - 1
                ? facilitiesTutorialSteps[tutorialStepIndex].secondaryAction
                : 'Skip tutorial'
            }
            onPrimary={handleNextFacilitiesTutorialStep}
            onSecondary={
              tutorialStepIndex === facilitiesTutorialSteps.length - 1
                ? handleFinishFacilitiesTutorialForNow
                : handleSkipFacilitiesTutorial
            }
            onClose={handleCloseFacilitiesTutorial}
            compact={facilitiesTutorialSteps[tutorialStepIndex].compact}
          />
        </>
      ) : null}

      {assetActionModal && (
        <AssetActionConfirmModal
          modal={assetActionModal}
          isProcessing={assetActionProcessing}
          onClose={() => {
            if (!assetActionProcessing) {
              setAssetActionModal(null)
            }
          }}
          onConfirm={handleConfirmAssetAction}
        />
      )}
    </div>
  )
}
