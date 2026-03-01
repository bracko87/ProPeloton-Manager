/**
 * Sidebar.tsx
 * Retractable left navigation for the in-game dashboard.
 */

import React from 'react'
import { NavLink, useNavigate } from 'react-router'
import {
  Home,
  Users,
  Calendar,
  List,
  Grid,
  ShoppingCart,
  BarChart2,
  DollarSign,
  LogOut
} from 'lucide-react'

/**
 * SidebarProps
 * Props for Sidebar component.
 */
interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
}

/**
 * Sidebar
 * Black sidebar with yellow active state and white text.
 */
export default function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const navigate = useNavigate()

  /**
   * signOut
   * Placeholder sign-out handler. Redirects user to the home page.
   * In future this should call Supabase auth signOut before redirecting.
   */
  const signOut = () => {
    // TODO: Integrate Supabase signOut here
    navigate('/')
  }

  const base = 'flex items-center gap-3 px-3 py-2 rounded-md transition-colors'
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `${base} ${isActive ? 'bg-yellow-400/20 text-yellow-400' : 'text-white/90 hover:bg-white/5'}`

  return (
    <aside
      className={`flex-shrink-0 bg-[#0b0f14] text-white w-72 ${collapsed ? 'w-20' : 'w-72'} transition-[width]`}
    >
      <div className="h-full flex flex-col">
        <div className="px-4 py-6 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-400 w-10 h-10 rounded-md flex items-center justify-center text-black font-bold">
              P
            </div>
            {!collapsed && <div className="text-lg font-semibold">ProPeloton</div>}
          </div>
          <button
            onClick={onToggle}
            className="text-white/70 hover:text-white p-2"
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
        </div>

        <nav className="p-4 space-y-1">
          <NavLink to="/dashboard/overview" className={linkClass}>
            <Home size={18} />
            {!collapsed && <span>Overview</span>}
          </NavLink>
          <NavLink to="/dashboard/squad" className={linkClass}>
            <Users size={18} />
            {!collapsed && <span>Squad</span>}
          </NavLink>
          <NavLink to="/dashboard/calendar" className={linkClass}>
            <Calendar size={18} />
            {!collapsed && <span>Calendar</span>}
          </NavLink>
          <NavLink to="/dashboard/team-schedule" className={linkClass}>
            <List size={18} />
            {!collapsed && <span>Team Schedule</span>}
          </NavLink>
          <NavLink to="/dashboard/infrastructure" className={linkClass}>
            <Grid size={18} />
            {!collapsed && <span>Infrastructure</span>}
          </NavLink>
          <NavLink to="/dashboard/finance" className={linkClass}>
            <DollarSign size={18} />
            {!collapsed && <span>Finance</span>}
          </NavLink>
          <NavLink to="/dashboard/transfers" className={linkClass}>
            <ShoppingCart size={18} />
            {!collapsed && <span>Transfers</span>}
          </NavLink>
          <NavLink to="/dashboard/statistics" className={linkClass}>
            <BarChart2 size={18} />
            {!collapsed && <span>Statistics</span>}
          </NavLink>
        </nav>

        <div className="mt-auto p-4 border-t border-white/5 space-y-2">
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-white/90 hover:bg-white/5 w-full text-left"
          >
            <LogOut size={16} />
            {!collapsed && <span>Sign Out</span>}
          </button>

          {!collapsed && (
            <div className="text-xs text-white/60">
              ProPeloton Manager • Premium UI
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
