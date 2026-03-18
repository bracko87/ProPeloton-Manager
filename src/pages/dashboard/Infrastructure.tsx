/**
 * Infrastructure.tsx
 *
 * Queued infrastructure version:
 * - Resolves current user's club automatically if `clubId` is not passed
 * - Reads final infrastructure state from `club_infrastructure`
 * - Reads pending jobs from `club_infrastructure_jobs`
 * - Facilities start queued upgrades via RPC: `start_club_facility_upgrade`
 * - Assets start queued deliveries via RPC: `start_club_asset_delivery`
 * - Shows in-progress state, cost, duration, and active jobs
 *
 * UPDATE:
 * - Infrastructure now always resolves to the MAIN club.
 * - If a developing clubId is passed in, it is normalized to the parent main club.
 * - Falls back to getMyClubContext() so dual-club users always land on main-club infrastructure.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getMyClubContext } from '@/lib/clubContext'

type TabKey = 'facilities' | 'assets'

type ClubInfrastructureRow = {
  club_id: string
  hq_level: number
  training_center_level: number
  medical_center_level: number
  scouting_level: number
  youth_academy_level: number
  mechanics_workshop_level: number
  team_car_fleet_quantity: number
  team_bus_quantity: number
  equipment_van_quantity: number
  logistics_truck_quantity: number
  mobile_workshop_quantity: number
  medical_van_quantity: number
}

type InfrastructureJobType = 'facility_upgrade' | 'asset_delivery'

type InfrastructureJobRow = {
  id: string
  club_id: string
  job_type: InfrastructureJobType
  target_key: string
  status: 'pending' | 'completed' | 'cancelled' | 'failed'
  facility_target_level: number | null
  asset_quantity: number | null
  cost_cash: number
  finance_transaction_id: string | null
  started_at: string
  complete_at: string
  completed_at: string | null
  created_at: string
}

type FacilityKey =
  | 'club_house'
  | 'training_center'
  | 'medical_center'
  | 'scouting_office'
  | 'youth_academy'
  | 'mechanics_workshop'

type AssetKey =
  | 'team_car_fleet'
  | 'team_bus'
  | 'equipment_van'
  | 'logistics_truck'
  | 'mobile_workshop'
  | 'medical_van'

type InfrastructureItem = {
  type: 'facility' | 'asset'
  id: FacilityKey | AssetKey
  name: string
  description: string
  currentValue: number
  maxValue?: number
  owned: boolean
  canAct: boolean
  actionLabel: string
  badgeLabel: string
  valueLabel: string
  pendingJob: InfrastructureJobRow | null
  pendingSummary: string | null
  previewCostCash: number | null
  previewDurationMinutes: number | null
  nextValueLabel: string | null
}

type ActiveJobView = {
  id: string
  name: string
  summary: string
  completeAt: string
  costCash: number
  type: InfrastructureJobType
}

const FACILITY_MAX_LEVEL = 5

const facilityConfig: Array<{
  id: FacilityKey
  name: string
  description: string
  getValue: (row: ClubInfrastructureRow) => number
  maxValue: number
}> = [
  {
    id: 'club_house',
    name: 'Club House',
    description: 'Base of operations for your cycling team.',
    getValue: row => row.hq_level,
    maxValue: FACILITY_MAX_LEVEL,
  },
  {
    id: 'training_center',
    name: 'Training Center',
    description: 'Improves rider development and training quality.',
    getValue: row => row.training_center_level,
    maxValue: FACILITY_MAX_LEVEL,
  },
  {
    id: 'medical_center',
    name: 'Medical Center',
    description: 'Supports injuries, treatment and rider health.',
    getValue: row => row.medical_center_level,
    maxValue: FACILITY_MAX_LEVEL,
  },
  {
    id: 'youth_academy',
    name: 'Youth Academy',
    description: 'Develops young riders and future talent.',
    getValue: row => row.youth_academy_level,
    maxValue: FACILITY_MAX_LEVEL,
  },
  {
    id: 'mechanics_workshop',
    name: 'Mechanics Workshop',
    description: 'Improves maintenance and technical readiness.',
    getValue: row => row.mechanics_workshop_level,
    maxValue: FACILITY_MAX_LEVEL,
  },
  {
    id: 'scouting_office',
    name: 'Scouting Office',
    description: 'Helps discover riders and improve scouting.',
    getValue: row => row.scouting_level,
    maxValue: FACILITY_MAX_LEVEL,
  },
]

const assetConfig: Array<{
  id: AssetKey
  name: string
  description: string
  getValue: (row: ClubInfrastructureRow) => number
}> = [
  {
    id: 'team_car_fleet',
    name: 'Team Car Fleet',
    description: 'Race support cars for events and logistics.',
    getValue: row => row.team_car_fleet_quantity,
  },
  {
    id: 'team_bus',
    name: 'Team Bus',
    description: 'Transport for riders and staff.',
    getValue: row => row.team_bus_quantity,
  },
  {
    id: 'equipment_van',
    name: 'Equipment Van',
    description: 'Carries bikes, spare parts and equipment.',
    getValue: row => row.equipment_van_quantity,
  },
  {
    id: 'logistics_truck',
    name: 'Logistics Truck',
    description: 'Heavy transport for larger race programs.',
    getValue: row => row.logistics_truck_quantity,
  },
  {
    id: 'mobile_workshop',
    name: 'Mobile Workshop',
    description: 'Portable technical support for races and camps.',
    getValue: row => row.mobile_workshop_quantity,
  },
  {
    id: 'medical_van',
    name: 'Medical Van',
    description: 'Mobile medical support for the team.',
    getValue: row => row.medical_van_quantity,
  },
]

const facilityNameMap: Record<FacilityKey, string> = {
  club_house: 'Club House',
  training_center: 'Training Center',
  medical_center: 'Medical Center',
  scouting_office: 'Scouting Office',
  youth_academy: 'Youth Academy',
  mechanics_workshop: 'Mechanics Workshop',
}

const assetNameMap: Record<AssetKey, string> = {
  team_car_fleet: 'Team Car Fleet',
  team_bus: 'Team Bus',
  equipment_van: 'Equipment Van',
  logistics_truck: 'Logistics Truck',
  mobile_workshop: 'Mobile Workshop',
  medical_van: 'Medical Van',
}

function formatTimeRemaining(completeAt: string, nowMs: number): string {
  const targetMs = new Date(completeAt).getTime()
  const remainingMs = Math.max(targetMs - nowMs, 0)

  const totalSeconds = Math.floor(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

function formatDurationMinutes(minutes: number): string {
  if (minutes <= 0) return '0m'

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`
  }

  if (hours > 0) {
    return `${hours}h`
  }

  return `${remainingMinutes}m`
}

function formatCash(amount: number): string {
  return new Intl.NumberFormat('en-US').format(amount)
}

function getFacilityPreview(facilityId: FacilityKey, nextLevel: number) {
  switch (facilityId) {
    case 'club_house':
      return {
        costCash: 50000 * nextLevel,
        durationMinutes: 180 * nextLevel,
      }
    case 'training_center':
      return {
        costCash: 20000 * nextLevel,
        durationMinutes: 60 * nextLevel,
      }
    case 'medical_center':
      return {
        costCash: 18000 * nextLevel,
        durationMinutes: 60 * nextLevel,
      }
    case 'youth_academy':
      return {
        costCash: 25000 * nextLevel,
        durationMinutes: 90 * nextLevel,
      }
    case 'mechanics_workshop':
      return {
        costCash: 20000 * nextLevel,
        durationMinutes: 75 * nextLevel,
      }
    case 'scouting_office':
      return {
        costCash: 18000 * nextLevel,
        durationMinutes: 60 * nextLevel,
      }
    default:
      return {
        costCash: 0,
        durationMinutes: 0,
      }
  }
}

function getAssetPreview(assetId: AssetKey, quantity = 1) {
  switch (assetId) {
    case 'team_car_fleet':
      return {
        costCash: 10000 * quantity,
        durationMinutes: 30 * quantity,
      }
    case 'team_bus':
      return {
        costCash: 35000 * quantity,
        durationMinutes: 120 * quantity,
      }
    case 'equipment_van':
      return {
        costCash: 15000 * quantity,
        durationMinutes: 45 * quantity,
      }
    case 'logistics_truck':
      return {
        costCash: 45000 * quantity,
        durationMinutes: 180 * quantity,
      }
    case 'mobile_workshop':
      return {
        costCash: 25000 * quantity,
        durationMinutes: 90 * quantity,
      }
    case 'medical_van':
      return {
        costCash: 20000 * quantity,
        durationMinutes: 60 * quantity,
      }
    default:
      return {
        costCash: 0,
        durationMinutes: 0,
      }
  }
}

function ActiveJobsPanel({
  jobs,
  nowMs,
}: {
  jobs: ActiveJobView[]
  nowMs: number
}) {
  if (jobs.length === 0) {
    return (
      <div className="mb-5 rounded-xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-gray-500">Active Jobs</div>
            <div className="text-base font-semibold text-gray-900 mt-1">
              No infrastructure jobs in progress
            </div>
          </div>
          <div className="text-sm text-gray-400">All clear</div>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-5 rounded-xl bg-white border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-sm text-gray-500">Active Jobs</div>
          <div className="text-base font-semibold text-gray-900 mt-1">
            {jobs.length} infrastructure {jobs.length === 1 ? 'job' : 'jobs'} in progress
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {jobs.map(job => (
          <div key={job.id} className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-yellow-900">{job.name}</div>
                <div className="text-sm text-yellow-800 mt-1">{job.summary}</div>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 font-medium">
                {job.type === 'facility_upgrade' ? 'Upgrade' : 'Delivery'}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-yellow-800">
              <span>Remaining: {formatTimeRemaining(job.completeAt, nowMs)}</span>
              <span>Paid: {formatCash(job.costCash)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function InfrastructureCard({
  item,
  isProcessing,
  onAction,
  nowMs,
}: {
  item: InfrastructureItem
  isProcessing: boolean
  onAction: (item: InfrastructureItem) => void
  nowMs: number
}) {
  const badgeClasses = item.pendingJob
    ? 'bg-yellow-100 text-yellow-700'
    : item.owned
      ? 'bg-green-100 text-green-700'
      : 'bg-gray-100 text-gray-600'

  const isDisabled = isProcessing || !item.canAct
  const buttonClasses = isDisabled
    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
    : 'bg-yellow-400 hover:bg-yellow-300 text-black'

  return (
    <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-base text-gray-900">{item.name}</h3>
          <p className="text-sm text-gray-500 mt-1">{item.description}</p>
        </div>

        <span className={`text-xs px-2 py-1 rounded-full font-medium ${badgeClasses}`}>
          {item.badgeLabel}
        </span>
      </div>

      <div className="mt-4 text-sm text-gray-500">{item.valueLabel}</div>

      {!item.pendingJob && item.canAct && (
        <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
          {item.nextValueLabel && (
            <div className="text-sm font-medium text-gray-800">{item.nextValueLabel}</div>
          )}

          <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-gray-600">
            <div>
              <span className="block text-gray-400">Cost</span>
              <span className="font-medium text-gray-800">
                {item.previewCostCash !== null ? formatCash(item.previewCostCash) : '-'}
              </span>
            </div>
            <div>
              <span className="block text-gray-400">Duration</span>
              <span className="font-medium text-gray-800">
                {item.previewDurationMinutes !== null
                  ? formatDurationMinutes(item.previewDurationMinutes)
                  : '-'}
              </span>
            </div>
          </div>
        </div>
      )}

      {item.pendingJob && (
        <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
          <div className="text-sm font-medium text-yellow-800">{item.pendingSummary}</div>
          <div className="text-xs text-yellow-700 mt-1">
            Completes in {formatTimeRemaining(item.pendingJob.complete_at, nowMs)}
          </div>
          <div className="text-xs text-yellow-700 mt-1">
            Cost paid: {formatCash(item.pendingJob.cost_cash)}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-gray-400">
          {item.pendingJob ? 'Action locked while job is pending' : ' '}
        </div>

        <button
          type="button"
          onClick={() => onAction(item)}
          disabled={isDisabled}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${buttonClasses}`}
        >
          {isProcessing ? 'Starting...' : item.actionLabel}
        </button>
      </div>
    </div>
  )
}

export default function InfrastructurePage({ clubId }: { clubId?: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>('facilities')
  const [resolvedClubId, setResolvedClubId] = useState<string | null>(clubId ?? null)
  const [infrastructure, setInfrastructure] = useState<ClubInfrastructureRow | null>(null)
  const [pendingJobs, setPendingJobs] = useState<InfrastructureJobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processingKey, setProcessingKey] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(Date.now())

  async function resolveClubId(): Promise<string | null> {
    /**
     * If a clubId prop is passed in, normalize it:
     * - main club => use as-is
     * - developing club => use parent main club
     */
    if (clubId) {
      const { data: passedClub, error: passedClubError } = await supabase
        .from('clubs')
        .select('id, club_type, parent_club_id')
        .eq('id', clubId)
        .maybeSingle()

      if (passedClubError) {
        throw new Error(passedClubError.message)
      }

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

    if (error) {
      throw new Error(error.message)
    }

    if (!data) {
      throw new Error('No infrastructure data found for this club')
    }

    setInfrastructure(data as ClubInfrastructureRow)
  }

  async function fetchPendingJobs(targetClubId: string) {
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
        cost_cash,
        finance_transaction_id,
        started_at,
        complete_at,
        completed_at,
        created_at
      `)
      .eq('club_id', targetClubId)
      .eq('status', 'pending')
      .order('complete_at', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    setPendingJobs((data ?? []) as InfrastructureJobRow[])
  }

  async function fetchAllData(targetClubId: string) {
    await Promise.all([fetchInfrastructure(targetClubId), fetchPendingJobs(targetClubId)])
  }

  useEffect(() => {
    let isMounted = true

    async function loadPage() {
      try {
        setLoading(true)
        setError(null)

        const currentClubId = await resolveClubId()

        if (!isMounted) return

        if (!currentClubId) {
          setResolvedClubId(null)
          setInfrastructure(null)
          setPendingJobs([])
          setError('No club found for current user')
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
        setError(message)
        setLoading(false)
      }
    }

    void loadPage()

    return () => {
      isMounted = false
    }
  }, [clubId])

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
        // keep current UI state if background refresh fails
      }
    }, 15000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [resolvedClubId])

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

  const activeJobs = useMemo<ActiveJobView[]>(() => {
    return pendingJobs.map(job => {
      if (job.job_type === 'facility_upgrade') {
        const facilityName = facilityNameMap[job.target_key as FacilityKey] ?? job.target_key

        return {
          id: job.id,
          name: facilityName,
          summary: `Upgrading to Level ${job.facility_target_level ?? '?'}`,
          completeAt: job.complete_at,
          costCash: job.cost_cash,
          type: job.job_type,
        }
      }

      const assetName = assetNameMap[job.target_key as AssetKey] ?? job.target_key

      return {
        id: job.id,
        name: assetName,
        summary: `Delivery x${job.asset_quantity ?? 1}`,
        completeAt: job.complete_at,
        costCash: job.cost_cash,
        type: job.job_type,
      }
    })
  }, [pendingJobs])

  const facilities = useMemo<InfrastructureItem[]>(() => {
    if (!infrastructure) return []

    return facilityConfig.map(item => {
      const level = item.getValue(infrastructure)
      const isMaxed = level >= item.maxValue
      const pendingJob = pendingFacilityJobsByKey.get(item.id) ?? null
      const nextLevel = Math.min(level + 1, item.maxValue)
      const preview = !pendingJob && !isMaxed ? getFacilityPreview(item.id, nextLevel) : null

      return {
        type: 'facility',
        id: item.id,
        name: item.name,
        description: item.description,
        currentValue: level,
        maxValue: item.maxValue,
        owned: level > 0,
        canAct: !pendingJob && !isMaxed,
        actionLabel: pendingJob
          ? 'In Progress'
          : isMaxed
            ? 'Max Level'
            : level > 0
              ? 'Upgrade'
              : 'Build',
        badgeLabel: pendingJob ? 'In Progress' : level > 0 ? 'Built' : 'Not Built',
        valueLabel: `Level ${level} / ${item.maxValue}`,
        pendingJob,
        pendingSummary: pendingJob
          ? `Queued upgrade to Level ${pendingJob.facility_target_level ?? level + 1}`
          : null,
        previewCostCash: preview?.costCash ?? null,
        previewDurationMinutes: preview?.durationMinutes ?? null,
        nextValueLabel: !pendingJob && !isMaxed ? `Next: Level ${level} → ${nextLevel}` : null,
      }
    })
  }, [infrastructure, pendingFacilityJobsByKey])

  const assets = useMemo<InfrastructureItem[]>(() => {
    if (!infrastructure) return []

    return assetConfig.map(item => {
      const quantity = item.getValue(infrastructure)
      const pendingJob = pendingAssetJobsByKey.get(item.id) ?? null
      const preview = !pendingJob ? getAssetPreview(item.id, 1) : null

      return {
        type: 'asset',
        id: item.id,
        name: item.name,
        description: item.description,
        currentValue: quantity,
        owned: quantity > 0,
        canAct: !pendingJob,
        actionLabel: pendingJob ? 'Delivering' : quantity > 0 ? 'Acquire More' : 'Acquire',
        badgeLabel: pendingJob ? 'Delivering' : quantity > 0 ? 'Owned' : 'Not Owned',
        valueLabel: `Qty ${quantity}`,
        pendingJob,
        pendingSummary: pendingJob ? `Queued delivery x${pendingJob.asset_quantity ?? 1}` : null,
        previewCostCash: preview?.costCash ?? null,
        previewDurationMinutes: preview?.durationMinutes ?? null,
        nextValueLabel: !pendingJob ? `Next delivery: Qty ${quantity} → ${quantity + 1}` : null,
      }
    })
  }, [infrastructure, pendingAssetJobsByKey])

  async function handleItemAction(item: InfrastructureItem) {
    if (!resolvedClubId) return
    if (!item.canAct) return

    try {
      setProcessingKey(`${item.type}:${item.id}`)
      setError(null)

      if (item.type === 'facility') {
        const { error } = await supabase.rpc('start_club_facility_upgrade', {
          p_club_id: resolvedClubId,
          p_facility: item.id,
        })

        if (error) {
          throw new Error(error.message)
        }
      } else {
        const { error } = await supabase.rpc('start_club_asset_delivery', {
          p_club_id: resolvedClubId,
          p_asset: item.id,
          p_quantity: 1,
        })

        if (error) {
          throw new Error(error.message)
        }
      }

      await fetchAllData(resolvedClubId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start infrastructure job'
      setError(message)
    } finally {
      setProcessingKey(null)
    }
  }

  if (loading) {
    return (
      <div className="w-full">
        <div className="bg-white rounded-lg p-6 shadow border border-gray-100 text-sm text-gray-500">
          Loading infrastructure...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          {error}
        </div>
      </div>
    )
  }

  if (!infrastructure) {
    return (
      <div className="w-full">
        <div className="bg-white rounded-lg p-6 shadow border border-gray-100 text-sm text-gray-500">
          No infrastructure data found.
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-gray-900">Infrastructure</h2>
        <p className="text-sm text-gray-500 mt-1">
          Your team starts with <span className="font-semibold">Club House Level 1</span>.
        </p>
      </div>

      <ActiveJobsPanel jobs={activeJobs} nowMs={nowMs} />

      <div className="mb-5 inline-flex rounded-lg bg-white border border-gray-100 p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab('facilities')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            activeTab === 'facilities'
              ? 'bg-yellow-400 text-black'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Facilities
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('assets')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            activeTab === 'assets'
              ? 'bg-yellow-400 text-black'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Assets
        </button>
      </div>

      {activeTab === 'facilities' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
          {facilities.map(item => (
            <InfrastructureCard
              key={`${item.type}:${item.id}`}
              item={item}
              onAction={handleItemAction}
              isProcessing={processingKey === `${item.type}:${item.id}`}
              nowMs={nowMs}
            />
          ))}
        </div>
      )}

      {activeTab === 'assets' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
          {assets.map(item => (
            <InfrastructureCard
              key={`${item.type}:${item.id}`}
              item={item}
              onAction={handleItemAction}
              isProcessing={processingKey === `${item.type}:${item.id}`}
              nowMs={nowMs}
            />
          ))}
        </div>
      )}
    </div>
  )
}