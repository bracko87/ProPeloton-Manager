import React, { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { SeasonOverview } from './OverviewTab'

function money(value: number | string | undefined): string {
  const amount = Number(value ?? 0)
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0)
}

/**
 * Read-only past-season finance statements backed by the same authoritative
 * ledger and ownership checks as the current-season Finance overview.
 * No cached browser values, no mutations, and no synthetic balances.
 */
export function FinanceSeasonHistory({
  clubId,
  currentSeason,
}: {
  clubId: string
  currentSeason: number | null
}): JSX.Element {
  const [selected, setSelected] = useState<number | null>(null)
  const [report, setReport] = useState<SeasonOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const seasons = currentSeason && currentSeason > 1
    ? Array.from({ length: currentSeason - 1 }, (_, i) => currentSeason - 1 - i)
    : []

  useEffect(() => {
    setSelected(null)
    setReport(null)
    setError(null)
  }, [clubId, currentSeason])

  useEffect(() => {
    if (selected == null || currentSeason == null || selected >= currentSeason) return
    let live = true
    async function load() {
      setLoading(true)
      setError(null)
      setReport(null)
      const { data, error: fetchError } = await supabase.rpc('finance_get_club_season_history_v1', {
        p_club_id: clubId,
        p_season_number: selected,
      })
      if (!live) return
      if (fetchError || !data || Number(data.season_number) !== selected ||
          !Array.isArray(data.monthly) || !Array.isArray(data.breakdown)) {
        setError('Historical finance data could not be verified for this season.')
      } else {
        setReport(data as SeasonOverview)
      }
      setLoading(false)
    }
    void load()
    return () => { live = false }
  }, [clubId, selected, currentSeason])

  if (seasons.length === 0) return <></>

  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Previous seasons — financial history</h3>
          <p className="mt-1 text-xs text-slate-600">View recorded income and expenses from earlier game seasons. Your current cash balance is unchanged.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {seasons.map(season => (
            <button type="button" key={season} onClick={() => setSelected(season === selected ? null : season)}
              aria-pressed={season === selected}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold ${season === selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
              Season {season}
            </button>
          ))}
        </div>
      </div>
      {selected != null && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {loading && <p className="text-sm text-slate-600">Loading Season {selected} financial history…</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {report && !loading && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {([
                  ['Season income', report.income],
                  ['Season expenses', report.expenses],
                  ['Operating net', report.net],
                ] as Array<[string, number | string]>).map(([label, amount]) => (
                  <div key={label} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-600">{label}</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{money(amount)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Month</th>
                    <th className="py-2 pr-3 text-right font-semibold">Income</th>
                    <th className="py-2 pr-3 text-right font-semibold">Expenses</th>
                    <th className="py-2 text-right font-semibold">Net</th>
                  </tr></thead>
                  <tbody>
                    {report.monthly.map(month => (
                      <tr key={month.month} className="border-b border-slate-100">
                        <td className="py-2 pr-3">{new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, Number(month.month) - 1, 1)))}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{money(month.income)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{money(month.expenses)}</td>
                        <td className="py-2 text-right tabular-nums">{money(month.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
