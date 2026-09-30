import React, { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import NationalAssociationTabs from '../../components/nations/NationalAssociationTabs'

type AssociationData = {
  country_code?: string
  association_name?: string
}

type StandardEquipment = {
  equipment_category: string
  specialization: string
  model_count: number
  catalog_item_id?: string | null
  item_key?: string | null
  display_name?: string | null
  tier?: number | null
  quality_score?: number | null
  durability_score?: number | null
  image_url?: string | null
  metadata?: Record<string, unknown> | null
}

type StandardAsset = {
  asset_key: string
  asset_level: number
  quantity: number
  usage_note?: string | null
  asset_name?: string | null
  image_url?: string | null
}

type StandardSupply = {
  supply_key: string
  display_name: string
  quantity: number
  replenishment_scope: string
}

type StandardPackage = {
  cost_model?: string
  has_treasury?: boolean
  staff?: string[]
  assets?: StandardAsset[]
  equipment?: StandardEquipment[]
  supplies?: StandardSupply[]
}

const EQUIPMENT_CATEGORY_ORDER = [
  'frame',
  'groupset',
  'helmet',
  'shoes',
  'tires',
  'wheelset',
]

const SPECIALIZATION_ORDER = ['flat', 'mountain', 'time_trial']

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

function getEquipmentImageUrl(item: StandardEquipment): string | null {
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

export default function NationalTeamPackagePage(): JSX.Element {
  const { t } = useTranslation('nations')
  const [association, setAssociation] = useState<AssociationData | null>(null)
  const [standardPackage, setStandardPackage] = useState<StandardPackage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const [associationResponse, packageResponse] = await Promise.all([
        supabase.rpc('get_my_national_association_v1'),
        supabase.rpc('get_national_team_standard_package_v1'),
      ])

      if (associationResponse.error) throw associationResponse.error
      if (packageResponse.error) throw packageResponse.error

      setAssociation((associationResponse.data ?? null) as AssociationData | null)
      setStandardPackage((packageResponse.data ?? null) as StandardPackage | null)
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
        const aIndex = EQUIPMENT_CATEGORY_ORDER.indexOf(a.equipment_category)
        const bIndex = EQUIPMENT_CATEGORY_ORDER.indexOf(b.equipment_category)
        return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex)
      })
    }

    return result
  }, [standardPackage?.equipment])

  const countryFlag = flagUrl(association?.country_code)

  const specializationLabel = (specialization: string): string => {
    if (specialization === 'flat') return t('raceTypes.flat')
    if (specialization === 'mountain') return t('raceTypes.mountain')
    if (specialization === 'time_trial') return humanize(specialization)
    return humanize(specialization)
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
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          {countryFlag ? (
            <img
              src={countryFlag}
              alt={association?.country_code ?? t('common.country')}
              className="mt-0.5 h-9 w-14 rounded border border-slate-200 object-cover"
            />
          ) : (
            <div className="mt-0.5 flex h-9 w-14 items-center justify-center rounded border border-slate-200 bg-white text-xs font-semibold text-slate-500">
              {association?.country_code ?? '—'}
            </div>
          )}

          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              {association?.association_name ??
                (association?.country_code
                  ? t('association.countryTitle', { country: association.country_code })
                  : t('association.title'))}
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-700">
              {t('association.package.title')}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {t('association.package.description')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start">
          <NationalAssociationTabs />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : null}
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {standardPackage ? (
        <>
          <section className="rounded bg-white shadow">
            <div className="border-b border-slate-200 p-4">
              <h3 className="text-base font-semibold text-slate-900">
                {t('association.package.assets')}
              </h3>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {(standardPackage.assets ?? []).map(asset => (
                <article
                  key={asset.asset_key}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                >
                  <div className="flex h-40 items-center justify-center bg-white p-3">
                    {asset.image_url ? (
                      <img
                        src={asset.image_url}
                        alt={asset.asset_name ?? humanize(asset.asset_key)}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-slate-100 text-xl font-bold text-slate-400">
                        {getInitials(asset.asset_name ?? asset.asset_key)}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 p-4">
                    <div className="font-semibold text-slate-900">
                      {asset.asset_name ?? humanize(asset.asset_key)}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-yellow-700">
                      {t('association.package.assetLevel', {
                        quantity: asset.quantity,
                        level: asset.asset_level,
                      })}
                    </div>
                    {asset.usage_note ? (
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {asset.usage_note}
                      </p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded bg-white shadow">
            <div className="border-b border-slate-200 p-4">
              <h3 className="text-base font-semibold text-slate-900">
                {t('association.package.equipment')}
              </h3>
            </div>

            <div className="grid gap-4 p-4 xl:grid-cols-3">
              {SPECIALIZATION_ORDER.map(specialization => {
                const items = equipmentBySpecialization.get(specialization) ?? []

                return (
                  <div
                    key={specialization}
                    className="overflow-hidden rounded-lg border border-slate-200"
                  >
                    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-sm font-semibold text-slate-900">
                        {specializationLabel(specialization)}
                      </div>
                    </div>

                    <div className="divide-y divide-slate-200">
                      {items.map(item => {
                        const imageUrl = getEquipmentImageUrl(item)

                        return (
                          <article
                            key={`${item.equipment_category}:${item.specialization}`}
                            className="flex min-h-28 gap-3 bg-white p-3"
                          >
                            <div className="flex h-24 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-2">
                              {imageUrl ? (
                                <img
                                  src={imageUrl}
                                  alt={item.display_name ?? t('common.standardModel')}
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-slate-100 text-sm font-bold text-slate-400">
                                  {getInitials(item.display_name)}
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 py-1">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {humanize(item.equipment_category)}
                              </div>
                              <div className="mt-1 text-sm font-semibold leading-5 text-slate-900">
                                {item.display_name ?? t('common.standardModel')}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {t('association.package.tierQuality', {
                                  tier: item.tier ?? '—',
                                  quality: item.quality_score ?? '—',
                                })}
                              </div>
                            </div>
                          </article>
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
                {t('association.package.supplies')}
              </h3>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
              {(standardPackage.supplies ?? []).map(supply => (
                <div
                  key={supply.supply_key}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="text-sm font-medium text-slate-700">
                    {supply.display_name}
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">
                    {supply.quantity}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
