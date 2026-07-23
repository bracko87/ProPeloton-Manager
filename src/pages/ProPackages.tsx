/**
 * ProPackages.tsx
 * Premium membership + optional coin packages shop page.
 *
 * - Loads Premium plan details from premium_plans.
 * - Loads the current Premium state through get_my_premium_status.
 * - Starts Premium subscription Checkout through create-premium-checkout.
 * - Loads coin packages from coin_packages.
 * - Shows the current wallet balance through get_my_coin_status.
 * - Buy Now calls the existing create-coin-checkout Edge Function.
 * - Purchase and wallet history remain available.
 *
 * Normal gameplay remains free. Premium and coins are optional.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type CoinStatusRow = { balance: number; can_play: boolean }

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

const COIN_HISTORY_PAGE_SIZE = 20

function eur(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
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

function formatDateTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
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
  if (!iso) return null

  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, {
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
  if (!value) return 'Coin transaction'

  return String(value)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

function describeCoinTransaction(reason: string, payload: any) {
  const packageCode = typeof payload?.package_code === 'string' ? payload.package_code : null
  const description =
    typeof payload?.description === 'string'
      ? payload.description
      : typeof payload?.label === 'string'
        ? payload.label
        : typeof payload?.message === 'string'
          ? payload.message
          : null

  if (description) return description
  if (reason === 'purchase' && packageCode) return `Coin package purchase: ${packageCode}`
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

/**
 * Safely derive Supabase URL + anon key from the existing client.
 */
function getSupabaseConfig(): { url: string; anonKey: string } {
  const anyClient = supabase as any

  const url: string | undefined =
    anyClient?.supabaseUrl || anyClient?.url || anyClient?.rest?.url || anyClient?.realtime?.url

  const anonKey: string | undefined =
    anyClient?.supabaseKey || anyClient?.anonKey || anyClient?.headers?.apikey || anyClient?.auth?.headers?.apikey

  if (!url || !anonKey) {
    throw new Error(
      'Supabase client config not found. Ensure ../lib/supabase initializes createClient(SUPABASE_URL, SUPABASE_ANON_KEY).'
    )
  }

  return { url, anonKey }
}

