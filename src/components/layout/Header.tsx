/**
 * Header.tsx
 * Top header inside the in-game layout.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Settings, X } from 'lucide-react'
// Adjust this import path to match your project structure.
import { supabase } from '@/lib/supabase'

interface HeaderProps {
  onToggle?: () => void
  title?: string
  route?: string
  clubName?: string
  clubCountryName?: string
  clubCountryCode?: string
  clubLogoUrl?: string | null
  userName?: string
  onNavigate?: (path: string) => void
  onLogout?: () => void
}

type MenuItem = {
  label: string
  path?: string
  action?: 'logout'
}

type NotificationTab = 'unread' | 'read'

type NotificationItem = {
  user_notification_id: number
  status: 'unread' | 'read'
  read_at: string | null
  assigned_at: string
  notification_id: number
  title: string
  message: string
  source: string
  action_url: string | null
  payload_json: Record<string, unknown> | null
  notification_created_at: string
  type_code: string
  icon_name: string | null
}

const profileMenuItems: MenuItem[] = [
  { label: 'Inbox', path: '/dashboard/inbox' },
  { label: 'My Profile', path: '/dashboard/my-profile' },
  { label: 'Customize Team', path: '/dashboard/customize-team' },
  { label: 'Forum', path: '/dashboard/forum' },
  { label: 'Preferences', path: '/dashboard/preferences' },
  { label: 'Help', path: '/dashboard/help' },
  { label: 'Contact Us', path: '/dashboard/contact-us' },
  { label: 'Pro Packages', path: '/dashboard/pro-packages' },
  { label: 'Invite Friends', path: '/dashboard/invite-friends' },
  { label: 'Logout', action: 'logout' }
]

/**
 * Builds a small flag image URL from ISO country code.
 */
function getFlagImageUrl(countryCode?: string) {
  if (!countryCode || countryCode.length !== 2) return null
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
}

function getFallbackLetter(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'T'
}

function formatNotificationTime(dateString?: string | null) {
  if (!dateString) return ''

  const date = new Date(dateString)
  const diffMs = date.getTime() - Date.now()
  const diffMinutes = Math.round(diffMs / 60000)
  const absMinutes = Math.abs(diffMinutes)

  if (absMinutes < 1) return 'Just now'
  if (absMinutes < 60) return `${absMinutes}m ago`

  const diffHours = Math.round(diffMinutes / 60)
  const absHours = Math.abs(diffHours)

  if (absHours < 24) return `${absHours}h ago`

  const diffDays = Math.round(diffHours / 24)
  const absDays = Math.abs(diffDays)

  if (absDays < 7) return `${absDays}d ago`

  return date.toLocaleDateString()
}

function TeamAvatar({
  clubLogoUrl,
  alt,
  fallbackLetter,
  sizeClass
}: {
  clubLogoUrl?: string | null
  alt: string
  fallbackLetter: string
  sizeClass: string
}) {
  if (clubLogoUrl) {
    return (
      <div className={`${sizeClass} shrink-0 flex items-center justify-center`}>
        <img
          src={clubLogoUrl}
          alt={alt}
          className="h-full w-full object-contain"
          draggable={false}
        />
      </div>
    )
  }

  return (
    <div
      className={`${sizeClass} rounded-full border border-black/10 bg-black/10 flex items-center justify-center font-semibold text-black shrink-0`}
    >
      <span>{fallbackLetter}</span>
    </div>
  )
}

