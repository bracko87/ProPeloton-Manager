/**
 * CPX Research rewarded-survey window.
 * No survey or third-party request begins until the player opts in.
 * The user-specific secure link is minted by an authenticated Edge Function.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Coins, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'

type RewardSummary = {
  total_coins: number
  active_usd: number
  pending_coin_fraction: number
  recent: Array<{
    trans_id: string
    reward_type: string
    amount_usd: number
    status: number
    created_at: string
  }>
}

type Labels = {
  title: string; subtitle: string; start: string; loading: string
  close: string; earned: string; retained: string; rate: string
  note: string; refresh: string; privacy: string; history: string
  empty: string; completed: string; canceled: string; openTab: string
  error: string; retry: string; status: string
}

const english: Labels = {
  title: 'Earn Free Coins', subtitle: 'Complete optional surveys with CPX Research.',
  start: 'Browse Surveys', loading: 'Connecting to surveys…', close: 'Close',
  earned: 'Net survey Coins', retained: 'Fractional Coins saved', rate: '$1 earned = 15 Coins',
  note: 'CPX displays Reward Points (100 points = 15 Coins). Rewards arrive after confirmation; canceled rewards may be reversed.',
  refresh: 'Refresh rewards', privacy: 'Opening surveys shares your game account identifier and connection data with CPX Research. Participation is optional.',
  history: 'Recent survey activity', empty: 'No survey activity yet.',
  completed: 'Completed', canceled: 'Reversed', openTab: 'Open surveys in new tab',
  error: 'Surveys could not be opened. Please try again later.', retry: 'Try again',
  status: 'Survey',
}

const german: Labels = {
  ...english, title: 'Gratis-Coins verdienen', subtitle: 'Freiwillige Umfragen von CPX Research ausfüllen.',
  start: 'Umfragen öffnen', loading: 'Umfragen werden geladen…', close: 'Schließen',
  earned: 'Netto-Umfrage-Coins', retained: 'Gespeicherter Coin-Rest',
  rate: '1 $ Verdienst = 15 Coins',
  note: 'CPX zeigt Reward Points an (100 Punkte = 15 Coins). Coins werden nach Bestätigung gutgeschrieben; Stornierungen werden abgezogen.',
  refresh: 'Belohnungen aktualisieren',
  privacy: 'Beim Öffnen werden deine Spielkonto-ID und Verbindungsdaten an CPX Research übertragen. Die Teilnahme ist freiwillig.',
  history: 'Letzte Umfragen', empty: 'Noch keine Umfragen.',
  completed: 'Abgeschlossen', canceled: 'Storniert',
  openTab: 'Umfragen in neuem Tab öffnen', error: 'Umfragen sind momentan nicht verfügbar.',
  retry: 'Erneut versuchen', status: 'Umfrage',
}

const serbian: Labels = {
  ...english, title: 'Zaradi besplatne Coins', subtitle: 'Popuni dobrovoljne CPX Research ankete.',
  start: 'Otvori ankete', loading: 'Povezivanje…', close: 'Zatvori',
  earned: 'Neto Coins od anketa', retained: 'Sačuvani delovi Coin-a',
  rate: '1 $ zarade = 15 Coins',
  note: 'CPX prikazuje Reward Points (100 poena = 15 Coins). Nagrade stižu nakon potvrde, a poništene mogu biti oduzete.',
  refresh: 'Osveži nagrade', history: 'Poslednje ankete',
  empty: 'Nema anketa.', completed: 'Završeno', canceled: 'Poništeno',
  openTab: 'Otvori ankete u novoj kartici', retry: 'Pokušaj ponovo',
  error: 'Ankete trenutno nisu dostupne.',
}

function useCopy(): Labels {
  const { i18n } = useTranslation()
  const language = (i18n.resolvedLanguage ?? i18n.language ?? 'en').toLowerCase()
  if (language.startsWith('de')) return german
  if (language.startsWith('sr') || language.startsWith('hr')) return serbian
  return english
}

export function useEarnCoinsLabel(): string {
  return useCopy().title
}

export default function EarnCoinsDialog({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const copy = useCopy()
  const [offerUrl, setOfferUrl] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<RewardSummary | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Header and Packages provide inline close handlers. Keep the latest handler
  // without restarting the open effect (and re-fetching rewards) on every
  // parent rerender or wallet balance update.
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const { data, error: queryError } = await supabase.rpc('get_my_cpx_reward_summary_v1')
      if (queryError) throw queryError
      setSummary((data ?? null) as RewardSummary | null)
      window.dispatchEvent(new Event('coin-balance-changed'))
    } catch (refreshError) {
      console.warn('Could not refresh CPX rewards', refreshError)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setOfferUrl(null)
      setError(null)
      return
    }
    void refresh()
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open, refresh])

  async function openSurveys() {
    setStarting(true)
    setError(null)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Not authenticated')
      }
      const { data, error: invokeError } = await supabase.functions.invoke(
        'cpx-offerwall-link', { body: {} },
      )
      if (invokeError || typeof data?.url !== 'string') {
        throw invokeError ?? new Error('Missing provider link')
      }
      // Only allow the CPX HTTPS offerwall to be shown or opened.
      const url = new URL(data.url)
      if (url.protocol !== 'https:' || url.hostname !== 'offers.cpx-research.com') {
        throw new Error('Unexpected survey domain')
      }
      setOfferUrl(url.toString())
    } catch (openError) {
      console.warn('CPX offerwall could not be opened', openError)
      setError(copy.error)
    } finally {
      setStarting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/65 p-2 sm:p-5" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="cpx-earn-coins-title" className="flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
          <div className="min-w-0">
            <h2 id="cpx-earn-coins-title" className="flex items-center gap-2 text-xl font-bold text-slate-950">
              <Coins className="h-6 w-6 text-amber-600" /> {copy.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{copy.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={copy.close} className="rounded-lg p-2 text-slate-700 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-950">{copy.rate}</div>
            <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-800">
              {copy.earned}: <strong>{summary?.total_coins ?? '—'}</strong>
            </div>
            <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-800">
              {copy.retained}: <strong>{summary ? summary.pending_coin_fraction.toFixed(2) : '—'}</strong>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-600">{copy.note}</p>

          {!offerUrl ? (
            <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-700">{copy.privacy}</p>
              {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
              <button type="button" onClick={() => void openSurveys()} disabled={starting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 py-3 font-semibold text-black hover:bg-amber-300 disabled:opacity-60 sm:w-auto">
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins size={18} />}
                {starting ? copy.loading : error ? copy.retry : copy.start}
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <a href={offerUrl} target="_blank" rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 underline">
                  <ExternalLink size={16} /> {copy.openTab}
                </a>
                <button type="button" onClick={() => void refresh()} disabled={refreshing}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 disabled:opacity-50">
                  <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> {copy.refresh}
                </button>
              </div>
              <iframe key={offerUrl} title="CPX Research surveys" src={offerUrl} loading="lazy"
                referrerPolicy="no-referrer" allow="clipboard-read; clipboard-write"
                className="h-[min(62dvh,660px)] min-h-[360px] w-full rounded-xl border border-slate-200 bg-white" />
            </div>
          )}

          {summary?.recent?.length ? (
            <section className="mt-5 border-t border-slate-200 pt-4">
              <h3 className="mb-2 text-sm font-semibold">{copy.history}</h3>
              <div className="space-y-2">
                {summary.recent.map(item => (
                  <div key={item.trans_id} className="flex justify-between gap-3 text-xs text-slate-700">
                    <span>{copy.status} · {new Date(item.created_at).toLocaleDateString()}</span>
                    <span className={item.status === 2 ? 'text-red-700' : 'text-green-700'}>
                      {item.status === 2 ? copy.canceled : copy.completed}
                      {' · $'}{Number(item.amount_usd).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <p className="mt-5 text-xs text-slate-500">{copy.empty}</p>
          )}
        </div>
      </div>
    </div>
  )
}
