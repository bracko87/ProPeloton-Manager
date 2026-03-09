/**
 * src/pages/dashboard/Staff.tsx
 *
 * Staff page (dashboard/staff)
 *
 * Purpose:
 * - Placeholder page for coaches, doctors, scouts and admin staff management.
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
        <h2 className="mb-2 text-xl font-semibold">Staff</h2>
        <div className="text-sm text-gray-500">Coaches, doctors, scouts and contracts management.</div>
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
 * StaffPage
 * Placeholder content for staff management.
 */
export default function StaffPage() {
  return (
    <div className="w-full">
      <TopNav />

      <div className="rounded-lg bg-white p-6 shadow">
        <div className="text-base font-semibold text-gray-800">Team Staff</div>
        <div className="mt-2 text-sm text-gray-500">Manage coaches, medics, scouts and administrative staff.</div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-100 p-4">
            <div className="font-medium text-gray-800">Coaches</div>
            <div className="mt-2 text-sm text-gray-500">Assign coaches and training plans.</div>
          </div>

          <div className="rounded-lg border border-gray-100 p-4">
            <div className="font-medium text-gray-800">Medical Team</div>
            <div className="mt-2 text-sm text-gray-500">Track injuries, medical checks and clearances.</div>
          </div>

          <div className="rounded-lg border border-gray-100 p-4">
            <div className="font-medium text-gray-800">Scouts & Recruitment</div>
            <div className="mt-2 text-sm text-gray-500">Manage scouting reports and transfer targets.</div>
          </div>
        </div>
      </div>
    </div>
  )
}