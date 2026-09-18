import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bug,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  Image as ImageIcon,
  Inbox,
  MessageSquarePlus,
  Monitor,
  RefreshCw,
  Search,
  ShieldAlert,
  User,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type BugReportStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
type BugReportPriority = 'low' | 'normal' | 'high' | 'critical'
type ReportFilter = 'all' | 'unread' | BugReportStatus

type BugReport = {
  id: string
  created_at: string
  updated_at: string
  user_id: string | null
  page_label: string
  page_path: string
  page_url: string | null
  description: string
  severity: string
  browser: string | null
  viewport: string | null
  reported_from: string | null
  status: BugReportStatus
  priority: BugReportPriority
  assigned_admin_id: string | null
  resolved_at: string | null
  bug_type: string | null
  expected_result: string | null
  actual_result: string | null
  steps_to_reproduce: string | null
  screenshot_path: string | null
  screenshot_url: string | null
  reporter_username: string | null
  reporter_email: string | null
  reporter_full_name: string | null
  club_id: string | null
  club_name: string | null
  is_unread: boolean
}

type BugReportCounts = {
  total: number
  unread: number
  open: number
  in_progress: number
  resolved: number
  closed: number
}

type BugReportDashboard = {
  counts: BugReportCounts
  reports: BugReport[]
}

type BugReportNote = {
  id: string
  bug_report_id: string
  admin_user_id: string | null
  author: string
  note: string
  created_at: string
}

const EMPTY_COUNTS: BugReportCounts = {
  total: 0,
  unread: 0,
  open: 0,
  in_progress: 0,
  resolved: 0,
  closed: 0,
}

const FILTERS: Array<{ key: ReportFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'New' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
]

