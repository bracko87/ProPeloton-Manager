import React, { useEffect, useMemo, useState } from 'react'
import {
  calculateEquipmentCatalogSetupBonusPreview,
  getEquipmentSetupPresets,
  saveEquipmentSetupPreset,
} from '../equipmentApi'

type EquipmentCategory =
  | 'frame'
  | 'wheelset'
  | 'tires'
  | 'groupset'
  | 'helmet'
  | 'shoes'

type SelectedCatalogItemIds = Record<EquipmentCategory, string | null>

type SetupOption = {
  label: string
  item_key?: string
  brand_name?: string | null
  owned_count?: number
  display_name?: string
  avg_condition?: number
  quality_score?: number
  available_count?: number
  catalog_item_id: string
  unavailable_count?: number
}

type SetupCategoryOptions = {
  label: string
  options: SetupOption[]
  equipment_category: EquipmentCategory
  selected_catalog_item_id: string | null
  recommended_catalog_item_id: string | null
}

type BonusPreview = {
  weighted_bonuses: Record<string, number>
  raw_weighted_bonuses?: Record<string, number>
  selected_items?: Array<{
    equipment_category: EquipmentCategory
    category_label: string
    weight: number
    catalog_item_id: string | null
    display_name: string | null
    brand_name: string | null
    quality_label: string | null
    terrain_role: string | null
    effects: Record<string, number>
  }>
}

type SetupPreset = {
  id: string
  setup_slot: number
  setup_name: string
  selected_catalog_item_ids: SelectedCatalogItemIds
  bonus_preview: BonusPreview
}

type SetupPresetsResponse = {
  club_id: string
  options: SetupCategoryOptions[]
  presets: SetupPreset[]
}

type SetupDraft = {
  setup_slot: number
  setup_name: string
  selected_catalog_item_ids: SelectedCatalogItemIds
}

const equipmentCategories: Array<{
  key: EquipmentCategory
  label: string
}> = [
  { key: 'frame', label: 'Frame' },
  { key: 'wheelset', label: 'Wheelset' },
  { key: 'tires', label: 'Tires' },
  { key: 'groupset', label: 'Groupset' },
  { key: 'helmet', label: 'Helmet' },
  { key: 'shoes', label: 'Shoes' },
]

const bonusLabels: Record<string, string> = {
  flat_bonus_pct: 'Flat',
  hilly_bonus_pct: 'Hilly',
  mountain_bonus_pct: 'Mountain',
  cobble_bonus_pct: 'Cobble',
  time_trial_bonus_pct: 'Time Trial',
  sprint_bonus_pct: 'Sprint',
  fatigue_reduction_pct: 'Fatigue',
}

const bonusOrder = [
  'flat_bonus_pct',
  'hilly_bonus_pct',
  'mountain_bonus_pct',
  'cobble_bonus_pct',
  'time_trial_bonus_pct',
  'sprint_bonus_pct',
  'fatigue_reduction_pct',
]

function emptySelectedCatalogItemIds(): SelectedCatalogItemIds {
  return {
    frame: null,
    wheelset: null,
    tires: null,
    groupset: null,
    helmet: null,
    shoes: null,
  }
}

function toNumber(value: unknown): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function formatBonusValue(value: number): string {
  const rounded = Math.round(value * 100) / 100
  const absoluteText = Number.isInteger(rounded)
    ? rounded.toFixed(0)
    : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')

  return `${rounded > 0 ? '+' : ''}${absoluteText}%`
}

function getBonusBadgeClass(value: number): string {
  if (value > 0) return 'border-green-100 bg-green-50 text-green-700'
  if (value < 0) return 'border-red-100 bg-red-50 text-red-700'
  return 'border-gray-100 bg-gray-50 text-gray-600'
}

function getBonusEntries(bonuses: Record<string, number> | undefined): Array<{
  key: string
  label: string
  value: number
}> {
  const source = bonuses ?? {}

  return bonusOrder
    .map(key => ({
      key,
      label: bonusLabels[key] ?? key,
      value: toNumber(source[key]),
    }))
    .filter(entry => entry.value !== 0)
}

function formatOptionLabel(option: SetupOption): string {
  const name = option.display_name?.trim() || option.label

  if (
    typeof option.available_count === 'number' &&
    typeof option.owned_count === 'number'
  ) {
    return `${name} (${option.available_count}/${option.owned_count})`
  }

  return option.label.replace(
    /\((\d+)\s+available\s+\/\s+(\d+)\s+owned\)/i,
    '($1/$2)'
  )
}

