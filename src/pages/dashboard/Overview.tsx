/**
 * Overview.tsx
 * Redesigned dashboard overview page for ProPeloton-style club management.
 *
 * Notes:
 * - Built for HashRouter links (`#/dashboard/...`).
 * - Dashboard data is loaded from Supabase RPC: `get_dashboard_overview`.
 * - Uses silent background refresh to avoid page flicker.
 * - Integrates with sponsor dashboard RPC to pull the signed main sponsor logo
 *   into the overview "Main Sponsor" panel when available.
 */

import React from 'react'
import { supabase } from '../../lib/supabase'

type AlertLevel = 'danger' | 'warning' | 'info' | 'success'
type FeedLevel =
  | 'finance'
  | 'training'
  | 'infrastructure'
  | 'medical'
  | 'inbox'
  | 'sponsor'
  | 'system'

type AlertItem = {
  id: string
  label: string
  level: AlertLevel
  href?: string
}

type KpiItem = {
  label: string
  value: string
  hint: string
  trend?: string
}

type OperationMetric = {
  label: string
  value: string
}

type OperationItem = {
  id: string
  title: string
  status: string
  summary: string
  href?: string
  metrics: OperationMetric[]
}

type SquadPulse = {
  fitness: number
  morale: number
  readiness: number
  form: string
  availableRiders: number
  injured: number
  sick: number
  notFullyFit: number
  expiringContracts: number
}

type ScheduleItem = {
  id: string
  dateLabel: string
  title: string
  subtitle: string
  href?: string
}

type FeedItem = {
  id: string
  level: FeedLevel
  title: string
  subtitle: string
  timeLabel: string
  href?: string
}

type DayRaceItem = {
  id: string
  title: string
  subtitle: string
  timeLabel?: string
  href?: string
}

type NewsItem = {
  id: string
  title: string
  subtitle: string
  timeLabel: string
  href?: string
}

type TransactionSummaryItem = {
  id: string
  type: string
  label: string
  amount: number
}

type FinanceHealth = {
  balance: number
  weeklyNet: number
  sponsorIncome: number
  recurringPolicyCost: number
  nextTripForecast: number
  latestTransactionLabel: string
  latestTransactionAmount: number
  monthlyOperatingIncome: number
  monthlyOperatingExpense: number
  topOperatingIncomes: TransactionSummaryItem[]
  topOperatingExpenses: TransactionSummaryItem[]
  debtMovements: TransactionSummaryItem[]
}

type EmergencyDebtHealth = {
  rescuesUsed: number
  rescueLimit: number
  outstandingPrincipal: number
  nextRepaymentAmount: number
  nextRepaymentDateLabel: string
  liquidationRisk: string
  totalEmergencyLoanDisbursed: number
  totalPrincipalRepaid: number
  totalInterestPaid: number
}

type QuickActionItem = {
  id: string
  label: string
  href: string
  accent: string
}

type MainSponsor = {
  name: string
  logoUrl?: string
  subtitle?: string
  href?: string
  isActive?: boolean
}

type DashboardOverviewData = {
  club: {
    id?: string
    name: string
    handle: string
    countryCode: string
    tier: string
    division: string
    seasonLabel: string
    dateLabel: string
    weatherLabel: string
    rankLabel: string
    inboxUnread: number
    notificationsUnread: number
  }
  alerts: AlertItem[]
  kpis: KpiItem[]
  operations: OperationItem[]
  squadPulse: SquadPulse
  schedule: ScheduleItem[]
  dayRaces: DayRaceItem[]
  news: NewsItem[]
  feed: FeedItem[]
  finance: FinanceHealth
  emergencyDebt: EmergencyDebtHealth
  quickActions: QuickActionItem[]
  mainSponsor: MainSponsor
}

/**
 * SponsorKindForOverview
 * Narrowed sponsor kind union used for sponsor dashboard integration in overview.
 */
type SponsorKindForOverview = 'main' | 'secondary' | 'technical'

/**
 * SignedSponsorForOverview
 * Minimal shape of a signed sponsor as returned by sponsor_get_dashboard,
 * restricted to fields needed by the overview page.
 */
interface SignedSponsorForOverview {
  sponsor_kind?: SponsorKindForOverview | string
  logo_url?: string | null
  metadata?: Record<string, unknown> | null
  name?: string | null
  status?: string | null
}

/**
 * SponsorDashboardForOverview
 * Minimal shape of the sponsor dashboard payload needed by the overview page.
 */
interface SponsorDashboardForOverview {
  club_id?: string | null
  signed_sponsors?: SignedSponsorForOverview[]
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const DEBT_TRANSACTION_TYPES = new Set([
  'emergency_loan_disbursement',
  'emergency_loan_principal_repayment',
])

const REAL_EXPENSE_TRANSACTION_TYPES = new Set([
  'emergency_loan_interest',
])

const transactionTypeLabels: Record<string, string> = {
  emergency_loan_disbursement: 'Emergency Loan',
  emergency_loan_principal_repayment: 'Loan Principal',
  emergency_loan_interest: 'Loan Interest',
  rider_salary_payday: 'Rider Salary',
  staff_salary_payday: 'Staff Salary',
  sponsor_contract_payment: 'Sponsor',
  tax_withholding: 'Tax',
  new_club_bonus: 'Bonus',
}

/**
 * isDebtTransaction
 * Returns true for transaction types that are debt balance movements and should
 * not be mixed into operating income or operating costs.
 */
function isDebtTransaction(type: string): boolean {
  return DEBT_TRANSACTION_TYPES.has(type)
}

/**
 * shouldCountAsOperatingIncome
 * Counts real operating income while excluding loan disbursements.
 */
function shouldCountAsOperatingIncome(type: string, amount: number): boolean {
  if (isDebtTransaction(type)) return false
  return amount > 0
}

/**
 * shouldCountAsOperatingExpense
 * Counts real operating expenses while excluding loan principal repayment.
 * Emergency loan interest is a true expense and must remain in costs.
 */
function shouldCountAsOperatingExpense(type: string, amount: number): boolean {
  if (REAL_EXPENSE_TRANSACTION_TYPES.has(type)) return true
  if (isDebtTransaction(type)) return false
  return amount < 0
}

/**
 * getTransactionTypeLabel
 * Returns a friendly label for known finance transaction types.
 */
function getTransactionTypeLabel(type: string, fallback?: string) {
  return transactionTypeLabels[type] || fallback || type.replace(/_/g, ' ')
}

/**
 * formatCurrency
 * Formats a number as a USD currency string without decimals.
 */
function formatCurrency(value: number) {
  return currencyFormatter.format(value)
}

/**
 * formatSignedCurrency
 * Formats a number as a signed USD string, prefixing + for positive values.
 */
function formatSignedCurrency(value: number) {
  if (value > 0) return `+${formatCurrency(value)}`
  if (value < 0) return `-${formatCurrency(Math.abs(value))}`
  return formatCurrency(0)
}

/**
 * cn
 * Simple conditional class name joiner.
 */
function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

/**
 * asArray
 * Safe helper to coerce an unknown value into an array of T.
 */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/**
 * asObject
 * Safe helper to coerce an unknown value into an object of type T with fallback.
 */
function asObject<T>(value: unknown, fallback: T): T {
  return value && typeof value === 'object' ? (value as T) : fallback
}

/**
 * asString
 * Safe helper to coerce an unknown value into a string with fallback.
 */
function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/**
 * asBoolean
 * Safe helper to coerce an unknown value into a boolean with fallback.
 */
function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * asNumber
 * Safe helper to coerce numbers or numeric strings into a number.
 */
function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/[$€£,\s]/g, '')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return fallback
}

