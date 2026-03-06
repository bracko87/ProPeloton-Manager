/**
 * CreateClub.tsx
 * Premium team creation page with live badge preview and full-bleed background image.
 *
 * Purpose:
 * - Load selectable countries from public.countries and store countryCode.
 * - Generate the selected badge preview as an SVG logo.
 * - Rasterize generated SVG into PNG for consistent transparency rendering.
 * - Upload that generated logo into Supabase Storage (club-logos) as PNG.
 * - Create the club through public.create_club(...) instead of direct frontend inserts.
 * - Do not create finance rows, membership rows, wallet rows, or other infra rows from the frontend.
 * - UI uses "team" language, while backend table still uses the existing club naming.
 *
 * NOTE: Referral insert is intentionally non-blocking:
 * try {
 *   await applyPendingReferral(...)
 * } catch (referralError) {
 *   console.warn('Unable to save referral', referralError)
 * }
 * If it fails, you will only see it in the browser console.
 *
 * UPDATE:
 * - Removed the Badge Shape, Symbol, and Letter customization sections from the Create Club flow.
 * - Users can now only change the interior pattern selection (interior layout).
 * - Consolidated the interior pattern selector into the Team Preview area (removed bottom panel).
 * - Cleaned up now-unused accordion code/state tied to the removed bottom panel.
 * - FIX: Rasterize badge SVG to PNG before upload (image/png) for consistent transparent logo rendering.
 * - DIAGNOSTICS: Logs when referral persistence is skipped due to missing referral code.
 * - SVG MARKUP: Removed explicit transparent background rect prior to PNG rasterization to improve transparency handling.
 * - BACKEND FLOW: Frontend uploads logo, then calls public.create_club(...) only.
 * - SAFETY: Keeps best-effort cleanup for failed creation flow.
 */

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { applyPendingReferral, getPendingReferralCode } from '../lib/referrals'

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
  | 'octagon'
  | 'pennant'

type BadgePattern =
  | 'solid'
  | 'horizontal-band'
  | 'double-horizontal'
  | 'vertical-split'
  | 'horizontal-split'
  | 'diagonal-sash'
  | 'diagonal-split'
  | 'stripes-vertical'
  | 'stripes-horizontal'
  | 'chevron'
  | 'center-band'
  | 'quartered'

type BadgeSymbol =
  | 'none'
  | 'star'
  | 'bolt'
  | 'crown'
  | 'mountain'
  | 'wheel'
  | 'wing'
  | 'flame'
  | 'shield-mark'
  | 'sword'
  | 'anchor'
  | 'heart'
  | 'sun'
  | 'moon'
  | 'eagle'
  | 'wolf'
  | 'leaf'
  | 'cross'
  | 'clover'
  | 'gem'
  | 'torch'

type OverlayMode = 'none' | 'symbol' | 'letter'

const patternOptions: BadgePattern[] = [
  'solid',
  'horizontal-band',
  'double-horizontal',
  'vertical-split',
  'horizontal-split',
  'diagonal-sash',
  'diagonal-split',
  'stripes-vertical',
  'stripes-horizontal',
  'chevron',
  'center-band',
  'quartered',
]

const patternLabels: Record<BadgePattern, string> = {
  solid: 'Solid',
  'horizontal-band': 'Band',
  'double-horizontal': 'Double Band',
  'vertical-split': 'Vertical Split',
  'horizontal-split': 'Horizontal Split',
  'diagonal-sash': 'Diagonal Sash',
  'diagonal-split': 'Diagonal Split',
  'stripes-vertical': 'Vertical Stripes',
  'stripes-horizontal': 'Horizontal Stripes',
  chevron: 'Chevron',
  'center-band': 'Center Stripe',
  quartered: 'Quartered',
}

/**
 * rasterizeBadgeSvgToPng
 * Converts a generated SVG string into a PNG Blob using an in-browser canvas.
 * This improves consistent transparent rendering in downstream usage (e.g. header logo).
 */
