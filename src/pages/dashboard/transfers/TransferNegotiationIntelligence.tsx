import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'

type ComparisonPayload = {
  club_id: string
  rider_id: string
  role_count: number
  overall_rank: number | null
  salary_rank: number | null
  would_be_highest_paid_in_role: boolean
  role_duplication_warning: boolean
}

type ReportAccessPayload = {
  has_access: boolean
  access_source: 'premium' | 'none'
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

function scoreLabel(value: number | null | undefined): string {
  const score = Number(value ?? 0)
  if (score >= 80) return 'Strong'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Average'
  if (score >= 20) return 'Weak'
  return 'Very weak'
}

function normalizeOne<T>(value: unknown): T | null {
  const row = Array.isArray(value) ? value[0] : value
  return row && typeof row === 'object' ? (row as T) : null
}

export default function TransferNegotiationIntelligence({
  riderId,
  accessKey,
  transferFee,
  weeklySalary,
  contractSeasons,
  signingBonus,
  agentFee,
  riderRole,
  salaryScore,
  durationScore,
  bonusScore,
  feeScore,
  tierScore,
}: {
  riderId: string | null
  accessKey: string
  transferFee: number
  weeklySalary: number
  contractSeasons: number
  signingBonus: number
  agentFee: number
  riderRole?: string | null
  salaryScore?: number | null
  durationScore?: number | null
  bonusScore?: number | null
  feeScore?: number | null
  tierScore?: number | null
}): JSX.Element {
  const [access, setAccess] = useState<ReportAccessPayload | null>(null)
  const [comparison, setComparison] = useState<ComparisonPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const firstSeasonSalary = Math.max(0, weeklySalary) * 52
  const totalFirstSeasonCommitment =
    Math.max(0, transferFee) +
    Math.max(0, signingBonus) +
    Math.max(0, agentFee) +
    firstSeasonSalary
  const totalContractSalary =
    firstSeasonSalary * Math.max(1, contractSeasons || 1)

  async function load(): Promise<void> {
    if (!riderId || !accessKey) {
      setAccess(null)
      setComparison(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [accessRes, comparisonRes] = await Promise.all([
      supabase.rpc('transfer_get_financial_report_access_v1', {
        p_access_key: accessKey,
      }),
      supabase.rpc('transfer_get_target_comparison_v1', {
        p_rider_id: riderId,
      }),
    ])

    if (accessRes.error) throw accessRes.error
    if (comparisonRes.error) {
      console.warn('Transfer comparison unavailable:', comparisonRes.error.message)
    }

    setAccess(normalizeOne<ReportAccessPayload>(accessRes.data))
    setComparison(normalizeOne<ComparisonPayload>(comparisonRes.data))
    setLoading(false)
  }

  useEffect(() => {
    void load().catch(caught => {
      setLoading(false)
      setError(
        caught instanceof Error
          ? caught.message
          : 'Failed to load Transfer Intelligence.',
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riderId, accessKey])

  async function purchaseReport(): Promise<void> {
    if (!riderId || !accessKey) return

    setPurchaseLoading(true)
    setError(null)

    try {
      const { error: rpcError } = await supabase.rpc(
        'transfer_purchase_financial_report_v1',
        {
          p_access_key: accessKey,
          p_rider_id: riderId,
        },
      )
      if (rpcError) throw rpcError
      window.dispatchEvent(new CustomEvent('coin-balance-changed'))
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to unlock report.')
    } finally {
      setPurchaseLoading(false)
    }
  }

  const hasAccess = access?.has_access === true

  if (loading) {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        Loading Transfer Intelligence…
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Transfer Intelligence
            </span>
            <span className="text-xs text-slate-500">
              Premium analysis
            </span>
          </div>
          <div className="mt-2 text-sm text-slate-600">
            Financial commitment, squad fit and a structured explanation of the
            current offer. This does not improve acceptance chances.
          </div>
        </div>
        {!hasAccess ? (
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.hash = '#/dashboard/pro'
              }
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Unlock with Premium
          </button>
        ) : (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            Included with Premium
          </span>
        )}
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}
      {!hasAccess ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Available only with Premium. The basic negotiation outlook remains
          available to every user.
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                First-season salary
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatMoney(firstSeasonSalary)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Up-front commitment
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatMoney(transferFee + signingBonus + agentFee)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                First-season total
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatMoney(totalFirstSeasonCommitment)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Contract salary
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatMoney(totalContractSalary)}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-900">
                Squad-fit comparison
              </div>
              <div className="mt-2 space-y-1.5 text-xs text-slate-600">
                <div>
                  Role: <span className="font-semibold">{riderRole || 'Unknown'}</span>
                </div>
                <div>
                  Existing riders in role:{' '}
                  <span className="font-semibold">
                    {comparison?.role_count ?? '—'}
                  </span>
                </div>
                <div>
                  Projected overall rank in squad:{' '}
                  <span className="font-semibold">
                    {comparison?.overall_rank
                      ? `#${comparison.overall_rank}`
                      : 'Unavailable'}
                  </span>
                </div>
                <div>
                  Projected salary rank:{' '}
                  <span className="font-semibold">
                    {comparison?.salary_rank
                      ? `#${comparison.salary_rank}`
                      : 'Unavailable'}
                  </span>
                </div>
                {comparison?.role_duplication_warning ? (
                  <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-700">
                    Squad already has several riders in this role.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-900">
                Offer-factor explanation
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {[
                  ['Salary', salaryScore],
                  ['Duration', durationScore],
                  ['Signing bonus', bonusScore],
                  ['Agent fee', feeScore],
                  ['Club level', tierScore],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded border border-slate-200 bg-white px-2 py-1.5"
                  >
                    <div className="text-slate-500">{label}</div>
                    <div className="mt-0.5 font-semibold text-slate-800">
                      {scoreLabel(value as number | null | undefined)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] leading-5 text-slate-500">
                Labels summarize the preview already available to the negotiation
                engine. Exact hidden thresholds and minimum acceptance values are
                not revealed.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
