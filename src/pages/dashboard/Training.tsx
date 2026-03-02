/**
 * Training.tsx
 * Rider training overview page with planned sessions and load summary.
 */

import React from 'react'

/**
 * TrainingPage
 * Displays planned training sessions and a simple workload snapshot.
 */
export default function TrainingPage(): JSX.Element {
  const sessions = [
    {
      id: 1,
      name: 'VO2 Max Intervals',
      focus: 'High intensity',
      duration: '1h 15m'
    },
    {
      id: 2,
      name: 'Endurance Ride',
      focus: 'Base mileage',
      duration: '3h 00m'
    },
    {
      id: 3,
      name: 'Recovery Spin',
      focus: 'Low intensity',
      duration: '45m'
    }
  ]

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Training</h2>

      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="bg-white p-4 rounded shadow">
          <h4 className="font-semibold">Planned Sessions</h4>
          <ul className="mt-3 text-sm text-gray-600 space-y-2">
            {sessions.map(session => (
              <li key={session.id} className="flex justify-between">
                <div>
                  <div className="font-medium">{session.name}</div>
                  <div className="text-xs text-gray-500">{session.focus}</div>
                </div>
                <div className="text-sm text-gray-700">{session.duration}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h4 className="font-semibold">Workload Snapshot</h4>
          <div className="mt-3 text-sm text-gray-600 space-y-2">
            <p>
              <span className="font-medium">This week:</span> 9h 30m planned,
              6h 10m completed.
            </p>
            <p>
              <span className="font-medium">Intensity mix:</span> 40% low, 35%
              medium, 25% high.
            </p>
            <p className="text-xs text-gray-500">
              In a full implementation, this section will visualize training
              load, freshness, and form using backend data.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
