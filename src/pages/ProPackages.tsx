/**
 * ProPackages.tsx
 * Premium membership, billing management, optional coin packages and history.
 *
 * - Normal gameplay remains free.
 * - Free users see Become Premium.
 * - Existing subscribers see Manage subscription.
 * - Manage subscription opens Stripe Customer Portal for cancellation,
 *   payment-method management and Stripe-hosted invoices.
 * - Premium invoices, coin-package purchases and the coin ledger are shown
 *   as separate history sections.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import appI18n from '../i18n'
import { supabase } from '../lib/supabase'

type CoinStatusRow = {
  balance: number
  can_play: boolean
}

type PremiumPlanRow = {
  code: string
  name: string
  description: string | null
  price_cents: number
  currency: string
  interval_unit: string
  interval_count: number
  coins_per_paid_invoice: number
  active: boolean
}

type PremiumStatusRow = {
  access_tier: string
  is_premium: boolean
  plan_code: string | null
  plan_name: string | null
  stripe_status: string
  access_until: string | null
  cancel_at_period_end: boolean
  current_period_end: string | null
  coins_per_paid_invoice: number
}

type PremiumSubscriptionDetailRow = {
  plan_code: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_status: string
  cancel_at_period_end: boolean
  current_period_start: string | null
  current_period_end: string | null
  access_until: string | null
  created_at: string
}

type PremiumInvoiceRow = {
  stripe_invoice_id: string
  plan_code: string
  billing_reason: string | null
  amount_paid_cents: number | null
  currency: string | null
  coins_granted: number
  period_start: string
  period_end: string
  processed_at: string
}

type DevelopingTeamServiceStatus = {
  main_club_id: string | null
  developing_club_id: string | null
  developing_club_name: string | null

  team_exists: boolean
  access_status: 'active' | 'expired' | 'not_activated'
  is_active: boolean
  is_read_only: boolean

  current_season: number
  active_season: number | null
  expires_after_season: number | null
  next_renewal_season: number | null

  auto_renew: boolean
  activation_coin_cost: number
  renewal_coin_cost: number
  coin_balance: number

  can_activate: boolean
  can_reactivate: boolean
  can_change_auto_renew: boolean
}

type DbCoinPackage = {
  code: string
  coins: number
  price_cents: number
  currency: string
  active: boolean
}

type UiCoinPackage = {
  code: string
  coins: number
  priceEur: number
  tagline?: string
}

type PurchaseRow = {
  delta: number
  reason: string
  payload_json: any
  created_at: string
}

type PurchaseUi = {
  createdAt: string
  coins: number
  packageCode: string | null
  priceEur: number | null
}

type CoinLedgerRow = {
  delta: number
  reason: string
  payload_json: any
  created_at: string
}

type CoinTransactionUi = {
  createdAt: string
  delta: number
  reason: string
  description: string
  packageCode: string | null
}

type EdgeResponse = {
  url?: string
  error?: string
  code?: string
}

const COIN_HISTORY_PAGE_SIZE = 20
// Display fallbacks only. get_developing_team_status() is the authoritative source.
const DEFAULT_DEVELOPING_TEAM_ACTIVATION_COIN_COST = 200
const DEFAULT_DEVELOPING_TEAM_RENEWAL_COIN_COST = 100
const STRIPE_RETURN_RETRY_DELAYS_MS = [0, 1500, 3000, 5000, 8000, 12000]

type StripeReturnResult = 'success' | 'cancel' | 'portal_return'

function readStripeReturnParams(): {
  result: StripeReturnResult | null
  sessionId: string | null
} {
  if (typeof window === 'undefined') {
    return { result: null, sessionId: null }
  }

  const hash = window.location.hash
  const queryIndex = hash.indexOf('?')

  if (queryIndex < 0) {
    return { result: null, sessionId: null }
  }

  const params = new URLSearchParams(hash.slice(queryIndex + 1))
  const rawResult = params.get('premium')
  const result: StripeReturnResult | null =
    rawResult === 'success' ||
    rawResult === 'cancel' ||
    rawResult === 'portal_return'
      ? rawResult
      : null

  return {
    result,
    sessionId: params.get('session_id'),
  }
}

function cleanStripeReturnUrl() {
  if (typeof window === 'undefined') return

  const hash = window.location.hash
  const queryIndex = hash.indexOf('?')
  const cleanHash = queryIndex >= 0 ? hash.slice(0, queryIndex) : hash
  const normalizedHash = cleanHash || '#/dashboard/pro'

  window.history.replaceState(
    window.history.state,
    document.title,
    `${window.location.pathname}${window.location.search}${normalizedHash}`,
  )
}

function dispatchPremiumRefreshEvents() {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent('premium-status-changed'))
  window.dispatchEvent(new CustomEvent('coin-balance-changed'))
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs)
  })
}

function normalizeCoinCost(value: unknown, fallback: number): number {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const COMPARISON_ROWS = [
  ['comparison.r1', '✓', '✓'],
  ['comparison.r2', '✓', '✓'],
  ['comparison.r3', '✓', '✓'],
  ['comparison.r4', '✓', '✓'],
  ['comparison.r5', '—', '✓'],
  ['comparison.r6', '—', '50'],
  ['comparison.r7', '✓', '✓'],
  ['comparison.r8', '✓', '✓'],
] as const

const PREMIUM_ADVANTAGES = [
  'advantages.a1',
  'advantages.a2',
  'advantages.a3',
  'advantages.a4',
  'advantages.a5',
  'advantages.a6',
  'advantages.a7',
] as const

function eur(value: number) {
  return new Intl.NumberFormat(appI18n.resolvedLanguage ?? appI18n.language ?? 'en', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function moneyFromCents(
  cents: number | null | undefined,
  currency: string | null | undefined,
) {
  const safeCurrency = String(currency || 'EUR').toUpperCase()
  const safeCents = Number(cents ?? 0)

  try {
    return new Intl.NumberFormat(appI18n.resolvedLanguage ?? appI18n.language ?? 'en', {
      style: 'currency',
      currency: safeCurrency,
    }).format(safeCents / 100)
  } catch {
    return `${(safeCents / 100).toFixed(2)} ${safeCurrency}`
  }
}

function perCoin(priceEur: number, coins: number) {
  return priceEur / coins
}

function taglineForCoins(coins: number) {
  if (coins <= 70) return 'packages.starter'
  if (coins <= 130) return 'packages.newSeason'
  if (coins <= 270) return 'packages.balanced'
  if (coins <= 390) return 'packages.popular'
  if (coins <= 570) return 'packages.manager'
  return 'packages.longTerm'
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'

  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'

  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    })
  } catch {
    return iso
  }
}

function coinLabel(value: number) {
  return value === 1 ? 'Coin' : 'Coins'
}

function titleFromSnake(value: string | null | undefined) {
  if (!value) return '—'

  return String(value)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\w\S*/g, (word) =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
}

