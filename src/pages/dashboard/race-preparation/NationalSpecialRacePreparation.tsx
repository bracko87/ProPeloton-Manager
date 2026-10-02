import React, { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import NationalSpecialStagePlanV3 from './NationalSpecialStagePlanV3'

export type NationalTeamListEvent = {
  kind: 'national_team'
  event_id: string
  season_number: number
  round_label: string
  round_type: string
  group_label: string
  race_day: number
  race_type: string
  event_date: string
  event_status: string
  race_id?: string | null
  stage_id?: string | null
  host_country_code?: string | null
  setup_window_opens_on: string
  lineup_deadline_on: string
  test_override?: boolean
  special_plan_status?: string | null
  can_manage: boolean
  association_id: string
  country_code: string
  squad?: { squad_id: string; status: string; squad_size: number } | null
  lineup?: { lineup_id: string; status: string; rider_ids: string[] } | null
}

export type NationalRankingListEvent = {
  kind: 'national_individual'
  event_key: string
  edition_id: string
  season_number: number
  country_code: string
  event_type: string
  event_date: string
  status: string
  heat_id?: string | null
  heat_number?: number | null
  race_id?: string | null
  setup_window_opens_on: string
  riders: Array<{ rider_id: string; rider_name: string }>
  is_preview?: boolean
  special_plan_status?: string | null
}

export type NationalSpecialSelection =
  | { kind: 'national_team'; event: NationalTeamListEvent; submitted?: boolean }
  | { kind: 'national_ranking'; event: NationalRankingListEvent; submitted?: boolean }

type PlanRider = {
  rider_id: string
  rider_name: string
  club_name?: string | null
  role?: string | null
  fatigue?: number | null
  race_sharpness?: number | null
  national_rank?: number | null
}

type TeamCar = {
  id: string
  display_name: string
  asset_level?: number | null
  condition_percent?: number | null
  support_value?: number | null
}

type TeamWorkspace = {
  kind: 'national_team'
  event_id: string
  season_number: number
  round_label: string
  group_label: string
  race_day: number
  race_type: string
  event_date: string
  host_country_code?: string | null
  setup_window_opens_on: string
  lineup_deadline_on: string
  test_override?: boolean
  squad_id: string
  race_id?: string | null
  stage_id?: string | null
  race_preparation_id?: string | null
  plan_status: string
  selected_rider_ids: string[]
  selected_team_car_ids: string[]
  riders: PlanRider[]
  team_cars: TeamCar[]
}

type RankingWorkspace = {
  kind: 'national_ranking'
  edition_id: string
  event_type: string
  heat_id?: string | null
  event_key: string
  event_date: string
  country_code: string
  race_id?: string | null
  stage_id?: string | null
  race_preparation_id?: string | null
  plan_status: string
  preview_only: boolean
  riders: PlanRider[]
  setup_window_opens_on: string
  rider_submission_deadline_on: string
}

type Workspace = TeamWorkspace | RankingWorkspace

const COMMAND_OPTIONS = [
  ['ride_naturally', 'Ride naturally'],
  ['conserve_energy', 'Conserve energy'],
  ['stay_near_front', 'Stay near front'],
  ['join_breakaway', 'Join breakaway'],
  ['attack', 'Attack'],
  ['chase_breakaway', 'Chase breakaway'],
  ['climb_hard', 'Climb hard'],
  ['sprint', 'Sprint'],
  ['avoid_risks', 'Avoid risks'],
] as const

const ROAD_ROLES = [
  ['team_leader_gc', 'Team leader'],
  ['sprinter', 'Sprinter'],
  ['lead_out_rider', 'Lead-out rider'],
  ['climber', 'Climber'],
  ['mountain_domestique', 'Mountain domestique'],
  ['helper_domestique', 'Helper / domestique'],
  ['breakaway_rider', 'Breakaway rider'],
  ['rouleur', 'Rouleur'],
  ['protected_rider', 'Protected rider'],
  ['free_role', 'Free role'],
] as const

const ROAD_STRATEGIES = [
  ['balanced', 'Balanced'],
  ['aggressive', 'Aggressive'],
  ['sprint_control', 'Sprint control'],
  ['breakaway', 'Breakaway support'],
  ['gc_protection', 'Leader protection'],
] as const

const TTT_STRATEGIES = [
  ['tt_balanced_pace', 'Balanced pace'],
  ['tt_fast_start', 'Fast start'],
  ['tt_negative_split', 'Negative split'],
  ['tt_all_out', 'All out'],
] as const

function dateLabel(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { day: '2-digit', month: 'long', timeZone: 'UTC' })
}

