import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Mail,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type AdminTab = 'overview' | 'incidents' | 'logs'
type IncidentFilter = 'active' | 'resolved' | 'all'
type Severity = 'warning' | 'high' | 'critical'
type IncidentStatus = 'open' | 'acknowledged' | 'resolved'
type RunStatus = 'running' | 'success' | 'warning' | 'error' | 'stalled'

type HealthSummary = {
  open_incidents: number
  critical_incidents: number
  high_incidents: number
  warning_incidents: number
  monitored_processes: number
  user_sensitive_processes: number
  alert_email?: string | null
}

type HealthProcess = {
  process_key: string
  label: string
  category: string
  description: string
  source_kind: string
  source_ref: string | null
  user_sensitive: boolean
  incident_severity: Severity
  expected_interval_minutes: number | null
  stale_after_minutes: number | null
  latest_status: RunStatus | null
  latest_started_at: string | null
  latest_finished_at: string | null
  latest_duration_ms: number | null
  latest_summary: string | null
  latest_error_message: string | null
  cron_active: boolean | null
  open_incidents: number
}

type HealthIncident = {
  id: string
  process_key: string
  process_label: string
  category: string
  severity: Severity
  status: IncidentStatus
  title: string
  message: string
  details: Record<string, unknown>
  first_seen_at: string
  last_seen_at: string
  occurrence_count: number
  last_emailed_at: string | null
  acknowledged_at: string | null
  resolved_at: string | null
  resolution_note?: string | null
  is_unread: boolean
}

type HealthRun = {
  id: string
  process_key: string
  process_label: string
  category: string
  status: RunStatus
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  summary: string | null
  error_message: string | null
  details: Record<string, unknown>
}

type HealthOverview = {
  summary: HealthSummary
  processes: HealthProcess[]
  incidents: HealthIncident[]
}

