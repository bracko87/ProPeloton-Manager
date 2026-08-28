/**
 * AssetsSection.tsx
 *
 * Assets tab UI for the Infrastructure dashboard.
 * Contains:
 * - TeamCarGaragePanel: management UI for the Team Car fleet.
 * - TeamBusGaragePanel: management UI for the Team Bus fleet.
 * - EquipmentVanGaragePanel: management UI for the Equipment Van fleet.
 * - MobileWorkshopGaragePanel: management UI for the Mobile Workshop fleet.
 * - MedicalVanGaragePanel: management UI for the Medical Van fleet.
 *
 * The exported AssetsSection component wires these panels to the active asset sub-tab.
 *
 * Visual rule:
 * - Asset layout lives here.
 * - Team Cars, Team Bus, Equipment Van, Mobile Workshop, and Medical Van use the restored garage-slot layout.
 * - Repair / Sell buttons are displayed on owned slot rows.
 * - Repair / Sell buttons open quote / confirm modals from Infrastructure.tsx.
 */

import React, { createContext, useContext, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type {
  AssetSubTabKey,
  InfrastructureAssetActionTarget,
  InfrastructureAssetConfigRow,
  InfrastructureAssetSlotAccessMap,
  InfrastructureJobRow,
  TeamBusGarageSummaryRow,
  TeamBusRosterRow,
  TeamCarGarageSummaryRow,
  TeamCarRosterRow,
} from './infrastructureTypes'
import { assetSubTabs } from './infrastructureConfig'
import {
  formatAssetPercent,
  formatCash,
  formatGameDate,
  formatGameDays,
  toNumber,
} from './infrastructureHelpers'

function getConfiguredGarageSize(
  configRows: InfrastructureAssetConfigRow[],
  fallback = 3,
): number {
  const configuredMax = configRows.reduce((max, row) => {
    return Math.max(max, toNumber(row.max_total_quantity, 0))
  }, 0)

  return Math.max(configuredMax, fallback)
}

type AssetGarageKey =
  | 'team_car'
  | 'team_bus'
  | 'equipment_van'
  | 'mobile_workshop'
  | 'medical_van'

type StartAssetRepairPayload = {
  assetKey: AssetGarageKey
  assetId: string
  assetLabel: string
}

type StartAssetRepairHandler = (payload: StartAssetRepairPayload) => void

type GenericAssetRosterRow = {
  id?: string | null
  asset_id?: string | null
  car_id?: string | null
  bus_id?: string | null
  van_id?: string | null
  workshop_id?: string | null
  equipment_van_id?: string | null
  mobile_workshop_id?: string | null
  medical_van_id?: string | null
  display_name: string
  asset_name?: string | null
  asset_level: number
  condition_percent: string | number
  condition_status?: string | null
  effective_support_value?: unknown
  acquired_game_date?: string | null
  status: string
  assignment_locked?: boolean
  current_assignment_label?: string | null
  assignment_end_game_date?: string | null
  repair_complete_game_date?: string | null
  metadata?: Record<string, unknown> | null
}

type GenericAssetGarageSummaryRow = {
  support_tier?: string | null
  [key: string]: unknown
}

type EquipmentVanRosterRow = GenericAssetRosterRow
type EquipmentVanGarageSummaryRow = GenericAssetGarageSummaryRow

type MobileWorkshopRosterRow = GenericAssetRosterRow
type MobileWorkshopGarageSummaryRow = GenericAssetGarageSummaryRow

type MedicalVanRosterRow = GenericAssetRosterRow
type MedicalVanGarageSummaryRow = GenericAssetGarageSummaryRow

type GenericBonusCopy = {
  primaryTitle: string
  primaryDescription: string
  secondaryTitle: string
  secondaryValueKeys: string[]
  secondaryDescription: string
  supportTierTitle: string
  supportTierDescription: string
  potentialTierDescription: string
}

const EMPTY_CONFIG_ROWS: InfrastructureAssetConfigRow[] = []
const EMPTY_TEAM_CAR_ROWS: TeamCarRosterRow[] = []
const EMPTY_TEAM_BUS_ROWS: TeamBusRosterRow[] = []
const EMPTY_EQUIPMENT_VAN_ROWS: EquipmentVanRosterRow[] = []
const EMPTY_MOBILE_WORKSHOP_ROWS: MobileWorkshopRosterRow[] = []
const EMPTY_MEDICAL_VAN_ROWS: MedicalVanRosterRow[] = []
const EMPTY_JOBS: InfrastructureJobRow[] = []
const EMPTY_JOBS_BY_LEVEL = new Map<number, InfrastructureJobRow[]>()


type AssetSlotAccessContextValue = {
  accessByAssetKey: InfrastructureAssetSlotAccessMap
  unlockingSlotKey: string | null
  onUnlockSlot: (assetKey: AssetGarageKey, slotNumber: number) => void
}

const AssetSlotAccessContext = createContext<AssetSlotAccessContextValue>({
  accessByAssetKey: {},
  unlockingSlotKey: null,
  onUnlockSlot: () => undefined,
})

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key]
  return typeof value === 'string' ? value : null
}

function getRepairCompleteGameDate(row: {
  repair_complete_game_date?: string | null
  metadata?: Record<string, unknown> | null
}): string | null {
  return (
    row.repair_complete_game_date ??
    getMetadataString(row.metadata, 'repair_complete_game_date') ??
    getMetadataString(row.metadata, 'complete_game_date') ??
    null
  )
}

function getAssetCurrentStatusLabel(row: {
  status: string
  assignment_locked?: boolean
  current_assignment_label?: string | null
  assignment_end_game_date?: string | null
  repair_complete_game_date?: string | null
  metadata?: Record<string, unknown> | null
}, t: TFunction): string {
  if (row.status === 'in_repair') {
    const repairCompleteGameDate = getRepairCompleteGameDate(row)

    return repairCompleteGameDate
      ? t('assets.inRepairUntil', { date: formatGameDate(repairCompleteGameDate) })
      : t('common.inRepair')
  }

  if (row.status === 'assigned' || row.assignment_locked) {
    const assignmentLabel = row.current_assignment_label ?? t('assets.assignedEvent')

    return row.assignment_end_game_date
      ? t('assets.inUseUntil', {
          assignment: assignmentLabel,
          date: formatGameDate(row.assignment_end_game_date),
        })
      : t('assets.inUse', { assignment: assignmentLabel })
  }

  if (row.status === 'available') {
    return t('common.available')
  }

  return row.status.replaceAll('_', ' ')
}

function canSendAssetToRepair(row: {
  status: string
  assignment_locked?: boolean
  condition_percent: string | number
}): boolean {
  const condition = toNumber(row.condition_percent, 100)

  return (
    condition < 100 &&
    row.status !== 'assigned' &&
    row.status !== 'in_repair' &&
    !row.assignment_locked
  )
}

function canSellAsset(row: {
  status: string
  assignment_locked?: boolean
}): boolean {
  return row.status !== 'assigned' && !row.assignment_locked
}

type GarageSlot<T> =
  | {
      kind: 'owned'
      slotNumber: number
      row: T
    }
  | {
      kind: 'pending'
      slotNumber: number
      job: InfrastructureJobRow
      copyIndex: number
      quantity: number
    }
  | {
      kind: 'empty'
      slotNumber: number
    }
  | {
      kind: 'locked'
      slotNumber: number
    }

type GarageCounts = {
  available: number
  assigned: number
  inRepair: number
  sold: number
}

type BonusCard = {
  title: string
  value: string
  description: string
}

