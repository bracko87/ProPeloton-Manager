/**
 * MyProfile.tsx
 * User profile details and editable fields (UI-only placeholder).
 */

import React, { useState } from 'react'
import { useAuth } from '../context/AuthProvider'

/**
 * MyProfilePage
 * Shows editable profile details; persist is simulated via local state.
 */
export default function MyProfilePage(): JSX.Element {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState<string>(user?.user_metadata?.full_name || '')
  const [email] = useState<string>(user?.email || '')

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">My Profile</h2>

      <div className="bg-white p-4 rounded shadow max-w-2xl">
        <label className="block mb-3">
          <div className="text-sm font-medium mb-1">Display name</div>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            className="w-full border px-3 py-2 rounded"
            placeholder="Your name"
          />
        </label>

        <div className="mb-3">
          <div className="text-sm font-medium mb-1">Email</div>
          <div className="text-sm text-gray-600">{email}</div>
        </div>

        <div className="text-xs text-gray-500 mt-2">
          This page is a UI placeholder — wire it to your backend to persist profile changes.
        </div>
      </div>
    </div>
  )
}