/**
 * src/pages/dashboard/DevelopingTeam.tsx
 *
 * Developing Team page (dashboard/developing-team)
 *
 * Purpose:
 * - Render the Developing Team roster, widgets and modals.
 * - Show purchase / unlock status from get_developing_team_status().
 * - Allow movement between First Squad and Developing Team during movement windows.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import type {
  ChartPoint,
  ClubRosterRow,
  DevelopingTeamStatus,
  MoraleUiLabel,
  MovementWindowInfo,
  PotentialUiLabel,
  RenewalNegotiationData,
  RiderAvailabilityStatus,
  RiderDetails,
  RiderRole,
  TeamType,
} from '../../features/squad/types'
import {
  getMovementWindowInfo,
  getAgeFromBirthDate,
  normalizeGameDateValue,
  formatShortGameDate,
  getDaysRemaining,
  getContractExpiryUi,
  getRenewalStartLabel,
  isFutureDateTime,
} from '../../features/squad/utils/dates'
function getCountryName(countryCode?: string) {
  const code = countryCode?.trim().toUpperCase()

  if (!code) return 'Unknown'

  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

function getFlagImageUrl(countryCode?: string) {
  const code = countryCode?.trim().toLowerCase()

  if (!code || !/^[a-z]{2}$/.test(code)) return null

  return `https://flagcdn.com/24x18/${code}.png`
}

function CountryFlag({
  countryCode,
  className = 'h-4 w-5 rounded-sm object-cover',
}: {
  countryCode?: string
  className?: string
}) {
  const src = getFlagImageUrl(countryCode)
  const countryName = getCountryName(countryCode)
  const [hasError, setHasError] = useState(false)

  if (!src || hasError) {
    return <div className={`${className} bg-gray-200`} />
  }

  return (
    <img
      src={src}
      alt={`${countryName} flag`}
      title={countryName}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  )
}


function getRenewalErrorMessage(message?: string | null) {
  const text = (message ?? '').toLowerCase()

  if (text.includes('salary') || text.includes('minimum')) {
    return 'Rider refused the offer because the salary is below his current expectations.'
  }

  if (text.includes('contract length') || text.includes('duration')) {
    return 'Rider refused the offer because he is not happy with the proposed contract length.'
  }

  if (text.includes('cooldown') || text.includes('72 hour') || text.includes('72 hours')) {
    return 'Negotiations have collapsed. This rider will not discuss a new contract for 72 hours, and morale dropped by 10.'
  }

  if (text.includes('recent form') || text.includes('morale')) {
    return 'Rider refused the offer because recent form and morale increase his demands.'
  }

  if (text.includes('open negotiation not found')) {
    return 'This negotiation is no longer active. Open a new contract talk after the cooldown expires.'
  }

  if (text.includes('result type')) {
    return 'Renewal logic returned an invalid backend response. The SQL function needs to be fixed.'
  }

  return message ?? 'The rider refused the offer.'
}

const DEFAULT_RIDER_IMAGE_URL =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Others/Default%20Profile.png'

const SEASON_WEEKS = 52
const POTENTIAL_BONUS_MAX_AGE = 28
const DEVELOPING_TEAM_MAX = 8
const FIRST_SQUAD_MAX = 18

function getRiderImageUrl(imageUrl?: string | null) {
  if (!imageUrl || imageUrl.trim() === '') {
    return DEFAULT_RIDER_IMAGE_URL
  }

  return imageUrl
}

function formatMoney(n?: number | null) {
  if (n == null) return '—'
  return `$${new Intl.NumberFormat('de-DE').format(n)}`
}

function formatWeeklySalary(n?: number | null) {
  if (n == null) return '—'
  return `${formatMoney(n)}/week`
}

function getSeasonWage(weeklySalary?: number | null) {
  if (weeklySalary == null) return null
  return weeklySalary * SEASON_WEEKS
}

function formatSalary(value?: number | null) {
  if (value === null || value === undefined) return '—'

  const amount = new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: 0,
  }).format(value)

  return `$${amount}/week`
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized

  const int = Number.parseInt(value, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function getMoraleUi(morale?: number | null): {
  label: MoraleUiLabel
  color: string
  bgColor: string
  borderColor: string
  dotColor: string
} {
  const value = Math.max(0, Math.min(100, morale ?? 0))

  if (value <= 19) {
    const color = '#DC2626'
    return {
      label: 'Bad',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
    }
  }

  if (value <= 39) {
    const color = '#F97316'
    return {
      label: 'Low',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
    }
  }

  if (value <= 59) {
    const color = '#EAB308'
    return {
      label: 'Okay',
      color,
      bgColor: hexToRgba(color, 0.14),
      borderColor: hexToRgba(color, 0.24),
      dotColor: color,
    }
  }

  if (value <= 79) {
    const color = '#84CC16'
    return {
      label: 'Good',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
    }
  }

  const color = '#16A34A'
  return {
    label: 'Great',
    color,
    bgColor: hexToRgba(color, 0.12),
    borderColor: hexToRgba(color, 0.22),
    dotColor: color,
  }
}

function hasActivePotentialBonus(age?: number | null) {
  return typeof age === 'number' && age <= POTENTIAL_BONUS_MAX_AGE
}

function getPotentialDevelopmentBonus(potential?: number | null, age?: number | null) {
  if (!hasActivePotentialBonus(age)) {
    return 0
  }

  const value = Math.max(0, Math.min(100, potential ?? 0))

  if (value <= 19) return 0
  if (value <= 39) return 0.25
  if (value <= 59) return 0.5
  if (value <= 79) return 0.75
  return 1
}

function getPotentialUi(potential?: number | null): {
  label: PotentialUiLabel
  color: string
  bgColor: string
  borderColor: string
  dotColor: string
  tier: 1 | 2 | 3 | 4 | 5
  developmentBonus: number
} {
  const value = Math.max(0, Math.min(100, potential ?? 0))

  if (value <= 19) {
    const color = '#6B7280'
    return {
      label: 'Limited',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
      tier: 1,
      developmentBonus: 0,
    }
  }

  if (value <= 39) {
    const color = '#0F766E'
    return {
      label: 'Average',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
      tier: 2,
      developmentBonus: 0.25,
    }
  }

  if (value <= 59) {
    const color = '#0284C7'
    return {
      label: 'Promising',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
      tier: 3,
      developmentBonus: 0.5,
    }
  }

  if (value <= 79) {
    const color = '#7C3AED'
    return {
      label: 'High',
      color,
      bgColor: hexToRgba(color, 0.12),
      borderColor: hexToRgba(color, 0.22),
      dotColor: color,
      tier: 4,
      developmentBonus: 0.75,
    }
  }

  const color = '#16A34A'
  return {
    label: 'Elite',
    color,
    bgColor: hexToRgba(color, 0.12),
    borderColor: hexToRgba(color, 0.22),
    dotColor: color,
    tier: 5,
    developmentBonus: 1,
  }
}

function getDefaultRiderAvailabilityStatus(): RiderAvailabilityStatus {
  return 'fit'
}

function getRiderStatusUi(status?: RiderAvailabilityStatus | null): {
  label: string
  icon: string
  color: string
  bgColor: string
  borderColor: string
} {
  const safeStatus = status ?? getDefaultRiderAvailabilityStatus()

  if (safeStatus === 'injured') {
    const color = '#DC2626'
    return {
      label: 'Injured',
      icon: '✚',
      color,
      bgColor: hexToRgba(color, 0.1),
      borderColor: hexToRgba(color, 0.2),
    }
  }

  if (safeStatus === 'not_fully_fit') {
    const color = '#C2410C'
    return {
      label: 'Not fully fit',
      icon: '♥',
      color,
      bgColor: hexToRgba(color, 0.1),
      borderColor: hexToRgba(color, 0.2),
    }
  }

  const color = '#16A34A'
  return {
    label: 'Fit',
    icon: '♥',
    color,
    bgColor: hexToRgba(color, 0.1),
    borderColor: hexToRgba(color, 0.2),
  }
}

function RiderStatusBadge({
  status,
  className = '',
  compact = false,
}: {
  status?: RiderAvailabilityStatus | null
  className?: string
  compact?: boolean
}) {
  const ui = getRiderStatusUi(status)

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border font-medium ${compact ? 'gap-1.5 px-2.5 py-1 text-xs' : 'gap-2 px-3 py-1 text-sm'} ${className}`}
      title={`Status: ${ui.label}`}
      style={{
        color: ui.color,
        backgroundColor: ui.bgColor,
        borderColor: ui.borderColor,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: ui.color,
          lineHeight: 1,
          fontSize: compact ? '0.8rem' : '0.9rem',
        }}
      >
        {ui.icon}
      </span>
      <span>{ui.label}</span>
    </span>
  )
}

function MoraleBadge({
  morale,
  className = '',
}: {
  morale?: number | null
  className?: string
}) {
  const ui = getMoraleUi(morale)

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${className}`}
      title={`Morale: ${ui.label}`}
      style={{
        color: ui.color,
        backgroundColor: ui.bgColor,
        borderColor: ui.borderColor,
      }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ui.dotColor }} />
      <span>{ui.label}</span>
    </span>
  )
}

function PotentialBadge({
  potential,
  className = '',
}: {
  potential?: number | null
  className?: string
}) {
  const ui = getPotentialUi(potential)

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${className}`}
      title={`Potential: ${ui.label}`}
      style={{
        color: ui.color,
        backgroundColor: ui.bgColor,
        borderColor: ui.borderColor,
      }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ui.dotColor }} />
      <span>{ui.label}</span>
    </span>
  )
}

function getDiffClass(diff: number) {
  if (diff > 0) return 'text-green-600'
  if (diff < 0) return 'text-red-600'
  return 'text-gray-500'
}
function getLeftValueClass(diff: number) {
  if (diff > 0) return 'text-green-600'
  if (diff < 0) return 'text-red-600'
  return 'text-gray-700'
}
function getRightValueClass(diff: number) {
  if (diff > 0) return 'text-red-600'
  if (diff < 0) return 'text-green-600'
  return 'text-gray-700'
}
function formatDiff(diff: number) {
  if (diff > 0) return `+${diff}`
  return `${diff}`
}

function getDevelopingTeamMoveState({
  hasFirstSquad,
  movementWindowOpen,
  firstSquadRiderCount,
}: {
  hasFirstSquad: boolean
  movementWindowOpen: boolean
  firstSquadRiderCount: number
}) {
  if (!hasFirstSquad) {
    return {
      enabled: false,
      reason: 'First Squad is unavailable.',
    }
  }

  if (!movementWindowOpen) {
    return {
      enabled: false,
      reason: 'Movement window is closed.',
    }
  }

  if (firstSquadRiderCount >= FIRST_SQUAD_MAX) {
    return {
      enabled: false,
      reason: `First Squad is full (${FIRST_SQUAD_MAX}/${FIRST_SQUAD_MAX}).`,
    }
  }

  return {
    enabled: true,
    reason: 'Move to First Squad',
  }
}

function getDevelopingTeamAgeWarning(age?: number | null, movementWindowOpen?: boolean) {
  if (age === null || age === undefined || age < 24) return null

  if (movementWindowOpen) {
    return {
      label: 'Action required now',
      className:
        'inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700',
    }
  }

  return {
    label: 'Must move next window',
    className:
      'inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700',
    }
}

function CompactValueTile({
  label,
  value,
  valueClassName = '',
  subvalue,
  subvalueClassName = '',
  children,
}: {
  label: string
  value: string
  valueClassName?: string
  subvalue?: string
  subvalueClassName?: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-2 font-semibold text-gray-900 ${valueClassName || 'text-2xl'}`}>
        {value}
      </div>
      {subvalue ? (
        <div className={`mt-1 text-xs ${subvalueClassName || 'text-gray-500'}`}>{subvalue}</div>
      ) : null}
      {children}
    </div>
  )
}

function CompactStatusTile({
  label,
  status,
  subtitle,
  statusColor,
  statusClassName = '',
}: {
  label: string
  status: string
  subtitle?: string
  statusColor?: string
  statusClassName?: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
        <span>{label}</span>
        {subtitle ? <span>({subtitle})</span> : null}
      </div>
      <div
        className={`mt-2 font-semibold ${statusClassName || 'text-2xl'}`}
        style={statusColor ? { color: statusColor } : undefined}
      >
        {status}
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(100, value))

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 flex items-end justify-between">
        <div className="text-xl font-semibold text-gray-900">{safeValue}</div>
        <div className="text-xs text-gray-400">/100</div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-yellow-400" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  )
}

function RenewalFeedbackBox({
  type,
  message,
}: {
  type: 'success' | 'error' | 'info' | null
  message: string | null
}) {
  if (!message) return null

  const classes =
    type === 'success'
      ? 'border-green-200 bg-green-50 text-green-800'
      : type === 'error'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-gray-200 bg-gray-50 text-gray-600'

  return <div className={`rounded-xl border p-4 text-sm ${classes}`}>{message}</div>
}

function CompareBalanceBar({ diff }: { diff: number }) {
  const clamped = Math.max(-100, Math.min(100, diff))
  const widthPercent = Math.min(50, Math.max(0, (Math.abs(clamped) / 100) * 50))

  return (
    <div className="relative h-3 w-full rounded-full bg-gray-100">
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-300" />

      {clamped > 0 && (
        <div
          className="absolute right-1/2 top-0 h-full rounded-l-full bg-green-500"
          style={{ width: `${widthPercent}%` }}
        />
      )}

      {clamped < 0 && (
        <div
          className="absolute left-1/2 top-0 h-full rounded-r-full bg-red-500"
          style={{ width: `${widthPercent}%` }}
        />
      )}

      {clamped === 0 && (
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-400" />
      )}
    </div>
  )
}

async function fetchRiderDetailsById(riderId: string): Promise<RiderDetails> {
  const { data, error } = await supabase
    .from('riders')
    .select(
      `
      id,
      country_code,
      first_name,
      last_name,
      display_name,
      role,
      sprint,
      climbing,
      time_trial,
      endurance,
      flat,
      recovery,
      resistance,
      race_iq,
      teamwork,
      morale,
      potential,
      overall,
      birth_date,
      image_url,
      salary,
      contract_expires_at,
      contract_expires_season,
      market_value,
      asking_price,
      asking_price_manual
    `
    )
    .eq('id', riderId)
    .single()

  if (error) throw error

  return {
    ...(data as RiderDetails),
    availability_status: getDefaultRiderAvailabilityStatus(),
  }
}

function RiderProfileModal({
  open,
  onClose,
  riderId,
  onImageUpdated,
  gameDate,
  currentTeamType = 'first',
}: {
  open: boolean
  onClose: () => void
  riderId: string | null
  onImageUpdated?: (id: string, imageUrl: string) => void
  gameDate?: string | null
  currentTeamType?: TeamType
}) {
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [selectedRider, setSelectedRider] = useState<RiderDetails | null>(null)
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [imageSaving, setImageSaving] = useState(false)
  const [imageSaveMessage, setImageSaveMessage] = useState<string | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [contractActionMessage, setContractActionMessage] = useState<string | null>(null)
  const [renewalBusy, setRenewalBusy] = useState(false)
  const [renewalModalOpen, setRenewalModalOpen] = useState(false)
  const [renewalData, setRenewalData] = useState<RenewalNegotiationData | null>(null)
  const [offerSalaryInput, setOfferSalaryInput] = useState('')
  const [offerExtensionInput, setOfferExtensionInput] = useState('1')
  const [renewalResultType, setRenewalResultType] = useState<'success' | 'error' | 'info' | null>(
    null
  )
  const [renewalResultMessage, setRenewalResultMessage] = useState<string | null>(null)
  const [askingPriceInput, setAskingPriceInput] = useState('')
  const [askingPriceMessage, setAskingPriceMessage] = useState<string | null>(null)
  const [isSavingAskingPrice, setIsSavingAskingPrice] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadRider() {
      if (!riderId) return

      setProfileLoading(true)
      setProfileError(null)
      setSelectedRider(null)
      setImageUrlInput('')
      setImageSaveMessage(null)
      setContractActionMessage(null)
      setAskingPriceInput('')
      setAskingPriceMessage(null)

      try {
        const nextRider = await fetchRiderDetailsById(riderId)

        if (!mounted) return

        setSelectedRider(nextRider)
        setImageUrlInput(nextRider.image_url ?? '')
      } catch (e: any) {
        if (!mounted) return
        setProfileError(e?.message ?? 'Failed to load rider profile.')
      } finally {
        if (!mounted) return
        setProfileLoading(false)
      }
    }

    if (open) {
      void loadRider()
    } else {
      setSelectedRider(null)
      setImageUrlInput('')
      setImageSaveMessage(null)
      setImageSaving(false)
      setProfileError(null)
      setContractActionMessage(null)
      setRenewalBusy(false)
      setRenewalModalOpen(false)
      setRenewalData(null)
      setOfferSalaryInput('')
      setOfferExtensionInput('1')
      setRenewalResultType(null)
      setRenewalResultMessage(null)
      setAskingPriceInput('')
      setAskingPriceMessage(null)
      setIsSavingAskingPrice(false)
    }

    return () => {
      mounted = false
    }
  }, [open, riderId])

  async function applyImageChange() {
    if (!selectedRider) return

    setImageSaving(true)
    setImageSaveMessage(null)

    try {
      const nextImageUrl = imageUrlInput.trim() || DEFAULT_RIDER_IMAGE_URL

      const { error } = await supabase
        .from('riders')
        .update({ image_url: nextImageUrl })
        .eq('id', selectedRider.id)

      if (error) throw error

      setSelectedRider({
        ...selectedRider,
        image_url: nextImageUrl,
      })
      setImageUrlInput(nextImageUrl)
      setImageSaveMessage('Image updated successfully.')
      if (onImageUpdated) onImageUpdated(selectedRider.id, nextImageUrl)
    } catch (e: any) {
      setImageSaveMessage(e?.message ?? 'Failed to update rider image.')
    } finally {
      setImageSaving(false)
    }
  }

  async function handleSetAskingPrice() {
    if (!selectedRider?.id) return

    const price = Math.round(Number(askingPriceInput))

    if (!Number.isFinite(price) || price < 1000) {
      setAskingPriceMessage('Please enter a valid asking price.')
      return
    }

    setIsSavingAskingPrice(true)
    setAskingPriceMessage(null)

    try {
      const { error } = await supabase
        .from('riders')
        .update({
          asking_price: price,
          asking_price_manual: true,
        })
        .eq('id', selectedRider.id)

      if (error) throw error

      const refreshedRider = await fetchRiderDetailsById(selectedRider.id)

      setSelectedRider(refreshedRider)
      setAskingPriceInput('')
      setAskingPriceMessage('Asking price updated.')
    } catch (e: any) {
      console.error('set asking price failed:', e)
      setAskingPriceMessage(e?.message ?? 'Could not set asking price.')
    } finally {
      setIsSavingAskingPrice(false)
    }
  }

  async function handleNewContract() {
    if (!selectedRider) return

    setRenewalBusy(true)
    setContractActionMessage(null)
    setRenewalResultType(null)
    setRenewalResultMessage(null)

    try {
      const { data: openData, error: openError } = await supabase.rpc(
        'open_contract_renewal_negotiation',
        { p_rider_id: selectedRider.id }
      )

      if (openError) throw openError

      const negotiation = Array.isArray(openData) ? openData[0] : openData

      if (!negotiation) {
        throw new Error('Could not open renewal negotiation.')
      }

      const normalized: RenewalNegotiationData = {
        ...negotiation,
        current_contract_expires_at:
          negotiation.current_contract_expires_at ?? selectedRider.contract_expires_at ?? null,
        attempt_count: negotiation.attempt_count ?? 0,
        max_attempts: negotiation.max_attempts ?? 5,
        cooldown_until: negotiation.cooldown_until ?? null,
      }

      setRenewalData(normalized)
      setOfferSalaryInput(String(normalized.expected_salary_weekly))
      setOfferExtensionInput(String(normalized.requested_extension_seasons ?? 1))
      setRenewalModalOpen(true)
    } catch (e: any) {
      setContractActionMessage(
        getRenewalErrorMessage(e?.message ?? 'Failed to open renewal negotiation.')
      )
    } finally {
      setRenewalBusy(false)
    }
  }

  async function handleSubmitRenewalOffer() {
    if (!renewalData || !selectedRider) return

    setRenewalBusy(true)
    setRenewalResultType(null)
    setRenewalResultMessage(null)

    try {
      const offerSalary = Number(offerSalaryInput)
      const offerExtension = Number(offerExtensionInput)

      if (!Number.isFinite(offerSalary) || offerSalary <= 0) {
        throw new Error('Please enter a valid weekly salary offer.')
      }

      if (![1, 2].includes(offerExtension)) {
        throw new Error('Extension length must be 1 or 2 seasons.')
      }

      const { data: submitData, error: submitError } = await supabase.rpc(
        'submit_contract_renewal_offer',
        {
          p_negotiation_id: renewalData.negotiation_id,
          p_offer_salary_weekly: offerSalary,
          p_offer_extension_seasons: offerExtension,
        }
      )

      if (submitError) throw submitError

      const result = Array.isArray(submitData) ? submitData[0] : submitData

      if (!result) {
        throw new Error('No renewal result returned.')
      }

      if (result.accepted) {
        setRenewalResultType('success')
        setRenewalResultMessage(
          result.message ??
            `Contract extended for ${offerExtension} ${
              offerExtension === 1 ? 'season' : 'seasons'
            } starting from ${renewalCurrentStartLabel}.`
        )

        setSelectedRider((prev) =>
          prev
            ? {
                ...prev,
                salary: result.new_salary_weekly,
                contract_expires_season: result.new_contract_end_season,
                contract_expires_at: result.new_contract_expires_at ?? prev.contract_expires_at,
                morale: result.new_morale ?? prev.morale,
              }
            : prev
        )

        setRenewalData((prev) =>
          prev
            ? {
                ...prev,
                attempt_count: result.attempt_count ?? prev.attempt_count,
                current_contract_expires_at:
                  result.new_contract_expires_at ?? prev.current_contract_expires_at,
                current_contract_end_season:
                  result.new_contract_end_season ?? prev.current_contract_end_season,
              }
            : prev
        )
      } else {
        setRenewalResultType('error')
        setRenewalResultMessage(
          getRenewalErrorMessage(result.message ?? 'The rider rejected the offer.')
        )

        setRenewalData((prev) =>
          prev
            ? {
                ...prev,
                attempt_count: result.attempt_count ?? prev.attempt_count,
                cooldown_until: result.cooldown_until ?? prev.cooldown_until ?? null,
              }
            : prev
        )

        if (typeof result.new_morale === 'number') {
          setSelectedRider((prev) =>
            prev
              ? {
                  ...prev,
                  morale: result.new_morale,
                }
              : prev
          )
        }
      }
    } catch (e: any) {
      setRenewalResultType('error')
      setRenewalResultMessage(
        getRenewalErrorMessage(e?.message ?? 'Failed to submit renewal offer.')
      )
    } finally {
      setRenewalBusy(false)
    }
  }

  function closeAll() {
    setCompareOpen(false)
    onClose()
  }

  const contractExpiryUi = getContractExpiryUi(
    selectedRider?.contract_expires_at,
    gameDate ?? null,
    selectedRider?.contract_expires_season
  )

  const profileAge = getAgeFromBirthDate(selectedRider?.birth_date, gameDate ?? null)
  const movementWindowInfo = getMovementWindowInfo(gameDate)

  const isU23Ineligible =
    currentTeamType === 'developing' && profileAge !== null && profileAge >= 24

  const u23WarningMessage = isU23Ineligible
    ? movementWindowInfo.isOpen
      ? 'This rider has turned 24 and is no longer eligible for the Developing Team. He must be moved to the First Squad or released before the current movement window closes.'
      : 'This rider has turned 24 and is no longer eligible for the Developing Team. He may remain there until the next movement window, but before that window closes he must be moved to the First Squad or released.'
    : null

  const renewalCurrentContractExpiresAt =
    renewalData?.current_contract_expires_at ?? selectedRider?.contract_expires_at

  const renewalCurrentContractEndSeason =
    renewalData?.current_contract_end_season ?? selectedRider?.contract_expires_season

  const renewalCurrentStartLabel = getRenewalStartLabel(renewalCurrentContractExpiresAt)

  const renewalDaysRemaining = getDaysRemaining(renewalCurrentContractExpiresAt, gameDate ?? null)

  const renewalLocked =
    !!renewalData &&
    (renewalData.attempt_count >= renewalData.max_attempts ||
      isFutureDateTime(renewalData.cooldown_until))

  const askingPriceDisplay =
    selectedRider?.asking_price === null || selectedRider?.asking_price === undefined
      ? '$ -'
      : formatMoney(selectedRider.asking_price)

  const moraleUi = getMoraleUi(selectedRider?.morale)
  const potentialUi = getPotentialUi(selectedRider?.potential)
  const potentialBonusActive = hasActivePotentialBonus(profileAge)
  const potentialDevelopmentBonus = getPotentialDevelopmentBonus(
    selectedRider?.potential,
    profileAge
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={closeAll}
    >
      <div
        className="w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="text-3xl font-semibold text-gray-900">
            {selectedRider
              ? `${selectedRider.first_name} ${selectedRider.last_name}`
              : 'Rider Profile'}
          </div>

          <button
            type="button"
            onClick={closeAll}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="p-6">
          {profileLoading && <div className="text-sm text-gray-600">Loading rider profile…</div>}

          {!profileLoading && profileError && (
            <div>
              <div className="text-sm font-medium text-red-600">Could not load rider profile</div>
              <div className="mt-1 text-sm text-gray-600">{profileError}</div>
            </div>
          )}

          {!profileLoading && !profileError && selectedRider && (
            <>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div>
                  <img
                    src={getRiderImageUrl(selectedRider.image_url)}
                    alt={selectedRider.display_name}
                    className="h-80 w-full rounded-xl border border-gray-200 object-cover"
                  />

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Image URL
                    </label>
                    <input
                      type="text"
                      value={imageUrlInput}
                      onChange={(e) => setImageUrlInput(e.target.value)}
                      placeholder="Paste rider image URL"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-yellow-400"
                    />

                    <button
                      type="button"
                      onClick={applyImageChange}
                      disabled={imageSaving}
                      className="mt-3 w-full rounded-lg bg-yellow-400 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {imageSaving ? 'Saving image...' : 'Apply Image Change'}
                    </button>

                    {imageSaveMessage && (
                      <div className="mt-2 text-sm text-gray-600">{imageSaveMessage}</div>
                    )}
                  </div>

                  <div className="mt-5 border-t border-gray-200 pt-4">
                    <div className="rounded-xl border border-gray-200 p-4">
                      <div className="text-xs text-gray-500">Set Asking Price</div>

                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-xs text-gray-500">$</span>
                        <input
                          type="number"
                          min={1000}
                          value={askingPriceInput}
                          onChange={(e) => {
                            setAskingPriceInput(e.target.value)
                            if (askingPriceMessage) setAskingPriceMessage(null)
                          }}
                          className="h-9 w-full rounded-md border border-gray-300 px-2 text-sm outline-none focus:border-yellow-400"
                          placeholder="Enter asking price"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          void handleSetAskingPrice()
                        }}
                        disabled={isSavingAskingPrice}
                        className="mt-2 text-xs text-gray-500 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingAskingPrice ? 'Saving...' : 'Set'}
                      </button>

                      {askingPriceMessage ? (
                        <div className="mt-2 text-xs text-gray-500">{askingPriceMessage}</div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                      <CountryFlag countryCode={selectedRider.country_code} />
                      {getCountryName(selectedRider.country_code)}
                    </span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                      {selectedRider.role}
                    </span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                      Age {profileAge ?? '—'}
                    </span>
                    <RiderStatusBadge status={selectedRider.availability_status} />
                    <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800">
                      Overall {selectedRider.overall}%
                    </span>
                  </div>

                  {u23WarningMessage && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <div className="font-semibold">U23 eligibility warning</div>
                      <div className="mt-1">{u23WarningMessage}</div>
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <CompactValueTile
                      label="Salary (Weekly)"
                      value={formatWeeklySalary(selectedRider.salary)}
                      valueClassName="text-lg leading-tight whitespace-nowrap"
                      subvalue={`Full season wage: ${formatMoney(getSeasonWage(selectedRider.salary))}`}
                      subvalueClassName="text-xs text-gray-500"
                    />

                    <CompactValueTile
                      label="Contract Ends"
                      value={contractExpiryUi.label}
                      subvalue={contractExpiryUi.sublabel}
                      valueClassName={contractExpiryUi.valueClassName}
                      subvalueClassName={
                        contractExpiryUi.valueClassName.includes('text-red-600')
                          ? 'text-xs text-red-600'
                          : 'text-xs text-gray-500'
                      }
                    />

                    <CompactValueTile
                      label="Market Value"
                      value={formatMoney(selectedRider.market_value)}
                      valueClassName="text-lg leading-tight whitespace-nowrap"
                    />

                    <CompactValueTile
                      label="Asking Price"
                      value={askingPriceDisplay}
                      valueClassName={`text-lg leading-tight whitespace-nowrap ${
                        selectedRider.asking_price === null ||
                        selectedRider.asking_price === undefined
                          ? 'text-gray-500'
                          : 'text-gray-900'
                      }`}
                    />
                  </div>

                  <div className="mt-6">
                    <div className="mb-3 text-base font-semibold text-gray-900">
                      Rider Attributes
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {[
                        { label: 'Sprint', value: selectedRider.sprint },
                        { label: 'Climbing', value: selectedRider.climbing },
                        { label: 'Time Trial', value: selectedRider.time_trial },
                        { label: 'Endurance', value: selectedRider.endurance },
                        { label: 'Flat', value: selectedRider.flat },
                        { label: 'Recovery', value: selectedRider.recovery },
                        { label: 'Resistance', value: selectedRider.resistance },
                        { label: 'Race IQ', value: selectedRider.race_iq },
                        { label: 'Teamwork', value: selectedRider.teamwork },
                      ].map((stat) => (
                        <StatTile key={stat.label} label={stat.label} value={stat.value} />
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 border-t border-gray-200 pt-5">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <CompactStatusTile
                        label="Potential"
                        status={potentialUi.label}
                        subtitle={
                          profileAge == null
                            ? 'Game date unavailable'
                            : potentialBonusActive
                              ? `Growth bonus active (+${potentialDevelopmentBonus})`
                              : `No growth bonus after age ${POTENTIAL_BONUS_MAX_AGE}`
                        }
                        statusColor={potentialUi.color}
                        statusClassName="text-lg leading-tight whitespace-nowrap"
                      />

                      <CompactStatusTile
                        label="Morale"
                        status={moraleUi.label}
                        statusColor={moraleUi.color}
                        statusClassName="text-lg leading-tight whitespace-nowrap"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t border-gray-200 pt-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <button
                    type="button"
                    onClick={handleNewContract}
                    disabled={renewalBusy}
                    className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {renewalBusy ? 'Processing...' : 'New Contract'}
                  </button>

                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Transfer List
                  </button>

                  <button
                    type="button"
                    onClick={() => setCompareOpen(true)}
                    className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Compare Rider
                  </button>

                  <button
                    type="button"
                    className="rounded-lg border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Release
                  </button>
                </div>

                {contractActionMessage && (
                  <div className="mt-3 text-sm text-gray-600">{contractActionMessage}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {compareOpen && selectedRider && (
        <CompareRiderModal
          open={compareOpen}
          onClose={() => setCompareOpen(false)}
          leftRider={selectedRider}
          teamType={currentTeamType}
        />
      )}

      {renewalModalOpen && renewalData && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setRenewalModalOpen(false)}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <div className="text-2xl font-semibold text-gray-900">Contract Renewal</div>
                <div className="mt-1 text-sm text-gray-500">
                  Review and submit a renewal offer for {selectedRider?.display_name}.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setRenewalModalOpen(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <CompactValueTile
                  label="Current Salary"
                  value={formatSalary(renewalData.current_salary_weekly)}
                  valueClassName="text-lg leading-tight whitespace-nowrap"
                />
                <CompactValueTile
                  label="Expected Salary"
                  value={formatSalary(renewalData.expected_salary_weekly)}
                  valueClassName="text-lg leading-tight whitespace-nowrap"
                />
                <CompactValueTile
                  label="Likely Minimum"
                  value={formatSalary(renewalData.min_acceptable_salary_weekly)}
                  valueClassName="text-lg leading-tight whitespace-nowrap"
                />
                <CompactValueTile
                  label="Current Contract Ends"
                  value={`Season ${renewalCurrentContractEndSeason ?? '—'} - ${formatShortGameDate(
                    renewalCurrentContractExpiresAt
                  )}`}
                  subvalue={
                    renewalDaysRemaining === null
                      ? 'Game date unavailable'
                      : renewalDaysRemaining === 1
                        ? '1 day remaining'
                        : `${renewalDaysRemaining} days remaining`
                  }
                  valueClassName={
                    renewalDaysRemaining !== null && renewalDaysRemaining < 90
                      ? 'text-lg leading-tight whitespace-nowrap text-red-600'
                      : 'text-lg leading-tight whitespace-nowrap'
                  }
                  subvalueClassName={
                    renewalDaysRemaining !== null && renewalDaysRemaining < 90
                      ? 'text-xs text-red-600'
                      : 'text-xs text-gray-500'
                  }
                />
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-800">
                    Your Weekly Salary Offer
                  </label>
                  <div className="mb-2 text-sm text-gray-500">
                    Enter the amount you want to offer this rider per week.
                  </div>

                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-500">
                      $
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={offerSalaryInput}
                      onChange={(e) => setOfferSalaryInput(e.target.value)}
                      disabled={renewalBusy || renewalLocked}
                      className="w-full rounded-xl border-2 border-yellow-400 bg-yellow-50 py-3 pl-8 pr-4 text-base font-medium text-gray-900 outline-none focus:border-yellow-500 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                      placeholder="Enter weekly salary offer"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-800">
                    Extension Length
                  </label>

                  <div className="mb-2 text-sm text-gray-500">
                    Starts from {renewalCurrentStartLabel}.
                  </div>

                  <select
                    value={offerExtensionInput}
                    onChange={(e) => setOfferExtensionInput(e.target.value)}
                    disabled={renewalBusy || renewalLocked}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none focus:border-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="1">1 season</option>
                    <option value="2">2 seasons</option>
                  </select>
                </div>
              </div>

              <div className="mt-5">
                <RenewalFeedbackBox type={renewalResultType} message={renewalResultMessage} />
              </div>

              {renewalData?.cooldown_until && isFutureDateTime(renewalData.cooldown_until) && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Negotiations are blocked until{' '}
                  {new Date(renewalData.cooldown_until).toLocaleString()}.
                </div>
              )}

              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Riders react to salary, contract length, morale, and recent form.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setRenewalModalOpen(false)}
                className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSubmitRenewalOffer}
                disabled={renewalBusy || renewalLocked}
                className="rounded-lg bg-yellow-400 px-5 py-2.5 text-sm font-medium text-black hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renewalBusy ? 'Submitting...' : 'Submit Offer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CompareRiderModal({
  open,
  onClose,
  leftRider,
  teamType,
}: {
  open: boolean
  onClose: () => void
  leftRider: RiderDetails
  teamType: TeamType
}) {
  const [compareCandidates, setCompareCandidates] = useState<ClubRosterRow[]>([])
  const [compareTargetId, setCompareTargetId] = useState('')
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [comparedRider, setComparedRider] = useState<RiderDetails | null>(null)

  useEffect(() => {
    let mounted = true
    async function loadCandidates() {
      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser()
        if (authErr) throw authErr
        const userId = authData.user?.id
        if (!userId) return

        const clubType = teamType === 'developing' ? 'developing' : 'main'

        const { data: club, error: clubErr } = await supabase
          .from('clubs')
          .select('id')
          .eq('owner_user_id', userId)
          .eq('club_type', clubType)
          .single()

        if (clubErr) throw clubErr
        if (!club?.id) return

        const { data: roster, error: rosterErr } = await supabase
          .from('club_roster')
          .select(
            'club_id, rider_id, display_name, country_code, assigned_role, age_years, overall'
          )
          .eq('club_id', club.id)
          .order('overall', { ascending: false })

        if (rosterErr) throw rosterErr
        if (!mounted) return
        setCompareCandidates(
          ((roster ?? []) as ClubRosterRow[]).filter((r) => r.rider_id !== leftRider.id)
        )
      } catch {
        // keep silent for modal candidate load errors
      }
    }

    if (open) void loadCandidates()

    return () => {
      mounted = false
    }
  }, [open, leftRider.id, teamType])

  async function handleCompareSelect(riderId: string) {
    setCompareTargetId(riderId)
    setComparedRider(null)
    setCompareError(null)

    if (!riderId) return

    setCompareLoading(true)

    try {
      const { data, error } = await supabase
        .from('riders')
        .select(
          `
          id,
          country_code,
          first_name,
          last_name,
          display_name,
          role,
          sprint,
          climbing,
          time_trial,
          endurance,
          flat,
          recovery,
          resistance,
          race_iq,
          teamwork,
          morale,
          potential,
          overall,
          birth_date,
          image_url,
          salary,
          contract_expires_at,
          contract_expires_season,
          market_value,
          asking_price,
          asking_price_manual
        `
        )
        .eq('id', riderId)
        .single()

      if (error) throw error
      setComparedRider({
        ...(data as RiderDetails),
        availability_status: getDefaultRiderAvailabilityStatus(),
      })
    } catch (e: any) {
      setCompareError(e?.message ?? 'Failed to load compare rider.')
    } finally {
      setCompareLoading(false)
    }
  }

  if (!open) return null

  const COMPARE_STATS: { key: keyof RiderDetails; label: string }[] = [
    { key: 'overall', label: 'Overall' },
    { key: 'sprint', label: 'Sprint' },
    { key: 'climbing', label: 'Climbing' },
    { key: 'time_trial', label: 'Time Trial' },
    { key: 'endurance', label: 'Endurance' },
    { key: 'flat', label: 'Flat' },
    { key: 'recovery', label: 'Recovery' },
    { key: 'resistance', label: 'Resistance' },
    { key: 'race_iq', label: 'Race IQ' },
    { key: 'teamwork', label: 'Teamwork' },
    { key: 'morale', label: 'Morale' },
    { key: 'potential', label: 'Potential' },
  ]

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-black/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 border-b border-gray-200 px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold text-gray-900">Compare Riders</div>
                <div className="mt-1 text-sm text-gray-500">
                  Select another rider from the same team to compare against{' '}
                  {leftRider.first_name} {leftRider.last_name}.
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">Compare with</label>
              <select
                value={compareTargetId}
                onChange={(e) => handleCompareSelect(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-yellow-400"
              >
                <option value="">Select a rider</option>
                {compareCandidates.map((rider) => (
                  <option key={rider.rider_id} value={rider.rider_id}>
                    {rider.display_name} • {rider.assigned_role} • {rider.overall}%
                  </option>
                ))}
              </select>

              {compareCandidates.length === 0 && (
                <div className="mt-2 text-sm text-gray-500">
                  No other riders are available for comparison.
                </div>
              )}

              {compareLoading && (
                <div className="mt-3 text-sm text-gray-600">Loading comparison…</div>
              )}

              {compareError && <div className="mt-3 text-sm text-red-600">{compareError}</div>}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)]">
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <img
                    src={getRiderImageUrl(leftRider.image_url)}
                    alt={leftRider.display_name}
                    className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
                  />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-gray-900">
                      {leftRider.first_name} {leftRider.last_name}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                      <CountryFlag countryCode={leftRider.country_code} />
                      <span>{getCountryName(leftRider.country_code)}</span>
                      <span>•</span>
                      <span>{leftRider.role}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden items-center justify-center lg:flex">
                <div className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600">
                  VS
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                {comparedRider ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={getRiderImageUrl(comparedRider.image_url)}
                      alt={comparedRider.display_name}
                      className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-gray-900">
                        {comparedRider.first_name} {comparedRider.last_name}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                        <CountryFlag countryCode={comparedRider.country_code} />
                        <span>{getCountryName(comparedRider.country_code)}</span>
                        <span>•</span>
                        <span>{comparedRider.role}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[64px] items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
                    Choose a rider to compare
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-3 pr-4">Stat</th>
                    <th className="py-3 pr-4">
                      {leftRider.first_name} {leftRider.last_name}
                    </th>
                    <th className="py-3 px-4 text-center">Diff</th>
                    <th className="py-3 pl-4">
                      {comparedRider
                        ? `${comparedRider.first_name} ${comparedRider.last_name}`
                        : 'Compared Rider'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_STATS.map((stat) => {
                    const currentValue = Number(leftRider[stat.key] ?? 0)
                    const compareValue = comparedRider
                      ? Number(comparedRider[stat.key] ?? 0)
                      : null
                    const diff = compareValue === null ? null : currentValue - compareValue
                    const isMoraleRow = stat.key === 'morale'
                    const isPotentialRow = stat.key === 'potential'
                    const isStatusRow = isMoraleRow || isPotentialRow

                    return (
                      <tr key={stat.key as string} className="border-b border-gray-100">
                        <td className="py-3 pr-4 font-medium text-gray-800">{stat.label}</td>

                        <td className="py-3 pr-4">
                          {isMoraleRow ? (
                            <MoraleBadge morale={leftRider.morale} />
                          ) : isPotentialRow ? (
                            <PotentialBadge potential={leftRider.potential} />
                          ) : (
                            <span
                              className={
                                diff === null
                                  ? 'text-gray-700'
                                  : `font-medium ${getLeftValueClass(diff as number)}`
                              }
                            >
                              {currentValue}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {isStatusRow ? (
                            <div className="text-center text-gray-400">—</div>
                          ) : diff === null ? (
                            <div className="text-center text-gray-400">—</div>
                          ) : (
                            <div className="flex min-w-[280px] items-center gap-4">
                              <div className="min-w-0 flex-1">
                                <CompareBalanceBar diff={diff as number} />
                              </div>
                              <div
                                className={`w-14 text-center font-semibold ${getDiffClass(diff as number)}`}
                              >
                                {formatDiff(diff as number)}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="py-3 pl-4">
                          {isMoraleRow ? (
                            comparedRider ? (
                              <MoraleBadge morale={comparedRider.morale} />
                            ) : (
                              <span className="text-gray-400">—</span>
                            )
                          ) : isPotentialRow ? (
                            comparedRider ? (
                              <PotentialBadge potential={comparedRider.potential} />
                            ) : (
                              <span className="text-gray-400">—</span>
                            )
                          ) : compareValue === null ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <span className={`font-medium ${getRightValueClass(diff ?? 0)}`}>
                              {compareValue}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TopNav({
  isDevelopingTeamUnlocked,
}: {
  isDevelopingTeamUnlocked: boolean
}) {
  const location = useLocation()
  const isActive = (path: string) => location.pathname === path

  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h2 className="mb-2 text-xl font-semibold">Squad</h2>
        <div className="text-sm text-gray-500">
          Manage your Developing Team roster and movement windows.
        </div>
      </div>

      <div className="flex items-center gap-3">
        <a
          href="#/dashboard/squad"
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            isActive('/dashboard/squad')
              ? 'bg-yellow-400 text-black'
              : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          First Squad
        </a>

        {isDevelopingTeamUnlocked ? (
          <a
            href="#/dashboard/developing-team"
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              isActive('/dashboard/developing-team')
                ? 'bg-yellow-400 text-black'
                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Developing Team
          </a>
        ) : (
          <span
            className="cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400"
            title="Unlock Developing Team in Preferences first."
            aria-disabled="true"
          >
            Developing Team
          </span>
        )}

        <a
          href="#/dashboard/staff"
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            isActive('/dashboard/staff')
              ? 'bg-yellow-400 text-black'
              : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Staff
        </a>
      </div>
    </div>
  )
}

export default function DevelopingTeamPage() {
  const [rows, setRows] = useState<ClubRosterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [gameDate, setGameDate] = useState<string | null>(null)
  const [developingTeamStatus, setDevelopingTeamStatus] = useState<DevelopingTeamStatus | null>(
    null
  )
  const [firstSquadRiderCount, setFirstSquadRiderCount] = useState(0)
  const [profileOpen, setProfileOpen] = useState(false)
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null)
  const [movingRiderId, setMovingRiderId] = useState<string | null>(null)
  const [moveActionMessage, setMoveActionMessage] = useState<string | null>(null)

  const navigate = useNavigate()

  const riders = useMemo(
    () =>
      rows.map((r, idx) => ({
        rowNo: idx + 1,
        id: r.rider_id,
        name: r.display_name,
        countryCode: r.country_code,
        role: r.assigned_role,
        age: getAgeFromBirthDate(r.birth_date ?? null, gameDate ?? null) ?? r.age_years,
        overall: r.overall,
        status: getDefaultRiderAvailabilityStatus() as RiderAvailabilityStatus,
      })),
    [rows, gameDate]
  )

  const loadDevelopingTeamPageData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setStatusError(null)

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser()
      if (authErr) throw authErr

      const userId = authData.user?.id
      if (!userId) throw new Error('Not authenticated.')

      const { data: currentGameDate, error: gameDateErr } = await supabase.rpc(
        'get_current_game_date'
      )
      if (gameDateErr) throw gameDateErr
      setGameDate(normalizeGameDateValue(currentGameDate))

      const { data: devStatusData, error: devStatusErr } = await supabase.rpc(
        'get_developing_team_status'
      )

      if (devStatusErr) {
        console.error('get_developing_team_status failed:', devStatusErr)
        setDevelopingTeamStatus(null)
        setStatusError(devStatusErr.message ?? 'Could not load Developing Team status.')
        setRows([])
        setFirstSquadRiderCount(0)
        return
      }

      const normalizedDevStatus = Array.isArray(devStatusData) ? devStatusData[0] : devStatusData
      const status = (normalizedDevStatus ?? null) as DevelopingTeamStatus | null
      setDevelopingTeamStatus(status)

      const mainClubId = status?.main_club_id
      if (mainClubId) {
        const { data: mainRoster, error: mainRosterErr } = await supabase
          .from('club_roster')
          .select('rider_id')
          .eq('club_id', mainClubId)

        if (mainRosterErr) throw mainRosterErr
        setFirstSquadRiderCount((mainRoster ?? []).length)
      } else {
        setFirstSquadRiderCount(0)
      }

      if (!status?.is_purchased || !status.developing_club_id) {
        setRows([])
        return
      }

      const { data: roster, error: rosterErr } = await supabase
        .from('club_roster')
        .select(
          'club_id, rider_id, display_name, country_code, assigned_role, age_years, overall'
        )
        .eq('club_id', status.developing_club_id)
        .order('overall', { ascending: false })

      if (rosterErr) throw rosterErr

      const rosterRows = (roster ?? []) as ClubRosterRow[]
      const riderIds = rosterRows.map((row) => row.rider_id)

      let birthDateMap = new Map<string, string | null>()

      if (riderIds.length > 0) {
        const { data: riderBirthDates, error: riderBirthDatesErr } = await supabase
          .from('riders')
          .select('id, birth_date')
          .in('id', riderIds)

        if (riderBirthDatesErr) throw riderBirthDatesErr

        birthDateMap = new Map(
          (riderBirthDates ?? []).map((row: { id: string; birth_date: string | null }) => [
            row.id,
            row.birth_date,
          ])
        )
      }

      setRows(
        rosterRows.map((row) => ({
          ...row,
          birth_date: birthDateMap.get(row.rider_id) ?? null,
        }))
      )
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load Developing Team.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDevelopingTeamPageData()
  }, [loadDevelopingTeamPageData])

  useEffect(() => {
    if (!loading && !error && developingTeamStatus && !developingTeamStatus.is_purchased) {
      navigate('/dashboard/squad', { replace: true })
    }
  }, [loading, error, developingTeamStatus, navigate])

  function openRiderProfile(riderId: string) {
    setSelectedRiderId(riderId)
    setProfileOpen(true)
  }

  async function handleMoveToFirstSquad(riderId: string) {
    if (movingRiderId) return

    if (!developingTeamStatus?.main_club_id) {
      setMoveActionMessage('First Squad is unavailable.')
      return
    }

    if (!developingTeamStatus.movement_window_open) {
      setMoveActionMessage(
        `Movement window is closed. Next window: ${developingTeamStatus.next_window_label ?? 'Unknown'}.`
      )
      return
    }

    if (firstSquadRiderCount >= FIRST_SQUAD_MAX) {
      setMoveActionMessage(`First Squad is full (${FIRST_SQUAD_MAX}/${FIRST_SQUAD_MAX}).`)
      return
    }

    setMovingRiderId(riderId)
    setMoveActionMessage(null)

    try {
      const { error } = await supabase.rpc('move_rider_between_main_and_developing', {
        p_rider_id: riderId,
        p_target_club_id: developingTeamStatus.main_club_id,
      })

      if (error) throw error

      setMoveActionMessage('Rider moved to the First Squad.')
      await loadDevelopingTeamPageData()
    } catch (e: any) {
      console.error('move_rider_between_main_and_developing failed:', e)
      setMoveActionMessage(e?.message ?? 'Could not move rider to the First Squad.')
    } finally {
      setMovingRiderId(null)
    }
  }

  function closeProfile() {
    setProfileOpen(false)
    setSelectedRiderId(null)
  }

  const hasDevelopingTeam = developingTeamStatus?.is_purchased ?? false
  const movementWindowOpen = developingTeamStatus?.movement_window_open ?? false

  const movementWindowSummary = developingTeamStatus
    ? developingTeamStatus.movement_window_open
      ? `Movement window open now: ${developingTeamStatus.current_window_label ?? 'Current window'}`
      : `Movement window closed. Next window: ${developingTeamStatus.next_window_label ?? 'Unknown'}`
    : 'Movement window information unavailable.'

  if (!loading && !error && developingTeamStatus && !developingTeamStatus.is_purchased) {
    return null
  }

  return (
    <div className="w-full">
      <TopNav isDevelopingTeamUnlocked={hasDevelopingTeam} />

      {loading && (
        <div className="rounded-lg bg-white p-4 text-sm text-gray-600 shadow">
          Loading Developing Team…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm font-medium text-red-600">Could not load Developing Team</div>
          <div className="mt-1 text-sm text-gray-600">{error}</div>
        </div>
      )}

      {!loading && !error && hasDevelopingTeam && (
        <>
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {movementWindowSummary}
          </div>

          {statusError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {statusError}
            </div>
          )}

          {moveActionMessage && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {moveActionMessage}
            </div>
          )}

          <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
            <div className="text-base font-semibold text-gray-800">
              {developingTeamStatus?.developing_club_name ?? 'Developing Team'}
            </div>
            <div className="text-sm text-gray-500">
              Riders:{' '}
              <span className="font-medium text-gray-700">
                {riders.length}/{DEVELOPING_TEAM_MAX}
              </span>
            </div>
          </div>

          <div className="w-full rounded-lg bg-white p-4 shadow">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-base font-semibold text-gray-800">Developing Team</div>
              <div className="text-sm text-gray-500">
                First Squad:{' '}
                <span className="font-medium text-gray-700">
                  {firstSquadRiderCount}/{FIRST_SQUAD_MAX}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="p-2">#</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Country</th>
                    <th className="p-2">Role</th>
                    <th className="p-2">Age</th>
                    <th className="p-2">Overall</th>
                    <th className="p-2 w-[160px]">Status</th>
                    <th className="p-2 w-[90px] text-center">Move</th>
                    <th className="p-2 w-[90px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {riders.map((r) => {
                    const moveState = getDevelopingTeamMoveState({
                      hasFirstSquad: !!developingTeamStatus?.main_club_id,
                      movementWindowOpen,
                      firstSquadRiderCount,
                    })
                    const isBusy = movingRiderId === r.id
                    const ageWarning = getDevelopingTeamAgeWarning(
                      r.age ?? null,
                      movementWindowOpen
                    )

                    return (
                      <tr key={r.id} className="border-t align-top">
                        <td className="p-2">{r.rowNo}</td>
                        <td className="p-2">
                          <div className="font-medium text-gray-800">{r.name}</div>
                          {ageWarning && (
                            <div className="mt-2">
                              <span className={ageWarning.className}>{ageWarning.label}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          <div
                            className="flex items-center gap-2"
                            title={getCountryName(r.countryCode)}
                          >
                            <CountryFlag countryCode={r.countryCode} />
                            <span className="text-gray-700">{r.countryCode}</span>
                          </div>
                        </td>
                        <td className="p-2">{r.role}</td>
                        <td className="p-2">{r.age ?? '—'}</td>
                        <td className="p-2">{r.overall}%</td>
                        <td className="p-2">
                          <RiderStatusBadge status={r.status} compact />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            disabled={!moveState.enabled || isBusy}
                            title={moveState.reason}
                            onClick={() => {
                              if (!moveState.enabled || isBusy) return
                              void handleMoveToFirstSquad(r.id)
                            }}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm transition ${
                              moveState.enabled && !isBusy
                                ? 'border-yellow-400 bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                                : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                            }`}
                          >
                            {isBusy ? '…' : '⇄'}
                          </button>
                        </td>
                        <td className="p-2 text-right">
                          <button
                            type="button"
                            onClick={() => openRiderProfile(r.id)}
                            className="text-sm font-medium text-yellow-600 hover:text-yellow-700"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    )
                  })}

                  {riders.length === 0 && (
                    <tr className="border-t">
                      <td className="p-2 text-gray-500" colSpan={9}>
                        No riders found for the Developing Team yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <CompactValueTile
              label="Eligible U23 Riders"
              value={`${riders.filter((r) => r.age !== null && r.age <= 23).length}`}
            />
            <CompactValueTile
              label="Aged-out Riders"
              value={`${riders.filter((r) => r.age !== null && r.age >= 24).length}`}
              subvalue={
                movementWindowOpen
                  ? 'Need action during current window'
                  : 'Need action by next window'
              }
            />
            <CompactValueTile
              label="Average Overall"
              value={`${
                riders.length
                  ? Math.round(
                      riders.reduce((sum, rider) => sum + rider.overall, 0) / riders.length
                    )
                  : 0
              }`}
            />
            <CompactValueTile
              label="Movement Window"
              value={movementWindowOpen ? 'Open' : 'Closed'}
              subvalue={
                movementWindowOpen
                  ? developingTeamStatus?.current_window_label ?? 'Current window'
                  : developingTeamStatus?.next_window_label ?? 'Unknown'
              }
            />
          </div>

          <RiderProfileModal
            open={profileOpen}
            onClose={closeProfile}
            riderId={selectedRiderId}
            gameDate={gameDate}
            currentTeamType="developing"
          />
        </>
      )}
    </div>
  )
}