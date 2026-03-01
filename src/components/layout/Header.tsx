/**
 * Header.tsx
 * Top header inside the in-game layout.
 */

import React from 'react'

/**
 * HeaderProps
 * Props for Header.
 */
interface HeaderProps {
  onToggle?: () => void
  title?: string
  route?: string
}

/**
 * Header
 * Displays compact header with search placeholder and quick actions.
 */
export default function Header({ onToggle, title, route }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <button onClick={onToggle} className="text-gray-700/80 p-2 rounded-md hover:bg-gray-100">
          ☰
        </button>
        <div>
          <div className="text-sm text-gray-500">Club</div>
          <div className="text-lg font-semibold text-gray-900">{title}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center bg-gray-100 border border-gray-200 rounded-md px-3 py-2 gap-2">
          <input
            placeholder="Search riders, races, sponsors..."
            className="bg-transparent outline-none text-sm"
            aria-label="Search"
          />
        </div>
        <div className="flex items-center gap-3">
          <button className="text-gray-700 hover:text-gray-900">⚙️</button>
          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-yellow-400 to-yellow-300 flex items-center justify-center font-semibold text-black">
            M
          </div>
        </div>
      </div>
    </header>
  )
}
