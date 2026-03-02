/**
 * Equipment.tsx
 * Equipment and bike fleet overview page with usage status.
 */

import React from 'react'

/**
 * EquipmentPage
 * Shows team equipment inventory and basic status information.
 */
export default function EquipmentPage(): JSX.Element {
  const bikes = [
    { id: 1, name: 'Aero Race Bike', usage: 'Race', status: 'Ready' },
    { id: 2, name: 'Climbing Bike', usage: 'Race / Mountain', status: 'In service' },
    { id: 3, name: 'TT Bike', usage: 'Time trial', status: 'Ready' }
  ]

  const wheels = [
    { id: 1, name: '50mm Carbon Set', condition: 'Good', count: 6 },
    { id: 2, name: '80mm Carbon Set', condition: 'Excellent', count: 4 },
    { id: 3, name: 'Alloy Training Set', condition: 'Fair', count: 10 }
  ]

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Equipment</h2>

      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="bg-white p-4 rounded shadow">
          <h4 className="font-semibold">Bike Fleet</h4>
          <ul className="mt-3 text-sm text-gray-600 space-y-2">
            {bikes.map(bike => (
              <li key={bike.id} className="flex justify-between">
                <div>
                  <div className="font-medium">{bike.name}</div>
                  <div className="text-xs text-gray-500">{bike.usage}</div>
                </div>
                <div className="text-sm text-gray-700">{bike.status}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h4 className="font-semibold">Wheel Sets</h4>
          <ul className="mt-3 text-sm text-gray-600 space-y-2">
            {wheels.map(wheel => (
              <li key={wheel.id} className="flex justify-between">
                <div>
                  <div className="font-medium">{wheel.name}</div>
                  <div className="text-xs text-gray-500">
                    Condition: {wheel.condition}
                  </div>
                </div>
                <div className="text-sm text-gray-700">x{wheel.count}</div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-500">
            In a full implementation, this section can track mileage, service
            intervals, and assignment per rider.
          </p>
        </div>
      </div>
    </div>
  )
}
