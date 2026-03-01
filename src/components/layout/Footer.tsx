/**
 * Footer.tsx
 * Global footer showing game time and quick links.
 */

import React from 'react'
import { Link } from 'react-router'

/**
 * GameTimeProps
 * Props for game time display (placeholder).
 */
interface GameTimeProps {
  /* Reserved for dynamic time binding from Supabase */
}

/**
 * Footer
 * Displays global game-time and simple footer navigation.
 *
 * Note: Game-time should be sourced from the centralized backend (Supabase).
 */
export default function Footer(_: GameTimeProps) {
  return (
    <footer className="border-t border-gray-200 bg-white/90 py-3 px-6 flex items-center justify-between">
      <div className="text-sm text-gray-600">
        {/* Placeholder game time — should be replaced by Supabase-driven time */}
        Season 1 · March 14 · 18:00
      </div>

      <div className="flex items-center gap-4">
        <Link to="/dashboard/overview" className="text-sm text-gray-700 hover:text-gray-900">
          Dashboard
        </Link>
        <a className="text-sm text-gray-500">Support</a>
        <a className="text-sm text-gray-500">Terms</a>
      </div>
    </footer>
  )
}
