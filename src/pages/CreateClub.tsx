/**
 * CreateClub.tsx
 * Premium team creation page with live badge preview and full-bleed background image.
 *
 * Purpose:
 * - Load selectable countries from public.countries and store countryCode.
 * - Call RPC public.create_club(...) with validated form data.
 * - Do not write directly to any club-related tables.
 * - UI uses "team" language, while backend still uses the existing create_club RPC.
 */

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'

/**
 * CountryOption
 * Represents a single country option loaded from public.countries.
 */
interface CountryOption {
  code: string
  name: string
}

type BadgeShape =
  | 'circle'
  | 'shield'
  | 'diamond'
  | 'hexagon'
  | 'triangle'
  | 'square'
  | 'banner'
  | 'crest'

const badgeOptions: BadgeShape[] = [
  'circle',
  'shield',
  'diamond',
  'hexagon',
  'triangle',
  'square',
  'banner',
  'crest'
]

/**
 * getBadgeClipPath
 * Returns the CSS clip-path for each badge style.
 */
function getBadgeClipPath(shape: BadgeShape): string {
  switch (shape) {
    case 'circle':
      return 'circle(50% at 50% 50%)'
    case 'shield':
      return 'polygon(50% 4%, 88% 18%, 82% 58%, 50% 96%, 18% 58%, 12% 18%)'
    case 'diamond':
      return 'polygon(50% 4%, 96% 50%, 50% 96%, 4% 50%)'
    case 'hexagon':
      return 'polygon(25% 8%, 75% 8%, 96% 50%, 75% 92%, 25% 92%, 4% 50%)'
    case 'triangle':
      return 'polygon(50% 6%, 96% 92%, 4% 92%)'
    case 'square':
      return 'polygon(8% 8%, 92% 8%, 92% 92%, 8% 92%)'
    case 'banner':
      return 'polygon(12% 8%, 88% 8%, 88% 72%, 50% 92%, 12% 72%)'
    case 'crest':
      return 'polygon(50% 4%, 90% 22%, 76% 92%, 24% 92%, 10% 22%)'
    default:
      return 'circle(50% at 50% 50%)'
  }
}

/**
 * flagEmojiFromCode
 * Fallback if the remote flag image fails.
 */
function flagEmojiFromCode(code: string): string {
  const clean = code.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(clean)) return '🏳️'
  return clean.replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)))
}

/**
 * BadgePreview
 * Renders a simple preview badge using primary / secondary colors only.
 */
function BadgePreview({
  shape,
  primary,
  secondary,
  size = 'large'
}: {
  shape: BadgeShape
  primary: string
  secondary: string
  size?: 'large' | 'small'
}): JSX.Element {
  const clipPath = getBadgeClipPath(shape)
  const outerSize = size === 'large' ? 'w-56 h-56' : 'w-12 h-12'
  const innerInset = size === 'large' ? 'inset-[10px]' : 'inset-[3px]'

  return (
    <div className={`relative ${outerSize}`} aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: secondary, clipPath } as React.CSSProperties}
      />

      <div
        className={`absolute ${innerInset} overflow-hidden`}
        style={{ clipPath } as React.CSSProperties}
      >
        <div className="absolute inset-0" style={{ backgroundColor: primary }} />

        <div
          className="absolute left-0 right-0 top-[44%] h-[18%]"
          style={{ backgroundColor: secondary }}
        />

        <div
          className="absolute left-[12%] right-[12%] top-[48%] h-[8%]"
          style={{ backgroundColor: primary, opacity: 0.92 }}
        />

        <div className="absolute -left-[8%] top-[14%] h-[18%] w-[48%] -rotate-12 bg-white/15" />
      </div>
    </div>
  )
}

/**
 * CreateClubPage
 * Team creation form with existing Supabase RPC integration.
 */
