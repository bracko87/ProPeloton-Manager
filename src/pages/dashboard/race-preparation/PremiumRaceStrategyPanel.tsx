import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../../lib/supabase'
import { PremiumFeatureLock } from '../../../components/premium/PremiumFeatureLock'

type Candidate = {
  rider_id: string
  display_name: string
  role: string | null
  overall: number | null
  fatigue: number | null
  morale: number | null
  suitability_score: number
}

type Stage = {
  stage_id: string
  stage_number: number
  stage_name: string | null
  terrain_type: string | null
  profile_type: string | null
  distance_km: number | null
  elevation_gain_m: number | null
  current_plan?: {
    stage_objective?: string | null
    team_strategy?: string | null
    risk_level?: string | null
  } | null
  top_candidates: Candidate[]
}

type StrategyPayload = {
  race?: {
    race_name?: string
  }
  stages?: Stage[]
}

function resolvePremiumStatus(data: unknown): boolean {
  const row = Array.isArray(data) ? data[0] : data
  return Boolean(
    row &&
      typeof row === 'object' &&
      (row as Record<string, unknown>).is_premium === true,
  )
}

function humanize(value: string | null | undefined): string {
  if (!value) return '—'
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

export default function PremiumRaceStrategyPanel({
  racePreparationId,
}: {
  racePreparationId: string
}): JSX.Element {
  const { t } = useTranslation('premiumCenter')
  const [isPremium, setIsPremium] = useState(false)
  const [clubId, setClubId] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [payload, setPayload] = useState<StrategyPayload | null>(null)
  const [selectedStageId, setSelectedStageId] = useState('')
  const [leaderByStage, setLeaderByStage] = useState<Record<string, string>>({})
  const [objectiveByStage, setObjectiveByStage] = useState<Record<string, string>>({})
  const [strategyByStage, setStrategyByStage] = useState<Record<string, string>>({})
  const [riskByStage, setRiskByStage] = useState<Record<string, string>>({})
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    async function load(): Promise<void> {
      const [status, club] = await Promise.all([
        supabase.rpc('get_my_premium_status'),
        supabase.rpc('get_my_primary_club_id'),
      ])
      if (!alive) return

      const premium = resolvePremiumStatus(status.data)
      setClubId(typeof club.data === 'string' ? club.data : null)
      setIsPremium(premium)
      setChecking(false)

      if (!premium) return

      setLoading(true)
      const { data, error } = await supabase.rpc('premium_get_race_strategy_lab_v1', {
        p_race_preparation_id: racePreparationId,
      })

      if (!alive) return

      if (!error) {
        const next = (data ?? {}) as StrategyPayload
        setPayload(next)
        setSelectedStageId(current =>
          current && next.stages?.some(stage => stage.stage_id === current)
            ? current
            : next.stages?.[0]?.stage_id ?? '',
        )
      }

      setLoading(false)
    }

    void load()

    return () => {
      alive = false
    }
  }, [racePreparationId])

  const selectedStage = useMemo(
    () => payload?.stages?.find(stage => stage.stage_id === selectedStageId) ?? null,
    [payload, selectedStageId],
  )

  useEffect(() => {
    if (!selectedStage || !clubId) return

    setLeaderByStage(current => ({
      ...current,
      [selectedStage.stage_id]:
        current[selectedStage.stage_id] ??
        selectedStage.top_candidates[0]?.rider_id ??
        '',
    }))

    setObjectiveByStage(current => ({
      ...current,
      [selectedStage.stage_id]:
        current[selectedStage.stage_id] ??
        selectedStage.current_plan?.stage_objective ??
        'balanced',
    }))

    setStrategyByStage(current => ({
      ...current,
      [selectedStage.stage_id]:
        current[selectedStage.stage_id] ??
        selectedStage.current_plan?.team_strategy ??
        'balanced',
    }))

    setRiskByStage(current => ({
      ...current,
      [selectedStage.stage_id]:
        current[selectedStage.stage_id] ??
        selectedStage.current_plan?.risk_level ??
        'normal',
    }))
  }, [selectedStage])

  async function smartPrefill(): Promise<void> {
    if (!selectedStage) return

    setPrefillMessage(null)

    const { data, error } = await supabase.rpc('premium_match_automation_template_v1', {
      p_club_id: clubId,
      p_rule_type: 'strategy_prefill',
      p_context: {
        terrain_type: selectedStage.terrain_type,
        profile_type: selectedStage.profile_type,
      },
    })

    if (error) {
      setPrefillMessage(error.message)
      return
    }

    const match = (data ?? {}) as Record<string, unknown>
    if (match.matched !== true) {
      setPrefillMessage(t('strategy.noRule'))
      return
    }

    const templatePayload =
      match.payload_json && typeof match.payload_json === 'object'
        ? (match.payload_json as Record<string, unknown>)
        : {}

    if (typeof templatePayload.stage_objective === 'string') {
      setObjectiveByStage(current => ({
        ...current,
        [selectedStage.stage_id]: templatePayload.stage_objective as string,
      }))
    }

    if (typeof templatePayload.team_strategy === 'string') {
      setStrategyByStage(current => ({
        ...current,
        [selectedStage.stage_id]: templatePayload.team_strategy as string,
      }))
    }

    if (typeof templatePayload.risk_level === 'string') {
      setRiskByStage(current => ({
        ...current,
        [selectedStage.stage_id]: templatePayload.risk_level as string,
      }))
    }

    setPrefillMessage(
      t('strategy.matched', {
        name:
          typeof match.template_name === 'string'
            ? match.template_name
            : t('common.template'),
      }),
    )
  }

  if (checking) return <></>

  if (!isPremium) {
    return (
      <PremiumFeatureLock
        title={t('strategy.title')}
        description={t('strategy.description')}
      />
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="p-5">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-slate-900">
            {t('strategy.title')}
          </h3>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            Premium
          </span>
        </div>
        <p className="mt-1 max-w-4xl text-sm text-slate-500">{t('strategy.description')}</p>
      </div>

      {loading ? (
        <div className="border-t border-slate-100 p-5">
          <div className="h-24 animate-pulse rounded-lg bg-slate-50" />
        </div>
      ) : !payload?.stages?.length ? (
        <div className="border-t border-slate-100 p-5 text-sm text-slate-500">
          {t('strategy.selectPreparation')}
        </div>
      ) : (
        <>
          <div className="grid border-y border-slate-100 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            {payload.stages.map(stage => (
              <button
                key={stage.stage_id}
                type="button"
                onClick={() => setSelectedStageId(stage.stage_id)}
                className={[
                  'border-b-2 px-4 py-3 text-left text-sm transition',
                  selectedStageId === stage.stage_id
                    ? 'border-slate-900 bg-slate-50 text-slate-900'
                    : 'border-transparent text-slate-500 hover:bg-slate-50',
                ].join(' ')}
              >
                <div className="font-medium">
                  {t('strategy.stageLabel', { number: stage.stage_number })}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {humanize(stage.terrain_type ?? stage.profile_type)}
                </div>
              </button>
            ))}
          </div>

          {selectedStage ? (
            <div className="grid gap-5 p-5 xl:grid-cols-[1.25fr_0.75fr]">
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {selectedStage.stage_name ??
                        t('strategy.stageLabel', { number: selectedStage.stage_number })}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {humanize(selectedStage.terrain_type ?? selectedStage.profile_type)}
                      {selectedStage.distance_km
                        ? ` · ${t('strategy.distance', { distance: selectedStage.distance_km })}`
                        : ''}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">{t('strategy.tableRider')}</th>
                        <th className="px-3 py-2 font-medium">{t('strategy.tableRole')}</th>
                        <th className="px-3 py-2 font-medium">{t('strategy.tableOverall')}</th>
                        <th className="px-3 py-2 font-medium">{t('strategy.tableFatigue')}</th>
                        <th className="px-3 py-2 font-medium">{t('strategy.tableMorale')}</th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t('strategy.tableSuitability')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStage.top_candidates.map(candidate => (
                        <tr
                          key={candidate.rider_id}
                          className={[
                            'border-t border-slate-100',
                            leaderByStage[selectedStage.stage_id] === candidate.rider_id
                              ? 'bg-slate-50'
                              : '',
                          ].join(' ')}
                        >
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() =>
                                setLeaderByStage(current => ({
                                  ...current,
                                  [selectedStage.stage_id]: candidate.rider_id,
                                }))
                              }
                              className="font-medium text-slate-900 hover:underline"
                            >
                              {candidate.display_name}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-slate-500">{candidate.role ?? '—'}</td>
                          <td className="px-3 py-2">{candidate.overall ?? '—'}</td>
                          <td className="px-3 py-2">{candidate.fatigue ?? 0}</td>
                          <td className="px-3 py-2">{candidate.morale ?? '—'}</td>
                          <td className="px-3 py-2 text-right font-medium">
                            {candidate.suitability_score}/100
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  {t('strategy.controls')}
                </div>

                <label className="mt-4 block text-xs text-slate-500">
                  {t('strategy.leaderCandidate')}
                  <select
                    value={leaderByStage[selectedStage.stage_id] ?? ''}
                    onChange={event =>
                      setLeaderByStage(current => ({
                        ...current,
                        [selectedStage.stage_id]: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {selectedStage.top_candidates.map(candidate => (
                      <option key={candidate.rider_id} value={candidate.rider_id}>
                        {candidate.display_name} · {candidate.suitability_score}/100
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mt-3 block text-xs text-slate-500">
                  {t('strategy.stageObjective')}
                  <select
                    value={objectiveByStage[selectedStage.stage_id] ?? 'balanced'}
                    onChange={event =>
                      setObjectiveByStage(current => ({
                        ...current,
                        [selectedStage.stage_id]: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="balanced">{t('values.balanced')}</option>
                    <option value="stage_win">{t('values.stage_win')}</option>
                    <option value="protect_gc">{t('values.protect_gc')}</option>
                    <option value="breakaway">{t('values.breakaway')}</option>
                  </select>
                </label>

                <label className="mt-3 block text-xs text-slate-500">
                  {t('strategy.teamStrategy')}
                  <select
                    value={strategyByStage[selectedStage.stage_id] ?? 'balanced'}
                    onChange={event =>
                      setStrategyByStage(current => ({
                        ...current,
                        [selectedStage.stage_id]: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="balanced">{t('values.balanced')}</option>
                    <option value="sprint_control">{t('values.sprint_control')}</option>
                    <option value="climber_support">{t('values.climber_support')}</option>
                    <option value="breakaway_focus">{t('values.breakaway_focus')}</option>
                  </select>
                </label>

                <label className="mt-3 block text-xs text-slate-500">
                  {t('strategy.riskProfile')}
                  <select
                    value={riskByStage[selectedStage.stage_id] ?? 'normal'}
                    onChange={event =>
                      setRiskByStage(current => ({
                        ...current,
                        [selectedStage.stage_id]: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="conservative">{t('values.conservative')}</option>
                    <option value="normal">{t('values.normal')}</option>
                    <option value="aggressive">{t('values.aggressive')}</option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => void smartPrefill()}
                  className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {t('strategy.smartPrefill')}
                </button>

                {prefillMessage ? (
                  <div className="mt-3 text-xs text-slate-500">{prefillMessage}</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