export default function ProPackagesPage(): JSX.Element {
  const [balance, setBalance] = useState<number>(0)
  const [loadingBalance, setLoadingBalance] = useState(true)

  const [premiumPlan, setPremiumPlan] = useState<PremiumPlanRow | null>(null)
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatusRow | null>(null)
  const [loadingPremium, setLoadingPremium] = useState(true)
  const [startingPremiumCheckout, setStartingPremiumCheckout] = useState(false)
  const [premiumError, setPremiumError] = useState<string | null>(null)
  const [premiumNotice, setPremiumNotice] = useState<string | null>(null)

  const [packages, setPackages] = useState<UiCoinPackage[]>([])
  const [loadingPackages, setLoadingPackages] = useState(true)

  const [buyingCode, setBuyingCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Purchase history
  const [historyOpen, setHistoryOpen] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [purchases, setPurchases] = useState<PurchaseUi[]>([])

  // Full coin transaction history
  const [coinHistoryOpen, setCoinHistoryOpen] = useState(false)
  const [loadingCoinHistory, setLoadingCoinHistory] = useState(false)
  const [coinHistoryError, setCoinHistoryError] = useState<string | null>(null)
  const [coinTransactions, setCoinTransactions] = useState<CoinTransactionUi[]>([])
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

  const premiumAccessUntilLabel = useMemo(() => {
    return formatDate(premiumStatus?.access_until)
  }, [premiumStatus?.access_until])

  const premiumPeriodEndLabel = useMemo(() => {
    return formatDate(premiumStatus?.current_period_end)
  }, [premiumStatus?.current_period_end])

  const bestValueCode = useMemo(() => {
    if (packages.length === 0) return null
    let best = packages[0]
    for (const p of packages) {
      if (perCoin(p.priceEur, p.coins) < perCoin(best.priceEur, best.coins)) best = p
    }
    return best.code
  }, [packages])

  // Map for quick lookup: code -> price
  const priceByCode = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of packages) m.set(p.code, p.priceEur)
    return m
  }, [packages])

  const coinHistoryTotalPages = useMemo(() => {
    return getTotalPages(coinTransactions.length, COIN_HISTORY_PAGE_SIZE)
  }, [coinTransactions.length])

  const safeCoinHistoryPage = clampPage(coinHistoryPage, coinHistoryTotalPages)

  const visibleCoinTransactions = useMemo(() => {
    return slicePage(coinTransactions, safeCoinHistoryPage, COIN_HISTORY_PAGE_SIZE)
  }, [coinTransactions, safeCoinHistoryPage])

  useEffect(() => {
    setCoinHistoryPage((current) =>
      clampPage(current, getTotalPages(coinTransactions.length, COIN_HISTORY_PAGE_SIZE)),
    )
  }, [coinTransactions.length])

  async function loadCoinStatus() {
    setLoadingBalance(true)
    const { data, error } = await supabase.rpc('get_my_coin_status')
    if (error) {
      console.error('Failed to load coin status:', error)
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
      const [planResult, statusResult] = await Promise.all([
        supabase
          .from('premium_plans')
          .select(
            'code, name, description, price_cents, currency, interval_unit, interval_count, coins_per_paid_invoice, active',
          )
          .eq('code', 'premium_monthly')
          .eq('active', true)
          .maybeSingle(),
        supabase.rpc('get_my_premium_status'),
      ])

      if (planResult.error) throw planResult.error
      if (statusResult.error) throw statusResult.error

      setPremiumPlan((planResult.data as PremiumPlanRow | null) ?? null)

      const statusRows = (statusResult.data ?? []) as PremiumStatusRow[]
      setPremiumStatus(statusRows[0] ?? null)
    } catch (e: any) {
      console.error('Failed to load Premium data:', e)
      setPremiumPlan(null)
      setPremiumStatus(null)
      setPremiumError(e?.message ?? 'Failed to load Premium membership details.')
    } finally {
      setLoadingPremium(false)
    }
  }

  async function loadPackages() {
    setLoadingPackages(true)
    const { data, error } = await supabase
      .from('coin_packages')
      .select('code, coins, price_cents, currency, active')
      .eq('active', true)

    if (error) {
      console.error('Failed to load coin packages:', error)
      setPackages([])
      setLoadingPackages(false)
      return
    }

    const rows = (data ?? []) as DbCoinPackage[]
    const mapped: UiCoinPackage[] = rows
      .map((r) => ({
        code: r.code,
        coins: Number(r.coins),
        priceEur: Number(r.price_cents) / 100,
        tagline: taglineForCoins(Number(r.coins)),
      }))
      .sort((a, b) => a.coins - b.coins)

    setPackages(mapped)
    setLoadingPackages(false)
  }

  async function loadPurchaseHistory() {
    setHistoryError(null)
    setLoadingHistory(true)

    try {
      const { data, error } = await supabase
        .from('user_coin_ledger')
        .select('delta, reason, payload_json, created_at')
        .eq('reason', 'purchase')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      const rows = (data ?? []) as PurchaseRow[]
      const mapped: PurchaseUi[] = rows.map((r) => {
        const payload = (r.payload_json ?? {}) as any
        const packageCode = (payload.package_code as string) ?? null
        const priceEur = packageCode ? priceByCode.get(packageCode) ?? null : null

        return {
          createdAt: r.created_at,
          coins: Math.max(Number(r.delta ?? 0), 0),
          packageCode,
          priceEur,
        }
      })

      setPurchases(mapped)
    } catch (e: any) {
      console.error('Failed to load purchase history:', e)
      setHistoryError(e?.message ?? 'Failed to load purchase history.')
      setPurchases([])
    } finally {
      setLoadingHistory(false)
    }
  }

  async function loadCoinTransactionHistory() {
    setCoinHistoryError(null)
    setLoadingCoinHistory(true)

    try {
      const { data, error } = await supabase
        .from('user_coin_ledger')
        .select('delta, reason, payload_json, created_at')
        .order('created_at', { ascending: false })
        .limit(500)

      if (error) throw error

      const rows = (data ?? []) as CoinLedgerRow[]
      const mapped: CoinTransactionUi[] = rows.map((row) => {
        const payload = (row.payload_json ?? {}) as any
        const packageCode = typeof payload?.package_code === 'string' ? payload.package_code : null

        return {
          createdAt: row.created_at,
          delta: Number(row.delta ?? 0),
          reason: String(row.reason ?? 'coin_transaction'),
          description: describeCoinTransaction(String(row.reason ?? ''), payload),
          packageCode,
        }
      })

      setCoinTransactions(mapped)
      setCoinHistoryPage(1)
    } catch (e: any) {
      console.error('Failed to load coin transaction history:', e)
      setCoinHistoryError(e?.message ?? 'Failed to load coin transaction history.')
      setCoinTransactions([])
    } finally {
      setLoadingCoinHistory(false)
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        await Promise.all([loadCoinStatus(), loadPremiumData(), loadPackages()])
      } finally {
        if (!mounted) return
      }
    })()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
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

      const refreshTimer = window.setTimeout(() => {
        void Promise.all([loadPremiumData(), loadCoinStatus()])
      }, 2500)

      return () => {
        window.clearTimeout(refreshTimer)
      }
    }

    if (premiumResult === 'cancel') {
      setPremiumNotice('Premium checkout was canceled. No payment was taken.')
    }
  }, [])

  async function handleStartPremiumCheckout() {
    setPremiumError(null)
    setPremiumNotice(null)
    setStartingPremiumCheckout(true)

    try {
      const { url: supabaseUrl, anonKey } = getSupabaseConfig()

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError

      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not authenticated. Please log in again.')

      const res = await fetch(`${supabaseUrl}/functions/v1/create-premium-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan_code: 'premium_monthly' }),
      })

      const responseText = await res.text().catch(() => '')
      let responseJson: { url?: string; error?: string; code?: string } = {}

      if (responseText) {
        try {
          responseJson = JSON.parse(responseText) as {
            url?: string
            error?: string
            code?: string
          }
        } catch {
          responseJson = {}
        }
      }

      if (!res.ok) {
        throw new Error(
          responseJson.error || responseText || `Edge function error: ${res.status}`,
        )
      }

      if (!responseJson.url) throw new Error('Premium Checkout URL missing')

      window.location.href = responseJson.url
    } catch (e: any) {
      setPremiumError(e?.message ?? 'Premium checkout failed.')
      setStartingPremiumCheckout(false)
    }
  }

  async function handleBuy(code: string) {
    setError(null)
    setBuyingCode(code)

    try {
      const { url: supabaseUrl, anonKey } = getSupabaseConfig()

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError

      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not authenticated. Please log in again.')

      const res = await fetch(`${supabaseUrl}/functions/v1/create-coin-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ package_code: code }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `Edge function error: ${res.status}`)
      }

      const json = (await res.json()) as { url?: string }
      if (!json.url) throw new Error('Checkout URL missing')

      window.location.href = json.url
    } catch (e: any) {
      setError(e?.message ?? 'Checkout failed.')
      setBuyingCode(null)
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
    <div className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-black">Pro Packages</h2>
          <p className="mt-1 text-sm text-gray-600">
            Normal gameplay is free. Premium membership and coin packages are optional.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void Promise.all([
                loadCoinStatus(),
                loadPremiumData(),
                loadPackages(),
                coinHistoryOpen ? loadCoinTransactionHistory() : Promise.resolve(),
                historyOpen ? loadPurchaseHistory() : Promise.resolve(),
              ])
            }}
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

      <section className="mt-6 overflow-hidden rounded-2xl border border-yellow-400 bg-white shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_0.75fr]">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold text-black">
                PREMIUM
              </span>

              {!loadingPremium && premiumStatus?.is_premium ? (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                  Active
                </span>
              ) : !loadingPremium && premiumCheckoutBlocked ? (
                <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-800">
                  {titleFromSnake(premiumStatus?.stripe_status)}
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

            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              {premiumPlan?.description ??
                'Monthly Premium membership with 50 coins after every successful payment.'}
            </p>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-black/10 bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Monthly price
                </div>
                <div className="mt-1 text-xl font-extrabold text-black">
                  {premiumPlan ? eur(Number(premiumPlan.price_cents) / 100) : '€4.99'}
                </div>
                <div className="mt-1 text-xs text-gray-500">Automatic monthly renewal</div>
              </div>

              <div className="rounded-xl border border-black/10 bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Monthly coins
                </div>
                <div className="mt-1 text-xl font-extrabold text-black">
                  ◎ {premiumPlan?.coins_per_paid_invoice ?? 50}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  After every successful payment
                </div>
              </div>

              <div className="rounded-xl border border-black/10 bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Gameplay access
                </div>
                <div className="mt-1 text-xl font-extrabold text-black">Always free</div>
                <div className="mt-1 text-xs text-gray-500">
                  Premium is never required to play
                </div>
              </div>
            </div>

            <ul className="mt-5 list-disc space-y-1 pl-5 text-sm text-gray-700">
              <li>50 coins after the first successful payment and every successful monthly renewal.</li>
              <li>A failed payment grants no coins and does not extend Premium access.</li>
              <li>Cancellation stops future renewals; paid access remains until the current period ends.</li>
              <li>Premium data remains stored and becomes available again after renewal.</li>
              <li>No voluntary refunds, except where required by law.</li>
            </ul>

            {!loadingPremium && premiumStatus?.is_premium ? (
              <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                <div className="font-bold">Premium is active.</div>
                <div className="mt-1">
                  {premiumStatus.cancel_at_period_end
                    ? `Your subscription is canceled for renewal, but Premium remains available until ${
                        premiumAccessUntilLabel ?? premiumPeriodEndLabel ?? 'the end of the paid period'
                      }.`
                    : `Your current paid period ${
                        premiumPeriodEndLabel
                          ? `ends on ${premiumPeriodEndLabel}`
                          : 'is active'
                      }.`}
                </div>
              </div>
            ) : !loadingPremium && premiumCheckoutBlocked ? (
              <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                An existing subscription is currently marked as{' '}
                <span className="font-bold">
                  {titleFromSnake(premiumStatus?.stripe_status)}
                </span>
                . A second subscription cannot be started.
              </div>
            ) : null}
          </div>

          <div className="flex flex-col justify-center border-t border-black/10 bg-yellow-50 p-6 sm:p-8 lg:border-l lg:border-t-0">
            <div className="text-sm font-semibold text-gray-700">Premium membership</div>
            <div className="mt-2 text-4xl font-extrabold text-black">
              {premiumPlan ? eur(Number(premiumPlan.price_cents) / 100) : '€4.99'}
            </div>
            <div className="mt-1 text-sm text-gray-600">per real-life month</div>

            <button
              type="button"
              onClick={() => {
                void handleStartPremiumCheckout()
              }}
              disabled={
                loadingPremium ||
                startingPremiumCheckout ||
                !premiumPlan ||
                premiumCheckoutBlocked ||
                Boolean(premiumStatus?.is_premium)
              }
              className="mt-6 w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-extrabold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingPremium
                ? 'Loading Premium…'
                : startingPremiumCheckout
                  ? 'Redirecting…'
                  : premiumStatus?.is_premium
                    ? 'Premium active'
                    : premiumCheckoutBlocked
                      ? 'Subscription already exists'
                      : premiumPlan
                        ? `Subscribe for ${eur(Number(premiumPlan.price_cents) / 100)} / month`
                        : 'Premium unavailable'}
            </button>

            <div className="mt-3 text-xs text-gray-500">
              Secure recurring Stripe checkout. The subscription renews automatically each month
              until canceled.
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div>
          <h3 className="text-xl font-extrabold text-black">Buy Coins</h3>
          <p className="mt-1 text-sm text-gray-600">
            Buy optional coins without Premium. Coins can be used for special features,
            expansions and additional services.
          </p>
        </div>
      </section>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {loadingPackages ? (
        <div className="mt-6 rounded-xl border border-black/10 bg-white p-6 text-sm text-gray-600">Loading packages…</div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((p) => {
            const isBestValue = bestValueCode && p.code === bestValueCode
            const isBuying = buyingCode === p.code

            return (
              <div
                key={p.code}
                className={`relative overflow-hidden rounded-2xl border bg-white p-6 shadow-sm ${
                  isBestValue ? 'border-yellow-400 ring-2 ring-yellow-300' : 'border-black/10'
                }`}
              >
                <div className="absolute right-4 top-4">
                  {isBestValue ? (
                    <span className="rounded-full bg-yellow-400 px-3 py-1 text-xs font-bold text-black">Best value</span>
                  ) : p.tagline === 'Most popular' ? (
                    <span className="rounded-full bg-black px-3 py-1 text-xs font-bold text-white">Most popular</span>
                  ) : null}
                </div>

                <div className="text-sm font-semibold text-gray-700">Coin Pack</div>
                <div className="mt-1 text-4xl font-normal text-black">◎ {p.coins.toLocaleString()}</div>
                <div className="mt-2 text-sm text-gray-600">{p.tagline}</div>

                <div className="mt-5">
                  <div className="text-2xl font-normal text-black">{eur(p.priceEur)}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    ≈ {eur(perCoin(p.priceEur, p.coins))} per coin
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleBuy(p.code)}
                  disabled={isBuying}
                  className="mt-5 w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-extrabold text-black hover:bg-yellow-300 disabled:opacity-60"
                >
                  {isBuying ? 'Redirecting…' : 'Buy now'}
                </button>

                <div className="mt-3 text-xs text-gray-500">
                  Secure checkout (Visa / Mastercard). PayPal supported where available.
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Purchase history */}
      <div className="mt-8 rounded-2xl border border-black/10 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-black">Purchase history</div>
            <div className="mt-1 text-sm text-gray-600">Your last 50 coin purchases</div>
          </div>

          <button
            type="button"
            onClick={() => {
              void handleToggleHistory()
            }}
            className="h-10 min-w-[128px] rounded-xl bg-black px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
          >
            {historyOpen ? 'Hide history' : 'Show history'}
          </button>
        </div>

        {historyOpen ? (
          <div className="mt-4">
            {historyError ? (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {historyError}
              </div>
            ) : null}

            {loadingHistory ? (
              <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-gray-600">Loading…</div>
            ) : purchases.length === 0 ? (
              <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-gray-600">
                No purchases yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-black/10">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Package</th>
                      <th className="px-4 py-3 font-semibold">Coins</th>
                      <th className="px-4 py-3 font-semibold">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {purchases.map((p, idx) => (
                      <tr key={`${p.createdAt}_${idx}`} className="bg-white">
                        <td className="px-4 py-3 text-gray-700">{formatDateTime(p.createdAt)}</td>
                        <td className="px-4 py-3 text-gray-800">{p.packageCode ?? '—'}</td>
                        <td className="px-4 py-3 font-semibold text-black">◎ {p.coins.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-800">{p.priceEur != null ? eur(p.priceEur) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 text-xs text-gray-500">
              Tip: if you change prices later, history prices will reflect current package prices. If you want immutable price
              history, store <span className="font-semibold">price_cents</span> in the purchase payload at checkout/webhook time.
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-8 rounded-2xl border border-black/10 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-black">Coin transaction history</div>
            <div className="mt-1 text-sm text-gray-600">
              All wallet activity, including purchases, rewards, optional feature costs and historical adjustments.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void loadCoinTransactionHistory()
              }}
              className="h-10 min-w-[128px] rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-bold text-black hover:bg-gray-50"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={() => {
                void handleToggleCoinHistory()
              }}
              className="h-10 min-w-[128px] rounded-xl bg-black px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              {coinHistoryOpen ? 'Hide history' : 'Show history'}
            </button>
          </div>
        </div>

        {coinHistoryOpen ? (
          <div className="mt-4 overflow-hidden rounded shadow">
            {coinHistoryError ? (
              <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {coinHistoryError}
              </div>
            ) : null}

            {loadingCoinHistory ? (
              <div className="p-4 text-sm text-gray-600">Loading…</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full table-auto text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="p-3 text-left whitespace-nowrap">Date</th>
                        <th className="p-3 text-left">Type</th>
                        <th className="p-3 text-left whitespace-nowrap">Coins</th>
                        <th
                          className="p-3 pr-4 text-right whitespace-nowrap"
                          style={{ width: '1%' }}
                        >
                          Details
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {visibleCoinTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-gray-600">
                            No coin transactions found.
                          </td>
                        </tr>
                      ) : (
                        visibleCoinTransactions.map((transaction, idx) => {
                          const amountColorClass =
                            transaction.delta > 0
                              ? 'text-green-700'
                              : transaction.delta < 0
                                ? 'text-red-700'
                                : 'text-gray-700'

                          return (
                            <tr
                              key={`${transaction.createdAt}_${transaction.reason}_${idx}`}
                              className="border-t"
                            >
                              <td className="p-3 text-gray-700 whitespace-nowrap">
                                {formatDateTime(transaction.createdAt)}
                              </td>

                              <td className="p-3 font-medium text-gray-800 whitespace-nowrap">
                                <span title={transaction.reason || undefined}>
                                  {titleFromSnake(transaction.reason)}
                                </span>
                              </td>

                              <td className={`p-3 font-semibold whitespace-nowrap ${amountColorClass}`}>
                                {transaction.delta >= 0 ? '+' : ''}
                                {transaction.delta.toLocaleString()} {coinLabel(Math.abs(transaction.delta))}
                              </td>

                              <td
                                className="p-3 pr-4 text-xs text-gray-700 whitespace-nowrap text-right"
                                style={{ width: '1%' }}
                              >
                                <div className="font-medium text-gray-800">{transaction.description}</div>
                                {transaction.packageCode ? (
                                  <div className="mt-0.5 text-gray-500">{transaction.packageCode}</div>
                                ) : null}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="border-t bg-gray-50 p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-gray-600">
                    Showing {coinTransactions.length === 0 ? 0 : (safeCoinHistoryPage - 1) * COIN_HISTORY_PAGE_SIZE + 1}-
                    {Math.min(safeCoinHistoryPage * COIN_HISTORY_PAGE_SIZE, coinTransactions.length)} of{' '}
                    {coinTransactions.length} coin transactions.
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCoinHistoryPage((prev) => Math.max(prev - 1, 1))}
                      disabled={safeCoinHistoryPage <= 1}
                      className={[
                        'px-3 py-2 rounded text-sm shadow',
                        safeCoinHistoryPage <= 1
                          ? 'bg-gray-200 text-gray-500'
                          : 'bg-white hover:bg-gray-100',
                      ].join(' ')}
                    >
                      Previous
                    </button>

                    <div className="text-xs text-gray-600 min-w-[72px] text-center">
                      Page {safeCoinHistoryPage} / {coinHistoryTotalPages}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setCoinHistoryPage((prev) => Math.min(prev + 1, coinHistoryTotalPages))
                      }
                      disabled={safeCoinHistoryPage >= coinHistoryTotalPages}
                      className={[
                        'px-3 py-2 rounded text-sm shadow',
                        safeCoinHistoryPage >= coinHistoryTotalPages
                          ? 'bg-gray-200 text-gray-500'
                          : 'bg-white hover:bg-gray-100',
                      ].join(' ')}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-8 rounded-2xl border border-black/10 bg-white p-5 text-sm text-gray-600">
        <div className="font-semibold text-black">How it works</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Normal gameplay is free and is never locked because of your coin balance.</li>
          <li>Coins are used only for optional coin-priced features and services.</li>
          <li>Purchased coins are added after successful payment confirmation.</li>
          <li>Unused coins remain in your wallet.</li>
        </ul>
      </div>
    </div>
  )
}