import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { supabase } from '../../../lib/supabase'
import RiderShortlistButton from './RiderShortlistButton'

type ShortlistAccess = {
  is_premium: boolean
  free_additions_per_day: number
  additions_used_today: number
  free_additions_left_today: number
  next_addition_coin_cost: number
  coin_balance: number
  active_shortlist_count: number
  active_shortlist_limit: number
}

type ShortlistRider = {
  shortlist_id: string
  rider_id: string
  rider_name: string
  country_code: string | null
  role: string | null
  age_years: number | null
  overall_label: string | null
  potential_label: string | null
  current_club_id: string | null
  current_club_name: string | null
  source_type: string
  source_id: string | null
  notes: string | null
  added_at: string
  availability_type: 'transfer_list' | 'free_agent' | 'not_available'
  listing_id: string | null
  transfer_price: number | null
  expected_salary_weekly: number | null
  expires_on_game_date: string | null
  availability_label: string
  is_scouted: boolean
}

function normalizeOne<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data
  return row && typeof row === 'object' ? (row as T) : null
}

function formatMoney(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function getFlagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w40/${normalized}.png`
    : null
}

export default function TransferShortlistPage({
  clubId,
  onOpenTransferOffer,
  onOpenFreeAgentNegotiation,
}: {
  clubId: string
  onOpenTransferOffer: (listingId: string, riderId: string) => void
  onOpenFreeAgentNegotiation: (freeAgentId: string, riderId: string) => void
}): JSX.Element {
  const navigate = useNavigate()
  const { t } = useTranslation('transfers')
  const [access, setAccess] = useState<ShortlistAccess | null>(null)
  const [rows, setRows] = useState<ShortlistRider[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [availabilityFilter, setAvailabilityFilter] = useState<
    'all' | 'transfer_list' | 'free_agent' | 'not_available'
  >('all')
  const [error, setError] = useState<string | null>(null)

  async function load(): Promise<void> {
    setLoading(true)
    setError(null)

    const [accessRes, rowsRes] = await Promise.all([
      supabase.rpc('transfer_get_shortlist_access_v2', {
        p_club_id: clubId,
      }),
      supabase.rpc('transfer_list_rider_shortlist_v2', {
        p_club_id: clubId,
      }),
    ])

    if (accessRes.error) throw accessRes.error
    if (rowsRes.error) throw rowsRes.error

    setAccess(normalizeOne<ShortlistAccess>(accessRes.data))
    setRows((rowsRes.data ?? []) as ShortlistRider[])
    setLoading(false)
  }

  useEffect(() => {
    void load().catch(caught => {
      setLoading(false)
      setError(
        caught instanceof Error ? caught.message : 'Failed to load shortlist.',
      )
    })

    const refresh = () => {
      void load()
    }

    window.addEventListener('transfer-shortlist-changed', refresh)
    window.addEventListener('premium-status-changed', refresh)

    return () => {
      window.removeEventListener('transfer-shortlist-changed', refresh)
      window.removeEventListener('premium-status-changed', refresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()

    return rows.filter(row => {
      if (
        availabilityFilter !== 'all' &&
        row.availability_type !== availabilityFilter
      ) {
        return false
      }

      if (!query) return true

      return [
        row.rider_name,
        row.role,
        row.current_club_name,
        row.country_code,
      ]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query))
    })
  }, [rows, search, availabilityFilter])

  if (!access?.is_premium && !loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="max-w-2xl">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            {t('common.premium')}
          </span>
          <h2 className="mt-3 text-xl font-semibold text-slate-900">
            {t('shortlist.title')}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t('shortlist.premiumDescription')}
          </p>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.hash = '#/dashboard/pro'
              }
            }}
            className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            {t('common.unlockPremium')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {t('shortlist.title')}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {t('shortlist.description')}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <div>
            {t('shortlist.active')}{' '}
            <strong>{access?.active_shortlist_count ?? rows.length}</strong>/
            {access?.active_shortlist_limit ?? 50}
          </div>
          <div className="mt-1">
            {t('shortlist.freeLeft')}{' '}
            <strong>{access?.free_additions_left_today ?? 0}</strong>/2
          </div>
          <div className="mt-1">
            {t('shortlist.later')}{' '}
            <strong>{t('shortlist.oneCoinEach')}</strong>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_220px]">
        <input
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder={t('shortlist.searchPlaceholder')}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={availabilityFilter}
          onChange={event =>
            setAvailabilityFilter(
              event.target.value as
                | 'all'
                | 'transfer_list'
                | 'free_agent'
                | 'not_available',
            )
          }
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">{t('shortlist.allAvailability')}</option>
          <option value="transfer_list">{t('shortlist.transferListed')}</option>
          <option value="free_agent">{t('shortlist.freeAgents')}</option>
          <option value="not_available">{t('shortlist.notAvailable')}</option>
        </select>
      </div>

      <div className="mt-5 space-y-3">
        {loading ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            {t('shortlist.loading')}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            {t('shortlist.empty')}
          </div>
        ) : (
          filteredRows.map(row => {
            const flagUrl = getFlagUrl(row.country_code)
            const availabilityLabel =
              row.availability_type === 'transfer_list'
                ? t('shortlist.transferListed')
                : row.availability_type === 'free_agent'
                  ? t('shortlist.freeAgent')
                  : t('shortlist.notAvailable')

            return (
              <div
                key={row.shortlist_id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {flagUrl ? (
                        <img
                          src={flagUrl}
                          alt={row.country_code ?? ''}
                          className="h-4 w-6 rounded-sm border border-slate-200 object-cover"
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/dashboard/external-riders/${row.rider_id}`)
                        }
                        className="truncate text-left font-semibold text-slate-900 hover:underline"
                      >
                        {row.rider_name}
                      </button>
                      {row.is_scouted ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          {t('common.scouted')}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>
                        <strong className="text-slate-900">
                          {t('shortlist.role')}
                        </strong>{' '}
                        {row.role ?? '—'}
                      </span>
                      <span>
                        <strong className="text-slate-900">
                          {t('shortlist.ovr')}
                        </strong>{' '}
                        {row.overall_label ?? '—'}
                      </span>
                      <span>
                        <strong className="text-slate-900">
                          {t('shortlist.age')}
                        </strong>{' '}
                        {row.age_years ?? '—'}
                      </span>
                      <span>
                        <strong className="text-slate-900">
                          {t('shortlist.team')}
                        </strong>{' '}
                        {row.current_club_name ?? t('shortlist.freeAgent')}
                      </span>
                    </div>

                    {row.notes ? (
                      <div className="mt-2 text-xs text-slate-500">
                        {t('shortlist.note', { note: row.notes })}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        'rounded-md px-3 py-2 text-xs font-semibold',
                        row.availability_type === 'transfer_list'
                          ? 'bg-green-50 text-green-800'
                          : row.availability_type === 'free_agent'
                            ? 'bg-blue-50 text-blue-800'
                            : 'bg-slate-100 text-slate-600',
                      ].join(' ')}
                    >
                      {availabilityLabel}
                    </span>

                    {row.availability_type === 'transfer_list' ? (
                      <span className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-xs font-semibold text-slate-900">
                        {t('shortlist.transferPrice', {
                          price: formatMoney(row.transfer_price),
                        })}
                      </span>
                    ) : row.availability_type === 'free_agent' ? (
                      <span className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-slate-900">
                        {t('shortlist.salary', {
                          salary: formatMoney(row.expected_salary_weekly),
                        })}
                      </span>
                    ) : null}

                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/dashboard/external-riders/${row.rider_id}`)
                      }
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {t('shortlist.openProfile')}
                    </button>

                    {row.availability_type === 'transfer_list' && row.listing_id ? (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenTransferOffer(row.listing_id!, row.rider_id)
                        }
                        className="rounded-md bg-yellow-400 px-3 py-2 text-xs font-semibold text-black hover:bg-yellow-300"
                      >
                        {t('shortlist.makeOffer')}
                      </button>
                    ) : row.availability_type === 'free_agent' && row.source_id ? (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenFreeAgentNegotiation(row.source_id!, row.rider_id)
                        }
                        className="rounded-md bg-yellow-400 px-3 py-2 text-xs font-semibold text-black hover:bg-yellow-300"
                      >
                        {t('shortlist.startNegotiation')}
                      </button>
                    ) : null}

                    <RiderShortlistButton
                      clubId={clubId}
                      riderId={row.rider_id}
                      riderName={row.rider_name}
                      sourceType="external_profile"
                      compact
                    />
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
