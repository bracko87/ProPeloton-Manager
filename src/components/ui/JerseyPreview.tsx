/**
 * JerseyPreview.tsx
 *
 * High‑quality SVG jersey renderer with curved sleeves/panels, shading,
 * sponsor text and shirt number support.
 *
 * Purpose:
 * - Render a stylised football jersey using SVG.
 * - Support multiple fabric patterns (solid, stripes, hoops, sash).
 * - Apply lighting/shading for a premium 3D-like look.
 * - Show sponsor text and shirt number from the provided config.
 */

import React, { useId } from 'react'

/**
 * JerseyPattern
 * Available jersey fabric patterns.
 */
export type JerseyPattern = 'solid' | 'stripes' | 'hoops' | 'sash'

/**
 * JerseyConfig
 * Configuration object describing how the jersey should look.
 */
export interface JerseyConfig {
  /** Main body color of the jersey. */
  primaryColor: string
  /** Secondary/contrast color used in patterns. */
  secondaryColor: string
  /** Sleeve fabric color. */
  sleeveColor: string
  /** Collar color. */
  collarColor: string
  /** Trim / piping color for seams and accents. */
  trimColor: string
  /** Pattern style for the torso. */
  pattern: JerseyPattern
  /** Optional sponsor text rendered on the chest. */
  sponsorText?: string
  /** Optional shirt number rendered on the front. */
  number?: string
  /** Color used for sponsor text and number. */
  numberColor: string
}

/**
 * JerseyPreviewProps
 * Props for the JerseyPreview component.
 */
export interface JerseyPreviewProps {
  /** Visual configuration of the jersey. */
  config: JerseyConfig
  /** Optional extra class names for sizing/positioning. */
  className?: string
}

/**
 * PatternLayerProps
 * Internal props for the torso pattern renderer.
 */
interface PatternLayerProps {
  /** Chosen jersey pattern. */
  pattern: JerseyPattern
  /** Primary color for the pattern. */
  primaryColor: string
  /** Secondary color for the pattern. */
  secondaryColor: string
  /** ID of the clipPath that matches the torso shape. */
  clipId: string
}

/**
 * PatternLayer
 * Renders the torso fabric pattern inside the jersey torso clip path.
 */
function PatternLayer({
  pattern,
  primaryColor,
  secondaryColor,
  clipId,
}: PatternLayerProps): JSX.Element {
  return (
    <g clipPath={`url(#${clipId})`}>
      {pattern === 'solid' && (
        <rect x="52" y="40" width="136" height="200" fill={primaryColor} />
      )}

      {pattern === 'stripes' && (
        <>
          <rect x="52" y="40" width="136" height="200" fill={primaryColor} />
          {/* Vertical contrast stripes */}
          {Array.from({ length: 6 }).map((_, index) => {
            const stripeWidth = 10
            const gap = 12
            const startX = 60 + index * (stripeWidth + gap)
            return (
              <rect
                key={index}
                x={startX}
                y="40"
                width={stripeWidth}
                height="200"
                fill={secondaryColor}
                opacity="0.96"
              />
            )
          })}
        </>
      )}

      {pattern === 'hoops' && (
        <>
          <rect x="52" y="40" width="136" height="200" fill={primaryColor} />
          {/* Horizontal hoops */}
          {Array.from({ length: 5 }).map((_, index) => {
            const stripeHeight = 18
            const gap = 18
            const startY = 52 + index * (stripeHeight + gap)
            return (
              <rect
                key={index}
                x="52"
                y={startY}
                width="136"
                height={stripeHeight}
                fill={secondaryColor}
                opacity="0.96"
              />
            )
          })}
        </>
      )}

      {pattern === 'sash' && (
        <>
          <rect x="52" y="40" width="136" height="200" fill={primaryColor} />
          {/* Diagonal sash from left shoulder to right waist */}
          <polygon
            points="40,40 104,40 160,220 96,220"
            fill={secondaryColor}
            opacity="0.98"
          />
        </>
      )}
    </g>
  )
}

/**
 * JerseyPreview
 * High‑fidelity visual preview of a team jersey using SVG.
 */
