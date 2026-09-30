import React, { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import NationalAssociationHeader from '../../components/nations/NationalAssociationHeader'
import { calculateEquipmentCatalogSetupBonusPreview } from './equipment/equipmentApi'

type EquipmentTab = 'overview' | 'inventory'

type EquipmentCategory =
  | 'frame'
  | 'wheelset'
  | 'tires'
  | 'groupset'
  | 'helmet'
  | 'shoes'

type AssociationData = {
  country_code?: string
  association_name?: string
  association_status?: string | null
  is_member?: boolean
  coach?: {
    club_name?: string | null
    user_id?: string | null
  } | null
}

type StandardEquipment = {
  equipment_category: EquipmentCategory
  specialization: string
  choice_rank?: number
  catalog_item_id?: string | null
  display_name?: string | null
  tier?: number | null
  quality_score?: number | null
  image_url?: string | null
  effects?: Record<string, number> | null
  metadata?: Record<string, unknown> | null
  condition_percent?: number
  unlimited?: boolean
}

type StandardAsset = {
  asset_key: string
  asset_level: number
  quantity: number
  usage_note?: string | null
  asset_name?: string | null
  image_url?: string | null
  condition_percent?: number
  unlimited?: boolean
}

type StandardSupply = {
  supply_key: string
  display_name: string
  quantity: number
  replenishment_scope: string
  catalog_item_id?: string | null
  image_url?: string | null
  unlimited?: boolean
}

type StandardPackage = {
  cost_model?: string
  has_treasury?: boolean
  resource_policy?: {
    unlimited?: boolean
    condition_locked_percent?: number
    consumables_deplete?: boolean
    maintenance_required?: boolean
  }
  assets?: StandardAsset[]
  equipment?: StandardEquipment[]
  supplies?: StandardSupply[]
}

type EquipmentPreset = {
  preset_id: string
  setup_slot: number
  setup_name: string
  slot_purpose?: string | null
  is_empty?: boolean
  frame_catalog_item_id: string | null
  wheelset_catalog_item_id: string | null
  tires_catalog_item_id: string | null
  groupset_catalog_item_id: string | null
  helmet_catalog_item_id: string | null
  shoes_catalog_item_id: string | null
}

type EquipmentPresetData = {
  allowed: boolean
  can_edit?: boolean
  reason?: string
  technical_club_id?: string | null
  default_slot?: number
  presets?: EquipmentPreset[]
}

type EquipmentPresetDraft = {
  setup_name: string
  frame_catalog_item_id: string
  wheelset_catalog_item_id: string
  tires_catalog_item_id: string
  groupset_catalog_item_id: string
  helmet_catalog_item_id: string
  shoes_catalog_item_id: string
}

type BonusPreview = {
  weighted_bonuses?: Record<string, number>
}

const EQUIPMENT_CATEGORY_ORDER: EquipmentCategory[] = [
  'frame',
  'wheelset',
  'tires',
  'groupset',
  'helmet',
  'shoes',
]

const SPECIALIZATION_ORDER = ['flat', 'mountain', 'time_trial'] as const

const BONUS_ORDER = [
  'flat_bonus_pct',
  'hilly_bonus_pct',
  'mountain_bonus_pct',
  'cobble_bonus_pct',
  'time_trial_bonus_pct',
  'sprint_bonus_pct',
  'fatigue_reduction_pct',
] as const

const BONUS_LABELS: Record<string, string> = {
  flat_bonus_pct: 'Flat',
  hilly_bonus_pct: 'Hilly',
  mountain_bonus_pct: 'Mountain',
  cobble_bonus_pct: 'Cobble',
  time_trial_bonus_pct: 'Time Trial',
  sprint_bonus_pct: 'Sprint',
  fatigue_reduction_pct: 'Fatigue',
}

function humanize(value?: string | null): string {
  if (!value) return '—'
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function getEquipmentImageUrl(item?: StandardEquipment | null): string | null {
  if (!item) return null

  if (typeof item.image_url === 'string' && item.image_url.trim()) {
    return item.image_url.trim()
  }

  const metadata = item.metadata ?? {}
  const snake = metadata.image_url
  if (typeof snake === 'string' && snake.trim()) return snake.trim()

  const camel = metadata.imageUrl
  if (typeof camel === 'string' && camel.trim()) return camel.trim()

  return null
}

function getInitials(value?: string | null): string {
  return (value ?? '')
    .split(/[ /-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('') || '—'
}

function toDraft(preset: EquipmentPreset): EquipmentPresetDraft {
  return {
    setup_name: preset.setup_name ?? `Setup ${preset.setup_slot}`,
    frame_catalog_item_id: preset.frame_catalog_item_id ?? '',
    wheelset_catalog_item_id: preset.wheelset_catalog_item_id ?? '',
    tires_catalog_item_id: preset.tires_catalog_item_id ?? '',
    groupset_catalog_item_id: preset.groupset_catalog_item_id ?? '',
    helmet_catalog_item_id: preset.helmet_catalog_item_id ?? '',
    shoes_catalog_item_id: preset.shoes_catalog_item_id ?? '',
  }
}

function isCompleteDraft(draft?: EquipmentPresetDraft | null): boolean {
  if (!draft) return false
  return EQUIPMENT_CATEGORY_ORDER.every(
    category => Boolean(draft[`${category}_catalog_item_id` as keyof EquipmentPresetDraft]),
  )
}

function formatBonus(value: number): string {
  const rounded = Math.round(Number(value) * 100) / 100
  const text = Number.isInteger(rounded)
    ? rounded.toFixed(0)
    : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return `${rounded > 0 ? '+' : ''}${text}%`
}

function bonusBadgeClass(value: number): string {
  if (value > 0) return 'border-emerald-100 bg-emerald-50 text-emerald-700'
  if (value < 0) return 'border-rose-100 bg-rose-50 text-rose-700'
  return 'border-slate-100 bg-slate-50 text-slate-600'
}

function bonusEntries(preview?: BonusPreview | null): Array<{
  key: string
  label: string
  value: number
}> {
  const source = preview?.weighted_bonuses ?? {}
  return BONUS_ORDER
    .map(key => ({
      key,
      label: BONUS_LABELS[key] ?? humanize(key),
      value: Number(source[key] ?? 0),
    }))
    .filter(entry => Number.isFinite(entry.value) && entry.value !== 0)
}

function effectEntries(item?: StandardEquipment | null): Array<{
  key: string
  label: string
  value: number
}> {
  const source = item?.effects ?? {}
  return BONUS_ORDER
    .map(key => ({
      key,
      label: BONUS_LABELS[key] ?? humanize(key),
      value: Number(source[key] ?? 0),
    }))
    .filter(entry => Number.isFinite(entry.value) && entry.value !== 0)
}

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
      className={[
        'rounded-md px-4 py-2 text-sm font-medium transition',
        active ? 'bg-yellow-400 text-black' : 'text-gray-600 hover:bg-gray-100',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export default function NationalTeamPackagePage(): JSX.Element {
  const { t } = useTranslation('nations')
  const { t: equipmentT } = useTranslation('equipment')
  const [activeTab, setActiveTab] = useState<EquipmentTab>('overview')
  const [association, setAssociation] = useState<AssociationData | null>(null)
  const [standardPackage, setStandardPackage] = useState<StandardPackage | null>(null)
  const [presetData, setPresetData] = useState<EquipmentPresetData | null>(null)
  const [presetDrafts, setPresetDrafts] = useState<Record<number, EquipmentPresetDraft>>({})
  const [bonusPreviews, setBonusPreviews] = useState<Record<number, BonusPreview>>({})
  const [previewLoading, setPreviewLoading] = useState<Set<number>>(() => new Set())
  const [loading, setLoading] = useState(true)
  const [isCoach, setIsCoach] = useState(false)
  const [busySlot, setBusySlot] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const equipmentBySpecialization = useMemo(() => {
    const result = new Map<string, StandardEquipment[]>()

    for (const item of standardPackage?.equipment ?? []) {
      const current = result.get(item.specialization) ?? []
      current.push(item)
      result.set(item.specialization, current)
    }

    for (const items of result.values()) {
      items.sort((a, b) => {
        const aCategory = EQUIPMENT_CATEGORY_ORDER.indexOf(a.equipment_category)
        const bCategory = EQUIPMENT_CATEGORY_ORDER.indexOf(b.equipment_category)
        if (aCategory !== bCategory) return aCategory - bCategory
        return Number(a.choice_rank ?? 99) - Number(b.choice_rank ?? 99)
      })
    }

    return result
  }, [standardPackage?.equipment])

  const equipmentByCategory = useMemo(() => {
    const result = new Map<EquipmentCategory, StandardEquipment[]>()

    for (const item of standardPackage?.equipment ?? []) {
      const current = result.get(item.equipment_category) ?? []
      current.push(item)
      result.set(item.equipment_category, current)
    }

    for (const items of result.values()) {
      items.sort((a, b) => {
        const specializationDiff =
          SPECIALIZATION_ORDER.indexOf(a.specialization as (typeof SPECIALIZATION_ORDER)[number]) -
          SPECIALIZATION_ORDER.indexOf(b.specialization as (typeof SPECIALIZATION_ORDER)[number])

        if (specializationDiff !== 0) return specializationDiff
        return Number(a.choice_rank ?? 99) - Number(b.choice_rank ?? 99)
      })
    }

    return result
  }, [standardPackage?.equipment])

  const equipmentById = useMemo(
    () =>
      new Map(
        (standardPackage?.equipment ?? [])
          .filter(item => Boolean(item.catalog_item_id))
          .map(item => [String(item.catalog_item_id), item]),
      ),
    [standardPackage?.equipment],
  )

  const specializationLabel = (specialization: string): string => {
    if (specialization === 'flat') return t('raceTypes.flat')
    if (specialization === 'mountain') return t('raceTypes.mountain')
    if (specialization === 'time_trial') return t('raceTypes.teamTimeTrial')
    return humanize(specialization)
  }

  const categoryLabel = (category: EquipmentCategory): string => {
    const keyMap: Record<EquipmentCategory, string> = {
      frame: 'categories.frames',
      wheelset: 'categories.wheelsets',
      tires: 'categories.tires',
      groupset: 'categories.groupsets',
      helmet: 'categories.helmets',
      shoes: 'categories.shoes',
    }

    return equipmentT(keyMap[category], { defaultValue: humanize(category) })
  }

  const loadBonusPreview = async (
    slot: number,
    draft: EquipmentPresetDraft,
  ): Promise<void> => {
    if (!isCompleteDraft(draft)) {
      setBonusPreviews(current => {
        const next = { ...current }
        delete next[slot]
        return next
      })
      return
    }

    setPreviewLoading(current => new Set(current).add(slot))

    try {
      const preview = (await calculateEquipmentCatalogSetupBonusPreview({
        frameCatalogItemId: draft.frame_catalog_item_id || null,
        wheelsetCatalogItemId: draft.wheelset_catalog_item_id || null,
        tiresCatalogItemId: draft.tires_catalog_item_id || null,
        groupsetCatalogItemId: draft.groupset_catalog_item_id || null,
        helmetCatalogItemId: draft.helmet_catalog_item_id || null,
        shoesCatalogItemId: draft.shoes_catalog_item_id || null,
      })) as BonusPreview

      setBonusPreviews(current => ({
        ...current,
        [slot]: preview,
      }))
    } catch {
      setBonusPreviews(current => {
        const next = { ...current }
        delete next[slot]
        return next
      })
    } finally {
      setPreviewLoading(current => {
        const next = new Set(current)
        next.delete(slot)
        return next
      })
    }
  }

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const [associationResponse, coachResponse] = await Promise.all([
        supabase.rpc('get_my_national_association_v1'),
        supabase.rpc('get_national_coach_dashboard_v1'),
      ])

      if (associationResponse.error) throw associationResponse.error

      const nextAssociation = (associationResponse.data ?? null) as AssociationData | null
      const nextIsCoach = !coachResponse.error && Boolean((coachResponse.data as any)?.allowed)

      setAssociation(nextAssociation)
      setIsCoach(nextIsCoach)

      if (!nextIsCoach) {
        setStandardPackage(null)
        setPresetData(null)
        setPresetDrafts({})
        setBonusPreviews({})
        return
      }

      const [packageResponse, presetsResponse] = await Promise.all([
        supabase.rpc('get_national_team_standard_package_v1'),
        supabase.rpc('get_my_national_team_equipment_presets_v1'),
      ])

      if (packageResponse.error) throw packageResponse.error

      const nextPackage = (packageResponse.data ?? null) as StandardPackage | null
      const nextPresets = presetsResponse.error
        ? ({ allowed: false, can_edit: false, reason: 'unavailable', presets: [] } as EquipmentPresetData)
        : ((presetsResponse.data ?? null) as EquipmentPresetData | null)

      setStandardPackage(nextPackage)
      setPresetData(nextPresets)

      const drafts: Record<number, EquipmentPresetDraft> = {}
      for (const preset of nextPresets?.presets ?? []) {
        drafts[preset.setup_slot] = toDraft(preset)
      }
      setPresetDrafts(drafts)

      await Promise.all(
        Object.entries(drafts).map(([slot, draft]) =>
          loadBonusPreview(Number(slot), draft),
        ),
      )
    } catch (caught: any) {
      setError(caught?.message ?? t('association.errors.load'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateDraftName = (slot: number, value: string): void => {
    const existing = presetDrafts[slot]
    if (!existing) return

    setPresetDrafts(current => ({
      ...current,
      [slot]: {
        ...existing,
        setup_name: value,
      },
    }))
  }

  const updateDraftCategory = (
    slot: number,
    category: EquipmentCategory,
    value: string,
  ): void => {
    const currentDraft = presetDrafts[slot]
    if (!currentDraft) return

    const field = `${category}_catalog_item_id` as keyof EquipmentPresetDraft
    const nextDraft: EquipmentPresetDraft = {
      ...currentDraft,
      [field]: value,
    }

    setPresetDrafts(current => ({
      ...current,
      [slot]: nextDraft,
    }))

    void loadBonusPreview(slot, nextDraft)
  }

  const savePreset = async (slot: number): Promise<void> => {
    const draft = presetDrafts[slot]
    if (!draft || !presetData?.can_edit) return

    if (!isCompleteDraft(draft)) {
      setError(t('association.package.completeSet'))
      return
    }

    try {
      setBusySlot(slot)
      setError(null)
      setMessage(null)

      const { error: rpcError } = await supabase.rpc(
        'save_my_national_team_equipment_preset_v1',
        {
          p_setup_slot: slot,
          p_setup_name: draft.setup_name,
          p_frame_catalog_item_id: draft.frame_catalog_item_id,
          p_wheelset_catalog_item_id: draft.wheelset_catalog_item_id,
          p_tires_catalog_item_id: draft.tires_catalog_item_id,
          p_groupset_catalog_item_id: draft.groupset_catalog_item_id,
          p_helmet_catalog_item_id: draft.helmet_catalog_item_id,
          p_shoes_catalog_item_id: draft.shoes_catalog_item_id,
        },
      )

      if (rpcError) throw rpcError

      setMessage(t('association.package.setSaved', { slot }))
      await load()
    } catch (caught: any) {
      setError(caught?.message ?? t('association.errors.action'))
    } finally {
      setBusySlot(null)
    }
  }

  if (loading && !standardPackage) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('association.loading')}
        </div>
      </div>
    )
  }

  if (!isCoach) {
    return (
      <div className="w-full space-y-6">
        <NationalAssociationHeader
          association={association}
          isCoach={false}
          loading={loading}
          onRefresh={() => void load()}
        />

        <section className="rounded border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h3 className="font-semibold text-amber-950">
            {t('association.package.coachOnlyTitle')}
          </h3>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            {t('association.package.coachOnlyText')}
          </p>
        </section>
      </div>
    )
  }

  const equipmentCount = standardPackage?.equipment?.length ?? 0
  const assetCount = standardPackage?.assets?.reduce(
    (sum, item) => sum + Number(item.quantity ?? 0),
    0,
  ) ?? 0
  const supplyTypes = standardPackage?.supplies?.length ?? 0

  return (
    <div className="w-full space-y-6">
      <NationalAssociationHeader
        association={association}
        isCoach={isCoach}
        loading={loading}
        onRefresh={() => void load()}
      />

      <section className="rounded border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">
          {t('association.package.title')}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {t('association.package.description')}
        </p>
      </section>

      <div className="inline-flex flex-wrap rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
        <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
          {t('association.package.overviewTab')}
        </TabButton>
        <TabButton active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')}>
          {t('association.package.inventoryTab')}
        </TabButton>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      {activeTab === 'overview' ? (
        <div className="space-y-6">
          <section className="rounded-lg bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {t('association.package.raceSetupsTitle')}
                </h3>
                <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
                  {t('association.package.raceSetupsDescription')}
                </p>
              </div>
              {!presetData?.can_edit ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {t('association.package.coachOnlyEdit')}
                </span>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-3">
              {(presetData?.presets ?? []).map(preset => {
                const draft = presetDrafts[preset.setup_slot] ?? toDraft(preset)
                const preview = bonusPreviews[preset.setup_slot]
                const previewEntries = bonusEntries(preview)
                const complete = isCompleteDraft(draft)
                const missing = EQUIPMENT_CATEGORY_ORDER
                  .filter(category => !draft[`${category}_catalog_item_id` as keyof EquipmentPresetDraft])
                  .map(categoryLabel)
                const canEdit = presetData?.can_edit === true
                const defaultSlot = preset.setup_slot === Number(presetData?.default_slot ?? 1)

                return (
                  <article
                    key={preset.preset_id}
                    className="rounded-lg border border-gray-100 bg-gray-50 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-100 text-sm font-semibold text-yellow-800">
                        {preset.setup_slot}
                      </div>

                      <input
                        type="text"
                        value={draft.setup_name}
                        maxLength={60}
                        disabled={!canEdit || busySlot === preset.setup_slot}
                        onChange={event =>
                          updateDraftName(preset.setup_slot, event.target.value)
                        }
                        className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 disabled:bg-slate-100 disabled:text-slate-600"
                        placeholder={t('association.package.setupPlaceholder', {
                          slot: preset.setup_slot,
                        })}
                      />

                      <span className={[
                        'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                        complete
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500',
                      ].join(' ')}>
                        {defaultSlot
                          ? t('association.package.defaultFlat')
                          : complete
                            ? t('association.package.complete')
                            : t('association.package.empty')}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {EQUIPMENT_CATEGORY_ORDER.map(category => {
                        const field = `${category}_catalog_item_id` as keyof EquipmentPresetDraft
                        const selectedId = String(draft[field] ?? '')
                        const categoryOptions = equipmentByCategory.get(category) ?? []
                        const selectedItem = equipmentById.get(selectedId)

                        return (
                          <label key={category} className="block">
                            <span className="text-xs font-medium uppercase text-gray-400">
                              {categoryLabel(category)}
                            </span>
                            <select
                              value={selectedId}
                              disabled={!canEdit || busySlot === preset.setup_slot}
                              onChange={event =>
                                updateDraftCategory(
                                  preset.setup_slot,
                                  category,
                                  event.target.value,
                                )
                              }
                              className="mt-1 w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                            >
                              <option value="">
                                {t('association.package.noneSelected', {
                                  category: categoryLabel(category),
                                })}
                              </option>
                              {categoryOptions.map(item => (
                                <option
                                  key={`${category}:${item.specialization}:${item.catalog_item_id}`}
                                  value={item.catalog_item_id ?? ''}
                                >
                                  {specializationLabel(item.specialization)} · {item.display_name} · Q{item.quality_score ?? '—'}
                                </option>
                              ))}
                            </select>
                            {selectedItem ? (
                              <div className="mt-1 text-xs text-slate-400">
                                {t('association.package.itemSummary', {
                                  tier: selectedItem.tier ?? '—',
                                  quality: selectedItem.quality_score ?? '—',
                                })}
                              </div>
                            ) : null}
                          </label>
                        )
                      })}
                    </div>

                    <div className="mt-4 rounded border border-gray-100 bg-white p-3">
                      <div className="mb-2 text-xs font-medium uppercase text-gray-400">
                        {t('association.package.weightedPreview')}
                      </div>

                      {previewLoading.has(preset.setup_slot) ? (
                        <div className="text-xs text-slate-400">
                          {t('association.package.calculating')}
                        </div>
                      ) : previewEntries.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {previewEntries.map(entry => (
                            <span
                              key={entry.key}
                              className={[
                                'rounded-full border px-2 py-0.5 text-xs font-medium',
                                bonusBadgeClass(entry.value),
                              ].join(' ')}
                            >
                              {entry.label} {formatBonus(entry.value)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">
                          {complete
                            ? t('association.package.noWeightedBonus')
                            : t('association.package.selectSixForPreview')}
                        </div>
                      )}

                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        {t('association.package.previewExplanation')}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-slate-400">
                        {complete
                          ? t('association.package.completeSetup')
                          : t('association.package.missingCategories', {
                              categories: missing.join(', '),
                            })}
                      </div>

                      {canEdit ? (
                        <button
                          type="button"
                          disabled={busySlot === preset.setup_slot || !complete}
                          onClick={() => void savePreset(preset.setup_slot)}
                          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                        >
                          {busySlot === preset.setup_slot
                            ? t('association.package.saving')
                            : t('association.package.saveSetup')}
                        </button>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                {t('association.package.summaryEquipment')}
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {equipmentCount}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {t('association.package.summaryEquipmentHelp')}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                {t('association.package.summaryAssets')}
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {assetCount}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {t('association.package.summaryAssetsHelp')}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                {t('association.package.summarySupplies')}
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {supplyTypes}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {t('association.package.summarySuppliesHelp')}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                {t('association.package.resourcePolicy')}
              </div>
              <div className="mt-2 text-lg font-semibold text-emerald-700">
                {t('association.package.unlimited')}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {t('association.package.resourcePolicyHelp')}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'inventory' && standardPackage ? (
        <div className="space-y-4">
          <details className="rounded-lg bg-white shadow-sm">
            <summary className="cursor-pointer list-none p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {t('association.package.selectionPoolTitle')}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {t('association.package.selectionPoolDescription')}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {equipmentCount} {t('association.package.models')}
                </span>
              </div>
            </summary>

            <div className="space-y-6 border-t border-slate-200 p-4">
              {SPECIALIZATION_ORDER.map(specialization => {
                const specializationItems =
                  equipmentBySpecialization.get(specialization) ?? []

                return (
                  <div
                    key={specialization}
                    className="overflow-hidden rounded-lg border border-slate-200"
                  >
                    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="font-semibold text-slate-900">
                        {specializationLabel(specialization)}
                      </div>
                    </div>

                    <div className="grid gap-4 p-4 lg:grid-cols-2 xl:grid-cols-3">
                      {EQUIPMENT_CATEGORY_ORDER.map(category => {
                        const items = specializationItems.filter(
                          item => item.equipment_category === category,
                        )

                        return (
                          <div key={category} className="rounded-lg border border-slate-200">
                            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {categoryLabel(category)}
                            </div>
                            <div className="grid grid-cols-3 divide-x divide-slate-200">
                              {items.map(item => {
                                const imageUrl = getEquipmentImageUrl(item)
                                const effects = effectEntries(item)

                                return (
                                  <article
                                    key={`${item.specialization}:${item.equipment_category}:${item.catalog_item_id}`}
                                    className="min-w-0 bg-white p-2"
                                  >
                                    <div className="flex h-24 items-center justify-center overflow-hidden rounded bg-slate-50 p-1">
                                      {imageUrl ? (
                                        <img
                                          src={imageUrl}
                                          alt={item.display_name ?? t('common.standardModel')}
                                          className="h-full w-full object-contain"
                                        />
                                      ) : (
                                        <div className="text-sm font-bold text-slate-400">
                                          {getInitials(item.display_name)}
                                        </div>
                                      )}
                                    </div>
                                    <div className="mt-2 line-clamp-2 text-xs font-semibold leading-4 text-slate-900">
                                      {item.display_name ?? t('common.standardModel')}
                                    </div>
                                    <div className="mt-1 text-[11px] text-slate-500">
                                      {t('association.package.tierQuality', {
                                        tier: item.tier ?? '—',
                                        quality: item.quality_score ?? '—',
                                      })}
                                    </div>
                                    <div className="mt-1 text-[11px] font-medium text-emerald-700">
                                      {t('association.package.alwaysPerfect')}
                                    </div>
                                    {effects.length > 0 ? (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {effects.slice(0, 3).map(effect => (
                                          <span
                                            key={effect.key}
                                            className={[
                                              'rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                                              bonusBadgeClass(effect.value),
                                            ].join(' ')}
                                          >
                                            {effect.label} {formatBonus(effect.value)}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                  </article>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </details>

          <details className="rounded-lg bg-white shadow-sm">
            <summary className="cursor-pointer list-none p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {t('association.package.assets')}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {t('association.package.assetsUnlimitedHelp')}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {assetCount} {t('association.package.units')}
                </span>
              </div>
            </summary>

            <div className="grid gap-4 border-t border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-3">
              {(standardPackage.assets ?? []).map(asset => (
                <article key={asset.asset_key} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white p-2">
                      {asset.image_url ? (
                        <img
                          src={asset.image_url}
                          alt={asset.asset_name ?? humanize(asset.asset_key)}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="text-lg font-bold text-slate-400">
                          {getInitials(asset.asset_name ?? asset.asset_key)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">
                        {asset.asset_name ?? humanize(asset.asset_key)}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {t('association.package.assetLevel', {
                          quantity: asset.quantity,
                          level: asset.asset_level,
                        })}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                          {t('association.package.alwaysPerfect')}
                        </span>
                        {asset.unlimited ? (
                          <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-800">
                            {t('association.package.unlimited')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {asset.usage_note ? (
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      {asset.usage_note}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </details>

          <details className="rounded-lg bg-white shadow-sm">
            <summary className="cursor-pointer list-none p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {t('association.package.supplies')}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {t('association.package.suppliesUnlimitedHelp')}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {supplyTypes} {t('association.package.supplyTypes')}
                </span>
              </div>
            </summary>

            <div className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-5">
              {(standardPackage.supplies ?? []).map(supply => (
                <article key={supply.supply_key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex h-28 items-center justify-center overflow-hidden rounded bg-white p-2">
                    {supply.image_url ? (
                      <img
                        src={supply.image_url}
                        alt={supply.display_name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-lg font-bold text-slate-400">
                        {getInitials(supply.display_name)}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 text-sm font-semibold text-slate-900">
                    {supply.display_name}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {supply.quantity.toLocaleString()} {t('association.package.units')}
                  </div>
                  <div className="mt-2 rounded-full bg-sky-100 px-2 py-1 text-center text-xs font-semibold text-sky-800">
                    {t('association.package.unlimited')}
                  </div>
                </article>
              ))}
            </div>
          </details>
        </div>
      ) : null}
    </div>
  )
}
