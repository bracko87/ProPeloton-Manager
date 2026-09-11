import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AssetsSection as AssetsSectionCore } from './AssetsSectionCore'
import { AssetAcquireCatalogModal } from './AssetAcquireCatalogModal'
import { EquipmentVanAcquireCatalogModal } from './EquipmentVanAcquireCatalogModal'
import { EquipmentVanSupportPanel } from './EquipmentVanSupportPanel'
import { MobileWorkshopAcquireCatalogModal } from './MobileWorkshopAcquireCatalogModal'
import { MobileWorkshopSupportPanel } from './MobileWorkshopSupportPanel'
import { TeamBusAcquireCatalogModal } from './TeamBusAcquireCatalogModal'
import { TeamBusSupportPanel } from './TeamBusSupportPanel'
import { TeamCarSupportPanel } from './TeamCarSupportPanel'
import type {
  InfrastructureAssetConfigRow,
  InfrastructureJobRow,
} from './infrastructureTypes'
import type { InfrastructureVisualAssetKey } from './infrastructureAssetImages'

type AssetsSectionProps = React.ComponentProps<typeof AssetsSectionCore>

type CatalogRosterRow = {
  asset_level: number
}

type CatalogModel = {
  assetKey: InfrastructureVisualAssetKey
  title: string
  description: string
  assetLabel: string
  acquireLabel: string
  configRows: InfrastructureAssetConfigRow[]
  rosterRows: CatalogRosterRow[]
  pendingJobsByLevel: Map<number, InfrastructureJobRow[]>
  pendingQuantity: number
  processingKeyPrefix: string
  onAcquire: (assetLevel: number) => void
}