function countryName(code?: string | null): string {
  const normalized = code?.trim().toUpperCase()
  if (!normalized) return '—'
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(normalized) ?? normalized
  } catch {
    return normalized
  }
}

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w40/${normalized}.png`
    : null
}

function raceTypeLabel(value: string): string {
  if (value === 'team_time_trial') return 'Team Time Trial'
  if (value === 'flat_road_race') return 'Flat Road Race'
  return 'Hilly / Mountain Road Race'
}

function roleLabel(value?: string | null): string {
  if (!value) return 'Rider'
  return value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function emptyCommands(): Record<string, { phase_1: { command: string }; phase_2: { command: string }; phase_3: { command: string }; phase_4: { command: string } }> {
  return {}
}

function defaultRiderCommands() {
  return {
    phase_1: { command: 'ride_naturally' },
    phase_2: { command: 'ride_naturally' },
    phase_3: { command: 'ride_naturally' },
    phase_4: { command: 'ride_naturally' },
  }
}

async function loadWorkspace(selection: NationalSpecialSelection): Promise<Workspace> {
  if (selection.kind === 'national_team') {
    const { data, error } = await supabase.rpc('get_my_national_team_race_plan_workspace_v2', {
      p_event_id: selection.event.event_id,
    })
    if (error) throw error
    return data as TeamWorkspace
  }

  const { data, error } = await supabase.rpc('get_my_national_championship_race_plan_workspace_v2', {
    p_edition_id: selection.event.edition_id,
    p_event_type: selection.event.event_type,
    p_heat_id: selection.event.heat_id ?? null,
    p_preview_rider_ids: selection.event.riders.map(r => r.rider_id),
  })
  if (error) throw error
  return data as RankingWorkspace
}

function PlanHeader({ workspace }: { workspace: Workspace }): JSX.Element {
  const team = workspace.kind === 'national_team'
  const name = team
    ? `${workspace.round_label} · ${workspace.group_label} · ${raceTypeLabel(workspace.race_type)}`
    : `${countryName(workspace.country_code)} National Championship · ${workspace.event_type === 'final' ? 'Final' : 'Qualification'}`
  const code = team ? workspace.host_country_code : workspace.country_code
  const flag = flagUrl(code)

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected race</div>
          <div className="mt-2 flex items-center gap-2">
            {flag ? <img src={flag} alt="" className="h-5 w-7 rounded-sm border border-slate-200 object-cover" /> : null}
            <h2 className="text-xl font-bold text-slate-950">{name}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${team ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {team ? 'National Team' : 'National Ranking'}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-700">
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              Race date: <strong>{dateLabel(workspace.event_date)}</strong>
            </span>
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              Riders: <strong>{team ? '7 / 10' : `${workspace.riders.length} fixed`}</strong>
            </span>
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              Host: <strong>{countryName(code)}</strong>
            </span>
          </div>
        </div>
        <div className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-800">
          {workspace.plan_status === 'submitted' ? 'Race Plan Submitted' : 'Race Plan Open'}
        </div>
      </div>

      <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5 md:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="text-xs text-slate-500">Race Plan opens</div>
          <div className="mt-1 font-semibold text-slate-950">{dateLabel(workspace.setup_window_opens_on)}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="text-xs text-slate-500">Rider deadline</div>
          <div className="mt-1 font-semibold text-slate-950">
            {dateLabel(workspace.kind === 'national_team' ? workspace.lineup_deadline_on : workspace.rider_submission_deadline_on)}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="text-xs text-slate-500">Stages</div>
          <div className="mt-1 font-semibold text-slate-950">1</div>
        </div>
      </div>
    </section>
  )
}

function LockedStaffCard(): JSX.Element {
  const roles = ['Sport Director', 'Team Doctor', 'Physio', 'Mechanic']
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">2. Race Staff</h3>
      <p className="mt-1 text-sm text-slate-500">National races do not use club race staff.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {roles.map(role => (
          <label key={role} className="block opacity-55">
            <span className="text-sm font-medium text-slate-600">{role}</span>
            <select disabled className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500">
              <option>Not used for this race</option>
            </select>
          </label>
        ))}
      </div>
    </section>
  )
}

function CostCard({
  saving,
  canSubmit,
  showSave,
  onSave,
  onSubmit,
}: {
  saving: boolean
  canSubmit: boolean
  showSave: boolean
  onSave: () => void
  onSubmit: () => void
}): JSX.Element {
  return (
    <aside className="space-y-6">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-950">Cost Preview</h3>
        <div className="mt-5 space-y-3 text-sm">
          {['Travel tickets','Accommodation','Asset transport','Team logistics & operations'].map(label => (
            <div key={label} className="flex justify-between"><span>{label}</span><span>$0</span></div>
          ))}
          <div className="flex justify-between border-t pt-3 text-base font-bold"><span>Total</span><span>$0</span></div>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          National race costs are system-covered. Submitting the Race Plan confirms the sporting setup only.
        </div>
        <div className="mt-5 flex flex-col gap-2">
          {showSave ? (
            <button type="button" disabled={saving} onClick={onSave} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Race Plan'}
            </button>
          ) : null}
          <button type="button" disabled={saving || !canSubmit} onClick={onSubmit} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Submitting…' : 'Submit Race Plan'}
          </button>
        </div>
      </section>
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-950">Validation</h3>
        <div className={`mt-4 rounded-xl px-3 py-2 text-sm ${canSubmit ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
          {canSubmit ? 'Race Plan is ready to submit.' : 'Complete the required rider selection before submitting.'}
        </div>
      </section>
    </aside>
  )
}

