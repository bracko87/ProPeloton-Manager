/**
 * Preferences.tsx
 * User settings and preferences page. Uses UI-only persistence placeholder.
 */

import React, { useState } from 'react'

/**
 * PreferencesPage
 * Basic preference toggles (notifications, dark mode).
 */
export default function PreferencesPage(): JSX.Element {
  const [notifications, setNotifications] = useState(true)
  const [darkMode, setDarkMode] = useState(false)

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Preferences</h2>

      <div className="bg-white p-4 rounded shadow max-w-2xl space-y-4">
        <label className="flex items-center justify-between">
          <span className="text-sm">Email notifications</span>
          <input type="checkbox" checked={notifications} onChange={() => setNotifications(v => !v)} />
        </label>

        <label className="flex items-center justify-between">
          <span className="text-sm">Dark mode (UI preview)</span>
          <input type="checkbox" checked={darkMode} onChange={() => setDarkMode(v => !v)} />
        </label>

        <div className="text-xs text-gray-500">Preferences are stored locally for this demo.</div>
      </div>
    </div>
  )
}