const EMPTY_SUMMARY: HealthSummary = {
  open_incidents: 0,
  critical_incidents: 0,
  high_incidents: 0,
  warning_incidents: 0,
  monitored_processes: 0,
  user_sensitive_processes: 0,
  alert_email: null,
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatDuration(ms?: number | null): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return ms + ' ms'
  if (ms < 60000) return (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s'
  return (ms / 60000).toFixed(1) + ' min'
}

function humanize(value?: string | null): string {
  if (!value) return 'No run yet'
  return value.replaceAll('_', ' ').replace(/^./, char => char.toUpperCase())
}

function severityClass(value: Severity): string {
  if (value === 'critical') return 'border-red-200 bg-red-50 text-red-800'
  if (value === 'high') return 'border-orange-200 bg-orange-50 text-orange-800'
  return 'border-amber-200 bg-amber-50 text-amber-800'
}

function runStatusClass(value?: RunStatus | null): string {
  if (value === 'success') return 'text-emerald-700'
  if (value === 'warning') return 'text-amber-700'
  if (value === 'error' || value === 'stalled') return 'text-red-700'
  if (value === 'running') return 'text-blue-700'
  return 'text-gray-500'
}

function processState(process: HealthProcess): 'healthy' | 'warning' | 'problem' | 'unknown' {
  if (process.open_incidents > 0) return 'problem'
  if (process.source_kind === 'cron' && process.cron_active === false) return 'problem'
  if (process.latest_status === 'error' || process.latest_status === 'stalled') return 'problem'
  if (process.latest_status === 'warning') return 'warning'
  if (process.latest_status === 'success') return 'healthy'
  return 'unknown'
}

export default function AdminSystemHealthPage(): JSX.Element {
  const [tab, setTab] = useState<AdminTab>('overview')
  const [overview, setOverview] = useState<HealthOverview>({
    summary: EMPTY_SUMMARY,
    processes: [],
    incidents: [],
  })
  const [incidents, setIncidents] = useState<HealthIncident[]>([])
  const [incidentFilter, setIncidentFilter] = useState<IncidentFilter>('active')
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null)
  const [selectedProcessKey, setSelectedProcessKey] = useState('all')
  const [runs, setRuns] = useState<HealthRun[]>([])
  const [loading, setLoading] = useState(true)
  const [secondaryLoading, setSecondaryLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedIncident = useMemo(
    () =>
      incidents.find(row => row.id === selectedIncidentId) ??
      overview.incidents.find(row => row.id === selectedIncidentId) ??
      null,
    [incidents, overview.incidents, selectedIncidentId],
  )

  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)

    const { data, error: rpcError } = await supabase.rpc(
      'get_admin_system_health_overview_v1',
    )

    if (rpcError) {
      setError(rpcError.message)
      if (!silent) setLoading(false)
      return
    }

    const next = (data ?? {}) as Partial<HealthOverview>
    setOverview({
      summary: next.summary ?? EMPTY_SUMMARY,
      processes: next.processes ?? [],
      incidents: next.incidents ?? [],
    })
    if (!silent) setLoading(false)
  }, [])

  const loadIncidents = useCallback(async (filter: IncidentFilter) => {
    setSecondaryLoading(true)
    const { data, error: rpcError } = await supabase.rpc(
      'get_admin_system_incidents_v1',
      { p_status: filter, p_limit: 300 },
    )
    if (rpcError) {
      setError(rpcError.message)
      setIncidents([])
    } else {
      setIncidents((data ?? []) as HealthIncident[])
    }
    setSecondaryLoading(false)
  }, [])

  const loadRuns = useCallback(async (processKey: string) => {
    setSecondaryLoading(true)
    const { data, error: rpcError } = await supabase.rpc(
      'get_admin_system_runs_v1',
      {
        p_process_key: processKey === 'all' ? null : processKey,
        p_limit: 400,
      },
    )
    if (rpcError) {
      setError(rpcError.message)
      setRuns([])
    } else {
      setRuns((data ?? []) as HealthRun[])
    }
    setSecondaryLoading(false)
  }, [])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  useEffect(() => {
    if (tab === 'incidents') void loadIncidents(incidentFilter)
  }, [incidentFilter, loadIncidents, tab])

  useEffect(() => {
    if (tab === 'logs') void loadRuns(selectedProcessKey)
  }, [loadRuns, selectedProcessKey, tab])

  useEffect(() => {
    const channel = supabase
      .channel('ppm-admin-system-health')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_incidents' },
        () => {
          void loadOverview(true)
          if (tab === 'incidents') void loadIncidents(incidentFilter)
          window.dispatchEvent(new Event('admin-system-health-count-refresh'))
        },
      )
      .subscribe()

    const intervalId = window.setInterval(() => {
      void loadOverview(true)
      if (tab === 'logs') void loadRuns(selectedProcessKey)
    }, 30000)

    const onFocus = () => {
      void loadOverview(true)
      if (tab === 'incidents') void loadIncidents(incidentFilter)
      if (tab === 'logs') void loadRuns(selectedProcessKey)
    }

    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
      void supabase.removeChannel(channel)
    }
  }, [incidentFilter, loadIncidents, loadOverview, loadRuns, selectedProcessKey, tab])

  async function refreshAll(): Promise<void> {
    setWorking(true)
    await loadOverview(true)
    if (tab === 'incidents') await loadIncidents(incidentFilter)
    if (tab === 'logs') await loadRuns(selectedProcessKey)
    setWorking(false)
  }

  async function openIncident(incident: HealthIncident): Promise<void> {
    setSelectedIncidentId(incident.id)
    if (!incident.is_unread) return

    const { error: readError } = await supabase.rpc(
      'mark_admin_system_incident_read_v1',
      { p_incident_id: incident.id },
    )

    if (!readError) {
      const markRead = (row: HealthIncident) =>
        row.id === incident.id ? { ...row, is_unread: false } : row
      setIncidents(current => current.map(markRead))
      setOverview(current => ({
        ...current,
        incidents: current.incidents.map(markRead),
      }))
      window.dispatchEvent(new Event('admin-system-health-count-refresh'))
    }
  }

  async function updateIncident(action: 'acknowledge' | 'resolve' | 'reopen') {
    if (!selectedIncident) return
    setWorking(true)
    const { error: rpcError } = await supabase.rpc(
      'admin_update_system_incident_v1',
      {
        p_incident_id: selectedIncident.id,
        p_action: action,
        p_note:
          action === 'resolve'
            ? 'Resolved from ProPeloton Manager System Health administration.'
            : null,
      },
    )
    setWorking(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }

    setSelectedIncidentId(null)
    await loadOverview(true)
    await loadIncidents(incidentFilter)
    window.dispatchEvent(new Event('admin-system-health-count-refresh'))
  }

  const summary = overview.summary
  const operational = summary.open_incidents === 0

  return (
    <div className="mx-auto w-full max-w-[1750px] space-y-5">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">
          Administration
        </div>
        <h1 className="mt-1 flex items-center gap-3 text-3xl font-extrabold text-gray-950">
          <Activity size={30} className="text-sky-700" />
          System Health
        </h1>
        <p className="mt-2 max-w-5xl text-sm leading-6 text-gray-600">
          Monitor platform and gameplay services outside the race-stage pipeline:
          schedulers, finance, transfers, staff, scouting, infrastructure, equipment,
          messaging and administrator alerts. Race calculation, replay readiness and
          result publication stay exclusively in Race Operations.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-1 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-1 overflow-x-auto">
          {([
            ['overview', 'Overview'],
            ['incidents', 'Incidents'],
            ['logs', 'Process Logs'],
          ] as Array<[AdminTab, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={[
                'relative whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition',
                tab === key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
              ].join(' ')}
            >
              {label}
              {key === 'incidents' && summary.open_incidents > 0 ? (
                <span className="ml-2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                  {summary.open_incidents > 99 ? '99+' : summary.open_incidents}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void refreshAll()}
          disabled={working || loading}
          className="m-1 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={working ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-gray-200 bg-white text-sm font-semibold text-gray-500">
          Loading system health...
        </div>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article className={['flex items-center gap-4 rounded-2xl border bg-white p-5 shadow-sm', operational ? 'border-emerald-200' : 'border-red-200'].join(' ')}>
              <div className={['flex h-11 w-11 items-center justify-center rounded-full', operational ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'].join(' ')}>
                {operational ? <CheckCircle2 size={23} /> : <ShieldAlert size={23} />}
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Overall status</div>
                <div className="mt-1 text-xl font-extrabold text-gray-950">{operational ? 'Operational' : 'Attention required'}</div>
                <div className="mt-1 text-xs text-gray-500">{summary.open_incidents} active incident{summary.open_incidents === 1 ? '' : 's'}</div>
              </div>
            </article>

            <article className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-50 text-sky-700"><AlertTriangle size={22} /></div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Critical / high</div>
                <div className="mt-1 text-xl font-extrabold text-gray-950">{summary.critical_incidents} / {summary.high_incidents}</div>
                <div className="mt-1 text-xs text-gray-500">{summary.warning_incidents} warning{summary.warning_incidents === 1 ? '' : 's'}</div>
              </div>
            </article>

            <article className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-50 text-sky-700"><Activity size={22} /></div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Monitored processes</div>
                <div className="mt-1 text-xl font-extrabold text-gray-950">{summary.monitored_processes}</div>
                <div className="mt-1 text-xs text-gray-500">{summary.user_sensitive_processes} user-sensitive</div>
              </div>
            </article>

            <article className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-50 text-sky-700"><Mail size={22} /></div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Alert channel</div>
                <div className="mt-1 text-xl font-extrabold text-gray-950">Admin + Email</div>
                <div className="mt-1 truncate text-xs text-gray-500">{summary.alert_email || 'Administrator email'}</div>
              </div>
            </article>
          </section>

          {tab === 'overview' ? (
            <div className="space-y-5">
              {overview.incidents.length > 0 ? (
                <section className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
                  <div className="border-b border-red-100 bg-red-50/60 px-5 py-4">
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-red-700">Active incidents</div>
                    <h2 className="mt-1 text-lg font-extrabold text-gray-950">Problems requiring attention</h2>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {overview.incidents.map(incident => (
                      <button key={incident.id} type="button" onClick={() => { setTab('incidents'); setIncidentFilter('active'); void openIncident(incident) }} className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-gray-50 md:grid-cols-[110px_1fr_190px] md:items-center">
                        <span className={'inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] font-extrabold uppercase ' + severityClass(incident.severity)}>{incident.severity}</span>
                        <span className="min-w-0">
                          <strong className="block text-sm text-gray-950">{incident.title}{incident.is_unread ? <span className="ml-2 inline-block h-2 w-2 rounded-full bg-red-500" /> : null}</strong>
                          <small className="mt-1 block text-xs text-gray-500">{incident.process_label} · {incident.category}</small>
                        </span>
                        <span className="text-xs text-gray-500 md:text-right">{formatDate(incident.last_seen_at)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-col gap-2 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-sky-700">Process monitor</div>
                    <h2 className="mt-1 text-lg font-extrabold text-gray-950">Platform & gameplay systems</h2>
                  </div>
                  <div className="text-xs text-gray-500">Race-stage operations are monitored separately</div>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[1050px]">
                    <div className="grid grid-cols-[2.2fr_1fr_1fr_1.3fr_.8fr_.55fr] gap-4 bg-slate-50 px-5 py-3 text-[10px] font-extrabold uppercase tracking-wide text-gray-400">
                      <span>Process</span><span>Category</span><span>Status</span><span>Latest run</span><span>Duration</span><span>Incidents</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {overview.processes.map(process => {
                        const state = processState(process)
                        const dot = state === 'healthy' ? 'bg-emerald-500' : state === 'warning' ? 'bg-amber-500' : state === 'problem' ? 'bg-red-500' : 'bg-gray-300'
                        return (
                          <button key={process.process_key} type="button" onClick={() => { setSelectedProcessKey(process.process_key); setTab('logs') }} className="grid w-full grid-cols-[2.2fr_1fr_1fr_1.3fr_.8fr_.55fr] gap-4 px-5 py-4 text-left text-sm transition hover:bg-gray-50">
                            <span className="min-w-0">
                              <strong className="block truncate text-gray-950">{process.label}</strong>
                              <small className="mt-1 block truncate text-xs text-gray-500">{process.description}</small>
                              {process.user_sensitive ? <em className="mt-1 inline-block text-[10px] font-bold not-italic uppercase tracking-wide text-sky-700">User-sensitive</em> : null}
                            </span>
                            <span className="text-gray-600">{process.category}</span>
                            <span className="flex items-center gap-2 font-semibold text-gray-700"><i className={'h-2 w-2 rounded-full ' + dot} />{process.open_incidents > 0 ? 'Incident' : humanize(process.latest_status)}</span>
                            <span className="text-gray-500">{formatDate(process.latest_started_at)}</span>
                            <span className="text-gray-500">{formatDuration(process.latest_duration_ms)}</span>
                            <span className="font-bold text-gray-700">{process.open_incidents}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {tab === 'incidents' ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                {(['active', 'resolved', 'all'] as IncidentFilter[]).map(filter => (
                  <button key={filter} type="button" onClick={() => { setIncidentFilter(filter); setSelectedIncidentId(null) }} className={['rounded-lg border px-3 py-2 text-sm font-semibold', incidentFilter === filter ? 'border-slate-900 bg-slate-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'].join(' ')}>
                    {filter === 'active' ? 'Active' : filter === 'resolved' ? 'Resolved' : 'All'}
                  </button>
                ))}
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,.8fr)]">
                <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  {secondaryLoading ? <div className="p-8 text-center text-sm text-gray-500">Loading incidents...</div> : incidents.length === 0 ? <div className="p-8 text-center text-sm text-gray-500">No incidents found for this filter.</div> : (
                    <div className="divide-y divide-gray-100">
                      {incidents.map(incident => (
                        <button key={incident.id} type="button" onClick={() => void openIncident(incident)} className={['w-full p-4 text-left transition hover:bg-gray-50', incident.id === selectedIncidentId ? 'bg-sky-50/60' : ''].join(' ')}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={'rounded-full border px-2 py-1 text-[10px] font-extrabold uppercase ' + severityClass(incident.severity)}>{incident.severity}</span>
                            <span className="text-xs font-semibold text-gray-500">{humanize(incident.status)}</span>
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-sm font-extrabold text-gray-950">{incident.title}{incident.is_unread ? <span className="h-2 w-2 rounded-full bg-red-500" /> : null}</div>
                          <div className="mt-1 text-xs text-gray-500">{incident.process_label} · {incident.category}</div>
                          <div className="mt-2 text-xs text-gray-400">{formatDate(incident.last_seen_at)} · {incident.occurrence_count} occurrence{incident.occurrence_count === 1 ? '' : 's'}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section className="min-h-[420px] rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  {!selectedIncident ? (
                    <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center text-gray-400">
                      <ShieldAlert size={28} />
                      <div className="mt-3 font-bold text-gray-600">Select an incident</div>
                      <div className="mt-1 text-sm">Diagnostics, timestamps and administrator actions will appear here.</div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <span className={'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase ' + severityClass(selectedIncident.severity)}>{selectedIncident.severity}</span>
                          <h2 className="mt-3 text-xl font-extrabold text-gray-950">{selectedIncident.title}</h2>
                          <div className="mt-1 text-sm text-gray-500">{selectedIncident.process_label} · {selectedIncident.category}</div>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{humanize(selectedIncident.status)}</span>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-slate-50 p-4 text-sm leading-6 text-gray-800">{selectedIncident.message}</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[
                          ['First seen', formatDate(selectedIncident.first_seen_at)],
                          ['Last seen', formatDate(selectedIncident.last_seen_at)],
                          ['Occurrences', String(selectedIncident.occurrence_count)],
                          ['Last email', formatDate(selectedIncident.last_emailed_at)],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-xl border border-gray-200 p-3">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
                            <div className="mt-1 text-sm font-semibold text-gray-800">{value}</div>
                          </div>
                        ))}
                      </div>
                      <details className="rounded-xl border border-gray-200">
                        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-gray-700">Technical details</summary>
                        <pre className="max-h-72 overflow-auto border-t border-gray-100 bg-slate-950 p-4 text-xs leading-5 text-slate-200">{JSON.stringify(selectedIncident.details ?? {}, null, 2)}</pre>
                      </details>
                      {selectedIncident.resolution_note ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><strong>Resolution:</strong> {selectedIncident.resolution_note}</div> : null}
                      <div className="flex flex-wrap gap-2">
                        {selectedIncident.status === 'open' ? <button type="button" onClick={() => void updateIncident('acknowledge')} disabled={working} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50">Acknowledge</button> : null}
                        {selectedIncident.status !== 'resolved' ? <button type="button" onClick={() => void updateIncident('resolve')} disabled={working} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">Resolve</button> : <button type="button" onClick={() => void updateIncident('reopen')} disabled={working} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Reopen</button>}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          ) : null}

          {tab === 'logs' ? (
            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-sky-700">Process logs</div>
                  <h2 className="mt-1 text-lg font-extrabold text-gray-950">Execution history</h2>
                </div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  Process
                  <select value={selectedProcessKey} onChange={event => setSelectedProcessKey(event.target.value)} className="mt-1 block min-w-[280px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium normal-case text-gray-700 outline-none focus:border-sky-500">
                    <option value="all">All monitored processes</option>
                    {overview.processes.map(process => <option key={process.process_key} value={process.process_key}>{process.label}</option>)}
                  </select>
                </label>
              </div>
              {secondaryLoading ? <div className="p-8 text-center text-sm text-gray-500">Loading process history...</div> : (
                <div className="overflow-x-auto">
                  <div className="min-w-[1000px]">
                    <div className="grid grid-cols-[1.1fr_1.5fr_.75fr_.65fr_2.4fr] gap-4 bg-slate-50 px-5 py-3 text-[10px] font-extrabold uppercase tracking-wide text-gray-400">
                      <span>Timestamp</span><span>Process</span><span>Status</span><span>Duration</span><span>Result / error</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {runs.map(run => (
                        <div key={run.id} className="grid grid-cols-[1.1fr_1.5fr_.75fr_.65fr_2.4fr] gap-4 px-5 py-4 text-sm">
                          <span className="text-xs text-gray-500">{formatDate(run.started_at)}</span>
                          <span><strong className="block text-gray-900">{run.process_label}</strong><small className="mt-1 block text-xs text-gray-400">{run.category}</small></span>
                          <span className={'flex items-center gap-2 font-semibold ' + runStatusClass(run.status)}><i className={['h-2 w-2 rounded-full', run.status === 'success' ? 'bg-emerald-500' : run.status === 'warning' ? 'bg-amber-500' : run.status === 'running' ? 'bg-blue-500' : 'bg-red-500'].join(' ')} />{humanize(run.status)}</span>
                          <span className="text-gray-500">{formatDuration(run.duration_ms)}</span>
                          <span className="min-w-0 text-xs leading-5 text-gray-600">{run.error_message ?? run.summary ?? '—'}</span>
                        </div>
                      ))}
                      {runs.length === 0 ? <div className="p-8 text-center text-sm text-gray-500">No process logs found.</div> : null}
                    </div>
                  </div>
                </div>
              )}
            </section>
          ) : null}
        </>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Clock3 size={13} />
        Automatic watchdog: every 5 minutes · Email dispatcher: every 2 minutes · Page refresh: every 30 seconds
      </div>
    </div>
  )
}
