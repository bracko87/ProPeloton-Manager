/**
 * TeamBadgePreview.tsx
 * Live crest/badge preview used in Create Club page.
 */

import React from 'react'

/**
 * TeamBadgePreviewProps
 * Props for the badge preview.
 */
interface TeamBadgePreviewProps {
  name?: string
  primary?: string
  secondary?: string
  motto?: string
  logoSrc?: string | null
}

/**
 * TeamBadgePreview
 * Renders a stylized badge preview reacting to chosen colors and logo.
 */
export default function TeamBadgePreview({
  name = 'My Club',
  primary = '#FFC400',
  secondary = '#111827',
  motto = '',
  logoSrc = null
}: TeamBadgePreviewProps) {
  return (
    <div className="w-56 h-56 bg-white rounded-md shadow-lg p-4 flex flex-col items-center justify-center">
      <div
        className="w-28 h-28 rounded-full flex items-center justify-center border-4"
        style={{ background: primary, borderColor: secondary }}
      >
        {logoSrc ? (
          // Logo display: external URL should be provided; no image uploads handled here.
          // In production, logo upload must store to Supabase and return hosted URL.
          // eslint-disable-next-line jsx-a11y/img-redundant-alt
          <img src={logoSrc} alt="club logo" className="w-24 h-24 rounded-full object-cover" />
        ) : (
          <div className="text-black font-bold text-xl">{name.slice(0, 1).toUpperCase()}</div>
        )}
      </div>
      <div className="mt-3 text-sm font-semibold text-gray-800">{name}</div>
      {motto && <div className="text-xs text-gray-500 mt-1">{motto}</div>}
    </div>
  )
}
