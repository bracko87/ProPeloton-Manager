/**
 * ScoutingPage.tsx
 * Dashboard page showing an overview of scout reports in one place.
 *
 * Route intent:
 * - Intended for /dashboard/scouting (nested under the main ClubDashboard layout).
 *
 * Features:
 * - Filter: All / New / Reviewed.
 * - Columns: Rider name, scout name, date completed, overall, potential, key strengths, notes.
 * - Action: "Open rider profile" button linking to the rider profile routes.
 * - Back button returning to the previous page.
 *
 * Data:
 * - Loads real scout reports from Supabase table rider_scout_reports.
 * - Uses real rider_id UUIDs so profile links do not break with invalid IDs like "101".
 * - Builds rider name, scout name, scores, strengths, and notes from joined rider/staff data and report_json.
 * - Uses review_status so reports can move from New to Reviewed.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { formatGameDate, resolveGameDate } from './finance/gameDate'

type ScoutingReportStatus = 'new' | 'reviewed'
type RiderProfileScope = 'own' | 'external' | 'public'

type PotentialTranslationKey =
  | 'potential.veryLow'
  | 'potential.low'
  | 'potential.medium'
  | 'potential.high'
  | 'potential.elite'

type SkillTranslationKey =
  | 'skills.sprint'
  | 'skills.climbing'
  | 'skills.timeTrial'
  | 'skills.endurance'
  | 'skills.flat'
  | 'skills.recovery'
  | 'skills.resistance'
  | 'skills.raceIq'
  | 'skills.teamwork'
  | 'skills.morale'

type FilterTranslationKey =
  | 'filters.all'
  | 'filters.new'
  | 'filters.reviewed'

type ScoutingErrorKey =
  | 'page.loadFailed'
  | 'page.reviewFailed'

interface ScoutingStrength {
  translationKey: SkillTranslationKey | null
  fallback: string
}

interface ScoutingReport {
  id: string
  riderId: string
  riderName: string | null
  riderCountryCode?: string | null
  scoutName: string | null
  completedAt?: string | null
  overall: string
  potential: PotentialTranslationKey | null
  strengths: ScoutingStrength[]
  notes?: string | null
  status: ScoutingReportStatus
  profileScope: RiderProfileScope
}

type FilterKey = 'all' | 'new' | 'reviewed'

const FILTERS: {
  key: FilterKey
  labelKey: FilterTranslationKey
}[] = [
  { key: 'all', labelKey: 'filters.all' },
  { key: 'new', labelKey: 'filters.new' },
  { key: 'reviewed', labelKey: 'filters.reviewed' },
]

const SKILL_LABEL_KEYS: Partial<Record<string, SkillTranslationKey>> = {
  sprint: 'skills.sprint',
  climbing: 'skills.climbing',
  time_trial: 'skills.timeTrial',
  endurance: 'skills.endurance',
  flat: 'skills.flat',
  recovery: 'skills.recovery',
  resistance: 'skills.resistance',
  race_iq: 'skills.raceIq',
  teamwork: 'skills.teamwork',
  morale: 'skills.morale',
}

const REPORTS_PER_PAGE = 10

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

function getStatusLabel(status: ScoutingReportStatus): FilterTranslationKey {
  switch (status) {
    case 'new':
      return 'filters.new'
    case 'reviewed':
      return 'filters.reviewed'
  }
}

function getStatusToneClasses(status: ScoutingReportStatus): string {
  switch (status) {
    case 'new':
      return 'bg-yellow-50 text-yellow-800 border-yellow-200'
    case 'reviewed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200'
  }
}

function getRiderProfileHref(report: ScoutingReport): string {
  if (report.profileScope === 'own') {
    return `#/dashboard/my-riders/${encodeURIComponent(report.riderId)}`
  }

  if (report.profileScope === 'external') {
    return `#/dashboard/external-riders/${encodeURIComponent(report.riderId)}`
  }

  return `#/dashboard/riders/${encodeURIComponent(report.riderId)}`
}

function formatReportDate(report: ScoutingReport): string {
  if (!report.completedAt) return '—'

  const gameParts = resolveGameDate(report.completedAt)
  return formatGameDate(gameParts, true)
}

function normalizeNotes(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function getRangeLabel(value: any): string {
  return String(value?.label ?? value ?? '—')
}

function getPotentialText(value: any): PotentialTranslationKey | null {
  const exact = Number(value?.exact ?? value)

  if (!Number.isFinite(exact)) return null
  if (exact < 20) return 'potential.veryLow'
  if (exact < 40) return 'potential.low'
  if (exact < 60) return 'potential.medium'
  if (exact < 80) return 'potential.high'

  return 'potential.elite'
}

function buildStrengthsFromAttributes(
  reportJson: any,
): ScoutingStrength[] {
  const attributes = reportJson?.attributes || {}

  return Object.entries(attributes)
    .map(([key, value]: [string, any]) => ({
      translationKey: SKILL_LABEL_KEYS[key] ?? null,
      fallback: key,
      value: Number(value?.exact ?? 0),
    }))
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((item) => ({
      translationKey: item.translationKey,
      fallback: item.fallback,
    }))
}

function StatusPill({
  status,
}: {
  status: ScoutingReportStatus
}): JSX.Element {
  const { t } = useTranslation('scouting')

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        getStatusToneClasses(status),
      )}
    >
      {t(getStatusLabel(status))}
    </span>
  )
}

function ScoreBadge({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'blue' | 'violet'
}): JSX.Element {
  const colorClasses =
    tone === 'violet'
      ? 'bg-violet-50 text-violet-800 border-violet-200'
      : 'bg-blue-50 text-blue-800 border-blue-200'

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        colorClasses,
      )}
    >
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}

function FilterBar({
  active,
  counts,
  onChange,
}: {
  active: FilterKey
  counts: Partial<Record<FilterKey, number>>
  onChange: (next: FilterKey) => void
}): JSX.Element {
  const { t } = useTranslation('scouting')

  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm">
      {FILTERS.map((filter) => {
        const isActive = filter.key === active
        const count = counts[filter.key] ?? 0

        return (
          <button
            key={filter.key}
            type="button"
            onClick={() => onChange(filter.key)}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-medium transition',
              isActive
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:bg-white/60',
            )}
          >
            <span>{t(filter.labelKey)}</span>

            <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold text-gray-600">
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ReportRow({
  report,
  onOpenProfile,
}: {
  report: ScoutingReport
  onOpenProfile: (report: ScoutingReport) => void
}): JSX.Element {
  const { t } = useTranslation('scouting')

  const riderName = report.riderName || t('report.unknownRider')
  const scoutName = report.scoutName || t('report.scout')

  const strengthsPreview = report.strengths
    .slice(0, 3)
    .map((strength) =>
      strength.translationKey
        ? t(strength.translationKey)
        : strength.fallback,
    )
    .join(' · ')

  const hasMoreStrengths = report.strengths.length > 3
  const potentialText = report.potential ? t(report.potential) : '—'

  const notesPreview =
    report.notes && report.notes.length > 140
      ? `${report.notes.slice(0, 137)}…`
      : report.notes || '—'

  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,1.4fr)_auto] md:items-center">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <div className="truncate font-semibold text-gray-900">{riderName}</div>
          <StatusPill status={report.status} />
        </div>

        <div className="text-xs text-gray-500">
          {t('report.scoutName', { name: scoutName })}
        </div>

        <div className="text-xs text-gray-400">
          {t('report.completed', { date: formatReportDate(report) })}
        </div>
      </div>

      <div className="space-y-2 md:space-y-1">
        <ScoreBadge label={t('report.overall')} value={report.overall} tone="blue" />

        <div className="md:ml-0">
          <ScoreBadge label={t('report.potential')} value={potentialText} tone="violet" />
        </div>
      </div>

      <div className="min-w-0 space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t('report.keyStrengths')}
        </div>

        <div className="text-sm text-gray-800">
          {strengthsPreview || '—'}

          {hasMoreStrengths ? (
            <span className="text-xs text-gray-500">
              {' '}
              {t('report.more')}
            </span>
          ) : null}
        </div>

        <div className="text-xs text-gray-500">
          {t('report.notes')}{' '}
          <span className="font-normal text-gray-700">{notesPreview}</span>
        </div>
      </div>

      <div className="flex justify-start md:justify-end">
        <button
          type="button"
          onClick={() => onOpenProfile(report)}
          className="inline-flex items-center rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-medium text-black shadow-sm transition hover:bg-yellow-300"
        >
          {t('report.openProfile')}
        </button>
      </div>
    </div>
  )
}

export default function ScoutingPage(): JSX.Element {
  const navigate = useNavigate()
  const { t } = useTranslation('scouting')

  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [page, setPage] = useState(1)
  const [reports, setReports] = useState<ScoutingReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ScoutingErrorKey | null>(null)

  useEffect(() => {
    async function loadReports() {
      try {
        setLoading(true)
        setError(null)

        const { data, error } = await supabase
          .from('rider_scout_reports')
          .select(`
            id,
            rider_id,
            scout_staff_id,
            scouted_on_game_date,
            created_at,
            review_status,
            report_json
          `)
          .order('created_at', { ascending: false })

        if (error) throw error

        const rows = data || []

        const riderIds = Array.from(
          new Set(rows.map((row: any) => row.rider_id).filter(Boolean)),
        )

        const scoutIds = Array.from(
          new Set(rows.map((row: any) => row.scout_staff_id).filter(Boolean)),
        )

        const [{ data: ridersData }, { data: staffData }] = await Promise.all([
          riderIds.length > 0
            ? supabase
                .from('riders')
                .select('id, first_name, last_name, display_name, country_code')
                .in('id', riderIds)
            : Promise.resolve({ data: [] }),

          scoutIds.length > 0
            ? supabase
                .from('club_staff')
                .select('id, staff_name')
                .in('id', scoutIds)
            : Promise.resolve({ data: [] }),
        ])

        const riderMap = new Map(
          (ridersData || []).map((rider: any) => [rider.id, rider]),
        )

        const staffMap = new Map(
          (staffData || []).map((staff: any) => [staff.id, staff]),
        )

        const mapped = rows.map((row: any): ScoutingReport => {
          const rider = riderMap.get(row.rider_id)
          const scout = staffMap.get(row.scout_staff_id)
          const reportJson = row.report_json || {}

          const riderName =
            reportJson?.rider?.name ||
            reportJson?.rider_name ||
            reportJson?.display_name ||
            reportJson?.rider?.display_name ||
            [reportJson?.rider?.first_name, reportJson?.rider?.last_name]
              .filter(Boolean)
              .join(' ') ||
            rider?.display_name ||
            [rider?.first_name, rider?.last_name]
              .filter(Boolean)
              .join(' ') ||
            null

          const strengths = buildStrengthsFromAttributes(reportJson)

          const notes = normalizeNotes(
            reportJson?.notes ||
              reportJson?.summary_text ||
              reportJson?.scout_notes ||
              reportJson?.description ||
              null,
          )

          const overall = getRangeLabel(reportJson?.overall)
          const potential = getPotentialText(reportJson?.potential)

          return {
            id: row.id,
            riderId: row.rider_id,
            riderName,
            riderCountryCode: rider?.country_code ?? null,
            scoutName: scout?.staff_name || null,
            completedAt: row.scouted_on_game_date || row.created_at,
            overall,
            potential,
            strengths,
            notes,
            status: row.review_status === 'reviewed' ? 'reviewed' : 'new',
            profileScope: 'external',
          }
        })

        setReports(mapped)
      } catch {
        setError('page.loadFailed')
        setReports([])
      } finally {
        setLoading(false)
      }
    }

    void loadReports()
  }, [])

  async function markReportReviewed(reportId: string): Promise<void> {
    setReports((current) =>
      current.map((report) =>
        report.id === reportId ? { ...report, status: 'reviewed' } : report,
      ),
    )

    const { error } = await supabase
      .from('rider_scout_reports')
      .update({ review_status: 'reviewed' })
      .eq('id', reportId)

    if (error) throw error
  }

  async function handleOpenProfile(report: ScoutingReport): Promise<void> {
    const href = getRiderProfileHref(report)

    if (report.status !== 'reviewed') {
      try {
        await markReportReviewed(report.id)
      } catch {
        setError('page.reviewFailed')
      }
    }

    window.location.href = href
  }

  const filteredReports = useMemo(() => {
    if (activeFilter === 'all') return reports
    return reports.filter((report) => report.status === activeFilter)
  }, [activeFilter, reports])

  const totalPages = Math.max(
    1,
    Math.ceil(filteredReports.length / REPORTS_PER_PAGE),
  )

  const paginatedReports = useMemo(() => {
    const start = (page - 1) * REPORTS_PER_PAGE
    return filteredReports.slice(start, start + REPORTS_PER_PAGE)
  }, [filteredReports, page])

  const counts: Partial<Record<FilterKey, number>> = useMemo(
    () => ({
      all: reports.length,
      new: reports.filter((report) => report.status === 'new').length,
      reviewed: reports.filter((report) => report.status === 'reviewed').length,
    }),
    [reports],
  )

  useEffect(() => {
    setPage(1)
  }, [activeFilter])

  return (
    <div className="w-full space-y-5">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex w-fit items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
      >
        {t('page.back')}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t('page.title')}</h1>
          <p className="mt-1 text-sm text-gray-600">{t('page.subtitle')}</p>
        </div>

        <FilterBar active={activeFilter} counts={counts} onChange={setActiveFilter} />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t(error)}
        </div>
      ) : null}

      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-600">
            {t('page.loading')}
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-600">
            {t('page.empty')}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="hidden items-center justify-between rounded-xl border border-transparent px-4 py-1 text-xs font-medium uppercase tracking-wide text-gray-500 md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,1.4fr)_auto]">
              <div>{t('table.riderScout')}</div>
              <div>{t('table.overallPotential')}</div>
              <div>{t('table.strengthsNotes')}</div>
              <div className="text-right">{t('table.action')}</div>
            </div>

            {paginatedReports.map((report) => (
              <ReportRow
                key={report.id}
                report={report}
                onOpenProfile={handleOpenProfile}
              />
            ))}

            {filteredReports.length > REPORTS_PER_PAGE ? (
              <div className="flex items-center justify-between pt-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('pagination.previous')}
                </button>

                <div className="text-xs text-gray-500">
                  {t('pagination.page', { page, total: totalPages })}
                </div>

                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('pagination.next')}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
