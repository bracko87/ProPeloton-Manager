import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../../lib/supabase'

type ScoutIntelligencePayload = {
  has_scout_report: boolean
  precision_score: number | null
  precision_tier: string | null
  overall_label: string | null
  potential_label: string | null
  analyst_staff_id: string | null
  analyst_name: string | null
  analyst_quality: number | null
  analysis_confidence_pct: number | null
  analysis_confidence_label: string | null
}

type ComparisonPayload = {
  club_id: string
  rider_id: string
  role_count: number
  overall_rank: number | null
  salary_rank: number | null
  would_be_highest_paid_in_role: boolean
  role_duplication_warning: boolean
  scout_intelligence?: ScoutIntelligencePayload | null
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

function scoreLabel(value: number | null | undefined, t: (key: string) => string): string {
  const score = Number(value ?? 0)
  if (score >= 80) return t('negotiationIntel.strong')
  if (score >= 60) return t('negotiationIntel.good')
  if (score >= 40) return t('negotiationIntel.average')
  if (score >= 20) return t('negotiationIntel.weak')
  return t('negotiationIntel.veryWeak')
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
  const { t, i18n } = useTranslation('transfers')
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
          : t('negotiationIntel.loadFailed'),
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riderId, accessKey])


  const hasAccess = access?.has_access === true

  if (loading) {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        {t('negotiationIntel.loading')}
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              {t('negotiationIntel.title')}
            </span>
            <span className="text-xs text-slate-500">
              {t('negotiationIntel.premiumAnalysis')}
            </span>
          </div>
          <div className="mt-2 text-sm text-slate-600">
            {t('negotiationIntel.description')}
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
            {t('common.unlockPremium')}
          </button>
        ) : (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            {t('common.includedPremium')}
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
          {t('negotiationIntel.premiumOnly')}
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                {t('negotiationIntel.firstSeasonSalary')}
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatMoney(firstSeasonSalary)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                {t('negotiationIntel.upfrontCommitment')}
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatMoney(transferFee + signingBonus + agentFee)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                {t('negotiationIntel.firstSeasonTotal')}
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatMoney(totalFirstSeasonCommitment)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                {t('negotiationIntel.contractSalary')}
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatMoney(totalContractSalary)}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-900">
                {t('negotiationIntel.squadFit')}
              </div>
              <div className="mt-2 space-y-1.5 text-xs text-slate-600">
                <div>
                  {t('negotiationIntel.role')}: <span className="font-semibold">{riderRole
                      ? i18n.exists(`premiumCenter:values.${riderRole.toLowerCase().trim().replace(/[\s-]+/g, '_')}`)
                        ? i18n.t(`premiumCenter:values.${riderRole.toLowerCase().trim().replace(/[\s-]+/g, '_')}`)
                        : riderRole
                      : t('common.unknown')}</span>
                </div>
                <div>
                  {t('negotiationIntel.existingRiders')}:{' '}
                  <span className="font-semibold">
                    {comparison?.role_count ?? '—'}
                  </span>
                </div>
                <div>
                  {t('negotiationIntel.overallRank')}:{' '}
                  <span className="font-semibold">
                    {comparison?.overall_rank
                      ? `#${comparison.overall_rank}`
                      : t('common.unavailable')}
                  </span>
                </div>
                <div>
                  {t('negotiationIntel.salaryRank')}:{' '}
                  <span className="font-semibold">
                    {comparison?.salary_rank
                      ? `#${comparison.salary_rank}`
                      : t('common.unavailable')}
                  </span>
                </div>
                {comparison?.role_duplication_warning ? (
                  <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-700">
                    {t('negotiationIntel.roleDuplication')}
                  </div>
                ) : null}
                <div className="mt-2 border-t border-slate-200 pt-2">
                  {t('negotiationIntel.confidence')}:{' '}
                  <span className="font-semibold capitalize">
                    {t(`negotiationIntel.confidenceLevels.${String(comparison?.scout_intelligence?.analysis_confidence_label || 'limited').toLowerCase().replace(/\s+/g, '')}`, { defaultValue: comparison?.scout_intelligence?.analysis_confidence_label || t('negotiationIntel.confidenceLevels.limited') })}
                  </span>
                  {comparison?.scout_intelligence?.analysis_confidence_pct != null
                    ? ' (' + Math.round(comparison.scout_intelligence.analysis_confidence_pct) + '%)'
                    : ''}
                </div>
                {comparison?.scout_intelligence?.analyst_name ? (
                  <div>
                    {t('negotiationIntel.analyst')}:{' '}
                    <span className="font-semibold">
                      {comparison.scout_intelligence.analyst_name}
                    </span>
                  </div>
                ) : null}
                {comparison?.scout_intelligence?.has_scout_report ? (
                  <>
                    <div>
                      {t('negotiationIntel.scoutedOverall')}:{' '}
                      <span className="font-semibold">
                        {comparison.scout_intelligence.overall_label ?? '—'}
                      </span>
                    </div>
                    <div>
                      {t('negotiationIntel.scoutedPotential')}:{' '}
                      <span className="font-semibold">
                        {comparison.scout_intelligence.potential_label ?? '—'}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-slate-500">
                    {t('negotiationIntel.noScoutReport')}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-900">
                {t('negotiationIntel.offerFactors')}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {[
                  [t('negotiationIntel.salary'), salaryScore],
                  [t('negotiationIntel.duration'), durationScore],
                  [t('negotiationIntel.signingBonus'), bonusScore],
                  [t('negotiationIntel.agentFee'), feeScore],
                  [t('negotiationIntel.clubLevel'), tierScore],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded border border-slate-200 bg-white px-2 py-1.5"
                  >
                    <div className="text-slate-500">{label}</div>
                    <div className="mt-0.5 font-semibold text-slate-800">
                      {scoreLabel(value as number | null | undefined, t)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] leading-5 text-slate-500">
                {t('negotiationIntel.previewNote')}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
