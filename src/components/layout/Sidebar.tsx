/**
 * Sidebar.tsx
 * Retractable left navigation for the in-game dashboard.
 */

import React, { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  Home,
  Users,
  Calendar,
  List,
  Grid,
  Bike,
  ShoppingCart,
  BarChart2,
  LineChart,
  DollarSign,
  LogOut,
  ClipboardCheck,
  ShieldCheck,
  Activity,
  GitBranch,
  Bug,
  Star,
  Mail,
  Sparkles,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import BugReportButton from '../dashboard/BugReportButton'
import { useAppAdmin } from '../../hooks/useAppAdmin'

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
    icon: Bike,
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
    icon: LineChart,
  },
  {
    to: '/dashboard/premium-center',
    labelKey: 'premiumCenter',
    descriptionKey: 'descriptions.premiumCenter',
    icon: Sparkles,
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
  const { isAdmin } = useAppAdmin()
  const [raceOperationsProblems, setRaceOperationsProblems] = useState(0)
  const [migrationProblems, setMigrationProblems] = useState(0)
  const [unreadBugReports, setUnreadBugReports] = useState(0)
  const [pendingPlayerReviews, setPendingPlayerReviews] = useState(0)
  const [unreadContactMessages, setUnreadContactMessages] = useState(0)
  const [isPremium, setIsPremium] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true

    const loadPremiumStatus = async (): Promise<void> => {
      const { data, error } = await supabase.rpc('get_my_premium_status')

      if (!alive) return

      if (error) {
        console.warn('Could not load Premium status for sidebar:', error)
        setIsPremium(false)
        return
      }

      const rows = Array.isArray(data) ? data : data ? [data] : []
      setIsPremium(rows[0]?.is_premium === true)
    }

    void loadPremiumStatus()

    const handlePremiumStatusChanged = (): void => {
      void loadPremiumStatus()
    }

    window.addEventListener('premium-status-changed', handlePremiumStatusChanged)

    return () => {
      alive = false
      window.removeEventListener('premium-status-changed', handlePremiumStatusChanged)
    }
  }, [])

  useEffect(() => {
    let alive = true

    if (!isAdmin) {
      setRaceOperationsProblems(0)
      return () => {
        alive = false
      }
    }

    const refreshRaceOperationsProblems = async (): Promise<void> => {
      const { data, error } = await supabase.rpc(
        'get_admin_race_operations_problem_count_v1',
      )

      if (!alive) return

      if (error) {
        console.warn('Could not load Race Operations problem count:', error)
        return
      }

      setRaceOperationsProblems(Number(data ?? 0))
    }

    void refreshRaceOperationsProblems()

    // The admin problem badge does not need a permanent Realtime channel.
    // Refresh every 15 real minutes, plus explicit page/focus refreshes.
    const intervalId = window.setInterval(() => {
      void refreshRaceOperationsProblems()
    }, 15 * 60_000)

    const handleRefresh = (): void => {
      void refreshRaceOperationsProblems()
    }

    window.addEventListener('focus', handleRefresh)
    window.addEventListener(
      'admin-race-operations-count-refresh',
      handleRefresh,
    )

    return () => {
      alive = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleRefresh)
      window.removeEventListener(
        'admin-race-operations-count-refresh',
        handleRefresh,
      )
    }
  }, [isAdmin])

  useEffect(() => {
    let alive = true

    if (!isAdmin) {
      setMigrationProblems(0)
      return () => {
        alive = false
      }
    }

    const refreshMigrationProblems = async (): Promise<void> => {
      const { data, error } = await supabase.rpc(
        'get_admin_season_migration_problem_count_v1',
      )

      if (!alive) return

      if (error) {
        console.warn('Could not load Migration Process problem count:', error)
        return
      }

      setMigrationProblems(Number(data ?? 0))
    }

    void refreshMigrationProblems()

    const intervalId = window.setInterval(() => {
      void refreshMigrationProblems()
    }, 15 * 60_000)

    const handleRefresh = (): void => {
      void refreshMigrationProblems()
    }

    window.addEventListener('focus', handleRefresh)
    window.addEventListener(
      'admin-season-migration-count-refresh',
      handleRefresh,
    )

    return () => {
      alive = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleRefresh)
      window.removeEventListener(
        'admin-season-migration-count-refresh',
        handleRefresh,
      )
    }
  }, [isAdmin])

  useEffect(() => {
    let alive = true

    if (!isAdmin) {
      setUnreadBugReports(0)
      return () => {
        alive = false
      }
    }

    const refreshUnread = async (): Promise<void> => {
      const { data, error } = await supabase.rpc(
        'get_admin_bug_report_unread_count_v1',
      )

      if (!alive) return

      if (error) {
        console.warn('Could not load unread bug report count:', error)
        return
      }

      setUnreadBugReports(Number(data ?? 0))
    }

    void refreshUnread()

    const channel = supabase
      .channel('admin-bug-report-sidebar')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bug_reports',
        },
        () => {
          void refreshUnread()
        },
      )
      .subscribe()

    const intervalId = window.setInterval(() => {
      void refreshUnread()
    }, 45_000)

    const handleRefresh = (): void => {
      void refreshUnread()
    }

    window.addEventListener('focus', handleRefresh)
    window.addEventListener('admin-bug-report-count-refresh', handleRefresh)

    return () => {
      alive = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleRefresh)
      window.removeEventListener(
        'admin-bug-report-count-refresh',
        handleRefresh,
      )
      void supabase.removeChannel(channel)
    }
  }, [isAdmin])

  useEffect(() => {
    let alive = true

    if (!isAdmin) {
      setPendingPlayerReviews(0)
      return () => {
        alive = false
      }
    }

    const refreshPendingReviews = async (): Promise<void> => {
      const { data, error } = await supabase.rpc(
        'get_admin_homepage_review_pending_count_v1',
      )

      if (!alive) return

      if (error) {
        console.warn('Could not load pending player review count:', error)
        return
      }

      setPendingPlayerReviews(Number(data ?? 0))
    }

    void refreshPendingReviews()

    const channel = supabase
      .channel('admin-player-review-sidebar')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'homepage_player_reviews',
        },
        () => {
          void refreshPendingReviews()
        },
      )
      .subscribe()

    const intervalId = window.setInterval(() => {
      void refreshPendingReviews()
    }, 45_000)

    const handleRefresh = (): void => {
      void refreshPendingReviews()
    }

    window.addEventListener('focus', handleRefresh)
    window.addEventListener(
      'admin-player-review-count-refresh',
      handleRefresh,
    )

    return () => {
      alive = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleRefresh)
      window.removeEventListener(
        'admin-player-review-count-refresh',
        handleRefresh,
      )
      void supabase.removeChannel(channel)
    }
  }, [isAdmin])

  useEffect(() => {
    let alive = true

    if (!isAdmin) {
      setUnreadContactMessages(0)
      return () => {
        alive = false
      }
    }

    const refreshUnreadContactMessages = async (): Promise<void> => {
      const { data, error } = await supabase.rpc(
        'get_admin_contact_message_unread_count_v1',
      )

      if (!alive) return

      if (error) {
        console.warn('Could not load unread contact message count:', error)
        return
      }

      setUnreadContactMessages(Number(data ?? 0))
    }

    void refreshUnreadContactMessages()

    const channel = supabase
      .channel('admin-contact-message-sidebar')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_messages',
        },
        () => {
          void refreshUnreadContactMessages()
        },
      )
      .subscribe()

    const intervalId = window.setInterval(() => {
      void refreshUnreadContactMessages()
    }, 45_000)

    const handleRefresh = (): void => {
      void refreshUnreadContactMessages()
    }

    window.addEventListener('focus', handleRefresh)
    window.addEventListener(
      'admin-contact-message-count-refresh',
      handleRefresh,
    )

    return () => {
      alive = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleRefresh)
      window.removeEventListener(
        'admin-contact-message-count-refresh',
        handleRefresh,
      )
      void supabase.removeChannel(channel)
    }
  }, [isAdmin])

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
            const premiumLocked =
              item.to === '/dashboard/premium-center' && isPremium !== true

            if (premiumLocked) {
              return (
                <div
                  key={item.to}
                  aria-disabled="true"
                  className={[
                    'w-full cursor-not-allowed rounded-md text-white/35 opacity-60',
                    collapsed
                      ? 'flex items-center justify-center px-2 py-3'
                      : 'flex items-start gap-3 px-3 py-3',
                  ].join(' ')}
                >
                  <Icon size={18} className="mt-0.5 flex-shrink-0" />

                  {!collapsed && (
                    <div className="min-w-0">
                      <div className="text-base font-semibold leading-tight">
                        {t(item.labelKey)}
                      </div>
                      <div className="mt-1 text-xs leading-tight text-white/30">
                        {t(item.descriptionKey)}
                      </div>
                    </div>
                  )}
                </div>
              )
            }

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

          {isAdmin ? (
            <div className="mt-5 border-t border-white/10 pt-5">
              {!collapsed ? (
                <div className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
                  Administration
                </div>
              ) : null}

              <NavLink
                to="/dashboard/admin/analytics"
                className={linkClass(
                  location.pathname === '/dashboard/admin/analytics' ||
                    location.pathname.startsWith('/dashboard/admin/analytics/'),
                )}
              >
                <ShieldCheck
                  size={18}
                  className="mt-0.5 flex-shrink-0"
                />

                {!collapsed && (
                  <div className="min-w-0">
                    <div className="text-base font-semibold leading-tight">
                      Analytics
                    </div>
                    <div className="mt-1 text-xs leading-tight text-white/55">
                      Private website and game statistics
                    </div>
                  </div>
                )}
              </NavLink>

              <NavLink
                to="/dashboard/admin/race-operations"
                className={`${linkClass(
                  location.pathname === '/dashboard/admin/race-operations' ||
                    location.pathname.startsWith(
                      '/dashboard/admin/race-operations/',
                    ),
                )} relative`}
              >
                <div className="relative mt-0.5 flex-shrink-0">
                  <Activity size={18} />

                  {collapsed && raceOperationsProblems > 0 ? (
                    <span className="absolute -right-2 -top-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold leading-[18px] text-white shadow-sm">
                      {raceOperationsProblems > 99
                        ? '99+'
                        : raceOperationsProblems}
                    </span>
                  ) : null}
                </div>

                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-base font-semibold leading-tight">
                        Race Operations
                      </div>

                      {raceOperationsProblems > 0 ? (
                        <span className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-extrabold text-white shadow-sm">
                          {raceOperationsProblems > 99
                            ? '99+'
                            : raceOperationsProblems}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 text-xs leading-tight text-white/55">
                      Race calculation and replay monitor
                    </div>
                  </div>
                )}
              </NavLink>

              <NavLink
                to="/dashboard/admin/migration-process"
                className={`${linkClass(
                  location.pathname === '/dashboard/admin/migration-process' ||
                    location.pathname.startsWith(
                      '/dashboard/admin/migration-process/',
                    ),
                )} relative`}
              >
                <div className="relative mt-0.5 flex-shrink-0">
                  <GitBranch size={18} />

                  {collapsed && migrationProblems > 0 ? (
                    <span className="absolute -right-2 -top-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold leading-[18px] text-white shadow-sm">
                      {migrationProblems > 99 ? '99+' : migrationProblems}
                    </span>
                  ) : null}
                </div>

                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-base font-semibold leading-tight">
                        Migration Process
                      </div>

                      {migrationProblems > 0 ? (
                        <span className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-extrabold text-white shadow-sm">
                          {migrationProblems > 99 ? '99+' : migrationProblems}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 text-xs leading-tight text-white/55">
                      Season rollover checklist and health
                    </div>
                  </div>
                )}
              </NavLink>

              <NavLink
                to="/dashboard/admin/bug-reports"
                className={`${linkClass(
                  location.pathname === '/dashboard/admin/bug-reports' ||
                    location.pathname.startsWith(
                      '/dashboard/admin/bug-reports/',
                    ),
                )} relative`}
              >
                <div className="relative mt-0.5 flex-shrink-0">
                  <Bug size={18} />

                  {collapsed && unreadBugReports > 0 ? (
                    <span className="absolute -right-2 -top-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold leading-[18px] text-white shadow-sm">
                      {unreadBugReports > 99 ? '99+' : unreadBugReports}
                    </span>
                  ) : null}
                </div>

                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-base font-semibold leading-tight">
                        Bug Reports
                      </div>

                      {unreadBugReports > 0 ? (
                        <span className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-extrabold text-white shadow-sm">
                          {unreadBugReports > 99 ? '99+' : unreadBugReports}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 text-xs leading-tight text-white/55">
                      Player bug reports and issue tracking
                    </div>
                  </div>
                )}
              </NavLink>

              <NavLink
                to="/dashboard/admin/player-reviews"
                className={`${linkClass(
                  location.pathname === '/dashboard/admin/player-reviews' ||
                    location.pathname.startsWith(
                      '/dashboard/admin/player-reviews/',
                    ),
                )} relative`}
              >
                <div className="relative mt-0.5 flex-shrink-0">
                  <Star size={18} />

                  {collapsed && pendingPlayerReviews > 0 ? (
                    <span className="absolute -right-2 -top-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold leading-[18px] text-white shadow-sm">
                      {pendingPlayerReviews > 99 ? '99+' : pendingPlayerReviews}
                    </span>
                  ) : null}
                </div>

                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-base font-semibold leading-tight">
                        Player Reviews
                      </div>

                      {pendingPlayerReviews > 0 ? (
                        <span className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-extrabold text-white shadow-sm">
                          {pendingPlayerReviews > 99
                            ? '99+'
                            : pendingPlayerReviews}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 text-xs leading-tight text-white/55">
                      Approve reviews for the homepage
                    </div>
                  </div>
                )}
              </NavLink>

              <NavLink
                to="/dashboard/admin/contact-messages"
                className={`${linkClass(
                  location.pathname === '/dashboard/admin/contact-messages' ||
                    location.pathname.startsWith(
                      '/dashboard/admin/contact-messages/',
                    ),
                )} relative`}
              >
                <div className="relative mt-0.5 flex-shrink-0">
                  <Mail size={18} />

                  {collapsed && unreadContactMessages > 0 ? (
                    <span className="absolute -right-2 -top-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold leading-[18px] text-white shadow-sm">
                      {unreadContactMessages > 99
                        ? '99+'
                        : unreadContactMessages}
                    </span>
                  ) : null}
                </div>

                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-base font-semibold leading-tight">
                        Contact Messages
                      </div>

                      {unreadContactMessages > 0 ? (
                        <span className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-extrabold text-white shadow-sm">
                          {unreadContactMessages > 99
                            ? '99+'
                            : unreadContactMessages}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 text-xs leading-tight text-white/55">
                      Contact Us submissions
                    </div>
                  </div>
                )}
              </NavLink>
            </div>
          ) : null}
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
