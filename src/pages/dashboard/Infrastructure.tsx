/**
 * Infrastructure.tsx
 * Facilities overview and upgrade cards template.
 */

import React from 'react'

/**
 * InfrastructurePage
 * Shows facility cards and development progress placeholders.
 */
export default function InfrastructurePage() {
  const facilities = [
    { id: 1, name: 'Training Center', level: 2, progress: 40 },
    { id: 2, name: 'Youth Academy', level: 1, progress: 10 }
  ]

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Infrastructure</h2>

      <div className="grid grid-cols-2 gap-4 w-full">
        {facilities.map(f => (
          <div key={f.id} className="bg-white rounded-lg p-4 shadow">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{f.name}</div>
              <div className="text-sm text-gray-500">Level {f.level}</div>
            </div>
            <div className="mt-3 h-3 bg-gray-100 rounded">
              <div
                style={{ width: `${f.progress}%` }}
                className="h-3 bg-yellow-400 rounded"
              ></div>
            </div>
            <div className="text-sm text-gray-500 mt-2">
              Progress to next level: {f.progress}%
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}