/**
 * stableStringify
 * Deterministic JSON stringify used for shallow change detection.
 */
function stableStringify(value: unknown) {
  return JSON.stringify(value)
}

/**
 * getMetadataValueFromObject
 * Returns a trimmed string value from a loose metadata object if present; otherwise null.
 */
function getMetadataValueFromObject(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!metadata) return null
  const value = metadata[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

/**
 * resolveMainSponsorLogoUrlFromDashboard
 * Extracts the best-guess logo URL for a signed main sponsor coming from the
 * sponsor dashboard payload, preferring direct logo_url and falling back to
 * metadata.logo_url when set.
 */
function resolveMainSponsorLogoUrlFromDashboard(
  signedSponsor: SignedSponsorForOverview | null | undefined,
): string | null {
  if (!signedSponsor) return null

  const direct = typeof signedSponsor.logo_url === 'string' ? signedSponsor.logo_url : null
  const metaLogo = getMetadataValueFromObject(signedSponsor.metadata ?? null, 'logo_url')
  const finalUrl = direct || metaLogo

  if (!finalUrl || finalUrl.trim().length === 0) return null
  return finalUrl
}

/**
 * formatGameDateShort
 * Converts an in-game ISO date like 2000-07-03 into 03/07, Season 1.
 */
function formatGameDateShort(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return ''

  const year = Number(match[1])
  const month = match[2]
  const day = match[3]
  const season = year - 1999

  if (!Number.isFinite(year) || season < 1) return ''
  return `${day}/${month}, Season ${season}`
}

/**
 * normalizeTransactionType
 * Ensures transaction type checks are consistent.
 */
function normalizeTransactionType(value: unknown): string {
  return asString(value).trim().toLowerCase()
}

/**
 * normalizeFinanceTransactionRows
 * Normalizes loose transaction rows into a consistent typed shape.
 */
function normalizeFinanceTransactionRows(value: unknown): TransactionSummaryItem[] {
  return asArray<Record<string, unknown>>(value)
    .map((row, index) => {
      const type = normalizeTransactionType(row.type ?? row.transaction_type ?? row.kind)
      const rawLabel = asString(row.label ?? row.title ?? row.name)
      const amount = asNumber(
        row.amount ??
          row.netAmount ??
          row.net_amount ??
          row.total ??
          row.value ??
          row.signed_amount,
        0,
      )

      if (!type && !rawLabel) return null

      return {
        id: asString(row.id ?? row.transaction_id, `${type || 'transaction'}:${index}`),
        type,
        label: getTransactionTypeLabel(type, rawLabel),
        amount,
      }
    })
    .filter((row): row is TransactionSummaryItem => Boolean(row))
}

/**
 * buildOperatingTransactionSummary
 * Builds frontend operating finance summaries from raw transaction rows.
 *
 * Important:
 * - Emergency loan disbursement is excluded from income.
 * - Emergency loan principal repayment is excluded from costs.
 * - Emergency loan interest remains a real operating expense.
 * - Displayed amounts keep their real signed value.
 */
function buildOperatingTransactionSummary(rows: TransactionSummaryItem[]) {
  const topOperatingIncomes = rows
    .filter((row) => shouldCountAsOperatingIncome(row.type, row.amount))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 5)

  const topOperatingExpenses = rows
    .filter((row) => shouldCountAsOperatingExpense(row.type, row.amount))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 5)

  const debtMovements = rows
    .filter((row) => isDebtTransaction(row.type))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 5)

  return {
    monthlyOperatingIncome: topOperatingIncomes.reduce((sum, row) => sum + row.amount, 0),
    monthlyOperatingExpense: topOperatingExpenses.reduce((sum, row) => sum + row.amount, 0),
    topOperatingIncomes,
    topOperatingExpenses,
    debtMovements,
  }
}

/**
 * normalizeFinanceHealth
 * Normalizes finance payload and applies loan-aware operating transaction rules.
 */
