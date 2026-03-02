/**
 * CreateClub.tsx
 * Premium team creation page with live badge preview and full-bleed background image.
 *
 * Purpose:
 * - Load selectable countries from public.countries and store countryCode.
 * - Generate the selected badge preview as an SVG logo.
 * - Upload that generated logo into Supabase Storage (club-logos).
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
type CustomizationSection = 'shape' | 'pattern' | 'symbol' | 'letter'

const badgeOptions: BadgeShape[] = [
  'circle',
  'shield',
  'diamond',
  'hexagon',
  'triangle',
  'square',
  'banner',
  'crest',
  'octagon',
  'pennant'
]

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
  'quartered'
]

const symbolOptions: BadgeSymbol[] = [
  'none',
  'star',
  'bolt',
  'crown',
  'mountain',
  'wheel',
  'wing',
  'flame',
  'shield-mark',
  'sword',
  'anchor',
  'heart',
  'sun',
  'moon',
  'eagle',
  'wolf',
  'leaf',
  'cross',
  'clover',
  'gem',
  'torch'
]

const shapeLabels: Record<BadgeShape, string> = {
  circle: 'Circle',
  shield: 'Shield',
  diamond: 'Diamond',
  hexagon: 'Hexagon',
  triangle: 'Triangle',
  square: 'Square',
  banner: 'Banner',
  crest: 'Crest',
  octagon: 'Octagon',
  pennant: 'Pennant'
}

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
  quartered: 'Quartered'
}

const symbolLabels: Record<BadgeSymbol, string> = {
  none: 'None',
  star: 'Star',
  bolt: 'Bolt',
  crown: 'Crown',
  mountain: 'Mountain',
  wheel: 'Wheel',
  wing: 'Wing',
  flame: 'Flame',
  'shield-mark': 'Shield',
  sword: 'Sword',
  anchor: 'Anchor',
  heart: 'Heart',
  sun: 'Sun',
  moon: 'Moon',
  eagle: 'Eagle',
  wolf: 'Wolf',
  leaf: 'Leaf',
  cross: 'Cross',
  clover: 'Clover',
  gem: 'Gem',
  torch: 'Torch'
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
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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
function getPatternSvgMarkup(
  pattern: BadgePattern,
  primary: string,
  secondary: string
): string {
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
      return `
        <polygon points="48,64 128,158 208,64 230,84 128,200 26,84" fill="${secondary}" />
      `

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
 * getSvgSymbolMarkup
 * Returns a central symbol for the badge in SVG coordinates (0..100 viewBox).
 */