export default function CreateClubPage(): JSX.Element {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [form, setForm] = useState({
    name: '',
    countryCode: '',
    primary: '#FFC400',
    secondary: '#111827',
    motto: ''
  })

  const [countries, setCountries] = useState<CountryOption[]>([])
  const [loadingCountries, setLoadingCountries] = useState<boolean>(true)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [badgeShape, setBadgeShape] = useState<BadgeShape>('circle')
  const [flagImageError, setFlagImageError] = useState(false)

  /**
   * updateField
   * Simple helper to update form fields.
   */
  function updateField(key: keyof typeof form, value: string): void {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  /**
   * Reset flag image fallback when country changes.
   */
  useEffect(() => {
    setFlagImageError(false)
  }, [form.countryCode])

  /**
   * loadCountries
   * Loads selectable countries from public.countries.
   */
  useEffect(() => {
    let mounted = true

    ;(async () => {
      setLoadingCountries(true)

      const { data, error: countriesError } = await supabase
        .from('countries')
        .select('code, name')
        .eq('is_selectable', true)
        .order('name', { ascending: true })

      if (!mounted) return

      if (countriesError) {
        setError('Failed to load countries')
        setCountries([])
      } else {
        const options = (data ?? []) as CountryOption[]
        setCountries(options)

        if (options.length > 0) {
          setForm(prev => ({
            ...prev,
            countryCode: prev.countryCode || options[0].code
          }))
        }
      }

      setLoadingCountries(false)
    })()

    return () => {
      mounted = false
    }
  }, [])

  /**
   * handleSubmit
   * Calls RPC create_club with proper parameters.
   * Logo upload is intentionally disabled for now.
   */
  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)

    if (!form.name) {
      setError('Team name is required')
      return
    }

    if (!form.countryCode) {
      setError('Team country is required')
      return
    }

    if (!user) {
      setError('You must be signed in to create a team.')
      return
    }

    setSubmitting(true)

    try {
      const { error: rpcError } = await supabase.rpc('create_club', {
        p_name: form.name,
        p_country_code: form.countryCode,
        p_primary_color: form.primary,
        p_secondary_color: form.secondary,
        p_logo_path: null,
        p_motto: form.motto || null
      })

      if (rpcError) {
        setError(rpcError.message ?? 'Failed to create team')
        return
      }

      navigate('/dashboard/overview')
    } catch (err: any) {
      setError(err?.message ?? 'An unexpected error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedCountry = countries.find(c => c.code === form.countryCode) ?? null
  const flagUrl = form.countryCode
    ? `https://flagcdn.com/w40/${form.countryCode.toLowerCase()}.png`
    : ''

  return (
    <div className="relative isolate min-h-screen bg-[#081224] flex items-center justify-center p-6 overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
        <img
          src="https://i.ibb.co/MHL5Mpv/Chat-GPT-Image-Mar-1-2026-09-47-05-PM.png"
          alt="background"
          className="object-cover w-full h-full"
          style={
            {
              opacity: 0.92,
              WebkitMaskImage:
                'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 42%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0) 100%)',
              maskImage:
                'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 42%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0) 100%)'
            } as React.CSSProperties
          }
        />

        <div
          className="absolute inset-0"
          style={
            {
              background:
                'linear-gradient(to bottom, rgba(12,38,95,0.50) 0%, rgba(12,38,95,0.50) 38%, rgba(8,18,36,0.72) 74%, rgba(8,18,36,0.96) 100%)'
            } as React.CSSProperties
          }
        />
      </div>

      {/* Full white box across both sides */}
      <div className="relative z-10 max-w-6xl w-full bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Left side form */}
          <div className="p-8 lg:p-10">
            <h2 className="text-2xl font-bold text-gray-900">Create Your Team</h2>
            <p className="text-sm text-gray-600 mt-2">
              Design your team identity and enter the ProPeloton world.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label className="text-sm font-medium text-gray-700">Team Name</label>
                <input
                  value={form.name}
                  onChange={e => updateField('name', e.target.value)}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  placeholder="e.g. Horizon Racing"
                  required
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Team Country</label>
                <div className="mt-1 flex items-center gap-3">
                  <div className="w-14 h-11 rounded-md border border-gray-300 bg-white overflow-hidden flex items-center justify-center shrink-0">
                    {!flagImageError && flagUrl ? (
                      <img
                        src={flagUrl}
                        alt={selectedCountry ? `${selectedCountry.name} flag` : 'Country flag'}
                        className="w-full h-full object-cover"
                        onError={() => setFlagImageError(true)}
                      />
                    ) : (
                      <span className="text-2xl">{flagEmojiFromCode(form.countryCode)}</span>
                    )}
                  </div>

                  <select
                    value={form.countryCode}
                    onChange={e => updateField('countryCode', e.target.value)}
                    className="block w-full border rounded-md px-3 py-2"
                    disabled={loadingCountries || submitting}
                  >
                    {countries.length === 0 ? (
                      <option value="">No countries available</option>
                    ) : (
                      countries.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {loadingCountries && (
                  <div className="text-xs text-gray-500 mt-1">Loading countries...</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Primary Color</label>
                  <input
                    type="color"
                    value={form.primary}
                    onChange={e => updateField('primary', e.target.value)}
                    className="mt-2 w-20 h-10 p-0 border rounded"
                    disabled={submitting}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Secondary Color</label>
                  <input
                    type="color"
                    value={form.secondary}
                    onChange={e => updateField('secondary', e.target.value)}
                    className="mt-2 w-20 h-10 p-0 border rounded"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Team Motto (optional)</label>
                <input
                  value={form.motto}
                  onChange={e => updateField('motto', e.target.value)}
                  className="mt-1 block w-full border rounded-md px-3 py-2"
                  placeholder="e.g. Ride as one"
                  disabled={submitting}
                />
              </div>

              {error && (
                <div
                  className="rounded-md px-4 py-3 text-sm font-medium bg-red-50 border border-red-200 text-red-700"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <div className="flex items-center gap-4 pt-2">
                <button
                  type="submit"
                  className="bg-yellow-400 px-6 py-2 rounded-md font-semibold disabled:opacity-70"
                  disabled={submitting}
                >
                  {submitting ? 'Creating...' : 'Create Team'}
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="px-4 py-2 rounded-md border border-gray-300"
                  disabled={submitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>

          {/* Right side preview - still inside the same white box */}
          <div className="border-t lg:border-t-0 lg:border-l border-gray-200 bg-gradient-to-b from-slate-50 to-white p-8 lg:p-10">
            <div className="flex flex-col items-center justify-start text-center">
              <h3 className="text-2xl font-bold text-gray-900">Team Preview</h3>
              <p className="text-sm text-gray-600 mt-2">
                Live preview reacts to selected colors and badge style.
              </p>

              <div className="mt-6">
                <BadgePreview
                  shape={badgeShape}
                  primary={form.primary}
                  secondary={form.secondary}
                  size="large"
                />
              </div>

              <div className="mt-4 text-lg font-semibold text-gray-900">
                {form.name || 'My Team'}
              </div>

              <div className="mt-1 text-sm text-gray-500 flex items-center gap-2">
                <span>{flagEmojiFromCode(form.countryCode)}</span>
                <span>{selectedCountry?.name || 'Selected country'}</span>
              </div>

              <div className="mt-8 w-full">
                <div className="text-sm font-semibold text-gray-900">Badge Style</div>
                <div className="mt-3 grid grid-cols-4 gap-3">
                  {badgeOptions.map(shape => (
                    <button
                      key={shape}
                      type="button"
                      onClick={() => setBadgeShape(shape)}
                      className={`rounded-lg border p-2 flex items-center justify-center transition ${
                        badgeShape === shape
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                      aria-label={`Select ${shape} badge style`}
                    >
                      <BadgePreview
                        shape={shape}
                        primary={form.primary}
                        secondary={form.secondary}
                        size="small"
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-8 w-full grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-200 p-3 bg-white">
                  <div className="text-xs font-medium text-gray-500">Primary</div>
                  <div
                    className="mt-2 h-8 rounded-md border border-black/10"
                    style={{ backgroundColor: form.primary }}
                  />
                </div>

                <div className="rounded-lg border border-gray-200 p-3 bg-white">
                  <div className="text-xs font-medium text-gray-500">Secondary</div>
                  <div
                    className="mt-2 h-8 rounded-md border border-black/10"
                    style={{ backgroundColor: form.secondary }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}