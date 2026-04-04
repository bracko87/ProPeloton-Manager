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
 * UPDATE: Notification row expand behavior
 * - Clicking a notification row now expands/collapses details only
 * - "Mark as read" is now a separate action
 * - "Open" is now a separate action and only navigates when explicitly clicked
 *
 * UPDATE: Notification expanded-card polish
 * - Expanded cards render structured text for known notification types
 * - Raw payload JSON is no longer shown in the expanded view
 * - Notification images were removed from the expanded card
 *
 * UPDATE: Transfer notification fallback routing
 * - Header now resolves transfer notification routes from payload_json when
 *   older DB notifications contain stale action_url values.
 * - Action button labels are now contextual for transfer notifications.
 *
 * NOTE:
 * - This component listens to window 'club-updated' and storage events to keep
 *   the live main-club info up-to-date.
 * - Header should only receive the user's main club from the layout.
 * - Use a separate key like ppm-active-squad-club elsewhere for squad-page
 *   tab behavior; do not reuse it here.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Settings, X } from 'lucide-react'
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
 * NotificationTab
 * Which notification tab is active.
 */
type NotificationTab = 'unread' | 'read'

/**
 * NotificationItem
 * Shape of notification objects used in the header's inbox.
 */
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

/**
 * formatNotificationTime
 * Human-readable relative time for notification timestamps.
 */
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

function formatMoney(value: unknown) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null
  return `$${numberValue.toLocaleString()}`
}