function describeCoinTransaction(reason: string, payload: any) {
  const packageCode =
    typeof payload?.package_code === 'string'
      ? payload.package_code
      : null

  const description =
    typeof payload?.description === 'string'
      ? payload.description
      : typeof payload?.label === 'string'
        ? payload.label
        : typeof payload?.message === 'string'
          ? payload.message
          : null

  if (description) return description
  if (reason === 'purchase' && packageCode) {
    return appI18n.t('transactions.purchase', { ns: 'proPackages', code: packageCode })
  }
  if (reason === 'daily_charge') return appI18n.t('transactions.dailyCharge', { ns: 'proPackages' })
  if (reason === 'daily_gameplay_unlock') return appI18n.t('transactions.dailyUnlock', { ns: 'proPackages' })
  if (reason === 'referral_reward') return appI18n.t('transactions.referral', { ns: 'proPackages' })
  if (reason === 'admin_adjustment') return appI18n.t('transactions.admin', { ns: 'proPackages' })
  if (reason === 'developing_team_purchase') return appI18n.t('transactions.developingPurchase', { ns: 'proPackages' })
  if (reason === 'developing_team_unlock') return appI18n.t('transactions.developingPurchase', { ns: 'proPackages' })
  if (reason === 'developing_team_legacy_creation') return appI18n.t('transactions.developingLegacy', { ns: 'proPackages' })

  if (reason === 'developing_team_season_activation') {
    const season = Number(payload?.season)

    return Number.isFinite(season)
      ? appI18n.t('transactions.developingActivation', { ns: 'proPackages', season })
      : appI18n.t('transactions.developingSeasonalActivation', { ns: 'proPackages' })
  }

  if (reason === 'developing_team_season_renewal') {
    const season = Number(payload?.season)

    return Number.isFinite(season)
      ? appI18n.t('transactions.developingRenewal', { ns: 'proPackages', season })
      : appI18n.t('transactions.developingSeasonalRenewal', { ns: 'proPackages' })
  }

  if (reason === 'developing_team_season_reactivation') {
    const season = Number(payload?.season)

    return Number.isFinite(season)
      ? appI18n.t('transactions.developingReactivation', { ns: 'proPackages', season })
      : appI18n.t('transactions.developingSeasonalReactivation', { ns: 'proPackages' })
  }

  if (reason === 'scout_report_extra') return appI18n.t('transactions.extraScout', { ns: 'proPackages' })
  if (reason === 'premium_monthly_grant') return appI18n.t('transactions.premiumGrant', { ns: 'proPackages' })

  return titleFromSnake(reason)
}

function slicePage<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}

function getTotalPages(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize))
}

function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(page, 1), Math.max(totalPages, 1))
}

function getSupabaseConfig(): { url: string; anonKey: string } {
  const anyClient = supabase as any

  const url: string | undefined =
    anyClient?.supabaseUrl ||
    anyClient?.url ||
    anyClient?.rest?.url ||
    anyClient?.realtime?.url

  const anonKey: string | undefined =
    anyClient?.supabaseKey ||
    anyClient?.anonKey ||
    anyClient?.headers?.apikey ||
    anyClient?.auth?.headers?.apikey

  if (!url || !anonKey) {
    throw new Error(
      'Supabase client config not found. Ensure ../lib/supabase initializes createClient(SUPABASE_URL, SUPABASE_ANON_KEY).',
    )
  }

  return { url, anonKey }
}

