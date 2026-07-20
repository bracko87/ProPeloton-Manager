import React from 'react'

/**
 * NotificationItem
 * Shape of notification objects used in the notification center.
 */
export type NotificationItem = {
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
 * formatNotificationTime
 * Human-readable relative time for notification timestamps.
 */
export function formatNotificationTime(dateString?: string | null): string {
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

/**
 * formatMoney
 * Basic money formatter for structured notification payloads.
 */
export function formatMoney(value: unknown): string | null {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null
  return `$${numberValue.toLocaleString()}`
}

/**
 * formatLabel
 * Turn snake_case labels into human-readable text.
 */
export function formatLabel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}


function readPayloadString(
  payload: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return null
}

function readPayloadNumber(
  payload: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const value = payload[key]
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }

  return null
}

function normalizeDashboardRaceUrl(url: string | null): string | null {
  if (!url) return null
  if (url.startsWith('/races/')) return `/dashboard${url}`
  return url
}

function formatOrdinal(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null

  const integer = Math.trunc(value)
  const absolute = Math.abs(integer)
  const mod100 = absolute % 100

  if (mod100 >= 11 && mod100 <= 13) return `${integer}th`

  switch (absolute % 10) {
    case 1:
      return `${integer}st`
    case 2:
      return `${integer}nd`
    case 3:
      return `${integer}rd`
    default:
      return `${integer}th`
  }
}

type RaceResultEntry = {
  position: number | null
  riderName: string | null
  teamName: string | null
}

function getRaceResultEntries(
  payload: Record<string, unknown>,
  key: string
): RaceResultEntry[] {
  const raw = payload[key]
  if (!Array.isArray(raw)) return []

  return raw
    .map((entry): RaceResultEntry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return { position: null, riderName: null, teamName: null }
      }

      const record = entry as Record<string, unknown>

      return {
        position: readPayloadNumber(record, ['position', 'rank', 'place']),
        riderName: readPayloadString(record, [
          'rider_name',
          'riderName',
          'rider_full_name',
          'full_name',
          'name',
        ]),
        teamName: readPayloadString(record, [
          'team_name',
          'teamName',
          'club_name',
          'clubName',
        ]),
      }
    })
    .filter(entry => entry.position !== null || entry.riderName || entry.teamName)
}

function formatRaceResultEntry(
  entry: RaceResultEntry,
  includeTeam = false
): string | null {
  const position = formatOrdinal(entry.position)
  const rider = entry.riderName
  const team = includeTeam ? entry.teamName : null

  if (position && rider && team) return `${position} ${rider} (${team})`
  if (position && rider) return `${position} ${rider}`
  if (rider && team) return `${rider} (${team})`
  return rider || team || position
}

/**
 * getNotificationActionLabel
 * Human-friendly labels for primary notification actions.
 */
export function getNotificationActionLabel(item: NotificationItem): string {
  const payload = item.payload_json ?? {}
  const offerPath =
    typeof payload.offer_path === 'string' && payload.offer_path.trim()
      ? payload.offer_path
      : null

  if (item.type_code === 'TRANSFER_OFFER_RECEIVED') return 'Check offer'
  if (item.type_code === 'TRANSFER_OFFER_REJECTED') return 'Open transfers'
  if (item.type_code === 'TRANSFER_OFFER_ACCEPTED') return 'Open negotiation'

  if (item.type_code === 'RIDER_NEGOTIATION_OPENED') {
    return offerPath ? 'Review transfer' : 'Open negotiation'
  }

  if (item.type_code === 'FREE_AGENT_SIGNED') return 'Open free agents'
  if (item.type_code === 'RIDER_UNHAPPY') return 'Open rider'
  if (item.type_code === 'RIDER_CONTRACT_EXPIRING') return 'Open rider'
  if (item.type_code === 'RACE_STAGE_WEATHER_CANCELLED') return 'Open stage'
  if (item.type_code === 'RACE_WEATHER_CANCELLED') return 'Open race'
  if (item.type_code === 'RACE_RESULTS_SUMMARY') return 'Open race'
  return 'Open'
}

