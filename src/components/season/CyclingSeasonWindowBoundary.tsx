import React from 'react'
import { Link } from 'react-router'
import { CalendarClock, Clock3, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { CyclingAdminInspection, type CyclingMigrationInspectionReport } from './CyclingAdminInspection'

type Phase = 'off' | 'migration' | 'delayed' | 'preparation'
export type CyclingSeasonWindow = {
  phase: Phase
  locked: boolean
  delayed: boolean
  preparation_active: boolean
  game_clock_paused: boolean
  source_season: number | null
  target_season: number | null
  migration_started_at: string | null
  migration_reopen_at: string | null
  preparation_started_at: string | null
  resume_at: string | null
  checked_at: string
}

const WindowContext = React.createContext<CyclingSeasonWindow | null>(null)
export function useCyclingSeasonWindow() { return React.useContext(WindowContext) }

const copy = {
  en: {
    migrationTag: 'SEASON MIGRATION',
    migrationTitle: 'Season {season} migration in progress',
    migrationBody: 'ProPeloton Manager is temporarily offline while we move to the new season, protect race results and verify your team, riders, rankings and finances. Sign-in and gameplay are unavailable during this window.',
    migrationReopen: 'Expected game reopening',
    delayedTitle: 'Migration is taking longer than planned',
    delayedBody: 'The game stays locked until the season change and its checks are completed. A new reopening time will be published when confirmed.',
    preparingTag: '24-HOUR SEASON PREPARATION',
    preparingTitle: 'Welcome to Season {season}!',
    preparingBody: 'The migration is complete. Game time is frozen at January 1, 00:00 for a full 24 real-world hours. You can sign in, register for January races and prepare your team.',
    resumes: 'Game time resumes automatically at 2×',
    timeZone: 'Time shown in your local time zone',
    calendar: 'View January race calendar',
    continue: 'Continue to game',
    paused: 'Season {season} preparations · game time paused until',
    checking: 'Checking game availability…',
    unknown: 'Game availability cannot be verified. Retrying automatically.',
    preserved: 'Your career and existing progress will remain protected during the transition.',
  },
  de: {
    migrationTag: 'SAISONWECHSEL',
    migrationTitle: 'Migration zu Saison {season}',
    migrationBody: 'ProPeloton Manager ist während des Saisonwechsels vorübergehend offline. Rennergebnisse, Teams, Fahrer, Ranglisten und Finanzen werden überprüft. Die Anmeldung und das Spiel sind währenddessen gesperrt.',
    migrationReopen: 'Voraussichtliche Wiedereröffnung',
    delayedTitle: 'Der Saisonwechsel dauert länger als geplant',
    delayedBody: 'Das Spiel bleibt gesperrt, bis der Saisonwechsel und die Kontrollen abgeschlossen sind. Eine neue Uhrzeit wird veröffentlicht, sobald sie bestätigt ist.',
    preparingTag: '24 STUNDEN SAISONVORBEREITUNG',
    preparingTitle: 'Willkommen in Saison {season}!',
    preparingBody: 'Die Migration ist abgeschlossen. Die Spielzeit ist am 1. Januar um 00:00 Uhr für 24 echte Stunden angehalten. Du kannst dich anmelden, für Januar-Rennen registrieren und dein Team vorbereiten.',
    resumes: 'Die Spielzeit läuft automatisch mit 2× weiter am',
    timeZone: 'Uhrzeit in deiner lokalen Zeitzone',
    calendar: 'Rennkalender für Januar ansehen',
    continue: 'Zum Spiel',
    paused: 'Saison {season}: Vorbereitung · Spielzeit pausiert bis',
    checking: 'Verfügbarkeit wird geprüft…',
    unknown: 'Die Verfügbarkeit kann nicht geprüft werden. Erneuter Versuch läuft.',
    preserved: 'Deine Karriere und dein Spielfortschritt bleiben beim Saisonwechsel erhalten.',
  },
}

function formatForViewer(iso: string | null) {
  if (!iso) return null
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return null
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const str = new Intl.DateTimeFormat(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    timeZone: tz, timeZoneName: 'short',
  }).format(date)
  return str + ' (' + tz + ')'
}

