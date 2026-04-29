/**
 * Header.tsx
 * Top header inside the in-game layout.
 *
 * UPDATE: Wallet support (refactor)
 * - Header keeps the Coins UI pill, but coinBalance is now received as a prop
 * - Header no longer queries user_wallets / no loadCoinBalance
 *
 * UPDATE: Menu route alignment
 * - Aligned the header menu’s Pro Packages item to the canonical paywall route
 *   (/dashboard/pro) to avoid route mismatch edge cases.
 *
 * UPDATE: Club sync hardening
 * - Header now only accepts fresh main-club update payloads by requiring
 *   updated_at_ms and ignoring older payloads.
 * - Header now ignores developing-club payloads entirely.
 * - Uses ppm-main-club for header identity sync.
 * - Removed the shared active-club concept from header sync.
 * - Header now also accepts country_name and country_code from sync payloads.
 *
 * UPDATE: Temporary Pro route test
 * - Removed TEST Packages button per request.
 *
 * UPDATE: Ranking summary
 * - Header now loads and displays the current club's ranking position summary
 *   inline with the country row.
 *
 * UPDATE: Notifications navigation refactor
 * - Bell button now navigates to /dashboard/notifications instead of opening
 *   the old in-header modal.
 * - Removed popup-only notification state, helpers, handlers, and modal JSX.
 * - Header keeps unread badge logic and polling so the bell still shows the
 *   live unread count.
 *
 * NOTE:
 * - This component listens to window 'club-updated' and storage events to keep
 *   the live main-club info up-to-date.
 * - Header should only receive the user's main club from the layout.
 * - Use a separate key like ppm-active-squad-club elsewhere for squad-page
 *   tab behavior; do not reuse it here.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Settings } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  canReceiveNotification,
  getNotificationTypeFromEvent,
  readNotificationPreferences,
} from '@/lib/notificationPreferences'

interface HeaderProps {
  onToggle?: () => void
  title?: string
  route?: string
  clubId?: string
  clubName?: string
  clubCountryName?: string
  clubCountryCode?: string
  clubLogoUrl?: string | null
  userName?: string
  onNavigate?: (path: string) => void
  onLogout?: () => void
  coinBalance?: number
}

/**
 * MenuItem
 * Shape for profile menu entries.
 */
type MenuItem = {
  label: string
  path?: string
  action?: 'logout'
}

/**
 * NotificationItem
 * Minimal shape needed for preference-filtered unread count.
 */
type NotificationItem = {
  source: string
  type_code: string
  preference_group: string | null
}

/**
 * InboxThreadRow
 * Minimal shape for inbox summary RPC.
 */
type InboxThreadRow = {
  unread_count: number
}

/**
 * ClubUpdatePayload
 * Payload delivered by club-updated events / localStorage.
 */
type ClubUpdatePayload = {
  id?: string
  owner_user_id?: string
  name?: string
  country_code?: string
  country_name?: string
  primary_color?: string
  secondary_color?: string
  logo_path?: string | null
  club_type?: 'main' | 'developing'
  updated_at_ms?: number
}

type TeamCompetitionSummary = {
  competition_label: string
  rank_position: number
}

const LOGO_BUCKET = 'club-logos'
const MAIN_CLUB_STORAGE_KEY = 'ppm-main-club'

const profileMenuItems: MenuItem[] = [
  { label: 'Inbox', path: '/dashboard/inbox' },
  { label: 'My Profile', path: '/dashboard/my-profile' },
  { label: 'Customize Team', path: '/dashboard/customize-team' },
  { label: 'Forum', path: '/dashboard/forum' },
  { label: 'Preferences', path: '/dashboard/preferences' },
  { label: 'Help', path: '/dashboard/help' },
  { label: 'Contact Us', path: '/dashboard/contact-us' },
  { label: 'Pro Packages', path: '/dashboard/pro' },
  { label: 'Invite Friends', path: '/dashboard/invite-friends' },
  { label: 'Logout', action: 'logout' },
]

/**
 * getFlagImageUrl
 * Build a small flag CDN URL when country code is present.
 */
function getFlagImageUrl(countryCode?: string) {
  if (!countryCode || countryCode.length !== 2) return null
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
}

/**
 * getFallbackLetter
 * Return a single-letter fallback for logo placeholders.
 */
function getFallbackLetter(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'T'
}

