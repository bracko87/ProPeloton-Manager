/**
 * src/pages/dashboard/Squad.tsx
 *
 * First Squad page (dashboard/squad)
 *
 * Purpose:
 * - Render the First Squad roster, widgets and modals.
 * - Keep live roster loading from public.club_roster via the shared Supabase client.
 * - Provide top navigation to switch between squad-related pages (navigates routes).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import { supabase } from '../../lib/supabase'

import type {
  ChartPoint,
  ClubHealthOverviewRow,
  ClubRosterRow,
  DevelopingTeamStatus,
  RenewalNegotiationData,
  RiderAvailabilityStatus,
  RiderCurrentHealthCase,
  RiderDetails,
  TeamType,
} from '../../features/squad/types'

import {
  formatShortGameDate,
  getAgeFromBirthDate,
  getContractExpiryUi,
  getDaysRemaining,
  getMovementWindowInfo,
  getRenewalStartLabel,
  isFutureDateTime,
  normalizeGameDateValue,
} from '../../features/squad/utils/dates'

import {
  formatBlockFlag,
  formatCaseStageLabel,
  formatHealthCaseCode,
  formatMoney,
  formatSalary,
  formatSeverityLabel,
  formatUnavailableReason,
  formatWeeklySalary,
  getCountryName,
  getFlagImageUrl,
  getSeasonWage,
} from '../../features/squad/utils/formatters'

import {
  formatDiff,
  getDefaultRiderAvailabilityStatus,
  getDiffClass,
  getFatigueUi,
  getHealthPanelNote,
  getLeftValueClass,
  getMoraleUi,
  getPotentialDevelopmentBonus,
  getPotentialUi,
  getRenewalErrorMessage,
  getRiderImageUrl,
  getRiderStatusUi,
  getRightValueClass,
  hasActivePotentialBonus,
} from '../../features/squad/utils/rider-ui'

import { getFirstSquadMoveState } from '../../features/squad/utils/movement'

const SEASON_WEEKS = 52

/**
 * CountryFlag
 * Small component that renders a country flag or a fallback box.
 */
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

/**
 * RiderStatusBadge
 * UI-only rider status badge.
 */
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
      className={`inline-flex items-center whitespace-nowrap rounded-full border font-medium ${
        compact ? 'gap-1.5 px-2.5 py-1 text-xs' : 'gap-2 px-3 py-1 text-sm'
      } ${className}`}
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

/**
 * MoraleBadge
 * UI-only morale badge. Does not show the raw morale number.
 */
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

function FatigueBadge({
  fatigue,
  className = '',
}: {
  fatigue?: number | null
  className?: string
}) {
  const ui = getFatigueUi(fatigue)

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${className}`}
      title={`Fatigue: ${ui.label}`}
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

/**
 * Simple reusable UI pieces used by the page widgets.
 * Kept local to this file to avoid changing existing imports.
 */
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

/**
 * LineChart / VerticalBarChart / HorizontalMetricBar
 * Lightweight SVG widgets copied from prior UI for same visuals.
 */
function LineChart({ data }: { data: ChartPoint[] }) {
  const width = 760
  const height = 240
  const padLeft = 34
  const padRight = 20
  const padTop = 18
  const padBottom = 34

  const maxValue = Math.max(...data.map((d) => d.value), 10)
  const usableWidth = width - padLeft - padRight
  const usableHeight = height - padTop - padBottom

  const points = data.map((point, index) => {
    const x = padLeft + (index * usableWidth) / Math.max(1, data.length - 1)
    const y = padTop + usableHeight - (point.value / maxValue) * usableHeight
    return { ...point, x, y }
  })

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ')
  const areaPoints = `${padLeft},${padTop + usableHeight} ${polylinePoints} ${
    padLeft + usableWidth
  },${padTop + usableHeight}`

  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-50/70 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
        {[0.25, 0.5, 0.75, 1].map((line) => {
          const y = padTop + usableHeight - usableHeight * line
          return (
            <g key={line}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              <text x={6} y={y + 4} fontSize="10" fill="#6b7280">
                {Math.round(maxValue * line)}
              </text>
            </g>
          )
        })}

        <polygon points={areaPoints} fill="#fde68a" opacity="0.45" />
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#eab308"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="4" fill="#ca8a04" />
            <text
              x={point.x}
              y={height - 12}
              textAnchor="middle"
              fontSize="10"
              fill="#6b7280"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function VerticalBarChart({ data }: { data: ChartPoint[] }) {
  const width = 420
  const height = 240
  const padTop = 18
  const padBottom = 40
  const padLeft = 18
  const padRight = 18

  const maxValue = Math.max(...data.map((d) => d.value), 1)
  const chartWidth = width - padLeft - padRight
  const chartHeight = height - padTop - padBottom
  const barWidth = chartWidth / Math.max(data.length, 1) - 18

  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-50/70 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
        <line
          x1={padLeft}
          y1={padTop + chartHeight}
          x2={width - padRight}
          y2={padTop + chartHeight}
          stroke="#d1d5db"
          strokeWidth="1"
        />

        {data.map((item, index) => {
          const x = padLeft + index * (barWidth + 18) + 10
          const barHeight = (item.value / maxValue) * chartHeight
          const y = padTop + chartHeight - barHeight

          return (
            <g key={item.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx="8"
                fill={index < 3 ? '#facc15' : '#9ca3af'}
              />
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize="11"
                fill="#374151"
              >
                {item.value}
              </text>
              <text
                x={x + barWidth / 2}
                y={height - 14}
                textAnchor="middle"
                fontSize="10"
                fill="#6b7280"
              >
                {item.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function HorizontalMetricBar({
  label,
  value,
  max,
}: {
  label: string
  value: number
  max: number
}) {
  const width = max > 0 ? (value / max) * 100 : 0

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-800">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-yellow-400" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

/**
 * CompareBalanceBar
 * Small bar used in the compare modal to visualize differences.
 */
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
      fatigue,
      overall,
      birth_date,
      image_url,
      salary,
      contract_expires_at,
      contract_expires_season,
      market_value,
      asking_price,
      asking_price_manual,
      availability_status,
      unavailable_until,
      unavailable_reason
    `
    )
    .eq('id', riderId)
    .single()

  if (error) throw error

  const rider = data as RiderDetails

  return {
    ...rider,
    availability_status: rider.availability_status ?? getDefaultRiderAvailabilityStatus(),
  }
}

