import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  CalendarDays,
  Crown,
  GraduationCap,
  History,
  Search,
  Settings,
  Trophy,
  UserCog,
  Users,
  WalletCards,
  Wrench,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type AcademyRider = {
  id: string
  display_name: string
  country_code: string
  age: number
  role: string
  assessment_band: string
  development_focus: string
  workload: string
  readiness: number
  fatigue: number
  status: string
  stipend_weekly: number
}

type AcademyStaff = {
  id: string
  role_type: string
  staff_name: string
  country_code: string
  expertise: number
  experience: number
  potential: number
  leadership: number
  efficiency: number
  salary_weekly: number
}

type ScoutingProgram = {
  range_code: 'local' | 'regional' | 'continental' | 'world'
  label: string
  season_cost: number
  sort_order: number
}

type AcademyPayload = {
  premium: boolean
  activated: boolean
  read_only?: boolean
  club_id: string
  club_name: string
  country_code: string
  capacity: number
  starter_riders?: number
  default_season_budget?: number
  default_scouting_range?: string
  default_scouting_cost?: number
  academy?: {
    id: string
    capacity: number
    active_riders: number
    reputation: number
    activated_season: number
  }
  budget?: {
    season_number: number
    season_budget: number
    spent_amount: number
    committed_amount: number
    scouting_range: 'local' | 'regional' | 'continental' | 'world'
    scouting_budget: number
  }
  settings?: {
    recruitment_decider: 'manager' | 'academy_director'
    race_entry_decider: 'manager' | 'academy_director'
    race_squad_decider: 'manager' | 'u16_head_coach'
    camp_decider: 'manager' | 'academy_director'
    equipment_decider: 'manager' | 'academy_director'
    recruitment_negotiation_decider: 'manager' | 'academy_director'
  }
  riders?: AcademyRider[]
  staff?: AcademyStaff[]
  scouting_programs?: ScoutingProgram[]
}

type TabKey =
  | 'overview'
  | 'riders'
  | 'staff'
  | 'budget'
  | 'scouting'
  | 'settings'
  | 'calendar'
  | 'rankings'
  | 'equipment'
  | 'history'

const TAB_ICONS: Record<TabKey, React.ComponentType<{ size?: number }>> = {
  overview: GraduationCap,
  riders: Users,
  staff: UserCog,
  budget: WalletCards,
  scouting: Search,
  settings: Settings,
  calendar: CalendarDays,
  rankings: Trophy,
  equipment: Wrench,
  history: History,
}

function money(value: number | null | undefined): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0))
}