function getSvgSymbolMarkup(symbol: Exclude<BadgeSymbol, 'none'>, color: string): string {
  switch (symbol) {
    case 'star':
      return `<polygon points="50,8 62,36 92,36 68,54 78,88 50,68 22,88 32,54 8,36 38,36" fill="${color}" />`

    case 'bolt':
      return `<polygon points="58,8 22,56 46,56 38,92 78,40 54,40" fill="${color}" />`

    case 'crown':
      return `
        <polygon points="10,72 24,28 45,52 62,22 79,52 92,34 90,72" fill="${color}" />
        <rect x="10" y="72" width="80" height="13" fill="${color}" rx="3" />
      `

    case 'mountain':
      return `
        <polygon points="8,80 34,40 50,64 70,34 92,80" fill="${color}" />
        <polygon points="58,34 66,46 76,34" fill="#ffffff" opacity="0.75" />
      `

    case 'wheel':
      return `
        <circle cx="50" cy="50" r="30" fill="none" stroke="${color}" stroke-width="9" />
        <circle cx="50" cy="50" r="7" fill="${color}" />
        <line x1="50" y1="20" x2="50" y2="80" stroke="${color}" stroke-width="6" />
        <line x1="20" y1="50" x2="80" y2="50" stroke="${color}" stroke-width="6" />
        <line x1="29" y1="29" x2="71" y2="71" stroke="${color}" stroke-width="5" />
        <line x1="71" y1="29" x2="29" y2="71" stroke="${color}" stroke-width="5" />
      `

    case 'wing':
      return `<polygon points="10,58 52,24 84,36 60,48 90,54 60,66 84,74 48,78 22,70" fill="${color}" />`

    case 'flame':
      return `
        <path d="M50 8 C72 24 82 44 74 62 C68 76 58 86 50 94 C42 86 26 74 26 54 C26 34 38 20 50 8 Z" fill="${color}" />
        <path d="M50 32 C60 44 62 54 60 62 C58 69 54 74 50 79 C46 74 40 68 40 60 C40 50 44 41 50 32 Z" fill="#ffffff" opacity="0.45" />
      `

    case 'shield-mark':
      return `<path d="M50 12 L82 24 L76 62 L50 88 L24 62 L18 24 Z" fill="${color}" />`

    case 'sword':
      return `
        <polygon points="50,10 58,22 54,58 46,58 42,22" fill="${color}" />
        <rect x="36" y="58" width="28" height="8" fill="${color}" rx="2" />
        <rect x="46" y="66" width="8" height="20" fill="${color}" rx="2" />
      `

    case 'anchor':
      return `
        <circle cx="50" cy="24" r="8" fill="none" stroke="${color}" stroke-width="6" />
        <line x1="50" y1="32" x2="50" y2="74" stroke="${color}" stroke-width="8" />
        <path d="M22 56 Q22 82 50 84 Q78 82 78 56" fill="none" stroke="${color}" stroke-width="8" />
        <line x1="34" y1="68" x2="22" y2="56" stroke="${color}" stroke-width="8" />
        <line x1="66" y1="68" x2="78" y2="56" stroke="${color}" stroke-width="8" />
      `

    case 'heart':
      return `<path d="M50 86 L18 54 C10 42 16 24 32 22 C40 22 46 26 50 34 C54 26 60 22 68 22 C84 24 90 42 82 54 Z" fill="${color}" />`

    case 'sun':
      return `
        <circle cx="50" cy="50" r="16" fill="${color}" />
        <g stroke="${color}" stroke-width="7" stroke-linecap="round">
          <line x1="50" y1="12" x2="50" y2="26" />
          <line x1="50" y1="74" x2="50" y2="88" />
          <line x1="12" y1="50" x2="26" y2="50" />
          <line x1="74" y1="50" x2="88" y2="50" />
          <line x1="22" y1="22" x2="32" y2="32" />
          <line x1="68" y1="68" x2="78" y2="78" />
          <line x1="68" y1="32" x2="78" y2="22" />
          <line x1="22" y1="78" x2="32" y2="68" />
        </g>
      `

    case 'moon':
      return `<path d="M66 18 C50 22 38 36 38 52 C38 68 50 82 66 86 C46 90 24 76 20 54 C16 32 30 14 50 10 C56 9 62 11 66 18 Z" fill="${color}" />`

    case 'eagle':
      return `<path d="M10 52 L34 40 L50 54 L66 40 L90 52 L68 58 L80 72 L58 68 L50 84 L42 68 L20 72 L32 58 Z" fill="${color}" />`

    case 'wolf':
      return `<path d="M24 80 L32 30 L46 40 L54 22 L66 42 L80 34 L76 80 Z" fill="${color}" />`

    case 'leaf':
      return `<path d="M50 88 C74 70 82 46 74 22 C50 28 30 44 26 66 C24 78 36 90 50 88 Z" fill="${color}" />`

    case 'cross':
      return `
        <rect x="42" y="16" width="16" height="68" fill="${color}" rx="2" />
        <rect x="24" y="36" width="52" height="16" fill="${color}" rx="2" />
      `

    case 'clover':
      return `
        <circle cx="38" cy="38" r="14" fill="${color}" />
        <circle cx="62" cy="38" r="14" fill="${color}" />
        <circle cx="38" cy="62" r="14" fill="${color}" />
        <circle cx="62" cy="62" r="14" fill="${color}" />
        <rect x="46" y="66" width="8" height="20" fill="${color}" rx="2" />
      `

    case 'gem':
      return `<polygon points="50,10 76,28 66,76 34,76 24,28" fill="${color}" />`

    case 'torch':
      return `
        <rect x="44" y="44" width="12" height="40" fill="${color}" rx="3" />
        <path d="M50 10 C62 20 66 34 58 44 C54 48 50 52 50 52 C50 52 46 48 42 44 C34 34 38 20 50 10 Z" fill="${color}" />
      `

    default:
      return ''
  }
}

/**
 * buildBadgeSvg
 * Builds the generated team badge as SVG text so it can be uploaded to Supabase Storage.
 */