async function callAuthenticatedEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
): Promise<EdgeResponse> {
  const { url: supabaseUrl, anonKey } = getSupabaseConfig()

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()

  if (sessionError) throw sessionError

  const token = sessionData.session?.access_token
  if (!token) {
    throw new Error(appI18n.t('common.notAuthenticated', { ns: 'proPackages' }))
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/${functionName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
  )

  const responseText = await response.text().catch(() => '')
  let responseJson: EdgeResponse = {}

  if (responseText) {
    try {
      responseJson = JSON.parse(responseText) as EdgeResponse
    } catch {
      responseJson = {}
    }
  }

  if (!response.ok) {
    throw new Error(
      responseJson.error ||
        responseText ||
        `Edge function error: ${response.status}`,
    )
  }

  return responseJson
}

export default function ProPackagesPage(): JSX.Element {
  const { t, i18n } = useTranslation('proPackages')
  const stripeReturnHandledRef = useRef(false)
  const [balance, setBalance] = useState(0)
  const [loadingBalance, setLoadingBalance] = useState(true)

  const [premiumPlan, setPremiumPlan] =
    useState<PremiumPlanRow | null>(null)
  const [premiumStatus, setPremiumStatus] =
    useState<PremiumStatusRow | null>(null)
  const [premiumDetails, setPremiumDetails] =
    useState<PremiumSubscriptionDetailRow | null>(null)
  const [loadingPremium, setLoadingPremium] = useState(true)
  const [startingPremiumCheckout, setStartingPremiumCheckout] =
    useState(false)
  const [openingPremiumPortal, setOpeningPremiumPortal] =
    useState(false)
  const [premiumError, setPremiumError] = useState<string | null>(null)
  const [premiumNotice, setPremiumNotice] = useState<string | null>(null)

  const [packages, setPackages] = useState<UiCoinPackage[]>([])
  const [loadingPackages, setLoadingPackages] = useState(true)
  const [buyingCode, setBuyingCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [
    developingTeamService,
    setDevelopingTeamService,
  ] = useState<DevelopingTeamServiceStatus | null>(null)
  const [
    loadingDevelopingTeamService,
    setLoadingDevelopingTeamService,
  ] = useState(true)
  const [
    developingTeamServiceError,
    setDevelopingTeamServiceError,
  ] = useState<string | null>(null)
  const [
    developingTeamServiceNotice,
    setDevelopingTeamServiceNotice,
  ] = useState<string | null>(null)
  const [
    developingTeamServiceActionError,
    setDevelopingTeamServiceActionError,
  ] = useState<string | null>(null)
  const [
    updatingDevelopingTeamAutoRenew,
    setUpdatingDevelopingTeamAutoRenew,
  ] = useState(false)

  const [premiumInvoicesOpen, setPremiumInvoicesOpen] = useState(false)
  const [premiumInvoices, setPremiumInvoices] =
    useState<PremiumInvoiceRow[]>([])
  const [loadingPremiumInvoices, setLoadingPremiumInvoices] =
    useState(false)
  const [premiumInvoicesError, setPremiumInvoicesError] =
    useState<string | null>(null)

  const [historyOpen, setHistoryOpen] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [purchases, setPurchases] = useState<PurchaseUi[]>([])

  const [coinHistoryOpen, setCoinHistoryOpen] = useState(false)
  const [loadingCoinHistory, setLoadingCoinHistory] = useState(false)
  const [coinHistoryError, setCoinHistoryError] =
    useState<string | null>(null)
  const [coinTransactions, setCoinTransactions] =
    useState<CoinTransactionUi[]>([])
  const [coinHistoryPage, setCoinHistoryPage] = useState(1)

  const premiumCheckoutBlocked = useMemo(() => {
    const status = premiumStatus?.stripe_status ?? 'free'

    return [
      'trialing',
      'active',
      'past_due',
      'unpaid',
      'incomplete',
      'paused',
    ].includes(status)
  }, [premiumStatus?.stripe_status])

  const hasBillingProfile = Boolean(
    premiumDetails?.stripe_customer_id?.startsWith('cus_'),
  )

  const showManageSubscription = Boolean(
    hasBillingProfile &&
      (premiumStatus?.is_premium ||
        premiumCheckoutBlocked ||
        premiumStatus?.cancel_at_period_end),
  )

  const premiumPrice = premiumPlan
    ? eur(Number(premiumPlan.price_cents) / 100)
    : '€4.99'

  const premiumCoins =
    premiumPlan?.coins_per_paid_invoice ??
    premiumStatus?.coins_per_paid_invoice ??
    50

  const statusLabel = useMemo(() => {
    if (premiumStatus?.is_premium && premiumStatus.cancel_at_period_end) {
      return t('premium.activeCancellation')
    }

    if (premiumStatus?.is_premium) return 'Active'

    const stripeStatus = premiumStatus?.stripe_status
    if (!stripeStatus || stripeStatus === 'free') return 'Free'

    return titleFromSnake(stripeStatus)
  }, [premiumStatus])

  const nextRenewalLabel = useMemo(() => {
    if (!premiumStatus?.is_premium) return '—'
    if (premiumStatus.cancel_at_period_end) return t('premium.noRenewal')

    return formatDate(
      premiumDetails?.current_period_end ||
        premiumStatus.current_period_end,
    )
  }, [premiumDetails?.current_period_end, premiumStatus])

  const developingTeamActivationCost = normalizeCoinCost(
    developingTeamService?.activation_coin_cost,
    DEFAULT_DEVELOPING_TEAM_ACTIVATION_COIN_COST,
  )

  const developingTeamRenewalCost = normalizeCoinCost(
    developingTeamService?.renewal_coin_cost,
    DEFAULT_DEVELOPING_TEAM_RENEWAL_COIN_COST,
  )

  const developingTeamServiceStatusLabel =
    developingTeamService?.access_status === 'active'
      ? 'Active'
      : developingTeamService?.access_status === 'expired'
        ? 'Expired'
        : 'Not activated'

  const bestValueCode = useMemo(() => {
    if (packages.length === 0) return null

    let best = packages[0]
    for (const item of packages) {
      if (
        perCoin(item.priceEur, item.coins) <
        perCoin(best.priceEur, best.coins)
      ) {
        best = item
      }
    }

    return best.code
  }, [packages])

  const priceByCode = useMemo(() => {
    const prices = new Map<string, number>()
    for (const item of packages) {
      prices.set(item.code, item.priceEur)
    }
    return prices
  }, [packages])

  const coinHistoryTotalPages = useMemo(
    () => getTotalPages(coinTransactions.length, COIN_HISTORY_PAGE_SIZE),
    [coinTransactions.length],
  )

  const safeCoinHistoryPage = clampPage(
    coinHistoryPage,
    coinHistoryTotalPages,
  )

  const visibleCoinTransactions = useMemo(
    () =>
      slicePage(
        coinTransactions,
        safeCoinHistoryPage,
        COIN_HISTORY_PAGE_SIZE,
      ),
    [coinTransactions, safeCoinHistoryPage],
  )

  useEffect(() => {
    setCoinHistoryPage((current) =>
      clampPage(
        current,
        getTotalPages(
          coinTransactions.length,
          COIN_HISTORY_PAGE_SIZE,
        ),
      ),
    )
  }, [coinTransactions.length])

  async function loadCoinStatus(): Promise<number> {
    setLoadingBalance(true)

    const { data, error: coinError } =
      await supabase.rpc('get_my_coin_status')

    if (coinError) {
      console.error('Failed to load coin status:', coinError)
      setBalance(0)
      setLoadingBalance(false)
      return 0
    }

    const row = ((data ?? []) as CoinStatusRow[])[0]
    const nextBalance = Math.max(Number(row?.balance ?? 0), 0)

    setBalance(nextBalance)
    setLoadingBalance(false)

    return nextBalance
  }

  async function loadPremiumData(): Promise<PremiumStatusRow | null> {
    setLoadingPremium(true)
    setPremiumError(null)

    try {
      const [planResult, statusResult, detailsResult] =
        await Promise.all([
          supabase
            .from('premium_plans')
            .select(
              'code, name, description, price_cents, currency, interval_unit, interval_count, coins_per_paid_invoice, active',
            )
            .eq('code', 'premium_monthly')
            .eq('active', true)
            .maybeSingle(),
          supabase.rpc('get_my_premium_status'),
          supabase
            .from('user_premium_subscriptions')
            .select(
              'plan_code, stripe_customer_id, stripe_subscription_id, stripe_status, cancel_at_period_end, current_period_start, current_period_end, access_until, created_at',
            )
            .maybeSingle(),
        ])

      if (planResult.error) throw planResult.error
      if (statusResult.error) throw statusResult.error
      if (detailsResult.error) throw detailsResult.error

      setPremiumPlan(
        (planResult.data as PremiumPlanRow | null) ?? null,
      )

      const statusRows =
        (statusResult.data ?? []) as PremiumStatusRow[]
      setPremiumStatus(statusRows[0] ?? null)

      setPremiumDetails(
        (detailsResult.data as PremiumSubscriptionDetailRow | null) ??
          null,
      )

      return statusRows[0] ?? null
    } catch (loadError: any) {
      console.error('Failed to load Premium data:', loadError)
      setPremiumPlan(null)
      setPremiumStatus(null)
      setPremiumDetails(null)
      setPremiumError(
        loadError?.message ??
          t('premium.detailsFailed'),
      )
      return null
    } finally {
      setLoadingPremium(false)
    }
  }

  async function loadPackages() {
    setLoadingPackages(true)

    const { data, error: packagesError } = await supabase
      .from('coin_packages')
      .select('code, coins, price_cents, currency, active')
      .eq('active', true)

    if (packagesError) {
      console.error('Failed to load coin packages:', packagesError)
      setPackages([])
      setLoadingPackages(false)
      return
    }

    const rows = (data ?? []) as DbCoinPackage[]
    const mapped = rows
      .map((row) => ({
        code: row.code,
        coins: Number(row.coins),
        priceEur: Number(row.price_cents) / 100,
        tagline: taglineForCoins(Number(row.coins)),
      }))
      .sort((a, b) => a.coins - b.coins)

    setPackages(mapped)
    setLoadingPackages(false)
  }

  async function loadDevelopingTeamService() {
    setLoadingDevelopingTeamService(true)
    setDevelopingTeamServiceError(null)

    try {
      const { data, error } = await supabase.rpc(
        'get_developing_team_status'
      )

      if (error) {
        throw error
      }

      const normalized = Array.isArray(data) ? data[0] : data

      setDevelopingTeamService(
        (normalized ?? null) as DevelopingTeamServiceStatus | null,
      )
    } catch (error: any) {
      console.error('Failed to load Developing Team service:', error)
      setDevelopingTeamService(null)
      setDevelopingTeamServiceError(
        error?.message ??
          t('services.loadFailed'),
      )
    } finally {
      setLoadingDevelopingTeamService(false)
    }
  }

  async function handleDevelopingTeamAutoRenewChange(
    enabled: boolean,
  ) {
    if (
      updatingDevelopingTeamAutoRenew ||
      !developingTeamService?.is_active ||
      !developingTeamService.can_change_auto_renew
    ) {
      return
    }

    setDevelopingTeamServiceActionError(null)
    setDevelopingTeamServiceNotice(null)
    setUpdatingDevelopingTeamAutoRenew(true)

    try {
      const { error } = await supabase.rpc(
        'set_developing_team_auto_renew_v1',
        {
          p_enabled: enabled,
        },
      )

      if (error) throw error

      setDevelopingTeamServiceNotice(
        enabled
          ? `Automatic renewal enabled. ${developingTeamRenewalCost} coins will be charged at the beginning of the next season.`
          : t('services.autoDisabled'),
      )

      await Promise.all([
        loadDevelopingTeamService(),
        loadCoinStatus(),
      ])
    } catch (updateError: any) {
      console.error(
        'Failed to update Developing Team automatic renewal:',
        updateError,
      )
      setDevelopingTeamServiceActionError(
        updateError?.message ??
          t('services.autoFailed'),
      )
    } finally {
      setUpdatingDevelopingTeamAutoRenew(false)
    }
  }

  async function loadPremiumInvoiceHistory() {
    setPremiumInvoicesError(null)
    setLoadingPremiumInvoices(true)

    try {
      const { data, error: invoiceError } =
        await supabase.rpc('get_my_premium_invoice_history')

      if (invoiceError) throw invoiceError

      setPremiumInvoices((data ?? []) as PremiumInvoiceRow[])
    } catch (loadError: any) {
      console.error(
        'Failed to load Premium invoice history:',
        loadError,
      )
      setPremiumInvoices([])
      setPremiumInvoicesError(
        loadError?.message ??
          t('history.invoiceFailed'),
      )
    } finally {
      setLoadingPremiumInvoices(false)
    }
  }

  async function loadPurchaseHistory() {
    setHistoryError(null)
    setLoadingHistory(true)

    try {
      const { data, error: purchaseError } = await supabase
        .from('user_coin_ledger')
        .select('delta, reason, payload_json, created_at')
        .eq('reason', 'purchase')
        .order('created_at', { ascending: false })
        .limit(50)

      if (purchaseError) throw purchaseError

      const rows = (data ?? []) as PurchaseRow[]
      const mapped = rows.map((row) => {
        const payload = (row.payload_json ?? {}) as any
        const packageCode =
          typeof payload.package_code === 'string'
            ? payload.package_code
            : null

        return {
          createdAt: row.created_at,
          coins: Math.max(Number(row.delta ?? 0), 0),
          packageCode,
          priceEur: packageCode
            ? priceByCode.get(packageCode) ?? null
            : null,
        }
      })

      setPurchases(mapped)
    } catch (loadError: any) {
      console.error('Failed to load purchase history:', loadError)
      setHistoryError(
        loadError?.message ?? t('history.purchaseFailed'),
      )
      setPurchases([])
    } finally {
      setLoadingHistory(false)
    }
  }

  async function loadCoinTransactionHistory() {
    setCoinHistoryError(null)
    setLoadingCoinHistory(true)

    try {
      const { data, error: ledgerError } = await supabase
        .from('user_coin_ledger')
        .select('delta, reason, payload_json, created_at')
        .order('created_at', { ascending: false })
        .limit(500)

      if (ledgerError) throw ledgerError

      const rows = (data ?? []) as CoinLedgerRow[]
      const mapped = rows.map((row) => {
        const payload = (row.payload_json ?? {}) as any
        const packageCode =
          typeof payload?.package_code === 'string'
            ? payload.package_code
            : null

        return {
          createdAt: row.created_at,
          delta: Number(row.delta ?? 0),
          reason: String(row.reason ?? 'coin_transaction'),
          description: describeCoinTransaction(
            String(row.reason ?? ''),
            payload,
          ),
          packageCode,
        }
      })

      setCoinTransactions(mapped)
      setCoinHistoryPage(1)
    } catch (loadError: any) {
      console.error(
        'Failed to load coin transaction history:',
        loadError,
      )
      setCoinHistoryError(
        loadError?.message ??
          t('history.ledgerFailed'),
      )
      setCoinTransactions([])
    } finally {
      setLoadingCoinHistory(false)
    }
  }

  async function refreshVisibleData() {
    await Promise.all([
      loadCoinStatus(),
      loadPremiumData(),
      loadPackages(),
      loadDevelopingTeamService(),
      premiumInvoicesOpen
        ? loadPremiumInvoiceHistory()
        : Promise.resolve(),
      historyOpen ? loadPurchaseHistory() : Promise.resolve(),
      coinHistoryOpen
        ? loadCoinTransactionHistory()
        : Promise.resolve(),
    ])

    dispatchPremiumRefreshEvents()
  }

  useEffect(() => {
    void Promise.all([
      loadCoinStatus(),
      loadPremiumData(),
      loadPackages(),
      loadDevelopingTeamService(),
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (stripeReturnHandledRef.current) return

    const { result: premiumResult } = readStripeReturnParams()
    if (!premiumResult) return

    stripeReturnHandledRef.current = true
    let cancelled = false

    async function processStripeReturn() {
      const { data: initialSessionData } =
        await supabase.auth.getSession()

      let activeSession = initialSessionData.session

      if (!activeSession) {
        const { data: refreshedSessionData, error: refreshError } =
          await supabase.auth.refreshSession()

        if (refreshError) {
          console.error(
            'Failed to restore the session after Stripe return:',
            refreshError,
          )
        }

        activeSession = refreshedSessionData.session
      }

      if (!activeSession) {
        setPremiumError(
          t('premium.returnSessionFailed'),
        )
        return
      }

      if (premiumResult === 'cancel') {
        setPremiumNotice(
          t('premium.checkoutCanceled'),
        )
        cleanStripeReturnUrl()
        return
      }

      setPremiumNotice(
        premiumResult === 'success'
          ? t('premium.confirming')
          : t('premium.refreshing'),
      )

      cleanStripeReturnUrl()

      for (const delayMs of STRIPE_RETURN_RETRY_DELAYS_MS) {
        if (cancelled) return
        if (delayMs > 0) await wait(delayMs)
        if (cancelled) return

        const [status] = await Promise.all([
          loadPremiumData(),
          loadCoinStatus(),
          premiumInvoicesOpen
            ? loadPremiumInvoiceHistory()
            : Promise.resolve(),
        ])

        dispatchPremiumRefreshEvents()

        if (
          premiumResult === 'success' &&
          status?.is_premium
        ) {
          setPremiumNotice(
            t('premium.activated'),
          )
          return
        }

        if (premiumResult === 'portal_return' && status) {
          setPremiumNotice(
            t('premium.billingRefreshed'),
          )
          return
        }
      }

      if (premiumResult === 'success') {
        setPremiumNotice(
          t('premium.processing'),
        )
      }
    }

    void processStripeReturn()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) return

      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'INITIAL_SESSION'
      ) {
        void Promise.all([
          loadPremiumData(),
          loadCoinStatus(),
        ]).then(() => {
          dispatchPremiumRefreshEvents()
        })
      }
    })

    return () => {
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleStartPremiumCheckout() {
    setPremiumError(null)
    setPremiumNotice(null)
    setStartingPremiumCheckout(true)

    try {
      const response = await callAuthenticatedEdgeFunction(
        'create-premium-checkout',
        { plan_code: 'premium_monthly' },
      )

      if (!response.url) {
        throw new Error(t('premium.checkoutUrlMissing'))
      }

      window.sessionStorage.setItem(
        'ppm-stripe-return-path',
        `${window.location.origin}/#/dashboard/pro`,
      )
      window.location.assign(response.url)
    } catch (checkoutError: any) {
      setPremiumError(
        checkoutError?.message ?? t('premium.checkoutFailed'),
      )
      setStartingPremiumCheckout(false)
    }
  }

  async function handleManageSubscription() {
    setPremiumError(null)
    setPremiumNotice(null)
    setOpeningPremiumPortal(true)

    try {
      const response = await callAuthenticatedEdgeFunction(
        'create-premium-portal',
        {},
      )

      if (!response.url) {
        throw new Error(t('premium.portalUrlMissing'))
      }

      window.location.href = response.url
    } catch (portalError: any) {
      setPremiumError(
        portalError?.message ??
          t('premium.portalFailed'),
      )
      setOpeningPremiumPortal(false)
    }
  }

  async function handleBuy(code: string) {
    setError(null)
    setBuyingCode(code)

    try {
      const response = await callAuthenticatedEdgeFunction(
        'create-coin-checkout',
        { package_code: code },
      )

      if (!response.url) throw new Error(t('packages.checkoutUrlMissing'))

      window.location.href = response.url
    } catch (checkoutError: any) {
      setError(checkoutError?.message ?? t('packages.checkoutFailed'))
      setBuyingCode(null)
    }
  }

  async function handleTogglePremiumInvoices() {
    const next = !premiumInvoicesOpen
    setPremiumInvoicesOpen(next)

    if (next && premiumInvoices.length === 0) {
      await loadPremiumInvoiceHistory()
    }
  }

  async function handleToggleHistory() {
    const next = !historyOpen
    setHistoryOpen(next)

    if (next && purchases.length === 0) {
      await loadPurchaseHistory()
    }
  }

  async function handleToggleCoinHistory() {
    const next = !coinHistoryOpen
    setCoinHistoryOpen(next)

    if (next && coinTransactions.length === 0) {
      await loadCoinTransactionHistory()
    }
  }

  return (
    <div className="w-full pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-black">
            Premium &amp; Billing
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {t('page.description')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refreshVisibleData()}
            className="rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-black shadow-sm hover:bg-gray-50"
          >
            {t('page.refresh')}
          </button>
        </div>
      </div>

      {premiumNotice ? (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {premiumNotice}
        </div>
      ) : null}

      {premiumError ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {premiumError}
        </div>
      ) : null}

      {/* Section 1 — Premium Membership */}
      <section className="relative z-20 mt-6 overflow-visible rounded-2xl border border-yellow-400 bg-white shadow-sm">
        <div className="grid grid-cols-1 overflow-visible lg:grid-cols-[1.35fr_0.65fr]">
          <div className="relative p-6 sm:p-8">
            <div className="group absolute right-6 top-6 z-20 sm:right-8 sm:top-8">
              <button
                type="button"
                aria-label={t('premium.showAdvantages')}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-yellow-400 bg-yellow-50 text-sm font-extrabold text-black shadow-sm transition hover:bg-yellow-100 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                i
              </button>

              <div
                role="tooltip"
                className="pointer-events-none invisible absolute right-0 top-11 z-[100] max-h-[min(70vh,520px)] w-[320px] translate-y-1 overflow-y-auto rounded-2xl border border-yellow-300 bg-white p-4 opacity-0 shadow-2xl transition duration-150 group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 sm:w-[380px]"
              >
                <div className="text-sm font-extrabold text-black">
                  {t('premium.allAdvantages')}
                </div>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-gray-700">
                  {PREMIUM_ADVANTAGES.map((advantage) => (
                    <li key={advantage} className="flex gap-2">
                      <span className="font-bold text-green-700">✓</span>
                      <span>{t(advantage)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold text-black">
                {t('premium.label')}
              </span>

              {!loadingPremium && premiumStatus?.is_premium ? (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                  {premiumStatus.cancel_at_period_end
                    ? t('premium.activeEnding')
                    : 'Active'}
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
                  {t('premium.optional')}
                </span>
              )}
            </div>

            <h3 className="mt-4 text-2xl font-extrabold text-black">
              {premiumPlan?.name ?? t('premium.defaultName')}
            </h3>

            <div className="mt-2 text-3xl font-extrabold text-black">
              {premiumPrice}
              <span className="ml-2 text-sm font-medium text-gray-500">
                {t('premium.perMonth')}
              </span>
            </div>

            <ul className="mt-5 space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="font-bold text-green-700">✓</span>
                <span>
                  {t('premium.advancedTools')}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-green-700">✓</span>
                <span>
                  {t('premium.marketTools')}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-green-700">✓</span>
                <span>
                  {t('premium.capacity')}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-green-700">✓</span>
                <span>
                  Receive {premiumCoins} coins after every successful monthly payment.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-green-700">✓</span>
                <span>
                  {t('premium.cancelAnytime')}
                </span>
              </li>
            </ul>

            {premiumStatus?.is_premium ? (
              <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                <div className="font-bold">
                  {premiumStatus.cancel_at_period_end
                    ? t('premium.activeUntilEnd')
                    : t('premium.activeNow')}
                </div>
                <div className="mt-1">
                  {premiumStatus.cancel_at_period_end
                    ? `Future renewal is canceled. Access remains available until ${formatDate(
                        premiumStatus.access_until ||
                          premiumStatus.current_period_end,
                      )}.`
                    : `The current paid period ends on ${formatDate(
                        premiumStatus.current_period_end,
                      )}.`}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col justify-center border-t border-black/10 bg-yellow-50 p-6 sm:p-8 lg:border-l lg:border-t-0">
            <div className="text-sm font-semibold text-gray-700">
              {t('premium.membership')}
            </div>
            <div className="mt-2 text-4xl font-extrabold text-black">
              {premiumPrice}
            </div>
            <div className="mt-1 text-sm text-gray-600">
              {t('premium.perMonth')}
            </div>

            {showManageSubscription ? (
              <button
                type="button"
                onClick={() => void handleManageSubscription()}
                disabled={openingPremiumPortal || loadingPremium}
                className="mt-6 w-full rounded-xl bg-black px-4 py-3 text-sm font-extrabold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {openingPremiumPortal
                  ? t('premium.openingPortal')
                  : t('premium.manage')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleStartPremiumCheckout()}
                disabled={
                  loadingPremium ||
                  startingPremiumCheckout ||
                  !premiumPlan ||
                  premiumCheckoutBlocked
                }
                className="mt-6 w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-extrabold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingPremium
                  ? t('premium.loading')
                  : startingPremiumCheckout
                    ? 'Redirecting…'
                    : premiumCheckoutBlocked
                      ? t('premium.alreadyExists')
                      : t('premium.become')}
              </button>
            )}

            <div className="mt-3 text-xs text-gray-500">
              {showManageSubscription
                ? t('premium.manageHelp')
                : t('premium.checkoutHelp')}
            </div>
          </div>
        </div>
      </section>

      {/* Section 2 — Free vs Premium */}
      <section className="mt-10">
        <div>
          <h3 className="text-xl font-extrabold text-black">
            {t('comparison.title')}
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            {t('comparison.description')}
          </p>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-black/10 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-5 py-4 font-semibold">{t('comparison.benefit')}</th>
                <th className="px-5 py-4 text-center font-semibold">{t('premium.free')}</th>
                <th className="px-5 py-4 text-center font-semibold">{t('comparison.premium')}</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map(([benefit, free, premium]) => (
                <tr key={t(benefit)} className="border-t border-black/5">
                  <td className="px-5 py-4 font-medium text-gray-900">
                    {t(benefit)}
                  </td>
                  <td className="px-5 py-4 text-center text-gray-700">
                    {free}
                  </td>
                  <td className="px-5 py-4 text-center font-bold text-gray-900">
                    {premium}
                  </td>
                </tr>
              ))}

              <tr className="border-t border-black/5">
                <td className="px-5 py-4 font-medium text-gray-900">
                  {t('comparison.developing')}
                </td>
                <td className="px-5 py-4 text-center text-gray-700">
                  {developingTeamActivationCost} activation / {developingTeamRenewalCost} renewal
                </td>
                <td className="px-5 py-4 text-center font-bold text-gray-900">
                  {developingTeamActivationCost} activation / {developingTeamRenewalCost} renewal
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          {t('comparison.note')}
        </p>
      </section>

      {/* Section 3 — Additional coin packages */}
      <section className="mt-10">
        <div>
          <h3 className="text-xl font-extrabold text-black">
            {t('packages.title')}
          </h3>
          <p className="mt-1 max-w-4xl text-sm text-gray-600">
            {t('packages.description')}
          </p>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {loadingPackages ? (
          <div className="mt-6 rounded-xl border border-black/10 bg-white p-6 text-sm text-gray-600">
            {t('packages.loading')}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {packages.map((item) => {
              const isBestValue =
                Boolean(bestValueCode) && item.code === bestValueCode
              const isBuying = buyingCode === item.code

              return (
                <div
                  key={item.code}
                  className={`relative overflow-hidden rounded-2xl border bg-white p-6 shadow-sm ${
                    isBestValue
                      ? 'border-yellow-400 ring-2 ring-yellow-300'
                      : 'border-black/10'
                  }`}
                >
                  <div className="absolute right-4 top-4">
                    {isBestValue ? (
                      <span className="rounded-full bg-yellow-400 px-3 py-1 text-xs font-bold text-black">
                        {t('packages.bestValue')}
                      </span>
                    ) : item.tagline === 'packages.popular' ? (
                      <span className="rounded-full bg-black px-3 py-1 text-xs font-bold text-white">
                        {t('packages.mostPopular')}
                      </span>
                    ) : null}
                  </div>

                  <div className="text-sm font-semibold text-gray-700">
                    {t('packages.coinPack')}
                  </div>
                  <div className="mt-1 text-4xl font-bold text-black">
                    ◎ {item.coins.toLocaleString()}
                  </div>
                  <div className="mt-2 text-sm text-gray-600">
                    {item.tagline ? t(item.tagline) : ''}
                  </div>

                  <div className="mt-5">
                    <div className="text-2xl font-normal text-black">
                      {eur(item.priceEur)}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      ≈ {eur(perCoin(item.priceEur, item.coins))} per coin
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleBuy(item.code)}
                    disabled={isBuying}
                    className="mt-5 w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-extrabold text-black hover:bg-yellow-300 disabled:opacity-60"
                  >
                    {isBuying ? 'Redirecting…' : 'Buy now'}
                  </button>

                  <div className="mt-3 text-xs text-gray-500">
                    {t('packages.checkoutHelp')}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Section 4 — Current membership */}
      <section className="mt-10">
        <div>
          <h3 className="text-xl font-extrabold text-black">
            {t('membership.title')}
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            {t('membership.description')}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 rounded-2xl border border-black/10 bg-white p-5 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
          <MembershipItem
            label="Plan"
            value={
              premiumStatus?.is_premium || premiumDetails
                ? premiumStatus?.plan_name ||
                  premiumPlan?.name ||
                  t('premium.defaultName')
                : 'Free'
            }
          />
          <MembershipItem label="Status" value={statusLabel} />
          <MembershipItem
            label="Started"
            value={formatDate(premiumDetails?.created_at)}
          />
          <MembershipItem
            label="Current period ends"
            value={formatDate(
              premiumDetails?.current_period_end ||
                premiumStatus?.current_period_end,
            )}
          />
          <MembershipItem label="Next renewal" value={nextRenewalLabel} />
          <MembershipItem label="Monthly price" value={premiumPrice} />
          <MembershipItem
            label="Monthly coin reward"
            value={`${premiumCoins} coins`}
          />
          <MembershipItem
            label="Cancel at period end"
            value={premiumStatus?.cancel_at_period_end ? 'Yes' : 'No'}
          />
        </div>

        {showManageSubscription ? (
          <p className="mt-3 text-sm text-gray-600">
            {t('membership.manageNotePrefix')} <span className="font-semibold">{t('premium.manage')}</span> {t('membership.manageNoteSuffix')}
          </p>
        ) : null}
      </section>

      {/* Section 5 — Active coin services */}
      <section className="mt-10">
        <div>
          <h3 className="text-xl font-extrabold text-black">
            {t('services.title')}
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            {t('services.description')}
          </p>
        </div>

        {loadingDevelopingTeamService ? (
          <div className="mt-5 rounded-2xl border border-black/10 bg-white p-6 text-sm text-gray-600 shadow-sm">
            {t('services.loading')}
          </div>
        ) : developingTeamServiceError ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <div className="text-sm font-semibold text-amber-900">
              {t('services.unavailable')}
            </div>
            <p className="mt-1 text-sm text-amber-800">
              {t('services.unavailableHelp')}
            </p>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-lg font-extrabold text-black">
                    {t('services.developing')}
                  </h4>

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      developingTeamService?.access_status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : developingTeamService?.access_status === 'expired'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {developingTeamServiceStatusLabel}
                  </span>
                </div>

                <p className="mt-2 text-sm text-gray-600">
                  {t('services.descriptionDeveloping')}
                </p>

                {developingTeamService?.access_status === 'expired' ? (
                  <p className="mt-3 text-sm text-amber-800">
                    {t('services.readOnly')}
                  </p>
                ) : null}

                {!developingTeamService?.is_active ? (
                  <div className="mt-3 space-y-1 text-sm text-gray-600">
                    {developingTeamService?.access_status === 'expired' ? (
                      <p>Reactivation price: {developingTeamRenewalCost} coins.</p>
                    ) : (
                      <>
                        <p>First activation price: {developingTeamActivationCost} coins.</p>
                        <p>Later renewal or reactivation: {developingTeamRenewalCost} coins per season.</p>
                      </>
                    )}
                  </div>
                ) : null}
              </div>

              <a
                href="#/dashboard/preferences"
                className="inline-flex shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-black shadow-sm transition hover:bg-gray-50"
              >
                {developingTeamService?.access_status === 'expired'
                  ? t('services.reactivatePreferences')
                  : developingTeamService?.is_active
                    ? t('services.manageService')
                    : t('services.managePreferences')}
              </a>
            </div>

            {developingTeamServiceNotice ? (
              <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                {developingTeamServiceNotice}
              </div>
            ) : null}

            {developingTeamServiceActionError ? (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {developingTeamServiceActionError}
              </div>
            ) : null}

            {developingTeamService?.is_active ? (
              <div className="mt-5 border-t border-black/5 pt-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
                <MembershipItem
                  label="Team created"
                  value={developingTeamService.team_exists ? 'Yes' : 'No'}
                />
                <MembershipItem
                  label="Status"
                  value="Active"
                />
                <MembershipItem
                  label="Current season"
                  value={`Season ${developingTeamService.current_season}`}
                />
                <MembershipItem
                  label="Access ends"
                  value={`End of Season ${
                    developingTeamService.expires_after_season ??
                    developingTeamService.active_season ??
                    developingTeamService.current_season
                  }`}
                />
                <MembershipItem
                  label="Renewal price"
                  value={`${developingTeamRenewalCost} coins`}
                />
                <MembershipItem
                  label="Next renewal"
                  value={`Start of Season ${
                    developingTeamService.next_renewal_season ??
                    developingTeamService.current_season + 1
                  }`}
                />
                </div>

                <label className="mt-5 flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-black/10 bg-gray-50 p-4">
                  <div>
                    <div className="text-sm font-semibold text-black">
                      {t('services.autoRenew')}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-gray-600">
                      When enabled, {developingTeamRenewalCost} coins will be deducted at the
                      beginning of the next season. If the wallet balance is too low, renewal will
                      fail and the Developing Team will become read-only.
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={developingTeamService.auto_renew === true}
                    disabled={
                      !developingTeamService.can_change_auto_renew ||
                      updatingDevelopingTeamAutoRenew
                    }
                    onChange={(event) => {
                      void handleDevelopingTeamAutoRenewChange(event.target.checked)
                    }}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300"
                  />
                </label>
              </div>
            ) : developingTeamService?.access_status === 'expired' ? (
              <div className="mt-5 grid grid-cols-1 gap-4 border-t border-black/5 pt-5 sm:grid-cols-3">
                <MembershipItem
                  label="Team created"
                  value={developingTeamService.team_exists ? 'Yes' : 'No'}
                />
                <MembershipItem
                  label="Status"
                  value="Expired"
                />
                <MembershipItem
                  label="Reactivation price"
                  value={`${developingTeamRenewalCost} coins`}
                />
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-4 border-t border-black/5 pt-5 sm:grid-cols-3">
                <MembershipItem
                  label="Team created"
                  value={developingTeamService?.team_exists ? 'Yes' : 'No'}
                />
                <MembershipItem
                  label="Status"
                  value="Not activated"
                />
                <MembershipItem
                  label="First activation"
                  value={`${developingTeamActivationCost} coins`}
                />
                <MembershipItem
                  label="Later renewals"
                  value={`${developingTeamRenewalCost} coins per season`}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* Section 6 — Billing and purchase history */}
      <section className="mt-10">
        <div>
          <h3 className="text-xl font-extrabold text-black">
            {t('history.title')}
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            {t('history.description')}
          </p>
        </div>

        <div className="mt-5 space-y-4">
          <HistoryCard
            title={t('history.premiumInvoices')}
            subtitle={t('history.premiumInvoicesSubtitle')}
            open={premiumInvoicesOpen}
            onToggle={() => void handleTogglePremiumInvoices()}
          >
            {premiumInvoicesError ? (
              <HistoryError message={premiumInvoicesError} />
            ) : loadingPremiumInvoices ? (
              <HistoryLoading />
            ) : premiumInvoices.length === 0 ? (
              <HistoryEmpty message="No Premium invoices found." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-black/10">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">{t('history.paid')}</th>
                      <th className="px-4 py-3 font-semibold">{t('history.servicePeriod')}</th>
                      <th className="px-4 py-3 font-semibold">{t('history.amount')}</th>
                      <th className="px-4 py-3 font-semibold">{t('history.coinsGranted')}</th>
                      <th className="px-4 py-3 font-semibold">{t('history.type')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {premiumInvoices.map((invoice) => (
                      <tr
                        key={invoice.stripe_invoice_id}
                        className="border-t border-black/5"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatDateTime(invoice.processed_at)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatDate(invoice.period_start)} –{' '}
                          {formatDate(invoice.period_end)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold">
                          {moneyFromCents(
                            invoice.amount_paid_cents,
                            invoice.currency,
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-green-700">
                          +{Number(invoice.coins_granted).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {titleFromSnake(invoice.billing_reason)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </HistoryCard>

          <HistoryCard
            title={t('history.coinPurchases')}
            subtitle={t('history.coinPurchasesSubtitle')}
            open={historyOpen}
            onToggle={() => void handleToggleHistory()}
          >
            {historyError ? (
              <HistoryError message={historyError} />
            ) : loadingHistory ? (
              <HistoryLoading />
            ) : purchases.length === 0 ? (
              <HistoryEmpty message="No coin-package purchases found." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-black/10">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">{t('history.date')}</th>
                      <th className="px-4 py-3 font-semibold">{t('history.package')}</th>
                      <th className="px-4 py-3 font-semibold">{t('history.coins')}</th>
                      <th className="px-4 py-3 font-semibold">{t('history.price')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((purchase, index) => (
                      <tr
                        key={`${purchase.createdAt}_${purchase.packageCode}_${index}`}
                        className="border-t border-black/5"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatDateTime(purchase.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          {purchase.packageCode
                            ? titleFromSnake(purchase.packageCode)
                            : 'Coin package'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-green-700">
                          +{purchase.coins.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {purchase.priceEur === null
                            ? '—'
                            : eur(purchase.priceEur)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </HistoryCard>

          <HistoryCard
            title={t('history.ledger')}
            subtitle={t('history.ledgerSubtitle')}
            open={coinHistoryOpen}
            onToggle={() => void handleToggleCoinHistory()}
          >
            {coinHistoryError ? (
              <HistoryError message={coinHistoryError} />
            ) : loadingCoinHistory ? (
              <HistoryLoading />
            ) : coinTransactions.length === 0 ? (
              <HistoryEmpty message="No coin transactions found." />
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-black/10">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600">
                      <tr>
                        <th className="px-4 py-3 font-semibold">{t('history.date')}</th>
                        <th className="px-4 py-3 font-semibold">{t('history.type')}</th>
                        <th className="px-4 py-3 font-semibold">{t('history.coins')}</th>
                        <th className="px-4 py-3 font-semibold">{t('history.details')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleCoinTransactions.map((transaction, index) => {
                        const amountClass =
                          transaction.delta > 0
                            ? 'text-green-700'
                            : transaction.delta < 0
                              ? 'text-red-700'
                              : 'text-gray-700'

                        return (
                          <tr
                            key={`${transaction.createdAt}_${transaction.reason}_${index}`}
                            className="border-t border-black/5"
                          >
                            <td className="px-4 py-3 whitespace-nowrap">
                              {formatDateTime(transaction.createdAt)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap font-medium">
                              {titleFromSnake(transaction.reason)}
                            </td>
                            <td className={`px-4 py-3 whitespace-nowrap font-bold ${amountClass}`}>
                              {transaction.delta > 0 ? '+' : ''}
                              {transaction.delta.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {transaction.description}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-600">
                    Page {safeCoinHistoryPage} of {coinHistoryTotalPages}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCoinHistoryPage((current) =>
                          Math.max(1, current - 1),
                        )
                      }
                      disabled={safeCoinHistoryPage <= 1}
                      className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('history.previous')}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCoinHistoryPage((current) =>
                          Math.min(
                            coinHistoryTotalPages,
                            current + 1,
                          ),
                        )
                      }
                      disabled={
                        safeCoinHistoryPage >= coinHistoryTotalPages
                      }
                      className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('history.next')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </HistoryCard>
        </div>
      </section>
    </div>
  )
}

function MembershipItem(props: {
  label: string
  value: string
}): JSX.Element {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {props.label}
      </div>
      <div className="mt-1 text-base font-normal text-black">
        {props.value}
      </div>
    </div>
  )
}

function HistoryCard(props: {
  title: string
  subtitle: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-base font-semibold text-black">
            {props.title}
          </div>
          <div className="mt-1 text-sm text-gray-600">
            {props.subtitle}
          </div>
        </div>

        <button
          type="button"
          onClick={props.onToggle}
          className="h-10 min-w-[128px] rounded-xl bg-black px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          {props.open ? 'Hide history' : 'Show history'}
        </button>
      </div>

      {props.open ? <div className="mt-4">{props.children}</div> : null}
    </div>
  )
}

function HistoryError(props: { message: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {props.message}
    </div>
  )
}

function HistoryLoading(): JSX.Element {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-gray-600">
      {t('history.loading')}
    </div>
  )
}

function HistoryEmpty(props: { message: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-gray-600">
      {props.message}
    </div>
  )
}
