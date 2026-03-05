/**
 * SponsorsTab.tsx
 * Shows the main sponsor (if the table exists) or a friendly placeholder.
 *
 * Behavior:
 * - Queries public.club_sponsors for is_main = true.
 * - If the table is missing (PGRST205), shows a non-fatal placeholder.
 */

import React, { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * SponsorRow
 * Shape of sponsor records used in this tab.
 */
type SponsorRow = {
  id: string
  club_id: string
  name: string
  monthly_amount: string | number
  status: string
  is_main: boolean
  started_at: string | null
  ends_at: string | null
  created_at?: string
}

/**
 * toNumber
 * Safely coerce values to a finite number.
 */
function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * formatMoney
 * Format a number as a currency string.
 */
function formatMoney(n: number, currency: 'EUR' | 'USD' = 'EUR'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

/**
 * SponsorsTab
 * Displays the main club sponsor or a placeholder if none exists.
 */
export function SponsorsTab({ clubId, currency = 'EUR' }: { clubId: string; currency?: 'EUR' | 'USD' }): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [mainSponsor, setMainSponsor] = useState<SponsorRow | null>(null)

  useEffect(() => {
    let mounted = true

    ;(async () => {
      setLoading(true)

      const res = await supabase
        .from('club_sponsors')
        .select('id,club_id,name,monthly_amount,status,is_main,started_at,ends_at,created_at')
        .eq('club_id', clubId)
        .eq('is_main', true)
        .order('created_at', { ascending: false })
        .limit(1)

      if (!mounted) return

      if (res.error) {
        // If table does not exist or schema cache issue: do not crash, show placeholder.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const code = (res.error as any).code
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg = (res.error as any).message ?? ''
        if (code === 'PGRST205' || msg.includes('Could not find the table') || msg.includes('schema cache')) {
          setMainSponsor(null)
          setLoading(false)
          return
        }
        setMainSponsor(null)
        setLoading(false)
        return
      }

      setMainSponsor((res.data?.[0] as SponsorRow) ?? null)
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [clubId])

  return (
    <div className="bg-white p-4 rounded shadow">
      <h4 className="font-semibold">Main Sponsor</h4>
      <div className="text-sm text-gray-500 mt-1">For now, only one main sponsor is shown here.</div>

      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-gray-600">Loading…</div>
        ) : mainSponsor ? (
          <div className="border rounded p-4">
            <div className="text-lg font-semibold">{mainSponsor.name}</div>
            <div className="text-sm text-gray-600 mt-1">
              Status: <span className="font-semibold">{mainSponsor.status}</span>
            </div>
            <div className="text-sm text-gray-600">
              Monthly:{' '}
              <span className="font-semibold">{formatMoney(toNumber(mainSponsor.monthly_amount), currency)}</span>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              {mainSponsor.started_at ? `Start: ${mainSponsor.started_at}` : ''}
              {mainSponsor.ends_at ? ` · End: ${mainSponsor.ends_at}` : ''}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-600">No main sponsor yet.</div>
        )}
      </div>
    </div>
  )
}
