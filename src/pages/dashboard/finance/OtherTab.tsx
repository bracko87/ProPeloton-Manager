/**
 * OtherTab.tsx
 * Miscellaneous / debug information. Shows club id for debugging only.
 *
 * Note:
 * - This is the only place where the club id is displayed.
 */

import React from 'react'

/**
 * OtherTab
 * Simple debug/placeholder panel for Finance.
 */
export function OtherTab({ clubId }: { clubId: string }): JSX.Element {
  return (
    <div className="bg-white p-4 rounded shadow">
      <h4 className="font-semibold">Other</h4>
      <div className="mt-2 text-sm text-gray-600">Placeholder.</div>

      <div className="mt-4 text-xs text-gray-500">
        <div className="font-semibold">Debug</div>
        <div>
          Club ID: <span className="font-mono">{clubId}</span>
        </div>
      </div>
    </div>
  )
}
