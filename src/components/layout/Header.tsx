/**
 * Header.tsx
 * Top header inside the in-game layout.
 *
 * UPDATE: Wallet support (refactor)
 * - Header keeps the Coins UI pill, but coinBalance is now received as a prop
 * - Header no longer queries user_wallets / no loadCoinBalance
 *
 * UPDATE: Rewarded ads header button
 * - Adds "Free Coin X/3" button next to the Coins pill
 * - Loads rewarded ad progress from get_my_rewarded_ad_status_v1()
 * - Starts rewarded ad session through Supabase Edge Function rewarded-ad-session
 * - Shows Google Ad Manager rewarded ad using Google Publisher Tag
 * - Completes the rewarded ad session only after Google grants the reward
 * - Every 3 completed ads grants +1 coin through the backend ledger/wallet system
 *
 * IMPORTANT:
 * - Replace GOOGLE_REWARDED_AD_UNIT_PATH with your real Google Ad Manager rewarded ad unit path.
 * - The current default path is Google's public rewarded-web example ad unit for testing only.
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
 * - Visible team name is resolved through get_club_display_identity_v1 so
 *   naming-rights sponsor names are shown globally without overwriting clubs.name.
 * - Use a separate key like ppm-active-squad-club elsewhere for squad-page
 *   tab behavior; do not reuse it here.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Gift, Settings, X } from 'lucide-react'
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

type RewardedAdStatus = {
  reward_date: string
  provider: string
  completed_ads_today: number
  daily_ad_limit: number
  reward_bundle_size: number
  reward_coins_per_bundle: number
  coins_granted_today: number
  progress_ads_in_current_bundle: number
  ads_needed_for_next_coin: number
  can_watch: boolean
  cooldown_seconds: number
  wait_seconds: number
  next_ad_unlock_at: string | null
  remaining_ads_today: number
}

type RewardedAdStartResult = {
  can_start: boolean
  session_key: string | null
  reason: string
  wait_seconds: number
  completed_ads_today: number
  daily_ad_limit: number
  ads_needed_for_next_coin: number
}

type RewardedAdCompleteResult = {
  success: boolean
  reason: string
  coin_delta: number
  completed_ads_today: number
  coins_granted_today: number
  ads_needed_for_next_coin: number
  balance: number
}

type RewardedAdFunctionResponse<T> = {
  ok?: boolean
  result?: T
  error?: string
}

type GoogleRewardedAdResult = {
  rewarded: boolean
  providerEventId: string
  payloadJson: Record<string, unknown>
  reason?: string
}

type GoogleRewardPayload = {
  type?: string
  amount?: number
  [key: string]: unknown
}

type GoogleRewardedSlot = {
  addService?: (service: unknown) => GoogleRewardedSlot
  getSlotElementId?: () => string
}

type GoogleRewardedEvent = {
  slot?: GoogleRewardedSlot
  makeRewardedVisible?: () => void
  payload?: GoogleRewardPayload
}

type GooglePubAdsService = {
  addEventListener?: (eventName: string, callback: (event: GoogleRewardedEvent) => void) => void
}

type GoogleTag = {
  cmd: Array<() => void>
  enums?: {
    OutOfPageFormat?: {
      REWARDED?: unknown
    }
  }
  defineOutOfPageSlot?: (adUnitPath: string, format: unknown) => GoogleRewardedSlot | null
  pubads?: () => GooglePubAdsService
  enableServices?: () => void
  display?: (slot: GoogleRewardedSlot) => void
  destroySlots?: (slots?: GoogleRewardedSlot[]) => boolean
}

declare global {
  interface Window {
    googletag?: GoogleTag
  }
}

const LOGO_BUCKET = 'club-logos'
const MAIN_CLUB_STORAGE_KEY = 'ppm-main-club'

/**
 * Replace this with your real Google Ad Manager rewarded ad unit path.
 * This Google example unit is only for testing the technical flow.
 */
const GOOGLE_REWARDED_AD_UNIT_PATH = '/22639388115/rewarded_web_example'
const GOOGLE_PUBLISHER_TAG_SCRIPT_ID = 'google-publisher-tag-script'
const GOOGLE_PUBLISHER_TAG_SCRIPT_SRC = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js'

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

