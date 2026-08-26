/**
 * Header.tsx
 * Top header inside the in-game layout.
 *
 * Purpose:
 * - Display current club identity (name, country, logo) and competition summary.
 * - Show live notification + inbox unread counts and a profile/menu dropdown.
 * - Surface the current membership tier and coin wallet balance.
 *
 * UPDATE: Menu route alignment
 * - The header menu’s Pro Packages item is aligned to the canonical paywall route
 *   (/dashboard/pro) to avoid route mismatch edge cases.
 *
 * UPDATE: Club sync hardening
 * - Header only accepts fresh main-club update payloads by requiring updated_at_ms
 *   and ignoring older payloads.
 * - Developing-club payloads are ignored entirely.
 * - Uses ppm-main-club for header identity sync.
 *
 * UPDATE: Ranking summary
 * - Header loads and displays the current club's ranking position summary
 *   inline with the country row.
 *
 * UPDATE: Competition identity hardening
 * - Competition/ranking data is always loaded for the authoritative clubId
 *   supplied by MainLayout, never from a cached/localStorage club id.
 * - Stale async competition responses are ignored when the active club changes.
 *
 * UPDATE: Notifications navigation refactor
 * - Bell button navigates to /dashboard/notifications instead of opening
 *   the old in-header modal.
 * - Header keeps unread badge logic and polling so the bell still shows
 *   the live unread count.
 *
 * NOTE:
 * - This component listens to window 'club-updated' and storage events to keep
 *   the live main-club info up-to-date.
 * - Header should only receive the user's main club from the layout.
 * - Visible team name is resolved through get_club_display_identity_v1 so
 *   naming-rights sponsor names are shown globally without overwriting clubs.name.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bell,
  Crown,
  Settings,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  canReceiveNotificationItem,
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
  labelKey: string
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
  payload_json?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
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

/**
 * TeamCompetitionSummary
 * Minimal summary of a club's ranking position in its main competition.
 */
type TeamCompetitionSummary = {
  competition_label: string
  rank_position: number
}

/**
 * ClubDisplayIdentity
 * Resolved display identity for a club, including naming-rights state.
 */
type ClubDisplayIdentity = {
  club_id: string
  base_name: string | null
  display_name: string | null
  season_display_name: string | null
  original_club_name: string | null
  full_display_name: string | null
  locked_by_sponsor: boolean
  locked_until_game_date: string | null
  source_sponsor_id: string | null
}

/**
 * PremiumStatusRow
 * Tolerant shape for get_my_premium_status so the header remains compatible
 * if the RPC returns either a boolean or a row with an explicit Premium flag.
 */
type PremiumStatusRow = {
  is_premium?: boolean | null
  premium_active?: boolean | null
  has_premium?: boolean | null
  active?: boolean | null
  stripe_status?: string | null
  access_until?: string | null
}

const LOGO_BUCKET = 'club-logos'
const MAIN_CLUB_STORAGE_KEY = 'ppm-main-club'

