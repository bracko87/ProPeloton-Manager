/**
 * src/pages/dashboard/DevelopingTeam.tsx
 *
 * Developing Team page (dashboard/developing-team)
 *
 * Purpose:
 * - Placeholder page for youth/developing riders management.
 * - Keep top navigation consistent with the Squad page.
 */

import React from 'react'
import { useLocation } from 'react-router'

function TopNav() {
  const location = useLocation()
  const isActive = (path: string) => location.pathname === path

  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h2 className="mb-2 text-xl font-semibold">Developing Team</h2>
        <div className="text-sm text-gray-500">Prospects, youth academy and promotion pipeline.</div>
      </div>

      <div className="flex items-center gap-3">
        <a
          href="#/dashboard/squad"
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${isActive('/dashboard/squad') ? 'bg-yellow-400 text-black' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
        >
          First Squad
        </a>

        <a
          href="#/dashboard/developing-team"
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${isActive('/dashboard/developing-team') ? 'bg-yellow-400 text-black' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
        >
          Developing Team
        </a>

        <a
          href="#/dashboard/staff"
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${isActive('/dashboard/staff') ? 'bg-yellow-400 text-black' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
        >
          Staff
        </a>
      </div>
    </div>
  )
}

/**
 * DevelopingTeamPage
 * Placeholder content for the youth/developing riders page.
 */
export default function DevelopingTeamPage() {
  return (
    <div className="w-full">
      <TopNav />

      <div className="rounded-lg bg-white p-6 shadow">
        <div className="text-base font-semibold text-gray-800">Developing Team</div>
        <div className="mt-2 text-sm text-gray-500">This section will manage youth riders, prospects, loans and promotions.</div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-100 p-4">
            <div className="font-medium text-gray-800">Youth Academy</div>
            <div className="mt-2 text-sm text-gray-500">Create and manage academy cohorts and training plans.</div>
          </div>

          <div className="rounded-lg border border-gray-100 p-4">
            <div className="font-medium text-gray-800">Loaned Riders</div>
            <div className="mt-2 text-sm text-gray-500">Track outgoing loans and expected return dates.</div>
          </div>

          <div className="rounded-lg border border-gray-100 p-4">
            <div className="font-medium text-gray-800">Promotion Queue</div>
            <div className="mt-2 text-sm text-gray-500">Review prospects ready for promotion to the First Squad.</div>
          </div>
        </div>
      </div>
    </div>
  )
}