function formatOrdinal(value?: number | null) {
  if (!value || !Number.isFinite(value)) return ''

  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`

  switch (value % 10) {
    case 1:
      return `${value}st`
    case 2:
      return `${value}nd`
    case 3:
      return `${value}rd`
    default:
      return `${value}th`
  }
}

/**
 * resolveClubLogoUrl
 * Resolve either absolute URLs or bucket paths via supabase.storage.
 */
function resolveClubLogoUrl(logoPath: string | null | undefined, cacheKey: number): string | null {
  if (!logoPath) return null

  if (logoPath.startsWith('http://') || logoPath.startsWith('https://')) {
    try {
      const url = new URL(logoPath)
      url.searchParams.set('v', String(cacheKey))
      return url.toString()
    } catch {
      return logoPath
    }
  }

  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(logoPath)
  return `${data.publicUrl}?v=${cacheKey}`
}

/**
 * TeamAvatar
 * Small avatar for team logo or letter fallback.
 */
function TeamAvatar({
  clubLogoUrl,
  alt,
  fallbackLetter,
  sizeClass,
}: {
  clubLogoUrl?: string | null
  alt: string
  fallbackLetter: string
  sizeClass: string
}) {
  if (clubLogoUrl) {
    return (
      <div className={`${sizeClass} shrink-0 flex items-center justify-center bg-transparent`}>
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
      className={`${sizeClass} rounded-md border border-black/10 bg-black/10 flex items-center justify-center font-semibold text-black shrink-0`}
    >
      <span>{fallbackLetter}</span>
    </div>
  )
}

/**
 * Header
 * Top header component for the dashboard layout.
 */
export default function Header({
  onToggle,
  title,
  clubId,
  clubName,
  clubCountryName,
  clubCountryCode,
  clubLogoUrl,
  userName,
  onNavigate,
  onLogout,
  coinBalance = 0,
}: HeaderProps) {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0)

  const [liveClubName, setLiveClubName] = useState(clubName || title || 'ProPeloton Manager')
  const [liveClubId, setLiveClubId] = useState<string | undefined>(clubId)
  const [liveClubCountryName, setLiveClubCountryName] = useState(
    clubCountryName || 'Club country'
  )
  const [liveClubCountryCode, setLiveClubCountryCode] = useState<string | undefined>(
    clubCountryCode
  )
  const [liveLogoPath, setLiveLogoPath] = useState<string | null>(clubLogoUrl ?? null)
  const [logoCacheKey, setLogoCacheKey] = useState(() => Date.now())
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined)
  const [lastClubUpdateMs, setLastClubUpdateMs] = useState(0)
  const [teamCompetitionSummary, setTeamCompetitionSummary] =
    useState<TeamCompetitionSummary | null>(null)

  const liveClubIdRef = useRef<string | undefined>(clubId)
  const currentUserIdRef = useRef<string | undefined>(undefined)

  const profileMenuRef = useRef<HTMLDivElement>(null)

  /**
   * applyClubUpdatePayload
   * Apply an incoming main-club payload only if it's fresh and relevant.
   */
  const applyClubUpdatePayload = useCallback((payload: ClubUpdatePayload | null) => {
    if (!payload) return

    if (payload.club_type === 'developing') {
      return
    }

    if (payload.club_type && payload.club_type !== 'main') {
      return
    }

    const expectedClubId = liveClubIdRef.current
    const expectedUserId = currentUserIdRef.current

    if (typeof payload.updated_at_ms !== 'number') return

    setLastClubUpdateMs(previous => {
      if (payload.updated_at_ms! <= previous) return previous

      if (payload.id && expectedClubId && payload.id !== expectedClubId) {
        return previous
      }

      if (payload.owner_user_id && expectedUserId && payload.owner_user_id !== expectedUserId) {
        return previous
      }

      if (payload.id && !expectedClubId) {
        setLiveClubId(payload.id)
      }

      if (typeof payload.name === 'string' && payload.name.trim()) {
        setLiveClubName(payload.name)
      }

      if (typeof payload.country_code === 'string') {
        setLiveClubCountryCode(payload.country_code)
      }

      if (typeof payload.country_name === 'string') {
        setLiveClubCountryName(payload.country_name)
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'logo_path')) {
        setLiveLogoPath(payload.logo_path ?? null)
        setLogoCacheKey(Date.now())
      }

      return payload.updated_at_ms!
    })
  }, [])

  /**
   * loadMainClubFromStorage
   * Hydrate live main-club info from localStorage if present.
   */
  const loadMainClubFromStorage = useCallback(() => {
    if (typeof window === 'undefined') return

    const raw = window.localStorage.getItem(MAIN_CLUB_STORAGE_KEY)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as ClubUpdatePayload
      applyClubUpdatePayload(parsed)
    } catch {
      // ignore invalid localStorage payload
    }
  }, [applyClubUpdatePayload])

  useEffect(() => {
    setLiveClubId(clubId)
  }, [clubId])

  useEffect(() => {
    liveClubIdRef.current = liveClubId
  }, [liveClubId])

  useEffect(() => {
    currentUserIdRef.current = currentUserId
  }, [currentUserId])

  useEffect(() => {
    let mounted = true

    async function loadCurrentUserId() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!mounted) return
      setCurrentUserId(user?.id)
    }

    loadCurrentUserId()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    setLiveClubName(clubName || title || 'ProPeloton Manager')
  }, [clubName, title])

  useEffect(() => {
    setLiveClubCountryName(clubCountryName || 'Club country')
  }, [clubCountryName])

  useEffect(() => {
    setLiveClubCountryCode(clubCountryCode)
  }, [clubCountryCode])

  useEffect(() => {
    setLiveLogoPath(clubLogoUrl ?? null)
    setLogoCacheKey(Date.now())
  }, [clubLogoUrl])

  useEffect(() => {
    if (typeof window === 'undefined') return

    loadMainClubFromStorage()

    function handleClubUpdated(event: Event) {
      const customEvent = event as CustomEvent<ClubUpdatePayload>
      applyClubUpdatePayload(customEvent.detail ?? null)
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== MAIN_CLUB_STORAGE_KEY) return
      if (!event.newValue) return

      try {
        const parsed = JSON.parse(event.newValue) as ClubUpdatePayload
        applyClubUpdatePayload(parsed)
      } catch {
        // ignore invalid storage payload
      }
    }

    window.addEventListener('club-updated', handleClubUpdated as EventListener)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('club-updated', handleClubUpdated as EventListener)
      window.removeEventListener('storage', handleStorage)
    }
  }, [applyClubUpdatePayload, loadMainClubFromStorage])

  const displayName = liveClubName || clubName || title || 'ProPeloton Manager'
  const displayCountry = liveClubCountryName || clubCountryName || 'Club country'
  const effectiveCountryCode = liveClubCountryCode || clubCountryCode
  const effectiveLogoUrl = resolveClubLogoUrl(liveLogoPath ?? clubLogoUrl ?? null, logoCacheKey)

  const displayUserName = userName || 'Manager'
  const flagUrl = getFlagImageUrl(effectiveCountryCode)
  const fallbackLetter = getFallbackLetter(displayName)

  /**
   * handleNavigate
   * Central navigation helper: either call onNavigate or update location.
   */
  const handleNavigate = useCallback(
    (path: string) => {
      setIsProfileMenuOpen(false)

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

  /**
   * handleLogoutClick
   * Sign out via supabase or call onLogout if present.
   */
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

  /**
   * shouldDisplayNotification
   * Apply user preferences to decide if a notification should be shown.
   */
  const shouldDisplayNotification = useCallback((item: NotificationItem) => {
    const preferences = readNotificationPreferences()

    const pg = item.preference_group as any
    if (pg && pg in preferences) {
      return canReceiveNotification(preferences, pg)
    }

    const notificationType = getNotificationTypeFromEvent(item.type_code, item.source)
    if (!notificationType) return true
    return canReceiveNotification(preferences, notificationType)
  }, [])

  const loadTeamCompetitionSummary = useCallback(async () => {
    if (!liveClubId) {
      setTeamCompetitionSummary(null)
      return
    }

    const { data, error } = await supabase.rpc('get_club_ranking_summary', {
      p_club_id: liveClubId,
    })

    if (error) {
      console.error('Failed to load team competition summary:', error)
      setTeamCompetitionSummary(null)
      return
    }

    const row = Array.isArray(data) ? data[0] : data

    if (!row) {
      setTeamCompetitionSummary(null)
      return
    }

    setTeamCompetitionSummary({
      competition_label: String(row.competition_label ?? ''),
      rank_position: Number(row.rank_position ?? 0),
    })
  }, [liveClubId])

  /**
   * loadUnreadCount
   * Fetch unread notifications count via RPC.
   */
  const loadUnreadCount = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_notifications', {
      p_status: 'unread',
      p_page: 1,
      p_page_size: 200,
    })

    if (error) {
      console.error('Failed to load unread notification count:', error)
      return
    }

    const unread = ((data ?? []) as NotificationItem[]).filter(shouldDisplayNotification)
    setUnreadCount(unread.length)
  }, [shouldDisplayNotification])

  /**
   * loadInboxUnreadCount
   * Fetch inbox threads and compute unread total.
   */
  const loadInboxUnreadCount = useCallback(async () => {
    const { data, error } = await supabase.rpc('inbox_list_threads')

    if (error) {
      console.error('Failed to load inbox unread count:', error)
      return
    }

    const threads = (data ?? []) as InboxThreadRow[]
    const unread = threads.reduce(
      (sum, thread) => sum + Math.max(Number(thread.unread_count ?? 0), 0),
      0
    )

    setInboxUnreadCount(unread)
  }, [])

  useEffect(() => {
    void loadTeamCompetitionSummary()
  }, [loadTeamCompetitionSummary])

  useEffect(() => {
    void Promise.all([loadUnreadCount(), loadInboxUnreadCount()])

    const intervalId = window.setInterval(() => {
      void Promise.all([loadUnreadCount(), loadInboxUnreadCount()])
    }, 60000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadUnreadCount, loadInboxUnreadCount])

  useEffect(() => {
    if (!isProfileMenuOpen) return

    void loadInboxUnreadCount()

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
  }, [isProfileMenuOpen, loadInboxUnreadCount])

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-yellow-500 bg-yellow-400">
      <div className="flex items-center gap-4 min-w-0 shrink-0">
        <button
          onClick={onToggle}
          className="text-black p-2 rounded-md hover:bg-black/10"
          aria-label="Toggle sidebar"
          type="button"
        >
          ☰
        </button>

        <div className="flex items-center gap-3 min-w-0">
          {effectiveLogoUrl ? (
            <TeamAvatar
              clubLogoUrl={effectiveLogoUrl}
              alt={displayName}
              fallbackLetter={fallbackLetter}
              sizeClass="h-12 w-12"
            />
          ) : null}

          <div className="min-w-0">
            <div className="text-lg text-black leading-tight truncate">
              <span className="font-normal">Team Name: </span>
              <span className="font-bold">{displayName}</span>
            </div>

            <div className="text-sm text-black/85 flex items-center gap-2 leading-tight flex-wrap">
              {flagUrl ? (
                <img
                  src={flagUrl}
                  alt={displayCountry}
                  className="h-3.5 w-5 rounded-[2px] object-cover border border-black/10"
                />
              ) : null}

              <span>{displayCountry}</span>

              {teamCompetitionSummary?.competition_label &&
              teamCompetitionSummary.rank_position > 0 ? (
                <>
                  <span className="text-black/60">-</span>
                  <span>
                    {formatOrdinal(teamCompetitionSummary.rank_position)} in{' '}
                    {teamCompetitionSummary.competition_label} Ranking
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="rounded-md border border-black/35 bg-yellow-300/70 px-3 py-1.5 text-sm font-semibold text-black min-w-[130px] text-center">
          ◎ {coinBalance.toLocaleString()} Coins
        </div>

        <button
          className="relative text-black hover:opacity-80 p-2 rounded-md hover:bg-black/10"
          aria-label="Notifications"
          onClick={() => {
            handleNavigate('/dashboard/notifications')
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
              setIsProfileMenuOpen(prev => !prev)
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
                <div className="text-sm font-semibold text-black">{displayUserName}</div>
                <div className="text-xs text-black/70">Team: {displayName}</div>
              </div>

              <div className="py-1">
                {profileMenuItems.map(item => {
                  const isInboxItem = item.path === '/dashboard/inbox'

                  if (item.action === 'logout') {
                    return (
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
                    )
                  }

                  return (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      onClick={() => handleNavigate(item.path!)}
                      className="w-full px-4 py-2.5 text-left text-sm text-black hover:bg-gray-100"
                    >
                      <span className="inline-flex items-center">
                        {item.label}

                        {isInboxItem && inboxUnreadCount > 0 ? (
                          <span className="ml-2 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                            {inboxUnreadCount > 99 ? '99+' : inboxUnreadCount}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}