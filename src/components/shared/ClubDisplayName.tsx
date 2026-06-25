/**
 * ClubDisplayName.tsx
 * Shared UI component for rendering club names using the central
 * clubDisplayIdentity utilities and hooks.
 *
 * Purpose:
 * - Show a club's current display name with a consistent fallback strategy.
 * - Optionally expose the historical/full name via the title attribute.
 * - Keep name-rendering logic in one place for easy reuse.
 */

import React from 'react'
import {
  getClubDisplayName,
  getClubHistoryDisplayName,
  useClubDisplayIdentity,
} from '@/lib/clubDisplayIdentity'

/**
 * ClubDisplayNameProps
 * Props for the ClubDisplayName text component.
 */
export interface ClubDisplayNameProps {
  /** Club identifier; when null/undefined, only fallbackName will be used. */
  clubId: string | null | undefined
  /** Optional fallback name when identity has not loaded or is missing. */
  fallbackName?: string | null
  /** Whether to expose the full/history name as a title tooltip. */
  showHistoryTitle?: boolean
  /** Additional class names for styling the span wrapper. */
  className?: string
}

/**
 * ClubDisplayName
 * Lightweight span component that renders the club's display name and,
 * optionally, a title tooltip with the historical/full club name.
 */
export function ClubDisplayName({
  clubId,
  fallbackName,
  showHistoryTitle = true,
  className = '',
}: ClubDisplayNameProps): JSX.Element {
  const { identity } = useClubDisplayIdentity(clubId)
  const displayName = getClubDisplayName(identity, fallbackName)
  const historyName = getClubHistoryDisplayName(identity, fallbackName)

  return (
    <span
      className={className}
      title={showHistoryTitle ? historyName ?? undefined : undefined}
    >
      {displayName}
    </span>
  )
}