function normalizeButtonLabel(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Infrastructure assets compatibility shell.
 *
 * The garage/slot UI remains in AssetsSectionCore unchanged. This shell intercepts
 * the existing "Acquire" actions with visual catalogues and adds production
 * race-support detail surfaces without changing repair, sell, rename, slot unlock,
 * delivery or assignment behavior.
 */
export function AssetsSection(props: AssetsSectionProps): JSX.Element {
  const { t } = useTranslation('infrastructure')
  const [isCatalogOpen, setIsCatalogOpen] = useState(false)

  const catalog = useMemo<CatalogModel>(() => {
    switch (props.activeAssetSubTab) {
      case 'team_bus':
        return {
          assetKey: 'team_bus',
          title: t('assets.acquireTeamBus'),
          description: t('assets.teamBusAcquireDescription'),
          assetLabel: t('assets.teamBus'),
          acquireLabel: t('assets.acquireTeamBus'),
          configRows: props.teamBusConfigRows ?? [],
          rosterRows: (props.teamBusRosterRows ?? []) as CatalogRosterRow[],
          pendingJobsByLevel:
            props.pendingTeamBusJobsByLevel ?? new Map<number, InfrastructureJobRow[]>(),
          pendingQuantity: props.pendingTeamBusQuantity ?? 0,
          processingKeyPrefix: 'asset:team_bus',
          onAcquire: props.onTeamBusAcquire,
        }

      case 'equipment_van':
        return {
          assetKey: 'equipment_van',
          title: t('assets.acquireEquipmentVan'),
          description: t('assets.equipmentVanAcquireDescription'),
          assetLabel: t('assets.equipmentVan'),
          acquireLabel: t('assets.acquireEquipmentVan'),
          configRows: props.equipmentVanConfigRows ?? [],
          rosterRows: (props.equipmentVanRosterRows ?? []) as CatalogRosterRow[],
          pendingJobsByLevel:
            props.pendingEquipmentVanJobsByLevel ?? new Map<number, InfrastructureJobRow[]>(),
          pendingQuantity: props.pendingEquipmentVanQuantity ?? 0,
          processingKeyPrefix: 'asset:equipment_van',
          onAcquire: props.onEquipmentVanAcquire,
        }

      case 'mobile_workshop':
        return {
          assetKey: 'mobile_workshop',
          title: t('assets.acquireMobileWorkshop'),
          description: t('assets.mobileWorkshopAcquireDescription'),
          assetLabel: t('assets.mobileWorkshop'),
          acquireLabel: t('assets.acquireMobileWorkshop'),
          configRows: props.mobileWorkshopConfigRows ?? [],
          rosterRows: (props.mobileWorkshopRosterRows ?? []) as CatalogRosterRow[],
          pendingJobsByLevel:
            props.pendingMobileWorkshopJobsByLevel ?? new Map<number, InfrastructureJobRow[]>(),
          pendingQuantity: props.pendingMobileWorkshopQuantity ?? 0,
          processingKeyPrefix: 'asset:mobile_workshop',
          onAcquire: props.onMobileWorkshopAcquire,
        }

      case 'medical_van':
        return {
          assetKey: 'medical_van',
          title: t('assets.acquireMedicalVan'),
          description: t('assets.medicalVanAcquireDescription'),
          assetLabel: t('assets.medicalVan'),
          acquireLabel: t('assets.acquireMedicalVan'),
          configRows: props.medicalVanConfigRows ?? [],
          rosterRows: (props.medicalVanRosterRows ?? []) as CatalogRosterRow[],
          pendingJobsByLevel:
            props.pendingMedicalVanJobsByLevel ?? new Map<number, InfrastructureJobRow[]>(),
          pendingQuantity: props.pendingMedicalVanQuantity ?? 0,
          processingKeyPrefix: 'asset:medical_van',
          onAcquire: props.onMedicalVanAcquire,
        }

      case 'team_cars':
      default:
        return {
          assetKey: 'team_car',
          title: t('assets.acquireTeamCar'),
          description: t('assets.teamCarAcquireDescription'),
          assetLabel: t('assets.teamCars'),
          acquireLabel: t('assets.acquireTeamCar'),
          configRows: props.teamCarConfigRows ?? [],
          rosterRows: (props.teamCarRosterRows ?? []) as CatalogRosterRow[],
          pendingJobsByLevel:
            props.pendingTeamCarJobsByLevel ?? new Map<number, InfrastructureJobRow[]>(),
          pendingQuantity: props.pendingTeamCarQuantity ?? 0,
          processingKeyPrefix: 'asset:team_car',
          onAcquire: props.onTeamCarAcquire,
        }
    }
  }, [
    props.activeAssetSubTab,
    props.teamCarConfigRows,
    props.teamCarRosterRows,
    props.pendingTeamCarJobsByLevel,
    props.pendingTeamCarQuantity,
    props.onTeamCarAcquire,
    props.teamBusConfigRows,
    props.teamBusRosterRows,
    props.pendingTeamBusJobsByLevel,
    props.pendingTeamBusQuantity,
    props.onTeamBusAcquire,
    props.equipmentVanConfigRows,
    props.equipmentVanRosterRows,
    props.pendingEquipmentVanJobsByLevel,
    props.pendingEquipmentVanQuantity,
    props.onEquipmentVanAcquire,
    props.mobileWorkshopConfigRows,
    props.mobileWorkshopRosterRows,
    props.pendingMobileWorkshopJobsByLevel,
    props.pendingMobileWorkshopQuantity,
    props.onMobileWorkshopAcquire,
    props.medicalVanConfigRows,
    props.medicalVanRosterRows,
    props.pendingMedicalVanJobsByLevel,
    props.pendingMedicalVanQuantity,
    props.onMedicalVanAcquire,
    t,
  ])

  const ownedByLevel = useMemo(() => {
    const counts = new Map<number, number>()

    catalog.rosterRows.forEach(row => {
      counts.set(row.asset_level, (counts.get(row.asset_level) ?? 0) + 1)
    })

    return counts
  }, [catalog.rosterRows])

  const effectiveSlots = useMemo(() => {
    const access = props.assetSlotAccessByKey?.[catalog.assetKey]

    if (access && Number(access.effective_slots) > 0) {
      return Number(access.effective_slots)
    }

    return catalog.configRows.reduce(
      (maximum, row) => Math.max(maximum, Number(row.max_total_quantity ?? 0)),
      0,
    )
  }, [catalog.assetKey, catalog.configRows, props.assetSlotAccessByKey])

  const isFull =
    effectiveSlots > 0 &&
    catalog.rosterRows.length + catalog.pendingQuantity >= effectiveSlots

  useEffect(() => {
    setIsCatalogOpen(false)
  }, [props.activeAssetSubTab])

  const handleAcquireClickCapture = (
    event: React.MouseEvent<HTMLDivElement>,
  ): void => {
    const element = event.target as HTMLElement | null
    const button = element?.closest('button')

    if (!button || button.disabled) return

    const label = normalizeButtonLabel(button.textContent)
    const expectedAcquireLabel = normalizeButtonLabel(catalog.acquireLabel)
    const genericAcquireLabel = normalizeButtonLabel(t('common.acquire'))

    if (label !== expectedAcquireLabel && label !== genericAcquireLabel) return

    event.preventDefault()
    event.stopPropagation()
    setIsCatalogOpen(true)
  }

  return (
    <>
      <div onClickCapture={handleAcquireClickCapture}>
        <AssetsSectionCore {...props} />
      </div>

      {props.activeAssetSubTab === 'team_cars' && (
        <TeamCarSupportPanel
          configRows={props.teamCarConfigRows ?? []}
          rosterRows={props.teamCarRosterRows ?? []}
        />
      )}

      {props.activeAssetSubTab === 'team_bus' && (
        <TeamBusSupportPanel
          configRows={props.teamBusConfigRows ?? []}
          rosterRows={props.teamBusRosterRows ?? []}
        />
      )}

      {props.activeAssetSubTab === 'equipment_van' && (
        <EquipmentVanSupportPanel
          configRows={props.equipmentVanConfigRows ?? []}
          rosterRows={props.equipmentVanRosterRows ?? []}
        />
      )}

      {props.activeAssetSubTab === 'mobile_workshop' && (
        <MobileWorkshopSupportPanel
          configRows={props.mobileWorkshopConfigRows ?? []}
          rosterRows={props.mobileWorkshopRosterRows ?? []}
        />
      )}

      {isCatalogOpen && catalog.assetKey === 'team_bus' && (
        <TeamBusAcquireCatalogModal
          configRows={props.teamBusConfigRows ?? []}
          ownedByLevel={ownedByLevel}
          pendingJobsByLevel={props.pendingTeamBusJobsByLevel ?? new Map<number, InfrastructureJobRow[]>()}
          processingKey={props.processingKey}
          isFull={isFull}
          onAcquire={props.onTeamBusAcquire}
          onClose={() => setIsCatalogOpen(false)}
        />
      )}

      {isCatalogOpen && catalog.assetKey === 'equipment_van' && (
        <EquipmentVanAcquireCatalogModal
          configRows={props.equipmentVanConfigRows ?? []}
          ownedByLevel={ownedByLevel}
          pendingJobsByLevel={props.pendingEquipmentVanJobsByLevel ?? new Map<number, InfrastructureJobRow[]>()}
          processingKey={props.processingKey}
          isFull={isFull}
          onAcquire={props.onEquipmentVanAcquire}
          onClose={() => setIsCatalogOpen(false)}
        />
      )}

      {isCatalogOpen && catalog.assetKey === 'mobile_workshop' && (
        <MobileWorkshopAcquireCatalogModal
          configRows={props.mobileWorkshopConfigRows ?? []}
          ownedByLevel={ownedByLevel}
          pendingJobsByLevel={props.pendingMobileWorkshopJobsByLevel ?? new Map<number, InfrastructureJobRow[]>()}
          processingKey={props.processingKey}
          isFull={isFull}
          onAcquire={props.onMobileWorkshopAcquire}
          onClose={() => setIsCatalogOpen(false)}
        />
      )}

      {isCatalogOpen && catalog.assetKey !== 'team_bus' && catalog.assetKey !== 'equipment_van' && catalog.assetKey !== 'mobile_workshop' && (
        <AssetAcquireCatalogModal
          assetKey={catalog.assetKey}
          title={catalog.title}
          description={catalog.description}
          assetLabel={catalog.assetLabel}
          configRows={catalog.configRows}
          ownedByLevel={ownedByLevel}
          pendingJobsByLevel={catalog.pendingJobsByLevel}
          processingKey={props.processingKey}
          processingKeyPrefix={catalog.processingKeyPrefix}
          isFull={isFull}
          onAcquire={catalog.onAcquire}
          onClose={() => setIsCatalogOpen(false)}
        />
      )}
    </>
  )
}