function normalizeRewardedAdStatus(row: any): RewardedAdStatus {
  return {
    reward_date: String(row?.reward_date ?? ''),
    provider: String(row?.provider ?? 'google_ad_manager'),
    completed_ads_today: Number(row?.completed_ads_today ?? 0),
    daily_ad_limit: Number(row?.daily_ad_limit ?? 6),
    reward_bundle_size: Number(row?.reward_bundle_size ?? 3),
    reward_coins_per_bundle: Number(row?.reward_coins_per_bundle ?? 1),
    coins_granted_today: Number(row?.coins_granted_today ?? 0),
    progress_ads_in_current_bundle: Number(row?.progress_ads_in_current_bundle ?? 0),
    ads_needed_for_next_coin: Number(row?.ads_needed_for_next_coin ?? 3),
    can_watch: Boolean(row?.can_watch),
    cooldown_seconds: Number(row?.cooldown_seconds ?? 60),
    wait_seconds: Number(row?.wait_seconds ?? 0),
    next_ad_unlock_at: row?.next_ad_unlock_at ? String(row.next_ad_unlock_at) : null,
    remaining_ads_today: Number(row?.remaining_ads_today ?? 0),
  }
}

function getRewardedAdStatusLabel(status: RewardedAdStatus | null) {
  if (!status) return 'Free Coin'

  if (status.completed_ads_today >= status.daily_ad_limit || status.remaining_ads_today <= 0) {
    return 'Daily limit'
  }

  const bundleSize = Math.max(status.reward_bundle_size, 1)
  const progress = Math.max(status.progress_ads_in_current_bundle, 0)

  return `Free Coin ${progress}/${bundleSize}`
}

function getRewardedAdStatusTitle(status: RewardedAdStatus | null) {
  if (!status) return 'Watch rewarded ads to earn free coins.'

  if (status.completed_ads_today >= status.daily_ad_limit || status.remaining_ads_today <= 0) {
    return `Daily limit reached: ${status.completed_ads_today}/${status.daily_ad_limit} ads watched today.`
  }

  if (status.wait_seconds > 0) {
    return `Please wait ${status.wait_seconds}s before watching another ad.`
  }

  return `Watch ${status.ads_needed_for_next_coin} more rewarded ad${
    status.ads_needed_for_next_coin === 1 ? '' : 's'
  } to receive ${status.reward_coins_per_bundle} Coin.`
}

function ensureGooglePublisherTagScript() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('Rewarded ads are only available in the browser.'))
      return
    }

    window.googletag = window.googletag || { cmd: [] }

    const existingScript = document.getElementById(
      GOOGLE_PUBLISHER_TAG_SCRIPT_ID
    ) as HTMLScriptElement | null

    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        resolve()
        return
      }

      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Failed to load Google Publisher Tag script.')),
        { once: true }
      )
      return
    }

    const script = document.createElement('script')
    script.id = GOOGLE_PUBLISHER_TAG_SCRIPT_ID
    script.src = GOOGLE_PUBLISHER_TAG_SCRIPT_SRC
    script.async = true

    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true'
        resolve()
      },
      { once: true }
    )

    script.addEventListener(
      'error',
      () => {
        reject(new Error('Failed to load Google Publisher Tag script.'))
      },
      { once: true }
    )

    document.head.appendChild(script)
  })
}

/**
 * showGoogleRewardedAd
 * Opens a Google Ad Manager rewarded ad and resolves only after the ad closes.
 * Reward is considered valid only if Google emits rewardedSlotGranted.
 */