function buildBadgeSvg(
  shape: BadgeShape,
  pattern: BadgePattern,
  overlayMode: OverlayMode,
  badgeSymbol: BadgeSymbol,
  badgeLetter: string,
  primary: string,
  secondary: string
): string {
  const outerShape = getSvgShapeMarkup(shape, secondary, false)
  const innerShape = getSvgShapeMarkup(shape, primary, true)
  const patternMarkup = getPatternSvgMarkup(pattern, primary, secondary)
  const cleanLetter = badgeLetter.trim().toUpperCase().slice(0, 1)
  const safeLetter = cleanLetter ? escapeXml(cleanLetter) : ''

  let overlayMarkup = ''

  if (overlayMode === 'symbol' && badgeSymbol !== 'none') {
    overlayMarkup = `
      <g clip-path="url(#innerClip)">
        <circle cx="128" cy="128" r="54" fill="#000000" opacity="0.12" />
        <circle cx="128" cy="128" r="46" fill="#ffffff" opacity="0.12" />
        <g transform="translate(70 70) scale(1.16)">
          ${getSvgSymbolMarkup(badgeSymbol, '#ffffff')}
        </g>
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

      <rect width="256" height="256" fill="transparent" />
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
function PatternOverlay({
  pattern,
  secondary
}: {
  pattern: BadgePattern
  secondary: string
}): JSX.Element | null {
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
      return (
        <div
          className="absolute left-[-12%] top-[40%] h-[16%] w-[124%] -rotate-[18deg]"
          style={fill}
        />
      )

    case 'diagonal-split':
      return (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, transparent 0 49%, ${secondary} 49% 100%)`
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
          <div
            className="absolute left-[14%] top-[34%] h-[14%] w-[38%] -rotate-45"
            style={fill}
          />
          <div
            className="absolute right-[14%] top-[34%] h-[14%] w-[38%] rotate-45"
            style={fill}
          />
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
 * SymbolGraphic
 * Renders an inline symbol icon in the live preview.
 */
function SymbolGraphic({
  symbol
}: {
  symbol: Exclude<BadgeSymbol, 'none'>
}): JSX.Element {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: getSvgSymbolMarkup(symbol, '#ffffff') }}
    />
  )
}

/**
 * BadgePreview
 * Renders a flexible preview badge using selected shape, pattern and overlay.
 */