function normalizeFinanceHealth(value: unknown, fallbackTransactions?: unknown): FinanceHealth {
  const safe = asObject<Record<string, unknown>>(value, {})

  const rawTransactions =
    safe.monthlyTransactions ??
    safe.monthly_transactions ??
    safe.statementRows ??
    safe.statement_rows ??
    safe.transactions ??
    fallbackTransactions ??
    []

  const transactionRows = normalizeFinanceTransactionRows(rawTransactions)
  const summary = buildOperatingTransactionSummary(transactionRows)

  const suppliedTopIncomes = normalizeFinanceTransactionRows(
    safe.topOperatingIncomes ??
      safe.top_operating_incomes ??
      safe.topIncomes ??
      safe.top_incomes,
  ).filter((row) => shouldCountAsOperatingIncome(row.type, row.amount))

  const suppliedTopExpenses = normalizeFinanceTransactionRows(
    safe.topOperatingExpenses ??
      safe.top_operating_expenses ??
      safe.topCosts ??
      safe.top_costs ??
      safe.topExpenses ??
      safe.top_expenses,
  ).filter((row) => shouldCountAsOperatingExpense(row.type, row.amount))

  const suppliedDebtMovements = normalizeFinanceTransactionRows(
    safe.debtMovements ?? safe.debt_movements ?? safe.debtItems ?? safe.debt_items,
  ).filter((row) => isDebtTransaction(row.type))

  return {
    balance: asNumber(safe.balance, 0),
    weeklyNet: asNumber(safe.weeklyNet ?? safe.weekly_net, 0),
    sponsorIncome: asNumber(safe.sponsorIncome ?? safe.sponsor_income, 0),
    recurringPolicyCost: asNumber(
      safe.recurringPolicyCost ?? safe.recurring_policy_cost,
      0,
    ),
    nextTripForecast: asNumber(safe.nextTripForecast ?? safe.next_trip_forecast, 0),
    latestTransactionLabel: asString(
      safe.latestTransactionLabel ?? safe.latest_transaction_label,
      'No transactions',
    ),
    latestTransactionAmount: asNumber(
      safe.latestTransactionAmount ?? safe.latest_transaction_amount,
      0,
    ),
    monthlyOperatingIncome: asNumber(
      safe.monthlyOperatingIncome ?? safe.monthly_operating_income,
      summary.monthlyOperatingIncome,
    ),
    monthlyOperatingExpense: asNumber(
      safe.monthlyOperatingExpense ?? safe.monthly_operating_expense,
      summary.monthlyOperatingExpense,
    ),
    topOperatingIncomes:
      suppliedTopIncomes.length > 0
        ? suppliedTopIncomes
        : summary.topOperatingIncomes,
    topOperatingExpenses:
      suppliedTopExpenses.length > 0
        ? suppliedTopExpenses
        : summary.topOperatingExpenses,
    debtMovements:
      suppliedDebtMovements.length > 0
        ? suppliedDebtMovements
        : summary.debtMovements,
  }
}

/**
 * normalizeEmergencyDebt
 * Normalizes emergency-loan debt data from either top-level payload or finance payload.
 */
function normalizeEmergencyDebt(
  value: unknown,
  financeSafe: Record<string, unknown>,
): EmergencyDebtHealth {
  const safe = asObject<Record<string, unknown>>(
    value ??
      financeSafe.emergencyDebt ??
      financeSafe.emergency_debt ??
      financeSafe.debt ??
      {},
    {},
  )

  const rescuesUsed = asNumber(
    safe.rescuesUsed ??
      safe.rescues_used ??
      safe.emergencyRescueCount ??
      safe.emergency_rescue_count ??
      financeSafe.rescuesUsed ??
      financeSafe.rescues_used ??
      financeSafe.emergencyRescueCount ??
      financeSafe.emergency_rescue_count,
    0,
  )

  const rescueLimit = asNumber(
    safe.rescueLimit ??
      safe.rescue_limit ??
      safe.maxRescues ??
      safe.max_rescues ??
      financeSafe.rescueLimit ??
      financeSafe.rescue_limit ??
      financeSafe.maxRescues ??
      financeSafe.max_rescues,
    3,
  )

  const outstandingPrincipal = asNumber(
    safe.outstandingPrincipal ??
      safe.outstanding_principal ??
      safe.activeOutstandingPrincipal ??
      safe.active_outstanding_principal ??
      financeSafe.outstandingPrincipal ??
      financeSafe.outstanding_principal ??
      financeSafe.activeOutstandingPrincipal ??
      financeSafe.active_outstanding_principal,
    0,
  )

  const nextRepaymentAmount = asNumber(
    safe.nextRepaymentAmount ??
      safe.next_repayment_amount ??
      safe.actualWeeklyDueOptionB ??
      safe.actual_weekly_due_option_b ??
      safe.weeklyDue ??
      safe.weekly_due ??
      financeSafe.nextRepaymentAmount ??
      financeSafe.next_repayment_amount ??
      financeSafe.actualWeeklyDueOptionB ??
      financeSafe.actual_weekly_due_option_b,
    0,
  )

  const nextRepaymentDateRaw = asString(
    safe.nextRepaymentDate ??
      safe.next_repayment_date ??
      safe.nextUnprocessedDueGameDate ??
      safe.next_unprocessed_due_game_date ??
      financeSafe.nextRepaymentDate ??
      financeSafe.next_repayment_date ??
      financeSafe.nextUnprocessedDueGameDate ??
      financeSafe.next_unprocessed_due_game_date,
    '',
  )

  const nextRepaymentDateLabel =
    asString(
      safe.nextRepaymentDateLabel ??
        safe.next_repayment_date_label ??
        financeSafe.nextRepaymentDateLabel ??
        financeSafe.next_repayment_date_label,
      '',
    ) ||
    formatGameDateShort(nextRepaymentDateRaw) ||
    'No repayment scheduled'

  const totalEmergencyLoanDisbursed = asNumber(
    safe.totalEmergencyLoanDisbursed ??
      safe.total_emergency_loan_disbursed ??
      safe.emergencyLoanDisbursed ??
      safe.emergency_loan_disbursed ??
      financeSafe.totalEmergencyLoanDisbursed ??
      financeSafe.total_emergency_loan_disbursed,
    outstandingPrincipal,
  )

  const totalPrincipalRepaid = asNumber(
    safe.totalPrincipalRepaid ??
      safe.total_principal_repaid ??
      safe.principalRepaid ??
      safe.principal_repaid ??
      financeSafe.totalPrincipalRepaid ??
      financeSafe.total_principal_repaid,
    0,
  )

  const totalInterestPaid = asNumber(
    safe.totalInterestPaid ??
      safe.total_interest_paid ??
      safe.interestPaid ??
      safe.interest_paid ??
      financeSafe.totalInterestPaid ??
      financeSafe.total_interest_paid,
    0,
  )

  const liquidationRisk =
    asString(
      safe.liquidationRisk ??
        safe.liquidation_risk ??
        financeSafe.liquidationRisk ??
        financeSafe.liquidation_risk,
      '',
    ) ||
    (outstandingPrincipal > 0 && rescuesUsed >= 2
      ? 'High'
      : outstandingPrincipal > 0
        ? 'Medium'
        : 'Low')

  return {
    rescuesUsed,
    rescueLimit,
    outstandingPrincipal,
    nextRepaymentAmount,
    nextRepaymentDateLabel,
    liquidationRisk,
    totalEmergencyLoanDisbursed,
    totalPrincipalRepaid,
    totalInterestPaid,
  }
}