async function showGoogleRewardedAd(): Promise<GoogleRewardedAdResult> {
  await ensureGooglePublisherTagScript()

  return new Promise<GoogleRewardedAdResult>((resolve, reject) => {
    const googletag = window.googletag

    if (!googletag || !googletag.cmd) {
      reject(new Error('Google Publisher Tag is not available.'))
      return
    }

    let settled = false
    let rewardedSlot: GoogleRewardedSlot | null = null
    let grantedPayload: GoogleRewardPayload | null = null

    const providerEventId = `gam_reward_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 10)}`

    const finish = (result: GoogleRewardedAdResult) => {
      if (settled) return
      settled = true

      try {
        if (rewardedSlot && googletag.destroySlots) {
          googletag.destroySlots([rewardedSlot])
        }
      } catch {
        // Ignore GPT cleanup errors.
      }

      resolve(result)
    }

    const fail = (message: string) => {
      if (settled) return
      settled = true

      try {
        if (rewardedSlot && googletag.destroySlots) {
          googletag.destroySlots([rewardedSlot])
        }
      } catch {
        // Ignore GPT cleanup errors.
      }

      reject(new Error(message))
    }

    const timeoutId = window.setTimeout(() => {
      fail('Rewarded ad did not become available. Please try again later.')
    }, 20000)

    googletag.cmd.push(() => {
      try {
        const rewardedFormat = googletag.enums?.OutOfPageFormat?.REWARDED

        if (!rewardedFormat || !googletag.defineOutOfPageSlot) {
          window.clearTimeout(timeoutId)
          fail('Google rewarded ad format is not available.')
          return
        }

        rewardedSlot = googletag.defineOutOfPageSlot(
          GOOGLE_REWARDED_AD_UNIT_PATH,
          rewardedFormat
        )

        if (!rewardedSlot) {
          window.clearTimeout(timeoutId)
          fail('Rewarded ad slot could not be created.')
          return
        }

        const pubads = googletag.pubads?.()

        if (!pubads || !pubads.addEventListener) {
          window.clearTimeout(timeoutId)
          fail('Google Publisher Tag pubads service is not available.')
          return
        }

        rewardedSlot.addService?.(pubads)

        pubads.addEventListener('rewardedSlotReady', event => {
          if (event.slot !== rewardedSlot) return

          window.clearTimeout(timeoutId)

          try {
            event.makeRewardedVisible?.()
          } catch {
            fail('Rewarded ad could not be displayed.')
          }
        })

        pubads.addEventListener('rewardedSlotGranted', event => {
          if (event.slot !== rewardedSlot) return
          grantedPayload = event.payload || { type: 'coin', amount: 1 }
        })

        pubads.addEventListener('rewardedSlotClosed', event => {
          if (event.slot !== rewardedSlot) return

          finish({
            rewarded: Boolean(grantedPayload),
            providerEventId,
            payloadJson: {
              provider: 'google_ad_manager',
              ad_unit_path: GOOGLE_REWARDED_AD_UNIT_PATH,
              provider_event_id: providerEventId,
              reward_payload: grantedPayload,
              closed_at: new Date().toISOString(),
            },
            reason: grantedPayload ? 'reward_granted' : 'closed_without_reward',
          })
        })

        googletag.enableServices?.()
        googletag.display?.(rewardedSlot)
      } catch (error) {
        window.clearTimeout(timeoutId)
        fail(error instanceof Error ? error.message : 'Rewarded ad failed.')
      }
    })
  })
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
  const [clubDisplayIdentity, setClubDisplayIdentity] = useState<ClubDisplayIdentity | null>(null)
  const [identityRefreshKey, setIdentityRefreshKey] = useState(0)

  const [rewardedAdStatus, setRewardedAdStatus] = useState<RewardedAdStatus | null>(null)
  const [isRewardedAdModalOpen, setIsRewardedAdModalOpen] = useState(false)
  const [isRewardedAdLoading, setIsRewardedAdLoading] = useState(false)
  const [rewardedAdMessage, setRewardedAdMessage] = useState<string | null>(null)
  const [rewardedAdError, setRewardedAdError] = useState<string | null>(null)

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

      // Any accepted main-club update can affect the display identity.
      // When a naming-rights sponsor is active, the base club name may change
      // in storage, but the visible team name still comes from the seasonal identity RPC.
      setIdentityRefreshKey(key => key + 1)

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

  const baseClubName = liveClubName || clubName || title || 'ProPeloton Manager'
  const displayName =
    clubDisplayIdentity?.display_name ||
    clubDisplayIdentity?.season_display_name ||
    baseClubName
  const originalClubName = clubDisplayIdentity?.original_club_name || baseClubName
  const fullDisplayName = clubDisplayIdentity?.full_display_name || displayName
  const isNamingRightsDisplay = Boolean(
    clubDisplayIdentity?.locked_by_sponsor &&
      clubDisplayIdentity?.season_display_name &&
      clubDisplayIdentity.season_display_name !== originalClubName
  )
  const displayCountry = liveClubCountryName || clubCountryName || 'Club country'
  const effectiveCountryCode = liveClubCountryCode || clubCountryCode
  const effectiveLogoUrl = resolveClubLogoUrl(liveLogoPath ?? clubLogoUrl ?? null, logoCacheKey)

  const displayUserName = userName || 'Manager'
  const flagUrl = getFlagImageUrl(effectiveCountryCode)
  const fallbackLetter = getFallbackLetter(displayName)

  const rewardedAdButtonLabel = useMemo(
    () => getRewardedAdStatusLabel(rewardedAdStatus),
    [rewardedAdStatus]
  )

  const rewardedAdButtonTitle = useMemo(
    () => getRewardedAdStatusTitle(rewardedAdStatus),
    [rewardedAdStatus]
  )

  const isRewardedAdDailyLimitReached = Boolean(
    rewardedAdStatus &&
      (rewardedAdStatus.completed_ads_today >= rewardedAdStatus.daily_ad_limit ||
        rewardedAdStatus.remaining_ads_today <= 0)
  )

  const isRewardedAdCooldownActive = Boolean(
    rewardedAdStatus && rewardedAdStatus.wait_seconds > 0
  )

  const isRewardedAdButtonDisabled =
    isRewardedAdLoading || isRewardedAdDailyLimitReached || isRewardedAdCooldownActive

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

  /**
   * loadClubDisplayIdentity
   * Central team-name resolver for sponsor naming-rights.
   *
   * Do not show public.clubs.name directly in the header. The visible team name must
   * come from get_club_display_identity_v1 so naming-rights deals can rename the team
   * across the whole game without permanently overwriting the original club name.
   */
  const loadClubDisplayIdentity = useCallback(async () => {
    if (!liveClubId) {
      setClubDisplayIdentity(null)
      return
    }

    const { data, error } = await supabase.rpc('get_club_display_identity_v1', {
      p_club_id: liveClubId,
    })

    if (error) {
      console.error('Failed to load club display identity:', error)
      setClubDisplayIdentity(null)
      return
    }

    const row = Array.isArray(data) ? data[0] : data

    if (!row) {
      setClubDisplayIdentity(null)
      return
    }

    setClubDisplayIdentity({
      club_id: String(row.club_id ?? liveClubId),
      base_name: row.base_name ? String(row.base_name) : null,
      display_name: row.display_name ? String(row.display_name) : null,
      season_display_name: row.season_display_name ? String(row.season_display_name) : null,
      original_club_name: row.original_club_name ? String(row.original_club_name) : null,
      full_display_name: row.full_display_name ? String(row.full_display_name) : null,
      locked_by_sponsor: Boolean(row.locked_by_sponsor),
      locked_until_game_date: row.locked_until_game_date ? String(row.locked_until_game_date) : null,
      source_sponsor_id: row.source_sponsor_id ? String(row.source_sponsor_id) : null,
    })
  }, [liveClubId])

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
   * loadRewardedAdStatus
   * Fetch current user's rewarded-ad progress.
   */
  const loadRewardedAdStatus = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_rewarded_ad_status_v1')

    if (error) {
      console.error('Failed to load rewarded ad status:', error)
      setRewardedAdStatus(null)
      return
    }

    const row = Array.isArray(data) ? data[0] : data

    if (!row) {
      setRewardedAdStatus(null)
      return
    }

    setRewardedAdStatus(normalizeRewardedAdStatus(row))
  }, [])

  /**
   * callRewardedAdSessionFunction
   * Calls Supabase Edge Function rewarded-ad-session.
   */
  const callRewardedAdSessionFunction = useCallback(
    async <T,>(body: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke<RewardedAdFunctionResponse<T>>(
        'rewarded-ad-session',
        {
          body,
        }
      )

      if (error) {
        throw new Error(error.message || 'Rewarded ad function failed.')
      }

      if (!data?.ok || !data.result) {
        throw new Error(data?.error || 'Rewarded ad function returned an invalid response.')
      }

      return data.result
    },
    []
  )

  /**
   * handleRewardedAdClick
   * Open confirmation modal.
   */
  const handleRewardedAdClick = useCallback(() => {
    setRewardedAdError(null)
    setRewardedAdMessage(null)
    setIsRewardedAdModalOpen(true)
  }, [])

  /**
   * handleWatchRewardedAd
   * Full flow:
   * 1. Start backend session
   * 2. Show Google rewarded ad
   * 3. Complete backend session only if Google grants reward
   */
  const handleWatchRewardedAd = useCallback(async () => {
    if (isRewardedAdLoading) return

    setRewardedAdError(null)
    setRewardedAdMessage(null)
    setIsRewardedAdLoading(true)

    try {
      const startResult = await callRewardedAdSessionFunction<RewardedAdStartResult>({
        action: 'start',
        ad_unit_code: 'rewarded_header_v1',
      })

      if (!startResult.can_start || !startResult.session_key) {
        if (startResult.reason === 'cooldown_active') {
          setRewardedAdError(`Please wait ${startResult.wait_seconds}s before watching another ad.`)
        } else if (startResult.reason === 'daily_limit_reached') {
          setRewardedAdError('You reached the daily rewarded ads limit.')
        } else if (startResult.reason === 'ip_daily_limit_reached') {
          setRewardedAdError('Too many rewarded ads were watched from this network today.')
        } else if (startResult.reason === 'active_session_exists') {
          setRewardedAdError('A rewarded ad session is already active. Please wait and try again.')
        } else {
          setRewardedAdError(`Rewarded ad cannot start: ${startResult.reason}`)
        }

        await loadRewardedAdStatus()
        return
      }

      setRewardedAdMessage('Loading rewarded ad...')

      const googleResult = await showGoogleRewardedAd()

      if (!googleResult.rewarded) {
        setRewardedAdMessage(null)
        setRewardedAdError('Ad closed before the reward was granted. No coin progress was added.')
        await loadRewardedAdStatus()
        return
      }

      setRewardedAdMessage('Reward confirmed. Updating coins...')

      const completeResult = await callRewardedAdSessionFunction<RewardedAdCompleteResult>({
        action: 'complete',
        session_key: startResult.session_key,
        provider_event_id: googleResult.providerEventId,
        payload_json: googleResult.payloadJson,
      })

      if (!completeResult.success) {
        setRewardedAdMessage(null)
        setRewardedAdError(`Reward could not be completed: ${completeResult.reason}`)
        await loadRewardedAdStatus()
        return
      }

      if (completeResult.coin_delta > 0) {
        setRewardedAdMessage(
          `Reward complete: +${completeResult.coin_delta} Coin added. Balance: ${completeResult.balance}.`
        )
      } else {
        setRewardedAdMessage(
          `Ad completed. ${completeResult.ads_needed_for_next_coin} more ad${
            completeResult.ads_needed_for_next_coin === 1 ? '' : 's'
          } needed for the next Coin.`
        )
      }

      await loadRewardedAdStatus()
    } catch (error) {
      console.error('Rewarded ad flow failed:', error)
      setRewardedAdMessage(null)
      setRewardedAdError(
        error instanceof Error
          ? error.message
          : 'Rewarded ad failed. Please try again later.'
      )
      await loadRewardedAdStatus()
    } finally {
      setIsRewardedAdLoading(false)
    }
  }, [
    callRewardedAdSessionFunction,
    isRewardedAdLoading,
    loadRewardedAdStatus,
  ])

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
    void loadClubDisplayIdentity()
  }, [loadClubDisplayIdentity, identityRefreshKey])

  useEffect(() => {
    void loadTeamCompetitionSummary()
  }, [loadTeamCompetitionSummary])

  useEffect(() => {
    void loadRewardedAdStatus()
  }, [loadRewardedAdStatus])

  useEffect(() => {
    if (!rewardedAdStatus || rewardedAdStatus.wait_seconds <= 0) return

    const intervalId = window.setInterval(() => {
      void loadRewardedAdStatus()
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadRewardedAdStatus, rewardedAdStatus])

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
              <div
                className="text-lg text-black leading-tight truncate"
                title={isNamingRightsDisplay ? fullDisplayName : displayName}
              >
                <span className="font-normal">Team Name: </span>
                <span className="font-bold">{displayName}</span>
                {isNamingRightsDisplay ? (
                  <span className="ml-2 rounded-full border border-black/20 bg-white/35 px-2 py-0.5 align-middle text-[11px] font-semibold text-black/80">
                    Naming rights
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
          <div
            data-tutorial-target="header-coins"
            className="rounded-md border border-black/35 bg-yellow-300/70 px-3 py-1.5 text-sm font-semibold text-black min-w-[130px] text-center"
          >
            ◎ {coinBalance.toLocaleString()} Coins
          </div>

          <button
            type="button"
            data-tutorial-target="header-rewarded-ads"
            onClick={handleRewardedAdClick}
            disabled={isRewardedAdButtonDisabled}
            title={rewardedAdButtonTitle}
            className={`inline-flex min-w-[142px] items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
              isRewardedAdButtonDisabled
                ? 'cursor-not-allowed border-black/20 bg-white/30 text-black/45'
                : 'border-black/35 bg-white/70 text-black hover:bg-white'
            }`}
          >
            <Gift size={16} />
            <span>
              {isRewardedAdLoading
                ? 'Loading...'
                : isRewardedAdCooldownActive
                  ? `${rewardedAdStatus?.wait_seconds ?? 0}s`
                  : rewardedAdButtonLabel}
            </span>
          </button>

          <button
            data-tutorial-target="header-notifications"
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
              data-tutorial-target="header-menu"
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
                  <div className="text-xs text-black/70">
                    Team: {displayName}
                    {isNamingRightsDisplay ? (
                      <span className="block truncate" title={fullDisplayName}>
                        Original club: {originalClubName}
                      </span>
                    ) : null}
                  </div>
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

      {isRewardedAdModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 bg-yellow-400 px-5 py-4">
              <div className="flex items-center gap-2 text-black">
                <Gift size={20} />
                <h2 className="text-lg font-bold">Earn Free Coins</h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!isRewardedAdLoading) {
                    setIsRewardedAdModalOpen(false)
                  }
                }}
                disabled={isRewardedAdLoading}
                className="rounded-md p-1 text-black hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close rewarded ad modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-xl border border-yellow-500/60 bg-yellow-50 px-4 py-3 text-sm text-black">
                <div className="font-semibold">
                  Watch {rewardedAdStatus?.reward_bundle_size ?? 3} rewarded ads to receive{' '}
                  {rewardedAdStatus?.reward_coins_per_bundle ?? 1} Coin.
                </div>
                <div className="mt-1 text-black/75">
                  Progress today:{' '}
                  <span className="font-semibold">
                    {rewardedAdStatus?.completed_ads_today ?? 0}/
                    {rewardedAdStatus?.daily_ad_limit ?? 6}
                  </span>{' '}
                  ads watched,{' '}
                  <span className="font-semibold">
                    {rewardedAdStatus?.coins_granted_today ?? 0}
                  </span>{' '}
                  Coins earned.
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
                <div>
                  Current bundle:{' '}
                  <span className="font-semibold">
                    {rewardedAdStatus?.progress_ads_in_current_bundle ?? 0}/
                    {rewardedAdStatus?.reward_bundle_size ?? 3}
                  </span>
                </div>
                <div>
                  Ads needed for next Coin:{' '}
                  <span className="font-semibold">
                    {rewardedAdStatus?.ads_needed_for_next_coin ?? 3}
                  </span>
                </div>
                <div>
                  Remaining ads today:{' '}
                  <span className="font-semibold">
                    {rewardedAdStatus?.remaining_ads_today ?? 0}
                  </span>
                </div>
              </div>

              {rewardedAdMessage ? (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
                  {rewardedAdMessage}
                </div>
              ) : null}

              {rewardedAdError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {rewardedAdError}
                </div>
              ) : null}

              {isRewardedAdDailyLimitReached ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  Daily rewarded ads limit reached. Please come back tomorrow.
                </div>
              ) : null}

              {isRewardedAdCooldownActive ? (
                <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                  Please wait {rewardedAdStatus?.wait_seconds ?? 0}s before watching another ad.
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!isRewardedAdLoading) {
                      setIsRewardedAdModalOpen(false)
                    }
                  }}
                  disabled={isRewardedAdLoading}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void handleWatchRewardedAd()
                  }}
                  disabled={isRewardedAdButtonDisabled}
                  className={`rounded-lg px-4 py-2 text-sm font-bold shadow-sm ${
                    isRewardedAdButtonDisabled
                      ? 'cursor-not-allowed bg-gray-300 text-gray-600'
                      : 'bg-yellow-400 text-black hover:bg-yellow-300'
                  }`}
                >
                  {isRewardedAdLoading
                    ? 'Loading Ad...'
                    : isRewardedAdCooldownActive
                      ? `Wait ${rewardedAdStatus?.wait_seconds ?? 0}s`
                      : 'Watch Ad'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}