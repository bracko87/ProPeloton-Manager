/**
 * CustomizeTeam.tsx
 * Team branding and settings page with direct persistence to public.clubs.
 *
 * NOTE:
 * - This file assumes you have a configured Supabase client export.
 * - Adjust the supabase import path if needed.
 * - This persists name, colors and logo_path directly to public.clubs.
 * - Jersey UI is included, but jersey cannot be persisted in public.clubs
 *   because the provided schema has no jersey column.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
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

type JerseyMode = 'style' | 'upload'

const MAX_FILE_SIZE = 512 * 1024 // 0.5 MB
const LOGO_BUCKET = 'club-logos'

const JERSEY_STYLES = [
  'solid',
  'vertical-stripes',
  'horizontal-hoops',
  'sash',
  'center-band',
  'split',
  'sleeve-contrast',
  'chest-stripe',
  'pinstripes',
  'quartered',
] as const

type JerseyStyle = (typeof JERSEY_STYLES)[number]

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

function validateJpgFile(file: File): string | null {
  const validTypes = ['image/jpeg', 'image/jpg']

  if (!validTypes.includes(file.type)) {
    return 'Only JPG images are allowed.'
  }

  if (file.size > MAX_FILE_SIZE) {
    return 'Image must be no larger than 0.5 MB.'
  }

  return null
}

function sanitizeTeamName(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function JerseySvg({
  style,
  primary,
  secondary,
  className = '',
}: {
  style: JerseyStyle
  primary: string
  secondary: string
  className?: string
}): JSX.Element {
  const body = '#ffffff'
  const stroke = '#0f172a'

  const pattern = (() => {
    switch (style) {
      case 'solid':
        return <path d="M30 18h68v92H30z" fill={primary} />

      case 'vertical-stripes':
        return (
          <>
            <path d="M30 18h68v92H30z" fill={primary} />
            <rect x="40" y="18" width="10" height="92" fill={secondary} />
            <rect x="59" y="18" width="10" height="92" fill={secondary} />
            <rect x="78" y="18" width="10" height="92" fill={secondary} />
          </>
        )

      case 'horizontal-hoops':
        return (
          <>
            <path d="M30 18h68v92H30z" fill={primary} />
            <rect x="30" y="34" width="68" height="12" fill={secondary} />
            <rect x="30" y="58" width="68" height="12" fill={secondary} />
            <rect x="30" y="82" width="68" height="12" fill={secondary} />
          </>
        )

      case 'sash':
        return (
          <>
            <path d="M30 18h68v92H30z" fill={primary} />
            <polygon points="25,30 45,18 103,98 83,110" fill={secondary} />
          </>
        )

      case 'center-band':
        return (
          <>
            <path d="M30 18h68v92H30z" fill={primary} />
            <rect x="53" y="18" width="22" height="92" fill={secondary} />
          </>
        )

      case 'split':
        return (
          <>
            <rect x="30" y="18" width="34" height="92" fill={primary} />
            <rect x="64" y="18" width="34" height="92" fill={secondary} />
          </>
        )

      case 'sleeve-contrast':
        return (
          <>
            <path d="M30 18h68v92H30z" fill={primary} />
            <polygon points="14,26 30,18 30,42 14,38" fill={secondary} />
            <polygon points="98,18 114,26 114,38 98,42" fill={secondary} />
          </>
        )

      case 'chest-stripe':
        return (
          <>
            <path d="M30 18h68v92H30z" fill={primary} />
            <rect x="30" y="42" width="68" height="16" fill={secondary} />
          </>
        )

      case 'pinstripes':
        return (
          <>
            <path d="M30 18h68v92H30z" fill={primary} />
            {Array.from({ length: 8 }).map((_, i) => (
              <rect
                key={i}
                x={36 + i * 8}
                y="18"
                width="2"
                height="92"
                fill={secondary}
                opacity="0.95"
              />
            ))}
          </>
        )

      case 'quartered':
        return (
          <>
            <rect x="30" y="18" width="34" height="46" fill={primary} />
            <rect x="64" y="18" width="34" height="46" fill={secondary} />
            <rect x="30" y="64" width="34" height="46" fill={secondary} />
            <rect x="64" y="64" width="34" height="46" fill={primary} />
          </>
        )

      default:
        return <path d="M30 18h68v92H30z" fill={primary} />
    }
  })()

  return (
    <svg
      viewBox="0 0 128 128"
      className={className}
      aria-hidden="true"
      role="img"
    >
      <path
        d="M40 14l9 8h30l9-8 18 10-8 18v68H30V42l-8-18 18-10z"
        fill={body}
        stroke={stroke}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {pattern}
      <path
        d="M40 14l9 8h30l9-8 18 10-8 18v68H30V42l-8-18 18-10z"
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M52 14h24v12H52z" fill={secondary} stroke={stroke} strokeWidth="2" />
    </svg>
  )
}

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
      <img
        src={logoSrc}
        alt="Club logo"
        className="h-12 w-12 rounded-full border-2 border-black object-cover bg-white"
      />
    )
  }

  return (
    <div
      className="h-12 w-12 rounded-full border-2 border-black text-white flex items-center justify-center text-sm font-bold"
      style={{
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor} 58%, ${secondaryColor} 58%, ${secondaryColor} 100%)`,
      }}
    >
      {initials}
    </div>
  )
}

export default function CustomizeTeamPage(): JSX.Element {
  const [clubId, setClubId] = useState<string | null>(null)

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

  const [jerseyMode, setJerseyMode] = useState<JerseyMode>('style')
  const [selectedJerseyStyle, setSelectedJerseyStyle] = useState<JerseyStyle>('solid')
  const [appliedJerseyStyle, setAppliedJerseyStyle] = useState<JerseyStyle>('solid')
  const [jerseyUploadPreview, setJerseyUploadPreview] = useState<string | null>(null)
  const [appliedJerseyUploadPreview, setAppliedJerseyUploadPreview] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const successTimerRef = useRef<number | null>(null)

  const resolvedLogoUrl = useMemo(() => {
    if (logoPreview) return logoPreview
    if (!logoPath) return null

    if (logoPath.startsWith('http://') || logoPath.startsWith('https://')) {
      return logoPath
    }

    const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(logoPath)
    return data.publicUrl
  }, [logoPath, logoPreview])

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

        const { data: club, error: clubError } = await supabase
          .from('clubs')
          .select('id, owner_user_id, name, country_code, primary_color, secondary_color, logo_path')
          .eq('owner_user_id', user.id)
          .single<ClubRow>()

        if (clubError) throw clubError
        if (!active || !club) return

        setClubId(club.id)

        setTeamNameInput(club.name)
        setAppliedTeamName(club.name)

        setPrimaryColor(club.primary_color)
        setSecondaryColor(club.secondary_color)
        setAppliedPrimaryColor(club.primary_color)
        setAppliedSecondaryColor(club.secondary_color)

        setLogoPath(club.logo_path)

        if (club.logo_path && (club.logo_path.startsWith('http://') || club.logo_path.startsWith('https://'))) {
          setLogoUrlInput(club.logo_path)
        }
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
    }
  }, [])

  async function persistClub(patch: PersistableClubPatch): Promise<boolean> {
    if (!clubId) return false

    setSaving(true)
    setError(null)
    setSuccess(null)

    const { error: updateError } = await supabase
      .from('clubs')
      .update(patch)
      .eq('id', clubId)

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return false
    }

    return true
  }

  async function handleApplyTeamName(): Promise<void> {
    const cleanName = sanitizeTeamName(teamNameInput)

    if (cleanName.length < 3 || cleanName.length > 40) {
      setError('Team name must be between 3 and 40 characters.')
      return
    }

    const ok = await persistClub({ name: cleanName })
    if (!ok) return

    setAppliedTeamName(cleanName)
    setTeamNameInput(cleanName)
    showSuccess('Team name updated.')
  }

  async function handleApplyTeamColors(): Promise<void> {
    if (!isValidHexColor(primaryColor) || !isValidHexColor(secondaryColor)) {
      setError('Please use valid HEX colors like #ff0000.')
      return
    }

    if (primaryColor.toLowerCase() === secondaryColor.toLowerCase()) {
      setError('Primary and secondary colors must be different.')
      return
    }

    const ok = await persistClub({
      primary_color: primaryColor,
      secondary_color: secondaryColor,
    })

    if (!ok) return

    setAppliedPrimaryColor(primaryColor)
    setAppliedSecondaryColor(secondaryColor)
    showSuccess('Team colors updated.')
  }

  async function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) return

    const validationError = validateJpgFile(file)
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
    } catch {
      setError('Please provide a valid image URL.')
    }
  }

  async function handleApplyLogo(): Promise<void> {
    if (!clubId) return

    if (pendingLogoUrl) {
      const ok = await persistClub({ logo_path: pendingLogoUrl })
      if (!ok) return

      setLogoPath(pendingLogoUrl)
      setPendingLogoUrl(null)
      setPendingLogoFile(null)
      setLogoPreview(null)
      setLogoUrlInput(pendingLogoUrl)
      showSuccess('Logo URL applied.')
      return
    }

    if (!pendingLogoFile) {
      setError('Please upload a JPG logo or provide an image URL first.')
      return
    }

    try {
      setError(null)
      setSaving(true)

      const filePath = `logos/${clubId}-${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(filePath, pendingLogoFile, {
          upsert: true,
          contentType: 'image/jpeg',
        })

      if (uploadError) throw uploadError

      const ok = await persistClub({ logo_path: filePath })
      if (!ok) return

      setLogoPath(filePath)
      setPendingLogoFile(null)
      setPendingLogoUrl(null)
      setLogoPreview(null)
      setLogoUrlInput('')
      showSuccess('Uploaded logo applied.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply uploaded logo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleJerseyUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) return

    const validationError = validateJpgFile(file)
    if (validationError) {
      setError(validationError)
      event.target.value = ''
      return
    }

    try {
      setError(null)
      const previewUrl = await fileToDataUrl(file)
      setJerseyMode('upload')
      setJerseyUploadPreview(previewUrl)
    } catch {
      setError('Failed to preview jersey image.')
    } finally {
      event.target.value = ''
    }
  }

  function handleApplyJersey(): void {
    setError(null)

    if (jerseyMode === 'upload') {
      if (!jerseyUploadPreview) {
        setError('Please upload a jersey image first.')
        return
      }

      setAppliedJerseyUploadPreview(jerseyUploadPreview)
      showSuccess('Jersey image preview applied.')
      return
    }

    setAppliedJerseyStyle(selectedJerseyStyle)
    setAppliedJerseyUploadPreview(null)
    showSuccess('Jersey style applied.')
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
                  Apply team name
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
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <label className="block text-sm font-medium text-gray-800 mb-2">Team logo</label>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex-shrink-0 rounded-lg border border-gray-200 bg-white p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
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
                      <span className="text-sm font-medium">Upload JPG logo</span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,image/jpeg"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                    </label>

                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                      JPG only. Maximum file size: 0.5 MB
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

                  <div className="flex justify-end">
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
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <h3 className="text-lg font-semibold">Jersey Creator</h3>

              <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setJerseyMode('style')}
                  className={`px-4 py-2 text-sm font-medium ${
                    jerseyMode === 'style' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'
                  }`}
                >
                  Use style
                </button>
                <button
                  type="button"
                  onClick={() => setJerseyMode('upload')}
                  className={`px-4 py-2 text-sm font-medium border-l border-gray-300 ${
                    jerseyMode === 'upload' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'
                  }`}
                >
                  Upload image
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4 items-start">
              <div>
                {jerseyMode === 'style' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {JERSEY_STYLES.map(style => (
                      <button
                        key={style}
                        type="button"
                        onClick={() => setSelectedJerseyStyle(style)}
                        className={`rounded-xl border bg-gradient-to-b from-white to-slate-50 p-3 shadow-sm transition ${
                          selectedJerseyStyle === style
                            ? 'border-slate-900 ring-2 ring-blue-200 shadow-md -translate-y-0.5'
                            : 'border-gray-300 hover:border-slate-500 hover:shadow'
                        }`}
                      >
                        <div className="rounded-lg border border-slate-100 bg-white p-2">
                          <JerseySvg
                            style={style}
                            primary={primaryColor}
                            secondary={secondaryColor}
                            className="w-full h-24"
                          />
                        </div>
                        <div className="mt-2 text-xs font-medium text-center text-gray-700 capitalize">
                          {style.replace(/-/g, ' ')}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <label className="inline-flex items-center justify-center px-4 py-2 rounded-md border border-gray-300 bg-white cursor-pointer hover:bg-gray-50">
                      <span className="text-sm font-medium">Upload JPG jersey</span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,image/jpeg"
                        className="hidden"
                        onChange={handleJerseyUpload}
                      />
                    </label>

                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 inline-block">
                      JPG only. Maximum file size: 0.5 MB
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-medium mb-3">Jersey preview</div>

                <div className="flex items-center justify-center min-h-[220px]">
                  {jerseyMode === 'upload' && jerseyUploadPreview ? (
                    <img
                      src={jerseyUploadPreview}
                      alt="Draft jersey preview"
                      className="max-h-56 rounded-md border border-gray-200 object-contain bg-white"
                    />
                  ) : appliedJerseyUploadPreview ? (
                    <img
                      src={appliedJerseyUploadPreview}
                      alt="Applied jersey"
                      className="max-h-56 rounded-md border border-gray-200 object-contain bg-white"
                    />
                  ) : (
                    <JerseySvg
                      style={jerseyMode === 'style' ? selectedJerseyStyle : appliedJerseyStyle}
                      primary={jerseyMode === 'style' ? primaryColor : appliedPrimaryColor}
                      secondary={jerseyMode === 'style' ? secondaryColor : appliedSecondaryColor}
                      className="w-44 h-44"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleApplyJersey}
                className="h-10 px-4 rounded-md border border-slate-900 bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
              >
                Apply jersey
              </button>
            </div>
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