/**
 * Sidebar.tsx
 * Retractable left navigation for the in-game dashboard.
 */

import React from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
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
  ClipboardCheck,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import BugReportButton from '../dashboard/BugReportButton'

interface SidebarProps {
  collapsed?: boolean
}

interface NavItem {
  to: string
  labelKey: string
  descriptionKey: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  aliases?: string[]
}

const GAME_LOGO_URL =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/5c3417dc-3924-4423-948a-745ae5902ed0.png'

const navItems: NavItem[] = [
  {
    to: '/dashboard/overview',
    labelKey: 'overview',
    descriptionKey: 'descriptions.overview',
    icon: Home,
  },
  {
    to: '/dashboard/squad',
    labelKey: 'squad',
    descriptionKey: 'descriptions.squad',
    icon: Users,
  },
  {
    to: '/dashboard/calendar',
    labelKey: 'calendar',
    descriptionKey: 'descriptions.calendar',
    icon: Calendar,
  },
  {
    to: '/dashboard/race-preparation',
    aliases: ['/dashboard/team-schedule'],
    labelKey: 'racePreparation',
    descriptionKey: 'descriptions.racePreparation',
    icon: ClipboardCheck,
  },
  {
    to: '/dashboard/team-ranking',
    labelKey: 'teamRanking',
    descriptionKey: 'descriptions.teamRanking',
    icon: BarChart2,
  },
  {
    to: '/dashboard/training',
    labelKey: 'training',
    descriptionKey: 'descriptions.training',
    icon: List,
  },
  {
    to: '/dashboard/equipment',
    labelKey: 'equipment',
    descriptionKey: 'descriptions.equipment',
    icon: Grid,
  },
  {
    to: '/dashboard/infrastructure',
    labelKey: 'infrastructure',
    descriptionKey: 'descriptions.infrastructure',
    icon: Grid,
  },
  {
    to: '/dashboard/finance',
    labelKey: 'finance',
    descriptionKey: 'descriptions.finance',
    icon: DollarSign,
  },
  {
    to: '/dashboard/transfers',
    labelKey: 'transfers',
    descriptionKey: 'descriptions.transfers',
    icon: ShoppingCart,
  },
  {
    to: '/dashboard/statistics',
    labelKey: 'statistics',
    descriptionKey: 'descriptions.statistics',
    icon: BarChart2,
  },
]

function isPathActive(pathname: string, item: NavItem): boolean {
  const paths = [item.to, ...(item.aliases ?? [])]
  return paths.some(path => pathname === path || pathname.startsWith(`${path}/`))
}

export default function Sidebar({
  collapsed = false,
}: SidebarProps): JSX.Element {
  const { t } = useTranslation('navigation')
  const navigate = useNavigate()
  const location = useLocation()

  const currentNavItem = navItems.find(item =>
    isPathActive(location.pathname, item),
  )

  const currentPageLabel = currentNavItem
    ? t(currentNavItem.labelKey)
    : location.pathname

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const linkClass = (isActive: boolean): string =>
    [
      'rounded-md transition-colors w-full',
      collapsed
        ? 'flex items-center justify-center px-2 py-3'
        : 'flex items-start gap-3 px-3 py-3',
      isActive
        ? 'bg-yellow-400/20 text-yellow-400'
        : 'text-white/90 hover:bg-white/5',
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
                  {t('subtitle')}
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className="p-4 space-y-2">
          {navItems.map(item => {
            const Icon = item.icon
            const active = isPathActive(location.pathname, item)

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={linkClass(active)}
              >
                <Icon size={18} className="mt-0.5 flex-shrink-0" />

                {!collapsed && (
                  <div className="min-w-0">
                    <div className="text-base font-semibold leading-tight">
                      {t(item.labelKey)}
                    </div>
                    <div className="text-xs text-white/55 mt-1 leading-tight">
                      {t(item.descriptionKey)}
                    </div>
                  </div>
                )}
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-auto p-4 border-t border-white/5 space-y-3">
          <button
            onClick={() => {
              void signOut()
            }}
            aria-label={t('signOut')}
            className={`w-full rounded-md font-semibold transition-colors ${
              collapsed
                ? 'flex items-center justify-center px-3 py-3 bg-yellow-400 text-black hover:bg-yellow-300'
                : 'flex items-center gap-3 px-3 py-3 bg-yellow-400 text-black hover:bg-yellow-300'
            }`}
          >
            <LogOut size={16} />
            {!collapsed && <span>{t('signOut')}</span>}
          </button>

          <BugReportButton
            collapsed={collapsed}
            currentPageLabel={currentPageLabel}
            currentPath={location.pathname}
          />

          {!collapsed && (
            <div className="text-xs text-white/60">
              ProPeloton Manager • Version 1.0.3
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