function rasterizeBadgeSvgToPng(svg: string, size = 512): Promise<Blob> {
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
        reject(new Error('Failed to render badge image.'))
        return
      }

      context.clearRect(0, 0, size, size)
      context.drawImage(image, 0, 0, size, size)

      canvas.toBlob(
        blob => {
          URL.revokeObjectURL(objectUrl)

          if (!blob) {
            reject(new Error('Failed to export badge image.'))
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
      reject(new Error('Failed to load generated badge image.'))
    }

    image.src = objectUrl
  })
}

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
    case 'octagon':
      return 'polygon(30% 4%, 70% 4%, 96% 30%, 96% 70%, 70% 96%, 30% 96%, 4% 70%, 4% 30%)'
    case 'pennant':
      return 'polygon(14% 8%, 86% 8%, 86% 58%, 66% 58%, 66% 80%, 50% 94%, 34% 80%, 34% 58%, 14% 58%)'
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
 * slugify
 * Safe text for file names.
 */
function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * escapeXml
 * Makes text safe inside generated SVG.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * getSvgShapeMarkup
 * Returns SVG markup for outer and inner badge shapes.
 */
function getSvgShapeMarkup(shape: BadgeShape, fill: string, inset = false): string {
  switch (shape) {
    case 'circle':
      return inset
        ? `<circle cx="128" cy="128" r="102" fill="${fill}" />`
        : `<circle cx="128" cy="128" r="118" fill="${fill}" />`

    case 'shield':
      return inset
        ? `<polygon points="128,24 214,56 202,150 128,226 54,150 42,56" fill="${fill}" />`
        : `<polygon points="128,10 228,44 212,156 128,244 44,156 28,44" fill="${fill}" />`

    case 'diamond':
      return inset
        ? `<polygon points="128,24 224,128 128,232 32,128" fill="${fill}" />`
        : `<polygon points="128,10 246,128 128,246 10,128" fill="${fill}" />`

    case 'hexagon':
      return inset
        ? `<polygon points="72,30 184,30 228,128 184,226 72,226 28,128" fill="${fill}" />`
        : `<polygon points="58,14 198,14 244,128 198,242 58,242 12,128" fill="${fill}" />`

    case 'triangle':
      return inset
        ? `<polygon points="128,28 222,222 34,222" fill="${fill}" />`
        : `<polygon points="128,10 246,246 10,246" fill="${fill}" />`

    case 'square':
      return inset
        ? `<rect x="28" y="28" width="200" height="200" fill="${fill}" rx="4" />`
        : `<rect x="10" y="10" width="236" height="236" fill="${fill}" rx="4" />`

    case 'banner':
      return inset
        ? `<polygon points="44,28 212,28 212,178 128,228 44,178" fill="${fill}" />`
        : `<polygon points="30,12 226,12 226,190 128,246 30,190" fill="${fill}" />`

    case 'crest':
      return inset
        ? `<polygon points="128,24 218,62 192,228 64,228 38,62" fill="${fill}" />`
        : `<polygon points="128,10 236,54 206,246 50,246 20,54" fill="${fill}" />`

    case 'octagon':
      return inset
        ? `<polygon points="82,24 174,24 232,82 232,174 174,232 82,232 24,174 24,82" fill="${fill}" />`
        : `<polygon points="72,10 184,10 246,72 246,184 184,246 72,246 10,184 10,72" fill="${fill}" />`

    case 'pennant':
      return inset
        ? `<polygon points="44,26 212,26 212,148 162,148 162,190 128,224 94,190 94,148 44,148" fill="${fill}" />`
        : `<polygon points="28,12 228,12 228,164 176,164 176,208 128,246 80,208 80,164 28,164" fill="${fill}" />`

    default:
      return `<circle cx="128" cy="128" r="118" fill="${fill}" />`
  }
}

/**
 * getPatternSvgMarkup
 * Returns SVG markup for interior color layout clipped inside the badge.
 */