function humanize(value: string | null | undefined): string {
  if (!value) return '—'
  return value.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function flagUrl(code: string | null | undefined): string | null {
  const safe = String(code ?? '').trim().toLowerCase()
  return /^[a-z]{2}$/.test(safe) ? `https://flagcdn.com/w40/${safe}.png` : null
}

function Card({
  title,
  children,
  right,
}: {
  title: string
  children: React.ReactNode
  right?: React.ReactNode
}): JSX.Element {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export default function YouthAcademyPage(): JSX.Element {
  const { t } = useTranslation('youthAcademy')
  const [data, setData] = useState<AcademyPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('overview')
  const [activationBudget, setActivationBudget] = useState(100000)
  const [draftBudget, setDraftBudget] = useState(100000)
  const [draftRange, setDraftRange] =
    useState<'local' | 'regional' | 'continental' | 'world'>('local')
  const [draftSettings, setDraftSettings] = useState<AcademyPayload['settings']>()

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const { data: payload, error: loadError } = await supabase.rpc(
        'get_my_youth_academy_v1'
      )
      if (loadError) throw loadError
      const next = payload as AcademyPayload
      setData(next)
      setActivationBudget(Number(next.default_season_budget ?? 100000))
      setDraftBudget(Number(next.budget?.season_budget ?? next.default_season_budget ?? 100000))
      setDraftRange(next.budget?.scouting_range ?? 'local')
      setDraftSettings(next.settings)
    } catch (loadError: any) {
      console.error('Youth Academy load failed:', loadError)
      setError(loadError?.message ?? t('errors.load'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const activate = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const { data: payload, error: activateError } = await supabase.rpc(
        'activate_my_youth_academy_v1',
        { p_season_budget: Math.max(0, Math.round(activationBudget)) }
      )
      if (activateError) throw activateError
      const next = payload as AcademyPayload
      setData(next)
      setDraftBudget(Number(next.budget?.season_budget ?? activationBudget))
      setDraftRange(next.budget?.scouting_range ?? 'local')
      setDraftSettings(next.settings)
    } catch (activateError: any) {
      console.error('Youth Academy activation failed:', activateError)
      setError(activateError?.message ?? t('errors.activate'))
    } finally {
      setSaving(false)
    }
  }

  const saveSettings = async (): Promise<void> => {
    if (!data?.activated || !draftSettings || saving) return
    setSaving(true)
    setError(null)
    try {
      const { data: payload, error: saveError } = await supabase.rpc(
        'update_my_youth_academy_settings_v1',
        {
          p_recruitment_decider: draftSettings.recruitment_decider,
          p_race_entry_decider: draftSettings.race_entry_decider,
          p_race_squad_decider: draftSettings.race_squad_decider,
          p_camp_decider: draftSettings.camp_decider,
          p_equipment_decider: draftSettings.equipment_decider,
          p_recruitment_negotiation_decider:
            draftSettings.recruitment_negotiation_decider,
          p_scouting_range: draftRange,
          p_season_budget: Math.max(0, Math.round(draftBudget)),
        }
      )
      if (saveError) throw saveError
      const next = payload as AcademyPayload
      setData(next)
      setDraftBudget(Number(next.budget?.season_budget ?? draftBudget))
      setDraftRange(next.budget?.scouting_range ?? draftRange)
      setDraftSettings(next.settings)
    } catch (saveError: any) {
      console.error('Youth Academy settings save failed:', saveError)
      setError(saveError?.message ?? t('errors.save'))
    } finally {
      setSaving(false)
    }
  }

  const riders = data?.riders ?? []
  const staff = data?.staff ?? []
  const programs = data?.scouting_programs ?? []
  const academyDirector = staff.find(member => member.role_type === 'youth_academy_director')
  const headCoach = staff.find(member => member.role_type === 'u16_head_coach')
  const youthScout = staff.find(member => member.role_type === 'youth_scout')
  const currentProgram = programs.find(program => program.range_code === draftRange)

  const availableBudget = useMemo(() => {
    const budget = Number(data?.budget?.season_budget ?? 0)
    const spent = Number(data?.budget?.spent_amount ?? 0)
    const committed = Number(data?.budget?.committed_amount ?? 0)
    return Math.max(0, budget - spent - committed)
  }, [data?.budget])

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">{t('loading')}</div>
  }

  if (!data) {
    return <div className="p-6 text-sm text-red-700">{error ?? t('errors.load')}</div>
  }

  if (!data.premium) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-amber-700">
            <Crown size={20} />
            <span className="font-semibold">{t('premium.title')}</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            {t('premium.description')}
          </p>
          <ul className="mt-4 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
            <li>• {t('premium.capacity')}</li>
            <li>• {t('premium.localStart')}</li>
            <li>• {t('premium.staff')}</li>
            <li>• {t('premium.scouting')}</li>
          </ul>
          <Link
            to="/dashboard/pro"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"
          >
            <Crown size={16} />
            {t('premium.openPremium')}
          </Link>
        </div>
      </div>
    )
  }

  if (!data.activated) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <GraduationCap size={22} />
            <h2 className="text-lg font-semibold">{t('activation.title')}</h2>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            {t('activation.description')}
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              [t('activation.capacityLabel'), '16'],
              [t('activation.starterRidersLabel'), '6'],
              [t('activation.staffLabel'), '2'],
              [t('activation.infrastructureLabel'), t('activation.none')],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {label}
                </div>
                <div className="mt-2 text-xl font-semibold text-slate-950">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 max-w-sm">
            <label className="text-sm font-medium text-slate-800">
              {t('activation.seasonBudget')}
            </label>
            <input
              type="number"
              min={0}
              step={5000}
              value={activationBudget}
              onChange={event => setActivationBudget(Number(event.target.value || 0))}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">
              {t('activation.budgetHelp')}
            </p>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            disabled={saving}
            onClick={() => void activate()}
            className="mt-5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? t('activation.activating') : t('activation.activate')}
          </button>
        </div>
      </div>
    )
  }

  const tabKeys: TabKey[] = [
    'overview',
    'riders',
    'staff',
    'budget',
    'scouting',
    'settings',
    'calendar',
    'rankings',
    'equipment',
    'history',
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-950">{t('title')}</h1>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
              Premium
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {data.club_name} · {t('header.capacity', {
              current: data.academy?.active_riders ?? riders.length,
              max: 16,
            })}
          </p>
        </div>
        {data.read_only ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('readOnly')}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {tabKeys.map(key => {
          const Icon = TAB_ICONS[key]
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                tab === key
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              <Icon size={15} />
              {t(`tabs.${key}`)}
            </button>
          )
        })}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {tab === 'overview' ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card title={t('overview.budget')}>
            <div className="text-2xl font-semibold">{money(availableBudget)}</div>
            <div className="mt-1 text-xs text-slate-500">
              {t('overview.ofSeasonBudget', {
                value: money(data.budget?.season_budget),
              })}
            </div>
          </Card>
          <Card title={t('overview.roster')}>
            <div className="text-2xl font-semibold">{riders.length}/16</div>
            <div className="mt-1 text-xs text-slate-500">{t('overview.fixedCapacity')}</div>
          </Card>
          <Card title={t('overview.scouting')}>
            <div className="text-2xl font-semibold">{humanize(data.budget?.scouting_range)}</div>
            <div className="mt-1 text-xs text-slate-500">
              {money(data.budget?.scouting_budget)} {t('overview.perSeason')}
            </div>
          </Card>

          <div className="xl:col-span-2">
            <Card title={t('overview.directorReport')}>
              <p className="text-sm leading-6 text-slate-600">
                {academyDirector
                  ? t('overview.directorReady', { name: academyDirector.staff_name })
                  : t('overview.directorMissing')}
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">{t('overview.nextRace')}</div>
                  <div className="mt-1 text-sm font-medium">{t('comingSoon')}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">{t('overview.recruitment')}</div>
                  <div className="mt-1 text-sm font-medium">{humanize(data.budget?.scouting_range)}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">{t('overview.reputation')}</div>
                  <div className="mt-1 text-sm font-medium">{data.academy?.reputation ?? 0}</div>
                </div>
              </div>
            </Card>
          </div>

          <Card title={t('overview.staff')}>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">{t('roles.director')}</div>
                <div className="font-medium">{academyDirector?.staff_name ?? t('notAssigned')}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{t('roles.headCoach')}</div>
                <div className="font-medium">{headCoach?.staff_name ?? t('notAssigned')}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{t('roles.scout')}</div>
                <div className="font-medium">{youthScout?.staff_name ?? t('optionalNotHired')}</div>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'riders' ? (
        <Card
          title={t('riders.title')}
          right={<span className="text-xs text-slate-500">{riders.length}/16</span>}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3">{t('riders.rider')}</th>
                  <th className="py-2 pr-3">{t('riders.age')}</th>
                  <th className="py-2 pr-3">{t('riders.role')}</th>
                  <th className="py-2 pr-3">{t('riders.assessment')}</th>
                  <th className="py-2 pr-3">{t('riders.focus')}</th>
                  <th className="py-2 pr-3">{t('riders.readiness')}</th>
                  <th className="py-2">{t('riders.stipend')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {riders.map(rider => {
                  const flag = flagUrl(rider.country_code)
                  return (
                    <tr key={rider.id}>
                      <td className="py-3 pr-3 font-medium">
                        <div className="flex items-center gap-2">
                          {flag ? <img src={flag} alt="" className="h-4 w-6 object-cover" /> : null}
                          {rider.display_name}
                        </div>
                      </td>
                      <td className="py-3 pr-3">{rider.age}</td>
                      <td className="py-3 pr-3">{humanize(rider.role)}</td>
                      <td className="py-3 pr-3">{rider.assessment_band}</td>
                      <td className="py-3 pr-3">{humanize(rider.development_focus)}</td>
                      <td className="py-3 pr-3">{rider.readiness}%</td>
                      <td className="py-3">{money(rider.stipend_weekly)}/{t('week')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">{t('riders.potentialNote')}</p>
        </Card>
      ) : null}

      {tab === 'staff' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            ['youth_academy_director', t('roles.director'), academyDirector],
            ['u16_head_coach', t('roles.headCoach'), headCoach],
            ['youth_scout', t('roles.scout'), youthScout],
          ].map(([role, label, member]) => {
            const staffMember = member as AcademyStaff | undefined
            return (
              <Card key={String(role)} title={String(label)}>
                {staffMember ? (
                  <div className="space-y-2 text-sm">
                    <div className="font-semibold text-slate-900">{staffMember.staff_name}</div>
                    <div className="text-slate-500">
                      {t('staff.expertise')}: {staffMember.expertise}
                    </div>
                    <div className="text-slate-500">
                      {t('staff.experience')}: {staffMember.experience}
                    </div>
                    <div className="text-slate-500">
                      {t('staff.salary')}: {money(staffMember.salary_weekly)}/{t('week')}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">
                    {role === 'youth_scout' ? t('staff.scoutOptional') : t('notAssigned')}
                  </div>
                )}
                <Link
                  to="/dashboard/staff"
                  className="mt-4 inline-flex text-xs font-medium text-slate-700 underline"
                >
                  {t('staff.openStaffPage')}
                </Link>
              </Card>
            )
          })}
        </div>
      ) : null}

      {tab === 'budget' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('budget.title')}>
            <label className="text-sm font-medium">{t('budget.seasonBudget')}</label>
            <input
              type="number"
              min={0}
              step={5000}
              value={draftBudget}
              disabled={data.read_only}
              onChange={event => setDraftBudget(Number(event.target.value || 0))}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">{t('budget.spent')}</div>
                <div className="font-medium">{money(data.budget?.spent_amount)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{t('budget.committed')}</div>
                <div className="font-medium">{money(data.budget?.committed_amount)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{t('budget.available')}</div>
                <div className="font-medium">{money(availableBudget)}</div>
              </div>
            </div>
          </Card>
          <Card title={t('budget.scoutingAllocation')}>
            <div className="text-2xl font-semibold">{money(currentProgram?.season_cost)}</div>
            <p className="mt-2 text-sm text-slate-500">
              {t('budget.scoutingHelp', { range: humanize(draftRange) })}
            </p>
          </Card>
        </div>
      ) : null}

      {tab === 'scouting' ? (
        <Card title={t('scouting.title')}>
          <p className="text-sm text-slate-600">{t('scouting.description')}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {programs.map(program => (
              <button
                key={program.range_code}
                type="button"
                disabled={data.read_only}
                onClick={() => setDraftRange(program.range_code)}
                className={`rounded-xl border p-4 text-left ${
                  draftRange === program.range_code
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="font-semibold">{t(`scouting.ranges.${program.range_code}`)}</div>
                <div className="mt-1 text-sm text-slate-500">{money(program.season_cost)}</div>
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">{t('scouting.skillNote')}</p>
        </Card>
      ) : null}

      {tab === 'settings' && draftSettings ? (
        <Card title={t('settings.title')}>
          <p className="mb-4 text-sm text-slate-600">{t('settings.description')}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['recruitment_decider', t('settings.recruitment'), ['manager', 'academy_director']],
              ['race_entry_decider', t('settings.raceEntry'), ['manager', 'academy_director']],
              ['race_squad_decider', t('settings.raceSquad'), ['manager', 'u16_head_coach']],
              ['camp_decider', t('settings.camps'), ['manager', 'academy_director']],
              ['equipment_decider', t('settings.equipment'), ['manager', 'academy_director']],
              [
                'recruitment_negotiation_decider',
                t('settings.negotiations'),
                ['manager', 'academy_director'],
              ],
            ].map(([key, label, options]) => (
              <label key={String(key)} className="text-sm">
                <span className="font-medium text-slate-800">{String(label)}</span>
                <select
                  disabled={data.read_only}
                  value={String(draftSettings[key as keyof typeof draftSettings])}
                  onChange={event =>
                    setDraftSettings(current =>
                      current
                        ? {
                            ...current,
                            [String(key)]: event.target.value,
                          } as typeof current
                        : current
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {(options as string[]).map(option => (
                    <option key={option} value={option}>
                      {t(`settings.options.${option}`)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </Card>
      ) : null}

      {['calendar', 'rankings', 'equipment', 'history'].includes(tab) ? (
        <Card title={t(`tabs.${tab}`)}>
          <p className="text-sm leading-6 text-slate-600">
            {t(`placeholders.${tab}`)}
          </p>
        </Card>
      ) : null}

      {['budget', 'scouting', 'settings'].includes(tab) ? (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving || data.read_only}
            onClick={() => void saveSettings()}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
