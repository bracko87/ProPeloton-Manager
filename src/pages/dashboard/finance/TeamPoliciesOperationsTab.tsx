/**
 * TeamPoliciesOperationsTab.tsx
 * Club-wide standards for travel, support packages, bonuses and operations.
 *
 * Current version:
 * - loads real saved policies from Supabase
 * - loads real option catalog from Supabase
 * - saves changes through update_club_team_policies(...)
 * - flights / accommodation / ground transport cannot be None
 * - staff equipment / staff travel accommodation cannot be None in UI
 * - team vehicles removed from UI
 * - rider housing support presented as shared Housing Support
 * - shows base policy trip rates and recurring cost summaries
 * - uses get_club_team_policy_estimate(...) for real recurring/team totals
 * - no debug club id box
 * - loads last month actual policy cost from finance_get_team_policy_cost_summary(...)
 * - loads upcoming trip forecasts from get_club_team_trip_forecasts(...)
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from './supabase'

type CostType =
  | 'none'
  | 'one_time'
  | 'weekly'
  | 'monthly'
  | 'per_trip'
  | 'per_rider_weekly'
  | 'per_staff_weekly'
  | 'seasonal'
  | 'per_result'

type NotificationType =
  | 'none'
  | 'info'
  | 'summary'
  | 'monthly_summary'
  | 'reminder'
  | 'warning'

type PolicyOption = {
  value: string
  label: string
  effect: string | null
  costType: CostType
  notificationType: NotificationType
  baseCost: number
}

type PolicyItem = {
  key: string
  dbKey: string
  titleKey: string
  descriptionKey: string
  options: PolicyOption[]
}

type PolicySection = {
  titleKey: string
  descriptionKey: string
  items: PolicyItem[]
}

type PolicyState = Record<string, string>

type PremiumStatusRow = {
  is_premium?: boolean | null
  premium_active?: boolean | null
  has_premium?: boolean | null
  active?: boolean | null
  stripe_status?: string | null
  access_until?: string | null
}

function getPremiumAccessFromResult(data: unknown): boolean {
  if (typeof data === 'boolean') return data

  const row = (
    Array.isArray(data) ? data[0] : data
  ) as PremiumStatusRow | null

  const accessUntilMs = row?.access_until
    ? Date.parse(row.access_until)
    : Number.NaN

  const hasCurrentAccessUntil =
    Number.isFinite(accessUntilMs) && accessUntilMs > Date.now()

  const hasActiveStripeStatus = [
    'trialing',
    'active',
    'past_due',
  ].includes(String(row?.stripe_status ?? '').toLowerCase())

  return Boolean(
    row?.is_premium ??
      row?.premium_active ??
      row?.has_premium ??
      row?.active ??
      (hasActiveStripeStatus && hasCurrentAccessUntil)
  )
}

type CatalogRow = {
  policy_key: string
  option_code: string
  label: string
  description: string
  cost_type: CostType
  notification_type: NotificationType
  base_cost: number
  effect_json: Record<string, unknown> | null
  sort_order: number
  is_active: boolean
}

type ClubPolicyRow = {
  club_id: string
  flight_class: string
  hotel_level: string
  ground_transport: string
  logistics_support_level: string
  team_vehicle_policy: string
  rider_housing_support: string
  nutrition_support_level: string
  recovery_support_level: string
  staff_equipment_level: string
  staff_accommodation_level: string
  rider_bonus_plan: string
  staff_bonus_plan: string
  created_at?: string
  updated_at?: string
}

type PolicyCostSummaryRow = {
  period_start: string
  period_end: string
  total_policy_cost: string | number
  trip_policy_cost: string | number
  recurring_policy_cost: string | number
  bonus_policy_cost: string | number
  travel_cost: string | number
  accommodation_cost: string | number
  logistics_cost: string | number
  vehicle_cost: string | number
  housing_cost: string | number
  nutrition_cost: string | number
  recovery_support_cost: string | number
  staff_support_cost: string | number
  bonus_payout_cost: string | number
}

type TripForecastRow = {
  id: string
  source_type: string
  source_id: string
  event_name: string
  destination_country_code: string
  destination_region_name: string
  start_date: string
  end_date: string
  rider_count: number
  staff_count: number
  travel_cost_total: string | number
  accommodation_cost_total: string | number
  logistics_cost_total: string | number
  staff_accommodation_cost_total: string | number
  total_cost: string | number
  status: string
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type PolicyEstimateRow = {
  club_id: string
  active_rider_count: number
  active_staff_count: number
  housing_weekly_cost: string | number
  nutrition_weekly_cost: string | number
  recovery_weekly_cost: string | number
  logistics_weekly_cost: string | number
  staff_support_one_time_cost: string | number
  rider_bonus_seasonal_cost: string | number
  staff_bonus_seasonal_cost: string | number
  weekly_total: string | number
  monthly_total: string | number
}

const POLICY_STRUCTURE: Array<{
  titleKey: string
  descriptionKey: string
  items: Array<{
    key: string
    dbKey: keyof ClubPolicyRow
    titleKey: string
    descriptionKey: string
  }>
}> = [
  {
    titleKey: 'policies.operations',
    descriptionKey: 'policies.operationsDescription',
    items: [
      {
        key: 'flightClass',
        dbKey: 'flight_class',
        titleKey: 'policies.flights',
        descriptionKey: 'policies.flightsDescription',
      },
      {
        key: 'hotelLevel',
        dbKey: 'hotel_level',
        titleKey: 'policies.accommodationPolicy',
        descriptionKey: 'policies.accommodationDescription',
      },
      {
        key: 'groundTransport',
        dbKey: 'ground_transport',
        titleKey: 'policies.groundTransport',
        descriptionKey: 'policies.groundTransportDescription',
      },
      {
        key: 'logisticsSupportLevel',
        dbKey: 'logistics_support_level',
        titleKey: 'policies.logisticsSupport',
        descriptionKey: 'policies.logisticsSupportDescription',
      },
      {
        key: 'staffAccommodationLevel',
        dbKey: 'staff_accommodation_level',
        titleKey: 'policies.staffAccommodation',
        descriptionKey: 'policies.staffAccommodationDescription',
      },
    ],
  },
  {
    titleKey: 'policies.teamPolicies',
    descriptionKey: 'policies.teamPoliciesDescription',
    items: [
      {
        key: 'riderHousingSupport',
        dbKey: 'rider_housing_support',
        titleKey: 'policies.housingSupport',
        descriptionKey: 'policies.housingSupportDescription',
      },
      {
        key: 'nutritionSupportLevel',
        dbKey: 'nutrition_support_level',
        titleKey: 'policies.nutritionSupport',
        descriptionKey: 'policies.nutritionSupportDescription',
      },
      {
        key: 'recoverySupportLevel',
        dbKey: 'recovery_support_level',
        titleKey: 'policies.recoverySupport',
        descriptionKey: 'policies.recoverySupportDescription',
      },
      {
        key: 'staffEquipmentLevel',
        dbKey: 'staff_equipment_level',
        titleKey: 'policies.staffEquipmentPackage',
        descriptionKey: 'policies.staffEquipmentDescription',
      },
      {
        key: 'riderBonusPlan',
        dbKey: 'rider_bonus_plan',
        titleKey: 'policies.riderBonusPlan',
        descriptionKey: 'policies.riderBonusDescription',
      },
      {
        key: 'staffBonusPlan',
        dbKey: 'staff_bonus_plan',
        titleKey: 'policies.staffBonusPlan',
        descriptionKey: 'policies.staffBonusDescription',
      },
    ],
  },
]

function formatMoney(n: number, currency: 'USD' | 'EUR' = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getPreviousMonthRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 0)

  const toIso = (d: Date): string => {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  return {
    start: toIso(start),
    end: toIso(end),
  }
}

function formatShortDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(d)
}

function titleCaseValue(value: string): string {
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getBadgeClass(value: string): string {
  switch (value) {
    case 'warning':
      return 'bg-red-100 text-red-700 border-red-200'
    case 'reminder':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'monthly_summary':
    case 'summary':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'info':
      return 'bg-slate-100 text-slate-700 border-slate-200'
    case 'none':
      return 'bg-gray-100 text-gray-500 border-gray-200'
    default:
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  }
}

function getEffectText(effectJson: Record<string, unknown> | null): string | null {
  if (!effectJson) return null

  const parts: string[] = []

  const travelMorale = Number(effectJson.travel_morale_delta ?? 0)
  const morale = Number(effectJson.morale_delta ?? 0)
  const recovery = Number(effectJson.recovery_bonus ?? 0)
  const fatigue = Number(effectJson.travel_fatigue_delta ?? 0)
  const logistics = Number(effectJson.logistics_bonus ?? 0)
  const staffEfficiency = Number(effectJson.staff_efficiency_bonus ?? 0)
  const contractHappiness = Number(effectJson.contract_happiness_bonus ?? 0)
  const fatigueReduction = Number(effectJson.fatigue_reduction_bonus ?? 0)
  const staffMorale = Number(effectJson.staff_morale_delta ?? 0)

  if (travelMorale > 0) parts.push(`+${travelMorale} travel morale`)
  if (morale > 0) parts.push(`+${morale} morale`)
  if (staffMorale > 0) parts.push(`+${staffMorale} staff morale`)
  if (recovery > 0) parts.push(`+${recovery} recovery`)
  if (fatigue < 0) parts.push(`${fatigue} travel fatigue`)
  if (fatigueReduction > 0) parts.push(`-${fatigueReduction} fatigue later`)
  if (logistics > 0) parts.push(`+${logistics} logistics`)
  if (staffEfficiency > 0) parts.push(`+${staffEfficiency} staff efficiency`)
  if (contractHappiness > 0) parts.push(`+${contractHappiness} contract happiness`)

  return parts.length > 0 ? parts.join(', ') : null
}

function adjustOptionForUi(itemKey: string, option: PolicyOption): PolicyOption {
  if (itemKey === 'staffEquipmentLevel') {
    return {
      ...option,
      costType: option.value === 'none' ? 'none' : 'one_time',
    }
  }

  return option
}

function buildSections(catalog: CatalogRow[]): PolicySection[] {
  const grouped = new Map<string, CatalogRow[]>()

  for (const row of catalog) {
    const rows = grouped.get(row.policy_key) ?? []
    rows.push(row)
    grouped.set(row.policy_key, rows)
  }

  return POLICY_STRUCTURE.map(section => ({
    titleKey: section.titleKey,
    descriptionKey: section.descriptionKey,
    items: section.items.map(item => {
      const rows = [...(grouped.get(item.dbKey) ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order
      )

      let options: PolicyOption[] = rows.map(row =>
        adjustOptionForUi(item.key, {
          value: row.option_code,
          label: row.label,
          effect: getEffectText(row.effect_json),
          costType: row.cost_type,
          notificationType: row.notification_type,
          baseCost: Number(row.base_cost ?? 0),
        })
      )

      if (item.key === 'staffEquipmentLevel' || item.key === 'staffAccommodationLevel') {
        options = options.filter(option => option.value !== 'none')
      }

      return {
        key: item.key,
        dbKey: item.dbKey,
        titleKey: item.titleKey,
        descriptionKey: item.descriptionKey,
        options,
      }
    }),
  }))
}

function getSelectedOption(item: PolicyItem, selectedValue: string): PolicyOption {
  return item.options.find(option => option.value === selectedValue) ?? item.options[0]
}

function isTripSensitiveCostType(costType: CostType): boolean {
  return costType === 'per_trip'
}

function getChargeTimingKey(item: PolicyItem, option: PolicyOption): string | null {
  if (
    item.key === 'flightClass' ||
    item.key === 'hotelLevel' ||
    item.key === 'groundTransport' ||
    item.key === 'logisticsSupportLevel' ||
    item.key === 'staffAccommodationLevel'
  ) {
    return 'policies.chargedEventDay'
  }

  if (item.key === 'staffEquipmentLevel') {
    return 'policies.chargedStaffHire'
  }

  if (
    item.key === 'nutritionSupportLevel' ||
    item.key === 'recoverySupportLevel' ||
    item.key === 'riderHousingSupport'
  ) {
    return 'policies.chargedWeekly'
  }

  if (item.key === 'riderBonusPlan' || item.key === 'staffBonusPlan') {
    return 'policies.chargedSeason'
  }

  if (option.costType === 'weekly') {
    return 'policies.chargedWeekly'
  }

  if (option.costType === 'one_time') {
    return 'policies.chargedTrigger'
  }

  return null
}

function SelectedOptionCard({
  item,
  selectedValue,
}: {
  item: PolicyItem
  selectedValue: string
}): JSX.Element {
  const { t } = useTranslation('finance')
  const selectedOption = getSelectedOption(item, selectedValue)
  const isTripSensitive = isTripSensitiveCostType(selectedOption.costType)
  const chargeTimingKey = getChargeTimingKey(item, selectedOption)

  return (
    <div className="mt-3 grid gap-2 md:grid-cols-4">
      <div className="rounded bg-gray-50 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t('policies.effect')}
        </div>
        <div className="mt-1 text-sm text-gray-700">
          {selectedOption.effect ?? t('policies.noBonus')}
        </div>
      </div>

      <div className="rounded bg-gray-50 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t('policies.costType')}
        </div>
        <div className="mt-2">
          <span
            className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getBadgeClass(
              selectedOption.costType
            )}`}
          >
            {titleCaseValue(selectedOption.costType)}
          </span>
        </div>
      </div>

      <div className="rounded bg-gray-50 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {isTripSensitive ? t('policies.basePolicyCost') : t('policies.estimatedCost')}
        </div>
        <div className="mt-1 text-sm font-semibold text-gray-900">
          {selectedOption.baseCost > 0
            ? `${formatMoney(selectedOption.baseCost)}${isTripSensitive ? ' base' : ''}`
            : '—'}
        </div>
        {isTripSensitive && (
          <div className="mt-1 text-xs text-gray-500">
            {t('policies.finalTripCost')}
          </div>
        )}
        {!isTripSensitive && chargeTimingKey && (
          <div className="mt-1 text-xs text-gray-500">{t(chargeTimingKey)}</div>
        )}
      </div>

      <div className="rounded bg-gray-50 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t('policies.notification')}
        </div>
        <div className="mt-2">
          <span
            className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getBadgeClass(
              selectedOption.notificationType
            )}`}
          >
            {titleCaseValue(selectedOption.notificationType)}
          </span>
        </div>
      </div>
    </div>
  )
}

export function TeamPoliciesOperationsTab(): JSX.Element {
  const { t } = useTranslation('finance')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isPremium, setIsPremium] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [clubId, setClubId] = useState<string | null>(null)
  const [sections, setSections] = useState<PolicySection[]>([])
  const [policyState, setPolicyState] = useState<PolicyState>({})
  const [initialPolicyState, setInitialPolicyState] = useState<PolicyState>({})
  const [lastMonthActualCost, setLastMonthActualCost] = useState<number | null>(null)
  const [tripForecasts, setTripForecasts] = useState<TripForecastRow[]>([])
  const [policyEstimate, setPolicyEstimate] = useState<PolicyEstimateRow | null>(null)

  async function loadPage(): Promise<void> {
    setLoading(true)
    setError(null)
    setSaveMessage(null)

    try {
      const clubIdRes = await supabase.rpc('get_my_primary_club_id')
      if (clubIdRes.error) throw clubIdRes.error

      const resolvedClubId = clubIdRes.data as string | null
      if (!resolvedClubId) {
        throw new Error(t('policies.noMainClub'))
      }

      setClubId(resolvedClubId)

      const [catalogRes, policyRes, premiumStatusRes] = await Promise.all([
        supabase
          .from('team_policy_option_catalog')
          .select(
            'policy_key, option_code, label, description, cost_type, notification_type, base_cost, effect_json, sort_order, is_active'
          )
          .eq('is_active', true)
          .order('policy_key', { ascending: true })
          .order('sort_order', { ascending: true }),
        supabase.rpc('get_club_team_policies', {
          p_club_id: resolvedClubId,
        }),
        supabase.rpc('get_my_premium_status'),
      ])

      if (catalogRes.error) throw catalogRes.error
      if (policyRes.error) throw policyRes.error

      if (premiumStatusRes.error) {
        console.error(
          'Failed to load Premium status for Team Policies & Operations:',
          premiumStatusRes.error
        )
        setIsPremium(false)
      } else {
        setIsPremium(getPremiumAccessFromResult(premiumStatusRes.data))
      }

      const catalogRows = (catalogRes.data ?? []) as CatalogRow[]
      const policyRow = policyRes.data as ClubPolicyRow
      const builtSections = buildSections(catalogRows)

      setSections(builtSections)

      const coerceToAllowed = (itemKey: string, value: string): string => {
        const item = builtSections.flatMap(section => section.items).find(entry => entry.key === itemKey)
        if (!item || item.options.length === 0) return value
        return item.options.some(option => option.value === value)
          ? value
          : item.options[0].value
      }

      const nextPolicyState: PolicyState = {
        flightClass: coerceToAllowed('flightClass', policyRow.flight_class),
        hotelLevel: coerceToAllowed('hotelLevel', policyRow.hotel_level),
        groundTransport: coerceToAllowed('groundTransport', policyRow.ground_transport),
        logisticsSupportLevel: coerceToAllowed(
          'logisticsSupportLevel',
          policyRow.logistics_support_level
        ),
        riderHousingSupport: coerceToAllowed(
          'riderHousingSupport',
          policyRow.rider_housing_support
        ),
        nutritionSupportLevel: coerceToAllowed(
          'nutritionSupportLevel',
          policyRow.nutrition_support_level
        ),
        recoverySupportLevel: coerceToAllowed(
          'recoverySupportLevel',
          policyRow.recovery_support_level
        ),
        staffEquipmentLevel: coerceToAllowed(
          'staffEquipmentLevel',
          policyRow.staff_equipment_level
        ),
        staffAccommodationLevel: coerceToAllowed(
          'staffAccommodationLevel',
          policyRow.staff_accommodation_level
        ),
        riderBonusPlan: coerceToAllowed('riderBonusPlan', policyRow.rider_bonus_plan),
        staffBonusPlan: coerceToAllowed('staffBonusPlan', policyRow.staff_bonus_plan),
      }

      setPolicyState(nextPolicyState)
      setInitialPolicyState(nextPolicyState)

      const estimateRes = await supabase.rpc('get_club_team_policy_estimate', {
        p_club_id: resolvedClubId,
      })

      if (!estimateRes.error) {
        setPolicyEstimate((estimateRes.data?.[0] ?? null) as PolicyEstimateRow | null)
      } else {
        setPolicyEstimate(null)
      }

      const previousMonth = getPreviousMonthRange()

      const costSummaryRes = await supabase.rpc('finance_get_team_policy_cost_summary', {
        p_club_id: resolvedClubId,
        p_period_start: previousMonth.start,
        p_period_end: previousMonth.end,
      })

      if (!costSummaryRes.error) {
        const summaryRow = (costSummaryRes.data?.[0] ?? null) as PolicyCostSummaryRow | null
        setLastMonthActualCost(summaryRow ? toNumber(summaryRow.total_policy_cost) : 0)
      } else {
        setLastMonthActualCost(null)
      }

      const tripForecastsRes = await supabase.rpc('get_club_team_trip_forecasts', {
        p_club_id: resolvedClubId,
        p_limit: 5,
      })

      if (!tripForecastsRes.error) {
        setTripForecasts((tripForecastsRes.data ?? []) as TripForecastRow[])
      } else {
        setTripForecasts([])
      }
    } catch (e: any) {
      setError(e?.message ?? t('policies.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPage()

    const handlePremiumStatusChanged = () => {
      void loadPage()
    }

    window.addEventListener(
      'premium-status-changed',
      handlePremiumStatusChanged
    )

    return () => {
      window.removeEventListener(
        'premium-status-changed',
        handlePremiumStatusChanged
      )
    }
  }, [])

  const selectedCount = useMemo(() => {
    return Object.values(policyState).filter(value => value && value !== 'none').length
  }, [policyState])

  const hasUnsavedChanges = useMemo(() => {
    const keys = new Set([
      ...Object.keys(policyState),
      ...Object.keys(initialPolicyState),
    ])

    for (const key of keys) {
      if ((policyState[key] ?? '') !== (initialPolicyState[key] ?? '')) {
        return true
      }
    }

    return false
  }, [policyState, initialPolicyState])

  const summary = useMemo(() => {
    return {
      perTrip: sections
        .flatMap(section => section.items)
        .reduce((total, item) => {
          const selectedValue = policyState[item.key]
          if (!selectedValue) return total
          const selectedOption = getSelectedOption(item, selectedValue)
          return selectedOption.costType === 'per_trip'
            ? total + selectedOption.baseCost
            : total
        }, 0),
      weekly: policyEstimate ? toNumber(policyEstimate.weekly_total) : 0,
      monthlyRecurring: policyEstimate ? toNumber(policyEstimate.monthly_total) : 0,
    }
  }, [sections, policyState, policyEstimate])

  function updatePolicy(key: string, value: string): void {
    setSaveMessage(null)
    setError(null)
    setPolicyState(current => ({
      ...current,
      [key]: value,
    }))
  }

  function resetPolicies(): void {
    setSaveMessage(null)
    setError(null)
    setPolicyState(initialPolicyState)
  }

  async function savePolicies(): Promise<void> {
    if (!clubId) return

    if (!isPremium) {
      const premiumSelections = sections
        .flatMap(section => section.items)
        .filter(item => {
          const selectedValue = policyState[item.key]
          const selectedIndex = item.options.findIndex(
            option => option.value === selectedValue
          )
          return selectedIndex > 0
        })
        .map(item => t(item.titleKey))

      if (premiumSelections.length > 0) {
        setError(
          `Premium is required for the selected options in: ${premiumSelections.join(
            ', '
          )}. Free players can use the first option in each dropdown.`
        )
        return
      }
    }

    setSaving(true)
    setError(null)
    setSaveMessage(null)

    try {
      const res = await supabase.rpc('update_club_team_policies', {
        p_club_id: clubId,
        p_flight_class: policyState.flightClass,
        p_hotel_level: policyState.hotelLevel,
        p_ground_transport: policyState.groundTransport,
        p_logistics_support_level: policyState.logisticsSupportLevel,
        p_team_vehicle_policy: 'none',
        p_rider_housing_support: policyState.riderHousingSupport,
        p_nutrition_support_level: policyState.nutritionSupportLevel,
        p_recovery_support_level: policyState.recoverySupportLevel,
        p_staff_equipment_level: policyState.staffEquipmentLevel,
        p_staff_accommodation_level: policyState.staffAccommodationLevel,
        p_rider_bonus_plan: policyState.riderBonusPlan,
        p_staff_bonus_plan: policyState.staffBonusPlan,
      })

      if (res.error) throw res.error

      setSaveMessage(t('policies.saved'))
      await loadPage()
    } catch (e: any) {
      setError(e?.message ?? t('policies.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded bg-white p-4 shadow text-sm text-gray-600">
        {t('policies.loading')}
      </div>
    )
  }

  if (error && sections.length === 0) {
    return (
      <div className="rounded bg-white p-4 shadow">
        <div className="text-sm font-semibold text-red-600">Error</div>
        <div className="mt-1 text-sm text-gray-700">{error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded bg-white p-4 shadow">
        <div>
          <h4 className="font-semibold text-gray-900">
            {t('policies.title')}
          </h4>
          <p className="mt-1 text-sm text-gray-600">
            {t('policies.subtitle')}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-h-[20px]">
            {saveMessage && (
              <div className="text-sm text-green-700">{saveMessage}</div>
            )}
            {error && <div className="text-sm text-red-600">{error}</div>}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {t('policies.activePolicies')} <span className="font-semibold">{selectedCount}</span>
            </div>

            <button
              type="button"
              onClick={resetPolicies}
              disabled={saving || !hasUnsavedChanges}
              className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset
            </button>

            <button
              type="button"
              onClick={() => void savePolicies()}
              disabled={saving || !hasUnsavedChanges}
              className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? t('policies.applying') : 'Apply'}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Premium
          </span>
          <span className="text-sm font-medium text-slate-800">
            {t('policies.advancedLevels')}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {t('policies.premiumDescription')}
        </p>
        {!isPremium ? (
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.hash = '#/dashboard/pro'
              }
            }}
            className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Unlock with Premium
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded bg-white p-4 shadow">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('policies.typicalTripBase')}
          </div>
          <div className="mt-2 text-xl font-semibold text-gray-900">
            {formatMoney(summary.perTrip)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {t('policies.tripBaseDescription')}
          </div>
        </div>

        <div className="rounded bg-white p-4 shadow">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('policies.estimatedWeekly')}
          </div>
          <div className="mt-2 text-xl font-semibold text-gray-900">
            {formatMoney(summary.weekly)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {t('policies.weeklyDescription')}
          </div>
        </div>

        <div className="rounded bg-white p-4 shadow">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('policies.estimatedMonthly')}
          </div>
          <div className="mt-2 text-xl font-semibold text-gray-900">
            {formatMoney(summary.monthlyRecurring)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {t('policies.monthlyDescription')}
          </div>
        </div>

        <div className="rounded bg-white p-4 shadow">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('policies.lastMonth')}
          </div>
          <div className="mt-2 text-xl font-semibold text-gray-900">
            {lastMonthActualCost === null ? '—' : formatMoney(lastMonthActualCost)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {t('policies.lastMonthDescription')}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="rounded bg-white p-4 shadow">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('policies.activeRiders')}
          </div>
          <div className="mt-2 text-xl font-semibold text-gray-900">
            {policyEstimate ? policyEstimate.active_rider_count : '—'}
          </div>
        </div>

        <div className="rounded bg-white p-4 shadow">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('policies.activeStaff')}
          </div>
          <div className="mt-2 text-xl font-semibold text-gray-900">
            {policyEstimate ? policyEstimate.active_staff_count : '—'}
          </div>
        </div>

        <div className="rounded bg-white p-4 shadow">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('policies.housingWeekly')}
          </div>
          <div className="mt-2 text-xl font-semibold text-gray-900">
            {policyEstimate
              ? formatMoney(toNumber(policyEstimate.housing_weekly_cost))
              : '—'}
          </div>
        </div>

        <div className="rounded bg-white p-4 shadow">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('policies.staffEquipment')}
          </div>
          <div className="mt-2 text-xl font-semibold text-gray-900">
            {policyEstimate
              ? formatMoney(toNumber(policyEstimate.staff_support_one_time_cost))
              : '—'}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {t('policies.oneTimeStaff')}
          </div>
        </div>

        <div className="rounded bg-white p-4 shadow">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('policies.seasonalBonusPools')}
          </div>
          <div className="mt-2 text-sm font-semibold text-gray-900">
            {t('policies.riders')}{' '}
            {policyEstimate
              ? formatMoney(toNumber(policyEstimate.rider_bonus_seasonal_cost))
              : '—'}
          </div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            {t('policies.staff')}{' '}
            {policyEstimate
              ? formatMoney(toNumber(policyEstimate.staff_bonus_seasonal_cost))
              : '—'}
          </div>
        </div>
      </div>

      <div className="rounded border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        {t('policies.tripInfo')}
      </div>

      <div className="rounded bg-white p-4 shadow">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-gray-900">{t('policies.upcomingTrips')}</div>
            <div className="mt-1 text-sm text-gray-500">
              {t('policies.upcomingTripsDescription')}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {tripForecasts.length === 0 ? (
            <div className="text-sm text-gray-500">{t('policies.noTrips')}</div>
          ) : (
            tripForecasts.map(row => (
              <div key={row.id} className="rounded border border-gray-200 p-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-medium text-gray-900">
                      {row.event_name || titleCaseValue(row.source_type)}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {titleCaseValue(row.source_type)} · {row.destination_country_code} ·{' '}
                      {formatShortDate(row.start_date)} – {formatShortDate(row.end_date)}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {t('policies.riderCount', { count: row.rider_count })} ·{' '}
                      {t('policies.staffCount', { count: row.staff_count })}
                    </div>
                  </div>

                  <div className="text-left lg:text-right">
                    <div className="text-sm text-gray-500">{t('policies.forecastTotal')}</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatMoney(toNumber(row.total_cost))}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-4">
                  <div className="rounded bg-gray-50 p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {t('policies.travel')}
                    </div>
                    <div className="mt-1 text-sm font-medium text-gray-900">
                      {formatMoney(toNumber(row.travel_cost_total))}
                    </div>
                  </div>

                  <div className="rounded bg-gray-50 p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {t('policies.accommodation')}
                    </div>
                    <div className="mt-1 text-sm font-medium text-gray-900">
                      {formatMoney(toNumber(row.accommodation_cost_total))}
                    </div>
                  </div>

                  <div className="rounded bg-gray-50 p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {t('policies.logistics')}
                    </div>
                    <div className="mt-1 text-sm font-medium text-gray-900">
                      {formatMoney(toNumber(row.logistics_cost_total))}
                    </div>
                  </div>

                  <div className="rounded bg-gray-50 p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {t('policies.staffStay')}
                    </div>
                    <div className="mt-1 text-sm font-medium text-gray-900">
                      {formatMoney(toNumber(row.staff_accommodation_cost_total))}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {sections.map(section => (
        <div key={section.titleKey} className="rounded bg-white p-4 shadow">
          <div>
            <h5 className="font-semibold text-gray-900">{t(section.titleKey)}</h5>
            <p className="mt-1 text-sm text-gray-600">{t(section.descriptionKey)}</p>
          </div>

          <div className="mt-4 space-y-4">
            {section.items.map(item => {
              const selectedValue = policyState[item.key] ?? item.options[0]?.value ?? ''

              return (
                <div key={item.key} className="rounded border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-2xl">
                      <div className="font-medium text-gray-900">{t(item.titleKey)}</div>
                      <div className="mt-1 text-sm text-gray-600">
                        {t(item.descriptionKey)}
                      </div>
                    </div>

                    <div className="w-full lg:w-80">
                      <label
                        htmlFor={item.key}
                        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500"
                      >
                        {t('policies.selectedOption')}
                      </label>
                      <select
                        id={item.key}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                        value={selectedValue}
                        onChange={event => {
                          const nextValue = event.target.value
                          const nextIndex = item.options.findIndex(
                            option => option.value === nextValue
                          )

                          if (!isPremium && nextIndex > 0) {
                            setSaveMessage(null)
                            setError(
                              `${t(item.titleKey)}: this option requires Premium.`
                            )
                            return
                          }

                          updatePolicy(item.key, nextValue)
                        }}
                      >
                        {item.options.map((option, optionIndex) => {
                          const isPremiumOption = optionIndex > 0

                          return (
                            <option
                              key={option.value}
                              value={option.value}
                              disabled={!isPremium && isPremiumOption}
                            >
                              {option.label}
                              {!isPremium
                                ? isPremiumOption
                                  ? t('policies.premiumLock')
                                  : t('policies.freeOption')
                                : ''}
                            </option>
                          )
                        })}
                      </select>

                      {!isPremium ? (
                        <div className="mt-1 text-xs text-slate-500">
                          {t('policies.firstOptionOnly')}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <SelectedOptionCard item={item} selectedValue={selectedValue} />
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="rounded bg-white p-4 shadow">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="font-semibold text-gray-900">{t('policies.applyChangesTitle')}</div>
            <div className="mt-1 text-sm text-gray-600">
              {t('policies.applyChangesDescription')}
            </div>
            <div className="mt-2 min-h-[20px]">
              {saveMessage && (
                <div className="text-sm text-green-700">{saveMessage}</div>
              )}
              {error && <div className="text-sm text-red-600">{error}</div>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={resetPolicies}
              disabled={saving || !hasUnsavedChanges}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset
            </button>

            <button
              type="button"
              onClick={() => void savePolicies()}
              disabled={saving || !hasUnsavedChanges}
              className="rounded bg-yellow-400 px-6 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? t('policies.applying')
                : hasUnsavedChanges
                  ? t('policies.applyChanges')
                  : 'No Changes to Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