/**
 * getResolvedNotificationActionUrl
 * Determine the best target URL for a notification, using payload fallbacks.
 */
export function getResolvedNotificationActionUrl(item: NotificationItem): string | null {
  const payload = item.payload_json ?? {}

  const offerId =
    typeof payload.offer_id === 'string' && payload.offer_id.trim()
      ? payload.offer_id
      : null

  const negotiationId =
    typeof payload.negotiation_id === 'string' && payload.negotiation_id.trim()
      ? payload.negotiation_id
      : null

  const offerPath =
    typeof payload.offer_path === 'string' && payload.offer_path.trim()
      ? payload.offer_path
      : null

  if (item.type_code === 'TRANSFER_OFFER_RECEIVED') {
    if (offerPath) return offerPath
    if (offerId) {
      return `/dashboard/transfers?activity=outgoing&offerId=${offerId}`
    }
  }

  if (item.type_code === 'RIDER_NEGOTIATION_OPENED') {
    if (offerPath) return offerPath
    if (negotiationId) {
      return `/dashboard/transfers/negotiations/${negotiationId}`
    }
  }

  if (item.type_code === 'TRANSFER_OFFER_ACCEPTED' && negotiationId) {
    return `/dashboard/transfers/negotiations/${negotiationId}`
  }

  if (item.type_code === 'FREE_AGENT_SIGNED') {
    return '/dashboard/transfers?subTab=free_agents'
  }

  if (item.type_code === 'RIDER_UNHAPPY') {
    const directRiderUrl = readPayloadString(payload, [
      'my_rider_profile_path',
      'rider_profile_path',
      'profile_path',
    ])

    if (directRiderUrl) return directRiderUrl

    const riderId = readPayloadString(payload, ['rider_id'])
    if (riderId) return `/dashboard/my-riders/${riderId}`

    return (
      readPayloadString(payload, [
        'qr_page_path',
        'morale_page_path',
        'team_morale_path',
        'team_squad_path',
      ]) || '/dashboard/squad?focus=morale'
    )
  }

  if (item.type_code === 'RIDER_CONTRACT_EXPIRING') {
    const directRiderUrl = readPayloadString(payload, [
      'my_rider_profile_path',
      'rider_profile_path',
      'profile_path',
      'action_url',
    ])

    if (directRiderUrl) return directRiderUrl

    const riderId = readPayloadString(payload, ['rider_id'])
    if (riderId) return `/dashboard/my-riders/${riderId}`

    return '/dashboard/squad'
  }

  if (item.type_code === 'RACE_STAGE_WEATHER_CANCELLED') {
    const directStageUrl = readPayloadString(payload, [
      'stage_path',
      'stage_url',
      'stage_detail_path',
      'stage_results_path',
    ])

    if (directStageUrl) return directStageUrl

    const raceId = readPayloadString(payload, ['race_id'])
    const stageId = readPayloadString(payload, ['stage_id'])

    if (raceId && stageId) return `/dashboard/races/${raceId}?stageId=${stageId}`
    if (raceId) return `/dashboard/races/${raceId}`

    return normalizeDashboardRaceUrl(item.action_url)
  }

  if (item.type_code === 'RACE_WEATHER_CANCELLED') {
    const directRaceUrl = normalizeDashboardRaceUrl(
      readPayloadString(payload, [
        'race_path',
        'race_url',
        'race_detail_path',
        'action_url',
      ]) || item.action_url
    )

    if (directRaceUrl) return directRaceUrl

    const raceId = readPayloadString(payload, ['race_id'])
    if (raceId) return `/dashboard/races/${raceId}`

    return null
  }

  if (item.type_code === 'RACE_RESULTS_SUMMARY') {
    const directRaceUrl = normalizeDashboardRaceUrl(
      readPayloadString(payload, [
        'action_url',
        'race_url',
        'race_path',
        'race_profile_path',
        'race_detail_path',
      ]) || item.action_url
    )

    if (directRaceUrl) return directRaceUrl

    const raceId = readPayloadString(payload, ['race_id'])
    if (raceId) return `/dashboard/races/${raceId}`
  }

  return normalizeDashboardRaceUrl(item.action_url)
}