const profileMenuItems: MenuItem[] = [
  { labelKey: 'inbox', path: '/dashboard/inbox' },
  { labelKey: 'myProfile', path: '/dashboard/my-profile' },
  { labelKey: 'customizeTeam', path: '/dashboard/customize-team' },
  { labelKey: 'forum', path: '/dashboard/forum' },
  { labelKey: 'preferences', path: '/dashboard/preferences' },
  { labelKey: 'help', path: '/dashboard/help' },
  { labelKey: 'contactUs', path: '/dashboard/contact-us' },
  { labelKey: 'proPackages', path: '/dashboard/pro' },
  { labelKey: 'inviteFriends', path: '/dashboard/invite-friends' },
  { labelKey: 'logout', action: 'logout' },
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
 * formatOrdinal
 * Format numeric positions as 1st/2nd/3rd/4th.
 */
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
function resolveClubLogoUrl(
  logoPath: string | null | undefined,
  cacheKey: number,
): string | null {
  if (!logoPath) return null

  if (
    logoPath.startsWith('http://') ||
    logoPath.startsWith('https://')
  ) {
    try {
      const url = new URL(logoPath)
      url.searchParams.set('v', String(cacheKey))
      return url.toString()
    } catch {
      return logoPath
    }
  }

  const { data } = supabase.storage
    .from(LOGO_BUCKET)
    .getPublicUrl(logoPath)
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
      <div
        className={`${sizeClass} shrink-0 flex items-center justify-center bg-transparent`}
      >
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
 * Shows club identity, current competition summary, coins, notifications, and profile menu.
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
  const { t } = useTranslation('navigation')
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0)

  const [liveClubName, setLiveClubName] = useState(
    clubName || title || 'ProPeloton Manager',
  )
  const [liveClubId, setLiveClubId] = useState<string | undefined>(
    clubId,
  )
  const [
    liveClubCountryName,
    setLiveClubCountryName,
  ] = useState(clubCountryName || t('header.clubCountry'))
  const [
    liveClubCountryCode,
    setLiveClubCountryCode,
  ] = useState<string | undefined>(clubCountryCode)
  const [liveLogoPath, setLiveLogoPath] = useState<string | null>(
    clubLogoUrl ?? null,
  )
  const [logoCacheKey, setLogoCacheKey] = useState(() => Date.now())
  const [
    currentUserId,
    setCurrentUserId,
  ] = useState<string | undefined>(undefined)
  const [lastClubUpdateMs, setLastClubUpdateMs] = useState(0)
  const [
    teamCompetitionSummary,
    setTeamCompetitionSummary,
  ] = useState<TeamCompetitionSummary | null>(null)
  const [
    clubDisplayIdentity,
    setClubDisplayIdentity,
  ] = useState<ClubDisplayIdentity | null>(null)
  const [identityRefreshKey, setIdentityRefreshKey] = useState(0)
  const [isPremium, setIsPremium] = useState(false)
  const [isPremiumStatusLoading, setIsPremiumStatusLoading] =
    useState(true)

  const liveClubIdRef = useRef<string | undefined>(clubId)
  const authoritativeClubIdRef = useRef<string | undefined>(clubId)
  const competitionRequestVersionRef = useRef(0)
  const currentUserIdRef = useRef<string | undefined>(undefined)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  /**
   * applyClubUpdatePayload
   * Apply an incoming main-club payload only if it's fresh and relevant.
   */
  const applyClubUpdatePayload = useCallback(
    (payload: ClubUpdatePayload | null) => {
      if (!payload) return

      // Ignore developing clubs in header context.
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

        if (
          payload.id &&
          expectedClubId &&
          payload.id !== expectedClubId
        ) {
          return previous
        }

        if (
          payload.owner_user_id &&
          expectedUserId &&
          payload.owner_user_id !== expectedUserId
        ) {
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

        if (
          Object.prototype.hasOwnProperty.call(
            payload,
            'logo_path',
          )
        ) {
          setLiveLogoPath(payload.logo_path ?? null)
          setLogoCacheKey(Date.now())
        }

        // Any accepted main-club update can affect the display identity.
        setIdentityRefreshKey(key => key + 1)

        return payload.updated_at_ms!
      })
    },
    [],
  )

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
      // Ignore invalid localStorage payload.
    }
  }, [applyClubUpdatePayload])

  // Keep liveClubId in sync with the authoritative MainLayout prop.
  useEffect(() => {
    authoritativeClubIdRef.current = clubId
    setLiveClubId(clubId)

    // Never keep showing the previous club's competition while a new club loads.
    setTeamCompetitionSummary(null)
  }, [clubId])

  // Track latest club + user ids for payload filtering.
  useEffect(() => {
    liveClubIdRef.current = liveClubId
  }, [liveClubId])

  useEffect(() => {
    currentUserIdRef.current = currentUserId
  }, [currentUserId])

  // Load current user id once.
  useEffect(() => {
    let mounted = true

    async function loadCurrentUserId() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!mounted) return
      setCurrentUserId(user?.id)
    }

    void loadCurrentUserId()

    return () => {
      mounted = false
    }
  }, [])

  // Sync visible club name + country from props.
  useEffect(() => {
    setLiveClubName(
      clubName || title || 'ProPeloton Manager',
    )
  }, [clubName, title])

  useEffect(() => {
    setLiveClubCountryName(
      clubCountryName || t('header.clubCountry'),
    )
  }, [clubCountryName, t])

  useEffect(() => {
    setLiveClubCountryCode(clubCountryCode)
  }, [clubCountryCode])

  useEffect(() => {
    setLiveLogoPath(clubLogoUrl ?? null)
    setLogoCacheKey(Date.now())
  }, [clubLogoUrl])

  // Listen for club-updated + storage events to keep header live.
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
        const parsed = JSON.parse(
          event.newValue,
        ) as ClubUpdatePayload
        applyClubUpdatePayload(parsed)
      } catch {
        // Ignore invalid storage payload.
      }
    }

    window.addEventListener(
      'club-updated',
      handleClubUpdated as EventListener,
    )
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener(
        'club-updated',
        handleClubUpdated as EventListener,
      )
      window.removeEventListener('storage', handleStorage)
    }
  }, [applyClubUpdatePayload, loadMainClubFromStorage])

  const baseClubName =
    liveClubName ||
    clubName ||
    title ||
    'ProPeloton Manager'
  const displayName =
    clubDisplayIdentity?.display_name ||
    clubDisplayIdentity?.season_display_name ||
    baseClubName
  const originalClubName =
    clubDisplayIdentity?.original_club_name || baseClubName
  const fullDisplayName =
    clubDisplayIdentity?.full_display_name || displayName
  const isNamingRightsDisplay = Boolean(
    clubDisplayIdentity?.locked_by_sponsor &&
      clubDisplayIdentity?.season_display_name &&
      clubDisplayIdentity.season_display_name !==
        originalClubName,
  )

  const displayCountry =
    liveClubCountryName ||
    clubCountryName ||
    t('header.clubCountry')
  const effectiveCountryCode =
    liveClubCountryCode || clubCountryCode
  const effectiveLogoUrl = resolveClubLogoUrl(
    liveLogoPath ?? clubLogoUrl ?? null,
    logoCacheKey,
  )

  const displayUserName = userName || t('header.manager')
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
    [onNavigate],
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
  const shouldDisplayNotification = useCallback(
    (item: NotificationItem) => {
      const preferences = readNotificationPreferences()
      return canReceiveNotificationItem(preferences, item)
    },
    [],
  )

  /**
   * loadClubDisplayIdentity
   * Central team-name resolver for sponsor naming-rights.
   *
   * Do not show public.clubs.name directly in the header. The visible team name must
   * come from get_club_display_identity_v1 so naming-rights deals can rename the team
   * across the whole game without permanently overwriting the original club name.
   */
  const loadClubDisplayIdentity = useCallback(
    async () => {
      if (!liveClubId) {
        setClubDisplayIdentity(null)
        return
      }

      const { data, error } = await supabase.rpc(
        'get_club_display_identity_v1',
        {
          p_club_id: liveClubId,
        },
      )

      if (error) {
        // eslint-disable-next-line no-console
        console.error(
          'Failed to load club display identity:',
          error,
        )
        setClubDisplayIdentity(null)
        return
      }

      const row = Array.isArray(data) ? data[0] : data

      if (!row) {
        setClubDisplayIdentity(null)
        return
      }

      setClubDisplayIdentity({
        club_id: String(
          row.club_id ?? liveClubId,
        ),
        base_name: row.base_name
          ? String(row.base_name)
          : null,
        display_name: row.display_name
          ? String(row.display_name)
          : null,
        season_display_name:
          row.season_display_name
            ? String(row.season_display_name)
            : null,
        original_club_name:
          row.original_club_name
            ? String(row.original_club_name)
            : null,
        full_display_name:
          row.full_display_name
            ? String(row.full_display_name)
            : null,
        locked_by_sponsor: Boolean(
          row.locked_by_sponsor,
        ),
        locked_until_game_date:
          row.locked_until_game_date
            ? String(row.locked_until_game_date)
            : null,
        source_sponsor_id: row.source_sponsor_id
          ? String(row.source_sponsor_id)
          : null,
      })
    },
    [liveClubId],
  )

  /**
   * loadTeamCompetitionSummary
   * Fetch and cache the authoritative main club's current competition + rank.
   *
   * IMPORTANT:
   * - Use the clubId prop from MainLayout, not liveClubId. liveClubId can be
   *   hydrated from localStorage while the layout is still loading and may
   *   temporarily refer to a previous/stale club.
   * - Ignore older async responses so a slower request for a previous club
   *   can never overwrite the current club's competition label.
   */
  const loadTeamCompetitionSummary = useCallback(
    async () => {
      const requestedClubId = clubId
      const requestVersion = ++competitionRequestVersionRef.current

      if (!requestedClubId) {
        setTeamCompetitionSummary(null)
        return
      }

      const { data, error } = await supabase.rpc(
        'get_club_ranking_summary',
        {
          p_club_id: requestedClubId,
        },
      )

      const isStaleResponse =
        requestVersion !== competitionRequestVersionRef.current ||
        authoritativeClubIdRef.current !== requestedClubId

      if (isStaleResponse) {
        return
      }

      if (error) {
        // eslint-disable-next-line no-console
        console.error(
          'Failed to load team competition summary:',
          error,
        )
        setTeamCompetitionSummary(null)
        return
      }

      const row = Array.isArray(data) ? data[0] : data

      if (!row) {
        setTeamCompetitionSummary(null)
        return
      }

      const competitionLabel = String(
        row.competition_label ?? '',
      ).trim()
      const rankPosition = Number(
        row.rank_position ?? 0,
      )

      if (
        !competitionLabel ||
        !Number.isFinite(rankPosition) ||
        rankPosition <= 0
      ) {
        setTeamCompetitionSummary(null)
        return
      }

      setTeamCompetitionSummary({
        competition_label: competitionLabel,
        rank_position: rankPosition,
      })
    },
    [clubId],
  )

  /**
   * loadPremiumStatus
   * Resolve the signed-in user's current Premium membership.
   */
  const loadPremiumStatus = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      'get_my_premium_status',
    )

    if (error) {
      // eslint-disable-next-line no-console
      console.error(
        'Failed to load Premium status:',
        error,
      )
      setIsPremium(false)
      setIsPremiumStatusLoading(false)
      return
    }

    if (typeof data === 'boolean') {
      setIsPremium(data)
      setIsPremiumStatusLoading(false)
      return
    }

    const row = (
      Array.isArray(data) ? data[0] : data
    ) as PremiumStatusRow | null

    const accessUntilMs = row?.access_until
      ? Date.parse(row.access_until)
      : Number.NaN

    const hasCurrentAccessUntil =
      Number.isFinite(accessUntilMs) &&
      accessUntilMs > Date.now()

    const hasActiveStripeStatus = [
      'trialing',
      'active',
      'past_due',
    ].includes(
      String(row?.stripe_status ?? '').toLowerCase(),
    )

    const resolvedIsPremium = Boolean(
      row?.is_premium ??
        row?.premium_active ??
        row?.has_premium ??
        row?.active ??
        (hasActiveStripeStatus && hasCurrentAccessUntil),
    )

    setIsPremium(resolvedIsPremium)
    setIsPremiumStatusLoading(false)
  }, [])

  /**
   * loadUnreadCount
   * Fetch unread notifications count via RPC.
   */
  const loadUnreadCount = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      'get_my_notifications',
      {
        p_status: 'unread',
        p_page: 1,
        p_page_size: 200,
      },
    )

    if (error) {
      // eslint-disable-next-line no-console
      console.error(
        'Failed to load unread notification count:',
        error,
      )
      return
    }

    const unread = ((data ?? []) as NotificationItem[]).filter(
      shouldDisplayNotification,
    )
    setUnreadCount(unread.length)
  }, [shouldDisplayNotification])

  /**
   * loadInboxUnreadCount
   * Fetch inbox threads and compute unread total.
   */
  const loadInboxUnreadCount = useCallback(
    async () => {
      const { data, error } = await supabase.rpc(
        'inbox_list_threads',
      )

      if (error) {
        // eslint-disable-next-line no-console
        console.error(
          'Failed to load inbox unread count:',
          error,
        )
        return
      }

      const threads = (data ?? []) as InboxThreadRow[]
      const unread = threads.reduce(
        (sum, thread) =>
          sum +
          Math.max(
            Number(thread.unread_count ?? 0),
            0,
          ),
        0,
      )

      setInboxUnreadCount(unread)
    },
    [],
  )

  // Load display identity whenever the club id or identityRefreshKey changes.
  useEffect(() => {
    void loadClubDisplayIdentity()
  }, [loadClubDisplayIdentity, identityRefreshKey])

  // Load competition summary for the authoritative club and refresh after
  // accepted main-club updates (for example season/division changes).
  useEffect(() => {
    void loadTeamCompetitionSummary()
  }, [loadTeamCompetitionSummary, identityRefreshKey])

  // Load and periodically refresh Premium membership state.
  useEffect(() => {
    void loadPremiumStatus()

    const intervalId = window.setInterval(() => {
      void loadPremiumStatus()
    }, 60000)

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadPremiumStatus()
    })

    function handlePremiumStatusChanged() {
      void loadPremiumStatus()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void loadPremiumStatus()
      }
    }

    window.addEventListener(
      'premium-status-changed',
      handlePremiumStatusChanged,
    )
    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    return () => {
      window.clearInterval(intervalId)
      subscription.unsubscribe()
      window.removeEventListener(
        'premium-status-changed',
        handlePremiumStatusChanged,
      )
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
    }
  }, [loadPremiumStatus])

  // Poll notifications + inbox unread counts.
  useEffect(() => {
    void Promise.all([
      loadUnreadCount(),
      loadInboxUnreadCount(),
    ])

    const intervalId = window.setInterval(() => {
      void Promise.all([
        loadUnreadCount(),
        loadInboxUnreadCount(),
      ])
    }, 60000)

    const handleNotificationPreferencesUpdated = (): void => { void loadUnreadCount() }
    window.addEventListener('notification-preferences-updated', handleNotificationPreferencesUpdated)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('notification-preferences-updated', handleNotificationPreferencesUpdated)
    }
  }, [loadUnreadCount, loadInboxUnreadCount])

  // Close profile menu when clicking outside / pressing Escape.
  useEffect(() => {
    if (!isProfileMenuOpen) return

    void loadInboxUnreadCount()

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(target)
      ) {
        setIsProfileMenuOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false)
      }
    }

    document.addEventListener(
      'mousedown',
      handleClickOutside,
    )
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside,
      )
      document.removeEventListener(
        'keydown',
        handleEscape,
      )
    }
  }, [isProfileMenuOpen, loadInboxUnreadCount])

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-yellow-500 bg-yellow-400">
      <div className="flex items-center gap-4 min-w-0 shrink-0">
        <button
          onClick={onToggle}
          className="text-black p-2 rounded-md hover:bg-black/10"
          aria-label={t('header.toggleSidebar')}
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
            <div
              className="text-lg text-black leading-tight truncate"
              title={
                isNamingRightsDisplay
                  ? fullDisplayName
                  : displayName
              }
            >
              <span className="font-normal">
                {t('header.teamName')}{' '}
              </span>
              <span className="font-bold">
                {displayName}
              </span>
              {isNamingRightsDisplay ? (
                <span className="ml-2 rounded-full border border-black/20 bg-white/35 px-2 py-0.5 align-middle text-[11px] font-semibold text-black/80">
                  {t('header.namingRights')}
                </span>
              ) : null}
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
                  <span className="text-black/60">
                    -
                  </span>
                  <span>
                    {t('header.ranking', {
                      positionOrdinal: formatOrdinal(
                        teamCompetitionSummary.rank_position,
                      ),
                      positionNumber: String(
                        teamCompetitionSummary.rank_position,
                      ),
                      competition:
                        teamCompetitionSummary.competition_label,
                    })}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          data-tutorial-target="header-membership"
          onClick={() => {
            handleNavigate('/dashboard/pro')
          }}
          className={`inline-flex min-w-[104px] items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors ${
            isPremium
              ? 'border-black/20 bg-white/80 text-black hover:bg-white'
              : 'border-black/20 bg-white/45 text-black/75 hover:bg-white/65'
          }`}
          aria-label={
            isPremium
              ? t('header.premiumAccountMember')
              : t('header.freeAccountMember')
          }
          title={
            isPremium
              ? t('header.premiumAccount')
              : t('header.freeAccount')
          }
        >
          {isPremiumStatusLoading ? (
            <span>{t('header.account')}</span>
          ) : isPremium ? (
            <>
              <Crown size={15} aria-hidden="true" />
              <span>{t('header.premium')}</span>
            </>
          ) : (
            <span>{t('header.free')}</span>
          )}
        </button>

        <div
          data-tutorial-target="header-coins"
          className="rounded-md border border-black/35 bg-yellow-300/70 px-3 py-1.5 text-sm font-semibold text-black min-w-[130px] text-center"
        >
          ◎ {coinBalance.toLocaleString()}{' '}
          {coinBalance === 1
            ? t('header.coin')
            : t('header.coins')}
        </div>

        <button
          data-tutorial-target="header-notifications"
          className="relative text-black hover:opacity-80 p-2 rounded-md hover:bg-black/10"
          aria-label={t('header.notifications')}
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

        <div
          className="relative"
          ref={profileMenuRef}
        >
          <button
            type="button"
            data-tutorial-target="header-menu"
            onClick={() => {
              setIsProfileMenuOpen(prev => !prev)
            }}
            aria-label={t('header.openProfileMenu')}
            aria-haspopup="menu"
            aria-expanded={isProfileMenuOpen}
            className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-black/10"
          >
            <Settings
              size={18}
              className="text-black"
            />
            <span className="text-sm font-medium text-black">
              {t('header.menu')}
            </span>
          </button>

          {isProfileMenuOpen ? (
            <div
              role="menu"
              aria-label={t('header.profileMenu')}
              className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl z-50"
            >
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <div className="text-sm font-semibold text-black">
                  {displayUserName}
                </div>
                <div className="text-xs text-black/70">
                  {t('header.team')} {displayName}
                  {isNamingRightsDisplay ? (
                    <span
                      className="block truncate"
                      title={fullDisplayName}
                    >
                      {t('header.originalClub')}{' '}
                      {originalClubName}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="py-1">
                {profileMenuItems.map(item => {
                  const isInboxItem =
                    item.path ===
                    '/dashboard/inbox'

                  if (item.action === 'logout') {
                    return (
                      <button
                        key={item.labelKey}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          void handleLogoutClick()
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        {t(item.labelKey)}
                      </button>
                    )
                  }

                  return (
                    <button
                      key={item.labelKey}
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        item.path &&
                        handleNavigate(item.path)
                      }
                      className="w-full px-4 py-2.5 text-left text-sm text-black hover:bg-gray-100"
                    >
                      <span className="inline-flex items-center">
                        {t(item.labelKey)}

                        {isInboxItem &&
                        inboxUnreadCount > 0 ? (
                          <span className="ml-2 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                            {inboxUnreadCount >
                            99
                              ? '99+'
                              : inboxUnreadCount}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
