/**
 * TaxTab.tsx
 * Placeholder tax tab. Does not perform any DB calls to avoid missing-table errors.
 */

import React from 'react'

/**
 * TaxTab
 * Static placeholder for future tax-related features.
 */
export function TaxTab(): JSX.Element {
  return (
    <div className="bg-white p-4 rounded shadow">
      <h4 className="font-semibold">Tax</h4>
      <div className="mt-2 text-sm text-gray-600">Placeholder (no DB calls yet).</div>
    </div>
  )
}
