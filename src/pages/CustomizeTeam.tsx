/**
 * CustomizeTeam.tsx
 * Team branding and settings page with validated branding persistence through
 * update_club_branding_v1 and jersey persistence to public.team_kits.
 *
 * NOTE:
 * - This file assumes you have a configured Supabase client export.
 * - Adjust the supabase import path if needed.
 * - Club branding persists through update_club_branding_v1.
 * - Jersey config persists to public.team_kits using the `config` jsonb column.
 *
 * UPDATE (logo flow):
 * - Accept JPG/PNG/WEBP uploads.
 * - Convert uploaded logos to PNG in-browser.
 * - Store them as PNG in `club-logos`.
 *
 * UPDATE (remove logo behavior + base logo):
 * - Remove Logo no longer sets logo_path to null.
 * - Instead regenerates and restores a deterministic base logo:
 *   generated/base-<clubId>.png
 * - Base logo is a shield-style SVG built from team colors, rasterized to PNG,
 *   and upserted to Supabase storage.
 * - Team color updates also refresh that base logo in the background so it stays in sync.
 *
 * UPDATE (broadcast payload):
 * - Club update broadcasts now include updated_at_ms so legitimate updates
 *   can propagate instantly and in order across listeners/tabs.
 *
 * UPDATE (main-club writer fix):
 * - ppm-active-club writes now always use the resolved MAIN club context.
 * - This prevents developing-club state from being written into shared header/layout sync.
 *
 * UPDATE (sponsor naming-rights lock):
 * - Reads club_branding_lock_status_v1 for UI lock state.
 * - Persists club branding through update_club_branding_v1 instead of direct clubs update.
 *
 * UPDATE (coin affordability UX):
 * - Shows current coin balance and current logo-change cost before the user acts.
 * - Disables logo upload / URL / remove / apply controls when the balance is insufficient.
 * - Shows exactly how many more coins are needed and links to Pro Packages.
 * - Backend pricing remains authoritative and unchanged.
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import appI18n from '@/i18n'
import { getMyClubContext } from '@/lib/clubContext'
import { supabase } from '@/lib/supabase' // <-- adjust if your path differs

type ClubRow = {
  id: string
  owner_user_id: string
  name: string
  country_code: string
  primary_color: string
  secondary_color: string
  logo_path: string | null
}

type PersistableClubPatch = Partial<
  Pick<ClubRow, 'name' | 'primary_color' | 'secondary_color' | 'logo_path'>
>

type BrandingLockStatus = {
  can_edit_name: boolean
  can_edit_colors: boolean
  can_edit_logo: boolean
  locked_by_sponsor: boolean
  locked_until_game_date: string | null
  season_display_name: string | null
  original_club_name: string | null
  full_display_name: string | null
  source_sponsor_id: string | null
  lock_reason: string | null
}

type BrandingCustomizationAccess = {
  season_number: number
  coin_balance: number
  name_change_cost: number
  logo_change_cost: number
  logo_free_change_used: boolean
  jersey_change_cost: number
  jersey_free_change_used: boolean
}

type KitDesignerProps = {
  teamId: string
  primaryColor: string
  secondaryColor: string
  customizationAccess: BrandingCustomizationAccess | null
  onCustomizationChanged: () => Promise<void>
}

type TeamKitMode = 'generic_pool' | 'generic' | 'image_url' | 'uploaded_image'

type TeamKitConfig = {
  version: 1
  template: 'generic_pool' | 'striped-tshirt'
  mode: TeamKitMode
  image_url: string | null
  image_data_url: string | null
  /**
   * Preserves the jersey selected during team creation, so "restore original"
   * can bring the user back to the first chosen generic kit even after custom uploads.
   */
  original_generic_image_url?: string | null
  source?: string | null
}

type TeamKitRow = {
  id: string
  team_id: string
  name: string
  config: unknown
  updated_at: string
}

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2 MB
const LOGO_BUCKET = 'club-logos'

const MAX_JERSEY_FILE_SIZE = 2 * 1024 * 1024 // 2 MB
const MAX_JERSEY_DIMENSION = 512
const DEFAULT_TEAM_KIT_NAME = 'home'

function isValidHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value)
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Logo validation: allow JPG/PNG/WEBP, max 2 MB.
 */
function validateLogoFile(file: File): string | null {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

  if (!validTypes.includes(file.type)) {
    return appI18n.t('logo.invalidType', { ns: 'customizeTeam' })
  }

  if (file.size > MAX_FILE_SIZE) {
    return appI18n.t('logo.tooLarge', { ns: 'customizeTeam' })
  }

  return null
}

/**
 * Convert an uploaded logo file into a PNG Blob.
 */
function convertFileToPngBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const image = new Image()

      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight

        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error(appI18n.t('logo.processFailed', { ns: 'customizeTeam' })))
          return
        }

        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0)

        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error(appI18n.t('logo.convertFailed', { ns: 'customizeTeam' })))
              return
            }
            resolve(blob)
          },
          'image/png',
          1,
        )
      }

      image.onerror = () => reject(new Error(appI18n.t('logo.loadFailed', { ns: 'customizeTeam' })))
      image.src = String(reader.result)
    }

    reader.onerror = () => reject(new Error(appI18n.t('logo.readFailed', { ns: 'customizeTeam' })))
    reader.readAsDataURL(file)
  })
}

function validateJerseyUploadFile(file: File): Promise<string | null> {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

  if (!validTypes.includes(file.type)) {
    return Promise.resolve(appI18n.t('jersey.invalidType', { ns: 'customizeTeam' }))
  }

  if (file.size > MAX_JERSEY_FILE_SIZE) {
    return Promise.resolve(appI18n.t('jersey.tooLarge', { ns: 'customizeTeam' }))
  }

  return new Promise(resolve => {
    const objectUrl = window.URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      const tooLarge =
        image.naturalWidth > MAX_JERSEY_DIMENSION ||
        image.naturalHeight > MAX_JERSEY_DIMENSION

      window.URL.revokeObjectURL(objectUrl)

      if (tooLarge) {
        resolve(appI18n.t('jersey.dimensions', { ns: 'customizeTeam' }))
        return
      }

      resolve(null)
    }

    image.onerror = () => {
      window.URL.revokeObjectURL(objectUrl)
      resolve(appI18n.t('jersey.readFailed', { ns: 'customizeTeam' }))
    }

    image.src = objectUrl
  })
}

