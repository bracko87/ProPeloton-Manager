import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

type PolicyState = Record<string, string>

type AccessRow = {
  club_id: string
  is_premium: boolean
  coin_balance: number
  free_slots: number
  premium_slots: number
  absolute_max_slots: number
  effective_slots: number
  highest_permanent_slot: number
  permanently_unlocked_slots: number[]
  coin_cost: number
}

type PresetRow = {
  id: string
  slot_number: number
  preset_name: string
  policy_json: PolicyState
  created_at: string
  updated_at: string
}

type ScheduleRow = {
  id: string
  preset_id: string
  preset_name: string
  scheduled_game_date: string
  is_enabled: boolean
  status: 'scheduled' | 'applied' | 'cancelled' | 'failed'
  applied_at: string | null
  failure_reason: string | null
}

type PlanningSnapshot = {
  current_balance: number
  monthly_recurring_cost: number
  upcoming_trip_cost: number
  projected_month_end_balance: number
  cash_reserve_target: number
  monthly_policy_budget: number
  reserve_shortfall: number
  budget_overrun: number
  warnings: string[]
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

function normalizePolicyState(value: unknown): PolicyState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.entries(value as Record<string, unknown>).reduce<PolicyState>(
    (acc, [key, raw]) => {
      if (typeof raw === 'string') acc[key] = raw
      return acc
    },
    {},
  )
}

function PremiumLockedPanel(): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Premium
        </span>
        <span aria-hidden="true" className="text-sm text-slate-500">
          🔒
        </span>
      </div>

      <div className="mt-3 text-base font-semibold text-slate-900">
        Finance Planning Centre
      </div>
      <div className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
        Unlock cash-flow forecasts, budget warnings, automatic policy schedules,
        and four included policy preset slots. All policy levels remain available
        manually to every player.
      </div>

      <button
        type="button"
        onClick={() => {
          if (typeof window !== 'undefined') {
            window.location.hash = '#/dashboard/pro'
          }
        }}
        className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
      >
        Unlock with Premium
      </button>
    </div>
  )
}

