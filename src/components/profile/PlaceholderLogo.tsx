/**
 * PlaceholderLogo.tsx
 * Generates a simple SVG placeholder logo from a name and optional colors.
 *
 * The logo is deterministic by hashing the provided key so that a same club/user
 * will get the same color pair each time. This is used when no club logo is available.
 */

import React from 'react'

/**
 * Props for PlaceholderLogo component.
 */
export interface PlaceholderLogoProps {
  /** Display name used to generate initials */
  name?: string | null
  /** Optional primary color (hex) */
  colorA?: string
  /** Optional secondary color (hex) */
  colorB?: string
  /** Size in pixels */
  size?: number
}

/**
 * Simple string hashing to pick colors deterministically.
 * @param str input string
 * @returns integer hash
 */
function hashString(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    // simple rolling hash
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/**
 * Pick two colors based on a hash.
 * @param seed numeric seed
 */
function pickColors(seed: number) {
  const palette = [
    ['#0ea5a4', '#0369a1'],
    ['#f97316', '#b45309'],
    ['#ef4444', '#9f1239'],
    ['#7c3aed', '#4c1d95'],
    ['#06b6d4', '#0e7490'],
    ['#84cc16', '#15803d'],
    ['#f59e0b', '#b45309'],
    ['#e11d48', '#be185d']
  ]
  return palette[seed % palette.length]
}

/**
 * PlaceholderLogo
 * Renders an SVG circular logo with initials and a two-tone background.
 */
export default function PlaceholderLogo({
  name,
  colorA,
  colorB,
  size = 36
}: PlaceholderLogoProps) {
  const key = name || 'club'
  const seed = hashString(key)
  const [a, b] = colorA && colorB ? [colorA, colorB] : pickColors(seed)
  const initials = (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0].toUpperCase())
    .join('')
    .slice(0, 2) || 'C'

  const fontSize = Math.max(12, Math.floor(size / 2.6))

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      role="img"
      aria-label={`Logo for ${name ?? 'club'}`}
      className="rounded-full overflow-hidden"
    >
      <defs>
        <linearGradient id={`g-${seed}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={a} />
          <stop offset="100%" stopColor={b} />
        </linearGradient>
      </defs>

      <rect width="36" height="36" rx="8" fill={`url(#g-${seed})`} />
      <text
        x="50%"
        y="54%"
        textAnchor="middle"
        fontFamily="Inter, system-ui, -apple-system, 'Segoe UI', Roboto"
        fontSize={fontSize}
        fontWeight={700}
        fill="white"
      >
        {initials}
      </text>
    </svg>
  )
}