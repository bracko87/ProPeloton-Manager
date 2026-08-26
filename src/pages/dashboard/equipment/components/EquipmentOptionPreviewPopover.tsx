import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getEquipmentMarket } from '../equipmentApi'

type EquipmentCategory =
  | 'frame'
  | 'wheelset'
  | 'tires'
  | 'groupset'
  | 'helmet'
  | 'shoes'

type EquipmentPreviewOption = {
  catalog_item_id: string
  display_name?: string | null
  label?: string | null
  brand_name?: string | null
  quality_label?: string | null
  terrain_role?: string | null
  image_url?: string | null
  effects?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

type EquipmentOptionPreviewPopoverProps = {
  clubId: string
  category: EquipmentCategory
  option: EquipmentPreviewOption | null
  children: React.ReactNode
  disabled?: boolean
}

type PreviewDetails = EquipmentPreviewOption & {
  base_price_cash?: number | string | null
}

type EquipmentEffectTranslationKey =
  | 'effects.flatBonus'
  | 'effects.hillyBonus'
  | 'effects.mountainBonus'
  | 'effects.cobbleBonus'
  | 'effects.timeTrialBonus'
  | 'effects.sprintBonus'
  | 'effects.fatigueReduction'

type EquipmentQualityTranslationKey =
  | 'quality.super'
  | 'quality.good'
  | 'quality.basic'

type EquipmentTerrainTranslationKey =
  | 'terrain.allRound'
  | 'terrain.enduranceCobble'
  | 'terrain.climbing'
  | 'terrain.aeroFlat'
  | 'terrain.timeTrial'
  | 'terrain.general'

const previewCache = new Map<string, PreviewDetails | null>()

const effectTranslationKeys: Partial<
  Record<string, EquipmentEffectTranslationKey>
> = {
  flat_bonus_pct: 'effects.flatBonus',
  hilly_bonus_pct: 'effects.hillyBonus',
  mountain_bonus_pct: 'effects.mountainBonus',
  cobble_bonus_pct: 'effects.cobbleBonus',
  time_trial_bonus_pct: 'effects.timeTrialBonus',
  sprint_bonus_pct: 'effects.sprintBonus',
  fatigue_reduction_pct: 'effects.fatigueReduction',
}

const effectOrder = [
  'flat_bonus_pct',
  'hilly_bonus_pct',
  'mountain_bonus_pct',
  'cobble_bonus_pct',
  'time_trial_bonus_pct',
  'sprint_bonus_pct',
  'fatigue_reduction_pct',
]

const qualityTranslationKeys: Record<string, EquipmentQualityTranslationKey> = {
  super: 'quality.super',
  good: 'quality.good',
  basic: 'quality.basic',
}

const terrainTranslationKeys: Record<string, EquipmentTerrainTranslationKey> = {
  all_round: 'terrain.allRound',
  'all-round': 'terrain.allRound',
  'all round': 'terrain.allRound',
  'endurance / cobble': 'terrain.enduranceCobble',
  'endurance/cobble': 'terrain.enduranceCobble',
  endurance_cobble: 'terrain.enduranceCobble',
  climbing: 'terrain.climbing',
  'aero / flat': 'terrain.aeroFlat',
  'aero/flat': 'terrain.aeroFlat',
  aero_flat: 'terrain.aeroFlat',
  'time trial': 'terrain.timeTrial',
  'time-trial': 'terrain.timeTrial',
  time_trial: 'terrain.timeTrial',
  general: 'terrain.general',
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = metadata?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function getImageUrl(option: EquipmentPreviewOption): string | null {
  const metadata = option.metadata ?? {}
  const candidates = [
    option.image_url,
    metadata.image_url,
    metadata.imageUrl,
    metadata.image_path,
    metadata.catalog_image_url,
    metadata.preview_image_url,
  ]

  const value = candidates.find(
    candidate => typeof candidate === 'string' && candidate.trim().length > 0,
  )

  return typeof value === 'string' ? value.trim() : null
}

function getEffects(option: EquipmentPreviewOption): Array<{
  key: string
  translationKey: EquipmentEffectTranslationKey | null
  fallbackLabel: string
  value: number
}> {
  const metadataEffects =
    option.metadata &&
    typeof option.metadata.effects === 'object' &&
    option.metadata.effects !== null
      ? (option.metadata.effects as Record<string, unknown>)
      : null
  const effects = option.effects ?? metadataEffects ?? {}
  const keys = [
    ...effectOrder,
    ...Object.keys(effects).filter(key => !effectOrder.includes(key)),
  ]

  return [...new Set(keys)]
    .map(key => ({
      key,
      translationKey: effectTranslationKeys[key] ?? null,
      fallbackLabel: key,
      value: toNumber(effects[key]),
    }))
    .filter(effect => effect.value !== 0)
}

function formatEffect(value: number): string {
  const rounded = Math.round(value * 100) / 100
  const text = Number.isInteger(rounded)
    ? rounded.toFixed(0)
    : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')

  return `${rounded > 0 ? '+' : ''}${text}%`
}

function getQualityTranslationKey(
  value: string | null | undefined,
): EquipmentQualityTranslationKey | null {
  if (!value) return null
  return qualityTranslationKeys[value.trim().toLowerCase()] ?? null
}

function getTerrainTranslationKey(
  value: string | null | undefined,
): EquipmentTerrainTranslationKey | null {
  if (!value) return null
  return terrainTranslationKeys[value.trim().toLowerCase()] ?? null
}

function mergeDetails(
  option: EquipmentPreviewOption,
  marketItem: Record<string, unknown> | null,
): PreviewDetails {
  if (!marketItem) return option

  const marketMetadata =
    marketItem.metadata && typeof marketItem.metadata === 'object'
      ? (marketItem.metadata as Record<string, unknown>)
      : null

  return {
    ...option,
    display_name:
      (marketItem.display_name as string | null | undefined) ?? option.display_name,
    brand_name:
      (marketItem.brand_name as string | null | undefined) ?? option.brand_name,
    quality_label:
      (marketItem.quality_label as string | null | undefined) ??
      getMetadataString(marketMetadata, 'quality_label') ??
      option.quality_label,
    terrain_role:
      (marketItem.terrain_role as string | null | undefined) ??
      getMetadataString(marketMetadata, 'terrain_role', 'market_role') ??
      option.terrain_role,
    image_url:
      (marketItem.image_url as string | null | undefined) ??
      getMetadataString(
        marketMetadata,
        'image_url',
        'imageUrl',
        'image_path',
        'catalog_image_url',
        'preview_image_url',
      ) ??
      option.image_url,
    effects:
      marketItem.effects && typeof marketItem.effects === 'object'
        ? (marketItem.effects as Record<string, unknown>)
        : option.effects,
    metadata: {
      ...(option.metadata ?? {}),
      ...(marketMetadata ?? {}),
    },
    base_price_cash:
      (marketItem.base_price_cash as number | string | null | undefined) ?? null,
  }
}

export default function EquipmentOptionPreviewPopover({
  clubId,
  category,
  option,
  children,
  disabled = false,
}: EquipmentOptionPreviewPopoverProps): JSX.Element {
  const { t } = useTranslation('equipment')
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [details, setDetails] = useState<PreviewDetails | null>(option)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const openTimerRef = useRef<number | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const pinTimerRef = useRef<number | null>(null)

  const currentDetails = details ?? option
  const imageUrl = useMemo(
    () => (currentDetails ? getImageUrl(currentDetails) : null),
    [currentDetails],
  )
  const effects = useMemo(
    () => (currentDetails ? getEffects(currentDetails) : []),
    [currentDetails],
  )

  function clearTimers(): void {
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current)
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    if (pinTimerRef.current !== null) window.clearTimeout(pinTimerRef.current)
    openTimerRef.current = null
    closeTimerRef.current = null
    pinTimerRef.current = null
  }

  async function loadDetails(): Promise<void> {
    if (!option) return
    const cacheKey = `${clubId}:${option.catalog_item_id}`

    if (previewCache.has(cacheKey)) {
      setDetails(
        mergeDetails(
          option,
          previewCache.get(cacheKey) as Record<string, unknown> | null,
        ),
      )
      return
    }

    setLoadingDetails(true)
    try {
      const response = await getEquipmentMarket({
        clubId,
        kind: 'durable',
        category,
        limit: 200,
        offset: 0,
      })
      const items = Array.isArray(response?.items) ? response.items : []
      const match =
        items.find(item => {
          const candidate = item as {
            id?: unknown
            catalog_item_id?: unknown
          }

          return (
            String(candidate.id ?? '') === option.catalog_item_id ||
            String(candidate.catalog_item_id ?? '') === option.catalog_item_id
          )
        }) ?? null

      previewCache.set(cacheKey, match as PreviewDetails | null)
      setDetails(mergeDetails(option, match as Record<string, unknown> | null))
    } catch {
      previewCache.set(cacheKey, null)
      setDetails(option)
    } finally {
      setLoadingDetails(false)
    }
  }

  function beginOpen(): void {
    if (disabled || !option || open) return
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)

    openTimerRef.current = window.setTimeout(() => {
      setOpen(true)
      void loadDetails()
      pinTimerRef.current = window.setTimeout(() => setPinned(true), 3000)
    }, 1000)
  }

  function beginClose(): void {
    if (pinned) return
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current)
    if (pinTimerRef.current !== null) window.clearTimeout(pinTimerRef.current)

    closeTimerRef.current = window.setTimeout(() => setOpen(false), 180)
  }

  function close(): void {
    clearTimers()
    setPinned(false)
    setOpen(false)
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      clearTimers()
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    setDetails(option)
    close()
  }, [option?.catalog_item_id])

  const name =
    currentDetails?.display_name?.trim() ||
    currentDetails?.label?.trim() ||
    t('preview.equipment')

  const qualityLabel = currentDetails?.quality_label?.trim() || null
  const qualityTranslationKey = getQualityTranslationKey(qualityLabel)
  const terrainLabel = currentDetails?.terrain_role?.trim() || null
  const terrainTranslationKey = getTerrainTranslationKey(terrainLabel)

  const subtitle = [
    currentDetails?.brand_name,
    qualityTranslationKey ? t(qualityTranslationKey) : qualityLabel,
    terrainTranslationKey ? t(terrainTranslationKey) : terrainLabel,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={beginOpen}
      onMouseLeave={beginClose}
    >
      {children}

      {open && option ? (
        <div
          role="dialog"
          aria-label={t('preview.aria', { name })}
          className="absolute right-0 top-full z-50 mt-2 w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
          onMouseEnter={() => {
            if (closeTimerRef.current !== null) {
              window.clearTimeout(closeTimerRef.current)
            }
          }}
          onMouseLeave={beginClose}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">
                {name}
              </div>
              {subtitle ? (
                <div className="mt-0.5 truncate text-[11px] text-slate-500">
                  {subtitle}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={t('preview.close')}
              className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              ×
            </button>
          </div>

          <div className="flex h-44 items-center justify-center bg-white p-2">
            {loadingDetails ? (
              <div className="text-xs text-slate-400">{t('preview.loading')}</div>
            ) : imageUrl ? (
              <img src={imageUrl} alt={name} className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-xs text-slate-400">
                {t('preview.noImage')}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 px-3 py-2">
            {effects.length > 0 ? (
              <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap pb-0.5">
                {effects.map(effect => (
                  <span
                    key={effect.key}
                    className={[
                      'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                      effect.value > 0
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-red-200 bg-red-50 text-red-700',
                    ].join(' ')}
                  >
                    {effect.translationKey
                      ? t(effect.translationKey)
                      : effect.fallbackLabel}{' '}
                    {formatEffect(effect.value)}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-slate-400">
                {t('preview.noBonuses')}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
