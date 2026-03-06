/**
 * CustomizeTeam.tsx
 * Team branding and settings page with direct persistence to public.clubs
 * and jersey persistence to public.team_kits.
 *
 * NOTE:
 * - This file assumes you have a configured Supabase client export.
 * - Adjust the supabase import path if needed.
 * - Club branding persists to public.clubs.
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
 * UPDATE (broadcast logo-path guard):
 * - Non-logo updates no longer rebroadcast logo_path.
 * - This prevents header logo source churn and avoids the white-inside-crest regression.
 * - logo_path is still broadcast on initial load and real logo changes.
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
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

type KitDesignerProps = {
  teamId: string
  primaryColor: string
  secondaryColor: string
}

type TeamKitMode = 'generic' | 'image_url' | 'uploaded_image'

type TeamKitConfig = {
  version: 1
  template: 'striped-tshirt'
  mode: TeamKitMode
  image_url: string | null
  image_data_url: string | null
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
const DEFAULT_TEAM_KIT_NAME = 'default'

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

function createGenericKitConfig(): TeamKitConfig {
  return {
    version: 1,
    template: 'striped-tshirt',
    mode: 'generic',
    image_url: null,
    image_data_url: null,
  }
}

function normalizeTeamKitConfig(value: unknown): TeamKitConfig {
  const fallback = createGenericKitConfig()

  if (!value || typeof value !== 'object') {
    return fallback
  }

  const raw = value as Partial<TeamKitConfig>

  const mode: TeamKitMode =
    raw.mode === 'image_url' || raw.mode === 'uploaded_image' || raw.mode === 'generic'
      ? raw.mode
      : 'generic'

  return {
    version: 1,
    template: 'striped-tshirt',
    mode,
    image_url: typeof raw.image_url === 'string' ? raw.image_url : null,
    image_data_url: typeof raw.image_data_url === 'string' ? raw.image_data_url : null,
  }
}

function getKitImageSrc(config: TeamKitConfig): string | null {
  if (config.mode === 'image_url') {
    return config.image_url
  }

  if (config.mode === 'uploaded_image') {
    return config.image_data_url
  }

  return null
}

function areKitConfigsEqual(a: TeamKitConfig, b: TeamKitConfig): boolean {
  return (
    a.version === b.version &&
    a.template === b.template &&
    a.mode === b.mode &&
    a.image_url === b.image_url &&
    a.image_data_url === b.image_data_url
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
      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-transparent">
        <img src={logoSrc} alt="Club logo" className="max-h-full max-w-full object-contain" />
      </div>
    )
  }

  return (
    <div
      className="flex h-24 w-24 items-center justify-center rounded-md border border-gray-200 text-white text-lg font-bold"
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
          setAppliedKitConfig(createGenericKitConfig())
          setDraftKitConfig(createGenericKitConfig())
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
          setJerseyUrlInput('')
          setLoaded(true)
          return
        }

        const normalized = normalizeTeamKitConfig(savedRow.config)
        setAppliedKitConfig(normalized)
        setDraftKitConfig(normalized)
        setJerseyUrlInput(normalized.mode === 'image_url' ? normalized.image_url ?? '' : '')
        setLoaded(true)
      } catch {
        if (!active) return

        const fallback = createGenericKitConfig()
        setAppliedKitConfig(fallback)
        setDraftKitConfig(fallback)
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
      })

      setJerseyUrlInput('')
      setKitNotice('Jersey image ready. Click Apply jersey to save it.')
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
      })

      setKitNotice('Jersey URL accepted. It will be fitted in preview and in-game. Click Apply jersey.')
      return true
    } catch {
      setKitNotice('Please provide a valid jersey image URL.')
      return false
    }
  }

  function handleRemoveJersey(): void {
    setDraftKitConfig(createGenericKitConfig())
    setJerseyUrlInput('')
    setKitNotice('Generic jersey selected. Click Apply jersey to save it.')
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
      }
    }

    try {
      setSaving(true)
      setKitNotice(null)

      const payload = {
        team_id: teamId,
        name: DEFAULT_TEAM_KIT_NAME,
        config: {
          version: 1,
          template: 'striped-tshirt',
          mode: nextConfig.mode,
          image_url: nextConfig.mode === 'image_url' ? nextConfig.image_url : null,
          image_data_url: nextConfig.mode === 'uploaded_image' ? nextConfig.image_data_url : null,
        } satisfies TeamKitConfig,
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('team_kits')
        .upsert(payload, { onConflict: 'team_id,name' })
        .select('id, team_id, name, config, updated_at')
        .single()

      setSaving(false)

      if (error) {
        setKitNotice(`Failed to save jersey: ${error.message}`)
        return
      }

      const savedRow = data as TeamKitRow
      const normalized = normalizeTeamKitConfig(savedRow.config)

      setAppliedKitConfig(normalized)
      setDraftKitConfig(normalized)
      setJerseyUrlInput(normalized.mode === 'image_url' ? normalized.image_url ?? '' : '')
      setKitNotice('Jersey applied and saved.')
    } catch (err) {
      setSaving(false)
      setKitNotice(err instanceof Error ? err.message : 'Failed to save jersey.')
    }
  }

  const previewConfig = draftKitConfig
  const previewSrc = getKitImageSrc(previewConfig)
  const hasUnsavedChanges = !areKitConfigsEqual(draftKitConfig, appliedKitConfig)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[220px_1fr] gap-4" data-team-id={teamId}>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="text-sm font-medium mb-3">Generic jersey</div>

        <div className="flex items-center justify-center min-h-[220px] rounded-lg border border-gray-100 bg-gray-50">
          <GenericJerseySvg primaryColor={primaryColor} secondaryColor={secondaryColor} className="w-36 h-auto" />
        </div>

        <div className="mt-3 text-xs text-center text-gray-500">Default team jersey</div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <label className="inline-flex items-center justify-center px-4 py-2 rounded-md border border-gray-300 bg-white cursor-pointer hover:bg-gray-50">
            <span className="text-sm font-medium">Upload image</span>
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
            placeholder="Paste jersey image URL and press Enter"
            className="flex-1 border border-gray-300 px-3 py-2 rounded-md text-sm bg-white"
          />

          <button
            type="button"
            onClick={handleRemoveJersey}
            className="px-4 py-2 rounded-md border border-gray-300 bg-white text-slate-900 text-sm font-medium hover:bg-gray-50"
          >
            Use generic jersey
          </button>

          <button
            type="button"
            onClick={() => {
              void handleApplyJersey()
            }}
            disabled={saving}
            className="px-4 py-2 rounded-md border border-slate-900 bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Applying...' : 'Apply jersey'}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-sm font-medium">Current jersey preview</div>
            {loaded && hasUnsavedChanges ? (
              <div className="text-xs font-medium text-amber-700">Unsaved changes</div>
            ) : null}
          </div>

          <div className="flex items-center justify-center min-h-[280px] rounded-lg border border-gray-100 bg-gray-50 overflow-hidden p-4">
            {previewSrc ? (
              <img
                src={previewSrc}
                alt="Current jersey"
                className="max-h-full max-w-full rounded-md object-contain"
                style={{
                  maxWidth: 512,
                  maxHeight: 512,
                  width: 'auto',
                  height: 'auto',
                }}
              />
            ) : (
              <GenericJerseySvg primaryColor={primaryColor} secondaryColor={secondaryColor} className="w-44 h-auto" />
            )}
          </div>
        </div>

        <div className="inline-flex self-start rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          URL images can be any size. Preview fits to max 512 × 512. Uploads max 1 MB.
        </div>

        {kitNotice ? (
          <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">{kitNotice}</div>
        ) : null}
      </div>
    </div>
  )
}

export default function CustomizeTeamPage(): JSX.Element {
  const [clubId, setClubId] = useState<string | null>(null)
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null)

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

  function broadcastClubUpdate(club: ClubRow, options?: { includeLogoPath?: boolean }): void {
    const payload = {
      id: club.id,
      owner_user_id: club.owner_user_id,
      name: club.name,
      primary_color: club.primary_color,
      secondary_color: club.secondary_color,
      ...(options?.includeLogoPath ? { logo_path: club.logo_path } : {}),
      updated_at_ms: Date.now(),
    }

    localStorage.setItem('ppm-active-club', JSON.stringify(payload))

    window.dispatchEvent(
      new CustomEvent('club-updated', {
        detail: payload,
      }),
    )
  }

  function syncClubState(club: ClubRow): void {
    const nextLogoVersion = Date.now()

    setClubId(club.id)

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

        const { data: club, error: clubError } = await supabase
          .from('clubs')
          .select('id, owner_user_id, name, country_code, primary_color, secondary_color, logo_path')
          .eq('owner_user_id', user.id)
          .single<ClubRow>()

        if (clubError) throw clubError
        if (!active || !club) return

        syncClubState(club)
        broadcastClubUpdate(club, { includeLogoPath: true })
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
    if (!ownerUserId) {
      const message = 'You must be logged in to update your club.'
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

    const { data, error: updateError } = await supabase
      .from('clubs')
      .update(normalizedPatch)
      .eq('owner_user_id', ownerUserId)
      .select('id, owner_user_id, name, country_code, primary_color, secondary_color, logo_path')

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      showTopNotice('error', updateError.message)
      return null
    }

    const updatedRows = (data ?? []) as ClubRow[]
    const updatedClub = updatedRows[0] ?? null

    if (!updatedClub) {
      const message =
        'No club row was updated. This usually means your UPDATE RLS policy on public.clubs is missing or blocking this user.'
      setError(message)
      showTopNotice('error', message)
      return null
    }

    syncClubState(updatedClub)
    broadcastClubUpdate(updatedClub, {
      includeLogoPath: Object.prototype.hasOwnProperty.call(normalizedPatch, 'logo_path'),
    })
    return updatedClub
  }

  async function handleApplyTeamName(): Promise<void> {
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

    // NEW: refresh base logo in background so base logo stays in sync
    if (clubId) {
      try {
        await upsertBaseTeamLogo(clubId, updatedClub.primary_color, updatedClub.secondary_color)
      } catch (baseLogoError) {
        // eslint-disable-next-line no-console
        console.warn('Unable to refresh base logo after color update', baseLogoError)
      }
    }

    showSuccess('Team colors updated.')
    showTopNotice('success', `Team colors changed to ${updatedClub.primary_color} and ${updatedClub.secondary_color}.`)
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
    if (!clubId) {
      setError('Club not found.')
      return
    }

    if (pendingLogoUrl) {
      const updatedClub = await persistClub({ logo_path: pendingLogoUrl })
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
      setError('Please upload a logo image or provide an image URL first.')
      return
    }

    try {
      setError(null)
      setSaving(true)

      // convert to PNG and store PNG in the bucket
      const pngLogoBlob = await convertFileToPngBlob(pendingLogoFile)
      const filePath = `logos/${clubId}-${Date.now()}.png`

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
    if (!clubId) {
      setError('Club not found.')
      return
    }

    try {
      const baseLogoPath = await upsertBaseTeamLogo(clubId, appliedPrimaryColor, appliedSecondaryColor)
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

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Customize Team</h2>

      {loading ? (
        <div className="rounded-lg bg-white p-6 shadow text-sm text-gray-600">Loading club settings...</div>
      ) : (
        <div className="space-y-6 w-full">
          <div className="bg-white p-4 rounded-lg shadow space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">Team name</label>
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  value={teamNameInput}
                  onChange={e => setTeamNameInput(e.target.value)}
                  maxLength={40}
                  className="w-full border border-gray-300 px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="Enter team name"
                />
                <button
                  type="button"
                  onClick={() => {
                    void handleApplyTeamName()
                  }}
                  className="h-10 px-4 rounded-md border border-slate-900 bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
                >
                  Apply Name
                </button>
              </div>
              <div className="mt-1 text-xs text-gray-500">3 to 40 characters</div>
            </div>

            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-2">Primary color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={e => setPrimaryColor(e.target.value)}
                      className="h-12 w-20 cursor-pointer rounded border border-gray-300 bg-white"
                    />
                    <input
                      value={primaryColor}
                      onChange={e => setPrimaryColor(e.target.value)}
                      className="flex-1 border border-gray-300 px-3 py-2 rounded-md font-mono"
                      maxLength={7}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-2">Secondary color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={e => setSecondaryColor(e.target.value)}
                      className="h-12 w-20 cursor-pointer rounded border border-gray-300 bg-white"
                    />
                    <input
                      value={secondaryColor}
                      onChange={e => setSecondaryColor(e.target.value)}
                      className="flex-1 border border-gray-300 px-3 py-2 rounded-md font-mono"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <button
                  type="button"
                  onClick={() => {
                    void handleApplyTeamColors()
                  }}
                  className="h-10 px-4 rounded-md border border-slate-900 bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
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

          <div className="bg-white p-4 rounded-lg shadow">
            <label className="block text-sm font-medium text-gray-800 mb-2">Team logo</label>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex-shrink-0 rounded-lg border border-gray-200 bg-white p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Current logo</div>
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

                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                    <input
                      value={logoUrlInput}
                      onChange={event => setLogoUrlInput(event.target.value)}
                      placeholder="Or insert logo image URL (https://...)"
                      className="w-full border border-gray-300 px-3 py-2 rounded-md text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleLogoUrlSelection}
                      className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50"
                    >
                      Preview URL
                    </button>
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

          <div className="bg-white p-4 rounded-lg shadow space-y-4">
            <h3 className="text-lg font-semibold">Jersey Creator</h3>
            {clubId ? (
              <KitDesigner teamId={clubId} primaryColor={appliedPrimaryColor} secondaryColor={appliedSecondaryColor} />
            ) : (
              <div className="text-sm text-gray-600">Team not loaded yet.</div>
            )}
          </div>

          {(error || success || saving) && (
            <div className="bg-white p-4 rounded-lg shadow space-y-2">
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