function getOptionsForCategory(
  options: SetupCategoryOptions[],
  category: EquipmentCategory
): SetupOption[] {
  return (
    options.find(optionGroup => optionGroup.equipment_category === category)
      ?.options ?? []
  )
}

function makeDraftFromPreset(preset: SetupPreset): SetupDraft {
  return {
    setup_slot: preset.setup_slot,
    setup_name: preset.setup_name,
    selected_catalog_item_ids: {
      ...emptySelectedCatalogItemIds(),
      ...(preset.selected_catalog_item_ids ?? {}),
    },
  }
}

function getMissingDraftCategories(draft: SetupDraft): string[] {
  return equipmentCategories
    .filter(category => !draft.selected_catalog_item_ids[category.key])
    .map(category => category.label)
}

function isDraftComplete(draft: SetupDraft): boolean {
  return getMissingDraftCategories(draft).length === 0
}

function PresetBonusLine({
  preview,
  loading,
}: {
  preview: BonusPreview | null | undefined
  loading: boolean
}): JSX.Element {
  const entries = getBonusEntries(preview?.weighted_bonuses)

  if (loading) {
    return <div className="text-xs text-gray-400">Calculating bonuses…</div>
  }

  if (entries.length === 0) {
    return (
      <div className="text-xs text-gray-400">
        No weighted setup bonuses yet.
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(entry => (
        <span
          key={entry.key}
          className={[
            'rounded-full border px-2 py-0.5 text-xs font-medium',
            getBonusBadgeClass(entry.value),
          ].join(' ')}
        >
          {entry.label} {formatBonusValue(entry.value)}
        </span>
      ))}
    </div>
  )
}

