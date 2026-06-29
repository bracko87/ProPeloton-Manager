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
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
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

type KitDesignerProps = {
  teamId: string
  primaryColor: string
  secondaryColor: string
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

const MAX_FILE_SIZE = 512 * 1024 // 0.5 MB
const LOGO_BUCKET = 'club-logos'

const MAX_JERSEY_FILE_SIZE = 1024 * 1024 // 1 MB
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
 * Logo validation: allow JPG/PNG/WEBP, max 0.5MB.
 */
function validateLogoFile(file: File): string | null {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

  if (!validTypes.includes(file.type)) {
    return 'Only JPG, PNG, or WEBP images are allowed.'
  }

  if (file.size > MAX_FILE_SIZE) {
    return 'Image must be no larger than 0.5 MB.'
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
          reject(new Error('Failed to process logo image.'))
          return
        }

        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0)

        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error('Failed to convert logo to PNG.'))
              return
            }
            resolve(blob)
          },
          'image/png',
          1,
        )
      }

      image.onerror = () => reject(new Error('Failed to load logo image.'))
      image.src = String(reader.result)
    }

    reader.onerror = () => reject(new Error('Failed to read logo image.'))
    reader.readAsDataURL(file)
  })
}

function validateJerseyUploadFile(file: File): Promise<string | null> {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

  if (!validTypes.includes(file.type)) {
    return Promise.resolve('Only JPG, PNG, or WEBP images are allowed for jerseys.')
  }

  if (file.size > MAX_JERSEY_FILE_SIZE) {
    return Promise.resolve('Jersey image must be no larger than 1 MB.')
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
        resolve('Uploaded jersey image must be 512 × 512 px or smaller.')
        return
      }

      resolve(null)
    }

    image.onerror = () => {
      window.URL.revokeObjectURL(objectUrl)
      resolve('Failed to read jersey image.')
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
      resolve('Could not load jersey image from URL.')
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
        reject(new Error('Failed to render base logo image.'))
        return
      }

      context.clearRect(0, 0, size, size)
      context.drawImage(image, 0, 0, size, size)

      canvas.toBlob(
        blob => {
          URL.revokeObjectURL(objectUrl)

          if (!blob) {
            reject(new Error('Failed to export base logo image.'))
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
      reject(new Error('Failed to load base logo image.'))
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
    throw new Error(error.message || 'Failed to refresh base team logo.')
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

function KitDesigner({ teamId, primaryColor, secondaryColor }: KitDesignerProps): JSX.Element {
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
        setKitNotice('Failed to load saved jersey.')
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
      setKitNotice('New jersey image is ready. Click Apply jersey to save it.')
    } catch {
      setKitNotice('Failed to preview jersey image.')
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
        setKitNotice('Jersey image URL must start with http:// or https://')
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

      setKitNotice('Jersey URL accepted. Click Apply jersey to save it.')
      return true
    } catch {
      setKitNotice('Please provide a valid jersey image URL.')
      return false
    }
  }

  function handleRestoreOriginalJersey(): void {
    const restored = createGenericKitConfig(originalGenericKitUrl)
    setDraftKitConfig(restored)
    setJerseyUrlInput('')
    setKitNotice(
      originalGenericKitUrl
        ? 'Original team jersey restored in preview. Click Apply jersey to save it.'
        : 'Default color-based jersey restored in preview. Click Apply jersey to save it.',
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

      const { data, error } = await supabase.rpc('save_club_home_kit_config_v1', {
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
      setKitNotice('Jersey applied and saved.')
    } catch (err) {
      setSaving(false)
      setKitNotice(err instanceof Error ? err.message : 'Failed to save jersey.')
    }
  }

  const previewConfig = draftKitConfig
  const previewSrc = getKitImageSrc(previewConfig)
  const originalPreviewSrc = originalGenericKitUrl
  const hasUnsavedChanges = !areKitConfigsEqual(draftKitConfig, appliedKitConfig)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-5" data-team-id={teamId}>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Original team jersey</div>
        <div className="mt-1 text-xs text-slate-500">
          The generic kit selected when this team was created.
        </div>

        <div className="mt-4 flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-4">
          {originalPreviewSrc ? (
            <img
              src={originalPreviewSrc}
              alt="Original selected team jersey"
              className="max-h-[230px] max-w-full object-contain"
            />
          ) : (
            <GenericJerseySvg
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              className="w-40 h-auto"
            />
          )}
        </div>

        <button
          type="button"
          onClick={handleRestoreOriginalJersey}
          className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
        >
          Restore original jersey
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row">
          <label className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm cursor-pointer hover:bg-slate-50">
            <span>Upload new jersey</span>
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
            placeholder="Paste new jersey image URL and press Enter"
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
            {saving ? 'Applying...' : 'Apply jersey'}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Current jersey preview</div>
              <div className="mt-1 text-xs text-slate-500">
                This is the jersey that will appear on team profile and race screens.
              </div>
            </div>
            {loaded && hasUnsavedChanges ? (
              <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                Unsaved changes
              </div>
            ) : null}
          </div>

          <div className="flex min-h-[360px] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-white p-6">
            {previewSrc ? (
              <img
                src={previewSrc}
                alt="Current jersey"
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
          URL images can be any size and are fitted inside the preview. Uploaded files must be JPG, PNG, or WEBP, max 1 MB and max 512 × 512 px.
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
  const [mainClubId, setMainClubId] = useState<string | null>(null)
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null)
  const [brandingLock, setBrandingLock] = useState<BrandingLockStatus | null>(null)

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
        if (!user) throw new Error('You must be logged in to customize your club.')

        if (!active) return
        setOwnerUserId(user.id)

        const { mainClub } = await getMyClubContext()

        if (!mainClub?.id) {
          throw new Error('Main club context not found.')
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
        await loadBrandingLockStatus(club.id)
        await broadcastClubUpdate()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load club.')
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
      const message = 'Main club is not resolved.'
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
      const message = 'Main club update failed.'
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
      const message = 'Team name is locked by a naming-rights sponsor.'
      setError(message)
      showTopNotice('error', message)
      return
    }

    const cleanName = sanitizeTeamName(teamNameInput)

    if (cleanName.length < 3 || cleanName.length > 40) {
      const message = 'Team name must be between 3 and 40 characters.'
      setError(message)
      showTopNotice('error', message)
      return
    }

    const updatedClub = await persistClub({ name: cleanName })
    if (!updatedClub) return

    showSuccess('Team name updated.')
    showTopNotice('success', `Team name changed to "${updatedClub.name}".`)
  }

  async function handleApplyTeamColors(): Promise<void> {
    if (brandingLock?.can_edit_colors === false) {
      const message = 'Team colors are locked by a naming-rights sponsor.'
      setError(message)
      showTopNotice('error', message)
      return
    }

    if (!isValidHexColor(primaryColor) || !isValidHexColor(secondaryColor)) {
      const message = 'Please use valid HEX colors like #ff0000.'
      setError(message)
      showTopNotice('error', message)
      return
    }

    if (primaryColor.toLowerCase() === secondaryColor.toLowerCase()) {
      const message = 'Primary and secondary colors must be different.'
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

    showSuccess('Team colors updated.')
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
      setError('Failed to preview logo image.')
    } finally {
      event.target.value = ''
    }
  }

  function handleLogoUrlSelection(): void {
    const trimmedUrl = logoUrlInput.trim()

    if (!trimmedUrl) {
      setError('Please enter an image URL first.')
      return
    }

    try {
      const parsed = new URL(trimmedUrl)

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setError('Logo URL must start with http:// or https://')
        return
      }

      setError(null)
      setPendingLogoFile(null)
      setPendingLogoUrl(trimmedUrl)
      setLogoPreview(trimmedUrl)
      setLogoVersion(Date.now())
    } catch {
      setError('Please provide a valid image URL.')
    }
  }

  async function handleApplyLogo(): Promise<void> {
    if (!mainClubId) {
      setError('Club not found.')
      return
    }

    const typedLogoUrl = logoUrlInput.trim()

    if (pendingLogoUrl || (!pendingLogoFile && typedLogoUrl)) {
      const logoUrlToApply = pendingLogoUrl ?? typedLogoUrl

      try {
        const parsed = new URL(logoUrlToApply)

        if (!['http:', 'https:'].includes(parsed.protocol)) {
          setError('Logo URL must start with http:// or https://')
          return
        }
      } catch {
        setError('Please provide a valid logo image URL.')
        return
      }

      const updatedClub = await persistClub({ logo_path: logoUrlToApply })
      if (!updatedClub) return

      setPendingLogoUrl(null)
      setPendingLogoFile(null)
      setLogoPreview(null)
      setLogoUrlInput(updatedClub.logo_path ?? '')
      setLogoVersion(Date.now())
      showSuccess('Logo applied.')
      return
    }

    if (!pendingLogoFile) {
      setError('Please upload a logo image or paste a logo image URL first.')
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

      const updatedClub = await persistClub({ logo_path: filePath })
      if (!updatedClub) return

      setPendingLogoFile(null)
      setPendingLogoUrl(null)
      setLogoPreview(null)
      setLogoUrlInput('')
      setLogoVersion(Date.now())
      showSuccess('Logo applied.')
    } catch (err) {
      setSaving(false)
      setError(err instanceof Error ? err.message : 'Failed to apply uploaded logo.')
    }
  }

  /**
   * UPDATED: Remove Logo now restores a deterministic generated base logo
   * instead of setting logo_path to null.
   */
  async function handleRemoveLogo(): Promise<void> {
    if (!mainClubId) {
      setError('Club not found.')
      return
    }

    try {
      const baseLogoPath = await upsertBaseTeamLogo(mainClubId, appliedPrimaryColor, appliedSecondaryColor)
      const updatedClub = await persistClub({ logo_path: baseLogoPath })
      if (!updatedClub) return

      setLogoPreview(null)
      setLogoUrlInput('')
      setPendingLogoFile(null)
      setPendingLogoUrl(null)
      setLogoVersion(Date.now())
      showSuccess('Custom logo removed. Base team logo restored.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore base logo.')
    }
  }

  const identityLockedBySponsor = brandingLock?.locked_by_sponsor === true
  const canEditTeamName = brandingLock?.can_edit_name !== false
  const canEditTeamColors = brandingLock?.can_edit_colors !== false

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Customize Team</h2>

      {loading ? (
        <div className="rounded-lg bg-white p-6 shadow text-sm text-gray-600">
          Loading club settings...
        </div>
      ) : (
        <div className="space-y-6 w-full">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Team identity</div>
              <h3 className="mt-1 text-lg font-bold text-slate-950">Name and colors</h3>
              <p className="mt-1 text-sm text-slate-500">Update the public identity used across your team profile, race pages, and header.</p>
            </div>
            <div className="space-y-6 p-6">
            {identityLockedBySponsor && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div className="font-semibold">Team identity locked by naming-rights sponsor</div>
                <div className="mt-1">
                  Your team is racing this season as{' '}
                  <span className="font-semibold">
                    {brandingLock?.full_display_name ?? brandingLock?.season_display_name}
                  </span>
                  . Team name and colors are locked until the end of the season.
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">Team name</label>
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
                  placeholder="Enter team name"
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
                  Apply Name
                </button>
              </div>
              <div className="mt-1 text-xs text-gray-500">3 to 40 characters</div>
            </div>

            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-2">
                    Primary color
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
                    Secondary color
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
                  Apply team colors
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
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Team logo</div>
              <h3 className="mt-1 text-lg font-bold text-slate-950">Logo and badge</h3>
              <p className="mt-1 text-sm text-slate-500">Upload a custom logo or restore the generated team badge.</p>
            </div>

            <div className="p-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex w-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:w-72 lg:min-h-[280px]">
                  <div className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Current logo
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
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <label className="inline-flex items-center justify-center px-4 py-2 rounded-md border border-gray-300 bg-white cursor-pointer hover:bg-gray-50">
                      <span className="text-sm font-medium">Upload logo image</span>
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                    </label>

                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                      JPG, PNG, or WEBP. Uploaded logos are saved as PNG. Maximum file size: 0.5 MB
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
                      placeholder="Paste logo image URL, then click Apply logo"
                      className="w-full border border-gray-300 px-3 py-2 rounded-md text-sm"
                    />
                    <div className="mt-1 text-xs text-slate-500">
                      URL logos are saved when you click Apply logo. Preview URL is optional and no longer required.
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void handleRemoveLogo()
                      }}
                      className="h-10 px-4 rounded-md border border-gray-300 bg-white text-slate-900 text-sm font-medium hover:bg-gray-50"
                    >
                      Remove Logo
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void handleApplyLogo()
                      }}
                      className="h-10 px-4 rounded-md border border-slate-900 bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
                    >
                      Apply logo
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Team jersey</div>
              <h3 className="mt-1 text-lg font-bold text-slate-950">Jersey management</h3>
              <p className="mt-1 text-sm text-slate-500">Keep the jersey selected during team creation or replace it with a new upload or URL.</p>
            </div>
            <div className="p-6">
            {mainClubId ? (
              <KitDesigner
                teamId={mainClubId}
                primaryColor={appliedPrimaryColor}
                secondaryColor={appliedSecondaryColor}
              />
            ) : (
              <div className="text-sm text-gray-600">Team not loaded yet.</div>
            )}
            </div>
          </div>

          {(error || success || saving) && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
              {saving && <div className="text-sm text-gray-600">Saving changes...</div>}
              {success && <div className="text-sm text-green-600">{success}</div>}
              {error && <div className="text-sm text-red-600">{error}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}