export function JerseyPreview({ config, className = '' }: JerseyPreviewProps): JSX.Element {
  const idBase = useId().replace(/:/g, '')
  const torsoClipId = `${idBase}-torso-clip`
  const fabricLightId = `${idBase}-fabric-light`
  const verticalShadeId = `${idBase}-vertical-shade`

  return (
    <svg
      viewBox="0 0 240 280"
      className={`h-auto w-48 drop-shadow-md ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Team jersey preview"
      shapeRendering="geometricPrecision"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <clipPath id={torsoClipId}>
          <path d="M70 42 L86 20 H154 L170 42 L188 64 V240 H52 V64 Z" />
        </clipPath>

        <linearGradient id={fabricLightId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.14" />
          <stop offset="16%" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="84%" stopColor="#000000" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.16" />
        </linearGradient>

        <linearGradient id={verticalShadeId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="22%" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.14" />
        </linearGradient>
      </defs>

      {/* Sleeves */}
      <path d="M70 46 L40 24 L14 58 L38 96 L52 88 L52 64 Z" fill={config.sleeveColor} />
      <path d="M170 46 L200 24 L226 58 L202 96 L188 88 L188 64 Z" fill={config.sleeveColor} />

      {/* Sleeve trim */}
      <path
        d="M22 56 L40 85 L49 80 L31 51 Z"
        fill={config.trimColor}
        opacity="0.92"
      />
      <path
        d="M218 56 L200 85 L191 80 L209 51 Z"
        fill={config.trimColor}
        opacity="0.92"
      />

      {/* Torso pattern */}
      <PatternLayer
        pattern={config.pattern}
        primaryColor={config.primaryColor}
        secondaryColor={config.secondaryColor}
        clipId={torsoClipId}
      />

      {/* Fabric lighting & side shading */}
      <g clipPath={`url(#${torsoClipId})`}>
        <rect x="52" y="20" width="136" height="220" fill={`url(#${fabricLightId})`} />
        <rect x="52" y="20" width="136" height="220" fill={`url(#${verticalShadeId})`} />

        <rect x="52" y="40" width="14" height="200" fill="#ffffff" opacity="0.07" />
        <rect x="174" y="40" width="14" height="200" fill="#000000" opacity="0.06" />
      </g>

      {/* Collar */}
      <path d="M94 22 H146 L134 42 H106 Z" fill={config.collarColor} />
      <path d="M105 24 H135 L126 36 H114 Z" fill="#111827" />

      {/* Collar trim */}
      <path
        d="M71 43 L86 21 H154 L169 43"
        fill="none"
        stroke={config.trimColor}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />

      {/* Chest trim line */}
      <path
        d="M58 76 H182"
        fill="none"
        stroke={config.trimColor}
        strokeWidth="2.5"
        strokeOpacity="0.55"
      />

      {/* Sponsor text */}
      {config.sponsorText ? (
        <text
          x="120"
          y="108"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill={config.numberColor}
          opacity="0.95"
          style={{ letterSpacing: '0.06em' }}
        >
          {config.sponsorText.toUpperCase()}
        </text>
      ) : null}

      {/* Shirt number */}
      {config.number ? (
        <text
          x="120"
          y="164"
          textAnchor="middle"
          fontSize="54"
          fontWeight="800"
          fill={config.numberColor}
          style={{ letterSpacing: '-0.03em' }}
        >
          {config.number}
        </text>
      ) : null}

      {/* Hem trim */}
      <path
        d="M66 236 H174"
        fill="none"
        stroke={config.trimColor}
        strokeWidth="2.5"
        strokeOpacity="0.45"
      />

      {/* Outer jersey outline */}
      <g
        fill="none"
        stroke="#111827"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M70 42 L86 20 H154 L170 42 L188 64 V240 H52 V64 Z" />
        <path d="M70 46 L40 24 L14 58 L38 96 L52 88 L52 64" />
        <path d="M170 46 L200 24 L226 58 L202 96 L188 88 L188 64" />
      </g>
    </svg>
  )
}

export default JerseyPreview