export default function EquipmentSetupPresetsBox({
  clubId,
  onSaved,
}: {
  clubId: string
  onSaved?: () => void
}): JSX.Element {
  const [data, setData] = useState<SetupPresetsResponse | null>(null)
  const [drafts, setDrafts] = useState<Record<number, SetupDraft>>({})
  const [draftPreviews, setDraftPreviews] = useState<Record<number, BonusPreview>>({})
  const [loading, setLoading] = useState(true)
  const [savingSlot, setSavingSlot] = useState<number | null>(null)
  const [previewLoadingSlots, setPreviewLoadingSlots] = useState<Set<number>>(
    () => new Set()
  )
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const presets = useMemo(() => data?.presets ?? [], [data?.presets])
  const options = useMemo(() => data?.options ?? [], [data?.options])

  function setPreviewLoading(slot: number, value: boolean): void {
    setPreviewLoadingSlots(previous => {
      const next = new Set(previous)

      if (value) {
        next.add(slot)
      } else {
        next.delete(slot)
      }

      return next
    })
  }

  async function loadPresets(): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const response = (await getEquipmentSetupPresets(
        clubId
      )) as SetupPresetsResponse

      const nextDrafts: Record<number, SetupDraft> = {}

      response.presets.forEach(preset => {
        nextDrafts[preset.setup_slot] = makeDraftFromPreset(preset)
      })

      setData(response)
      setDrafts(nextDrafts)
      setDraftPreviews({})
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to load setup presets.'

      setError(message)
    } finally {
      setLoading(false)
    }
  }

  async function loadDraftPreview(draft: SetupDraft): Promise<void> {
    setPreviewLoading(draft.setup_slot, true)

    try {
      const preview = (await calculateEquipmentCatalogSetupBonusPreview({
        frameCatalogItemId: draft.selected_catalog_item_ids.frame || null,
        wheelsetCatalogItemId: draft.selected_catalog_item_ids.wheelset || null,
        tiresCatalogItemId: draft.selected_catalog_item_ids.tires || null,
        groupsetCatalogItemId: draft.selected_catalog_item_ids.groupset || null,
        helmetCatalogItemId: draft.selected_catalog_item_ids.helmet || null,
        shoesCatalogItemId: draft.selected_catalog_item_ids.shoes || null,
      })) as BonusPreview

      setDraftPreviews(previous => ({
        ...previous,
        [draft.setup_slot]: preview,
      }))
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to calculate setup bonus.'

      setError(message)
    } finally {
      setPreviewLoading(draft.setup_slot, false)
    }
  }

  function updateDraftName(slot: number, setupName: string): void {
    setDrafts(previous => ({
      ...previous,
      [slot]: {
        ...previous[slot],
        setup_name: setupName,
      },
    }))
  }

  function updateDraftCategory(
    slot: number,
    category: EquipmentCategory,
    catalogItemId: string
  ): void {
    const currentDraft = drafts[slot]
    if (!currentDraft) return

    const nextDraft: SetupDraft = {
      ...currentDraft,
      selected_catalog_item_ids: {
        ...currentDraft.selected_catalog_item_ids,
        [category]: catalogItemId || null,
      },
    }

    setDrafts(previous => ({
      ...previous,
      [slot]: nextDraft,
    }))

    void loadDraftPreview(nextDraft)
  }

  async function saveDraft(draft: SetupDraft): Promise<void> {
    if (!isDraftComplete(draft)) {
      setError('Please select all six equipment types before saving this setup.')
      return
    }

    setSavingSlot(draft.setup_slot)
    setError(null)
    setSavedMessage(null)

    try {
      await saveEquipmentSetupPreset({
        clubId,
        setupSlot: draft.setup_slot,
        setupName: draft.setup_name.trim() || `Setup ${draft.setup_slot}`,
        frameCatalogItemId: draft.selected_catalog_item_ids.frame || null,
        wheelsetCatalogItemId: draft.selected_catalog_item_ids.wheelset || null,
        tiresCatalogItemId: draft.selected_catalog_item_ids.tires || null,
        groupsetCatalogItemId: draft.selected_catalog_item_ids.groupset || null,
        helmetCatalogItemId: draft.selected_catalog_item_ids.helmet || null,
        shoesCatalogItemId: draft.selected_catalog_item_ids.shoes || null,
      })

      setSavedMessage(`${draft.setup_name || `Setup ${draft.setup_slot}`} saved.`)
      await loadPresets()
      onSaved?.()
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to save setup preset.'

      setError(message)
    } finally {
      setSavingSlot(null)
    }
  }

  useEffect(() => {
    void loadPresets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId])

  if (loading) {
    return (
      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold">Race Setup Configurations</h3>
        <p className="mt-1 text-sm text-gray-500">Loading setup presets…</p>
      </section>
    )
  }

  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Race Setup Configurations</h3>
          <p className="mt-1 text-sm text-gray-500">
            Save up to four preferred equipment type setups. The race engine can
            later pick any available inventory unit of the selected type.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadPresets()}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {savedMessage && (
        <div className="mt-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {savedMessage}
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {presets.map(preset => {
          const draft = drafts[preset.setup_slot] ?? makeDraftFromPreset(preset)
          const preview = draftPreviews[preset.setup_slot] ?? preset.bonus_preview
          const isSaving = savingSlot === preset.setup_slot
          const isPreviewLoading = previewLoadingSlots.has(preset.setup_slot)
          const missingCategories = getMissingDraftCategories(draft)
          const canSave = isDraftComplete(draft)

          return (
            <div
              key={preset.id}
              className="rounded-lg border border-gray-100 bg-gray-50 p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-100 text-sm font-semibold text-yellow-800">
                  {preset.setup_slot}
                </div>

                <input
                  type="text"
                  value={draft.setup_name}
                  onChange={event =>
                    updateDraftName(preset.setup_slot, event.target.value)
                  }
                  className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
                  placeholder={`Setup ${preset.setup_slot}`}
                />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {equipmentCategories.map(category => {
                  const categoryOptions = getOptionsForCategory(options, category.key)
                  const selectedValue =
                    draft.selected_catalog_item_ids[category.key] ?? ''

                  return (
                    <label key={category.key} className="block">
                      <span className="text-xs font-medium uppercase text-gray-400">
                        {category.label}
                      </span>

                      <select
                        value={selectedValue}
                        onChange={event =>
                          updateDraftCategory(
                            preset.setup_slot,
                            category.key,
                            event.target.value
                          )
                        }
                        disabled={categoryOptions.length === 0 || isSaving}
                        className="mt-1 w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        <option value="">
                          {categoryOptions.length === 0
                            ? `No owned ${category.label.toLowerCase()}`
                            : `No ${category.label.toLowerCase()} selected`}
                        </option>

                        {categoryOptions.map(option => (
                          <option
                            key={option.catalog_item_id}
                            value={option.catalog_item_id}
                          >
                            {formatOptionLabel(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                })}
              </div>

              <div className="mt-4 rounded border border-gray-100 bg-white p-3">
                <div className="mb-2 text-xs font-medium uppercase text-gray-400">
                  Weighted bonus preview
                </div>

                <PresetBonusLine
                  preview={preview}
                  loading={isPreviewLoading}
                />

                <p className="mt-2 text-xs text-gray-400">
                  Calculated only from selected equipment types owned by your club.
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-gray-400">
                  {canSave
                    ? 'Setup is complete and can be saved.'
                    : `Missing: ${missingCategories.join(', ')}`}
                </div>

                <button
                  type="button"
                  onClick={() => void saveDraft(draft)}
                  disabled={isSaving || !canSave}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {isSaving ? 'Saving…' : 'Save Setup'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}