import React, { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

type ShortlistStatus = {
  is_premium: boolean
  is_shortlisted: boolean
  free_additions_per_day: number
  additions_used_today: number
  free_additions_left_today: number
  next_addition_coin_cost: number
  coin_balance: number
  active_shortlist_count: number
  active_shortlist_limit: number
}

function normalizeOne<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data
  return row && typeof row === 'object' ? (row as T) : null
}

export default function RiderShortlistButton({
  clubId,
  riderId,
  riderName,
  sourceType,
  sourceId,
  compact = true,
  onChanged,
}: {
  clubId: string
  riderId: string
  riderName: string
  sourceType: 'transfer_list' | 'free_agent' | 'external_profile' | 'scouting'
  sourceId?: string | null
  compact?: boolean
  onChanged?: (shortlisted: boolean) => void
}): JSX.Element {
  const [status, setStatus] = useState<ShortlistStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadStatus(): Promise<void> {
    setLoading(true)

    const { data, error: rpcError } = await supabase.rpc(
      'transfer_get_rider_shortlist_status_v2',
      {
        p_club_id: clubId,
        p_rider_id: riderId,
      },
    )

    if (rpcError) {
      setError(rpcError.message)
      setStatus(null)
    } else {
      setError(null)
      setStatus(normalizeOne<ShortlistStatus>(data))
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadStatus()

    const refresh = () => {
      void loadStatus()
    }

    window.addEventListener('premium-status-changed', refresh)
    window.addEventListener('coin-balance-changed', refresh)
    window.addEventListener('transfer-shortlist-changed', refresh)

    return () => {
      window.removeEventListener('premium-status-changed', refresh)
      window.removeEventListener('coin-balance-changed', refresh)
      window.removeEventListener('transfer-shortlist-changed', refresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, riderId])

  async function toggleShortlist(): Promise<void> {
    if (actionLoading) return

    if (!status?.is_premium) {
      if (typeof window !== 'undefined') {
        window.location.hash = '#/dashboard/pro'
      }
      return
    }

    setActionLoading(true)
    setError(null)

    try {
      if (status.is_shortlisted) {
        const { error: rpcError } = await supabase.rpc(
          'transfer_remove_rider_from_shortlist_v2',
          {
            p_club_id: clubId,
            p_rider_id: riderId,
          },
        )
        if (rpcError) throw rpcError
        onChanged?.(false)
      } else {
        const { data, error: rpcError } = await supabase.rpc(
          'transfer_add_rider_to_shortlist_v2',
          {
            p_club_id: clubId,
            p_rider_id: riderId,
            p_rider_name: riderName,
            p_source_type: sourceType,
            p_source_id: sourceId ?? null,
          },
        )
        if (rpcError) throw rpcError

        const result = normalizeOne<{
          coin_charged?: number
          is_shortlisted?: boolean
        }>(data)

        if (Number(result?.coin_charged ?? 0) > 0) {
          window.dispatchEvent(new CustomEvent('coin-balance-changed'))
        }

        onChanged?.(true)
      }

      window.dispatchEvent(new CustomEvent('transfer-shortlist-changed'))
      await loadStatus()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Failed to update the shortlist.',
      )
    } finally {
      setActionLoading(false)
    }
  }

  const nextCost =
    Number(status?.free_additions_left_today ?? 0) > 0
      ? 0
      : Number(status?.next_addition_coin_cost ?? 1)

  const label = !status?.is_premium
    ? '☆ Shortlist 🔒'
    : status.is_shortlisted
      ? '★ Shortlisted'
      : nextCost > 0
        ? `☆ Shortlist · ${nextCost} coin`
        : '☆ Shortlist'

  return (
    <div className={compact ? 'relative inline-flex' : 'relative flex'}>
      <button
        type="button"
        onClick={event => {
          event.stopPropagation()
          void toggleShortlist()
        }}
        disabled={loading || actionLoading}
        title={
          !status?.is_premium
            ? 'Available with Premium'
            : status.is_shortlisted
              ? 'Remove from shortlist'
              : nextCost > 0
                ? `Your two free additions are used. This addition costs ${nextCost} coin.`
                : `${status.free_additions_left_today} free shortlist addition(s) left today.`
        }
        className={[
          compact
            ? 'rounded-md px-3 py-2 text-xs'
            : 'w-full rounded-lg px-4 py-2.5 text-sm',
          'border font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
          status?.is_shortlisted
            ? 'border-yellow-300 bg-yellow-50 text-yellow-900 hover:bg-yellow-100'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        ].join(' ')}
      >
        {actionLoading ? 'Updating…' : label}
      </button>

      {error ? (
        <span className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs text-rose-700 shadow-lg">
          {error}
        </span>
      ) : null}
    </div>
  )
}