function getPatternSvgMarkup(pattern: BadgePattern, _primary: string, secondary: string): string {
  switch (pattern) {
    case 'solid':
      return ''

    case 'horizontal-band':
      return `<rect x="0" y="104" width="256" height="48" fill="${secondary}" />`

    case 'double-horizontal':
      return `
        <rect x="0" y="76" width="256" height="34" fill="${secondary}" />
        <rect x="0" y="146" width="256" height="34" fill="${secondary}" />
      `

    case 'vertical-split':
      return `<rect x="128" y="0" width="128" height="256" fill="${secondary}" />`

    case 'horizontal-split':
      return `<rect x="0" y="128" width="256" height="128" fill="${secondary}" />`

    case 'diagonal-sash':
      return `<rect x="-46" y="104" width="348" height="34" fill="${secondary}" transform="rotate(-18 128 128)" />`

    case 'diagonal-split':
      return `<polygon points="256,0 256,256 0,256" fill="${secondary}" />`

    case 'stripes-vertical':
      return `
        <rect x="0" y="0" width="34" height="256" fill="${secondary}" />
        <rect x="68" y="0" width="34" height="256" fill="${secondary}" />
        <rect x="136" y="0" width="34" height="256" fill="${secondary}" />
        <rect x="204" y="0" width="34" height="256" fill="${secondary}" />
      `

    case 'stripes-horizontal':
      return `
        <rect x="0" y="0" width="256" height="34" fill="${secondary}" />
        <rect x="0" y="68" width="256" height="34" fill="${secondary}" />
        <rect x="0" y="136" width="256" height="34" fill="${secondary}" />
        <rect x="0" y="204" width="256" height="34" fill="${secondary}" />
      `

    case 'chevron':
      return `<polygon points="48,64 128,158 208,64 230,84 128,200 26,84" fill="${secondary}" />`

    case 'center-band':
      return `<rect x="92" y="0" width="72" height="256" fill="${secondary}" />`

    case 'quartered':
      return `
        <rect x="128" y="0" width="128" height="128" fill="${secondary}" />
        <rect x="0" y="128" width="128" height="128" fill="${secondary}" />
      `

    default:
      return ''
  }
}

/**
 * buildBadgeSvg
 * Builds the generated team badge as SVG text so it can be rasterized then uploaded as PNG.
 *
 * Shape/overlay are fixed in this page (no customization UI).
 *
 * NOTE: Explicit transparent background rect removed to improve transparency after rasterization.
 */
