/**
 * ProPackages.tsx
 * Simple subscription / upgrade plans UI (placeholder).
 */

import React from 'react'

/**
 * ProPackagesPage
 * Shows available plans and CTA to upgrade.
 */
export default function ProPackagesPage(): JSX.Element {
  const plans = [
    { id: 'free', title: 'Free', price: '$0', features: ['Basic features'] },
    { id: 'pro', title: 'Pro', price: '$9/mo', features: ['Priority support', 'Advanced analytics'] }
  ]

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Pro Packages</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map(p => (
          <div key={p.id} className="bg-white p-4 rounded shadow">
            <div className="text-lg font-semibold">{p.title}</div>
            <div className="text-2xl font-bold mt-2">{p.price}</div>
            <ul className="mt-3 text-sm text-gray-600 space-y-2">
              {p.features.map((f, i) => (
                <li key={i}>• {f}</li>
              ))}
            </ul>
            <div className="mt-4">
              <button className="px-3 py-2 bg-yellow-400 text-black rounded font-semibold">Choose</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}