/**
 * src/pages/dashboard/NotificationsPage.tsx
 *
 * Full-page notification center for the dashboard.
 *
 * Purpose:
 * - Show the user's game/admin notifications in a dedicated page.
 * - Provide Unread/Read tabs, basic filtering via user preferences,
 *   and actions like "Mark as read" and template-driven navigation.
 * - Reuse the same Supabase RPCs and preference rules as the header inbox.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import {
  canReceiveNotification,
  getNotificationTypeFromEvent,
  readNotificationPreferences,
} from '@/lib/notificationPreferences'
import {
  type NotificationItem,
  formatNotificationTime,
  getResolvedNotificationActionUrl,
} from '@/features/notifications/notificationHelpers'
import {
  applyNotificationTemplates,
  getNotificationActionHref,
  getNotificationActions,
  getNotificationDetailRows,
  getNotificationExtraText,
  getNotificationImageSrc,
  getNotificationIntroText,
  type NotificationActionTemplate,
} from '@/features/notifications/notificationTemplates'

type NotificationTab = 'unread' | 'read'

const PAGE_SIZE = 10

export default function NotificationsPage(): JSX.Element {
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<NotificationTab>('unread')
  const [unreadItems, setUnreadItems] = useState<NotificationItem[]>([])
  const [readItems, setReadItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoadingUnread, setIsLoadingUnread] = useState(false)
  const [isLoadingRead, setIsLoadingRead] = useState(false)
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [pageByTab, setPageByTab] = useState<Record<NotificationTab, number>>({
    unread: 1,
    read: 1,
  })

  const shouldDisplayNotification = useCallback((item: NotificationItem): boolean => {
    const preferences = readNotificationPreferences()

    const pg = item.preference_group as any
    if (pg && pg in preferences) {
      return canReceiveNotification(preferences, pg)
    }

    const notificationType = getNotificationTypeFromEvent(item.type_code, item.source)
    if (!notificationType) return true
    return canReceiveNotification(preferences, notificationType)
  }, [])

  const loadUnreadCount = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_notifications', {
      p_status: 'unread',
      p_page: 1,
      p_page_size: 200,
    })

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load unread notification count:', error)
      return
    }

    const templatedItems = applyNotificationTemplates((data ?? []) as NotificationItem[])
    const unread = templatedItems.filter(shouldDisplayNotification)
    setUnreadCount(unread.length)
  }, [shouldDisplayNotification])

  const loadNotifications = useCallback(
    async (tab: NotificationTab) => {
      const setLoading = tab === 'unread' ? setIsLoadingUnread : setIsLoadingRead
      const setItems = tab === 'unread' ? setUnreadItems : setReadItems

      setLoading(true)

      const { data, error } = await supabase.rpc('get_my_notifications', {
        p_status: tab,
        p_page: pageByTab[tab],
        p_page_size: PAGE_SIZE,
      })

      if (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to load ${tab} notifications:`, error)
        setLoading(false)
        return
      }

      const templatedItems = applyNotificationTemplates((data ?? []) as NotificationItem[])
      const filteredItems = templatedItems.filter(shouldDisplayNotification)
      setItems(filteredItems)
      setLoading(false)
    },
    [pageByTab, shouldDisplayNotification]
  )

  const handleTabChange = useCallback((tab: NotificationTab) => {
    setActiveTab(tab)
    setExpandedId(null)
    setPageByTab(prev => ({
      ...prev,
      [tab]: 1,
    }))
  }, [])

  const handleMarkAsRead = useCallback(async (item: NotificationItem) => {
    if (item.status !== 'unread') return

    const { data, error } = await supabase.rpc('mark_my_notification_read', {
      p_user_notification_id: item.user_notification_id,
    })

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to mark notification as read:', error)
      return
    }

    if (data === true) {
      const readItem: NotificationItem = {
        ...item,
        status: 'read',
        read_at: new Date().toISOString(),
      }

      setUnreadItems(prev =>
        prev.filter(n => n.user_notification_id !== item.user_notification_id)
      )
      setReadItems(prev => [readItem, ...prev])
      setUnreadCount(prev => Math.max(0, prev - 1))
      setExpandedId(prev => (prev === item.user_notification_id ? null : prev))
    }
  }, [])

  const handleOpenNotification = useCallback(
    async (item: NotificationItem, overrideUrl?: string | null) => {
      if (item.status === 'unread') {
        const { data, error } = await supabase.rpc('mark_my_notification_read', {
          p_user_notification_id: item.user_notification_id,
        })

        if (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to mark notification as read:', error)
          return
        }

        if (data === true) {
          const readItem: NotificationItem = {
            ...item,
            status: 'read',
            read_at: new Date().toISOString(),
          }

          setUnreadItems(prev =>
            prev.filter(n => n.user_notification_id !== item.user_notification_id)
          )
          setReadItems(prev => [readItem, ...prev])
          setUnreadCount(prev => Math.max(0, prev - 1))
        }
      }

      const url = overrideUrl ?? getResolvedNotificationActionUrl(item)
      if (url) {
        navigate(url)
      }
    },
    [navigate]
  )

  const handleTemplateAction = useCallback(
    async (item: NotificationItem, action: NotificationActionTemplate) => {
      if (action.kind === 'markRead') {
        await handleMarkAsRead(item)
        return
      }

      const href = getNotificationActionHref(action, item)
      if (!href) return

      await handleOpenNotification(item, href)
    },
    [handleMarkAsRead, handleOpenNotification]
  )

  const handleMarkAllAsRead = useCallback(async () => {
    setIsMarkingAllRead(true)

    const { error } = await supabase.rpc('mark_all_my_notifications_read')

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to mark all notifications as read:', error)
      setIsMarkingAllRead(false)
      return
    }

    await Promise.all([loadUnreadCount(), loadNotifications('unread'), loadNotifications('read')])

    setIsMarkingAllRead(false)
    setExpandedId(null)
  }, [loadNotifications, loadUnreadCount])

  useEffect(() => {
    void loadUnreadCount()
  }, [loadUnreadCount])

  useEffect(() => {
    void loadNotifications(activeTab)
  }, [activeTab, pageByTab, loadNotifications])

  const activeItems = activeTab === 'unread' ? unreadItems : readItems
  const isActiveTabLoading = activeTab === 'unread' ? isLoadingUnread : isLoadingRead
  const activePage = pageByTab[activeTab]
  const canGoPrevious = activePage > 1
  const canGoNext = activeItems.length === PAGE_SIZE

  return (
    <div className="w-full px-6 py-6">
      <div className="w-full space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Notifications</h1>
          <p className="mt-1 text-sm text-slate-600">
            Game events, admin messages, and system updates for your club.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  handleTabChange('unread')
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  activeTab === 'unread'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Unread
                {unreadCount > 0 ? (
                  <span className="ml-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-white/15 px-1 text-[10px]">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                onClick={() => {
                  handleTabChange('read')
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  activeTab === 'read'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Read
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  void handleMarkAllAsRead()
                }}
                disabled={isMarkingAllRead}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-60"
              >
                {isMarkingAllRead ? 'Marking…' : 'Mark all as read'}
              </button>
            )}
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {isActiveTabLoading ? (
              <div className="px-4 py-10 text-sm text-slate-500">Loading notifications…</div>
            ) : activeItems.length === 0 ? (
              <div className="px-4 py-10 text-sm text-slate-500">
                {activeTab === 'unread'
                  ? 'You have no unread notifications.'
                  : 'No read notifications yet.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeItems.map(item => {
                  const isUnread = item.status === 'unread'
                  const isExpanded = expandedId === item.user_notification_id
                  const imageSrc = getNotificationImageSrc(item)
                  const introText = getNotificationIntroText(item)
                  const detailRows = getNotificationDetailRows(item)
                  const extraText = getNotificationExtraText(item)
                  const templateActions = getNotificationActions(item)

                  return (
                    <div
                      key={item.user_notification_id}
                      className={`px-4 py-4 transition-colors ${
                        isUnread ? 'bg-slate-50' : 'bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(prev =>
                            prev === item.user_notification_id ? null : item.user_notification_id
                          )
                        }
                        className="flex w-full items-start gap-3 text-left"
                      >
                        <span
                          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                            isUnread ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div
                              className={`text-sm ${
                                isUnread
                                  ? 'font-semibold text-slate-900'
                                  : 'font-medium text-slate-900'
                              }`}
                            >
                              {item.title}
                            </div>
                            <div className="shrink-0 text-xs text-slate-500">
                              {formatNotificationTime(item.notification_created_at)}
                            </div>
                          </div>

                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                            {item.message}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="capitalize">{item.source}</span>
                            <span>•</span>
                            <span>{item.type_code}</span>
                            <span>•</span>
                            <span>{isExpanded ? 'Hide details' : 'Show details'}</span>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="ml-5 mt-4 overflow-hidden rounded-xl border border-slate-300 bg-slate-50 shadow-sm">
                          <div className="border-b border-slate-300 bg-white px-4 py-3">
                            <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                          </div>

                          <div className="px-4 py-4">
                            <div
                              className={`grid gap-6 ${
                                imageSrc ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1'
                              }`}
                            >
                              <div className="min-w-0">
                                {introText ? (
                                  <p className="text-sm leading-6 text-slate-700">{introText}</p>
                                ) : null}

                                {detailRows.length > 0 ? (
                                  <div className="mt-4 space-y-2">
                                    {detailRows.map((row, index) => (
                                      <div
                                        key={`${item.user_notification_id}-${row.label}-${index}`}
                                        className="text-sm leading-6 text-slate-700"
                                      >
                                        <span className="text-slate-600">{row.label}: </span>
                                        <strong className="font-semibold text-slate-900">
                                          {row.value}
                                        </strong>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}

                                {extraText ? (
                                  <p className="mt-4 text-sm leading-6 text-slate-600">
                                    {extraText}
                                  </p>
                                ) : null}
                              </div>

                              {imageSrc ? (
                                <div className="flex items-start justify-center lg:justify-end">
                                  <img
                                    src={imageSrc}
                                    alt={item.title}
                                    className="w-full max-w-[340px] rounded-xl object-cover shadow-sm"
                                    draggable={false}
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="border-t border-slate-300 bg-white px-4 py-3">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {templateActions.map(action => (
                                <button
                                  key={action.key}
                                  type="button"
                                  onClick={() => {
                                    void handleTemplateAction(item, action)
                                  }}
                                  className={
                                    action.variant === 'primary'
                                      ? 'rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800'
                                      : 'rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100'
                                  }
                                >
                                  {action.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={() => {
                if (!canGoPrevious) return
                setExpandedId(null)
                setPageByTab(prev => ({
                  ...prev,
                  [activeTab]: prev[activeTab] - 1,
                }))
              }}
              disabled={!canGoPrevious}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            <div className="text-xs text-slate-500">Page {activePage}</div>

            <button
              type="button"
              onClick={() => {
                if (!canGoNext) return
                setExpandedId(null)
                setPageByTab(prev => ({
                  ...prev,
                  [activeTab]: prev[activeTab] + 1,
                }))
              }}
              disabled={!canGoNext}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}