export function CyclingSeasonWindowBoundary({ children }: { children: React.ReactNode }): JSX.Element {
  const { i18n } = useTranslation()
  const t = (i18n.resolvedLanguage ?? i18n.language).toLowerCase().startsWith('de') ? copy.de : copy.en
  const [windowStatus, setWindowStatus] = React.useState<CyclingSeasonWindow | null>(null)
  const [fetchFailed, setFetchFailed] = React.useState(false)
  const [dismissed, setDismissed] = React.useState<string | null>(null)
  const [inspectorReport, setInspectorReport] = React.useState<CyclingMigrationInspectionReport | null>(null)
  const [inspectorLoginOpen, setInspectorLoginOpen] = React.useState(false)
  const [inspectorEmail, setInspectorEmail] = React.useState('')
  const [inspectorPassword, setInspectorPassword] = React.useState('')
  const [inspectorError, setInspectorError] = React.useState<string | null>(null)
  const [inspectorBusy, setInspectorBusy] = React.useState(false)

  React.useEffect(() => {
    let live = true
    async function refresh() {
      const { data, error } = await supabase.rpc('get_cycling_public_season_window_v1')
      if (!live) return
      if (error || !data || typeof data.locked !== 'boolean') {
        // Fail closed. A missing status is NOT permission to bypass migration.
        setFetchFailed(true)
        return
      }
      setFetchFailed(false)
      setWindowStatus(data as CyclingSeasonWindow)
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15_000)
    const focus = () => void refresh()
    window.addEventListener('focus', focus)
    return () => {
      live = false
      window.clearInterval(timer)
      window.removeEventListener('focus', focus)
    }
  }, [])

  React.useEffect(() => {
    // Existing player sessions must never bypass the migration lock.
    // Only an authenticated account approved by the server may see the
    // independent, read-only inspection screen (never the game routes).
    if (!windowStatus?.locked) {
      setInspectorReport(null)
      return
    }
    let active = true
    async function checkExistingSession() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!active || !user) return
      const { data, error } = await supabase.rpc('get_cycling_admin_migration_inspection_v1')
      if (!active) return
      if (error || !data || data.authorized !== true) {
        setInspectorReport(null)
        await supabase.auth.signOut({ scope: 'local' })
      } else {
        setInspectorReport(data as CyclingMigrationInspectionReport)
      }
    }
    void checkExistingSession()
    return () => { active = false }
  }, [windowStatus?.locked])

  async function signInForInspection(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!inspectorEmail.trim() || !inspectorPassword) {
      setInspectorError('Enter the email and password of your authorized inspection account.')
      return
    }
    setInspectorBusy(true)
    setInspectorError(null)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: inspectorEmail.trim(), password: inspectorPassword,
      })
      setInspectorPassword('')
      if (error || !data?.session) {
        setInspectorError(error?.message || 'This account cannot sign in during the migration.')
        return
      }
      const inspection = await supabase.rpc('get_cycling_admin_migration_inspection_v1')
      if (inspection.error || !inspection.data || inspection.data.authorized !== true) {
        await supabase.auth.signOut({ scope: 'local' })
        setInspectorError('This account has no migration inspection permission.')
        return
      }
      setInspectorReport(inspection.data as CyclingMigrationInspectionReport)
      setInspectorEmail('')
    } catch {
      setInspectorError('Unable to verify inspection access. Please try again.')
    } finally {
      setInspectorBusy(false)
    }
  }

  async function refreshInspection(): Promise<void> {
    setInspectorBusy(true)
    setInspectorError(null)
    const { data, error } = await supabase.rpc('get_cycling_admin_migration_inspection_v1')
    if (error || !data || data.authorized !== true) {
      setInspectorReport(null)
      setInspectorError('Inspection access could not be verified. Please sign in again.')
      await supabase.auth.signOut({ scope: 'local' })
    } else {
      setInspectorReport(data as CyclingMigrationInspectionReport)
    }
    setInspectorBusy(false)
  }

  async function signOutInspection(): Promise<void> {
    setInspectorBusy(true)
    await supabase.auth.signOut({ scope: 'local' })
    setInspectorReport(null)
    setInspectorBusy(false)
    setInspectorLoginOpen(false)
    setInspectorError(null)
  }

  if (!windowStatus || fetchFailed) {
    return (
      <main role="status" className="min-h-screen bg-[#081224] grid place-items-center px-5 text-white">
        <p className="text-center text-sm text-slate-200">{fetchFailed ? t.unknown : t.checking}</p>
      </main>
    )
  }

  if (windowStatus.locked) {
    if (inspectorReport?.authorized && inspectorReport.read_only) {
      return (
        <CyclingAdminInspection
          report={inspectorReport}
          onRefresh={() => void refreshInspection()}
          onSignOut={() => void signOutInspection()}
          busy={inspectorBusy}
          error={inspectorError}
        />
      )
    }
    const delayed = windowStatus.delayed ||
      (windowStatus.migration_reopen_at !== null &&
       Date.now() > Date.parse(windowStatus.migration_reopen_at))
    return (
      <div className="min-h-screen bg-[#081224] px-5 py-12 text-white grid place-items-center">
        <main className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-7 shadow-2xl md:p-10">
          <div className="mb-5 inline-flex rounded-lg bg-yellow-400/10 p-3 text-yellow-300">
            <LockKeyhole size={25} aria-hidden="true" />
          </div>
          <div className="text-xs font-bold tracking-widest text-yellow-300">{t.migrationTag}</div>
          <h1 className="mt-3 text-3xl font-bold">
            {t.migrationTitle.replace('{season}', String(windowStatus.target_season ?? 2))}
          </h1>
          <p className="mt-5 text-sm leading-7 text-slate-200">{t.migrationBody}</p>
          <div className="mt-6 flex gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <Clock3 size={20} className="mt-1 shrink-0 text-yellow-300" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-sm text-slate-300">{delayed ? t.delayedTitle : t.migrationReopen}</div>
              {delayed
                ? <p className="mt-2 text-sm text-yellow-200">{t.delayedBody}</p>
                : <strong className="mt-2 block text-base">{formatForViewer(windowStatus.migration_reopen_at)}</strong>}
              {!delayed && <small className="mt-1 block text-xs text-slate-400">{t.timeZone}</small>}
            </div>
          </div>
          <p className="mt-6 flex gap-2 text-xs leading-6 text-slate-300">
            <ShieldCheck size={17} className="shrink-0 text-yellow-300" aria-hidden="true" />
            {t.preserved}
          </p>
          <div className="mt-6 border-t border-white/10 pt-5">
            <button type="button" onClick={() => { setInspectorLoginOpen(v => !v); setInspectorError(null) }}
              className="text-sm font-semibold text-slate-200 underline underline-offset-4 hover:text-white">
              Administrator inspection sign-in
            </button>
            {inspectorLoginOpen && (
              <form onSubmit={e => void signInForInspection(e)} className="mt-4 grid gap-3" aria-label="Authorized migration inspection sign-in">
                <p className="text-xs leading-5 text-slate-300">
                  Only existing accounts specifically authorized for inspection can sign in.
                  The game stays closed. This access is read-only.
                </p>
                <label htmlFor="cycling-inspector-email" className="text-xs font-semibold text-slate-200">Account email</label>
                <input id="cycling-inspector-email" type="email" autoComplete="username" required
                  value={inspectorEmail} onChange={e => setInspectorEmail(e.target.value)}
                  disabled={inspectorBusy} className="rounded-lg bg-white px-3 py-2 text-sm text-slate-900" />
                <label htmlFor="cycling-inspector-password" className="text-xs font-semibold text-slate-200">Password</label>
                <input id="cycling-inspector-password" type="password" autoComplete="current-password" required
                  value={inspectorPassword} onChange={e => setInspectorPassword(e.target.value)}
                  disabled={inspectorBusy} className="rounded-lg bg-white px-3 py-2 text-sm text-slate-900" />
                {inspectorError && <p role="alert" className="text-sm text-amber-200">{inspectorError}</p>}
                <button type="submit" disabled={inspectorBusy}
                  className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">
                  {inspectorBusy ? 'Verifying access…' : 'Open read-only inspection'}
                </button>
              </form>
            )}
          </div>
        </main>
      </div>
    )
  }

  const modalKey = windowStatus.phase === 'preparation'
    ? [windowStatus.target_season,windowStatus.resume_at].join(':') : null
  const showPreparation = Boolean(modalKey && dismissed !== modalKey)
  const resumeFormatted = formatForViewer(windowStatus.resume_at)

  return (
    <WindowContext.Provider value={windowStatus}>
      {windowStatus.preparation_active && (
        <div role="status" className="flex flex-wrap items-center justify-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-950">
          <CalendarClock size={16} aria-hidden="true" />
          {t.paused.replace('{season}', String(windowStatus.target_season ?? 2))}
          <span>{resumeFormatted}</span>
        </div>
      )}
      {children}
      {showPreparation && (
        <div className="fixed inset-0 z-[2000] grid place-items-center overflow-y-auto bg-slate-950/75 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="cycling-preseason-title"
            className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl md:p-9">
            <CalendarClock size={30} className="text-blue-700" aria-hidden="true" />
            <p className="mt-4 text-xs font-bold tracking-widest text-blue-700">{t.preparingTag}</p>
            <h2 id="cycling-preseason-title" className="mt-2 text-2xl font-bold">
              {t.preparingTitle.replace('{season}',String(windowStatus.target_season ?? 2))}
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-700">{t.preparingBody}</p>
            <div className="mt-5 flex gap-3 border-l-4 border-blue-600 bg-slate-50 p-4">
              <Clock3 size={20} className="shrink-0 text-blue-700" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">{t.resumes}</p>
                <p className="mt-1 text-sm">{resumeFormatted}</p>
                <small className="text-xs text-slate-500">{t.timeZone}</small>
              </div>
            </div>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link to="/dashboard/calendar" onClick={() => setDismissed(modalKey)}
                className="rounded-lg bg-blue-700 px-4 py-3 text-center text-sm font-bold text-white hover:bg-blue-800">
                {t.calendar}
              </Link>
              <button type="button" onClick={() => setDismissed(modalKey)}
                className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-100">
                {t.continue}
              </button>
            </div>
          </section>
        </div>
      )}
    </WindowContext.Provider>
  )
}