/**
 * For remote jersey URLs, we only verify that the image can load.
 */
function validateRemoteJerseyImage(url: string): Promise<string | null> {
  return new Promise(resolve => {
    const image = new Image()

    image.onload = () => {
      resolve(null)
    }

    image.onerror = () => {
      resolve(appI18n.t('jersey.remoteFailed', { ns: 'customizeTeam' }))
    }

    image.src = url
  })
}

function sanitizeTeamName(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** ---------------- Base Logo helpers (NEW) ---------------- */

function buildBaseBadgeSvg(primary: string, secondary: string): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <polygon points="128,10 225,46 210,148 128,246 46,148 31,46" fill="${secondary}" />
      <polygon points="128,30 205,58 194,140 128,220 62,140 51,58" fill="${primary}" />
      <polygon points="62,118 194,118 194,140 128,220 62,140" fill="${secondary}" />
      <rect x="30" y="116" width="196" height="24" fill="${secondary}" />
      <rect x="58" y="58" width="94" height="28" transform="rotate(-12 58 58)" fill="#ffffff" opacity="0.15" />
    </svg>
  `.trim()
}

function rasterizeSvgToPngBlob(svg: string, size = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const objectUrl = URL.createObjectURL(svgBlob)
    const image = new Image()

    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size

      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(objectUrl)
        reject(new Error(appI18n.t('logo.baseRenderFailed', { ns: 'customizeTeam' })))
        return
      }

      context.clearRect(0, 0, size, size)
      context.drawImage(image, 0, 0, size, size)

      canvas.toBlob(
        blob => {
          URL.revokeObjectURL(objectUrl)

          if (!blob) {
            reject(new Error(appI18n.t('logo.baseExportFailed', { ns: 'customizeTeam' })))
            return
          }

          resolve(blob)
        },
        'image/png',
        1,
      )
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(appI18n.t('logo.baseLoadFailed', { ns: 'customizeTeam' })))
    }

    image.src = objectUrl
  })
}

async function upsertBaseTeamLogo(
  clubId: string,
  primaryColor: string,
  secondaryColor: string,
): Promise<string> {
  const baseLogoPath = `generated/base-${clubId}.png`
  const baseBadgeSvg = buildBaseBadgeSvg(primaryColor, secondaryColor)
  const baseBadgePng = await rasterizeSvgToPngBlob(baseBadgeSvg)

  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(baseLogoPath, baseBadgePng, {
    upsert: true,
    contentType: 'image/png',
  })

  if (error) {
    throw new Error(error.message || appI18n.t('logo.baseRefreshFailed', { ns: 'customizeTeam' }))
  }

  return baseLogoPath
}

/** ---------------- Jersey / Kits ---------------- */

function createGenericKitConfig(originalGenericImageUrl: string | null = null): TeamKitConfig {
  return {
    version: 1,
    template: originalGenericImageUrl ? 'generic_pool' : 'striped-tshirt',
    mode: originalGenericImageUrl ? 'generic_pool' : 'generic',
    image_url: originalGenericImageUrl,
    image_data_url: null,
    original_generic_image_url: originalGenericImageUrl,
    source: originalGenericImageUrl ? 'create_club' : 'fallback',
  }
}

function normalizeTeamKitConfig(value: unknown): TeamKitConfig {
  const fallback = createGenericKitConfig()

  if (!value || typeof value !== 'object') {
    return fallback
  }

  const raw = value as Partial<TeamKitConfig> & {
    source?: unknown
    original_generic_image_url?: unknown
  }

  const rawImageUrl = typeof raw.image_url === 'string' ? raw.image_url : null
  const rawImageDataUrl = typeof raw.image_data_url === 'string' ? raw.image_data_url : null
  const originalGenericImageUrl =
    typeof raw.original_generic_image_url === 'string'
      ? raw.original_generic_image_url
      : raw.mode === 'generic_pool' && rawImageUrl
        ? rawImageUrl
        : null

  const mode: TeamKitMode =
    raw.mode === 'generic_pool' ||
    raw.mode === 'image_url' ||
    raw.mode === 'uploaded_image' ||
    raw.mode === 'generic'
      ? raw.mode
      : rawImageUrl
        ? 'generic_pool'
        : 'generic'

  return {
    version: 1,
    template: mode === 'generic_pool' ? 'generic_pool' : 'striped-tshirt',
    mode,
    image_url: mode === 'generic_pool' || mode === 'image_url' ? rawImageUrl : null,
    image_data_url: mode === 'uploaded_image' ? rawImageDataUrl : null,
    original_generic_image_url: originalGenericImageUrl,
    source: typeof raw.source === 'string' ? raw.source : null,
  }
}

function getKitImageSrc(config: TeamKitConfig): string | null {
  if (config.mode === 'generic_pool' || config.mode === 'image_url') {
    return config.image_url
  }

  if (config.mode === 'uploaded_image') {
    return config.image_data_url
  }

  return null
}

function getOriginalGenericKitUrl(config: TeamKitConfig): string | null {
  if (config.original_generic_image_url) {
    return config.original_generic_image_url
  }

  if (config.mode === 'generic_pool' && config.image_url) {
    return config.image_url
  }

  return null
}

function areKitConfigsEqual(a: TeamKitConfig, b: TeamKitConfig): boolean {
  return (
    a.version === b.version &&
    a.template === b.template &&
    a.mode === b.mode &&
    a.image_url === b.image_url &&
    a.image_data_url === b.image_data_url &&
    (a.original_generic_image_url ?? null) === (b.original_generic_image_url ?? null)
  )
}

function GenericJerseySvg({
  primaryColor,
  secondaryColor,
  className = '',
}: {
  primaryColor: string
  secondaryColor: string
  className?: string
}): JSX.Element {
  const clipId = useId().replace(/:/g, '-')
  const stroke = '#111827'

  const shirtPath =
    'M56 24h48l14 10 18 22-9 15-18-10v86H51V61L33 71 24 56l18-22 14-10z'

  return (
    <svg viewBox="0 0 160 180" className={className} aria-hidden="true" role="img">
      <defs>
        <clipPath id={clipId}>
          <path d={shirtPath} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="160" height="180" fill={primaryColor} />

        {/* secondary vertical lines */}
        <rect x="64" y="20" width="6" height="140" fill={secondaryColor} opacity="0.95" />
        <rect x="77" y="20" width="6" height="140" fill={secondaryColor} opacity="0.95" />
        <rect x="90" y="20" width="6" height="140" fill={secondaryColor} opacity="0.95" />

        {/* subtle center seam */}
        <rect x="79" y="22" width="2" height="138" fill="#ffffff" opacity="0.55" />

        {/* collar */}
        <path
          d="M66 24h28l-5 10H71l-5-10z"
          fill="#ffffff"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </g>

      <path d={shirtPath} fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Used on the Customize Team page "Current logo" box.
 * Shows full logo in a square box (not circle-cropped).
 */
function HeaderLogo({
  logoSrc,
  teamName,
  primaryColor,
  secondaryColor,
}: {
  logoSrc: string | null
  teamName: string
  primaryColor: string
  secondaryColor: string
}): JSX.Element {
  const initials = useMemo(() => {
    const words = teamName.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return 'TC'
    return words
      .slice(0, 2)
      .map(word => word[0]?.toUpperCase())
      .join('')
  }, [teamName])

  if (logoSrc) {
    return (
      <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <img src={logoSrc} alt="Club logo" className="max-h-full max-w-full object-contain" />
      </div>
    )
  }

  return (
    <div
      className="flex h-40 w-40 items-center justify-center rounded-xl border border-slate-200 text-white text-2xl font-bold shadow-sm"
      style={{
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor} 58%, ${secondaryColor} 58%, ${secondaryColor} 100%)`,
      }}
    >
      {initials}
    </div>
  )
}

