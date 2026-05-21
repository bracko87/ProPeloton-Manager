/**
 * EquipmentOverviewTab.tsx
 *
 * High-level overview tab for the Equipment dashboard.
 * Shows overall readiness, category summaries, editable default setup,
 * race supplies, and technical sponsor / support effects.
 */

import React, { useEffect, useMemo, useState } from 'react'
import EquipmentSetupPresetsBox from './EquipmentSetupPresetsBox'
import {
  getEquipmentDashboard,
  getEquipmentDefaultSetupOptions,
  saveEquipmentDefaultSetupTypes,
} from '../equipmentApi'
import type {
  EquipmentDashboard,
  EquipmentDefaultSetupCategoryOption,
  EquipmentDefaultSetupOptionsResponse,
  TechnicalSponsor,
} from '../types'
import { formatCondition, formatPercent, getStockBadgeClass } from '../equipmentFormatters'

type EquipmentOverviewTabProps = {
  clubId: string
}

type DefaultSetupSelection = {
  frame: string
  wheelset: string
  tires: string
  groupset: string
  helmet: string
  shoes: string
}

type StatCardProps = {
  label: string
  value: string | number
  helper?: string
}

function getSponsorInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
}

function getTechnicalSponsorLogoUrl(sponsor: TechnicalSponsor): string | null {
  const metadata = sponsor.metadata ?? {}

  const metadataLogo =
    typeof metadata.logo_url === 'string' && metadata.logo_url.trim()
      ? metadata.logo_url.trim()
      : null

  const directLogo =
    typeof sponsor.logo_url === 'string' && sponsor.logo_url.trim()
      ? sponsor.logo_url.trim()
      : null

  return directLogo ?? metadataLogo
}

function StatCard({ label, value, helper }: StatCardProps): JSX.Element {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      {helper ? <div className="mt-1 text-xs text-gray-500">{helper}</div> : null}
    </div>
  )
}

function makeInitialSelection(
  options: EquipmentDefaultSetupOptionsResponse | null
): DefaultSetupSelection {
  const empty: DefaultSetupSelection = {
    frame: '',
    wheelset: '',
    tires: '',
    groupset: '',
    helmet: '',
    shoes: '',
  }

  if (!options) return empty

  options.categories.forEach(category => {
    empty[category.equipment_category] =
      category.selected_catalog_item_id ??
      category.recommended_catalog_item_id ??
      ''
  })

  return empty
}

function getDefaultSetupOptionLabel(option: {
  display_name: string
  available_count: number
  owned_count: number
}): string {
  return `${option.display_name} (${option.available_count}/${option.owned_count})`
}

function getCategoryHelper(category: EquipmentDefaultSetupCategoryOption): string {
  const selected =
    category.options.find(
      option =>
        option.catalog_item_id === category.selected_catalog_item_id ||
        option.catalog_item_id === category.recommended_catalog_item_id
    ) ?? null

  if (!selected) {
    return `No owned ${category.label.toLowerCase()} type available.`
  }

  return `${selected.available_count}/${selected.owned_count} available/owned`
}