function buildBadgeSvg(
  shape: BadgeShape,
  pattern: BadgePattern,
  overlayMode: OverlayMode,
  badgeSymbol: BadgeSymbol,
  badgeLetter: string,
  primary: string,
  secondary: string,
): string {
  const outerShape = getSvgShapeMarkup(shape, secondary, false)
  const innerShape = getSvgShapeMarkup(shape, primary, true)
  const patternMarkup = getPatternSvgMarkup(pattern, primary, secondary)
  const cleanLetter = badgeLetter.trim().toUpperCase().slice(0, 1)
  const safeLetter = cleanLetter ? escapeXml(cleanLetter) : ''

  let overlayMarkup = ''

  // (Overlay is fixed to "none" in this page, but kept for compatibility.)
  if (overlayMode === 'symbol' && badgeSymbol !== 'none') {
    overlayMarkup = `
      <g clip-path="url(#innerClip)">
        <circle cx="128" cy="128" r="54" fill="#000000" opacity="0.12" />
        <circle cx="128" cy="128" r="46" fill="#ffffff" opacity="0.12" />
      </g>
    `
  }

  if (overlayMode === 'letter' && safeLetter) {
    overlayMarkup = `
      <g clip-path="url(#innerClip)">
        <circle cx="128" cy="128" r="54" fill="#000000" opacity="0.12" />
        <circle cx="128" cy="128" r="46" fill="#ffffff" opacity="0.10" />
        <text
          x="128"
          y="148"
          text-anchor="middle"
          font-size="78"
          font-family="Inter, Arial, sans-serif"
          font-weight="800"
          fill="#ffffff"
        >
          ${safeLetter}
        </text>
      </g>
    `
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <defs>
        <clipPath id="innerClip">
          ${getSvgShapeMarkup(shape, '#ffffff', true)}
        </clipPath>
      </defs>

      ${outerShape}
      ${innerShape}

      <g clip-path="url(#innerClip)">
        ${patternMarkup}
        <rect
          x="-20"
          y="38"
          width="124"
          height="42"
          fill="#ffffff"
          opacity="0.15"
          transform="rotate(-12 42 59)"
        />
      </g>

      ${overlayMarkup}
    </svg>
  `.trim()
}

/**
 * PatternOverlay
 * Renders interior pattern layers in the live preview.
 */
function PatternOverlay({ pattern, secondary }: { pattern: BadgePattern; secondary: string }): JSX.Element | null {
  const fill = { backgroundColor: secondary } as React.CSSProperties

  switch (pattern) {
    case 'solid':
      return null

    case 'horizontal-band':
      return <div className="absolute left-0 right-0 top-[42%] h-[18%]" style={fill} />

    case 'double-horizontal':
      return (
        <>
          <div className="absolute left-0 right-0 top-[28%] h-[13%]" style={fill} />
          <div className="absolute left-0 right-0 top-[60%] h-[13%]" style={fill} />
        </>
      )

    case 'vertical-split':
      return <div className="absolute top-0 bottom-0 right-0 w-1/2" style={fill} />

    case 'horizontal-split':
      return <div className="absolute left-0 right-0 bottom-0 h-1/2" style={fill} />

    case 'diagonal-sash':
      return <div className="absolute left-[-12%] top-[40%] h-[16%] w-[124%] -rotate-[18deg]" style={fill} />

    case 'diagonal-split':
      return (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, transparent 0 49%, ${secondary} 49% 100%)`,
          }}
        />
      )

    case 'stripes-vertical':
      return (
        <>
          <div className="absolute top-0 bottom-0 left-0 w-[14%]" style={fill} />
          <div className="absolute top-0 bottom-0 left-[28%] w-[14%]" style={fill} />
          <div className="absolute top-0 bottom-0 left-[56%] w-[14%]" style={fill} />
          <div className="absolute top-0 bottom-0 left-[84%] w-[14%]" style={fill} />
        </>
      )

    case 'stripes-horizontal':
      return (
        <>
          <div className="absolute left-0 right-0 top-0 h-[14%]" style={fill} />
          <div className="absolute left-0 right-0 top-[28%] h-[14%]" style={fill} />
          <div className="absolute left-0 right-0 top-[56%] h-[14%]" style={fill} />
          <div className="absolute left-0 right-0 top-[84%] h-[14%]" style={fill} />
        </>
      )

    case 'chevron':
      return (
        <>
          <div className="absolute left-[14%] top-[34%] h-[14%] w-[38%] -rotate-45" style={fill} />
          <div className="absolute right-[14%] top-[34%] h-[14%] w-[38%] rotate-45" style={fill} />
        </>
      )

    case 'center-band':
      return <div className="absolute top-0 bottom-0 left-[36%] w-[28%]" style={fill} />

    case 'quartered':
      return (
        <>
          <div className="absolute top-0 right-0 h-1/2 w-1/2" style={fill} />
          <div className="absolute bottom-0 left-0 h-1/2 w-1/2" style={fill} />
        </>
      )

    default:
      return null
  }
}

/**
 * BadgePreview
 * Renders a flexible preview badge using selected shape + pattern.
 */
function BadgePreview({
  shape,
  pattern,
  primary,
  secondary,
  size = 'large',
}: {
  shape: BadgeShape
  pattern: BadgePattern
  primary: string
  secondary: string
  size?: 'large' | 'small'
}): JSX.Element {
  const clipPath = getBadgeClipPath(shape)
  const outerSize = size === 'large' ? 'w-56 h-56' : 'w-12 h-12'
  const innerInset = size === 'large' ? 'inset-[10px]' : 'inset-[3px]'

  return (
    <div className={`relative ${outerSize}`} aria-hidden="true">
      <div className="absolute inset-0" style={{ backgroundColor: secondary, clipPath } as React.CSSProperties} />
      <div className={`absolute ${innerInset} overflow-hidden`} style={{ clipPath } as React.CSSProperties}>
        <div className="absolute inset-0" style={{ backgroundColor: primary }} />
        <PatternOverlay pattern={pattern} secondary={secondary} />
        <div className="absolute -left-[8%] top-[14%] h-[18%] w-[48%] -rotate-12 bg-white/15" />
      </div>
    </div>
  )
}