/**
 * buildDebtMovementsFromEmergencyDebt
 * Creates debt movement rows for the Emergency Debt card when the RPC sends
 * aggregated debt totals instead of transaction rows.
 */
function buildDebtMovementsFromEmergencyDebt(
  debt: EmergencyDebtHealth,
  financeDebtMovements: TransactionSummaryItem[],
): TransactionSummaryItem[] {
  if (financeDebtMovements.length > 0) return financeDebtMovements

  const rows: TransactionSummaryItem[] = []

  if (debt.totalEmergencyLoanDisbursed !== 0) {
    rows.push({
      id: 'emergency_loan_disbursement',
      type: 'emergency_loan_disbursement',
      label: transactionTypeLabels.emergency_loan_disbursement,
      amount: Math.abs(debt.totalEmergencyLoanDisbursed),
    })
  }

  if (debt.totalPrincipalRepaid !== 0) {
    rows.push({
      id: 'emergency_loan_principal_repayment',
      type: 'emergency_loan_principal_repayment',
      label: transactionTypeLabels.emergency_loan_principal_repayment,
      amount:
        debt.totalPrincipalRepaid > 0
          ? -Math.abs(debt.totalPrincipalRepaid)
          : debt.totalPrincipalRepaid,
    })
  }

  if (debt.totalInterestPaid !== 0) {
    rows.push({
      id: 'emergency_loan_interest',
      type: 'emergency_loan_interest',
      label: transactionTypeLabels.emergency_loan_interest,
      amount:
        debt.totalInterestPaid > 0
          ? -Math.abs(debt.totalInterestPaid)
          : debt.totalInterestPaid,
    })
  }

  return rows
}

/**
 * normalizeMainSponsor
 * Normalizes a loose main sponsor-like value into the MainSponsor type.
 */
function normalizeMainSponsor(value: unknown, fallbackIsActive = false): MainSponsor {
  const safe = asObject<Record<string, unknown>>(value, {})
  const metadata = asObject<Record<string, unknown>>(safe.metadata, {})
  const branding = asObject<Record<string, unknown>>(safe.branding, {})

  const name =
    asString(safe.name) ||
    asString(safe.companyName) ||
    asString(safe.company_name) ||
    asString(metadata.company_name) ||
    'Main Sponsor'

  const logoUrl =
    asString(safe.logoUrl) ||
    asString(safe.logo_url) ||
    asString(safe.logo) ||
    asString(safe.imageUrl) ||
    asString(safe.image_url) ||
    asString(safe.company_logo_url) ||
    asString(safe.companyLogoUrl) ||
    asString(metadata.logo_url) ||
    asString(metadata.logoUrl) ||
    asString(branding.logo_url) ||
    asString(branding.logoUrl)

  const subtitle =
    asString(safe.subtitle) ||
    (logoUrl ? 'Signed main sponsor deal' : 'No main sponsor deal signed yet.')

  const href = asString(safe.href, '#/dashboard/finance')
  const status = asString(safe.status).toLowerCase()
  const isSignedByStatus =
    status === 'signed' || status === 'active' || status === 'running' || status === 'current'

  const isActive = asBoolean(
    safe.isActive,
    asBoolean(
      safe.is_active,
      asBoolean(
        safe.isSigned,
        asBoolean(safe.signed, Boolean(logoUrl) || isSignedByStatus || fallbackIsActive),
      ),
    ),
  )

  return {
    name,
    logoUrl,
    subtitle,
    href,
    isActive,
  }
}

/**
 * normalizeDashboardPayload
 * Converts the raw RPC payload for get_dashboard_overview into a typed structure.
 */
function normalizeDashboardPayload(payload: unknown): DashboardOverviewData {
  const safe = asObject<Record<string, unknown>>(payload, {})
  const financeSafe = asObject<Record<string, unknown>>(safe.finance, {})

  const fallbackMainSponsor =
    safe.mainSponsor ??
    safe.main_sponsor ??
    safe.mainSponsorCompany ??
    safe.main_sponsor_company ??
    safe.sponsor ??
    safe.primarySponsor

  const finance = normalizeFinanceHealth(
    safe.finance,
    safe.transactions ?? safe.statementRows ?? safe.statement_rows,
  )

  const emergencyDebt = normalizeEmergencyDebt(
    safe.emergencyDebt ?? safe.emergency_debt ?? safe.debt,
    financeSafe,
  )

  const mainSponsorSignedHint =
    asBoolean(safe.mainSponsorSigned) ||
    asBoolean(safe.main_sponsor_signed) ||
    asBoolean(safe.hasMainSponsor) ||
    asBoolean(safe.has_main_sponsor) ||
    asBoolean(financeSafe.mainSponsorSigned) ||
    asBoolean(financeSafe.main_sponsor_signed) ||
    asBoolean(financeSafe.hasMainSponsor) ||
    asBoolean(financeSafe.has_main_sponsor) ||
    asBoolean(financeSafe.mainSponsorActive) ||
    asBoolean(financeSafe.main_sponsor_active)

  return {
    club: asObject(safe.club, {
      id: '',
      name: 'Club',
      handle: 'Manager',
      countryCode: '',
      tier: '',
      division: '',
      seasonLabel: 'Season 1',
      dateLabel: '',
      weatherLabel: '',
      rankLabel: '-',
      inboxUnread: 0,
      notificationsUnread: 0,
    }),
    alerts: asArray<AlertItem>(safe.alerts),
    kpis: asArray<KpiItem>(safe.kpis),
    operations: asArray<OperationItem>(safe.operations),
    squadPulse: asObject(safe.squadPulse, {
      fitness: 0,
      morale: 0,
      readiness: 0,
      form: '+0',
      availableRiders: 0,
      injured: 0,
      sick: 0,
      notFullyFit: 0,
      expiringContracts: 0,
    }),
    schedule: asArray<ScheduleItem>(safe.schedule),
    dayRaces: asArray<DayRaceItem>(safe.dayRaces),
    news: asArray<NewsItem>(safe.news),
    feed: asArray<FeedItem>(safe.feed),
    finance,
    emergencyDebt,
    quickActions: asArray<QuickActionItem>(safe.quickActions),
    mainSponsor: normalizeMainSponsor(
      fallbackMainSponsor ?? financeSafe.mainSponsor ?? financeSafe.main_sponsor,
      mainSponsorSignedHint,
    ),
  }
}