export function FinancePlanningCentre({
  clubId,
  policyState,
  onLoadPreset,
  onPoliciesApplied,
}: {
  clubId: string
  policyState: PolicyState
  onLoadPreset: (nextState: PolicyState) => void
  onPoliciesApplied: () => void
}): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [isPremium, setIsPremium] = useState(false)
  const [access, setAccess] = useState<AccessRow | null>(null)
  const [presets, setPresets] = useState<PresetRow[]>([])
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [snapshot, setSnapshot] = useState<PlanningSnapshot | null>(null)
  const [presetName, setPresetName] = useState('')
  const [selectedSlot, setSelectedSlot] = useState(1)
  const [selectedSchedulePresetId, setSelectedSchedulePresetId] = useState('')
  const [scheduledGameDate, setScheduledGameDate] = useState('')
  const [monthlyBudget, setMonthlyBudget] = useState('')
  const [cashReserve, setCashReserve] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load(): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const [accessRes, presetsRes, schedulesRes, snapshotRes] = await Promise.all([
        supabase.rpc('finance_get_policy_preset_access_v1', {
          p_club_id: clubId,
        }),
        supabase.rpc('finance_list_policy_presets_v1', {
          p_club_id: clubId,
        }),
        supabase.rpc('finance_list_policy_schedules_v1', {
          p_club_id: clubId,
        }),
        supabase.rpc('finance_get_policy_planning_snapshot_v1', {
          p_club_id: clubId,
        }),
      ])

      if (accessRes.error) throw accessRes.error
      if (presetsRes.error) throw presetsRes.error
      if (schedulesRes.error) throw schedulesRes.error
      if (snapshotRes.error) throw snapshotRes.error

      const nextAccess = (Array.isArray(accessRes.data)
        ? accessRes.data[0]
        : accessRes.data) as AccessRow | null

      const nextSnapshot = (Array.isArray(snapshotRes.data)
        ? snapshotRes.data[0]
        : snapshotRes.data) as PlanningSnapshot | null

      setAccess(nextAccess)
      setIsPremium(Boolean(nextAccess?.is_premium))
      setPresets((presetsRes.data ?? []) as PresetRow[])
      setSchedules((schedulesRes.data ?? []) as ScheduleRow[])
      setSnapshot(nextSnapshot)
      setMonthlyBudget(
        nextSnapshot?.monthly_policy_budget
          ? String(nextSnapshot.monthly_policy_budget)
          : '',
      )
      setCashReserve(
        nextSnapshot?.cash_reserve_target
          ? String(nextSnapshot.cash_reserve_target)
          : '',
      )

      const firstOpenSlot = Array.from(
        { length: Math.max(nextAccess?.effective_slots ?? 1, 1) },
        (_, index) => index + 1,
      ).find(slot => !(presetsRes.data ?? []).some((row: PresetRow) => row.slot_number === slot))

      setSelectedSlot(firstOpenSlot ?? 1)
      setSelectedSchedulePresetId(
        String((presetsRes.data ?? [])[0]?.id ?? ''),
      )
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Failed to load Finance Planning Centre.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()

    const handlePremiumStatusChanged = () => {
      void load()
    }

    window.addEventListener('premium-status-changed', handlePremiumStatusChanged)
    window.addEventListener('coin-balance-changed', handlePremiumStatusChanged)

    return () => {
      window.removeEventListener('premium-status-changed', handlePremiumStatusChanged)
      window.removeEventListener('coin-balance-changed', handlePremiumStatusChanged)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId])

  const slotNumbers = useMemo(
    () =>
      Array.from(
        { length: Math.max(access?.absolute_max_slots ?? 1, 1) },
        (_, index) => index + 1,
      ),
    [access?.absolute_max_slots],
  )

  async function savePreset(): Promise<void> {
    const name = presetName.trim()
    if (!name) {
      setError('Enter a preset name.')
      return
    }

    setBusyKey('save-preset')
    setError(null)
    setMessage(null)

    try {
      const { error: rpcError } = await supabase.rpc(
        'finance_save_policy_preset_v1',
        {
          p_club_id: clubId,
          p_slot_number: selectedSlot,
          p_preset_name: name,
          p_policy_json: policyState,
        },
      )

      if (rpcError) throw rpcError
      setPresetName('')
      setMessage(`Preset saved in slot ${selectedSlot}.`)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to save preset.')
    } finally {
      setBusyKey(null)
    }
  }

  async function unlockSlot(slotNumber: number): Promise<void> {
    setBusyKey(`unlock:${slotNumber}`)
    setError(null)
    setMessage(null)

    try {
      const { error: rpcError } = await supabase.rpc(
        'finance_unlock_policy_preset_slot_v1',
        {
          p_club_id: clubId,
          p_slot_number: slotNumber,
        },
      )

      if (rpcError) throw rpcError
      window.dispatchEvent(new CustomEvent('coin-balance-changed'))
      setMessage(`Preset slot ${slotNumber} unlocked permanently.`)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to unlock slot.')
    } finally {
      setBusyKey(null)
    }
  }

  async function deletePreset(presetId: string): Promise<void> {
    setBusyKey(`delete:${presetId}`)
    setError(null)

    try {
      const { error: rpcError } = await supabase.rpc(
        'finance_delete_policy_preset_v1',
        {
          p_preset_id: presetId,
        },
      )

      if (rpcError) throw rpcError
      setMessage('Preset deleted.')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to delete preset.')
    } finally {
      setBusyKey(null)
    }
  }

  async function applyPreset(preset: PresetRow): Promise<void> {
    setBusyKey(`apply:${preset.id}`)
    setError(null)
    setMessage(null)

    try {
      onLoadPreset(normalizePolicyState(preset.policy_json))
      setMessage(
        `${preset.preset_name} loaded into the policy form. Review it and click Apply Changes.`,
      )
    } finally {
      setBusyKey(null)
    }
  }

  async function applyPresetImmediately(presetId: string): Promise<void> {
    setBusyKey(`apply-now:${presetId}`)
    setError(null)
    setMessage(null)

    try {
      const { error: rpcError } = await supabase.rpc(
        'finance_apply_policy_preset_v1',
        {
          p_preset_id: presetId,
        },
      )

      if (rpcError) throw rpcError
      setMessage('Preset applied to active club policies.')
      onPoliciesApplied()
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to apply preset.')
    } finally {
      setBusyKey(null)
    }
  }

  async function saveSchedule(): Promise<void> {
    if (!selectedSchedulePresetId || !scheduledGameDate) {
      setError('Select a preset and game date.')
      return
    }

    setBusyKey('save-schedule')
    setError(null)
    setMessage(null)

    try {
      const { error: rpcError } = await supabase.rpc(
        'finance_save_policy_schedule_v1',
        {
          p_club_id: clubId,
          p_preset_id: selectedSchedulePresetId,
          p_scheduled_game_date: scheduledGameDate,
        },
      )

      if (rpcError) throw rpcError
      setScheduledGameDate('')
      setMessage('Automatic policy schedule saved.')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to save schedule.')
    } finally {
      setBusyKey(null)
    }
  }

  async function cancelSchedule(scheduleId: string): Promise<void> {
    setBusyKey(`cancel-schedule:${scheduleId}`)
    setError(null)

    try {
      const { error: rpcError } = await supabase.rpc(
        'finance_cancel_policy_schedule_v1',
        {
          p_schedule_id: scheduleId,
        },
      )

      if (rpcError) throw rpcError
      setMessage('Schedule cancelled.')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to cancel schedule.')
    } finally {
      setBusyKey(null)
    }
  }

  async function savePlanningSettings(): Promise<void> {
    setBusyKey('save-settings')
    setError(null)
    setMessage(null)

    try {
      const { error: rpcError } = await supabase.rpc(
        'finance_save_policy_planning_settings_v1',
        {
          p_club_id: clubId,
          p_monthly_policy_budget: Number(monthlyBudget || 0),
          p_cash_reserve_target: Number(cashReserve || 0),
        },
      )

      if (rpcError) throw rpcError
      setMessage('Finance planning limits saved.')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to save planning limits.')
    } finally {
      setBusyKey(null)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Loading Finance Planning Centre…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Premium
              </span>
              <span className="text-sm text-slate-500">Finance Planning Centre</span>
            </div>
            <h4 className="mt-2 text-lg font-semibold text-slate-900">
              Presets, forecasts and automatic policy scheduling
            </h4>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Policy strength remains equal for all players. Premium adds planning,
              comparison, automation and proactive financial warnings.
            </p>
          </div>

          {access ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Preset slots: {access.effective_slots}/{access.absolute_max_slots} · Coins:{' '}
              {access.coin_balance}
            </div>
          ) : null}
        </div>

        {message ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </div>

      {!isPremium ? <PremiumLockedPanel /> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="font-semibold text-slate-900">Policy presets</div>
        <div className="mt-1 text-sm text-slate-500">
          Free players receive one preset slot. Premium includes four slots. Slots
          up to six can be permanently unlocked for 10 coins each.
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {slotNumbers.map(slotNumber => {
            const preset = presets.find(row => row.slot_number === slotNumber)
            const isActive = slotNumber <= Number(access?.effective_slots ?? 1)
            const premiumCapacity =
              slotNumber > Number(access?.free_slots ?? 1) &&
              slotNumber <= Number(access?.premium_slots ?? 4)

            return (
              <div
                key={slotNumber}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">
                    Slot {slotNumber}
                  </div>
                  {!isActive ? (
                    <span className="text-xs text-slate-400">🔒 Locked</span>
                  ) : preset ? (
                    <span className="text-xs text-emerald-600">Saved</span>
                  ) : (
                    <span className="text-xs text-slate-400">Empty</span>
                  )}
                </div>

                {preset ? (
                  <>
                    <div className="mt-2 truncate text-sm text-slate-700" title={preset.preset_name}>
                      {preset.preset_name}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void applyPreset(preset)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Load
                      </button>
                      {isPremium ? (
                        <button
                          type="button"
                          onClick={() => void applyPresetImmediately(preset.id)}
                          disabled={busyKey === `apply-now:${preset.id}`}
                          className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                        >
                          Apply now
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void deletePreset(preset.id)}
                        disabled={busyKey === `delete:${preset.id}`}
                        className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                ) : isActive ? (
                  <div className="mt-2 text-xs leading-5 text-slate-500">
                    Save the policy selections currently shown below.
                  </div>
                ) : (
                  <>
                    <div className="mt-2 text-xs leading-5 text-slate-500">
                      {premiumCapacity
                        ? 'Available while Premium is active, or permanently with coins.'
                        : 'Additional permanent preset capacity.'}
                    </div>
                    <button
                      type="button"
                      onClick={() => void unlockSlot(slotNumber)}
                      disabled={
                        busyKey === `unlock:${slotNumber}` ||
                        Number(access?.coin_balance ?? 0) < Number(access?.coin_cost ?? 10)
                      }
                      className="mt-3 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs font-semibold text-yellow-900 hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyKey === `unlock:${slotNumber}`
                        ? 'Unlocking…'
                        : `Unlock permanently · ${access?.coin_cost ?? 10} coins`}
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_150px_auto]">
          <input
            type="text"
            maxLength={50}
            value={presetName}
            onChange={event => setPresetName(event.target.value)}
            placeholder="Preset name"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={selectedSlot}
            onChange={event => setSelectedSlot(Number(event.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {slotNumbers
              .filter(slot => slot <= Number(access?.effective_slots ?? 1))
              .map(slot => (
                <option key={slot} value={slot}>
                  Slot {slot}
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={() => void savePreset()}
            disabled={busyKey === 'save-preset'}
            className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-60"
          >
            {busyKey === 'save-preset' ? 'Saving…' : 'Save current policies'}
          </button>
        </div>
      </div>

      {isPremium ? (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="font-semibold text-slate-900">Cash-flow forecast</div>
              <div className="mt-1 text-sm text-slate-500">
                Projection based on current balance, recurring policy cost and known
                upcoming trip forecasts.
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Current balance
                  </div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {formatMoney(snapshot?.current_balance ?? 0)}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Month-end projection
                  </div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {formatMoney(snapshot?.projected_month_end_balance ?? 0)}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Monthly policies
                  </div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {formatMoney(snapshot?.monthly_recurring_cost ?? 0)}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Upcoming trips
                  </div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {formatMoney(snapshot?.upcoming_trip_cost ?? 0)}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {(snapshot?.warnings ?? []).length === 0 ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    No current policy-budget warning.
                  </div>
                ) : (
                  snapshot?.warnings.map((warning, index) => (
                    <div
                      key={`${warning}-${index}`}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                    >
                      {warning}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="font-semibold text-slate-900">Budget limits</div>
              <div className="mt-1 text-sm text-slate-500">
                Set warning thresholds. They do not block gameplay or change costs.
              </div>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Monthly policy budget
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={monthlyBudget}
                    onChange={event => setMonthlyBudget(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Minimum cash reserve
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={cashReserve}
                    onChange={event => setCashReserve(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void savePlanningSettings()}
                  disabled={busyKey === 'save-settings'}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                >
                  {busyKey === 'save-settings' ? 'Saving…' : 'Save warning limits'}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="font-semibold text-slate-900">
              Automatic policy schedules
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Apply a saved preset automatically on a selected in-game date.
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
              <select
                value={selectedSchedulePresetId}
                onChange={event => setSelectedSchedulePresetId(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select preset</option>
                {presets.map(preset => (
                  <option key={preset.id} value={preset.id}>
                    {preset.preset_name}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={scheduledGameDate}
                onChange={event => setScheduledGameDate(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />

              <button
                type="button"
                onClick={() => void saveSchedule()}
                disabled={busyKey === 'save-schedule' || presets.length === 0}
                className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-60"
              >
                {busyKey === 'save-schedule' ? 'Scheduling…' : 'Add schedule'}
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {schedules.length === 0 ? (
                <div className="text-sm text-slate-500">No policy schedules saved.</div>
              ) : (
                schedules.map(schedule => (
                  <div
                    key={schedule.id}
                    className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {schedule.preset_name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {schedule.scheduled_game_date} · {schedule.status}
                      </div>
                      {schedule.failure_reason ? (
                        <div className="mt-1 text-xs text-rose-600">
                          {schedule.failure_reason}
                        </div>
                      ) : null}
                    </div>

                    {schedule.status === 'scheduled' ? (
                      <button
                        type="button"
                        onClick={() => void cancelSchedule(schedule.id)}
                        disabled={busyKey === `cancel-schedule:${schedule.id}`}
                        className="rounded border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

export default FinancePlanningCentre
