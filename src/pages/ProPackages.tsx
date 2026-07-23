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
import React, { useEffect, useMemo, useState } from 'react'
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

const COMPARISON_ROWS = [
  ['Create and manage a club', '✓', '✓'],
  ['Play races', '✓', '✓'],
  ['Basic management features', '✓', '✓'],
  ['Account access without coins', '✓', '✓'],
  ['Premium analysis and tools', '—', '✓'],
  ['Monthly Premium coin reward', '—', '50'],
  ['Buy additional coin packages', '✓', '✓'],
  ['Use optional coin features', '✓', '✓'],
] as const

function eur(value: number) {
  return new Intl.NumberFormat('de-DE', {
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
    return new Intl.NumberFormat('de-DE', {
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
  if (coins <= 70) return 'Starter boost'
  if (coins <= 130) return 'Great for a new season'
  if (coins <= 270) return 'Most balanced pick'
  if (coins <= 390) return 'Most popular'
  if (coins <= 570) return 'Serious manager mode'
  return 'Best for long-term play'
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
    return `Coin package purchase: ${packageCode}`
  }
  if (reason === 'daily_charge') return 'Historical daily gameplay charge'
  if (reason === 'daily_gameplay_unlock') return 'Historical daily gameplay unlock'
  if (reason === 'referral_reward') return 'Referral reward'
  if (reason === 'admin_adjustment') return 'Admin adjustment'
  if (reason === 'developing_team_purchase') return 'Developing Team purchase'
  if (reason === 'developing_team_unlock') return 'Developing Team purchase'
  if (reason === 'scout_report_extra') return 'Extra scouting report'
  if (reason === 'premium_monthly_grant') return 'Premium monthly coin grant'

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
    throw new Error('Not authenticated. Please log in again.')
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
      return 'Active — cancellation scheduled'
    }

    if (premiumStatus?.is_premium) return 'Active'

    const stripeStatus = premiumStatus?.stripe_status
    if (!stripeStatus || stripeStatus === 'free') return 'Free'

    return titleFromSnake(stripeStatus)
  }, [premiumStatus])

  const nextRenewalLabel = useMemo(() => {
    if (!premiumStatus?.is_premium) return '—'
    if (premiumStatus.cancel_at_period_end) return 'No further renewal'

    return formatDate(
      premiumDetails?.current_period_end ||
        premiumStatus.current_period_end,
    )
  }, [premiumDetails?.current_period_end, premiumStatus])

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

  async function loadCoinStatus() {
    setLoadingBalance(true)

    const { data, error: coinError } =
      await supabase.rpc('get_my_coin_status')

    if (coinError) {
      console.error('Failed to load coin status:', coinError)
      setBalance(0)
      setLoadingBalance(false)
      return
    }

    const row = ((data ?? []) as CoinStatusRow[])[0]
    setBalance(Math.max(Number(row?.balance ?? 0), 0))
    setLoadingBalance(false)
  }

  async function loadPremiumData() {
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
    } catch (loadError: any) {
      console.error('Failed to load Premium data:', loadError)
      setPremiumPlan(null)
      setPremiumStatus(null)
      setPremiumDetails(null)
      setPremiumError(
        loadError?.message ??
          'Failed to load Premium membership details.',
      )
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
          'Failed to load Premium invoice history.',
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
        loadError?.message ?? 'Failed to load purchase history.',
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
          'Failed to load coin transaction history.',
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
      premiumInvoicesOpen
        ? loadPremiumInvoiceHistory()
        : Promise.resolve(),
      historyOpen ? loadPurchaseHistory() : Promise.resolve(),
      coinHistoryOpen
        ? loadCoinTransactionHistory()
        : Promise.resolve(),
    ])
  }

  useEffect(() => {
    void Promise.all([
      loadCoinStatus(),
      loadPremiumData(),
      loadPackages(),
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const hash = window.location.hash
    const queryIndex = hash.indexOf('?')
    if (queryIndex < 0) return

    const params = new URLSearchParams(hash.slice(queryIndex + 1))
    const premiumResult = params.get('premium')

    if (premiumResult === 'success') {
      setPremiumNotice(
        'Payment completed. Premium activation and the 50-coin grant may take a few seconds while Stripe confirms the invoice.',
      )
    } else if (premiumResult === 'cancel') {
      setPremiumNotice(
        'Premium checkout was canceled. No payment was taken.',
      )
    } else if (premiumResult === 'portal_return') {
      setPremiumNotice(
        'Billing management completed. Subscription changes may take a few seconds to appear.',
      )
    } else {
      return
    }

    const refreshTimer = window.setTimeout(() => {
      void Promise.all([
        loadPremiumData(),
        loadCoinStatus(),
        premiumInvoicesOpen
          ? loadPremiumInvoiceHistory()
          : Promise.resolve(),
      ])
    }, 2500)

    return () => window.clearTimeout(refreshTimer)
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
        throw new Error('Premium Checkout URL missing')
      }

      window.location.href = response.url
    } catch (checkoutError: any) {
      setPremiumError(
        checkoutError?.message ?? 'Premium checkout failed.',
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
        throw new Error('Stripe Customer Portal URL missing')
      }

      window.location.href = response.url
    } catch (portalError: any) {
      setPremiumError(
        portalError?.message ??
          'Could not open subscription management.',
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

      if (!response.url) throw new Error('Checkout URL missing')

      window.location.href = response.url
    } catch (checkoutError: any) {
      setError(checkoutError?.message ?? 'Checkout failed.')
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
            Normal gameplay is free. Premium membership and coin packages are optional.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refreshVisibleData()}
            className="rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-black shadow-sm hover:bg-gray-50"
          >
            Refresh
          </button>

          <div className="rounded-xl border border-black/10 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs text-gray-500">Your balance</div>
            <div className="text-lg font-bold text-black">
              ◎ {loadingBalance ? '…' : balance.toLocaleString()}{' '}
              {!loadingBalance ? coinLabel(balance) : ''}
            </div>
          </div>
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
      <section className="mt-6 overflow-hidden rounded-2xl border border-yellow-400 bg-white shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold text-black">
                PREMIUM
              </span>

              {!loadingPremium && premiumStatus?.is_premium ? (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                  {premiumStatus.cancel_at_period_end
                    ? 'Active — ending'
                    : 'Active'}
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
                  Optional membership
                </span>
              )}
            </div>

            <h3 className="mt-4 text-2xl font-extrabold text-black">
              {premiumPlan?.name ?? 'ProPeloton Premium'}
            </h3>

            <div className="mt-2 text-3xl font-extrabold text-black">
              {premiumPrice}
              <span className="ml-2 text-sm font-medium text-gray-500">
                per real-life month
              </span>
            </div>

            <ul className="mt-5 space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="font-bold text-green-700">✓</span>
                <span>Unlock Premium game features.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-green-700">✓</span>
                <span>
                  Receive {premiumCoins} coins after every successful monthly payment.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-green-700">✓</span>
                <span>Automatically renews each month.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-green-700">✓</span>
                <span>Cancel at any time.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-green-700">✓</span>
                <span>Basic game access remains free after cancellation.</span>
              </li>
            </ul>

            {premiumStatus?.is_premium ? (
              <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                <div className="font-bold">
                  {premiumStatus.cancel_at_period_end
                    ? 'Premium remains active until the paid period ends.'
                    : 'Premium is active.'}
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
              Premium membership
            </div>
            <div className="mt-2 text-4xl font-extrabold text-black">
              {premiumPrice}
            </div>
            <div className="mt-1 text-sm text-gray-600">
              per real-life month
            </div>

            {showManageSubscription ? (
              <button
                type="button"
                onClick={() => void handleManageSubscription()}
                disabled={openingPremiumPortal || loadingPremium}
                className="mt-6 w-full rounded-xl bg-black px-4 py-3 text-sm font-extrabold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {openingPremiumPortal
                  ? 'Opening billing portal…'
                  : 'Manage subscription'}
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
                  ? 'Loading Premium…'
                  : startingPremiumCheckout
                    ? 'Redirecting…'
                    : premiumCheckoutBlocked
                      ? 'Subscription already exists'
                      : 'Become Premium'}
              </button>
            )}

            <div className="mt-3 text-xs text-gray-500">
              {showManageSubscription
                ? 'Manage billing details, view Stripe invoices or cancel future renewal.'
                : 'Secure recurring Stripe checkout. Premium is optional and normal gameplay remains free.'}
            </div>
          </div>
        </div>
      </section>

      {/* Section 2 — Free vs Premium */}
      <section className="mt-10">
        <div>
          <h3 className="text-xl font-extrabold text-black">
            Free vs Premium
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Premium adds optional analysis and tools without removing access from Free players.
          </p>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-black/10 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-5 py-4 font-semibold">Benefit</th>
                <th className="px-5 py-4 text-center font-semibold">Free</th>
                <th className="px-5 py-4 text-center font-semibold">Premium</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map(([benefit, free, premium]) => (
                <tr key={benefit} className="border-t border-black/5">
                  <td className="px-5 py-4 font-medium text-gray-900">
                    {benefit}
                  </td>
                  <td className="px-5 py-4 text-center text-gray-700">
                    {free}
                  </td>
                  <td className="px-5 py-4 text-center font-bold text-gray-900">
                    {premium}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          Premium-only analysis and tools will be expanded during the page-by-page feature review.
        </p>
      </section>

      {/* Section 3 — Additional coin packages */}
      <section className="mt-10">
        <div>
          <h3 className="text-xl font-extrabold text-black">
            Need additional coins?
          </h3>
          <p className="mt-1 max-w-4xl text-sm text-gray-600">
            Free and Premium players can purchase additional coins for optional features and expansions. Buying coins does not activate Premium membership.
          </p>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {loadingPackages ? (
          <div className="mt-6 rounded-xl border border-black/10 bg-white p-6 text-sm text-gray-600">
            Loading packages…
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
                        Best value
                      </span>
                    ) : item.tagline === 'Most popular' ? (
                      <span className="rounded-full bg-black px-3 py-1 text-xs font-bold text-white">
                        Most popular
                      </span>
                    ) : null}
                  </div>

                  <div className="text-sm font-semibold text-gray-700">
                    Coin Pack
                  </div>
                  <div className="mt-1 text-4xl font-normal text-black">
                    ◎ {item.coins.toLocaleString()}
                  </div>
                  <div className="mt-2 text-sm text-gray-600">
                    {item.tagline}
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
                    Secure Stripe checkout. This is a one-time coin purchase, not a Premium subscription.
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
            Current membership
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Your current plan, billing period and renewal status.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 rounded-2xl border border-black/10 bg-white p-5 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
          <MembershipItem
            label="Plan"
            value={
              premiumStatus?.is_premium || premiumDetails
                ? premiumStatus?.plan_name ||
                  premiumPlan?.name ||
                  'ProPeloton Premium'
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
            Use <span className="font-semibold">Manage subscription</span> above to cancel future renewal, update billing details or view Stripe-hosted invoices.
          </p>
        ) : null}
      </section>

      {/* Section 5 — Billing and purchase history */}
      <section className="mt-10">
        <div>
          <h3 className="text-xl font-extrabold text-black">
            Billing and purchase history
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Premium invoices, coin-package purchases and wallet activity are kept separate.
          </p>
        </div>

        <div className="mt-5 space-y-4">
          <HistoryCard
            title="Premium invoices"
            subtitle="Successful Premium payments and monthly coin grants"
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
                      <th className="px-4 py-3 font-semibold">Paid</th>
                      <th className="px-4 py-3 font-semibold">Service period</th>
                      <th className="px-4 py-3 font-semibold">Amount</th>
                      <th className="px-4 py-3 font-semibold">Coins granted</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
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
            title="Coin-package purchases"
            subtitle="One-time purchases of optional coin packages"
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
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Package</th>
                      <th className="px-4 py-3 font-semibold">Coins</th>
                      <th className="px-4 py-3 font-semibold">Price</th>
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
            title="Coin ledger/history"
            subtitle="All coin grants, purchases, rewards and optional-feature spending"
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
                        <th className="px-4 py-3 font-semibold">Date</th>
                        <th className="px-4 py-3 font-semibold">Type</th>
                        <th className="px-4 py-3 font-semibold">Coins</th>
                        <th className="px-4 py-3 font-semibold">Details</th>
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
                      Previous
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
                      Next
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
      <div className="mt-1 text-base font-bold text-black">
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
      Loading…
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