function normalizeAssetStatus(status: string | null | undefined): string {
  return String(status ?? 'available')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function formatStatusLabel(
  status: string | null | undefined,
  t: TFunction,
): string {
  const normalized = normalizeAssetStatus(status)

  if (isAssignedOrLockedStatus(normalized)) return t('assetStatus.assigned')
  if (isInRepairStatus(normalized)) return t('assetStatus.inRepair')
  if (isSoldStatus(normalized)) return t('assetStatus.sold')
  if (normalized === 'available') return t('assetStatus.available')

  return normalized
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function isAssignedOrLockedStatus(status: string | null | undefined): boolean {
  const normalized = normalizeAssetStatus(status)

  return normalized.includes('assigned') || normalized.includes('locked')
}

function isInRepairStatus(status: string | null | undefined): boolean {
  const normalized = normalizeAssetStatus(status)

  return normalized.includes('repair')
}

function isSoldStatus(status: string | null | undefined): boolean {
  const normalized = normalizeAssetStatus(status)

  return normalized.includes('sold')
}

function getOwnedAssetLabel<T extends { asset_level: number; asset_name?: string | null }>(
  row: T,
  fallbackPrefix: string,
  t: TFunction,
  assetKey: AssetGarageKey,
): string {
  const assetName = row.asset_name?.trim()
  const fallback = assetName && assetName.length > 0
    ? assetName
    : `${fallbackPrefix} Lv ${row.asset_level}`

  return t(`assetTiers.${assetKey}.level${row.asset_level}.name`, {
    defaultValue: fallback,
  })
}

function getAssetTierEffect(
  assetKey: AssetGarageKey,
  level: number,
  fallback: string | null | undefined,
  t: TFunction,
): string {
  return t(`assetTiers.${assetKey}.level${level}.effect`, {
    defaultValue: fallback ?? '',
  })
}

function translateAssetConditionStatus(
  value: string | null | undefined,
  t: TFunction,
): string {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_')
  const key = normalized === 'excellent'
    ? 'assetCondition.excellent'
    : normalized === 'good'
      ? 'assetCondition.good'
      : normalized === 'fair'
        ? 'assetCondition.fair'
        : normalized === 'poor'
          ? 'assetCondition.poor'
          : 'assetCondition.tracked'

  return t(key, { defaultValue: value || t('assetCondition.tracked') })
}

function translateSupportTier(
  value: string | null | undefined,
  t: TFunction,
): string {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized || normalized === 'none' || normalized === 'n/a') {
    return normalized === 'n/a' ? 'N/A' : t('supportTiers.none')
  }

  const known = new Set(['basic', 'solid', 'strong', 'elite'])
  return known.has(normalized)
    ? t(`supportTiers.${normalized}`, { defaultValue: value ?? '' })
    : value ?? 'N/A'
}

function getStatusBadgeClass(status: string | null | undefined): string {
  if (isSoldStatus(status)) {
    return 'bg-gray-200 text-gray-600 border-gray-300'
  }

  if (isInRepairStatus(status)) {
    return 'bg-orange-100 text-orange-800 border-orange-200'
  }

  if (isAssignedOrLockedStatus(status)) {
    return 'bg-blue-100 text-blue-800 border-blue-200'
  }

  return 'bg-green-100 text-green-800 border-green-200'
}

function getRosterCounts<T extends { status?: string | null }>(rows: T[]): GarageCounts {
  return rows.reduce<GarageCounts>(
    (acc, row) => {
      if (isSoldStatus(row.status)) {
        acc.sold += 1
      } else if (isInRepairStatus(row.status)) {
        acc.inRepair += 1
      } else if (isAssignedOrLockedStatus(row.status)) {
        acc.assigned += 1
      } else {
        acc.available += 1
      }

      return acc
    },
    {
      available: 0,
      assigned: 0,
      inRepair: 0,
      sold: 0,
    },
  )
}

function getPotentialTierLabel(configRows: InfrastructureAssetConfigRow[]): string {
  if (configRows.length === 0) {
    return 'N/A'
  }

  const bestConfig = [...configRows].sort((a, b) => b.asset_level - a.asset_level)[0]

  return `Lv ${bestConfig.asset_level} · ${formatAssetPercent(bestConfig.support_value)}`
}

function getBestOwnedSupport<T extends { effective_support_value?: unknown }>(
  rosterRows: T[],
): string {
  const bestValue = rosterRows.reduce((best, row) => {
    return Math.max(best, toNumber(row.effective_support_value, 0))
  }, 0)

  return bestValue > 0 ? formatAssetPercent(bestValue) : 'N/A'
}

function countPendingForLevel(
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>,
  assetLevel: number,
): number {
  return (
    pendingJobsByLevel
      .get(assetLevel)
      ?.reduce((sum, job) => sum + Math.max(1, Math.floor(toNumber(job.asset_quantity, 1))), 0) ??
    0
  )
}

function buildGarageSlots<T>(
  ownedRows: T[],
  pendingDeliveryJobs: InfrastructureJobRow[],
  absoluteMaxSlots: number,
  effectiveSlots: number,
): GarageSlot<T>[] {
  const pendingSlots: Array<{
    job: InfrastructureJobRow
    copyIndex: number
    quantity: number
  }> = []

  pendingDeliveryJobs.forEach(job => {
    const quantity = Math.max(1, Math.floor(toNumber(job.asset_quantity, 1)))

    for (let index = 0; index < quantity; index += 1) {
      pendingSlots.push({
        job,
        copyIndex: index + 1,
        quantity,
      })
    }
  })

  const committedCount = ownedRows.length + pendingSlots.length
  const slotCount = Math.max(absoluteMaxSlots, committedCount, 1)
  const slots: GarageSlot<T>[] = []
  let slotNumber = 1

  ownedRows.forEach(row => {
    slots.push({
      kind: 'owned',
      slotNumber,
      row,
    })
    slotNumber += 1
  })

  pendingSlots.forEach(pending => {
    slots.push({
      kind: 'pending',
      slotNumber,
      job: pending.job,
      copyIndex: pending.copyIndex,
      quantity: pending.quantity,
    })
    slotNumber += 1
  })

  while (slots.length < slotCount) {
    slots.push({
      kind: slotNumber <= effectiveSlots ? 'empty' : 'locked',
      slotNumber,
    })
    slotNumber += 1
  }

  return slots
}

function getSummaryNumber(
  summary: GenericAssetGarageSummaryRow | null,
  keys: string[],
  fallback: number,
): number {
  if (!summary) {
    return fallback
  }

  for (const key of keys) {
    const value = summary[key]

    if (value !== null && value !== undefined) {
      return toNumber(value, fallback)
    }
  }

  return fallback
}

function getSummaryText(
  summary: GenericAssetGarageSummaryRow | null,
  keys: string[],
  fallback = 'N/A',
): string {
  if (!summary) {
    return fallback
  }

  for (const key of keys) {
    const value = summary[key]

    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }

  return fallback
}

function getSummaryPercent(
  summary: GenericAssetGarageSummaryRow | null,
  keys: string[],
): string {
  if (!summary) {
    return 'N/A'
  }

  for (const key of keys) {
    const value = summary[key]

    if (value !== null && value !== undefined) {
      return formatAssetPercent(value)
    }
  }

  return 'N/A'
}

function getRowAssetId<T>(row: T, idKeys: string[], fallback: string): string {
  const record = row as unknown as Record<string, unknown>

  for (const key of idKeys) {
    const value = record[key]

    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }

  return fallback
}

function formatMaybeGameDate(value: string | null | undefined): string {
  return value ? formatGameDate(value) : 'N/A'
}

function buildAssetActionTarget<T extends GenericAssetRosterRow>({
  assetKey,
  assetId,
  row,
}: {
  assetKey: AssetGarageKey
  assetId: string
  row: T
}): InfrastructureAssetActionTarget {
  return {
    assetKey,
    assetId,
    displayName: row.display_name,
    assetName: row.asset_name,
    assetLevel: row.asset_level,
    conditionPercent: row.condition_percent,
    status: row.status,
  } as InfrastructureAssetActionTarget
}

function SummaryMetric({
  label,
  value,
  helper,
}: {
  label: string
  value: React.ReactNode
  helper?: React.ReactNode
}): JSX.Element {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
      {helper && <div className="mt-1 text-[11px] text-gray-500">{helper}</div>}
    </div>
  )
}

function BonusCards({ cards }: { cards: BonusCard[] }): JSX.Element {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map(card => (
        <div
          key={card.title}
          className="rounded-xl bg-white border border-gray-100 shadow-sm p-4"
        >
          <div className="text-xs uppercase tracking-wide text-gray-400">{card.title}</div>
          <div className="mt-2 text-lg font-semibold text-gray-900">{card.value}</div>
          <div className="mt-1 text-xs text-gray-500 leading-5">{card.description}</div>
        </div>
      ))}
    </div>
  )
}