function KitDesigner({
  teamId,
  primaryColor,
  secondaryColor,
  customizationAccess,
  onCustomizationChanged,
}: KitDesignerProps): JSX.Element {
  const { t } = useTranslation('customizeTeam')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [appliedKitConfig, setAppliedKitConfig] = useState<TeamKitConfig>(createGenericKitConfig())
  const [draftKitConfig, setDraftKitConfig] = useState<TeamKitConfig>(createGenericKitConfig())
  const [originalGenericKitUrl, setOriginalGenericKitUrl] = useState<string | null>(null)
  const [jerseyUrlInput, setJerseyUrlInput] = useState('')
  const [kitNotice, setKitNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadTeamKit(): Promise<void> {
      try {
        setLoaded(false)
        setKitNotice(null)

        const { data, error } = await supabase
          .from('team_kits')
          .select('id, team_id, name, config, updated_at')
          .eq('team_id', teamId)
          .eq('name', DEFAULT_TEAM_KIT_NAME)
          .maybeSingle()

        if (!active) return

        if (error) {
          const fallback = createGenericKitConfig()
          setAppliedKitConfig(fallback)
          setDraftKitConfig(fallback)
          setOriginalGenericKitUrl(null)
          setJerseyUrlInput('')
          setKitNotice(`Failed to load saved jersey: ${error.message}`)
          setLoaded(true)
          return
        }

        const savedRow = (data ?? null) as TeamKitRow | null

        if (!savedRow) {
          const fallback = createGenericKitConfig()
          setAppliedKitConfig(fallback)
          setDraftKitConfig(fallback)
          setOriginalGenericKitUrl(null)
          setJerseyUrlInput('')
          setLoaded(true)
          return
        }

        const normalized = normalizeTeamKitConfig(savedRow.config)
        const originalUrl = getOriginalGenericKitUrl(normalized)

        setAppliedKitConfig(normalized)
        setDraftKitConfig(normalized)
        setOriginalGenericKitUrl(originalUrl)
        setJerseyUrlInput(normalized.mode === 'image_url' ? normalized.image_url ?? '' : '')
        setLoaded(true)
      } catch {
        if (!active) return

        const fallback = createGenericKitConfig()
        setAppliedKitConfig(fallback)
        setDraftKitConfig(fallback)
        setOriginalGenericKitUrl(null)
        setJerseyUrlInput('')
        setKitNotice(t('jersey.loadSavedFailed'))
        setLoaded(true)
      }
    }

    void loadTeamKit()

    return () => {
      active = false
    }
  }, [teamId])

  async function handleJerseyUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) return

    const validationError = await validateJerseyUploadFile(file)
    if (validationError) {
      setKitNotice(validationError)
      event.target.value = ''
      return
    }

    try {
      const previewUrl = await fileToDataUrl(file)

      setDraftKitConfig({
        version: 1,
        template: 'striped-tshirt',
        mode: 'uploaded_image',
        image_url: null,
        image_data_url: previewUrl,
        original_generic_image_url: originalGenericKitUrl,
        source: 'customize_team_upload',
      })

      setJerseyUrlInput('')
      setKitNotice(t('jersey.ready'))
    } catch {
      setKitNotice(t('jersey.previewFailed'))
    } finally {
      event.target.value = ''
    }
  }

  async function handleJerseyUrlCommit(): Promise<boolean> {
    const trimmedUrl = jerseyUrlInput.trim()

    if (!trimmedUrl) {
      return false
    }

    try {
      const parsed = new URL(trimmedUrl)

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setKitNotice(t('jersey.urlProtocol'))
        return false
      }

      const validationError = await validateRemoteJerseyImage(trimmedUrl)
      if (validationError) {
        setKitNotice(validationError)
        return false
      }

      setDraftKitConfig({
        version: 1,
        template: 'striped-tshirt',
        mode: 'image_url',
        image_url: trimmedUrl,
        image_data_url: null,
        original_generic_image_url: originalGenericKitUrl,
        source: 'customize_team_url',
      })

      setKitNotice(t('jersey.urlAccepted'))
      return true
    } catch {
      setKitNotice(t('jersey.urlInvalid'))
      return false
    }
  }

  function handleRestoreOriginalJersey(): void {
    const restored = createGenericKitConfig(originalGenericKitUrl)
    setDraftKitConfig(restored)
    setJerseyUrlInput('')
    setKitNotice(
      originalGenericKitUrl
        ? t('jersey.originalRestored')
        : t('jersey.defaultRestored'),
    )
  }

  async function handleApplyJersey(): Promise<void> {
    let nextConfig = draftKitConfig

    const typedUrl = jerseyUrlInput.trim()

    if (typedUrl && (draftKitConfig.mode !== 'image_url' || draftKitConfig.image_url !== typedUrl)) {
      const committed = await handleJerseyUrlCommit()
      if (!committed) return

      nextConfig = {
        version: 1,
        template: 'striped-tshirt',
        mode: 'image_url',
        image_url: typedUrl,
        image_data_url: null,
        original_generic_image_url: originalGenericKitUrl,
        source: 'customize_team_url',
      }
    }

    try {
      setSaving(true)
      setKitNotice(null)

      const nextSavedConfig = {
        version: 1,
        template: nextConfig.mode === 'generic_pool' ? 'generic_pool' : 'striped-tshirt',
        mode: nextConfig.mode,
        image_url:
          nextConfig.mode === 'generic_pool' || nextConfig.mode === 'image_url'
            ? nextConfig.image_url
            : null,
        image_data_url: nextConfig.mode === 'uploaded_image' ? nextConfig.image_data_url : null,
        original_generic_image_url: nextConfig.original_generic_image_url ?? originalGenericKitUrl,
        source: nextConfig.source ?? 'customize_team',
      } satisfies TeamKitConfig

      const { data, error } = await supabase.rpc('customize_team_save_home_kit_v1', {
        p_club_id: teamId,
        p_config: nextSavedConfig,
      })

      setSaving(false)

      if (error) {
        setKitNotice(`Failed to save jersey: ${error.message}`)
        return
      }

      const savedRow = (Array.isArray(data) ? data[0] : data) as TeamKitRow | null
      const normalized = normalizeTeamKitConfig(savedRow?.config ?? nextSavedConfig)
      const originalUrl = getOriginalGenericKitUrl(normalized) ?? originalGenericKitUrl

      setAppliedKitConfig(normalized)
      setDraftKitConfig(normalized)
      setOriginalGenericKitUrl(originalUrl)
      setJerseyUrlInput(normalized.mode === 'image_url' ? normalized.image_url ?? '' : '')
      await onCustomizationChanged()
      setKitNotice(
        customizationAccess?.jersey_change_cost
          ? `Jersey applied and saved for ${customizationAccess.jersey_change_cost} coins.`
          : t('jersey.savedFree'),
      )
    } catch (err) {
      setSaving(false)
      setKitNotice(err instanceof Error ? err.message : t('jersey.saveFailed'))
    }
  }

  const previewConfig = draftKitConfig
  const previewSrc = getKitImageSrc(previewConfig)
  const originalPreviewSrc = originalGenericKitUrl
  const hasUnsavedChanges = !areKitConfigsEqual(draftKitConfig, appliedKitConfig)

  return (
    <div className="space-y-5" data-team-id={teamId}>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
        <div className="font-semibold text-slate-900">{t('jersey.costTitle')}</div>
        <div className="mt-1 text-xs text-slate-500">
          {t('jersey.costHelp')}
        </div>
        <div className="mt-2 text-sm font-semibold text-slate-900">
          Current change: {customizationAccess?.jersey_change_cost ?? 0} coins
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row">
          <label className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm cursor-pointer hover:bg-slate-50">
            <span>{t('jersey.upload')}</span>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleJerseyUpload}
            />
          </label>

          <input
            value={jerseyUrlInput}
            onChange={event => setJerseyUrlInput(event.target.value)}
            onBlur={() => {
              void handleJerseyUrlCommit()
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleJerseyUrlCommit()
              }
            }}
            placeholder={t('jersey.urlPlaceholder')}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />

          <button
            type="button"
            onClick={() => {
              void handleApplyJersey()
            }}
            disabled={saving}
            className="rounded-lg border border-slate-900 bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? 'Applying...'
              : customizationAccess?.jersey_change_cost
                ? `Apply jersey · ${customizationAccess.jersey_change_cost} coins`
                : t('jersey.applyFree')}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">{t('jersey.previewTitle')}</div>
              <div className="mt-1 text-xs text-slate-500">
                {t('jersey.previewText')}
              </div>
            </div>
            {loaded && hasUnsavedChanges ? (
              <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                {t('jersey.unsaved')}
              </div>
            ) : null}
          </div>

          <div className="flex min-h-[360px] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-white p-6">
            {previewSrc ? (
              <img
                src={previewSrc}
                alt={t('jersey.alt')}
                className="max-h-full max-w-full rounded-md object-contain"
                style={{
                  maxWidth: 560,
                  maxHeight: 560,
                  width: 'auto',
                  height: 'auto',
                }}
              />
            ) : (
              <GenericJerseySvg
                primaryColor={primaryColor}
                secondaryColor={secondaryColor}
                className="w-52 h-auto"
              />
            )}
          </div>
        </div>

        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          {t('jersey.fileRules')}
        </div>

        {kitNotice ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {kitNotice}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function CustomizeTeamPage(): JSX.Element {
  const { t } = useTranslation('customizeTeam')
  const [mainClubId, setMainClubId] = useState<string | null>(null)
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null)
  const [brandingLock, setBrandingLock] = useState<BrandingLockStatus | null>(null)
  const [customizationAccess, setCustomizationAccess] = useState<BrandingCustomizationAccess | null>(null)

  const [teamNameInput, setTeamNameInput] = useState('My Club')
  const [appliedTeamName, setAppliedTeamName] = useState('My Club')

  const [primaryColor, setPrimaryColor] = useState('#0ea5a4')
  const [secondaryColor, setSecondaryColor] = useState('#0369a1')
  const [appliedPrimaryColor, setAppliedPrimaryColor] = useState('#0ea5a4')
  const [appliedSecondaryColor, setAppliedSecondaryColor] = useState('#0369a1')

  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoUrlInput, setLogoUrlInput] = useState('')
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null)
  const [pendingLogoUrl, setPendingLogoUrl] = useState<string | null>(null)
  const [logoVersion, setLogoVersion] = useState(0)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [topNotice, setTopNotice] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const successTimerRef = useRef<number | null>(null)
  const topNoticeTimerRef = useRef<number | null>(null)

  const resolvedLogoUrl = useMemo(() => {
    if (logoPreview) return logoPreview
    if (!logoPath) return null

    if (logoPath.startsWith('http://') || logoPath.startsWith('https://')) {
      try {
        const url = new URL(logoPath)
        url.searchParams.set('v', String(logoVersion))
        return url.toString()
      } catch {
        return logoPath
      }
    }

    const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(logoPath)
    return `${data.publicUrl}?v=${logoVersion}`
  }, [logoPath, logoPreview, logoVersion])

  function clearSuccessTimer(): void {
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current)
      successTimerRef.current = null
    }
  }

  function showSuccess(message: string): void {
    clearSuccessTimer()
    setSuccess(message)
    successTimerRef.current = window.setTimeout(() => {
      setSuccess(null)
      successTimerRef.current = null
    }, 1800)
  }

  function clearTopNotice(): void {
    if (topNoticeTimerRef.current) {
      window.clearTimeout(topNoticeTimerRef.current)
      topNoticeTimerRef.current = null
    }
  }

  function showTopNotice(type: 'success' | 'error', message: string): void {
    clearTopNotice()
    setTopNotice({ type, message })
    topNoticeTimerRef.current = window.setTimeout(() => {
      setTopNotice(null)
      topNoticeTimerRef.current = null
    }, 2500)
  }

  async function broadcastClubUpdate(): Promise<void> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const { mainClub } = await getMyClubContext()

      if (user?.id && mainClub) {
        const payload = {
          id: mainClub.id,
          owner_user_id: user.id,
          name: mainClub.name,
          country_code: mainClub.country_code,
          logo_path: mainClub.logo_path ?? null,
          primary_color: mainClub.primary_color ?? undefined,
          secondary_color: mainClub.secondary_color ?? undefined,
          club_type: 'main' as const,
          updated_at_ms: Date.now(),
        }

        window.localStorage.setItem('ppm-active-club', JSON.stringify(payload))
        window.dispatchEvent(new CustomEvent('club-updated', { detail: payload }))
      }
    } catch (broadcastError) {
      // eslint-disable-next-line no-console
      console.error('Failed to broadcast main club update:', broadcastError)
    }
  }

  function syncClubState(club: ClubRow): void {
    const nextLogoVersion = Date.now()

    setMainClubId(club.id)

    setTeamNameInput(club.name)
    setAppliedTeamName(club.name)

    setPrimaryColor(club.primary_color)
    setSecondaryColor(club.secondary_color)
    setAppliedPrimaryColor(club.primary_color)
    setAppliedSecondaryColor(club.secondary_color)

    setLogoPath(club.logo_path)
    setLogoVersion(nextLogoVersion)

    if (club.logo_path && (club.logo_path.startsWith('http://') || club.logo_path.startsWith('https://'))) {
      setLogoUrlInput(club.logo_path)
    } else {
      setLogoUrlInput('')
    }
  }

  async function loadCustomizationAccess(clubId: string): Promise<void> {
    const { data, error } = await supabase.rpc('customize_team_get_access_v1', {
      p_club_id: clubId,
    })

    if (error) {
      console.warn('Failed to load customization pricing:', error.message)
      setCustomizationAccess(null)
      return
    }

    const row = Array.isArray(data) ? data[0] : data
    setCustomizationAccess((row ?? null) as BrandingCustomizationAccess | null)
  }

  async function loadBrandingLockStatus(clubId: string): Promise<void> {
    const { data, error } = await supabase.rpc('club_branding_lock_status_v1', {
      p_club_id: clubId,
    })

    if (error) {
      console.warn('Failed to load branding lock status:', error.message)
      setBrandingLock(null)
      return
    }

    const row = Array.isArray(data) ? data[0] : data
    setBrandingLock((row ?? null) as BrandingLockStatus | null)
  }

  useEffect(() => {
    let active = true

    async function loadClub(): Promise<void> {
      try {
        setLoading(true)
        setError(null)

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) throw userError
        if (!user) throw new Error(t('page.loginRequired'))

        if (!active) return
        setOwnerUserId(user.id)

        const { mainClub } = await getMyClubContext()

        if (!mainClub?.id) {
          throw new Error(t('page.contextMissing'))
        }

        const { data: club, error: clubError } = await supabase
          .from('clubs')
          .select('id, owner_user_id, name, country_code, primary_color, secondary_color, logo_path')
          .eq('id', mainClub.id)
          .eq('owner_user_id', user.id)
          .single<ClubRow>()

        if (clubError) throw clubError
        if (!active || !club) return

        syncClubState(club)
        await Promise.all([
          loadBrandingLockStatus(club.id),
          loadCustomizationAccess(club.id),
        ])
        await broadcastClubUpdate()
      } catch (err) {
        setError(err instanceof Error ? err.message : t('page.loadFailed'))
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadClub()

    return () => {
      active = false
      clearSuccessTimer()
      clearTopNotice()
    }
  }, [])

  async function persistClub(patch: PersistableClubPatch): Promise<ClubRow | null> {
    if (!ownerUserId || !mainClubId) {
      const message = t('page.notResolved')
      setError(message)
      showTopNotice('error', message)
      return null
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    const normalizedPatch: PersistableClubPatch = { ...patch }

    if (typeof normalizedPatch.name === 'string') {
      normalizedPatch.name = sanitizeTeamName(normalizedPatch.name)
    }

    if (typeof normalizedPatch.primary_color === 'string') {
      normalizedPatch.primary_color = normalizedPatch.primary_color.trim()
    }

    if (typeof normalizedPatch.secondary_color === 'string') {
      normalizedPatch.secondary_color = normalizedPatch.secondary_color.trim()
    }

    const { data, error: updateError } = await supabase.rpc('update_club_branding_v1', {
      p_club_id: mainClubId,
      p_name: normalizedPatch.name ?? null,
      p_primary_color: normalizedPatch.primary_color ?? null,
      p_secondary_color: normalizedPatch.secondary_color ?? null,
      p_logo_path: normalizedPatch.logo_path ?? null,
    })

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      showTopNotice('error', updateError.message)
      return null
    }

    const updatedRow = Array.isArray(data) ? data[0] : data

    if (!updatedRow) {
      const message = t('page.updateFailed')
      setError(message)
      showTopNotice('error', message)
      return null
    }

    const updatedClub = updatedRow as ClubRow

    syncClubState(updatedClub)
    await loadBrandingLockStatus(updatedClub.id)
    await broadcastClubUpdate()
    return updatedClub
  }

  async function handleApplyTeamName(): Promise<void> {
    if (brandingLock?.can_edit_name === false) {
      const message = t('identity.nameLocked')
      setError(message)
      showTopNotice('error', message)
      return
    }

    const cleanName = sanitizeTeamName(teamNameInput)

    if (cleanName.length < 3 || cleanName.length > 40) {
      const message = t('identity.nameInvalid')
      setError(message)
      showTopNotice('error', message)
      return
    }

    if (!mainClubId) {
      setError(t('page.clubNotFound'))
      return
    }

    try {
      setSaving(true)
      setError(null)

      const { data, error: rpcError } = await supabase.rpc(
        'customize_team_change_name_v1',
        { p_club_id: mainClubId, p_new_name: cleanName },
      )
      if (rpcError) throw rpcError

      const result = Array.isArray(data) ? data[0] : data
      const updatedClub = result?.club as ClubRow | undefined
      if (!updatedClub) throw new Error(t('identity.nameResultMissing'))

      syncClubState(updatedClub)
      await Promise.all([
        loadBrandingLockStatus(updatedClub.id),
        loadCustomizationAccess(updatedClub.id),
        broadcastClubUpdate(),
      ])
      showSuccess(t('identity.nameUpdated'))
      showTopNotice('success', `Team name changed to "${updatedClub.name}" for 30 coins.`)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t('identity.nameFailed')
      setError(message)
      showTopNotice('error', message)
    } finally {
      setSaving(false)
    }
  }

  async function handleApplyTeamColors(): Promise<void> {
    if (brandingLock?.can_edit_colors === false) {
      const message = t('identity.colorsLocked')
      setError(message)
      showTopNotice('error', message)
      return
    }

    if (!isValidHexColor(primaryColor) || !isValidHexColor(secondaryColor)) {
      const message = t('identity.hexInvalid')
      setError(message)
      showTopNotice('error', message)
      return
    }

    if (primaryColor.toLowerCase() === secondaryColor.toLowerCase()) {
      const message = t('identity.colorsSame')
      setError(message)
      showTopNotice('error', message)
      return
    }

    const updatedClub = await persistClub({
      primary_color: primaryColor,
      secondary_color: secondaryColor,
    })

    if (!updatedClub) return

    if (mainClubId) {
      try {
        await upsertBaseTeamLogo(mainClubId, updatedClub.primary_color, updatedClub.secondary_color)
      } catch (baseLogoError) {
        // eslint-disable-next-line no-console
        console.warn('Unable to refresh base logo after color update', baseLogoError)
      }
    }

    showSuccess(t('identity.colorsUpdated'))
    showTopNotice(
      'success',
      `Team colors changed to ${updatedClub.primary_color} and ${updatedClub.secondary_color}.`,
    )
  }

  async function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) return

    const validationError = validateLogoFile(file)
    if (validationError) {
      setError(validationError)
      event.target.value = ''
      return
    }

    try {
      const previewUrl = await fileToDataUrl(file)
      setError(null)
      setPendingLogoUrl(null)
      setPendingLogoFile(file)
      setLogoPreview(previewUrl)
      setLogoUrlInput('')
    } catch {
      setError(t('logo.previewFailed'))
    } finally {
      event.target.value = ''
    }
  }

  function handleLogoUrlSelection(): void {
    const trimmedUrl = logoUrlInput.trim()

    if (!trimmedUrl) {
      setError(t('logo.urlFirst'))
      return
    }

    try {
      const parsed = new URL(trimmedUrl)

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setError(t('logo.urlProtocol'))
        return
      }

      setError(null)
      setPendingLogoFile(null)
      setPendingLogoUrl(trimmedUrl)
      setLogoPreview(trimmedUrl)
      setLogoVersion(Date.now())
    } catch {
      setError(t('logo.urlInvalid'))
    }
  }

  async function handleApplyLogo(): Promise<void> {
    if (!mainClubId) {
      setError(t('page.clubNotFound'))
      return
    }

    const logoCost = customizationAccess?.logo_change_cost ?? 0
    const coinBalance = customizationAccess?.coin_balance ?? 0

    if (logoCost > 0 && coinBalance < logoCost) {
      const missingCoins = logoCost - coinBalance
      const message =
        `Not enough coins to change the team logo. ` +
        `This change costs ${logoCost} coins, your current balance is ${coinBalance}, ` +
        `and you need ${missingCoins} more coin${missingCoins === 1 ? '' : 's'}.`

      setError(message)
      showTopNotice('error', message)
      return
    }

    const typedLogoUrl = logoUrlInput.trim()

    if (pendingLogoUrl || (!pendingLogoFile && typedLogoUrl)) {
      const logoUrlToApply = pendingLogoUrl ?? typedLogoUrl

      try {
        const parsed = new URL(logoUrlToApply)

        if (!['http:', 'https:'].includes(parsed.protocol)) {
          setError(t('logo.urlProtocol'))
          return
        }
      } catch {
        setError(t('logo.urlImageInvalid'))
        return
      }

      const { data, error: rpcError } = await supabase.rpc('customize_team_change_logo_v1', {
        p_club_id: mainClubId,
        p_logo_path: logoUrlToApply,
      })
      if (rpcError) throw rpcError
      const result = Array.isArray(data) ? data[0] : data
      const updatedClub = result?.club as ClubRow | undefined
      if (!updatedClub) throw new Error(t('logo.resultMissing'))
      syncClubState(updatedClub)
      await loadCustomizationAccess(mainClubId)

      setPendingLogoUrl(null)
      setPendingLogoFile(null)
      setLogoPreview(null)
      setLogoUrlInput(updatedClub.logo_path ?? '')
      setLogoVersion(Date.now())
      showSuccess(
        currentLogoChangeCost > 0
          ? `Logo applied for ${currentLogoChangeCost} coins.`
          : t('logo.appliedFree'),
      )
      return
    }

    if (!pendingLogoFile) {
      setError(t('logo.chooseFirst'))
      return
    }

    try {
      setError(null)
      setSaving(true)

      const pngLogoBlob = await convertFileToPngBlob(pendingLogoFile)
      const filePath = `logos/${mainClubId}-${Date.now()}.png`

      const { error: uploadError } = await supabase.storage.from(LOGO_BUCKET).upload(filePath, pngLogoBlob, {
        upsert: true,
        contentType: 'image/png',
      })

      if (uploadError) throw uploadError

      setSaving(false)

      const { data, error: rpcError } = await supabase.rpc('customize_team_change_logo_v1', {
        p_club_id: mainClubId,
        p_logo_path: filePath,
      })
      if (rpcError) throw rpcError
      const result = Array.isArray(data) ? data[0] : data
      const updatedClub = result?.club as ClubRow | undefined
      if (!updatedClub) throw new Error(t('logo.resultMissing'))
      syncClubState(updatedClub)
      await loadCustomizationAccess(mainClubId)

      setPendingLogoFile(null)
      setPendingLogoUrl(null)
      setLogoPreview(null)
      setLogoUrlInput('')
      setLogoVersion(Date.now())
      showSuccess(
        currentLogoChangeCost > 0
          ? `Logo applied for ${currentLogoChangeCost} coins.`
          : t('logo.appliedFree'),
      )
    } catch (err) {
      setSaving(false)
      setError(err instanceof Error ? err.message : t('logo.applyUploadFailed'))
    }
  }

  /**
   * UPDATED: Remove Logo now restores a deterministic generated base logo
   * instead of setting logo_path to null.
   */
  async function handleRemoveLogo(): Promise<void> {
    if (!mainClubId) {
      setError(t('page.clubNotFound'))
      return
    }

    const logoCost = customizationAccess?.logo_change_cost ?? 0
    const coinBalance = customizationAccess?.coin_balance ?? 0

    if (logoCost > 0 && coinBalance < logoCost) {
      const missingCoins = logoCost - coinBalance
      const message =
        `Not enough coins to change the team logo. ` +
        `Restoring the generated badge also counts as a logo change and costs ${logoCost} coins. ` +
        `Your current balance is ${coinBalance}; you need ${missingCoins} more coin${missingCoins === 1 ? '' : 's'}.`

      setError(message)
      showTopNotice('error', message)
      return
    }

    try {
      const baseLogoPath = await upsertBaseTeamLogo(mainClubId, appliedPrimaryColor, appliedSecondaryColor)
      const { data, error: rpcError } = await supabase.rpc('customize_team_change_logo_v1', {
        p_club_id: mainClubId,
        p_logo_path: baseLogoPath,
      })
      if (rpcError) throw rpcError
      const result = Array.isArray(data) ? data[0] : data
      const updatedClub = result?.club as ClubRow | undefined
      if (!updatedClub) throw new Error(t('logo.resetResultMissing'))
      syncClubState(updatedClub)
      await loadCustomizationAccess(mainClubId)

      setLogoPreview(null)
      setLogoUrlInput('')
      setPendingLogoFile(null)
      setPendingLogoUrl(null)
      setLogoVersion(Date.now())
      showSuccess(t('logo.removed'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('logo.restoreFailed'))
    }
  }

  const identityLockedBySponsor = brandingLock?.locked_by_sponsor === true
  const canEditTeamName = brandingLock?.can_edit_name !== false
  const canEditTeamColors = brandingLock?.can_edit_colors !== false

  const currentCoinBalance = customizationAccess?.coin_balance ?? 0
  const currentLogoChangeCost = customizationAccess?.logo_change_cost ?? 0
  const hasEnoughCoinsForLogo =
    currentLogoChangeCost <= 0 || currentCoinBalance >= currentLogoChangeCost
  const missingLogoCoins = Math.max(
    0,
    currentLogoChangeCost - currentCoinBalance,
  )

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">{t('page.title')}</h2>

      {loading ? (
        <div className="rounded-lg bg-white p-6 shadow text-sm text-gray-600">
          {t('page.loading')}
        </div>
      ) : (
        <div className="space-y-6 w-full">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('identity.eyebrow')}</div>
              <h3 className="mt-1 text-lg font-bold text-slate-950">{t('identity.title')}</h3>
              <p className="mt-1 text-sm text-slate-500">{t('identity.description')}</p>
            </div>
            <div className="space-y-6 p-6">
            {identityLockedBySponsor && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div className="font-semibold">{t('identity.lockedTitle')}</div>
                <div className="mt-1">
                  Your team is racing this season as{' '}
                  <span className="font-semibold">
                    {brandingLock?.full_display_name ?? brandingLock?.season_display_name}
                  </span>
                  {t('identity.lockedSuffix')}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">{t('identity.name')}</label>
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  value={teamNameInput}
                  onChange={e => setTeamNameInput(e.target.value)}
                  maxLength={40}
                  disabled={!canEditTeamName}
                  className={[
                    'w-full border border-gray-300 px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-300',
                    !canEditTeamName ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : '',
                  ].join(' ')}
                  placeholder={t('identity.namePlaceholder')}
                />
                <button
                  type="button"
                  disabled={!canEditTeamName || saving}
                  onClick={() => {
                    void handleApplyTeamName()
                  }}
                  className={[
                    'h-10 px-4 rounded-md border text-sm font-medium',
                    !canEditTeamName || saving
                      ? 'border-gray-300 bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800',
                  ].join(' ')}
                >
                  {saving ? 'Applying...' : t('identity.applyName')}
                </button>
              </div>

              <div className="mt-3 flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-200 text-lg font-bold">
                  30
                </div>
                <div>
                  <div className="text-sm font-semibold">{t('identity.nameCost')}</div>
                  <div className="mt-0.5 text-xs text-amber-800">
                    {t('identity.nameCostHelp')}
                  </div>
                </div>
              </div>

              <div className="mt-2 text-xs text-gray-500">{t('identity.nameLength')}</div>
            </div>

            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-2">
                    {t('identity.primary')}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={primaryColor}
                      disabled={!canEditTeamColors}
                      onChange={e => setPrimaryColor(e.target.value)}
                      className="h-12 w-20 cursor-pointer rounded border border-gray-300 bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <input
                      value={primaryColor}
                      disabled={!canEditTeamColors}
                      onChange={e => setPrimaryColor(e.target.value)}
                      className={[
                        'flex-1 border border-gray-300 px-3 py-2 rounded-md font-mono',
                        !canEditTeamColors ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : '',
                      ].join(' ')}
                      maxLength={7}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-2">
                    {t('identity.secondary')}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={secondaryColor}
                      disabled={!canEditTeamColors}
                      onChange={e => setSecondaryColor(e.target.value)}
                      className="h-12 w-20 cursor-pointer rounded border border-gray-300 bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <input
                      value={secondaryColor}
                      disabled={!canEditTeamColors}
                      onChange={e => setSecondaryColor(e.target.value)}
                      className={[
                        'flex-1 border border-gray-300 px-3 py-2 rounded-md font-mono',
                        !canEditTeamColors ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : '',
                      ].join(' ')}
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <button
                  type="button"
                  disabled={!canEditTeamColors || saving}
                  onClick={() => {
                    void handleApplyTeamColors()
                  }}
                  className={[
                    'h-10 px-4 rounded-md border text-sm font-medium',
                    !canEditTeamColors || saving
                      ? 'border-gray-300 bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800',
                  ].join(' ')}
                >
                  {t('identity.applyColors')}
                </button>
              </div>

              <div className="min-h-[52px]">
                {topNotice ? (
                  <div
                    className={`mt-4 rounded-md border px-4 py-3 text-sm font-medium ${
                      topNotice.type === 'success'
                        ? 'border-green-300 bg-green-50 text-green-800'
                        : 'border-red-300 bg-red-50 text-red-700'
                    }`}
                  >
                    {topNotice.message}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
            </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('logo.eyebrow')}</div>
              <h3 className="mt-1 text-lg font-bold text-slate-950">{t('logo.title')}</h3>
              <p className="mt-1 text-sm text-slate-500">{t('logo.description')}</p>
            </div>

            <div className="p-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex w-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:w-72 lg:min-h-[280px]">
                  <div className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('logo.current')}
                  </div>
                  <div className="flex items-center justify-center">
                    <HeaderLogo
                      logoSrc={resolvedLogoUrl}
                      teamName={appliedTeamName}
                      primaryColor={appliedPrimaryColor}
                      secondaryColor={appliedSecondaryColor}
                    />
                  </div>
                </div>

                <div className="flex-1 space-y-3">
                  <div
                    className={[
                      'rounded-xl border px-4 py-3',
                      !hasEnoughCoinsForLogo
                        ? 'border-red-300 bg-red-50'
                        : currentLogoChangeCost > 0
                          ? 'border-amber-300 bg-amber-50'
                          : 'border-emerald-300 bg-emerald-50',
                    ].join(' ')}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {t('logo.change')}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          {t('logo.changeHelp')}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          {t('logo.balance')}
                        </div>
                        <div
                          className={[
                            'mt-0.5 text-lg font-bold',
                            !hasEnoughCoinsForLogo ? 'text-red-700' : 'text-slate-950',
                          ].join(' ')}
                        >
                          {currentCoinBalance} coins
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-white/70 bg-white/70 px-3 py-2">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          {t('logo.thisChange')}
                        </div>
                        <div className="mt-0.5 text-sm font-bold text-slate-950">
                          {currentLogoChangeCost > 0
                            ? `${currentLogoChangeCost} coins`
                            : 'Free'}
                        </div>
                      </div>

                      <div className="rounded-lg border border-white/70 bg-white/70 px-3 py-2">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          {t('logo.status')}
                        </div>
                        <div
                          className={[
                            'mt-0.5 text-sm font-bold',
                            !hasEnoughCoinsForLogo
                              ? 'text-red-700'
                              : 'text-emerald-700',
                          ].join(' ')}
                        >
                          {!hasEnoughCoinsForLogo
                            ? `Need ${missingLogoCoins} more coin${missingLogoCoins === 1 ? '' : 's'}`
                            : currentLogoChangeCost > 0
                              ? 'Enough coins'
                              : t('logo.freeAvailable')}
                        </div>
                      </div>
                    </div>

                    {!hasEnoughCoinsForLogo ? (
                      <div className="mt-3 flex flex-col gap-2 rounded-lg border border-red-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs font-medium text-red-800">
                          You cannot apply or remove the logo until you have at least {currentLogoChangeCost} coins.
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            window.location.href = '/dashboard/pro-packages'
                          }}
                          className="shrink-0 rounded-md border border-red-300 bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-800 transition hover:bg-red-200"
                        >
                          {t('logo.getCoins')}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <label className="inline-flex items-center justify-center px-4 py-2 rounded-md border border-gray-300 bg-white cursor-pointer hover:bg-gray-50">
                      <span className="text-sm font-medium">{t('logo.upload')}</span>
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleLogoUpload}
                        disabled={saving || !hasEnoughCoinsForLogo}
                      />
                    </label>

                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                      {t('logo.fileHelp')}
                    </div>
                  </div>

                  <div>
                    <input
                      value={logoUrlInput}
                      onChange={event => {
                        setLogoUrlInput(event.target.value)
                        setPendingLogoUrl(null)
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void handleApplyLogo()
                        }
                      }}
                      placeholder={t('logo.urlPlaceholder')}
                      disabled={saving || !hasEnoughCoinsForLogo}
                      className={[
                        'w-full border border-gray-300 px-3 py-2 rounded-md text-sm',
                        saving || !hasEnoughCoinsForLogo
                          ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                          : 'bg-white',
                      ].join(' ')}
                    />
                    <div className="mt-1 text-xs text-slate-500">
                      {t('logo.urlHelp')}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void handleRemoveLogo()
                      }}
                      disabled={saving || !hasEnoughCoinsForLogo}
                      className={[
                        'h-10 px-4 rounded-md border text-sm font-medium',
                        saving || !hasEnoughCoinsForLogo
                          ? 'border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'border-gray-300 bg-white text-slate-900 hover:bg-gray-50',
                      ].join(' ')}
                    >
                      {t('logo.remove')}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void handleApplyLogo()
                      }}
                      disabled={saving || !hasEnoughCoinsForLogo}
                      className={[
                        'h-10 px-4 rounded-md border text-sm font-medium',
                        saving || !hasEnoughCoinsForLogo
                          ? 'border-gray-300 bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800',
                      ].join(' ')}
                    >
                      {saving
                        ? 'Applying...'
                        : !hasEnoughCoinsForLogo
                          ? `Need ${missingLogoCoins} more coin${missingLogoCoins === 1 ? '' : 's'}`
                          : currentLogoChangeCost > 0
                            ? `Apply logo · ${currentLogoChangeCost} coins`
                            : t('logo.applyFree')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('jersey.eyebrow')}</div>
              <h3 className="mt-1 text-lg font-bold text-slate-950">{t('jersey.title')}</h3>
              <p className="mt-1 text-sm text-slate-500">{t('jersey.description')}</p>
            </div>
            <div className="p-6">
            {mainClubId ? (
              <KitDesigner
                teamId={mainClubId}
                primaryColor={appliedPrimaryColor}
                secondaryColor={appliedSecondaryColor}
                customizationAccess={customizationAccess}
                onCustomizationChanged={() => loadCustomizationAccess(mainClubId)}
              />
            ) : (
              <div className="text-sm text-gray-600">{t('page.teamNotLoaded')}</div>
            )}
            </div>
          </div>

          {(error || success || saving) && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
              {saving && <div className="text-sm text-gray-600">{t('page.saving')}</div>}
              {success && <div className="text-sm text-green-600">{success}</div>}
              {error && <div className="text-sm text-red-600">{error}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}