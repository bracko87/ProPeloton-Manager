import React, { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import NationalAssociationHeader from '../../components/nations/NationalAssociationHeader'

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
  equipment_category: string
  specialization: string
  choice_rank?: number
  catalog_item_id?: string | null
  display_name?: string | null
  tier?: number | null
  quality_score?: number | null
  image_url?: string | null
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
  slot_purpose: string
  frame_catalog_item_id: string | null
  wheelset_catalog_item_id: string | null
  tires_catalog_item_id: string | null
  groupset_catalog_item_id: string | null
  helmet_catalog_item_id: string | null
  shoes_catalog_item_id: string | null
}

type EquipmentPresetData = {
  allowed: boolean
  reason?: string
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

const EQUIPMENT_CATEGORY_ORDER = [
  'frame',
  'groupset',
  'helmet',
  'shoes',
  'tires',
  'wheelset',
] as const

const SPECIALIZATION_ORDER = ['flat', 'mountain', 'time_trial'] as const

type EquipmentCategory = (typeof EQUIPMENT_CATEGORY_ORDER)[number]

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w80/${normalized}.png`
    : null
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
    setup_name: preset.setup_name ?? '',
    frame_catalog_item_id: preset.frame_catalog_item_id ?? '',
    wheelset_catalog_item_id: preset.wheelset_catalog_item_id ?? '',
    tires_catalog_item_id: preset.tires_catalog_item_id ?? '',
    groupset_catalog_item_id: preset.groupset_catalog_item_id ?? '',
    helmet_catalog_item_id: preset.helmet_catalog_item_id ?? '',
    shoes_catalog_item_id: preset.shoes_catalog_item_id ?? '',
  }
}

export default function NationalTeamPackagePage(): JSX.Element {
  const { t } = useTranslation('nations')
  const [association, setAssociation] = useState<AssociationData | null>(null)
  const [standardPackage, setStandardPackage] = useState<StandardPackage | null>(null)
  const [presetData, setPresetData] = useState<EquipmentPresetData | null>(null)
  const [presetDrafts, setPresetDrafts] = useState<Record<number, EquipmentPresetDraft>>({})
  const [loading, setLoading] = useState(true)
  const [isCoach, setIsCoach] = useState(false)
  const [busySlot, setBusySlot] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const [associationResponse, packageResponse, presetsResponse, coachResponse] = await Promise.all([
        supabase.rpc('get_my_national_association_v1'),
        supabase.rpc('get_national_team_standard_package_v1'),
        supabase.rpc('get_my_national_team_equipment_presets_v1'),
        supabase.rpc('get_national_coach_dashboard_v1'),
      ])

      if (associationResponse.error) throw associationResponse.error
      if (packageResponse.error) throw packageResponse.error

      const nextAssociation = (associationResponse.data ?? null) as AssociationData | null
      const nextPackage = (packageResponse.data ?? null) as StandardPackage | null
      const nextPresets = presetsResponse.error
        ? ({ allowed: false, reason: 'unavailable', presets: [] } as EquipmentPresetData)
        : ((presetsResponse.data ?? null) as EquipmentPresetData | null)

      setAssociation(nextAssociation)
      setIsCoach(!coachResponse.error && Boolean((coachResponse.data as any)?.allowed))
      setStandardPackage(nextPackage)
      setPresetData(nextPresets)

      const drafts: Record<number, EquipmentPresetDraft> = {}
      for (const preset of nextPresets?.presets ?? []) {
        drafts[preset.setup_slot] = toDraft(preset)
      }
      setPresetDrafts(drafts)
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

  const equipmentBySpecialization = useMemo(() => {
    const result = new Map<string, StandardEquipment[]>()

    for (const item of standardPackage?.equipment ?? []) {
      const current = result.get(item.specialization) ?? []
      current.push(item)
      result.set(item.specialization, current)
    }

    for (const items of result.values()) {
      items.sort((a, b) => {
        const aCategory = EQUIPMENT_CATEGORY_ORDER.indexOf(
          a.equipment_category as EquipmentCategory,
        )
        const bCategory = EQUIPMENT_CATEGORY_ORDER.indexOf(
          b.equipment_category as EquipmentCategory,
        )
        if (aCategory !== bCategory) return aCategory - bCategory
        return Number(a.choice_rank ?? 99) - Number(b.choice_rank ?? 99)
      })
    }

    return result
  }, [standardPackage?.equipment])

  const equipmentByCategory = useMemo(() => {
    const result = new Map<string, StandardEquipment[]>()

    for (const item of standardPackage?.equipment ?? []) {
      const current = result.get(item.equipment_category) ?? []
      current.push(item)
      result.set(item.equipment_category, current)
    }

    for (const items of result.values()) {
      items.sort((a, b) => {
        const specializationDiff =
          SPECIALIZATION_ORDER.indexOf(a.specialization as any) -
          SPECIALIZATION_ORDER.indexOf(b.specialization as any)
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

  const countryFlag = flagUrl(association?.country_code)

  const specializationLabel = (specialization: string): string => {
    if (specialization === 'flat') return t('raceTypes.flat')
    if (specialization === 'mountain') return t('raceTypes.mountain')
    if (specialization === 'time_trial') return humanize(specialization)
    return humanize(specialization)
  }

  const purposeLabel = (slot: number): string => {
    if (slot === 1) return t('raceTypes.flatRoadRace')
    if (slot === 2) return t('raceTypes.hillyMountainRoadRace')
    return t('raceTypes.teamTimeTrial')
  }

  const updateDraft = (
    slot: number,
    key: keyof EquipmentPresetDraft,
    value: string,
  ): void => {
    setPresetDrafts(current => ({
      ...current,
      [slot]: {
        ...(current[slot] ?? {
          setup_name: '',
          frame_catalog_item_id: '',
          wheelset_catalog_item_id: '',
          tires_catalog_item_id: '',
          groupset_catalog_item_id: '',
          helmet_catalog_item_id: '',
          shoes_catalog_item_id: '',
        }),
        [key]: value,
      },
    }))
  }

  const savePreset = async (slot: number): Promise<void> => {
    const draft = presetDrafts[slot]
    if (!draft) return

    const requiredIds = [
      draft.frame_catalog_item_id,
      draft.wheelset_catalog_item_id,
      draft.tires_catalog_item_id,
      draft.groupset_catalog_item_id,
      draft.helmet_catalog_item_id,
      draft.shoes_catalog_item_id,
    ]

    if (requiredIds.some(value => !value)) {
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

      {presetData?.allowed ? (
        <section className="rounded bg-white shadow">
          <div className="border-b border-slate-200 p-4">
            <h3 className="text-base font-semibold text-slate-900">
              {t('association.package.coachSetsTitle')}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {t('association.package.coachSetsDescription')}
            </p>
          </div>

          <div className="grid gap-4 p-4 xl:grid-cols-3">
            {[1, 2, 3].map(slot => {
              const draft = presetDrafts[slot]
              if (!draft) return null

              return (
                <div key={slot} className="rounded-lg border border-slate-200 bg-slate-50">
                  <div className="border-b border-slate-200 bg-white px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('association.package.setNumber', { slot })}
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {purposeLabel(slot)}
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('association.package.setName')}
                      </span>
                      <input
                        value={draft.setup_name}
                        maxLength={60}
                        onChange={event => updateDraft(slot, 'setup_name', event.target.value)}
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-yellow-500"
                      />
                    </label>

                    {EQUIPMENT_CATEGORY_ORDER.map(category => {
                      const field = `${category}_catalog_item_id` as keyof EquipmentPresetDraft
                      const selectedId = String(draft[field] ?? '')
                      const selectedItem = equipmentById.get(selectedId)
                      const imageUrl = getEquipmentImageUrl(selectedItem)

                      return (
                        <div key={category} className="rounded border border-slate-200 bg-white p-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 p-1">
                              {imageUrl ? (
                                <img
                                  src={imageUrl}
                                  alt={selectedItem?.display_name ?? humanize(category)}
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                <span className="text-xs font-bold text-slate-400">
                                  {getInitials(category)}
                                </span>
                              )}
                            </div>

                            <label className="min-w-0 flex-1">
                              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {humanize(category)}
                              </span>
                              <select
                                value={selectedId}
                                onChange={event => updateDraft(slot, field, event.target.value)}
                                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-yellow-500"
                              >
                                <option value="">{t('association.package.chooseItem')}</option>
                                {(equipmentByCategory.get(category) ?? []).map(item => (
                                  <option
                                    key={`${category}:${item.specialization}:${item.catalog_item_id}`}
                                    value={item.catalog_item_id ?? ''}
                                  >
                                    {specializationLabel(item.specialization)} · {item.display_name} · Q{item.quality_score ?? '—'}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>
                      )
                    })}

                    <button
                      type="button"
                      disabled={busySlot === slot}
                      onClick={() => void savePreset(slot)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-50"
                    >
                      {busySlot === slot ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {t('association.package.saveSet')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {standardPackage ? (
        <>
          <section className="rounded bg-white shadow">
            <div className="border-b border-slate-200 p-4">
              <h3 className="text-base font-semibold text-slate-900">
                {t('association.package.selectionPoolTitle')}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {t('association.package.selectionPoolDescription')}
              </p>
            </div>

            <div className="space-y-6 p-4">
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
                              {humanize(category)}
                            </div>
                            <div className="grid grid-cols-3 divide-x divide-slate-200">
                              {items.map(item => {
                                const imageUrl = getEquipmentImageUrl(item)

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
          </section>

          <section className="rounded bg-white shadow">
            <div className="border-b border-slate-200 p-4">
              <h3 className="text-base font-semibold text-slate-900">
                {t('association.package.assets')}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {t('association.package.assetsUnlimitedHelp')}
              </p>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {(standardPackage.assets ?? []).map(asset => (
                <article
                  key={asset.asset_key}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                >
                  <div className="flex h-44 items-center justify-center bg-slate-50 p-3">
                    {asset.image_url ? (
                      <img
                        src={asset.image_url}
                        alt={asset.asset_name ?? humanize(asset.asset_key)}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-white text-xl font-bold text-slate-400">
                        {getInitials(asset.asset_name ?? asset.asset_key)}
                      </div>
                    )}
                  </div>
                  <div className="border-t border-slate-200 p-3">
                    <div className="font-semibold text-slate-900">
                      {asset.asset_name ?? humanize(asset.asset_key)}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-emerald-700">
                      {t('association.package.unlimited')} · {t('association.package.alwaysPerfect')}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded bg-white shadow">
            <div className="border-b border-slate-200 p-4">
              <h3 className="text-base font-semibold text-slate-900">
                {t('association.package.supplies')}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {t('association.package.suppliesUnlimitedHelp')}
              </p>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
              {(standardPackage.supplies ?? []).map(supply => (
                <article
                  key={supply.supply_key}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                >
                  <div className="flex h-36 items-center justify-center bg-slate-50 p-3">
                    {supply.image_url ? (
                      <img
                        src={supply.image_url}
                        alt={supply.display_name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="text-xl font-bold text-slate-400">
                        {getInitials(supply.display_name)}
                      </div>
                    )}
                  </div>
                  <div className="border-t border-slate-200 p-3">
                    <div className="text-sm font-semibold text-slate-900">
                      {supply.display_name}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-emerald-700">
                      {t('association.package.unlimited')}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