/**
 * renderExpandedNotificationText
 * Render structured details for specific notification types.
 */
export function renderExpandedNotificationText(
  item: NotificationItem
): JSX.Element | null {
  const payload = item.payload_json ?? {}

  if (item.type_code === 'SPONSOR_SELECTION_REQUIRED') {
    const seasonNumber = Number(payload.season_number)
    const insertedCount = Number(payload.inserted_count)
    const coverageMonths = Number(payload.coverage_months)

    return (
      <div className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
        {Number.isFinite(seasonNumber) ? (
          <div>
            Sponsor offers for <strong>season {seasonNumber}</strong> are now ready
            for review.
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
    const companyName =
      typeof payload.company_name === 'string' ? payload.company_name : null
    const sponsorKind =
      typeof payload.sponsor_kind === 'string'
        ? formatLabel(payload.sponsor_kind)
        : null
    const seasonNumber = Number(payload.season_number)
    const guaranteedAmount = formatMoney(payload.guaranteed_amount)
    const bonusPoolAmount = formatMoney(payload.bonus_pool_amount)

    return (
      <div className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
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
      <div className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
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
      typeof payload.asset_name === 'string'
        ? payload.asset_name
        : formatLabel(payload.target_key)

    const quantity = Number(payload.asset_quantity)

    return (
      <div className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
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
    const riderName =
      typeof payload.rider_name === 'string' ? payload.rider_name : null
    const offeredPrice = formatMoney(payload.offered_price)
    const askingPrice = formatMoney(payload.asking_price)
    const expiresOnGameDate =
      typeof payload.expires_on_game_date === 'string'
        ? payload.expires_on_game_date
        : null

    return (
      <div className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
        {riderName ? (
          <div>
            Rider: <strong>{riderName}</strong>
          </div>
        ) : null}

        {buyerClubName ? (
          <div>
            Offering club: <strong>{buyerClubName}</strong>
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

        {expiresOnGameDate ? (
          <div>
            Expires on: <strong>{expiresOnGameDate}</strong>
          </div>
        ) : null}
      </div>
    )
  }

  if (item.type_code === 'RIDER_NEGOTIATION_OPENED') {
    const riderName =
      typeof payload.rider_name === 'string' ? payload.rider_name : null
    const buyerClubName =
      typeof payload.buyer_club_name === 'string' ? payload.buyer_club_name : null
    const sellerClubName =
      typeof payload.seller_club_name === 'string'
        ? payload.seller_club_name
        : null
    const expectedSalaryWeekly = formatMoney(payload.expected_salary_weekly)
    const minAcceptableSalaryWeekly = formatMoney(
      payload.min_acceptable_salary_weekly
    )
    const preferredDurationSeasons = Number(payload.preferred_duration_seasons)

    return (
      <div className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
        {riderName ? (
          <div>
            Rider: <strong>{riderName}</strong>
          </div>
        ) : null}

        {buyerClubName ? (
          <div>
            Buyer club: <strong>{buyerClubName}</strong>
          </div>
        ) : null}

        {sellerClubName ? (
          <div>
            Seller club: <strong>{sellerClubName}</strong>
          </div>
        ) : null}

        {expectedSalaryWeekly ? (
          <div>
            Expected salary: <strong>{expectedSalaryWeekly}</strong>
          </div>
        ) : null}

        {minAcceptableSalaryWeekly ? (
          <div>
            Minimum acceptable salary: <strong>{minAcceptableSalaryWeekly}</strong>
          </div>
        ) : null}

        {Number.isFinite(preferredDurationSeasons) ? (
          <div>
            Preferred duration:{' '}
            <strong>
              {preferredDurationSeasons} season
              {preferredDurationSeasons === 1 ? '' : 's'}
            </strong>
          </div>
        ) : null}
      </div>
    )
  }

  if (item.type_code === 'TRANSFER_OFFER_REJECTED') {
    const riderName =
      typeof payload.rider_name === 'string' ? payload.rider_name : null
    const sellerClubName =
      typeof payload.seller_club_name === 'string'
        ? payload.seller_club_name
        : null
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

  if (item.type_code === 'FREE_AGENT_SIGNED') {
    const riderName =
      typeof payload.rider_name === 'string' ? payload.rider_name : null
    const salaryWeekly = formatMoney(payload.salary_weekly)
    const durationSeasons = Number.isFinite(Number(payload.duration_seasons))
      ? Number(payload.duration_seasons)
      : null
    const startsOn = typeof payload.starts_on === 'string' ? payload.starts_on : null
    const expiresOn =
      typeof payload.expires_on === 'string' ? payload.expires_on : null
    const startSeasonNumber = Number.isFinite(Number(payload.start_season_number))
      ? Number(payload.start_season_number)
      : null
    const endSeasonNumber = Number.isFinite(Number(payload.end_season_number))
      ? Number(payload.end_season_number)
      : null

    return (
      <div className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
        {riderName ? (
          <div>
            Rider: <strong>{riderName}</strong>
          </div>
        ) : null}

        {salaryWeekly ? (
          <div>
            Weekly salary: <strong>{salaryWeekly}</strong>
          </div>
        ) : null}

        {durationSeasons != null ? (
          <div>
            Contract length:{' '}
            <strong>
              {durationSeasons} season{durationSeasons === 1 ? '' : 's'}
            </strong>
          </div>
        ) : null}

        {startSeasonNumber != null ? (
          <div>
            Start season: <strong>{startSeasonNumber}</strong>
          </div>
        ) : null}

        {endSeasonNumber != null ? (
          <div>
            End season: <strong>{endSeasonNumber}</strong>
          </div>
        ) : null}

        {startsOn ? (
          <div>
            Starts on: <strong>{startsOn}</strong>
          </div>
        ) : null}

        {expiresOn ? (
          <div>
            Expires on: <strong>{expiresOn}</strong>
          </div>
        ) : null}
      </div>
    )
  }


  if (item.type_code === 'RACE_RESULTS_SUMMARY') {
    const raceName =
      readPayloadString(payload, ['race_name', 'race_title', 'name']) || 'this race'
    const stageName = readPayloadString(payload, [
      'stage_name',
      'stage_title',
      'result_stage_name',
    ])
    const stageNumber = readPayloadNumber(payload, [
      'stage_number',
      'result_stage_number',
    ])
    const bestResult = formatOrdinal(
      readPayloadNumber(payload, [
        'best_result_position',
        'best_position',
        'top_result_position',
      ])
    )
    const participantsCount = readPayloadNumber(payload, [
      'participants_count',
      'your_riders_count',
      'team_riders_count',
    ])
    const raceClass = readPayloadString(payload, [
      'race_class_code',
      'race_class',
      'class_code',
      'category',
    ])
    const stageLabel = stageName || (stageNumber !== null ? `Stage ${stageNumber}` : null)
    const topThree = getRaceResultEntries(payload, 'top_10')
      .slice(0, 3)
      .map(entry => formatRaceResultEntry(entry, true))
      .filter(Boolean)
      .join(' • ')
    const yourRiders = getRaceResultEntries(payload, 'your_riders')
      .slice(0, 5)
      .map(entry => formatRaceResultEntry(entry, false))
      .filter(Boolean)
      .join(' • ')

    return (
      <div className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
        <div>
          Results are available for <strong>{raceName}</strong>. Open the race page
          to review the full standings, top finishers, and your team results.
        </div>

        {stageLabel ? (
          <div>
            Stage: <strong>{stageLabel}</strong>
          </div>
        ) : null}

        {raceClass ? (
          <div>
            Race class: <strong>{raceClass}</strong>
          </div>
        ) : null}

        {bestResult ? (
          <div>
            Best team result: <strong>{bestResult}</strong>
          </div>
        ) : null}

        {Number.isFinite(participantsCount) ? (
          <div>
            Your riders listed: <strong>{participantsCount}</strong>
          </div>
        ) : null}

        {topThree ? (
          <div>
            Top 3: <strong>{topThree}</strong>
          </div>
        ) : null}

        {yourRiders ? (
          <div>
            Your rider results: <strong>{yourRiders}</strong>
          </div>
        ) : null}
      </div>
    )
  }

  return null
}