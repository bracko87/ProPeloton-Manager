/**
 * Statistics.tsx
 * Statistics page template with performance summaries and chart placeholders.
 */

import React from 'react'

/**
 * StatisticsPage
 * Provides ranking, performance and history blocks. Chart placeholders only.
 */
export default function StatisticsPage() {
  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Statistics</h2>

      <div className="grid grid-cols-3 gap-4 w-full">
        <div className="bg-white p-4 rounded shadow">
          <div className="font-semibold">Season Performance</div>
          <div className="mt-3 text-sm text-gray-600">
            Chart placeholder (connect to charting library or custom canvas).
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="font-semibold">Rankings</div>
          <div className="mt-3 text-sm text-gray-600">Club ranking: 12</div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="font-semibold">Club History</div>
          <div className="mt-3 text-sm text-gray-600">
            Season-by-season blocks will appear here.
          </div>
        </div>
      </div>
    </div>
  )
}