/**
 * CreateClubPage
 * Team creation form with backend RPC integration.
 */
export default function CreateClubPage(): JSX.Element {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [form, setForm] = useState({
    name: '',
    countryCode: '',
    primary: '#FFC400',
    secondary: '#111827',
    motto: '',
  })

  const [countries, setCountries] = useState<CountryOption[]>([])
  const [loadingCountries, setLoadingCountries] = useState<boolean>(true)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [flagImageError, setFlagImageError] = useState(false)

  // Only customization left: interior pattern (in Team Preview panel)
  const [badgePattern, setBadgePattern] = useState<BadgePattern>('horizontal-band')

  // Fixed badge visuals for this page
  const badgeShape: BadgeShape = 'shield'
  const overlayMode: OverlayMode = 'none'
  const badgeSymbol: BadgeSymbol = 'none'
  const badgeLetter = ''

  function updateField(key: keyof typeof form, value: string): void {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function cleanupFailedCreation(clubId: string | null, logoPath: string | null): Promise<void> {
    const cleanupTasks: Promise<unknown>[] = []

    if (clubId) {
      cleanupTasks.push(supabase.from('clubs').delete().eq('id', clubId))
    }

    if (logoPath) {
      cleanupTasks.push(supabase.storage.from('club-logos').remove([logoPath]))
    }

    if (cleanupTasks.length > 0) {
      await Promise.allSettled(cleanupTasks)
    }
  }

  useEffect(() => {
    setFlagImageError(false)
  }, [form.countryCode])

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
            countryCode: prev.countryCode || options[0].code,
          }))
        }
      }

      setLoadingCountries(false)
    })()

    return () => {
      mounted = false
    }
  }, [])

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)

    if (!form.name.trim()) {
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

    let uploadedLogoPath: string | null = null
    let createdClubId: string | null = null

    try {
      const svg = buildBadgeSvg(
        badgeShape,
        badgePattern,
        overlayMode,
        badgeSymbol,
        badgeLetter,
        form.primary,
        form.secondary,
      )

      const pngBlob = await rasterizeBadgeSvgToPng(svg)

      const safeName = slugify(form.name) || 'team'
      uploadedLogoPath = `${user.id}/${Date.now()}-${safeName}-badge.png`

      const { error: uploadError } = await supabase.storage.from('club-logos').upload(uploadedLogoPath, pngBlob, {
        contentType: 'image/png',
        upsert: false,
      })

      if (uploadError) {
        const message = /bucket not found/i.test(uploadError.message ?? '')
          ? 'Storage bucket "club-logos" was not found. Please create it in Supabase Storage first.'
          : uploadError.message || 'Failed to save team badge'

        setError(message)
        return
      }

      const { data: createdClubIdFromRpc, error: rpcError } = await supabase.rpc('create_club', {
        p_name: form.name.trim(),
        p_country_code: form.countryCode,
        p_primary_color: form.primary,
        p_secondary_color: form.secondary,
        p_logo_path: uploadedLogoPath,
        p_motto: form.motto.trim() || null,
      })

      if (rpcError || !createdClubIdFromRpc) {
        if (uploadedLogoPath) {
          await supabase.storage.from('club-logos').remove([uploadedLogoPath])
        }

        setError(rpcError?.message ?? 'Failed to create team')
        return
      }

      createdClubId = createdClubIdFromRpc as string

      // ---- Referral persistence (diagnostic logging retained) ----
      const pendingReferralCode = getPendingReferralCode()

      if (pendingReferralCode) {
        // Intentionally non-blocking: if this fails, user should still proceed.
        try {
          await applyPendingReferral({
            referralCode: pendingReferralCode,
            referredClubId: createdClubId,
          })
        } catch (referralError) {
          console.warn('Unable to save referral', referralError)
        }
      } else {
        console.info('No pending referral code found at club creation time.')
      }
      // -----------------------------------------------------------

      navigate('/dashboard/overview')
    } catch (err: any) {
      await cleanupFailedCreation(createdClubId, uploadedLogoPath)
      setError(err?.message ?? 'An unexpected error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedCountry = countries.find(c => c.code === form.countryCode) ?? null
  const flagUrl = form.countryCode ? `https://flagcdn.com/w40/${form.countryCode.toLowerCase()}.png` : ''
  const overlaySummary = 'No symbol / letter selected'

  return (
    <div className="relative isolate min-h-screen bg-[#081224] flex items-center justify-center p-6 overflow-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
        <img
          src="https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/ChatGPT%20Image%20Mar%201,%202026,%2009_47_05%20PM.png"
          alt="background"
          className="object-cover w-full h-full"
          style={
            {
              opacity: 0.92,
              WebkitMaskImage:
                'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 42%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0) 100%)',
              maskImage:
                'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 42%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0) 100%)',
            } as React.CSSProperties
          }
        />

        <div
          className="absolute inset-0"
          style={
            {
              background:
                'linear-gradient(to bottom, rgba(12,38,95,0.50) 0%, rgba(12,38,95,0.50) 38%, rgba(8,18,36,0.72) 74%, rgba(8,18,36,0.96) 100%)',
            } as React.CSSProperties
          }
        />
      </div>

      <div className="relative z-10 max-w-7xl w-full bg-white rounded-xl shadow-2xl overflow-hidden p-6 lg:p-8 space-y-6">
        <div className="rounded-xl border-2 border-emerald-400 bg-white/95 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="p-8 lg:p-10 flex flex-col h-full">
              <h2 className="text-2xl font-bold text-gray-900">Create Your Team</h2>
              <p className="text-sm text-gray-600 mt-2">Design your team identity and enter the ProPeloton world.</p>

              <form onSubmit={handleSubmit} className="mt-8 flex flex-col flex-1">
                <div className="space-y-5">
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

                    {loadingCountries ? <div className="text-xs text-gray-500 mt-1">Loading countries...</div> : null}
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
                </div>

                <div className="mt-auto pt-8">
                  {error ? (
                    <div
                      className="rounded-md px-4 py-3 text-sm font-medium bg-red-50 border border-red-200 text-red-700"
                      role="alert"
                    >
                      {error}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-4 mt-4">
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
                </div>
              </form>
            </div>

            <div className="border-t lg:border-t-0 lg:border-l border-gray-200 bg-gradient-to-b from-slate-50 to-white p-8 lg:p-10 h-full">
              <div className="flex flex-col items-center justify-start text-center">
                <h3 className="text-2xl font-bold text-gray-900">Team Preview</h3>
                <p className="text-sm text-gray-600 mt-2">Interior layout and colors update live.</p>

                <div className="mt-6">
                  <BadgePreview
                    shape={badgeShape}
                    pattern={badgePattern}
                    primary={form.primary}
                    secondary={form.secondary}
                    size="large"
                  />
                </div>

                <div className="mt-4 text-lg font-semibold text-gray-900">{form.name || 'My Team'}</div>

                <div className="mt-1 text-sm text-gray-500 flex items-center gap-2">
                  <span>{flagEmojiFromCode(form.countryCode)}</span>
                  <span>{selectedCountry?.name || 'Selected country'}</span>
                </div>

                <div className="mt-2 text-xs text-gray-500">{overlaySummary}</div>

                {/* Consolidated Interior Style selector into the Team Preview area */}
                <div className="mt-8 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 text-left">
                  <div className="text-sm font-semibold text-gray-900">Interior Style</div>
                  <div className="mt-1 text-xs text-gray-500">
                    Choose how the primary and secondary colors are divided.
                  </div>

                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {patternOptions.map(pattern => (
                      <button
                        key={pattern}
                        type="button"
                        onClick={() => setBadgePattern(pattern)}
                        className={`rounded-lg border p-2 flex flex-col items-center justify-center transition ${
                          badgePattern === pattern
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                        aria-label={`Select ${patternLabels[pattern]} pattern`}
                        title={patternLabels[pattern]}
                      >
                        <BadgePreview
                          shape={badgeShape}
                          pattern={pattern}
                          primary={form.primary}
                          secondary={form.secondary}
                          size="small"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Removed the separate lower “Interior Style” panel entirely */}
      </div>
    </div>
  )
}