export default function Header({
  onToggle,
  title,
  clubName,
  clubCountryName,
  clubCountryCode,
  clubLogoUrl,
  userName,
  onNavigate,
  onLogout
}: HeaderProps) {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [activeNotificationTab, setActiveNotificationTab] =
    useState<NotificationTab>('unread')
  const [unreadCount, setUnreadCount] = useState(0)
  const [unreadItems, setUnreadItems] = useState<NotificationItem[]>([])
  const [readItems, setReadItems] = useState<NotificationItem[]>([])
  const [isLoadingUnread, setIsLoadingUnread] = useState(false)
  const [isLoadingRead, setIsLoadingRead] = useState(false)
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false)

  const profileMenuRef = useRef<HTMLDivElement>(null)

  const displayName = clubName || title || 'ProPeloton Manager'
  const displayCountry = clubCountryName || 'Club country'
  const displayUserName = userName || 'Manager'
  const flagUrl = getFlagImageUrl(clubCountryCode)
  const fallbackLetter = getFallbackLetter(displayName)

  const handleNavigate = useCallback(
    (path: string) => {
      setIsProfileMenuOpen(false)
      setIsNotificationsOpen(false)

      if (onNavigate) {
        onNavigate(path)
        return
      }

      if (typeof window !== 'undefined') {
        window.location.href = path
      }
    },
    [onNavigate]
  )

  const handleLogoutClick = useCallback(async () => {
    setIsProfileMenuOpen(false)

    if (onLogout) {
      onLogout()
      return
    }

    await supabase.auth.signOut()

    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }, [onLogout])

  const loadUnreadCount = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_unread_notification_count')

    if (error) {
      console.error('Failed to load unread notification count:', error)
      return
    }

    setUnreadCount(Number(data ?? 0))
  }, [])

  const loadNotifications = useCallback(
    async (tab: NotificationTab) => {
      const setLoading =
        tab === 'unread' ? setIsLoadingUnread : setIsLoadingRead
      const setItems = tab === 'unread' ? setUnreadItems : setReadItems

      setLoading(true)

      const { data, error } = await supabase.rpc('get_my_notifications', {
        p_status: tab,
        p_page: 1,
        p_page_size: 20
      })

      if (error) {
        console.error(`Failed to load ${tab} notifications:`, error)
        setLoading(false)
        return
      }

      setItems((data ?? []) as NotificationItem[])
      setLoading(false)
    },
    []
  )

  const openNotifications = useCallback(async () => {
    setIsProfileMenuOpen(false)
    setIsNotificationsOpen(true)
    setActiveNotificationTab('unread')

    await Promise.all([loadUnreadCount(), loadNotifications('unread')])
  }, [loadNotifications, loadUnreadCount])

  const closeNotifications = useCallback(() => {
    setIsNotificationsOpen(false)
  }, [])

  const handleNotificationTabChange = useCallback(
    async (tab: NotificationTab) => {
      setActiveNotificationTab(tab)
      await loadNotifications(tab)
    },
    [loadNotifications]
  )

  const handleNotificationClick = useCallback(
    async (item: NotificationItem) => {
      if (item.status === 'unread') {
        const { data, error } = await supabase.rpc('mark_my_notification_read', {
          p_user_notification_id: item.user_notification_id
        })

        if (error) {
          console.error('Failed to mark notification as read:', error)
        } else if (data === true) {
          const readItem: NotificationItem = {
            ...item,
            status: 'read',
            read_at: new Date().toISOString()
          }

          setUnreadItems((prev) =>
            prev.filter(
              (notification) =>
                notification.user_notification_id !== item.user_notification_id
            )
          )

          setReadItems((prev) => [readItem, ...prev])
          setUnreadCount((prev) => Math.max(0, prev - 1))
        }
      }

      if (item.action_url) {
        handleNavigate(item.action_url)
      }
    },
    [handleNavigate]
  )

  const handleMarkAllAsRead = useCallback(async () => {
    setIsMarkingAllRead(true)

    const { error } = await supabase.rpc('mark_all_my_notifications_read')

    if (error) {
      console.error('Failed to mark all notifications as read:', error)
      setIsMarkingAllRead(false)
      return
    }

    await Promise.all([
      loadUnreadCount(),
      loadNotifications('unread'),
      loadNotifications('read')
    ])

    setIsMarkingAllRead(false)
  }, [loadNotifications, loadUnreadCount])

  useEffect(() => {
    void loadUnreadCount()

    const intervalId = window.setInterval(() => {
      void loadUnreadCount()
    }, 60000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadUnreadCount])

  useEffect(() => {
    if (!isProfileMenuOpen) return

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setIsProfileMenuOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isProfileMenuOpen])

  useEffect(() => {
    if (!isNotificationsOpen) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsNotificationsOpen(false)
      }
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    document.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isNotificationsOpen])

  const activeItems = activeNotificationTab === 'unread' ? unreadItems : readItems
  const isActiveTabLoading =
    activeNotificationTab === 'unread' ? isLoadingUnread : isLoadingRead

  return (
    <>
      <header className="flex items-center justify-between px-6 py-3 border-b border-yellow-500 bg-yellow-400">
        <div className="flex items-center gap-4">
          <button
            onClick={onToggle}
            className="text-black p-2 rounded-md hover:bg-black/10"
            aria-label="Toggle sidebar"
            type="button"
          >
            ☰
          </button>

          <div className="flex items-center gap-3">
            {clubLogoUrl ? (
              <TeamAvatar
                clubLogoUrl={clubLogoUrl}
                alt={displayName}
                fallbackLetter={fallbackLetter}
                sizeClass="h-12 w-12"
              />
            ) : null}

            <div>
              <div className="text-lg text-black leading-tight">
                <span className="font-normal">Team Name: </span>
                <span className="font-bold">{displayName}</span>
              </div>

              <div className="text-sm text-black/85 flex items-center gap-2 leading-tight">
                {flagUrl ? (
                  <img
                    src={flagUrl}
                    alt={displayCountry}
                    className="h-3.5 w-5 rounded-[2px] object-cover border border-black/10"
                  />
                ) : null}
                <span>{displayCountry}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="relative text-black hover:opacity-80 p-2 rounded-md hover:bg-black/10"
            aria-label="Notifications"
            aria-haspopup="dialog"
            aria-expanded={isNotificationsOpen}
            onClick={() => {
              void openNotifications()
            }}
            type="button"
          >
            <Bell size={20} />

            {unreadCount > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </button>

          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => {
                setIsNotificationsOpen(false)
                setIsProfileMenuOpen((prev) => !prev)
              }}
              aria-label="Open profile menu"
              aria-haspopup="menu"
              aria-expanded={isProfileMenuOpen}
              className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-black/10"
            >
              <Settings size={18} className="text-black" />
              <span className="text-sm font-medium text-black">Menu</span>
            </button>

            {isProfileMenuOpen && (
              <div
                role="menu"
                aria-label="Profile menu"
                className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl z-50"
              >
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <div className="text-sm font-semibold text-black">
                    {displayUserName}
                  </div>
                  <div className="text-xs text-black/70">
                    Team: {displayName}
                  </div>
                </div>

                <div className="py-1">
                  {profileMenuItems.map((item) =>
                    item.action === 'logout' ? (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          void handleLogoutClick()
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        {item.label}
                      </button>
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        onClick={() => handleNavigate(item.path!)}
                        className="w-full px-4 py-2.5 text-left text-sm text-black hover:bg-gray-100"
                      >
                        {item.label}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {isNotificationsOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/35 backdrop-blur-[6px] cursor-default"
            onClick={closeNotifications}
            aria-label="Close notifications"
          />

          <div
            className="relative z-[81] mt-12 w-full max-w-2xl overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-black">
                  Notifications
                </h2>
                <p className="text-xs text-gray-500">
                  Game and admin messages
                </p>
              </div>

              <div className="flex items-center gap-2">
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      void handleMarkAllAsRead()
                    }}
                    disabled={isMarkingAllRead}
                    className="rounded-md px-3 py-2 text-sm font-medium text-black hover:bg-gray-100 disabled:opacity-50"
                  >
                    {isMarkingAllRead ? 'Marking...' : 'Mark all as read'}
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={closeNotifications}
                  aria-label="Close notifications"
                  className="rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-black"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex border-b border-gray-200">
              <button
                type="button"
                onClick={() => {
                  void handleNotificationTabChange('unread')
                }}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeNotificationTab === 'unread'
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-500 hover:text-black'
                }`}
              >
                Unread
                {unreadCount > 0 ? ` (${unreadCount})` : ''}
              </button>

              <button
                type="button"
                onClick={() => {
                  void handleNotificationTabChange('read')
                }}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeNotificationTab === 'read'
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-500 hover:text-black'
                }`}
              >
                Read
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              {isActiveTabLoading ? (
                <div className="px-5 py-10 text-sm text-gray-500">
                  Loading notifications...
                </div>
              ) : activeItems.length === 0 ? (
                <div className="px-5 py-10 text-sm text-gray-500">
                  {activeNotificationTab === 'unread'
                    ? 'No unread notifications.'
                    : 'No read notifications yet.'}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {activeItems.map((item) => {
                    const isUnread = item.status === 'unread'

                    return (
                      <button
                        key={item.user_notification_id}
                        type="button"
                        onClick={() => {
                          void handleNotificationClick(item)
                        }}
                        className={`w-full px-5 py-4 text-left transition-colors hover:bg-gray-50 ${
                          isUnread ? 'bg-yellow-50/50' : 'bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${
                              isUnread ? 'bg-red-500' : 'bg-gray-300'
                            }`}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div
                                className={`text-sm ${
                                  isUnread
                                    ? 'font-semibold text-black'
                                    : 'font-medium text-black'
                                }`}
                              >
                                {item.title}
                              </div>

                              <div className="shrink-0 text-xs text-gray-500">
                                {formatNotificationTime(
                                  item.notification_created_at
                                )}
                              </div>
                            </div>

                            <div className="mt-1 text-sm text-gray-600 line-clamp-2">
                              {item.message}
                            </div>

                            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                              <span className="capitalize">{item.source}</span>
                              <span>•</span>
                              <span>{item.type_code}</span>
                              {item.action_url ? (
                                <>
                                  <span>•</span>
                                  <span>Open</span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}