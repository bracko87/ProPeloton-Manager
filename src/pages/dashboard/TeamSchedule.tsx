/**
 * TeamSchedule.tsx
 * Training schedule and preparation UI template.
 */

import React from 'react'

/**
 * TeamSchedulePage
 * Shows training blocks and recovery schedules (placeholders for backend data).
 */
export default function TeamSchedulePage() {
  const blocks = [
    { id: 1, title: 'Endurance Block', intensity: 'Medium', days: 'Mon-Fri' },
    { id: 2, title: 'Peak Sprint Prep', intensity: 'High', days: 'Mon-Wed' }
  ]

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Team Schedule</h2>

      <div className="grid grid-cols-2 gap-4 w-full">
        {blocks.map(b => (
          <div key={b.id} className="bg-white rounded-lg p-4 shadow">
            <div className="font-semibold">{b.title}</div>
            <div className="text-sm text-gray-500 mt-2">Intensity: {b.intensity}</div>
            <div className="text-sm text-gray-500 mt-1">Days: {b.days}</div>
          </div>
        ))}
      </div>
    </div>
  )
}