/**
 * src/components/ui/JerseyPreview.tsx
 *
 * High-quality vector jersey preview used across the app.
 *
 * Purpose:
 * - Provide a reusable SVG jersey renderer with configurable colors, patterns,
 *   collar/trim details, sponsor text and shirt number.
 * - Export lightweight types used by the KitDesigner and other consumers.
 * - Added new JerseyPreview component with high-quality vector jersey rendering:
 *   curved sleeves, torso clip-path, fabric lighting/shading gradients,
 *   trim/collar details, sponsor text, and number rendering.
 *
 * Notes:
 * - This file is self-contained and avoids external dependencies.
 */

import React, { useId } from 'react'

/**
 * JerseyPattern
 * Allowed pattern values for the jersey torso.
 */
export type JerseyPattern = 'solid' | 'stripes' | 'hoops' | 'sash'

/**
 * JerseyConfig
 * Configuration shape for the JerseyPreview component.
 */
export interface JerseyConfig {
  primaryColor: string
  secondaryColor: string
  sleeveColor: string
  collarColor: string
  trimColor: string
  pattern: JerseyPattern
  sponsorText?: string | null
  number?: string | null
  numberColor: string
}

/**
 * PatternLayer
 * Renders the selected torso pattern inside the provided torso clipPath.
 */
function PatternLayer({
  pattern,
  primaryColor,
  secondaryColor,
  clipId
}: {
  pattern: JerseyPattern
  primaryColor: string
  secondaryColor: string
  clipId: string
}) {
  return (
    <g clipPath={`url(#${clipId})`}>
      <rect x="52" y="20" width="136" height="220" fill={primaryColor} />

      {pattern === 'stripes' && (
        <>
          {[70, 96, 122, 148, 174].map((x) => (
            <rect
              key={x}
              x={x}
              y="20"
              width="14"
              height="220"
              fill={secondaryColor}
              opacity="0.95"
            />
          ))}
        </>
      )}

      {pattern === 'hoops' && (
        <>
          {[48, 84, 120, 156, 192].map((y) => (
            <rect
              key={y}
              x="52"
              y={y}
              width="136"
              height="16"
              fill={secondaryColor}
              opacity="0.95"
            />
          ))}
        </>
      )}

      {pattern === 'sash' && (
        <path
          d="M58 240 L92 240 L182 20 L148 20 Z"
          fill={secondaryColor}
          opacity="0.92"
        />
      )}
    </g>
  )
}

/**
 * JerseyPreviewProps
 * Props for the exported JerseyPreview component.
 */
export interface JerseyPreviewProps {
  config: JerseyConfig
  className?: string
}

/**
 * JerseyPreview
 * Renders a pro-looking jersey SVG using the provided JerseyConfig.
 */
export function JerseyPreview({
  config,
  className = ''
}: JerseyPreviewProps) {
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

      <path
        d="M70 46 L40 24 L14 58 L38 96 L52 88 L52 64 Z"
        fill={config.sleeveColor}
      />
      <path
        d="M170 46 L200 24 L226 58 L202 96 L188 88 L188 64 Z"
        fill={config.sleeveColor}
      />

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

      <PatternLayer
        pattern={config.pattern}
        primaryColor={config.primaryColor}
        secondaryColor={config.secondaryColor}
        clipId={torsoClipId}
      />

      <g clipPath={`url(#${torsoClipId})`}>
        <rect
          x="52"
          y="20"
          width="136"
          height="220"
          fill={`url(#${fabricLightId})`}
        />
        <rect
          x="52"
          y="20"
          width="136"
          height="220"
          fill={`url(#${verticalShadeId})`}
        />

        <rect x="52" y="40" width="14" height="200" fill="#ffffff" opacity="0.07" />
        <rect x="174" y="40" width="14" height="200" fill="#000000" opacity="0.06" />
      </g>

      <path d="M94 22 H146 L134 42 H106 Z" fill={config.collarColor} />
      <path d="M105 24 H135 L126 36 H114 Z" fill="#111827" />

      <path
        d="M71 43 L86 21 H154 L169 43"
        fill="none"
        stroke={config.trimColor}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />

      <path
        d="M58 76 H182"
        fill="none"
        stroke={config.trimColor}
        strokeWidth="2.5"
        strokeOpacity="0.55"
      />

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

      <path
        d="M66 236 H174"
        fill="none"
        stroke={config.trimColor}
        strokeWidth="2.5"
        strokeOpacity="0.45"
      />

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