function formatLabel(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return ''
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function getNotificationActionLabel(item: NotificationItem) {
  if (item.type_code === 'TRANSFER_OFFER_RECEIVED') return 'Review offer'
  if (item.type_code === 'TRANSFER_OFFER_REJECTED') return 'Open transfers'
  if (item.type_code === 'TRANSFER_OFFER_ACCEPTED') return 'Open negotiation'
  if (item.type_code === 'RIDER_NEGOTIATION_OPENED') return 'Open negotiation'
  return 'Open'
}

function getResolvedNotificationActionUrl(item: NotificationItem) {
  const payload = item.payload_json ?? {}

  const offerId =
    typeof payload.offer_id === 'string' && payload.offer_id.trim()
      ? payload.offer_id
      : null

  const negotiationId =
    typeof payload.negotiation_id === 'string' && payload.negotiation_id.trim()
      ? payload.negotiation_id
      : null

  if (item.type_code === 'TRANSFER_OFFER_RECEIVED' && offerId) {
    return `/dashboard/transfers?activity=outgoing&offerId=${offerId}`
  }

  if (
    (item.type_code === 'TRANSFER_OFFER_ACCEPTED' ||
      item.type_code === 'RIDER_NEGOTIATION_OPENED') &&
    negotiationId
  ) {
    return `/dashboard/transfers/negotiations/${negotiationId}`
  }

  return item.action_url
}

function renderExpandedNotificationText(item: NotificationItem) {
  const payload = item.payload_json ?? {}

  if (item.type_code === 'SPONSOR_SELECTION_REQUIRED') {
    const seasonNumber = Number(payload.season_number)
    const insertedCount = Number(payload.inserted_count)
    const coverageMonths = Number(payload.coverage_months)

    return (
      <div className="mt-3 space-y-2 text-sm text-gray-700 leading-6">
        {Number.isFinite(seasonNumber) ? (
          <div>
            Sponsor offers for <strong>season {seasonNumber}</strong> are now ready for review.
          </div>
        ) : null}

        {Number.isFinite(insertedCount) ? (
          <div>
            Available offers: <strong>{insertedCount}</strong>
          </div>
        ) : null}

        {Number.isFinite(coverageMonths) ? (
          <div>
            Contract length: <strong>{coverageMonths} months</strong>
          </div>
        ) : null}
      </div>
    )
  }

  if (item.type_code === 'SPONSOR_DEAL_SIGNED') {
    const companyName = typeof payload.company_name === 'string' ? payload.company_name : null
    const sponsorKind =
      typeof payload.sponsor_kind === 'string' ? formatLabel(payload.sponsor_kind) : null
    const seasonNumber = Number(payload.season_number)
    const guaranteedAmount = formatMoney(payload.guaranteed_amount)
    const bonusPoolAmount = formatMoney(payload.bonus_pool_amount)

    return (
      <div className="mt-3 space-y-2 text-sm text-gray-700 leading-6">
        {companyName ? (
          <div>
            Sponsor: <strong>{companyName}</strong>
          </div>
        ) : null}

        {sponsorKind ? (
          <div>
            Sponsor type: <strong>{sponsorKind}</strong>
          </div>
        ) : null}

        {Number.isFinite(seasonNumber) ? (
          <div>
            Season: <strong>{seasonNumber}</strong>
          </div>
        ) : null}

        {guaranteedAmount ? (
          <div>
            Guaranteed payment: <strong>{guaranteedAmount}</strong>
          </div>
        ) : null}

        {bonusPoolAmount ? (
          <div>
            Bonus pool: <strong>{bonusPoolAmount}</strong>
          </div>
        ) : null}
      </div>
    )
  }

  if (item.type_code === 'INFRASTRUCTURE_UPGRADE_COMPLETED') {
    const facilityName =
      typeof payload.facility_name === 'string'
        ? payload.facility_name
        : formatLabel(payload.target_key)

    const level = Number(payload.facility_target_level ?? payload.level)

    return (
      <div className="mt-3 space-y-2 text-sm text-gray-700 leading-6">
        {facilityName ? (
          <div>
            Facility: <strong>{facilityName}</strong>
          </div>
        ) : null}

        {Number.isFinite(level) ? (
          <div>
            New level: <strong>{level}</strong>
          </div>
        ) : null}
      </div>
    )
  }

  if (item.type_code === 'INFRASTRUCTURE_ASSET_DELIVERED') {
    const assetName =
      typeof payload.asset_name === 'string' ? payload.asset_name : formatLabel(payload.target_key)

    const quantity = Number(payload.asset_quantity)

    return (
      <div className="mt-3 space-y-2 text-sm text-gray-700 leading-6">
        {assetName ? (
          <div>
            Asset: <strong>{assetName}</strong>
          </div>
        ) : null}

        {Number.isFinite(quantity) ? (
          <div>
            Quantity delivered: <strong>{quantity}</strong>
          </div>
        ) : null}
      </div>
    )
  }

  if (item.type_code === 'TRANSFER_OFFER_RECEIVED') {
    const buyerClubName =
      typeof payload.buyer_club_name === 'string' ? payload.buyer_club_name : null
    const riderName = typeof payload.rider_name === 'string' ? payload.rider_name : null
    const offeredPrice = formatMoney(payload.offered_price)
    const askingPrice = formatMoney(payload.asking_price)

    return (
      <div className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
        {buyerClubName ? (
          <div>
            Buyer club: <strong>{buyerClubName}</strong>
          </div>
        ) : null}

        {riderName ? (
          <div>
            Rider: <strong>{riderName}</strong>
          </div>
        ) : null}

        {offeredPrice ? (
          <div>
            Offer value: <strong>{offeredPrice}</strong>
          </div>
        ) : null}

        {askingPrice ? (
          <div>
            Asking price: <strong>{askingPrice}</strong>
          </div>
        ) : null}
      </div>
    )
  }

  if (item.type_code === 'TRANSFER_OFFER_REJECTED') {
    const riderName = typeof payload.rider_name === 'string' ? payload.rider_name : null
    const sellerClubName =
      typeof payload.seller_club_name === 'string' ? payload.seller_club_name : null
    const offeredPrice = formatMoney(payload.offered_price)

    return (
      <div className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
        {sellerClubName ? (
          <div>
            Seller club: <strong>{sellerClubName}</strong>
          </div>
        ) : null}

        {riderName ? (
          <div>
            Rider: <strong>{riderName}</strong>
          </div>
        ) : null}

        {offeredPrice ? (
          <div>
            Rejected offer: <strong>{offeredPrice}</strong>
          </div>
        ) : null}
      </div>
    )
  }

  return null
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
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [activeNotificationTab, setActiveNotificationTab] = useState<NotificationTab>('unread')
  const [unreadCount, setUnreadCount] = useState(0)
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0)
  const [unreadItems, setUnreadItems] = useState<NotificationItem[]>([])
  const [readItems, setReadItems] = useState<NotificationItem[]>([])
  const [isLoadingUnread, setIsLoadingUnread] = useState(false)
  const [isLoadingRead, setIsLoadingRead] = useState(false)
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false)
  const [expandedNotificationId, setExpandedNotificationId] = useState<number | null>(null)

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

  /**
   * loadNotifications
   * Load notifications for a given tab (unread/read).
   */
  const loadNotifications = useCallback(
    async (tab: NotificationTab) => {
      const setLoading = tab === 'unread' ? setIsLoadingUnread : setIsLoadingRead
      const setItems = tab === 'unread' ? setUnreadItems : setReadItems

      setLoading(true)

      const { data, error } = await supabase.rpc('get_my_notifications', {
        p_status: tab,
        p_page: 1,
        p_page_size: 20,
      })

      if (error) {
        console.error(`Failed to load ${tab} notifications:`, error)
        setLoading(false)
        return
      }

      const filteredItems = ((data ?? []) as NotificationItem[]).filter(shouldDisplayNotification)
      setItems(filteredItems)
      setLoading(false)
    },
    [shouldDisplayNotification]
  )

  const openNotifications = useCallback(async () => {
    setIsProfileMenuOpen(false)
    setIsNotificationsOpen(true)
    setActiveNotificationTab('unread')

    await Promise.all([loadUnreadCount(), loadNotifications('unread')])
  }, [loadNotifications, loadUnreadCount])

  const closeNotifications = useCallback(() => {
    setIsNotificationsOpen(false)
    setExpandedNotificationId(null)
  }, [])

  const handleNotificationTabChange = useCallback(
    async (tab: NotificationTab) => {
      setActiveNotificationTab(tab)
      setExpandedNotificationId(null)
      await loadNotifications(tab)
    },
    [loadNotifications]
  )

  const handleNotificationClick = useCallback((item: NotificationItem) => {
    setExpandedNotificationId(prev =>
      prev === item.user_notification_id ? null : item.user_notification_id
    )
  }, [])

  const handleNotificationMarkRead = useCallback(async (item: NotificationItem) => {
    if (item.status !== 'unread') return

    const { data, error } = await supabase.rpc('mark_my_notification_read', {
      p_user_notification_id: item.user_notification_id,
    })

    if (error) {
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
        prev.filter(notification => notification.user_notification_id !== item.user_notification_id)
      )

      setReadItems(prev => [readItem, ...prev])
      setUnreadCount(prev => Math.max(0, prev - 1))

      setExpandedNotificationId(prev => (prev === item.user_notification_id ? null : prev))
    }
  }, [])

  const handleNotificationOpen = useCallback(
    async (item: NotificationItem) => {
      if (item.status === 'unread') {
        const { data, error } = await supabase.rpc('mark_my_notification_read', {
          p_user_notification_id: item.user_notification_id,
        })

        if (error) {
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
            prev.filter(
              notification => notification.user_notification_id !== item.user_notification_id
            )
          )

          setReadItems(prev => [readItem, ...prev])
          setUnreadCount(prev => Math.max(0, prev - 1))
        }
      }

      const resolvedActionUrl = getResolvedNotificationActionUrl(item)

      if (resolvedActionUrl) {
        handleNavigate(resolvedActionUrl)
      }
    },
    [handleNavigate]
  )

  /**
   * handleMarkAllAsRead
   * Mark all unread notifications as read via RPC.
   */
  const handleMarkAllAsRead = useCallback(async () => {
    setIsMarkingAllRead(true)

    const { error } = await supabase.rpc('mark_all_my_notifications_read')

    if (error) {
      console.error('Failed to mark all notifications as read:', error)
      setIsMarkingAllRead(false)
      return
    }

    await Promise.all([loadUnreadCount(), loadNotifications('unread'), loadNotifications('read')])

    setIsMarkingAllRead(false)
    setExpandedNotificationId(null)
  }, [loadNotifications, loadUnreadCount])

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

  useEffect(() => {
    if (!isNotificationsOpen) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsNotificationsOpen(false)
        setExpandedNotificationId(null)
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
  const isActiveTabLoading = activeNotificationTab === 'unread' ? isLoadingUnread : isLoadingRead

  return (
    <>
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
                setExpandedNotificationId(null)
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
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-black">Notifications</h2>
                <p className="text-xs text-gray-500">Game and admin messages</p>
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
                <div className="px-5 py-10 text-sm text-gray-500">Loading notifications...</div>
              ) : activeItems.length === 0 ? (
                <div className="px-5 py-10 text-sm text-gray-500">
                  {activeNotificationTab === 'unread'
                    ? 'No unread notifications.'
                    : 'No read notifications yet.'}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {activeItems.map(item => {
                    const isUnread = item.status === 'unread'
                    const isExpanded = expandedNotificationId === item.user_notification_id
                    const resolvedActionUrl = getResolvedNotificationActionUrl(item)

                    return (
                      <div
                        key={item.user_notification_id}
                        className={`px-5 py-4 transition-colors ${
                          isUnread ? 'bg-yellow-50/50' : 'bg-white'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            handleNotificationClick(item)
                          }}
                          className="w-full text-left"
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
                                    isUnread ? 'font-semibold text-black' : 'font-medium text-black'
                                  }`}
                                >
                                  {item.title}
                                </div>

                                <div className="shrink-0 text-xs text-gray-500">
                                  {formatNotificationTime(item.notification_created_at)}
                                </div>
                              </div>

                              <div className="mt-1 text-sm text-gray-600 line-clamp-2">
                                {item.message}
                              </div>

                              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                                <span className="capitalize">{item.source}</span>
                                <span>•</span>
                                <span>{item.type_code}</span>
                                <span>•</span>
                                <span>{isExpanded ? 'Hide details' : 'Show details'}</span>
                              </div>
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="mt-4 ml-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                            <div className="min-w-0">
                              <div className="text-base font-semibold text-black">
                                {item.title}
                              </div>

                              <div className="mt-2 text-sm leading-6 text-gray-700 whitespace-pre-wrap">
                                {item.message}
                              </div>

                              {renderExpandedNotificationText(item)}

                              <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
                                {item.status === 'unread' ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleNotificationMarkRead(item)
                                    }}
                                    className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-black hover:bg-gray-50"
                                  >
                                    Mark as read
                                  </button>
                                ) : null}

                                {resolvedActionUrl ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleNotificationOpen(item)
                                    }}
                                    className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                                  >
                                    {getNotificationActionLabel(item)}
                                  </button>
                                ) : null}
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
          </div>
        </div>
      )}
    </>
  )
}