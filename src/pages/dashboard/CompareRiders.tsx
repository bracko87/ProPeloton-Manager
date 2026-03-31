/**
 * src/pages/dashboard/CompareRiders.tsx
 *
 * Dashboard compare page that reads rider IDs from the URL query string
 * and delegates rendering to the shared RiderComparePanel component.
 */

import React from 'react'
import { useLocation } from 'react-router'
import RiderComparePanel from '../../features/squad/components/RiderComparePanel'

/**
 * CompareRidersPage
 *
 * Reads "left" and "right" rider ids from the query string and renders the
 * shared compare UI. This keeps the page thin and avoids duplicating compare
 * logic outside the shared feature component.
 *
 * @returns JSX.Element
 */
export default function CompareRidersPage(): JSX.Element {
  const location = useLocation()
  const params = new URLSearchParams(location.search)

  const leftRiderId = params.get('left')
  const rightRiderId = params.get('right')

  if (!leftRiderId) {
    return (
      <div className="w-full rounded-lg bg-white p-6 shadow">
        Missing left rider id.
      </div>
    )
  }

  return (
    <div className="w-full rounded-lg bg-white p-6 shadow">
      <RiderComparePanel
        leftRiderId={leftRiderId}
        initialRightRiderId={rightRiderId ?? undefined}
      />
    </div>
  )
}