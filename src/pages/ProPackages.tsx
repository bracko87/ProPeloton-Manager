/**
 * ProPackages.tsx
 * Coin packages shop page (DB-driven).
 *
 * FIX:
 * - Remove import.meta.env usage (it is undefined in your production build)
 * - Use Supabase client internal config to get URL + anon key
 * - Use direct fetch() to call Edge Function with explicit headers:
 *   Authorization (user access_token) + apikey (anon key)
 */
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type CoinStatusRow = { balance: number; can_play: boolean }

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

const COINS_PER_DAY = 2

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

/**
 * Safely derive Supabase URL + anon key from the existing client.
 * This avoids import.meta.env which is crashing your production build.
 */
function getSupabaseConfig(): { url: string; anonKey: string } {
  // supabase-js stores config internally; types don't expose it, so we access via "as any"
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
  const [packages, setPackages] = useState<UiCoinPackage[]>([])
  const [loadingPackages, setLoadingPackages] = useState(true)
  const [buyingCode, setBuyingCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const bestValueCode = useMemo(() => {
    if (packages.length === 0) return null
    let best = packages[0]
    for (const p of packages) {
      if (perCoin(p.priceEur, p.coins) < perCoin(best.priceEur, best.coins)) best = p
    }
    return best.code
  }, [packages])

  useEffect(() => {
    let mounted = true

    const loadCoinStatus = async () => {
      setLoadingBalance(true)
      const { data, error } = await supabase.rpc('get_my_coin_status')
      if (!mounted) return
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

    const loadPackages = async () => {
      setLoadingPackages(true)
      const { data, error } = await supabase
        .from('coin_packages')
        .select('code, coins, price_cents, currency, active')
        .eq('active', true)

      if (!mounted) return

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

    void Promise.all([loadCoinStatus(), loadPackages()])

    return () => {
      mounted = false
    }
  }, [])

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

  return (
    <div className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-black">Buy Coins</h2>
          <p className="mt-1 text-sm text-gray-600">
            Coins unlock each in-game day. <span className="font-semibold">1 day = {COINS_PER_DAY} coins</span>.
          </p>
        </div>

        <div className="rounded-xl border border-black/10 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs text-gray-500">Your balance</div>
          <div className="text-lg font-bold text-black">◎ {loadingBalance ? '…' : balance.toLocaleString()} Coins</div>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {loadingPackages ? (
        <div className="mt-6 rounded-xl border border-black/10 bg-white p-6 text-sm text-gray-600">
          Loading packages…
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((p) => {
            const days = Math.floor(p.coins / COINS_PER_DAY)
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
                    <span className="rounded-full bg-yellow-400 px-3 py-1 text-xs font-bold text-black">
                      Best value
                    </span>
                  ) : p.tagline === 'Most popular' ? (
                    <span className="rounded-full bg-black px-3 py-1 text-xs font-bold text-white">
                      Most popular
                    </span>
                  ) : null}
                </div>

                <div className="text-sm font-semibold text-gray-700">Coin Pack</div>
                <div className="mt-1 text-4xl font-extrabold text-black">◎ {p.coins.toLocaleString()}</div>
                <div className="mt-2 text-sm text-gray-600">{p.tagline}</div>

                <div className="mt-5 flex items-end justify-between gap-4">
                  <div>
                    <div className="text-2xl font-extrabold text-black">{eur(p.priceEur)}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      ≈ {eur(perCoin(p.priceEur, p.coins))} per coin
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-semibold text-black">{days.toLocaleString()} days</div>
                    <div className="text-xs text-gray-500">of gameplay</div>
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

      <div className="mt-8 rounded-2xl border border-black/10 bg-white p-5 text-sm text-gray-600">
        <div className="font-semibold text-black">How it works</div>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Coins unlock each in-game day. You need {COINS_PER_DAY} coins to play today.</li>
          <li>Coins are added after payment confirmation (webhook).</li>
          <li>If your balance is below {COINS_PER_DAY}, gameplay is locked until you top up.</li>
        </ul>
      </div>
    </div>
  )
}