/**
 * getAlertClasses
 * Returns Tailwind classes for an alert chip based on alert level.
 */
function getAlertClasses(level: AlertLevel) {
  switch (level) {
    case 'danger':
      return 'border-red-200 bg-red-50 text-red-700'
    case 'warning':
      return 'border-yellow-200 bg-yellow-50 text-yellow-800'
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'info':
    default:
      return 'border-blue-200 bg-blue-50 text-blue-700'
  }
}

/**
 * getFeedAccent
 * Returns Tailwind background classes for a feed item icon.
 */
function getFeedAccent(level: FeedLevel) {
  switch (level) {
    case 'finance':
      return 'bg-emerald-500'
    case 'training':
      return 'bg-violet-500'
    case 'infrastructure':
      return 'bg-cyan-600'
    case 'medical':
      return 'bg-red-500'
    case 'inbox':
      return 'bg-rose-500'
    case 'sponsor':
      return 'bg-yellow-500'
    case 'system':
    default:
      return 'bg-slate-500'
  }
}

/**
 * getFeedIcon
 * Returns a simple text icon for a feed item.
 */
function getFeedIcon(level: FeedLevel) {
  switch (level) {
    case 'finance':
      return '€'
    case 'training':
      return 'TC'
    case 'infrastructure':
      return 'IF'
    case 'medical':
      return '+'
    case 'inbox':
      return 'IN'
    case 'sponsor':
      return 'SP'
    case 'system':
    default:
      return '•'
  }
}

/**
 * getRiskTextClass
 * Returns text color class for liquidation risk.
 */
function getRiskTextClass(risk: string) {
  const normalized = risk.trim().toLowerCase()

  if (normalized === 'high' || normalized === 'critical') return 'text-red-600'
  if (normalized === 'medium' || normalized === 'moderate') return 'text-yellow-600'
  if (normalized === 'low') return 'text-emerald-600'

  return 'text-slate-900'
}

/**
 * formatNextRepayment
 * Formats next repayment amount and game date.
 */
function formatNextRepayment(debt: EmergencyDebtHealth) {
  const hasAmount = debt.nextRepaymentAmount > 0
  const hasDate =
    debt.nextRepaymentDateLabel &&
    debt.nextRepaymentDateLabel !== 'No repayment scheduled'

  if (hasAmount && hasDate) {
    return `${formatCurrency(debt.nextRepaymentAmount)} on ${debt.nextRepaymentDateLabel}`
  }

  if (hasAmount) return formatCurrency(debt.nextRepaymentAmount)
  if (hasDate) return debt.nextRepaymentDateLabel

  return 'No repayment scheduled'
}

/**
 * Card
 * Basic rounded card wrapper with border and shadow.
 */
function Card({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white shadow-sm', className)}>
      {children}
    </div>
  )
}

/**
 * SectionTitle
 * Standard section title with optional subtitle.
 */
function SectionTitle({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  )
}

/**
 * SectionEmptyState
 * Generic empty state panel for a section.
 */
function SectionEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <div className="mt-1 text-sm text-slate-500">{description}</div>
    </div>
  )
}

/**
 * KpiCard
 * Shows a single KPI metric.
 */
function KpiCard({ item }: { item: KpiItem }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {item.label}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{item.value}</div>
      <div className="mt-2 text-sm text-slate-500">{item.hint}</div>
      {item.trend ? (
        <div className="mt-3 text-xs font-medium text-slate-700">{item.trend}</div>
      ) : null}
    </Card>
  )
}

/**
 * ProgressMetric
 * Horizontal progress indicator used for squad metrics.
 */
function ProgressMetric({
  label,
  value,
  colorClass,
}: {
  label: string
  value: number
  colorClass: string
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-900">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full', colorClass)}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  )
}

/**
 * SmallStat
 * Compact statistic row used across cards.
 */
function SmallStat({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string | number
  valueClassName?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={cn('text-right text-sm font-semibold text-slate-900', valueClassName)}>
        {value}
      </span>
    </div>
  )
}

/**
 * TransactionSummaryRow
 * Compact row for top incomes, costs, and debt movement display.
 */
function TransactionSummaryRow({ item }: { item: TransactionSummaryItem }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="min-w-0 truncate text-sm text-slate-600">{item.label}</span>
      <span
        className={cn(
          'whitespace-nowrap text-sm font-semibold',
          item.amount >= 0 ? 'text-emerald-600' : 'text-red-600',
        )}
      >
        {formatSignedCurrency(item.amount)}
      </span>
    </div>
  )
}

/**
 * OperationCard
 * Card for a single active operation.
 */