const STATUS_OPTIONS: Array<{ value: BugReportStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

const PRIORITY_OPTIONS: Array<{ value: BugReportPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function compactText(value: string, maxLength = 92): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1)}…`
}

function statusLabel(status: BugReportStatus): string {
  return STATUS_OPTIONS.find(option => option.value === status)?.label ?? status
}

function statusClass(status: BugReportStatus): string {
  switch (status) {
    case 'in_progress':
      return 'bg-blue-100 text-blue-800'
    case 'resolved':
      return 'bg-green-100 text-green-800'
    case 'closed':
      return 'bg-gray-200 text-gray-700'
    default:
      return 'bg-amber-100 text-amber-800'
  }
}

function priorityClass(priority: BugReportPriority): string {
  switch (priority) {
    case 'critical':
      return 'bg-red-100 text-red-800'
    case 'high':
      return 'bg-orange-100 text-orange-800'
    case 'low':
      return 'bg-slate-100 text-slate-700'
    default:
      return 'bg-blue-50 text-blue-700'
  }
}

function severityClass(severity: string): string {
  switch (severity) {
    case 'high':
      return 'bg-red-100 text-red-800'
    case 'low':
      return 'bg-slate-100 text-slate-700'
    default:
      return 'bg-yellow-100 text-yellow-800'
  }
}

function reporterName(report: BugReport): string {
  return (
    report.reporter_full_name ||
    report.reporter_username ||
    report.reporter_email ||
    'Unknown user'
  )
}

function filterCount(filter: ReportFilter, counts: BugReportCounts): number {
  switch (filter) {
    case 'unread':
      return counts.unread
    case 'open':
      return counts.open
    case 'in_progress':
      return counts.in_progress
    case 'resolved':
      return counts.resolved
    case 'closed':
      return counts.closed
    default:
      return counts.total
  }
}

function InfoBlock({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
        {label}
      </div>
      <div className="mt-1 break-words text-sm text-gray-900">{children}</div>
    </div>
  )
}

function TextSection({
  title,
  value,
}: {
  title: string
  value: string | null | undefined
}): JSX.Element | null {
  if (!value?.trim()) return null

  return (
    <section>
      <h3 className="text-xs font-extrabold uppercase tracking-[0.12em] text-gray-500">
        {title}
      </h3>
      <div className="mt-2 whitespace-pre-wrap rounded-xl border border-black/5 bg-gray-50 p-4 text-sm leading-6 text-gray-800">
        {value}
      </div>
    </section>
  )
}

export default function AdminBugReportsPage(): JSX.Element {
  const [dashboard, setDashboard] = useState<BugReportDashboard | null>(null)
  const [filter, setFilter] = useState<ReportFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notes, setNotes] = useState<BugReportNote[]>([])
  const [noteDraft, setNoteDraft] = useState('')
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notesLoading, setNotesLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_admin_bug_reports_v1',
        {
          p_status: null,
          p_limit: 500,
        },
      )

      if (rpcError) throw rpcError

      const next = (data ?? {
        counts: EMPTY_COUNTS,
        reports: [],
      }) as BugReportDashboard

      setDashboard({
        counts: {
          ...EMPTY_COUNTS,
          ...(next.counts ?? {}),
        },
        reports: Array.isArray(next.reports) ? next.reports : [],
      })
    } catch (loadError: any) {
      console.error('Failed to load bug reports:', loadError)
      setError(loadError?.message ?? 'Bug reports could not be loaded.')
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [])

  const loadNotes = useCallback(async (reportId: string) => {
    setNotesLoading(true)

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_admin_bug_report_notes_v1',
        {
          p_report_id: reportId,
        },
      )

      if (rpcError) throw rpcError
      setNotes(Array.isArray(data) ? (data as BugReportNote[]) : [])
    } catch (loadError) {
      console.error('Failed to load bug report notes:', loadError)
      setNotes([])
    } finally {
      setNotesLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()

    const channel = supabase
      .channel('admin-bug-report-page')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bug_reports',
        },
        () => {
          void loadDashboard(false)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadDashboard])

  const reports = dashboard?.reports ?? []
  const counts = dashboard?.counts ?? EMPTY_COUNTS

  const filteredReports = useMemo(() => {
    const needle = search.trim().toLowerCase()

    return reports.filter(report => {
      const matchesFilter =
        filter === 'all'
          ? true
          : filter === 'unread'
            ? report.is_unread
            : report.status === filter

      if (!matchesFilter) return false
      if (!needle) return true

      const haystack = [
        report.description,
        report.page_label,
        report.page_path,
        report.bug_type,
        report.severity,
        report.reporter_full_name,
        report.reporter_username,
        report.reporter_email,
        report.club_name,
        report.user_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(needle)
    })
  }, [filter, reports, search])

  const selectedReport = useMemo(
    () => reports.find(report => report.id === selectedId) ?? null,
    [reports, selectedId],
  )

  const openReport = useCallback(
    async (report: BugReport) => {
      setSelectedId(report.id)
      setScreenshotUrl(null)
      setError(null)

      if (report.is_unread) {
        const { error: readError } = await supabase.rpc(
          'mark_admin_bug_report_read_v1',
          {
            p_report_id: report.id,
          },
        )

        if (readError) {
          console.warn('Could not mark bug report as read:', readError)
        } else {
          setDashboard(current => {
            if (!current) return current

            return {
              ...current,
              counts: {
                ...current.counts,
                unread: Math.max(0, current.counts.unread - 1),
              },
              reports: current.reports.map(item =>
                item.id === report.id
                  ? {
                      ...item,
                      is_unread: false,
                    }
                  : item,
              ),
            }
          })

          window.dispatchEvent(
            new CustomEvent('admin-bug-report-count-refresh'),
          )
        }
      }

      void loadNotes(report.id)

      if (report.screenshot_path) {
        const { data, error: screenshotError } = await supabase.storage
          .from('bug-report-screenshots')
          .createSignedUrl(report.screenshot_path, 60 * 60)

        if (!screenshotError && data?.signedUrl) {
          setScreenshotUrl(data.signedUrl)
        }
      }
    },
    [loadNotes],
  )

  const updateReport = useCallback(
    async (
      report: BugReport,
      changes: {
        status?: BugReportStatus
        priority?: BugReportPriority
      },
    ) => {
      setSaving(true)
      setError(null)

      try {
        const { error: rpcError } = await supabase.rpc(
          'admin_update_bug_report_v1',
          {
            p_report_id: report.id,
            p_status: changes.status ?? report.status,
            p_priority: changes.priority ?? report.priority,
          },
        )

        if (rpcError) throw rpcError

        await loadDashboard(false)
        window.dispatchEvent(
          new CustomEvent('admin-bug-report-count-refresh'),
        )
      } catch (updateError: any) {
        console.error('Failed to update bug report:', updateError)
        setError(updateError?.message ?? 'The bug report could not be updated.')
      } finally {
        setSaving(false)
      }
    },
    [loadDashboard],
  )

  const addNote = useCallback(async () => {
    if (!selectedReport || !noteDraft.trim()) return

    setSaving(true)
    setError(null)

    try {
      const { error: rpcError } = await supabase.rpc(
        'admin_add_bug_report_note_v1',
        {
          p_report_id: selectedReport.id,
          p_note: noteDraft.trim(),
        },
      )

      if (rpcError) throw rpcError

      setNoteDraft('')
      await loadNotes(selectedReport.id)
    } catch (noteError: any) {
      console.error('Failed to add bug report note:', noteError)
      setError(noteError?.message ?? 'The note could not be added.')
    } finally {
      setSaving(false)
    }
  }, [loadNotes, noteDraft, selectedReport])

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-yellow-700">
            Administration
          </div>
          <h1 className="mt-1 flex items-center gap-3 text-3xl font-extrabold text-gray-950">
            <Bug size={30} className="text-yellow-600" />
            Bug Reports
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            Private administrator inbox for player-submitted issues. Normal
            users cannot access this page or read other players&apos; reports.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadDashboard()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            size={16}
            className={loading ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {FILTERS.map(item => {
          const active = filter === item.key
          const value = filterCount(item.key, counts)

          return (
            <button
              type="button"
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={[
                'rounded-2xl border p-4 text-left shadow-sm transition-colors',
                active
                  ? 'border-yellow-400 bg-yellow-50'
                  : 'border-black/10 bg-white hover:bg-gray-50',
              ].join(' ')}
            >
              <div className="text-xs font-bold uppercase tracking-[0.1em] text-gray-500">
                {item.label}
              </div>
              <div className="mt-1 text-2xl font-extrabold text-gray-950">
                {value}
              </div>
            </button>
          )
        })}
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-[680px] grid-cols-1 gap-5 xl:grid-cols-[minmax(420px,0.9fr)_minmax(560px,1.4fr)]">
        <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/5 p-4">
            <div className="relative">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search reporter, club, page or description…"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none focus:border-yellow-500 focus:bg-white"
              />
            </div>
          </div>

          <div className="max-h-[780px] overflow-y-auto">
            {loading && !dashboard ? (
              <div className="p-10 text-center text-sm text-gray-500">
                Loading bug reports…
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center text-gray-500">
                <Inbox size={28} className="text-gray-300" />
                <div className="text-sm font-semibold">No reports in this view.</div>
              </div>
            ) : (
              filteredReports.map(report => {
                const active = selectedId === report.id

                return (
                  <button
                    type="button"
                    key={report.id}
                    onClick={() => void openReport(report)}
                    className={[
                      'w-full border-b border-black/5 px-4 py-4 text-left transition-colors last:border-b-0',
                      active ? 'bg-yellow-50' : 'hover:bg-gray-50',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1.5">
                        {report.is_unread ? (
                          <span
                            className="block h-2.5 w-2.5 rounded-full bg-red-500"
                            title="New report"
                          />
                        ) : (
                          <span className="block h-2.5 w-2.5 rounded-full bg-gray-200" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {report.is_unread ? (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-red-700">
                              New
                            </span>
                          ) : null}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusClass(
                              report.status,
                            )}`}
                          >
                            {statusLabel(report.status)}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${severityClass(
                              report.severity,
                            )}`}
                          >
                            {report.severity} severity
                          </span>
                        </div>

                        <div className="mt-2 font-bold leading-5 text-gray-950">
                          {compactText(report.description)}
                        </div>

                        <div className="mt-2 text-xs text-gray-500">
                          {reporterName(report)}
                          {report.club_name ? ` · ${report.club_name}` : ''}
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-400">
                          <span className="truncate">
                            {report.page_label || report.page_path}
                          </span>
                          <span className="shrink-0">
                            {formatDate(report.created_at)}
                          </span>
                        </div>
                      </div>

                      <ChevronRight
                        size={17}
                        className="mt-1 shrink-0 text-gray-300"
                      />
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          {!selectedReport ? (
            <div className="flex min-h-[680px] flex-col items-center justify-center gap-3 p-10 text-center">
              <Bug size={38} className="text-gray-300" />
              <div>
                <div className="font-bold text-gray-900">
                  Select a bug report
                </div>
                <div className="mt-1 text-sm text-gray-500">
                  Open a report to see the player, page, screenshot, technical
                  information and admin controls.
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="border-b border-black/5 px-5 py-5">
                <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${statusClass(
                          selectedReport.status,
                        )}`}
                      >
                        {statusLabel(selectedReport.status)}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${priorityClass(
                          selectedReport.priority,
                        )}`}
                      >
                        {selectedReport.priority} priority
                      </span>
                    </div>

                    <h2 className="mt-3 text-xl font-extrabold leading-7 text-gray-950">
                      {compactText(selectedReport.description, 150)}
                    </h2>
                    <div className="mt-2 text-xs text-gray-400">
                      Report ID: {selectedReport.id}
                    </div>
                  </div>

                  <div className="grid min-w-[280px] grid-cols-2 gap-2">
                    <label className="text-xs font-semibold text-gray-600">
                      Status
                      <select
                        value={selectedReport.status}
                        disabled={saving}
                        onChange={event =>
                          void updateReport(selectedReport, {
                            status: event.target.value as BugReportStatus,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-yellow-500 disabled:opacity-60"
                      >
                        {STATUS_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-semibold text-gray-600">
                      Priority
                      <select
                        value={selectedReport.priority}
                        disabled={saving}
                        onChange={event =>
                          void updateReport(selectedReport, {
                            priority: event.target.value as BugReportPriority,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-yellow-500 disabled:opacity-60"
                      >
                        {PRIORITY_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-6 p-5">
                <div className="grid gap-4 rounded-2xl border border-black/5 bg-gray-50 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  <InfoBlock label="Reporter">
                    <div className="flex items-center gap-2 font-semibold">
                      <User size={15} className="text-gray-400" />
                      {reporterName(selectedReport)}
                    </div>
                  </InfoBlock>

                  <InfoBlock label="Username">
                    {selectedReport.reporter_username ?? '—'}
                  </InfoBlock>

                  <InfoBlock label="Email">
                    {selectedReport.reporter_email ?? '—'}
                  </InfoBlock>

                  <InfoBlock label="Club">
                    {selectedReport.club_name ?? '—'}
                  </InfoBlock>

                  <InfoBlock label="User ID">
                    <span className="font-mono text-xs">
                      {selectedReport.user_id ?? '—'}
                    </span>
                  </InfoBlock>

                  <InfoBlock label="Submitted">
                    {formatDate(selectedReport.created_at)}
                  </InfoBlock>
                </div>

                <div className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:grid-cols-2">
                  <InfoBlock label="Page">
                    {selectedReport.page_label || '—'}
                  </InfoBlock>

                  <InfoBlock label="Path">
                    <span className="font-mono text-xs">
                      {selectedReport.page_path}
                    </span>
                  </InfoBlock>

                  <InfoBlock label="Bug type">
                    <span className="capitalize">
                      {selectedReport.bug_type ?? 'other'}
                    </span>
                  </InfoBlock>

                  <InfoBlock label="Severity">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold capitalize ${severityClass(
                        selectedReport.severity,
                      )}`}
                    >
                      {selectedReport.severity}
                    </span>
                  </InfoBlock>

                  <InfoBlock label="Reported from">
                    {selectedReport.reported_from ?? '—'}
                  </InfoBlock>

                  <InfoBlock label="Last admin update">
                    {formatDate(selectedReport.updated_at)}
                  </InfoBlock>

                  {selectedReport.page_url ? (
                    <div className="sm:col-span-2">
                      <InfoBlock label="Full URL">
                        <a
                          href={selectedReport.page_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-1 break-all text-blue-700 hover:underline"
                        >
                          {selectedReport.page_url}
                          <ExternalLink size={13} className="shrink-0" />
                        </a>
                      </InfoBlock>
                    </div>
                  ) : null}
                </div>

                <TextSection
                  title="What happened"
                  value={selectedReport.description}
                />
                <TextSection
                  title="Expected result"
                  value={selectedReport.expected_result}
                />
                <TextSection
                  title="Actual result"
                  value={selectedReport.actual_result}
                />
                <TextSection
                  title="Steps to reproduce"
                  value={selectedReport.steps_to_reproduce}
                />

                <section>
                  <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-gray-500">
                    <Monitor size={14} />
                    Technical information
                  </div>
                  <div className="grid gap-4 rounded-xl border border-black/5 bg-gray-50 p-4 sm:grid-cols-2">
                    <InfoBlock label="Viewport">
                      {selectedReport.viewport ?? '—'}
                    </InfoBlock>
                    <InfoBlock label="Browser / device">
                      <span className="text-xs leading-5">
                        {selectedReport.browser ?? '—'}
                      </span>
                    </InfoBlock>
                  </div>
                </section>

                {selectedReport.screenshot_path ? (
                  <section>
                    <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-gray-500">
                      <ImageIcon size={14} />
                      Screenshot
                    </div>
                    {screenshotUrl ? (
                      <a
                        href={screenshotUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-xl border border-black/10 bg-gray-50"
                      >
                        <img
                          src={screenshotUrl}
                          alt="Bug report screenshot"
                          className="max-h-[520px] w-full object-contain"
                        />
                      </a>
                    ) : (
                      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                        Screenshot exists, but a preview could not be loaded.
                      </div>
                    )}
                  </section>
                ) : null}

                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-gray-500">
                      <MessageSquarePlus size={14} />
                      Internal admin notes
                    </div>
                    {notesLoading ? (
                      <span className="text-xs text-gray-400">Loading…</span>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    {notes.length === 0 && !notesLoading ? (
                      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                        No internal notes yet.
                      </div>
                    ) : (
                      notes.map(note => (
                        <div
                          key={note.id}
                          className="rounded-xl border border-black/5 bg-gray-50 p-4"
                        >
                          <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
                            <span className="font-semibold text-gray-600">
                              {note.author}
                            </span>
                            <span>{formatDate(note.created_at)}</span>
                          </div>
                          <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-800">
                            {note.note}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <textarea
                      value={noteDraft}
                      onChange={event => setNoteDraft(event.target.value)}
                      rows={3}
                      placeholder="Add a private note for other admins…"
                      className="min-h-[88px] flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-yellow-500"
                    />
                    <button
                      type="button"
                      onClick={() => void addNote()}
                      disabled={saving || !noteDraft.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 sm:self-end"
                    >
                      <MessageSquarePlus size={16} />
                      Add note
                    </button>
                  </div>
                </section>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex items-center gap-3 rounded-xl border border-black/5 bg-gray-50 p-3">
                    <Clock3 size={17} className="text-gray-400" />
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                        Created
                      </div>
                      <div className="text-xs font-semibold text-gray-700">
                        {formatDate(selectedReport.created_at)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-black/5 bg-gray-50 p-3">
                    <ShieldAlert size={17} className="text-gray-400" />
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                        Priority
                      </div>
                      <div className="text-xs font-semibold capitalize text-gray-700">
                        {selectedReport.priority}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-black/5 bg-gray-50 p-3">
                    <CheckCircle2 size={17} className="text-gray-400" />
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                        Resolved
                      </div>
                      <div className="text-xs font-semibold text-gray-700">
                        {formatDate(selectedReport.resolved_at)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