export default function EquipmentOverviewTab({
  clubId,
}: EquipmentOverviewTabProps): JSX.Element {
  const [dashboard, setDashboard] = useState<EquipmentDashboard | null>(null)
  const [setupOptions, setSetupOptions] =
    useState<EquipmentDefaultSetupOptionsResponse | null>(null)
  const [selection, setSelection] = useState<DefaultSetupSelection>({
    frame: '',
    wheelset: '',
    tires: '',
    groupset: '',
    helmet: '',
    shoes: '',
  })

  const [loading, setLoading] = useState(true)
  const [savingSetup, setSavingSetup] = useState(false)
  const [setupMessage, setSetupMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadDashboard(): Promise<void> {
    setLoading(true)
    setError(null)
    setSetupMessage(null)

    try {
      const [dashboardData, setupOptionsData] = await Promise.all([
        getEquipmentDashboard(clubId),
        getEquipmentDefaultSetupOptions(clubId),
      ])

      setDashboard(dashboardData)
      setSetupOptions(setupOptionsData)
      setSelection(makeInitialSelection(setupOptionsData))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveDefaultSetup(): Promise<void> {
    setSavingSetup(true)
    setError(null)
    setSetupMessage(null)

    try {
      const updatedOptions = await saveEquipmentDefaultSetupTypes({
        clubId,
        frameCatalogItemId: selection.frame || null,
        wheelsetCatalogItemId: selection.wheelset || null,
        tiresCatalogItemId: selection.tires || null,
        groupsetCatalogItemId: selection.groupset || null,
        helmetCatalogItemId: selection.helmet || null,
        shoesCatalogItemId: selection.shoes || null,
      })

      setSetupOptions(updatedOptions as EquipmentDefaultSetupOptionsResponse)
      setSelection(makeInitialSelection(updatedOptions as EquipmentDefaultSetupOptionsResponse))
      setSetupMessage('Default Race Setup saved.')
      await loadDashboard()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save Default Race Setup. Edge Function may not be deployed yet.'
      )
    } finally {
      setSavingSetup(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
  }, [clubId])

  const setupCategories = useMemo(
    () => setupOptions?.categories ?? [],
    [setupOptions]
  )

  if (loading) {
    return <div className="rounded-lg bg-white p-6 shadow-sm">Loading overview...</div>
  }

  if (error || !dashboard) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error ?? 'Unable to load equipment dashboard.'}
      </div>
    )
  }

  const technicalSponsor = dashboard.technical_sponsor
  const technicalSponsorLogoUrl = technicalSponsor
    ? getTechnicalSponsorLogoUrl(technicalSponsor)
    : null

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Overall readiness"
          value={formatPercent(dashboard.overall.overall_readiness_pct)}
          helper={`${dashboard.overall.ready_items}/${dashboard.overall.total_items} ready`}
        />
        <StatCard
          label="Average condition"
          value={formatCondition(dashboard.overall.avg_condition)}
        />
        <StatCard
          label="Maintenance needed"
          value={dashboard.overall.maintenance_needed}
          helper={`${dashboard.overall.critical_items} critical`}
        />
        <StatCard
          label="Mechanics Workshop"
          value={`Lv ${dashboard.support_effects.mechanics_workshop_level ?? 0}`}
          helper="Affects maintenance later"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Inventory Summary</h3>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              Refresh
            </button>
          </div>

          <div className="space-y-2">
            {dashboard.category_summary.map(category => (
              <div
                key={category.equipment_category}
                className="flex items-center justify-between rounded border border-gray-100 p-3"
              >
                <div>
                  <div className="font-medium text-gray-800">{category.label}</div>
                  <div className="text-xs text-gray-500">
                    Avg condition: {formatCondition(category.avg_condition)}
                  </div>
                </div>
                <div className="text-right text-sm text-gray-600">
                  <div>{category.owned_count} owned</div>
                  <div>{category.ready_count} ready</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-[460px] flex-col rounded-lg bg-white p-4 shadow-sm">
          <div>
            <h3 className="font-semibold text-gray-900">Default Race Setup</h3>
            <p className="mt-1 text-xs text-gray-500">
              Choose preferred equipment types. The race engine can later pick any available unit
              of the selected type, and fall back to the next available type if needed.
            </p>
          </div>

          {setupMessage ? (
            <div className="mt-3 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-700">
              {setupMessage}
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {setupCategories.map(category => {
              const selectedValue = selection[category.equipment_category] ?? ''

              return (
                <div
                  key={category.equipment_category}
                  className="grid gap-2 rounded border border-gray-100 p-2 md:grid-cols-[110px_1fr]"
                >
                  <div className="flex items-center text-sm text-gray-500">
                    {category.label}
                  </div>

                  <div>
                    <select
                      value={selectedValue}
                      disabled={category.options.length === 0}
                      onChange={event =>
                        setSelection(current => ({
                          ...current,
                          [category.equipment_category]: event.target.value,
                        }))
                      }
                      className="w-full rounded border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      {category.options.length === 0 ? (
                        <option value="">No owned {category.label.toLowerCase()}</option>
                      ) : (
                        category.options.map(option => (
                          <option
                            key={option.catalog_item_id}
                            value={option.catalog_item_id}
                          >
                            {getDefaultSetupOptionLabel(option)}
                          </option>
                        ))
                      )}
                    </select>

                    <div className="mt-1 text-xs text-gray-400">
                      {getCategoryHelper(category)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-auto flex justify-end pt-4">
            <button
              type="button"
              onClick={() => void handleSaveDefaultSetup()}
              disabled={savingSetup}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingSetup ? 'Saving...' : 'Save Default Setup'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900">Race Supplies</h3>
          <div className="mt-3 space-y-2">
            {dashboard.race_supplies_summary.map(supply => (
              <div
                key={supply.supply_key}
                className="flex items-center justify-between rounded border border-gray-100 p-3"
              >
                <div>
                  <div className="font-medium text-gray-800">{supply.display_name}</div>
                  <div className="text-xs text-gray-500">
                    Purchased {supply.total_purchased} · Used {supply.total_used}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{supply.quantity_available}</div>
                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      getStockBadgeClass(supply.stock_status),
                    ].join(' ')}
                  >
                    {supply.stock_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900">Technical Sponsor</h3>

          {technicalSponsor ? (
            <>
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-4">
                <div className="text-xl font-semibold text-blue-900">
                  {technicalSponsor.name}
                </div>

                <div className="mt-1 text-sm text-blue-700">
                  Discount: {formatPercent(technicalSponsor.technical_discount_pct)}
                </div>

                <p className="mt-2 text-xs text-blue-700">
                  Discount applies to matching sponsor-branded equipment and supplies.
                </p>
              </div>

              <div className="mt-4 space-y-1 text-xs text-gray-500">
                {(dashboard.support_effects.notes ?? []).map(note => (
                  <div key={note}>• {note}</div>
                ))}
              </div>

              <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-5">
                <div className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Sponsor Logo
                </div>

                <div className="flex h-48 items-center justify-center rounded-lg border border-gray-100 bg-white p-6">
                  {technicalSponsorLogoUrl ? (
                    <img
                      src={technicalSponsorLogoUrl}
                      alt={`${technicalSponsor.name} logo`}
                      className="max-h-full max-w-full object-contain"
                      onError={event => {
                        event.currentTarget.style.display = 'none'

                        const fallback = event.currentTarget
                          .nextElementSibling as HTMLElement | null

                        if (fallback) {
                          fallback.style.display = 'flex'
                        }
                      }}
                    />
                  ) : null}

                  <div
                    className={[
                      'h-full w-full items-center justify-center rounded-lg bg-blue-100 text-6xl font-bold text-blue-900',
                      technicalSponsorLogoUrl ? 'hidden' : 'flex',
                    ].join(' ')}
                  >
                    {getSponsorInitials(technicalSponsor.name)}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-3 rounded border border-gray-100 p-3 text-sm text-gray-500">
              No active technical sponsor.
            </div>
          )}
        </div>
      </div>

      <EquipmentSetupPresetsBox clubId={clubId} />
    </div>
  )
}