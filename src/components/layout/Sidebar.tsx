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
  LogOut,
  Lock
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface SidebarProps {
  collapsed?: boolean
  locked?: boolean
}

const GAME_LOGO_URL = 'https://i.ibb.co/k28T2XbC/5c3417dc-3924-4423-948a-745ae5902ed0.png'

const navItems = [
  {
    to: '/dashboard/overview',
    label: 'Overview',
    description: 'Club snapshot and updates',
    icon: Home
  },
  {
    to: '/dashboard/squad',
    label: 'Squad',
    description: 'Manage riders and roster',
    icon: Users
  },
  {
    to: '/dashboard/calendar',
    label: 'Calendar',
    description: 'Upcoming races and events',
    icon: Calendar
  },
  {
    to: '/dashboard/team-schedule',
    label: 'Team Schedule',
    description: 'Training and assignments',
    icon: List
  },
  {
    to: '/dashboard/training',
    label: 'Training',
    description: 'Rider training and sessions',
    icon: List
  },
  {
    to: '/dashboard/equipment',
    label: 'Equipment',
    description: 'Bikes, wheels and gear',
    icon: Grid
  },
  {
    to: '/dashboard/infrastructure',
    label: 'Infrastructure',
    description: 'Facilities and development',
    icon: Grid
  },
  {
    to: '/dashboard/finance',
    label: 'Finance',
    description: 'Budget, income and costs',
    icon: DollarSign
  },
  {
    to: '/dashboard/transfers',
    label: 'Transfers',
    description: 'Buy, sell and negotiate',
    icon: ShoppingCart
  },
  {
    to: '/dashboard/statistics',
    label: 'Statistics',
    description: 'Performance and analytics',
    icon: BarChart2
  }
]

/**
 * Sidebar
 * Black sidebar with yellow active state and larger menu text.
 * Supports locked mode for days when the player cannot interact.
 */
export default function Sidebar({
  collapsed = false,
  locked = false
}: SidebarProps) {
  const navigate = useNavigate()

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'rounded-md transition-colors w-full',
      collapsed
        ? 'flex items-center justify-center px-2 py-3'
        : 'flex items-start gap-3 px-3 py-3',
      locked
        ? 'pointer-events-none opacity-50 cursor-not-allowed'
        : isActive
          ? 'bg-yellow-400/20 text-yellow-400'
          : 'text-white/90 hover:bg-white/5'
    ].join(' ')

  return (
    <aside
      className={`flex-shrink-0 bg-[#0b0f14] text-white ${
        collapsed ? 'w-24' : 'w-80'
      } transition-all duration-300`}
    >
      <div className="h-full flex flex-col">
        <div className="px-4 py-6 flex items-center border-b border-white/5">
          <div
            className={`flex items-center ${
              collapsed ? 'justify-center w-full' : 'gap-3'
            }`}
          >
            <div className="h-12 w-12 rounded-md overflow-hidden bg-black flex items-center justify-center">
              <img
                src={GAME_LOGO_URL}
                alt="ProPeloton Manager"
                className="h-full w-full object-contain"
              />
            </div>

            {!collapsed && (
              <div className="min-w-0">
                <div className="text-lg font-bold text-white leading-tight">
                  ProPeloton Manager
                </div>
                <div className="text-xs text-white/60">
                  Multiplayer cycling management
                </div>
              </div>
            )}
          </div>
        </div>

        {locked && !collapsed && (
          <div className="px-4 pt-4">
            <div className="flex items-start gap-3 rounded-md border border-yellow-400/20 bg-yellow-400/10 px-3 py-3 text-yellow-300">
              <Lock size={16} className="mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight">
                  Dashboard Locked
                </div>
                <div className="text-xs text-yellow-200/80 mt-1 leading-tight">
                  You cannot make changes right now because you have already played today.
                </div>
              </div>
            </div>
          </div>
        )}

        <nav className="p-4 space-y-2">
          {navItems.map(item => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.to}
                to={locked ? '#' : item.to}
                className={linkClass}
                onClick={event => {
                  if (locked) event.preventDefault()
                }}
                aria-disabled={locked}
                tabIndex={locked ? -1 : 0}
              >
                <Icon size={18} className="mt-0.5 flex-shrink-0" />

                {!collapsed && (
                  <div className="min-w-0">
                    <div className="text-base font-semibold leading-tight">
                      {item.label}
                    </div>
                    <div className="text-xs text-white/55 mt-1 leading-tight">
                      {item.description}
                    </div>
                  </div>
                )}
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-auto p-4 border-t border-white/5 space-y-3">
          <button
            onClick={signOut}
            aria-label="Sign out"
            className={`w-full rounded-md font-semibold transition-colors ${
              collapsed
                ? 'flex items-center justify-center px-3 py-3 bg-yellow-400 text-black hover:bg-yellow-300'
                : 'flex items-center gap-3 px-3 py-3 bg-yellow-400 text-black hover:bg-yellow-300'
            }`}
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