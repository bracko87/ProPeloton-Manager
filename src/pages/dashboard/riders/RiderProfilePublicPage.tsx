/**
 * RiderProfilePublicPage.tsx
 *
 * Public full-page rider profile route.
 *
 * Purpose:
 * - Fetch a non-owned rider's data from the new central international-points statistics view.
 * - Render the standardized non-own rider profile in full-page mode.
 * - Provide basic loading and error states with back navigation.
 */

import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import RiderProfileModal from '../../../components/riders/RiderProfileModal'
import { supabase } from '../../../lib/supabase'

type RiderPopupRow = {
  id: string
  display_name: string
  country_code: string | null
  role: string
  overall: number | null
  potential: number | null
  sprint: number | null
  climbing: number | null
  time_trial: number | null
  endurance: number | null
  flat: number | null
  recovery: number | null
  resistance: number | null
  race_iq: number | null
  teamwork: number | null
  morale: number | null
  birth_date: string | null
  market_value: number | null
  salary: number | null
  contract_expires_season: number | null
  availability_status: string | null
  fatigue: number | null
  image_url: string | null
  club_id: string | null
  club_name: string | null
  club_country_code: string | null
  club_tier: string | null
  club_is_ai: boolean | null
  club_is_active: boolean | null
  age_years: number | null
  season_points_overall: number
  season_points_sprint: number
  season_points_climbing: number
  podiums?: number
  jerseys?: number
  stage_wins?: number
  final_jerseys?: number
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return fallback
}

function normalizeNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export default function RiderProfilePublicPage() {
  const { riderId } = useParams<{ riderId: string }>()
  const navigate = useNavigate()

  const [rider, setRider] = useState<RiderPopupRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRiderScouted, setIsRiderScouted] = useState(false)
  const [showRiderHistory, setShowRiderHistory] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadRiderProfile() {
      if (!riderId) {
        setError('Missing rider id.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const { data, error: riderError } = await supabase
          .from('rider_statistics_page_international_v1')
          .select('*')
          .eq('rider_id', riderId)
          .eq('season_year', 2000)
          .maybeSingle()

        if (riderError) throw riderError
        if (!data) throw new Error('Rider profile not found.')

        const row = data as Record<string, unknown>

        const riderRow: RiderPopupRow = {
          id: normalizeString(row.rider_id) ?? normalizeString(row.id) ?? riderId,
          display_name:
            normalizeString(row.display_name) ??
            normalizeString(row.rider_name) ??
            normalizeString(row.rider_name_snapshot) ??
            'Unknown rider',
          country_code: normalizeString(row.country_code),
          role: normalizeString(row.role) ?? '',
          overall: normalizeNullableNumber(row.overall),
          potential: normalizeNullableNumber(row.potential),
          sprint: normalizeNullableNumber(row.sprint),
          climbing: normalizeNullableNumber(row.climbing),
          time_trial: normalizeNullableNumber(row.time_trial),
          endurance: normalizeNullableNumber(row.endurance),
          flat: normalizeNullableNumber(row.flat),
          recovery: normalizeNullableNumber(row.recovery),
          resistance: normalizeNullableNumber(row.resistance),
          race_iq: normalizeNullableNumber(row.race_iq),
          teamwork: normalizeNullableNumber(row.teamwork),
          morale: normalizeNullableNumber(row.morale),
          birth_date: normalizeString(row.birth_date),
          market_value: normalizeNullableNumber(row.market_value),
          salary: normalizeNullableNumber(row.salary),
          contract_expires_season: normalizeNullableNumber(row.contract_expires_season),
          availability_status: normalizeString(row.availability_status),
          fatigue: normalizeNullableNumber(row.fatigue),
          image_url: normalizeString(row.image_url),
          club_id: normalizeString(row.club_id),
          club_name:
            normalizeString(row.club_name) ??
            normalizeString(row.team_name) ??
            normalizeString(row.latest_team_name_snapshot),
          club_country_code: normalizeString(row.club_country_code),
          club_tier: normalizeString(row.club_tier),
          club_is_ai: typeof row.club_is_ai === 'boolean' ? row.club_is_ai : null,
          club_is_active: typeof row.club_is_active === 'boolean' ? row.club_is_active : null,
          age_years: normalizeNullableNumber(row.age_years),
          season_points_overall: normalizeNumber(row.season_points_overall),
          season_points_sprint: normalizeNumber(row.season_points_sprint),
          season_points_climbing: normalizeNumber(row.season_points_climbing),
          podiums: normalizeNumber(row.podiums),
          jerseys: normalizeNumber(row.jerseys),
          stage_wins: normalizeNumber(row.stage_wins),
          final_jerseys: normalizeNumber(row.final_jerseys),
        }

        if (!mounted) return

        setRider(riderRow)
      } catch (e: any) {
        if (!mounted) return
        setError(e?.message ?? 'Failed to load rider profile.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadRiderProfile()

    return () => {
      mounted = false
    }
  }, [riderId])

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading rider profile…</div>
  }

  if (error || !rider) {
    return (
      <div className="space-y-3 p-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          ← Back
        </button>

        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error ?? 'Rider profile not found.'}
        </div>
      </div>
    )
  }

  return (
    <RiderProfileModal
      rider={rider}
      isOpen
      onClose={() => navigate(-1)}
      onOpenTeamProfile={() => {}}
      isRiderScouted={isRiderScouted}
      setIsRiderScouted={setIsRiderScouted}
      showRiderHistory={showRiderHistory}
      setShowRiderHistory={setShowRiderHistory}
      countryNameByCode={new Map<string, string>()}
      variant="page"
      backButtonLabel="← Back"
    />
  )
}