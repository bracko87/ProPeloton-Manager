/**
 * CustomizeTeam.tsx
 * Team branding and settings page (logo, colors, identity).
 */

import React, { useState } from 'react'

/**
 * CustomizeTeamPage
 * UI for adjusting team branding. Uses client-side state as placeholder.
 */
export default function CustomizeTeamPage(): JSX.Element {
  const [teamName, setTeamName] = useState('My Club')
  const [primaryColor, setPrimaryColor] = useState('#0ea5a4')
  const [secondaryColor, setSecondaryColor] = useState('#0369a1')

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Customize Team</h2>

      <div className="bg-white p-4 rounded shadow max-w-2xl space-y-4">
        <div>
          <label className="block text-sm font-medium">Team name</label>
          <input value={teamName} onChange={e => setTeamName(e.target.value)} className="mt-1 w-full border px-3 py-2 rounded" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Primary color</label>
            <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="block text-sm font-medium">Secondary color</label>
            <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="mt-1" />
          </div>
        </div>

        <div className="text-xs text-gray-500">
          In a full implementation, uploading a logo and saving colors would persist these settings to the backend.
        </div>
      </div>
    </div>
  )
}