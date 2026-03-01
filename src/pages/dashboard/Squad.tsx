/**
 * Squad.tsx
 * Squad management page template: rider list and profile cards.
 */

import React from 'react'

/**
 * SquadPage
 * Displays a roster table and rider cards. Data placeholders prepared for Supabase integration.
 */
export default function SquadPage() {
  const riders = [
    { id: 1, name: 'L. Dupont', role: 'Leader', fitness: 88 },
    { id: 2, name: 'M. Rossi', role: 'Sprinter', fitness: 82 },
    { id: 3, name: 'J. van Dijk', role: 'Climber', fitness: 79 }
  ]

  return (
    <div className="max-w-7xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Squad</h2>

      <div className="bg-white rounded-lg p-4 shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600">
              <th className="p-2">#</th>
              <th>Name</th>
              <th>Role</th>
              <th>Fitness</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {riders.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.id}</td>
                <td className="p-2">{r.name}</td>
                <td className="p-2">{r.role}</td>
                <td className="p-2">{r.fitness}%</td>
                <td className="p-2 text-right">
                  <button className="text-sm text-yellow-500 font-medium">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        {riders.map(r => (
          <div key={r.id} className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center font-bold">R</div>
              <div>
                <div className="font-semibold">{r.name}</div>
                <div className="text-sm text-gray-500">{r.role}</div>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-xs text-gray-500">Fitness</div>
              <div className="mt-1 text-lg font-bold">{r.fitness}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
