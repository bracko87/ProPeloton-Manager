/**
 * RiderProfilePublicPage.tsx
 *
 * Public full-page rider profile route.
 *
 * Purpose:
 * - Fetch a non-owned rider's data from rider_statistics_view.
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
          .from('rider_statistics_view')
          .select('*')
          .eq('rider_id', riderId)
          .maybeSingle()

        if (riderError) throw riderError
        if (!data) throw new Error('Rider profile not found.')

        const row = data as Record<string, any>
        const riderRow: RiderPopupRow = {
          id: row.rider_id ?? row.id,
          display_name: row.display_name ?? 'Unknown rider',
          country_code: row.country_code ?? null,
          role: row.role ?? '',
          overall: row.overall ?? null,
          potential: row.potential ?? null,
          sprint: row.sprint ?? null,
          climbing: row.climbing ?? null,
          time_trial: row.time_trial ?? null,
          endurance: row.endurance ?? null,
          flat: row.flat ?? null,
          recovery: row.recovery ?? null,
          resistance: row.resistance ?? null,
          race_iq: row.race_iq ?? null,
          teamwork: row.teamwork ?? null,
          morale: row.morale ?? null,
          birth_date: row.birth_date ?? null,
          market_value: row.market_value ?? null,
          salary: row.salary ?? null,
          contract_expires_season: row.contract_expires_season ?? null,
          availability_status: row.availability_status ?? null,
          fatigue: row.fatigue ?? null,
          image_url: row.image_url ?? null,
          club_id: row.club_id ?? null,
          club_name: row.club_name ?? null,
          club_country_code: row.club_country_code ?? null,
          club_tier: row.club_tier ?? null,
          club_is_ai: row.club_is_ai ?? null,
          club_is_active: row.club_is_active ?? null,
          age_years: row.age_years ?? null,
          season_points_overall: row.season_points_overall ?? 0,
          season_points_sprint: row.season_points_sprint ?? 0,
          season_points_climbing: row.season_points_climbing ?? 0,
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