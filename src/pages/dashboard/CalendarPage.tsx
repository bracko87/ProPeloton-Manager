/**
 * CalendarPage.tsx
 * Race calendar shell with month overview and event blocks.
 *
 * Placeholder UI — integrate Supabase events for live data.
 */

import React from 'react'

/**
 * CalendarPage
 * Displays a monthly grid and event list placeholders.
 */
export default function CalendarPage() {
  const events = [
    { id: 1, title: 'Spring Classic', date: 'March 18' },
    { id: 2, title: 'Grand Tour Stage 5', date: 'March 22' }
  ]

  return (
    <div className="max-w-7xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Race Calendar</h2>

      <div className="bg-white rounded-lg p-6 shadow">
        <div className="grid grid-cols-7 gap-2 text-sm text-gray-600">
          {Array.from({ length: 30 }).map((_, idx) => (
            <div key={idx} className="p-3 border rounded-md min-h-[72px]">
              <div className="text-xs text-gray-400">Mar {idx + 1}</div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <h4 className="font-semibold">Upcoming Events</h4>
          <ul className="mt-3 space-y-2 text-sm text-gray-600">
            {events.map(ev => (
              <li key={ev.id} className="p-3 border rounded-md flex justify-between">
                <div>{ev.title}</div>
                <div className="text-gray-500">{ev.date}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