function OperationCard({ item }: { item: OperationItem }) {
  const hasMetrics = Array.isArray(item.metrics) && item.metrics.length > 0

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-slate-900">{item.title}</div>
          <div className="mt-1 text-sm text-slate-500">{item.summary}</div>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {item.status}
        </span>
      </div>

      {hasMetrics ? (
        <div className="mt-4 space-y-2">
          {item.metrics.map((metric) => (
            <div key={metric.label} className="flex items-center justify-between text-sm">
              <span className="text-slate-500">{metric.label}</span>
              <span className="font-medium text-slate-900">{metric.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
          No detailed metrics available.
        </div>
      )}

      {item.href ? (
        <a
          href={item.href}
          className="mt-4 inline-flex items-center text-sm font-semibold text-slate-900 hover:text-yellow-600"
        >
          Open
        </a>
      ) : null}
    </Card>
  )
}

/**
 * ScheduleRow
 * Row for an upcoming schedule entry.
 */
function ScheduleRow({ item }: { item: ScheduleItem }) {
  const content = (
    <div className="flex items-start gap-4 rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50">
      <div className="min-w-[72px] rounded-lg bg-slate-100 px-3 py-2 text-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</div>
        <div className="mt-1 text-sm font-bold text-slate-900">{item.dateLabel}</div>
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
        <div className="mt-1 text-sm text-slate-500">{item.subtitle}</div>
      </div>
    </div>
  )

  return item.href ? <a href={item.href}>{content}</a> : content
}

/**
 * DayRaceRow
 * Row for races happening on the current game day.
 */
function DayRaceRow({ item }: { item: DayRaceItem }) {
  const content = (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
        <div className="mt-1 text-sm text-slate-500">{item.subtitle}</div>
      </div>
      {item.timeLabel ? (
        <div className="whitespace-nowrap rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
          {item.timeLabel}
        </div>
      ) : null}
    </div>
  )

  return item.href ? <a href={item.href}>{content}</a> : content
}

/**
 * NewsRow
 * Row for a single news item.
 */
function NewsRow({ item }: { item: NewsItem }) {
  const content = (
    <div className="rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
        <div className="whitespace-nowrap text-xs text-slate-400">{item.timeLabel}</div>
      </div>
      <div className="mt-1 text-sm text-slate-500">{item.subtitle}</div>
    </div>
  )

  return item.href ? <a href={item.href}>{content}</a> : content
}

/**
 * FeedRow
 * Row for a single activity feed item.
 */
function FeedRow({ item }: { item: FeedItem }) {
  const content = (
    <div className="flex items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50">
      <div
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white',
          getFeedAccent(item.level),
        )}
      >
        {getFeedIcon(item.level)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">{item.title}</div>
          <div className="whitespace-nowrap text-xs text-slate-400">{item.timeLabel}</div>
        </div>
        <div className="mt-1 text-sm text-slate-500">{item.subtitle}</div>
      </div>
    </div>
  )

  return item.href ? <a href={item.href}>{content}</a> : content
}

/**
 * QuickAction
 * Gradient tile linking to a primary management area.
 */
function QuickAction({ item }: { item: QuickActionItem }) {
  return (
    <a
      href={item.href}
      className={cn(
        'group relative min-h-[92px] overflow-hidden rounded-2xl bg-gradient-to-br px-4 py-4 text-white shadow-sm transition hover:-translate-y-0.5',
        item.accent,
      )}
    >
      <div className="text-sm font-semibold">{item.label}</div>
      <div className="mt-1 text-xs text-white/80">Open</div>
      <div className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-white/10 transition group-hover:scale-110" />
    </a>
  )
}

/**
 * MainSponsorPanel
 * Visual panel that shows the main sponsor logo or a meaningful empty state.
 * Fixed-height container so the card size does not change, while the logo
 * stretches to use much more of the available space.
 */
function MainSponsorPanel({ sponsor }: { sponsor: MainSponsor }) {
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    setFailed(false)
  }, [sponsor.logoUrl])

  const hasLogo = Boolean(sponsor.logoUrl) && !failed
  const hasSignedSponsor = Boolean(sponsor.isActive || sponsor.logoUrl)
  const initials = (sponsor.name || 'MS')
    .split(' ')
    .map((part) => part.trim()[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="h-[220px] rounded-2xl border border-slate-200 bg-slate-50 p-3">
      {hasLogo ? (
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-white">
          <img
            src={sponsor.logoUrl}
            alt={sponsor.name || 'Main Sponsor'}
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain p-1"
          />
        </div>
      ) : hasSignedSponsor ? (
        <div className="flex h-full w-full items-center justify-center rounded-xl bg-white">
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-slate-300 bg-white text-xl font-bold text-slate-700">
            {initials}
          </div>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-xl bg-white text-center">
          <div>
            <div className="text-base font-semibold text-slate-700">No Main Sponsor signed</div>
            <div className="mt-1 text-sm text-slate-500">Please visit Sponsor Page.</div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * EmergencyDebtCard
 * Dedicated emergency-loan card so loan disbursement and principal repayment
 * are not mixed into operating income/costs.
 */
function EmergencyDebtCard({
  debt,
  debtMovements,
}: {
  debt: EmergencyDebtHealth
  debtMovements: TransactionSummaryItem[]
}) {
  const visibleDebtMovements = buildDebtMovementsFromEmergencyDebt(debt, debtMovements)

  return (
    <Card className="p-5">
      <SectionTitle
        title="Emergency Debt"
        subtitle="Emergency loans, principal balance, repayment pressure, and liquidation risk."
      />

      <div className="mt-5 space-y-3">
        <SmallStat
          label="Rescues used"
          value={`${debt.rescuesUsed} / ${debt.rescueLimit}`}
          valueClassName={debt.rescuesUsed >= debt.rescueLimit ? 'text-red-600' : ''}
        />
        <SmallStat
          label="Outstanding principal"
          value={formatCurrency(debt.outstandingPrincipal)}
          valueClassName={debt.outstandingPrincipal > 0 ? 'text-red-600' : 'text-emerald-600'}
        />
        <SmallStat label="Next repayment" value={formatNextRepayment(debt)} />
        <SmallStat
          label="Liquidation risk"
          value={debt.liquidationRisk}
          valueClassName={getRiskTextClass(debt.liquidationRisk)}
        />
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Debt Movement
        </div>

        {visibleDebtMovements.length > 0 ? (
          <div className="mt-3 space-y-2">
            {visibleDebtMovements.map((item) => (
              <TransactionSummaryRow key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
            No emergency loan movement found.
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * EmptyState
 * Generic centered empty state component.
 */
function EmptyState({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <div className="mt-1 text-sm text-slate-500">{subtitle}</div>
    </div>
  )
}

/**
 * DashboardSkeleton
 * Skeleton layout while the overview data is loading.
 */
function DashboardSkeleton() {
  return (
    <div className="w-full space-y-6">
      <div className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
          />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 space-y-6 xl:col-span-8">
          <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
        </div>
        <div className="col-span-12 space-y-6 xl:col-span-4">
          <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
        </div>
      </div>
      <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
    </div>
  )
}

/**
 * OverviewPage
 * Top-level dashboard overview page component.
 */
export default function OverviewPage() {
  const [data, setData] = React.useState<DashboardOverviewData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const dataRef = React.useRef<DashboardOverviewData | null>(null)

  React.useEffect(() => {
    dataRef.current = data
  }, [data])

  React.useEffect(() => {
    let alive = true
    let inFlight = false

    /**
     * loadDashboard
     * Loads the main dashboard overview and enriches it with main sponsor logo
     * information from the sponsor dashboard when available.
     */
    async function loadDashboard(options?: { silent?: boolean }) {
      if (inFlight) return
      inFlight = true

      const silent = options?.silent === true
      const hasVisibleData = !!dataRef.current

      try {
        if (!silent && !hasVisibleData) {
          setLoading(true)
        } else if (silent) {
          setRefreshing(true)
        }

        if (!silent && !hasVisibleData) {
          setError(null)
        }

        const { data: rpcData, error: rpcError } = await supabase.rpc('get_dashboard_overview')

        if (rpcError) {
          // eslint-disable-next-line no-console
          console.error('Dashboard RPC error', rpcError)
          throw new Error(
            [
              rpcError.message,
              rpcError.details,
              rpcError.hint,
              rpcError.code ? `code=${rpcError.code}` : null,
            ]
              .filter(Boolean)
              .join(' | '),
          )
        }

        if (!rpcData) {
          throw new Error('Dashboard payload is empty.')
        }

        let normalized = normalizeDashboardPayload(rpcData)

        // Try to enrich main sponsor with the signed main sponsor logo from the sponsor dashboard.
        try {
          const clubId =
            normalized.club.id && normalized.club.id.trim().length > 0
              ? normalized.club.id
              : null

          const { data: sponsorData, error: sponsorError } = await supabase.rpc(
            'sponsor_get_dashboard',
            {
              p_club_id: clubId,
            },
          )

          if (sponsorError) {
            // eslint-disable-next-line no-console
            console.error('Sponsor dashboard RPC error', sponsorError)
          } else if (sponsorData) {
            const dashboard = sponsorData as SponsorDashboardForOverview
            const signedMain = Array.isArray(dashboard.signed_sponsors)
              ? dashboard.signed_sponsors.find(
                  (s) => (s.sponsor_kind ?? '').toString().toLowerCase() === 'main',
                )
              : undefined

            if (signedMain) {
              const logoUrl = resolveMainSponsorLogoUrlFromDashboard(signedMain)
              const signedStatus = (signedMain.status ?? '').toString().toLowerCase()
              const isSignedByStatus =
                signedStatus === 'signed' ||
                signedStatus === 'active' ||
                signedStatus === 'running' ||
                signedStatus === 'current'

              normalized = {
                ...normalized,
                mainSponsor: {
                  ...normalized.mainSponsor,
                  name: signedMain.name || normalized.mainSponsor.name,
                  logoUrl: logoUrl || normalized.mainSponsor.logoUrl,
                  isActive: Boolean(logoUrl) || isSignedByStatus || true,
                  subtitle:
                    normalized.mainSponsor.subtitle &&
                    normalized.mainSponsor.subtitle !== 'No main sponsor deal signed yet.'
                      ? normalized.mainSponsor.subtitle
                      : 'Signed main sponsor deal',
                },
              }
            }
          }
        } catch (sponsorErr) {
          // Sponsor integration is non-critical for the overview; log and continue.
          // eslint-disable-next-line no-console
          console.error('Sponsor dashboard enrichment failed', sponsorErr)
        }

        const nextSerialized = stableStringify(normalized)
        const currentSerialized = stableStringify(dataRef.current)

        if (alive) {
          if (nextSerialized !== currentSerialized) {
            setData(normalized)
          }
          setError(null)
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Dashboard load failed', err)

        if (alive && !hasVisibleData) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard.')
        }
      } finally {
        if (alive) {
          setLoading(false)
          setRefreshing(false)
        }
        inFlight = false
      }
    }

    void loadDashboard()

    const interval = window.setInterval(() => {
      void loadDashboard({ silent: true })
    }, 30000)

    return () => {
      alive = false
      window.clearInterval(interval)
    }
  }, [])

  if (loading && !data) {
    return <DashboardSkeleton />
  }

  if (error || !data) {
    return (
      <div className="w-full space-y-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <div className="text-sm font-medium text-red-700">Failed to load dashboard</div>
          <div className="mt-1 text-sm text-red-600">{error ?? 'Unknown error'}</div>
        </div>
      </div>
    )
  }

  const visibleFeed = data.feed.slice(0, 5)

  return (
    <div className="w-full space-y-6">
      {/* Alerts */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionTitle title="Attention" subtitle="Important things that need action or awareness." />

          <div className="flex flex-wrap items-center gap-2">
            {refreshing ? (
              <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
                Refreshing...
              </div>
            ) : null}

            <div className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
              Inbox {data.club.inboxUnread}
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
              Notifications {data.club.notificationsUnread}
            </div>
          </div>
        </div>

        {data.alerts.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {data.alerts.slice(0, 6).map((alert) => {
              const chip = (
                <div
                  className={cn(
                    'rounded-full border px-3 py-2 text-sm font-medium transition hover:opacity-90',
                    getAlertClasses(alert.level),
                  )}
                >
                  {alert.label}
                </div>
              )

              return alert.href ? (
                <a key={alert.id} href={alert.href}>
                  {chip}
                </a>
              ) : (
                <div key={alert.id}>{chip}</div>
              )
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            No urgent issues right now.
          </div>
        )}
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {data.kpis.map((item) => (
          <KpiCard key={item.label} item={item} />
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 space-y-6 xl:col-span-8">
          {/* Active Operations */}
          <Card className="p-5">
            <SectionTitle
              title="Active Operations"
              subtitle="Live systems, ongoing jobs, and current club activity."
            />

            {data.operations.length > 0 ? (
              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
                {data.operations.map((item) => (
                  <OperationCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <SectionEmptyState
                title="No active operations"
                description="There are no active training camps, infrastructure jobs, or policy-heavy operational events right now."
              />
            )}
          </Card>

          {/* Squad Pulse */}
          <Card className="p-5">
            <SectionTitle
              title="Squad Pulse"
              subtitle="Readiness, morale, health, and contract pressure."
            />

            <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-5">
                <ProgressMetric
                  label="Fitness"
                  value={data.squadPulse.fitness}
                  colorClass="bg-blue-500"
                />
                <ProgressMetric
                  label="Morale"
                  value={data.squadPulse.morale}
                  colorClass="bg-emerald-500"
                />
                <ProgressMetric
                  label="Readiness"
                  value={data.squadPulse.readiness}
                  colorClass="bg-violet-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SmallStat
                  label="Form"
                  value={data.squadPulse.form}
                  valueClassName="text-emerald-600"
                />
                <SmallStat label="Available Riders" value={data.squadPulse.availableRiders} />
                <SmallStat
                  label="Injured"
                  value={data.squadPulse.injured}
                  valueClassName={data.squadPulse.injured > 0 ? 'text-red-600' : ''}
                />
                <SmallStat
                  label="Sick"
                  value={data.squadPulse.sick}
                  valueClassName={data.squadPulse.sick > 0 ? 'text-red-600' : ''}
                />
                <SmallStat
                  label="Not Fully Fit"
                  value={data.squadPulse.notFullyFit}
                  valueClassName={data.squadPulse.notFullyFit > 0 ? 'text-yellow-600' : ''}
                />
                <SmallStat
                  label="Expiring Contracts"
                  value={data.squadPulse.expiringContracts}
                  valueClassName={data.squadPulse.expiringContracts > 0 ? 'text-yellow-600' : ''}
                />
              </div>
            </div>
          </Card>

          {/* Upcoming Schedule */}
          <Card className="p-5">
            <SectionTitle
              title="Upcoming Schedule"
              subtitle="Next major events, races, and club milestones."
            />

            {data.schedule.length > 0 ? (
              <div className="mt-5 space-y-3">
                {data.schedule.map((item) => (
                  <ScheduleRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <SectionEmptyState
                title="No upcoming events"
                description="There are no scheduled races, camps, or infrastructure milestones in the current overview window."
              />
            )}
          </Card>

          {/* This Day Races */}
          <Card className="p-5">
            <SectionTitle
              title="This Day Races"
              subtitle={
                data.club.dateLabel
                  ? `Races happening on ${data.club.dateLabel}.`
                  : 'Races happening on the current game date.'
              }
            />
            <div className="mt-5 space-y-3">
              {data.dayRaces.length > 0 ? (
                data.dayRaces.map((item) => <DayRaceRow key={item.id} item={item} />)
              ) : (
                <EmptyState
                  title="No races on this date"
                  subtitle="There are no race events scheduled for the current game day."
                />
              )}
            </div>
          </Card>

          {/* In-Game News */}
          <Card className="p-5">
            <SectionTitle
              title="In-Game News"
              subtitle="Latest world updates, announcements, and game news posts."
            />
            <div className="mt-5 space-y-3">
              {data.news.length > 0 ? (
                data.news.map((item) => <NewsRow key={item.id} item={item} />)
              ) : (
                <EmptyState
                  title="No news published yet"
                  subtitle="New in-game news will appear here when you publish it."
                />
              )}
            </div>
          </Card>
        </div>

        <div className="col-span-12 space-y-6 xl:col-span-4">
          {/* Main Sponsor */}
          <Card className="p-5">
            <SectionTitle
              title="Main Sponsor"
              subtitle="Primary sponsor branding and active partnership."
            />
            <div className="mt-5">
              <MainSponsorPanel sponsor={data.mainSponsor} />
            </div>
          </Card>

          {/* Activity Feed */}
          <Card className="p-5">
            <SectionTitle
              title="Activity Feed"
              subtitle="Latest changes across finance, training, infrastructure, and inbox."
            />

            {visibleFeed.length > 0 ? (
              <div className="mt-4 space-y-1">
                {visibleFeed.map((item) => (
                  <FeedRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <SectionEmptyState
                title="No recent activity"
                description="No recent finance, training, infrastructure, sponsor, or inbox events were found for this club."
              />
            )}
          </Card>

          {/* Finance Health */}
          <Card className="p-5">
            <SectionTitle
              title="Finance Health"
              subtitle="Cash position, recurring cost pressure, and next forecasted spend."
            />

            <div className="mt-5 space-y-3">
              <SmallStat label="Balance" value={formatCurrency(data.finance.balance)} />
              <SmallStat
                label="Weekly Net"
                value={formatSignedCurrency(data.finance.weeklyNet)}
                valueClassName={
                  data.finance.weeklyNet >= 0 ? 'text-emerald-600' : 'text-red-600'
                }
              />
              <SmallStat
                label="Sponsor Income"
                value={formatCurrency(data.finance.sponsorIncome)}
              />
              <SmallStat
                label="Recurring Policy Cost"
                value={formatCurrency(data.finance.recurringPolicyCost)}
              />
              <SmallStat
                label="Next Trip Forecast"
                value={formatCurrency(data.finance.nextTripForecast)}
              />
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Latest Major Transaction
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {data.finance.latestTransactionLabel}
              </div>
              <div
                className={cn(
                  'mt-1 text-sm font-bold',
                  data.finance.latestTransactionAmount >= 0
                    ? 'text-emerald-600'
                    : 'text-red-600',
                )}
              >
                {formatSignedCurrency(data.finance.latestTransactionAmount)}
              </div>
            </div>

            {data.finance.topOperatingIncomes.length > 0 ||
            data.finance.topOperatingExpenses.length > 0 ? (
              <div className="mt-5 grid grid-cols-1 gap-4">
                {data.finance.topOperatingIncomes.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Top Operating Incomes
                    </div>
                    <div className="mt-3 space-y-2">
                      {data.finance.topOperatingIncomes.map((item) => (
                        <TransactionSummaryRow key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                ) : null}

                {data.finance.topOperatingExpenses.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Top Operating Costs
                    </div>
                    <div className="mt-3 space-y-2">
                      {data.finance.topOperatingExpenses.map((item) => (
                        <TransactionSummaryRow key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>

          {/* Emergency Debt */}
          <EmergencyDebtCard
            debt={data.emergencyDebt}
            debtMovements={data.finance.debtMovements}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <Card className="p-5">
        <SectionTitle
          title="Quick Actions"
          subtitle="Direct navigation to your main management areas."
        />

        {data.quickActions.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            {data.quickActions.map((item) => (
              <QuickAction key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <SectionEmptyState
            title="No actions available"
            description="Quick actions are not available right now."
          />
        )}
      </Card>
    </div>
  )
}