function AssetAcquireModal({
  assetKey,
  title,
  description,
  assetLabel,
  configRows,
  ownedByLevel,
  pendingJobsByLevel,
  processingKey,
  processingKeyPrefix,
  isFull,
  onAcquire,
  onClose,
}: {
  assetKey: AssetGarageKey
  title: string
  description: string
  assetLabel: string
  configRows: InfrastructureAssetConfigRow[]
  ownedByLevel: Map<number, number>
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>
  processingKey: string | null
  processingKeyPrefix: string
  isFull: boolean
  onAcquire: (assetLevel: number) => void
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation('infrastructure')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden"
        onClick={event => event.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">{assetLabel}</div>
            <h3 className="mt-1 text-lg font-semibold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            {t('common.close')}
          </button>
        </div>

        <div className="p-5">
          {isFull && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t('assets.garageFullDescription')}
            </div>
          )}

          {configRows.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              {t('assets.noTiers')}
            </div>
          )}

          {configRows.length > 0 && (
            <div className="space-y-3">
              {configRows.map(config => {
                const ownedCount = ownedByLevel.get(config.asset_level) ?? 0
                const pendingForLevel = countPendingForLevel(
                  pendingJobsByLevel,
                  config.asset_level,
                )
                const isProcessing = processingKey === `${processingKeyPrefix}:${config.asset_level}`

                return (
                  <div
                    key={`${processingKeyPrefix}_modal_${config.asset_level}`}
                    className="rounded-xl border border-gray-100 bg-gray-50 p-3"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900">
                          {t(`assetTiers.${assetKey}.level${config.asset_level}.name`, { defaultValue: config.asset_name })}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {t('common.level')} {config.asset_level} · {t('common.support')}{' '}
                          {formatAssetPercent(config.support_value)}
                        </div>

                        {config.effect_summary && (
                          <div className="mt-2 text-xs leading-5 text-gray-600">
                            {getAssetTierEffect(assetKey, config.asset_level, config.effect_summary, t)}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs text-gray-700 md:min-w-[260px]">
                        <div>
                          <div className="text-gray-400">{t('common.cost')}</div>
                          <div className="mt-0.5 font-semibold text-gray-900">
                            {formatCash(config.cost_cash)}
                          </div>
                        </div>

                        <div>
                          <div className="text-gray-400">{t('common.delivery')}</div>
                          <div className="mt-0.5 font-semibold text-gray-900">
                            {formatGameDays(config.delivery_game_days)}
                          </div>
                        </div>

                        <div>
                          <div className="text-gray-400">{t('common.owned')}</div>
                          <div className="mt-0.5 font-semibold text-gray-900">{ownedCount}</div>
                        </div>

                        <div>
                          <div className="text-gray-400">{t('common.pending')}</div>
                          <div className="mt-0.5 font-semibold text-gray-900">
                            {pendingForLevel}
                          </div>
                        </div>
                      </div>

                      <div className="flex md:justify-end">
                        <button
                          type="button"
                          onClick={() => onAcquire(config.asset_level)}
                          disabled={isProcessing || isFull}
                          className={`px-4 py-2 rounded-md text-xs font-semibold transition ${
                            isProcessing || isFull
                              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                              : 'bg-yellow-400 text-black hover:bg-yellow-300'
                          }`}
                        >
                          {isProcessing
                            ? t('common.starting')
                            : isFull
                              ? t('common.garageFull')
                              : t('assets.startDelivery')}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TeamCarGaragePanel({
  configRows,
  rosterRows,
  summary,
  pendingDeliveryJobs,
  pendingJobsByLevel,
  pendingQuantity,
  processingKey,
  cancelProcessingJobId,
  onAcquire,
  onCancelDelivery,
  onOpenAssetRepair,
  onOpenAssetSell,
  onRenameTeamCar,
}: {
  configRows: InfrastructureAssetConfigRow[]
  rosterRows: TeamCarRosterRow[]
  summary: TeamCarGarageSummaryRow | null
  pendingDeliveryJobs: InfrastructureJobRow[]
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>
  pendingQuantity: number
  processingKey: string | null
  cancelProcessingJobId: string | null
  onAcquire: (assetLevel: number) => void
  onCancelDelivery: (job: InfrastructureJobRow) => void
  onOpenAssetRepair: (target: InfrastructureAssetActionTarget) => void
  onOpenAssetSell: (target: InfrastructureAssetActionTarget) => void
  onRenameTeamCar: (carId: string, displayName: string) => Promise<void>
}): JSX.Element {
  const { t } = useTranslation('infrastructure')
  const [isAcquireModalOpen, setIsAcquireModalOpen] = useState(false)
  const [editingCarId, setEditingCarId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameSavingCarId, setRenameSavingCarId] = useState<string | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const assetKey: AssetGarageKey = 'team_car'
  const {
    accessByAssetKey,
    unlockingSlotKey,
    onUnlockSlot,
  } = useContext(AssetSlotAccessContext)

  const slotAccess = accessByAssetKey.team_car

  const ownedByLevel = useMemo(() => {
    const map = new Map<number, number>()

    rosterRows.forEach(row => {
      const level = row.asset_level
      map.set(level, (map.get(level) ?? 0) + 1)
    })

    return map
  }, [rosterRows])

  const configuredMaximum = summary ? toNumber(summary.max_total_cars, 0) : 0
  const absoluteMaxSlots = Math.max(
    slotAccess?.absolute_max_slots ?? 0,
    configuredMaximum,
    10,
  )
  const effectiveSlots = Math.min(
    absoluteMaxSlots,
    Math.max(slotAccess?.effective_slots ?? configuredMaximum, 1),
  )
  const totalCars = summary ? toNumber(summary.total_cars, rosterRows.length) : rosterRows.length
  const counts = useMemo(() => getRosterCounts(rosterRows), [rosterRows])
  const potentialTier = useMemo(() => getPotentialTierLabel(configRows), [configRows])
  const bestOwnedSupport = useMemo(() => getBestOwnedSupport(rosterRows), [rosterRows])
  const isFull = totalCars + pendingQuantity >= effectiveSlots

  const garageSlots = useMemo(
    () =>
      buildGarageSlots(
        rosterRows,
        pendingDeliveryJobs,
        absoluteMaxSlots,
        effectiveSlots,
      ),
    [rosterRows, pendingDeliveryJobs, absoluteMaxSlots, effectiveSlots],
  )

  const bonusCards = useMemo<BonusCard[]>(
    () => [
      {
        title: t('assets.mechanicalResponse'),
        value: bestOwnedSupport,
        description:
          t('assets.mechanicalResponseDescription'),
      },
      {
        title: t('assets.feedingSupport'),
        value: summary
          ? formatAssetPercent(summary.race_fatigue_reduction_pct)
          : 'N/A',
        description:
          t('assets.feedingSupportDescription'),
      },
      {
        title: t('assets.tacticalComms'),
        value: translateSupportTier(summary?.support_tier, t),
        description:
          t('assets.tacticalCommsDescription'),
      },
      {
        title: t('common.potentialTier'),
        value: potentialTier,
        description:
          t('assets.teamCarPotential'),
      },
    ],
    [bestOwnedSupport, potentialTier, summary],
  )

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs uppercase tracking-wide text-gray-400">{t('assets.teamCars')}</div>
            <h3 className="text-lg font-semibold text-gray-900 mt-1">{t('assets.teamCarFleet')}</h3>
            <p className="text-sm text-gray-500 mt-1 leading-6">
              {t('assets.teamCarDescription')}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsAcquireModalOpen(true)}
            disabled={isFull}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition ${
              isFull
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-yellow-400 text-black hover:bg-yellow-300'
            }`}
          >
            {isFull ? t('common.garageFull') : t('assets.acquireTeamCar')}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-4">
          <SummaryMetric
            label={t('common.garageSize')}
            value={`${totalCars + pendingQuantity} / ${effectiveSlots}`}
            helper={
              slotAccess
                ? t('assets.freePremiumMax', { free: slotAccess.free_slots, premium: slotAccess.premium_slots, max: absoluteMaxSlots })
                : t('assets.ownedPending', { owned: totalCars, pending: pendingQuantity })
            }
          />
          <SummaryMetric label={t('common.available')} value={counts.available} />
          <SummaryMetric label={t('common.assigned')} value={counts.assigned} />
          <SummaryMetric label={t('common.inRepair')} value={counts.inRepair} />
          <SummaryMetric label={t('common.bestSupport')} value={translateSupportTier(summary?.support_tier, t)} />
          <SummaryMetric label={t('common.potentialTier')} value={potentialTier} />
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <div className="text-sm font-semibold text-blue-900">
          {t('assets.garageSupportTitle')}
        </div>
        <p className="mt-1 text-xs leading-5 text-blue-800">
          {t('assets.teamCarAssignment')}
        </p>
      </div>

      <BonusCards cards={bonusCards} />

      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">{t('common.garageSlots')}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {t('assets.garageSlotsTeamCar')}
            </div>
          </div>

          <div className="text-xs text-gray-500">
            {t('assets.activeMaximum', { active: effectiveSlots, max: absoluteMaxSlots })}
          </div>
        </div>

        <div className="space-y-3">
          {garageSlots.map(slot => {
            if (slot.kind === 'owned') {
              const car = slot.row
              const assetLabel = getOwnedAssetLabel(car, t('assets.teamCar'), t, 'team_car')

              return (
                <div
                  key={`team_car_owned_${car.car_id}`}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 lg:w-[300px] lg:shrink-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-gray-900">
                          {t('assets.slot', { slot: slot.slotNumber })}
                        </div>

                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getStatusBadgeClass(
                            car.status,
                          )}`}
                        >
                          {formatStatusLabel(car.status, t)}
                        </span>

                        <span className="inline-flex rounded-md border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                          {assetLabel}
                        </span>
                      </div>

                      {editingCarId === car.car_id ? (
                        <div className="mt-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={renameDraft}
                              maxLength={40}
                              autoFocus
                              onChange={event => {
                                setRenameDraft(event.target.value)
                                setRenameError(null)
                              }}
                              onKeyDown={event => {
                                if (event.key === 'Escape') {
                                  setEditingCarId(null)
                                  setRenameError(null)
                                }

                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  const nextName = renameDraft.trim()

                                  if (!nextName) {
                                    setRenameError(t('assets.enterName', { asset: t('assets.teamCar') }))
                                    return
                                  }

                                  void (async () => {
                                    try {
                                      setRenameSavingCarId(car.car_id)
                                      setRenameError(null)
                                      await onRenameTeamCar(car.car_id, nextName)
                                      setEditingCarId(null)
                                    } catch (error) {
                                      setRenameError(
                                        error instanceof Error
                                          ? error.message
                                          : t('assets.renameFailed', { asset: t('assets.teamCar') }),
                                      )
                                    } finally {
                                      setRenameSavingCarId(null)
                                    }
                                  })()
                                }
                              }}
                              className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500"
                              aria-label={`Rename ${car.display_name}`}
                            />

                            <button
                              type="button"
                              disabled={renameSavingCarId === car.car_id}
                              onClick={() => {
                                const nextName = renameDraft.trim()

                                if (!nextName) {
                                  setRenameError(t('assets.enterName', { asset: t('assets.teamCar') }))
                                  return
                                }

                                void (async () => {
                                  try {
                                    setRenameSavingCarId(car.car_id)
                                    setRenameError(null)
                                    await onRenameTeamCar(car.car_id, nextName)
                                    setEditingCarId(null)
                                  } catch (error) {
                                    setRenameError(
                                      error instanceof Error
                                        ? error.message
                                        : t('assets.renameFailed', { asset: t('assets.teamCar') }),
                                    )
                                  } finally {
                                    setRenameSavingCarId(null)
                                  }
                                })()
                              }}
                              className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {renameSavingCarId === car.car_id ? t('common.saving') : t('common.save')}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setEditingCarId(null)
                                setRenameError(null)
                              }}
                              className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                            >
                              {t('common.cancel')}
                            </button>
                          </div>

                          {renameError ? (
                            <div className="mt-1 text-xs text-red-600">{renameError}</div>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCarId(car.car_id)
                            setRenameDraft(car.display_name)
                            setRenameError(null)
                          }}
                          className="mt-2 inline-flex max-w-full items-center gap-1.5 text-left text-sm font-semibold text-gray-900 hover:text-blue-700"
                          title={t('assets.renameTeamCar')}
                        >
                          <span className="truncate">{car.display_name}</span>
                          <span aria-hidden="true" className="shrink-0 text-xs text-gray-400">
                            ✎
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-700 lg:flex-1 lg:max-w-3xl">
                      <div>
                        <div className="text-gray-400">{t('common.condition')}</div>
                        <div className="mt-0.5 font-semibold text-gray-900">
                          {formatAssetPercent(car.condition_percent)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-gray-500">
                          {translateAssetConditionStatus(car.condition_status, t)}
                        </div>
                      </div>

                      <div>
                        <div className="text-gray-400">{t('common.support')}</div>
                        <div className="mt-0.5 font-semibold text-gray-900">
                          {formatAssetPercent(car.effective_support_value)}
                        </div>
                      </div>

                      <div>
                        <div className="text-gray-400">{t('common.acquired')}</div>
                        <div className="mt-0.5 font-semibold text-gray-900">
                          {formatGameDate(car.acquired_game_date)}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="text-xs text-gray-400">{t('common.currentStatus')}</div>
                        <div
                          className="mt-0.5 max-w-[250px] truncate whitespace-nowrap text-sm font-semibold text-gray-900"
                          title={getAssetCurrentStatusLabel(car, t)}
                        >
                          {getAssetCurrentStatusLabel(car, t)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenAssetRepair({
                            assetKey: 'team_car',
                            assetId: car.car_id,
                            displayName: car.display_name,
                            assetName: car.asset_name,
                            assetLevel: car.asset_level,
                            conditionPercent: car.condition_percent,
                            status: car.status,
                          })
                        }
                        disabled={!canSendAssetToRepair(car)}
                        title={
                          toNumber(car.condition_percent, 100) >= 100
                            ? t('assets.condition100')
                            : car.status === 'in_repair'
                              ? t('assets.alreadyRepair')
                              : car.status === 'assigned' || car.assignment_locked
                                ? t('assets.assignedLocked')
                                : undefined
                        }
                        className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                          canSendAssetToRepair(car)
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {t('common.repair')}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onOpenAssetSell({
                            assetKey: 'team_car',
                            assetId: car.car_id,
                            displayName: car.display_name,
                            assetName: car.asset_name,
                            assetLevel: car.asset_level,
                            conditionPercent: car.condition_percent,
                            status: car.status,
                          })
                        }
                        disabled={!canSellAsset(car)}
                        className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                          canSellAsset(car)
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {t('common.sell')}
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            if (slot.kind === 'pending') {
              const isCancelling = cancelProcessingJobId === slot.job.id

              return (
                <div
                  key={`team_car_pending_${slot.job.id}_${slot.copyIndex}`}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-3"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-amber-950">
                          {t('assets.slot', { slot: slot.slotNumber })}
                        </div>
                        <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          {t('common.pendingDelivery')}
                        </span>
                      </div>

                      <div className="mt-1 text-sm font-semibold text-amber-950">
                        {t('assets.teamCar')} · {t('common.level')} {slot.job.asset_level ?? '?'}
                      </div>
                      <div className="mt-1 text-xs text-amber-800">
                        {t('assets.deliveryItem', { current: slot.copyIndex, total: slot.quantity })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-amber-900 lg:flex-1 lg:max-w-3xl">
                      <div>
                        <div className="text-amber-700">{t('common.duration')}</div>
                        <div className="mt-0.5 font-semibold">
                          {formatGameDays(slot.job.duration_game_days)}
                        </div>
                      </div>

                      <div>
                        <div className="text-amber-700">{t('common.completes')}</div>
                        <div className="mt-0.5 font-semibold">
                          {formatGameDate(slot.job.complete_game_date)}
                        </div>
                      </div>

                      <div>
                        <div className="text-amber-700">{t('common.costPaid')}</div>
                        <div className="mt-0.5 font-semibold">
                          {formatCash(slot.job.cost_cash)}
                        </div>
                      </div>

                      <div>
                        <div className="text-amber-700">{t('common.quantity')}</div>
                        <div className="mt-0.5 font-semibold">x{slot.quantity}</div>
                      </div>
                    </div>

                    <div className="flex lg:justify-end">
                      <button
                        type="button"
                        onClick={() => onCancelDelivery(slot.job)}
                        disabled={isCancelling}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                          isCancelling
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {isCancelling ? t('facilities.cancelling') : t('assets.cancelDelivery')}
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            if (slot.kind === 'locked') {
              const isUnlocking =
                unlockingSlotKey === `${assetKey}:${slot.slotNumber}`
              const isPremiumCapacity =
                slotAccess != null &&
                slot.slotNumber > slotAccess.free_slots &&
                slot.slotNumber <= slotAccess.premium_slots
              const hasEnoughCoins =
                Number(slotAccess?.coin_balance ?? 0) >=
                Number(slotAccess?.coin_cost ?? 20)

              return (
                <div
                  key={`team_car_locked_${slot.slotNumber}`}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-800">
                          {t('assets.slot', { slot: slot.slotNumber })}
                        </div>

                        {isPremiumCapacity ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            Premium
                          </span>
                        ) : null}

                        <span aria-hidden="true" className="text-sm text-slate-400">
                          🔒
                        </span>
                      </div>

                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {isPremiumCapacity
                          ? t('assets.premiumSlotDescription')
                          : t('assets.additionalTeamCarCapacity')}
                      </div>

                      <div className="mt-1 text-xs text-slate-400">
                        {t('common.currentCoinBalance')}{' '}
                        {Number(slotAccess?.coin_balance ?? 0).toLocaleString('en-US')}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isPremiumCapacity ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (typeof window !== 'undefined') {
                              window.location.hash = '#/dashboard/pro'
                            }
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {t('common.unlockPremium')}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => onUnlockSlot(assetKey, slot.slotNumber)}
                        disabled={isUnlocking || !hasEnoughCoins}
                        className="rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs font-semibold text-yellow-900 hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isUnlocking
                          ? t('common.unlocking')
                          : t('assets.unlockCoins', { coins: Number(slotAccess?.coin_cost ?? 20) })}
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={`team_car_empty_${slot.slotNumber}`}
                className="rounded-xl border border-dashed border-gray-200 bg-white p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-700">
                      {t('assets.slot', { slot: slot.slotNumber })}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {t('assets.emptyTeamCar')}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAcquireModalOpen(true)}
                    disabled={isFull}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                      isFull
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : 'bg-yellow-400 text-black hover:bg-yellow-300'
                    }`}
                  >
                    {isFull ? t('common.garageFull') : t('common.acquire')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {isAcquireModalOpen && (
        <AssetAcquireModal
          assetKey="team_car"
          title={t('assets.acquireTeamCar')}
          description={t('assets.teamCarAcquireDescription')}
          assetLabel={t('assets.teamCars')}
          configRows={configRows}
          ownedByLevel={ownedByLevel}
          pendingJobsByLevel={pendingJobsByLevel}
          processingKey={processingKey}
          processingKeyPrefix="asset:team_car"
          isFull={isFull}
          onAcquire={onAcquire}
          onClose={() => setIsAcquireModalOpen(false)}
        />
      )}
    </div>
  )
}

function GenericAssetGaragePanel<T extends GenericAssetRosterRow>({
  assetKey,
  assetLabel,
  assetLabelPlural,
  title,
  description,
  acquireButtonLabel,
  acquireModalTitle,
  acquireModalDescription,
  emptySlotDescription,
  pendingDeliveryTitlePrefix,
  configRows,
  rosterRows,
  summary,
  pendingDeliveryJobs,
  pendingJobsByLevel,
  pendingQuantity,
  processingKey,
  processingKeyPrefix,
  cancelProcessingJobId,
  maxTotalKeys,
  totalKeys,
  idKeys,
  garageSizeFallback = 0,
  garageSizeOverride,
  bonusCopy,
  assignmentNotice,
  onAcquire,
  onCancelDelivery,
  onOpenAssetRepair,
  onOpenAssetSell,
  onRenameAsset,
}: {
  assetKey: AssetGarageKey
  assetLabel: string
  assetLabelPlural: string
  title: string
  description: string
  acquireButtonLabel: string
  acquireModalTitle: string
  acquireModalDescription: string
  emptySlotDescription: string
  pendingDeliveryTitlePrefix: string
  configRows: InfrastructureAssetConfigRow[]
  rosterRows: T[]
  summary: GenericAssetGarageSummaryRow | null
  pendingDeliveryJobs: InfrastructureJobRow[]
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>
  pendingQuantity: number
  processingKey: string | null
  processingKeyPrefix: string
  cancelProcessingJobId: string | null
  maxTotalKeys: string[]
  totalKeys: string[]
  idKeys: string[]
  garageSizeFallback?: number
  garageSizeOverride?: number
  bonusCopy: GenericBonusCopy
  assignmentNotice: string
  onAcquire: (assetLevel: number) => void
  onCancelDelivery: (job: InfrastructureJobRow) => void
  onOpenAssetRepair: (target: InfrastructureAssetActionTarget) => void
  onOpenAssetSell: (target: InfrastructureAssetActionTarget) => void
  onRenameAsset: (assetKey: AssetGarageKey, assetId: string, displayName: string) => Promise<void>
}): JSX.Element {
  const { t } = useTranslation('infrastructure')
  const assetCopy = {
    team_car: { singular: 'assets.teamCar', plural: 'assets.teamCars', title: 'assets.teamCarFleet', description: 'assets.teamCarDescription', acquire: 'assets.acquireTeamCar', acquireDescription: 'assets.teamCarAcquireDescription', empty: 'assets.emptyTeamCar', assignment: 'assets.teamCarAssignment' },
    team_bus: { singular: 'assets.teamBus', plural: 'assets.teamBus', title: 'assets.teamBusGarage', description: 'assets.teamBusDescription', acquire: 'assets.acquireTeamBus', acquireDescription: 'assets.teamBusAcquireDescription', empty: 'assets.emptyTeamBus', assignment: 'assets.teamBusAssignment' },
    equipment_van: { singular: 'assets.equipmentVan', plural: 'assets.equipmentVans', title: 'assets.equipmentVanGarage', description: 'assets.equipmentVanDescription', acquire: 'assets.acquireEquipmentVan', acquireDescription: 'assets.equipmentVanAcquireDescription', empty: 'assets.emptyEquipmentVan', assignment: 'assets.equipmentVanAssignment' },
    mobile_workshop: { singular: 'assets.mobileWorkshop', plural: 'assets.mobileWorkshops', title: 'assets.mobileWorkshopGarage', description: 'assets.mobileWorkshopDescription', acquire: 'assets.acquireMobileWorkshop', acquireDescription: 'assets.mobileWorkshopAcquireDescription', empty: 'assets.emptyMobileWorkshop', assignment: 'assets.mobileWorkshopAssignment' },
    medical_van: { singular: 'assets.medicalVan', plural: 'assets.medicalVans', title: 'assets.medicalVanGarage', description: 'assets.medicalVanDescription', acquire: 'assets.acquireMedicalVan', acquireDescription: 'assets.medicalVanAcquireDescription', empty: 'assets.emptyMedicalVan', assignment: 'assets.medicalVanAssignment' },
  }[assetKey]
  const [isAcquireModalOpen, setIsAcquireModalOpen] = useState(false)
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameSavingAssetId, setRenameSavingAssetId] = useState<string | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const {
    accessByAssetKey,
    unlockingSlotKey,
    onUnlockSlot,
  } = useContext(AssetSlotAccessContext)

  const slotAccess = accessByAssetKey[assetKey]

  const ownedByLevel = useMemo(() => {
    const map = new Map<number, number>()

    rosterRows.forEach(row => {
      const level = row.asset_level
      map.set(level, (map.get(level) ?? 0) + 1)
    })

    return map
  }, [rosterRows])

  const configuredGarageSize =
    garageSizeOverride ??
    (garageSizeFallback > 0 ? getConfiguredGarageSize(configRows, garageSizeFallback) : 0)

  const configuredMaximum = Math.max(
    getSummaryNumber(summary, maxTotalKeys, 0),
    configuredGarageSize,
  )

  const absoluteMaxSlots = Math.max(
    slotAccess?.absolute_max_slots ?? 0,
    configuredMaximum,
    1,
  )

  const effectiveSlots = Math.min(
    absoluteMaxSlots,
    Math.max(
      slotAccess?.effective_slots ?? configuredMaximum,
      1,
    ),
  )

  const totalAssets = getSummaryNumber(summary, totalKeys, rosterRows.length)
  const counts = useMemo(() => getRosterCounts(rosterRows), [rosterRows])
  const potentialTier = useMemo(() => getPotentialTierLabel(configRows), [configRows])
  const bestOwnedSupport = useMemo(() => getBestOwnedSupport(rosterRows), [rosterRows])
  const supportTier = translateSupportTier(getSummaryText(summary, ['support_tier'], 'N/A'), t)
  const isFull = totalAssets + pendingQuantity >= effectiveSlots

  const garageSlots = useMemo(
    () =>
      buildGarageSlots(
        rosterRows,
        pendingDeliveryJobs,
        absoluteMaxSlots,
        effectiveSlots,
      ),
    [rosterRows, pendingDeliveryJobs, absoluteMaxSlots, effectiveSlots],
  )

  const bonusCards = useMemo<BonusCard[]>(
    () => [
      {
        title: bonusCopy.primaryTitle,
        value: bestOwnedSupport,
        description: bonusCopy.primaryDescription,
      },
      {
        title: bonusCopy.secondaryTitle,
        value: getSummaryPercent(summary, bonusCopy.secondaryValueKeys),
        description: bonusCopy.secondaryDescription,
      },
      {
        title: bonusCopy.supportTierTitle,
        value: supportTier,
        description: bonusCopy.supportTierDescription,
      },
      {
        title: t('common.potentialTier'),
        value: potentialTier,
        description: bonusCopy.potentialTierDescription,
      },
    ],
    [bestOwnedSupport, bonusCopy, potentialTier, summary, supportTier],
  )

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs uppercase tracking-wide text-gray-400">{t(assetCopy.plural)}</div>
            <h3 className="text-lg font-semibold text-gray-900 mt-1">{t(assetCopy.title)}</h3>
            <p className="text-sm text-gray-500 mt-1 leading-6">{t(assetCopy.description)}</p>
          </div>

          <button
            type="button"
            onClick={() => setIsAcquireModalOpen(true)}
            disabled={isFull}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition ${
              isFull
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-yellow-400 text-black hover:bg-yellow-300'
            }`}
          >
            {isFull ? t('common.garageFull') : t(assetCopy.acquire)}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-4">
          <SummaryMetric
            label={t('common.garageSize')}
            value={
              `${totalAssets + pendingQuantity} / ${effectiveSlots}`
            }
            helper={
              slotAccess
                ? t('assets.freePremiumMax', { free: slotAccess.free_slots, premium: slotAccess.premium_slots, max: absoluteMaxSlots })
                : t('assets.ownedPending', { owned: totalAssets, pending: pendingQuantity })
            }
          />
          <SummaryMetric label={t('common.available')} value={counts.available} />
          <SummaryMetric label={t('common.assigned')} value={counts.assigned} />
          <SummaryMetric label={t('common.inRepair')} value={counts.inRepair} />
          <SummaryMetric label={t('common.bestSupport')} value={supportTier} />
          <SummaryMetric label={t('common.potentialTier')} value={potentialTier} />
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <div className="text-sm font-semibold text-blue-900">
          {t('assets.garageSupportTitle')}
        </div>
        <p className="mt-1 text-xs leading-5 text-blue-800">{t(assetCopy.assignment)}</p>
      </div>

      <BonusCards cards={bonusCards} />

      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">{t('common.garageSlots')}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {t('assets.garageSlotsGeneric')}
            </div>
          </div>

          <div className="text-xs text-gray-500">
            {t(garageSlots.length === 1 ? 'assets.slotOne' : 'assets.slots', { count: garageSlots.length })}
          </div>
        </div>

        <div className="space-y-3">
          {garageSlots.map(slot => {
            if (slot.kind === 'owned') {
              const row = slot.row
              const assetId = getRowAssetId(
                row,
                idKeys,
                `${assetKey}_${slot.slotNumber}_${row.asset_level}`,
              )
              const ownedAssetLabel = getOwnedAssetLabel(row, t(assetCopy.singular), t, assetKey)

              return (
                <div
                  key={`${assetKey}_owned_${assetId}`}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 lg:w-[300px] lg:shrink-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-gray-900">
                          {t('assets.slot', { slot: slot.slotNumber })}
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getStatusBadgeClass(
                            row.status,
                          )}`}
                        >
                          {formatStatusLabel(row.status, t)}
                        </span>
                        <span className="inline-flex rounded-md border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                          {ownedAssetLabel}
                        </span>
                      </div>

                      {editingAssetId === assetId ? (
                        <div className="mt-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={renameDraft}
                              maxLength={40}
                              autoFocus
                              onChange={event => {
                                setRenameDraft(event.target.value)
                                setRenameError(null)
                              }}
                              onKeyDown={event => {
                                if (event.key === 'Escape') {
                                  setEditingAssetId(null)
                                  setRenameError(null)
                                }

                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  const nextName = renameDraft.trim()

                                  if (!nextName) {
                                    setRenameError(`Enter a ${assetLabel} name.`)
                                    return
                                  }

                                  void (async () => {
                                    try {
                                      setRenameSavingAssetId(assetId)
                                      setRenameError(null)
                                      await onRenameAsset(assetKey, assetId, nextName)
                                      setEditingAssetId(null)
                                    } catch (error) {
                                      setRenameError(
                                        error instanceof Error
                                          ? error.message
                                          : `Failed to rename ${assetLabel}.`,
                                      )
                                    } finally {
                                      setRenameSavingAssetId(null)
                                    }
                                  })()
                                }
                              }}
                              className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500"
                              aria-label={`Rename ${row.display_name}`}
                            />

                            <button
                              type="button"
                              disabled={renameSavingAssetId === assetId}
                              onClick={() => {
                                const nextName = renameDraft.trim()

                                if (!nextName) {
                                  setRenameError(`Enter a ${assetLabel} name.`)
                                  return
                                }

                                void (async () => {
                                  try {
                                    setRenameSavingAssetId(assetId)
                                    setRenameError(null)
                                    await onRenameAsset(assetKey, assetId, nextName)
                                    setEditingAssetId(null)
                                  } catch (error) {
                                    setRenameError(
                                      error instanceof Error
                                        ? error.message
                                        : `Failed to rename ${assetLabel}.`,
                                    )
                                  } finally {
                                    setRenameSavingAssetId(null)
                                  }
                                })()
                              }}
                              className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {renameSavingAssetId === assetId ? 'Saving…' : 'Save'}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setEditingAssetId(null)
                                setRenameError(null)
                              }}
                              className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                            >
                              {t('common.cancel')}
                            </button>
                          </div>

                          {renameError ? (
                            <div className="mt-1 text-xs text-red-600">{renameError}</div>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAssetId(assetId)
                            setRenameDraft(row.display_name)
                            setRenameError(null)
                          }}
                          className="mt-2 inline-flex max-w-full items-center gap-1.5 text-left text-sm font-semibold text-gray-900 hover:text-blue-700"
                          title={`Rename ${assetLabel}`}
                        >
                          <span className="truncate">{row.display_name}</span>
                          <span aria-hidden="true" className="shrink-0 text-xs text-gray-400">
                            ✎
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-700 lg:flex-1 lg:max-w-3xl">
                      <div>
                        <div className="text-gray-400">{t('common.condition')}</div>
                        <div className="mt-0.5 font-semibold text-gray-900">
                          {formatAssetPercent(row.condition_percent)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-gray-500">
                          {translateAssetConditionStatus(row.condition_status, t)}
                        </div>
                      </div>

                      <div>
                        <div className="text-gray-400">{t('common.support')}</div>
                        <div className="mt-0.5 font-semibold text-gray-900">
                          {formatAssetPercent(row.effective_support_value)}
                        </div>
                      </div>

                      <div>
                        <div className="text-gray-400">{t('common.acquired')}</div>
                        <div className="mt-0.5 font-semibold text-gray-900">
                          {formatMaybeGameDate(row.acquired_game_date)}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-gray-400">{t('common.currentStatus')}</div>
                        <div className="text-sm font-semibold text-gray-900">
                          {getAssetCurrentStatusLabel(row, t)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenAssetRepair(
                            buildAssetActionTarget({
                              assetKey,
                              assetId,
                              row,
                            }),
                          )
                        }
                        disabled={!canSendAssetToRepair(row)}
                        title={
                          toNumber(row.condition_percent, 100) >= 100
                            ? t('assets.condition100')
                            : row.status === 'in_repair'
                              ? t('assets.alreadyRepair')
                              : row.status === 'assigned' || row.assignment_locked
                                ? t('assets.assignedLocked')
                                : undefined
                        }
                        className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                          canSendAssetToRepair(row)
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {t('common.repair')}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onOpenAssetSell(
                            buildAssetActionTarget({
                              assetKey,
                              assetId,
                              row,
                            }),
                          )
                        }
                        disabled={!canSellAsset(row)}
                        className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                          canSellAsset(row)
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {t('common.sell')}
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            if (slot.kind === 'pending') {
              const isCancelling = cancelProcessingJobId === slot.job.id

              return (
                <div
                  key={`${assetKey}_pending_${slot.job.id}_${slot.copyIndex}`}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-3"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-amber-950">
                          {t('assets.slot', { slot: slot.slotNumber })}
                        </div>
                        <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          {t('common.pendingDelivery')}
                        </span>
                      </div>

                      <div className="mt-1 text-sm font-semibold text-amber-950">
                        {pendingDeliveryTitlePrefix} Lv {slot.job.asset_level ?? '?'}
                      </div>
                      <div className="mt-1 text-xs text-amber-800">
                        {t('assets.deliveryItem', { current: slot.copyIndex, total: slot.quantity })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-amber-900 lg:flex-1 lg:max-w-3xl">
                      <div>
                        <div className="text-amber-700">{t('common.duration')}</div>
                        <div className="mt-0.5 font-semibold">
                          {formatGameDays(slot.job.duration_game_days)}
                        </div>
                      </div>

                      <div>
                        <div className="text-amber-700">{t('common.completes')}</div>
                        <div className="mt-0.5 font-semibold">
                          {formatGameDate(slot.job.complete_game_date)}
                        </div>
                      </div>

                      <div>
                        <div className="text-amber-700">{t('common.costPaid')}</div>
                        <div className="mt-0.5 font-semibold">
                          {formatCash(slot.job.cost_cash)}
                        </div>
                      </div>

                      <div>
                        <div className="text-amber-700">{t('common.quantity')}</div>
                        <div className="mt-0.5 font-semibold">x{slot.quantity}</div>
                      </div>
                    </div>

                    <div className="flex lg:justify-end">
                      <button
                        type="button"
                        onClick={() => onCancelDelivery(slot.job)}
                        disabled={isCancelling}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                          isCancelling
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {isCancelling ? t('facilities.cancelling') : t('assets.cancelDelivery')}
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            if (slot.kind === 'locked') {
              const isUnlocking =
                unlockingSlotKey === `${assetKey}:${slot.slotNumber}`
              const isPremiumCapacity =
                slotAccess != null &&
                slot.slotNumber > slotAccess.free_slots &&
                slot.slotNumber <= slotAccess.premium_slots
              const hasEnoughCoins =
                Number(slotAccess?.coin_balance ?? 0) >=
                Number(slotAccess?.coin_cost ?? 20)

              return (
                <div
                  key={`${assetKey}_locked_${slot.slotNumber}`}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-800">
                          {t('assets.slot', { slot: slot.slotNumber })}
                        </div>
                        {isPremiumCapacity ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            Premium
                          </span>
                        ) : null}
                        <span aria-hidden="true" className="text-sm text-slate-400">
                          🔒
                        </span>
                      </div>

                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {isPremiumCapacity
                          ? t('assets.premiumSlotDescription')
                          : t('assets.additionalCapacity')}
                      </div>

                      <div className="mt-1 text-xs text-slate-400">
                        Current coin balance: {Number(slotAccess?.coin_balance ?? 0).toLocaleString('en-US')}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isPremiumCapacity ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (typeof window !== 'undefined') {
                              window.location.hash = '#/dashboard/pro'
                            }
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {t('common.unlockPremium')}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => onUnlockSlot(assetKey, slot.slotNumber)}
                        disabled={isUnlocking || !hasEnoughCoins}
                        className="rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs font-semibold text-yellow-900 hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isUnlocking
                          ? t('common.unlocking')
                          : t('assets.unlockCoins', { coins: Number(slotAccess?.coin_cost ?? 20) })}
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={`${assetKey}_empty_${slot.slotNumber}`}
                className="rounded-xl border border-dashed border-gray-200 bg-white p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-700">
                      {t('assets.slot', { slot: slot.slotNumber })}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{t(assetCopy.empty)}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAcquireModalOpen(true)}
                    disabled={isFull}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                      isFull
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : 'bg-yellow-400 text-black hover:bg-yellow-300'
                    }`}
                  >
                    {isFull ? t('common.garageFull') : t('common.acquire')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {isAcquireModalOpen && (
        <AssetAcquireModal
          assetKey={assetKey}
          title={t(assetCopy.acquire)}
          description={t(assetCopy.acquireDescription)}
          assetLabel={t(assetCopy.plural)}
          configRows={configRows}
          ownedByLevel={ownedByLevel}
          pendingJobsByLevel={pendingJobsByLevel}
          processingKey={processingKey}
          processingKeyPrefix={processingKeyPrefix}
          isFull={isFull}
          onAcquire={onAcquire}
          onClose={() => setIsAcquireModalOpen(false)}
        />
      )}
    </div>
  )
}

function TeamBusGaragePanel({
  configRows,
  rosterRows,
  summary,
  pendingDeliveryJobs,
  pendingJobsByLevel,
  pendingQuantity,
  processingKey,
  cancelProcessingJobId,
  onAcquire,
  onCancelDelivery,
  onOpenAssetRepair,
  onOpenAssetSell,
  onRenameAsset,
}: {
  configRows: InfrastructureAssetConfigRow[]
  rosterRows: TeamBusRosterRow[]
  summary: TeamBusGarageSummaryRow | null
  pendingDeliveryJobs: InfrastructureJobRow[]
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>
  pendingQuantity: number
  processingKey: string | null
  cancelProcessingJobId: string | null
  onAcquire: (assetLevel: number) => void
  onCancelDelivery: (job: InfrastructureJobRow) => void
  onOpenAssetRepair: (target: InfrastructureAssetActionTarget) => void
  onOpenAssetSell: (target: InfrastructureAssetActionTarget) => void
  onRenameAsset: (assetKey: AssetGarageKey, assetId: string, displayName: string) => Promise<void>
}): JSX.Element {
  return (
    <GenericAssetGaragePanel
      assetKey="team_bus"
      assetLabel="Team Bus"
      assetLabelPlural="Team Bus"
      title="Team Bus Garage"
      description="Team Buses improve rider travel comfort, recovery, fatigue control, and stage-race logistics. Manage the garage by slot, start new deliveries, repair worn buses, or sell available buses."
      acquireButtonLabel="Acquire Team Bus"
      acquireModalTitle="Acquire Team Bus"
      acquireModalDescription="Choose a Team Bus tier. The delivery will enter the garage queue and complete after the configured game-time duration."
      emptySlotDescription="Empty Team Bus slot available for a new delivery."
      pendingDeliveryTitlePrefix="Team Bus"
      configRows={configRows}
      rosterRows={rosterRows}
      summary={summary}
      pendingDeliveryJobs={pendingDeliveryJobs}
      pendingJobsByLevel={pendingJobsByLevel}
      pendingQuantity={pendingQuantity}
      processingKey={processingKey}
      processingKeyPrefix="asset:team_bus"
      cancelProcessingJobId={cancelProcessingJobId}
      maxTotalKeys={['max_total_buses', 'max_total_assets']}
      totalKeys={['total_buses', 'total_assets']}
      idKeys={['bus_id', 'asset_id', 'id']}
      bonusCopy={{
        primaryTitle: 'Travel comfort',
        primaryDescription:
          'Best owned bus support value available for rider comfort and race-program logistics.',
        secondaryTitle: 'Rider recovery',
        secondaryValueKeys: ['one_day_fatigue_reduction_pct'],
        secondaryDescription:
          'Garage-level one-day fatigue reduction from the current Team Bus summary.',
        supportTierTitle: 'Tour fatigue cover',
        supportTierDescription:
          'Highest current support tier available from owned Team Buses and their condition.',
        potentialTierDescription:
          'Highest configured Team Bus tier that can be acquired through the garage system.',
      }}
      assignmentNotice="The garage shows what your club owns and what is being delivered. Actual race bonuses should still come from the buses assigned to a specific event or tour. A stronger garage improves available logistics options, but only assigned and eligible buses should affect race-day or tour effects."
      onAcquire={onAcquire}
      onCancelDelivery={onCancelDelivery}
      onOpenAssetRepair={onOpenAssetRepair}
      onOpenAssetSell={onOpenAssetSell}
      onRenameAsset={onRenameAsset}
    />
  )
}

function EquipmentVanGaragePanel({
  configRows,
  rosterRows,
  summary,
  pendingDeliveryJobs,
  pendingJobsByLevel,
  pendingQuantity,
  processingKey,
  cancelProcessingJobId,
  onAcquire,
  onCancelDelivery,
  onOpenAssetRepair,
  onOpenAssetSell,
  onRenameAsset,
}: {
  configRows: InfrastructureAssetConfigRow[]
  rosterRows: EquipmentVanRosterRow[]
  summary: EquipmentVanGarageSummaryRow | null
  pendingDeliveryJobs: InfrastructureJobRow[]
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>
  pendingQuantity: number
  processingKey: string | null
  cancelProcessingJobId: string | null
  onAcquire: (assetLevel: number) => void
  onCancelDelivery: (job: InfrastructureJobRow) => void
  onOpenAssetRepair: (target: InfrastructureAssetActionTarget) => void
  onOpenAssetSell: (target: InfrastructureAssetActionTarget) => void
  onRenameAsset: (assetKey: AssetGarageKey, assetId: string, displayName: string) => Promise<void>
}): JSX.Element {
  const maxVans = Math.max(
    toNumber(summary?.max_total_vans, 0),
    getConfiguredGarageSize(configRows, 3),
  )

  return (
    <GenericAssetGaragePanel
      assetKey="equipment_van"
      assetLabel="Equipment Van"
      assetLabelPlural="Equipment Vans"
      title="Equipment Van Garage"
      description="Equipment Vans support bike transport, spare parts coverage, race equipment logistics, and broader event readiness. Manage the garage by slot, start new deliveries, repair worn vans, or sell available vans."
      acquireButtonLabel="Acquire Equipment Van"
      acquireModalTitle="Acquire Equipment Van"
      acquireModalDescription="Choose an Equipment Van tier. The delivery will enter the garage queue and complete after the configured game-time duration."
      emptySlotDescription="Empty Equipment Van slot available for a new delivery."
      pendingDeliveryTitlePrefix="Equipment Van"
      configRows={configRows}
      rosterRows={rosterRows}
      summary={summary}
      pendingDeliveryJobs={pendingDeliveryJobs}
      pendingJobsByLevel={pendingJobsByLevel}
      pendingQuantity={pendingQuantity}
      processingKey={processingKey}
      processingKeyPrefix="asset:equipment_van"
      cancelProcessingJobId={cancelProcessingJobId}
      maxTotalKeys={['max_total_equipment_vans', 'max_total_vans', 'max_total_assets']}
      totalKeys={['total_equipment_vans', 'total_vans', 'total_assets']}
      idKeys={['van_id', 'equipment_van_id', 'asset_id', 'id']}
      garageSizeFallback={3}
      garageSizeOverride={maxVans}
      bonusCopy={{
        primaryTitle: 'Equipment logistics',
        primaryDescription:
          'Best owned van support value available for bike transport and spare equipment coverage.',
        secondaryTitle: 'Race readiness',
        secondaryValueKeys: [
          'equipment_readiness_pct',
          'equipment_support_pct',
          'race_equipment_support_pct',
          'logistics_support_pct',
          'one_day_fatigue_reduction_pct',
        ],
        secondaryDescription:
          'Garage-level equipment or logistics support from the current Equipment Van summary.',
        supportTierTitle: 'Equipment cover',
        supportTierDescription:
          'Highest current support tier available from owned Equipment Vans and their condition.',
        potentialTierDescription:
          'Highest configured Equipment Van tier that can be acquired through the garage system.',
      }}
      assignmentNotice="The garage shows what your club owns and what is being delivered. Actual race or event bonuses should still come from Equipment Vans assigned to a specific event. A stronger garage improves available logistics options, but only assigned and eligible vans should affect event calculations."
      onAcquire={onAcquire}
      onCancelDelivery={onCancelDelivery}
      onOpenAssetRepair={onOpenAssetRepair}
      onOpenAssetSell={onOpenAssetSell}
      onRenameAsset={onRenameAsset}
    />
  )
}

function MobileWorkshopGaragePanel({
  configRows,
  rosterRows,
  summary,
  pendingDeliveryJobs,
  pendingJobsByLevel,
  pendingQuantity,
  processingKey,
  cancelProcessingJobId,
  onAcquire,
  onCancelDelivery,
  onOpenAssetRepair,
  onOpenAssetSell,
  onRenameAsset,
}: {
  configRows: InfrastructureAssetConfigRow[]
  rosterRows: MobileWorkshopRosterRow[]
  summary: MobileWorkshopGarageSummaryRow | null
  pendingDeliveryJobs: InfrastructureJobRow[]
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>
  pendingQuantity: number
  processingKey: string | null
  cancelProcessingJobId: string | null
  onAcquire: (assetLevel: number) => void
  onCancelDelivery: (job: InfrastructureJobRow) => void
  onOpenAssetRepair: (target: InfrastructureAssetActionTarget) => void
  onOpenAssetSell: (target: InfrastructureAssetActionTarget) => void
  onRenameAsset: (assetKey: AssetGarageKey, assetId: string, displayName: string) => Promise<void>
}): JSX.Element {
  const maxWorkshops = Math.max(
    toNumber(summary?.max_total_workshops, 0),
    getConfiguredGarageSize(configRows, 3),
  )

  return (
    <GenericAssetGaragePanel
      assetKey="mobile_workshop"
      assetLabel="Mobile Workshop"
      assetLabelPlural="Mobile Workshops"
      title="Mobile Workshop Garage"
      description="Mobile Workshops support on-site technical repairs, faster issue response, mechanic coverage, and equipment service capacity. Manage the garage by slot, start new deliveries, repair worn workshops, or sell available workshops."
      acquireButtonLabel="Acquire Mobile Workshop"
      acquireModalTitle="Acquire Mobile Workshop"
      acquireModalDescription="Choose a Mobile Workshop tier. The delivery will enter the garage queue and complete after the configured game-time duration."
      emptySlotDescription="Empty Mobile Workshop slot available for a new delivery."
      pendingDeliveryTitlePrefix="Mobile Workshop"
      configRows={configRows}
      rosterRows={rosterRows}
      summary={summary}
      pendingDeliveryJobs={pendingDeliveryJobs}
      pendingJobsByLevel={pendingJobsByLevel}
      pendingQuantity={pendingQuantity}
      processingKey={processingKey}
      processingKeyPrefix="asset:mobile_workshop"
      cancelProcessingJobId={cancelProcessingJobId}
      maxTotalKeys={['max_total_mobile_workshops', 'max_total_workshops', 'max_total_assets']}
      totalKeys={['total_mobile_workshops', 'total_workshops', 'total_assets']}
      idKeys={['workshop_id', 'mobile_workshop_id', 'asset_id', 'id']}
      garageSizeFallback={3}
      garageSizeOverride={maxWorkshops}
      bonusCopy={{
        primaryTitle: 'Technical service',
        primaryDescription:
          'Best owned workshop support value available for on-site service and mechanical response.',
        secondaryTitle: 'Repair response',
        secondaryValueKeys: [
          'repair_speed_bonus_pct',
          'technical_response_bonus_pct',
          'service_speed_bonus_pct',
          'mechanic_support_pct',
          'race_fatigue_reduction_pct',
        ],
        secondaryDescription:
          'Garage-level technical response or repair support from the current Mobile Workshop summary.',
        supportTierTitle: 'Workshop cover',
        supportTierDescription:
          'Highest current support tier available from owned Mobile Workshops and their condition.',
        potentialTierDescription:
          'Highest configured Mobile Workshop tier that can be acquired through the garage system.',
      }}
      assignmentNotice="The garage shows what your club owns and what is being delivered. Actual technical bonuses should still come from Mobile Workshops assigned to a specific event. A stronger garage improves service options, but only assigned and eligible workshops should affect race-day calculations."
      onAcquire={onAcquire}
      onCancelDelivery={onCancelDelivery}
      onOpenAssetRepair={onOpenAssetRepair}
      onOpenAssetSell={onOpenAssetSell}
      onRenameAsset={onRenameAsset}
    />
  )
}

function MedicalVanGaragePanel({
  configRows,
  rosterRows,
  summary,
  pendingDeliveryJobs,
  pendingJobsByLevel,
  pendingQuantity,
  processingKey,
  cancelProcessingJobId,
  onAcquire,
  onCancelDelivery,
  onOpenAssetRepair,
  onOpenAssetSell,
  onRenameAsset,
}: {
  configRows: InfrastructureAssetConfigRow[]
  rosterRows: MedicalVanRosterRow[]
  summary: MedicalVanGarageSummaryRow | null
  pendingDeliveryJobs: InfrastructureJobRow[]
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>
  pendingQuantity: number
  processingKey: string | null
  cancelProcessingJobId: string | null
  onAcquire: (assetLevel: number) => void
  onCancelDelivery: (job: InfrastructureJobRow) => void
  onOpenAssetRepair: (target: InfrastructureAssetActionTarget) => void
  onOpenAssetSell: (target: InfrastructureAssetActionTarget) => void
  onRenameAsset: (assetKey: AssetGarageKey, assetId: string, displayName: string) => Promise<void>
}): JSX.Element {
  const maxVans = Math.max(
    toNumber(summary?.max_total_medical_vans, 0),
    toNumber(summary?.max_total_vans, 0),
    getConfiguredGarageSize(configRows, 3),
  )

  return (
    <GenericAssetGaragePanel
      assetKey="medical_van"
      assetLabel="Medical Van"
      assetLabelPlural="Medical Vans"
      title="Medical Van Garage"
      description="Medical Vans support race-day health response, rider treatment access, injury control, and medical coverage. Manage the garage by slot, start new deliveries, repair worn vans, or sell available vans."
      acquireButtonLabel="Acquire Medical Van"
      acquireModalTitle="Acquire Medical Van"
      acquireModalDescription="Choose a Medical Van tier. The delivery will enter the garage queue and complete after the configured game-time duration."
      emptySlotDescription="Empty Medical Van slot available for a new delivery."
      pendingDeliveryTitlePrefix="Medical Van"
      configRows={configRows}
      rosterRows={rosterRows}
      summary={summary}
      pendingDeliveryJobs={pendingDeliveryJobs}
      pendingJobsByLevel={pendingJobsByLevel}
      pendingQuantity={pendingQuantity}
      processingKey={processingKey}
      processingKeyPrefix="asset:medical_van"
      cancelProcessingJobId={cancelProcessingJobId}
      maxTotalKeys={['max_total_medical_vans', 'max_total_vans', 'max_total_assets']}
      totalKeys={['total_medical_vans', 'total_vans', 'total_assets']}
      idKeys={['medical_van_id', 'van_id', 'asset_id', 'id']}
      garageSizeFallback={3}
      garageSizeOverride={maxVans}
      bonusCopy={{
        primaryTitle: 'Medical response',
        primaryDescription:
          'Best owned van support value available for race-day treatment access and emergency response.',
        secondaryTitle: 'Health coverage',
        secondaryValueKeys: [
          'medical_response_bonus_pct',
          'treatment_speed_bonus_pct',
          'injury_risk_reduction_pct',
          'recovery_support_pct',
          'health_support_pct',
          'race_medical_support_pct',
          'one_day_fatigue_reduction_pct',
        ],
        secondaryDescription:
          'Garage-level medical response, treatment, recovery, or health support from the current Medical Van summary.',
        supportTierTitle: 'Medical cover',
        supportTierDescription:
          'Highest current support tier available from owned Medical Vans and their condition.',
        potentialTierDescription:
          'Highest configured Medical Van tier that can be acquired through the garage system.',
      }}
      assignmentNotice="The garage shows what your club owns and what is being delivered. Actual medical bonuses should still come from Medical Vans assigned to a specific event. A stronger garage improves available health-response options, but only assigned and eligible vans should affect race-day medical calculations."
      onAcquire={onAcquire}
      onCancelDelivery={onCancelDelivery}
      onOpenAssetRepair={onOpenAssetRepair}
      onOpenAssetSell={onOpenAssetSell}
      onRenameAsset={onRenameAsset}
    />
  )
}

export function AssetsSection({
  activeAssetSubTab,
  setActiveAssetSubTab,
  teamCarConfigRows = EMPTY_CONFIG_ROWS,
  teamCarRosterRows = EMPTY_TEAM_CAR_ROWS,
  teamCarGarageSummary = null,
  pendingTeamCarJobs = EMPTY_JOBS,
  pendingTeamCarJobsByLevel = EMPTY_JOBS_BY_LEVEL,
  pendingTeamCarQuantity = 0,
  teamBusConfigRows = EMPTY_CONFIG_ROWS,
  teamBusRosterRows = EMPTY_TEAM_BUS_ROWS,
  teamBusGarageSummary = null,
  pendingTeamBusJobs = EMPTY_JOBS,
  pendingTeamBusJobsByLevel = EMPTY_JOBS_BY_LEVEL,
  pendingTeamBusQuantity = 0,
  equipmentVanConfigRows = EMPTY_CONFIG_ROWS,
  equipmentVanRosterRows = EMPTY_EQUIPMENT_VAN_ROWS,
  equipmentVanGarageSummary = null,
  pendingEquipmentVanJobs,
  pendingEquipmentVanJobsByLevel,
  pendingEquipmentVanQuantity,
  mobileWorkshopConfigRows = EMPTY_CONFIG_ROWS,
  mobileWorkshopRosterRows = EMPTY_MOBILE_WORKSHOP_ROWS,
  mobileWorkshopGarageSummary = null,
  pendingMobileWorkshopJobs,
  pendingMobileWorkshopJobsByLevel,
  pendingMobileWorkshopQuantity,
  medicalVanConfigRows = EMPTY_CONFIG_ROWS,
  medicalVanRosterRows = EMPTY_MEDICAL_VAN_ROWS,
  medicalVanGarageSummary = null,
  pendingMedicalVanJobs,
  pendingMedicalVanJobsByLevel,
  pendingMedicalVanQuantity,
  processingKey,
  cancelProcessingJobId,
  onTeamCarAcquire,
  onTeamBusAcquire,
  onEquipmentVanAcquire,
  onMobileWorkshopAcquire,
  onMedicalVanAcquire,
  onCancelDelivery,
  onOpenAssetRepair,
  onOpenAssetSell,
  onRenameTeamCar,
  onRenameAsset,
  assetSlotAccessByKey,
  unlockingSlotKey,
  onUnlockAssetSlot,
}: {
  activeAssetSubTab: AssetSubTabKey
  setActiveAssetSubTab: (tab: AssetSubTabKey) => void

  teamCarConfigRows?: InfrastructureAssetConfigRow[]
  teamCarRosterRows?: TeamCarRosterRow[]
  teamCarGarageSummary?: TeamCarGarageSummaryRow | null
  pendingTeamCarJobs?: InfrastructureJobRow[]
  pendingTeamCarJobsByLevel?: Map<number, InfrastructureJobRow[]>
  pendingTeamCarQuantity?: number

  teamBusConfigRows?: InfrastructureAssetConfigRow[]
  teamBusRosterRows?: TeamBusRosterRow[]
  teamBusGarageSummary?: TeamBusGarageSummaryRow | null
  pendingTeamBusJobs?: InfrastructureJobRow[]
  pendingTeamBusJobsByLevel?: Map<number, InfrastructureJobRow[]>
  pendingTeamBusQuantity?: number

  equipmentVanConfigRows?: InfrastructureAssetConfigRow[]
  equipmentVanRosterRows?: EquipmentVanRosterRow[]
  equipmentVanGarageSummary?: EquipmentVanGarageSummaryRow | null
  pendingEquipmentVanJobs: InfrastructureJobRow[]
  pendingEquipmentVanJobsByLevel: Map<number, InfrastructureJobRow[]>
  pendingEquipmentVanQuantity: number

  mobileWorkshopConfigRows?: InfrastructureAssetConfigRow[]
  mobileWorkshopRosterRows?: MobileWorkshopRosterRow[]
  mobileWorkshopGarageSummary?: MobileWorkshopGarageSummaryRow | null
  pendingMobileWorkshopJobs: InfrastructureJobRow[]
  pendingMobileWorkshopJobsByLevel: Map<number, InfrastructureJobRow[]>
  pendingMobileWorkshopQuantity: number

  medicalVanConfigRows?: InfrastructureAssetConfigRow[]
  medicalVanRosterRows?: MedicalVanRosterRow[]
  medicalVanGarageSummary?: MedicalVanGarageSummaryRow | null
  pendingMedicalVanJobs: InfrastructureJobRow[]
  pendingMedicalVanJobsByLevel: Map<number, InfrastructureJobRow[]>
  pendingMedicalVanQuantity: number

  processingKey: string | null
  cancelProcessingJobId: string | null

  onTeamCarAcquire: (assetLevel: number) => void
  onTeamBusAcquire: (assetLevel: number) => void
  onEquipmentVanAcquire: (assetLevel: number) => void
  onMobileWorkshopAcquire: (assetLevel: number) => void
  onMedicalVanAcquire: (assetLevel: number) => void
  onCancelDelivery: (job: InfrastructureJobRow) => void

  onOpenAssetRepair: (target: InfrastructureAssetActionTarget) => void
  onOpenAssetSell: (target: InfrastructureAssetActionTarget) => void
  onRenameTeamCar: (carId: string, displayName: string) => Promise<void>
  onRenameAsset: (assetKey: AssetGarageKey, assetId: string, displayName: string) => Promise<void>
  assetSlotAccessByKey: InfrastructureAssetSlotAccessMap
  unlockingSlotKey: string | null
  onUnlockAssetSlot: (assetKey: AssetGarageKey, slotNumber: number) => void

  /**
   * Kept as an optional compatibility prop in case Infrastructure.tsx still passes it.
   * Repairs are opened through onOpenAssetRepair from this component.
   */
  onStartAssetRepair?: StartAssetRepairHandler
}): JSX.Element {
  const { t } = useTranslation('infrastructure')

  return (
    <AssetSlotAccessContext.Provider
      value={{
        accessByAssetKey: assetSlotAccessByKey,
        unlockingSlotKey,
        onUnlockSlot: onUnlockAssetSlot,
      }}
    >
      <div className="space-y-4">
      <div className="rounded-lg bg-white border border-gray-100 p-2 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {assetSubTabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveAssetSubTab(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                activeAssetSubTab === tab.key
                  ? 'bg-yellow-400 text-black'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t(tab.key === 'team_cars' ? 'assets.teamCars' : tab.key === 'team_bus' ? 'assets.teamBus' : tab.key === 'equipment_van' ? 'assets.equipmentVan' : tab.key === 'mobile_workshop' ? 'assets.mobileWorkshop' : 'assets.medicalVan')}
            </button>
          ))}
        </div>
      </div>

      {activeAssetSubTab === 'team_cars' && (
        <TeamCarGaragePanel
          configRows={teamCarConfigRows}
          rosterRows={teamCarRosterRows}
          summary={teamCarGarageSummary}
          pendingDeliveryJobs={pendingTeamCarJobs}
          pendingJobsByLevel={pendingTeamCarJobsByLevel}
          pendingQuantity={pendingTeamCarQuantity}
          processingKey={processingKey}
          cancelProcessingJobId={cancelProcessingJobId}
          onAcquire={onTeamCarAcquire}
          onCancelDelivery={onCancelDelivery}
          onOpenAssetRepair={onOpenAssetRepair}
          onOpenAssetSell={onOpenAssetSell}
          onRenameTeamCar={onRenameTeamCar}
        />
      )}

      {activeAssetSubTab === 'team_bus' && (
        <TeamBusGaragePanel
          configRows={teamBusConfigRows}
          rosterRows={teamBusRosterRows}
          summary={teamBusGarageSummary}
          pendingDeliveryJobs={pendingTeamBusJobs}
          pendingJobsByLevel={pendingTeamBusJobsByLevel}
          pendingQuantity={pendingTeamBusQuantity}
          processingKey={processingKey}
          cancelProcessingJobId={cancelProcessingJobId}
          onAcquire={onTeamBusAcquire}
          onCancelDelivery={onCancelDelivery}
          onOpenAssetRepair={onOpenAssetRepair}
          onOpenAssetSell={onOpenAssetSell}
          onRenameAsset={onRenameAsset}
        />
      )}

      {activeAssetSubTab === 'equipment_van' && (
        <EquipmentVanGaragePanel
          configRows={equipmentVanConfigRows}
          rosterRows={equipmentVanRosterRows}
          summary={equipmentVanGarageSummary}
          pendingDeliveryJobs={pendingEquipmentVanJobs}
          pendingJobsByLevel={pendingEquipmentVanJobsByLevel}
          pendingQuantity={pendingEquipmentVanQuantity}
          processingKey={processingKey}
          cancelProcessingJobId={cancelProcessingJobId}
          onAcquire={onEquipmentVanAcquire}
          onCancelDelivery={onCancelDelivery}
          onOpenAssetRepair={onOpenAssetRepair}
          onOpenAssetSell={onOpenAssetSell}
          onRenameAsset={onRenameAsset}
        />
      )}

      {activeAssetSubTab === 'mobile_workshop' && (
        <MobileWorkshopGaragePanel
          configRows={mobileWorkshopConfigRows}
          rosterRows={mobileWorkshopRosterRows}
          summary={mobileWorkshopGarageSummary}
          pendingDeliveryJobs={pendingMobileWorkshopJobs}
          pendingJobsByLevel={pendingMobileWorkshopJobsByLevel}
          pendingQuantity={pendingMobileWorkshopQuantity}
          processingKey={processingKey}
          cancelProcessingJobId={cancelProcessingJobId}
          onAcquire={onMobileWorkshopAcquire}
          onCancelDelivery={onCancelDelivery}
          onOpenAssetRepair={onOpenAssetRepair}
          onOpenAssetSell={onOpenAssetSell}
          onRenameAsset={onRenameAsset}
        />
      )}

      {activeAssetSubTab === 'medical_van' && (
        <MedicalVanGaragePanel
          configRows={medicalVanConfigRows}
          rosterRows={medicalVanRosterRows}
          summary={medicalVanGarageSummary}
          pendingDeliveryJobs={pendingMedicalVanJobs}
          pendingJobsByLevel={pendingMedicalVanJobsByLevel}
          pendingQuantity={pendingMedicalVanQuantity}
          processingKey={processingKey}
          cancelProcessingJobId={cancelProcessingJobId}
          onAcquire={onMedicalVanAcquire}
          onCancelDelivery={onCancelDelivery}
          onOpenAssetRepair={onOpenAssetRepair}
          onOpenAssetSell={onOpenAssetSell}
          onRenameAsset={onRenameAsset}
        />
      )}
      </div>
    </AssetSlotAccessContext.Provider>
  )
}