export function NationalSpecialRacePlan({
  selection,
  onSubmitted,
  onOpenStagePlans,
}: {
  selection: NationalSpecialSelection
  onSubmitted: (selection: NationalSpecialSelection) => void
  onOpenStagePlans: () => void
}): JSX.Element {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [selectedRiders, setSelectedRiders] = useState<string[]>([])
  const [selectedCars, setSelectedCars] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const next = await loadWorkspace(selection)
    setWorkspace(next)
    if (next.kind === 'national_team') {
      setSelectedRiders(next.selected_rider_ids ?? [])
      setSelectedCars(next.selected_team_car_ids ?? [])
    } else {
      setSelectedRiders(next.riders.map(r => r.rider_id))
      setSelectedCars([])
    }
  }

  useEffect(() => {
    setWorkspace(null)
    setMessage(null)
    setError(null)
    void load().catch(caught => setError(caught?.message ?? 'Could not load National Race Plan.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.kind, selection.kind === 'national_team' ? selection.event.event_id : selection.event.event_key])

  const canSubmit = workspace?.kind === 'national_team'
    ? selectedRiders.length === 7
    : Boolean(workspace && workspace.riders.length > 0)

  const toggleRider = (riderId: string) => {
    if (workspace?.kind !== 'national_team' || workspace.plan_status === 'submitted') return
    setSelectedRiders(current => {
      if (current.includes(riderId)) return current.filter(id => id !== riderId)
      if (current.length >= 7) return current
      return [...current, riderId]
    })
  }

  const setCarSlot = (slot: number, carId: string) => {
    setSelectedCars(current => {
      const next = [...current]
      while (next.length < 3) next.push('')
      next[slot] = carId
      return next.filter((id, index, array) => !id || array.indexOf(id) === index)
    })
  }

  const saveTeam = async (submit: boolean) => {
    if (workspace?.kind !== 'national_team') return
    setSaving(true); setError(null); setMessage(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('save_my_national_team_race_plan_v2', {
        p_event_id: workspace.event_id,
        p_rider_ids: selectedRiders,
        p_team_car_ids: selectedCars.filter(Boolean),
        p_submit: submit,
      })
      if (rpcError) throw rpcError
      setMessage(submit ? 'Race Plan submitted. Stage Plans are now available.' : 'Race Plan draft saved.')
      await load()
      if (submit) {
        onSubmitted({ ...selection, submitted: true })
        onOpenStagePlans()
      }
      return data
    } catch (caught: any) {
      setError(caught?.message ?? 'Could not save National Team Race Plan.')
    } finally {
      setSaving(false)
    }
  }

  const submitRanking = async () => {
    if (workspace?.kind !== 'national_ranking') return
    setSaving(true); setError(null); setMessage(null)
    try {
      const { error: rpcError } = await supabase.rpc('submit_my_national_championship_race_plan_v2', {
        p_edition_id: workspace.edition_id,
        p_event_type: workspace.event_type,
        p_heat_id: workspace.heat_id ?? null,
        p_preview_rider_ids: workspace.riders.map(r => r.rider_id),
      })
      if (rpcError) throw rpcError
      setMessage('Race Plan submitted. Stage Plans are now available.')
      await load()
      onSubmitted({ ...selection, submitted: true })
      onOpenStagePlans()
    } catch (caught: any) {
      setError(caught?.message ?? 'Could not submit National Ranking Race Plan.')
    } finally {
      setSaving(false)
    }
  }

  if (!workspace) {
    return <div className="rounded-2xl border bg-white p-6 shadow-sm">{error ?? 'Loading National Race Plan…'}</div>
  }

  const teamMode = workspace.kind === 'national_team'

  return (
    <div className="space-y-6">
      <PlanHeader workspace={workspace} />

      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">1. Riders</h3>
            <div className="mt-1 text-sm text-slate-600">
              {teamMode
                ? `Selected riders: ${selectedRiders.length} · Required: 7 · confirmed National Team squad: 10`
                : `Automatically selected riders: ${workspace.riders.length}. Rider selection is locked for National Ranking races.`}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {workspace.riders.map(rider => {
                const selected = selectedRiders.includes(rider.rider_id)
                return (
                  <button
                    key={rider.rider_id}
                    type="button"
                    disabled={!teamMode || workspace.plan_status === 'submitted'}
                    onClick={() => toggleRider(rider.rider_id)}
                    className={[
                      'rounded-xl border p-4 text-left transition',
                      selected ? 'border-yellow-400 bg-yellow-50' : 'border-slate-200 bg-white',
                      !teamMode ? 'cursor-default' : 'hover:border-yellow-300',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-950">{rider.rider_name}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {roleLabel(rider.role)}{rider.club_name ? ` · ${rider.club_name}` : ''}
                          {rider.national_rank ? ` · National rank #${rider.national_rank}` : ''}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          Fatigue: {Math.round(Number(rider.fatigue ?? 0))} · Sharpness: {Math.round(Number(rider.race_sharpness ?? 0))}
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${selected ? 'bg-yellow-200 text-yellow-900' : 'bg-slate-100 text-slate-500'}`}>
                        {selected ? 'Selected' : 'Not selected'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <LockedStaffCard />

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">3. Race Assets</h3>
            <p className="mt-1 text-sm text-slate-500">
              {teamMode
                ? 'Only the three National Team car slots are available. All other race assets are disabled.'
                : 'National Ranking races use organizer resources. Club race assets are not used.'}
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {['Team Bus','Equipment Van','Mobile Workshop','Medical Van'].map(label => (
                <label key={label} className="block opacity-55">
                  <span className="text-sm font-medium text-slate-600">{label}</span>
                  <select disabled className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500">
                    <option>Not used for this race</option>
                  </select>
                </label>
              ))}
              {[0,1,2].map(slot => (
                <label key={slot} className={`block ${teamMode ? '' : 'opacity-55'}`}>
                  <span className="text-sm font-medium text-slate-700">Team Car {slot + 1}</span>
                  <select
                    disabled={!teamMode || workspace.plan_status === 'submitted'}
                    value={selectedCars[slot] ?? ''}
                    onChange={event => setCarSlot(slot,event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="">{teamMode ? 'No car selected' : 'Organizer supplied'}</option>
                    {teamMode ? workspace.team_cars.map(car => (
                      <option key={car.id} value={car.id} disabled={selectedCars.includes(car.id) && selectedCars[slot] !== car.id}>
                        {car.display_name} · Level {car.asset_level ?? 1} · {Math.round(Number(car.condition_percent ?? 100))}% condition
                      </option>
                    )) : null}
                  </select>
                </label>
              ))}
            </div>
          </section>
        </div>

        <CostCard
          saving={saving}
          canSubmit={canSubmit}
          showSave={teamMode}
          onSave={() => void saveTeam(false)}
          onSubmit={() => teamMode ? void saveTeam(true) : void submitRanking()}
        />
      </section>
    </div>
  )
}

export function NationalSpecialStagePlan({
  selection,
}: {
  selection: NationalSpecialSelection
}): JSX.Element {
  return <NationalSpecialStagePlanV3 selection={selection} />
}
