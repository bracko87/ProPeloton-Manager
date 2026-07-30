import React, { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

type SavedSearch = {
  id: string
  slot_number: number
  search_name: string
  market_type: string
  criteria_json: Record<string, unknown>
  alerts_enabled: boolean
}

type AlertRow = {
  id: string
  saved_search_id: string
  search_name: string
  target_type: string
  target_id: string
  target_name: string
  alert_type: string
  message: string
  created_at: string
  is_read: boolean
}

type AccessPayload = {
  is_premium: boolean
  saved_search_limit: number
  shortlist_limit: number
}

function normalizeOne<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data
  return row && typeof row === 'object' ? (row as T) : null
}

function getStatusText(access: AccessPayload | null): string {
  if (!access) return 'Checking access'
  return access.is_premium ? 'Premium active' : 'Premium feature'
}

export default function TransferIntelligencePanel({
  clubId,
  marketType,
  currentSearch,
  currentRole,
  currentSort,
  onlyActive,
  hideOwn,
  onApplySavedSearch,
  saveRequestToken,
}: {
  clubId: string
  marketType: 'transfer_list' | 'free_agents' | 'staff'
  currentSearch: string
  currentRole: string
  currentSort: string
  onlyActive: boolean
  hideOwn: boolean
  onApplySavedSearch: (criteria: Record<string, unknown>) => void
  saveRequestToken: number
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [access, setAccess] = useState<AccessPayload | null>(null)
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [searchName, setSearchName] = useState('')
  const [showSaveSearchModal, setShowSaveSearchModal] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)


  async function load(): Promise<void> {
    setError(null)

    const [accessRes, savedRes, alertsRes] = await Promise.all([
      supabase.rpc('transfer_get_intelligence_access_v1', { p_club_id: clubId }),
      supabase.rpc('transfer_list_saved_searches_v1', { p_club_id: clubId }),
      supabase.rpc('transfer_list_market_alerts_v1', {
        p_club_id: clubId,
        p_limit: 20,
      }),
    ])

    if (accessRes.error) throw accessRes.error
    if (savedRes.error) throw savedRes.error
    if (alertsRes.error) throw alertsRes.error

    const nextAccess = normalizeOne<AccessPayload>(accessRes.data)
    const nextSaved = (savedRes.data ?? []) as SavedSearch[]

    setAccess(nextAccess)
    setSavedSearches(nextSaved)
    setAlerts((alertsRes.data ?? []) as AlertRow[])
  }

  useEffect(() => {
    void load().catch(caught => {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Failed to load Transfer Intelligence.',
      )
    })

    const refresh = () => {
      void load()
    }

    window.addEventListener('premium-status-changed', refresh)
    window.addEventListener('coin-balance-changed', refresh)

    return () => {
      window.removeEventListener('premium-status-changed', refresh)
      window.removeEventListener('coin-balance-changed', refresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId])

  useEffect(() => {
    if (saveRequestToken <= 0) return

    if (!access?.is_premium) {
      setExpanded(true)
      setError('Saved searches are available only with Premium.')
      return
    }

    setSearchName('')
    setShowSaveSearchModal(true)
  }, [saveRequestToken, access?.is_premium])

  async function saveSearch(): Promise<void> {
    if (!access?.is_premium) {
      setError('Saved searches are available only with Premium.')
      return
    }

    if (!searchName.trim()) {
      setError('Enter a saved-search name.')
      return
    }

    setBusyKey('save-search')
    setError(null)
    setMessage(null)

    try {
      const criteria = {
        search: currentSearch,
        role: currentRole,
        sort: currentSort,
        only_active: onlyActive,
        hide_own: hideOwn,
      }

      const nextSlot =
        Array.from({ length: access.saved_search_limit }, (_, index) => index + 1)
          .find(slot => !savedSearches.some(row => row.slot_number === slot))

      if (!nextSlot) {
        throw new Error(`Saved-search limit reached (${access.saved_search_limit}).`)
      }

      const { error: rpcError } = await supabase.rpc(
        'transfer_save_market_search_v1',
        {
          p_club_id: clubId,
          p_slot_number: nextSlot,
          p_search_name: searchName.trim(),
          p_market_type: marketType,
          p_criteria_json: criteria,
          p_alerts_enabled: Boolean(access?.is_premium),
        },
      )

      if (rpcError) throw rpcError
      setSearchName('')
      setShowSaveSearchModal(false)
      setMessage(`Search saved in slot ${nextSlot}.`)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to save search.')
    } finally {
      setBusyKey(null)
    }
  }

  async function unlockSearchSlot(slotNumber: number): Promise<void> {
    setBusyKey(`unlock:${slotNumber}`)
    setError(null)
    setMessage(null)

    try {
      const { error: rpcError } = await supabase.rpc(
        'transfer_unlock_saved_search_slot_v1',
        {
          p_club_id: clubId,
          p_slot_number: slotNumber,
        },
      )

      if (rpcError) throw rpcError
      window.dispatchEvent(new CustomEvent('coin-balance-changed'))
      setMessage(`Saved-search slot ${slotNumber} unlocked permanently.`)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to unlock slot.')
    } finally {
      setBusyKey(null)
    }
  }

  async function deleteSearch(searchId: string): Promise<void> {
    setBusyKey(`delete-search:${searchId}`)
    setError(null)

    try {
      const { error: rpcError } = await supabase.rpc(
        'transfer_delete_saved_search_v1',
        { p_saved_search_id: searchId },
      )
      if (rpcError) throw rpcError
      setMessage('Saved search deleted.')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to delete search.')
    } finally {
      setBusyKey(null)
    }
  }


  if (!access?.is_premium) {
    return (
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Transfer Intelligence
              </span>
              <span className="text-xs text-slate-500">Premium feature</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Save real market filters and receive automatic matching alerts.
              The rider shortlist is managed from its own Transfers tab.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.hash = '#/dashboard/pro'
              }
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Unlock with Premium
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <div className="mb-5 rounded-xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Transfer Intelligence
              </span>
              <span className="text-xs text-slate-500">{getStatusText(access)}</span>
            </div>
            <div className="mt-2 text-sm text-slate-600">
              Saved searches and automatic market alerts. Save a search from
              the real market filters below.
            </div>
          </div>

          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
            {expanded ? 'Hide' : 'Open'}
          </span>
        </button>

        {expanded ? (
          <div className="space-y-5 border-t border-slate-100 p-5">
            {message ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {message}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div>
              <section>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">Saved searches</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Premium: up to {access.saved_search_limit} saved searches
                    </p>
                  </div>
                  <div className="text-xs text-slate-500">
                    {savedSearches.length}/{access.saved_search_limit}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {savedSearches.map(search => {
                    const criteria = search.criteria_json ?? {}
                    const searchText =
                      typeof criteria.search === 'string' && criteria.search.trim()
                        ? criteria.search
                        : 'Any rider'
                    const roleText =
                      typeof criteria.role === 'string' && criteria.role !== 'all'
                        ? criteria.role
                        : 'All roles'

                    return (
                      <div
                        key={search.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">
                              {search.search_name}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-slate-500">
                              Search: {searchText} · Role: {roleText} ·{' '}
                              {criteria.only_active !== false
                                ? 'Active only'
                                : 'All statuses'}
                              {criteria.hide_own !== false ? ' · Hide own listings' : ''}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => onApplySavedSearch(search.criteria_json)}
                              className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              Apply
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteSearch(search.id)}
                              disabled={busyKey === `delete-search:${search.id}`}
                              className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {savedSearches.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      Set the real filters below, then click “Save this search”.
                    </div>
                  ) : null}
                </div>
              </section>


            </div>

            <section>
              <h3 className="font-semibold text-slate-900">Market alerts</h3>
              <p className="mt-1 text-xs text-slate-500">
                Every saved search is checked automatically for new matching
                transfer listings and price changes.
              </p>

              <div className="mt-3 space-y-2">
                {alerts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    No market alerts yet.
                  </div>
                ) : (
                  alerts.map(alert => (
                    <div
                      key={alert.id}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2"
                    >
                      <div className="text-sm font-semibold text-blue-900">
                        {alert.target_name}
                      </div>
                      <div className="mt-1 text-xs text-blue-700">
                        {alert.message}
                      </div>
                      <div className="mt-1 text-[11px] text-blue-500">
                        {alert.search_name}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        ) : null}
      </div>

      {showSaveSearchModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              Save current market filters
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              The current search, role, sort and checkbox settings will be saved.
            </p>

            <input
              autoFocus
              type="text"
              maxLength={50}
              value={searchName}
              onChange={event => setSearchName(event.target.value)}
              placeholder="Saved-search name"
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSaveSearchModal(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveSearch()}
                disabled={busyKey === 'save-search'}
                className="rounded-lg bg-yellow-400 px-3 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-50"
              >
                Save search
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