async function fetchRiderCurrentHealthCaseById(
  riderId: string
): Promise<RiderCurrentHealthCase | null> {
  const { data, error } = await supabase.rpc('get_rider_current_health_case', {
    p_rider_id: riderId,
  })

  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  return (row ?? null) as RiderCurrentHealthCase | null
}

function TransferListModal({
  open,
  onClose,
  rider,
  onUpdated,
}: {
  open: boolean
  onClose: () => void
  rider: RiderDetails | null
  onUpdated: (updatedRider: RiderDetails) => void
}) {
  const [askingPriceInput, setAskingPriceInput] = useState('')
  const [defaultAskingPrice, setDefaultAskingPrice] = useState<number | null>(null)
  const [loadingSuggestedPrice, setLoadingSuggestedPrice] = useState(false)
  const [savingPrice, setSavingPrice] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadSuggestedPrice() {
      if (!rider?.id) return

      setLoadingSuggestedPrice(true)
      setMessage(null)
      setMessageType(null)
      setAskingPriceInput(rider.asking_price != null ? String(rider.asking_price) : '')

      try {
        const { data, error } = await supabase.rpc('calculate_rider_default_asking_price', {
          p_rider_id: rider.id,
        })

        if (error) throw error
        if (!mounted) return

        setDefaultAskingPrice(typeof data === 'number' ? data : null)
      } catch (e: any) {
        if (!mounted) return
        setDefaultAskingPrice(null)
        setMessage(e?.message ?? 'Could not load suggested asking price.')
        setMessageType('error')
      } finally {
        if (!mounted) return
        setLoadingSuggestedPrice(false)
      }
    }

    if (open && rider?.id) {
      void loadSuggestedPrice()
    } else {
      setAskingPriceInput('')
      setDefaultAskingPrice(null)
      setLoadingSuggestedPrice(false)
      setSavingPrice(false)
      setMessage(null)
      setMessageType(null)
    }

    return () => {
      mounted = false
    }
  }, [open, rider?.id, rider?.asking_price])

  async function handleSetManualPrice() {
    if (!rider?.id) return

    const price = Math.round(Number(askingPriceInput))

    if (!Number.isFinite(price) || price < 1000) {
      setMessage('Asking price must be at least $1,000.')
      setMessageType('error')
      return
    }

    setSavingPrice(true)
    setMessage(null)
    setMessageType(null)

    try {
      const { error } = await supabase.rpc('set_rider_asking_price', {
        p_rider_id: rider.id,
        p_asking_price: price,
      })

      if (error) throw error

      const refreshedRider = await fetchRiderDetailsById(rider.id)
      onUpdated(refreshedRider)
      setAskingPriceInput(
        refreshedRider.asking_price != null ? String(refreshedRider.asking_price) : ''
      )
      setMessage('Manual asking price saved.')
      setMessageType('success')
    } catch (e: any) {
      setMessage(e?.message ?? 'Could not set asking price.')
      setMessageType('error')
    } finally {
      setSavingPrice(false)
    }
  }

  async function handleResetToSuggested() {
    if (!rider?.id) return

    setSavingPrice(true)
    setMessage(null)
    setMessageType(null)

    try {
      const { error } = await supabase.rpc('clear_rider_asking_price', {
        p_rider_id: rider.id,
      })

      if (error) throw error

      const refreshedRider = await fetchRiderDetailsById(rider.id)
      onUpdated(refreshedRider)
      setAskingPriceInput(
        refreshedRider.asking_price != null ? String(refreshedRider.asking_price) : ''
      )
      setMessage('Asking price reset to suggested value.')
      setMessageType('success')
    } catch (e: any) {
      setMessage(e?.message ?? 'Could not reset asking price.')
      setMessageType('error')
    } finally {
      setSavingPrice(false)
    }
  }

  if (!open || !rider) return null

  const currentAskingPriceDisplay =
    rider.asking_price == null ? '—' : formatMoney(rider.asking_price)

  const suggestedAskingPriceDisplay = loadingSuggestedPrice
    ? 'Loading...'
    : defaultAskingPrice == null
      ? '—'
      : formatMoney(defaultAskingPrice)

  const pricingModeLabel = rider.asking_price_manual ? 'Manual price' : 'Suggested price'

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
          <div>
            <div className="text-2xl font-semibold text-gray-900">Transfer List</div>
            <div className="mt-1 text-sm text-gray-500">
              Manage transfer pricing for {rider.first_name} {rider.last_name}.
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <CompactValueTile
              label="Market Value"
              value={formatMoney(rider.market_value)}
              valueClassName="text-lg leading-tight whitespace-nowrap"
            />

            <CompactValueTile
              label="Current Asking Price"
              value={currentAskingPriceDisplay}
              valueClassName="text-lg leading-tight whitespace-nowrap"
              subvalue={pricingModeLabel}
              subvalueClassName="text-xs text-gray-500"
            />

            <CompactValueTile
              label="Suggested Asking Price"
              value={suggestedAskingPriceDisplay}
              valueClassName="text-lg leading-tight whitespace-nowrap"
              subvalue="Calculated from market value, contract, morale and release pressure"
              subvalueClassName="text-xs text-gray-500"
            />

            <CompactValueTile
              label="Pricing Mode"
              value={rider.asking_price_manual ? 'Manual' : 'Suggested'}
              valueClassName="text-lg leading-tight whitespace-nowrap"
            />
          </div>

          <div className="mt-6">
            <label className="mb-2 block text-sm font-semibold text-gray-800">
              Set Manual Asking Price
            </label>
            <div className="mb-2 text-sm text-gray-500">
              Enter the price you want other clubs to negotiate from.
            </div>

            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-500">
                $
              </span>
              <input
                type="number"
                min={1000}
                value={askingPriceInput}
                onChange={(e) => {
                  setAskingPriceInput(e.target.value)
                  if (message) {
                    setMessage(null)
                    setMessageType(null)
                  }
                }}
                disabled={savingPrice}
                className="w-full rounded-xl border-2 border-yellow-400 bg-yellow-50 py-3 pl-8 pr-4 text-base font-medium text-gray-900 outline-none focus:border-yellow-500 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Enter asking price"
              />
            </div>
          </div>

          {message ? (
            <div
              className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                messageType === 'success'
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {message}
            </div>
          ) : null}

          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Manual price uses your chosen value. Reset returns the rider to the system-suggested
            asking price.
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={handleResetToSuggested}
            disabled={savingPrice}
            className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingPrice ? 'Working...' : 'Reset to Suggested'}
          </button>

          <button
            type="button"
            onClick={handleSetManualPrice}
            disabled={savingPrice}
            className="rounded-lg bg-yellow-400 px-5 py-2.5 text-sm font-medium text-black hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingPrice ? 'Saving...' : 'Set Manual Price'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * RiderProfileModal
 * Extracted modal component kept inside this file to preserve behavior and imports.
 */
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
  const [currentHealthCase, setCurrentHealthCase] = useState<RiderCurrentHealthCase | null>(null)
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
  const [transferListOpen, setTransferListOpen] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadRider() {
      if (!riderId) return

      setProfileLoading(true)
      setProfileError(null)
      setSelectedRider(null)
      setCurrentHealthCase(null)
      setImageUrlInput('')
      setImageSaveMessage(null)
      setContractActionMessage(null)

      try {
        const [nextRider, nextHealthCase] = await Promise.all([
          fetchRiderDetailsById(riderId),
          fetchRiderCurrentHealthCaseById(riderId),
        ])

        if (!mounted) return

        setSelectedRider(nextRider)
        setCurrentHealthCase(nextHealthCase)
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
      setCurrentHealthCase(null)
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
      setTransferListOpen(false)
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
      const nextImageUrl = getRiderImageUrl(imageUrlInput.trim())

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
    setTransferListOpen(false)
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
  const fatigueUi = getFatigueUi(selectedRider?.fatigue)
  const potentialBonusActive = hasActivePotentialBonus(profileAge)
  const potentialDevelopmentBonus = getPotentialDevelopmentBonus(
    selectedRider?.potential,
    profileAge
  )

  const healthCaseName = formatHealthCaseCode(currentHealthCase?.case_code)
  const healthSeverityLabel = formatSeverityLabel(currentHealthCase?.severity)
  const healthStageLabel = formatCaseStageLabel(currentHealthCase?.case_status)
  const healthExpectedRecoveryLabel = formatShortGameDate(
    currentHealthCase?.expected_full_recovery_on
  )
  const healthExpectedRecoveryDays = getDaysRemaining(
    currentHealthCase?.expected_full_recovery_on,
    gameDate ?? null
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={closeAll}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between border-b border-gray-200 px-6 py-4">
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

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {profileLoading && <div className="text-sm text-gray-600">Loading rider profile…</div>}

          {!profileLoading && profileError && (
            <div>
              <div className="text-sm font-medium text-red-600">Could not load rider profile</div>
              <div className="mt-1 text-sm text-gray-600">{profileError}</div>
            </div>
          )}

          {!profileLoading && !profileError && selectedRider && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div>
                <img
                  src={getRiderImageUrl(selectedRider.image_url)}
                  alt={selectedRider.display_name}
                  className="h-80 w-full rounded-xl border border-gray-200 object-cover"
                />

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-gray-700">Image URL</label>
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
                    <div className="text-xs text-gray-500">Health</div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <RiderStatusBadge status={selectedRider.availability_status} />
                      <FatigueBadge fatigue={selectedRider.fatigue} />
                    </div>

                    <div className="mt-3 space-y-1 text-sm text-gray-700">
                      <div>
                        <span className="text-gray-500">Fatigue score:</span>{' '}
                        {selectedRider.fatigue ?? 0}/100
                      </div>

                      {healthCaseName ? (
                        <div>
                          <span className="text-gray-500">Case:</span> {healthCaseName}
                        </div>
                      ) : null}

                      {healthSeverityLabel ? (
                        <div>
                          <span className="text-gray-500">Severity:</span> {healthSeverityLabel}
                        </div>
                      ) : null}

                      {healthStageLabel ? (
                        <div>
                          <span className="text-gray-500">Stage:</span> {healthStageLabel}
                        </div>
                      ) : null}

                      {selectedRider.unavailable_reason ? (
                        <div>
                          <span className="text-gray-500">Reason:</span>{' '}
                          {formatUnavailableReason(selectedRider.unavailable_reason)}
                        </div>
                      ) : null}

                      {currentHealthCase?.expected_full_recovery_on ? (
                        <div>
                          <span className="text-gray-500">Expected full recovery:</span>{' '}
                          {healthExpectedRecoveryLabel}
                          {healthExpectedRecoveryDays !== null
                            ? ` (${healthExpectedRecoveryDays} day${
                                healthExpectedRecoveryDays === 1 ? '' : 's'
                              } remaining)`
                            : ''}
                        </div>
                      ) : null}
                    </div>

                    {currentHealthCase?.health_case_id ? (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                          <div className="text-[11px] uppercase tracking-wide text-gray-500">
                            Selection
                          </div>
                          <div className="mt-1 font-medium text-gray-800">
                            {formatBlockFlag(currentHealthCase.selection_blocked)}
                          </div>
                        </div>

                        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                          <div className="text-[11px] uppercase tracking-wide text-gray-500">
                            Training
                          </div>
                          <div className="mt-1 font-medium text-gray-800">
                            {formatBlockFlag(currentHealthCase.training_blocked)}
                          </div>
                        </div>

                        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                          <div className="text-[11px] uppercase tracking-wide text-gray-500">
                            Development
                          </div>
                          <div className="mt-1 font-medium text-gray-800">
                            {formatBlockFlag(currentHealthCase.development_blocked)}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      {currentHealthCase?.health_case_id
                        ? currentHealthCase.case_status === 'recovering'
                          ? 'Rider has left the unavailable phase and is now recovering toward full fitness.'
                          : currentHealthCase.case_status === 'active'
                            ? 'Rider is in the active medical phase and remains unavailable until the current case clears.'
                            : getHealthPanelNote(selectedRider)
                        : getHealthPanelNote(selectedRider)}
                    </div>
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
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <CompactStatusTile
                      label="Potential"
                      status={potentialUi.label}
                      subtitle={
                        profileAge == null
                          ? 'Game date unavailable'
                          : potentialBonusActive
                            ? `Growth bonus active (+${potentialDevelopmentBonus})`
                            : 'No growth bonus after age 28'
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

                    <CompactStatusTile
                      label="Fatigue"
                      status={fatigueUi.label}
                      subtitle={
                        selectedRider.fatigue == null ? '0/100' : `${selectedRider.fatigue}/100`
                      }
                      statusColor={fatigueUi.color}
                      statusClassName="text-lg leading-tight whitespace-nowrap"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {!profileLoading && !profileError && selectedRider && (
          <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-4">
            {contractActionMessage && (
              <div className="mb-3 text-sm text-gray-600">{contractActionMessage}</div>
            )}

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
                onClick={() => setTransferListOpen(true)}
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
          </div>
        )}
      </div>

      {compareOpen && selectedRider && (
        <CompareRiderModal
          open={compareOpen}
          onClose={() => setCompareOpen(false)}
          leftRider={selectedRider}
        />
      )}

      {transferListOpen && selectedRider && (
        <TransferListModal
          open={transferListOpen}
          onClose={() => setTransferListOpen(false)}
          rider={selectedRider}
          onUpdated={(updatedRider) => {
            setSelectedRider(updatedRider)
          }}
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

/**
 * CompareRiderModal
 * Keep compare modal logic local: compares selected left rider to another rider
 * from the same roster. Diff is left - right.
 */
function CompareRiderModal({
  open,
  onClose,
  leftRider,
}: {
  open: boolean
  onClose: () => void
  leftRider: RiderDetails
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

        const { data: club, error: clubErr } = await supabase
          .from('clubs')
          .select('id')
          .eq('owner_user_id', userId)
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
        setCompareCandidates((roster ?? []) as ClubRosterRow[])
      } catch {
        // keep silent for modal candidate load errors
      }
    }

    if (open) void loadCandidates()

    return () => {
      mounted = false
    }
  }, [open])

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
          fatigue,
          overall,
          birth_date,
          image_url,
          salary,
          contract_expires_at,
          contract_expires_season,
          market_value,
          asking_price,
          asking_price_manual,
          availability_status,
          unavailable_until,
          unavailable_reason
        `
        )
        .eq('id', riderId)
        .single()

      if (error) throw error

      const rider = data as RiderDetails

      setComparedRider({
        ...rider,
        availability_status: rider.availability_status ?? getDefaultRiderAvailabilityStatus(),
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

/**
 * SquadPage
 * First Squad page exported for route /dashboard/squad
 */
export default function SquadPage() {
  const location = useLocation()

  const [rows, setRows] = useState<ClubRosterRow[]>([])
  const [healthOverviewRows, setHealthOverviewRows] = useState<ClubHealthOverviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gameDate, setGameDate] = useState<string | null>(null)

  const [profileOpen, setProfileOpen] = useState(false)
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null)

  const [developingTeamStatus, setDevelopingTeamStatus] = useState<DevelopingTeamStatus | null>(
    null
  )
  const [developingTeamStatusError, setDevelopingTeamStatusError] = useState<string | null>(null)
  const [movingRiderId, setMovingRiderId] = useState<string | null>(null)
  const [moveActionMessage, setMoveActionMessage] = useState<string | null>(null)

  const SQUAD_MAX = 18

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
        fatigue: r.fatigue ?? 0,
        status:
          (r.availability_status ?? getDefaultRiderAvailabilityStatus()) as RiderAvailabilityStatus,
      })),
    [rows, gameDate]
  )

  const squadDisplayData = useMemo(() => {
    const sorted = [...riders].sort((a, b) => b.overall - a.overall)
    const avgOverall = sorted.length
      ? Math.round(sorted.reduce((sum, rider) => sum + rider.overall, 0) / sorted.length)
      : 60

    const seasonTrend = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
    ].map((label, index) => ({
      label,
      value: Math.max(
        8,
        Math.round((avgOverall - 48) * 0.95 + 8 + (index % 2 === 0 ? 0 : 2))
      ),
    }))

    const podiumChart = [
      { label: 'Wins', value: Math.max(1, Math.round((avgOverall - 52) / 4) + 1) },
      { label: '2nd', value: 2 },
      { label: '3rd', value: 3 },
      { label: 'Top10', value: 9 },
      { label: 'Top20', value: 20 },
    ]

    return {
      seasonTrend,
      podiumChart,
      summary: {
        wins: podiumChart[0].value,
        podiums: podiumChart[0].value + podiumChart[1].value + podiumChart[2].value,
        top10s: podiumChart[3].value,
        bestGC: Math.max(2, 12 - podiumChart[0].value),
      },
    }
  }, [riders])

  const loadSquadPageData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setDevelopingTeamStatusError(null)

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser()
      if (authErr) throw authErr

      const userId = authData.user?.id
      if (!userId) throw new Error('Not authenticated.')

      const { data: currentGameDate, error: gameDateErr } = await supabase.rpc(
        'get_current_game_date'
      )

      if (gameDateErr) throw gameDateErr

      const normalizedGameDate = normalizeGameDateValue(currentGameDate)
      setGameDate(normalizedGameDate)

      const { data: devStatusData, error: devStatusErr } = await supabase.rpc(
        'get_developing_team_status'
      )

      if (devStatusErr) {
        console.error('get_developing_team_status failed:', devStatusErr)
        setDevelopingTeamStatus(null)
        setDevelopingTeamStatusError(
          devStatusErr.message ?? 'Could not load Developing Team status.'
        )
      } else {
        const normalizedDevStatus = Array.isArray(devStatusData) ? devStatusData[0] : devStatusData
        setDevelopingTeamStatus((normalizedDevStatus ?? null) as DevelopingTeamStatus | null)
      }

      const { data: club, error: clubErr } = await supabase
        .from('clubs')
        .select('id')
        .eq('owner_user_id', userId)
        .eq('club_type', 'main')
        .single()

      if (clubErr) throw clubErr
      if (!club?.id) throw new Error('No club found for this user.')

      const { data: healthData, error: healthErr } = await supabase.rpc('get_club_health_overview', {
        p_club_id: club.id,
      })

      if (healthErr) throw healthErr

      const { data: roster, error: rosterErr } = await supabase
        .from('club_roster')
        .select(
          'club_id, rider_id, display_name, country_code, assigned_role, age_years, overall, availability_status, fatigue'
        )
        .eq('club_id', club.id)
        .order('overall', { ascending: false })

      if (rosterErr) throw rosterErr

      const rosterRows = (roster ?? []) as ClubRosterRow[]
      const riderIds = rosterRows.map((row) => row.rider_id)

      let birthDateMap = new Map<string, string | null>()

      if (riderIds.length > 0) {
        const { data: riderBirthDates, error: riderBirthDatesErr } = await supabase
          .from('riders')
          .select(
            'id, birth_date, fatigue, availability_status, unavailable_until, unavailable_reason'
          )
          .in('id', riderIds)

        if (riderBirthDatesErr) throw riderBirthDatesErr

        birthDateMap = new Map(
          (riderBirthDates ?? []).map((row: { id: string; birth_date: string | null }) => [
            row.id,
            row.birth_date,
          ])
        )
      }

      const mergedRows = rosterRows.map((row) => ({
        ...row,
        birth_date: birthDateMap.get(row.rider_id) ?? null,
      }))

      setRows(mergedRows)
      setHealthOverviewRows((healthData ?? []) as ClubHealthOverviewRow[])
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load squad.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSquadPageData()
  }, [loadSquadPageData])

  function openRiderProfile(riderId: string) {
    setSelectedRiderId(riderId)
    setProfileOpen(true)
  }

  async function handleMoveToDevelopingTeam(riderId: string) {
    if (movingRiderId) return

    if (!developingTeamStatus?.is_purchased || !developingTeamStatus.developing_club_id) {
      setMoveActionMessage('Unlock Developing Team in Preferences first.')
      return
    }

    if (!developingTeamStatus.movement_window_open) {
      setMoveActionMessage(
        `Movement window is closed. Next window: ${developingTeamStatus.next_window_label ?? 'Unknown'}.`
      )
      return
    }

    setMovingRiderId(riderId)
    setMoveActionMessage(null)

    try {
      const { error } = await supabase.rpc('move_rider_between_main_and_developing', {
        p_rider_id: riderId,
        p_target_club_id: developingTeamStatus.developing_club_id,
      })

      if (error) throw error

      setMoveActionMessage('Rider moved to the Developing Team.')
      await loadSquadPageData()
    } catch (e: any) {
      console.error('move_rider_between_main_and_developing failed:', e)
      setMoveActionMessage(e?.message ?? 'Could not move rider to the Developing Team.')
    } finally {
      setMovingRiderId(null)
    }
  }

  function closeProfile() {
    setProfileOpen(false)
    setSelectedRiderId(null)
  }

  function isActive(path: string) {
    const current = location.pathname
    return current === path
  }

  const hasDevelopingTeam = developingTeamStatus?.is_purchased ?? false
  const movementWindowOpen = developingTeamStatus?.movement_window_open ?? false

  const movementWindowSummary = developingTeamStatus
    ? developingTeamStatus.movement_window_open
      ? `Movement window open now: ${developingTeamStatus.current_window_label ?? 'Current window'}`
      : `Movement window closed. Next window: ${developingTeamStatus.next_window_label ?? 'Unknown'}`
    : 'Movement window information unavailable.'

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="mb-2 text-xl font-semibold">Squad</h2>
          <div className="text-sm text-gray-500">
            Manage your first-team squad and view season insights.
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

          {hasDevelopingTeam ? (
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
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400"
              title="Unlock Developing Team in Preferences first."
              aria-disabled="true"
            >
              <span>Developing Team</span>
              <span aria-hidden="true">🔒</span>
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

      <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="text-base font-semibold text-gray-800">First Squad</div>
        <div className="text-sm text-gray-500">
          Riders: <span className="font-medium text-gray-700">{riders.length}/{SQUAD_MAX}</span>
        </div>
      </div>

      {riders.length >= SQUAD_MAX && (
        <div className="mb-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
          Squad is full ({SQUAD_MAX} riders). Transfers, signings and promotions must respect the
          squad cap.
        </div>
      )}

      {loading && (
        <div className="w-full rounded-lg bg-white p-4 text-sm text-gray-600 shadow">
          Loading squad…
        </div>
      )}

      {!loading && error && (
        <div className="w-full rounded-lg bg-white p-4 shadow">
          <div className="text-sm font-medium text-red-600">Could not load squad</div>
          <div className="mt-1 text-sm text-gray-600">{error}</div>
        </div>
      )}

      {!loading && !error && (
        <>
          {hasDevelopingTeam && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              {movementWindowSummary}
            </div>
          )}

          {developingTeamStatusError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {developingTeamStatusError}
            </div>
          )}

          {moveActionMessage && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {moveActionMessage}
            </div>
          )}

          <div className="w-full rounded-lg bg-white p-4 shadow">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-base font-semibold text-gray-800">First Squad</div>
              <div className="text-sm text-gray-500">
                Riders: <span className="font-medium text-gray-700">{riders.length}/{SQUAD_MAX}</span>
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
                  {riders.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{r.rowNo}</td>
                      <td className="p-2 font-medium text-gray-800">{r.name}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-2" title={getCountryName(r.countryCode)}>
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
                        {(() => {
                          const moveState = getFirstSquadMoveState({
                            hasDevelopingTeam,
                            movementWindowOpen,
                            riderAge: r.age ?? null,
                          })

                          const isBusy = movingRiderId === r.id

                          return (
                            <button
                              type="button"
                              disabled={!moveState.enabled || isBusy}
                              title={moveState.reason}
                              onClick={() => {
                                if (!moveState.enabled || isBusy) return
                                void handleMoveToDevelopingTeam(r.id)
                              }}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm transition ${
                                moveState.enabled && !isBusy
                                  ? 'border-yellow-400 bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                                  : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                              }`}
                            >
                              {isBusy ? '…' : '⇄'}
                            </button>
                          )
                        })()}
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
                  ))}

                  {riders.length === 0 && (
                    <tr className="border-t">
                      <td className="p-2 text-gray-500" colSpan={9}>
                        No riders found for this club yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 rounded-lg bg-white p-4 shadow">
            <div className="mb-4">
              <div className="text-base font-semibold text-gray-800">Health Report</div>
              <div className="mt-1 text-sm text-gray-500">
                Current injured, sick, and recovering first squad riders
              </div>
            </div>

            {healthOverviewRows.length === 0 ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                No active health concerns in the squad right now.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="py-2 pr-4">Rider</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Case</th>
                      <th className="py-2 pr-4">Stage</th>
                      <th className="py-2 pr-4">Severity</th>
                      <th className="py-2 pr-4">Fatigue</th>
                      <th className="py-2">Expected Recovery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {healthOverviewRows.map((row) => (
                      <tr key={row.rider_id} className="border-b border-gray-100 last:border-0">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <CountryFlag countryCode={row.country_code} />
                            <span className="font-medium text-gray-800">{row.display_name}</span>
                          </div>
                        </td>

                        <td className="py-3 pr-4">
                          <RiderStatusBadge status={row.availability_status} compact />
                        </td>

                        <td className="py-3 pr-4 text-gray-700">
                          {formatHealthCaseCode(row.case_code) ?? 'Fatigue'}
                        </td>

                        <td className="py-3 pr-4 text-gray-700">
                          {formatCaseStageLabel(row.case_status) ?? '—'}
                        </td>

                        <td className="py-3 pr-4 text-gray-700">
                          {formatSeverityLabel(row.severity) ?? '—'}
                        </td>

                        <td className="py-3 pr-4 text-gray-700">{row.fatigue}/100</td>

                        <td className="py-3 text-gray-700">
                          {row.expected_full_recovery_on
                            ? `${formatShortGameDate(row.expected_full_recovery_on)}${
                                getDaysRemaining(row.expected_full_recovery_on, gameDate ?? null) !==
                                null
                                  ? ` (${getDaysRemaining(row.expected_full_recovery_on, gameDate ?? null)}d)`
                                  : ''
                              }`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <CompactValueTile label="Season Wins" value={`${squadDisplayData.summary.wins}`} />
            <CompactValueTile label="Season Podiums" value={`${squadDisplayData.summary.podiums}`} />
            <CompactValueTile label="Top 10 Results" value={`${squadDisplayData.summary.top10s}`} />
            <CompactValueTile label="Best GC" value={`${squadDisplayData.summary.bestGC}`} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="mb-4">
                <div className="text-base font-semibold text-gray-800">Last Team Race</div>
                <div className="mt-1 text-sm text-gray-500">Result preview (mocked)</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="py-2 pr-4">Rider</th>
                      <th className="py-2 pr-4">Role</th>
                      <th className="py-2">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riders.slice(0, 8).map((r, index) => (
                      <tr key={r.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-3 pr-4 font-medium text-gray-800">{r.name}</td>
                        <td className="py-3 pr-4 text-gray-600">{r.role}</td>
                        <td className="py-3 text-gray-700">
                          {index < 3 ? `${index + 1}th` : `${index + 4}th`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg bg-white p-4 shadow">
              <div className="mb-4">
                <div className="text-base font-semibold text-gray-800">Next Race Selection</div>
                <div className="mt-1 text-sm text-gray-500">Mock selection preview</div>
              </div>
              <div className="space-y-3">
                {riders.slice(0, 7).map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col gap-2 rounded-xl border border-gray-100 p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-medium text-gray-800">{r.name}</div>
                      <div className="mt-1 text-sm text-gray-500">
                        Selected for role {r.role}
                      </div>
                    </div>
                    <div className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                      {r.role}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-lg bg-white p-4 shadow xl:col-span-2">
              <div className="text-base font-semibold text-gray-800">Team Results This Season</div>
              <div className="mt-4">
                <LineChart data={squadDisplayData.seasonTrend} />
              </div>
            </div>

            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-base font-semibold text-gray-800">Podiums & Placings</div>
              <div className="mt-4">
                <VerticalBarChart data={squadDisplayData.podiumChart} />
              </div>
            </div>

            <div className="rounded-lg bg-white p-4 shadow xl:col-span-3">
              <div className="text-base font-semibold text-gray-800">Race Type Snapshot</div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {[
                  { label: 'One-day classics', value: 72 },
                  { label: 'Stage finishes', value: 60 },
                  { label: 'Mountain days', value: 34 },
                  { label: 'Time trials', value: 29 },
                ].map((item) => (
                  <HorizontalMetricBar
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    max={100}
                  />
                ))}
              </div>
            </div>
          </div>

          <RiderProfileModal
            open={profileOpen}
            onClose={closeProfile}
            riderId={selectedRiderId}
            gameDate={gameDate}
            currentTeamType="first"
          />
        </>
      )}
    </div>
  )
}