function BadgePreview({
  shape,
  pattern,
  overlayMode,
  symbol,
  letter,
  primary,
  secondary,
  size = 'large'
}: {
  shape: BadgeShape
  pattern: BadgePattern
  overlayMode: OverlayMode
  symbol: BadgeSymbol
  letter: string
  primary: string
  secondary: string
  size?: 'large' | 'small'
}): JSX.Element {
  const clipPath = getBadgeClipPath(shape)
  const outerSize = size === 'large' ? 'w-56 h-56' : 'w-12 h-12'
  const innerInset = size === 'large' ? 'inset-[10px]' : 'inset-[3px]'
  const overlaySize = size === 'large' ? 'w-[38%] h-[38%]' : 'w-[46%] h-[46%]'
  const letterSize = size === 'large' ? 'text-5xl' : 'text-base'
  const cleanLetter = letter.trim().toUpperCase().slice(0, 1)

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

        <PatternOverlay pattern={pattern} secondary={secondary} />

        <div className="absolute -left-[8%] top-[14%] h-[18%] w-[48%] -rotate-12 bg-white/15" />

        {overlayMode !== 'none' ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="absolute w-[40%] h-[40%] rounded-full bg-black/10" />
            <div className="absolute w-[34%] h-[34%] rounded-full bg-white/10" />

            <div className={`relative ${overlaySize} flex items-center justify-center`}>
              {overlayMode === 'symbol' && symbol !== 'none' ? (
                <SymbolGraphic symbol={symbol as Exclude<BadgeSymbol, 'none'>} />
              ) : null}

              {overlayMode === 'letter' && cleanLetter ? (
                <span
                  className={`${letterSize} font-extrabold text-white leading-none select-none`}
                >
                  {cleanLetter}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * SelectionCard
 * Collapsible customization card where only one section can remain open at a time.
 */
function SelectionCard({
  id,
  title,
  subtitle,
  isOpen,
  onToggle,
  children
}: {
  id: CustomizationSection
  title: string
  subtitle: string
  isOpen: boolean
  onToggle: (id: CustomizationSection) => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-start justify-between gap-4 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="mt-1 text-xs text-gray-500">{subtitle}</div>
        </div>

        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-gray-300 text-sm font-bold text-gray-600 px-2">
          {isOpen ? '−' : '+'}
        </span>
      </button>

      {isOpen ? <div className="mt-4">{children}</div> : null}
    </div>
  )
}

/**
 * CreateClubPage
 * Team creation form with Supabase RPC integration and generated logo persistence.
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
  const [badgeShape, setBadgeShape] = useState<BadgeShape>('shield')
  const [badgePattern, setBadgePattern] = useState<BadgePattern>('horizontal-band')
  const [badgeSymbol, setBadgeSymbol] = useState<BadgeSymbol>('none')
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('none')
  const [badgeLetter, setBadgeLetter] = useState<string>('')
  const [openSection, setOpenSection] = useState<CustomizationSection | null>(null)
  const [flagImageError, setFlagImageError] = useState(false)

  function updateField(key: keyof typeof form, value: string): void {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleSection(section: CustomizationSection): void {
    setOpenSection(prev => (prev === section ? null : section))
  }

  function selectSymbol(symbol: BadgeSymbol): void {
    setBadgeSymbol(symbol)

    if (symbol === 'none') {
      if (overlayMode === 'symbol') {
        setOverlayMode('none')
      }
      return
    }

    setOverlayMode('symbol')
  }

  function setLetterValue(value: string): void {
    const clean = value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 1)
    setBadgeLetter(clean)

    if (clean) {
      setOverlayMode('letter')
    } else if (overlayMode === 'letter') {
      setOverlayMode('none')
    }
  }

  function clearOverlay(): void {
    setOverlayMode('none')
    setBadgeSymbol('none')
    setBadgeLetter('')
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
   * Generates the selected badge, uploads it to Supabase Storage, then creates the club via RPC.
   */
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

    try {
      const svg = buildBadgeSvg(
        badgeShape,
        badgePattern,
        overlayMode,
        badgeSymbol,
        badgeLetter,
        form.primary,
        form.secondary
      )

      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })

      const safeName = slugify(form.name) || 'team'
      uploadedLogoPath = `${user.id}/${Date.now()}-${safeName}-badge.svg`

      const { error: uploadError } = await supabase.storage
        .from('club-logos')
        .upload(uploadedLogoPath, svgBlob, {
          contentType: 'image/svg+xml',
          upsert: false
        })

      if (uploadError) {
        const message =
          /bucket not found/i.test(uploadError.message ?? '')
            ? 'Storage bucket "club-logos" was not found. Please create it in Supabase Storage first.'
            : uploadError.message || 'Failed to save team badge'

        setError(message)
        return
      }

      const { error: rpcError } = await supabase.rpc('create_club', {
        p_name: form.name.trim(),
        p_country_code: form.countryCode,
        p_primary_color: form.primary,
        p_secondary_color: form.secondary,
        p_logo_path: uploadedLogoPath,
        p_motto: form.motto.trim() || null
      })

      if (rpcError) {
        if (uploadedLogoPath) {
          await supabase.storage.from('club-logos').remove([uploadedLogoPath])
        }

        setError(rpcError.message ?? 'Failed to create team')
        return
      }

      navigate('/dashboard/overview')
    } catch (err: any) {
      if (uploadedLogoPath) {
        await supabase.storage.from('club-logos').remove([uploadedLogoPath])
      }

      setError(err?.message ?? 'An unexpected error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedCountry = countries.find(c => c.code === form.countryCode) ?? null
  const flagUrl = form.countryCode
    ? `https://flagcdn.com/w40/${form.countryCode.toLowerCase()}.png`
    : ''

  const overlaySummary =
    overlayMode === 'symbol' && badgeSymbol !== 'none'
      ? `Symbol: ${symbolLabels[badgeSymbol]}`
      : overlayMode === 'letter' && badgeLetter
        ? `Letter: ${badgeLetter}`
        : 'No symbol / letter selected'

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

      <div className="relative z-10 max-w-7xl w-full bg-white rounded-xl shadow-2xl overflow-hidden p-6 lg:p-8 space-y-6">
        <div className="rounded-xl border-2 border-emerald-400 bg-white/95 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="p-8 lg:p-10 flex flex-col h-full">
              <h2 className="text-2xl font-bold text-gray-900">Create Your Team</h2>
              <p className="text-sm text-gray-600 mt-2">
                Design your team identity and enter the ProPeloton world.
              </p>

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

                    {loadingCountries ? (
                      <div className="text-xs text-gray-500 mt-1">Loading countries...</div>
                    ) : null}
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
                    <label className="text-sm font-medium text-gray-700">
                      Team Motto (optional)
                    </label>
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
                <p className="text-sm text-gray-600 mt-2">
                  Shape, interior layout, symbol and letter all update live.
                </p>

                <div className="mt-6">
                  <BadgePreview
                    shape={badgeShape}
                    pattern={badgePattern}
                    overlayMode={overlayMode}
                    symbol={badgeSymbol}
                    letter={badgeLetter}
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

                <div className="mt-2 text-xs text-gray-500">{overlaySummary}</div>

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

        <div className="rounded-xl border-2 border-red-300 bg-red-50/40 p-4 lg:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SelectionCard
              id="shape"
              title="1. Badge Shape"
              subtitle="Choose the outer shape of your badge."
              isOpen={openSection === 'shape'}
              onToggle={toggleSection}
            >
              <div className="grid grid-cols-5 gap-2">
                {badgeOptions.map(shape => (
                  <button
                    key={shape}
                    type="button"
                    onClick={() => setBadgeShape(shape)}
                    className={`rounded-lg border p-2 flex flex-col items-center justify-center transition ${
                      badgeShape === shape
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                    aria-label={`Select ${shapeLabels[shape]} shape`}
                    title={shapeLabels[shape]}
                  >
                    <BadgePreview
                      shape={shape}
                      pattern={badgePattern}
                      overlayMode={overlayMode}
                      symbol={badgeSymbol}
                      letter={badgeLetter}
                      primary={form.primary}
                      secondary={form.secondary}
                      size="small"
                    />
                  </button>
                ))}
              </div>
            </SelectionCard>

            <SelectionCard
              id="pattern"
              title="2. Interior Style"
              subtitle="Choose how the primary and secondary colors are divided."
              isOpen={openSection === 'pattern'}
              onToggle={toggleSection}
            >
              <div className="grid grid-cols-4 gap-2">
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
                      overlayMode="none"
                      symbol="none"
                      letter=""
                      primary={form.primary}
                      secondary={form.secondary}
                      size="small"
                    />
                  </button>
                ))}
              </div>
            </SelectionCard>

            <SelectionCard
              id="symbol"
              title="3. Symbol (optional)"
              subtitle="20 stronger symbol options. Selecting one overrides letter."
              isOpen={openSection === 'symbol'}
              onToggle={toggleSection}
            >
              <div className="grid grid-cols-5 gap-2">
                {symbolOptions.map(symbol => {
                  const isActive =
                    symbol === 'none'
                      ? overlayMode === 'none' ||
                        (overlayMode === 'symbol' && badgeSymbol === 'none')
                      : overlayMode === 'symbol' && badgeSymbol === symbol

                  return (
                    <button
                      key={symbol}
                      type="button"
                      onClick={() => selectSymbol(symbol)}
                      className={`rounded-lg border px-2 py-3 flex flex-col items-center justify-center gap-2 transition ${
                        isActive
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                      aria-label={`Select ${symbolLabels[symbol]} symbol`}
                    >
                      <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center">
                        {symbol === 'none' ? (
                          <span className="text-[10px] font-semibold text-white">Ø</span>
                        ) : (
                          <svg
                            viewBox="0 0 100 100"
                            className="w-6 h-6"
                            aria-hidden="true"
                            dangerouslySetInnerHTML={{
                              __html: getSvgSymbolMarkup(
                                symbol as Exclude<BadgeSymbol, 'none'>,
                                '#ffffff'
                              )
                            }}
                          />
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-gray-700 leading-none">
                        {symbolLabels[symbol]}
                      </span>
                    </button>
                  )
                })}
              </div>
            </SelectionCard>

            <SelectionCard
              id="letter"
              title="4. Letter (optional)"
              subtitle="Write one letter only. Preset letter buttons removed."
              isOpen={openSection === 'letter'}
              onToggle={toggleSection}
            >
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={badgeLetter}
                  onChange={e => setLetterValue(e.target.value)}
                  maxLength={1}
                  className="w-16 rounded-md border border-gray-300 px-3 py-2 text-center text-lg font-bold uppercase"
                  placeholder="A"
                  disabled={submitting}
                />

                <button
                  type="button"
                  onClick={clearOverlay}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Clear
                </button>

                <div className="text-xs text-gray-500">
                  Current:{' '}
                  {overlayMode === 'letter' && badgeLetter
                    ? `Letter ${badgeLetter}`
                    : 'No letter'}
                </div>
              </div>
            </SelectionCard>
          </div>
        </div>
      </div>
    </div>
  )
}