/**
 * Transfers.tsx
 * Transfers and scouting page shell with negotiation panels.
 */

import React from 'react'

/**
 * TransfersPage
 * Placeholder UI for scouting lists and negotiation workflows.
 */
export default function TransfersPage() {
  const scouts = [
    { id: 1, name: 'A. Silva', pos: 'Climber', value: '€350k' },
    { id: 2, name: 'B. Martin', pos: 'Rouleur', value: '€220k' }
  ]

  return (
    <div className="max-w-7xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Transfers</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded shadow">
          <h4 className="font-semibold">Scouting List</h4>
          <ul className="mt-3 text-sm text-gray-600 space-y-2">
            {scouts.map(s => (
              <li key={s.id} className="flex justify-between">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-gray-500">{s.pos}</div>
                </div>
                <div className="text-sm">{s.value}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h4 className="font-semibold">Negotiations</h4>
          <div className="mt-3 text-sm text-gray-600">No active negotiations. Offers and contract flows will appear here.</div>
        </div>
      </div>
    </div>
  )
}
