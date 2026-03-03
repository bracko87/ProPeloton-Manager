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
const LOGO_BUCKET = 'club-assets' // change if your bucket name is different

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
  return value.replace(/\s+/g, ' ').trimStart()
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
        return (
          <>
            <path d="M30 18h68v92H30z" fill={primary} />
          </>
        )

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
}: {
  logoSrc: string | null
  teamName: string
}): JSX.Element {
  const initials = useMemo(() => {
    const words = teamName.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return 'TC'
    return words.slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
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
    <div className="h-12 w-12 rounded-full border-2 border-black bg-slate-900 text-white flex items-center justify-center text-sm font-bold">
      {initials}
    </div>
  )
}

export default function CustomizeTeamPage(): JSX.Element {
  const [clubId, setClubId] = useState<string | null>(null)
  const [teamName, setTeamName] = useState('My Club')
  const [primaryColor, setPrimaryColor] = useState('#0ea5a4')
  const [secondaryColor, setSecondaryColor] = useState('#0369a1')
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  const [jerseyMode, setJerseyMode] = useState<JerseyMode>('style')
  const [selectedJerseyStyle, setSelectedJerseyStyle] = useState<JerseyStyle>('solid')
  const [jerseyUploadPreview, setJerseyUploadPreview] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const initialLoadDoneRef = useRef(false)

  const resolvedLogoUrl = useMemo(() => {
    if (logoPreview) return logoPreview
    if (!logoPath) return null

    const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(logoPath)
    return data.publicUrl
  }, [logoPath, logoPreview])

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
        setTeamName(club.name)
        setPrimaryColor(club.primary_color)
        setSecondaryColor(club.secondary_color)
        setLogoPath(club.logo_path)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load club.')
      } finally {
        if (active) {
          setLoading(false)
          initialLoadDoneRef.current = true
        }
      }
    }

    void loadClub()

    return () => {
      active = false
    }
  }, [])

  async function persistClub(patch: PersistableClubPatch): Promise<void> {
    if (!clubId) return

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
      return
    }

    setSuccess('Changes saved.')
    window.setTimeout(() => setSuccess(null), 1500)
  }

  useEffect(() => {
    if (!initialLoadDoneRef.current || !clubId) return

    const cleanName = sanitizeTeamName(teamName)

    if (cleanName.length < 3 || cleanName.length > 40) return
    if (!isValidHexColor(primaryColor) || !isValidHexColor(secondaryColor)) return
    if (primaryColor.toLowerCase() === secondaryColor.toLowerCase()) return

    const timeout = window.setTimeout(() => {
      void persistClub({
        name: cleanName,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
      })
    }, 500)

    return () => window.clearTimeout(timeout)
  }, [teamName, primaryColor, secondaryColor, clubId])

  async function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file || !clubId) return

    const validationError = validateJpgFile(file)
    if (validationError) {
      setError(validationError)
      event.target.value = ''
      return
    }

    try {
      setError(null)
      setSaving(true)

      const previewUrl = await fileToDataUrl(file)
      setLogoPreview(previewUrl)

      const fileExt = 'jpg'
      const filePath = `logos/${clubId}-${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(filePath, file, {
          upsert: true,
          contentType: 'image/jpeg',
        })

      if (uploadError) throw uploadError

      await persistClub({ logo_path: filePath })
      setLogoPath(filePath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload logo.')
      setLogoPreview(null)
    } finally {
      setSaving(false)
      event.target.value = ''
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

  function handleTeamNameChange(value: string): void {
    setTeamName(sanitizeTeamName(value))
  }

  function handlePrimaryColorChange(value: string): void {
    setPrimaryColor(value)
    if (value.toLowerCase() === secondaryColor.toLowerCase()) {
      setError('Primary and secondary colors must be different.')
    } else {
      setError(null)
    }
  }

  function handleSecondaryColorChange(value: string): void {
    setSecondaryColor(value)
    if (primaryColor.toLowerCase() === value.toLowerCase()) {
      setError('Primary and secondary colors must be different.')
    } else {
      setError(null)
    }
  }

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] bg-gray-100">
      {/* Header preview so logo changes are visible immediately in both top circles */}
      <div className="w-full bg-yellow-400 border-b border-gray-300 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <HeaderLogo logoSrc={resolvedLogoUrl} teamName={teamName} />
            <div>
              <div className="text-lg font-semibold">
                Team Name: <span className="font-bold">{teamName || 'My Club'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <HeaderLogo logoSrc={resolvedLogoUrl} teamName={teamName} />
          </div>
        </div>
      </div>

      <div className="px-8 py-8">
        <h2 className="text-2xl font-semibold mb-6">Customize Team</h2>

        {loading ? (
          <div className="rounded-lg bg-white p-6 shadow text-sm text-gray-600">Loading club settings...</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            {/* Main settings */}
            <div className="xl:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-2">Team name</label>
                  <input
                    value={teamName}
                    onChange={e => handleTeamNameChange(e.target.value)}
                    maxLength={40}
                    className="w-full border border-gray-300 px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-300"
                    placeholder="Enter team name"
                  />
                  <div className="mt-1 text-xs text-gray-500">3 to 40 characters</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-2">Primary color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={e => handlePrimaryColorChange(e.target.value)}
                        className="h-12 w-20 cursor-pointer rounded border border-gray-300 bg-white"
                      />
                      <input
                        value={primaryColor}
                        onChange={e => handlePrimaryColorChange(e.target.value)}
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
                        onChange={e => handleSecondaryColorChange(e.target.value)}
                        className="h-12 w-20 cursor-pointer rounded border border-gray-300 bg-white"
                      />
                      <input
                        value={secondaryColor}
                        onChange={e => handleSecondaryColorChange(e.target.value)}
                        className="flex-1 border border-gray-300 px-3 py-2 rounded-md font-mono"
                        maxLength={7}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-2">Team logo</label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-shrink-0">
                      <HeaderLogo logoSrc={resolvedLogoUrl} teamName={teamName} />
                    </div>

                    <label className="inline-flex items-center justify-center px-4 py-2 rounded-md border border-gray-300 bg-white cursor-pointer hover:bg-gray-50">
                      <span className="text-sm font-medium">Upload JPG logo</span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,image/jpeg"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                    </label>

                    <div className="text-xs text-gray-500">JPG only, max 0.5 MB</div>
                  </div>
                </div>
              </div>

              {/* Jersey creator */}
              <div className="bg-white p-6 rounded-lg shadow space-y-6">
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

                {jerseyMode === 'style' ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                      {JERSEY_STYLES.map(style => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => setSelectedJerseyStyle(style)}
                          className={`rounded-lg border p-3 transition ${
                            selectedJerseyStyle === style
                              ? 'border-slate-900 ring-2 ring-slate-200'
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          <JerseySvg
                            style={style}
                            primary={primaryColor}
                            secondary={secondaryColor}
                            className="w-full h-24"
                          />
                          <div className="mt-2 text-xs font-medium text-center text-gray-700 capitalize">
                            {style.replace(/-/g, ' ')}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <div className="text-sm font-medium mb-2">Selected jersey preview</div>
                      <JerseySvg
                        style={selectedJerseyStyle}
                        primary={primaryColor}
                        secondary={secondaryColor}
                        className="w-40 h-40"
                      />
                    </div>
                  </>
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

                    <div className="text-xs text-gray-500">JPG only, max 0.5 MB</div>

                    {jerseyUploadPreview && (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <div className="text-sm font-medium mb-2">Uploaded jersey preview</div>
                        <img
                          src={jerseyUploadPreview}
                          alt="Uploaded jersey"
                          className="max-h-72 rounded-md border border-gray-200 object-contain bg-white"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Preview / status */}
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-4">Live Preview</h3>

                <div className="rounded-xl p-5 border border-gray-200">
                  <div className="flex items-center gap-4 mb-4">
                    <HeaderLogo logoSrc={resolvedLogoUrl} teamName={teamName} />
                    <div>
                      <div className="font-semibold text-lg">{teamName || 'My Club'}</div>
                      <div className="text-xs text-gray-500">Club identity preview</div>
                    </div>
                  </div>

                  <div className="flex gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-6 w-6 rounded border border-gray-300"
                        style={{ backgroundColor: primaryColor }}
                      />
                      <span className="text-sm">{primaryColor}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-6 w-6 rounded border border-gray-300"
                        style={{ backgroundColor: secondaryColor }}
                      />
                      <span className="text-sm">{secondaryColor}</span>
                    </div>
                  </div>

                  {jerseyMode === 'style' ? (
                    <JerseySvg
                      style={selectedJerseyStyle}
                      primary={primaryColor}
                      secondary={secondaryColor}
                      className="w-36 h-36"
                    />
                  ) : jerseyUploadPreview ? (
                    <img
                      src={jerseyUploadPreview}
                      alt="Jersey preview"
                      className="max-h-56 rounded-md border border-gray-200 object-contain bg-white"
                    />
                  ) : (
                    <div className="text-sm text-gray-500">No jersey uploaded yet.</div>
                  )}
                </div>
              </div>

              {(error || success || saving) && (
                <div className="bg-white p-4 rounded-lg shadow space-y-2">
                  {saving && <div className="text-sm text-gray-600">Saving changes...</div>}
                  {success && <div className="text-sm text-green-600">{success}</div>}
                  {error && <div className="text-sm text-red-600">{error}</div>}
                </div>
              )}

              <div className="bg-white p-4 rounded-lg shadow">
                <div className="text-xs text-gray-500">
                  Name, colors and logo are saved directly to <span className="font-mono">public.clubs</span>.
                  Jersey preview is included, but your current schema needs a jersey column if you want to persist it.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}