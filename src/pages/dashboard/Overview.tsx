/**
 * Overview.tsx
 * Dashboard overview page with summary widgets and recent updates.
 */

import React from 'react'
import StatCard from '../../components/ui/StatCard'

/**
 * OverviewPage
 * High-level club summary and quick actions.
 *
 * Data placeholders are structured for Supabase wiring.
 */
export default function OverviewPage() {
  return (
    <div className="w-full">
      <div className="grid grid-cols-12 gap-6 w-full">
        <div className="col-span-8">
          <div className="bg-white rounded-lg p-6 shadow">
            <h3 className="text-lg font-semibold">Club Summary</h3>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <StatCard label="Club Rating" value="83" description="Team strength overall" />
              <StatCard label="Balance" value="€1,250,000" description="Available budget" />
              <StatCard label="Active Riders" value="24" description="Current squad size" />
            </div>

            <div className="mt-6">
              <h4 className="font-semibold">Recent Updates</h4>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                <li>Training block completed: Endurance phase</li>
                <li>New sponsor offer received</li>
                <li>Rider A recovered from minor injury</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 bg-white rounded-lg p-6 shadow">
            <h4 className="font-semibold">Squad Quick Status</h4>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <div className="p-4 border rounded text-sm">
                <div className="font-semibold">Fitness</div>
                <div className="mt-2 text-2xl">78%</div>
              </div>
              <div className="p-4 border rounded text-sm">
                <div className="font-semibold">Morale</div>
                <div className="mt-2 text-2xl">85%</div>
              </div>
              <div className="p-4 border rounded text-sm">
                <div className="font-semibold">Form</div>
                <div className="mt-2 text-2xl">+4</div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-4">
          <div className="bg-white rounded-lg p-6 shadow">
            <h4 className="font-semibold">Manager Snapshot</h4>
            <div className="mt-4 text-sm text-gray-600">
              <div><strong>Handle:</strong> <span>Manager123</span></div>
              <div className="mt-2"><strong>Club:</strong> Horizon Racing</div>
              <div className="mt-2"><strong>Season:</strong> Season 1</div>
            </div>
            <div className="mt-6">
              <button className="w-full bg-yellow-400 text-black px-4 py-2 rounded-md font-semibold">
                Quick Actions
              </button>
            </div>
          </div>

          <div className="mt-6 bg-white rounded-lg p-6 shadow">
            <h4 className="font-semibold">Finance Quick View</h4>
            <div className="mt-3 text-sm text-gray-600">
              <div className="flex justify-between"><span>Monthly Income</span><span>€240,000</span></div>
              <div className="flex justify-between mt-2"><span>Monthly Expenses</span><span>€180,000</span></div>
              <div className="flex justify-between mt-2"><span>Net</span><span className="font-bold">€60,000</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}